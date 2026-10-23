import { Buffer } from "node:buffer";
import { open } from "node:fs/promises";

const HEADER_CHUNK_BYTES = 64 * 1024;
const DEFAULT_MAX_HEADER_BYTES = 1024 * 1024;

const TYPE_INFO = Object.freeze({
  char: [1, "getInt8"],
  int8: [1, "getInt8"],
  uchar: [1, "getUint8"],
  uint8: [1, "getUint8"],
  short: [2, "getInt16"],
  int16: [2, "getInt16"],
  ushort: [2, "getUint16"],
  uint16: [2, "getUint16"],
  int: [4, "getInt32"],
  int32: [4, "getInt32"],
  uint: [4, "getUint32"],
  uint32: [4, "getUint32"],
  float: [4, "getFloat32"],
  float32: [4, "getFloat32"],
  double: [8, "getFloat64"],
  float64: [8, "getFloat64"],
});

function parseNonNegativeInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
  return number;
}

function parseHeaderText(text, dataOffset) {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines[0].trim() !== "ply") {
    throw new Error("Invalid PLY magic");
  }
  const result = {
    format: undefined,
    version: undefined,
    comments: [],
    elements: [],
    dataOffset,
    headerText: text,
  };
  let element;
  for (let lineIndex = 1; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex].trim();
    if (line === "" || line === "end_header") {
      continue;
    }
    const fields = line.split(/\s+/);
    switch (fields[0]) {
      case "format":
        if (fields.length !== 3) {
          throw new Error("Malformed PLY format declaration");
        }
        result.format = fields[1];
        result.version = fields[2];
        break;
      case "comment":
        result.comments.push(line.slice("comment".length).trimStart());
        break;
      case "obj_info":
        break;
      case "element":
        if (fields.length !== 3) {
          throw new Error(`Malformed PLY element at line ${lineIndex + 1}`);
        }
        element = {
          name: fields[1],
          count: parseNonNegativeInteger(
            fields[2],
            `element ${fields[1]} count`,
          ),
          properties: [],
        };
        result.elements.push(element);
        break;
      case "property": {
        if (!element) {
          throw new Error("PLY property appears before an element");
        }
        if (fields[1] === "list") {
          if (
            fields.length !== 5 ||
            !TYPE_INFO[fields[2]] ||
            !TYPE_INFO[fields[3]]
          ) {
            throw new Error(
              `Unsupported PLY list property at line ${lineIndex + 1}`,
            );
          }
          element.properties.push({
            name: fields[4],
            type: fields[3],
            countType: fields[2],
            isList: true,
          });
        } else {
          if (fields.length !== 3 || !TYPE_INFO[fields[1]]) {
            throw new Error(
              `Unsupported PLY scalar property at line ${lineIndex + 1}`,
            );
          }
          element.properties.push({
            name: fields[2],
            type: fields[1],
            isList: false,
          });
        }
        break;
      }
      default:
        throw new Error(`Unsupported PLY header keyword '${fields[0]}'`);
    }
  }
  if (!result.format || result.version !== "1.0") {
    throw new Error("PLY format 1.0 declaration is required");
  }
  return result;
}

export async function readPlyHeader(filePath, options = {}) {
  const maxHeaderBytes = options.maxHeaderBytes ?? DEFAULT_MAX_HEADER_BYTES;
  const file = await open(filePath, "r");
  try {
    let accumulated = Buffer.alloc(0);
    let position = 0;
    while (accumulated.byteLength < maxHeaderBytes) {
      const remaining = maxHeaderBytes - accumulated.byteLength;
      const chunk = Buffer.alloc(Math.min(HEADER_CHUNK_BYTES, remaining));
      const { bytesRead } = await file.read(
        chunk,
        0,
        chunk.byteLength,
        position,
      );
      if (bytesRead === 0) {
        throw new Error("PLY ended before end_header");
      }
      accumulated = Buffer.concat([accumulated, chunk.subarray(0, bytesRead)]);
      const marker = accumulated.indexOf("end_header", 0, "ascii");
      if (marker >= 0) {
        const newline = accumulated.indexOf(0x0a, marker + 10);
        if (newline < 0) {
          position += bytesRead;
          continue;
        }
        const dataOffset = newline + 1;
        const headerText = accumulated
          .subarray(0, dataOffset)
          .toString("ascii");
        return parseHeaderText(headerText, dataOffset);
      }
      position += bytesRead;
    }
    throw new Error(`PLY header exceeds ${maxHeaderBytes} bytes`);
  } finally {
    await file.close();
  }
}

function fixedElementLayout(element) {
  let stride = 0;
  const properties = element.properties.map((property) => {
    if (property.isList) {
      throw new Error(
        `Streaming binary reader does not support list property ${element.name}.${property.name}`,
      );
    }
    const [bytes, getter] = TYPE_INFO[property.type];
    const entry = { ...property, offset: stride, bytes, getter };
    stride += bytes;
    return entry;
  });
  return { stride, properties };
}

export function getPlyElementByteStride(header, elementName) {
  const element = header.elements.find(
    (candidate) => candidate.name === elementName,
  );
  if (!element) {
    throw new Error(`PLY has no ${elementName} element`);
  }
  return fixedElementLayout(element).stride;
}

async function readExactly(file, target, position) {
  let total = 0;
  while (total < target.byteLength) {
    const { bytesRead } = await file.read(
      target,
      total,
      target.byteLength - total,
      position + total,
    );
    if (bytesRead === 0) {
      throw new Error("Unexpected end of PLY vertex data");
    }
    total += bytesRead;
  }
}

export async function* streamPlyVertexBatches(filePath, options = {}) {
  const header = options.header ?? (await readPlyHeader(filePath));
  if (
    header.format !== "binary_little_endian" &&
    header.format !== "binary_big_endian"
  ) {
    throw new Error(
      `Streaming data reader does not support PLY format ${header.format}`,
    );
  }
  const vertexIndex = header.elements.findIndex(
    (element) => element.name === "vertex",
  );
  if (vertexIndex < 0) {
    throw new Error("PLY has no vertex element");
  }
  let vertexOffset = header.dataOffset;
  for (let i = 0; i < vertexIndex; i++) {
    const layout = fixedElementLayout(header.elements[i]);
    vertexOffset += layout.stride * header.elements[i].count;
  }
  const vertex = header.elements[vertexIndex];
  const layout = fixedElementLayout(vertex);
  const requested =
    options.properties ?? layout.properties.map((property) => property.name);
  const selected = requested.map((name) => {
    const property = layout.properties.find(
      (candidate) => candidate.name === name,
    );
    if (!property) {
      throw new Error(`PLY vertex property '${name}' does not exist`);
    }
    return property;
  });
  const batchSize = options.batchSize ?? 16384;
  if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be a positive integer");
  }
  const littleEndian = header.format === "binary_little_endian";
  const file = await open(filePath, "r");
  try {
    for (let start = 0; start < vertex.count; start += batchSize) {
      const count = Math.min(batchSize, vertex.count - start);
      const bytes = Buffer.allocUnsafe(count * layout.stride);
      await readExactly(file, bytes, vertexOffset + start * layout.stride);
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      );
      const columns = Object.fromEntries(
        selected.map((property) => [property.name, new Float64Array(count)]),
      );
      for (let row = 0; row < count; row++) {
        const base = row * layout.stride;
        for (const property of selected) {
          columns[property.name][row] = view[property.getter](
            base + property.offset,
            property.bytes === 1 ? undefined : littleEndian,
          );
        }
      }
      yield { start, count, columns };
    }
  } finally {
    await file.close();
  }
}

import { inflate } from "pako";
import RuntimeError from "../../../Core/RuntimeError.js";

// Adapted from SuperMap/s3m-spec S3ModelParser.js, Apache-2.0.
// Pinned source and license: Assets/SceneGIS/S3M/.
// This implementation deliberately accepts only the qualified S3M 1.0 profile.
class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.offset = 0;
  }

  u8() {
    return this.view.getUint8(this.offset++);
  }

  u16() {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  u32() {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f32() {
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  f64() {
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  take(length) {
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      this.offset + length > this.bytes.length
    ) {
      throw new RuntimeError("Invalid S3M byte range.");
    }
    const result = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return result;
  }

  text() {
    return new TextDecoder().decode(this.take(this.u32()));
  }

  align(origin = 0) {
    this.take((4 - ((this.offset - origin) % 4)) % 4);
  }

  array(Type, count) {
    // Binary streams are not guaranteed to satisfy typed-array alignment.
    return new Type(this.take(count * Type.BYTES_PER_ELEMENT).slice().buffer);
  }
}

function readPages(reader) {
  reader.u32(); // Group stream size.
  const count = reader.u32();
  const pages = [];
  for (let i = 0; i < count; i++) {
    const range = reader.f32();
    const rangeMode = reader.u16();
    const center = [reader.f64(), reader.f64(), reader.f64()];
    const radius = reader.f64();
    const child = reader.text().split("Geometry")[0];
    const geodes = [];
    const geodeCount = reader.u32();
    for (let j = 0; j < geodeCount; j++) {
      const matrix = Array.from({ length: 16 }, () => reader.f64());
      const names = Array.from({ length: reader.u32() }, () => reader.text());
      geodes.push({ matrix, names });
    }
    if (
      ![0, 1, 2].includes(rangeMode) ||
      !Number.isFinite(range) ||
      !Number.isFinite(radius) ||
      radius < 0 ||
      !center.every(Number.isFinite)
    ) {
      throw new RuntimeError("Invalid S3M PageLOD bounds or range.");
    }
    pages.push({ range, rangeMode, center, radius, child, geodes });
  }
  reader.align();
  return pages;
}

function readFloatAttribute(reader, alwaysHeader = false) {
  const count = reader.u32();
  if (count === 0 && !alwaysHeader) {
    return undefined;
  }
  const dimension = reader.u16();
  reader.u16(); // The standard stream is tightly packed, irrespective of stride.
  return {
    count,
    dimension,
    values: reader.array(Float32Array, count * dimension),
  };
}

function readColor(reader) {
  const count = reader.u32();
  if (count === 0) {
    return undefined;
  }
  reader.u16();
  reader.u16();
  return reader.array(Uint8Array, count * 4);
}

function readInstances(reader) {
  const count = reader.u16();
  reader.u16();
  let instances;
  for (let i = 0; i < count; i++) {
    const length = reader.u32();
    const dimension = reader.u16();
    reader.u16();
    const values = reader.array(Float32Array, length * dimension);
    if (dimension === 17) {
      instances = { count: length, values };
    } else if (dimension !== 8) {
      // The eight-float record contains instance bounds, not another transform.
      throw new RuntimeError(`Unsupported S3M instance layout: ${dimension}.`);
    }
  }
  return instances;
}

function readIndices(reader) {
  const result = [];
  const count = reader.u32();
  for (let i = 0; i < count; i++) {
    const length = reader.u32();
    const indexType = reader.u8();
    reader.u8();
    const primitiveType = reader.u8();
    reader.u8();
    if (primitiveType !== 4 || ![0, 1, 3].includes(indexType)) {
      throw new RuntimeError("S3M currently requires indexed triangle meshes.");
    }
    const Type = indexType === 0 ? Uint16Array : Uint32Array;
    const values = reader.array(Type, length);
    if (indexType === 0 && length % 2 !== 0) {
      reader.u16();
    }
    const passCount = reader.u32();
    if (passCount !== 1) {
      throw new RuntimeError(
        "S3M currently requires one material per index package.",
      );
    }
    const material = reader.text();
    reader.align();
    result.push({ values, material });
  }
  return result;
}

function readGeometry(reader) {
  reader.u32();
  const count = reader.u32();
  const geometries = Object.create(null);
  for (let i = 0; i < count; i++) {
    const name = reader.text();
    reader.align();
    const tag = reader.u32();
    if (tag !== 1) {
      throw new RuntimeError(`Unsupported S3M vertex encoding: ${tag}.`);
    }
    const position = readFloatAttribute(reader, true);
    const normal = readFloatAttribute(reader);
    const color = readColor(reader);
    readColor(reader); // Secondary selection color is not a material input.
    const texcoordCount = reader.u16();
    reader.u16();
    const texcoords = [];
    for (let j = 0; j < texcoordCount; j++) {
      texcoords.push(readFloatAttribute(reader, true));
    }
    const instances = readInstances(reader);
    const indices = readIndices(reader);
    geometries[name] = {
      name,
      position,
      normal,
      color,
      texcoords,
      instances,
      indices,
    };
  }
  reader.take(reader.u32()); // Secondary color package.
  return geometries;
}

function readTextures(reader) {
  const size = reader.u32();
  const start = reader.offset;
  const count = reader.u32();
  const textures = Object.create(null);
  for (let i = 0; i < count; i++) {
    const name = reader.text();
    reader.align(start);
    reader.u32(); // Mipmap count; the bridge rebuilds native mipmaps.
    const width = reader.u32();
    const height = reader.u32();
    const compression = reader.u32();
    const length = reader.u32();
    const format = reader.u32();
    const data = reader.take(length);
    if (compression !== 14 || ![10, 11, 12, 13, 14, 17, 21].includes(format)) {
      throw new RuntimeError(
        `Unsupported S3M texture encoding: ${compression}/${format}.`,
      );
    }
    textures[name] = { width, height, format, data };
  }
  reader.take(start + size - reader.offset);
  return textures;
}

function readSelection(reader, geometries) {
  reader.u32();
  const count = reader.u32();
  for (let i = 0; i < count; i++) {
    const geometry = geometries[reader.text()];
    if (!geometry) {
      throw new RuntimeError("S3M selection references an unknown geometry.");
    }
    const recordCount = reader.u32();
    const ranges = [];
    for (let j = 0; j < recordCount; j++) {
      const id = reader.u32();
      const rangeCount = reader.u32();
      for (let k = 0; k < rangeCount; k++) {
        const offset = reader.u32();
        const length = geometry.instances ? 1 : reader.u32();
        ranges.push({ id, offset, length });
      }
    }
    if (geometry.instances) {
      // In S3M 1.0, the last packed RGBA slot supplies the actual instance ID.
      const { values, count } = geometry.instances;
      const bytes = new Uint8Array(values.buffer);
      const ids = new Uint32Array(count);
      for (let j = 0; j < count; j++) {
        const offset = j * 68 + 64;
        ids[j] =
          bytes[offset] + 256 * bytes[offset + 1] + 65536 * bytes[offset + 2];
      }
      geometry.instances.ids = ids;
    } else {
      geometry.ranges = ranges;
    }
  }
}

/**
 * Decodes the qualified standard S3M 1.0 mesh profile.
 * @param {ArrayBuffer} buffer The S3MB payload.
 * @returns {object} CPU-only decoded records.
 * @private
 */
function parseS3m(buffer) {
  try {
    const header = new Reader(new Uint8Array(buffer));
    const version = header.f32();
    if (version !== 1) {
      throw new RuntimeError(
        `Unsupported S3M binary version: ${version}. Expected 1.0.`,
      );
    }
    const bytes = inflate(header.take(header.u32()));
    const reader = new Reader(bytes);
    const options = reader.u32();
    const pages = readPages(reader);
    const geometries = readGeometry(reader);
    const textures = readTextures(reader);
    const materials = JSON.parse(reader.text()).material;
    if (!Array.isArray(materials)) {
      throw new RuntimeError("Invalid S3M material package.");
    }
    if ((options & 1) !== 0) {
      readSelection(reader, geometries);
    }
    return { pages, geometries, textures, materials };
  } catch (error) {
    if (error instanceof RuntimeError) {
      throw error;
    }
    throw new RuntimeError(`Invalid S3M payload: ${error.message ?? error}`);
  }
}

export default parseS3m;

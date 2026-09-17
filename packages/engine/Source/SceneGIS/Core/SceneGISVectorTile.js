import protobuf from "protobufjs/minimal.js";
import DeveloperError from "../../Core/DeveloperError.js";
import RuntimeError from "../../Core/RuntimeError.js";

const utf8 = new TextDecoder("utf-8", { fatal: true });

function invalid(message) {
  throw new RuntimeError(message);
}

function readVarint(reader, type = "uint32") {
  const start = reader.pos;
  const value = reader[type]();
  const length = reader.pos - start;
  const limit = type === "uint32" ? 5 : 10;
  const lastMaximum = type === "uint32" ? 15 : 1;
  if (
    reader.pos > reader.len ||
    length > limit ||
    (length === limit && reader.buf[reader.pos - 1] > lastMaximum)
  ) {
    invalid("Truncated or out-of-range MVT varint.");
  }
  return value;
}

function readInteger(reader, type) {
  const value = readVarint(reader, type);
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    invalid("The protobuf reader must preserve 64-bit integers.");
  }
  const integer = BigInt(value.toString());
  const number = Number(integer);
  return Number.isSafeInteger(number) ? number : integer;
}

function readBytes(reader) {
  const length = readVarint(reader);
  const end = reader.pos + length;
  if (end > reader.len) {
    invalid("MVT field extends beyond its containing message.");
  }
  const result = reader.buf.subarray(reader.pos, end);
  reader.pos = end;
  return result;
}

function readTag(reader) {
  const tag = readVarint(reader);
  if (tag >>> 3 === 0) {
    invalid("MVT field number must not be zero.");
  }
  return tag;
}

function requireWire(tag, wire) {
  if ((tag & 7) !== wire) {
    invalid("Invalid MVT field wire type.");
  }
}

function skip(reader, tag) {
  reader.skipType(tag & 7, undefined, tag >>> 3);
  if (reader.pos > reader.len) {
    invalid("Unknown MVT field extends beyond its message.");
  }
}

function readPacked(reader, tag, result) {
  if ((tag & 7) === 0) {
    result.push(readVarint(reader));
    return;
  }
  requireWire(tag, 2);
  const packed = new protobuf.Reader(readBytes(reader));
  while (packed.pos < packed.len) {
    result.push(readVarint(packed));
  }
}

function decodeValue(bytes) {
  const reader = new protobuf.Reader(bytes);
  let value;
  let count = 0;
  while (reader.pos < reader.len) {
    const tag = readTag(reader);
    const field = tag >>> 3;
    if (field < 1 || field > 7) {
      skip(reader, tag);
      continue;
    }
    ++count;
    requireWire(tag, field === 1 ? 2 : field === 2 ? 5 : field === 3 ? 1 : 0);
    if (field === 1) {
      value = utf8.decode(readBytes(reader));
    } else if (field === 2 || field === 3) {
      value = field === 2 ? reader.float() : reader.double();
    } else if (field === 7) {
      value = readInteger(reader, "uint64") !== 0;
    } else {
      value = readInteger(reader, ["int64", "uint64", "sint64"][field - 4]);
    }
  }
  if (count !== 1) {
    invalid("An MVT value must contain exactly one scalar field.");
  }
  return value;
}

function ringAreaSign(part) {
  // Integer arithmetic preserves winding even for large buffered coordinates.
  let area = 0n;
  let previous = part.length - 2;
  for (let i = 0; i < part.length; i += 2) {
    area +=
      BigInt(part[previous]) * BigInt(part[i + 1]) -
      BigInt(part[i]) * BigInt(part[previous + 1]);
    previous = i;
  }
  return area > 0n ? 1 : area < 0n ? -1 : 0;
}

function decodeGeometry(commands, type) {
  const parts = [];
  const polygonStarts = [];
  let cursor = 0;
  let x = 0;
  let y = 0;
  let part;
  let needsLine = false;
  let needsClose = false;

  function coordinates(count, target, isLineTo = false) {
    if (count > (commands.length - cursor) / 2) {
      invalid("Truncated MVT geometry command parameters.");
    }
    for (let i = 0; i < count; ++i) {
      const dx = commands[cursor++];
      const dy = commands[cursor++];
      if (isLineTo && dx === 0 && dy === 0) {
        invalid("MVT LineTo must not repeat the current point.");
      }
      if (dx === 0xffffffff || dy === 0xffffffff) {
        invalid("MVT coordinate delta is outside the specified range.");
      }
      x += (dx >>> 1) ^ -(dx & 1);
      y += (dy >>> 1) ^ -(dy & 1);
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) {
        invalid("MVT coordinate exceeds exact integer range.");
      }
      target.push(x, y);
    }
  }

  while (cursor < commands.length) {
    const command = commands[cursor++];
    const id = command & 7;
    const count = command >>> 3;
    if (count === 0) {
      invalid("MVT geometry command count must be positive.");
    }
    if (id === 1) {
      if (needsLine || needsClose || (type === 1 && parts.length !== 0)) {
        invalid("Unexpected MVT MoveTo command.");
      }
      if (type !== 1 && count !== 1) {
        invalid("Line and polygon MoveTo must have count one.");
      }
      part = [];
      coordinates(count, part);
      parts.push(part);
      needsLine = type !== 1;
    } else if (id === 2) {
      if (!needsLine || (type === 3 && count < 2)) {
        invalid("Unexpected or incomplete MVT LineTo command.");
      }
      coordinates(count, part, true);
      needsLine = false;
      needsClose = type === 3;
    } else if (id === 7) {
      if (!needsClose || count !== 1) {
        invalid("Unexpected MVT ClosePath command.");
      }
      if (
        part[0] === part[part.length - 2] &&
        part[1] === part[part.length - 1]
      ) {
        invalid("MVT ClosePath must close a nonzero final segment.");
      }
      const sign = ringAreaSign(part);
      if (sign === 0 || (sign < 0 && polygonStarts.length === 0)) {
        invalid("MVT polygon must start with a nondegenerate exterior ring.");
      }
      if (sign > 0) {
        polygonStarts.push(parts.length - 1);
      }
      needsClose = false;
    } else {
      invalid("Unknown MVT geometry command.");
    }
  }
  if (parts.length === 0 || needsLine || needsClose) {
    invalid("Incomplete MVT geometry.");
  }
  return {
    parts: parts.map((values) => new Float64Array(values)),
    polygonStarts: new Uint32Array(polygonStarts),
  };
}

function decodeFeature(bytes, keys, values) {
  const reader = new protobuf.Reader(bytes);
  const tags = [];
  const commands = [];
  let id;
  let type;
  while (reader.pos < reader.len) {
    const tag = readTag(reader);
    switch (tag >>> 3) {
      case 1:
        requireWire(tag, 0);
        id = readInteger(reader, "uint64").toString();
        break;
      case 2:
        readPacked(reader, tag, tags);
        break;
      case 3:
        requireWire(tag, 0);
        type = readVarint(reader);
        break;
      case 4:
        readPacked(reader, tag, commands);
        break;
      default:
        skip(reader, tag);
    }
  }
  if (type !== 1 && type !== 2 && type !== 3) {
    invalid("MVT geometry type must be POINT, LINESTRING, or POLYGON.");
  }
  if (tags.length % 2 !== 0) {
    invalid("MVT tags must contain key/value pairs.");
  }
  const properties = Object.create(null);
  for (let i = 0; i < tags.length; i += 2) {
    const keyIndex = tags[i];
    const valueIndex = tags[i + 1];
    if (keyIndex >= keys.length || valueIndex >= values.length) {
      invalid("MVT tag references a missing dictionary entry.");
    }
    const key = keys[keyIndex];
    if (Object.hasOwn(properties, key)) {
      invalid("An MVT feature must not repeat a property key.");
    }
    properties[key] = values[valueIndex];
  }
  return { id, type, properties, geometry: decodeGeometry(commands, type) };
}

function decodeLayer(bytes) {
  const reader = new protobuf.Reader(bytes);
  const keys = [];
  const values = [];
  const featureBytes = [];
  let name;
  let extent;
  let version;
  while (reader.pos < reader.len) {
    const tag = readTag(reader);
    const field = tag >>> 3;
    if (field >= 1 && field <= 4) {
      requireWire(tag, 2);
      const data = readBytes(reader);
      if (field === 1) {
        name = utf8.decode(data);
      } else if (field === 2) {
        featureBytes.push(data);
      } else if (field === 3) {
        keys.push(utf8.decode(data));
      } else {
        values.push(decodeValue(data));
      }
    } else if (field === 5 || field === 15) {
      requireWire(tag, 0);
      const value = readVarint(reader);
      if (field === 5) {
        extent = value;
      } else {
        version = value;
      }
    } else {
      skip(reader, tag);
    }
  }
  if (name === undefined || version !== 2 || !(extent > 0)) {
    invalid("MVT layer requires a name, version 2, and a positive extent.");
  }
  const features = featureBytes.map((data, index) => {
    try {
      return decodeFeature(data, keys, values);
    } catch (error) {
      invalid(`Layer "${name}", feature ${index}: ${error.message}`);
    }
  });
  return { name, version, extent, features };
}

/**
 * Independent, coordinate-neutral MVT 2.1 decoding utilities.
 * @namespace SceneGISVectorTile
 * @experimental This API is experimental and subject to change.
 */
const SceneGISVectorTile = {};

/**
 * Coordinates use the tile's X-right, Y-down integer grid. Polygon rings omit
 * the repeated closing endpoint.
 * @typedef {object} SceneGISVectorTile.Geometry
 * @property {Float64Array[]} parts Interleaved XY arrays: one point set, lines, or rings.
 * @property {Uint32Array} polygonStarts Exterior-ring indices; empty for points and lines.
 */

/**
 * A decoded feature with lossless source identity.
 * @typedef {object} SceneGISVectorTile.Feature
 * @property {string|undefined} id The decimal source feature ID, or undefined when absent.
 * @property {number} type The MVT geometry type: point 1, line 2, polygon 3.
 * @property {Object<string, string|number|boolean|bigint>} properties Source scalar values; unsafe integers use bigint.
 * @property {SceneGISVectorTile.Geometry} geometry Tile-local geometry.
 */

/**
 * A decoded source layer.
 * @typedef {object} SceneGISVectorTile.Layer
 * @property {string} name The source-layer name.
 * @property {number} version The MVT major version, always 2.
 * @property {number} extent The layer's tile-local extent.
 * @property {SceneGISVectorTile.Feature[]} features Decoded features in source order.
 */

/**
 * Caller-owned decoded data with no requests or GPU resources.
 * @typedef {object} SceneGISVectorTile.Data
 * @property {SceneGISVectorTile.Layer[]} layers Source layers in encoded order.
 */

/**
 * Decodes MVT bytes without modifying or retaining the input buffer.
 * Empty bytes produce an empty tile. This checks encoding and geometry commands,
 * but does not repair or fully validate polygon topology.
 * @param {ArrayBuffer|Uint8Array} buffer Decompressed protobuf bytes.
 * @returns {SceneGISVectorTile.Data} Independently owned data.
 * @exception {DeveloperError} The input is not an ArrayBuffer or Uint8Array.
 * @exception {RuntimeError} The payload is malformed or outside the supported MVT profile.
 */
SceneGISVectorTile.decode = function (buffer) {
  if (!(buffer instanceof ArrayBuffer) && !(buffer instanceof Uint8Array)) {
    throw new DeveloperError("buffer must be an ArrayBuffer or Uint8Array.");
  }
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    const reader = new protobuf.Reader(bytes);
    const layers = [];
    const names = new Set();
    while (reader.pos < reader.len) {
      const tag = readTag(reader);
      if (tag >>> 3 !== 3) {
        skip(reader, tag);
        continue;
      }
      requireWire(tag, 2);
      const layer = decodeLayer(readBytes(reader));
      if (names.has(layer.name)) {
        invalid("MVT source-layer names must be unique.");
      }
      names.add(layer.name);
      layers.push(layer);
    }
    return { layers };
  } catch (error) {
    throw new RuntimeError(`Invalid MVT: ${error.message}`);
  }
};

export default SceneGISVectorTile;

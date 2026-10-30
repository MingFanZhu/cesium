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
 * 独立且与坐标系无关的 MVT 2.1 解码工具。
 * @namespace SceneGISVectorTile
 * @experimental 此 API 为实验性，可能发生变化。
 */
const SceneGISVectorTile = {};

/**
 * 坐标采用瓦片 X 向右、Y 向下的整数格网；多边形环省略重复闭合端点。
 * @typedef {object} SceneGISVectorTile.Geometry
 * @property {Float64Array[]} parts 交错 XY 数组，表示点集、线或环。
 * @property {Uint32Array} polygonStarts 外环索引，点和线为空。
 */

/**
 * 保留无损源标识的解码要素。
 * @typedef {object} SceneGISVectorTile.Feature
 * @property {string|undefined} id 十进制源要素 ID，缺失时为 undefined。
 * @property {number} type MVT 几何类型：点 1、线 2、多边形 3。
 * @property {Object<string, string|number|boolean|bigint>} properties 源标量值，不安全整数使用 bigint。
 * @property {SceneGISVectorTile.Geometry} geometry 瓦片局部几何。
 */

/**
 * 已解码的源图层。
 * @typedef {object} SceneGISVectorTile.Layer
 * @property {string} name 源图层名称。
 * @property {number} version MVT 主版本，始终为 2。
 * @property {number} extent 图层的瓦片局部范围。
 * @property {SceneGISVectorTile.Feature[]} features 按源顺序排列的解码要素。
 */

/**
 * 调用方所有的解码数据，没有请求或 GPU 资源。
 * @typedef {object} SceneGISVectorTile.Data
 * @property {SceneGISVectorTile.Layer[]} layers 按编码顺序排列的源图层。
 */

/**
 * 解码 MVT 字节，不修改或保留输入缓冲。空字节生成空瓦片。检查编码与几何命令，但不修复或完整验证多边形拓扑。
 * @param {ArrayBuffer|Uint8Array} buffer 已解压 protobuf 字节。
 * @returns {SceneGISVectorTile.Data} 独立所有的数据。
 * @exception {DeveloperError} 输入不是 ArrayBuffer 或 Uint8Array。
 * @exception {RuntimeError} 载荷格式错误或超出支持的 MVT 范围。
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

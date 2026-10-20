import { deflate } from "pako";
import RuntimeError from "../../../Core/RuntimeError.js";

// BC color/alpha reconstruction adapted from SuperMap's DXTTextureDecode.js.
// Unlike that decoder, retain every image row and always output RGBA8.
// See Assets/SceneGIS/S3M/ for the pinned Apache-2.0 source and license.
function unpack565(value, colors, offset) {
  const r = (value >>> 11) & 31;
  const g = (value >>> 5) & 63;
  const b = value & 31;
  colors.set(
    [(r << 3) | (r >>> 2), (g << 2) | (g >>> 4), (b << 3) | (b >>> 2), 255],
    offset,
  );
}

function decode(texture) {
  const { width, height, data, format } = texture;
  const dxt1 = format === 10 || format === 11 || format === 17;
  const blockBytes = dxt1 ? 8 : 16;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > 16384 ||
    height > 16384 ||
    data.length < Math.ceil(width / 4) * Math.ceil(height / 4) * blockBytes
  ) {
    throw new RuntimeError("Invalid S3M DXT texture dimensions or payload.");
  }
  const output = new Uint8Array(width * height * 4);
  const colors = new Uint8Array(16);
  const alpha = new Uint8Array(8);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const colorOffset = offset + (dxt1 ? 0 : 8);
      const a = view.getUint16(colorOffset, true);
      const b = view.getUint16(colorOffset + 2, true);
      unpack565(a, colors, 0);
      unpack565(b, colors, 4);
      for (let c = 0; c < 3; c++) {
        colors[8 + c] =
          dxt1 && a <= b
            ? (colors[c] + colors[4 + c]) / 2
            : (2 * colors[c] + colors[4 + c]) / 3;
        colors[12 + c] =
          dxt1 && a <= b ? 0 : (colors[c] + 2 * colors[4 + c]) / 3;
      }
      colors[11] = 255;
      colors[15] = dxt1 && a <= b ? 0 : 255;
      if (!dxt1) {
        alpha[0] = data[offset];
        alpha[1] = data[offset + 1];
        const denominator = alpha[0] > alpha[1] ? 7 : 5;
        for (let c = 1; c < denominator; c++) {
          alpha[c + 1] =
            ((denominator - c) * alpha[0] + c * alpha[1]) / denominator;
        }
        if (denominator === 5) {
          alpha[6] = 0;
          alpha[7] = 255;
        }
      }
      const colorBits = view.getUint32(colorOffset + 4, true);
      for (let pixel = 0; pixel < 16; pixel++) {
        const px = x + (pixel % 4);
        const py = y + Math.floor(pixel / 4);
        if (px >= width || py >= height) {
          continue;
        }
        const target = (py * width + px) * 4;
        output.set(
          colors.subarray(
            ((colorBits >>> (pixel * 2)) & 3) * 4,
            (((colorBits >>> (pixel * 2)) & 3) + 1) * 4,
          ),
          target,
        );
        if (!dxt1) {
          const bit = pixel * 3;
          const byte = offset + 2 + Math.floor(bit / 8);
          const bits = data[byte] | ((data[byte + 1] ?? 0) << 8);
          output[target + 3] = alpha[(bits >>> (bit % 8)) & 7];
        }
      }
      offset += blockBytes;
    }
  }
  return output;
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c;
}

function chunk(type, data) {
  const bytes = new Uint8Array(data.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, data.length);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(data, 8);
  let crc = 0xffffffff;
  for (let i = 4; i < bytes.length - 4; i++) {
    crc = crcTable[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
  }
  view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
  return bytes;
}

function toPng(texture) {
  const rgba = decode(texture);
  const { width, height } = texture;
  const scanlines = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    scanlines.set(
      rgba.subarray(y * width * 4, (y + 1) * width * 4),
      y * (width * 4 + 1) + 1,
    );
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8;
  header[9] = 6;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflate(scanlines, { level: 1 })),
    chunk("IEND", new Uint8Array()),
  ];
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** @private */
const S3mTexture = { decode, toPng };
export default S3mTexture;

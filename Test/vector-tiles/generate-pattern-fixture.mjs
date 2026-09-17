import { writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { deflateSync } from "node:zlib";

// Authored repeating materials, separate from the neighboring atlas regions.
const pixels = Buffer.alloc((128 * 4 + 1) * 32);
const colors = [
  [220, 227, 218],
  [65, 150, 194],
  [221, 175, 48],
  [169, 119, 91],
];
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 128; x++) {
    const region = Math.floor(x / 32),
      u = x % 32;
    let color = colors[region];
    const mark =
      region === 0
        ? u % 16 === 0 || y % 16 === 0
        : region === 1
          ? (u + y) % 16 < 3
          : region === 2
            ? Math.abs(y - 16) < 2 || Math.abs(u - (16 - Math.abs(y - 16))) < 2
            : u % 16 > 3 && u % 16 < 12 && y % 16 > 4 && y % 16 < 13;
    if (mark) {
      color = region === 3 ? [53, 76, 91] : [245, 249, 245];
    }
    pixels.set([...color, 255], y * (128 * 4 + 1) + 1 + x * 4);
  }
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(128);
header.writeUInt32BE(32, 4);
header[8] = 8;
header[9] = 6;
await writeFile(
  new URL("pattern-sprite.png", import.meta.url),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
await writeFile(
  new URL("pattern-sprite.json", import.meta.url),
  `${JSON.stringify(
    Object.fromEntries(
      ["grid", "water", "arrow", "windows"].map((name, i) => [
        name,
        { x: i * 32, y: 0, width: 32, height: 32, pixelRatio: 1 },
      ]),
    ),
    null,
    2,
  )}\n`,
);

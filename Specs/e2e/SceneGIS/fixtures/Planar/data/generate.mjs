import { writeFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { deflateSync } from "node:zlib";

// Original deterministic fixtures: RGBA PNGs, no public map data or credentials.
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

function png(name, width, height, pixel) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rows.set([...pixel(x, y), 255], y * (width * 4 + 1) + 1 + x * 4);
    }
  }
  writeFileSync(
    new URL(name, import.meta.url),
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

png("height.png", 65, 65, (x, y) => {
  const radius = ((x - 32) / 32) ** 2 + ((y - 32) / 27) ** 2;
  const height = Math.round(255 * Math.max(0, 1 - radius) ** 1.8);
  return [height, height, height];
});
png("grid.png", 256, 256, (x, y) => {
  if (Math.abs(x - 90 - y * 0.35) < 4) {
    return [249, 223, 131];
  }
  if (Math.abs(y - 128 - 20 * Math.sin(x / 40)) < 12) {
    return [100, 158, 196];
  }
  return x % 64 < 2 || y % 64 < 2 ? [142, 168, 149] : [217, 230, 211];
});
const stops = [
  [25, 90, 74],
  [149, 174, 100],
  [217, 170, 98],
  [255, 247, 220],
];
png("ramp.png", 256, 1, (x) => {
  const progress = (x / 255) * 3;
  const segment = Math.min(2, Math.floor(progress));
  return stops[segment].map((value, i) =>
    Math.round(value + (stops[segment + 1][i] - value) * (progress - segment)),
  );
});

// A shared map for protocol comparisons, with unambiguous quadrant colors.
function imageryPixel(x, y, width) {
  x = Math.floor((x * 256) / width);
  if (Math.abs(x - 128) < 2 || Math.abs(y - 128) < 2) {
    return [255, 255, 255];
  }
  const quadrants = [
    [131, 189, 176],
    [232, 189, 120],
    [132, 175, 206],
    [206, 154, 145],
  ];
  const color = quadrants[(y >= 128 ? 2 : 0) + (x >= 128 ? 1 : 0)];
  return x % 32 === 0 || y % 32 === 0
    ? color.map((value) => Math.round((value + 255) / 2))
    : color;
}
png("imagery-service/0/0/0.png", 256, 256, (x, y) => imageryPixel(x, y, 256));
png("imagery-service/single.png", 512, 256, (x, y) => imageryPixel(x, y, 512));

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { deflateSync } from "node:zlib";
import protobuf from "protobufjs/minimal.js";
import cases from "./line-symbol-cases.mjs";

const directory = new URL("./line-symbol-assets/", import.meta.url);
await mkdir(directory, { recursive: true });
const layer = protobuf.Writer.create()
  .uint32(120)
  .uint32(2)
  .uint32(10)
  .string("roads")
  .uint32(40)
  .uint32(4096);
const keys = ["name", "kind"],
  values = [];
for (const item of cases) {
  const feature = protobuf.Writer.create()
    .uint32(8)
    .uint32(item.id)
    .uint32(18)
    .fork();
  for (const [i, key] of keys.entries()) {
    feature.uint32(i).uint32(values.length);
    values.push(item[key]);
  }
  feature.ldelim().uint32(24).uint32(2).uint32(34).fork().uint32(9);
  let x = 0,
    y = 0;
  item.points.forEach(([east, north], i) => {
    if (i === 1) {
      feature.uint32(((item.points.length - 1) << 3) | 2);
    }
    const u = (east + 1024) * 2,
      v = (1024 - north) * 2;
    feature.sint32(u - x).sint32(v - y);
    x = u;
    y = v;
  });
  layer.uint32(18).bytes(feature.ldelim().finish());
}
keys.forEach((key) => layer.uint32(26).string(key));
values.forEach((value) =>
  layer
    .uint32(34)
    .bytes(protobuf.Writer.create().uint32(10).string(value).finish()),
);
await writeFile(
  new URL("roads.pbf", directory),
  protobuf.Writer.create().uint32(26).bytes(layer.finish()).finish(),
);

// Authored right-pointing arrow and road shield; hospital is included for public E2E.
const width = 128,
  height = 32;
const pixels = Buffer.alloc(height * (1 + width * 4));
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    let color = [0, 0, 0, 0];
    if (x < 32) {
      if (
        (x >= 3 && x <= 21 && Math.abs(y - 15.5) < 2.5) ||
        (x >= 17 && x <= 30 && Math.abs(y - 15.5) < (30 - x) * 0.8)
      ) {
        color = [42, 102, 127, 255];
      }
    } else if (x < 64) {
      if (x >= 33 && x <= 62 && y >= 4 && y <= 27) {
        const border = x <= 34 || x >= 61 || y <= 5 || y >= 26;
        color = border ? [255, 255, 255, 255] : [28, 105, 91, 255];
      }
    } else if (x < 96) {
      const u = x - 64;
      const inside = Math.hypot(u - 15.5, y - 15.5) < 14;
      const cross =
        (u >= 13 && u <= 18 && y >= 7 && y <= 24) ||
        (y >= 13 && y <= 18 && u >= 7 && u <= 24);
      color = cross ? [255, 255, 255, 255] : [202, 66, 68, inside ? 255 : 0];
    } else {
      const u = 31 - y,
        v = x - 96;
      if (
        (u >= 3 && u <= 21 && Math.abs(v - 15.5) < 2.5) ||
        (u >= 17 && u <= 30 && Math.abs(v - 15.5) < (30 - u) * 0.8)
      ) {
        color = [42, 102, 127, 255];
      }
    }
    pixels.set(color, y * (1 + width * 4) + 1 + x * 4);
  }
}
function chunk(type, bytes) {
  const buffer = Buffer.alloc(bytes.length + 12);
  buffer.writeUInt32BE(bytes.length);
  buffer.write(type, 4);
  bytes.copy(buffer, 8);
  let crc = 0xffffffff;
  for (const byte of buffer.subarray(4, -4)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  buffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0, buffer.length - 4);
  return buffer;
}
const header = Buffer.alloc(13);
header.writeUInt32BE(width, 0);
header.writeUInt32BE(height, 4);
header[8] = 8;
header[9] = 6;
await writeFile(
  new URL("sprite.png", directory),
  Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]),
);
const metadata = {
  arrow: { x: 0, y: 0, width: 32, height: 32, pixelRatio: 1 },
  road_3: { x: 32, y: 0, width: 32, height: 32, pixelRatio: 1 },
  hospital: { x: 64, y: 0, width: 32, height: 32, pixelRatio: 1 },
};
metadata.oneway = { x: 96, y: 0, width: 32, height: 32, pixelRatio: 1 };
await writeFile(
  new URL("sprite.json", directory),
  `${JSON.stringify(metadata, null, 2)}\n`,
);

// Enable intact original layers only after the runtime can evaluate their properties.
for (const name of ["bright", "liberty"]) {
  const url = new URL(`./reference/${name}-profile.json`, import.meta.url);
  const profile = JSON.parse(await readFile(url, "utf8"));
  for (const [id, reason] of Object.entries(profile.excluded)) {
    if (reason.includes("V5B")) {
      delete profile.excluded[id];
    }
  }
  await writeFile(url, `${JSON.stringify(profile, null, 2)}\n`);
}

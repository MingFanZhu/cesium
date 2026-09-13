/* global fetch */
import { mkdir, writeFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { URL } from "node:url";
import { deflateSync } from "node:zlib";
import protobuf from "protobufjs/minimal.js";
import Glyphs from "../../packages/engine/Source/SceneGIS/Core/_private/_SceneGISVectorGlyphs.js";
import cases from "./symbol-cases.mjs";

const directory = new URL("./symbol-assets/", import.meta.url);
await mkdir(directory, { recursive: true });
const codes = new Set(
  [...cases.map((item) => item.name).join("")].map((c) => c.codePointAt(0)),
);
for (let code = 32; code < 127; code++) {
  codes.add(code);
}
codes.delete(10);
const ranges = new Set([...codes].map((code) => Math.floor(code / 256)));
for (const range of ranges) {
  const name = `${range * 256}-${range * 256 + 255}`;
  const response = await fetch(
    `https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/${name}.pbf`,
  );
  if (!response.ok) {
    throw new Error(`Font download failed: ${response.status}`);
  }
  const glyphs = Glyphs.decode(await response.arrayBuffer());
  const stack = protobuf.Writer.create()
    .uint32(10)
    .string("SceneGIS Test Noto Subset")
    .uint32(18)
    .string(name);
  for (const [code, glyph] of glyphs) {
    if (!codes.has(code)) {
      continue;
    }
    const g = protobuf.Writer.create()
      .uint32(8)
      .uint32(code)
      .uint32(18)
      .bytes(glyph.bitmap)
      .uint32(24)
      .uint32(glyph.width)
      .uint32(32)
      .uint32(glyph.height)
      .uint32(40)
      .sint32(glyph.left)
      .uint32(48)
      .sint32(glyph.top)
      .uint32(56)
      .uint32(glyph.advance);
    stack.uint32(26).bytes(g.finish());
  }
  await writeFile(
    new URL(`${name}.pbf`, directory),
    protobuf.Writer.create().uint32(10).bytes(stack.finish()).finish(),
  );
}

const layer = protobuf.Writer.create()
  .uint32(120)
  .uint32(2)
  .uint32(10)
  .string("labels")
  .uint32(40)
  .uint32(4096);
const keys = ["name", "kind", "rank"];
const values = [];
for (const item of cases) {
  const feature = protobuf.Writer.create()
    .uint32(8)
    .uint32(item.id)
    .uint32(18)
    .fork();
  for (let k = 0; k < keys.length; k++) {
    feature.uint32(k).uint32(values.length);
    values.push(item[keys[k]]);
  }
  feature
    .ldelim()
    .uint32(24)
    .uint32(1)
    .uint32(34)
    .fork()
    .uint32(9)
    .sint32((item.x + 1024) * 2)
    .sint32((1024 - item.y) * 2)
    .ldelim();
  layer.uint32(18).bytes(feature.finish());
}
for (const key of keys) {
  layer.uint32(26).string(key);
}
for (const value of values) {
  const writer = protobuf.Writer.create();
  if (typeof value === "number") {
    writer.uint32(25).double(value);
  } else {
    writer.uint32(10).string(value);
  }
  layer.uint32(34).bytes(writer.finish());
}
await writeFile(
  new URL("points.pbf", directory),
  protobuf.Writer.create().uint32(26).bytes(layer.finish()).finish(),
);

// A small authored RGBA hospital icon. Transparent exterior exercises alpha picking.
const pixels = Buffer.alloc(32 * (1 + 32 * 4));
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    const i = y * 129 + 1 + x * 4;
    const inside = Math.hypot(x - 15.5, y - 15.5) < 14;
    const cross =
      (x >= 13 && x <= 18 && y >= 7 && y <= 24) ||
      (y >= 13 && y <= 18 && x >= 7 && x <= 24);
    pixels.set(
      cross ? [255, 255, 255, 255] : [202, 66, 68, inside ? 255 : 0],
      i,
    );
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
header.writeUInt32BE(32, 0);
header.writeUInt32BE(32, 4);
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
await writeFile(
  new URL("sprite.json", directory),
  `${JSON.stringify({ hospital: { x: 0, y: 0, width: 32, height: 32, pixelRatio: 1 } }, null, 2)}\n`,
);
const license = await fetch(
  "https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/main/OFL.txt",
);
const cjkLicense = await fetch(
  "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/LICENSE",
);
if (!cjkLicense.ok) {
  throw new Error(`CJK font license download failed: ${cjkLicense.status}`);
}
await writeFile(
  new URL("OFL-CJK.txt", directory),
  (await cjkLicense.text())
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n"),
);
if (!license.ok) {
  throw new Error(`Font license download failed: ${license.status}`);
}
await writeFile(
  new URL("OFL.txt", directory),
  (await license.text())
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n"),
);

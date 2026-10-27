// Offline asset preparation only. Requires sharp; never imported by the example or engine.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { URL, fileURLToPath } from "node:url";
import process from "node:process";
import { Buffer } from "node:buffer";

const input = resolve(process.argv[2] ?? "Build/material-sources");
const output = fileURLToPath(new URL("./textures/", import.meta.url));
const size = 256;
await mkdir(output, { recursive: true });
const entries = [["glass", "Facade006_1K-PNG", "png", true, false]];
for (const [name, asset, extension, metal, emissive] of entries) {
  const source = (channel) =>
    join(input, asset, `${asset}_${channel}.${extension}`);
  // Preserve the vendor color and OpenGL normal convention; no painted lighting.
  await sharp(source("Color"))
    .resize(size, size)
    .removeAlpha()
    .jpeg({ quality: 92 })
    .toFile(join(output, `${name}-color.jpg`));
  await sharp(source("NormalGL"))
    .resize(size, size)
    .removeAlpha()
    .png()
    .toFile(join(output, `${name}-normal.png`));
  const roughness = await sharp(source("Roughness"))
    .resize(size, size)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const metallic = metal
    ? await sharp(source("Metalness"))
        .resize(size, size)
        .extractChannel(0)
        .raw()
        .toBuffer()
    : undefined;
  const packed = Buffer.alloc(size * size * 3);
  for (let i = 0; i < size * size; i++) {
    packed[i * 3] = 255;
    packed[i * 3 + 1] = roughness[i];
    packed[i * 3 + 2] = metallic?.[i] ?? 0;
  }
  await sharp(packed, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toFile(join(output, `${name}-rm.png`));
  if (emissive) {
    await sharp(source("Emission"))
      .resize(size, size)
      .removeAlpha()
      .png()
      .toFile(join(output, `${name}-emissive.png`));
  }
}

// Original imagegen albedo maps. The companion maps are intentionally approximate:
// cool dark pixels classify glazing, which is smoother and recessed relative to masonry.
// They are material channels, not measured scans or painted sunlight.
for (const name of ["limestone", "brick", "roof-flat"]) {
  const pixels = await sharp(
    fileURLToPath(new URL(`./source-art/${name}.png`, import.meta.url)),
  )
    .resize(size, size)
    .removeAlpha()
    .raw()
    .toBuffer();
  await sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .jpeg({ quality: 94 })
    .toFile(join(output, `${name}-color.jpg`));
  const roof = name === "roof-flat";
  const height = new Float32Array(size * size);
  const rm = Buffer.alloc(size * size * 3);
  const normal = Buffer.alloc(size * size * 3);
  const emission = Buffer.alloc(size * size * 3);
  for (let i = 0; i < height.length; i++) {
    const [r, g, b] = pixels.subarray(i * 3, i * 3 + 3);
    const glass = !roof && b > r + 3 && r < 130;
    const luma = (r + g + b) / 765;
    height[i] = roof ? luma * 0.06 : glass ? 0 : 0.12 + luma * 0.015;
    rm.set([255, glass ? 65 : roof ? 218 : 230, glass ? 210 : 0], i * 3);
    const x = i % size,
      y = Math.floor(i / size);
    if (
      glass &&
      (Math.floor((x * 4) / size) + Math.floor((y * 4) / size) * 3) % 7 === 1
    ) {
      emission.set([200, 163, 105], i * 3);
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (a, b) =>
        height[((b + size) % size) * size + ((a + size) % size)];
      const nx = (at(x - 1, y) - at(x + 1, y)) * 2;
      const ny = (at(x, y + 1) - at(x, y - 1)) * 2;
      const length = Math.hypot(nx, ny, 1);
      normal.set(
        [
          Math.round(127.5 + (127.5 * nx) / length),
          Math.round(127.5 + (127.5 * ny) / length),
          Math.round(127.5 + 127.5 / length),
        ],
        (y * size + x) * 3,
      );
    }
  }
  for (const [channel, data] of [
    ["normal", normal],
    ["rm", rm],
    ["emissive", emission],
  ]) {
    if (roof && channel === "emissive") {
      continue;
    }
    await sharp(data, { raw: { width: size, height: size, channels: 3 } })
      .png()
      .toFile(join(output, `${name}-${channel}.png`));
  }
}

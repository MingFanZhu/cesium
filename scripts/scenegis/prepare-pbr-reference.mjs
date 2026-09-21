/* global process, fetch, console */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  stat,
  rename,
  copyFile,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dataRoot = join(root, "Test/Rendering/pbr-data");
const local = join(dataRoot, "local");
const cache = join(root, "Build/pbr-reference");
const manifest = JSON.parse(
  await readFile(join(dataRoot, "manifest.json"), "utf8"),
);
const requireTools = createRequire(
  resolve(process.argv[2] ?? join(cache, "tools"), "package.json"),
);
const sharp = requireTools("sharp");
if (sharp.versions.sharp !== manifest.delivery.sharp) {
  throw new Error(
    `Use sharp ${manifest.delivery.sharp}; see pbr-data/README.md.`,
  );
}
async function hash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) {
    digest.update(chunk);
  }
  return digest.digest("hex");
}
async function acquire(url, file, expected) {
  await mkdir(dirname(file), { recursive: true });
  if (!(await stat(file).catch(() => undefined))) {
    console.log(`Downloading ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed (${response.status}): ${url}`);
    }
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(`${file}.part`),
    );
    if ((await hash(`${file}.part`)) !== expected) {
      throw new Error(
        `Source changed: ${url}. Review the new source before updating the manifest.`,
      );
    }
    await rename(`${file}.part`, file);
  } else if ((await hash(file)) !== expected) {
    throw new Error(`Source checksum mismatch: ${file}`);
  }
}
await mkdir(local, { recursive: true });
const summary = { id: manifest.id, sharp: sharp.versions, assets: [] };
for (const asset of manifest.intel.archives) {
  const archive = join(cache, asset.file);
  await acquire(asset.url, archive, asset.sha256);
  const entry = `${asset.directory}/${asset.gltf}`;
  execFileSync("tar", [
    "-xf",
    archive,
    "-C",
    local,
    entry,
    `${asset.directory}/credits_license.txt`,
  ]);
  const original = join(local, asset.directory);
  const gltf = JSON.parse(await readFile(join(original, asset.gltf), "utf8"));
  const resources = [...gltf.buffers, ...gltf.images].map(({ uri }) =>
    uri.replace(/^\.\//, ""),
  );
  execFileSync("tar", [
    "-xf",
    archive,
    "-C",
    local,
    ...resources.map((uri) => `${asset.directory}/${uri}`),
  ]);
  const output = join(local, "2k", asset.directory);
  await mkdir(output, { recursive: true });
  // Keep the glTF and buffers byte-identical; only explicitly labeled delivery textures change.
  for (const file of [
    asset.gltf,
    "credits_license.txt",
    ...gltf.buffers.map((buffer) => buffer.uri),
  ]) {
    await copyFile(join(original, file), join(output, file));
  }
  const colors = new Set();
  const normals = new Set();
  for (const material of gltf.materials) {
    for (const texture of [
      material.pbrMetallicRoughness?.baseColorTexture,
      material.emissiveTexture,
    ]) {
      if (texture) {
        colors.add(gltf.textures[texture.index].source);
      }
    }
    if (material.normalTexture) {
      normals.add(gltf.textures[material.normalTexture.index].source);
    }
  }
  let originalGpuBytes = 0;
  let deliveryGpuBytes = 0;
  for (let index = 0; index < gltf.images.length; index++) {
    const uri = gltf.images[index].uri;
    const input = join(original, uri);
    const target = join(output, uri);
    await mkdir(dirname(target), { recursive: true });
    const metadata = await sharp(input).metadata();
    originalGpuBytes += metadata.width * metadata.height * 4 * (4 / 3);
    let resize = sharp(input).resize(2048, 2048, {
      fit: "inside",
      withoutEnlargement: true,
    });
    if (colors.has(index)) {
      resize = resize.gamma(2.2);
    }
    if (normals.has(index)) {
      const { data, info } = await resize
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let i = 0; i < data.length; i += info.channels) {
        const x = data[i] / 127.5 - 1;
        const y = data[i + 1] / 127.5 - 1;
        const z = data[i + 2] / 127.5 - 1;
        const length = Math.hypot(x, y, z);
        data[i] = Math.round((x / length + 1) * 127.5);
        data[i + 1] = Math.round((y / length + 1) * 127.5);
        data[i + 2] = Math.round((z / length + 1) * 127.5);
      }
      await sharp(data, { raw: info }).png().toFile(target);
    } else {
      await resize.png().toFile(target);
    }
    const size = await sharp(target).metadata();
    deliveryGpuBytes += size.width * size.height * 4 * (4 / 3);
  }
  summary.assets.push({ entry, ...asset, originalGpuBytes, deliveryGpuBytes });
  console.log(
    `Prepared ${asset.directory}: ${gltf.images.length} textures, geometry/materials unchanged.`,
  );
}
for (const file of manifest.khronos.files) {
  await acquire(
    `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${manifest.khronos.revision}/${file.path}`,
    join(local, "khronos", file.path),
    file.sha256,
  );
}
await writeFile(
  join(local, "prepared.json"),
  `${JSON.stringify(summary, null, 2)}\n`,
);
console.log(
  "PBR reference assets prepared. Open Test/Rendering/PBR综合验收.html.",
);

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { TextDecoder } from "node:util";
import console from "node:console";
import parseS3m from "../../packages/engine/Source/SceneGIS/Core/_private/_SceneGISS3mParser.js";

// Public demonstration data is cached for qualification, not redistributed.
const root = fileURLToPath(
  new URL("../../Build/s3m-samples/oblique/", import.meta.url),
);
const configUrl =
  "https://www.supermapol.com/realspace/services/3D-JinJiangS3MB/rest/realspace/datas/Combine/config";
const contentBase = new URL("data/path/", configUrl);
async function fetchBytes(url) {
  const response = await globalThis.fetch(url, {
    signal: globalThis.AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    throw new Error(`${response.status}: ${url}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}
const config = JSON.parse(
  new TextDecoder().decode(await fetchBytes(configUrl)),
);
config.tiles = config.tiles.slice(0, 1);
const rootUrl = new URL(config.tiles[0].url, contentBase);
const queue = [{ url: rootUrl, depth: 0 }];
const files = [];
for (const item of queue) {
  const bytes = await fetchBytes(item.url);
  const decoded = parseS3m(bytes.buffer);
  const relative = decodeURIComponent(
    item.url.pathname.slice(contentBase.pathname.length),
  );
  const target = path.resolve(root, relative);
  if (!target.startsWith(root)) {
    throw new Error("Sample path escaped its cache directory.");
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  files.push({ path: relative, bytes: bytes.length, source: item.url.href });
  if (item.depth === 0) {
    for (const page of decoded.pages) {
      if (page.child) {
        const url = new URL(page.child, item.url);
        if (!queue.some((entry) => entry.url.href === url.href)) {
          queue.push({ url, depth: 1 });
        }
      }
    }
  }
}
await fs.writeFile(
  path.join(root, "sample.scp"),
  JSON.stringify(config, null, 2),
);
await fs.writeFile(
  path.join(root, "provenance.json"),
  JSON.stringify(
    {
      source: configUrl,
      fetchedAt: new Date().toISOString(),
      maximumDepth: 1,
      files,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ maximumDepth: 1, files }, null, 2));

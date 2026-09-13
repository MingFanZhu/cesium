/* global window, document */
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

// Run after build-release and build-ts. No external map service is used.
const repo = fileURLToPath(new URL("../../", import.meta.url));
const temporary = await mkdtemp(
  path.join(tmpdir(), "scenegis-vector-package-"),
);
const npm =
  process.env.npm_execpath ??
  path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
const runNpm = (args, cwd) =>
  execFileSync(process.execPath, [npm, ...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
const [archive] = JSON.parse(
  runNpm(
    ["pack", "--json", "--pack-destination", temporary],
    path.join(repo, "packages/engine"),
  ),
);
assert(
  archive.files.some(
    (file) => file.path === "Build/Workers/SceneGISVectorTileWorker.js",
  ),
);
await writeFile(
  path.join(temporary, "package.json"),
  JSON.stringify({ private: true, type: "module" }),
);
runNpm(
  [
    "install",
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    path.join(temporary, archive.filename),
  ],
  temporary,
);
const installed = path.join(temporary, "node_modules/@cesium/engine");
const types = await readFile(path.join(installed, "index.d.ts"), "utf8");
assert(types.includes("maximumUploadTimePerFrame?: number"));
assert(!types.includes("SceneGISVectorWorkerPool"));
assert(!types.includes("SceneGISVectorTileWorker"));
const source = await readFile(path.join(installed, "index.js"), "utf8");
assert(!source.includes("Source/Workers/SceneGISVectorTileWorker.js"));
await writeFile(
  path.join(temporary, "entry.js"),
  'import * as C from "@cesium/engine"; window.C = C;',
);
await build({
  entryPoints: [path.join(temporary, "entry.js")],
  outfile: path.join(temporary, "consumer.js"),
  bundle: true,
  format: "esm",
});
await copyFile(
  new URL("public-fixture.pbf", import.meta.url),
  path.join(temporary, "tile.pbf"),
);
await writeFile(
  path.join(temporary, "index.html"),
  "<!doctype html><title>Vector Worker package qualification</title>",
);
const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  const release = pathname.startsWith("/release/");
  const root = release ? path.join(repo, "Build/Cesium") : temporary;
  const file = path.resolve(
    root,
    release ? pathname.slice(9) : pathname.slice(1) || "index.html",
  );
  if (!file.startsWith(root + path.sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    const mime = file.endsWith(".js")
      ? "text/javascript"
      : file.endsWith(".html")
        ? "text/html"
        : "application/octet-stream";
    response.writeHead(200, { "Content-Type": mime }).end(data);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const results = [];
  for (const mode of ["installed-engine", "release-esm", "release-iife"]) {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    const result = await page.evaluate(async (mode) => {
      window.CESIUM_BASE_URL =
        mode === "installed-engine"
          ? "/node_modules/@cesium/engine/Build/"
          : "/release/";
      if (mode === "installed-engine") {
        await import("/consumer.js");
      } else if (mode === "release-esm") {
        window.C = await import("/release/index.js");
      } else {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "/release/Cesium.js";
          script.onload = resolve;
          script.onerror = reject;
          document.head.append(script);
        });
        window.C = window.Cesium;
      }
      const C = window.C;
      const scheme = new C.SceneGISPlanarTilingScheme({
        coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
          extent: new C.SceneGISPlanarExtent({
            minimumX: -512,
            minimumY: -512,
            maximumX: 512,
            maximumY: 512,
          }),
        }),
      });
      const source = new C.SceneGISVectorTileSource({
        url: "/tile.pbf?z={z}&x={x}&y={y}",
        tilingScheme: scheme,
      });
      const decoded = await source.requestTile(0, 0, 0);
      const raw = await source.requestTile(0, 0, 0, undefined, false);
      const processor = new C.TaskProcessor("SceneGISVectorTileWorker");
      const result = await processor.scheduleTask(
        { kind: "decode", buffer: raw },
        [raw],
      );
      processor.destroy();
      return {
        mode,
        layers: decoded.layers.length,
        features: decoded.layers.reduce(
          (sum, layer) => sum + layer.features.length,
          0,
        ),
        same: result.data.layers.length === decoded.layers.length,
        transferred: raw.byteLength === 0,
        typed: result.data.layers.some((layer) =>
          layer.features.some(
            (feature) => feature.geometry.parts[0] instanceof Float64Array,
          ),
        ),
        destroyed: processor.isDestroyed(),
      };
    }, mode);
    assert(result.layers > 0 && result.features > 0);
    assert(
      result.same && result.transferred && result.typed && result.destroyed,
    );
    assert.deepEqual(errors, []);
    results.push(result);
    await page.close();
  }
  console.log(JSON.stringify({ temporary, results }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

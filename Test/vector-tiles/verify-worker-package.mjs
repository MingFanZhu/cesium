/* global window, document, performance, requestAnimationFrame */
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
import { encodeGlyphs } from "../../packages/engine/Specs/SceneGIS/Core/vectorSymbolFixture.js";

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
await writeFile(path.join(temporary, "glyph.pbf"), encodeGlyphs());
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
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 64;
      canvas.style.cssText = "width:64px;height:64px";
      document.body.append(canvas);
      const scene = new C.Scene({
        canvas,
        scene3DOnly: true,
        contextOptions: { webgl: { antialias: false, stencil: true } },
      });
      const world = new C.SceneGISPlanarWorld({
        coordinateSystem: scheme.coordinateSystem,
        maximumLevel: 0,
        baseColor: C.Color.BLACK,
      });
      scene._initializeWorld(world);
      scene.msaaSamples = 1;
      scene.postProcessStages.fxaa.enabled = false;
      scene.rethrowRenderErrors = true;
      scene.camera.setView({
        destination: new C.Cartesian3(0, 0, 80),
        orientation: {
          direction: new C.Cartesian3(0, 0, -1),
          up: new C.Cartesian3(0, 1, 0),
        },
      });
      scene.camera.frustum.near = 1;
      scene.camera.frustum.far = 1000;
      const symbolSource = new C.SceneGISVectorTileSource({
        url: "/unused/{z}/{x}/{y}",
        tilingScheme: world.tilingScheme,
        maximumLevel: 0,
      });
      symbolSource.requestTile = async () => ({
        layers: [
          {
            name: "labels",
            version: 2,
            extent: 4096,
            features: [
              {
                id: "land",
                type: 3,
                properties: {},
                geometry: {
                  parts: [
                    new Float64Array([
                      1536, 1536, 2560, 1536, 2560, 2560, 1536, 2560,
                    ]),
                  ],
                  polygonStarts: new Uint32Array([0]),
                },
              },
              {
                id: "symbol",
                type: 1,
                properties: {},
                geometry: {
                  parts: [new Float64Array([2048, 2048])],
                  polygonStarts: new Uint32Array(),
                },
              },
            ],
          },
        ],
      });
      const layer = scene.primitives.add(
        new C.SceneGISVectorTileLayer({
          scene,
          sources: { test: symbolSource },
          style: {
            version: 8,
            glyphs: "/glyph.pbf?f={fontstack}&r={range}",
            sources: {
              test: {
                type: "vector",
                tiles: ["/unused/{z}/{x}/{y}"],
                maxzoom: 0,
              },
            },
            layers: [
              {
                id: "land",
                type: "fill",
                source: "test",
                "source-layer": "labels",
                filter: ["==", ["geometry-type"], "Polygon"],
                paint: { "fill-color": "blue", "fill-antialias": false },
              },
              {
                id: "labels",
                type: "symbol",
                source: "test",
                "source-layer": "labels",
                filter: ["==", ["geometry-type"], "Point"],
                layout: {
                  "text-field": "A",
                  "text-font": ["Test"],
                  "text-size": 24,
                },
                paint: { "text-color": "red" },
              },
            ],
          },
        }),
      );
      const render = () => {
        scene.initializeFrame();
        scene.render();
      };
      const start = performance.now();
      do {
        await new Promise(requestAnimationFrame);
        render();
        if (performance.now() - start > 10000) {
          throw new Error("Symbol package preparation did not finish.");
        }
      } while (!layer.tilesLoaded);
      const pixel = Array.from(
        scene.context.readPixels({ x: 30, y: 31, width: 1, height: 1 }),
      );
      const picked = scene.pick(new C.Cartesian2(30, 32), 1, 1)?.id.featureId;
      const batch = [...layer._symbols._groups.values()][0];
      const fixed = batch.resources._staticBuffer,
        dynamic = batch.resources._dynamicBuffer;
      const uploads = batch.resources.uploadedBytes;
      scene.camera.position.x += 1;
      render();
      const stable = batch.resources.uploadedBytes === uploads;
      world.terrainProvider = {
        tilingScheme: world.tilingScheme,
        minimumHeight: 12,
        maximumHeight: 12,
        maximumLevel: 0,
        errorEvent: new C.Event(),
        getLevelMaximumGeometricError: () => 1,
        getTileDataAvailable: () => true,
        loadTileDataAvailability: () => undefined,
        requestTileGeometry: () =>
          Promise.resolve(
            new C.SceneGISPlanarHeightmapTerrainData({
              width: 3,
              height: 3,
              buffer: new Float32Array(9).fill(12),
            }),
          ),
      };
      const groundStart = performance.now();
      do {
        await new Promise(requestAnimationFrame);
        render();
        if (performance.now() - groundStart > 10000) {
          throw new Error("Ground package preparation did not finish.");
        }
      } while (
        !layer.tilesLoaded ||
        layer._symbols._placed[0]?.position.z !== 12
      );
      const location = C.SceneTransforms.worldToWindowCoordinates(
        scene,
        new C.Cartesian3(-20, 0, 12),
      );
      const groundColor = Array.from(
        scene.context.readPixels({
          x: Math.floor(location.x),
          y: 63 - Math.floor(location.y),
          width: 1,
          height: 1,
        }),
      );
      const groundPick = scene.pick(location)?.id.featureId;
      const groundResources = layer._drawOrder[0]._resources;
      const groundTextures = groundResources._textures.slice();
      scene.destroy();
      canvas.remove();
      const globeCanvas = document.createElement("canvas");
      globeCanvas.width = globeCanvas.height = 64;
      document.body.append(globeCanvas);
      const globeScene = new C.Scene({
        canvas: globeCanvas,
        scene3DOnly: true,
      });
      globeScene.globe = new C.Globe();
      globeScene.globe.showGroundAtmosphere = false;
      globeScene.globe.terrainProvider = new C.CustomHeightmapTerrainProvider({
        width: 17,
        height: 17,
        callback: () => new Float32Array(289).fill(600),
      });
      globeScene.fog.enabled = false;
      globeScene.msaaSamples = 1;
      globeScene.postProcessStages.fxaa.enabled = false;
      const half = Math.PI * 6378137;
      const globeScheme = new C.SceneGISPlanarTilingScheme({
        coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
          crs: "EPSG:3857",
          extent: new C.SceneGISPlanarExtent({
            minimumX: -half,
            minimumY: -half,
            maximumX: half,
            maximumY: half,
          }),
        }),
      });
      class GlobeSource extends C.SceneGISVectorTileSource {
        requestTile() {
          return Promise.resolve({
            layers: [
              {
                name: "map",
                version: 2,
                extent: 4096,
                features: [
                  {
                    id: "land",
                    type: 3,
                    properties: {},
                    geometry: {
                      parts: [
                        new Float64Array([0, 0, 4096, 0, 4096, 4096, 0, 4096]),
                      ],
                      polygonStarts: new Uint32Array([0]),
                    },
                  },
                  {
                    id: "point",
                    type: 1,
                    properties: {},
                    geometry: {
                      parts: [new Float64Array([2048, 2048])],
                      polygonStarts: new Uint32Array(),
                    },
                  },
                ],
              },
            ],
          });
        }
      }
      const globeSource = new GlobeSource({
        url: "/unused/{z}/{x}/{y}",
        tilingScheme: globeScheme,
        minimumLevel: 14,
        maximumLevel: 14,
      });
      const bounds = globeScheme.tileXYToExtent(8192, 8192, 14);
      const globeTarget = C.Cartesian3.fromRadians(
        (bounds.minimumX + bounds.maximumX) / 2 / 6378137,
        Math.atan(Math.sinh((bounds.minimumY + bounds.maximumY) / 2 / 6378137)),
        600,
      );
      globeScene.camera.lookAt(
        globeTarget,
        new C.HeadingPitchRange(0, -Math.PI / 3, 300),
      );
      globeScene.camera.lookAtTransform(C.Matrix4.IDENTITY);
      const globeLayer = globeScene.primitives.add(
        new C.SceneGISVectorTileLayer({
          scene: globeScene,
          tilingScheme: globeScheme,
          sources: { map: globeSource },
          style: {
            version: 8,
            sources: {
              map: {
                type: "vector",
                tiles: ["/unused/{z}/{x}/{y}"],
                minzoom: 14,
                maxzoom: 14,
              },
            },
            layers: [
              {
                id: "land",
                type: "fill",
                source: "map",
                "source-layer": "map",
                paint: { "fill-color": "blue", "fill-antialias": false },
              },
              {
                id: "points",
                type: "circle",
                source: "map",
                "source-layer": "map",
                paint: { "circle-color": "red", "circle-radius": 7 },
              },
            ],
          },
        }),
      );
      const globeStart = performance.now();
      do {
        await new Promise(requestAnimationFrame);
        globeScene.initializeFrame();
        globeScene.render();
        if (performance.now() - globeStart > 15000) {
          throw new Error("Globe package preparation did not finish.");
        }
      } while (
        !globeLayer.tilesLoaded ||
        !globeScene.globe.tilesLoaded ||
        !globeLayer._terrain.entries.some((e) => e.result)
      );
      const globeColor = Array.from(
        globeScene.context.readPixels({ x: 32, y: 31, width: 1, height: 1 }),
      );
      const globePick = globeScene.pick(new C.Cartesian2(32, 32))?.id.featureId;
      const globeResources = globeLayer._drawOrder.find(
        (b) => b._resources._textures,
      )?._resources;
      const globeTextures = globeResources._textures.slice();
      globeScene.destroy();
      globeCanvas.remove();
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
        symbol: {
          pixel,
          picked,
          stable,
          separate: fixed !== dynamic,
          released: fixed.isDestroyed() && dynamic.isDestroyed(),
        },
        ground: {
          color: groundColor,
          picked: groundPick,
          released: groundTextures.every((t) => t.isDestroyed()),
        },
        globe: {
          color: globeColor,
          picked: globePick,
          released: globeTextures.every((t) => t.isDestroyed()),
        },
      };
    }, mode);
    assert(result.layers > 0 && result.features > 0);
    assert(
      result.same && result.transferred && result.typed && result.destroyed,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(result.symbol.pixel, [255, 0, 0, 255]);
    assert.equal(result.symbol.picked, "symbol");
    assert.deepEqual(result.ground.color, [0, 0, 255, 255]);
    assert.equal(result.ground.picked, "land");
    assert(result.ground.released);
    assert.deepEqual(result.globe.color, [255, 0, 0, 255]);
    assert.equal(result.globe.picked, "point");
    assert(result.globe.released);
    assert(
      result.symbol.stable && result.symbol.separate && result.symbol.released,
    );
    results.push(result);
    await page.close();
  }
  console.log(JSON.stringify({ temporary, results }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}

import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

test.describe.configure({ retries: 0 });
test.use({
  viewport: { width: 1280, height: 800 },
  launchOptions: { args: [] },
});
const fixtureRoot = new URL("../../Test/vector-tiles/", import.meta.url);

async function routes(page) {
  const [tile, bright, liberty, font, spriteJson, spritePng] =
    await Promise.all([
      readFile(new URL("public-fixture.pbf", fixtureRoot)),
      readFile(new URL("reference/openfreemap-bright.json", fixtureRoot)),
      readFile(new URL("reference/openfreemap-liberty.json", fixtureRoot)),
      readFile(new URL("symbol-assets/0-255.pbf", fixtureRoot)),
      readFile(new URL("line-symbol-assets/sprite.json", fixtureRoot)),
      readFile(new URL("line-symbol-assets/sprite.png", fixtureRoot)),
    ]);
  const styles = { "/styles/bright": bright, "/styles/liberty": liberty };
  const observed = {
    tileRequests: 0,
    fontRequests: 0,
    unexpected: [],
    failMetadata: false,
  };
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.protocol === "data:") {
      return route.continue();
    }
    if (url.hostname === "tiles.openfreemap.org") {
      if (url.pathname.startsWith("/fonts/")) {
        observed.fontRequests++;
        return route.fulfill({
          body: font,
          contentType: "application/x-protobuf",
        });
      }
      if (url.pathname.startsWith("/sprites/")) {
        const json = url.pathname.endsWith(".json");
        return route.fulfill({
          body: json ? spriteJson : spritePng,
          contentType: json ? "application/json" : "image/png",
        });
      }
      if (Object.hasOwn(styles, url.pathname)) {
        return route.fulfill({
          body: styles[url.pathname],
          contentType: "application/json",
        });
      }
      if (url.pathname === "/planet") {
        if (observed.failMetadata) {
          return route.fulfill({
            status: 503,
            json: { message: "Test service unavailable" },
          });
        }
        return route.fulfill({
          json: {
            tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"],
            minzoom: 0,
            maxzoom: 14,
            attribution: "SceneGIS deterministic schema fixture",
          },
        });
      }
      if (url.pathname.endsWith(".pbf")) {
        observed.tileRequests++;
        return route.fulfill({
          body: tile,
          contentType: "application/x-protobuf",
        });
      }
    }
    observed.unexpected.push(url.origin);
    return route.abort();
  });
  return observed;
}
async function ready(page) {
  await page.waitForFunction(
    () => window.publicVectorPreview?.layer?.tilesLoaded,
  );
  await expect(page.locator("#error")).toBeEmpty();
}

test("renders the public-map page with deterministic data, picking, tilt and resource recreation", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const observed = await routes(page);
  await page.goto("/Test/vector-tiles/public.html");
  await ready(page);
  await expect(page.locator("#support-summary")).toHaveText(
    "118 / 119 个样式层已接入",
  );
  expect(
    await page.evaluate(() => {
      const placed = window.publicVectorPreview.layer._symbols._previous.filter(
        (c) => c.placed,
      );
      return ["highway-name-major", "highway-shield-non-us"].every((name) =>
        placed.some((c) => c.identity.styleLayer === name),
      );
    }),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => window.publicVectorPreview.layer.statistics.failedTiles,
    ),
  ).toBe(0);
  const canvas = await page.locator("canvas").first().boundingBox();
  await page.mouse.click(canvas.x + canvas.width * 0.43, canvas.height * 0.4);
  await expect(page.locator("#picked")).toContainText("SceneGIS test");
  await page.getByRole("button", { name: "测量 60 帧" }).click();
  await page.waitForFunction(
    () => window.publicVectorPreview.measurement !== undefined,
  );
  const measurement = await page.evaluate(
    () => window.publicVectorPreview.measurement,
  );
  expect(measurement.receivedBytes).toBeGreaterThan(0);
  expect(measurement.features).toBeGreaterThan(0);
  expect(measurement.statistics.drawCommands).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "测量 60 帧" })).toBeEnabled();
  await expect(page.locator(".cesium-performanceDisplay-fps")).toHaveText(
    /\d+ FPS/,
  );
  await expect(page.locator(".cesium-performanceDisplay-ms")).toHaveText(
    /\d+\.\d+ MS/,
  );
  await expect(page.locator("#continuous-render")).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const scene = window.publicVectorPreview.viewer.scene;
      return !scene.requestRenderMode && scene.debugShowFramesPerSecond;
    }),
  ).toBe(true);
  await page.getByRole("button", { name: "倾斜", exact: true }).click();
  await ready(page);
  await page.screenshot({
    path: testInfo.outputPath("public-fixture-tilted.png"),
  });
  await page.evaluate(() => {
    window.oldPublicLayer = window.publicVectorPreview.layer;
  });
  await page.getByRole("button", { name: "重建图层" }).click();
  await ready(page);
  expect(await page.evaluate(() => window.oldPublicLayer.isDestroyed())).toBe(
    true,
  );
  expect(observed.tileRequests).toBeGreaterThan(0);
  expect(observed.unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test("switches between Bright and Liberty and preserves the map when the public service fails", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const observed = await routes(page);
  await page.goto("/Test/vector-tiles/public.html");
  await ready(page);
  await expect(page.locator("#map-title")).toContainText("Bright");
  await page.evaluate(() => {
    window.oldPublicLayer = window.publicVectorPreview.layer;
  });
  await page.selectOption("#provider", "liberty");
  await page.getByRole("button", { name: "加载地图" }).click();
  await expect(page.locator("#map-title")).toContainText("Liberty");
  await ready(page);
  expect(await page.evaluate(() => window.oldPublicLayer.isDestroyed())).toBe(
    true,
  );
  await expect(page.locator("#support-summary")).toHaveText(
    "107 / 111 个样式层已接入",
  );
  expect(
    await page.evaluate(() => window.publicVectorPreview.layer.style.layerIds),
  ).toContain("water");
  await page.getByRole("button", { name: "街道细节" }).click();
  await page.waitForFunction(
    () =>
      window.publicVectorPreview.layer.statistics.zoom > 15.9 &&
      window.publicVectorPreview.layer.tilesLoaded,
  );
  await expect(page.locator("#error")).toBeEmpty();
  await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const { viewer, layer } = window.publicVectorPreview;
    const camera = viewer.scene.camera;
    const state = [...layer._sources.values()][0];
    const entry = state.visible.find(
      ({ bounds }) =>
        camera.positionWC.x >= bounds.minimumX &&
        camera.positionWC.x < bounds.maximumX &&
        camera.positionWC.y >= bounds.minimumY &&
        camera.positionWC.y < bounds.maximumY,
    );
    const data = entry.data.layers.find((item) => item.name === "poi");
    const point = data.features[0].geometry.parts[0];
    const coordinates = new C.SceneGISVectorTileCoordinates({
      tilingScheme: state.source.tilingScheme,
      x: entry.x,
      y: entry.y,
      level: entry.level,
      extent: data.extent,
    });
    const anchor = coordinates.toWorld(point[0], point[1]);
    // Center the synthetic POI at street zoom. An offscreen candidate count
    // cannot prove that a public style actually renders its icon and text.
    camera.position.x = anchor.x;
    camera.position.y = anchor.y;
    viewer.scene.requestRender();
  });
  await page.waitForFunction(() => {
    const { viewer, layer } = window.publicVectorPreview;
    return (
      layer.tilesLoaded &&
      layer._symbols._previous.some(
        (c) =>
          c.placed &&
          c.identity.featureId === "501" &&
          Math.hypot(
            c.screen.x - viewer.scene.canvas.clientWidth / 2,
            c.screen.y - viewer.scene.canvas.clientHeight / 2,
          ) < 2,
      )
    );
  });
  await ready(page);
  expect(
    await page.evaluate(
      () => window.publicVectorPreview.layer.statistics.placedSymbols,
    ),
  ).toBeGreaterThan(0);
  expect(
    await page.evaluate(() => {
      const { viewer, layer } = window.publicVectorPreview;
      const poi = layer._symbols._previous.find(
        (c) => c.placed && c.identity.featureId === "501",
      );
      return viewer.scene.pick(poi.screen, 1, 1)?.id.featureId;
    }),
  ).toBe("501");
  expect(
    await page.evaluate(() => {
      const { layer } = window.publicVectorPreview;
      return layer.style.evaluateLayer(
        "road_one_way_arrow",
        { type: 2, properties: { oneway: 1 } },
        layer.statistics.zoom,
      ).show;
    }),
  ).toBe(true);
  expect(observed.fontRequests).toBeGreaterThan(0);
  await page.evaluate(() => {
    window.oldPublicLayer = window.publicVectorPreview.layer;
  });
  observed.failMetadata = true;
  await page.selectOption("#provider", "bright");
  await page.getByRole("button", { name: "加载地图" }).click();
  await expect(page.locator("#error")).toContainText("HTTP 503");
  await expect(page.locator("#map-title")).toContainText("Liberty");
  expect(
    await page.evaluate(
      () =>
        window.oldPublicLayer === window.publicVectorPreview.layer &&
        !window.oldPublicLayer.isDestroyed(),
    ),
  ).toBe(true);
  expect(observed.unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test("retains foreground coverage and map scale while culling distant labels at the shallowest surface pitch", async ({
  page,
}, testInfo) => {
  await routes(page);
  await page.goto("/Test/vector-tiles/public.html");
  await ready(page);
  const result = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const { viewer } = window.publicVectorPreview;
    const scene = viewer.scene;
    const camera = scene.camera;
    const direction = new C.Cartesian3(
      -0.0445570992783293,
      0.9951977398537465,
      -0.08715574274765818,
    );
    const up = new C.Cartesian3(
      -0.0038982410664529445,
      0.0870685202038245,
      0.9961946980917455,
    );
    const target = new C.Cartesian3(1494601.77, 6882284.68, 0);
    const expectedZoom = 12.049935656442358;
    const metersPerPixel = 40075016.68557849 / (512 * 2 ** expectedZoom);
    // Reproduce the reported heading, 5-degree pitch, and wide map scale.
    const range = metersPerPixel * scene.canvas.clientHeight * 1.5;
    if (camera.frustum.width !== undefined) {
      camera.frustum.width = metersPerPixel * scene.canvas.clientWidth;
    }
    camera.setView({
      destination: C.Cartesian3.subtract(
        target,
        C.Cartesian3.multiplyByScalar(direction, range, new C.Cartesian3()),
        new C.Cartesian3(),
      ),
      orientation: { direction, up },
    });
    scene.requestRender();
    return {
      expectedZoom,
      perspective: camera.frustum instanceof C.PerspectiveFrustum,
    };
  });
  await ready(page);
  await page.waitForFunction(
    (zoom) =>
      Math.abs(window.publicVectorPreview.layer.statistics.zoom - zoom) <
        1e-7 && window.publicVectorPreview.layer.tilesLoaded,
    result.expectedZoom,
  );
  expect(result.perspective).toBe(true);
  const cover = await page.evaluate(() => {
    const tiles = [...window.publicVectorPreview.layer._sources.values()][0]
      .visible;
    return { count: tiles.length, levels: tiles.map((tile) => tile.level) };
  });
  expect(cover.count).toBeLessThanOrEqual(64);
  expect(Math.max(...cover.levels)).toBeGreaterThanOrEqual(12);
  expect(Math.min(...cover.levels)).toBeLessThan(10);
  const symbols = await page.evaluate(() => {
    const { viewer, layer } = window.publicVectorPreview;
    const camera = viewer.scene.camera;
    const referenceDepth = -camera.positionWC.z / camera.directionWC.z;
    const placed = layer._symbols._previous.filter(
      (candidate) => candidate.placed,
    );
    return {
      count: placed.length,
      maximumDepth: Math.max(
        ...placed.map(
          (candidate) =>
            -camera.worldToCameraCoordinatesPoint(candidate.position).z /
            referenceDepth,
        ),
      ),
    };
  });
  expect(symbols.count).toBeGreaterThan(0);
  expect(symbols.maximumDepth).toBeLessThanOrEqual(4);
  const pixels = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const scene = window.publicVectorPreview.viewer.scene;
        const remove = scene.postRender.addEventListener(() => {
          remove();
          resolve(
            [0.6, 0.75, 0.9].map((fraction) =>
              Array.from(
                scene.context.readPixels({
                  x: Math.floor(scene.canvas.width * 0.5),
                  y: Math.floor(scene.canvas.height * (1 - fraction)),
                  width: 1,
                  height: 1,
                }),
              ),
            ),
          );
        });
        scene.requestRender();
      }),
  );
  for (const pixel of pixels) {
    expect(Math.max(...pixel.slice(0, 3))).toBeGreaterThan(100);
  }
  await page.screenshot({
    path: testInfo.outputPath("public-fixture-shallow.png"),
  });
  await expect(page.locator("#error")).toBeEmpty();
});

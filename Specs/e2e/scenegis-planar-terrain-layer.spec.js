import { test, expect } from "./test.js";

test.describe.configure({ retries: 0 });
test.use({ launchOptions: { args: [] } });

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "localhost" || url.protocol === "data:"
      ? route.continue()
      : route.abort();
  });
});

test("loads TileWorker planar terrain metadata, real payloads and stable rendered resources", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  const failedTiles = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("response", (response) => {
    if (
      response.url().includes("/terrain-layer/") &&
      response.status() >= 400
    ) {
      failedTiles.push(response.url());
    }
  });
  const results = [];
  for (const format of ["heightmap", "mesh"]) {
    await page.goto(`/Test/Planar/地形服务.html?format=${format}`);
    await page.waitForFunction(
      () =>
        window.example?.world.tilesLoaded ||
        document.getElementById("error").textContent.length > 0,
    );
    await expect(page.locator("#error")).toHaveText("");
    const result = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const { viewer, world, terrain } = window.example;
      const samples = await C.SceneGISPlanarTerrainSampler.sampleAtLevel(
        terrain,
        1,
        [
          new C.Cartesian3(-50, 50, 0),
          new C.Cartesian3(50, -50, 0),
          new C.Cartesian3(0, 0, 0),
        ],
      );
      const runtime = world._surface._terrain;
      const resident = world._surface._quadtree._renderTiles.filter(
        (tile) => tile.terrainEntry?.activeContent?.source === "DIRECT",
      );
      const before = { ...runtime._debug };
      viewer.useDefaultRenderLoop = false;
      for (let frame = 0; frame < 12; frame++) {
        viewer.render();
      }
      const warm = { ...runtime._debug };
      const height = world.getTerrainHeight(C.Cartesian3.ZERO);
      const pick = world.pickTerrain(
        new C.Ray(new C.Cartesian3(0, 0, 100), new C.Cartesian3(0, 0, -1)),
      );
      const gl = viewer.scene.context._gl;
      const pixel = new Uint8Array(4);
      gl.readPixels(
        Math.floor(viewer.scene.drawingBufferWidth / 2),
        Math.floor(viewer.scene.drawingBufferHeight / 2),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel,
      );
      world.terrainProvider = undefined;
      viewer.render();
      const detached = world._surface._terrain === undefined;
      const destroyed = { ...runtime._debug };
      world.terrainProvider = terrain;
      viewer.useDefaultRenderLoop = true;
      return {
        samples,
        height,
        pickZ: pick?.z,
        residentCount: resident.length,
        pixel: Array.from(pixel),
        before,
        warm,
        destroyed,
        detached,
        sameScheme: terrain.tilingScheme === world.tilingScheme,
        format: terrain.format,
      };
    });
    expect(result.sameScheme).toBe(true);
    expect(result.format).toBe(
      format === "mesh"
        ? "scenegis-planar-quantized-mesh-v2"
        : "scenegis-planar-heightmap-rgb24-v2",
    );
    expect(result.samples.length).toBe(3);
    expect(result.samples.every(Number.isFinite)).toBe(true);
    expect(Number.isFinite(result.height)).toBe(true);
    expect(result.pickZ).toBeCloseTo(result.height, 3);
    expect(result.residentCount).toBeGreaterThan(0);
    expect(result.pixel.slice(0, 3).some((value) => value > 0)).toBe(true);
    expect(result.warm).toEqual(result.before);
    expect(result.detached).toBe(true);
    expect(result.destroyed.destroyedVertexArrays).toBe(
      result.destroyed.createdVertexArrays,
    );
    await page.waitForFunction(() => window.example.world.tilesLoaded);
    await page.evaluate(() => window.example.destroy());
    results.push(result);
  }
  for (let i = 0; i < 3; i++) {
    expect(
      Math.abs(results[0].samples[i] - results[1].samples[i]),
    ).toBeLessThanOrEqual(0.21);
  }
  expect(errors).toEqual([]);
  expect(failedTiles).toEqual([]);
});

test("loads northern-only TileWorker layers with Cesium-compatible TMS availability and URLs", async ({
  page,
}) => {
  const terrainRequests = [];
  const failedTiles = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.includes("north-mesh/") &&
      url.pathname.endsWith(".terrain")
    ) {
      terrainRequests.push(url.pathname);
    }
  });
  page.on("response", (response) => {
    if (response.url().includes("north-mesh/") && response.status() >= 400) {
      failedTiles.push(response.url());
    }
  });
  await page.goto("/Test/Planar/地形服务.html?format=mesh");
  await page.waitForFunction(() => window.example?.world.tilesLoaded);
  const results = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const result = [];
    for (const { directory, globe } of [
      { directory: "north-mesh", globe: false },
      { directory: "globe-north-mesh", globe: true },
      { directory: "geographic-north-mesh", globe: true },
    ]) {
      const Provider = globe
        ? C.CesiumTerrainProvider
        : C.SceneGISPlanarLayerTerrainProvider;
      const provider = await Provider.fromUrl(
        `/Test/Planar/data/terrain-layer/${directory}/`,
      );
      const width = provider.tilingScheme.getNumberOfXTilesAtLevel(1);
      const north = [];
      const south = [];
      for (let x = 0; x < width; x++) {
        north.push(provider.getTileDataAvailable(x, 0, 1));
        south.push(provider.getTileDataAvailable(x, 1, 1));
      }
      const x = north.indexOf(true);
      if (x < 0) {
        throw new Error(`${directory} must cover the northern row.`);
      }
      const data = await provider.requestTileGeometry(x, 0, 1);
      let height;
      if (globe) {
        const rectangle = provider.tilingScheme.tileXYToRectangle(x, 0, 1);
        const center = C.Rectangle.center(rectangle);
        height = data.interpolateHeight(
          rectangle,
          center.longitude,
          center.latitude,
        );
      } else {
        const extent = provider.tilingScheme.tileXYToExtent(x, 0, 1);
        height = data.interpolateHeight(
          extent,
          (extent.minimumX + extent.maximumX) * 0.5,
          (extent.minimumY + extent.maximumY) * 0.5,
        );
      }
      result.push({ directory, north, south, x, height });
    }
    return result;
  });
  for (const result of results) {
    expect(result.north.some(Boolean)).toBe(true);
    expect(result.south.every((available) => available === false)).toBe(true);
    expect(Number.isFinite(result.height)).toBe(true);
    expect(terrainRequests).toContain(
      `/Test/Planar/data/terrain-layer/${result.directory}/1/1/${result.x}.terrain`,
    );
  }
  expect(failedTiles).toEqual([]);
  await page.evaluate(() => window.example.destroy());
});

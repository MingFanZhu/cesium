import { test, expect } from "./test.js";

test.describe.configure({ retries: 0 });
test.use({ launchOptions: { args: [] } });

for (const format of ["heightmap", "mesh"]) {
  test(`clips planar ${format} terrain through Cesium collection APIs`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        format === "mesh" &&
        url.pathname === "/Build/CesiumUnminified/index.js"
      ) {
        url.pathname = "/Build/Cesium/index.js";
        return route.continue({ url: url.toString() });
      }
      return url.hostname === "localhost" || url.protocol === "data:"
        ? route.continue()
        : route.abort();
    });
    await page.goto(`/Test/Planar/地形剖切.html?format=${format}`);
    await page.waitForFunction(
      () =>
        window.example?.world.tilesLoaded ||
        document.getElementById("error").textContent.length > 0,
    );
    await expect(page.locator("#error")).toHaveText("");
    const result = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const { viewer, world, terrain, clippingPlanes, clippingPolygons } =
        window.example;
      viewer.useDefaultRenderLoop = false;
      viewer.camera.setView({
        destination: new C.Cartesian3(0, 0, 320),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
      viewer.render();
      const ray = (x, y) =>
        new C.Ray(new C.Cartesian3(x, y, 100), new C.Cartesian3(0, 0, -1));
      const sample = (x, y) =>
        world.getTerrainHeight(new C.Cartesian3(x, y, 0));
      const depth = (x, y) => {
        const p = C.SceneTransforms.worldToWindowCoordinates(
          viewer.scene,
          new C.Cartesian3(x, y, sample(x, y)),
        );
        return viewer.scene.pickPosition(p)?.z;
      };
      const plane = {
        removed: world.pickTerrain(ray(-50, 0)) === undefined,
        visible: world.pickTerrain(ray(50, 0))?.z,
        removedDepth: depth(-50, 0),
        visibleDepth: depth(50, 0),
        source: sample(-50, 0),
      };
      clippingPlanes.enabled = false;
      const polygon = clippingPolygons.add(
        new C.ClippingPolygon({
          positions: [
            new C.Cartesian3(-30, -30, 0),
            new C.Cartesian3(30, -30, 0),
            new C.Cartesian3(30, 30, 0),
            new C.Cartesian3(-30, 30, 0),
          ],
        }),
      );
      viewer.render();
      const inside = {
        removed: world.pickTerrain(ray(0, 0)) === undefined,
        outside: world.pickTerrain(ray(60, 0))?.z,
        removedDepth: depth(0, 0),
      };
      clippingPolygons.inverse = true;
      viewer.render();
      const inverse = {
        inside: world.pickTerrain(ray(0, 0))?.z,
        outsideRemoved: world.pickTerrain(ray(60, 0)) === undefined,
      };
      const runtime = world._surface._clipping;
      const before = { ...runtime._debug };
      const surfaceBefore = { ...world._surface._debug };
      const terrainBefore = { ...world._surface._terrain._debug };
      const shader = world._surface._shaderProgram;
      const timings = [];
      for (let i = 0; i < 12; ++i) {
        const start = performance.now();
        viewer.render();
        timings.push(performance.now() - start);
      }
      const stable =
        JSON.stringify(runtime._debug) === JSON.stringify(before) &&
        world._surface._debug.createdShaders === surfaceBefore.createdShaders &&
        world._surface._debug.createdCommands ===
          surfaceBefore.createdCommands &&
        JSON.stringify(world._surface._terrain._debug) ===
          JSON.stringify(terrainBefore);
      clippingPolygons.inverse = false;
      for (const p of polygon.positions) {
        p.x += 50;
      }
      viewer.render();
      const moved =
        world.pickTerrain(ray(0, 0)) !== undefined &&
        world.pickTerrain(ray(50, 0)) === undefined;
      const sameShader = shader === world._surface._shaderProgram;
      const independent = await C.SceneGISPlanarTerrainSampler.sampleAtLevel(
        terrain,
        1,
        [new C.Cartesian3(50, 0, 0)],
      );
      const texture = runtime.texture;
      window.clippingVerification = { runtime, texture };
      return {
        plane,
        inside,
        inverse,
        stable,
        moved,
        sameShader,
        independent,
        timings,
        actualNativeTypes:
          clippingPlanes instanceof C.ClippingPlaneCollection &&
          clippingPolygons instanceof C.ClippingPolygonCollection &&
          polygon instanceof C.ClippingPolygon,
      };
    });
    expect(result.actualNativeTypes).toBe(true);
    expect(result.plane.removed).toBe(true);
    expect(result.plane.removedDepth).toBeUndefined();
    expect(Number.isFinite(result.plane.source)).toBe(true);
    expect(Number.isFinite(result.plane.visible)).toBe(true);
    expect(result.plane.visibleDepth).toBeCloseTo(result.plane.visible, 1);
    expect(result.inside.removed).toBe(true);
    expect(result.inside.removedDepth).toBeUndefined();
    expect(Number.isFinite(result.inside.outside)).toBe(true);
    expect(Number.isFinite(result.inverse.inside)).toBe(true);
    expect(result.inverse.outsideRemoved).toBe(true);
    expect(result.stable).toBe(true);
    expect(result.moved).toBe(true);
    expect(result.sameShader).toBe(true);
    expect(Number.isFinite(result.independent[0])).toBe(true);
    await page
      .locator(".lil-gui select")
      .nth(1)
      .selectOption({ label: "关闭" });
    await page
      .locator(".lil-gui select")
      .nth(2)
      .selectOption({ label: "凹多边形" });
    await page.evaluate(() => window.example.viewer.render());
    await page.screenshot({
      path: `Build/Specs/e2e/terrain-clipping-${format}.png`,
    });
    const released = await page.evaluate(() => {
      const { runtime, texture } = window.clippingVerification;
      window.example.destroy();
      return (
        texture.isDestroyed() &&
        runtime._debug.createdTextures === runtime._debug.destroyedTextures
      );
    });
    expect(released).toBe(true);
    expect(errors).toEqual([]);
    console.log(
      `planar ${format} warm render timings (ms): ${result.timings.join(", ")}`,
    );
  });
}

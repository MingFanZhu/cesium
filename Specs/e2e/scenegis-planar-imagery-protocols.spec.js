import { test, expect } from "./test.js";

test.describe.configure({ retries: 0 });
test.use({ launchOptions: { args: [] } });

for (const build of ["dev", "release"]) {
  test(`loads generic planar imagery protocols in ${build}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    page.on("request", (request) => {
      if (request.url().includes("/data/imagery-service/")) {
        requests.push(request.url());
      }
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        build === "release" &&
        url.pathname === "/Build/CesiumUnminified/index.js"
      ) {
        url.pathname = "/Build/Cesium/index.js";
        return route.continue({ url: url.toString() });
      }
      return url.hostname === "localhost" || url.protocol === "data:"
        ? route.continue()
        : route.abort();
    });
    await page.goto("/Test/Planar/影像服务.html");
    await page.waitForFunction(() => window.example?.world.tilesLoaded);
    await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      window.example.viewer.camera.setView({
        destination: new C.Cartesian3(0, 0, 32000),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
    });
    const modes = [
      ["xyz", "URL 模板 / XYZ"],
      ["tms", "TMS / 元数据"],
      ["wms", "WMS / 地图请求"],
      ["wmtsKvp", "WMTS / KVP"],
      ["wmtsRest", "WMTS / REST"],
      ["single", "单幅影像 / 自动尺寸"],
    ];
    for (const [source, label] of modes) {
      await page.locator(".lil-gui select").selectOption({ label });
      await page.waitForFunction((name) => {
        const { world, providers } = window.example;
        return (
          world.imageryLayers.length === 1 &&
          world.imageryLayers.get(0).imageryProvider === providers[name] &&
          world.tilesLoaded
        );
      }, source);
      await expect(page.locator("#error")).toHaveText("");
      const result = await page.evaluate(async () => {
        const C = await import("/Build/CesiumUnminified/index.js");
        const { viewer, world } = window.example;
        viewer.render();
        const pixels = [
          [-7000, 7000],
          [7000, 7000],
          [-7000, -7000],
          [7000, -7000],
        ].map(([x, y]) => {
          const p = C.SceneTransforms.worldToWindowCoordinates(
            viewer.scene,
            new C.Cartesian3(x, y, 0),
          );
          const canvas = viewer.scene.canvas;
          return Array.from(
            viewer.scene.context.readPixels({
              x: Math.floor((p.x * canvas.width) / canvas.clientWidth),
              y:
                canvas.height -
                1 -
                Math.floor((p.y * canvas.height) / canvas.clientHeight),
              width: 1,
              height: 1,
            }),
          );
        });
        const provider = world.imageryLayers.get(0).imageryProvider;
        return {
          pixels,
          sameScheme: provider.tilingScheme === world.tilingScheme,
          width: provider.tileWidth,
          height: provider.tileHeight,
        };
      });
      expect(result.sameScheme).toBe(true);
      const expected = [
        [131, 189, 176, 255],
        [232, 189, 120, 255],
        [132, 175, 206, 255],
        [206, 154, 145, 255],
      ];
      for (let i = 0; i < 4; ++i) {
        for (let j = 0; j < 4; ++j) {
          expect(
            Math.abs(result.pixels[i][j] - expected[i][j]),
            `${source} pixel ${i}/${j}`,
          ).toBeLessThanOrEqual(2);
        }
      }
      expect([result.width, result.height]).toEqual(
        source === "single" ? [512, 256] : [256, 256],
      );
      if (source === "wmtsKvp") {
        await page.evaluate(() => {
          const { viewer, providers } = window.example;
          viewer.scene.requestRenderMode = true;
          viewer.scene.maximumRenderTimeChange = Infinity;
          providers.wmtsKvp.dimensions = { Time: "updated" };
        });
        await page.waitForFunction(() => window.example.world.tilesLoaded);
        expect(requests.some((url) => url.includes("Time=updated"))).toBe(true);
        await page.evaluate(() => {
          window.example.viewer.scene.requestRenderMode = false;
        });
      }
    }
    expect(requests.some((url) => url.includes("tilemapresource.xml"))).toBe(
      true,
    );
    const map = new URL(requests.find((url) => url.includes("request=GetMap")));
    expect(map.searchParams.get("crs")).toBe("LOCAL:IMAGERY");
    expect(map.searchParams.get("bbox")).toBe("-10000,-10000,10000,10000");
    const wmts = new URL(
      requests.find((url) => url.includes("request=GetTile")),
    );
    expect(wmts.searchParams.get("tilematrixset")).toBe("LOCAL:IMAGERY");
    expect(wmts.searchParams.get("Time")).toBe("current");
    await page.screenshot({
      path: `Build/Specs/e2e/planar-imagery-${build}.png`,
    });
    const lifecycle = await page.evaluate(() => {
      const { viewer, world, destroy } = window.example;
      viewer.useDefaultRenderLoop = false;
      const debug = world._surface._imagery._debug;
      const before = { ...debug };
      const timings = [];
      for (let i = 0; i < 12; ++i) {
        const start = performance.now();
        viewer.render();
        timings.push(performance.now() - start);
      }
      const stable = JSON.stringify(before) === JSON.stringify(debug);
      destroy();
      return {
        stable,
        balanced: debug.createdTextures === debug.destroyedTextures,
        timings,
      };
    });
    expect(lifecycle.stable).toBe(true);
    expect(lifecycle.balanced).toBe(true);
    expect(errors).toEqual([]);
    console.log(
      `${build} imagery warm frames: ${lifecycle.timings.join(", ")} ms`,
    );
  });
}

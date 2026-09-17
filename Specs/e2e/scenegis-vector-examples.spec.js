import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

const fixtures = new URL("../../Test/vector-tiles/", import.meta.url);

for (const world of ["planar", "globe"]) {
  const name = world === "planar" ? "平面地图" : "球面地图";
  test(`starts and releases the independent ${name} vector example`, async ({
    page,
  }) => {
    const errors = [],
      unexpected = [],
      requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => requests.push(request.url()));
    const [tile, font, spriteJson, spritePng] = await Promise.all(
      [
        "public-fixture.pbf",
        "symbol-assets/0-255.pbf",
        "line-symbol-assets/sprite.json",
        "line-symbol-assets/sprite.png",
      ].map((path) => readFile(new URL(path, fixtures))),
    );
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "localhost" || url.protocol === "data:") {
        return route.continue();
      }
      if (url.hostname === "tiles.openfreemap.org") {
        if (url.pathname === "/planet") {
          return route.fulfill({
            json: {
              tiles: ["https://tiles.openfreemap.org/test/{z}/{x}/{y}.pbf"],
              minzoom: 0,
              maxzoom: 14,
              attribution: "SceneGIS example test credit",
            },
          });
        }
        if (url.pathname.startsWith("/fonts/")) {
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
        if (url.pathname.startsWith("/test/")) {
          return route.fulfill({
            body: tile,
            contentType: "application/x-protobuf",
          });
        }
      }
      unexpected.push(url.href);
      return route.abort();
    });
    await page.goto(`/Test/vector-tiles/examples/${name}.html`);
    await page.waitForFunction(() => window.vectorExample?.layer?.tilesLoaded);
    await expect(page.locator("#error")).toBeEmpty();
    const state = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const { viewer, layer } = window.vectorExample;
      const scene = viewer.scene;
      const pick = scene.pick(
        new C.Cartesian2(
          scene.canvas.clientWidth / 2,
          scene.canvas.clientHeight / 2,
        ),
      );
      return {
        planar: !!viewer.planarWorld,
        globe: scene.world instanceof C.Globe,
        stats: layer.statistics,
        pick: pick?.id?.source,
        fps: scene.debugShowFramesPerSecond,
      };
    });
    expect(state.planar).toBe(world === "planar");
    expect(state.globe).toBe(world === "globe");
    expect(state.stats.renderedTiles).toBeGreaterThan(0);
    expect(state.stats.drawCommands).toBeGreaterThan(0);
    expect(state.pick).toBe("openmaptiles");
    expect(state.fps).toBe(true);
    expect(state.stats.failedTiles + state.stats.symbolFailures).toBe(0);
    await expect(page.locator("#controls .lil-gui")).toHaveCount(1);
    const opacity = page.getByRole("textbox", { name: "矢量不透明度" });
    await expect(opacity).toHaveValue("1");
    for (const value of [0.5, 0, 1]) {
      await opacity.fill(String(value));
      await opacity.press("Enter");
      await page.waitForFunction(
        (value) => window.vectorExample.layer.opacity === value,
        value,
      );
      const pickedSource = await page.evaluate(async () => {
        const C = await import("/Build/CesiumUnminified/index.js");
        const scene = window.vectorExample.viewer.scene;
        return scene.pick(
          new C.Cartesian2(
            scene.canvas.clientWidth / 2,
            scene.canvas.clientHeight / 2,
          ),
        )?.id?.source;
      });
      expect(pickedSource).toBe(value === 0 ? undefined : "openmaptiles");
    }
    expect(requests.some((url) => url.endsWith("/environment.js"))).toBe(false);
    expect(unexpected).toEqual([]);
    await expect(
      page.getByText("SceneGIS example test credit", { exact: true }),
    ).toHaveCount(1);
    const lifetime = await page.evaluate(() => {
      const { viewer, layer } = window.vectorExample;
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      const cached =
        !viewer.isDestroyed() &&
        !layer.isDestroyed() &&
        document.querySelectorAll("#controls .lil-gui").length === 1;
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: false }),
      );
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: false }),
      );
      return {
        cached,
        destroyed: viewer.isDestroyed() && layer.isDestroyed(),
        canvases: document.querySelectorAll("canvas").length,
        guis: document.querySelectorAll("#controls .lil-gui").length,
      };
    });
    expect(lifetime).toEqual({
      cached: true,
      destroyed: true,
      canvases: 0,
      guis: 0,
    });
    expect(errors).toEqual([]);
  });
}

test("shows a public catalog failure and keeps the offline test accessible", async ({
  page,
}) => {
  await page.route("https://tiles.openfreemap.org/planet", (route) =>
    route.fulfill({ status: 503, body: "Service unavailable" }),
  );
  await page.goto("/Test/vector-tiles/examples/球面地图.html");
  await expect(page.locator("#error")).toContainText("503");
  expect(await page.evaluate(() => window.vectorExample.layer)).toBeUndefined();
  await expect(page.locator("#controls .lil-gui")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "离线测试" })).toHaveAttribute(
    "href",
    "../globe-map.html?provider=local",
  );
});

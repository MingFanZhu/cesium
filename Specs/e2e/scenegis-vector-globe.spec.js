import { test, expect } from "@playwright/test";

test("renders an offline Globe with native terrain, symbols, bounded cover and cleanup", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors = [],
    external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.protocol === "data:") {
      return route.continue();
    }
    external.push(url.origin);
    return route.abort();
  });
  await page.goto("/Test/vector-tiles/globe.html");
  const ready = () =>
    page.waitForFunction(() => {
      const p = window.publicVectorPreview;
      return p?.layer?.tilesLoaded && p.viewer.scene.globe.tilesLoaded;
    });
  await ready();
  await expect(page.locator("#error")).toBeEmpty();
  await page.evaluate(() => {
    window.globeIdentity = window.publicVectorPreview.viewer.scene.globe;
    window.globeWorkers = window.publicVectorPreview.layer._workers;
  });
  await page.locator("#terrain").check();
  await page.locator("#tilt").click();
  await ready();
  await page.waitForFunction(() =>
    window.publicVectorPreview.layer._terrain.entries.some((e) => e.result),
  );
  const terrain = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const p = window.publicVectorPreview,
      g = p.viewer.scene.globe;
    return {
      same:
        g === window.globeIdentity && p.layer._workers === window.globeWorkers,
      indices: p.layer._terrain.entries.filter((e) => e.result).length,
      heights: p.layer._symbols._placed.map(
        (c) => g.ellipsoid.cartesianToCartographic(c.position).height,
      ),
      stats: p.layer.statistics,
      fps: p.viewer.scene.debugShowFramesPerSecond,
    };
  });
  expect(terrain.same && terrain.fps).toBe(true);
  expect(terrain.indices).toBeGreaterThan(0);
  expect(terrain.heights.some((h) => h > 300 && h < 900)).toBe(true);
  expect(terrain.stats.visibleTiles).toBeLessThanOrEqual(64);
  expect(terrain.stats.failedTiles).toBe(0);
  await expect(page.locator("#error")).toBeEmpty();
  await page.locator("#terrain").uncheck();
  await page.locator("#whole").click();
  await ready();
  const distant = await page.evaluate(() => ({
    stats: window.publicVectorPreview.layer.statistics,
    entries: window.publicVectorPreview.layer._terrain.entries.length,
  }));
  expect(distant.entries).toBe(0);
  expect(distant.stats.zoom).toBeLessThan(5);
  expect(distant.stats.visibleTiles).toBeLessThanOrEqual(64);
  await page.locator("#top").click();
  await ready();
  const released = await page.evaluate(() => {
    const p = window.publicVectorPreview,
      l = p.layer,
      w = l._workers;
    p.viewer.scene.primitives.remove(l);
    return l.isDestroyed() && w.destroyed && w.slots.length === 0;
  });
  expect(released).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

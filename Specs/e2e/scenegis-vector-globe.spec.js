import { test, expect } from "@playwright/test";

test("renders an offline Globe with native terrain, symbols, bounded cover and cleanup", async ({
  page,
}) => {
  // Includes six opacity changes, the 60-frame sample and the existing view/provider transitions.
  test.setTimeout(150000);
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
  await page.goto("/Test/vector-tiles/globe-map.html");
  const ready = () =>
    page.waitForFunction(() => {
      const p = window.publicVectorPreview;
      return p?.layer?.tilesLoaded && p.viewer.scene.globe.tilesLoaded;
    });
  await ready();
  await expect(page.locator("#error")).toBeEmpty();
  await expect(
    page.locator(
      "#environment-panel, .cesium-viewer-timelineContainer, .cesium-viewer-animationContainer",
    ),
  ).toHaveCount(0);
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
  // Exercise the controls on real terrain with the text/icon batches resident.
  await page.evaluate(() => {
    const p = window.publicVectorPreview;
    window.transparencySymbols = p.layer.statistics.placedSymbols;
  });
  const opacity = async (name, value) => {
    await page.locator(`#${name}-opacity`).evaluate((input, value) => {
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  };
  await opacity("surface", 0);
  await ready();
  const independent = await page.evaluate(() => {
    const p = window.publicVectorPreview,
      scene = p.viewer.scene;
    scene.render();
    const pixels = scene.context.readPixels();
    let colored = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 60) {
        colored++;
      }
    }
    return {
      colored,
      symbols: p.layer.statistics.placedSymbols,
      originalSymbols: window.transparencySymbols,
      sameWorkers: p.layer._workers === window.globeWorkers,
      opacity: p.layer.opacity,
      alpha: scene.globe.translucency.frontFaceAlpha,
    };
  });
  expect(independent.opacity).toBe(1);
  expect(independent.alpha).toBe(0);
  expect(independent.colored).toBeGreaterThan(10000);
  expect(independent.symbols).toBe(independent.originalSymbols);
  expect(independent.sameWorkers).toBe(true);
  await page
    .locator("#map")
    .screenshot({ path: "Build/Specs/vector-transparent-terrain.png" });
  await opacity("vector", 0.5);
  await opacity("surface", 0.5);
  await opacity("imagery", 1);
  await ready();
  await page
    .locator("#map")
    .screenshot({ path: "Build/Specs/vector-transparent-mixed.png" });
  await expect(page.locator("#error")).toBeEmpty();
  await page.locator("#measure").click();
  await page.waitForFunction(() => !!window.publicVectorPreview.measurement);
  console.log(
    "Transparent surface warm CPU",
    await page.evaluate(() => window.publicVectorPreview.measurement),
  );
  await opacity("vector", 1);
  await opacity("surface", 1);
  await opacity("imagery", 0);
  // Building styles start at zoom 14; qualify them separately from the wide label view.
  await page.locator("#detail").click();
  await ready();
  const buildings = await page.evaluate(() =>
    window.publicVectorPreview.layer._drawOrder
      .filter((b) => b._kind === "fill-extrusion")
      .map((b) => ({
        applied: b._extrusionState?.applied,
        failed: !!b._extrusionState?.failed,
      })),
  );
  expect(buildings.length).toBeGreaterThan(0);
  expect(buildings.every((b) => b.applied && !b.failed)).toBe(true);
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
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    );
    const cached = !p.viewer.isDestroyed() && !l.isDestroyed();
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: false }),
    );
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: false }),
    );
    return (
      cached &&
      p.viewer.isDestroyed() &&
      l.isDestroyed() &&
      w.destroyed &&
      w.slots.length === 0
    );
  });
  expect(released).toBe(true);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

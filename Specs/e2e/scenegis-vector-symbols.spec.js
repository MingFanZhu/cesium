import { test, expect } from "@playwright/test";

test.describe.configure({ retries: 0 });
test.use({
  viewport: { width: 1280, height: 900 },
  launchOptions: { args: [] },
});
async function ready(page) {
  await page.waitForFunction(() => window.symbolPreview?.layer?.tilesLoaded);
  await expect(page.locator("#error")).toBeEmpty();
}
test("renders local Chinese/Latin point labels, picks text/icons, and reuses placement through zoom and tilt", async ({
  page,
}, info) => {
  const errors = [],
    external = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.protocol === "data:") {
      return route.continue();
    }
    external.push(url.href);
    return route.abort();
  });
  await page.goto("/Test/vector-tiles/planar-symbols.html");
  await ready(page);
  expect(
    await page.evaluate(
      () => window.symbolPreview.layer.statistics.placedSymbols,
    ),
  ).toBe(6);
  const picks = await page.evaluate(() => {
    const { viewer, layer } = window.symbolPreview;
    const result = [];
    // Probe actual text alpha pixels; no DOM text is used as map-label evidence.
    for (const c of layer._symbols._previous.filter(
      (c) => c.identity.featureId !== "6",
    )) {
      let identity;
      for (const q of c.shaped.text.quads) {
        for (let x = q.box[0]; x < q.box[2] && !identity; x += 2) {
          for (let y = q.box[1]; y < q.box[3] && !identity; y += 2) {
            const p = viewer.scene.pick(
              { x: c.screen.x + x, y: c.screen.y + y },
              1,
              1,
            );
            if (p?.primitive === layer) {
              identity = p.id.featureId;
            }
          }
        }
        if (identity) {
          break;
        }
      }
      result.push(identity);
    }
    const poi = layer._symbols._previous.find(
      (c) => c.identity.featureId === "3",
    );
    result.push(viewer.scene.pick(poi.screen, 1, 1)?.id.featureId);
    return result.sort();
  });
  expect(picks).toEqual(["1", "2", "3", "3", "4", "5", "7"]);
  await page.screenshot({ path: info.outputPath("symbols-top.png") });
  const baseline = await page.evaluate(() => {
    const layer = window.symbolPreview.layer;
    window.symbolOldResources = {
      layer,
      pages: [...layer._symbols.assets.pages.values()],
      groups: [...layer._symbols._groups.values()].map(
        (b) => b.resources.vertexArray,
      ),
    };
    return layer._symbols._previous.find((c) =>
      c.text.startsWith("北京 Beijing"),
    ).shaped.text.box;
  });
  const oldZoom = await page.evaluate(
    () => window.symbolPreview.layer.statistics.zoom,
  );
  await page.getByRole("button", { name: "连续缩放" }).click();
  await page.waitForFunction(
    (zoom) => window.symbolPreview.layer.statistics.zoom > zoom,
    oldZoom,
  );
  await ready(page);
  const zoomed = await page.evaluate(
    () =>
      window.symbolPreview.layer._symbols._previous.find((c) =>
        c.text.startsWith("北京 Beijing"),
      ).shaped.text.box,
  );
  expect(zoomed[2] - zoomed[0]).toBeGreaterThan(baseline[2] - baseline[0]);
  await page.getByRole("button", { name: "倾斜", exact: true }).click();
  await ready(page);
  await page.screenshot({ path: info.outputPath("symbols-tilted.png") });
  await page.getByRole("button", { name: "重建图层" }).click();
  await ready(page);
  expect(
    await page.evaluate(
      () =>
        window.symbolOldResources.layer.isDestroyed() &&
        window.symbolOldResources.pages.every(
          (p) => !p.texture || p.texture.isDestroyed(),
        ) &&
        window.symbolOldResources.groups.every((va) => va.isDestroyed()),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("keeps text layout in CSS pixels at double rendering resolution", async ({
  page,
}, info) => {
  await page.goto("/Test/vector-tiles/planar-symbols.html");
  await ready(page);
  const box = await page.evaluate(() => {
    const { viewer, layer } = window.symbolPreview;
    const before = layer._symbols._previous[0].shaped.text.box;
    viewer.resolutionScale = 2;
    viewer.scene.requestRender();
    return before;
  });
  await page.waitForFunction(
    () => window.symbolPreview.viewer.scene.pixelRatio === 2,
  );
  await ready(page);
  expect(
    await page.evaluate(
      () => window.symbolPreview.layer._symbols._previous[0].shaped.text.box,
    ),
  ).toEqual(box);
  await page.screenshot({ path: info.outputPath("symbols-resolution-2.png") });
});

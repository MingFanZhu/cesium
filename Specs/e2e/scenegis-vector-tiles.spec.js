import { test, expect } from "@playwright/test";

test.describe.configure({ retries: 0 });
test.use({
  viewport: { width: 1280, height: 800 },
  launchOptions: { args: [] },
});

test("renders local MVT with request-render mode, picking and layer recreation", async ({
  page,
}, testInfo) => {
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.protocol === "data:") {
      return route.continue();
    }
    external.push(url.origin);
    return route.abort();
  });
  await page.goto("/Test/vector-tiles/index.html");
  await page.waitForFunction(
    () =>
      window.vectorTilePreview?.layer.ready &&
      window.vectorTilePreview.layer.tilesLoaded,
  );
  await expect(page.locator("#error")).toBeEmpty();
  const initial = await page.evaluate(
    () => window.vectorTilePreview.layer.statistics,
  );
  expect(initial.failedTiles).toBe(0);
  expect(initial.visibleTiles).toBeGreaterThan(0);
  expect(initial.drawCommands).toBeLessThan(100);
  const centerColor = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const scene = window.vectorTilePreview.viewer.scene;
    return new Promise((resolve) => {
      const remove = scene.postRender.addEventListener(() => {
        remove();
        const point = C.SceneTransforms.worldToWindowCoordinates(
          scene,
          new C.Cartesian3(0, 0, 0),
        );
        resolve(
          Array.from(
            scene.context.readPixels({
              x: Math.floor(point.x),
              y: scene.drawingBufferHeight - 1 - Math.floor(point.y),
              width: 1,
              height: 1,
            }),
          ),
        );
      });
      scene.requestRender();
    });
  });
  expect(centerColor[0]).toBeLessThan(100);
  expect(centerColor[1]).toBeGreaterThan(100);
  expect(centerColor[2]).toBeGreaterThan(100);
  await page.screenshot({ path: testInfo.outputPath("overview.png") });
  const point = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    return C.SceneTransforms.worldToWindowCoordinates(
      window.vectorTilePreview.viewer.scene,
      new C.Cartesian3(0, 0, 0),
    );
  });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator("#picked")).toContainText("中央广场");
  await page.getByRole("button", { name: "中央街区" }).click();
  await page.waitForFunction(
    () =>
      window.vectorTilePreview.layer.tilesLoaded &&
      window.vectorTilePreview.layer.statistics.zoom > 2,
  );
  await page.getByRole("button", { name: "测量 60 帧" }).click();
  await page.waitForFunction(
    () => window.vectorTilePreview.measurement !== undefined,
  );
  console.log(
    "Vector tile warm CPU:",
    await page.evaluate(() => window.vectorTilePreview.measurement),
  );
  await testInfo.attach("warm-cpu-submission", {
    body: JSON.stringify(
      await page.evaluate(() => window.vectorTilePreview.measurement),
      null,
      2,
    ),
    contentType: "application/json",
  });
  await page.getByRole("button", { name: "倾斜视角" }).click();
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const scene = window.vectorTilePreview.viewer.scene;
        const remove = scene.postRender.addEventListener(() => {
          remove();
          resolve();
        });
        scene.requestRender();
      }),
  );
  await page.waitForFunction(() => window.vectorTilePreview.layer.tilesLoaded);
  await page.screenshot({ path: testInfo.outputPath("tilted.png") });
  await page.getByRole("button", { name: "隐藏矢量" }).click();
  await page.waitForFunction(
    () => window.vectorTilePreview.layer.statistics.drawCommands === 0,
  );
  await page.getByRole("button", { name: "显示矢量" }).click();
  await page.waitForFunction(
    () => window.vectorTilePreview.layer.statistics.drawCommands > 0,
  );
  await page.evaluate(() => {
    window.previousVectorLayer = window.vectorTilePreview.layer;
  });
  await page.getByRole("button", { name: "移除并重建" }).click();
  await page.waitForFunction(
    () =>
      window.vectorTilePreview.layer.ready &&
      window.vectorTilePreview.layer.tilesLoaded,
  );
  expect(
    await page.evaluate(() => window.previousVectorLayer.isDestroyed()),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => window.vectorTilePreview.layer.statistics.failedTiles,
    ),
  ).toBe(0);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await expect(page.locator("#error")).toBeEmpty();
});

test("keeps the city visible while delayed child tiles replace a resident ancestor", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/Test/vector-tiles/index.html");
  await page.waitForFunction(() => window.vectorTilePreview?.layer.tilesLoaded);
  await page.getByRole("button", { name: "逐块加载演示" }).click();
  await page.waitForFunction(() => {
    const layer = window.vectorTilePreview.layer;
    return (
      !layer.tilesLoaded &&
      layer.statistics.fallbackTiles === 1 &&
      layer.statistics.visibleTiles === 4
    );
  });
  const intermediate = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const { viewer, layer } = window.vectorTilePreview;
    const position = C.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      new C.Cartesian3(0, 0, 0),
    );
    const pick = viewer.scene.pick(position);
    return { ...layer.statistics, id: pick?.id, point: position };
  });
  expect(intermediate.id.properties.name).toBe("中央广场");
  expect(intermediate.id.tile.level).toBe(0);
  expect(intermediate.drawCommands).toBeGreaterThan(0);
  await page.screenshot({
    path: testInfo.outputPath("ancestor-during-load.png"),
  });
  await page.waitForFunction(() => {
    const stats = window.vectorTilePreview.layer.statistics;
    return stats.fallbackTiles === 1 && stats.renderedTiles > 1;
  });
  await page.screenshot({
    path: testInfo.outputPath("partial-replacement.png"),
  });
  await page.waitForFunction(() => window.vectorTilePreview.layer.tilesLoaded);
  const final = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const { viewer, layer } = window.vectorTilePreview;
    const position = C.SceneTransforms.worldToWindowCoordinates(
      viewer.scene,
      new C.Cartesian3(0, 0, 0),
    );
    return { ...layer.statistics, id: viewer.scene.pick(position)?.id };
  });
  expect(final.fallbackTiles).toBe(0);
  expect(final.id.properties.name).toBe("中央广场");
  expect(final.id.tile.level).toBe(2);
  expect(final.failedTiles).toBe(0);
  expect(errors).toEqual([]);
  await expect(page.locator("#error")).toBeEmpty();
});

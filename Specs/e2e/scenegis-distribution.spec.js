import { test, expect } from "@playwright/test";

for (const [format, mount, base] of [
  ["iife", "root", "auto"],
  ["iife", "nested", "auto"],
  ["esm", "root", "auto"],
  ["esm", "nested", "auto"],
  ["esm", "nested", "new"],
  ["iife", "nested", "legacy"],
]) {
  test(`${format} ${mount} ${base}: Worlds, Worker, WASM and texture`, async ({
    page,
  }, info) => {
    const errors = [];
    const requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        errors.push(`${response.status()} ${response.url()}`);
      }
      requests.push(response.url());
    });
    await page.route(/^https?:\/\/(?!127\.0\.0\.1:8104)/, (route) =>
      route.abort(),
    );
    await page.goto(`/__case?format=${format}&mount=${mount}&base=${base}`);
    await page.waitForFunction(() => window.ready);
    const result = await page.evaluate(async () => {
      const C = window.engine;
      const processor = new C.TaskProcessor("decodeDraco");
      try {
        const loaded = await processor.initWebAssemblyModule({
          wasmBinaryFile: "ThirdParty/draco_decoder.wasm",
        });
        const array = new Uint8Array(
          await (await fetch("/__draco.bin")).arrayBuffer(),
        );
        const mesh = await processor.scheduleTask({
          array,
          bufferView: { byteLength: array.byteLength },
          compressedAttributes: { POSITION: 0 },
        });
        const image = await C.Resource.fetchImage({
          url: C.buildModuleUrl("Assets/Textures/waterNormals.jpg"),
        });
        const imageWidth = image.width;
        image.close?.();
        const released = [];
        for (const world of ["globe", "planar"]) {
          const options = {
            baseLayer: false,
            baseLayerPicker: false,
            geocoder: false,
            sceneModePicker: false,
            navigationHelpButton: false,
            animation: false,
            timeline: false,
            fullscreenButton: false,
            homeButton: false,
            infoBox: false,
            selectionIndicator: false,
            useDefaultRenderLoop: false,
          };
          if (world === "planar") {
            delete options.baseLayer;
            options.planarWorld = {
              extent: {
                minimumX: -1000,
                minimumY: -1000,
                maximumX: 1000,
                maximumY: 1000,
              },
              crs: "LOCAL",
              maximumLevel: 4,
            };
          }
          const viewer = new C.Viewer("view", options);
          window.lastViewer = viewer;
          const worldObject = viewer.scene.world;
          if (world === "planar") {
            viewer.scene.camera.setView({
              destination: new C.Cartesian3(0, 0, 1000),
              orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
            });
          }
          viewer.resize();
          viewer.scene.initializeFrame();
          viewer.render();
          viewer.destroy();
          released.push(viewer.isDestroyed() && worldObject.isDestroyed());
        }
        return {
          base: C.buildModuleUrl("Assets/test"),
          loaded,
          triangles: mesh.indexArray.numberOfIndices,
          imageWidth,
          released,
          version: C.VERSION,
        };
      } catch (error) {
        throw new Error(`${String(error)}\n${error.message}\n${error.stack}`, {
          cause: error,
        });
      } finally {
        processor.destroy();
        window.processorReleased = processor.isDestroyed();
      }
    });
    expect(result.loaded).toBe(true);
    expect(result.triangles).toBeGreaterThan(0);
    expect(result.imageWidth).toBeGreaterThan(0);
    expect(result.released).toEqual([true, true]);
    expect(result.base).toContain(
      mount === "nested"
        ? "/deep/site/vendor/engine/Assets/test"
        : ":8104/Assets/test",
    );
    expect(await page.evaluate(() => window.processorReleased)).toBe(true);
    expect(requests.some((url) => url.endsWith("draco_decoder.wasm"))).toBe(
      true,
    );
    expect(errors).toEqual([]);
    await info.attach("runtime-results", {
      body: JSON.stringify({ ...result, requests }, null, 2),
      contentType: "application/json",
    });
  });
}

test("standalone nested documentation searches members and follows type links", async ({
  page,
  request,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:8104)/, (route) =>
    route.abort(),
  );
  const prefix = "/deep/site/vendor/engine/Documentation/";
  await page.goto(`${prefix}index.html`);
  await page
    .locator("#ClassFilter")
    .fill("SceneGISWindVisualization trailDuration");
  const result = page
    .locator("#SceneGISSearchResults a")
    .filter({ hasText: "trailDuration" });
  await expect(result).toHaveCount(1);
  await result.click();
  await expect(page).toHaveURL(
    /SceneGISWindVisualization\.html\?search=.*#trailDuration/,
  );
  await expect(page.locator('[id="trailDuration"]')).toBeVisible();
  await page.goto(`${prefix}Viewer.html`);
  await page.locator('#main a[href="Scene.html"]').first().click();
  await expect(page).toHaveURL(/\/Scene\.html$/);
  await expect(page.locator('[id="preRender"]')).toBeVisible();
  await info.attach("api-documentation", {
    body: await page.screenshot({
      path: info.outputPath("api-documentation.png"),
    }),
    contentType: "image/png",
  });
  const index = await (await request.get(`${prefix}api-index.json`)).json();
  expect(
    index.symbols.some(
      (symbol) => symbol.id === "SceneGISWindVisualization#trailDuration",
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("Chinese documentation searches prose and switches the same symbol between languages", async ({
  page,
}, info) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1:8104)/, (route) =>
    route.abort(),
  );
  const prefix = "/deep/site/vendor/engine/Documentation/";
  await page.goto(`${prefix}zh-CN/index.html`);
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
  await page.locator("#ClassFilter").fill("风场体渲染");
  const result = page
    .locator("#SceneGISSearchResults a")
    .filter({ hasText: "SceneGISWindVisualization" });
  await expect(result).toHaveCount(1);
  await result.click();
  await expect(page.locator("#main")).toContainText("独立标记长度，单位为米");
  await info.attach("chinese-api-documentation", {
    body: await page.screenshot({
      path: info.outputPath("chinese-api-documentation.png"),
    }),
    contentType: "image/png",
  });
  await page.goto(
    `${prefix}zh-CN/SceneGISWindVisualization.html#trailDuration`,
  );
  await page.locator("#DocLanguage").click();
  await expect(page).toHaveURL(
    /\/Documentation\/SceneGISWindVisualization\.html#trailDuration$/,
  );
  await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
  await expect(page.locator('[id="trailDuration"]')).toBeVisible();
  await page.locator("#DocLanguage").click();
  await expect(page).toHaveURL(
    /\/zh-CN\/SceneGISWindVisualization\.html#trailDuration$/,
  );
  await page.goto(`${prefix}zh-CN/Viewer.html`);
  await page.locator('#main a[href="Scene.html"]').first().click();
  await expect(page).toHaveURL(/\/zh-CN\/Scene\.html$/);
  await expect(page.locator("#main")).toContainText("三维图形对象与状态的容器");
  expect(errors).toEqual([]);
});

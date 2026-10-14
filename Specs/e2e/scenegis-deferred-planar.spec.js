import { test, expect } from "@playwright/test";

test("Planar terrain keeps opaque deferred lighting and reveals underground geometry through OIT", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟平面验收.html");
  const ready = () =>
    page.waitForFunction(() => window.example?.ready, undefined, {
      timeout: 60000,
    });
  await ready();
  await page.evaluate(() => {
    const e = window.example;
    e.viewer.useDefaultRenderLoop = false;
    e.viewer.scene.rethrowRenderErrors = true;
    e.taa.enabled = false;
    e.viewer.render();
  });
  const state = () =>
    page.evaluate(() => {
      const e = window.example;
      return {
        bound: e.deferred === e.viewer.scene._sceneGISDeferred,
        samples: e.viewer.scene.msaaSamples,
        draws: e.deferred.drawCount,
        lights: e.deferred.lightDrawCount,
        groups: e.deferred.groupCount,
        attachments: e.deferred._raw.framebuffer.numberOfColorAttachments,
        bytes: e.deferred.byteLength,
        errors: e.errors,
        gl: e.viewer.scene.context._gl.getError(),
      };
    });
  const initial = await state();
  expect(initial).toEqual({
    bound: true,
    samples: 1,
    draws: 4,
    lights: 2,
    groups: 2,
    attachments: 4,
    bytes: 1280 * 800 * 32,
    errors: [],
    gl: 0,
  });
  await page.screenshot({ path: testInfo.outputPath("planar-basic.png") });
  const change = async (id, value, event = "change") => {
    await page.evaluate(
      ({ id, value, event }) => {
        const input = document.getElementById(id);
        if (typeof value === "boolean") {
          input.checked = value;
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event(event));
        window.example.viewer.render();
      },
      { id, value, event },
    );
    await page.waitForFunction(
      () => {
        const e = window.example;
        e.viewer.render();
        return e.ready;
      },
      undefined,
      { timeout: 60000 },
    );
  };
  await change("azimuth", "45", "input");
  expect(await state()).toEqual(initial);
  await change("hdr", false);
  const undergroundPixel = () =>
    page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const scene = window.example.viewer.scene;
      const p = C.SceneTransforms.worldToWindowCoordinates(
        scene,
        new C.Cartesian3(0, -10, -2.5),
      );
      return Array.from(
        scene.context.readPixels({
          x: Math.floor(p.x),
          y: scene.drawingBufferHeight - 1 - Math.floor(p.y),
          width: 1,
          height: 1,
        }),
      ).slice(0, 3);
    });
  const covered = await undergroundPixel();
  await change("opacity", "0.5", "input");
  const revealed = await undergroundPixel();
  expect(revealed).not.toEqual(covered);
  await page.screenshot({
    path: testInfo.outputPath("planar-underground-half.png"),
  });
  await change("opacity", "0", "input");
  const uncovered = await undergroundPixel();
  expect(uncovered[0]).toBeGreaterThan(uncovered[2] + 50);
  expect(uncovered[1]).toBeGreaterThan(uncovered[2] + 50);
  await change("opacity", "0.5", "input");
  await change("clipping", true);
  await page.screenshot({
    path: testInfo.outputPath("planar-ldr-opacity-clipping.png"),
  });
  expect(await state()).toEqual({ ...initial, draws: 3, lights: 1, groups: 1 });
  await change("opacity", "1", "input");
  await change("clipping", false);
  await change("lighting", "physical");
  await page.screenshot({ path: testInfo.outputPath("planar-physical.png") });
  expect(await state()).toEqual(initial);
  await change("opacity", "0.5", "input");
  await page.screenshot({
    path: testInfo.outputPath("planar-physical-transparent.png"),
  });
  expect(await state()).toEqual({ ...initial, draws: 3, lights: 1, groups: 1 });
  await change("weather", "wet");
  await change("lighting", "unlit");
  await page.evaluate(() => {
    const e = window.example;
    e.viewer.scene.camera.moveRight(5);
    e.viewer.render();
  });
  await ready();
  const released = await page.evaluate(() => {
    const e = window.example;
    const raw = e.deferred._raw.getColorTexture();
    e.destroy();
    e.destroy();
    return {
      scene: e.viewer.isDestroyed(),
      material: raw.isDestroyed(),
      errors: e.errors,
    };
  });
  expect(released).toEqual({ scene: true, material: true, errors: [] });
  expect(errors).toEqual([]);
});

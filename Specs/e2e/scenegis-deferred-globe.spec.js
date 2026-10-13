import { test, expect } from "@playwright/test";

test("deferred Globe composes advanced environment, mixed surfaces and live controls", async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/Test/Rendering/延迟地球验收.html");
  await page.waitForFunction(() => window.example?.ready, undefined, {
    timeout: 45000,
  });
  await page.evaluate(() => {
    const e = window.example;
    e.viewer.useDefaultRenderLoop = false;
    e.viewer.scene.rethrowRenderErrors = true;
  });
  const ready = async () => {
    await page.waitForFunction(() => {
      const e = window.example;
      e.viewer.render();
      return e.ready;
    });
    expect(await page.evaluate(() => window.example.errors)).toEqual([]);
  };
  const change = async (id, value, event = "change") => {
    await page.evaluate(
      ([id, value, event]) => {
        const input = document.getElementById(id);
        if (typeof value === "boolean") {
          input.checked = value;
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event(event));
      },
      [id, value, event],
    );
    await ready();
  };
  expect(
    await page.evaluate(() => {
      const e = window.example;
      const s = e.viewer.scene;
      return {
        physical: e.effects.ready,
        nativeFog: s.fog.enabled,
        nativeAtmosphere: s.globe.showGroundAtmosphere,
        groups: e.deferred.groupCount,
      };
    }),
  ).toEqual({
    physical: true,
    nativeFog: false,
    nativeAtmosphere: false,
    groups: 3,
  });
  await change("imagery", "17");
  await change("fabric", true);
  await change("inverse", "translucent");
  await change("height-fog", true);
  await page.locator("#tiles-view").click();
  await ready();
  await change("ssr", true);
  await change("ssil", true);
  expect(
    await page.evaluate(() => {
      const e = window.example;
      return {
        attachments: e.deferred._framebuffer.numberOfColorAttachments,
        inverse: !!e.deferred.inverseClassification,
        shared: e.ssr.ready && e.ssil.ready && e.taa.ready,
        gl: e.viewer.scene.context._gl.getError(),
      };
    }),
  ).toEqual({ attachments: 7, inverse: true, shared: true, gl: 0 });
  await change("frustums", "2");
  const multi = await page.evaluate(() => {
    const e = window.example;
    return {
      frustums: e.viewer.scene._view.frustumCommandsList.length,
      layers: e.deferred._inverse._layers.length,
      attachments: e.deferred._framebuffer.numberOfColorAttachments,
      bytes: e.deferred._inverse.byteLength,
    };
  });
  expect(multi.frustums).toBeGreaterThan(1);
  expect(multi.layers).toBeGreaterThan(1);
  expect(multi.attachments).toBe(8);
  expect(multi.bytes).toBe(1280 * 800 * (60 + (multi.layers - 1) * 12));
  await page.screenshot({ path: testInfo.outputPath("globe-day.png") });
  await change("hour", "22", "input");
  await expect(page.locator("#time")).toHaveText("22:00");
  await page.screenshot({ path: testInfo.outputPath("globe-night.png") });
  await change("hour", "14", "input");
  await change("weather", "wet");
  await change("translucency", "front");
  await page.evaluate(() => window.example.viewer.scene.camera.moveRight(20));
  await ready();
  await change("translucency", "opaque");
  await change("environment", false);
  await expect(page.locator("#terrain-depth")).toBeEnabled();
  await change("terrain-depth", false);
  await change("environment", true);
  await expect(page.locator("#terrain-depth")).toBeChecked();
  await expect(page.locator("#terrain-depth")).toBeDisabled();
  await change("inverse", "off");
  expect(
    await page.evaluate(() => window.example.deferred.inverseClassification),
  ).toBeUndefined();
  await change("frustums", "default");
  expect(await page.evaluate(() => window.example.deferred._multiFrustum)).toBe(
    false,
  );
  await page.setViewportSize({ width: 960, height: 640 });
  await page.evaluate(() => window.example.viewer.resize());
  await ready();
  const released = await page.evaluate(() => {
    const e = window.example;
    const material = e.deferred._raw.getColorTexture();
    const environment = e.effects._pipeline;
    e.destroy();
    e.destroy();
    return (
      e.disposed &&
      e.viewer.isDestroyed() &&
      material.isDestroyed() &&
      environment.isDestroyed() &&
      !e.effects.ready
    );
  });
  expect(released).toBe(true);
  await page.goto("about:blank");
  expect(errors).toEqual([]);
});

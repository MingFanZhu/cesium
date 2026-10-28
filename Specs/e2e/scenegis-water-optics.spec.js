import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import process from "node:process";

for (const world of ["planar", "globe"]) {
  test(`local water ${world}: presets, wave comparison, motion and disposal`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (process.env.SCENEGIS_TEST_RELEASE === "true") {
      await page.route("**/Build/CesiumUnminified/index.js", (route) =>
        route.continue({
          url: route.request().url().replace("/CesiumUnminified/", "/Cesium/"),
        }),
      );
    }
    await page.goto(`/Test/Planar/局部水面.html?world=${world}`);
    await page.waitForFunction(
      () =>
        window.example?.water.ready &&
        window.example.models.length === 6 &&
        window.example.models.every((m) => m.ready),
    );
    await page
      .getByRole("checkbox", { name: "时间动画", exact: true })
      .uncheck();
    const edited = await page.evaluate(() => {
      const e = window.example;
      const controls = e.gui.controllersRecursive();
      controls
        .find((c) => c.property === "transmissionColor")
        .setValue("#80b0d0");
      controls.find((c) => c.property === "colorDistance").setValue(4);
      controls
        .find((c) => c.property === "scatteringColor")
        .setValue("#ffffff");
      controls.find((c) => c.property === "turbidity").setValue(0.2);
      return {
        preset: e.state.preset,
        absorption: e.water.absorption,
        scattering: e.water.scattering,
      };
    });
    expect(edited.preset).toBe("自定义");
    expect(edited.absorption.x).toBeCloseTo(
      -Math.log(((128 / 255 + 0.055) / 1.055) ** 2.4) / 4,
      8,
    );
    expect(edited.scattering).toEqual({ x: 0.2, y: 0.2, z: 0.2 });
    // Fix the simulation epoch for reproducible preset and both-world screenshots.
    await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      window.example.viewer.clock.currentTime = C.JulianDate.fromIso8601(
        "2026-06-21T10:00:04Z",
      );
    });
    for (const preset of ["原有配色", "清水", "湖水", "浑水"]) {
      await page
        .getByRole("combobox", { name: "水体预设", exact: true })
        .selectOption({ label: preset });
      const result = await page.evaluate(async () => {
        const e = window.example;
        await new Promise((resolve) => {
          const remove = e.viewer.scene.postRender.addEventListener(() => {
            remove();
            resolve();
          });
        });
        return {
          preset: e.state.preset,
          medium: e.water.scattering !== undefined,
          shown: e.waters.filter((s) => s.show).length,
        };
      });
      expect(result).toEqual({
        preset,
        medium: preset !== "原有配色",
        shown: 1,
      });
      await expect(page.locator("#error")).toHaveText("");
      await page.screenshot({
        path: testInfo.outputPath(`${world}-${preset}.png`),
      });
    }
    await page
      .getByRole("combobox", { name: "水体预设", exact: true })
      .selectOption({ label: "清水" });
    await page
      .getByRole("combobox", { name: "波浪模式", exact: true })
      .selectOption({ label: "法线波纹" });
    await page.waitForFunction(
      () =>
        window.example.waters[0].ready &&
        window.example.waters[0].show &&
        !window.example.waters[1].show,
    );
    await page.screenshot({ path: testInfo.outputPath(`${world}-normal.png`) });
    await page
      .getByRole("combobox", { name: "波浪模式", exact: true })
      .selectOption({ label: "FFT 风浪" });
    await page.getByRole("button", { name: "进入水下", exact: true }).click();
    await page.waitForFunction(
      () =>
        window.example.water._underwater?.active &&
        window.example.water._underwater.texture,
    );
    await expect(page.locator("#error")).toHaveText("");
    await page.screenshot({
      path: testInfo.outputPath(`${world}-underwater.png`),
    });
    await page.getByRole("button", { name: "水下仰视", exact: true }).click();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const remove =
            window.example.viewer.scene.postRender.addEventListener(() => {
              remove();
              resolve();
            });
        }),
    );
    await page.screenshot({
      path: testInfo.outputPath(`${world}-underwater-up.png`),
    });
    await page.getByRole("button", { name: "恢复视角", exact: true }).click();
    await page.waitForFunction(() => !window.example.water._underwater?.active);
    const timing = await page.evaluate(async () => {
      const e = window.example,
        v = e.viewer,
        gl = v.scene.context._gl;
      v.useDefaultRenderLoop = false;
      const C = await import("/Build/CesiumUnminified/index.js");
      const foam = e.water.foamIntensity,
        caustics = e.water.causticsIntensity;
      // Warm the actual enabled/disabled paths before timing animated frames.
      e.water.foamIntensity = e.water.causticsIntensity = 0;
      v.render();
      e.water.foamIntensity = foam;
      e.water.causticsIntensity = caustics;
      v.render();
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const samples = [];
      if (ext) {
        for (let i = 0; i < 12; i++) {
          const effects = i % 2 === 1;
          e.water.foamIntensity = effects ? foam : 0;
          e.water.causticsIntensity = effects ? caustics : 0;
          C.JulianDate.addSeconds(
            v.clock.currentTime,
            1 / 60,
            v.clock.currentTime,
          );
          const query = gl.createQuery();
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          v.render();
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          samples.push({ query, effects });
        }
        gl.flush();
        const deadline = performance.now() + 5000;
        while (
          !gl.getQueryParameter(
            samples.at(-1).query,
            gl.QUERY_RESULT_AVAILABLE,
          ) &&
          performance.now() < deadline
        ) {
          await new Promise(requestAnimationFrame);
        }
      }
      const valid =
        ext &&
        !gl.getParameter(ext.GPU_DISJOINT_EXT) &&
        samples.every(({ query }) =>
          gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE),
        );
      const measurements = valid
        ? samples.map(({ query, effects }) => ({
            effects,
            milliseconds: gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6,
          }))
        : [];
      for (const { query } of samples) {
        gl.deleteQuery(query);
      }
      e.water.foamIntensity = foam;
      e.water.causticsIntensity = caustics;
      v.render();
      const field = e.water._field;
      const half = (v) =>
        (v & 32768 ? -1 : 1) *
        ((v >> 10) & 31
          ? (1 + (v & 1023) / 1024) * 2 ** (((v >> 10) & 31) - 15)
          : (v & 1023) * 2 ** -24);
      const pixels = v.scene.context.readPixels({
        framebuffer: field.foam[field.index],
        width: field.size,
        height: field.size,
      });
      let foamMaximum = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        foamMaximum = Math.max(foamMaximum, half(pixels[i]));
      }
      const fieldBytes =
        field.data.byteLength +
        field.size ** 2 * 8 * (2 + 4 / 3) +
        129 ** 2 * 8 +
        128 ** 2 * 6 * 2;
      const debug = gl.getExtension("WEBGL_debug_renderer_info");
      v.useDefaultRenderLoop = true;
      return {
        renderer: debug
          ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
          : "unavailable",
        measurements,
        foamMaximum,
        fieldBytes,
      };
    });
    expect(timing.foamMaximum).toBeGreaterThan(0.05);
    const timingPath = testInfo.outputPath(`${world}-gpu-cost.json`);
    await writeFile(timingPath, JSON.stringify(timing, null, 2));
    await testInfo.attach(`${world}-gpu-cost`, {
      path: timingPath,
      contentType: "application/json",
    });
    // Exercise above-water oblique views while preserving the authored local frame.
    await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js"),
        e = window.example,
        camera = e.viewer.camera;
      const frame = e.water.modelMatrix;
      for (const eye of [
        [24, -18, 5],
        [-15, -20, 10],
        [0, -10, 35],
      ]) {
        const direction = C.Cartesian3.normalize(
          new C.Cartesian3(-eye[0], -eye[1], -eye[2]),
          new C.Cartesian3(),
        );
        camera.setView({
          destination: C.Matrix4.multiplyByPoint(
            frame,
            new C.Cartesian3(...eye),
            new C.Cartesian3(),
          ),
          orientation: {
            direction: C.Matrix4.multiplyByPointAsVector(
              frame,
              direction,
              new C.Cartesian3(),
            ),
            up: C.Matrix4.multiplyByPointAsVector(
              frame,
              C.Cartesian3.UNIT_Z,
              new C.Cartesian3(),
            ),
          },
        });
        await new Promise((resolve) => {
          const remove = e.viewer.scene.postRender.addEventListener(() => {
            remove();
            resolve();
          });
        });
      }
    });
    await expect(page.locator("#error")).toHaveText("");
    const destroyed = await page.evaluate(() => {
      const e = window.example,
        texture = e.waves._state.bands[0].output.getColorTexture(0);
      e.destroy();
      return (
        e.waters.every((s) => s.isDestroyed()) &&
        e.waves.isDestroyed() &&
        texture.isDestroyed() &&
        e.viewer.isDestroyed()
      );
    });
    expect(destroyed).toBe(true);
    expect(errors).toEqual([]);
  });
}

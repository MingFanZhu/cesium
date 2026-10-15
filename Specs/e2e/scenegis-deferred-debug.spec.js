import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

for (const world of ["planar", "globe"]) {
  test(`deferred diagnostics retain ${world} surfaces, transparency and shared effects`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/Test/Rendering/延迟调试验收.html?world=${world}`);
    await page.waitForFunction(
      () =>
        window.example?.extended?.ready &&
        window.example.effects.ready &&
        (window.example.scene.globe?.tilesLoaded ?? true),
    );
    const reflectionPixels = await page.evaluate(() => {
      const e = window.example;
      const scene = e.scene;
      e.viewer.useDefaultRenderLoop = false;
      scene.rethrowRenderErrors = true;
      e.viewer.render();
      const pixels = () =>
        scene.context.readPixels({
          width: scene.drawingBufferWidth,
          height: scene.drawingBufferHeight,
        });
      const reflected = pixels();
      e.water.reflections = false;
      e.viewer.render();
      const unreflected = pixels();
      const reflectionPixels = reflected.reduce(
        (count, value, index) =>
          count + Number(index % 4 < 3 && value !== unreflected[index]),
        0,
      );
      e.water.reflections = true;
      e.viewer.useDefaultRenderLoop = true;
      return reflectionPixels;
    });
    await page.locator("summary").click();
    await page.check("#clouds");
    await page.waitForFunction(() =>
      window.example.effects._pipeline.hasCloudResources(),
    );
    await page.locator("summary").click();
    const report = await page.evaluate(() => {
      const e = window.example;
      const scene = e.scene;
      e.viewer.useDefaultRenderLoop = false;
      const rows = [];
      for (const [id, value] of [
        ["debug", "commands"],
        ["screen", true],
        ["multi", true],
        ["taa", true],
        ["debug", "frustums"],
        ["debug", "cascades"],
        ["debug", "none"],
        ["taa", false],
        ["screen", false],
        ["multi", false],
      ]) {
        const input = document.getElementById(id);
        if (typeof value === "boolean") {
          input.checked = value;
        } else {
          input.value = value;
        }
        input.dispatchEvent(new Event("change"));
        e.viewer.render();
        const renderer = scene._sceneGISDeferred;
        rows.push({
          id,
          value,
          bytes: renderer.debugTintByteLength,
          material: renderer.drawCount,
          debug: renderer.debugTintDrawCount,
          screen: renderer.debugTintScreenCount,
          frustums: scene._view.frustumCommandsList.length,
          gl: scene.context._gl.getError(),
          shadows: scene.shadowMap.enabled,
        });
      }
      const capacity = Object.values(scene.context.shaderCache._shaders)
        .map((entry) => entry.shaderProgram)
        .filter(
          (program) =>
            program._program &&
            program.allUniforms.u_sceneGISDeferredStyle &&
            program.allUniforms.u_sceneGISDebugTint &&
            program.allUniforms.u_sceneGISExtensions,
        )
        .map((program) => program.maximumTextureUnitIndex);
      return {
        rows,
        capacity,
        style: scene._sceneGISDeferred._hasStyleTarget,
        errors: e.errors,
      };
    });
    report.reflectionPixels = reflectionPixels;
    await page.locator("summary").click();
    await page.uncheck("#clouds");
    await page.locator("summary").click();
    await page.evaluate(() => window.example.viewer.render());
    await page.screenshot({ path: testInfo.outputPath(`${world}-normal.png`) });
    await page.selectOption("#debug", "commands");
    await page.evaluate(() => window.example.viewer.render());
    await page.screenshot({
      path: testInfo.outputPath(`${world}-commands.png`),
    });
    await writeFile(
      testInfo.outputPath(`${world}-report.json`),
      JSON.stringify(report, null, 2),
    );
    expect(errors).toEqual([]);
    expect(report.errors).toEqual([]);
    expect(report.reflectionPixels).toBeGreaterThan(0);
    expect(report.style).toBe(true);
    expect(report.capacity.length).toBeGreaterThan(0);
    expect(Math.max(...report.capacity)).toBeLessThanOrEqual(16);
    for (const row of report.rows) {
      expect(row.gl).toBe(0);
      expect(row.screen).toBe(0);
      expect(row.debug).toBeLessThanOrEqual(row.material);
      expect(row.shadows).toBe(true);
    }
    expect(report.rows[0].bytes).toBe(1280 * 800 * 8);
    expect(report.rows[2].frustums).toBeGreaterThan(1);
    expect(report.rows[6].bytes).toBe(0);
  });
}

import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";

for (const world of ["planar", "globe"]) {
  test(`rectangular area light: ${world}`, async ({ page }, info) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        info.project.name === "release" &&
        url.pathname === "/Build/CesiumUnminified/index.js"
      ) {
        url.pathname = "/Build/Cesium/index.js";
        return route.continue({ url: url.toString() });
      }
      return url.hostname === "localhost" || url.protocol === "data:"
        ? route.continue()
        : route.abort();
    });
    await page.goto(`/Test/Rendering/矩形光源.html?world=${world}`);
    await page.waitForFunction(() => window.example?.state.ready);
    await expect(page.locator("#error")).toHaveText("");
    await page.evaluate(() => {
      window.example.viewer.useDefaultRenderLoop = false;
      window.example.state.marker = false;
      window.example.state.apply();
    });
    async function imageState(changes = {}) {
      return page.evaluate((changes) => {
        const { viewer, state } = window.example;
        Object.assign(state, changes);
        state.apply();
        window.example.gui
          .controllersRecursive()
          .forEach((controller) => controller.updateDisplay());
        viewer.render();
        const scene = viewer.scene;
        const pixels = scene.context.readPixels({
          width: scene.drawingBufferWidth,
          height: scene.drawingBufferHeight,
        });
        let energy = 0,
          bright = 0;
        for (let i = 0; i < pixels.length; i += 4) {
          energy += pixels[i];
          if (pixels[i] > 100) {
            bright++;
          }
        }
        return { energy, bright };
      }, changes);
    }
    const lit = await imageState();
    expect(lit.bright).toBeGreaterThan(300);
    await page.screenshot({ path: info.outputPath("rect-wide.png") });
    const small = await imageState({ width: 2 });
    expect(small.energy).toBeLessThan(lit.energy * 0.85);
    await page.screenshot({ path: info.outputPath("rect-small.png") });
    const back = await imageState({ width: 12, tilt: 180 });
    const off = await imageState({ enabled: false });
    expect(back.energy).toBe(off.energy);
    const double = await imageState({ enabled: true, twoSided: true });
    expect(double.energy).toBeGreaterThan(off.energy * 1.5);
    await imageState({ tilt: 0, twoSided: false });
    expect(await imageState()).toEqual(lit);
    const stats = await page.evaluate(async () => {
      const { viewer, lights, panel, models } = window.example;
      const scene = viewer.scene;
      const material = scene._sceneGISDeferred._raw.getColorTexture();
      const renderer = scene._sceneGISDeferred;
      const gl = scene.context._gl;
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      // Compile both lighting variants before measuring warm draws.
      for (const intensity of [0, 8]) {
        panel.intensity = intensity;
        viewer.render();
      }
      const samples = [];
      for (let pair = 0; pair < 8; pair++) {
        for (const enabled of pair % 2 ? [true, false] : [false, true]) {
          panel.intensity = enabled ? 8 : 0;
          viewer.render();
          const query = ext ? gl.createQuery() : undefined;
          if (query) {
            gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
          }
          const start = performance.now();
          viewer.render();
          const cpu = performance.now() - start;
          if (query) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
          }
          samples.push({ enabled, cpu, query });
        }
      }
      for (const sample of samples) {
        if (sample.query) {
          while (
            !gl.getQueryParameter(sample.query, gl.QUERY_RESULT_AVAILABLE)
          ) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
          sample.gpu = gl.getParameter(ext.GPU_DISJOINT_EXT)
            ? null
            : gl.getQueryParameter(sample.query, gl.QUERY_RESULT) / 1e6;
          gl.deleteQuery(sample.query);
          delete sample.query;
        }
      }
      panel.intensity = 8;
      viewer.render();
      const table = lights._state.tiles.texture;
      const stableMaterial = material === renderer._raw.getColorTexture();
      const rectBytes = lights._state.tiles.byteLength;
      const shaderCount = scene.context.shaderCache.numberOfShaders;
      panel.width = 10;
      viewer.render();
      const reused =
        table === lights._state.tiles.texture &&
        shaderCount === scene.context.shaderCache.numberOfShaders;
      lights.show = false;
      viewer.render();
      const released = table.isDestroyed();
      lights.show = true;
      panel.width = 12;
      viewer.render();
      const info = {
        samples,
        rectBytes,
        reused,
        released,
        stableMaterial,
        draws: renderer.drawCount,
        models: models.length,
        renderer: gl.getParameter(
          gl.getExtension("WEBGL_debug_renderer_info").UNMASKED_RENDERER_WEBGL,
        ),
      };
      window.example.destroy();
      info.destroyed = viewer.isDestroyed();
      return info;
    });
    expect(stats.reused).toBe(true);
    expect(stats.released).toBe(true);
    expect(stats.stableMaterial).toBe(true);
    expect(stats.destroyed).toBe(true);
    expect(stats.models).toBe(5);
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath("timing.json"),
      JSON.stringify(stats, null, 2),
    );
  });
}

import { test, expect } from "@playwright/test";
for (const world of ["planar", "globe"]) {
  test(`thin three-dimensional wind trails in ${world}`, async ({
    page,
  }, info) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`/Test/Wind/?world=${world}`);
    await page.waitForFunction(() => window.windExample?.wind.ready);
    await page.locator("#compute").click();
    await page.waitForFunction(
      () =>
        window.windExample?.completed &&
        window.windExample.wind.simulationTime >= 39.99,
    );
    const result = await page.evaluate(async () => {
      const e = window.windExample,
        v = e.viewer,
        d = e.display,
        w = e.wind;
      v.useDefaultRenderLoop = false;
      w.paused = true;
      const render = () => {
        v.scene.initializeFrame();
        v.render();
      };
      render();
      const p = d._particles,
        ctx = v.scene.context,
        gl = ctx._gl,
        ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const gpu = [];
      if (ext) {
        for (const [name, command] of [
          ["markerDraw", p.draw],
          ["historyRibbonDraw", p.trails],
        ]) {
          for (let i = 0; i < 3; i++) {
            const query = gl.createQuery();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
            command.execute(ctx);
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            while (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
              await new Promise((r) => requestAnimationFrame(r));
            }
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              gpu.push({
                name,
                milliseconds:
                  gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6,
              });
            }
            gl.deleteQuery(query);
          }
        }
      }
      render();
      const bytes = d.particleTextureByteLength,
        field = w.getGpuField().velocityTexture;
      const count = p.count,
        times = Array.from(p.times),
        version = w.getGpuField().version;
      d.particleWidth = 1.1;
      d.particleLength = 3;
      d.trailFade = 1.4;
      render();
      const unchanged =
        bytes === d.particleTextureByteLength &&
        version === w.getGpuField().version &&
        count === p.count;
      return {
        gpu,
        bytes,
        historyBytes: d.trailTextureByteLength,
        count,
        times,
        simulationTime: w.simulationTime,
        width: d.particleWidth,
        units: d.particleWidthUnits,
        length: d.particleLength,
        duration: d.trailDuration,
        segments: d.trailSegments,
        unchanged,
        renderer: gl.getParameter(
          gl.getExtension("WEBGL_debug_renderer_info").UNMASKED_RENDERER_WEBGL,
        ),
        fieldAlive: !field.isDestroyed(),
      };
    });
    console.log(world, result);
    expect(result.unchanged).toBe(true);
    expect(result.units).toBe("pixels");
    expect(result.count).toBe(65);
    expect(result.bytes).toBeLessThanOrEqual(64 * 1048576);
    expect(result.historyBytes).toBeGreaterThan(0);
    const a = await page.screenshot({
      path: info.outputPath("thin-trails.png"),
    });
    await page.evaluate(() => {
      const v = window.windExample.viewer;
      v.scene.initializeFrame();
      v.render();
    });
    const b = await page.screenshot();
    expect(b.equals(a)).toBe(true);
    await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js"),
        e = window.windExample;
      const m = e.wind.modelMatrix,
        eye = new C.Cartesian3(-115, -145, 100),
        target = new C.Cartesian3(-20, -5, 12);
      const direction = C.Cartesian3.normalize(
        C.Cartesian3.subtract(target, eye, new C.Cartesian3()),
        new C.Cartesian3(),
      );
      const right = C.Cartesian3.normalize(
        C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
        new C.Cartesian3(),
      );
      const up = C.Cartesian3.cross(right, direction, new C.Cartesian3());
      e.viewer.camera.setView({
        destination: C.Matrix4.multiplyByPoint(m, eye, new C.Cartesian3()),
        orientation: {
          direction: C.Matrix4.multiplyByPointAsVector(
            m,
            direction,
            new C.Cartesian3(),
          ),
          up: C.Matrix4.multiplyByPointAsVector(m, up, new C.Cartesian3()),
        },
      });
      e.viewer.scene.initializeFrame();
      e.viewer.render();
    });
    await page.screenshot({ path: info.outputPath("thin-trails-close.png") });
    await page.locator("#trails").uncheck();
    await page.evaluate(() => {
      const v = window.windExample.viewer;
      v.scene.initializeFrame();
      v.render();
    });
    await page.screenshot({ path: info.outputPath("markers-only.png") });
    const disposed = await page.evaluate(() => {
      const e = window.windExample,
        p = e.display._particles,
        targets = p.targets.slice(),
        field = e.wind.getGpuField().velocityTexture;
      e.viewer.scene.primitives.remove(e.display);
      const released =
        targets.every((t) => t.isDestroyed()) && !field.isDestroyed();
      e.viewer.scene.primitives.remove(e.wind);
      e.viewer.destroy();
      return released && field.isDestroyed();
    });
    expect(disposed).toBe(true);
    expect(errors).toEqual([]);
  });
}

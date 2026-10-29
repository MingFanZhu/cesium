import { test, expect } from "@playwright/test";

for (const sample of ["lake", "river-globe", "river-planar"]) {
  test(`${sample}: regional caustics, pause, field cost and lifecycle`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const river = sample !== "lake";
    await page.goto(
      river
        ? `/Test/Rendering/河流水面.html?world=${sample.endsWith("planar") ? "planar" : "globe"}`
        : "/Test/Rendering/曲面河湖.html",
    );
    await page.waitForFunction(
      () => (window.example?.water ?? window.example?.river)?.ready,
    );
    await page
      .getByRole("checkbox", { name: "时间动画", exact: true })
      .uncheck();
    if (river) {
      await page
        .getByRole("combobox", { name: "水体预设", exact: true })
        .selectOption("清水");
      await page
        .getByRole("combobox", { name: "观察位置", exact: true })
        .selectOption("水下焦散");
    } else {
      await page
        .getByRole("combobox", { name: "观察位置", exact: true })
        .selectOption("浅水焦散");
    }
    const result = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const e = window.example,
        s = e.viewer.scene,
        w = e.water ?? e.river,
        surface = w._surface ?? w;
      e.viewer.clock.shouldAnimate = false;
      e.viewer.useDefaultRenderLoop = false;
      const render = () => {
        s.initializeFrame();
        s.render(e.viewer.clock.currentTime);
      };
      render();
      const f = surface._field,
        gl = s.context._gl;
      const sample = () =>
        Array.from(
          s.context.readPixels({ x: 400, y: 280, width: 128, height: 128 }),
        );
      const on = sample();
      w.causticsIntensity = 0;
      render();
      const off = sample();
      w.causticsIntensity = 1;
      render();
      const frozen = sample();
      render();
      const paused = sample();
      const stable = frozen.every((v, i) => v === paused[i]);
      const difference =
        on.reduce((sum, v, i) => sum + Math.abs(v - off[i]), 0) / on.length;
      const data = s.context.readPixels({
        framebuffer: f.caustics,
        x: 100,
        y: 100,
        width: 32,
        height: 32,
      });
      const decode = (h) => {
        const exp = (h >> 10) & 31,
          m = h & 1023;
        return (
          (h & 32768 ? -1 : 1) *
          (exp
            ? Math.pow(2, exp - 15) * (1 + m / 1024)
            : (Math.pow(2, -14) * m) / 1024)
        );
      };
      const focus = Array.from(data)
        .filter((_, i) => i % 4 === 0)
        .map(decode);
      const cameraInField = C.Matrix4.multiplyByPoint(
        f.inverse,
        s.camera.positionWC,
        new C.Cartesian3(),
      );
      const bytes = [
        f.bed,
        f.surfaceMap,
        f.tangentMap,
        f.flowMap,
        f.caustics.getColorTexture(0),
        ...f.foam.map((t) => t.getColorTexture(0)),
      ]
        .filter(Boolean)
        .reduce((sum, t) => sum + t.sizeInBytes, 0);
      const draw = f.causticsCommand.execute,
        ext = gl.getExtension("EXT_disjoint_timer_query_webgl2"),
        gpu = [];
      let query,
        count = 0;
      f.causticsCommand.execute = function (context) {
        ++count;
        if (query) {
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        }
        try {
          return draw.call(this, context);
        } finally {
          if (query) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
          }
        }
      };
      s.camera.moveRight(0.5);
      render();
      const cameraDraws = count;
      for (let i = 0; i < 6; ++i) {
        query = ext ? gl.createQuery() : undefined;
        C.JulianDate.addSeconds(
          e.viewer.clock.currentTime,
          1 / 60,
          e.viewer.clock.currentTime,
        );
        render();
        if (query) {
          const q = query;
          query = undefined;
          while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
          }
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
            gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          }
          gl.deleteQuery(q);
        }
      }
      f.causticsCommand.execute = draw;
      return {
        difference,
        stable,
        cameraDraws,
        gpu,
        bytes,
        field: [f.width, f.height],
        causticSize: f.causticsSize,
        focus: [Math.min(...focus), Math.max(...focus)],
        cameraInField,
        active: surface._underwater.active,
      };
    });
    console.log("Regional water field", sample, result);
    expect(result.active).toBe(true);
    expect(result.difference).toBeGreaterThan(0.05);
    expect(result.stable).toBe(true);
    expect(result.cameraDraws).toBe(0);
    expect(result.focus[1] - result.focus[0]).toBeGreaterThan(0.01);
    await page.screenshot({
      path: testInfo.outputPath("underwater-caustics.png"),
    });
    if (!river) {
      await page
        .getByRole("combobox", { name: "观察位置", exact: true })
        .selectOption("浅水俯视");
      await page.evaluate(() => {
        const e = window.example;
        e.viewer.scene.initializeFrame();
        e.viewer.scene.render(e.viewer.clock.currentTime);
      });
      await page.screenshot({
        path: testInfo.outputPath("above-caustics.png"),
      });
    }
    const destroyed = await page.evaluate(() => {
      const e = window.example,
        w = e.water ?? e.river,
        surface = w._surface ?? w,
        f = surface._field;
      const textures = [
        f.bed,
        f.surfaceMap,
        f.tangentMap,
        f.flowMap,
        f.caustics.getColorTexture(0),
        ...f.foam.map((t) => t.getColorTexture(0)),
      ].filter(Boolean);
      e.destroy();
      return textures.every((t) => t.isDestroyed()) && e.viewer.isDestroyed();
    });
    expect(destroyed).toBe(true);
    expect(errors).toEqual([]);
  });
}

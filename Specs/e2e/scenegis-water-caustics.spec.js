import { test, expect } from "@playwright/test";

for (const sample of ["lake", "channel", "river-globe", "river-planar"]) {
  test(`${sample}: visible-depth caustics, pause, draw cost and lifecycle`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const directed = sample.startsWith("river-");
    await page.goto(
      directed
        ? `/Test/Rendering/河流水面.html?world=${sample.endsWith("planar") ? "planar" : "globe"}`
        : `/Test/Rendering/曲面河湖.html?sample=${sample === "channel" ? "river" : "lake"}`,
    );
    await page.waitForFunction(
      () => (window.example?.water ?? window.example?.river)?.ready,
    );
    await page
      .getByRole("checkbox", { name: "时间动画", exact: true })
      .uncheck();
    await page
      .getByRole("combobox", { name: "水体预设", exact: true })
      .selectOption("清水");
    await page
      .getByRole("combobox", { name: "观察位置", exact: true })
      .selectOption(
        directed ? "水下焦散" : sample === "lake" ? "浅水焦散" : "水下近景",
      );
    const result = await page.evaluate(async () => {
      const e = window.example,
        s = e.viewer.scene,
        w = e.water ?? e.river,
        surface = w._surface ?? w;
      e.viewer.useDefaultRenderLoop = false;
      const render = () => {
        s.initializeFrame();
        s.render(e.viewer.clock.currentTime);
      };
      render();
      const pixels = () =>
        Array.from(
          s.context.readPixels({ x: 400, y: 280, width: 128, height: 128 }),
        );
      w.causticsIntensity = 1;
      render();
      const on = pixels();
      w.causticsIntensity = 0;
      render();
      const off = pixels();
      w.causticsIntensity = 1;
      render();
      const frozen = pixels();
      render();
      const paused = pixels();
      const stable = frozen.every((v, i) => v === paused[i]);
      const difference =
        on.reduce((sum, v, i) => sum + Math.abs(v - off[i]), 0) / on.length;
      const medium = surface._underwater,
        gl = s.context._gl,
        ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const execute = medium.draw,
        gpu = [];
      let query;
      medium.draw = function (surface, scene, passState) {
        if (query) {
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        }
        try {
          return execute.call(this, surface, scene, passState);
        } finally {
          if (query) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
          }
        }
      };
      try {
        for (let i = 0; i < 6; ++i) {
          w.causticsIntensity = i % 2;
          query = ext ? gl.createQuery() : undefined;
          render();
          if (query) {
            const q = query;
            query = undefined;
            while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
              await new Promise((resolve) => requestAnimationFrame(resolve));
            }
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              gpu.push({
                caustics: i % 2,
                milliseconds: gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6,
              });
            }
            gl.deleteQuery(q);
          }
        }
      } finally {
        medium.draw = execute;
      }
      w.causticsIntensity = 1;
      render();
      s.camera.moveRight(0.5);
      render();
      return {
        difference,
        stable,
        gpu,
        fieldRemoved: surface._field === undefined,
        profileTextureBytes:
          medium.texture.sizeInBytes +
          (surface._domain?.texture?.sizeInBytes ?? 0),
        constructionMilliseconds: e.constructionMilliseconds,
        active: medium.active,
      };
    });
    console.log("Screen water effects", sample, result);
    expect(result.active).toBe(true);
    expect(result.fieldRemoved).toBe(true);
    expect(result.stable).toBe(true);
    expect(result.difference).toBeGreaterThan(0.01);
    await page.screenshot({
      path: testInfo.outputPath("underwater-caustics.png"),
    });
    if (sample === "lake") {
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
        surface = w._surface ?? w;
      const textures = [
        surface._underwater.texture,
        surface._domain?.texture,
      ].filter(Boolean);
      e.destroy();
      return textures.every((t) => t.isDestroyed()) && e.viewer.isDestroyed();
    });
    expect(destroyed).toBe(true);
    expect(errors).toEqual([]);
  });
}

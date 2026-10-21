import { test, expect } from "@playwright/test";

for (const world of ["planar", "globe"]) {
  test(`river ${world}: continuous LOD, independent wind, bounds and lifecycle`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/河流水面.html?world=${world}`);
    await page.waitForFunction(
      () =>
        window.example?.river.ready ||
        document.querySelector("#error").textContent.length > 0,
    );
    await expect(page.locator("#error")).toHaveText("");
    await page.evaluate(() => {
      window.example.viewer.useDefaultRenderLoop = false;
      window.example.viewer.clock.shouldAnimate = false;
    });
    const measurements = [];
    for (const view of [
      "全河鸟瞰",
      "弯道鸟瞰",
      "水面近景",
      "浪面特写",
      "低角度远眺",
      "高空",
    ]) {
      await page.getByRole("combobox", { name: "观察位置" }).selectOption(view);
      measurements.push(
        await page.evaluate(async (view) => {
          const e = window.example,
            s = e.viewer.scene;
          e.viewAt(view);
          const render = () => {
            const start = performance.now();
            s.initializeFrame();
            s.render(e.viewer.clock.currentTime);
            return performance.now() - start;
          };
          const coldFrameMilliseconds = render(),
            coldBuilds = e.river.statistics.geometryBuilds,
            warm = [];
          for (let i = 0; i < 8; ++i) {
            await new Promise((r) => requestAnimationFrame(r));
            warm.push(render());
          }
          warm.sort((a, b) => a - b);
          return {
            view,
            ...e.river.statistics,
            coldFrameMilliseconds,
            coldBuilds,
            warmMedianMilliseconds: warm[4],
            constructionMilliseconds: e.constructionMilliseconds,
          };
        }, view),
      );
      await page.screenshot({
        path: testInfo.outputPath(`${world}-${view}.png`),
      });
    }
    const result = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js"),
        e = window.example,
        s = e.viewer.scene;
      const render = () => {
        s.initializeFrame();
        s.render(e.viewer.clock.currentTime);
      };
      const continuity = [];
      for (let i = 0; i <= 18; ++i) {
        e.setCamera(180 * Math.pow(800, i / 18), -0.12 - (1.15 * i) / 18);
        render();
        continuity.push(e.river.statistics.selectedTiles);
      }
      e.viewAt("水面近景");
      e.settings.wind = true;
      e.rebuild();
      render();
      const texture = e.waves._state.bands[0].output.getColorTexture(0),
        windSeconds = e.waves._state.seconds;
      e.river.currentSpeedScale = 0;
      render();
      const unchangedWind = e.waves._state.seconds === windSeconds;
      const gpu = [];
      const fft = {};
      const gl = s.context._gl,
        ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      if (ext) {
        const times = [];
        const simulation = e.river._waves;
        for (let i = 0; i < 8; ++i) {
          await new Promise((r) => requestAnimationFrame(r));
          const q = gl.createQuery();
          const time = C.JulianDate.addSeconds(
            e.viewer.clock.currentTime,
            (i + 1) / 60,
            new C.JulianDate(),
          );
          gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
          simulation._update(
            { context: s.context, time },
            Math.sqrt(12 / e.river.currentRippleLength),
          );
          gl.endQuery(ext.TIME_ELAPSED_EXT);
          while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
            await new Promise((r) => requestAnimationFrame(r));
          }
          if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
            times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          }
          gl.deleteQuery(q);
        }
        times.sort((a, b) => a - b);
        fft.medianMilliseconds = times[Math.floor(times.length / 2)];
        fft.draws = simulation._state.draws;
        const targets = [
          ...simulation._state.buffers,
          ...simulation._state.bands.map((b) => b.output),
        ];
        fft.textureBytes =
          targets.reduce(
            (sum, t) =>
              sum +
              t.getColorTexture(0).sizeInBytes +
              t.getColorTexture(1).sizeInBytes,
            0,
          ) +
          simulation._state.bands.reduce(
            (sum, b) => sum + b.initial.sizeInBytes,
            0,
          );
        for (const condition of [
          "current-flat",
          "current-waves",
          "current-and-wind",
          "hidden",
        ]) {
          e.settings.wind = condition === "current-and-wind";
          e.rebuild();
          e.river.currentSpeedScale = 1;
          e.river.currentRippleAmplitude =
            condition === "current-flat" ? 0 : 0.3;
          e.river.show = condition !== "hidden";
          render();
          const times = [];
          for (let i = 0; i < 5; ++i) {
            await new Promise((r) => requestAnimationFrame(r));
            C.JulianDate.addSeconds(
              e.viewer.clock.currentTime,
              1 / 60,
              e.viewer.clock.currentTime,
            );
            const q = gl.createQuery();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            render();
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
              await new Promise((r) => requestAnimationFrame(r));
            }
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              times.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            }
            gl.deleteQuery(q);
          }
          times.sort((a, b) => a - b);
          gpu.push({
            condition,
            medianMilliseconds: times[Math.floor(times.length / 2)],
          });
        }
      }
      e.river.show = true;
      render();
      const bound = e.river.getBoundingSphere();
      const screen = C.SceneTransforms.worldToWindowCoordinates(
        s,
        e.point(40, 15, 24),
      );
      const picked = s.pick(screen);
      const stats = e.river.statistics;
      const water = e.river,
        wind = e.waves;
      e.destroy();
      return {
        continuity,
        unchangedWind,
        pickedRiver: picked?.primitive === water,
        stats,
        gpu,
        fft,
        boundFinite: Number.isFinite(bound.radius) && bound.radius > 0,
        destroyed:
          water.isDestroyed() &&
          wind.isDestroyed() &&
          texture.isDestroyed() &&
          e.viewer.isDestroyed(),
      };
    });
    expect(
      measurements.every(
        (m) =>
          m.selectedTiles > 0 &&
          m.selectedTiles <= 256 &&
          m.geometryBuilds === 0 &&
          m.inactiveGeometryBytes <= 16 * 1048576,
      ),
    ).toBe(true);
    expect(result.continuity.every((n) => n > 0 && n <= 256)).toBe(true);
    expect(
      result.unchangedWind &&
        result.pickedRiver &&
        result.boundFinite &&
        result.destroyed,
    ).toBe(true);
    expect(errors).toEqual([]);
    await testInfo.attach("river-measurements", {
      body: JSON.stringify({ world, measurements, result }, null, 2),
      contentType: "application/json",
    });
    console.log(world, JSON.stringify({ measurements, result }));
  });
}

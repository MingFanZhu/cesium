import { test, expect } from "@playwright/test";
import checkWaterAppearance from "./scenegis-water-appearance-checks.js";

for (const sample of ["lake", "river"]) {
  test(`curved ${sample} underwater: entry, underside, pause, bounded composition and disposal`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/曲面河湖.html?sample=${sample}`);
    await page.waitForFunction(() => window.example?.water.ready);
    await page
      .getByRole("checkbox", { name: "时间动画", exact: true })
      .uncheck();
    await page
      .getByRole("combobox", { name: "观察位置", exact: true })
      .selectOption({ label: "水下近景" });
    await page.waitForFunction(() => window.example.water._underwater?.active);
    await expect(page.locator("#error")).toHaveText("");
    const metrics = await page.evaluate(async () => {
      const e = window.example,
        s = e.viewer.scene;
      e.viewer.useDefaultRenderLoop = false;
      const render = () => {
        s.initializeFrame();
        s.render(e.viewer.clock.currentTime);
      };
      render();
      const medium = e.water._underwater,
        gl = s.context._gl;
      const execute = medium.command.execute;
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const gpu = [],
        cpu = [],
        draws = [];
      let count = 0,
        query;
      medium.command.execute = function (context, passState) {
        ++count;
        if (query) {
          gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        }
        try {
          return execute.call(this, context, passState);
        } finally {
          if (query) {
            gl.endQuery(ext.TIME_ELAPSED_EXT);
          }
        }
      };
      try {
        for (let i = 0; i < 6; ++i) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          gl.finish();
          count = 0;
          query = ext ? gl.createQuery() : undefined;
          const start = performance.now();
          render();
          cpu.push(performance.now() - start);
          draws.push(count);
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
      } finally {
        medium.command.execute = execute;
      }
      const seconds = e.waves._state.seconds;
      render();
      return {
        draws,
        gpu,
        cpu,
        paused: seconds === e.waves._state.seconds,
        extraTextureBytes:
          medium.texture.sizeInBytes +
          (medium.domain?.texture?.sizeInBytes ?? 0),
        width: s.drawingBufferWidth,
        height: s.drawingBufferHeight,
        selectedTiles: e.water.statistics.selectedTiles,
        frustums: s._view.frustumCommandsList.length,
      };
    });
    expect(metrics.draws).toEqual([1, 1, 1, 1, 1, 1]);
    expect(metrics.paused).toBe(true);
    expect(metrics.selectedTiles).toBeLessThanOrEqual(512);
    if (sample === "lake") {
      expect(metrics.extraTextureBytes).toBe(11 * 16);
    } else {
      expect(metrics.extraTextureBytes).toBeGreaterThan(128);
      expect(metrics.extraTextureBytes).toBeLessThanOrEqual(
        2047 * 64 + 256 * 16,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath("globe-underwater-near.png"),
    });
    await page
      .getByRole("combobox", { name: "观察位置", exact: true })
      .selectOption({ label: "水下仰视" });
    expect(
      await page.evaluate(() => {
        const e = window.example,
          s = e.viewer.scene;
        s.initializeFrame();
        s.render(e.viewer.clock.currentTime);
        return e.water._underwater.active;
      }),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("globe-underwater-up.png"),
    });
    await page
      .getByRole("checkbox", { name: "水下模式", exact: true })
      .uncheck();
    expect(
      await page.evaluate(() => {
        const e = window.example,
          s = e.viewer.scene;
        s.initializeFrame();
        s.render(e.viewer.clock.currentTime);
        return {
          depth: e.water.underwaterDepth,
          active: e.water._underwater.active,
        };
      }),
    ).toEqual({ depth: 0, active: false });
    await page.getByRole("checkbox", { name: "水下模式", exact: true }).check();
    const result = await page.evaluate(async (sample) => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const e = window.example,
        s = e.viewer.scene;
      const render = () => {
        s.initializeFrame();
        s.render(e.viewer.clock.currentTime);
      };
      s.camera.setView({
        destination:
          sample === "river"
            ? C.Cartesian3.fromDegrees(118.59, 31.87, 61)
            : C.Cartesian3.fromDegrees(118.55, 31.85, 31),
      });
      render();
      const above = !e.water._underwater.active;
      s.camera.setView({
        destination: C.Cartesian3.fromDegrees(116, 31.85, 25),
      });
      render();
      const outside = !e.water._underwater.active;
      e.settings.viewAt("水下近景");
      render();
      const entered = e.water._underwater.active,
        texture = e.water._underwater.texture;
      e.destroy();
      return {
        above,
        outside,
        entered,
        destroyed:
          texture.isDestroyed() &&
          e.water.isDestroyed() &&
          e.waves.isDestroyed() &&
          e.viewer.isDestroyed(),
      };
    }, sample);
    expect(result).toEqual({
      above: true,
      outside: true,
      entered: true,
      destroyed: true,
    });
    expect(errors).toEqual([]);
    console.log("Globe underwater metrics", sample, metrics);
  });
}

for (const sample of ["lake", "river"]) {
  test(`curved ${sample}: near/high camera, animation, bounded LOD and lifecycle`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/曲面河湖.html?sample=${sample}`);
    await page.waitForFunction(
      () =>
        (window.example?.water.ready &&
          window.example.water.statistics.selectedTiles > 0) ||
        document.querySelector("#error").textContent.length > 0,
    );
    await expect(page.locator("#error")).toHaveText("");
    await checkWaterAppearance(page, sample === "river" ? "河水" : "清水");
    await page.evaluate(() => {
      window.example.viewer.useDefaultRenderLoop = false;
      window.example.viewer.clock.shouldAnimate = false;
    });
    await page.screenshot({
      path: testInfo.outputPath(`${sample}-overview.png`),
    });
    const measurements = [];
    for (const name of ["高空", "低角度远眺", "水面近景", "浪面特写"]) {
      await page
        .getByRole("combobox", { name: "观察位置", exact: true })
        .selectOption({ label: name });
      measurements.push(
        await page.evaluate(async (view) => {
          const e = window.example,
            s = e.viewer.scene;
          const render = () => {
            const start = performance.now();
            s.initializeFrame();
            s.render(e.viewer.clock.currentTime);
            return performance.now() - start;
          };
          // The render loop is stopped: the first measured frame actually uses the new camera.
          const coldFrameMilliseconds = render();
          const coldGeometryBuilds = e.water.statistics.geometryBuilds;
          const warm = [];
          for (let i = 0; i < 12; ++i) {
            await new Promise((resolve) => requestAnimationFrame(resolve));
            warm.push(render());
          }
          warm.sort((a, b) => a - b);
          return {
            view,
            ...e.water.statistics,
            coldFrameMilliseconds,
            coldGeometryBuilds,
            warmFrameMedianMilliseconds: warm[6],
            warmFrameMaxMilliseconds: warm[11],
            constructionMilliseconds: e.constructionMilliseconds,
          };
        }, name),
      );
      await page.screenshot({
        path: testInfo.outputPath(`${sample}-${name}.png`),
      });
    }
    const result = await page.evaluate(async (sample) => {
      const C = await import("/Build/CesiumUnminified/index.js"),
        e = window.example,
        s = e.viewer.scene;
      e.viewer.clock.shouldAnimate = false;
      const target =
        sample === "river"
          ? C.Cartesian3.fromDegrees(118.59, 31.87, 60)
          : C.Cartesian3.fromDegrees(118.55, 31.85, 30);
      const spectrum = (
        await import("/packages/engine/Source/SceneGIS/Scene/_private/_SceneGISWindSpectrum.js")
      ).default;
      // Isolate the marginal GPU cost of a third band with identical size and kernels.
      const twoBands = new C.SceneGISWindWaves({
        resolution: e.waves.resolution,
        patchLength: e.waves.patchLength,
        _spectrum: (options) => {
          const generated = spectrum(options);
          generated.bands.length = 2;
          return generated;
        },
      });
      twoBands._update({
        context: s.context,
        time: e.viewer.clock.currentTime,
      });
      const fft = {};
      const gpuInfo = s.context._gl.getExtension("WEBGL_debug_renderer_info");
      fft.renderer = gpuInfo
        ? s.context._gl.getParameter(gpuInfo.UNMASKED_RENDERER_WEBGL)
        : "unavailable";
      const gl = s.context._gl;
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      if (ext) {
        const times = [],
          baseline = [],
          frames = [];
        for (let i = 0; i < 8; ++i) {
          const time = C.JulianDate.addSeconds(
            e.viewer.clock.currentTime,
            (i + 1) / 60,
            new C.JulianDate(),
          );
          await new Promise((resolve) => requestAnimationFrame(resolve));
          // Drain other submitted work before paired timers; do not attribute queue latency to FFT.
          gl.finish();
          const queries = [];
          const conditions =
            i % 2
              ? ["threeBands", "twoBands", "frame"]
              : ["twoBands", "threeBands", "frame"];
          for (const condition of conditions) {
            const q = gl.createQuery();
            gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
            if (condition === "frame") {
              s.initializeFrame();
              s.render(
                C.JulianDate.addSeconds(time, 1 / 120, new C.JulianDate()),
              );
            } else {
              (condition === "twoBands" ? twoBands : e.waves)._update({
                context: s.context,
                time,
              });
            }
            gl.endQuery(ext.TIME_ELAPSED_EXT);
            queries.push({ condition, q });
          }
          for (const { condition, q } of queries) {
            while (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) {
              await new Promise((resolve) => requestAnimationFrame(resolve));
            }
            if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
              (condition === "frame"
                ? frames
                : condition === "twoBands"
                  ? baseline
                  : times
              ).push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
            }
            gl.deleteQuery(q);
          }
        }
        baseline.sort((a, b) => a - b);
        fft.twoBandMedianMilliseconds =
          baseline[Math.floor(baseline.length / 2)];
        times.sort((a, b) => a - b);
        frames.sort((a, b) => a - b);
        fft.medianMilliseconds = times[Math.floor(times.length / 2)];
        fft.frameMedianMilliseconds = frames[Math.floor(frames.length / 2)];
      }
      twoBands.destroy();
      fft.draws = e.waves._state.draws;
      fft.bands = e.waves._state.bands.length;
      fft.textureBytes =
        [
          ...e.waves._state.buffers,
          ...e.waves._state.bands.map((b) => b.output),
        ].reduce(
          (sum, t) =>
            sum +
            t.getColorTexture(0).sizeInBytes +
            t.getColorTexture(1).sizeInBytes,
          0,
        ) +
        e.waves._state.bands.reduce((sum, b) => sum + b.initial.sizeInBytes, 0);
      const continuity = [];
      // Explicit camera samples exercise uninterrupted changes without wall-clock sleeps.
      for (let i = 0; i <= 24; ++i) {
        const range = 800 * Math.pow(2500, i / 24),
          pitch = -0.08 - (1.35 * i) / 24;
        e.viewer.camera.lookAt(
          target,
          new C.HeadingPitchRange(0.45, pitch, range),
        );
        e.viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
        s.initializeFrame();
        s.render(e.viewer.clock.currentTime);
        continuity.push(e.water.statistics.selectedTiles);
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const waves = e.waves,
        water = e.water,
        texture = waves._state.bands[0].output.getColorTexture(0);
      e.destroy();
      return {
        continuity,
        fft,
        destroyed:
          water.isDestroyed() &&
          waves.isDestroyed() &&
          texture.isDestroyed() &&
          e.viewer.isDestroyed(),
      };
    }, sample);
    expect(
      measurements.every(
        (m) =>
          m.selectedTiles <= 512 &&
          m.inactiveGeometryBytes <= 16 * 1048576 &&
          m.geometryBuilds === 0,
      ),
    ).toBe(true);
    expect(result.continuity.every((n) => n > 0 && n <= 512)).toBe(true);
    expect(result.fft.bands).toBe(3);
    expect(result.fft.draws).toBe(48);
    expect(result.destroyed).toBe(true);
    expect(errors).toEqual([]);
    console.log(sample, measurements, result.fft);
  });
}

import { test, expect } from "@playwright/test";
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
    await page.evaluate(() => {
      window.example.viewer.useDefaultRenderLoop = false;
      window.example.viewer.clock.shouldAnimate = false;
    });
    await page.screenshot({
      path: testInfo.outputPath(`${sample}-overview.png`),
    });
    const measurements = [];
    for (const name of ["高空", "低角度远眺", "水面近景"]) {
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
    expect(result.destroyed).toBe(true);
    expect(errors).toEqual([]);
    console.log(sample, measurements);
  });
}

import { test, expect } from "@playwright/test";
for (const world of ["planar", "globe"]) {
  test(`Xuanwu Lake ${world} initializes, changes wind/view and releases shared resources`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/玄武湖风浪.html?world=${world}`);
    await page.waitForFunction(
      () => window.example?.waters[0]?.ready && window.example.waves.ready,
    );
    await expect(page.locator("#error")).toHaveText("");
    await page.screenshot({
      path: testInfo.outputPath(`${world}-lake-near.png`),
    });
    expect(
      await page.evaluate(
        () => window.example.waters[0]._hierarchy.holes.length,
      ),
    ).toBe(7);
    expect(
      await page.evaluate(async () => {
        const C = await import("/Build/CesiumUnminified/index.js"),
          e = window.example;
        return C.Cartesian3.distance(
          e.viewer.camera.positionWC,
          C.Matrix4.getTranslation(e.waters[0].modelMatrix, new C.Cartesian3()),
        );
      }),
    ).toBeLessThan(1000);
    await page.getByRole("button", { name: "强风", exact: true }).click();
    await page.waitForFunction(
      () =>
        window.example.waves.windSpeed === 14 &&
        window.example.waves.significantWaveHeight > 0.25,
    );
    await page
      .getByRole("combobox", { name: "观察位置", exact: true })
      .selectOption({ label: "全湖鸟瞰" });
    await expect(
      page.getByRole("combobox", { name: "观察位置", exact: true }),
    ).toHaveValue("全湖鸟瞰");
    await page
      .getByRole("checkbox", { name: "时间动画", exact: true })
      .uncheck();
    const result = await page.evaluate(async () => {
      const e = window.example,
        s = e.viewer.scene;
      await new Promise((resolve) => {
        const remove = s.postRender.addEventListener(() => {
          remove();
          resolve();
        });
      });
      const time = e.waves._state.seconds;
      await new Promise((resolve) => {
        const remove = s.postRender.addEventListener(() => {
          remove();
          resolve();
        });
      });
      const frozen = e.waves._state.seconds === time;
      const waves = e.waves,
        surface = e.waters[0],
        texture = waves._state.bands[0].output.getColorTexture(0);
      e.destroy();
      return {
        frozen,
        waves: waves.isDestroyed(),
        surface: surface.isDestroyed(),
        texture: texture.isDestroyed(),
        viewer: e.viewer.isDestroyed(),
      };
    });
    expect(result).toEqual({
      frozen: true,
      waves: true,
      surface: true,
      texture: true,
      viewer: true,
    });
    expect(errors).toEqual([]);
  });
}

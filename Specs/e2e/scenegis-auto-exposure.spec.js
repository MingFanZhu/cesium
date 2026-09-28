import { test, expect } from "@playwright/test";

test.use({
  launchOptions: {
    args:
      process.platform === "win32" ? ["--use-angle=d3d11"] : ["--use-angle=gl"],
  },
});

for (const world of ["planar", "globe"]) {
  test(`${world} eye adaptation responds to lighting and preserves navigation`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/自动曝光.html?world=${world}`);
    await page.waitForFunction(
      () =>
        document.getElementById("error").textContent ||
        (window.example?.state.ready &&
          window.example.models.every((model) => model.ready) &&
          window.example.autoExposure.ready),
    );
    await expect(page.locator("#error")).toHaveText("");
    await page
      .getByRole("button", { name: "立即重新测光", exact: true })
      .click();
    const sample = () =>
      page.evaluate(async () => {
        const { Pass } = await import("/Build/CesiumUnminified/index.js");
        const e = window.example,
          s = e.autoExposure._state;
        const pixel = e.viewer.scene.context.readPixels({
          framebuffer: s.result.framebuffer,
          width: 1,
          height: 1,
        });
        return {
          gain: pixel[1],
          target: pixel[2],
          camera: Array.from(e.viewer.camera.viewMatrix),
          draws: e.viewer.scene.frameState.commandList.filter(
            (command) => command.pass === Pass.OPAQUE,
          ).length,
        };
      });
    const before = await sample();
    const lighting = () =>
      page.evaluate(() => {
        const scene = window.example.viewer.scene;
        const command = scene.frameState.commandList.find(
          (c) => c.uniformMap?.model_sphericalHarmonicCoefficients,
        );
        return {
          indirect:
            command.uniformMap.model_sphericalHarmonicCoefficients()[0].x,
          background: scene.frameState.backgroundColor.red,
        };
      });
    const daylight = await lighting();
    await page
      .getByRole("combobox", { name: "环境亮度", exact: true })
      .selectOption({ label: "黄昏" });
    await expect
      .poll(async () => (await lighting()).indirect)
      .toBeCloseTo(daylight.indirect / 20, 5);
    await expect
      .poll(async () => (await lighting()).background)
      .toBeCloseTo(daylight.background / 20, 5);
    await expect
      .poll(async () => (await sample()).target)
      .toBeCloseTo(before.target + Math.log2(20), 2);
    await page
      .getByRole("combobox", { name: "环境亮度", exact: true })
      .selectOption({ label: "日光" });
    await page
      .getByRole("button", { name: "立即重新测光", exact: true })
      .click();
    await page
      .getByRole("combobox", { name: "环境亮度", exact: true })
      .selectOption({ label: "夜间" });
    await expect
      .poll(async () => (await sample()).gain)
      .toBeGreaterThan(before.gain + 0.5);
    const moving = await sample();
    expect(moving.target).toBeGreaterThan(moving.gain);
    await page
      .getByRole("checkbox", { name: "锁定当前曝光", exact: true })
      .check();
    const locked = await sample();
    await page
      .getByRole("combobox", { name: "环境亮度", exact: true })
      .selectOption({ label: "日光" });
    await page.evaluate(() => window.example.viewer.render());
    expect((await sample()).gain).toBeCloseTo(locked.gain, 5);
    await page
      .getByRole("checkbox", { name: "自动曝光", exact: true })
      .uncheck();
    await page.waitForFunction(
      () =>
        !window.example.viewer.scene.postProcessStages
          ._sceneGISAutoExposureActive,
    );
    expect(
      await page.evaluate(() => window.example.autoExposure._state),
    ).toBeUndefined();
    await page.getByRole("checkbox", { name: "自动曝光", exact: true }).check();
    await page.waitForFunction(() => window.example.autoExposure.ready);
    const after = await sample();
    after.camera.forEach((v, i) => expect(v).toBeCloseTo(before.camera[i], 7));
    expect(after.draws).toBe(before.draws);
    await page.setViewportSize({ width: 1031, height: 647 });
    await page
      .getByRole("checkbox", { name: "锁定当前曝光", exact: true })
      .uncheck();
    await page.waitForFunction(
      () => window.example.autoExposure._state.gridSize.x === 128,
    );
    await page.mouse.move(600, 400);
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(
      (matrix) =>
        Array.from(window.example.viewer.camera.viewMatrix).some(
          (v, i) => Math.abs(v - matrix[i]) > 0.001,
        ),
      before.camera,
    );
    await expect(page.locator("#error")).toHaveText("");
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() => {
        const e = window.example,
          target = e.autoExposure._state.result.getColorTexture();
        e.destroy();
        return e.autoExposure.isDestroyed() && target.isDestroyed();
      }),
    ).toBe(true);
  });
}

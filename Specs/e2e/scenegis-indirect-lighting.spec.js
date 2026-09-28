import { test, expect } from "@playwright/test";

test.use({
  launchOptions: {
    args:
      process.platform === "win32" ? ["--use-angle=d3d11"] : ["--use-angle=gl"],
  },
});

for (const world of ["planar", "globe"]) {
  test(`${world} SSIL controls share opaque geometry and preserve navigation`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/屏幕空间间接光.html?world=${world}`);
    await page.waitForFunction(
      () =>
        document.getElementById("error").textContent ||
        (window.example?.models.length === 6 &&
          window.example.models.every((m) => m.ready) &&
          window.example.ssil.ready),
    );
    await expect(page.locator("#error")).toHaveText("");
    const before = await page.evaluate(() => ({
      camera: Array.from(window.example.viewer.camera.viewMatrix),
      draws: window.example.ssil._state.mainDraws,
    }));
    await page
      .getByRole("checkbox", { name: "屏幕空间间接光", exact: true })
      .uncheck();
    await page.waitForFunction(() => !window.example.ssil.ready);
    const unchanged = await page.evaluate(() =>
      Array.from(window.example.viewer.camera.viewMatrix),
    );
    unchanged.forEach((value, i) =>
      expect(value).toBeCloseTo(before.camera[i], 7),
    );
    await page
      .getByRole("checkbox", { name: "屏幕空间间接光", exact: true })
      .check();
    await page.getByRole("checkbox", { name: "环境遮挡", exact: true }).check();
    await page
      .getByRole("checkbox", { name: "屏幕空间反射", exact: true })
      .check();
    await page.waitForFunction(
      () =>
        window.example.ssil.ready &&
        window.example.ssr.ready &&
        window.example.ssr._state.main.ao,
    );
    expect(
      await page.evaluate(() => ({
        prepass:
          window.example.viewer.scene.postProcessStages.ambientOcclusion
            ._sceneGISAmbientOcclusion.prepassDraws,
        replay: window.example.ssr._state.captureDraws,
        main: window.example.ssr._state.mainDraws,
        attachments:
          window.example.ssr._state.main.framebuffer.numberOfColorAttachments,
      })),
    ).toEqual({ prepass: 0, replay: 0, main: 6, attachments: 7 });
    await page
      .getByRole("combobox", { name: "抗锯齿", exact: true })
      .selectOption({ label: "4×MSAA" });
    await page.waitForFunction(
      () =>
        window.example.ssr._state.main.numSamples === 4 &&
        window.example.ssil.ready,
    );
    await page.setViewportSize({ width: 1031, height: 647 });
    await page.waitForFunction(
      () =>
        window.example.ssil._state.result.getColorTexture().width ===
          window.example.viewer.scene.drawingBufferWidth &&
        window.example.ssil.ready,
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
    expect(await page.evaluate(() => window.example.ssr._state.mainDraws)).toBe(
      before.draws,
    );
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(() => {
        const e = window.example;
        const target = e.ssil._state.result.getColorTexture();
        e.destroy();
        return e.ssil.isDestroyed() && target.isDestroyed();
      }),
    ).toBe(true);
  });
}

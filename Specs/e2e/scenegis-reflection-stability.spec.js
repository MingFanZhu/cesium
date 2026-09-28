import { test, expect } from "@playwright/test";

test.use({
  launchOptions: {
    args:
      process.platform === "win32" ? ["--use-angle=d3d11"] : ["--use-angle=gl"],
  },
});

for (const world of ["planar", "globe"]) {
  test(`${world} reflection quality controls preserve navigation and render after zoom`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/反射稳定性.html?world=${world}`);
    await page.waitForFunction(() => {
      const e = window.example;
      return (
        document.getElementById("error")?.textContent ||
        (e?.models.length === 5 &&
          e.models.every((model) => model.ready) &&
          e.ssr.ready)
      );
    });
    await expect(page.locator("#error")).toHaveText("");
    await page
      .getByRole("combobox", { name: "反射分辨率", exact: true })
      .selectOption({ label: "全分辨率" });
    await page
      .getByRole("checkbox", { name: "反射时域滤波", exact: true })
      .uncheck();
    await page.waitForFunction(
      () =>
        window.example.ssr.ready &&
        window.example.ssr._state.tracing.scale === 1,
    );
    expect(
      await page.evaluate(() => window.example.ssr.temporalFiltering),
    ).toBe(false);
    await page
      .getByRole("combobox", { name: "反射分辨率", exact: true })
      .selectOption({ label: "半分辨率" });
    await page
      .getByRole("checkbox", { name: "反射时域滤波", exact: true })
      .check();
    const before = await page.evaluate(() => {
      const p = window.example.viewer.camera.position;
      return [p.x, p.y, p.z];
    });
    await page.mouse.move(600, 420);
    await page.mouse.wheel(0, -180);
    await page.waitForFunction((before) => {
      const e = window.example,
        p = e.viewer.camera.position;
      return (
        e.ssr.ready &&
        Math.hypot(p.x - before[0], p.y - before[1], p.z - before[2]) > 0.1
      );
    }, before);
    await page
      .getByRole("button", { name: "清除反射历史", exact: true })
      .click();
    await page.waitForFunction(() => window.example.ssr.ready);
    const result = await page.evaluate(() => {
      const e = window.example,
        s = e.viewer.scene;
      return {
        scale: e.ssr.resolutionScale,
        temporal: e.ssr.temporalFiltering,
        valid: e.ssr._state.tracing.valid,
        navigation:
          e.viewer.planarCameraController?.enabled ??
          s.screenSpaceCameraController.enableInputs,
        width: e.ssr._state.tracing.raw.getColorTexture(0).width,
        expected: Math.ceil(s.drawingBufferWidth / 2),
        error: document.getElementById("error").textContent,
      };
    });
    expect(result.scale).toBe(0.5);
    expect(result.temporal).toBe(true);
    expect(result.valid).toBe(true);
    expect(result.navigation).toBe(true);
    expect(result.width).toBe(result.expected);
    expect(result.error).toBe("");
    expect(errors).toEqual([]);
  });
}

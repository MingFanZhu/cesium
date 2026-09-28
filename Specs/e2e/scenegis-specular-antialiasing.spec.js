import { test, expect } from "@playwright/test";

test.use({
  launchOptions: {
    args:
      process.platform === "win32" ? ["--use-angle=d3d11"] : ["--use-angle=gl"],
  },
});

for (const world of ["planar", "globe"]) {
  test(`${world} specular filtering composes with AA and preserves navigation`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/高光抗锯齿.html?world=${world}`);
    await page.waitForFunction(
      () =>
        document.getElementById("error").textContent ||
        (window.example?.models.length === 42 &&
          window.example.models.every((m) => m.ready)),
    );
    await expect(page.locator("#error")).toHaveText("");
    const offscreen = await page.evaluate(() => {
      const s = window.example.viewer.scene;
      return {
        camera: Array.from(s.camera.viewMatrix),
        position: [
          s.camera.positionWC.x,
          s.camera.positionWC.y,
          s.camera.positionWC.z,
        ],
        draws: s.frameState.commandList.length,
      };
    });
    await page
      .getByRole("checkbox", { name: "高光抗锯齿", exact: true })
      .uncheck();
    await page.waitForFunction(
      () =>
        window.example.viewer.scene.frameState
          ._sceneGISSpecularAntialiasingEnabled === false,
    );
    const afterToggle = await page.evaluate(() =>
      Array.from(window.example.viewer.camera.viewMatrix),
    );
    afterToggle.forEach((value, index) =>
      expect(value).toBeCloseTo(offscreen.camera[index], 7),
    );
    await page
      .getByRole("checkbox", { name: "高光抗锯齿", exact: true })
      .check();
    await page
      .getByRole("combobox", { name: "轮廓抗锯齿", exact: true })
      .selectOption({ label: "TAA" });
    await page.waitForFunction(() => window.example.taa.ready);
    await page
      .getByRole("combobox", { name: "轮廓抗锯齿", exact: true })
      .selectOption({ label: "4×MSAA" });
    await page.mouse.move(650, 430);
    await page.mouse.wheel(0, -100);
    await page.waitForFunction((before) => {
      const p = window.example.viewer.camera.positionWC;
      return (
        Math.hypot(p.x - before[0], p.y - before[1], p.z - before[2]) > 0.01
      );
    }, offscreen.position);
    await expect(page.locator("#error")).toHaveText("");
    const end = await page.evaluate(() => {
      const e = window.example,
        s = e.viewer.scene;
      return {
        aa: e.specularAA.enabled,
        taa: e.taa.enabled,
        samples: s._view.globeDepth.colorFramebufferManager.numSamples,
        input:
          e.viewer.planarCameraController?.enabled ??
          s.screenSpaceCameraController.enableInputs,
        draws: s.frameState.commandList.length,
      };
    });
    expect(end.aa).toBe(true);
    expect(end.taa).toBe(false);
    expect(end.samples).toBe(4);
    expect(end.input).toBe(true);
    expect(end.draws).toBe(offscreen.draws);
    expect(errors).toEqual([]);
    const destroyed = await page.evaluate(() => {
      const e = window.example;
      e.destroy();
      return e.specularAA.isDestroyed();
    });
    expect(destroyed).toBe(true);
  });
}

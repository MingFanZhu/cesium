import { test, expect } from "@playwright/test";

// Match the Windows Chromium/IAB backend used for the physical atmosphere.
test.use({
  launchOptions: {
    args:
      process.platform === "win32" ? ["--use-angle=d3d11"] : ["--use-angle=gl"],
  },
});

for (const world of ["planar", "globe"]) {
  test(`${world} local probes update explicitly and compose with GTAO/SSR`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/局部环境探针.html?world=${world}`);
    await page.waitForFunction(
      () =>
        window.example?.state.ready ||
        document.getElementById("error")?.textContent,
    );
    await expect(page.locator("#error")).toHaveText("");
    const camera = await page.evaluate(() => {
      const c = window.example.viewer.camera;
      return [c.position, c.direction, c.up].map((v) => [v.x, v.y, v.z]);
    });
    await page
      .getByRole("button", { name: "捕获 / 更新探针", exact: true })
      .click();
    await expect(page.locator("#status")).toContainText("第 1 次捕获完成");
    await page
      .getByRole("checkbox", { name: "移动屏幕外红墙", exact: true })
      .check();
    expect(await page.evaluate(() => window.example.probe.generation)).toBe(1);
    await page
      .getByRole("button", { name: "捕获 / 更新探针", exact: true })
      .click();
    await expect(page.locator("#status")).toContainText("第 2 次捕获完成");
    await page
      .getByRole("checkbox", { name: "接触遮蔽 GTAO", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "屏幕空间反射", exact: true })
      .check();
    const result = await page.evaluate(async () => {
      const e = window.example;
      const s = e.viewer.scene;
      const published = e.probe._maps;
      await new Promise((resolve) => {
        const off = s.postRender.addEventListener(() => {
          off();
          resolve();
        });
        s.requestRender();
      });
      return {
        camera: [s.camera.position, s.camera.direction, s.camera.up].map(
          (v) => [v.x, v.y, v.z],
        ),
        reused: e.probe._maps === published && e.probe.generation === 2,
        hdr: s.highDynamicRange,
        captures: e.probes._state.captures,
        error: document.getElementById("error").textContent,
        navigation:
          e.viewer.planarCameraController?.enabled ??
          s.screenSpaceCameraController.enableInputs,
      };
    });
    // Native Globe navigation can renormalize the basis at machine precision.
    for (let vector = 0; vector < 3; vector++) {
      for (let axis = 0; axis < 3; axis++) {
        expect(result.camera[vector][axis]).toBeCloseTo(
          camera[vector][axis],
          10,
        );
      }
    }
    expect(result.reused).toBe(true);
    expect(result.hdr).toBe(true);
    expect(result.navigation).toBe(true);
    expect(result.captures).toBe(2);
    expect(result.error).toBe("");
    expect(errors).toEqual([]);
  });
}

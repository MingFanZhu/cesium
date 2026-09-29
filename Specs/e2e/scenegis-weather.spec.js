import { test, expect } from "@playwright/test";

for (const world of ["globe", "planar"]) {
  test(`Weather ${world} loads the reference, changes view and releases resources`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const dataResponses = [];
    page.on("response", (response) => {
      if (new URL(response.url()).pathname === "/v1/assets/96188/endpoint") {
        dataResponses.push(response.status());
      }
    });
    await page.goto(`/Test/Rendering/鸟瞰天气.html?world=${world}`);
    await page.waitForFunction(
      () =>
        (window.example?.reference.visible ||
          window.example?.reference.primitive?.ready) &&
        window.example.weather.textureMemoryInBytes > 0,
    );
    await expect(page.locator("#error")).toHaveText("");
    await expect(page.getByLabel("阴天云层", { exact: true })).toHaveCount(0);
    if (world === "globe") {
      expect(dataResponses).toEqual([200]);
      await expect(page.locator("#data-status")).toContainText("Cesium ion");
      await expect(page.locator("#city-credit")).toBeVisible();
      await page.waitForFunction(
        () => window.example.viewer.imageryLayers.get(0).ready,
      );
    } else {
      expect(dataResponses).toEqual([]);
      await expect(page.locator("#data-status")).toHaveText("本地示意街区");
      await expect(page.locator("#city-credit")).toBeHidden();
    }
    await page
      .getByRole("combobox", { name: "观察高度", exact: true })
      .selectOption({ label: "街区鸟瞰" });
    await page
      .getByRole("combobox", { name: "天气预设", exact: true })
      .selectOption({ label: "大雪" });
    await expect(
      page.getByRole("combobox", { name: "降水类型", exact: true }),
    ).toHaveValue("雪");
    await expect(page.locator("#error")).toHaveText("");
    const released = await page.evaluate(() => {
      const { viewer, weather, reference, destroy } = window.example;
      destroy();
      return [
        viewer.isDestroyed(),
        weather.isDestroyed(),
        reference.primitive.isDestroyed(),
      ];
    });
    expect(released).toEqual([true, true, true]);
    expect(errors).toEqual([]);
  });
}

test("Weather reports an ion authorization failure without local buildings", async ({
  page,
}) => {
  await page.route("**/v1/assets/96188/endpoint?*", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "INVALID_TOKEN",
        message: "Test authorization failure",
      }),
    }),
  );
  await page.goto("/Test/Rendering/鸟瞰天气.html?world=globe");
  await expect(page.locator("#error")).toContainText("OSM Buildings 加载失败");
  await expect(page.locator("#data-status")).toContainText("加载失败");
  expect(
    await page.evaluate(() => window.example.reference.primitive === undefined),
  ).toBe(true);
  await page.evaluate(() => window.example.destroy());
});

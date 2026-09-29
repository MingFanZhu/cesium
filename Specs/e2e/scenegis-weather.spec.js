import { test, expect } from "@playwright/test";

for (const world of ["globe", "planar"]) {
  test(`Weather ${world} loads the reference, changes view and releases resources`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const dataResponses = [];
    page.on("response", (response) => {
      if (response.url().endsWith("NanjingBuildings/buildings.geojson")) {
        dataResponses.push(response.status());
      }
    });
    await page.goto(`/Test/Rendering/鸟瞰天气.html?world=${world}`);
    await page.waitForFunction(
      () =>
        window.example?.cityPrimitive.ready &&
        window.example.weather.textureMemoryInBytes > 0,
    );
    await expect(page.locator("#error")).toHaveText("");
    await expect(page.getByLabel("阴天云层", { exact: true })).toHaveCount(0);
    if (world === "globe") {
      expect(dataResponses).toEqual([200]);
      await expect(page.locator("#data-status")).toContainText("5607");
      await expect(page.locator("#city-credit")).toBeVisible();
      const reference = await page.evaluate(() => window.example.reference);
      expect(reference.heightCounts).toMatchObject({
        height: 501,
        levels: 315,
        estimated: 4791,
        holes: 37,
      });
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
      const { viewer, weather, cityPrimitive, destroy } = window.example;
      destroy();
      return [
        viewer.isDestroyed(),
        weather.isDestroyed(),
        cityPrimitive.isDestroyed(),
      ];
    });
    expect(released).toEqual([true, true, true]);
    expect(errors).toEqual([]);
  });
}

import { test, expect } from "@playwright/test";

for (const world of ["globe", "planar"]) {
  test(`Surface weather ${world} loads local materials and releases its setting`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/地表雨雪.html?world=${world}`);
    await expect(page.locator("#status")).toHaveText("本地场景已加载");
    for (const label of ["干燥", "湿润", "积雪"]) {
      await page
        .getByRole("combobox", { name: "地表预设", exact: true })
        .selectOption({ label });
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            window.example.viewer.scene.postRender.addEventListener(
              function once() {
                window.example.viewer.scene.postRender.removeEventListener(
                  once,
                );
                resolve();
              },
            ),
          ),
      );
      await expect(page.locator("#error")).toHaveText("");
    }
    expect(
      await page.evaluate(() => {
        const { surfaceWeather, destroy } = window.example;
        destroy();
        return surfaceWeather.isDestroyed();
      }),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}

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
    await page
      .getByRole("combobox", { name: "地表预设", exact: true })
      .selectOption({ label: "积雪" });
    await page.waitForFunction(
      () => window.example.surfaceWeather._state?.active,
    );
    expect(
      await page.evaluate(() => window.example.surfaceWeather.snowCoverage),
    ).toBe(0.95);
    await expect(page.locator("#error")).toHaveText("");
    const released = await page.evaluate(() => {
      const { viewer, weather, surfaceWeather, reference, destroy } =
        window.example;
      destroy();
      return [
        viewer.isDestroyed(),
        weather.isDestroyed(),
        reference.primitive.isDestroyed(),
        surfaceWeather.isDestroyed(),
      ];
    });
    expect(released).toEqual([true, true, true, true]);
    expect(errors).toEqual([]);
  });
}

test("Weather uses session authorization for every initial ion provider", async ({
  page,
}) => {
  const token = "scenegis-weather-test-token";
  await page.addInitScript((value) => {
    window.sessionStorage.setItem("sceneGIS.ionAccessToken", value);
  }, token);
  const requests = new Map();
  await page.route("https://api.cesium.com/v1/assets/*/endpoint?*", (route) => {
    const url = new URL(route.request().url());
    requests.set(url.pathname, url.searchParams.get("access_token"));
    return route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "INVALID_TOKEN" }),
    });
  });
  await page.goto("/Test/Rendering/鸟瞰天气.html?world=globe");
  await expect.poll(() => requests.size).toBe(3);
  expect([...requests.values()]).toEqual([token, token, token]);
  expect(new URL(page.url()).searchParams.has("access_token")).toBe(false);
  await page.waitForFunction(() => window.example !== undefined);
  await page.evaluate(() => window.example.destroy());
});

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

import { test, expect } from "@playwright/test";

for (const world of ["globe", "planar"]) {
  test(`Snow details ${world} exposes melting controls and native disposal`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/降雪细节.html?world=${world}`);
    await expect(page.locator("#status")).toHaveText("本地场景已加载");
    await page.waitForFunction(
      () => window.example.snowLens.ready && window.example.reflections.ready,
    );
    const lens = page.getByRole("checkbox", { name: "镜头雪点", exact: true });
    await lens.uncheck();
    expect(
      await page.evaluate(() => [
        window.example.snowLens.enabled,
        window.example.surfaceWeather.enabled,
      ]),
    ).toEqual([false, true]);
    await lens.check();
    for (const [name, value] of [
      ["雪点尺度（像素）", "36"],
      ["融化周期（秒）", "10"],
    ]) {
      const input = page.getByRole("textbox", { name, exact: true });
      await input.fill(value);
      await input.press("Tab");
    }
    await page
      .getByRole("checkbox", { name: "场景时间推进", exact: true })
      .uncheck();
    expect(
      await page.evaluate(() => {
        const { snowLens, viewer, surfaceWeather } = window.example;
        return [
          snowLens.enabled,
          snowLens.flakeSize,
          snowLens.meltDuration,
          viewer.clock.shouldAnimate,
          surfaceWeather.rippleIntensity,
        ];
      }),
    ).toEqual([true, 36, 10, false, 0]);
    await expect(page.locator("#error")).toHaveText("");
    expect(
      await page.evaluate(() => {
        const { snowLens, destroy } = window.example;
        destroy();
        return snowLens.isDestroyed();
      }),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
  test(`Rain details ${world} exposes independent controls and native disposal`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`/Test/Rendering/降雨细节.html?world=${world}`);
    await expect(page.locator("#status")).toHaveText("本地场景已加载");
    await page.waitForFunction(
      () => window.example.reflections.ready && window.example.rainLens.ready,
    );
    const ripple = page.getByRole("checkbox", {
      name: "湿地涟漪",
      exact: true,
    });
    const lens = page.getByRole("checkbox", { name: "镜头雨滴", exact: true });
    await lens.uncheck();
    expect(
      await page.evaluate(() => [
        window.example.rainLens.enabled,
        window.example.surfaceWeather.rippleIntensity > 0,
      ]),
    ).toEqual([false, true]);
    await ripple.uncheck();
    await lens.check();
    expect(
      await page.evaluate(() => [
        window.example.rainLens.enabled,
        window.example.surfaceWeather.rippleIntensity,
      ]),
    ).toEqual([true, 0]);
    await ripple.check();
    await page
      .getByRole("checkbox", { name: "场景时间推进", exact: true })
      .uncheck();
    await page
      .getByRole("combobox", { name: "观察视角", exact: true })
      .selectOption({ label: "鸟瞰淡出" });
    await page
      .getByRole("combobox", { name: "观察视角", exact: true })
      .selectOption({ label: "近看地面" });
    await expect(page.locator("#error")).toHaveText("");
    expect(
      await page.evaluate(() => {
        const { rainLens, surfaceWeather, reflections, destroy } =
          window.example;
        destroy();
        return [
          rainLens.isDestroyed(),
          surfaceWeather.isDestroyed(),
          reflections.isDestroyed(),
        ];
      }),
    ).toEqual([true, true, true]);
    expect(errors).toEqual([]);
  });
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
    const ssr = page.getByRole("checkbox", { name: "模型 SSR", exact: true });
    await expect(ssr).not.toBeChecked();
    await ssr.check();
    await page.waitForFunction(() => window.example.reflections.ready);
    await ssr.uncheck();
    expect(await page.evaluate(() => window.example.reflections.enabled)).toBe(
      false,
    );
    await page.waitForFunction(() => window.example.effects.showHeightFog);
    await page.waitForFunction(
      () =>
        window.example.rainLens.enabled &&
        !window.example.snowLens.enabled &&
        window.example.surfaceWeather.rippleIntensity > 0,
    );
    const wetnessInput = page.getByRole("textbox", {
      name: "湿润程度",
      exact: true,
    });
    await wetnessInput.fill("0.42");
    await wetnessInput.press("Tab");
    expect(
      await page.evaluate(() => window.example.surfaceWeather.wetness),
    ).toBe(0.42);
    const baseline = await page.evaluate(() => {
      const { viewer, effects, surfaceWeather } = window.example;
      return {
        surfaceScale: effects.surfaceRadianceScale,
        backgroundScale: effects.backgroundRadianceScale,
        exposure: viewer.scene.postProcessStages.exposure,
        wetness: surfaceWeather.wetness,
        snowCoverage: surfaceWeather.snowCoverage,
      };
    });
    await page
      .getByRole("combobox", { name: "天气预设", exact: true })
      .selectOption({ label: "晴" });
    await page.waitForFunction(
      () =>
        window.example.weather.actualIntensity === 0 &&
        !window.example.effects.showHeightFog,
    );
    expect(
      await page.evaluate(() => {
        const { viewer, effects, surfaceWeather } = window.example;
        return {
          surfaceScale: effects.surfaceRadianceScale,
          backgroundScale: effects.backgroundRadianceScale,
          exposure: viewer.scene.postProcessStages.exposure,
          wetness: surfaceWeather.wetness,
          snowCoverage: surfaceWeather.snowCoverage,
          fogDensity: effects.heightFogDensity,
        };
      }),
    ).toEqual({ ...baseline, fogDensity: 0 });
    const surfaceToggle = page.getByRole("checkbox", {
      name: "显示地表覆盖",
      exact: true,
    });
    await expect(surfaceToggle).not.toBeChecked();
    expect(
      await page.evaluate(() => [
        window.example.rainLens.enabled,
        window.example.snowLens.enabled,
        window.example.surfaceWeather.rippleIntensity,
      ]),
    ).toEqual([false, false, 0]);
    expect(
      await page.evaluate(() => window.example.surfaceWeather.enabled),
    ).toBe(false);
    // Explicit user overrides remain available even under the clear preset.
    await surfaceToggle.check();
    expect(
      await page.evaluate(() => window.example.surfaceWeather.enabled),
    ).toBe(true);
    await surfaceToggle.uncheck();
    await page
      .getByRole("combobox", { name: "观察高度", exact: true })
      .selectOption({ label: "街区鸟瞰" });
    await page
      .getByRole("combobox", { name: "天气预设", exact: true })
      .selectOption({ label: "大雪" });
    await expect(
      page.getByRole("combobox", { name: "降水类型", exact: true }),
    ).toHaveValue("雪");
    await expect(surfaceToggle).toBeChecked();
    expect(
      await page.evaluate(() => window.example.surfaceWeather.wetness),
    ).toBe(baseline.wetness);
    await page.waitForFunction(() => window.example.effects.showHeightFog);
    await page.waitForFunction(
      () => window.example.snowLens.ready && window.example.snowLens.enabled,
    );
    expect(
      await page.evaluate(() => [
        window.example.rainLens.enabled,
        window.example.snowLens.enabled,
        window.example.surfaceWeather.rippleIntensity,
      ]),
    ).toEqual([false, true, 0]);
    const snowLensToggle = page.getByRole("checkbox", {
      name: "镜头雪点",
      exact: true,
    });
    await snowLensToggle.uncheck();
    await page.waitForFunction(() => !window.example.snowLens.enabled);
    await snowLensToggle.check();
    const precipitationToggle = page.getByRole("checkbox", {
      name: "显示降水",
      exact: true,
    });
    await precipitationToggle.uncheck();
    await page.waitForFunction(
      () =>
        !window.example.snowLens.enabled && !window.example.rainLens.enabled,
    );
    await precipitationToggle.check();
    await page.waitForFunction(() => window.example.snowLens.enabled);
    await page
      .getByRole("checkbox", { name: "能见度随天气变化", exact: true })
      .uncheck();
    await page.waitForFunction(
      () =>
        !window.example.effects.showHeightFog &&
        window.example.effects.heightFogDensity === 0,
    );
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
      const {
        viewer,
        weather,
        surfaceWeather,
        reflections,
        snowLens,
        rainLens,
        reference,
        destroy,
      } = window.example;
      destroy();
      return [
        viewer.isDestroyed(),
        weather.isDestroyed(),
        reference.primitive.isDestroyed(),
        surfaceWeather.isDestroyed(),
        reflections.isDestroyed(),
        snowLens.isDestroyed(),
        rainLens.isDestroyed(),
      ];
    });
    expect(released).toEqual([true, true, true, true, true, true, true]);
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

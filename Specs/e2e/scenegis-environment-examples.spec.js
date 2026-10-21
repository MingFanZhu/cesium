import { test, expect } from "@playwright/test";

const features = ["物理大气", "高度雾", "体积云", "日月光照", "泛光与光晕"];

for (const world of ["globe", "planar"]) {
  test(`Integrated environment ${world}: defaults, native widgets and lifecycle`, async ({
    page,
  }, info) => {
    test.setTimeout(120000);
    const errors = [];
    const external = [];
    const imageryRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "localhost" || url.protocol === "data:") {
        return route.continue();
      }
      if (
        url.hostname === "services.arcgisonline.com" &&
        /^\/ArcGIS\/rest\/services\/World_Imagery\/MapServer\/tile\/\d+\/\d+\/\d+$/.test(
          url.pathname,
        )
      ) {
        imageryRequests.push(url.pathname);
        return route.fulfill({
          path: "Specs/Data/Images/Red256x256.png",
          contentType: "image/png",
        });
      }
      external.push(url.href);
      return route.abort();
    });
    await page.goto(`/Test/AdvancedEnvironment/综合环境.html?world=${world}`);
    await page.waitForFunction(() => window.example?.effects.ready);
    const initial = await page.evaluate(async (world) => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const { viewer, effects, gui, environment, defaults } = window.example;
      // Freeze only the test. Cloud time's startup value is captured before
      // any animation ticks, independently of the native clock playback state.
      viewer.clock.shouldAnimate = false;
      const properties = Object.entries(
        Object.getOwnPropertyDescriptors(
          C.SceneGISEnvironmentEffects.prototype,
        ),
      )
        .filter(([, descriptor]) => descriptor.set !== undefined)
        .map(([name]) => name)
        .sort();
      const controls = gui
        .controllersRecursive()
        .filter((control) => control.object === effects)
        .map((control) => control.property)
        .sort();
      const element = document.createElement("div");
      element.style.cssText =
        "width:32px;height:32px;position:absolute;left:-100px";
      document.body.appendChild(element);
      const reference = new C.Viewer(element, {
        ...(world === "planar"
          ? {
              planarWorld: {
                crs: "LOCAL",
                extent: {
                  minimumX: -100000,
                  minimumY: -100000,
                  maximumX: 100000,
                  maximumY: 100000,
                },
                maximumLevel: 0,
              },
            }
          : { baseLayer: false }),
        useDefaultRenderLoop: false,
        baseLayerPicker: false,
        geocoder: false,
        animation: false,
        timeline: false,
        homeButton: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        fullscreenButton: false,
        infoBox: false,
        selectionIndicator: false,
      });
      const mismatches = properties.filter(
        (name) =>
          (name === "cloudTime" ? defaults[name] : effects[name]) !==
          reference.scene.environmentEffects[name],
      );
      const displayMatches =
        viewer.scene.highDynamicRange === reference.scene.highDynamicRange &&
        viewer.scene.postProcessStages.tonemapper ===
          reference.scene.postProcessStages.tonemapper &&
        viewer.scene.postProcessStages.exposure ===
          reference.scene.postProcessStages.exposure;
      reference.destroy();
      element.remove();
      const center =
        world === "globe"
          ? C.Cartographic.fromCartesian(viewer.camera.positionWC)
          : new C.WebMercatorProjection().unproject(viewer.camera.positionWC);
      const imageryLayer = (
        viewer.planarWorld?.imageryLayers ?? viewer.imageryLayers
      ).get(0);
      const provider = window.example.imageryProvider;
      return {
        imagery: {
          sameProvider: imageryLayer.imageryProvider === provider,
          projection:
            world === "planar"
              ? provider.tilingScheme === viewer.planarWorld.tilingScheme
              : provider.tilingScheme instanceof C.WebMercatorTilingScheme,
          maximumLevel: provider.maximumLevel,
          size: [provider.tileWidth, provider.tileHeight],
          alpha: provider.hasAlphaChannel,
          adjustments: [
            imageryLayer.alpha,
            imageryLayer.brightness,
            imageryLayer.contrast,
            imageryLayer.hue,
            imageryLayer.saturation,
            imageryLayer.gamma,
          ],
        },
        properties,
        controls,
        mismatches,
        displayMatches,
        defaultOwner: effects === viewer.scene.environmentEffects,
        autoExposureDisabled: !window.example.autoExposure.enabled,
        autoExposureUnallocated: !window.example.autoExposure._state,
        explicitEffects: viewer.scene.controllerHost._controllers.filter(
          (controller) => controller instanceof C.SceneGISEnvironmentEffects,
        ).length,
        location: [
          C.Math.toDegrees(center.longitude),
          C.Math.toDegrees(center.latitude),
          center.height,
        ],
        astronomical: environment?.directionMode,
        reference: environment
          ? [
              C.Math.toDegrees(environment.originLongitude),
              C.Math.toDegrees(environment.originLatitude),
            ]
          : undefined,
        imageryCount:
          viewer.baseLayerPicker?.viewModel.imageryProviderViewModels.length ??
          0,
        terrainCount:
          viewer.baseLayerPicker?.viewModel.terrainProviderViewModels.length ??
          0,
      };
    }, world);
    expect(initial.controls).toEqual(initial.properties);
    expect(initial.imagery).toEqual({
      sameProvider: true,
      projection: true,
      maximumLevel: 18,
      size: [256, 256],
      alpha: false,
      adjustments: [1, 1, 1, 0, 1, 1],
    });
    expect(imageryRequests.length).toBeGreaterThan(0);
    await expect(page.locator("#imageryError")).toBeEmpty();
    expect(initial.mismatches).toEqual([]);
    expect(initial.displayMatches).toBe(true);
    expect(initial.defaultOwner).toBe(true);
    expect(initial.autoExposureDisabled).toBe(true);
    expect(initial.autoExposureUnallocated).toBe(true);
    expect(initial.explicitEffects).toBe(0);
    expect(initial.location[0]).toBeCloseTo(118.7969, 5);
    expect(initial.location[1]).toBeCloseTo(32.0603, 5);
    expect(initial.location[2]).toBeCloseTo(2500, 3);
    await expect(
      page.locator(".cesium-viewer-animationContainer"),
    ).toBeVisible();
    await expect(page.locator(".cesium-timeline-main")).toBeVisible();
    if (world === "globe") {
      expect(initial.imageryCount).toBeGreaterThan(10);
      expect(initial.terrainCount).toBe(2);
      await page.locator(".cesium-baseLayerPicker-selected").click();
      await expect(
        page.locator(".cesium-baseLayerPicker-dropDown"),
      ).toBeVisible();
      await page
        .locator(".cesium-baseLayerPicker-item")
        .filter({ hasText: "WGS84 Ellipsoid" })
        .click();
    } else {
      expect(initial.astronomical).toBe("astronomical");
      expect(initial.reference[0]).toBeCloseTo(118.7969, 5);
      expect(initial.reference[1]).toBeCloseTo(32.0603, 5);
      expect(initial.imageryCount).toBe(0);
      await page.getByLabel("显示 World Imagery", { exact: true }).uncheck();
      expect(
        await page.evaluate(
          () => window.example.viewer.planarWorld.imageryLayers.get(0).show,
        ),
      ).toBe(false);
      await page.getByLabel("显示 World Imagery", { exact: true }).check();
    }
    const folder = (name) =>
      page.getByRole("button", { name: new RegExp(`${name}$`) });
    const control = (name) => page.getByLabel(name, { exact: true });
    await folder("天空与光照").click();
    await control("太阳白平衡（HDR / LDR）").uncheck();
    await page.waitForFunction(
      () =>
        window.example.effects.whiteBalance === false &&
        window.example.viewer.scene.postProcessStages
          ._sceneGISSolarWhiteBalanceEnabled === false,
    );
    await control("天空亮度").fill("3.25");
    await control("天空亮度").press("Tab");
    expect(
      await page.evaluate(() => window.example.effects.backgroundRadianceScale),
    ).toBe(3.25);
    if (world === "planar") {
      await expect(control("空气透视距离倍率")).toBeDisabled();
    }
    await folder("天空与光照").click();
    await folder("高度雾").click();
    await control("雾密度").fill("0.00004");
    await control("雾密度").press("Tab");
    expect(
      await page.evaluate(() => window.example.effects.heightFogDensity),
    ).toBe(0.00004);
    await folder("高度雾").click();
    await folder("体积云与云影").click();
    await control("云质量").selectOption({ label: "低" });
    await control("云时间（秒）").fill("42");
    await control("云时间（秒）").press("Tab");
    await control("体积云").check();
    const clock = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const { viewer, effects } = window.example;
      viewer.useDefaultRenderLoop = false;
      const clock = viewer.clock;
      clock.canAnimate = true;
      clock.clockStep = C.ClockStep.TICK_DEPENDENT;
      const values = [effects.cloudTime];
      clock.shouldAnimate = true;
      clock.multiplier = 3;
      clock.tick();
      values.push(effects.cloudTime);
      clock.multiplier = -2;
      clock.tick();
      values.push(effects.cloudTime);
      clock.shouldAnimate = false;
      clock.tick();
      values.push(effects.cloudTime);
      C.JulianDate.addHours(clock.currentTime, 1, clock.currentTime);
      clock.tick();
      values.push(effects.cloudTime);
      viewer.useDefaultRenderLoop = true;
      return values;
    });
    // JulianDate's split-day arithmetic can introduce sub-nanosecond rounding.
    [42, 45, 43, 43, 3643].forEach((expected, index) => {
      expect(clock[index]).toBeCloseTo(expected, 9);
    });
    await folder("体积云与云影").click();
    await folder("HDR 与曝光").click();
    await control("HDR 显示").check();
    await control("手动曝光").fill("2");
    await control("手动曝光").press("Tab");
    await control("HDR 显示").uncheck();
    await control("自动曝光").check();
    await page.waitForFunction(() => window.example.autoExposure.ready);
    await expect(control("HDR 显示")).toBeChecked();
    await control("锁定当前曝光").check();
    const readExposure = () =>
      page.evaluate(() => {
        const { viewer, autoExposure } = window.example;
        return Array.from(
          viewer.scene.context.readPixels({
            framebuffer: autoExposure._state.result.framebuffer,
            width: 1,
            height: 1,
          }),
        );
      });
    const locked = await readExposure();
    await control("曝光补偿（档）").fill("1");
    await control("曝光补偿（档）").press("Tab");
    await control("显示测光读数（诊断）").check();
    await expect(page.locator("#exposureStatus")).toContainText("合成");
    const compensated = await readExposure();
    expect(compensated[1]).toBeCloseTo(locked[1], 5);
    expect(locked[0] / compensated[0]).toBeCloseTo(2, 5);
    expect(1 / compensated[0]).toBeCloseTo(2 ** compensated[1] * 2 * 2, 3);
    await expect(page.locator("#exposureStatus")).toContainText(
      `合成 ${(1 / compensated[0]).toFixed(3)}×`,
    );
    await control("HDR 显示").uncheck();
    await expect(control("自动曝光")).not.toBeChecked();
    expect(
      await page.evaluate(() => ({
        released: window.example.autoExposure._state === undefined,
        manual: window.example.viewer.scene.postProcessStages.exposure,
      })),
    ).toEqual({ released: true, manual: 2 });
    await control("自动曝光").check();
    await page.waitForFunction(() => window.example.autoExposure.ready);
    await folder("HDR 与曝光").click();
    await folder("泛光与光晕").click();
    await control("泛光").check();
    await control("泛光强度").fill("0.2");
    await control("泛光强度").press("Tab");
    expect(
      await page.evaluate(() => window.example.effects.bloomIntensity),
    ).toBe(0.2);
    await folder("泛光与光晕").click();
    await page.waitForFunction(() => window.example.effects.ready);
    await page.screenshot({ path: info.outputPath(`${world}-adjusted.png`) });
    const beforeReset = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      return C.JulianDate.toIso8601(window.example.viewer.clock.currentTime);
    });
    await folder("恢复环境默认值").click();
    const restored = await page.evaluate(async () => {
      const C = await import("/Build/CesiumUnminified/index.js");
      const {
        effects,
        viewer,
        defaults,
        displayDefaults,
        autoExposure,
        autoExposureDefaults,
        exposureState,
      } = window.example;
      return {
        autoExposureMismatches: Object.keys(autoExposureDefaults).filter(
          (key) => autoExposure[key] !== autoExposureDefaults[key],
        ),
        diagnostics: exposureState.diagnostics,
        mismatches: Object.keys(defaults).filter(
          (key) => effects[key] !== defaults[key],
        ),
        hdr: viewer.scene.highDynamicRange === displayDefaults.highDynamicRange,
        exposure:
          viewer.scene.postProcessStages.exposure === displayDefaults.exposure,
        time: C.JulianDate.toIso8601(viewer.clock.currentTime),
      };
    });
    expect(restored).toEqual({
      autoExposureMismatches: [],
      diagnostics: false,
      mismatches: [],
      hdr: true,
      exposure: true,
      time: beforeReset,
    });
    await page.waitForFunction(() => window.example.effects.ready);
    await expect(page.locator("#error")).toBeEmpty();
    await page.screenshot({ path: info.outputPath(`${world}-defaults.png`) });
    const disposed = await page.evaluate(() => {
      const { viewer, effects, autoExposure } = window.example;
      const clock = viewer.clock;
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      );
      const retained = !viewer.isDestroyed();
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: false }),
      );
      window.example.destroy();
      const time = effects.cloudTime;
      clock.tick();
      return {
        retained,
        destroyed: viewer.isDestroyed(),
        autoExposureDestroyed: autoExposure.isDestroyed(),
        ready: effects.ready,
        stableTime: time === effects.cloudTime,
        tickListeners: clock.onTick.numberOfListeners,
        effectListeners: effects.errorEvent.numberOfListeners,
        imageryListeners:
          window.example.imageryProvider.errorEvent.numberOfListeners,
        gui: document.querySelectorAll(".lil-gui").length,
      };
    });
    expect(disposed).toEqual({
      retained: true,
      destroyed: true,
      autoExposureDestroyed: true,
      ready: false,
      stableTime: true,
      tickListeners: 0,
      effectListeners: 0,
      imageryListeners: 0,
      gui: 0,
    });
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const world of ["globe", "planar"]) {
  test(`Night stars ${world}: local assets, controls and camera`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const errors = [];
    const starRequests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (request.url().includes("tycho2t3_80")) {
        starRequests.push(request.url());
      }
    });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      return url.hostname === "localhost" || url.protocol === "data:"
        ? route.continue()
        : route.abort();
    });
    await page.goto(`/Test/AdvancedEnvironment/夜晚星空.html?world=${world}`);
    await page.waitForFunction(() => window.example?.effects.ready);
    const camera = await page.evaluate(() => {
      const { viewer, effects } = window.example;
      return {
        z: viewer.camera.positionWC.z,
        stars: effects.showStars,
        mode: effects.mode,
      };
    });
    expect(camera.stars).toBe(true);
    expect(camera.mode).toBe(world);
    if (world === "planar") {
      expect(camera.z).toBeCloseTo(200, 3);
    }
    await page.getByLabel("星空", { exact: true }).uncheck();
    expect(await page.evaluate(() => window.example.effects.showStars)).toBe(
      false,
    );
    await page.getByLabel("星空", { exact: true }).check();
    await page.getByLabel("体积云", { exact: true }).check();
    await page.getByRole("button", { name: "白昼", exact: true }).click();
    await page.getByRole("button", { name: "深夜", exact: true }).click();
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const remove =
            window.example.viewer.scene.postRender.addEventListener(() => {
              remove();
              resolve();
            });
        }),
    );
    expect(await page.locator(".cesium-widget-errorPanel").count()).toBe(0);
    expect(errors).toEqual([]);
    expect(starRequests).toEqual([]);
    const disposed = await page.evaluate(() => {
      const { effects } = window.example;
      const stars = effects._pipeline._resources.starsVertexArray;
      window.example.destroy();
      return stars.isDestroyed();
    });
    expect(disposed).toBe(true);
  });
}

for (const world of ["球面", "平面"]) {
  for (const feature of features) {
    test(`Environment ${world}${feature}: offline API example`, async ({
      page,
    }, info) => {
      test.setTimeout(120000);
      const errors = [];
      const external = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(message.text());
        }
      });
      await page.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.hostname === "localhost" || url.protocol === "data:") {
          return route.continue();
        }
        external.push(url.href);
        return route.abort();
      });
      await page.goto(`/Test/AdvancedEnvironment/${world}${feature}.html`);
      await page.waitForFunction(() => window.example?.effects.ready === true);
      await page.waitForFunction(
        () => window.example.viewer.dataSourceDisplay.ready,
      );
      const control = (label) => page.getByLabel(label, { exact: true });
      await expect(page.locator("#controls .lil-gui")).toBeVisible();
      const initial = await page.evaluate(() => {
        const { viewer, effects } = window.example;
        return {
          mode: effects.mode,
          enabled: effects.enabled,
          hdr: viewer.scene.highDynamicRange,
          count: viewer.scene.controllerHost.controllerCount,
          fog: effects.showHeightFog,
          clouds: effects.showClouds,
          bloom: effects.showBloom,
        };
      });
      expect(initial).toMatchObject({
        enabled: true,
        hdr: true,
        fog: feature === "高度雾",
        clouds: feature === "体积云",
        bloom: feature === "泛光与光晕",
      });
      if (feature === "物理大气") {
        await control("空气透视").uncheck();
        expect(
          await page.evaluate(
            () => window.example.effects.showAerialPerspective,
          ),
        ).toBe(false);
        await control("空气透视").check();
      } else if (feature === "高度雾") {
        await control("雾密度").fill("0.00004");
        await control("雾密度").press("Tab");
        expect(
          await page.evaluate(() => window.example.effects.heightFogDensity),
        ).toBe(0.00004);
      } else if (feature === "体积云") {
        await control("质量").selectOption({ label: "低" });
        expect(
          await page.evaluate(() => window.example.effects.cloudQuality),
        ).toBe("low");
        await control("质量").selectOption({ label: "中" });
        const sequence = await page.evaluate(async () => {
          const C = await import("/Build/CesiumUnminified/index.js");
          const { viewer, effects } = window.example;
          viewer.useDefaultRenderLoop = false;
          const clock = viewer.clock;
          clock.clockStep = C.ClockStep.TICK_DEPENDENT;
          const values = [effects.cloudTime];
          clock.shouldAnimate = true;
          clock.multiplier = 3;
          clock.tick();
          values.push(effects.cloudTime);
          clock.multiplier = -2;
          clock.tick();
          values.push(effects.cloudTime);
          clock.shouldAnimate = false;
          clock.tick();
          values.push(effects.cloudTime);
          viewer.useDefaultRenderLoop = true;
          return values;
        });
        expect(sequence).toEqual([0, 3, 1, 1]);
      } else if (feature === "日月光照") {
        await expect(page.locator(".cesium-timeline-main")).toBeVisible();
        await page.getByRole("button", { name: "夜间", exact: true }).click();
        const time = await page.evaluate(async () => {
          const C = await import("/Build/CesiumUnminified/index.js");
          return C.JulianDate.toIso8601(
            window.example.viewer.clock.currentTime,
          );
        });
        expect(time).toBe("2026-06-21T13:00:00Z");
        await control("月光").uncheck();
        expect(
          await page.evaluate(() => window.example.effects.showMoonlight),
        ).toBe(false);
        await control("月光").check();
      } else {
        await control("泛光强度").fill("0.2");
        await control("泛光强度").press("Tab");
        expect(
          await page.evaluate(() => window.example.effects.bloomIntensity),
        ).toBe(0.2);
      }
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const remove =
              window.example.viewer.scene.postRender.addEventListener(() => {
                remove();
                resolve();
              });
          }),
      );
      await page.screenshot({
        path: info.outputPath(`${world}${feature}.png`),
      });
      const lifecycle = await page.evaluate(() => {
        const { viewer, effects } = window.example;
        const clock = viewer.clock;
        const cloudTime = effects.cloudTime;
        const running = viewer.useDefaultRenderLoop;
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: true }),
        );
        const retained = !viewer.isDestroyed();
        window.dispatchEvent(
          new PageTransitionEvent("pagehide", { persisted: false }),
        );
        window.example.destroy();
        clock.shouldAnimate = true;
        clock.tick();
        return {
          running,
          retained,
          destroyed: viewer.isDestroyed(),
          ready: effects.ready,
          timeUnchanged: cloudTime === effects.cloudTime,
          gui: document.querySelectorAll(".lil-gui").length,
        };
      });
      expect(lifecycle).toEqual({
        running: true,
        retained: true,
        destroyed: true,
        ready: false,
        timeUnchanged: true,
        gui: 0,
      });
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("Planar integrated environment retains strict optics at high altitude", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/Test/AdvancedEnvironment/综合环境.html?world=planar");
  await page.waitForFunction(() => window.example?.effects.ready);
  await expect(
    page.getByRole("combobox", { name: "平面大气几何" }),
  ).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const { viewer, effects } = window.example;
    viewer.clock.shouldAnimate = false;
    effects.showClouds = false;
    effects.showHeightFog = false;
    const resources = effects._pipeline._resources;
    const position = C.Cartesian3.clone(viewer.camera.positionWC);
    position.z = 1000000;
    viewer.camera.setView({
      destination: position,
      orientation: {
        direction: new C.Cartesian3(0, 0, -1),
        up: C.Cartesian3.UNIT_Y,
      },
    });
    await new Promise((resolve) => {
      const remove = viewer.scene.postRender.addEventListener(() => {
        remove();
        resolve();
      });
      viewer.scene.requestRender();
    });
    effects.enabled = false;
    effects.enabled = true;
    const stable = effects._pipeline._resources === resources;
    const dimensions = [
      resources.irradianceTexture.width,
      resources.irradianceTexture.height,
    ];
    const ready = effects.ready;
    window.example.destroy();
    return {
      stable,
      dimensions,
      ready,
      released: resources.scatteringTexture.isDestroyed(),
    };
  });
  expect(result).toEqual({
    stable: true,
    dimensions: [64, 16],
    ready: true,
    released: true,
  });
  expect(errors).toEqual([]);
});

test("Functional catalogs and legacy redirects resolve", async ({
  page,
  request,
}) => {
  for (const folder of ["Planar", "AdvancedEnvironment"]) {
    await page.goto(`/Test/${folder}/示例目录.html`);
    const links = await page
      .locator("a")
      .evaluateAll((anchors) => anchors.map((a) => a.href));
    for (const url of links) {
      const response = await request.get(url);
      expect(response.ok(), url).toBe(true);
    }
  }
  for (const name of [
    "高级环境",
    "高级环境-平面",
    "平面Viewer",
    "平面API集成",
    "平面地表样式",
    "平面环境",
  ]) {
    await page.goto(`/Test/${name}.html`);
    await expect
      .poll(() => decodeURI(page.url()))
      .toMatch(/\/Test\/(AdvancedEnvironment|Planar)\//);
  }
});

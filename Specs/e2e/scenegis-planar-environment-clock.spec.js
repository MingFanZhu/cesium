import { test, expect } from "./test.js";

test.describe.configure({ retries: 0 });
test.use({ launchOptions: { args: [] } });

test("links the Nanjing Planar sample to public data, astronomical Clock and Timeline", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.hostname === "localhost" || url.protocol === "data:"
      ? route.continue()
      : route.abort();
  });
  await page.goto("/Test/高级环境-平面.html");
  await page.waitForFunction(
    () =>
      window.sceneGISPlanarSample?.getState().ready === true ||
      document
        .querySelector("#runtimeStatus")
        .textContent.startsWith("初始化失败"),
  );
  expect(await page.locator("#runtimeStatus").textContent()).not.toContain(
    "初始化失败",
  );
  await expect(page.locator(".cesium-timeline-main")).toBeVisible();
  await expect(page.locator("#providerStatus")).toContainText("不可用");
  const initial = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const { viewer, environment, effects } = window.sceneGISPlanarSample;
    viewer.useDefaultRenderLoop = false;
    const clock = viewer.clock;
    const epoch = C.JulianDate.clone(clock.currentTime);
    const values = [effects.cloudTime];
    const paused = !clock.shouldAnimate;
    clock.clockStep = C.ClockStep.TICK_DEPENDENT;
    clock.tick();
    values.push(effects.cloudTime);
    clock.shouldAnimate = true;
    clock.multiplier = 2;
    clock.tick();
    values.push(effects.cloudTime);
    clock.multiplier = -3;
    clock.tick();
    values.push(effects.cloudTime);
    clock.shouldAnimate = false;
    clock.tick();
    values.push(effects.cloudTime);
    clock.canAnimate = false;
    clock.shouldAnimate = true;
    clock.tick();
    values.push(effects.cloudTime);
    clock.canAnimate = true;
    clock.shouldAnimate = false;
    clock.currentTime = epoch;
    viewer.render();
    return {
      reference: [environment.originLongitude, environment.originLatitude].map(
        C.Math.toDegrees,
      ),
      location: new C.WebMercatorProjection().unproject(viewer.camera.position),
      data: {
        imagery:
          viewer.planarWorld.imageryLayers.get(0).imageryProvider instanceof
          C.SceneGISPlanarUrlTemplateImageryProvider,
        terrain:
          viewer.planarWorld.terrainProvider instanceof
          C.SceneGISPlanarUrlTemplateHeightmapTerrainProvider,
        sameScheme:
          viewer.planarWorld.terrainProvider.tilingScheme ===
            viewer.planarWorld.tilingScheme &&
          viewer.planarWorld.imageryLayers.get(0).imageryProvider
            .tilingScheme === viewer.planarWorld.tilingScheme,
        lit: viewer.planarWorld.enableLighting,
      },
      paused,
      values,
      mode: environment.directionMode,
      sun: environment.effectiveSunDirection,
      moon: environment.effectiveMoonDirection,
      position: viewer.camera.position,
      direction: viewer.camera.direction,
    };
  });
  expect(initial.paused).toBe(true);
  expect(initial.reference[0]).toBeCloseTo(118.8406, 6);
  expect(initial.reference[1]).toBeCloseTo(32.0725, 6);
  expect((initial.location.longitude * 180) / Math.PI).toBeCloseTo(118.8406, 5);
  expect((initial.location.latitude * 180) / Math.PI).toBeGreaterThan(32.04);
  expect((initial.location.latitude * 180) / Math.PI).toBeLessThan(32.08);
  expect(initial.data).toEqual({
    imagery: true,
    terrain: true,
    sameScheme: true,
    lit: true,
  });
  expect(initial.mode).toBe("astronomical");
  expect(initial.values).toEqual([0, 0, 2, -1, -1, -1]);
  const control = (name) => page.getByLabel(name, { exact: true });
  await page.getByText("云与大气参数", { exact: true }).click();
  await control("云时间偏移（秒）").fill("37");
  await control("云时间偏移（秒）").press("Tab");
  await expect(control("云仿真时间（秒）")).toBeDisabled();
  await control("播放").check();
  await control("时间倍速").fill("4");
  await control("时间倍速").press("Tab");
  const playing = await page.evaluate(() => {
    const s = window.sceneGISPlanarSample;
    s.viewer.clock.tick();
    return s.effects.cloudTime;
  });
  expect(playing).toBe(41);
  const timeline = page.locator(".cesium-timeline-bar");
  const bounds = await timeline.boundingBox();
  await timeline.click({
    position: { x: bounds.width * 0.78, y: bounds.height / 2 },
  });
  const scrubbed = await page.evaluate(async () => {
    const C = await import("/Build/CesiumUnminified/index.js");
    const { viewer, environment, effects } = window.sceneGISPlanarSample;
    viewer.render();
    return {
      paused: !viewer.clock.shouldAnimate,
      cloudTime: effects.cloudTime,
      expected:
        C.JulianDate.secondsDifference(
          viewer.clock.currentTime,
          C.JulianDate.fromIso8601("2026-06-21T02:30:00Z"),
        ) + 37,
      sun: environment.effectiveSunDirection,
      moon: environment.effectiveMoonDirection,
      position: viewer.camera.position,
      direction: viewer.camera.direction,
    };
  });
  expect(scrubbed.paused).toBe(true);
  expect(scrubbed.cloudTime).toBeCloseTo(scrubbed.expected, 7);
  expect(scrubbed.cloudTime).toBeGreaterThan(20000);
  expect(scrubbed.sun).not.toEqual(initial.sun);
  expect(scrubbed.moon).not.toEqual(initial.moon);
  expect(scrubbed.position).toEqual(initial.position);
  expect(scrubbed.direction).toEqual(initial.direction);
  await page.getByText("云与大气参数", { exact: true }).click();
  await page.getByText("低日照", { exact: true }).click();
  const sunset = await page.evaluate(() => {
    const { viewer, environment } = window.sceneGISPlanarSample;
    viewer.render();
    return environment.effectiveSunDirection.z;
  });
  expect(sunset).toBeGreaterThan(0);
  expect(sunset).toBeLessThan(0.2);
  await page.getByText("夜间", { exact: true }).click();
  const night = await page.evaluate(() => {
    const { viewer, environment, effects } = window.sceneGISPlanarSample;
    viewer.render();
    return {
      sunZ: environment.effectiveSunDirection.z,
      moonZ: environment.effectiveMoonDirection.z,
      cloudTime: effects.cloudTime,
      paused: !viewer.clock.shouldAnimate,
    };
  });
  expect(night.sunZ).toBeLessThan(0);
  expect(night.moonZ).toBeGreaterThan(0);
  expect(night.cloudTime).toBe(37837);
  expect(night.paused).toBe(true);
  await page.getByText("白昼", { exact: true }).click();
  expect(
    await page.evaluate(() => window.sceneGISPlanarSample.effects.cloudTime),
  ).toBe(37);
  const released = await page.evaluate(() => {
    const s = window.sceneGISPlanarSample,
      { clock } = s.viewer,
      effects = s.effects;
    const imagery = s.viewer.planarWorld.imageryLayers.get(0).imageryProvider;
    const terrain = s.viewer.planarWorld.terrainProvider;
    s.destroy();
    s.destroy();
    const cloudTime = effects.cloudTime;
    clock.shouldAnimate = true;
    clock.tick();
    return {
      state: s.getState(),
      listeners: clock.onTick.numberOfListeners,
      unchanged: effects.cloudTime === cloudTime,
      providerListeners: [
        imagery.errorEvent.numberOfListeners,
        terrain.errorEvent.numberOfListeners,
      ],
    };
  });
  expect(released.listeners).toBe(0);
  expect(released.unchanged).toBe(true);
  expect(released.providerListeners).toEqual([0, 0]);
  expect(released.state.destroyed).toBe(true);
  expect(released.state.errors).toEqual([]);
  await expect(page.locator(".cesium-timeline-main")).toHaveCount(0);
  expect(errors).toEqual([]);
});

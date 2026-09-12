import { test, expect } from "./test.js";

test.describe.configure({ retries: 0 });
test.use({ launchOptions: { args: [] } });

test("links Globe cloud motion to the Cesium simulation clock", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  await page.goto("/Test/%E9%AB%98%E7%BA%A7%E7%8E%AF%E5%A2%83.html");
  await page.waitForFunction(
    () => window.sceneGISGlobeSample?.getState().ready === true,
  );
  const sequence = await page.evaluate(async () => {
    const Cesium = await import("/Build/CesiumUnminified/index.js");
    const { viewer, effects } = window.sceneGISGlobeSample;
    viewer.useDefaultRenderLoop = false;
    const clock = viewer.clock;
    const epoch = Cesium.JulianDate.clone(clock.currentTime);
    const values = [effects.cloudTime];
    const initialPaused = !clock.shouldAnimate;
    clock.clockStep = Cesium.ClockStep.TICK_DEPENDENT;
    clock.tick();
    values.push(effects.cloudTime);
    clock.shouldAnimate = true;
    clock.multiplier = 2;
    clock.tick();
    values.push(effects.cloudTime);
    clock.multiplier = 3;
    clock.tick();
    values.push(effects.cloudTime);
    clock.multiplier = -4;
    clock.tick();
    values.push(effects.cloudTime);
    clock.shouldAnimate = false;
    clock.tick();
    values.push(effects.cloudTime);
    clock.canAnimate = false;
    clock.shouldAnimate = true;
    clock.tick();
    values.push(effects.cloudTime);
    clock.shouldAnimate = false;
    clock.currentTime = Cesium.JulianDate.addSeconds(
      epoch,
      -120,
      new Cesium.JulianDate(),
    );
    clock.tick();
    values.push(effects.cloudTime);
    clock.currentTime = Cesium.JulianDate.addSeconds(
      epoch,
      5,
      new Cesium.JulianDate(),
    );
    clock.tick();
    values.push(effects.cloudTime);
    clock.canAnimate = true;
    return { initialPaused, values };
  });
  expect(sequence).toEqual({
    initialPaused: true,
    values: [0, 0, 2, 5, 1, 1, 1, -120, 5],
  });
  const control = (name) => page.getByLabel(name, { exact: true });
  const offset = control("云时间偏移（秒）");
  await offset.fill("37");
  await offset.press("Tab");
  expect(
    await page.evaluate(() => window.sceneGISGlobeSample.effects.cloudTime),
  ).toBe(42);
  await expect(control("云仿真时间（秒）")).toBeDisabled();
  await expect(control("播放")).not.toBeChecked();
  await control("播放").check();
  await control("时间倍速").fill("4");
  await control("时间倍速").press("Tab");
  const warm = await page.evaluate(() => {
    const sample = window.sceneGISGlobeSample;
    const clock = sample.viewer.clock;
    const listeners = clock.onTick.numberOfListeners;
    clock.tick();
    const playing = sample.effects.cloudTime;
    sample.setEnabled(false);
    sample.effects.showClouds = false;
    clock.tick();
    const disabled = sample.effects.cloudTime;
    sample.setEnabled(true);
    sample.effects.showClouds = true;
    clock.tick();
    return {
      playing,
      disabled,
      restored: sample.effects.cloudTime,
      sameListeners: clock.onTick.numberOfListeners === listeners,
      multiplier: clock.multiplier,
      shouldAnimate: clock.shouldAnimate,
    };
  });
  expect(warm).toEqual({
    playing: 46,
    disabled: 50,
    restored: 54,
    sameListeners: true,
    multiplier: 4,
    shouldAnimate: true,
  });
  await page.getByText("地面 · 真日落", { exact: true }).click();
  expect(
    await page.evaluate(() => window.sceneGISGlobeSample.effects.cloudTime),
  ).toBe(28837);
  await expect(control("播放")).not.toBeChecked();
  await expect(offset).toHaveValue("37");
  await page.getByText("A10 月亮夜景", { exact: true }).click();
  expect(
    await page.evaluate(() => window.sceneGISGlobeSample.effects.cloudTime),
  ).toBe(41437);
  await page.getByText("A11 月光 + 本地阴影", { exact: true }).click();
  const released = await page.evaluate(async () => {
    const Cesium = await import("/Build/CesiumUnminified/index.js");
    const sample = window.sceneGISGlobeSample;
    const clock = sample.viewer.clock;
    const effects = sample.effects;
    const expected =
      Cesium.JulianDate.secondsDifference(
        clock.currentTime,
        Cesium.JulianDate.fromIso8601("2026-06-21T10:30:00Z"),
      ) + 37;
    const actual = effects.cloudTime;
    sample.destroy();
    sample.destroy();
    clock.shouldAnimate = true;
    clock.tick();
    return {
      actual,
      expected,
      afterTick: effects.cloudTime,
      state: sample.getState(),
    };
  });
  expect(released.actual).toBe(released.expected);
  expect(released.afterTick).toBe(released.actual);
  expect(released.state).toMatchObject({ destroyed: true, errors: [] });
  expect(errors).toEqual([]);
});

test("qualifies the direct Globe environment sample and retained Planar navigation", async ({
  page,
  cesiumPage,
}) => {
  const externalAttempts = [];
  const pageErrors = [];
  const consoleErrors = [];

  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1"
    ) {
      externalAttempts.push(request.url());
    }
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      await route.continue();
    } else {
      await route.abort("blockedbyclient");
    }
  });

  await page.goto("/Test/%E9%AB%98%E7%BA%A7%E7%8E%AF%E5%A2%83.html");
  await expect(page.locator("body")).toHaveAttribute(
    "data-scenegis-page",
    "globe",
  );
  await expect(page.locator("#planarSampleLink")).toHaveAttribute(
    "href",
    "/Test/高级环境-平面.html",
  );
  await page.waitForFunction(
    () => window.sceneGISGlobeSample?.getState().ready === true,
  );
  await expect(page.locator(".cesium-baseLayerPicker-selected")).toBeVisible();
  await expect(page.locator(".cesium-viewer-timelineContainer")).toBeVisible();
  await expect(page.getByText("加载全球建筑", { exact: true })).toBeVisible();
  await expect(page.getByText("Globe 表面", { exact: true })).toHaveCount(0);
  await expect(page.getByText("SceneGIS", { exact: true })).toHaveCount(0);
  const active = await page.evaluate(() =>
    window.sceneGISGlobeSample.getState(),
  );
  expect(active).toMatchObject({
    page: "globe",
    destroyed: false,
    ready: true,
    enabled: true,
    hdr: true,
    baseLayerPicker: true,
    timeline: true,
    globalBuildings: {
      loaded: false,
      loading: false,
      status: "未加载",
    },
    controllerCount: 1,
    terrainDepth: true,
    errors: [],
  });
  await expect(page.locator("#runtimeStatus")).toContainText("ready · HDR");

  await page.evaluate(() => window.sceneGISGlobeSample.setEnabled(false));
  await page.waitForFunction(() => {
    const state = window.sceneGISGlobeSample.getState();
    return state.enabled === false && state.terrainDepth === false;
  });
  const disabled = await page.evaluate(() =>
    window.sceneGISGlobeSample.getState(),
  );
  expect(disabled).toMatchObject({
    enabled: false,
    terrainDepth: false,
  });

  await page.evaluate(() => window.sceneGISGlobeSample.setEnabled(true));
  await page.waitForFunction(() => {
    const state = window.sceneGISGlobeSample.getState();
    return state.ready && state.terrainDepth;
  });
  const restored = await page.evaluate(() =>
    window.sceneGISGlobeSample.getState(),
  );
  expect(restored.controllerCount).toBe(1);

  const destroyed = await page.evaluate(() => {
    const sample = window.sceneGISGlobeSample;
    sample.destroy();
    return sample.getState();
  });
  expect(destroyed).toMatchObject({
    destroyed: true,
    controllerCount: 0,
    terrainDepth: false,
  });

  await page.goto(
    "/Test/%E9%AB%98%E7%BA%A7%E7%8E%AF%E5%A2%83-%E5%B9%B3%E9%9D%A2.html",
  );
  await expect(page.locator("body")).toHaveAttribute(
    "data-scenegis-page",
    "planar",
  );
  await expect(page.locator("#globeSampleLink")).toHaveAttribute(
    "href",
    "/Test/高级环境.html",
  );
  await page.waitForFunction(
    () => window.sceneGISPlanarSample?.getState().ready === true,
  );
  const planar = await page.evaluate(() =>
    window.sceneGISPlanarSample.getState(),
  );
  expect(planar).toMatchObject({
    page: "planar",
    deferred: true,
    destroyed: false,
    ready: true,
    hdr: true,
    controllerCount: 3,
    errors: [],
  });

  await cesiumPage.goto();
  const initialPublicState = await page.evaluate(() => {
    const Cesium = window.Cesium;
    const viewer = new Cesium.Viewer("cesiumContainer", {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      scene3DOnly: true,
      selectionIndicator: false,
      timeline: false,
    });
    const scene = viewer.scene;
    for (const object of [
      scene.skyAtmosphere,
      scene.skyBox,
      scene.sun,
      scene.moon,
    ]) {
      if (object) {
        object.show = false;
      }
    }
    scene.sunBloom = false;
    scene.fog.enabled = false;
    scene.highDynamicRange = true;
    scene.postProcessStages.bloom.enabled = false;
    scene.globe.showGroundAtmosphere = false;
    scene.globe.enableLighting = false;
    const priorTerrainDepth = scene.globe.depthTestAgainstTerrain;
    const effects = new Cesium.SceneGISEnvironmentEffects({
      mode: "globe",
      enabled: true,
    });
    viewer.addController(effects);
    window.sceneGISPublicBundleSample = { viewer, effects };
    return {
      priorTerrainDepth,
      controllerCount: scene.controllerHost.controllerCount,
    };
  });
  expect(initialPublicState).toEqual({
    priorTerrainDepth: false,
    controllerCount: 1,
  });
  await page.waitForFunction(() => {
    const { viewer, effects } = window.sceneGISPublicBundleSample;
    return (
      effects.ready &&
      viewer.scene.highDynamicRange &&
      viewer.scene.globe.depthTestAgainstTerrain
    );
  });
  const activePublicState = await page.evaluate(() => {
    const { viewer, effects } = window.sceneGISPublicBundleSample;
    return {
      ready: effects.ready,
      hdr: viewer.scene.highDynamicRange,
      controllerCount: viewer.scene.controllerHost.controllerCount,
      terrainDepth: viewer.scene.globe.depthTestAgainstTerrain,
    };
  });
  expect(activePublicState).toEqual({
    ready: true,
    hdr: true,
    controllerCount: 1,
    terrainDepth: true,
  });
  await page.evaluate(() => {
    const { viewer, effects } = window.sceneGISPublicBundleSample;
    effects.enabled = false;
    viewer.scene.requestRender();
  });
  await page.waitForFunction(() => {
    const { viewer, effects } = window.sceneGISPublicBundleSample;
    return !effects.enabled && !viewer.scene.globe.depthTestAgainstTerrain;
  });
  await page.evaluate(() => {
    const { viewer, effects } = window.sceneGISPublicBundleSample;
    effects.enabled = true;
    viewer.scene.requestRender();
  });
  await page.waitForFunction(() => {
    const { viewer, effects } = window.sceneGISPublicBundleSample;
    return effects.ready && viewer.scene.globe.depthTestAgainstTerrain;
  });
  const releasedPublicState = await page.evaluate(() => {
    const { viewer, effects } = window.sceneGISPublicBundleSample;
    viewer.removeController(effects);
    const result = {
      controllerCount: viewer.scene.controllerHost.controllerCount,
      terrainDepth: viewer.scene.globe.depthTestAgainstTerrain,
    };
    viewer.destroy();
    delete window.sceneGISPublicBundleSample;
    return result;
  });
  expect(releasedPublicState).toEqual({
    controllerCount: 0,
    terrainDepth: false,
  });

  expect(externalAttempts).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

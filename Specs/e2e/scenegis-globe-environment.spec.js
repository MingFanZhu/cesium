import { test, expect } from "./test.js";

test.describe.configure({ retries: 0 });
test.use({ launchOptions: { args: [] } });

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

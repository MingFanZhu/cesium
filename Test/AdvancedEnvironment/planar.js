/* global console, document, window */

import * as Cesium from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import {
  bindBoolean,
  bindNumber,
  configureNativeEnvironment,
  controllerStatus,
  createErrorTracker,
  installPageCleanup,
} from "/Test/AdvancedEnvironment/common.js";

const WEB_MERCATOR_LIMIT = 20037508.342789244;
const NANJING = Object.freeze({ longitude: 118.8406, latitude: 32.0725 });
const mountain = new Cesium.WebMercatorProjection().project(
  Cesium.Cartographic.fromDegrees(NANJING.longitude, NANJING.latitude, 430.0),
);
const IMAGERY_SERVICE =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer";
const TERRAIN_SERVICE =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const runtimeStatus = document.querySelector("#runtimeStatus");
const providerStatus = document.querySelector("#providerStatus");
const errorTracker = createErrorTracker(document.querySelector("#errorStatus"));

let viewer;
let environment;
let effects;
let gui;
let removePostRender;
let removeRenderError;
let removeControllerError;
let removeClockTick;
let imageryProvider;
let terrainProvider;
let removeImageryError;
let removeTerrainError;
const providerFailures = { imagery: false, terrain: false };
let destroyed = false;

const state = {
  enabled: true,
  showAtmosphere: true,
  showAerialPerspective: true,
  showHeightFog: true,
  showClouds: true,
  showCloudShadows: true,
  showCrepuscularRays: true,
  showMoonlight: true,
  moonlightIntensity: 1.0,
  showBloom: true,
  showLensFlare: true,
  bloomIntensity: 0.05,
  lensFlareIntensity: 5.0,
  cloudQuality: "medium",
  cloudPreset: "cumulus",
  cloudCoverage: 0.45,
  cloudDensity: 1.0,
  cloudTimeOffset: 0.0,
  cloudRadianceScale: 1.0,
  backgroundRadianceScale: 10.0,
  aerialRadianceScale: 1.0,
  surfaceRadianceScale: 1.0,
  day: () => applyLighting("day"),
  sunset: () => applyLighting("sunset"),
  night: () => applyLighting("night"),
  ground: () => applyCamera("ground"),
  aboveCloud: () => applyCamera("aboveCloud"),
  nearSpace: () => applyCamera("nearSpace"),
  models: () => applyCamera("models"),
  baseline: () => applyCompositionState("baseline"),
  aerialOnly: () => applyCompositionState("aerial"),
  fogOnly: () => applyCompositionState("fog"),
  cloudOnly: () => applyCompositionState("cloud"),
  combined: () => applyCompositionState("combined"),
  destroySample: () => destroySample(),
};

const compositionStates = Object.freeze({
  baseline: [false, false, false, false],
  aerial: [true, true, false, false],
  fog: [false, false, true, false],
  cloud: [false, false, false, true],
  combined: [true, true, true, true],
});

const compositionLabels = Object.freeze({
  baseline: "基础场景",
  aerial: "大气与空气透视",
  fog: "仅高度雾",
  cloud: "仅体积云",
  combined: "全部组合",
  custom: "自定义组合",
});

function getCompositionState() {
  if (!effects.enabled) {
    return "baseline";
  }
  const actual = [
    effects.showAtmosphere,
    effects.showAerialPerspective,
    effects.showHeightFog,
    effects.showClouds,
  ];
  return (
    Object.keys(compositionStates).find((name) =>
      compositionStates[name].every((value, index) => value === actual[index]),
    ) ?? "custom"
  );
}

const lighting = Object.freeze({
  day: "2026-06-21T10:30:00+08:00",
  sunset: "2026-06-21T18:45:00+08:00",
  night: "2026-06-21T21:00:00+08:00",
});
const cloudEpoch = Cesium.JulianDate.fromIso8601(lighting.day);
const observationDayStart = Cesium.JulianDate.fromIso8601(
  "2026-06-21T00:00:00+08:00",
);
const observationDayStop = Cesium.JulianDate.addDays(
  observationDayStart,
  1,
  new Cesium.JulianDate(),
);

const cameras = Object.freeze({
  models: {
    destination: new Cesium.Cartesian3(90000, -146000, 2000),
    direction: new Cesium.Cartesian3(0, 0.87, -0.493),
    up: new Cesium.Cartesian3(0, 0.493, 0.87),
  },
  ground: mountainCamera(3500.0, 1200.0),
  aboveCloud: mountainCamera(18000.0, 15000.0),
  nearSpace: mountainCamera(90000.0, 120000.0),
});

function mountainCamera(southOffset, height) {
  const destination = new Cesium.Cartesian3(
    mountain.x,
    mountain.y - southOffset,
    height,
  );
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(mountain, destination, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  return {
    destination,
    direction,
    up: new Cesium.Cartesian3(0.0, -direction.z, direction.y),
  };
}

function updateProviderStatus() {
  const messages = [];
  if (providerFailures.imagery) {
    messages.push("部分影像不可用，保留已加载影像或底色");
  }
  if (providerFailures.terrain) {
    messages.push("部分地形不可用，保留已有地形或平面");
  }
  providerStatus.textContent =
    messages.length > 0
      ? messages.join("；")
      : viewer.planarWorld.tilesLoaded
        ? "公开影像与地形：当前视图已就绪"
        : "公开影像与地形：加载中……";
}

function addPublicData() {
  const world = viewer.planarWorld;
  imageryProvider = new Cesium.SceneGISPlanarUrlTemplateImageryProvider({
    url: `${IMAGERY_SERVICE}/tile/{z}/{y}/{x}`,
    tilingScheme: world.tilingScheme,
    urlScheme: "xyz",
    tileWidth: 256,
    tileHeight: 256,
    maximumLevel: 16,
    hasAlphaChannel: false,
    credit: new Cesium.Credit(
      `<a href="${IMAGERY_SERVICE}" target="_blank">影像：Esri, Vantor, Earthstar Geographics, GIS User Community</a>`,
      true,
    ),
  });
  terrainProvider =
    new Cesium.SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
      url: `${TERRAIN_SERVICE}/tile/{z}/{y}/{x}`,
      tilingScheme: world.tilingScheme,
      urlScheme: "xyz",
      heightmapWidth: 257,
      heightmapHeight: 257,
      format: "lerc",
      minimumHeight: -450.0,
      maximumHeight: 8700.0,
      maximumLevel: 16,
      credit: new Cesium.Credit(
        `<a href="${TERRAIN_SERVICE}" target="_blank">地形：Esri World Elevation 及数据贡献者</a>`,
        true,
      ),
    });
  removeImageryError = imageryProvider.errorEvent.addEventListener((error) => {
    providerFailures.imagery = true;
    error.retry = false;
    updateProviderStatus();
  });
  removeTerrainError = terrainProvider.errorEvent.addEventListener((error) => {
    providerFailures.terrain = true;
    error.retry = false;
    updateProviderStatus();
  });
  world.imageryLayers.addImageryProvider(imageryProvider);
  world.terrainProvider = terrainProvider;
}

function synchronizeCloudTime() {
  effects.cloudTime =
    Cesium.JulianDate.secondsDifference(viewer.clock.currentTime, cloudEpoch) +
    state.cloudTimeOffset;
}

function applyLighting(name) {
  viewer.clock.shouldAnimate = false;
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(lighting[name]);
  synchronizeCloudTime();
  viewer.scene.requestRender();
}

function applyCamera(name) {
  const preset = cameras[name];
  viewer.camera.setView({
    destination: preset.destination,
    orientation: { direction: preset.direction, up: preset.up },
  });
  viewer.scene.requestRender();
}

function applyCompositionState(name) {
  state.enabled = effects.enabled = name !== "baseline";
  const [atmosphere, aerial, fog, clouds] = compositionStates[name];
  state.showAtmosphere = effects.showAtmosphere = atmosphere;
  state.showAerialPerspective = effects.showAerialPerspective = aerial;
  state.showHeightFog = effects.showHeightFog = fog;
  state.showClouds = effects.showClouds = clouds;
  gui
    ?.controllersRecursive()
    .forEach((controller) => controller.updateDisplay());
  viewer.scene.requestRender();
}

function addLocalGeometry(scene) {
  return scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: [
        [-70000.0, -250000.0, 40000.0, Cesium.Color.WHITE],
        [70000.0, 350000.0, 40000.0, Cesium.Color.YELLOW],
      ].map(
        ([x, y, z, color]) =>
          new Cesium.GeometryInstance({
            geometry: Cesium.BoxGeometry.fromDimensions({
              dimensions: new Cesium.Cartesian3(120000.0, 100000.0, 80000.0),
            }),
            modelMatrix: Cesium.Matrix4.fromTranslation(
              new Cesium.Cartesian3(x, y, z),
            ),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
            },
          }),
      ),
      appearance: new Cesium.PerInstanceColorAppearance({
        translucent: false,
        closed: true,
      }),
      asynchronous: false,
    }),
  );
}

async function addLightingModels(scene) {
  for (const x of [88000, 90000, 92000]) {
    const model = await Cesium.Model.fromGltfAsync({
      url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
      modelMatrix: Cesium.Matrix4.fromTranslation(
        new Cesium.Cartesian3(x, -143000, 400),
      ),
      scale: 800,
      imageBasedLighting: new Cesium.ImageBasedLighting({
        imageBasedLightingFactor: new Cesium.Cartesian2(1, 0),
      }),
    });
    if (destroyed) {
      model.destroy();
      return;
    }
    model.environmentMapManager.enabled = false;
    scene.primitives.add(model);
    scene.requestRender();
  }
}

function createGui() {
  gui = new GUI({ title: "平面天空与体积云", width: 330 });
  const effectsFolder = gui.addFolder("效果");
  bindBoolean(effectsFolder, state, "enabled", effects, viewer.scene, "启用");
  bindBoolean(
    effectsFolder,
    state,
    "showAtmosphere",
    effects,
    viewer.scene,
    "天空与太阳",
  );
  bindBoolean(
    effectsFolder,
    state,
    "showAerialPerspective",
    effects,
    viewer.scene,
    "空气透视",
  );
  bindBoolean(
    effectsFolder,
    state,
    "showHeightFog",
    effects,
    viewer.scene,
    "指数高度雾",
  );
  bindBoolean(
    effectsFolder,
    state,
    "showClouds",
    effects,
    viewer.scene,
    "体积云",
  );

  const cloudFolder = gui.addFolder("云与大气参数");
  bindBoolean(
    effectsFolder,
    state,
    "showMoonlight",
    effects,
    viewer.scene,
    "月光",
  );
  bindNumber(
    cloudFolder,
    state,
    "moonlightIntensity",
    effects,
    viewer.scene,
    "月光强度",
    0,
    64,
    0.1,
  );
  bindBoolean(
    effectsFolder,
    state,
    "showCloudShadows",
    effects,
    viewer.scene,
    "云影",
  );
  bindBoolean(
    effectsFolder,
    state,
    "showCrepuscularRays",
    effects,
    viewer.scene,
    "体积光",
  );
  bindNumber(
    cloudFolder,
    state,
    "surfaceRadianceScale",
    effects,
    viewer.scene,
    "地表与模型亮度",
    0,
    64,
    0.1,
  );
  cloudFolder
    .add(state, "cloudQuality", { 低: "low", 中: "medium", 高: "high" })
    .name("云质量")
    .onChange((value) => {
      effects.cloudQuality = value;
      viewer.scene.requestRender();
    });
  cloudFolder
    .add(state, "cloudPreset", {
      积云: "cumulus",
      层云: "stratus",
      卷云: "cirrus",
      混合: "mixed",
    })
    .name("云型")
    .onChange((value) => {
      effects.cloudPreset = value;
      viewer.scene.requestRender();
    });
  bindNumber(
    cloudFolder,
    state,
    "cloudCoverage",
    effects,
    viewer.scene,
    "云覆盖率",
    0.0,
    1.0,
    0.01,
  );
  bindNumber(
    cloudFolder,
    state,
    "cloudDensity",
    effects,
    viewer.scene,
    "云密度",
    0.0,
    4.0,
    0.01,
  );
  cloudFolder
    .add(state, "cloudTimeOffset", -3600.0, 3600.0, 1.0)
    .name("云时间偏移（秒）")
    .onChange(synchronizeCloudTime);
  cloudFolder
    .add(effects, "cloudTime")
    .name("云仿真时间（秒）")
    .listen()
    .disable();
  bindNumber(
    cloudFolder,
    state,
    "cloudRadianceScale",
    effects,
    viewer.scene,
    "云亮度",
    0.0,
    64.0,
    0.1,
  );
  bindNumber(
    cloudFolder,
    state,
    "backgroundRadianceScale",
    effects,
    viewer.scene,
    "天空亮度",
    0.0,
    64.0,
    0.1,
  );
  bindNumber(
    cloudFolder,
    state,
    "aerialRadianceScale",
    effects,
    viewer.scene,
    "空气透视亮度",
    0.0,
    64.0,
    0.1,
  );

  const comparison = gui.addFolder("组合对比（保持当前视角）");
  const hdr = gui.addFolder("泛光与镜头光晕");
  bindBoolean(hdr, state, "showBloom", effects, viewer.scene, "泛光");
  bindBoolean(hdr, state, "showLensFlare", effects, viewer.scene, "镜头光晕");
  bindNumber(
    hdr,
    state,
    "bloomIntensity",
    effects,
    viewer.scene,
    "泛光强度",
    0,
    1,
    0.01,
  );
  bindNumber(
    hdr,
    state,
    "lensFlareIntensity",
    effects,
    viewer.scene,
    "光晕强度",
    0,
    64,
    0.1,
  );
  hdr.close();
  comparison.add(state, "baseline").name("基础场景");
  comparison.add(state, "aerialOnly").name("大气与空气透视");
  comparison.add(state, "fogOnly").name("仅高度雾");
  comparison.add(state, "cloudOnly").name("仅体积云");
  comparison.add(state, "combined").name("全部组合");
  cloudFolder.close();
  const timeFolder = gui.addFolder("时间");
  timeFolder.add(viewer.clock, "shouldAnimate").name("播放").listen();
  timeFolder
    .add(viewer.clock, "multiplier", -120.0, 120.0, 1.0)
    .name("时间倍速")
    .listen();
  const presets = gui.addFolder("光照与视角");
  presets.add(state, "day").name("白昼");
  presets.add(state, "sunset").name("低日照");
  presets.add(state, "night").name("夜间");
  presets.add(state, "ground").name("紫金山");
  presets.add(state, "aboveCloud").name("云上");
  presets.add(state, "nearSpace").name("高空");
  presets.add(state, "models").name("模型光照");
  presets.add(state, "destroySample").name("释放场景");
}

function getState() {
  const scene = viewer?.isDestroyed() === false ? viewer.scene : undefined;
  return {
    page: "planar",
    phase: "P14",
    providerFailures: { ...providerFailures },
    timeline: viewer?.timeline !== undefined,
    compositionState: effects ? getCompositionState() : undefined,
    destroyed,
    ready: effects?.ready === true,
    hdr: scene?.highDynamicRange === true,
    controllerCount: scene?.controllerHost.controllerCount ?? 0,
    errors: errorTracker.errors.slice(),
  };
}

function destroySample() {
  if (destroyed) {
    return;
  }
  destroyed = true;
  removeClockTick?.();
  removeImageryError?.();
  removeTerrainError?.();
  removePostRender?.();
  removeRenderError?.();
  removeControllerError?.();
  errorTracker.destroy();
  gui?.destroy();
  if (viewer && !viewer.isDestroyed()) {
    viewer.removeController(effects);
    viewer.removeController(environment);
    viewer = viewer.destroy();
  }
  imageryProvider = undefined;
  terrainProvider = undefined;
  providerStatus.textContent = "公开数据已释放";
  runtimeStatus.textContent = "场景已释放";
}

try {
  viewer = new Cesium.Viewer("cesiumContainer", {
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    selectionIndicator: false,
    timeline: true,
    planarWorld: {
      crs: "EPSG:3857",
      extent: {
        minimumX: -WEB_MERCATOR_LIMIT,
        minimumY: -WEB_MERCATOR_LIMIT,
        maximumX: WEB_MERCATOR_LIMIT,
        maximumY: WEB_MERCATOR_LIMIT,
      },
      maximumLevel: 16,
      enableLighting: true,
      baseColor: Cesium.Color.fromCssColorString("#26362f"),
    },
  });
  viewer.clock.startTime = observationDayStart;
  viewer.clock.stopTime = observationDayStop;
  viewer.timeline.zoomTo(observationDayStart, observationDayStop);
  configureNativeEnvironment(viewer.scene, "planar");
  viewer.scene.rethrowRenderErrors = true;
  environment = new Cesium.SceneGISPlanarEnvironment({
    world: viewer.scene.world,
    showAtmosphere: false,
    showSun: false,
    showMoon: false,
    sunDirection: new Cesium.Cartesian3(0.45, 0.2, 0.87),
    moonDirection: new Cesium.Cartesian3(-0.5, -0.2, 0.8),
    directionMode: "astronomical",
    // Explicit Nanjing reference; never infer celestial coordinates from the CRS.
    originLongitude: Cesium.Math.toRadians(NANJING.longitude),
    originLatitude: Cesium.Math.toRadians(NANJING.latitude),
  });
  effects = new Cesium.SceneGISEnvironmentEffects({
    mode: "planar",
    world: viewer.scene.world,
    enabled: true,
    surfaceRadianceScale: state.surfaceRadianceScale,
  });
  viewer.addController(environment);
  viewer.addController(effects);
  applyLighting("day");
  removeClockTick = viewer.clock.onTick.addEventListener(synchronizeCloudTime);
  addLocalGeometry(viewer.scene);
  addLightingModels(viewer.scene).catch((error) => errorTracker.record(error));
  createGui();
  applyCamera("ground");
  addPublicData();
  applyCompositionState("combined");
  removeRenderError = viewer.scene.renderError.addEventListener(
    (scene, error) => {
      void scene;
      errorTracker.record(error);
    },
  );
  removeControllerError = effects.errorEvent.addEventListener(
    (owner, error) => {
      void owner;
      errorTracker.record(error);
    },
  );
  removePostRender = viewer.scene.postRender.addEventListener(() => {
    updateProviderStatus();
    runtimeStatus.textContent = `${controllerStatus(effects, viewer.scene)} · ${compositionLabels[getCompositionState()]} · ${effects.cloudQuality}/${effects.cloudPreset}`;
  });
  window.sceneGISPlanarSample = {
    viewer,
    environment,
    effects,
    getState,
    destroy: destroySample,
  };
} catch (error) {
  errorTracker.record(error);
  runtimeStatus.textContent = `初始化失败 · ${error?.message ?? error}`;
  console.error(error);
}

installPageCleanup(destroySample);

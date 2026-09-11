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
const runtimeStatus = document.querySelector("#runtimeStatus");
const errorTracker = createErrorTracker(document.querySelector("#errorStatus"));

let viewer;
let environment;
let effects;
let gui;
let removePostRender;
let removeRenderError;
let removeControllerError;
let destroyed = false;

const state = {
  enabled: true,
  showAtmosphere: true,
  showAerialPerspective: true,
  showHeightFog: true,
  showClouds: true,
  showCloudShadows: true,
  cloudQuality: "medium",
  cloudPreset: "cumulus",
  cloudCoverage: 0.45,
  cloudDensity: 0.001,
  cloudTime: 0.0,
  cloudRadianceScale: 48.0,
  backgroundRadianceScale: 10.0,
  aerialRadianceScale: 1.0,
  surfaceRadianceScale: 10.0,
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
  day: [0.45, 0.2, 0.87],
  sunset: [0.95, 0.1, 0.08],
  night: [-0.45, -0.2, -0.87],
});

const cameras = Object.freeze({
  models: {
    destination: new Cesium.Cartesian3(90000, -146000, 2000),
    direction: new Cesium.Cartesian3(0, 0.87, -0.493),
    up: new Cesium.Cartesian3(0, 0.493, 0.87),
  },
  ground: {
    destination: new Cesium.Cartesian3(0.0, -180000.0, 5000.0),
    direction: new Cesium.Cartesian3(0.0, 0.98, -0.2),
    up: new Cesium.Cartesian3(0.0, 0.2, 0.98),
  },
  aboveCloud: {
    destination: new Cesium.Cartesian3(0.0, -250000.0, 15000.0),
    direction: new Cesium.Cartesian3(0.0, 0.98, -0.2),
    up: new Cesium.Cartesian3(0.0, 0.2, 0.98),
  },
  nearSpace: {
    destination: new Cesium.Cartesian3(0.0, -900000.0, 120000.0),
    direction: new Cesium.Cartesian3(0.0, 0.98, -0.2),
    up: new Cesium.Cartesian3(0.0, 0.2, 0.98),
  },
});

function normalizedDirection(values) {
  return Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(...values),
    new Cesium.Cartesian3(),
  );
}

function applyLighting(name) {
  environment.sunDirection = normalizedDirection(lighting[name]);
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
    "showCloudShadows",
    effects,
    viewer.scene,
    "云影",
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
    0.01,
    0.0001,
  );
  bindNumber(
    cloudFolder,
    state,
    "cloudTime",
    effects,
    viewer.scene,
    "云时间",
    -3600.0,
    3600.0,
    1.0,
  );
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
  comparison.add(state, "baseline").name("基础场景");
  comparison.add(state, "aerialOnly").name("大气与空气透视");
  comparison.add(state, "fogOnly").name("仅高度雾");
  comparison.add(state, "cloudOnly").name("仅体积云");
  comparison.add(state, "combined").name("全部组合");
  cloudFolder.close();
  const presets = gui.addFolder("光照与视角");
  presets.add(state, "day").name("白昼");
  presets.add(state, "sunset").name("低日照");
  presets.add(state, "night").name("夜间");
  presets.add(state, "ground").name("地面");
  presets.add(state, "aboveCloud").name("云上");
  presets.add(state, "nearSpace").name("高空");
  presets.add(state, "models").name("模型光照");
  presets.add(state, "destroySample").name("释放场景");
}

function getState() {
  const scene = viewer?.isDestroyed() === false ? viewer.scene : undefined;
  return {
    page: "planar",
    phase: "P2",
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
    timeline: false,
    planarWorld: {
      crs: "EPSG:3857",
      extent: {
        minimumX: -WEB_MERCATOR_LIMIT,
        minimumY: -WEB_MERCATOR_LIMIT,
        maximumX: WEB_MERCATOR_LIMIT,
        maximumY: WEB_MERCATOR_LIMIT,
      },
      maximumLevel: 0,
      baseColor: Cesium.Color.fromCssColorString("#26362f"),
    },
  });
  configureNativeEnvironment(viewer.scene, "planar");
  viewer.scene.rethrowRenderErrors = true;
  environment = new Cesium.SceneGISPlanarEnvironment({
    world: viewer.scene.world,
    showAtmosphere: false,
    showSun: false,
    showMoon: false,
    sunDirection: normalizedDirection(lighting.day),
    moonDirection: new Cesium.Cartesian3(-0.5, -0.2, 0.8),
  });
  effects = new Cesium.SceneGISEnvironmentEffects({
    mode: "planar",
    world: viewer.scene.world,
    enabled: true,
  });
  viewer.addController(environment);
  viewer.addController(effects);
  addLocalGeometry(viewer.scene);
  addLightingModels(viewer.scene).catch((error) => errorTracker.record(error));
  createGui();
  applyCamera("ground");
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

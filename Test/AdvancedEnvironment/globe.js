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

const runtimeStatus = document.querySelector("#runtimeStatus");
const observationStatus = document.querySelector("#observationStatus");
const errorTracker = createErrorTracker(document.querySelector("#errorStatus"));

const imageryProviderViewModels =
  Cesium.createDefaultImageryProviderViewModels();
const terrainProviderViewModels =
  Cesium.createDefaultTerrainProviderViewModels();
const selectedImageryProviderViewModel = imageryProviderViewModels.find(
  (viewModel) => viewModel.name.startsWith("Natural Earth"),
);
const selectedTerrainProviderViewModel = terrainProviderViewModels.find(
  (viewModel) => viewModel.name === "WGS84 Ellipsoid",
);

const viewerOptions = {
  animation: false,
  baseLayerPicker: true,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  imageryProviderViewModels,
  infoBox: false,
  navigationHelpButton: false,
  scene3DOnly: true,
  selectedImageryProviderViewModel,
  selectedTerrainProviderViewModel,
  selectionIndicator: false,
  terrainProviderViewModels,
  timeline: true,
};

let viewer;
let effects;
let gui;
let removePostRender;
let removeRenderError;
let removeControllerError;
let destroyed = false;
let restoredDepthValue;
let globalBuildingsTileset;
let globalBuildingsLoading = false;
let globalBuildingsGeneration = 0;
let cameraBeforeGlobalBuildings;
let observationBeforeGlobalBuildings;
let locationBeforeGlobalBuildings;
let globalBuildingsButton;
let globalBuildingsStatusController;
let moonShadowWitness;
let currentObservation = "地面 · 高日 · high/mixed · reference Basic";

const state = {
  enabled: true,
  showAtmosphere: true,
  showAerialPerspective: true,
  showHeightFog: true,
  showClouds: true,
  showCloudShadows: true,
  showCrepuscularRays: true,
  showBloom: true,
  showLensFlare: true,
  showMoonlight: true,
  showMoonShadows: true,
  showMoon: false,
  cloudQuality: "high",
  cloudPreset: "cumulus",
  cloudCoverage: 0.3,
  cloudDensity: 1.0,
  cloudTime: 0.0,
  cloudRadianceScale: 1.0,
  backgroundRadianceScale: 4.0,
  aerialRadianceScale: 1.0,
  surfaceRadianceScale: 10.0,
  bloomThreshold: 10.0,
  bloomIntensity: 0.05,
  lensFlareIntensity: 5.0,
  moonlightIntensity: 1.0,
  globalBuildingsStatus: "未加载",
  toggleGlobalBuildings: () => void toggleGlobalBuildings(),
  groundHighSun: () => applyObservation("groundHighSun"),
  aboveHighSun: () => applyObservation("aboveHighSun"),
  groundSunset: () => applyObservation("groundSunset"),
  groundNight: () => applyObservation("groundNight"),
  readableNight: () => applyObservation("readableNight"),
  moonNight: () => applyMoonObservation(),
  moonlightObservation: () => applyMoonlightObservation(),
  nearSpaceHighSun: () => applyObservation("nearSpaceHighSun"),
  qualityObservation: () => observeQualitySwitch(),
  destroySample: () => destroySample(),
};

const locations = Object.freeze({ longitude: 15.0, latitude: 45.0 });
const globalBuildingsLocation = Object.freeze({
  longitude: -74.019,
  latitude: 40.6912,
});
let currentStatusLocation = locations;
const observationDayStart = Cesium.JulianDate.fromIso8601(
  "2026-06-21T00:00:00Z",
);
const observationDayStop = Cesium.JulianDate.fromIso8601(
  "2026-06-22T00:00:00Z",
);
const observationDefinitions = Object.freeze({
  groundHighSun: {
    label: "地面 · 高日 · high/mixed · reference Basic",
    time: "2026-06-21T10:30:00Z",
    altitude: 300.0,
    pitch: -5.0,
    quality: "high",
    preset: "mixed",
  },
  aboveHighSun: {
    label: "云上 · 高日 · high/mixed",
    time: "2026-06-21T10:30:00Z",
    altitude: 15000.0,
    pitch: -20.0,
    quality: "high",
    preset: "mixed",
  },
  groundSunset: {
    label: "地面 · 真日落 · 完整合成",
    time: "2026-06-21T18:30:00Z",
    altitude: 500.0,
    pitch: -5.0,
    quality: "high",
    preset: "cumulus",
  },
  groundNight: {
    label: "地面 · 无月夜 · 完整合成",
    time: "2026-06-21T22:00:00Z",
    altitude: 500.0,
    pitch: -5.0,
    quality: "high",
    preset: "cumulus",
  },
  readableNight: {
    label: "A9 可读夜景 · 地面 · 固定蓝灰环境天光",
    time: "2026-06-21T22:00:00Z",
    altitude: 500.0,
    pitch: -5.0,
    quality: "high",
    preset: "cumulus",
  },
  nearSpaceHighSun: {
    label: "近太空 · 高日 · 完整合成",
    time: "2026-06-21T10:30:00Z",
    altitude: 120000.0,
    pitch: -35.0,
    quality: "high",
    preset: "cumulus",
  },
});

function solarElevation() {
  const surface = Cesium.Cartesian3.fromDegrees(
    currentStatusLocation.longitude,
    currentStatusLocation.latitude,
    0.0,
  );
  const normal = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(
    surface,
    new Cesium.Cartesian3(),
  );
  const sun = viewer.scene.context.uniformState.sunDirectionWC;
  return Cesium.Math.toDegrees(
    Math.asin(Cesium.Math.clamp(Cesium.Cartesian3.dot(normal, sun), -1.0, 1.0)),
  );
}

function moonCameraOrientation(destination, time) {
  const icrfToFixed = new Cesium.Matrix3();
  if (
    !Cesium.defined(
      Cesium.Transforms.computeIcrfToFixedMatrix(time, icrfToFixed),
    )
  ) {
    Cesium.Transforms.computeTemeToPseudoFixedMatrix(time, icrfToFixed);
  }
  const moonPosition =
    Cesium.Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
      time,
      new Cesium.Cartesian3(),
    );
  Cesium.Matrix3.multiplyByVector(icrfToFixed, moonPosition, moonPosition);
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(
      moonPosition,
      destination,
      new Cesium.Cartesian3(),
    ),
    new Cesium.Cartesian3(),
  );
  const fixedToEnu = Cesium.Matrix4.inverseTransformation(
    Cesium.Transforms.eastNorthUpToFixedFrame(destination),
    new Cesium.Matrix4(),
  );
  const localDirection = Cesium.Matrix4.multiplyByPointAsVector(
    fixedToEnu,
    direction,
    new Cesium.Cartesian3(),
  );
  return {
    heading: Cesium.Math.zeroToTwoPi(
      Math.atan2(localDirection.x, localDirection.y),
    ),
    pitch: Math.asin(Cesium.Math.clamp(localDirection.z, -1.0, 1.0)),
  };
}

function updateObservationStatus() {
  observationStatus.textContent = `固定观察：${currentObservation} · tier=${effects.cloudQuality} · Sun ${solarElevation().toFixed(3)}°`;
}

function applyObservation(name) {
  const definition = observationDefinitions[name];
  currentStatusLocation = locations;
  currentObservation = definition.label;
  state.cloudQuality = definition.quality;
  state.cloudPreset = definition.preset;
  effects.cloudQuality = definition.quality;
  effects.cloudPreset = definition.preset;
  state.showMoon = false;
  viewer.scene.moon.show = false;
  viewer.clock.shouldAnimate = false;
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(definition.time);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      locations.longitude,
      locations.latitude,
      definition.altitude,
    ),
    orientation: {
      heading: 0.0,
      pitch: Cesium.Math.toRadians(definition.pitch),
      roll: 0.0,
    },
  });
  gui
    .controllersRecursive()
    .forEach((controller) => controller.updateDisplay());
  viewer.scene.requestRender();
}

function applyMoonObservation() {
  const time = Cesium.JulianDate.fromIso8601("2026-06-21T22:00:00Z");
  const destination = Cesium.Cartesian3.fromDegrees(
    locations.longitude,
    locations.latitude,
    500.0,
  );
  const orientation = moonCameraOrientation(destination, time);
  currentStatusLocation = locations;
  currentObservation = `A10 月亮夜景 · 方位 ${Cesium.Math.toDegrees(orientation.heading).toFixed(3)}° · 仰角 ${Cesium.Math.toDegrees(orientation.pitch).toFixed(3)}°`;
  state.showMoon = true;
  state.showClouds = false;
  state.showHeightFog = false;
  viewer.scene.moon.show = true;
  effects.showClouds = false;
  effects.showHeightFog = false;
  viewer.clock.shouldAnimate = false;
  viewer.clock.currentTime = time;
  viewer.camera.setView({
    destination,
    orientation: {
      heading: orientation.heading,
      pitch: orientation.pitch,
      roll: 0.0,
    },
  });
  gui
    .controllersRecursive()
    .forEach((controller) => controller.updateDisplay());
  viewer.scene.requestRender();
}

function ensureMoonShadowWitness() {
  if (moonShadowWitness) {
    moonShadowWitness.forEach((entity) => (entity.show = true));
    return;
  }
  moonShadowWitness = [
    viewer.entities.add({
      name: "A11 Moon shadow receiver",
      position: Cesium.Cartesian3.fromDegrees(15.0217, 44.91, 1.0),
      box: {
        dimensions: new Cesium.Cartesian3(600.0, 600.0, 2.0),
        material: Cesium.Color.WHITE,
      },
      shadows: Cesium.ShadowMode.ENABLED,
    }),
    viewer.entities.add({
      name: "A11 Moon shadow caster",
      position: Cesium.Cartesian3.fromDegrees(15.0217, 44.91, 126.0),
      box: {
        dimensions: new Cesium.Cartesian3(100.0, 100.0, 250.0),
        material: Cesium.Color.fromCssColorString("#b7bfca"),
      },
      shadows: Cesium.ShadowMode.ENABLED,
    }),
  ];
}

function applyMoonlightObservation() {
  const time = Cesium.JulianDate.fromIso8601("2026-07-02T00:00:00Z");
  const destination = Cesium.Cartesian3.fromDegrees(15.0, 45.0, 500.0);
  const orientation = moonCameraOrientation(destination, time);
  currentStatusLocation = locations;
  currentObservation = `A11 月光与阴影 · 方位 ${Cesium.Math.toDegrees(orientation.heading).toFixed(3)}° · 仰角 ${Cesium.Math.toDegrees(orientation.pitch).toFixed(3)}°`;
  state.showMoon = true;
  state.showMoonlight = true;
  state.showMoonShadows = true;
  state.moonlightIntensity = 1.0;
  state.showClouds = false;
  viewer.scene.moon.show = true;
  effects.showMoonlight = true;
  effects.showMoonShadows = true;
  effects.moonlightIntensity = 1.0;
  effects.showClouds = false;
  ensureMoonShadowWitness();
  viewer.clock.shouldAnimate = false;
  viewer.clock.currentTime = time;
  viewer.camera.setView({
    destination,
    orientation: {
      heading: orientation.heading,
      pitch: Cesium.Math.toRadians(10.0),
      roll: 0.0,
    },
  });
  gui
    .controllersRecursive()
    .forEach((controller) => controller.updateDisplay());
  viewer.scene.requestRender();
}

function observeQualitySwitch() {
  const sequence = ["high", "medium", "low"];
  const currentIndex = sequence.indexOf(effects.cloudQuality);
  const nextQuality = sequence[(currentIndex + 1) % sequence.length];
  currentObservation = `质量观察 · ${effects.cloudQuality} → ${nextQuality}`;
  state.cloudQuality = nextQuality;
  effects.cloudQuality = nextQuality;
  gui
    .controllersRecursive()
    .forEach((controller) => controller.updateDisplay());
  viewer.scene.requestRender();
}

function updateGlobalBuildingsControls() {
  globalBuildingsStatusController?.updateDisplay();
  globalBuildingsButton?.name(
    globalBuildingsLoading
      ? "取消加载全球建筑"
      : globalBuildingsTileset
        ? "移除全球建筑"
        : "加载全球建筑",
  );
}

function removeGlobalBuildings(status = "未加载") {
  globalBuildingsGeneration++;
  globalBuildingsLoading = false;
  if (viewer && !viewer.isDestroyed()) {
    if (globalBuildingsTileset) {
      viewer.scene.primitives.remove(globalBuildingsTileset);
    }
    if (cameraBeforeGlobalBuildings) {
      viewer.camera.setView({
        destination: cameraBeforeGlobalBuildings.destination,
        orientation: {
          direction: cameraBeforeGlobalBuildings.direction,
          up: cameraBeforeGlobalBuildings.up,
        },
      });
    }
    viewer.scene.requestRender();
  }
  if (observationBeforeGlobalBuildings !== undefined) {
    currentObservation = observationBeforeGlobalBuildings;
  }
  if (locationBeforeGlobalBuildings !== undefined) {
    currentStatusLocation = locationBeforeGlobalBuildings;
  }
  globalBuildingsTileset = undefined;
  cameraBeforeGlobalBuildings = undefined;
  observationBeforeGlobalBuildings = undefined;
  locationBeforeGlobalBuildings = undefined;
  state.globalBuildingsStatus = status;
  updateGlobalBuildingsControls();
}

async function toggleGlobalBuildings() {
  if (destroyed) {
    return;
  }
  if (globalBuildingsLoading) {
    removeGlobalBuildings("已取消");
    return;
  }
  if (globalBuildingsTileset) {
    removeGlobalBuildings();
    return;
  }

  const generation = ++globalBuildingsGeneration;
  globalBuildingsLoading = true;
  state.globalBuildingsStatus = "加载中 · Cesium ion 在线数据";
  updateGlobalBuildingsControls();
  let candidate;
  try {
    candidate = await Cesium.createOsmBuildingsAsync();
    if (
      destroyed ||
      generation !== globalBuildingsGeneration ||
      !viewer ||
      viewer.isDestroyed()
    ) {
      candidate.destroy();
      return;
    }
    cameraBeforeGlobalBuildings = {
      destination: Cesium.Cartesian3.clone(viewer.camera.positionWC),
      direction: Cesium.Cartesian3.clone(viewer.camera.directionWC),
      up: Cesium.Cartesian3.clone(viewer.camera.upWC),
    };
    observationBeforeGlobalBuildings = currentObservation;
    locationBeforeGlobalBuildings = currentStatusLocation;
    globalBuildingsTileset = viewer.scene.primitives.add(candidate);
    candidate = undefined;
    currentStatusLocation = globalBuildingsLocation;
    currentObservation = "Cesium OSM Buildings · New York";
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(
        globalBuildingsLocation.longitude,
        globalBuildingsLocation.latitude,
        750.0,
      ),
      orientation: {
        heading: Cesium.Math.toRadians(20.0),
        pitch: Cesium.Math.toRadians(-20.0),
        roll: 0.0,
      },
    });
    globalBuildingsLoading = false;
    state.globalBuildingsStatus = "已加载 · Cesium OSM Buildings";
    updateGlobalBuildingsControls();
    viewer.scene.requestRender();
  } catch (error) {
    candidate?.destroy();
    if (destroyed || generation !== globalBuildingsGeneration) {
      return;
    }
    globalBuildingsLoading = false;
    state.globalBuildingsStatus = "加载失败 · 请检查 token/网络";
    updateGlobalBuildingsControls();
    errorTracker.record(error);
    console.error(error);
  }
}

function createGui() {
  gui = new GUI({ title: "Globe 高级环境 · A8-G", width: 330 });
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
  bindBoolean(
    effectsFolder,
    state,
    "showBloom",
    effects,
    viewer.scene,
    "Bloom",
  );
  bindBoolean(
    effectsFolder,
    state,
    "showLensFlare",
    effects,
    viewer.scene,
    "Lens flare",
  );
  bindBoolean(
    effectsFolder,
    state,
    "showMoonlight",
    effects,
    viewer.scene,
    "月光",
  );
  bindBoolean(
    effectsFolder,
    state,
    "showMoonShadows",
    effects,
    viewer.scene,
    "月影",
  );
  effectsFolder
    .add(state, "showMoon")
    .name("原生月亮")
    .onChange((value) => {
      viewer.scene.moon.show = value;
      viewer.scene.requestRender();
    });

  const cloudFolder = gui.addFolder("云与 HDR");
  cloudFolder
    .add(state, "cloudQuality", { low: "low", medium: "medium", high: "high" })
    .name("Cloud quality")
    .onChange((value) => {
      effects.cloudQuality = value;
      viewer.scene.requestRender();
    });
  cloudFolder
    .add(state, "cloudPreset", {
      cumulus: "cumulus",
      stratus: "stratus",
      cirrus: "cirrus",
      mixed: "mixed",
    })
    .name("Cloud preset")
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
    "Cloud coverage",
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
    "Cloud density",
    0.0,
    64.0,
    0.01,
  );
  bindNumber(
    cloudFolder,
    state,
    "cloudTime",
    effects,
    viewer.scene,
    "Cloud time",
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
    "Cloud radiance",
    0.0,
    64.0,
    0.1,
  );
  bindNumber(
    cloudFolder,
    state,
    "moonlightIntensity",
    effects,
    viewer.scene,
    "Moonlight intensity",
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
    "Background radiance",
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
    "Aerial radiance",
    0.0,
    64.0,
    0.1,
  );
  bindNumber(
    cloudFolder,
    state,
    "surfaceRadianceScale",
    effects,
    viewer.scene,
    "Surface radiance",
    0.0,
    64.0,
    0.1,
  );
  bindNumber(
    cloudFolder,
    state,
    "bloomThreshold",
    effects,
    viewer.scene,
    "Bloom threshold",
    0.0,
    65504.0,
    0.1,
  );
  bindNumber(
    cloudFolder,
    state,
    "bloomIntensity",
    effects,
    viewer.scene,
    "Bloom intensity",
    0.0,
    64.0,
    0.01,
  );
  bindNumber(
    cloudFolder,
    state,
    "lensFlareIntensity",
    effects,
    viewer.scene,
    "Lens intensity",
    0.0,
    64.0,
    0.1,
  );

  const observations = gui.addFolder("A8-G 固定观察");
  observations.add(state, "groundHighSun").name("地面 · 高日");
  observations.add(state, "aboveHighSun").name("云上 · 高日 mixed");
  observations.add(state, "groundSunset").name("地面 · 真日落");
  observations.add(state, "groundNight").name("地面 · 无月夜");
  observations.add(state, "nearSpaceHighSun").name("近太空 · 高日");
  observations.add(state, "qualityObservation").name("high → medium → low");

  const nightObservation = gui.addFolder("A9-G 固定观察");
  nightObservation.add(state, "readableNight").name("A9 可读夜景");

  const moonObservation = gui.addFolder("A10-G 固定观察");
  moonObservation.add(state, "moonNight").name("A10 月亮夜景");

  const moonlightObservation = gui.addFolder("A11-G 固定观察");
  moonlightObservation
    .add(state, "moonlightObservation")
    .name("A11 月光 + 本地阴影");

  const onlineData = gui.addFolder("Cesium ion 在线数据");
  globalBuildingsButton = onlineData
    .add(state, "toggleGlobalBuildings")
    .name("加载全球建筑");
  globalBuildingsStatusController = onlineData
    .add(state, "globalBuildingsStatus")
    .name("状态")
    .listen()
    .disable();

  const delivery = gui.addFolder("交付");
  delivery.add(state, "destroySample").name("释放场景");
}

function getState() {
  const scene = viewer?.isDestroyed() === false ? viewer.scene : undefined;
  return {
    page: "globe",
    destroyed,
    ready: effects?.ready === true,
    enabled: effects?.enabled === true,
    moonVisible: scene?.moon?.show === true,
    showMoonlight: effects?.showMoonlight === true,
    showMoonShadows: effects?.showMoonShadows === true,
    moonlightIntensity: effects?.moonlightIntensity,
    hdr: scene?.highDynamicRange === true,
    baseLayerPicker: viewer?.baseLayerPicker !== undefined,
    timeline: viewer?.timeline !== undefined,
    globalBuildings: {
      loaded: globalBuildingsTileset !== undefined,
      loading: globalBuildingsLoading,
      status: state.globalBuildingsStatus,
    },
    controllerCount: scene?.controllerHost.controllerCount ?? 0,
    terrainDepth: scene?.globe?.depthTestAgainstTerrain ?? restoredDepthValue,
    errors: errorTracker.errors.slice(),
  };
}

function destroySample() {
  if (destroyed) {
    return;
  }
  destroyed = true;
  removeGlobalBuildings("已释放");
  if (moonShadowWitness) {
    moonShadowWitness.forEach((entity) => viewer.entities.remove(entity));
    moonShadowWitness = undefined;
  }
  removePostRender?.();
  removeRenderError?.();
  removeControllerError?.();
  errorTracker.destroy();
  gui?.destroy();
  if (viewer && !viewer.isDestroyed()) {
    viewer.removeController(effects);
    restoredDepthValue = viewer.scene.globe.depthTestAgainstTerrain;
    viewer = viewer.destroy();
  }
  runtimeStatus.textContent = "destroyed · resources released";
}

try {
  viewer = new Cesium.Viewer("cesiumContainer", viewerOptions);
  viewer.clock.startTime = observationDayStart;
  viewer.clock.stopTime = observationDayStop;
  viewer.timeline.zoomTo(observationDayStart, observationDayStop);
  configureNativeEnvironment(viewer.scene, "globe");
  viewer.scene.rethrowRenderErrors = true;
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString("#26362f");
  effects = new Cesium.SceneGISEnvironmentEffects({
    mode: "globe",
    enabled: true,
  });
  viewer.addController(effects);
  createGui();
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
    runtimeStatus.textContent = `${controllerStatus(effects, viewer.scene)} · ${effects.cloudQuality} · terrain depth ${viewer.scene.globe.depthTestAgainstTerrain ? "owned" : "released"}`;
    updateObservationStatus();
  });
  applyObservation("groundHighSun");
  window.sceneGISGlobeSample = {
    viewer,
    effects,
    getState,
    setEnabled(value) {
      state.enabled = value;
      effects.enabled = value;
      gui
        .controllersRecursive()
        .forEach((controller) => controller.updateDisplay());
      viewer.scene.requestRender();
    },
    toggleGlobalBuildings,
    destroy: destroySample,
  };
} catch (error) {
  errorTracker.record(error);
  runtimeStatus.textContent = "初始化失败";
  console.error(error);
}

installPageCleanup(destroySample);

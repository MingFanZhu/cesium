/* global document, window, URLSearchParams, performance */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";
import installVectorInspection from "./综合环境矢量.js";

// Example ion credential retained at the project owner's request.
C.Ion.defaultAccessToken =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIxNzY3MjZlMi0xNTgyLTQ0NmMtOGUxOC1kY2RlMTlhOGNiOGYiLCJpZCI6Mzc3MzAsImlhdCI6MTY2MTQxMjg5M30.1QRdCE8ul5AzeUgD_WhkdTqcUJHZqiXVhkGeL80Vqfw";

const planar =
  new URLSearchParams(window.location.search).get("world") === "planar";
const longitude = 118.7969;
const latitude = 32.0603;
const origin = new C.WebMercatorProjection().project(
  C.Cartographic.fromDegrees(longitude, latitude),
);
const modeOptions = {};
const imageryOptions = {
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  maximumLevel: 18,
  tileWidth: 256,
  tileHeight: 256,
  hasAlphaChannel: false,
  credit:
    "Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community",
};
let imageryProvider;
let planarImageryLayer;
if (planar) {
  // Raster and MVT share the standard single-root Web Mercator tile matrix.
  const halfWorld = Math.PI * 6378137;
  modeOptions.planarWorld = {
    crs: "EPSG:3857",
    extent: {
      minimumX: -halfWorld,
      minimumY: -halfWorld,
      maximumX: halfWorld,
      maximumY: halfWorld,
    },
    maximumLevel: 18,
  };
  modeOptions.baseLayerPicker = false;
} else {
  // Retain the native catalog and its local fallback while selecting the same
  // explicit raster service used by the planar comparison.
  const imagery = C.createDefaultImageryProviderViewModels();
  const terrain = C.createDefaultTerrainProviderViewModels();
  imageryProvider = new C.UrlTemplateImageryProvider({
    ...imageryOptions,
    tilingScheme: new C.WebMercatorTilingScheme(),
  });
  const comparisonImagery = new C.ProviderViewModel({
    name: "World Imagery（对照）",
    category: "SceneGIS",
    tooltip: "ArcGIS World Imagery，EPSG:3857；球面与平面共用影像源。",
    iconUrl: C.buildModuleUrl(
      "Widgets/Images/ImageryProviders/ArcGisMapServiceWorldImagery.png",
    ),
    creationFunction: () => imageryProvider,
  });
  imagery.unshift(comparisonImagery);
  Object.assign(modeOptions, {
    baseLayerPicker: true,
    imageryProviderViewModels: imagery,
    terrainProviderViewModels: terrain,
    selectedImageryProviderViewModel: comparisonImagery,
    selectedTerrainProviderViewModel: terrain.find(
      (item) => item.name === "WGS84 Ellipsoid",
    ),
  });
}
const viewer = new C.Viewer("map", {
  ...modeOptions,
  animation: true,
  timeline: true,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  projectionPicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene;
if (planar) {
  imageryProvider = new C.SceneGISPlanarUrlTemplateImageryProvider({
    ...imageryOptions,
    tilingScheme: viewer.planarWorld.tilingScheme,
  });
  planarImageryLayer =
    viewer.planarWorld.imageryLayers.addImageryProvider(imageryProvider);
}
const imageryError = document.getElementById("imageryError");
const removeImageryError = imageryProvider.errorEvent.addEventListener(() => {
  imageryError.textContent = planar
    ? "World Imagery 请求失败，请检查网络；可关闭影像继续使用本地底色。"
    : "World Imagery 请求失败，请检查网络；可在图层选择器切换本地 Natural Earth。";
});
const effects = scene.environmentEffects;
const autoExposure = new C.SceneGISAutoExposure({ scene });
const exposureFields = [
  ["locked", "锁定当前曝光"],
  ["exposureCompensation", "曝光补偿（档）", -10, 10, 0.1],
  ["speedUp", "适应亮处（档/秒）", 0.01, 100, 0.01],
  ["speedDown", "适应暗处（档/秒）", 0.01, 100, 0.01],
  ["minimumExposure", "最低自动倍率", 1 / 65536, 1, 1 / 65536],
  ["maximumExposure", "最高自动倍率", 1, 65536, 1],
  ["centerWeight", "中央测光权重", 0, 1, 0.01],
  ["lowPercent", "忽略暗部比例", 0, 0.49, 0.01],
  ["highPercent", "保留亮度上限分位", 0.5, 1, 0.01],
];
const autoExposureDefaults = Object.fromEntries(
  ["enabled", ...exposureFields.map(([key]) => key)].map((key) => [
    key,
    autoExposure[key],
  ]),
);
const exposureState = {
  diagnostics: false,
  get enabled() {
    return autoExposure.enabled;
  },
  set enabled(value) {
    if (value) {
      scene.highDynamicRange = true;
    }
    autoExposure.enabled = value;
  },
};
// The native picker disables terrain depth for Ellipsoid; active effects need it.
const removeTerrainChanged =
  scene.globe?.terrainProviderChanged.addEventListener(() => {
    if (effects.enabled) {
      scene.globe.depthTestAgainstTerrain = true;
    }
  });
let environment;
if (planar) {
  // Celestial reference is explicit, independent of the planar CRS.
  environment = new C.SceneGISPlanarEnvironment({
    world: viewer.planarWorld,
    directionMode: "astronomical",
    originLongitude: C.Math.toRadians(longitude),
    originLatitude: C.Math.toRadians(latitude),
    sunDirection: C.Cartesian3.UNIT_Z,
    moonDirection: C.Cartesian3.negate(C.Cartesian3.UNIT_Z, new C.Cartesian3()),
  });
  viewer.addController(environment);
}
document.getElementById("worldHelp").textContent = planar
  ? "平面采用南京 Web Mercator 坐标和南京天文参考点，默认加载 World Imagery（EPSG:3857），需联网；关闭影像可回到本地底色。空气透视距离倍率按引擎契约固定为 1。"
  : "右上角为原生影像与地形选择器。初始为 World Imagery（EPSG:3857）和椭球，需联网；可切换本地 Natural Earth。Cesium ion 使用 SDK 的令牌配置。";

function home() {
  const pitch = C.Math.toRadians(-12);
  viewer.camera.setView({
    destination: planar
      ? new C.Cartesian3(origin.x, origin.y, 2500)
      : C.Cartesian3.fromDegrees(longitude, latitude, 2500),
    orientation: planar
      ? {
          direction: new C.Cartesian3(0, Math.cos(pitch), Math.sin(pitch)),
          up: new C.Cartesian3(0, -Math.sin(pitch), Math.cos(pitch)),
        }
      : { heading: 0, pitch, roll: 0 },
  });
  autoExposure.reset();
  scene.requestRender();
}
home();

// Every writable SceneGISEnvironmentEffects property is represented here.
// Values and reset snapshots come from the live engine, not copied presets.
const groups = [
  [
    "天空与光照",
    ["showAtmosphere", "物理天空与太阳"],
    ["showAerialPerspective", "空气透视"],
    ["whiteBalance", "太阳白平衡（HDR / LDR）"],
    ["backgroundRadianceScale", "天空亮度", 0, 64, 0.01],
    ["aerialRadianceScale", "空气透视亮度", 0, 64, 0.01],
    ["aerialPerspectiveDistanceScale", "空气透视距离倍率", 0, 8, 0.01],
    ["surfaceRadianceScale", "地表与模型亮度", 0, 64, 0.01],
    ["nightAmbientIntensity", "夜间环境光", 0, 8, 0.01],
    ["showMoonlight", "月光"],
    ["moonlightIntensity", "月光强度", 0, 64, 0.01],
    ["showStars", "星空"],
    ["starIntensity", "星光强度", 0, 64, 0.01],
  ],
  [
    "高度雾",
    ["showHeightFog", "高度雾开关"],
    ["heightFogDensity", "雾密度", 0, 0.001, 0.000001],
    ["heightFogHeightFalloff", "高度衰减", 0, 0.001, 0.000001],
    ["heightFogBaseHeight", "基准高度（米）", -60000, 60000, 1],
    ["heightFogStartDistance", "起始距离（米）", 0, 300000, 1],
    ["heightFogMaximumOpacity", "最大不透明度", 0, 1, 0.01],
    ["heightFogInscatteringScale", "环境散射强度", 0, 64, 0.01],
    ["heightFogDirectionalInscatteringScale", "定向散射强度", 0, 64, 0.01],
    ["heightFogDirectionalInscatteringExponent", "定向散射指数", 1, 128, 0.1],
  ],
  [
    "体积云与云影",
    ["showClouds", "体积云"],
    ["cloudQuality", "云质量", { 低: "low", 中: "medium", 高: "high" }],
    [
      "cloudPreset",
      "云型",
      { 积云: "cumulus", 层云: "stratus", 卷云: "cirrus", 混合: "mixed" },
    ],
    ["cloudCoverage", "云覆盖率", 0, 1, 0.01],
    ["cloudDensity", "云密度", 0, 64, 0.01],
    ["cloudBaseHeight", "云底高度（米）", -500, 20000, 1],
    ["cloudThickness", "云层厚度（米）", 0, 20000, 1],
    ["cloudWindDirection", "风向（弧度）", -Math.PI, Math.PI, 0.000001],
    ["cloudWindSpeed", "风速（米/秒）", 0, 200, 0.1],
    ["cloudTime", "云时间（秒）", -1000000000, 1000000000, 0.1],
    ["cloudRadianceScale", "云亮度", 0, 64, 0.01],
    ["showCloudShadows", "云影"],
    ["showCrepuscularRays", "体积光"],
  ],
  [
    "泛光与光晕",
    ["showBloom", "泛光"],
    ["bloomThreshold", "泛光阈值", 0, 65504, 0.01],
    ["bloomIntensity", "泛光强度", 0, 64, 0.001],
    ["showLensFlare", "镜头光晕"],
    ["lensFlareIntensity", "光晕强度", 0, 64, 0.01],
  ],
];
const properties = [
  "enabled",
  ...groups.flatMap(([, ...fields]) => fields.map(([key]) => key)),
];
const defaults = Object.fromEntries(
  properties.map((key) => [key, effects[key]]),
);
const displayDefaults = {
  highDynamicRange: scene.highDynamicRange,
  tonemapper: scene.postProcessStages.tonemapper,
  exposure: scene.postProcessStages.exposure,
};

const clockAnchor = C.JulianDate.clone(viewer.clock.currentTime);
let cloudAnchor = effects.cloudTime;
function anchorCloudTime() {
  C.JulianDate.clone(viewer.clock.currentTime, clockAnchor);
  cloudAnchor = effects.cloudTime;
}
const removeTick = viewer.clock.onTick.addEventListener((clock) => {
  effects.cloudTime =
    cloudAnchor +
    C.JulianDate.secondsDifference(clock.currentTime, clockAnchor);
});

const gui = new GUI({
  title: "环境参数",
  container: document.getElementById("controls"),
});
const actions = {
  home,
  reset() {
    Object.assign(autoExposure, autoExposureDefaults);
    autoExposure.reset();
    exposureState.diagnostics = false;
    Object.assign(effects, defaults);
    scene.highDynamicRange = displayDefaults.highDynamicRange;
    scene.postProcessStages.tonemapper = displayDefaults.tonemapper;
    scene.postProcessStages.exposure = displayDefaults.exposure;
    anchorCloudTime();
    gui.controllersRecursive().forEach((control) => control.updateDisplay());
    scene.requestRender();
  },
};
gui.add(actions, "home").name("回到南京视角");
gui.add(actions, "reset").name("恢复环境默认值");
gui.add(effects, "enabled").name("高级环境总开关").listen();
if (planarImageryLayer) {
  gui.add(planarImageryLayer, "show").name("显示 World Imagery").listen();
}
const vectors = installVectorInspection(viewer, gui);
for (const [title, ...fields] of groups) {
  const folder = gui.addFolder(title);
  for (const [property, label, ...range] of fields) {
    const control = folder
      .add(effects, property, ...range)
      .name(label)
      .listen();
    control.domElement.title = property;
    if (property === "cloudTime") {
      control.onChange(anchorCloudTime);
    }
    if (planar && property === "aerialPerspectiveDistanceScale") {
      control.disable();
      control.domElement.title = "平面引擎要求固定为 1；球面支持调节。";
    }
  }
  folder.close();
}
const display = gui.addFolder("HDR 与曝光");
display
  .add(scene, "highDynamicRange")
  .name("HDR 显示")
  .listen()
  .onChange((enabled) => {
    if (!enabled) {
      autoExposure.enabled = false;
    }
  });
display
  .add(scene.postProcessStages, "tonemapper", C.Tonemapper)
  .name("色调映射")
  .listen();
display
  .add(scene.postProcessStages, "exposure", 0.01, 64, 0.01)
  .name("手动曝光")
  .listen();
const exposureFolder = display.addFolder("自动曝光对照");
const automatic = exposureFolder
  .add(exposureState, "enabled")
  .name("自动曝光")
  .listen();
if (!C.SceneGISAutoExposure.isSupported(scene)) {
  automatic.disable();
  automatic.domElement.title = "此设备不支持自动曝光所需的 WebGL2 浮点目标。";
}
for (const [property, label, ...range] of exposureFields) {
  exposureFolder
    .add(autoExposure, property, ...range)
    .name(label)
    .listen();
}
exposureFolder.add(autoExposure, "reset").name("立即重新测光");
exposureFolder
  .add(exposureState, "diagnostics")
  .name("显示测光读数（诊断）")
  .listen();
display.close();
gui.onChange(() => scene.requestRender());

const error = document.getElementById("error");
const removeError = effects.errorEvent.addEventListener((...args) => {
  error.textContent = `环境错误：${args[1].message}`;
});
const removeRenderError = scene.renderError.addEventListener((...args) => {
  error.textContent = `渲染错误：${args[1].message}`;
});
const status = document.getElementById("status");
const exposureStatus = document.getElementById("exposureStatus");
let lastExposureRead = -Infinity;
let exposureReadout = "";
const removeStatus = scene.postRender.addEventListener(() => {
  const text = `${planar ? "平面" : "球面"} · ${!effects.enabled ? "环境已关闭" : effects.ready ? "环境已就绪" : "正在加载环境…"}`;
  if (status.textContent !== text) {
    status.textContent = text;
  }
  let exposureText;
  if (!scene.highDynamicRange) {
    exposureText = "曝光：LDR（自动曝光已关闭）";
  } else if (!autoExposure.enabled) {
    exposureText = `曝光：手动 ${scene.postProcessStages.exposure.toFixed(3)}×`;
  } else if (!autoExposure.ready) {
    exposureText = "曝光：等待测光";
  } else {
    exposureText = `曝光：自动${autoExposure.locked ? "（已锁定）" : "（适应中）"}`;
    if (exposureState.diagnostics) {
      const now = performance.now();
      if (now - lastExposureRead >= 250) {
        // Example-only diagnostic: read the existing 1x1 result, never the image.
        // RGBA stores divisor, adapted log2 gain, target log2 gain, mean log2 luminance.
        const [divisor, adapted, target, meanLog] = scene.context.readPixels({
          framebuffer: autoExposure._state.result.framebuffer,
          width: 1,
          height: 1,
        });
        exposureReadout = `自动 ${Math.pow(2, adapted).toFixed(3)}× · 目标 ${Math.pow(2, target).toFixed(3)}×\n合成 ${(1 / divisor).toFixed(3)}× · 测光亮度 ${Math.pow(2, meanLog).toPrecision(4)}`;
        lastExposureRead = now;
      }
      exposureText += `\n${exposureReadout}`;
    }
  }
  if (!autoExposure.ready || !exposureState.diagnostics) {
    lastExposureRead = -Infinity;
    exposureReadout = "";
  }
  if (exposureStatus.textContent !== exposureText) {
    exposureStatus.textContent = exposureText;
  }
});
exposeExample(
  viewer,
  gui,
  {
    effects,
    environment,
    defaults,
    displayDefaults,
    actions,
    vectors,
    autoExposure,
    autoExposureDefaults,
    exposureState,
    imageryProvider,
  },
  () => {
    removeTick();
    removeStatus();
    removeError();
    removeRenderError();
    removeTerrainChanged?.();
    removeImageryError();
    vectors.destroy();
    if (environment) {
      viewer.removeController(environment);
    }
    // Effects and auto exposure belong to Scene and are released by Viewer.destroy().
  },
);

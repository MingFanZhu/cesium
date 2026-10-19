/* global document, window, URLSearchParams */
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
if (planar) {
  // Online MVT uses the standard single-root Web Mercator tile matrix.
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
  // Keep the native catalog, initially selecting its bundled offline assets.
  const imagery = C.createDefaultImageryProviderViewModels();
  const terrain = C.createDefaultTerrainProviderViewModels();
  Object.assign(modeOptions, {
    baseLayerPicker: true,
    imageryProviderViewModels: imagery,
    terrainProviderViewModels: terrain,
    selectedImageryProviderViewModel: imagery.find((item) =>
      item.name.startsWith("Natural Earth"),
    ),
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
const effects = scene.environmentEffects;
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
  ? "平面采用南京 Web Mercator 坐标和南京天文参考点，初始为本地底色地表。空气透视距离倍率按引擎契约固定为 1。"
  : "右上角为原生影像与地形选择器。初始为本地 Natural Earth 和椭球；在线图层依赖网络及相应服务授权，Cesium ion 使用 SDK 的令牌配置。";

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
    ["bloomIntensity", "泛光强度", 0, 64, 0.01],
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
display.add(scene, "highDynamicRange").name("HDR 显示").listen();
display
  .add(scene.postProcessStages, "tonemapper", C.Tonemapper)
  .name("色调映射")
  .listen();
display
  .add(scene.postProcessStages, "exposure", 0.01, 64, 0.01)
  .name("手动曝光")
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
const removeStatus = scene.postRender.addEventListener(() => {
  const text = `${planar ? "平面" : "球面"} · ${!effects.enabled ? "环境已关闭" : effects.ready ? "环境已就绪" : "正在加载环境…"}`;
  if (status.textContent !== text) {
    status.textContent = text;
  }
});
exposeExample(
  viewer,
  gui,
  { effects, environment, defaults, displayDefaults, actions, vectors },
  () => {
    removeTick();
    removeStatus();
    removeError();
    removeRenderError();
    removeTerrainChanged?.();
    vectors.destroy();
    if (environment) {
      viewer.removeController(environment);
    }
    // The default effects belong to Scene and are released by Viewer.destroy().
  },
);

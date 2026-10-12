/* global window, document, URLSearchParams, Blob, URL, fetch */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";
import createStreetControls from "./PBR街道面板.js";

const params = new URLSearchParams(window.location.search);
const planar = params.get("world") !== "globe";
const composite = document.body.dataset.composite === "true";
const street = composite && params.get("asset") !== "sponza";
const original = params.get("textures") === "original";
const variant = street
  ? "bistro-delivery-1k"
  : original
    ? "original-4k"
    : "delivery-2k";
const panelButton = document.getElementById("toggle-panels");
function togglePanels() {
  const hidden = document.body.classList.toggle("panels-hidden");
  panelButton.textContent = hidden ? "显示面板" : "隐藏面板";
}
panelButton.addEventListener("click", togglePanels);
const local = "./pbr-data/local/";
const intel = `${local}${original ? "" : "2k/"}`;
const khronos = `${local}khronos/Models/`;
const longitude = street ? 0 : -75.596;
const latitude = street ? 51.4779 : 40.038;
const frame = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(longitude, latitude),
    );
for (const link of document.querySelectorAll("a[data-world]")) {
  link.search = new URLSearchParams({
    world: link.dataset.world,
    textures: street ? "1k" : original ? "original" : "2k",
    ...(composite ? { asset: street ? "bistro" : "sponza" } : {}),
  });
}
document.getElementById("other-page").search = params;
const assetLink = document.getElementById("asset-link");
if (assetLink) {
  assetLink.search = new URLSearchParams({
    world: planar ? "planar" : "globe",
    asset: street ? "sponza" : "bistro",
  });
  assetLink.textContent = street ? "Sponza 材质与水池样本" : "Bistro 街区场景";
  document.getElementById("bistro-notes").hidden = !street;
  document.getElementById("sponza-notes").hidden = street;
  document.getElementById("scene-description").textContent = street
    ? "Bistro 街区 · 建筑、路面、植被与街道设施"
    : "Sponza + 窗帘 + 标准材质样本 + 水池";
}
const textureLink = document.getElementById("texture-link");
textureLink.hidden = street;
textureLink.search = new URLSearchParams({
  world: planar ? "planar" : "globe",
  textures: original ? "2k" : "original",
  ...(composite ? { asset: "sponza" } : {}),
});
if (original) {
  textureLink.textContent = "返回 2K 纹理交付版";
}
document.getElementById("variant").textContent = street
  ? "1K 纹理交付版 · 原始贴图通道恢复 · 用户几何保留"
  : original
    ? "原始 4K 纹理 · 高显存占用"
    : "2K 纹理交付版 · 原始几何与材质 · 本地加载";

const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: street ? -250 : -100,
            minimumY: street ? -250 : -100,
            maximumX: street ? 250 : 100,
            maximumY: street ? 250 : 100,
          },
          maximumLevel: 0,
        },
      }
    : { baseLayer: false }),
  shadows: true,
  skyBox: false,
  skyAtmosphere: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene;
if (planar) {
  viewer.planarWorld.show = false;
} else {
  scene.globe.show = false;
  scene.globe.showGroundAtmosphere = false;
  scene.globe.enableLighting = false;
}
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
scene.fog.enabled = false;
scene.sunBloom = false;
scene.highDynamicRange = true;
scene.backgroundColor = C.Color.fromCssColorString("#8295a7");
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = false;
scene.postProcessStages.exposure = 1;
scene.postProcessStages.tonemapper = C.Tonemapper.PBR_NEUTRAL;
scene.shadowMap.size = 2048;
scene.shadowMap.maximumDistance = street ? 300 : 60;
scene.shadowMap.softShadows = true;
const initialTime = C.JulianDate.fromIso8601(
  street ? "2026-03-20T14:00:00Z" : "2026-06-21T19:00:00Z",
);
viewer.clock.currentTime = C.JulianDate.clone(initialTime);
viewer.clock.shouldAnimate = false;

function point(position) {
  return C.Matrix4.multiplyByPoint(
    frame,
    C.Cartesian3.fromArray(position),
    new C.Cartesian3(),
  );
}
function vector(value) {
  return C.Matrix4.multiplyByPointAsVector(frame, value, new C.Cartesian3());
}
const lightDirection = C.Cartesian3.normalize(
  new C.Cartesian3(-0.35, 0.55, -1),
  new C.Cartesian3(),
);
const fixedLight = new C.DirectionalLight({
  direction: vector(lightDirection),
  intensity: 2.5,
});
scene.light = fixedLight;
const fixedSH = [
  new C.Cartesian3(0.55, 0.7, 0.9),
  ...Array.from({ length: 8 }, () => new C.Cartesian3()),
];
const fixedMap = "/Specs/Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2";
const ibl = new C.ImageBasedLighting();
// These are authored example balances, not geometric sky visibility or GI.
const lighting = {
  diffuse: street ? 0.5 : 1,
  specular: 1,
  shadowDarkness: street ? 0 : 0.3,
  shadowSize: 2048,
  shadowDistance: street ? 300 : 60,
  softShadows: true,
};
const environmentDefaults = Object.freeze({
  mode: "物理大气",
  day: street ? 79 : 172,
  hour: street ? 14 : 19,
  showAtmosphere: true,
  showAerialPerspective: true,
  backgroundRadianceScale: 3,
  aerialRadianceScale: 1,
  surfaceRadianceScale: 3,
  exposure: street ? 2.5 : 1,
  showHeightFog: false,
  heightFogDensity: 0.0002,
  heightFogHeightFalloff: 0.0002,
  heightFogBaseHeight: 0,
  heightFogStartDistance: 0,
  heightFogMaximumOpacity: 0.7,
});
const atmosphere = { ...environmentDefaults };
const solarLight = new C.SunLight({ intensity: 2 });
const environment = planar
  ? new C.SceneGISPlanarEnvironment({
      world: viewer.planarWorld,
      sunDirection: C.Cartesian3.UNIT_Z,
      moonDirection: C.Cartesian3.UNIT_Y,
      directionMode: "astronomical",
      originLongitude: C.Math.toRadians(longitude),
      originLatitude: C.Math.toRadians(latitude),
      showAtmosphere: false,
      showSun: false,
      showMoon: false,
    })
  : undefined;
if (environment) {
  environment.enabled = false;
  viewer.addController(environment);
}
const effects = new C.SceneGISEnvironmentEffects({
  mode: planar ? "planar" : "globe",
  world: planar ? viewer.planarWorld : undefined,
  enabled: false,
  showAtmosphere: true,
  showAerialPerspective: true,
  showHeightFog: false,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: false,
});
viewer.addController(effects);
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
const ssil = new C.SceneGISScreenSpaceIndirectLighting({ scene });
const autoExposure = new C.SceneGISAutoExposure({ scene });
const specularAA = new C.SceneGISSpecularAntialiasing({ scene });
const ssr = new C.SceneGISScreenSpaceReflections({
  scene,
  enabled: false,
  maximumDistance: 35,
  thickness: 0.15,
});
const ao = scene.postProcessStages.ambientOcclusion;
const baseline = Object.freeze({
  shadows: true,
  ao: false,
  ssr: false,
  antialiasing: "TAA",
  specularAA: false,
  ssil: false,
  aoIntensity: 0.8,
  aoRadius: 0.7,
});
const trial = { ...baseline, ao: true, ssr: true, specularAA: true };
const rendering = street ? { ...trial } : undefined;
const models = [];
const shaders = [];
let disposed = false;
let localProbes;
let probePlacement;
const probeOptions = {
  show: true,
  reflections: true,
  occlusion: true,
  x: street ? 38 : 0,
  y: street ? -25 : 0,
  z: street ? 3 : 2,
  range: street ? 40 : 12,
  apply: applyLocalProbes,
  capture: captureLocalProbes,
};
let water;
let removeReady;
let manifest;

// glTF Y-up becomes local Z-up using Model's explicit forwardAxis=X option.
// Downward inspection poses retain the standard surface-navigation controls.
const views = street
  ? {
      餐馆街景: {
        position: [-10, -6.8, 4],
        target: [4, -3.8, 2.5],
        yfov: 1.05,
      },
      街区全景: {
        position: [170, -180, 145],
        target: [24, -4, 12],
        yfov: 0.95,
      },
      临街立面: { position: [70, -75, 35], target: [20, -5, 8], yfov: 1.0 },
      街道近景: { position: [58, -48, 9], target: [32, -9, 2], yfov: 1.05 },
      屋顶与天空: {
        position: [-70, -110, 100],
        target: [24, -4, 20],
        yfov: 1.0,
      },
    }
  : {
      俯瞰全景: {
        position: [-28, -28, 26],
        target: [0, 0, 4],
        yfov: 1.0,
      },
      中庭: {
        position: [-8.8, 0.86, 6],
        target: [2, 0, 2],
        yfov: 1.02122664,
      },
      上层与阴影: {
        position: [10.5, -1.53, 9],
        target: [-3, 0, 5],
        yfov: 1.02323031,
      },
      拱廊接触: {
        position: [2.7, -2.11, 2],
        target: [-2, 0, 0.8],
        yfov: 0.6327615,
      },
      屋顶与天空: {
        position: [-25, -18, 27],
        target: [0, 0, 19],
        yfov: 1.03,
      },
      ...(composite
        ? {
            材质矩阵: {
              position: [4.5, -1.6, 2.05],
              target: [4.5, 0.6, 1.65],
              yfov: 1.35,
            },
            头盔与玻璃: {
              position: [-3.25, -1.8, 1.42],
              target: [-3.05, -0.45, 1.23],
              yfov: 0.95,
            },
            水池反射: {
              position: [-3.6, -1.9, 1.8],
              target: [0, 0.45, 0.5],
              yfov: 1.0,
            },
          }
        : {}),
    };
const state = {
  ready: false,
  ...(street ? {} : { comparison: "实验 B" }),
  view: street ? "餐馆街景" : "俯瞰全景",
  animate: false,
  resetView() {
    const view = views[state.view];
    const direction = view.direction
      ? C.Cartesian3.fromArray(view.direction)
      : C.Cartesian3.normalize(
          C.Cartesian3.subtract(
            C.Cartesian3.fromArray(view.target),
            C.Cartesian3.fromArray(view.position),
            new C.Cartesian3(),
          ),
          new C.Cartesian3(),
        );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    const up = view.up
      ? C.Cartesian3.fromArray(view.up)
      : C.Cartesian3.cross(right, direction, new C.Cartesian3());
    viewer.camera.setView({
      destination: point(view.position),
      orientation: { direction: vector(direction), up: vector(up) },
    });
    // Cesium's fov is horizontal for a landscape viewport; preserve authored vertical FOV.
    const aspect = scene.drawingBufferWidth / scene.drawingBufferHeight;
    viewer.camera.frustum.fov =
      aspect > 1 ? 2 * Math.atan(Math.tan(view.yfov / 2) * aspect) : view.yfov;
    viewer.camera.frustum.near = 0.05;
    viewer.camera.frustum.far = street ? 1000 : 250;
    taa.reset();
  },
  apply() {
    const settings = street
      ? rendering
      : state.comparison === "基线 A"
        ? baseline
        : trial;
    viewer.shadows = settings.shadows;
    ao.enabled = settings.ao;
    ao.uniforms.intensity = settings.aoIntensity;
    ao.uniforms.lengthCap = settings.aoRadius;
    ssr.enabled = settings.ssr;
    ssil.enabled = settings.ssil;
    taa.enabled = settings.antialiasing === "TAA";
    if (specularAA.enabled !== settings.specularAA) {
      specularAA.enabled = settings.specularAA;
      taa.reset();
      ssr.reset();
    }
    probeOptions.apply();
    scene.msaaSamples = settings.antialiasing === "4×MSAA" ? 4 : 1;
    scene.postProcessStages.fxaa.enabled = settings.antialiasing === "FXAA";
    document.getElementById("comparison").textContent =
      `${street ? "" : `${state.comparison} · `}${atmosphere.mode} / 曝光 ${atmosphere.exposure} · ${settings.antialiasing}`;
    scene.requestRender();
  },
  applyLighting() {
    ibl.imageBasedLightingFactor.x = lighting.diffuse;
    ibl.imageBasedLightingFactor.y = lighting.specular;
    scene.shadowMap.darkness = lighting.shadowDarkness;
    scene.shadowMap.size = lighting.shadowSize;
    scene.shadowMap.maximumDistance = lighting.shadowDistance;
    scene.shadowMap.softShadows = lighting.softShadows;
    taa.reset();
    ssr.reset();
    scene.requestRender();
  },
  setTime() {
    viewer.clock.currentTime = C.JulianDate.addHours(
      C.JulianDate.fromIso8601("2026-01-01T00:00:00Z"),
      (atmosphere.day - 1) * 24 + atmosphere.hour,
      new C.JulianDate(),
    );
    taa.reset();
    scene.requestRender();
  },
  applyAtmosphere() {
    const physical = atmosphere.mode === "物理大气";
    if (physical !== effects.enabled) {
      if (physical) {
        scene.light = solarLight;
        if (environment) {
          environment.enabled = true;
        }
        effects.enabled = true;
        ibl.sphericalHarmonicCoefficients = undefined;
        ibl.specularEnvironmentMaps = undefined;
      } else {
        // Release the advanced owner before restoring the previous native light.
        effects.enabled = false;
        if (environment) {
          environment.enabled = false;
        }
        scene.light = fixedLight;
        ibl.sphericalHarmonicCoefficients = fixedSH;
        ibl.specularEnvironmentMaps = fixedMap;
      }
    }
    for (const key of [
      "showAtmosphere",
      "showAerialPerspective",
      "backgroundRadianceScale",
      "aerialRadianceScale",
      "surfaceRadianceScale",
      "showHeightFog",
      "heightFogDensity",
      "heightFogHeightFalloff",
      "heightFogBaseHeight",
      "heightFogStartDistance",
      "heightFogMaximumOpacity",
    ]) {
      effects[key] = atmosphere[key];
    }
    scene.postProcessStages.exposure = atmosphere.exposure;
    taa.reset();
    state.apply();
  },
  resetAtmosphere() {
    Object.assign(atmosphere, environmentDefaults);
    state.animate = false;
    state.setAnimation();
    state.setTime();
    state.applyAtmosphere();
  },
  setAnimation() {
    viewer.clock.shouldAnimate = state.animate;
  },
  snapshot() {
    return {
      schema: "scenegis-pbr-reference-v1",
      asset: manifest?.id,
      khronosRevision: manifest?.khronos?.revision,
      sourceGlb: street ? manifest?.sourceGlb : undefined,
      sourceFbx: street ? manifest?.sourceFbx : undefined,
      materialNotes: street ? manifest?.assumptions : undefined,
      layout: street
        ? "bistro-street"
        : composite
          ? "composite"
          : "sponza-main",
      textures: variant,
      world: planar ? "planar" : "globe",
      ...(street ? {} : { comparison: state.comparison }),
      settings: {
        ...(street
          ? rendering
          : state.comparison === "基线 A"
            ? baseline
            : trial),
      },
      environmentEffects: street
        ? Object.fromEntries(
            [
              "showClouds",
              "showCloudShadows",
              "showCrepuscularRays",
              "cloudQuality",
              "cloudPreset",
              "cloudCoverage",
              "cloudDensity",
              "cloudRadianceScale",
              "showMoonlight",
              "moonlightIntensity",
              "showBloom",
              "bloomThreshold",
              "bloomIntensity",
              "showLensFlare",
              "lensFlareIntensity",
            ].map((key) => [key, effects[key]]),
          )
        : undefined,
      reflections: {
        resolutionScale: ssr.resolutionScale,
        temporalFiltering: ssr.temporalFiltering,
      },
      lighting: {
        imageBasedLightingFactor: C.Cartesian2.pack(
          ibl.imageBasedLightingFactor,
          [],
        ),
        toneMapper: scene.postProcessStages.tonemapper,
        shadows: {
          enabled: viewer.shadows,
          darkness: scene.shadowMap.darkness,
          size: scene.shadowMap.size,
          maximumDistance: scene.shadowMap.maximumDistance,
          softShadows: scene.shadowMap.softShadows,
        },
        source: atmosphere.mode,
        directionLocal: effects.enabled
          ? undefined
          : C.Cartesian3.pack(lightDirection, []),
        intensity: effects.enabled
          ? solarLight.intensity
          : fixedLight.intensity,
        exposure: scene.postProcessStages.exposure,
        autoExposure: {
          enabled: autoExposure.enabled,
          locked: autoExposure.locked,
          compensation: autoExposure.exposureCompensation,
          minimum: autoExposure.minimumExposure,
          maximum: autoExposure.maximumExposure,
          speedUp: autoExposure.speedUp,
          speedDown: autoExposure.speedDown,
          lowPercent: autoExposure.lowPercent,
          highPercent: autoExposure.highPercent,
          centerWeight: autoExposure.centerWeight,
        },
        specularEnvironment: ibl.specularEnvironmentMaps,
        diffuseSH: ibl.sphericalHarmonicCoefficients?.map((v) =>
          C.Cartesian3.pack(v, []),
        ),
      },
      atmosphere: { ...atmosphere, year: 2026, longitude, latitude },
      time: C.JulianDate.toIso8601(viewer.clock.currentTime),
      animate: state.animate,
      view: state.view,
      camera: {
        position: C.Cartesian3.pack(viewer.camera.positionWC, []),
        direction: C.Cartesian3.pack(viewer.camera.directionWC, []),
        up: C.Cartesian3.pack(viewer.camera.upWC, []),
        fov: viewer.camera.frustum.fov,
        near: viewer.camera.frustum.near,
        far: viewer.camera.frustum.far,
      },
      resolution: [scene.drawingBufferWidth, scene.drawingBufferHeight],
      unsupportedMaterials: manifest?.unsupported,
    };
  },
  exportConfig() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state.snapshot(), null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `pbr-reference-${street ? "bistro" : composite ? "composite" : "main"}-${planar ? "planar" : "globe"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  },
};
const gui = new GUI({
  title: composite ? "PBR 综合验收" : "Sponza 主体基准",
  width: street ? 330 : 245,
  container: document.getElementById("controls"),
});
let probeCaptureButton;
if (street) {
  createStreetControls({
    gui,
    viewer,
    state,
    atmosphere,
    lighting,
    rendering,
    effects,
    autoExposure,
    ssr,
    ssil,
    taa,
    views,
  });
} else {
  probeCaptureButton = createReferenceControls();
}

function createReferenceControls() {
  gui
    .add(state, "view", Object.keys(views))
    .name("固定视角")
    .onChange(state.resetView);
  gui.add(state, "resetView").name("恢复固定视角");
  const exposureFolder = gui.addFolder("自动曝光 / 人眼适应").close();
  exposureFolder.add(autoExposure, "enabled").name("自动曝光").listen();
  exposureFolder.add(autoExposure, "locked").name("锁定当前曝光").listen();
  exposureFolder
    .add(autoExposure, "exposureCompensation", -3, 3, 0.1)
    .name("曝光补偿（档）");
  exposureFolder
    .add(autoExposure, "minimumExposure", 1 / 64, 1, 1 / 64)
    .name("最低自动倍率");
  exposureFolder
    .add(autoExposure, "maximumExposure", 1, 64, 0.5)
    .name("最高自动倍率");
  exposureFolder
    .add(autoExposure, "speedUp", 0.1, 10, 0.1)
    .name("适应亮处（档/秒）");
  exposureFolder
    .add(autoExposure, "speedDown", 0.1, 10, 0.1)
    .name("适应暗处（档/秒）");
  exposureFolder
    .add(autoExposure, "centerWeight", 0, 1, 0.05)
    .name("中央测光权重");
  exposureFolder
    .add(autoExposure, "lowPercent", 0, 0.4, 0.01)
    .name("忽略暗部比例");
  exposureFolder
    .add(autoExposure, "highPercent", 0.6, 1, 0.01)
    .name("保留亮度上限分位");
  exposureFolder.add(autoExposure, "reset").name("立即重新测光");
  const atmosphereFolder = gui.addFolder("物理大气与光照");
  atmosphereFolder
    .add(atmosphere, "mode", ["物理大气", "固定 IBL"])
    .name("照明模式")
    .listen()
    .onChange(state.applyAtmosphere);
  atmosphereFolder
    .add(atmosphere, "day", 1, 365, 1)
    .name("年内日序（2026）")
    .listen()
    .onChange(state.setTime);
  atmosphereFolder
    .add(atmosphere, "hour", 0, 23.99, 0.05)
    .name("时间（UTC 小时）")
    .listen()
    .onChange(state.setTime);
  atmosphereFolder
    .add(atmosphere, "exposure", 0.1, 4, 0.05)
    .name("曝光倍率")
    .listen()
    .onChange(state.applyAtmosphere);
  atmosphereFolder
    .add(atmosphere, "showAtmosphere")
    .name("物理天空")
    .listen()
    .onChange(state.applyAtmosphere);
  atmosphereFolder
    .add(atmosphere, "showAerialPerspective")
    .name("空气透视")
    .listen()
    .onChange(state.applyAtmosphere);
  atmosphereFolder
    .add(atmosphere, "backgroundRadianceScale", 0, 16, 0.1)
    .name("天空亮度")
    .listen()
    .onChange(state.applyAtmosphere);
  atmosphereFolder
    .add(atmosphere, "aerialRadianceScale", 0, 4, 0.05)
    .name("空气散射亮度")
    .listen()
    .onChange(state.applyAtmosphere);
  atmosphereFolder
    .add(atmosphere, "surfaceRadianceScale", 0, 8, 0.1)
    .name(street ? "太阳与天空总倍率" : "物体光照亮度")
    .listen()
    .onChange(state.applyAtmosphere);
  const fogFolder = atmosphereFolder.addFolder("高度雾").close();
  fogFolder
    .add(atmosphere, "showHeightFog")
    .name("启用高度雾")
    .listen()
    .onChange(state.applyAtmosphere);
  fogFolder
    .add(atmosphere, "heightFogDensity", 0, 0.001, 0.00001)
    .name("雾密度（每米）")
    .listen()
    .onChange(state.applyAtmosphere);
  fogFolder
    .add(atmosphere, "heightFogHeightFalloff", 0, 0.001, 0.00001)
    .name("高度衰减（每米）")
    .listen()
    .onChange(state.applyAtmosphere);
  fogFolder
    .add(atmosphere, "heightFogBaseHeight", -10, 100, 1)
    .name("雾基准高度（米）")
    .listen()
    .onChange(state.applyAtmosphere);
  fogFolder
    .add(atmosphere, "heightFogStartDistance", 0, 100, 1)
    .name("起雾距离（米）")
    .listen()
    .onChange(state.applyAtmosphere);
  fogFolder
    .add(atmosphere, "heightFogMaximumOpacity", 0, 1, 0.05)
    .name("最大不透明度")
    .listen()
    .onChange(state.applyAtmosphere);
  atmosphereFolder.add(state, "resetAtmosphere").name("恢复大气基准");
  const comparisonController = gui
    .add(state, "comparison", ["基线 A", "实验 B"])
    .name("对比状态");
  const trialFolder = gui.addFolder("实验 B 参数");
  trialFolder.add(trial, "specularAA").name("高光抗锯齿").onChange(state.apply);
  comparisonController.onChange(() => {
    trialFolder.show(state.comparison === "实验 B");
    state.apply();
  });
  trialFolder.add(trial, "shadows").name("几何阴影").onChange(state.apply);
  trialFolder.add(trial, "ao").name("环境光遮蔽").onChange(state.apply);
  trialFolder
    .add(trial, "aoIntensity", 0, 2, 0.05)
    .name("遮蔽强度")
    .onChange(state.apply);
  trialFolder
    .add(trial, "aoRadius", 0.1, 2, 0.1)
    .name("遮蔽半径（米）")
    .onChange(state.apply);
  trialFolder
    .add(trial, "ssil")
    .name("屏幕空间间接光（实验）")
    .onChange(() => {
      state.apply();
      taa.reset();
      ssr.reset();
    });
  trialFolder
    .add(ssil, "intensity", 0, 4, 0.05)
    .name("间接光强度")
    .onChange(() => taa.reset());
  trialFolder
    .add(ssil, "radius", 0.5, 20, 0.5)
    .name("间接光距离（米）")
    .onChange(() => taa.reset());
  trialFolder
    .add(ssil, "thickness", 0.05, 2, 0.05)
    .name("间接光厚度（米）")
    .onChange(() => taa.reset());
  trialFolder.add(trial, "ssr").name("屏幕空间反射").onChange(state.apply);
  trialFolder
    .add(ssr, "resolutionScale", { 半分辨率: 0.5, 全分辨率: 1 })
    .name("反射分辨率");
  trialFolder.add(ssr, "temporalFiltering").name("反射时域滤波");
  trialFolder.add(ssr, "reset").name("清除反射历史");
  const probeFolder = gui.addFolder("局部探针（手动捕获）").close();
  const probeCaptureButton = probeFolder
    .add(probeOptions, "capture")
    .name("捕获 / 更新局部环境");
  probeFolder
    .add(probeOptions, "show")
    .name("实验 B 启用探针")
    .onChange(probeOptions.apply);
  probeFolder
    .add(probeOptions, "occlusion")
    .name("环境遮挡")
    .onChange(probeOptions.apply);
  probeFolder
    .add(probeOptions, "reflections")
    .name("局部镜面反射")
    .onChange(probeOptions.apply);
  probeFolder.add(probeOptions, "x", -100, 150, 0.5).name("探针 X（米）");
  probeFolder.add(probeOptions, "y", -100, 100, 0.5).name("探针 Y（米）");
  probeFolder.add(probeOptions, "z", 0.5, 40, 0.5).name("探针 Z（米）");
  probeFolder.add(probeOptions, "range", 5, 60, 1).name("水平半宽（米）");
  trialFolder
    .add(trial, "antialiasing", ["无 AA", "FXAA", "TAA", "4×MSAA"])
    .name("抗锯齿")
    .onChange(state.apply);
  if (composite) {
    gui
      .add(state, "animate")
      .name(street ? "播放时间（太阳）" : "播放时间（水面与太阳）")
      .listen()
      .onChange(state.setAnimation);
  }
  gui.add(state, "exportConfig").name("导出验收配置");
  return probeCaptureButton;
}
if (street && planar) {
  const calibration = {
    async exportCycles() {
      calibration.button.disable();
      try {
        const { downloadCalibration } = await import("./PBR校准导出.js");
        await downloadCalibration(window.example);
      } catch (error) {
        document.getElementById("error").textContent = error.message;
      } finally {
        calibration.button.enable();
      }
    },
  };
  calibration.button = gui
    .add(calibration, "exportCycles")
    .name("导出 Cycles 校准");
}
function applyLocalProbes() {
  if (localProbes) {
    localProbes.show =
      probeOptions.show && (street || state.comparison === "实验 B");
    localProbes.reflections = probeOptions.reflections;
    localProbes.occlusion = probeOptions.occlusion;
  }
}
async function captureLocalProbes() {
  probeCaptureButton.disable();
  document.getElementById("error").textContent = "";
  try {
    if (!state.ready || !effects.enabled || !effects.ready) {
      throw new Error("请等待模型就绪，并启用物理大气照明后捕获。");
    }
    localProbes ??= new C.SceneGISReflectionProbeCollection({
      scene,
      resolution: 128,
    });
    window.example.probes = localProbes;
    const placement = JSON.stringify([
      probeOptions.x,
      probeOptions.y,
      probeOptions.z,
      probeOptions.range,
    ]);
    if (placement !== probePlacement) {
      const nextProbe = new C.SceneGISReflectionProbe({
        modelMatrix: C.Matrix4.multiplyByTranslation(
          frame,
          new C.Cartesian3(probeOptions.x, probeOptions.y, probeOptions.z),
          new C.Matrix4(),
        ),
        halfSize: new C.Cartesian3(
          probeOptions.range,
          probeOptions.range,
          street ? 15 : 8,
        ),
        blendDistance: 3,
        maximumDistance: Math.max(street ? 180 : 60, probeOptions.range * 2),
      });
      if (localProbes.length) {
        localProbes.remove(localProbes.get(0));
      }
      localProbes.add(nextProbe);
      probePlacement = placement;
    }
    probeOptions.apply();
    await localProbes.capture(models);
    const stats = localProbes._state;
    document.getElementById("status").textContent =
      `局部探针已更新 · ${stats.captureDraws} 次捕获绘制 · 光照变化后请再次更新`;
  } catch (error) {
    document.getElementById("error").textContent = error.message;
  } finally {
    if (!disposed) {
      probeCaptureButton.enable();
    }
  }
}
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
const removeAtmosphereError = effects.errorEvent.addEventListener((error) => {
  document.getElementById("error").textContent = error.message;
});
const clockYearStart = C.JulianDate.fromIso8601("2026-01-01T00:00:00Z");
const removeClockSync = viewer.clock.onTick.addEventListener((clock) => {
  const seconds = C.JulianDate.secondsDifference(
    clock.currentTime,
    clockYearStart,
  );
  const day = Math.floor(seconds / 86400);
  atmosphere.day = day + 1;
  atmosphere.hour = (seconds - day * 86400) / 3600;
  state.animate = clock.shouldAnimate;
  if (street) {
    effects.cloudTime = C.JulianDate.secondsDifference(
      clock.currentTime,
      initialTime,
    );
    document.getElementById("street-time").textContent =
      `格林尼治 · ${C.JulianDate.toIso8601(clock.currentTime, 0).replace("T", " ").replace("Z", " UTC / GMT")}`;
  }
});
exposeExample(
  viewer,
  gui,
  {
    state,
    ...(street ? { rendering } : { baseline, trial, probeOptions }),
    models,
    taa,
    specularAA,
    ssil,
    autoExposure,
    ssr,
    ao,
    ibl,
    atmosphere,
    lighting,
    effects,
    environment,
  },
  () => {
    disposed = true;
    panelButton.removeEventListener("click", togglePanels);
    removeError();
    removeAtmosphereError();
    removeClockSync();
    removeReady?.();
    viewer.removeController(effects);
    if (environment) {
      viewer.removeController(environment);
    }
    shaders.forEach((shader) => shader.destroy());
    ibl.destroy();
  },
);
state.resetView();
state.applyLighting();
state.applyAtmosphere();

async function addModel(
  url,
  position = [0, 0, 0],
  scale = [1, 1, 1],
  customShader,
) {
  const matrix = C.Matrix4.multiplyByTranslation(
    frame,
    C.Cartesian3.fromArray(position),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(matrix, C.Cartesian3.fromArray(scale), matrix);
  const model = await C.Model.fromGltfAsync({
    url,
    modelMatrix: matrix,
    upAxis: C.Axis.Y,
    forwardAxis: C.Axis.X,
    imageBasedLighting: ibl,
    customShader,
    shadows: C.ShadowMode.ENABLED,
    incrementallyLoadTextures: false,
  });
  if (disposed) {
    model.destroy();
    return;
  }
  models.push(scene.primitives.add(model));
  return model;
}
async function box(position, scale, color) {
  const shader = new C.CustomShader({
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(${color.join(",")}); material.specular = vec3(0.04); material.roughness = 0.65; }`,
  });
  shaders.push(shader);
  return addModel(
    "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    position,
    scale,
    shader,
  );
}
async function loadSponza() {
  const response = await fetch(`${local}prepared.json`);
  if (!response.ok) {
    throw new Error(
      "尚未准备本地数据：请按 pbr-data/README.md 运行 prepare-pbr-reference.mjs，然后刷新。",
    );
  }
  const prepared = await response.json();
  manifest = await (await fetch("./pbr-data/manifest.json")).json();
  if (prepared.id !== manifest.id) {
    throw new Error("本地数据与当前验收版本不一致，请重新运行资源准备脚本。");
  }
  if (disposed) {
    return;
  }
  await addModel(`${intel}main_sponza/NewSponza_Main_glTF_003.gltf`);
  if (disposed) {
    return;
  }
  if (composite) {
    await addModel(`${intel}pkg_a_curtains/NewSponza_Curtains_glTF.gltf`);
    if (disposed) {
      return;
    }
    await addModel(
      `${khronos}MetalRoughSpheres/glTF-Binary/MetalRoughSpheres.glb`,
      [4.5, 0.6, 1.72],
      [0.32, 0.32, 0.32],
    );
    if (disposed) {
      return;
    }
    await box([-3.0, -0.45, 0.42], [1.65, 1.0, 0.8], [0.2, 0.21, 0.23]);
    if (disposed) {
      return;
    }
    await addModel(
      `${khronos}FlightHelmet/glTF/FlightHelmet.gltf`,
      [-3.35, -0.45, 0.83],
      [1.25, 1.25, 1.25],
    );
    if (disposed) {
      return;
    }
    await addModel(
      `${khronos}GlassHurricaneCandleHolder/glTF-Binary/GlassHurricaneCandleHolder.glb`,
      [-2.7, -0.45, 0.83],
      [2.2, 2.2, 2.2],
    );
    if (disposed) {
      return;
    }
    await box([0.4, 0.6, 0.14], [3.8, 2.5, 0.24], [0.12, 0.21, 0.22]);
    for (const [position, scale] of [
      [
        [0.4, -0.69, 0.38],
        [4.1, 0.18, 0.68],
      ],
      [
        [0.4, 1.89, 0.38],
        [4.1, 0.18, 0.68],
      ],
      [
        [-1.56, 0.6, 0.38],
        [0.18, 2.4, 0.68],
      ],
      [
        [2.36, 0.6, 0.38],
        [0.18, 2.4, 0.68],
      ],
    ]) {
      if (disposed) {
        return;
      }
      await box(position, scale, [0.33, 0.34, 0.32]);
    }
    if (disposed) {
      return;
    }
    water = scene.primitives.add(
      new C.SceneGISWaterSurface({
        polygonHierarchy: new C.PolygonHierarchy(
          [
            [-1.45, -0.58, 0],
            [2.25, -0.58, 0],
            [2.25, 1.78, 0],
            [-1.45, 1.78, 0],
          ].map((v) => C.Cartesian3.fromArray(v)),
        ),
        modelMatrix: C.Matrix4.multiplyByTranslation(
          frame,
          new C.Cartesian3(0, 0, 0.59),
          new C.Matrix4(),
        ),
        waveAmplitude: 0.012,
        waveLength: 0.8,
        flowSpeed: 0.08,
        roughness: 0.08,
        foamWidth: 0.05,
        foamIntensity: 0.12,
      }),
    );
    window.example.water = water;
  }
}
async function loadScene() {
  if (street) {
    const response = await fetch(`${local}bistro/prepared.json`);
    if (!response.ok) {
      throw new Error(
        "尚未准备 Bistro：请按 pbr-data/Bistro.md 运行 prepare-bistro.py，然后刷新。",
      );
    }
    manifest = await response.json();
    const expected = await (
      await fetch("./pbr-data/bistro-manifest.json")
    ).json();
    if (
      manifest.sourceGlb.sha256 !== expected.sourceGlbSha256 ||
      manifest.sourceFbx.sha256 !== expected.sourceFbxSha256 ||
      manifest.maximumTextureSize !== expected.maximumTextureSize
    ) {
      throw new Error(
        "Bistro 数据与当前验收版本不一致，请检查 pbr-data/Bistro.md 并重新准备。",
      );
    }
    if (disposed) {
      return;
    }
    await addModel(`${local}bistro/Bistro.gltf`);
  } else {
    await loadSponza();
  }
  if (disposed) {
    return;
  }
  removeReady = scene.postRender.addEventListener(() => {
    if (
      models.every((model) => model.ready) &&
      (effects.enabled ? effects.ready : ibl.useSpecularEnvironmentMaps)
    ) {
      state.ready = true;
      autoExposure.reset();
      document.getElementById("status").textContent = street
        ? "Bistro 就绪 · 约 283 万三角面"
        : composite
          ? "本地资源就绪 · 约 635 万三角面"
          : "本地资源就绪 · 375 万三角面";
      removeReady();
      removeReady = undefined;
    }
  });
}
window.example.loading = loadScene().catch((error) => {
  if (!disposed) {
    document.getElementById("error").textContent = error.message;
  }
});

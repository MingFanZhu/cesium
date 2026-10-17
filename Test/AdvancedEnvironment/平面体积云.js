/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const viewer = new C.Viewer("map", {
  planarWorld: {
    crs: "LOCAL",
    extent: {
      minimumX: -2000000,
      minimumY: -2000000,
      maximumX: 2000000,
      maximumY: 2000000,
    },
    maximumLevel: 0,
    enableLighting: true,
    baseColor: C.Color.fromCssColorString("#6a8064"),
  },
  skyBox: false,
  skyAtmosphere: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  projectionPicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: true,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene;
scene.debugShowFramesPerSecond = true;
// The advanced pipeline owns the sky, fog and HDR effects.
scene.sunBloom = false;
scene.fog.enabled = false;
scene.highDynamicRange = true;
// Reference display pairing from the original atmosphere examples.
scene.postProcessStages.tonemapper = C.Tonemapper.AGX;
scene.postProcessStages.exposure = 10;
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = false;
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
scene.postProcessStages.bloom.enabled = false;
const world = viewer.planarWorld;
const environment = new C.SceneGISPlanarEnvironment({
  world,
  showAtmosphere: false,
  showSun: false,
  showMoon: false,
  sunDirection: C.Cartesian3.UNIT_Z,
  moonDirection: C.Cartesian3.UNIT_Y,
  directionMode: "astronomical",
  originLongitude: C.Math.toRadians(118.8406),
  originLatitude: C.Math.toRadians(32.0725),
});
viewer.addController(environment);
const effects = new C.SceneGISEnvironmentEffects({
  mode: "planar",
  world,
  enabled: true,
  showAtmosphere: true,
  showAerialPerspective: false,
  showHeightFog: false,
  showClouds: true,
  showCloudShadows: true,
  showCrepuscularRays: true,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: false,
  cloudQuality: "medium",
  cloudCoverage: 0.35,
  heightFogDensity: 0.000025,
  backgroundRadianceScale: 1,
  surfaceRadianceScale: 1,
});
viewer.addController(effects);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T02:30:00Z");
viewer.clock.shouldAnimate = false;
viewer.clock.multiplier = 1;
const day = C.JulianDate.fromIso8601("2026-06-20T16:00:00Z");
viewer.timeline.zoomTo(day, C.JulianDate.addDays(day, 1, new C.JulianDate()));
const epoch = C.JulianDate.clone(viewer.clock.currentTime);
const removeTick = viewer.clock.onTick.addEventListener((clock) => {
  effects.cloudTime = C.JulianDate.secondsDifference(clock.currentTime, epoch);
});
const heading = C.Math.toRadians(0);
const pitch = C.Math.toRadians(-5);
viewer.camera.setView({
  destination: new C.Cartesian3(0, -7000, 600),
  orientation: {
    direction: new C.Cartesian3(
      Math.sin(heading) * Math.cos(pitch),
      Math.cos(heading) * Math.cos(pitch),
      Math.sin(pitch),
    ),
    up: new C.Cartesian3(
      -Math.sin(heading) * Math.sin(pitch),
      -Math.cos(heading) * Math.sin(pitch),
      Math.cos(pitch),
    ),
  },
});

const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
gui.add(effects, "showClouds").name("体积云");
gui.add(taa, "enabled").name("TAA 抗锯齿");
gui
  .add(effects, "cloudQuality", { 低: "low", 中: "medium", 高: "high" })
  .name("质量");
gui
  .add(effects, "cloudPreset", {
    积云: "cumulus",
    层云: "stratus",
    卷云: "cirrus",
    混合: "mixed",
  })
  .name("云型");
gui.add(effects, "cloudCoverage", 0, 1, 0.01).name("覆盖率");
gui.add(effects, "cloudDensity", 0, 2, 0.01).name("云密度");
gui.add(effects, "cloudWindSpeed", 0, 100, 1).name("风速（米每秒）");
gui.add(effects, "showCloudShadows").name("云影");
gui.add(effects, "showCrepuscularRays").name("体积光");
gui.add(viewer.clock, "shouldAnimate").name("播放");
gui.add(viewer.clock, "multiplier", -60, 60, 1).name("时间倍速");
exposeExample(viewer, gui, { effects, world, environment, taa }, () => {
  removeTick();
  viewer.removeController(effects);
  viewer.removeController(environment);
});

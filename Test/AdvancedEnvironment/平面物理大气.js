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
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene;
scene.debugShowFramesPerSecond = true;
// The advanced pipeline owns the sky, fog and HDR effects.
scene.sunBloom = false;
scene.fog.enabled = false;
scene.highDynamicRange = false;
// Fixed LDR review; automatic exposure stays disabled.
scene.postProcessStages.tonemapper = C.Tonemapper.PBR_NEUTRAL;
scene.postProcessStages.exposure = 1;
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
  showAerialPerspective: true,
  showHeightFog: false,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: false,
  cloudQuality: "medium",
  cloudCoverage: 0.35,
  heightFogDensity: 0.000025,
});
viewer.addController(effects);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T04:00:00Z");
viewer.clock.shouldAnimate = false;
viewer.clock.multiplier = 1;

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
// Three distances make light and atmospheric attenuation visible.
for (const [x, y, size] of [
  [-1800, 0, 1200],
  [2000, 15000, 3000],
  [-2000, 45000, 6000],
]) {
  viewer.entities.add({
    position: new C.Cartesian3(x, y, size / 2),
    model: {
      uri: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
      scale: size,
      imageBasedLightingFactor: new C.Cartesian2(1, 0),
    },
  });
}
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
const timeOfDay = { hour: 12 };
const dayStart = C.JulianDate.fromIso8601("2026-06-20T16:00:00Z");
gui
  .add(timeOfDay, "hour", 0, 24, 1 / 60)
  .name("北京时间（小时）")
  .onChange((hour) => {
    C.JulianDate.addHours(dayStart, hour, viewer.clock.currentTime);
    scene.requestRender();
  });
gui.add(effects, "showAtmosphere").name("物理天空");
gui.add(effects, "showAerialPerspective").name("空气透视");
gui.add(effects, "backgroundRadianceScale", 0, 16, 0.1).name("天空亮度");
gui.add(effects, "aerialRadianceScale", 0, 4, 0.1).name("空气亮度");
gui.add(effects, "surfaceRadianceScale", 0, 4, 0.1).name("地表亮度");
gui.add(effects, "nightAmbientIntensity", 0, 8, 0.1).name("夜间环境光");
gui.add(scene, "highDynamicRange").name("HDR 显示");
gui.add(scene.postProcessStages, "tonemapper", C.Tonemapper).name("色调映射");
gui.add(scene.postProcessStages, "exposure", 0.1, 20, 0.1).name("手动曝光");
exposeExample(viewer, gui, { effects, world, environment }, () => {
  viewer.removeController(effects);
  viewer.removeController(environment);
});

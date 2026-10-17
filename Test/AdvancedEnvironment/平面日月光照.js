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
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: true,
  cloudQuality: "medium",
  cloudCoverage: 0.35,
  heightFogDensity: 0.000025,
  backgroundRadianceScale: 1,
  surfaceRadianceScale: 1,
});
viewer.addController(effects);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T02:30:00Z");
viewer.clock.shouldAnimate = false;
viewer.clock.multiplier = 600;
const day = C.JulianDate.fromIso8601("2026-06-20T16:00:00Z");
viewer.timeline.zoomTo(day, C.JulianDate.addDays(day, 1, new C.JulianDate()));

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
gui.add(effects, "showMoonlight").name("月光");
gui.add(effects, "moonlightIntensity", 0, 4, 0.1).name("月光强度");
gui.add(viewer.clock, "shouldAnimate").name("播放");
gui.add(viewer.clock, "multiplier", -3600, 3600, 60).name("时间倍速");
const options = {
  day: () => {
    viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T02:30:00Z");
  },
  sunset: () => {
    viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T10:45:00Z");
  },
  night: () => {
    viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T13:00:00Z");
  },
};
gui.add(options, "day").name("白昼");
gui.add(options, "sunset").name("日落");
gui.add(options, "night").name("夜间");
exposeExample(viewer, gui, { effects, world, environment }, () => {
  viewer.removeController(effects);
  viewer.removeController(environment);
});

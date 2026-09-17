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
scene.highDynamicRange = true;
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
  showBloom: true,
  showLensFlare: true,
  showMoonlight: false,
  cloudQuality: "medium",
  cloudCoverage: 0.35,
  heightFogDensity: 0.000025,
  backgroundRadianceScale: 10,
  surfaceRadianceScale: 1,
});
viewer.addController(effects);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T10:30:00Z");
viewer.clock.shouldAnimate = false;
viewer.clock.multiplier = 1;

const heading = C.Math.toRadians(290);
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
gui.add(effects, "showBloom").name("泛光");
gui.add(effects, "bloomThreshold", 0, 20, 0.1).name("泛光阈值");
gui.add(effects, "bloomIntensity", 0, 1, 0.01).name("泛光强度");
gui.add(effects, "showLensFlare").name("镜头光晕");
gui.add(effects, "lensFlareIntensity", 0, 10, 0.1).name("光晕强度");
exposeExample(viewer, gui, { effects, world, environment }, () => {
  viewer.removeController(effects);
  viewer.removeController(environment);
});

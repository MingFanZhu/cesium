/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const viewer = new C.Viewer("map", {
  baseLayer: C.ImageryLayer.fromProviderAsync(
    C.TileMapServiceImageryProvider.fromUrl(
      C.buildModuleUrl("Assets/Textures/NaturalEarthII"),
    ),
  ),
  scene3DOnly: true,
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
scene.skyBox.show = false;
scene.sun.show = false;
scene.moon.show = false;
scene.sunBloom = false;
scene.fog.enabled = false;
scene.highDynamicRange = true;
// Reference display pairing from the original atmosphere examples.
scene.postProcessStages.tonemapper = C.Tonemapper.AGX;
scene.postProcessStages.exposure = 10;
scene.postProcessStages.bloom.enabled = false;
scene.globe.showGroundAtmosphere = false;
scene.globe.enableLighting = false;
const effects = new C.SceneGISEnvironmentEffects({
  mode: "globe",
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
  backgroundRadianceScale: 1,
  surfaceRadianceScale: 1,
});
viewer.addController(effects);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T10:30:00Z");
viewer.clock.shouldAnimate = false;
viewer.clock.multiplier = 1;

viewer.camera.setView({
  destination: C.Cartesian3.fromDegrees(118.8406, 32.01, 600),
  orientation: {
    heading: C.Math.toRadians(290),
    pitch: C.Math.toRadians(-5),
    roll: 0,
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
exposeExample(viewer, gui, { effects }, () => {
  viewer.removeController(effects);
});

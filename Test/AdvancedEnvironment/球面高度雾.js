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
  showHeightFog: true,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
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

viewer.camera.setView({
  destination: C.Cartesian3.fromDegrees(118.8406, 32.01, 600),
  orientation: {
    heading: C.Math.toRadians(0),
    pitch: C.Math.toRadians(-5),
    roll: 0,
  },
});
// Three distances make light and atmospheric attenuation visible.
for (const [x, y, size] of [
  [-1800, 0, 1200],
  [2000, 15000, 3000],
  [-2000, 45000, 6000],
]) {
  viewer.entities.add({
    position: C.Cartesian3.fromDegrees(
      118.8406 + x / 94000,
      32.0725 + y / 111000,
      size / 2,
    ),
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
gui.add(effects, "showHeightFog").name("高度雾");
gui.add(effects, "heightFogDensity", 0, 0.0001, 0.000001).name("雾密度");
gui.add(effects, "heightFogHeightFalloff", 0, 0.001, 0.00001).name("高度衰减");
gui.add(effects, "heightFogBaseHeight", 0, 3000, 10).name("基准高度（米）");
gui
  .add(effects, "heightFogStartDistance", 0, 20000, 100)
  .name("起始距离（米）");
gui.add(effects, "heightFogMaximumOpacity", 0, 1, 0.01).name("最大不透明度");
exposeExample(viewer, gui, { effects }, () => {
  viewer.removeController(effects);
});

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
  timeline: true,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene;
scene.debugShowFramesPerSecond = true;
// The advanced pipeline owns the sky, fog and HDR effects.
scene.skyBox.show = false;
scene.sun.show = false;
scene.moon.show = true;
scene.sunBloom = false;
scene.fog.enabled = false;
scene.highDynamicRange = true;
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
  showBloom: false,
  showLensFlare: false,
  showMoonlight: true,
  cloudQuality: "medium",
  cloudCoverage: 0.35,
  heightFogDensity: 0.000025,
  backgroundRadianceScale: 4,
  surfaceRadianceScale: 1,
});
viewer.addController(effects);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T02:30:00Z");
viewer.clock.shouldAnimate = false;
viewer.clock.multiplier = 600;
const day = C.JulianDate.fromIso8601("2026-06-20T16:00:00Z");
viewer.timeline.zoomTo(day, C.JulianDate.addDays(day, 1, new C.JulianDate()));

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
exposeExample(viewer, gui, { effects }, () => {
  viewer.removeController(effects);
});

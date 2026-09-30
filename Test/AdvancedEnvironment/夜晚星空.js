/* global document, window, URLSearchParams */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") === "planar";
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
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
      }
    : { baseLayer: false }),
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
scene.highDynamicRange = true;
scene.fog.enabled = false;
scene.sunBloom = false;
scene.postProcessStages.bloom.enabled = false;
let environment;
if (planar) {
  environment = new C.SceneGISPlanarEnvironment({
    world: viewer.planarWorld,
    directionMode: "astronomical",
    sunDirection: C.Cartesian3.UNIT_Z,
    moonDirection: C.Cartesian3.UNIT_Y,
    originLongitude: C.Math.toRadians(118.8406),
    originLatitude: C.Math.toRadians(32.0725),
    showAtmosphere: false,
    showSun: false,
    showMoon: false,
  });
  viewer.addController(environment);
} else {
  scene.skyBox.show = false;
  scene.sun.show = false;
  scene.moon.show = true;
  scene.globe.showGroundAtmosphere = false;
  scene.globe.enableLighting = false;
}
const effects = new C.SceneGISEnvironmentEffects({
  mode: planar ? "planar" : "globe",
  world: viewer.planarWorld,
  enabled: true,
  showHeightFog: false,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showBloom: false,
  showLensFlare: false,
  surfaceRadianceScale: 1,
  cloudQuality: "medium",
  cloudCoverage: 0.4,
});
viewer.addController(effects);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T15:00:00Z");
viewer.clock.shouldAnimate = false;
viewer.clock.multiplier = 600;
const start = C.JulianDate.fromIso8601("2026-06-20T16:00:00Z");
viewer.timeline.zoomTo(
  start,
  C.JulianDate.addDays(start, 1, new C.JulianDate()),
);
viewer.camera.setView({
  destination: planar
    ? new C.Cartesian3(0, 0, 200)
    : C.Cartesian3.fromDegrees(118.8406, 32.0725, 200),
  orientation: {
    heading: C.Math.toRadians(20),
    pitch: C.Math.toRadians(planar ? -5 : 12),
    roll: 0,
  },
});
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
gui.add(effects, "showStars").name("星空");
gui.add(effects, "starIntensity", 0, 4, 0.05).name("星光强度");
gui.add(effects, "showClouds").name("体积云");
gui.add(effects, "cloudCoverage", 0, 1, 0.01).name("云覆盖率");
gui.add(effects, "showHeightFog").name("高度雾");
gui.add(effects, "heightFogMaximumOpacity", 0, 1, 0.01).name("雾最大遮挡");
gui.add(viewer.clock, "shouldAnimate").name("播放时间");
gui.add(viewer.clock, "multiplier", 0, 3600, 60).name("时间倍速");
const presets = {};
for (const [label, time] of [
  ["白昼", "02:30"],
  ["日落", "10:45"],
  ["暮光", "11:30"],
  ["深夜", "15:00"],
]) {
  presets[label] = () => {
    viewer.clock.currentTime = C.JulianDate.fromIso8601(
      `2026-06-21T${time}:00Z`,
    );
    viewer.clock.shouldAnimate = false;
  };
  gui.add(presets, label);
}
const status = document.getElementById("status");
const removeError = effects.errorEvent.addEventListener((...args) => {
  status.textContent = `加载失败：${args[1].message}`;
});
const removeReady = scene.postRender.addEventListener(() => {
  if (effects.ready) {
    status.textContent = `${planar ? "平面" : "球面"} · 星空已就绪`;
  }
});
exposeExample(viewer, gui, { effects, environment }, () => {
  removeReady();
  removeError();
  viewer.removeController(effects);
  if (environment) {
    viewer.removeController(environment);
  }
});

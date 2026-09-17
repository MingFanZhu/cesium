/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const viewer = new C.Viewer("map", {
  planarWorld: {
    crs: "LOCAL",
    extent: {
      minimumX: -10000,
      minimumY: -10000,
      maximumX: 10000,
      maximumY: 10000,
    },
    maximumLevel: 0,
    baseColor: C.Color.fromCssColorString("#d9e6d3"),
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
});
const world = viewer.planarWorld;
viewer.scene.debugShowFramesPerSecond = true;
viewer.camera.setView({
  destination: new C.Cartesian3(0, -12000, 9000),
  orientation: {
    direction: new C.Cartesian3(0, 0.8, -0.6),
    up: new C.Cartesian3(0, 0.6, 0.8),
  },
});
world.imageryLayers.addImageryProvider(
  new C.SceneGISPlanarUrlTemplateImageryProvider({
    url: "/Test/Planar/data/grid.png",
    tilingScheme: world.tilingScheme,
    maximumLevel: 0,
  }),
);
const environment = new C.SceneGISPlanarEnvironment({
  world,
  sunDirection: C.Cartesian3.UNIT_Z,
  moonDirection: C.Cartesian3.UNIT_Y,
  directionMode: "astronomical",
  originLongitude: C.Math.toRadians(118.8406),
  originLatitude: C.Math.toRadians(32.0725),
  showSun: true,
  showMoon: true,
  showAtmosphere: true,
});
viewer.addController(environment);
world.enableLighting = true;
const day = C.JulianDate.fromIso8601("2026-06-21T00:00:00Z");
viewer.clock.shouldAnimate = false;
viewer.clock.multiplier = 600;
viewer.clock.currentTime = C.JulianDate.addHours(
  day,
  10.75,
  new C.JulianDate(),
);
viewer.timeline.zoomTo(day, C.JulianDate.addDays(day, 1, new C.JulianDate()));
viewer.camera.setView({
  destination: new C.Cartesian3(6000, 0, 300),
  orientation: {
    direction: new C.Cartesian3(
      -Math.cos(Math.PI / 36),
      0,
      -Math.sin(Math.PI / 36),
    ),
    up: new C.Cartesian3(-Math.sin(Math.PI / 36), 0, Math.cos(Math.PI / 36)),
  },
});
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
gui.add(environment, "showSun").name("显示太阳");
gui.add(environment, "showMoon").name("显示月亮");
gui.add(environment, "showAtmosphere").name("基础大气");
gui.add(viewer.clock, "shouldAnimate").name("播放");
gui.add(viewer.clock, "multiplier", 60, 3600, 60).name("时间倍速");
const options = {
  noon: () => {
    viewer.clock.currentTime = C.JulianDate.addHours(
      day,
      4,
      new C.JulianDate(),
    );
  },
  sunset: () => {
    viewer.clock.currentTime = C.JulianDate.addHours(
      day,
      10.75,
      new C.JulianDate(),
    );
  },
};
gui.add(options, "noon").name("正午");
gui.add(options, "sunset").name("日落");
exposeExample(viewer, gui, { world, environment }, () =>
  viewer.removeController(environment),
);

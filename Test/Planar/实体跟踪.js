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
const epoch = C.JulianDate.fromIso8601("2026-06-21T00:00:00Z");
viewer.clock.currentTime = C.JulianDate.clone(epoch);
viewer.clock.shouldAnimate = true;
viewer.clock.multiplier = 10;
viewer.timeline.zoomTo(
  epoch,
  C.JulianDate.addSeconds(epoch, 600, new C.JulianDate()),
);
const entity = viewer.entities.add({
  name: "移动目标",
  position: new C.CallbackPositionProperty(
    (time, result) => {
      const angle = C.JulianDate.secondsDifference(time, epoch) / 60;
      return C.Cartesian3.fromElements(
        3500 * Math.cos(angle),
        3500 * Math.sin(angle),
        600,
        result,
      );
    },
    false,
    C.ReferenceFrame.FIXED,
  ),
  point: {
    pixelSize: 16,
    color: C.Color.ORANGE,
    outlineColor: C.Color.BLACK,
    outlineWidth: 2,
  },
  viewFrom: new C.Cartesian3(0, -7000, 5000),
  trackingReferenceFrame: C.TrackingReferenceFrame.AUTODETECT,
});
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
const options = { tracking: false };
gui
  .add(options, "tracking")
  .name("跟踪目标")
  .onChange((enabled) => {
    viewer.trackedEntity = enabled ? entity : undefined;
  });
gui.add(viewer.clock, "shouldAnimate").name("播放");
gui.add(viewer.clock, "multiplier", 1, 60, 1).name("时间倍速");
exposeExample(viewer, gui, { world, entity });

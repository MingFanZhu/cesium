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
  timeline: false,
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
const center = new C.Cartesian3(0, 0, 0);
const bounds = new C.BoundingSphere(center, 6000);
const options = {
  top: () =>
    viewer.camera.setView({
      destination: new C.Cartesian3(0, 0, 16000),
      orientation: {
        direction: new C.Cartesian3(0, 0, -1),
        up: C.Cartesian3.UNIT_Y,
      },
    }),
  orbit: () => {
    viewer.camera.lookAt(center, new C.HeadingPitchRange(0.4, -0.6, 18000));
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  },
  fly: () =>
    viewer.camera.flyToBoundingSphere(bounds, {
      duration: 2,
      offset: new C.HeadingPitchRange(-0.5, -0.8, 18000),
    }),
  cancel: () => viewer.camera.cancelFlight(),
  home: () => viewer.camera.flyHome(2),
};
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
gui.add(options, "top").name("俯视");
gui.add(options, "orbit").name("围绕中心");
gui.add(options, "fly").name("飞行到区域");
gui.add(options, "cancel").name("取消飞行");
gui.add(options, "home").name("全域视图");
exposeExample(viewer, gui, { world });

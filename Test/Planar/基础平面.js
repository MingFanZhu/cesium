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
const imagery = world.imageryLayers.addImageryProvider(
  new C.SceneGISPlanarUrlTemplateImageryProvider({
    url: "/Test/Planar/data/grid.png",
    tilingScheme: world.tilingScheme,
    maximumLevel: 0,
  }),
);
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
gui.add(world, "show").name("显示地表");
gui.add(world, "opacity", 0, 1, 0.01).name("地表透明度");
gui.add(imagery, "alpha", 0, 1, 0.01).name("影像透明度");
exposeExample(viewer, gui, { world, imagery });

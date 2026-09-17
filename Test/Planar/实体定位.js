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
const source = new C.CustomDataSource("示例建筑");
for (const [x, y, color] of [
  [-2500, 0, C.Color.CORNFLOWERBLUE],
  [2500, 1800, C.Color.ORANGE],
]) {
  source.entities.add({
    name: "建筑",
    position: new C.Cartesian3(x, y, 500),
    box: { dimensions: new C.Cartesian3(1200, 1200, 1000), material: color },
  });
}
await viewer.dataSources.add(source);
const options = {
  single: () =>
    viewer.zoomTo(
      source.entities.values[0],
      new C.HeadingPitchRange(0, -0.5, 5000),
    ),
  group: () =>
    viewer.flyTo(source, {
      duration: 2,
      offset: new C.HeadingPitchRange(0.4, -0.7, 14000),
    }),
};
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
gui.add(options, "single").name("定位一栋建筑");
gui.add(options, "group").name("飞行到整组建筑");
exposeExample(viewer, gui, { world, source });

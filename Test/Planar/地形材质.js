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
world.enableLighting = true;
viewer.scene.light = new C.DirectionalLight({
  direction: new C.Cartesian3(0.3, 0.4, -0.86),
});
world.terrainProvider = new C.SceneGISPlanarUrlTemplateHeightmapTerrainProvider(
  {
    url: "/Test/Planar/data/height.png",
    tilingScheme: world.tilingScheme,
    maximumLevel: 0,
    heightmapWidth: 65,
    heightmapHeight: 65,
    format: "image",
    minimumHeight: 0,
    maximumHeight: 3000,
    structure: { elementsPerHeight: 1, stride: 4, heightScale: 3000 / 255 },
  },
);
const materials = {
  contour: C.Material.fromType(C.Material.ElevationContourType, {
    spacing: 150,
    width: 2,
    color: C.Color.fromCssColorString("#4b422a"),
  }),
  height: C.Material.fromType(C.Material.ElevationRampType, {
    image: "/Test/Planar/data/ramp.png",
    minimumHeight: 0,
    maximumHeight: 3000,
  }),
  slope: C.Material.fromType(C.Material.SlopeRampMaterialType, {
    image: "/Test/Planar/data/ramp.png",
  }),
  aspect: C.Material.fromType(C.Material.AspectRampMaterialType, {
    image: "/Test/Planar/data/ramp.png",
  }),
};
world.material = materials.contour;
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
const options = { style: "contour" };
gui
  .add(options, "style", {
    等高线: "contour",
    高程: "height",
    坡度: "slope",
    坡向: "aspect",
  })
  .name("材质")
  .onChange((name) => {
    world.material = materials[name];
  });
gui
  .add(materials.contour.uniforms, "spacing", 50, 500, 10)
  .name("等高距（米）");
gui.add(world, "enableLighting").name("地形光照");
exposeExample(viewer, gui, { world, materials }, () => {
  world.material = undefined;
  Object.values(materials).forEach((material) => material.destroy());
});

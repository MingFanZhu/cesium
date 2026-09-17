/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const half = 20037508.342789244;
const viewer = new C.Viewer("map", {
  planarWorld: {
    crs: "EPSG:3857",
    extent: {
      minimumX: -half,
      minimumY: -half,
      maximumX: half,
      maximumY: half,
    },
    maximumLevel: 16,
    enableLighting: true,
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
const imageryProvider = new C.SceneGISPlanarUrlTemplateImageryProvider({
  url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  tilingScheme: world.tilingScheme,
  maximumLevel: 16,
  tileWidth: 256,
  tileHeight: 256,
  credit: new C.Credit("World Imagery © Esri and contributors", true),
});
const imagery = world.imageryLayers.addImageryProvider(imageryProvider);
const terrain = new C.SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
  url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/{z}/{y}/{x}",
  tilingScheme: world.tilingScheme,
  maximumLevel: 16,
  heightmapWidth: 257,
  heightmapHeight: 257,
  format: "lerc",
  minimumHeight: -450,
  maximumHeight: 8700,
  credit: new C.Credit("World Elevation © Esri and contributors", true),
});
world.terrainProvider = terrain;
const center = new C.WebMercatorProjection().project(
  C.Cartographic.fromDegrees(118.8406, 32.0725),
);
viewer.camera.setView({
  destination: new C.Cartesian3(center.x, center.y - 7000, 5000),
  orientation: {
    direction: new C.Cartesian3(0, 0.8, -0.6),
    up: new C.Cartesian3(0, 0.6, 0.8),
  },
});
const removers = [imageryProvider, terrain].map((provider) =>
  provider.errorEvent.addEventListener(() => {
    document.getElementById("error").textContent =
      "公开服务暂不可用；已加载内容和底色平面仍可浏览。";
  }),
);
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
const options = { terrain: true };
gui
  .add(options, "terrain")
  .name("显示地形")
  .onChange((enabled) => {
    world.terrainProvider = enabled ? terrain : undefined;
  });
gui.add(imagery, "alpha", 0, 1, 0.01).name("影像透明度");
gui.add(world, "enableLighting").name("地形光照");
exposeExample(viewer, gui, { world, imagery, terrain }, () =>
  removers.forEach((remove) => remove()),
);

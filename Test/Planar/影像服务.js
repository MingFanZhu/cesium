/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const viewer = new C.Viewer("map", {
  planarWorld: {
    crs: "LOCAL:IMAGERY",
    extent: {
      minimumX: -10000,
      minimumY: -10000,
      maximumX: 10000,
      maximumY: 10000,
    },
    maximumLevel: 4,
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
viewer.camera.setView({
  destination: new C.Cartesian3(0, -15000, 18000),
  orientation: {
    direction: new C.Cartesian3(0, 0.6, -0.8),
    up: new C.Cartesian3(0, 0.8, 0.6),
  },
});
const root = "/Test/Planar/data/imagery-service/";
const image = `${root}0/0/0.png`;
const common = {
  tilingScheme: world.tilingScheme,
  maximumLevel: 0,
  credit: "SceneGIS 本地影像示意图",
};
const providers = {
  xyz: new C.SceneGISPlanarUrlTemplateImageryProvider({
    ...common,
    url: `${root}{z}/{x}/{y}.png`,
  }),
  wms: new C.SceneGISPlanarWebMapServiceImageryProvider({
    ...common,
    url: image,
    layers: "ortho",
    crs: "LOCAL:IMAGERY",
    axisOrder: "xy",
    parameters: {
      version: "1.3.0",
      format: "image/png",
      transparent: true,
    },
  }),
  wmtsKvp: new C.SceneGISPlanarWebMapTileServiceImageryProvider({
    ...common,
    url: image,
    layer: "ortho",
    style: "default",
    tileMatrixSetID: "LOCAL:IMAGERY",
    tileMatrixLabels: ["0"],
    format: "image/png",
    dimensions: { Time: "current" },
  }),
  wmtsRest: new C.SceneGISPlanarWebMapTileServiceImageryProvider({
    ...common,
    url: `${root}{TileMatrix}/{TileCol}/{TileRow}.png`,
    layer: "ortho",
    style: "default",
    tileMatrixSetID: "LOCAL:IMAGERY",
    tileMatrixLabels: ["0"],
    format: "image/png",
  }),
};
const settings = { source: "xyz", alpha: 1, brightness: 1 };
let imagery;
let selection = 0;
const error = document.getElementById("error");
function watch(provider) {
  provider.errorEvent.addEventListener((failure) => {
    error.textContent = failure.message;
  });
}
Object.values(providers).forEach(watch);

async function selectSource(value) {
  const current = ++selection;
  error.textContent = "";
  try {
    if (!providers[value]) {
      const provider =
        value === "tms"
          ? await C.SceneGISPlanarTileMapServiceImageryProvider.fromUrl(
              root,
              common,
            )
          : await C.SceneGISPlanarSingleTileImageryProvider.fromUrl(
              `${root}single.png`,
              common,
            );
      watch(provider);
      providers[value] = provider;
    }
    if (current !== selection || viewer.isDestroyed()) {
      return;
    }
    world.imageryLayers.removeAll();
    imagery = world.imageryLayers.addImageryProvider(providers[value]);
    imagery.alpha = settings.alpha;
    imagery.brightness = settings.brightness;
    settings.source = value;
    viewer.scene.requestRender();
  } catch (failure) {
    if (current === selection) {
      error.textContent = failure.message;
    }
  }
}

const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
gui
  .add(settings, "source", {
    "URL 模板 / XYZ": "xyz",
    "TMS / 元数据": "tms",
    "WMS / 地图请求": "wms",
    "WMTS / KVP": "wmtsKvp",
    "WMTS / REST": "wmtsRest",
    "单幅影像 / 自动尺寸": "single",
  })
  .name("加载方式")
  .onChange(selectSource);
gui
  .add(settings, "alpha", 0, 1, 0.01)
  .name("不透明度")
  .onChange((value) => {
    if (imagery) {
      imagery.alpha = value;
    }
  });
gui
  .add(settings, "brightness", 0, 2, 0.01)
  .name("亮度")
  .onChange((value) => {
    if (imagery) {
      imagery.brightness = value;
    }
  });
exposeExample(viewer, gui, { world, providers, settings, selectSource });
await selectSource(settings.source);

/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import installMapTest from "./map-test.js";

const half = 20037508.342789244;
const viewer = new C.Viewer("map", {
  planarWorld: {
    crs: "EPSG:3857",
    maximumLevel: 18,
    extent: {
      minimumX: -half,
      minimumY: -half,
      maximumX: half,
      maximumY: half,
    },
    baseColor: C.Color.fromCssColorString("#f7f3ee"),
  },
  skyBox: false,
  skyAtmosphere: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  homeButton: false,
  infoBox: false,
  selectionIndicator: false,
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  projectionPicker: false,
  navigationHelpButton: false,
  vrButton: false,
});
const scene = viewer.scene;
const world = viewer.planarWorld;
// Local imagery uses the world's canonical tile matrix and needs no service.
const grid = document.createElement("canvas");
grid.width = grid.height = 128;
const gridContext = grid.getContext("2d");
gridContext.fillStyle = "#274c77";
gridContext.fillRect(0, 0, 128, 128);
gridContext.strokeStyle = "#ffffff";
gridContext.strokeRect(0.5, 0.5, 127, 127);
const imagery = world.imageryLayers.addImageryProvider({
  tilingScheme: world.tilingScheme,
  minimumLevel: 0,
  maximumLevel: 18,
  tileWidth: 128,
  tileHeight: 128,
  hasAlphaChannel: false,
  errorEvent: new C.Event(),
  requestImage: () => Promise.resolve(grid),
});
imagery.alpha = 0;
for (const name of ["surface", "imagery"]) {
  const input = document.getElementById(`${name}-opacity`);
  input.addEventListener("input", () => {
    const opacity = Number(input.value);
    if (name === "surface") {
      world.opacity = opacity;
    } else {
      imagery.alpha = opacity;
    }
    document.getElementById(`${name}-opacity-value`).value =
      `${Math.round(opacity * 100)}%`;
    scene.requestRender();
  });
}
world.maximumTiltedTileDistance = 100000;
let removeTerrainError;
let terrainError;

function setTerrain(enabled) {
  removeTerrainError?.();
  removeTerrainError = undefined;
  terrainError = undefined;
  const world = viewer.planarWorld;
  if (enabled) {
    // Use the same heightmap and tile matrix contract as the planar terrain example.
    const provider = new C.SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
      url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/{z}/{y}/{x}",
      tilingScheme: world.tilingScheme,
      urlScheme: "xyz",
      format: "lerc",
      heightmapWidth: 257,
      heightmapHeight: 257,
      minimumHeight: -450,
      maximumHeight: 8700,
      maximumLevel: 16,
      credit: new C.Credit(
        '<a href="https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer" target="_blank">World Elevation services by Esri and listed contributors</a>',
        true,
      ),
    });
    removeTerrainError = provider.errorEvent.addEventListener((error) => {
      error.retry = false;
      terrainError = `地形加载失败：${error.message}；可关闭地形恢复零高程。`;
    });
    world.terrainProvider = provider;
    scene.light = new C.DirectionalLight({
      direction: C.Cartesian3.normalize(
        new C.Cartesian3(-1, -0.5, -1.5),
        new C.Cartesian3(),
      ),
    });
  } else {
    world.terrainProvider = undefined;
  }
  world.enableLighting = enabled;
  scene.requestRender();
}

installMapTest(viewer, {
  tilingScheme: world.tilingScheme,
  setTerrain,
  setView({ longitude, latitude, referenceHeight, range, pitch }) {
    const center = new C.WebMercatorProjection().project(
      C.Cartographic.fromDegrees(longitude, latitude),
    );
    scene.camera.setView({
      destination: new C.Cartesian3(
        center.x,
        center.y - range * Math.cos(pitch),
        range * Math.sin(pitch) + (world.terrainProvider ? referenceHeight : 0),
      ),
      orientation: {
        direction: new C.Cartesian3(0, Math.cos(pitch), -Math.sin(pitch)),
        up: new C.Cartesian3(0, Math.sin(pitch), Math.cos(pitch)),
      },
    });
  },
  get terrainStatus() {
    return (
      terrainError ??
      (world.terrainProvider
        ? world.tilesLoaded
          ? "真实地形已就绪 · 道路与面直接贴地"
          : "加载高程…已就绪地表持续绘制"
        : "零高程地表；可切换至 Esri 全球高程。网络不可用时可关闭地形。")
    );
  },
  destroy() {
    removeTerrainError?.();
  },
});

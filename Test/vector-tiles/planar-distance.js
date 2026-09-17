/* global document, window */
import * as C from "/Build/CesiumUnminified/index.js";

const element = (id) => document.getElementById(id);
const viewer = new C.Viewer("map", {
  planarWorld: {
    extent: {
      minimumX: -8192,
      minimumY: -8192,
      maximumX: 8192,
      maximumY: 8192,
    },
    crs: "local-metres",
    maximumLevel: 7,
    baseColor: C.Color.BEIGE,
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
const world = viewer.planarWorld;
const scene = viewer.scene;
const requests = { terrain: 0, imagery: 0 };
world.maximumTiltedTileDistance = 2000;
scene.debugShowFramesPerSecond = true;
scene.renderError.addEventListener((...args) => {
  element("error").textContent = args[1].message;
});

world.terrainProvider = {
  tilingScheme: world.tilingScheme,
  minimumHeight: 0,
  maximumHeight: 60,
  maximumLevel: 7,
  errorEvent: new C.Event(),
  credit: undefined,
  getLevelMaximumGeometricError: (level) => 64 / 2 ** level,
  getTileDataAvailable: () => true,
  loadTileDataAvailability: () => undefined,
  requestTileGeometry: (x, y, level) => {
    requests.terrain++;
    const extent = world.tilingScheme.tileXYToExtent(x, y, level);
    const heights = new Float32Array(81);
    for (let row = 0; row < 9; row++) {
      for (let column = 0; column < 9; column++) {
        const px = extent.minimumX + (column * extent.width) / 8;
        const py = extent.maximumY - (row * extent.height) / 8;
        heights[row * 9 + column] =
          30 + 30 * Math.sin(px / 800) * Math.cos(py / 1100);
      }
    }
    return Promise.resolve(
      new C.SceneGISPlanarHeightmapTerrainData({
        buffer: heights,
        width: 9,
        height: 9,
      }),
    );
  },
};
world.imageryLayers.addImageryProvider({
  tilingScheme: world.tilingScheme,
  minimumLevel: 0,
  maximumLevel: 7,
  tileWidth: 128,
  tileHeight: 128,
  hasAlphaChannel: false,
  errorEvent: new C.Event(),
  credit: undefined,
  requestImage: (x, y, level) => {
    requests.imagery++;
    const image = document.createElement("canvas");
    image.width = image.height = 128;
    const context = image.getContext("2d");
    context.fillStyle = `hsl(${100 + level * 15} 35% 78%)`;
    context.fillRect(0, 0, 128, 128);
    context.strokeStyle = "#305a50";
    context.strokeRect(0, 0, 128, 128);
    context.fillStyle = "#203a30";
    context.font = "14px sans-serif";
    context.fillText(`${level}/${x}/${y}`, 8, 65);
    return Promise.resolve(image);
  },
});

function view(degrees, range) {
  const pitch = (degrees * Math.PI) / 180;
  const direction = new C.Cartesian3(0, Math.cos(pitch), -Math.sin(pitch));
  scene.camera.frustum = new C.PerspectiveFrustum({
    fov: 0.65,
    aspectRatio: scene.canvas.clientWidth / scene.canvas.clientHeight,
    near: 1,
    far: 60000,
  });
  scene.camera.setView({
    destination: new C.Cartesian3(
      0,
      -direction.y * range,
      100 - direction.z * range,
    ),
    orientation: {
      direction,
      up: new C.Cartesian3(0, Math.sin(pitch), Math.cos(pitch)),
    },
  });
}
element("top").onclick = () => view(90, 4000);
element("far-top").onclick = () => view(90, 25000);
element("tilt").onclick = () => view(5, 1200);
element("horizon").onclick = () => view(0.5, 1200);
element("limit").onchange = (event) => {
  world.maximumTiltedTileDistance = event.target.checked ? 2000 : Infinity;
};
const remove = scene.postRender.addEventListener(() => {
  const quadtree = world._surface._quadtree;
  const text = `${quadtree._idealTiles.length} / ${quadtree._renderTiles.length}`;
  if (element("tiles").textContent !== text) {
    element("tiles").textContent = text;
  }
  const requested = `${requests.terrain} / ${requests.imagery}`;
  if (element("requests").textContent !== requested) {
    element("requests").textContent = requested;
  }
  const status = world.tilesLoaded ? "当前视图已就绪" : "正在准备当前视图…";
  if (element("status").textContent !== status) {
    element("status").textContent = status;
  }
});
window.tiltedDistancePreview = { viewer, requests };
window.addEventListener(
  "pagehide",
  (event) => {
    if (event.persisted) {
      return;
    }
    remove();
    if (!viewer.isDestroyed()) {
      viewer.destroy();
    }
  },
  { once: false },
);
view(5, 1200);

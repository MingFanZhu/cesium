/* global document, window, fetch, performance, navigator */
import * as Cesium from "/Build/CesiumUnminified/index.js";

const limit = 20037508.342789244;
const width = limit * 2;
const element = (id) => document.getElementById(id);
const viewer = new Cesium.Viewer("map", {
  planarWorld: {
    extent: {
      minimumX: -limit,
      minimumY: -limit,
      maximumX: limit,
      maximumY: limit,
    },
    crs: "EPSG:3857",
    maximumLevel: 2,
    baseColor: Cesium.Color.fromCssColorString("#f2efe7"),
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
  requestRenderMode: true,
  maximumRenderTimeChange: Infinity,
});
const scene = viewer.scene;
scene.backgroundColor = Cesium.Color.fromCssColorString("#f2efe7");
scene.rethrowRenderErrors = true;
scene.postProcessStages.fxaa.enabled = false;
scene.renderError.addEventListener((...args) => {
  element("error").textContent = args[1].message;
});
const style = await (await fetch("./style.json")).json();
let layer;
let started;
let firstReadyMs;
function addLayer() {
  started = performance.now();
  firstReadyMs = undefined;
  layer = scene.primitives.add(
    new Cesium.SceneGISVectorTileLayer({
      scene,
      style,
      maximumVisibleTiles: 16,
      tileCacheSize: 24,
      maximumRequests: 4,
      maximumUploadsPerFrame: 2,
    }),
  );
  layer.errorEvent.addEventListener(({ error, tile }) => {
    element("error").textContent =
      `瓦片 ${tile.level}/${tile.x}/${tile.y}：${error.message}`;
  });
  element("visibility").textContent = "隐藏矢量";
  scene.requestRender();
}
function view(detail = false, tilted = false) {
  const height = width * (tilted ? 0.32 : detail ? 0.14 : 1.16);
  viewer.camera.setView({
    destination: new Cesium.Cartesian3(
      -width * (detail ? 0.015 : 0.1),
      tilted ? -height * 0.8 : 0,
      height,
    ),
    orientation: {
      direction: new Cesium.Cartesian3(
        0,
        tilted ? 0.625 : 0,
        tilted ? -0.7808688094 : -1,
      ),
      up: new Cesium.Cartesian3(
        0,
        tilted ? 0.7808688094 : 1,
        tilted ? 0.625 : 0,
      ),
    },
  });
  scene.requestRender();
}
addLayer();
view();
element("overview").onclick = () => view();
element("detail").onclick = () => view(true);
element("tilt").onclick = () => view(true, true);
element("visibility").onclick = () => {
  layer.show = !layer.show;
  element("visibility").textContent = layer.show ? "隐藏矢量" : "显示矢量";
};
element("recreate").onclick = () => {
  scene.primitives.remove(layer);
  element("error").textContent = "";
  element("picked").textContent = "已释放原图层，正在加载新图层";
  addLayer();
};
const handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const picked = scene.pick(position);
  element("picked").textContent =
    picked?.primitive === layer
      ? JSON.stringify(
          picked.id,
          (...args) =>
            typeof args[1] === "bigint" ? args[1].toString() : args[1],
          2,
        )
      : "此处没有可拾取的矢量要素";
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
scene.postRender.addEventListener(() => {
  if (layer.tilesLoaded && firstReadyMs === undefined) {
    firstReadyMs = performance.now() - started;
  }
  const stats = layer.statistics;
  element("status").textContent = `${
    layer.tilesLoaded ? "已就绪" : "加载中"
  } · zoom ${stats.zoom?.toFixed(2) ?? "—"}\n可见瓦片 ${
    stats.visibleTiles
  } · 缓存 ${stats.residentTiles} · 请求 ${stats.pendingRequests}\n绘制命令 ${
    stats.drawCommands
  }`;
});

// Deliberate user-triggered diagnostic; warm-frame CPU submission, not GPU duration.
const samples = [];
let frameStart;
let measuring = false;
scene.preRender.addEventListener(() => {
  if (measuring) {
    frameStart = performance.now();
  }
});
scene.postRender.addEventListener(() => {
  if (!measuring) {
    return;
  }
  samples.push(performance.now() - frameStart);
  if (samples.length < 60) {
    scene.requestRender();
    return;
  }
  measuring = false;
  samples.sort((a, b) => a - b);
  const result = {
    firstReadyMs,
    median: samples[30],
    p95: samples[56],
    ...layer.statistics,
    viewport: [scene.drawingBufferWidth, scene.drawingBufferHeight],
    userAgent: navigator.userAgent,
  };
  element("timing").textContent = `60 帧 CPU 提交：中位 ${result.median.toFixed(
    2,
  )} ms；P95 ${result.p95.toFixed(2)} ms（不含 GPU 完成时间）`;
  window.vectorTilePreview.measurement = result;
});
element("measure").onclick = () => {
  if (!layer.tilesLoaded) {
    element("timing").textContent = "请等待瓦片加载后再测量。";
    return;
  }
  samples.length = 0;
  measuring = true;
  scene.requestRender();
};
window.vectorTilePreview = {
  viewer,
  get layer() {
    return layer;
  },
  measurement: undefined,
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted || viewer.isDestroyed()) {
    return;
  }
  handler.destroy();
  viewer.destroy();
});

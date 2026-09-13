/* global document, window */
import * as C from "/Build/CesiumUnminified/index.js";

const element = (id) => document.getElementById(id);
const viewer = new C.Viewer("map", {
  planarWorld: {
    extent: {
      minimumX: -1024,
      minimumY: -1024,
      maximumX: 1024,
      maximumY: 1024,
    },
    crs: "local-metres",
    maximumLevel: 0,
    baseColor: C.Color.fromCssColorString("#eef2ed"),
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
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = false;
scene.rethrowRenderErrors = true;
scene.renderError.addEventListener((...args) => {
  element("error").textContent = args[1].message;
});
const root = "/Test/vector-tiles/symbol-assets/";
const style = {
  version: 8,
  glyphs: `${root}{range}.pbf?fontstack={fontstack}`,
  sprite: `${root}sprite`,
  sources: {
    local: {
      type: "vector",
      tiles: [`${root}points.pbf?z={z}&x={x}&y={y}`],
      maxzoom: 0,
    },
  },
  layers: ["city", "halo", "poi", "collision"].map((kind) => ({
    id: kind,
    type: "symbol",
    source: "local",
    "source-layer": "labels",
    filter: ["==", ["get", "kind"], kind],
    layout: {
      "text-field": "{name}",
      "text-font": ["SceneGIS Test Noto Subset"],
      "text-max-width": 16,
      "text-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        0,
        kind === "halo" ? 26 : 18,
        5,
        kind === "halo" ? 36 : 28,
      ],
      "symbol-sort-key": ["get", "rank"],
      ...(kind === "poi"
        ? {
            "icon-image": "hospital",
            "icon-size": 0.85,
            "text-anchor": "top",
            "text-offset": [0, 1.1],
          }
        : {}),
    },
    paint: {
      "text-color": kind === "halo" ? "#285e83" : "#25483e",
      "text-halo-color": "#ffffff",
      "text-halo-width": kind === "halo" ? 2 : 1,
    },
  })),
};
let layer,
  tilted = false,
  zoomed = false;
function recreate() {
  if (layer) {
    scene.primitives.remove(layer);
  }
  element("error").textContent = "";
  layer = scene.primitives.add(new C.SceneGISVectorTileLayer({ scene, style }));
  layer.errorEvent.addEventListener(({ error }) => {
    element("error").textContent = error.message;
  });
  scene.requestRender();
}
function view() {
  scene.camera.frustum = new C.OrthographicFrustum({
    width: zoomed ? 960 : 1200,
    aspectRatio: scene.canvas.clientWidth / scene.canvas.clientHeight,
    near: 1,
    far: 3000,
  });
  scene.camera.setView({
    destination: new C.Cartesian3(
      0,
      tilted ? -472.7272727 : 0,
      tilted ? 800 : 1100,
    ),
    orientation: {
      direction: new C.Cartesian3(
        0,
        tilted ? 0.5087293121 : 0,
        tilted ? -0.8609265282 : -1,
      ),
      up: new C.Cartesian3(
        0,
        tilted ? 0.8609265282 : 1,
        tilted ? 0.5087293121 : 0,
      ),
    },
  });
  scene.requestRender();
}
element("top").onclick = () => {
  tilted = false;
  view();
};
element("tilt").onclick = () => {
  tilted = true;
  view();
};
element("zoom").onclick = () => {
  zoomed = !zoomed;
  view();
};
element("recreate").onclick = recreate;
scene.postRender.addEventListener(() => {
  if (!layer) {
    return;
  }
  const s = layer.statistics;
  element("status").textContent = layer.tilesLoaded
    ? `${s.placedSymbols} / ${s.symbolCandidates} 个标注 · ${s.drawCommands} 个绘制命令`
    : "字形与图标加载中…";
});
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const picked = scene.pick(position);
  element("picked").textContent =
    picked?.primitive === layer
      ? `${picked.id.properties.name} · ${picked.id.featureId}`
      : "此处没有可拾取标注";
}, C.ScreenSpaceEventType.LEFT_CLICK);
window.symbolPreview = {
  viewer,
  get layer() {
    return layer;
  },
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted || viewer.isDestroyed()) {
    return;
  }
  handler.destroy();
  viewer.destroy();
});
view();
recreate();

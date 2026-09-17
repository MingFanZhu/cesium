/* global document, window */
import * as C from "/Build/CesiumUnminified/index.js";
import cases from "./style-cases.mjs";

const element = (id) => document.getElementById(id);
const viewer = new C.Viewer("map", {
  planarWorld: {
    extent: {
      minimumX: -2048,
      minimumY: -2048,
      maximumX: 2048,
      maximumY: 2048,
    },
    crs: "local-metres",
    maximumLevel: 0,
    baseColor: C.Color.fromCssColorString("#f3f0e8"),
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
const style = {
  version: 8,
  sources: {
    samples: {
      type: "vector",
      tiles: ["/Test/vector-tiles/styles.pbf?z={z}&x={x}&y={y}"],
      maxzoom: 0,
    },
  },
  layers: cases.map((item) => ({
    id: item.id,
    type: item.type,
    source: "samples",
    "source-layer": "styles",
    filter: ["==", ["get", "case"], item.id],
    paint: item.paint,
    layout: item.layout,
  })),
};
let layer;
function createLayer() {
  if (layer !== undefined) {
    scene.primitives.remove(layer);
  }
  element("error").textContent = "";
  layer = scene.primitives.add(new C.SceneGISVectorTileLayer({ scene, style }));
  layer.errorEvent.addEventListener(({ error }) => {
    element("error").textContent = error.message;
  });
  scene.requestRender();
}
function view(tilted = false) {
  scene.camera.frustum = new C.OrthographicFrustum({
    width: 1200,
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
createLayer();
view();
element("top").onclick = () => view();
element("tilt").onclick = () => view(true);
element("recreate").onclick = createLayer;
const labels = cases.map((item) => {
  const node = document.createElement("div");
  node.className = "label";
  node.textContent = item.title;
  element("labels").append(node);
  return { node, position: new C.Cartesian3(item.x, item.y + 64, 0) };
});
const point = new C.Cartesian2();
scene.postRender.addEventListener(() => {
  for (const label of labels) {
    const p = C.SceneTransforms.worldToWindowCoordinates(
      scene,
      label.position,
      point,
    );
    label.node.hidden = p === undefined;
    if (p !== undefined) {
      label.node.style.left = `${p.x}px`;
      label.node.style.top = `${p.y}px`;
    }
  }
  element("status").textContent = layer.tilesLoaded
    ? `已就绪 · ${layer.statistics.drawCommands} 条绘制命令`
    : "加载中…";
});
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const result = scene.pick(position);
  element("picked").textContent =
    result?.primitive === layer
      ? `${result.id.properties.name} · 要素 ${result.id.featureId}`
      : "此处为空白或虚线间隙";
}, C.ScreenSpaceEventType.LEFT_CLICK);
window.vectorStylePreview = {
  viewer,
  get layer() {
    return layer;
  },
  cases,
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted || viewer.isDestroyed()) {
    return;
  }
  handler.destroy();
  viewer.destroy();
});

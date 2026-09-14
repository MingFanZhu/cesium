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
    baseColor: C.Color.fromCssColorString("#f4f2e9"),
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
const root = "/Test/vector-tiles/line-symbol-assets/";
const road = { source: "local", "source-layer": "roads" };
const text = {
  "text-field": "{name}",
  "text-font": ["SceneGIS Test Noto Subset"],
  "text-size": 20,
  "symbol-spacing": 290,
  "symbol-placement": "line",
  "text-max-angle": 40,
};
const style = {
  version: 8,
  glyphs: "/Test/vector-tiles/symbol-assets/{range}.pbf?fontstack={fontstack}",
  sprite: `${root}sprite`,
  sources: {
    local: {
      type: "vector",
      tiles: [`${root}roads.pbf?z={z}&x={x}&y={y}`],
      maxzoom: 0,
    },
  },
  layers: [
    {
      id: "roads",
      type: "line",
      ...road,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": [
          "match",
          ["get", "kind"],
          ["short", "sharp"],
          "#c1bcb1",
          "#dfbd83",
        ],
        "line-width": ["match", ["get", "kind"], ["short", "sharp"], 3, 16],
      },
    },
    {
      id: "arrows",
      type: "symbol",
      ...road,
      filter: ["match", ["get", "kind"], ["arrows", "reverse"], true, false],
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 100,
        "icon-image": "arrow",
        "icon-size": 0.75,
      },
    },
    {
      id: "names",
      type: "symbol",
      ...road,
      filter: ["match", ["get", "kind"], ["curve", "reverse"], true, false],
      layout: text,
      paint: {
        "text-color": "#374b48",
        "text-halo-color": "#fffefa",
        "text-halo-width": 1.5,
      },
    },
    {
      id: "rejections",
      type: "symbol",
      ...road,
      filter: ["match", ["get", "kind"], ["short", "sharp"], true, false],
      layout: { ...text, "symbol-placement": "line-center", "text-size": 28 },
      paint: { "text-color": "#ac3737" },
    },
    {
      id: "shields",
      type: "symbol",
      ...road,
      filter: ["==", ["get", "kind"], "shield"],
      layout: {
        ...text,
        "text-size": 12,
        "icon-image": "road_3",
        "symbol-spacing": 230,
        "text-rotation-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
      },
      paint: { "text-color": "white" },
    },
  ],
};
let layer,
  tilted = false,
  rotated = false,
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
  const aspect = scene.canvas.clientWidth / scene.canvas.clientHeight;
  const pitch = tilted ? Math.PI / 4 : Math.PI / 2,
    heading = rotated ? Math.PI : 0;
  const range = ((zoomed ? 1850 : 2200) / aspect) * 1.5;
  const direction = new C.Cartesian3(
    Math.sin(heading) * Math.cos(pitch),
    Math.cos(heading) * Math.cos(pitch),
    -Math.sin(pitch),
  );
  const target = new C.Cartesian3(0, -80, 0);
  scene.camera.frustum = new C.PerspectiveFrustum({
    fov: 2 * Math.atan((aspect > 1 ? aspect : 1) / 3),
    aspectRatio: aspect,
    near: 1,
    far: 20000,
  });
  scene.camera.setView({
    destination: C.Cartesian3.subtract(
      target,
      C.Cartesian3.multiplyByScalar(direction, range, new C.Cartesian3()),
      new C.Cartesian3(),
    ),
    orientation: {
      direction,
      up: new C.Cartesian3(
        Math.sin(heading) * Math.sin(pitch),
        Math.cos(heading) * Math.sin(pitch),
        Math.cos(pitch),
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
element("rotate").onclick = () => {
  rotated = !rotated;
  view();
};
element("zoom").onclick = () => {
  zoomed = !zoomed;
  view();
};
element("recreate").onclick = recreate;
scene.postRender.addEventListener(() => {
  if (layer) {
    const s = layer.statistics;
    element("status").textContent = layer.tilesLoaded
      ? `${s.placedSymbols} / ${s.symbolCandidates} 个标注 · ${s.drawCommands} 个命令`
      : "字形与图标加载中…";
  }
});
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const picked = scene.pick(position);
  element("picked").textContent =
    picked?.primitive === layer
      ? `${picked.id.properties.name} · ${picked.id.styleLayer} · ${picked.id.featureId}`
      : "此处没有可拾取要素";
}, C.ScreenSpaceEventType.LEFT_CLICK);
window.lineSymbolPreview = {
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

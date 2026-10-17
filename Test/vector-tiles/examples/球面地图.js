/* global document, window */
import * as Cesium from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";

let gui;

// 1. Create the native Globe; retain its zero-height terrain.
const viewer = new Cesium.Viewer("map", {
  baseLayer: false,
  scene3DOnly: true,
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
});
viewer.scene.debugShowFramesPerSecond = true;
// Use the atmosphere reference display; lighting and style colors stay linear.
viewer.scene.highDynamicRange = true;
viewer.scene.postProcessStages.tonemapper = Cesium.Tonemapper.AGX;
viewer.scene.postProcessStages.exposure = 10;

// 2. Globe positions use longitude/latitude and the native ellipsoid.
viewer.camera.lookAt(
  Cesium.Cartesian3.fromDegrees(13.405, 52.52),
  new Cesium.HeadingPitchRange(0, -Math.PI / 4, 2000),
);
viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

// Viewer owns the added layer and releases its Workers and GPU resources.
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    gui?.destroy();
    gui = undefined;
    if (!viewer.isDestroyed()) {
      viewer.destroy();
    }
  }
});

// 3. Load the style and add one vector layer.
async function loadMap() {
  // The checked-in Bright snapshot keeps this example reproducible.
  const style = await Cesium.Resource.fetchJson({
    url: "../reference/openfreemap-bright.json",
  });
  const catalog = await Cesium.Resource.fetchJson({
    url: style.sources.openmaptiles.url,
  });
  // Layer accepts a tile URL template, so resolve TileJSON explicitly.
  style.sources = {
    openmaptiles: {
      type: "vector",
      tiles: [catalog.tiles[0]],
      minzoom: catalog.minzoom,
      maxzoom: catalog.maxzoom,
      attribution: catalog.attribution,
    },
  };
  // This snapshot's building-top layer uses unsupported fill-translate.
  style.layers = style.layers.filter((layer) => layer.id !== "building-top");
  // Replace the 2D building footprint with real roofs and walls (heights in meters).
  const building = style.layers.find((layer) => layer.id === "building");
  building.type = "fill-extrusion";
  building.minzoom = 14;
  building.filter = ["!=", ["get", "hide_3d"], true];
  building.paint = {
    "fill-extrusion-color": "#ded6ca",
    "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
    "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
    "fill-extrusion-opacity": 1,
  };
  if (viewer.isDestroyed()) {
    return;
  }
  const layer = viewer.scene.primitives.add(
    new Cesium.SceneGISVectorTileLayer({
      scene: viewer.scene,
      style,
      maximumGlyphRanges: 192,
    }),
  );
  layer.errorEvent.addEventListener(({ error }) => {
    document.getElementById("error").textContent =
      error.message ?? String(error);
  });
  window.vectorExample.layer = layer;

  // 4. Bind the GUI directly to the layer's opacity (0: hidden, 1: opaque).
  gui = new GUI({
    title: "矢量图层",
    container: document.getElementById("controls"),
  });
  gui.add(layer, "opacity", 0, 1, 0.01).name("矢量不透明度");
  gui.add(viewer.scene, "highDynamicRange").name("HDR 显示");
  gui
    .add(viewer.scene.postProcessStages, "tonemapper", Cesium.Tonemapper)
    .name("色调映射");
  gui
    .add(viewer.scene.postProcessStages, "exposure", 0.1, 20, 0.1)
    .name("手动曝光");
}

// Optional references for inspecting the running example in DevTools.
window.vectorExample = { viewer };
loadMap().catch((error) => {
  document.getElementById("error").textContent = error.message ?? String(error);
});

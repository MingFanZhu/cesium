/* global document, window */
import * as Cesium from "/Build/CesiumUnminified/index.js";

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

// 2. Globe positions use longitude/latitude and the native ellipsoid.
viewer.camera.lookAt(
  Cesium.Cartesian3.fromDegrees(13.405, 52.52),
  new Cesium.HeadingPitchRange(0, -Math.PI / 4, 2000),
);
viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

// Viewer owns the added layer and releases its Workers and GPU resources.
window.addEventListener("pagehide", (event) => {
  if (!event.persisted && !viewer.isDestroyed()) {
    viewer.destroy();
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
}

// Optional references for inspecting the running example in DevTools.
window.vectorExample = { viewer };
loadMap().catch((error) => {
  document.getElementById("error").textContent = error.message ?? String(error);
});

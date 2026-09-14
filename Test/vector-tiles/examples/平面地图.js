/* global document, window */
import * as Cesium from "/Build/CesiumUnminified/index.js";

// 1. Create the EPSG:3857 planar world.
const halfWorld = Math.PI * 6378137;
const viewer = new Cesium.Viewer("map", {
  planarWorld: {
    crs: "EPSG:3857",
    maximumLevel: 18,
    extent: {
      minimumX: -halfWorld,
      minimumY: -halfWorld,
      maximumX: halfWorld,
      maximumY: halfWorld,
    },
  },
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

// 2. Planar positions are projected meters, not longitude/latitude.
viewer.planarWorld.maximumTiltedTileDistance = 100000;
const center = new Cesium.WebMercatorProjection().project(
  Cesium.Cartographic.fromDegrees(13.405, 52.52),
);
viewer.camera.frustum = new Cesium.PerspectiveFrustum({
  fov: Math.PI / 4,
  aspectRatio:
    viewer.scene.canvas.clientWidth / viewer.scene.canvas.clientHeight,
  near: 1,
  far: halfWorld * 4,
});
viewer.camera.setView({
  destination: new Cesium.Cartesian3(center.x, center.y - 1500, 1500),
  orientation: {
    direction: new Cesium.Cartesian3(0, Math.SQRT1_2, -Math.SQRT1_2),
    up: new Cesium.Cartesian3(0, Math.SQRT1_2, Math.SQRT1_2),
  },
});

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

/* global window, document, URLSearchParams */
import * as C from "/Build/CesiumUnminified/index.js";
import { materials, wallSelector, roofSelector } from "./materials.js";

const planar =
  new URLSearchParams(window.location.search).get("world") === "planar";
const longitude = -74.0084,
  latitude = 40.7078;
const projection = new C.WebMercatorProjection();
const origin = projection.project(
  C.Cartographic.fromDegrees(longitude, latitude),
);
const scale = Math.cos(C.Math.toRadians(latitude));
const half = Math.PI * 6378137;
const extent = {
  minimumX: (-half - origin.x) * scale,
  minimumY: (-half - origin.y) * scale,
  maximumX: (half - origin.x) * scale,
  maximumY: (half - origin.y) * scale,
};
const viewer = new C.Viewer("map", {
  ...(planar
    ? { planarWorld: { crs: "NYC-local-meters", extent, maximumLevel: 18 } }
    : { baseLayer: false }),
  scene3DOnly: true,
  shadows: true,
  terrainShadows: C.ShadowMode.RECEIVE_ONLY,
  skyBox: false,
  skyAtmosphere: false,
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene,
  world = planar ? viewer.planarWorld : scene.globe;
scene.highDynamicRange = true;
scene.fog.enabled = false;
scene.sunBloom = false;
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = true;
scene.postProcessStages.tonemapper = C.Tonemapper.AGX;
scene.postProcessStages.exposure = 1.6;
scene.shadowMap.size = 2048;
scene.shadowMap.maximumDistance = 5000;
scene.shadowMap.softShadows = true;
scene.postProcessStages.ambientOcclusion.enabled = true;
scene.postProcessStages.ambientOcclusion.uniforms.lengthCap = 3;
world.baseColor = C.Color.fromCssColorString("#646c6c");
let environment;
if (planar) {
  world.maximumTiltedTileDistance = 15000;
  environment = new C.SceneGISPlanarEnvironment({
    world,
    directionMode: "astronomical",
    sunDirection: C.Cartesian3.UNIT_Z,
    moonDirection: C.Cartesian3.UNIT_Y,
    originLongitude: C.Math.toRadians(longitude),
    originLatitude: C.Math.toRadians(latitude),
    showAtmosphere: false,
    showSun: false,
    showMoon: false,
  });
  viewer.addController(environment);
} else {
  world.showGroundAtmosphere = false;
}
Object.assign(scene.environmentEffects, {
  enabled: true,
  showAtmosphere: true,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showHeightFog: false,
  showAerialPerspective: false,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: false,
});
const reflections = new C.SceneGISScreenSpaceReflections({
  scene,
  enabled: true,
  maximumDistance: 300,
  thickness: 2,
});
viewer.clock.shouldAnimate = false;
const times = { day: "2026-10-10T18:00:00Z", evening: "2026-10-10T21:40:00Z" };
function setTime(name) {
  viewer.clock.currentTime = C.JulianDate.fromIso8601(times[name]);
  document
    .querySelectorAll("[data-time]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.time === name),
    );
  scene.requestRender();
}
function setView(name, heading = 35, rangeOverride) {
  const range = rangeOverride ?? (name === "far" ? 3600 : 1100);
  const h = C.Math.toRadians(heading),
    p = C.Math.toRadians(-20);
  if (planar) {
    const offset = new C.Cartesian3(
      -Math.sin(h) * Math.cos(p) * range,
      -Math.cos(h) * Math.cos(p) * range,
      -Math.sin(p) * range,
    );
    const direction = C.Cartesian3.normalize(
      C.Cartesian3.negate(offset, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    scene.camera.frustum = new C.PerspectiveFrustum({
      fov: Math.PI / 3,
      aspectRatio: scene.canvas.clientWidth / scene.canvas.clientHeight,
      near: 1,
      far: 50000,
    });
    scene.camera.setView({
      destination: C.Cartesian3.add(
        offset,
        new C.Cartesian3(0, 0, 60),
        new C.Cartesian3(),
      ),
      orientation: {
        direction,
        up: C.Cartesian3.cross(right, direction, new C.Cartesian3()),
      },
    });
  } else {
    scene.camera.lookAt(
      C.Cartesian3.fromDegrees(longitude, latitude, 60),
      new C.HeadingPitchRange(h, p, range),
    );
    scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
  }
  document
    .querySelectorAll("[data-view]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === name),
    );
  scene.requestRender();
}
setTime("day");
setView("near");
document.getElementById("mode").textContent = planar
  ? "当前：平面"
  : "当前：球面";

let layer,
  style,
  disposed = false;
const errors = [];
function errorMessage(error) {
  if (disposed) {
    return;
  }
  const text = error.message ?? String(error);
  errors.push(text);
  document.getElementById("error").textContent = `加载失败：${text}`;
}
function setMaterials(enabled) {
  layer?.setPaintProperty(
    "buildings",
    "fill-extrusion-wall-material",
    enabled ? wallSelector : null,
  );
  layer?.setPaintProperty(
    "buildings",
    "fill-extrusion-roof-material",
    enabled ? roofSelector : null,
  );
  document.getElementById("material").checked = enabled;
}
function reload() {
  if (disposed) {
    return;
  }
  if (!style) {
    errors.length = 0;
    document.getElementById("error").textContent = "";
    load().catch(errorMessage);
    return;
  }
  if (layer) {
    scene.primitives.remove(layer);
  }
  errors.length = 0;
  document.getElementById("error").textContent = "";
  layer = scene.primitives.add(
    new C.SceneGISVectorTileLayer({
      scene,
      style,
      maximumRequests: 4,
      maximumVisibleTiles: 32,
      tileCacheSize: 64,
    }),
  );
  layer.errorEvent.addEventListener(({ error }) => errorMessage(error));
  if (!document.getElementById("material").checked) {
    setMaterials(false);
  }
  window.buildingMaterials.layer = layer;
}
async function load() {
  const catalog = await C.Resource.fetchJson({
    url: "https://tiles.openfreemap.org/planet",
  });
  if (disposed) {
    return;
  }
  style = {
    version: 8,
    sources: {
      city: {
        type: "vector",
        tiles: [catalog.tiles[0]],
        minzoom: catalog.minzoom,
        maxzoom: catalog.maxzoom,
        attribution: catalog.attribution,
      },
    },
    materialOrigin: planar ? [0, 0] : [origin.x, origin.y],
    materials,
    layers: [
      {
        id: "ground",
        type: "background",
        paint: { "background-color": "#646c6c" },
      },
      {
        id: "water",
        type: "fill",
        source: "city",
        "source-layer": "water",
        paint: { "fill-color": "#284f62" },
      },
      {
        id: "parks",
        type: "fill",
        source: "city",
        "source-layer": "landuse",
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["park", "grass", "cemetery"]],
        ],
        paint: { "fill-color": "#487661" },
      },
      {
        id: "roads",
        type: "line",
        source: "city",
        "source-layer": "transportation",
        filter: [
          "all",
          ["!=", ["get", "class"], "ferry"],
          ["!=", ["get", "brunnel"], "tunnel"],
        ],
        paint: {
          "line-color": "#a7aba3",
          "line-width": ["interpolate", ["linear"], ["zoom"], 13, 1, 17, 6],
        },
      },
      {
        id: "buildings",
        type: "fill-extrusion",
        source: "city",
        "source-layer": "building",
        minzoom: 13,
        filter: ["!=", ["get", "hide_3d"], true],
        paint: {
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-color": "#c4c5bf",
          "fill-extrusion-vertical-gradient": false,
          "fill-extrusion-wall-material": wallSelector,
          "fill-extrusion-roof-material": roofSelector,
        },
      },
    ],
  };
  reload();
}

// Optional z14 source-grid overlay uses public geometry, independent of vector rendering.
const grid = scene.primitives.add(new C.PolylineCollection());
grid.show = false;
const cell = (2 * half) / 2 ** 14;
const ox = Math.floor((origin.x + half) / cell) * cell - half;
const oy = Math.floor((origin.y + half) / cell) * cell - half;
function position(x, y) {
  if (planar) {
    return new C.Cartesian3((x - origin.x) * scale, (y - origin.y) * scale, 2);
  }
  const point = projection.unproject(new C.Cartesian3(x, y));
  return C.Cartesian3.fromRadians(point.longitude, point.latitude, 2);
}
for (let i = -2; i <= 3; i++) {
  for (const horizontal of [false, true]) {
    const positions = [];
    for (let j = 0; j <= 20; j++) {
      positions.push(
        position(
          ox + (horizontal ? -2 + j / 4 : i) * cell,
          oy + (horizontal ? i : -2 + j / 4) * cell,
        ),
      );
    }
    grid.add({
      positions,
      width: 2,
      material: C.Material.fromType("Color", { color: C.Color.ORANGE }),
    });
  }
}
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const id = scene.pick(position)?.id;
  document.getElementById("pick").textContent =
    id?.featureId !== undefined
      ? `建筑 ID：${id.featureId}\n高度：${id.properties.render_height ?? "未提供"} m`
      : "未拾取到建筑";
}, C.ScreenSpaceEventType.LEFT_CLICK);
document
  .querySelectorAll("[data-time]")
  .forEach((button) =>
    button.addEventListener("click", () => setTime(button.dataset.time)),
  );
document
  .querySelectorAll("[data-view]")
  .forEach((button) =>
    button.addEventListener("click", () => setView(button.dataset.view)),
  );
document
  .getElementById("material")
  .addEventListener("change", (event) => setMaterials(event.target.checked));
document.getElementById("reflection").addEventListener("change", (event) => {
  reflections.enabled = event.target.checked;
});
document.getElementById("shadows").addEventListener("change", (event) => {
  scene.shadowMap.enabled = event.target.checked;
});
document.getElementById("boundaries").addEventListener("change", (event) => {
  grid.show = event.target.checked;
});
document.getElementById("reload").addEventListener("click", reload);
const timer = window.setInterval(() => {
  if (!layer || disposed) {
    return;
  }
  const s = layer.statistics;
  document.getElementById("status").textContent =
    `${layer.tilesLoaded ? "已加载" : "加载中"} · ${planar ? "纽约局部米制" : "WGS84 球面"}\n材质图集 ${(s.materialTextureBytes / 1048576).toFixed(1)} MiB · Worker ${s.workerTasks}`;
}, 500);
function destroy() {
  if (disposed) {
    return;
  }
  disposed = true;
  window.clearInterval(timer);
  handler.destroy();
  if (environment) {
    viewer.removeController(environment);
  }
  viewer.destroy();
}
window.buildingMaterials = {
  viewer,
  reflections,
  setTime,
  setView,
  setMaterials,
  reload,
  destroy,
  errors,
  get disposed() {
    return disposed;
  },
};
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    destroy();
  }
});
load().catch(errorMessage);

/* global window, document, URLSearchParams, performance */
import * as C from "/Build/CesiumUnminified/index.js";
const planar =
  new URLSearchParams(window.location.search).get("world") === "planar";
const world = planar
  ? new C.SceneGISPlanarWorld({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        extent: new C.SceneGISPlanarExtent({
          minimumX: -4096,
          maximumX: 4096,
          minimumY: -4096,
          maximumY: 4096,
        }),
      }),
      maximumLevel: 0,
    })
  : undefined;
const viewer = new C.Viewer("map", {
  ...(world
    ? { world }
    : { baseLayer: false, baseLayerPicker: false, geocoder: false }),
  animation: false,
  timeline: false,
  sceneModePicker: false,
  homeButton: false,
  fullscreenButton: false,
  navigationHelpButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene;
scene.environmentEffects.enabled = false;
scene.fog.enabled = false;
scene.highDynamicRange = true;
scene.skyBox = scene.skyBox?.destroy();
scene.skyAtmosphere = scene.skyAtmosphere?.destroy();
scene.backgroundColor = C.Color.fromCssColorString("#728d9d");
if (scene.globe) {
  scene.globe.show = false;
}
const matrix = planar
  ? C.Matrix4.fromTranslation(new C.Cartesian3(0, 0, 30))
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(118.8, 32, 30),
    );
scene.light = new C.DirectionalLight({
  direction: C.Matrix4.multiplyByPointAsVector(
    matrix,
    new C.Cartesian3(0.3, -0.4, -1),
    new C.Cartesian3(),
  ),
  intensity: 1,
});
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T04:00:00Z");
viewer.clock.shouldAnimate = false;
const boxes = [];
function box(x, y, z, width, depth, height, color) {
  boxes.push(
    new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(width, depth, height),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      modelMatrix: C.Matrix4.fromTranslation(new C.Cartesian3(x, y, z)),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.fromCssColorString(color),
        ),
      },
    }),
  );
}
box(0, 0, -4.2, 320, 320, 0.4, "#8f998b");
for (let j = -3; j <= 3; j++) {
  for (let i = -3; i <= 3; i++) {
    if ((i + j) % 2 === 0) {
      box(i * 40, j * 40, -3.99, 40, 40, 0.02, "#c4bda5");
    }
  }
}
box(-45, 20, -1, 18, 18, 8, "#5d8260");
box(45, 20, -1, 12, 12, 7, "#638d69");
scene.primitives.add(
  new C.Primitive({
    modelMatrix: matrix,
    asynchronous: false,
    geometryInstances: boxes,
    appearance: new C.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    }),
  }),
);
const waves = new C.SceneGISWindWaves({
  resolution: 32,
  windSpeed: 0,
  whitecapIntensity: 0,
});
let water,
  edgeCount,
  constructionMilliseconds,
  disposed = false;
function ring(n, r, x, y, wave = 0) {
  return Array.from(Array(n).keys(), (i) => {
    const a = (i * 2 * Math.PI) / n,
      radius = r * (1 + wave * Math.sin(a * 7));
    const p = new C.Cartesian3(
      x + Math.cos(a) * radius,
      y + Math.sin(a) * radius,
      0,
    );
    return planar
      ? p
      : C.Matrix4.multiplyByPoint(matrix, p, new C.Cartesian3());
  });
}
function rebuild() {
  if (water) {
    scene.primitives.remove(water);
  }
  const n = Number(document.getElementById("count").value),
    h = Math.max(32, n / 8);
  edgeCount = n + 2 * h;
  const hierarchy = new C.PolygonHierarchy(ring(n, 120, 0, 0, 0.12), [
    new C.PolygonHierarchy(ring(h, 15, -45, 20)),
    new C.PolygonHierarchy(ring(h, 10, 45, 20)),
  ]);
  const start = performance.now();
  water = scene.primitives.add(
    new C.SceneGISWaterSurface({
      geometryMode: planar ? "local" : "ellipsoid",
      polygonHierarchy: hierarchy,
      ...(planar ? { modelMatrix: matrix } : { height: 30 }),
      windWaves: waves,
      underwaterDepth: 8,
      maximumUnderwaterBoundaryBytes: 8388608,
      meshSpacing: 4,
      scattering: new C.Cartesian3(0.04, 0.08, 0.09),
      absorption: new C.Cartesian3(0.08, 0.025, 0.015),
      foamIntensity: 0,
      reflections: false,
      waveAmplitude: 0.04,
      causticsIntensity: 0,
    }),
  );
  constructionMilliseconds = performance.now() - start;
  window.waterBoundaryExample.water = water;
  window.waterBoundaryExample.edgeCount = edgeCount;
}
function camera(underwater) {
  const eye = underwater
      ? new C.Cartesian3(0, -55, -0.8)
      : new C.Cartesian3(180, -220, 220),
    target = underwater
      ? new C.Cartesian3(0, 0, -8)
      : new C.Cartesian3(0, 0, 0);
  const direction = C.Cartesian3.normalize(
    C.Cartesian3.subtract(target, eye, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const right = C.Cartesian3.normalize(
    C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const up = C.Cartesian3.cross(right, direction, new C.Cartesian3());
  viewer.camera.setView({
    destination: C.Matrix4.multiplyByPoint(matrix, eye, new C.Cartesian3()),
    orientation: {
      direction: C.Matrix4.multiplyByPointAsVector(
        matrix,
        direction,
        new C.Cartesian3(),
      ),
      up: C.Matrix4.multiplyByPointAsVector(matrix, up, new C.Cartesian3()),
    },
  });
  viewer.camera.frustum.near = 0.01;
  viewer.camera.frustum.far = 20000;
}
scene.postRender.addEventListener(() => {
  if (water) {
    document.getElementById("statistics").textContent =
      `${planar ? "平面" : "球面曲面"} · 原始岸线 ${edgeCount} 段\n岸线索引 ${(water.underwaterBoundaryByteLength / 1024).toFixed(2)} KiB\n纹理预算 ${(water.maximumUnderwaterBoundaryBytes / 1048576).toFixed(0)} MiB\n构造 ${constructionMilliseconds.toFixed(2)} ms（不含首次绘制）`;
  }
});
scene.renderError.addEventListener(
  (...args) => (document.getElementById("error").textContent = args[1].message),
);
function destroy() {
  if (disposed) {
    return;
  }
  disposed = true;
  scene.primitives.remove(water);
  waves.destroy();
  viewer.destroy();
}
window.waterBoundaryExample = { viewer, water, edgeCount, waves, destroy };
document.getElementById("count").onchange = rebuild;
document.getElementById("underwater").onclick = () => camera(true);
document.getElementById("above").onclick = () => camera(false);
rebuild();
camera(true);
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    destroy();
  }
});

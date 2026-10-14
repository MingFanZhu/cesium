/* global window, document */
import * as C from "/Build/CesiumUnminified/index.js";

const byId = (id) => document.getElementById(id);
const world = new C.SceneGISPlanarWorld({
  coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
    extent: new C.SceneGISPlanarExtent({
      minimumX: -32,
      minimumY: -32,
      maximumX: 32,
      maximumY: 32,
    }),
  }),
  maximumLevel: 0,
  enableLighting: true,
  baseColor: new C.Color(0.38, 0.48, 0.32),
});
const heights = new Float32Array(33 * 33);
for (let row = 0; row < 33; ++row) {
  for (let col = 0; col < 33; ++col) {
    const x = (col - 16) * 2;
    const y = (row - 16) * 2;
    heights[row * 33 + col] =
      6 * Math.exp(-(x * x + y * y) / 200) +
      1.5 * Math.sin(x / 8) * Math.cos(y / 9);
  }
}
const terrain = new C.SceneGISPlanarHeightmapTerrainData({
  buffer: heights,
  width: 33,
  height: 33,
});
world.terrainProvider = {
  tilingScheme: world.tilingScheme,
  minimumHeight: -2,
  maximumHeight: 8,
  maximumLevel: 0,
  errorEvent: new C.Event(),
  getLevelMaximumGeometricError: () => 0,
  requestTileGeometry: () => Promise.resolve(terrain),
  getTileDataAvailable: () => true,
  loadTileDataAvailability: () => undefined,
};
const viewer = new C.Viewer("map", {
  world,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  selectionIndicator: false,
  infoBox: false,
  scene3DOnly: true,
});
const scene = viewer.scene;
scene.highDynamicRange = true;
scene.backgroundColor = C.Color.fromCssColorString("#26364d");
scene.fog.enabled = false;
scene.shadowMap.enabled = true;
scene.shadowMap.maximumDistance = 250;
scene.shadowMap.size = 2048;
scene.shadowMap.darkness = 0;
viewer.clock.shouldAnimate = false;
const home = () => {
  scene.camera.lookAt(
    new C.Cartesian3(0, 0, 2),
    new C.HeadingPitchRange(0.25, -0.6, 108),
  );
  scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
};
home();
const environment = new C.SceneGISPlanarEnvironment({
  world,
  sunDirection: new C.Cartesian3(-1, -1, 1),
  moonDirection: new C.Cartesian3(0, 0, -1),
  showAtmosphere: false,
  showSun: false,
  showMoon: false,
  sunIntensity: 1,
});
viewer.addController(environment);
const effects = new C.SceneGISEnvironmentEffects({
  mode: "planar",
  world,
  enabled: false,
  showAtmosphere: false,
  showAerialPerspective: false,
  showClouds: false,
  showHeightFog: false,
  showBloom: false,
  showLensFlare: false,
  surfaceRadianceScale: 3,
});
viewer.addController(effects);
const weather = new C.SceneGISSurfaceWeather({ scene, enabled: true });
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
scene.postProcessStages.ambientOcclusion.enabled = true;
scene.primitives.add(
  new C.Primitive({
    asynchronous: false,
    shadows: C.ShadowMode.ENABLED,
    geometryInstances: new C.GeometryInstance({
      id: "box",
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(5, 5, 12),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      modelMatrix: C.Matrix4.fromTranslation(new C.Cartesian3(-10, 5, 6)),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.fromCssColorString("#c38954"),
        ),
      },
    }),
    appearance: new C.PerInstanceColorAppearance({
      translucent: false,
      closed: true,
    }),
  }),
);
const material = C.Material.fromType(C.Material.ColorType, {
  color: C.Color.fromCssColorString("#76aacc"),
});
const underground = scene.primitives.add(
  new C.Primitive({
    asynchronous: false,
    geometryInstances: new C.GeometryInstance({
      id: "underground",
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(15, 4, 3),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      modelMatrix: C.Matrix4.fromTranslation(new C.Cartesian3(0, -10, -4)),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.YELLOW),
      },
    }),
    appearance: new C.PerInstanceColorAppearance({
      translucent: false,
      closed: true,
    }),
  }),
);
scene.primitives.add(
  new C.EllipsoidPrimitive({
    center: new C.Cartesian3(10, 1, 6),
    radii: new C.Cartesian3(4, 4, 5),
    material,
  }),
);
world.clippingPlanes = new C.ClippingPlaneCollection({
  enabled: false,
  planes: [new C.ClippingPlane(C.Cartesian3.UNIT_X, 0)],
  edgeColor: C.Color.YELLOW,
  edgeWidth: 3,
});
function apply() {
  const physical = byId("lighting").value === "physical";
  if (physical) {
    byId("hdr").checked = true;
  }
  byId("hdr").disabled = physical;
  scene.highDynamicRange = byId("hdr").checked;
  effects.enabled = physical;
  world.enableLighting = byId("lighting").value !== "unlit";
  const azimuth = C.Math.toRadians(Number(byId("azimuth").value));
  environment.sunDirection = new C.Cartesian3(
    Math.cos(azimuth),
    Math.sin(azimuth),
    0.75,
  );
  world.opacity = Number(byId("opacity").value);
  weather.wetness = byId("weather").value === "wet" ? 1 : 0;
  weather.snowCoverage = byId("weather").value === "snow" ? 1 : 0;
  world.clippingPlanes.enabled = byId("clipping").checked;
  scene.postProcessStages.ambientOcclusion.enabled = byId("ao").checked;
  taa.reset();
}
for (const id of ["lighting", "weather", "clipping", "hdr", "ao"]) {
  byId(id).onchange = apply;
}
byId("azimuth").oninput = byId("opacity").oninput = apply;
byId("home").onclick = home;
const errors = [];
scene.renderError.addEventListener((...args) => {
  const error = args[1];
  errors.push(error.message);
  byId("error").textContent = error.message;
});
const deferred = scene._sceneGISDeferred;
let disposed = false;
const ready = () =>
  world.tilesLoaded && deferred.ready && (!effects.enabled || effects.ready);
scene.postRender.addEventListener(() => {
  byId("status").textContent = ready()
    ? "场景就绪 · 拖动相机可观察地形起伏"
    : "正在准备地形与环境…";
  byId("stats").textContent =
    `${deferred.drawCount} 次不透明材质 · ${deferred.lightDrawCount} 次延迟光照 · 地表${world.opacity < 1 ? "透明" : "不透明"} · ${(deferred.byteLength / 1048576).toFixed(1)} MiB 材质缓存`;
});
function destroy() {
  if (disposed) {
    return;
  }
  disposed = true;
  viewer.removeController(effects);
  viewer.removeController(environment);
  viewer.destroy();
  material.destroy();
}
apply();
window.example = {
  viewer,
  world,
  deferred,
  effects,
  weather,
  underground,
  taa,
  errors,
  home,
  destroy,
  get ready() {
    return ready();
  },
  get disposed() {
    return disposed;
  },
};
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    destroy();
  }
});

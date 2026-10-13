/* global window, document */
import * as C from "/Build/CesiumUnminified/index.js";

const byId = (id) => document.getElementById(id);
const longitude = 0;
const latitude = C.Math.toRadians(51.4779);
const radius = C.Ellipsoid.WGS84.maximumRadius;
const metersLongitude = radius * Math.cos(latitude);
const origin = C.Cartesian3.fromRadians(longitude, latitude);
const frame = C.Transforms.eastNorthUpToFixedFrame(origin);
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const height = (x, y) =>
  Math.max(0, 100 * Math.exp(-(((x - 260) / 460) ** 2) - (y / 600) ** 2) - 6);
const heightAt = (lon, lat) =>
  height((lon - longitude) * metersLongitude, (lat - latitude) * radius);
const tilingScheme = new C.GeographicTilingScheme();
const size = 33;
const errorAtZero =
  C.TerrainProvider.getEstimatedLevelZeroGeometricErrorForAHeightmap(
    C.Ellipsoid.WGS84,
    size,
    tilingScheme.getNumberOfXTilesAtLevel(0),
  );
// Local example data implements the native TerrainProvider contract without network requests.
const terrainProvider = {
  tilingScheme,
  errorEvent: new C.Event(),
  hasVertexNormals: false,
  hasWaterMask: true,
  getLevelMaximumGeometricError: (level) => errorAtZero / 2 ** level,
  getTileDataAvailable: () => undefined,
  requestTileGeometry(x, y, level) {
    const rectangle = tilingScheme.tileXYToRectangle(x, y, level);
    const buffer = new Float32Array(size * size);
    const waterMask = new Uint8Array(size * size);
    for (let row = 0; row < size; row++) {
      const lat = C.Math.lerp(
        rectangle.north,
        rectangle.south,
        row / (size - 1),
      );
      for (let column = 0; column < size; column++) {
        const lon = C.Math.lerp(
          rectangle.west,
          rectangle.east,
          column / (size - 1),
        );
        const h = heightAt(lon, lat);
        const index = row * size + column;
        buffer[index] = h;
        waterMask[index] = h === 0 ? 255 : 0;
      }
    }
    return Promise.resolve(
      new C.HeightmapTerrainData({
        buffer,
        width: size,
        height: size,
        waterMask,
      }),
    );
  },
};
const viewer = new C.Viewer("map", {
  terrainProvider,
  baseLayer: false,
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
  msaaSamples: 1,
  skyBox: false,
  skyAtmosphere: false,
});
const scene = viewer.scene;
const defaultFrustumRatio = scene.logarithmicDepthFarToNearRatio;
const globe = scene.globe;
scene.highDynamicRange = true;
globe.depthTestAgainstTerrain = true;
globe.enableLighting = false;
globe.showGroundAtmosphere = false;
scene.fog.enabled = false;
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
scene.sunBloom = false;
globe.baseColor = new C.Color(0.09, 0.16, 0.22);
globe.showWaterEffect = true;
scene.light.intensity = 2;
scene.shadowMap.enabled = true;
scene.shadowMap.maximumDistance = 4000;
scene.shadowMap.darkness = 0;
const epoch = C.JulianDate.fromIso8601("2026-03-20T00:00:00Z");
viewer.clock.currentTime = C.JulianDate.addHours(epoch, 14, new C.JulianDate());
viewer.clock.shouldAnimate = false;
viewer.clock.multiplier = 600;
const effects = new C.SceneGISEnvironmentEffects({
  mode: "globe",
  enabled: true,
  showAtmosphere: true,
  showAerialPerspective: true,
  showHeightFog: false,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: false,
  backgroundRadianceScale: 3,
  surfaceRadianceScale: 3,
});
viewer.addController(effects);
scene.postProcessStages.tonemapper = C.Tonemapper.PBR_NEUTRAL;
const deferred = new C._SceneGISDeferredLighting(scene);
deferred.enabled = true;
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
const ssr = new C.SceneGISScreenSpaceReflections({ scene });
const ssil = new C.SceneGISScreenSpaceIndirectLighting({ scene });
const weather = new C.SceneGISSurfaceWeather({ scene });
scene.postProcessStages.ambientOcclusion.enabled = true;
const reset = () => {
  taa.reset();
  ssr.reset();
};
function home() {
  scene.camera.lookAt(
    point(80, 0, 40),
    new C.HeadingPitchRange(-0.25, -0.65, 1700),
  );
  scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
  reset();
}
home();

const mapRectangle = C.Rectangle.fromRadians(
  -1400 / metersLongitude,
  latitude - 1400 / radius,
  1400 / metersLongitude,
  latitude + 1400 / radius,
);
const map = document.createElement("canvas");
map.width = map.height = 256;
const ctx = map.getContext("2d");
const pixels = ctx.createImageData(256, 256);
for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 256; x++) {
    const h = height(-1400 + (x / 255) * 2800, 1400 - (y / 255) * 2800);
    const color =
      h === 0 ? [24, 67, 91] : [80 + h * 0.6, 111 + h * 0.4, 69 + h * 0.25];
    pixels.data.set([...color, 255], (y * 256 + x) * 4);
  }
}
ctx.putImageData(pixels, 0, 0);
ctx.strokeStyle = "#dfe9d326";
for (let i = 0; i < 256; i += 32) {
  ctx.beginPath();
  ctx.moveTo(i, 0);
  ctx.lineTo(i, 256);
  ctx.moveTo(0, i);
  ctx.lineTo(256, i);
  ctx.stroke();
}
const mapUrl = map.toDataURL();
const grid = document.createElement("canvas");
grid.width = grid.height = 64;
const gridContext = grid.getContext("2d");
gridContext.fillStyle = "#c4b597";
gridContext.fillRect(0, 0, 64, 64);
gridContext.fillStyle = "#253750";
gridContext.fillRect(0, 0, 32, 32);
gridContext.fillRect(32, 32, 32, 32);
const gridUrl = grid.toDataURL();
const fabric = new C.Material({
  fabric: {
    type: "DeferredGlobeExampleFabric",
    materials: {
      first: { type: "Image", uniforms: { image: gridUrl } },
      second: { type: "Image", uniforms: { image: mapUrl } },
    },
    components: {
      diffuse: "mix(first.diffuse, second.diffuse, 0.3)",
      alpha: "0.3",
    },
  },
});
const overlayProvider = new C.SingleTileImageryProvider({
  url: gridUrl,
  tileWidth: 64,
  tileHeight: 64,
  rectangle: mapRectangle,
});
const extraImagery = [];
byId("imagery").onchange = () => {
  extraImagery
    .splice(0)
    .forEach((layer) => globe.imageryLayers.remove(layer, true));
  for (let i = 1; i < Number(byId("imagery").value); i++) {
    const layer = globe.imageryLayers.addImageryProvider(overlayProvider);
    layer.alpha = 0.025;
    extraImagery.push(layer);
  }
  reset();
};

const groundEntity = viewer.entities.add({
  name: "地面分类",
  rectangle: {
    coordinates: C.Rectangle.fromRadians(
      -100 / metersLongitude,
      latitude - 240 / radius,
      280 / metersLongitude,
      latitude + 240 / radius,
    ),
    material: new C.Color(0.2, 0.7, 1, 0.35),
    classificationType: C.ClassificationType.TERRAIN,
  },
});
const tileBase = C.Matrix4.multiplyByTranslation(
  frame,
  new C.Cartesian3(50, 0, height(50, 0) + 1),
  new C.Matrix4(),
);
const volume = scene.primitives.add(
  new C.ClassificationPrimitive({
    asynchronous: false,
    classificationType: C.ClassificationType.CESIUM_3D_TILE,
    geometryInstances: new C.GeometryInstance({
      id: "瓦片分类",
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(45, 400, 200),
      }),
      modelMatrix: tileBase,
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          new C.Color(0.2, 0.8, 1, 0.3),
        ),
      },
    }),
  }),
);
viewer.entities.add({
  name: "半埋地形的普通 Entity",
  position: point(220, 100, height(220, 100)),
  box: {
    dimensions: new C.Cartesian3(60, 60, 90),
    material: C.Color.SANDYBROWN,
    shadows: C.ShadowMode.ENABLED,
  },
});
viewer.entities.add({
  name: "海边普通 Entity",
  position: point(-430, -50, 30),
  box: {
    dimensions: new C.Cartesian3(60, 60, 60),
    material: C.Color.CORNFLOWERBLUE,
    shadows: C.ShadowMode.ENABLED,
  },
});

let tileset,
  disposed = false,
  ready = false;
const errors = [];
const reportError = (error) => {
  if (!disposed) {
    errors.push(error.message);
    byId("error").textContent = error.message;
  }
};
scene.renderError.addEventListener((...args) => reportError(args[1]));
terrainProvider.errorEvent.addEventListener(reportError);
effects.errorEvent.addEventListener(reportError);
byId("hour").oninput = () => {
  viewer.clock.currentTime = C.JulianDate.addHours(
    epoch,
    Number(byId("hour").value),
    new C.JulianDate(),
  );
  reset();
};
byId("animate").onchange = () => {
  viewer.clock.shouldAnimate = byId("animate").checked;
};
byId("home").onclick = home;
byId("tiles-view").onclick = () => {
  scene.camera.lookAt(
    point(50, 0, height(50, 0) + 15),
    new C.HeadingPitchRange(0.35, -0.6, 350),
  );
  scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
  reset();
};
byId("earth-view").onclick = () => {
  scene.camera.lookAt(
    origin,
    new C.HeadingPitchRange(0, -Math.PI / 2, 16000000),
  );
  scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
  reset();
};
for (const [id, object, property] of [
  ["atmosphere", effects, "showAtmosphere"],
  ["aerial", effects, "showAerialPerspective"],
  ["height-fog", effects, "showHeightFog"],
  ["terrain-depth", globe, "depthTestAgainstTerrain"],
  ["ocean", globe, "showWaterEffect"],
  ["shadows", scene.shadowMap, "enabled"],
  ["ao", scene.postProcessStages.ambientOcclusion, "enabled"],
  ["taa", taa, "enabled"],
  ["ssr", ssr, "enabled"],
  ["ssil", ssil, "enabled"],
]) {
  byId(id).onchange = () => {
    object[property] = byId(id).checked;
    reset();
  };
}
byId("environment").onchange = () => {
  effects.enabled = byId("environment").checked;
  // The physical environment owns terrain depth testing while active.
  byId("terrain-depth").disabled = effects.enabled;
  byId("terrain-depth").checked = effects.enabled
    ? true
    : globe.depthTestAgainstTerrain;
  reset();
};
byId("fabric").onchange = () => {
  globe.material = byId("fabric").checked ? fabric : undefined;
  reset();
};
byId("weather").onchange = () => {
  weather.enabled = byId("weather").value !== "dry";
  weather.wetness = byId("weather").value === "wet" ? 1 : 0;
  weather.snowCoverage = byId("weather").value === "snow" ? 1 : 0;
  reset();
};
byId("classification").onchange = () => {
  groundEntity.show = volume.show = byId("classification").checked;
  reset();
};
byId("tiles").onchange = () => {
  if (tileset) {
    tileset.show = byId("tiles").checked;
  }
  reset();
};
byId("inverse").onchange = () => {
  scene.invertClassification = byId("inverse").value !== "off";
  scene.invertClassificationColor = new C.Color(
    0.35,
    0.6,
    0.9,
    byId("inverse").value === "translucent" ? 0.5 : 1,
  );
  reset();
};
byId("translucency").onchange = () => {
  const mode = byId("translucency").value;
  globe.translucency.enabled = mode !== "opaque";
  globe.translucency.frontFaceAlpha = mode === "opaque" ? 1 : 0.5;
  globe.translucency.backFaceAlpha = mode === "both" ? 0.5 : 1;
  reset();
};
byId("frustums").onchange = () => {
  scene.logarithmicDepthFarToNearRatio =
    byId("frustums").value === "default"
      ? defaultFrustumRatio
      : Number(byId("frustums").value);
  reset();
};
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const hit = scene.pick(position);
  const world = scene.pickPosition(position);
  const altitude = world
    ? C.Cartographic.fromCartesian(world).height.toFixed(2)
    : undefined;
  byId("picked").textContent =
    `${hit?.id?.name ?? hit?.id ?? (hit ? "Tiles 要素" : "地球 / 背景")}${altitude ? ` · 椭球高度 ${altitude} 米` : ""}`;
}, C.ScreenSpaceEventType.LEFT_CLICK);
scene.postRender.addEventListener(() => {
  const hours =
    (((C.JulianDate.secondsDifference(viewer.clock.currentTime, epoch) / 3600) %
      24) +
      24) %
    24;
  byId("time").textContent =
    `${Math.floor(hours).toString().padStart(2, "0")}:${Math.floor(
      (hours % 1) * 60,
    )
      .toString()
      .padStart(2, "0")}`;
  if (viewer.clock.shouldAnimate) {
    byId("hour").value = hours.toFixed(1);
  }
  ready =
    !!tileset?.tilesLoaded &&
    globe.tilesLoaded &&
    viewer.dataSourceDisplay.ready &&
    (!effects.enabled || effects.ready) &&
    deferred.ready;
  byId("status").textContent = ready
    ? "场景就绪 · 可调整时间、移动相机并检查拾取"
    : "正在准备地形、影像与瓦片…";
  byId("stats").textContent =
    `${scene._view.frustumCommandsList.length} 个视锥段 · ${deferred.drawCount} 次材质 · ${deferred.lightDrawCount} 次光照 · ${deferred.classificationDrawCount} 次分类 · 自有缓存 ${(deferred.byteLength / 1048576).toFixed(1)} MiB`;
});
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: new C.Cartesian2(0.4, 0.4),
});
function destroy() {
  if (disposed) {
    return;
  }
  disposed = true;
  handler.destroy();
  viewer.removeController(effects);
  viewer.destroy();
  fabric.destroy();
  ibl.destroy();
}
window.example = {
  viewer,
  deferred,
  taa,
  ssr,
  ssil,
  weather,
  effects,
  errors,
  point,
  home,
  destroy,
  get ready() {
    return ready;
  },
  get tileset() {
    return tileset;
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
async function loadScene() {
  const provider = await C.SingleTileImageryProvider.fromUrl(mapUrl, {
    rectangle: mapRectangle,
  });
  if (disposed) {
    return;
  }
  globe.imageryLayers.addImageryProvider(provider, 0);
  const loaded = await C.Cesium3DTileset.fromUrl(
    "/Specs/Data/Cesium3DTiles/Batched/BatchedWithBatchTable/tileset.json",
    { imageBasedLighting: ibl, environmentMapOptions: { enabled: false } },
  );
  if (disposed) {
    loaded.destroy();
  } else {
    const sourceFrame = C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromRadians(-1.31968, 0.698874),
    );
    loaded.modelMatrix = C.Matrix4.multiply(
      tileBase,
      C.Matrix4.inverseTransformation(sourceFrame, new C.Matrix4()),
      new C.Matrix4(),
    );
    loaded.style = new C.Cesium3DTileStyle({
      color: {
        conditions: [
          ["${Height} > 10", "color('#efc38a')"],
          ["true", "color('#9daebe')"],
        ],
      },
    });
    loaded.show = byId("tiles").checked;
    loaded.tileFailed.addEventListener(reportError);
    tileset = scene.primitives.add(loaded);
  }
}
loadScene().catch(reportError);

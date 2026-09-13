/* global document, window, fetch, performance, AbortController */
import * as C from "/Build/CesiumUnminified/index.js";

const element = (id) => document.getElementById(id);
const globeMode = document.body.dataset.world === "globe";
if (
  globeMode &&
  new window.URLSearchParams(window.location.search).get("provider") ===
    "bright"
) {
  element("provider").value = "bright";
}
const half = 20037508.342789244;
const locations = {
  berlin: [13.405, 52.52],
  newyork: [-73.9857, 40.7484],
  shanghai: [121.491, 31.24],
  beijing: [116.397, 39.918],
  nanjing: [118.8406, 32.0725, 430],
  alps: [11.4041, 47.2692, 580],
};
const viewer = new C.Viewer("map", {
  ...(globeMode
    ? { baseLayer: false, scene3DOnly: true }
    : {
        planarWorld: {
          extent: {
            minimumX: -half,
            minimumY: -half,
            maximumX: half,
            maximumY: half,
          },
          crs: "EPSG:3857",
          maximumLevel: 18,
          baseColor: C.Color.fromCssColorString("#f7f3ee"),
        },
      }),
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
});
const scene = viewer.scene;
const world = scene.world;
const vectorScheme = globeMode
  ? new C.SceneGISPlanarTilingScheme({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        crs: "EPSG:3857",
        extent: new C.SceneGISPlanarExtent({
          minimumX: -half,
          minimumY: -half,
          maximumX: half,
          maximumY: half,
        }),
      }),
    })
  : world.tilingScheme;
if (globeMode) {
  world.baseColor = C.Color.fromCssColorString("#f7f3ee");
  world.showGroundAtmosphere = false;
  scene.fog.enabled = false;
} else {
  world.maximumTiltedTileDistance = 100000;
}
scene.debugShowFramesPerSecond = true;
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = false;
scene.rethrowRenderErrors = true;
let layer;
let connection;
let pending;
let generation = 0;
let firstReadyMs;
let started;
let measurement;
let cancelMeasurement;
let supported;
let zoom = 14;
let tilted = false;
let removeTerrainError;
let terrainError;
let terrainGeneration = 0;
let terrainLoading = false;

async function setGlobeTerrain(enabled) {
  const current = ++terrainGeneration;
  removeTerrainError?.();
  removeTerrainError = undefined;
  terrainError = undefined;
  terrainLoading = enabled;
  cancelMeasurement?.();
  element("terrain").checked = enabled;
  try {
    const provider = !enabled
      ? new C.EllipsoidTerrainProvider()
      : connection?.provider === "local"
        ? new C.CustomHeightmapTerrainProvider({
            width: 33,
            height: 33,
            callback: (x, y, level) => {
              const rectangle =
                new C.GeographicTilingScheme().tileXYToRectangle(x, y, level);
              const buffer = new Float32Array(33 * 33);
              for (let row = 0; row < 33; row++) {
                for (let column = 0; column < 33; column++) {
                  const longitude = C.Math.lerp(
                    rectangle.west,
                    rectangle.east,
                    column / 32,
                  );
                  const latitude = C.Math.lerp(
                    rectangle.north,
                    rectangle.south,
                    row / 32,
                  );
                  buffer[row * 33 + column] =
                    600 +
                    200 *
                      Math.sin(longitude * 2000) *
                      Math.cos(latitude * 2000);
                }
              }
              return buffer;
            },
          })
        : await C.ArcGISTiledElevationTerrainProvider.fromUrl(
            "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
          );
    if (current !== terrainGeneration || viewer.isDestroyed()) {
      return;
    }
    world.terrainProvider = provider;
    terrainLoading = false;
    world.enableLighting = enabled;
    if (enabled) {
      scene.light = new C.DirectionalLight({
        direction: C.Cartesian3.negate(
          C.Cartesian3.normalize(scene.camera.positionWC, new C.Cartesian3()),
          new C.Cartesian3(),
        ),
      });
      removeTerrainError = provider.errorEvent.addEventListener((error) => {
        error.retry = false;
        terrainError = `地形加载失败：${error.message}；可关闭地形恢复椭球。`;
      });
    }
    scene.requestRender();
  } catch (error) {
    if (current !== terrainGeneration || viewer.isDestroyed()) {
      return;
    }
    terrainLoading = false;
    terrainError = `地形连接失败：${error.message}；可关闭地形恢复椭球。`;
  }
}

function setTerrain(enabled) {
  if (globeMode) {
    setGlobeTerrain(enabled);
    return;
  }
  removeTerrainError?.();
  removeTerrainError = undefined;
  terrainError = undefined;
  cancelMeasurement?.();
  const world = viewer.planarWorld;
  if (enabled) {
    // Use the same heightmap and tile matrix contract as the planar terrain example.
    const provider = new C.SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
      url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/{z}/{y}/{x}",
      tilingScheme: world.tilingScheme,
      urlScheme: "xyz",
      format: "lerc",
      heightmapWidth: 257,
      heightmapHeight: 257,
      minimumHeight: -450,
      maximumHeight: 8700,
      maximumLevel: 16,
      credit: new C.Credit(
        '<a href="https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer" target="_blank">World Elevation services by Esri and listed contributors</a>',
        true,
      ),
    });
    removeTerrainError = provider.errorEvent.addEventListener((error) => {
      error.retry = false;
      terrainError = `地形加载失败：${error.message}；可关闭地形恢复零高程。`;
    });
    world.terrainProvider = provider;
    scene.light = new C.DirectionalLight({
      direction: C.Cartesian3.normalize(
        new C.Cartesian3(-1, -0.5, -1.5),
        new C.Cartesian3(),
      ),
    });
  } else {
    world.terrainProvider = undefined;
  }
  world.enableLighting = enabled;
  element("terrain").checked = enabled;
  scene.requestRender();
}

function report(error) {
  element("error").textContent = error.message;
}
scene.renderError.addEventListener((...args) => report(args[1]));

// Preview instrumentation around public source/decoder APIs; no product scheduling changes.
class MeasuredSource extends C.SceneGISVectorTileSource {
  constructor(options, metrics) {
    super(options);
    this._metrics = metrics;
  }
  requestTile(x, y, level, request, decode = true) {
    const promise = super.requestTile(x, y, level, request, decode);
    if (promise === undefined) {
      return undefined;
    }
    const metrics = this._metrics;
    metrics.requests++;
    return promise.then((data) => {
      metrics.receivedBytes += data.byteLength ?? 0;
      metrics.completed++;
      return data;
    });
  }
}

function view() {
  const [longitude, latitude, referenceHeight = 0] =
    locations[element("location").value];
  const x = (half * longitude) / 180;
  const y =
    (half / Math.PI) *
    Math.log(Math.tan(Math.PI / 4 + (latitude * Math.PI) / 360));
  const metersPerPixel = (half * 2) / (512 * 2 ** zoom);
  const aspectRatio = scene.canvas.clientWidth / scene.canvas.clientHeight;
  const verticalFov = 2 * Math.atan(1 / 3);
  scene.camera.frustum = new C.PerspectiveFrustum({
    fov:
      aspectRatio > 1
        ? 2 * Math.atan(Math.tan(verticalFov * 0.5) * aspectRatio)
        : verticalFov,
    aspectRatio,
    near: 1,
    far: half * 4,
  });
  // Keep the same center map scale when orbiting. Orthographic width is useful
  // for the style gallery, but clips this map into a strip at a shallow pitch.
  const range =
    (metersPerPixel * scene.canvas.clientHeight) /
    (2 * Math.tan(verticalFov * 0.5));
  const pitch = tilted ? Math.PI / 4 : Math.PI / 2;
  if (globeMode) {
    const target = C.Cartesian3.fromDegrees(
      longitude,
      latitude,
      element("terrain").checked
        ? connection?.provider === "local"
          ? 600
          : referenceHeight
        : 0,
    );
    scene.camera.lookAt(
      target,
      new C.HeadingPitchRange(
        0,
        -pitch,
        range * Math.cos((latitude * Math.PI) / 180),
      ),
    );
    scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
    scene.requestRender();
    return;
  }
  scene.camera.setView({
    destination: new C.Cartesian3(
      x,
      y - range * Math.cos(pitch),
      range * Math.sin(pitch) +
        (viewer.planarWorld.terrainProvider ? referenceHeight : 0),
    ),
    orientation: {
      direction: new C.Cartesian3(0, Math.cos(pitch), -Math.sin(pitch)),
      up: new C.Cartesian3(0, Math.sin(pitch), Math.cos(pitch)),
    },
  });
  scene.requestRender();
}

async function json(url, signal, label) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `${label}：HTTP ${response.status}。请检查服务或访问权限。`,
    );
  }
  return response.json();
}

function replaceLayer(next = connection) {
  cancelMeasurement?.();
  const metrics = {
    requests: 0,
    completed: 0,
    receivedBytes: 0,
    features: 0,
    decodeMs: 0,
  };
  const source = new MeasuredSource(
    {
      url: next.resource,
      tilingScheme: vectorScheme,
      minimumLevel: next.minimumLevel,
      maximumLevel: next.maximumLevel,
      credit: new C.Credit(next.attribution, true),
    },
    metrics,
  );
  const candidate = new C.SceneGISVectorTileLayer({
    scene,
    tilingScheme: vectorScheme,
    style: next.style,
    sources: { [next.sourceId]: source },
    maximumVisibleTiles: 64,
    tileCacheSize: 128,
    maximumRequests: 4,
    maximumUploadsPerFrame: 1,
    maximumGlyphRanges: 192,
  });
  if (layer !== undefined) {
    scene.primitives.remove(layer);
  }
  layer = scene.primitives.add(candidate);
  connection = next;
  connection.metrics = metrics;
  started = performance.now();
  firstReadyMs = undefined;
  measurement = undefined;
  element("error").textContent = "";
  element("picked").textContent = "点击水面、道路或建筑。";
  element("measurement").textContent =
    "CPU 提交时间；不含 GPU 完成和浏览器合成。";
  layer.errorEvent.addEventListener(({ error, tile, resource }) => {
    report(
      new Error(
        `${tile ? `瓦片 ${tile.level}/${tile.x}/${tile.y}` : `标注资源 ${resource}`}：${error.message}`,
      ),
    );
  });
  scene.requestRender();
}

async function connect() {
  const provider = element("provider").value;
  pending?.abort();
  const controller = new AbortController();
  pending = controller;
  const current = ++generation;
  element("error").textContent = "";
  element("status").textContent = "读取样式与数据目录…";
  try {
    const local = provider === "local";
    const selected = local ? "bright" : provider;
    const profileUrl = `./reference/${selected}-profile.json`;
    const styleUrl = local
      ? "./reference/openfreemap-bright.json"
      : `https://tiles.openfreemap.org/styles/${selected}`;
    const [reference, profile] = await Promise.all([
      json(styleUrl, controller.signal, "样式"),
      json(profileUrl, controller.signal, "样式支持清单"),
    ]);
    const sourceId = "openmaptiles";
    const metadataUrl = reference.sources.openmaptiles.url;
    const metadata = local
      ? {
          tiles: [
            `${new window.URL("./public-fixture.pbf", window.location.href).href}?z={z}&x={x}&y={y}`,
          ],
          minzoom: 0,
          maxzoom: 14,
          attribution: "SceneGIS 本地构造数据 · 非真实地理要素",
        }
      : await json(metadataUrl, controller.signal, "瓦片目录");
    const template = metadata.tiles[0];
    const sourceDefinition = {
      type: "vector",
      tiles: [template],
      minzoom: metadata.minzoom,
      maxzoom: metadata.maxzoom,
    };
    // This page explicitly selects audited layers. Unexpected style changes still fail validation.
    const layers = reference.layers.filter(
      (item) => !Object.hasOwn(profile.excluded, item.id),
    );
    const style = new C.SceneGISVectorTileStyle({
      version: 8,
      glyphs: local
        ? `${
            new window.URL("./symbol-assets/", window.location.href).href
          }{range}.pbf?fontstack={fontstack}`
        : reference.glyphs,
      sprite: local
        ? new window.URL("./line-symbol-assets/sprite", window.location.href)
            .href
        : reference.sprite,
      sources: { [sourceId]: sourceDefinition },
      layers,
    });
    if (current !== generation || viewer.isDestroyed()) {
      return;
    }
    const next = {
      provider,
      sourceId,
      style,
      resource: new C.Resource({ url: template }),
      minimumLevel: metadata.minzoom,
      maximumLevel: metadata.maxzoom,
      attribution: metadata.attribution,
      revision: template,
    };
    replaceLayer(next);
    if (globeMode && element("terrain").checked) {
      await setGlobeTerrain(true);
    }
    supported = {
      total: reference.layers.length,
      rendered: layers.length,
      excluded: profile.excluded,
    };
    const title = local
      ? "本地构造地图 · Bright 样式"
      : `OpenFreeMap · ${provider === "bright" ? "Bright" : "Liberty"}`;
    element("map-title").textContent = `${title} · 道路与地图标注`;
    element("source").textContent = local
      ? "确定性构造数据 · 非真实地理要素 · 本地起伏地形"
      : "OpenMapTiles schema · 免 token 公共 MVT";
    element("support-summary").textContent =
      `${layers.length} / ${reference.layers.length} 个样式层已接入`;
    element("excluded").replaceChildren();
    for (const [id, reason] of Object.entries(profile.excluded)) {
      const item = document.createElement("li");
      item.textContent = `${id} — ${reason}`;
      element("excluded").append(item);
    }
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }
    report(error);
    element("status").textContent = layer
      ? "连接失败，保留原地图"
      : "连接失败；可返回本地城市";
  } finally {
    if (current === generation) {
      pending = undefined;
    }
  }
}

scene.postRender.addEventListener(() => {
  element("terrain-status").textContent =
    terrainError ??
    (terrainLoading
      ? "正在准备高程数据…"
      : (
            globeMode
              ? !(world.terrainProvider instanceof C.EllipsoidTerrainProvider)
              : world.terrainProvider
          )
        ? world.tilesLoaded
          ? "真实地形已就绪 · 道路与面直接贴地"
          : "加载高程…已就绪地表持续绘制"
        : globeMode
          ? connection?.provider === "local"
            ? "原生椭球地表 · 可切换本地构造地形"
            : "原生椭球地表 · 可切换至 Esri 真实地形"
          : "零高程地表；可切换至 Esri 全球高程。网络不可用时可关闭地形。");
  if (layer === undefined) {
    return;
  }
  const stats = layer.statistics;
  if (
    layer.tilesLoaded &&
    stats.failedTiles === 0 &&
    firstReadyMs === undefined
  ) {
    firstReadyMs = performance.now() - started;
  }
  if (pending === undefined) {
    element("status").textContent =
      stats.failedTiles > 0 || stats.symbolFailures > 0
        ? "部分瓦片或标注失败，详见下方"
        : layer.tilesLoaded
          ? "当前视图已就绪"
          : "加载并构建瓦片…";
  }
  element("zoom").textContent = stats.zoom?.toFixed(2) ?? "—";
  element("commands").textContent = stats.drawCommands;
  element("tiles").textContent =
    `${stats.visibleTiles} / ${stats.residentTiles}`;
  connection.metrics.features = stats.decodedFeatures;
  connection.metrics.decodeMs = stats.decodeMs;
  element("features").textContent = stats.decodedFeatures.toLocaleString();
  element("symbols").textContent =
    `${stats.placedSymbols ?? 0} / ${stats.symbolCandidates ?? 0}`;
  const missingImages = stats.missingSymbolImages ?? [];
  element("symbol-warning").textContent = missingImages.length
    ? `图集中未提供 ${missingImages.length} 种图标，保留文字标注：${missingImages.join("、")}`
    : "";
  element("measure").disabled =
    !layer.tilesLoaded ||
    stats.failedTiles > 0 ||
    cancelMeasurement !== undefined;
});

element("connect").onsubmit = (event) => {
  event.preventDefault();
  connect();
};
element("location").onchange = () => {
  zoom = element("location").value === "alps" ? 12 : 14;
  view();
};
element("terrain").onchange = () => setTerrain(element("terrain").checked);
element("top").onclick = () => {
  tilted = false;
  view();
};
element("tilt").onclick = () => {
  tilted = true;
  view();
};
element("detail").onclick = () => {
  zoom = 16;
  view();
};
if (element("whole")) {
  element("whole").onclick = () => {
    scene.camera.setView({
      destination: C.Cartesian3.fromDegrees(20, 30, 20000000),
      orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
    });
  };
}
element("recreate").onclick = () => {
  if (connection !== undefined) {
    replaceLayer();
  }
};
element("measure").onclick = () => {
  if (!layer?.tilesLoaded || cancelMeasurement !== undefined) {
    return;
  }
  const samples = [];
  let begin;
  const removePre = scene.preRender.addEventListener(() => {
    begin = performance.now();
  });
  const removePost = scene.postRender.addEventListener(() => {
    samples.push(performance.now() - begin);
    if (samples.length < 60) {
      scene.requestRender();
      return;
    }
    const sorted = samples.slice().sort((a, b) => a - b);
    measurement = {
      provider: connection.provider,
      revision: connection.revision,
      location: element("location").value,
      viewport: [scene.canvas.clientWidth, scene.canvas.clientHeight],
      pixelRatio: scene.pixelRatio,
      firstReadyMs,
      medianMs: sorted[30],
      p95Ms: sorted[56],
      ...connection.metrics,
      statistics: layer.statistics,
    };
    cancelMeasurement();
    element("measurement").textContent =
      `CPU median ${measurement.medianMs.toFixed(
        1,
      )} ms · P95 ${measurement.p95Ms.toFixed(
        1,
      )} ms；首次就绪 ${measurement.firstReadyMs.toFixed(0)} ms`;
  });
  cancelMeasurement = () => {
    removePre();
    removePost();
    cancelMeasurement = undefined;
    element("measure").disabled =
      !layer.tilesLoaded || layer.statistics.failedTiles > 0;
  };
  scene.requestRender();
};
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const picked = scene.pick(position);
  element("picked").textContent =
    picked?.primitive === layer
      ? JSON.stringify(
          picked.id,
          (...entry) =>
            typeof entry[1] === "bigint" ? entry[1].toString() : entry[1],
          2,
        )
      : "此处没有可拾取的已渲染要素。";
}, C.ScreenSpaceEventType.LEFT_CLICK);
window.publicVectorPreview = {
  viewer,
  get layer() {
    return layer;
  },
  get supported() {
    return supported;
  },
  get measurement() {
    return measurement;
  },
  get diagnostics() {
    return connection
      ? { provider: connection.provider, firstReadyMs, ...connection.metrics }
      : undefined;
  },
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted || viewer.isDestroyed()) {
    return;
  }
  generation++;
  terrainGeneration++;
  pending?.abort();
  removeTerrainError?.();
  cancelMeasurement?.();
  connection = undefined;
  handler.destroy();
  viewer.destroy();
});
view();
connect();

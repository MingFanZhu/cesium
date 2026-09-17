/* global document, window, fetch, performance, AbortController */
import * as C from "/Build/CesiumUnminified/index.js";

// Test-only data connection, diagnostics and picking. World setup stays in each entry.
export default function installMapTest(viewer, controls) {
  const element = (id) => document.getElementById(id);
  const initialProvider = new window.URLSearchParams(
    window.location.search,
  ).get("provider");
  if (["local", "bright", "liberty"].includes(initialProvider)) {
    element("provider").value = initialProvider;
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
  const scene = viewer.scene;
  const vectorScheme = controls.tilingScheme;
  scene.debugShowFramesPerSecond = true;
  scene.msaaSamples = 1;
  scene.postProcessStages.fxaa.enabled = false;
  scene.rethrowRenderErrors = true;
  let layer;
  element("vector-opacity").addEventListener("input", (event) => {
    const opacity = Number(event.target.value);
    element("vector-opacity-value").value = `${Math.round(opacity * 100)}%`;
    if (layer) {
      layer.opacity = opacity;
    }
  });
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
  function setTerrain(enabled) {
    cancelMeasurement?.();
    element("terrain").checked = enabled;
    controls.setTerrain(enabled, connection?.provider === "local");
  }
  function report(error) {
    element("error").textContent = error.message ?? String(error);
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
    controls.setView({
      longitude,
      latitude,
      referenceHeight,
      range,
      pitch,
      local: connection?.provider === "local",
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
      opacity: Number(element("vector-opacity").value),
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
      if (selected === "bright") {
        const building = layers.find((item) => item.id === "building");
        building.type = "fill-extrusion";
        building.minzoom = 14;
        building.filter = ["!=", ["get", "hide_3d"], true];
        building.paint = {
          "fill-extrusion-color": "#ded6ca",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 1,
        };
      }
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
      if (element("terrain").checked) {
        controls.setTerrain(true, local);
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
    element("terrain-status").textContent = controls.terrainStatus;
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
    pending?.abort();
    cancelMeasurement?.();
    connection = undefined;
    handler.destroy();
    controls.destroy();
    viewer.destroy();
  });
  view();
  connect();
}

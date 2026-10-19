/* global document, fetch, AbortController, performance */
import * as C from "/Build/CesiumUnminified/index.js";

// Example composition only. Scene owns the layer and its Workers/GPU resources.
export default function installVectorInspection(viewer, gui) {
  const scene = viewer.scene;
  const state = { enabled: false, opacity: 1, background: false };
  const status = document.getElementById("vectorStatus");
  const error = document.getElementById("vectorError");
  const folder = gui.addFolder("矢量验收");
  let layer;
  let loading = false;
  let disposed = false;
  let removeError;
  let lastStatusTime = 0;
  const abort = new AbortController();

  async function json(url) {
    const response = await fetch(url, { signal: abort.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${url}`);
    }
    return response.json();
  }

  async function setEnabled() {
    if (layer) {
      layer.show = state.enabled;
      scene.requestRender();
      return;
    }
    if (!state.enabled || loading) {
      return;
    }
    loading = true;
    error.textContent = "";
    try {
      const style = await json(
        "/Test/vector-tiles/reference/openfreemap-bright.json",
      );
      const catalog = await json(style.sources.openmaptiles.url);
      if (disposed) {
        return;
      }
      style.sources = {
        openmaptiles: {
          type: "vector",
          tiles: [catalog.tiles[0]],
          minzoom: catalog.minzoom,
          maxzoom: catalog.maxzoom,
          attribution: catalog.attribution,
        },
      };
      // Match the existing public-map example's supported Bright profile.
      style.layers = style.layers.filter((item) => item.id !== "building-top");
      const building = style.layers.find((item) => item.id === "building");
      building.type = "fill-extrusion";
      building.minzoom = 14;
      building.filter = ["!=", ["get", "hide_3d"], true];
      building.paint = {
        "fill-extrusion-color": "#ded6ca",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 10],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 1,
      };
      style.layers.find((item) => item.id === "background").layout = {
        visibility: state.background ? "visible" : "none",
      };
      layer = scene.primitives.add(
        new C.SceneGISVectorTileLayer({
          scene,
          style,
          maximumGlyphRanges: 192,
          show: state.enabled,
          opacity: state.opacity,
        }),
      );
      removeError = layer.errorEvent.addEventListener(({ error: failure }) => {
        error.textContent = `矢量错误：${failure.message ?? String(failure)}`;
      });
      scene.requestRender();
    } catch (failure) {
      if (!disposed) {
        state.enabled = false;
        error.textContent = `矢量加载失败：${failure.message}。可重新开启图层重试。`;
      }
    } finally {
      loading = false;
    }
  }

  folder
    .add(state, "enabled")
    .name("显示矢量图层")
    .listen()
    .onChange(setEnabled);
  folder
    .add(state, "opacity", 0, 1, 0.01)
    .name("矢量不透明度")
    .onChange((value) => {
      if (layer) {
        layer.opacity = value;
      }
    });
  folder
    .add(state, "background")
    .name("显示地图底色")
    .onChange((value) => {
      layer?.setLayoutProperty(
        "background",
        "visibility",
        value ? "visible" : "none",
      );
    });
  folder.close();

  function updateStatus() {
    if (disposed || performance.now() - lastStatusTime < 250) {
      return;
    }
    lastStatusTime = performance.now();
    const stats = layer?.statistics;
    status.textContent = !state.enabled
      ? "矢量未开启 · OpenFreeMap Bright（需网络）"
      : loading
        ? "矢量：正在读取样式与瓦片目录…"
        : `矢量：${layer?.tilesLoaded ? "加载完成" : "加载中"} · ${stats?.renderedTiles ?? 0} 瓦片 · ${stats?.placedSymbols ?? 0} 标注 · ${stats?.failedTiles ?? 0} 失败`;
  }
  const removeStatus = scene.postRender.addEventListener(updateStatus);
  updateStatus();

  return {
    state,
    get layer() {
      return layer;
    },
    destroy() {
      disposed = true;
      abort.abort();
      removeStatus();
      removeError?.();
      // Viewer.destroy() releases the Scene-owned layer after this callback.
    },
  };
}

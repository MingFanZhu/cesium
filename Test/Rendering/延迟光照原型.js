/* global window, document */
import "./PBR验收.js";
import { _SceneGISDeferredLighting } from "/Build/CesiumUnminified/index.js";

const example = window.example;
const scene = example.viewer.scene;
const renderer = new _SceneGISDeferredLighting(scene);
example.deferred = renderer;
const enabled = document.getElementById("deferred-enabled");
const stats = document.getElementById("deferred-stats");
enabled.onchange = () => {
  renderer.enabled = enabled.checked;
  example.taa.reset();
  example.ssr.reset();
};
let started = false;
const remove = scene.postRender.addEventListener(() => {
  if (!started && example.state.ready) {
    renderer.enabled = enabled.checked;
    started = true;
  }
  if (started) {
    stats.textContent = renderer.ready
      ? `${scene.drawingBufferWidth} × ${scene.drawingBufferHeight} · ${renderer.drawCount} 次材质绘制 · ${renderer.lightDrawCount} 次屏幕光照 · 材质/深度约 ${(renderer.byteLength / 1048576).toFixed(1)} MiB`
      : "当前使用原有光照或等待当前帧";
  }
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    remove();
  }
});

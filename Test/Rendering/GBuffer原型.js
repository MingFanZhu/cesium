/* global window, document, Option */
import "./PBR验收.js";
import { _SceneGISGBuffer } from "/Build/CesiumUnminified/index.js";

const example = window.example;
const scene = example.viewer.scene;
scene.msaaSamples = 1;
const renderer = scene._sceneGISDeferred;
const probe = new _SceneGISGBuffer(scene);
example.deferred = renderer;
example.gbuffer = probe;
const enabled = document.getElementById("gbuffer-enabled");
const view = document.getElementById("gbuffer-view");
const stats = document.getElementById("gbuffer-stats");
const names = [
  "主画面",
  "漫反射颜色",
  "视空间法线",
  "粗糙度",
  "F0（线性）",
  "材质遮蔽",
  "自发光",
  "线性深度（对数显示）",
  "表面覆盖",
  "光照分组",
];
names.forEach((name, value) => view.add(new Option(name, String(value))));
view.onchange = () => {
  probe.debugView = Number(view.value);
  scene.requestRender();
};
enabled.onchange = () => {
  probe.enabled = enabled.checked;
};
let started = false;
const remove = scene.postRender.addEventListener(() => {
  if (!started && example.state.ready) {
    renderer.enabled = true;
    probe.enabled = enabled.checked;
    started = true;
  }
  if (started) {
    stats.textContent = renderer.ready
      ? `${scene.drawingBufferWidth} × ${scene.drawingBufferHeight} · 主材质 ${renderer.drawCount} 次 · 光照 ${renderer.lightDrawCount} 次 · 材质目标约 ${(renderer.byteLength / 1048576).toFixed(1)} MiB`
      : "等待当前帧材质";
  }
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    remove();
  }
});

/* global window, document, Option */
import "./PBR验收.js";
import { _SceneGISGBuffer } from "/Build/CesiumUnminified/index.js";

const example = window.example;
const scene = example.viewer.scene;
const probe = new _SceneGISGBuffer(scene);
example.gbuffer = probe;
const enabled = document.getElementById("gbuffer-enabled");
const view = document.getElementById("gbuffer-view");
const samples = document.getElementById("gbuffer-samples");
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
  "材质类型",
];
names.forEach((name, value) => view.add(new Option(name, String(value))));
view.onchange = () => {
  probe.debugView = Number(view.value);
  scene.requestRender();
};
enabled.onchange = () => {
  probe.enabled = enabled.checked;
  scene.requestRender();
};
samples.onchange = () => {
  scene.msaaSamples = Number(samples.value);
  scene.requestRender();
};
let started = false;
const remove = scene.postRender.addEventListener(() => {
  if (!started && example.state.ready) {
    probe.enabled = enabled.checked;
    started = true;
  }
  if (started) {
    stats.textContent = probe.ready
      ? `${scene.drawingBufferWidth} × ${scene.drawingBufferHeight} · ${probe._raw.numSamples}× · 额外 ${probe.drawCount} 次绘制 · 约 ${(probe.byteLength / 1048576).toFixed(1)} MiB`
      : "采集已关闭或等待当前帧";
  }
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    remove();
  }
});

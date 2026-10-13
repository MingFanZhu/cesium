/* global window, document, URLSearchParams */
import "./PBR验收.js";
import {
  _SceneGISDeferredLighting,
  Cartesian2,
  Cartesian3,
  Color,
  SceneGISLightCollection,
  SceneGISPointLight,
} from "/Build/CesiumUnminified/index.js";

const example = window.example;
const scene = example.viewer.scene;
const renderer = new _SceneGISDeferredLighting(scene);
example.deferred = renderer;
const enabled = document.getElementById("deferred-enabled");
const stats = document.getElementById("deferred-stats");
const lightCount = document.getElementById("light-count");
const lightRange = document.getElementById("light-range");
const lightTiled = document.getElementById("light-tiled");
const lightIntensity = document.getElementById("light-intensity");
const lightStats = document.getElementById("light-stats");
const lightError = document.getElementById("light-error");
const lamps = new SceneGISLightCollection({ scene });
const lampColors = [
  new Color(1, 0.65, 0.3),
  new Color(0.35, 0.65, 1),
  new Color(1, 0.35, 0.25),
  new Color(0.4, 1, 0.65),
];
function configureLights(count, range = 3, tiled = true, intensity = 1) {
  const next = [];
  const side = Math.sqrt(count);
  // Diagnostic lamps are attached to the current visible surfaces, then stay
  // fixed in world space when the camera moves.
  for (let y = 0; y < side; ++y) {
    for (let x = 0; x < side; ++x) {
      const screen = new Cartesian2(
        (0.16 + ((x + 0.5) / side) * 0.68) * scene.canvas.clientWidth,
        (0.16 + ((y + 0.5) / side) * 0.68) * scene.canvas.clientHeight,
      );
      const position = scene.pickPosition(screen);
      if (!position) {
        throw new Error("当前画面的布灯网格包含天空，请对准街区后重新布灯。");
      }
      Cartesian3.add(
        position,
        Cartesian3.multiplyByScalar(
          scene.camera.directionWC,
          -1.5,
          new Cartesian3(),
        ),
        position,
      );
      next.push(
        new SceneGISPointLight({
          position,
          range,
          intensity,
          color: lampColors[(x + y) % lampColors.length],
        }),
      );
    }
  }
  lamps.removeAll();
  next.forEach((light) => lamps.add(light));
  lamps._tiled = tiled;
  lightCount.value = String(count);
  lightRange.value = String(range);
  lightTiled.checked = tiled;
  lightIntensity.value = String(intensity);
  lightError.textContent = "";
  example.taa.reset();
  example.ssr.reset();
}
function placeLights() {
  try {
    configureLights(
      Number(lightCount.value),
      Number(lightRange.value),
      lightTiled.checked,
      Number(lightIntensity.value),
    );
  } catch (error) {
    lightError.textContent = error.message;
  }
}
lightCount.onchange = placeLights;
document.getElementById("light-place").onclick = placeLights;
lightRange.onchange = () => {
  for (let i = 0; i < lamps.length; ++i) {
    lamps.get(i).range = Number(lightRange.value);
  }
  example.taa.reset();
  example.ssr.reset();
};
lightTiled.onchange = () => {
  lamps._tiled = lightTiled.checked;
  example.taa.reset();
  example.ssr.reset();
};
lightIntensity.onchange = () => {
  for (let i = 0; i < lamps.length; ++i) {
    lamps.get(i).intensity = Number(lightIntensity.value);
  }
  example.taa.reset();
  example.ssr.reset();
};
example.localLighting = { collection: lamps, configure: configureLights };
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
    const requested = new URLSearchParams(window.location.search).get("lights");
    if (["16", "64", "256"].includes(requested)) {
      lightCount.value = requested;
      placeLights();
    }
  }
  if (started) {
    stats.textContent = renderer.ready
      ? `${scene.drawingBufferWidth} × ${scene.drawingBufferHeight} · ${renderer.drawCount} 次材质绘制 · ${renderer.lightDrawCount} 次屏幕光照 · 材质/深度约 ${(renderer.byteLength / 1048576).toFixed(1)} MiB`
      : "当前使用原有光照或等待当前帧";
    const tiles = lamps._state?.tiles;
    lightStats.textContent = tiles
      ? `${lamps.length} 盏 · 每块平均 ${(tiles.referenceCount / (tiles.grid.x * tiles.grid.y)).toFixed(1)} / 最多 ${tiles.maximumTileCount} 盏 · 灯表 ${(tiles.byteLength / 1024).toFixed(0)} KiB`
      : "未启用局部灯";
  }
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    remove();
  }
});

/* global window, document, location, performance, URLSearchParams */
window.CESIUM_BASE_URL = "/Build/CesiumUnminified/";
const C = await import("/Build/CesiumUnminified/index.js");
const $ = (id) => document.getElementById(id);
const planar = new URLSearchParams(location.search).get("world") === "planar";
const world = planar
  ? new C.SceneGISPlanarWorld({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        crs: "LOCAL:METERS",
        extent: new C.SceneGISPlanarExtent({
          minimumX: 12998000,
          maximumX: 13002000,
          minimumY: 3998000,
          maximumY: 4002000,
        }),
      }),
      maximumLevel: 0,
      baseColor: C.Color.fromCssColorString("#283c4a"),
    })
  : undefined;
const viewer = new C.Viewer("view", {
  ...(world
    ? { world }
    : { baseLayer: false, baseLayerPicker: false, geocoder: false }),
  animation: false,
  timeline: false,
  fullscreenButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  homeButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene;
scene.environmentEffects.enabled = false;
scene.highDynamicRange = false;
scene.fog.enabled = false;
scene.backgroundColor = C.Color.fromCssColorString("#152231");
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#283c4a");
  scene.globe.depthTestAgainstTerrain = true;
}
scene.skyBox = scene.skyBox?.destroy();
scene.skyAtmosphere = scene.skyAtmosphere?.destroy();
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-10-28T14:00:00Z");
viewer.clock.shouldAnimate = true;
const matrix = planar
  ? C.Matrix4.fromTranslation(new C.Cartesian3(13000000, 4000000, 0.2))
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(-74.006, 40.713, 0.2),
    );
const dimensions = new C.Cartesian3(128, 128, 32),
  minimum = new C.Cartesian3(-128, -128, 0),
  cellSize = 2;
const buildings = [
  [-56, -52, 22, 24, 28],
  [-18, -56, 18, 26, 40],
  [28, -58, 26, 18, 18],
  [-56, -10, 22, 22, 34],
  [-12, -8, 20, 24, 26],
  [32, -12, 24, 24, 42],
  [-54, 38, 26, 20, 18],
  [-8, 40, 22, 24, 36],
  [42, 40, 26, 20, 24],
];
const polygons = buildings.map(([x, y, w, d, h]) => ({
  positions: [
    [x - w / 2, y - d / 2],
    [x + w / 2, y - d / 2],
    [x + w / 2, y + d / 2],
    [x - w / 2, y + d / 2],
  ].map((p) => new C.Cartesian2(...p)),
  minimumHeight: 0,
  maximumHeight: h,
}));
const solidMask = C.SceneGISWindObstacleMask.fromExtrudedPolygons({
  dimensions,
  minimum,
  cellSize,
  polygons,
});
const instances = [];
function box(x, y, z, w, d, h, color) {
  instances.push(
    new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(w, d, h),
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
box(0, 0, -0.25, 290, 290, 0.5, "#334b57");
for (const y of [-84, -32, 16, 68]) {
  box(0, y, 0.025, 256, 9, 0.05, "#233540");
}
for (const x of [-80, -34, 12, 66]) {
  box(x, 0, 0.03, 8, 256, 0.06, "#233540");
}
buildings.forEach(([x, y, w, d, h], i) =>
  box(x, y, h / 2, w, d, h, ["#a3b3bd", "#b5b7af", "#91a7b8"][i % 3]),
);
scene.primitives.add(
  new C.Primitive({
    geometryInstances: instances,
    modelMatrix: matrix,
    asynchronous: false,
    appearance: new C.PerInstanceColorAppearance({
      translucent: false,
      closed: true,
    }),
  }),
);
const sourceDefinitions = [
  { position: new C.Cartesian3(-100, -20, 10), radius: 9, rate: 0.25 },
  { position: new C.Cartesian3(-80, 42, 6), radius: 7, rate: 0.2 },
];
for (const s of sourceDefinitions) {
  viewer.entities.add({
    position: C.Matrix4.multiplyByPoint(matrix, s.position, new C.Cartesian3()),
    point: {
      pixelSize: 7,
      color: C.Color.CYAN,
      outlineColor: C.Color.WHITE,
      outlineWidth: 1,
    },
    label: {
      text: "示踪源",
      font: "12px sans-serif",
      pixelOffset: new C.Cartesian2(0, -18),
      fillColor: C.Color.WHITE,
      showBackground: true,
      backgroundColor: new C.Color(0.04, 0.1, 0.15, 0.75),
    },
  });
}
function camera() {
  const eye = new C.Cartesian3(-235, -285, 235),
    target = new C.Cartesian3(0, 0, 12);
  const direction = C.Cartesian3.normalize(
    C.Cartesian3.subtract(target, eye, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const right = C.Cartesian3.normalize(
    C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const up = C.Cartesian3.cross(right, direction, new C.Cartesian3());
  scene.camera.setView({
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
  scene.camera.frustum.near = 0.5;
  scene.camera.frustum.far = 10000;
}
camera();
let wind,
  display,
  started,
  startedSimulation = 0,
  completed,
  requestedTime = 0,
  probePending = false,
  timingSamples = [],
  lastTimingVersion = -1;
function destroyWind() {
  if (display && !display.isDestroyed()) {
    scene.primitives.remove(display);
  }
  if (wind && !wind.isDestroyed()) {
    scene.primitives.remove(wind);
  }
  wind = display = undefined;
  completed = undefined;
  $("metrics").textContent = "GPU 场已释放（0 MiB）\n建筑场景仍保留";
  $("probes").textContent = "没有活动风场";
  if (window.windExample) {
    window.windExample.wind = undefined;
    window.windExample.display = undefined;
  }
}
function sources() {
  return sourceDefinitions.map((s) => ({ ...s, enabled: $("source").checked }));
}
function createWind() {
  destroyWind();
  wind = scene.primitives.add(
    new C.SceneGISWindSimulation({
      dimensions,
      minimum,
      cellSize,
      modelMatrix: matrix,
      solidMask,
      windSpeed: 3,
      windDirection: (Number($("direction").value) * Math.PI) / 180,
      timeStep: 0.02,
      kinematicViscosity: 0.000015,
      smagorinskyConstant: 0.12,
      tracerDiffusivity: 0.15,
      tracerSources: sources(),
      paused: true,
      maximumStepsPerFrame: Number($("budget").value),
      enableGpuTiming: true,
    }),
  );
  const seeds = [];
  for (const x of [-92, -52, -12, 28, 68]) {
    for (const y of [-80, -40, 0, 40, 80]) {
      for (const z of [6, 18, 34]) {
        seeds.push(new C.Cartesian3(x, y, z));
      }
    }
  }
  display = scene.primitives.add(
    new C.SceneGISWindVisualization({
      scene,
      simulation: wind,
      mode: $("mode").value,
      showStreamlines: $("lines").checked,
      colorBy: $("color").value,
      colorMaximum: $("color").value === "speed" ? 5.5 : 2,
      extinction: Number($("opacity").value),
      sliceHeight: Number($("height").value),
      streamlineSeeds: seeds,
    }),
  );
  $("run").textContent = "运行";
  $("probes").textContent = "计算完成后读取少量格点";
  window.windExample = { viewer, wind, display };
}
function snapshot() {
  if (!wind) {
    return;
  }
  wind.paused = true;
  wind.reset();
  requestedTime = Number($("snapshot").value);
  if (requestedTime > 0) {
    wind.step(Math.round(requestedTime / wind.timeStep));
  }
  started = performance.now();
  startedSimulation = 0;
  completed = undefined;
  probePending = true;
  timingSamples = [];
  lastTimingVersion = -1;
  $("run").textContent = "运行";
}
async function probes(instance) {
  const positions = [
    [-100, -20, 10],
    [-70, -10, 10],
    [-56, -26, 10],
    [-30, -10, 10],
    [-56, -10, 40],
    [-12, 14, 10],
    [60, -12, 14],
    [122, -10, 10],
  ].map((p) => new C.Cartesian3(...p));
  try {
    const samples = await Promise.all(
      positions.map((p) => instance.sampleAsync(p)),
    );
    if (instance !== wind) {
      return;
    }
    const maxSpeed = Math.max(
      ...samples.map((s) => C.Cartesian3.magnitude(s.velocity)),
    );
    const density = samples.map((s) => s.density),
      cfl = Math.max(...samples.map((s) => s.tracerCfl));
    const valid = samples.every(
      (s) =>
        Number.isFinite(s.concentration) &&
        s.concentration >= 0 &&
        Number.isFinite(C.Cartesian3.magnitude(s.velocity)) &&
        s.density > 0,
    );
    const text = `8 个局部探针（非全场稳定性证明）\n最大速度 ${maxSpeed.toFixed(3)} m/s\n最大 Mach ${((Math.sqrt(3) * maxSpeed * 0.02) / 2).toFixed(4)}\n密度比 ${Math.min(...density).toFixed(5)}…${Math.max(...density).toFixed(5)}\n最大示踪 CFL ${cfl.toFixed(4)}\n有限且非负：${valid ? "是" : "否"}\n尾流探针 uₓ ${samples[3].velocity.x.toFixed(3)} m/s`;
    $("probes").textContent = text;
    window.windExample.probes = { positions, samples, maxSpeed, valid };
  } catch (error) {
    if (instance === wind) {
      $("probes").textContent = error.message;
    }
  }
}
scene.postRender.addEventListener(() => {
  if (!wind) {
    $("status").textContent = "风场已销毁";
    return;
  }
  const timing = wind.gpuTiming;
  if (timing && timing.version !== lastTimingVersion) {
    timingSamples.push(timing.millisecondsPerStep);
    lastTimingVersion = timing.version;
  }
  if (probePending && wind.ready && wind.pendingTime < 1e-8) {
    completed = {
      wallSeconds: (performance.now() - started) / 1000,
      simulationSeconds: wind.simulationTime - startedSimulation,
    };
    probePending = false;
    void probes(wind);
    window.windExample.completed = completed;
  }
  const elapsed =
    completed?.wallSeconds ??
    (started ? (performance.now() - started) / 1000 : 0);
  const ratio = completed
    ? completed.simulationSeconds / completed.wallSeconds
    : elapsed > 0
      ? (wind.simulationTime - startedSimulation) / elapsed
      : 0;
  const median = timingSamples.length
    ? [...timingSamples].sort((a, b) => a - b)[
        Math.floor(timingSamples.length / 2)
      ]
    : undefined;
  $("status").textContent =
    wind.pendingTime > 1e-8
      ? "正在计算固定步长…"
      : wind.paused
        ? `已暂停 · ${wind.simulationTime.toFixed(2)} 秒`
        : "运行中";
  $("metrics").textContent =
    `${planar ? "平面 World" : "球面 ENU"} · 128 × 128 × 32\n524,288 格 · dx 2 m · dt 0.02 s\nGPU 场显存 ${(wind.textureByteLength / 1048576).toFixed(2)} MiB\n求解 + 输运 ${median === undefined ? (wind.gpuTimingSupported ? "等待计时" : "GPU 计时不可用") : `${median.toFixed(3)} ms/步（中位数）`}\n本帧 ${wind.stepsLastFrame} 步 / 上限 ${wind.maximumStepsPerFrame}\n模拟 ${wind.simulationTime.toFixed(2)} s · 待计算 ${wind.pendingTime.toFixed(2)} s\n批次墙钟 ${elapsed.toFixed(2)} s · 比例 ${ratio.toFixed(2)}×`;
  if (window.windExample) {
    window.windExample.timingSamples = timingSamples;
  }
});
$("run").onclick = () => {
  if (wind) {
    wind.paused = !wind.paused;
    if (!wind.paused) {
      started = performance.now();
      startedSimulation = wind.simulationTime;
      completed = undefined;
      probePending = false;
      timingSamples = [];
      lastTimingVersion = -1;
    } else if (started) {
      completed = {
        wallSeconds: (performance.now() - started) / 1000,
        simulationSeconds: wind.simulationTime - startedSimulation,
      };
    }
    $("run").textContent = wind.paused ? "运行" : "暂停";
  }
};
$("step").onclick = () => {
  if (wind) {
    wind.paused = true;
    started = performance.now();
    startedSimulation = wind.simulationTime;
    completed = undefined;
    probePending = true;
    wind.step();
    $("run").textContent = "运行";
  }
};
$("reset").onclick = () => {
  if (wind) {
    wind.paused = true;
    wind.reset();
    probePending = false;
    completed = undefined;
    started = undefined;
    timingSamples = [];
    lastTimingVersion = -1;
    $("run").textContent = "运行";
  }
};
$("compute").onclick = snapshot;
$("mode").onchange = () => {
  if (display) {
    display.mode = $("mode").value;
  }
};
$("lines").onchange = () => {
  if (display) {
    display.showStreamlines = $("lines").checked;
  }
};
$("source").onchange = () => wind?.setTracerSources(sources());
$("color").onchange = () => {
  const speed = $("color").value === "speed";
  if (display) {
    display.colorBy = $("color").value;
    display.colorMaximum = speed ? 5.5 : 2;
  }
  $("legendMin").textContent = speed ? "0 m/s" : "0 示踪量";
  $("legendMax").textContent = speed ? "5.5 m/s" : "2 示踪量";
};
$("height").oninput = () => {
  if (display) {
    display.sliceHeight = Number($("height").value);
  }
  $("heightValue").textContent = `${$("height").value} m`;
};
$("budget").onchange = () => {
  if (wind) {
    wind.maximumStepsPerFrame = Number($("budget").value);
  }
};
$("opacity").oninput = () => {
  if (display) {
    display.extinction = Number($("opacity").value);
  }
};
$("recreate").onclick = () => {
  createWind();
  snapshot();
};
$("destroy").onclick = destroyWind;
$("camera").onclick = camera;
scene.renderError.addEventListener(function (...args) {
  const error = args[1];
  $("status").textContent = "渲染或计算错误";
  $("probes").textContent = error.stack;
});
createWind();
snapshot();
window.addEventListener("pagehide", (event) => {
  if (!event.persisted && !viewer.isDestroyed()) {
    destroyWind();
    viewer.destroy();
  }
});

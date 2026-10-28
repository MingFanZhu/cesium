/* global window, document, location, URLSearchParams, Blob, URL */
window.CESIUM_BASE_URL = "/Build/CesiumUnminified/";
const C = await import("/Build/CesiumUnminified/index.js");
const $ = (id) => document.getElementById(id);
const planar = new URLSearchParams(location.search).get("world") === "planar";
const world = planar
  ? new C.SceneGISPlanarWorld({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        crs: "LOCAL:METERS",
        extent: new C.SceneGISPlanarExtent({
          minimumX: -2000,
          maximumX: 2000,
          minimumY: -2000,
          maximumY: 2000,
        }),
      }),
      maximumLevel: 0,
      baseColor: C.Color.fromCssColorString("#253e4a"),
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
scene.fog.enabled = false;
scene.backgroundColor = C.Color.fromCssColorString("#172b39");
scene.skyBox = scene.skyBox?.destroy();
scene.skyAtmosphere = scene.skyAtmosphere?.destroy();
scene.light = new C.DirectionalLight({
  direction: new C.Cartesian3(-0.4, 0.3, -0.85),
  intensity: 2,
});
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#253e4a");
  scene.globe.depthTestAgainstTerrain = true;
}
const modelMatrix = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(-74.006, 40.713, 1),
    );
const eye = new C.Cartesian3(-330, -380, 310),
  target = new C.Cartesian3(25, 0, 15);
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
  destination: C.Matrix4.multiplyByPoint(modelMatrix, eye, new C.Cartesian3()),
  orientation: {
    direction: C.Matrix4.multiplyByPointAsVector(
      modelMatrix,
      direction,
      new C.Cartesian3(),
    ),
    up: C.Matrix4.multiplyByPointAsVector(modelMatrix, up, new C.Cartesian3()),
  },
});
const tileset = scene.primitives.add(
  await C.Cesium3DTileset.fromUrl("./data/tileset.json", {
    modelMatrix,
    modelUpAxis: C.Axis.Z,
    maximumScreenSpaceError: 2,
    environmentMapOptions: { enabled: false },
  }),
);
scene.primitives.add(
  new C.Primitive({
    geometryInstances: new C.GeometryInstance({
      geometry: C.BoxOutlineGeometry.fromDimensions({
        dimensions: new C.Cartesian3(256, 256, 64),
      }),
      modelMatrix: C.Matrix4.multiply(
        modelMatrix,
        C.Matrix4.fromTranslation(new C.Cartesian3(0, 0, 28)),
        new C.Matrix4(),
      ),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.fromCssColorString("#688496"),
        ),
      },
    }),
    appearance: new C.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    }),
    asynchronous: false,
  }),
);
let job,
  points,
  result,
  disposed = false;
const statusNames = {
  loading: "加载区域瓦片",
  snapshot: "读取静态几何",
  voxelizing: "Worker 体素化",
};
const removeProgress = scene.postRender.addEventListener(() => {
  if (job && statusNames[job.status]) {
    const p = job.progress;
    $("status").textContent =
      `${statusNames[job.status]} · 已读取 ${p.capturedTiles}/${p.selectedTiles} 瓦片`;
  }
});
function slice() {
  if (!result) {
    return;
  }
  const { grid, data } = result,
    n = grid.dimensions;
  const z = Math.min(n.z - 1, Number($("slice").value));
  $("height").textContent =
    ` ${(grid.minimum.z + (z + 0.5) * grid.cellSize).toFixed(1)} 米`;
  const canvas = $("map");
  canvas.width = n.x;
  canvas.height = n.y;
  const ctx = canvas.getContext("2d"),
    image = ctx.createImageData(n.x, n.y);
  for (let y = 0; y < n.y; y++) {
    for (let x = 0; x < n.x; x++) {
      const value = data[x + n.x * (y + n.y * z)],
        pixel = 4 * (x + n.x * (n.y - 1 - y));
      const color =
        value === 1
          ? [66, 220, 207]
          : value === 2
            ? [236, 185, 91]
            : [14, 25, 33];
      image.data.set([...color, 255], pixel);
    }
  }
  ctx.putImageData(image, 0, 0);
}
async function compute() {
  $("run").disabled = true;
  $("cancel").disabled = false;
  $("download").disabled = true;
  result = undefined;
  if (points) {
    scene.primitives.remove(points);
    points = undefined;
  }
  const dx = Number($("cell").value);
  job = scene.primitives.add(
    new C.SceneGIS3DTilesVoxelizer({
      scene,
      tileset,
      maximumGeometricError: 0,
      grid: {
        minimum: new C.Cartesian3(-128, -128, -4),
        dimensions: new C.Cartesian3(256 / dx, 256 / dx, 64 / dx),
        cellSize: dx,
        modelMatrix,
        fillMode: $("fill").value,
      },
    }),
  );
  try {
    result = await job.resultPromise;
    if (disposed) {
      return;
    }
    points = scene.primitives.add(
      new C.PointPrimitiveCollection({ modelMatrix }),
    );
    points.show = $("points").checked;
    const { dimensions: n, minimum, cellSize } = result.grid;
    for (let z = 0; z < n.z; z++) {
      for (let y = 0; y < n.y; y++) {
        for (let x = 0; x < n.x; x++) {
          if (result.data[x + n.x * (y + n.y * z)] === 1) {
            points.add({
              position: new C.Cartesian3(
                minimum.x + (x + 0.5) * cellSize,
                minimum.y + (y + 0.5) * cellSize,
                minimum.z + (z + 0.5) * cellSize,
              ),
              pixelSize: 3,
              color: C.Color.fromCssColorString("#42dccf"),
            });
          }
        }
      }
    }
    $("slice").max = n.z - 1;
    $("slice").value = Math.min(n.z - 1, Math.floor(20 / cellSize));
    slice();
    const s = result.statistics,
      src = result.source;
    $("stats").textContent =
      `网格 ${n.x} × ${n.y} × ${n.z}\n占据数组 ${(s.outputBytes / 1048576).toFixed(2)} MiB\n源瓦片 ${src.tiles.length} · 三角形 ${s.triangles}\n表面 ${s.surfaceCells} · 内部 ${s.interiorCells}\n加载/等帧 ${src.loadMilliseconds.toFixed(1)} ms\n几何快照 ${src.snapshotMilliseconds.toFixed(1)} ms\nWorker 计算 ${s.computeMilliseconds.toFixed(1)} ms\n任务总计 ${src.totalMilliseconds.toFixed(1)} ms`;
    $("status").textContent = "完成 · 数据可独立消费";
    $("download").disabled = false;
  } catch (error) {
    if (!disposed) {
      $("status").textContent = error.message;
    }
  } finally {
    if (!disposed) {
      scene.primitives.remove(job);
      job = undefined;
      $("run").disabled = false;
      $("cancel").disabled = true;
    }
  }
}
$("run").onclick = compute;
$("cancel").onclick = () => job?.cancel();
$("slice").oninput = slice;
$("buildings").onchange = () => {
  tileset.show = $("buildings").checked;
};
$("points").onchange = () => {
  if (points) {
    points.show = $("points").checked;
  }
};
$("download").onclick = () => {
  if (!result) {
    return;
  }
  const grid = {
    ...result.grid,
    modelMatrix: C.Matrix4.toArray(result.grid.modelMatrix),
  };
  const header = new window.TextEncoder().encode(
    JSON.stringify({
      version: result.version,
      grid,
      source: result.source,
      statistics: result.statistics,
    }),
  );
  const size = new ArrayBuffer(4);
  new DataView(size).setUint32(0, header.length, true);
  const blob = new Blob([size, header, result.data], {
    type: "application/octet-stream",
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "scenegis-voxel.bin";
  a.click();
  URL.revokeObjectURL(url);
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted || disposed) {
    return;
  }
  disposed = true;
  removeProgress();
  viewer.destroy();
});
await compute();

/* global window, document, location, URLSearchParams */
const C = await import("/Build/CesiumUnminified/index.js");
const params = new URLSearchParams(location.search);
const planar = params.get("world") === "planar";
const sample = params.get("sample") ?? "blocks";
const $ = (id) => document.getElementById(id);
$("world").value = planar ? "planar" : "globe";
$("sample").value = sample;
for (const id of ["world", "sample"]) {
  $(id).onchange = (e) => {
    params.set(id, e.target.value);
    location.search = params.toString();
  };
}
const frame = planar
  ? C.Matrix4.fromTranslation(new C.Cartesian3(13000000, 4000000, 0))
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(118.78, 32.04),
    );
const world = planar
  ? new C.SceneGISPlanarWorld({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        extent: new C.SceneGISPlanarExtent({
          minimumX: 12995000,
          maximumX: 13005000,
          minimumY: 3995000,
          maximumY: 4005000,
        }),
      }),
      maximumLevel: 0,
    })
  : undefined;
const viewer = new C.Viewer("map", {
  ...(world
    ? { world }
    : { baseLayer: false, baseLayerPicker: false, geocoder: false }),
  animation: false,
  timeline: false,
  fullscreenButton: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  homeButton: false,
});
const scene = viewer.scene;
scene.environmentEffects.enabled = false;
scene.world.baseColor = C.Color.fromCssColorString("#b8c2cb");
scene.world.show = sample === "blocks";
scene.postProcessStages.fxaa.enabled = false;
scene.backgroundColor = C.Color.fromCssColorString("#273644");
viewer.clock.shouldAnimate = false;
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const vector = (x, y, z) =>
  C.Matrix4.multiplyByPointAsVector(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const errors = [];
let analysis,
  flatten,
  sphere,
  disposed = false,
  removeStatus;
const sources = [];
const marker = scene.primitives.add(new C.PointPrimitiveCollection()).add({
  position: point(0, -80, 12),
  color: C.Color.YELLOW,
  pixelSize: 11,
  outlineColor: C.Color.BLACK,
  outlineWidth: 2,
});
function error(value) {
  const message = String(value);
  errors.push(message);
  $("error").textContent = message;
}
scene.renderError.addEventListener(function () {
  error(arguments[1]);
});
function pose() {
  const heading = C.Math.toRadians(+$("heading").value);
  const pitch = C.Math.toRadians(+$("pitch").value);
  return {
    position: point(+$("x").value, +$("y").value, +$("z").value),
    direction: vector(
      Math.sin(heading) * Math.cos(pitch),
      Math.cos(heading) * Math.cos(pitch),
      Math.sin(pitch),
    ),
    up: vector(0, 0, 1),
    distance: +$("distance").value,
    horizontalAngle: C.Math.toRadians(+$("horizontal").value),
    verticalAngle: C.Math.toRadians(+$("vertical").value),
  };
}
function updatePose() {
  $("headingValue").value = `${$("heading").value}°`;
  $("pitchValue").value = `${$("pitch").value}°`;
  try {
    const view = pose();
    marker.position = view.position;
    analysis?.setView(view);
    $("error").textContent = "";
  } catch (value) {
    error(value);
  }
}
function rebuild() {
  const previous = analysis;
  const next = scene.postProcessStages.add(
    new C.SceneGISViewshed({
      scene,
      world: scene.world,
      ...pose(),
      sources,
      terrain: sample === "blocks",
      resolution: +$("resolution").value,
      depthBias: +$("bias").value,
      enabled: $("enabled").checked,
      visibleColor: C.Color.fromCssColorString("#15bc72").withAlpha(0.6),
      hiddenColor: C.Color.fromCssColorString("#f14c50").withAlpha(0.6),
    }),
  );
  analysis = next;
  if (previous) {
    scene.postProcessStages.remove(previous);
  }
  marker.position = pose().position;
  analysis.errorEvent.addEventListener(error);
}
function home() {
  if (!sphere) {
    return;
  }
  viewer.camera.viewBoundingSphere(
    sphere,
    new C.HeadingPitchRange(0.5, -0.65, sphere.radius * 2.8),
  );
  viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
}
function dispose() {
  if (disposed || viewer.isDestroyed()) {
    return;
  }
  disposed = true;
  removeStatus?.();
  if (analysis) {
    scene.postProcessStages.remove(analysis);
  }
  for (const source of sources) {
    scene.primitives.remove(source);
  }
  flatten?.destroy();
  viewer.destroy();
}
window.viewshedExample = {
  C,
  viewer,
  frame,
  errors,
  sources,
  point,
  pose,
  home,
  dispose,
  get analysis() {
    return analysis;
  },
  get flatten() {
    return flatten;
  },
  ready: false,
};
window.addEventListener("pagehide", (e) => {
  if (!e.persisted) {
    dispose();
  }
});
$("home").onclick = home;
$("observerView").onclick = () => {
  const { position, direction, up } = pose();
  viewer.camera.setView({
    destination: position,
    orientation: { direction, up },
  });
};
$("enabled").onchange = (e) => {
  if (analysis) {
    analysis.enabled = e.target.checked;
    scene.requestRender();
  }
};
$("source").onchange = (e) => {
  sources.forEach((source) => {
    source.show = e.target.checked;
  });
};
for (const id of [
  "x",
  "y",
  "z",
  "heading",
  "pitch",
  "horizontal",
  "vertical",
  "distance",
]) {
  $(id).oninput = updatePose;
}
$("resolution").onchange = () => {
  if (analysis) {
    try {
      rebuild();
      $("error").textContent = "";
    } catch (value) {
      error(value);
    }
  }
};
$("bias").onchange = $("resolution").onchange;
$("flatten").disabled = sample !== "tiles";
$("flatten").onchange = (e) => {
  if (flatten) {
    flatten.enabled = e.target.checked;
  }
};
try {
  if (sample === "blocks") {
    const blocks = [
      [-32, 0, 15, 18, 25, 30],
      [15, 5, 12, 24, 10, 24],
      [40, 45, 10, 14, 22, 20],
      [-30, 60, 20, 24, 18, 40],
      [4, 80, 9, 24, 30, 18],
    ];
    for (const [x, y, z, sx, sy, sz] of blocks) {
      const matrix = C.Matrix4.multiply(
        frame,
        C.Matrix4.fromTranslation(new C.Cartesian3(x, y, z)),
        new C.Matrix4(),
      );
      C.Matrix4.multiplyByScale(matrix, new C.Cartesian3(sx, sy, sz), matrix);
      const model = await C.Model.fromGltfAsync({
        url: "/Specs/Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
        modelMatrix: matrix,
        incrementallyLoadTextures: false,
      });
      if (disposed) {
        model.destroy();
        break;
      }
      sources.push(scene.primitives.add(model));
    }
    sphere = new C.BoundingSphere(point(0, 25, 10), 100);
    $("x").value = 0;
    $("y").value = -80;
    $("z").value = 12;
    $("distance").value = 260;
  } else {
    let source;
    if (sample === "tiles") {
      flatten = new C.SceneGISModelFlatten({
        modelMatrix: frame,
        height: 1,
        enabled: false,
        polygonHierarchy: new C.PolygonHierarchy([
          new C.Cartesian3(-500, -500),
          new C.Cartesian3(500, -500),
          new C.Cartesian3(500, 500),
          new C.Cartesian3(-500, 500),
        ]),
      });
      source = await C.Cesium3DTileset.fromUrl(
        "/Test/Rendering/data/tileset.json",
        {
          modelMatrix: frame,
          customShader: flatten,
          maximumScreenSpaceError: 8,
        },
      );
    } else {
      const urls = {
        mesh: "/Test/S3M/data/CBD/cbd.scp",
        instances: "/Test/S3M/data/comModel/comModel.scp",
        oblique: "/Build/s3m-samples/oblique/sample.scp",
      };
      source = await C.SceneGISS3MLayer.fromUrl(urls[sample], {
        ...(planar ? { world } : {}),
        modelMatrix: frame,
        maximumDepth:
          sample === "mesh" ? 2 : sample === "oblique" ? 1 : Infinity,
        maximumCachedTiles: 4,
      });
    }
    if (disposed) {
      source.destroy();
    } else {
      sources.push(scene.primitives.add(source));
      source.tileFailed.addEventListener(error);
      sphere = source.boundingSphere;
      const local = C.Matrix4.multiplyByPoint(
        C.Matrix4.inverseTransformation(frame, new C.Matrix4()),
        sphere.center,
        new C.Cartesian3(),
      );
      $("x").value = local.x.toFixed(1);
      $("y").value = (local.y - sphere.radius * 0.85).toFixed(1);
      $("z").value = (local.z + sphere.radius * 0.15).toFixed(1);
      $("distance").value = Math.ceil(sphere.radius * 2.5);
    }
  }
  if (!disposed) {
    home();
    rebuild();
    let last = 0,
      lastStatus;
    removeStatus = scene.postRender.addEventListener(() => {
      const now = window.performance.now();
      if (now - last < 200 && analysis.status === lastStatus) {
        return;
      }
      last = now;
      lastStatus = analysis.status;
      const names = {
        ready: "分析已就绪",
        loading: "等待观察点数据",
        error: "数据或捕获失败",
        disabled: "分析已关闭",
      };
      const stats = analysis.statistics;
      $("status").textContent =
        `${names[analysis.status]}\n观察点 ${stats.drawCalls} 次绘制 · CPU ${stats.captureMilliseconds.toFixed(2)} ms`;
    });
    window.viewshedExample.ready = true;
  }
} catch (value) {
  if (!disposed) {
    error(value);
  }
}

/* global window, document, URLSearchParams, URL, performance, setInterval, clearInterval */
import * as C from "/Build/CesiumUnminified/index.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -30,
            maximumX: 30,
            minimumY: -30,
            maximumY: 30,
          },
          maximumLevel: 0,
        },
      }
    : { baseLayer: false }),
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  skyBox: false,
  skyAtmosphere: false,
});
const scene = viewer.scene;
scene.pickTranslucentDepth = true;
scene.world.show = false;
scene.environmentEffects.enabled = false;
scene.postProcessStages.fxaa.enabled = false;
scene.backgroundColor = C.Color.fromCssColorString("#17212c");
if (scene.moon) {
  scene.moon.show = false;
}
const errors = [];
scene.renderError.addEventListener((...args) => errors.push(String(args[1])));
const transform = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(118, 32, 50));
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    transform,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const vector = (x, y, z) =>
  C.Matrix4.multiplyByPointAsVector(
    transform,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
function focus(behind = false) {
  const direction = C.Cartesian3.normalize(
    behind ? vector(0, 1, -0.25) : vector(-18, 16, -7),
    new C.Cartesian3(),
  );
  const right = C.Cartesian3.normalize(
    C.Cartesian3.cross(direction, vector(0, 0, 1), new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const up = C.Cartesian3.cross(right, direction, new C.Cartesian3());
  scene.camera.setView({
    destination: behind ? point(-3, -2, 5) : point(18, -16, 12),
    orientation: { direction, up },
  });
  scene.camera.frustum.near = 0.1;
  scene.camera.frustum.far = 200;
}
focus(new URLSearchParams(window.location.search).get("view") === "behind");
const MiB = 1024 ** 2;
const splats = scene.primitives.add(
  new C.SceneGISGaussianSegmentedPrimitive({
    url: "/Build/SceneGISGaussianVideoDemo/scene.mcl.json",
    modelMatrix: transform,
    maximumSelectedSplats: 100000,
    maximumCoverageSlots: 2000,
    maximumCpuBytes: 128 * MiB,
    maximumGpuBytes: 128 * MiB,
    maximumCpuPageBytes: 16 * MiB,
    replacementCpuEscrowBytes: 8 * MiB,
    maximumGpuPageBytes: 16 * MiB,
    replacementGpuEscrowBytes: 8 * MiB,
    maximumSortWorkingSetBytes: 16 * MiB,
    usePersistentCache: false,
    minimumLeafLogicalLevel: 0,
    refineErrorPixels: 1,
    coarsenErrorPixels: 0.5,
  }),
);
const blocker = scene.primitives.add(
  new C.Primitive({
    asynchronous: false,
    show: false,
    geometryInstances: new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(2, 0.4, 6),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.fromCssColorString("#d0d6dc"),
        ),
      },
    }),
    modelMatrix: C.Matrix4.multiplyByTranslation(
      transform,
      new C.Cartesian3(3, -5, 4),
      new C.Matrix4(),
    ),
    appearance: new C.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    }),
  }),
);
const canvas = document.createElement("canvas");
canvas.width = 512;
canvas.height = 320;
const context = canvas.getContext("2d");
function draw(time) {
  const colors = ["#ef5d5d", "#5bd794", "#597ae8", "#edc45c"];
  colors.forEach((color, index) => {
    context.fillStyle = color;
    context.fillRect((index % 2) * 256, Math.floor(index / 2) * 160, 256, 160);
  });
  context.strokeStyle = "#ffffff";
  context.lineWidth = 2;
  for (let x = 0; x <= 512; x += 32) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, 320);
    context.stroke();
  }
  for (let y = 0; y <= 320; y += 32) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(512, y);
    context.stroke();
  }
  context.fillStyle = "#17212c";
  context.font = "bold 26px sans-serif";
  context.fillText("SceneGIS ↑", 20, 38);
  context.fillRect((time * 45) % 500, 270, 12, 35);
}
draw(0);
const video = document.getElementById("media");
const stream = canvas.captureStream(0);
video.muted = true;
video.srcObject = stream;
const projectionOptions = {
  scene,
  world: scene.world,
  video,
  gaussianTargets: [splats],
  sources: [blocker],
  terrain: false,
  position: point(0, -12, 5),
  direction: vector(0, 1, 0),
  up: vector(0, 0, 1),
  near: 0.2,
  distance: 60,
  horizontalAngle: C.Math.toRadians(75),
  verticalAngle: C.Math.toRadians(55),
  resolution: 1024,
  gaussianAlphaThreshold: 0.3,
};
let projection = scene.postProcessStages.add(
  new C.SceneGISVideoProjection(projectionOptions),
);
projection.errorEvent.addEventListener((error) => errors.push(String(error)));
let fileUrl;
let destroyed = false;
const timer = setInterval(() => {
  if (!video.paused && video.srcObject === stream) {
    draw(video.currentTime);
    stream.getVideoTracks()[0].requestFrame();
  }
}, 1000 / 24);
function destroy() {
  if (destroyed) {
    return;
  }
  destroyed = true;
  clearInterval(timer);
  scene.postProcessStages.remove(projection);
  viewer.destroy();
  video.pause();
  video.srcObject = null;
  video.removeAttribute("src");
  video.load();
  stream.getTracks().forEach((track) => track.stop());
  if (fileUrl) {
    URL.revokeObjectURL(fileUrl);
  }
}
const example = (window.gaussianVideoExample = {
  viewer,
  scene,
  splats,
  projection,
  blocker,
  video,
  stream,
  errors,
  point,
  vector,
  transform,
  focus,
  destroy,
});
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    destroy();
  }
});
document.getElementById("enabled").onchange = (event) => {
  projection.enabled = event.target.checked;
};
document.getElementById("flip").onchange = (event) => {
  projection.flipY = event.target.checked;
};
document.getElementById("guide").onchange = (event) => {
  projection.showFrustum = event.target.checked;
};
document.getElementById("blocker").onchange = (event) => {
  blocker.show = event.target.checked;
  scene.requestRender();
};
document.getElementById("opacity").oninput = (event) => {
  projection.opacity = Number(event.target.value);
};
document.getElementById("focus").onclick = () => focus();
document.getElementById("behind").onclick = () => focus(true);
document.getElementById("threshold").onchange = (event) => {
  scene.postProcessStages.remove(projection);
  projection = scene.postProcessStages.add(
    new C.SceneGISVideoProjection({
      ...projectionOptions,
      gaussianAlphaThreshold: Number(event.target.value),
      enabled: document.getElementById("enabled").checked,
      opacity: Number(document.getElementById("opacity").value),
      flipY: document.getElementById("flip").checked,
      showFrustum: document.getElementById("guide").checked,
    }),
  );
  projection.errorEvent.addEventListener((error) => errors.push(String(error)));
  example.projection = projection;
};
document.getElementById("play").onclick = async () => {
  if (video.paused) {
    await video.play();
  } else {
    video.pause();
  }
  document.getElementById("play").textContent = video.paused
    ? "播放视频"
    : "暂停视频";
};
document.getElementById("file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  video.pause();
  video.srcObject = null;
  if (fileUrl) {
    URL.revokeObjectURL(fileUrl);
  }
  fileUrl = URL.createObjectURL(file);
  video.src = fileUrl;
  await video.play();
};
let lastStatus = 0;
scene.postRender.addEventListener(() => {
  if (performance.now() - lastStatus < 300) {
    return;
  }
  lastStatus = performance.now();
  const stats = splats.statistics;
  document.getElementById("status").textContent =
    `${projection.status} · ${stats.selectedSplats} 个高斯 · 图集 ${(stats.gpuAtlasAllocatedBytes / MiB).toFixed(1)} MiB · 捕获 ${projection.statistics.drawCalls} 次绘制`;
  document.getElementById("error").textContent =
    errors.join("\n") || splats.error?.message || "";
  example.ready = projection.projectionReady;
});
const presented = new Promise((resolve) =>
  video.requestVideoFrameCallback(resolve),
);
stream.getVideoTracks()[0].requestFrame();
await video.play();
await presented;
video.pause();

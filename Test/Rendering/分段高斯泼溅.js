/* global window, document, URLSearchParams, performance */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -1000,
            minimumY: -1000,
            maximumX: 1000,
            maximumY: 1000,
          },
          maximumLevel: 0,
          baseColor: C.Color.fromCssColorString("#26353c"),
        },
      }
    : { baseLayer: false }),
  skyBox: false,
  skyAtmosphere: false,
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
});
const scene = viewer.scene;
scene.fog.enabled = false;
scene.backgroundColor = C.Color.fromCssColorString("#152027");
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#26353c");
  scene.globe.showGroundAtmosphere = false;
}
const transform = planar
  ? C.Matrix4.clone(C.Matrix4.IDENTITY)
  : C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(0, 35, 0));
const blocker = scene.primitives.add(
  new C.Primitive({
    geometryInstances: new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(1.2, 1, 9),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.fromCssColorString("#d6dce2"),
        ),
      },
    }),
    modelMatrix: C.Matrix4.multiplyByTranslation(
      transform,
      new C.Cartesian3(0, -4, 4.5),
      new C.Matrix4(),
    ),
    appearance: new C.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    }),
    asynchronous: false,
    show: false,
  }),
);
const state = {
  show: true,
  blocker: false,
  falloff: 1,
  color: "#ffffff",
  offsetX: 0,
  focus,
};
let splats;
let focusPending = false;
let lastStatus = 0;
const status = document.getElementById("status");
const error = document.getElementById("error");
const asset = document.getElementById("asset");
function focus() {
  if (!splats?.boundingSphere) {
    focusPending = true;
    return;
  }
  scene.camera.flyToBoundingSphere(splats.boundingSphere, {
    duration: 0,
    offset: new C.HeadingPitchRange(
      0,
      -0.25,
      Math.max(splats.boundingSphere.radius * 2.5, 10),
    ),
  });
  focusPending = false;
}
function load() {
  if (splats) {
    scene.primitives.remove(splats);
  }
  error.textContent = "";
  status.textContent = "正在加载…";
  const MiB = 1024 ** 2;
  splats = scene.primitives.add(
    new C.SceneGISGaussianSegmentedPrimitive({
      url: asset.value.trim(),
      modelMatrix: C.Matrix4.multiplyByTranslation(
        transform,
        new C.Cartesian3(state.offsetX, 0, 0),
        new C.Matrix4(),
      ),
      show: state.show,
      falloff: state.falloff,
      color: C.Color.fromCssColorString(state.color),
      maximumSelectedSplats: 1_000_000,
      maximumCoverageSlots: 10000,
      maximumCpuBytes: 512 * MiB,
      maximumGpuBytes: 256 * MiB,
      maximumCpuPageBytes: 128 * MiB,
      replacementCpuEscrowBytes: 32 * MiB,
      maximumGpuPageBytes: 128 * MiB,
      replacementGpuEscrowBytes: 32 * MiB,
      maximumSortWorkingSetBytes: 128 * MiB,
      minimumLeafLogicalLevel: 0,
      usePersistentCache: false,
    }),
  );
  window.gaussian = splats;
  focusPending = true;
}
const gui = new GUI({
  container: document.getElementById("controls"),
  title: "分段高斯",
});
gui
  .add(state, "show")
  .name("显示高斯")
  .onChange((value) => {
    splats.show = value;
  });
gui
  .add(state, "blocker")
  .name("实体遮挡")
  .onChange((value) => {
    blocker.show = value;
  });
gui
  .add(state, "falloff", 0.3, 3, 0.05)
  .name("衰减")
  .onChange((value) => {
    splats.falloff = value;
  });
gui
  .addColor(state, "color")
  .name("颜色乘子")
  .onChange((value) => {
    splats.color = C.Color.fromCssColorString(value);
  });
gui
  .add(state, "offsetX", -10, 10, 0.1)
  .name("局部 X 平移")
  .onChange((value) => {
    splats.modelMatrix = C.Matrix4.multiplyByTranslation(
      transform,
      new C.Cartesian3(value, 0, 0),
      new C.Matrix4(),
    );
  });
gui.add(state, "focus").name("定位数据");
document.getElementById("load").addEventListener("click", load);
const removeStatus = scene.postRender.addEventListener(() => {
  if (focusPending && splats.boundingSphere) {
    focus();
  }
  const now = performance.now();
  if (now - lastStatus < 250) {
    return;
  }
  lastStatus = now;
  const stats = splats.statistics;
  error.textContent = splats.error?.message ?? "";
  status.textContent = `${splats.state} · ${stats.selectedSplats.toLocaleString()} 点 · ${stats.slots} 个区域 · GPU atlas ${(stats.gpuAtlasAllocatedBytes / 1024 ** 2).toFixed(1)} MiB`;
});
load();
exposeExample(viewer, gui, {}, removeStatus);

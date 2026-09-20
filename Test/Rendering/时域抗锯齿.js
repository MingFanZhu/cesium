/* global window, document, URLSearchParams, performance */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const frame = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(-75.596, 40.038),
    );
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
if (planar) {
  viewer.planarWorld.show = false;
} else {
  scene.globe.show = false;
}
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
scene.fog.enabled = false;
scene.highDynamicRange = true;
scene.backgroundColor = C.Color.fromCssColorString("#172b3b");
scene.debugShowFramesPerSecond = true;
const taa = new C.SceneGISTemporalAntialiasing({ scene });
function point(values) {
  return C.Matrix4.multiplyByPoint(
    frame,
    C.Cartesian3.fromArray(values),
    new C.Cartesian3(),
  );
}
function vector(value) {
  return C.Matrix4.multiplyByPointAsVector(frame, value, new C.Cartesian3());
}
function box(position, dimensions, color) {
  const local = C.Matrix4.fromTranslation(C.Cartesian3.fromArray(position));
  return scene.primitives.add(
    new C.Primitive({
      geometryInstances: new C.GeometryInstance({
        geometry: C.BoxGeometry.fromDimensions({
          dimensions: C.Cartesian3.fromArray(dimensions),
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            C.Color.fromCssColorString(color),
          ),
        },
      }),
      modelMatrix: C.Matrix4.multiply(frame, local, new C.Matrix4()),
      appearance: new C.PerInstanceColorAppearance({
        flat: true,
        translucent: false,
        closed: true,
      }),
      asynchronous: false,
    }),
  );
}
box([0, 15, -0.3], [70, 90, 0.6], "#47656a");
for (let i = 0; i < 48; ++i) {
  box([-22 + i * 0.8, 16, 5], [0.065, 0.1, 10], "#e6edf0");
  box([18, -8 + i * 1.2, 2], [8, 0.06, 0.1], "#ebd098");
}
box([-3, 18, 10], [41, 0.12, 0.12], "#e6edf0");
const moving = box([0, -5, 2.5], [2, 2, 5], "#ec7047");
function view(angle = 0) {
  const position = [28 * Math.cos(angle), -36 + 15 * Math.sin(angle), 17];
  const direction = C.Cartesian3.subtract(
    new C.Cartesian3(0, 14, 3),
    C.Cartesian3.fromArray(position),
    new C.Cartesian3(),
  );
  C.Cartesian3.normalize(direction, direction);
  viewer.camera.setView({
    destination: point(position),
    orientation: {
      direction: vector(direction),
      up: vector(C.Cartesian3.UNIT_Z),
    },
  });
  viewer.camera.frustum.near = 0.1;
}
const state = {
  mode: "TAA",
  cameraMotion: false,
  objectMotion: false,
  apply() {
    taa.enabled = state.mode === "TAA";
    scene.msaaSamples = state.mode === "4×MSAA" ? 4 : 1;
    scene.postProcessStages.fxaa.enabled = state.mode === "FXAA";
  },
  reset() {
    state.cameraMotion = false;
    view();
    taa.reset();
  },
};
view();
state.apply();
const gui = new GUI({
  title: "抗锯齿对照",
  container: document.getElementById("controls"),
});
gui
  .add(state, "mode", ["无 AA", "4×MSAA", "FXAA", "TAA"])
  .name("抗锯齿模式")
  .onChange(state.apply);
gui.add(taa, "historyWeight", 0, 0.95, 0.01).name("历史权重");
gui.add(state, "cameraMotion").name("相机运动").listen();
gui.add(state, "objectMotion").name("物体运动");
gui.add(state, "reset").name("恢复视角 / 清除历史");
const start = performance.now();
const removeUpdate = scene.preUpdate.addEventListener(() => {
  const seconds = (performance.now() - start) * 0.001;
  if (state.cameraMotion) {
    view(Math.sin(seconds * 0.15) * 0.3);
  }
  if (state.objectMotion) {
    C.Matrix4.multiply(
      frame,
      C.Matrix4.fromTranslation(
        new C.Cartesian3(Math.sin(seconds) * 15, -5, 2.5),
      ),
      moving.modelMatrix,
    );
  }
});
const removeError = scene.renderError.addEventListener((_, error) => {
  document.getElementById("error").textContent = error.message;
});
exposeExample(viewer, gui, { taa, state, moving }, () => {
  removeUpdate();
  removeError();
});

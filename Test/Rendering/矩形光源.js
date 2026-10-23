/* global window, document, URLSearchParams */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const frame = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(0, 35));
function point(x, y, z) {
  return C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
}
function vector(x, y, z) {
  return C.Matrix4.multiplyByPointAsVector(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
}
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -100,
            minimumY: -100,
            maximumX: 100,
            maximumY: 100,
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
scene.environmentEffects.enabled = false;
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
scene.fog.enabled = false;
scene.backgroundColor = C.Color.fromCssColorString("#0a1018");
scene.light = new C.DirectionalLight({
  direction: vector(0, 0, -1),
  intensity: 0.02,
});
scene.highDynamicRange = true;
scene.postProcessStages.exposure = 1;
scene.postProcessStages.fxaa.enabled = true;
viewer.clock.shouldAnimate = false;
const lights = new C.SceneGISLightCollection({ scene });
const panel = lights.add(
  new C.SceneGISRectAreaLight({
    position: point(0, 2, 7),
    direction: vector(0, 0, -1),
    up: vector(0, 1, 0),
    width: 12,
    height: 3,
    intensity: 8,
    range: 50,
    color: new C.Color(1, 0.78, 0.5),
  }),
);
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: C.Cartesian2.ZERO,
});
const models = [],
  shaders = [];
let marker;
let disposed = false;
let removeReady;
const state = {
  ready: false,
  enabled: true,
  width: 12,
  height: 3,
  intensity: 8,
  tilt: 0,
  rotation: 0,
  twoSided: false,
  marker: true,
  apply() {
    panel.show = state.enabled;
    panel.width = state.width;
    panel.height = state.height;
    panel.intensity = state.intensity;
    panel.twoSided = state.twoSided;
    const tilt = C.Math.toRadians(state.tilt),
      roll = C.Math.toRadians(state.rotation);
    panel.direction = vector(0, Math.sin(tilt), -Math.cos(tilt));
    panel.up = vector(
      Math.sin(roll),
      Math.cos(roll) * Math.cos(tilt),
      Math.cos(roll) * Math.sin(tilt),
    );
    if (marker) {
      marker.show = state.marker;
      const d = C.Cartesian3.normalize(panel.direction, new C.Cartesian3());
      const r = C.Cartesian3.normalize(
        C.Cartesian3.cross(d, panel.up, new C.Cartesian3()),
        new C.Cartesian3(),
      );
      const u = C.Cartesian3.cross(r, d, new C.Cartesian3());
      const rotation = new C.Matrix3(
        r.x,
        u.x,
        -d.x,
        r.y,
        u.y,
        -d.y,
        r.z,
        u.z,
        -d.z,
      );
      const matrix = C.Matrix4.fromRotationTranslation(
        rotation,
        panel.position,
      );
      marker.modelMatrix = C.Matrix4.multiplyByScale(
        matrix,
        new C.Cartesian3(state.width, state.height, 0.04),
        matrix,
      );
    }
    scene.requestRender();
  },
  reset() {
    scene.camera.setView({
      destination: point(0, -24, 20),
      orientation: {
        direction: C.Cartesian3.normalize(
          vector(0, 24, -18),
          new C.Cartesian3(),
        ),
        up: vector(0, 0, 1),
      },
    });
    scene.camera.frustum.near = 0.2;
  },
};
state.reset();
const gui = new GUI({
  title: "矩形光源",
  container: document.getElementById("controls"),
});
gui.add(state, "enabled").name("矩形照明").onChange(state.apply);
gui.add(state, "width", 0.2, 16, 0.1).name("宽度（米）").onChange(state.apply);
gui.add(state, "height", 0.2, 12, 0.1).name("高度（米）").onChange(state.apply);
gui.add(state, "intensity", 0, 20, 0.1).name("面光亮度").onChange(state.apply);
gui
  .add(state, "rotation", -90, 90, 1)
  .name("面内旋转（度）")
  .onChange(state.apply);
gui.add(state, "tilt", 0, 180, 1).name("倾斜（度）").onChange(state.apply);
gui.add(state, "twoSided").name("双面发光").onChange(state.apply);
gui.add(state, "marker").name("显示面板").onChange(state.apply);
gui.add(state, "reset").name("恢复视角");
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
exposeExample(viewer, gui, { state, panel, lights, models }, () => {
  disposed = true;
  removeReady?.();
  removeError();
  shaders.forEach((shader) => shader.destroy());
  ibl.destroy();
});
async function box(position, size, roughness, metal = false, unlit = false) {
  const customShader = new C.CustomShader({
    lightingModel: unlit ? C.LightingModel.UNLIT : C.LightingModel.PBR,
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) {
      m.diffuse = vec3(${metal ? "0.0" : "0.32"});
      m.specular = vec3(${metal ? "0.8" : "0.04"}); m.roughness = ${roughness.toFixed(2)};
      ${unlit ? "m.diffuse = vec3(1.0, 0.78, 0.5) * 3.0;" : ""}
    }`,
  });
  shaders.push(customShader);
  const matrix = C.Matrix4.multiplyByTranslation(
    frame,
    C.Cartesian3.fromArray(position),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(matrix, C.Cartesian3.fromArray(size), matrix);
  const model = await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    modelMatrix: matrix,
    customShader,
    imageBasedLighting: ibl,
  });
  if (disposed) {
    model.destroy();
    return;
  }
  models.push(scene.primitives.add(model));
  return model;
}
try {
  await box([0, 0, -0.6], [26, 28, 1], 0.85);
  for (const [i, roughness] of [0.12, 0.35, 0.7].entries()) {
    await box([(i - 1) * 5.3, -4, -0.05], [5, 14, 0.1], roughness, true);
  }
  marker = await box([0, 2, 7], [12, 3, 0.04], 1, false, true);
  if (!disposed) {
    state.apply();
    removeReady = scene.postRender.addEventListener(() => {
      if (models.every((model) => model.ready)) {
        state.ready = true;
        document.getElementById("status").textContent =
          "本地模型已就绪 · LTC 矩形面光";
        removeReady();
        removeReady = undefined;
      }
    });
  }
} catch (error) {
  if (!disposed) {
    document.getElementById("error").textContent = error.message;
  }
}

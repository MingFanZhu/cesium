/* global window, document, URLSearchParams */
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
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = false;
scene.backgroundColor = C.Color.fromCssColorString("#172b3b");
const frame = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(0, 35, 100));
const point = (p) => C.Matrix4.multiplyByPoint(frame, p, new C.Cartesian3());
const vector = (p) =>
  C.Matrix4.multiplyByPointAsVector(frame, p, new C.Cartesian3());
scene.light = new C.DirectionalLight({
  direction: vector(
    C.Cartesian3.normalize(new C.Cartesian3(-1, 0.5, -1.4), new C.Cartesian3()),
  ),
  intensity: 8,
});
const autoExposure = new C.SceneGISAutoExposure({ scene, enabled: true });
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: new C.Cartesian2(1, 0),
});
const models = [],
  shaders = [];
let disposed = false;
const state = {
  lighting: "日光",
  ready: false,
  applyLighting() {
    const intensity = { 日光: 8, 黄昏: 0.4, 夜间: 0.025 }[state.lighting];
    scene.light.intensity = intensity;
    ibl.sphericalHarmonicCoefficients = Array.from(
      Array(9).keys(),
      (i) =>
        new C.Cartesian3(
          i === 0 ? intensity * 0.08 : 0,
          i === 0 ? intensity * 0.09 : 0,
          i === 0 ? intensity * 0.12 : 0,
        ),
    );
    scene.backgroundColor = new C.Color(
      intensity * 0.015,
      intensity * 0.025,
      intensity * 0.04,
      1,
    );
    taa.reset();
    document.getElementById("status").textContent =
      `${state.lighting} · 切换环境后观察曝光过渡；可锁定比较。`;
    scene.requestRender();
  },
  resetView() {
    scene.camera.setView({
      destination: point(new C.Cartesian3(11, -20, 9)),
      orientation: {
        direction: vector(
          C.Cartesian3.normalize(
            new C.Cartesian3(-11, 24, -6),
            new C.Cartesian3(),
          ),
        ),
        up: vector(C.Cartesian3.UNIT_Z),
      },
    });
    scene.camera.frustum.near = 0.1;
    scene.camera.frustum.far = 10000;
    taa.reset();
    autoExposure.reset();
  },
};
const gui = new GUI({
  title: `${planar ? "平面" : "球面"}自动曝光`,
  container: document.getElementById("controls"),
});
gui
  .add(state, "lighting", ["日光", "黄昏", "夜间"])
  .name("环境亮度")
  .onChange(state.applyLighting);
gui.add(autoExposure, "enabled").name("自动曝光");
gui.add(autoExposure, "locked").name("锁定当前曝光");
gui
  .add(autoExposure, "exposureCompensation", -3, 3, 0.1)
  .name("曝光补偿（档）");
gui.add(autoExposure, "speedUp", 0.1, 10, 0.1).name("适应亮处（档/秒）");
gui.add(autoExposure, "speedDown", 0.1, 10, 0.1).name("适应暗处（档/秒）");
const metering = gui.addFolder("测光与范围").close();
metering
  .add(autoExposure, "minimumExposure", 1 / 64, 1, 1 / 64)
  .name("最低自动倍率");
metering.add(autoExposure, "maximumExposure", 1, 64, 0.5).name("最高自动倍率");
metering.add(autoExposure, "centerWeight", 0, 1, 0.05).name("中央测光权重");
metering.add(autoExposure, "lowPercent", 0, 0.4, 0.01).name("忽略暗部比例");
metering
  .add(autoExposure, "highPercent", 0.6, 1, 0.01)
  .name("保留亮度上限分位");
gui.add(scene.postProcessStages, "exposure", 0.1, 4, 0.05).name("曝光倍率");
gui.add(autoExposure, "reset").name("立即重新测光");
gui.add(state, "resetView").name("恢复视角");
exposeExample(viewer, gui, { autoExposure, taa, state, models }, () => {
  disposed = true;
  shaders.forEach((shader) => shader.destroy());
  ibl.destroy();
});
scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
state.resetView();
const removeInitialView = scene.postRender.addEventListener(() => {
  removeInitialView();
  state.resetView();
});
async function box(position, dimensions, color) {
  const shader = new C.CustomShader({
    uniforms: {
      u_color: { type: C.UniformType.VEC3, value: new C.Cartesian3(...color) },
    },
    fragmentShaderText:
      "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = u_color; material.specular = vec3(0.04); material.roughness = 0.8; }",
  });
  shaders.push(shader);
  const matrix = C.Matrix4.multiplyByTranslation(
    frame,
    new C.Cartesian3(...position),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(matrix, new C.Cartesian3(...dimensions), matrix);
  const model = await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    modelMatrix: matrix,
    customShader: shader,
    imageBasedLighting: ibl,
  });
  if (disposed) {
    model.destroy();
    return;
  }
  scene.primitives.add(model);
  models.push(model);
}
try {
  state.applyLighting();
  await box([0, 3, -0.2], [22, 30, 0.4], [0.22, 0.24, 0.25]);
  for (let i = 0; i < 3; ++i) {
    await box([-7, i * 7, 3], [6, 5, 6], [0.32, 0.21, 0.13]);
    await box([7, i * 7, 4], [6, 5, 8], [0.28, 0.35, 0.41]);
    await box([-3.8, i * 7 - 0.5, 2.5], [0.1, 2.2, 1.8], [0.75, 0.78, 0.8]);
    await box([3.8, i * 7 - 0.5, 3], [0.1, 2.2, 2.5], [0.08, 0.1, 0.12]);
  }
  await box([0, 4, 0.75], [1.5, 1.5, 1.5], [0.18, 0.18, 0.18]);
  await box([-1.8, 0, 0.5], [1, 1, 1], [0.6, 0.03, 0.02]);
  await box([1.8, 1.5, 0.5], [1, 1, 1], [0.03, 0.3, 0.04]);
  if (!disposed) {
    state.ready = true;
    autoExposure.reset();
  }
} catch (error) {
  if (!disposed) {
    document.getElementById("error").textContent = error.message;
  }
}

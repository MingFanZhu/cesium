/* global window, document, URLSearchParams */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const frame = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(-75.596, 40.038, 0),
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
  shadows: true,
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
scene.backgroundColor = C.Color.fromCssColorString("#243747");
scene.highDynamicRange = true;
scene.postProcessStages.ambientOcclusion.enabled = false;
scene.shadowMap.size = 2048;
scene.shadowMap.maximumDistance = 350;
scene.shadowMap.softShadows = true;
viewer.clock.shouldAnimate = false;
const models = [];
const shaders = [];
let disposed = false;
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
const state = {
  ready: false,
  view: "细杆与接触",
  elevation: 35,
  setLight() {
    const elevation = C.Math.toRadians(state.elevation);
    const direction = new C.Cartesian3(
      Math.cos(elevation) * 0.8,
      Math.cos(elevation) * 0.6,
      -Math.sin(elevation),
    );
    scene.light = new C.DirectionalLight({
      direction: vector(direction),
      intensity: 2,
    });
  },
  reset() {
    const close = state.view === "细杆与接触";
    const position = close ? [36, -43, 27] : [58, -75, 65];
    const target = close ? [2, 7, 3] : [0, 75, 0];
    const direction = C.Cartesian3.normalize(
      C.Cartesian3.subtract(
        C.Cartesian3.fromArray(target),
        C.Cartesian3.fromArray(position),
        new C.Cartesian3(),
      ),
      new C.Cartesian3(),
    );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    viewer.camera.setView({
      destination: point(position),
      orientation: {
        direction: vector(direction),
        up: vector(C.Cartesian3.cross(right, direction, new C.Cartesian3())),
      },
    });
    viewer.camera.frustum.near = 0.2;
    // Retain the native far plane so the full planar home extent remains reachable.
  },
};
state.setLight();
state.reset();
const gui = new GUI({
  title: "阴影精细度",
  container: document.getElementById("controls"),
});
gui.add(viewer, "shadows").name("几何阴影");
gui.add(scene.shadowMap, "softShadows").name("软阴影");
gui.add(scene.shadowMap, "size", [512, 1024, 2048, 4096]).name("阴影分辨率");
gui
  .add(scene.shadowMap, "maximumDistance", 100, 1000, 10)
  .name("阴影距离（米）");
gui.add(scene.shadowMap, "normalOffset").name("法线偏移");
gui.add(scene.shadowMap, "debugCascadeColors").name("显示级联颜色");
gui
  .add(state, "elevation", 5, 80, 1)
  .name("太阳高度（度）")
  .onChange(state.setLight);
gui
  .add(state, "view", ["细杆与接触", "远近级联"])
  .name("视角")
  .onChange(state.reset);
gui.add(state, "reset").name("恢复视角");
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
let removeReady;
exposeExample(viewer, gui, { state, models }, () => {
  disposed = true;
  removeError();
  removeReady?.();
  shaders.forEach((shader) => shader.destroy());
});
async function box(position, scale, color, slope = 0) {
  const shader = new C.CustomShader({
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(${color.join(",")}); material.roughness = 0.85; material.specular = vec3(0.04); }`,
  });
  shaders.push(shader);
  const local = C.Matrix4.fromRotationTranslation(
    C.Matrix3.fromRotationX(slope),
    C.Cartesian3.fromArray(position),
  );
  const modelMatrix = C.Matrix4.multiply(frame, local, new C.Matrix4());
  C.Matrix4.multiplyByScale(
    modelMatrix,
    C.Cartesian3.fromArray(scale),
    modelMatrix,
  );
  const model = await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    modelMatrix,
    customShader: shader,
  });
  if (disposed) {
    model.destroy();
    return;
  }
  models.push(scene.primitives.add(model));
}
try {
  await box([0, 100, -0.5], [80, 280, 1], [0.65, 0.67, 0.62]);
  if (!disposed) {
    await box([-12, 4, 5], [8, 8, 10], [0.18, 0.43, 0.65]);
  }
  for (const x of [-4, 0, 4, 8, 12]) {
    if (!disposed) {
      await box([x, 0, 3], [0.25, 0.25, 6], [0.8, 0.42, 0.15]);
    }
  }
  for (const x of [4, 20]) {
    if (!disposed) {
      await box([x, 10, 3], [0.3, 0.3, 6], [0.75, 0.75, 0.75]);
    }
  }
  if (!disposed) {
    await box([12, 10, 6], [16.3, 0.3, 0.3], [0.75, 0.75, 0.75]);
  }
  if (!disposed) {
    await box([-15, 24, 3], [16, 16, 0.5], [0.65, 0.67, 0.62], Math.PI / 12);
  }
  for (const y of [65, 120, 210]) {
    if (!disposed) {
      await box([0, y, 6], [8, 8, 12], [0.18, 0.43, 0.65]);
    }
  }
  if (!disposed) {
    removeReady = scene.postRender.addEventListener(() => {
      if (models.every((model) => model.ready)) {
        state.ready = true;
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

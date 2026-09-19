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
let removeReady;
const ibl = new C.ImageBasedLighting({
  sphericalHarmonicCoefficients: [
    new C.Cartesian3(0.55, 0.7, 0.9),
    ...Array.from({ length: 8 }, () => new C.Cartesian3()),
  ],
  specularEnvironmentMaps:
    "/Specs/Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2",
});
function point(x, y, z) {
  return C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
}
function vector(value) {
  return C.Matrix4.multiplyByPointAsVector(frame, value, new C.Cartesian3());
}
scene.light = new C.DirectionalLight({
  direction: vector(new C.Cartesian3(0, 1, -1)),
  intensity: 2.5,
});
const state = {
  ready: false,
  illumination: "完整光照",
  update() {
    scene.light.intensity = state.illumination === "仅环境光" ? 0 : 2.5;
    const factor = state.illumination === "仅直接光" ? 0 : 1;
    ibl.imageBasedLightingFactor = new C.Cartesian2(factor, factor);
  },
  reset() {
    const direction = C.Cartesian3.normalize(
      new C.Cartesian3(0, 38, -38),
      new C.Cartesian3(),
    );
    viewer.camera.setView({
      destination: point(0, -38, 38),
      orientation: {
        direction: vector(direction),
        up: vector(new C.Cartesian3(0, 1, 1)),
      },
    });
    viewer.camera.frustum.near = 0.2;
  },
};
state.reset();
const gui = new GUI({
  title: "阴影与光照",
  container: document.getElementById("controls"),
});
gui.add(viewer, "shadows").name("几何阴影");
gui
  .add(state, "illumination", ["完整光照", "仅环境光", "仅直接光"])
  .name("照明分量")
  .onChange(state.update);
gui.add(scene, "highDynamicRange").name("HDR");
gui.add(state, "reset").name("恢复视角");
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
exposeExample(viewer, gui, { state, models, ibl }, () => {
  disposed = true;
  removeError();
  removeReady?.();
  shaders.forEach((shader) => shader.destroy());
  ibl.destroy();
});
async function box(
  position,
  scale,
  diffuse,
  specular = 0.04,
  roughness = 0.8,
  emission = [0, 0, 0],
) {
  const shader = new C.CustomShader({
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
    material.diffuse=vec3(${diffuse.join(",")}); material.specular=vec3(${specular}); material.roughness=${roughness}; material.emissive=vec3(${emission.join(",")});
  }`,
  });
  shaders.push(shader);
  const matrix = C.Matrix4.multiplyByTranslation(
    frame,
    C.Cartesian3.fromArray(position),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(matrix, C.Cartesian3.fromArray(scale), matrix);
  const model = await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    modelMatrix: matrix,
    customShader: shader,
    imageBasedLighting: ibl,
    shadows: C.ShadowMode.ENABLED,
  });
  if (disposed) {
    model.destroy();
    return;
  }
  models.push(scene.primitives.add(model));
}
try {
  await box([0, 0, -1.2], [47, 29, 1], [0.12, 0.14, 0.16]);
  const names = ["漫反射 + 环境光", "金属环境反射", "自发光"];
  for (let i = 0; i < 3; i++) {
    if (disposed) {
      break;
    }
    const x = (i - 1) * 15;
    await box(
      [x, 0, -0.35],
      [13, 22, 0.7],
      i === 0 ? [0.55, 0.32, 0.12] : [0, 0, 0],
      i === 1 ? 0.9 : i === 2 ? 0.0 : 0.04,
      i === 1 ? 0.25 : 0.8,
      i === 2 ? [0.15, 0.4, 0.65] : [0, 0, 0],
    );
    if (disposed) {
      break;
    }
    await box([x, -5, 3], [2, 2, 6], [0.3, 0.33, 0.36]);
    viewer.entities.add({
      position: point(x, -12, 0.2),
      label: {
        text: names[i],
        font: "16px sans-serif",
        fillColor: C.Color.WHITE,
        outlineColor: C.Color.BLACK,
        outlineWidth: 3,
        style: C.LabelStyle.FILL_AND_OUTLINE,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
  if (!disposed) {
    removeReady = scene.postRender.addEventListener(() => {
      if (
        models.every((model) => model.ready) &&
        ibl.useSpecularEnvironmentMaps
      ) {
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

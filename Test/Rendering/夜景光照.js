/* global window, document, URLSearchParams */
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
            minimumX: -500,
            minimumY: -500,
            maximumX: 500,
            maximumY: 500,
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
scene.backgroundColor = C.Color.fromCssColorString("#07101b");
scene.highDynamicRange = true;
scene.postProcessStages.exposure = 1;
scene.postProcessStages.fxaa.enabled = true;
viewer.clock.shouldAnimate = false;
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
scene.light = new C.DirectionalLight({
  direction: vector(0.4, 0.3, -1),
  color: new C.Color(0.45, 0.6, 1),
  intensity: 0.03,
});
const lights = new C.SceneGISLightCollection({ scene });
const warm = [1, 0.5, 0.18];
const cool = [0.18, 0.5, 1];
const lamps = [
  { p: [-12, -11, 4.8], c: warm },
  { p: [-12, 8, 4.8], c: warm },
  { p: [12, -11, 4.8], c: cool },
  { p: [12, 8, 4.8], c: cool },
];
const points = lamps.map(({ p, c }) =>
  lights.add(
    new C.SceneGISPointLight({
      position: point(...p),
      color: new C.Color(...c),
      intensity: 170,
      range: 19,
      radius: 0.25,
    }),
  ),
);
const spots = [-8, 8].map((x, i) =>
  lights.add(
    new C.SceneGISSpotLight({
      position: point(x, 13, 2),
      direction: vector(0, 0.5, 1),
      color: new C.Color(...(i === 0 ? cool : warm)),
      intensity: 420,
      range: 26,
      innerConeAngle: C.Math.toRadians(16),
      outerConeAngle: C.Math.toRadians(32),
    }),
  ),
);
const ibl = new C.ImageBasedLighting({
  sphericalHarmonicCoefficients: [
    new C.Cartesian3(0.025, 0.035, 0.06),
    ...Array.from({ length: 8 }, () => new C.Cartesian3()),
  ],
  imageBasedLightingFactor: new C.Cartesian2(1, 0.04),
  specularEnvironmentMaps:
    "/Specs/Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2",
});
const bloom = scene.postProcessStages.bloom;
bloom.enabled = true;
bloom.uniforms.contrast = 128;
bloom.uniforms.brightness = -0.3;
bloom.uniforms.delta = 1;
bloom.uniforms.sigma = 2;
bloom.uniforms.stepSize = 1;
const ssr = new C.SceneGISScreenSpaceReflections({
  scene,
  enabled: false,
  maximumDistance: 100,
  thickness: 0.3,
});
const models = [],
  shaders = [],
  emitters = [];
let disposed = false;
let removeReady;
const state = {
  ready: false,
  localLights: true,
  pointLights: true,
  spotLights: true,
  emission: true,
  intensity: 1,
  emissiveStrength: 3,
  spotAngle: 0,
  apply() {
    lights.show = state.localLights;
    points.forEach((light) => {
      light.show = state.pointLights;
      light.intensity = 170 * state.intensity;
    });
    spots.forEach((light) => {
      light.show = state.spotLights;
      light.intensity = 420 * state.intensity;
      light.direction = vector(
        Math.sin(C.Math.toRadians(state.spotAngle)),
        0.5,
        1,
      );
    });
    emitters.forEach((shader) =>
      shader.setUniform(
        "u_strength",
        state.emission ? state.emissiveStrength : 0,
      ),
    );
    scene.requestRender();
  },
  reset() {
    viewer.camera.setView({
      destination: point(42, -56, 38),
      orientation: {
        direction: C.Cartesian3.normalize(
          vector(-42, 60, -33),
          new C.Cartesian3(),
        ),
        up: vector(0, 0, 1),
      },
    });
    viewer.camera.frustum.near = 0.2;
  },
};
state.reset();
const gui = new GUI({
  title: "多光源与自发光",
  container: document.getElementById("controls"),
});
gui.add(state, "localLights").name("局部照明").onChange(state.apply);
gui.add(state, "pointLights").name("点光源 · 路灯").onChange(state.apply);
gui.add(state, "spotLights").name("聚光灯 · 建筑").onChange(state.apply);
gui.add(state, "intensity", 0, 3, 0.05).name("灯光强度").onChange(state.apply);
gui.add(state, "spotAngle", -65, 65, 1).name("聚光方向").onChange(state.apply);
gui.add(state, "emission").name("自发光").onChange(state.apply);
gui
  .add(state, "emissiveStrength", 0, 8, 0.1)
  .name("自发光强度")
  .onChange(state.apply);
gui.add(bloom, "enabled").name("泛光");
gui.add(ssr, "enabled").name("屏幕空间反射");
gui.add(scene.postProcessStages, "exposure", 0.3, 2, 0.05).name("曝光");
gui.add(state, "reset").name("恢复视角");
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
exposeExample(
  viewer,
  gui,
  { state, models, lights, points, spots, bloom, ssr, ibl },
  () => {
    disposed = true;
    removeError();
    removeReady?.();
    shaders.forEach((shader) => shader.destroy());
    ibl.destroy();
  },
);
async function box(p, dimensions, color, options = {}) {
  const emission = options.emission ?? [0, 0, 0];
  const shader = new C.CustomShader({
    uniforms: {
      u_strength: { type: C.UniformType.FLOAT, value: state.emissiveStrength },
    },
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      material.diffuse = vec3(${color.join(",")}); material.specular = vec3(${options.metal ? "0.8" : "0.04"});
      material.roughness = ${options.metal ? "0.22" : "0.8"}; material.emissive = vec3(${emission.join(",")}) * u_strength;
    }`,
  });
  shaders.push(shader);
  if (options.emission) {
    emitters.push(shader);
  }
  const matrix = C.Matrix4.multiplyByTranslation(
    frame,
    C.Cartesian3.fromArray(p),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(matrix, C.Cartesian3.fromArray(dimensions), matrix);
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
  models.push(scene.primitives.add(model));
}
try {
  await box([0, 0, -0.6], [56, 48, 1], [0.2, 0.23, 0.28]);
  await box([0, -1, -0.04], [10, 43, 0.1], [0.32, 0.35, 0.4]);
  await box([0, 18, 6], [38, 6, 12], [0.42, 0.4, 0.36]);
  for (const z of [3.5, 7, 10.5]) {
    await box([0, 14.95, z], [31, 0.15, 0.35], [0.06, 0.06, 0.04], {
      emission: [0.8, 0.4, 0.13],
    });
  }
  for (const { p, c } of lamps) {
    if (disposed) {
      break;
    }
    await box([p[0], p[1], 2.4], [0.14, 0.14, 4.8], [0.1, 0.12, 0.15], {
      metal: true,
    });
    await box(p, [1.1, 1.1, 0.2], [0.15, 0.15, 0.15], { emission: c });
    await box(
      [p[0] + (p[0] < 0 ? -5 : 5), p[1], 0.8],
      [3.5, 2.2, 1.6],
      [0.24, 0.3, 0.36],
    );
  }
  await box([-4, -3, 1.1], [3, 3, 2.2], [0.035, 0.035, 0.035], { metal: true });
  await box([4, -3, 1.1], [3, 3, 2.2], [0.32, 0.32, 0.32]);
  await box([0, 9, 1], [8, 2, 2], [0.04, 0.04, 0.04], { metal: true });
  await box([0, 7.96, 1.1], [6, 0.12, 0.5], [0.04, 0.04, 0.04], {
    emission: cool,
  });
  if (!disposed) {
    state.apply();
    removeReady = scene.postRender.addEventListener(() => {
      if (models.every((m) => m.ready) && ibl.useSpecularEnvironmentMaps) {
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

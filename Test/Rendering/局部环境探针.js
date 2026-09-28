/* global window, document, URL, URLSearchParams, Blob, btoa */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const viewer = new C.Viewer("map", {
  shadows: true,
  terrainShadows: C.ShadowMode.RECEIVE_ONLY,
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -100000,
            minimumY: -100000,
            maximumX: 100000,
            maximumY: 100000,
          },
          maximumLevel: 0,
          enableLighting: true,
          baseColor: C.Color.fromCssColorString("#646969"),
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
scene.shadowMap.maximumDistance = 60;
scene.shadowMap.size = 2048;
scene.shadowMap.softShadows = true;
scene.highDynamicRange = true;
scene.fog.enabled = false;
scene.sunBloom = false;
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#646969");
  scene.globe.showGroundAtmosphere = false;
  scene.globe.enableLighting = false;
}
const environment = planar
  ? new C.SceneGISPlanarEnvironment({
      world: viewer.planarWorld,
      showAtmosphere: false,
      showSun: false,
      showMoon: false,
      sunDirection: C.Cartesian3.UNIT_Z,
      moonDirection: C.Cartesian3.UNIT_Y,
      directionMode: "astronomical",
      originLongitude: 0,
      originLatitude: C.Math.toRadians(35),
    })
  : undefined;
if (environment) {
  viewer.addController(environment);
}
const effects = new C.SceneGISEnvironmentEffects({
  mode: planar ? "planar" : "globe",
  world: planar ? viewer.planarWorld : undefined,
  enabled: true,
  showAtmosphere: true,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showHeightFog: false,
  showAerialPerspective: false,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: false,
  surfaceRadianceScale: 3,
  backgroundRadianceScale: 3,
});
viewer.addController(effects);
viewer.clock.shouldAnimate = false;
const origin = planar ? C.Cartesian3.ZERO : C.Cartesian3.fromDegrees(0, 35, 0);
const localToWorld = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(origin);

if (planar) {
  viewer.planarWorld.show = false;
} else {
  scene.globe.show = false;
}
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = true;
const models = [];
const urls = [];
const shaders = [];
function sphereUrl(roughness, metal) {
  const geometry = C.SphereGeometry.createGeometry(
    new C.SphereGeometry({
      radius: 1.0,
      stackPartitions: 48,
      slicePartitions: 64,
      vertexFormat: C.VertexFormat.POSITION_AND_NORMAL,
    }),
  );
  const positions = new Float32Array(geometry.attributes.position.values);
  const normals = new Float32Array(geometry.attributes.normal.values);
  const indices = new Uint16Array(geometry.indices);
  const bytes = new Uint8Array(
    positions.byteLength + normals.byteLength + indices.byteLength,
  );
  bytes.set(new Uint8Array(positions.buffer));
  bytes.set(new Uint8Array(normals.buffer), positions.byteLength);
  bytes.set(
    new Uint8Array(indices.buffer),
    positions.byteLength + normals.byteLength,
  );
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const gltf = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    buffers: [
      {
        byteLength: bytes.length,
        uri: `data:application/octet-stream;base64,${btoa(binary)}`,
      },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      {
        buffer: 0,
        byteOffset: positions.byteLength,
        byteLength: normals.byteLength,
      },
      {
        buffer: 0,
        byteOffset: positions.byteLength + normals.byteLength,
        byteLength: indices.byteLength,
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        min: [-3, -3, -3],
        max: [3, 3, 3],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: normals.length / 3,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
      },
    ],
    materials: [
      {
        pbrMetallicRoughness: {
          baseColorFactor: metal
            ? [0.91, 0.92, 0.95, 1]
            : [0.12, 0.22, 0.35, 1],
          metallicFactor: metal ? 1 : 0,
          roughnessFactor: roughness,
        },
        ...(metal
          ? {}
          : {
              extensions: {
                KHR_materials_clearcoat: {
                  clearcoatFactor: 1,
                  clearcoatRoughnessFactor: roughness,
                },
              },
            }),
      },
    ],
    extensionsUsed: metal ? [] : ["KHR_materials_clearcoat"],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
        ],
      },
    ],
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(gltf)], { type: "model/gltf+json" }),
  );
  urls.push(url);
  return url;
}

const probes = new C.SceneGISReflectionProbeCollection({
  scene,
  resolution: 128,
});
const probe = probes.add(
  new C.SceneGISReflectionProbe({
    modelMatrix: C.Matrix4.multiplyByTranslation(
      localToWorld,
      new C.Cartesian3(0, 0, 3),
      new C.Matrix4(),
    ),
    halfSize: new C.Cartesian3(10, 10, 6),
    blendDistance: 2,
    maximumDistance: 60,
  }),
);
const ssr = new C.SceneGISScreenSpaceReflections({ scene });
const ao = scene.postProcessStages.ambientOcclusion;
ao.uniforms.lengthCap = 0.6;
let redWall;
let disposed = false;
let removeReady;
const state = {
  ready: false,
  show: true,
  reflections: true,
  occlusion: true,
  ao: false,
  ssr: false,
  hour: 10,
  moved: false,
  apply() {
    probes.show = state.show;
    probes.reflections = state.reflections;
    probes.occlusion = state.occlusion;
    ao.enabled = state.ao;
    ssr.enabled = state.ssr;
  },
  time() {
    viewer.clock.currentTime = C.JulianDate.addHours(
      C.JulianDate.fromIso8601("2026-06-21T00:00:00Z"),
      state.hour,
      new C.JulianDate(),
    );
    document.getElementById("status").textContent =
      "光照已变更；点击捕获更新缓存。";
  },
  move() {
    const matrix = C.Matrix4.multiplyByTranslation(
      localToWorld,
      new C.Cartesian3(state.moved ? 8 : 0, -22, 3),
      new C.Matrix4(),
    );
    redWall.modelMatrix = C.Matrix4.multiplyByScale(
      matrix,
      new C.Cartesian3(12, 0.5, 6),
      matrix,
    );
    document.getElementById("status").textContent =
      "红墙已移动；捕获前保留旧反射。";
  },
  capture: captureProbe,
  reset() {
    const direction = C.Cartesian3.normalize(
      new C.Cartesian3(-9, 18, -5),
      new C.Cartesian3(),
    );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    const up = C.Cartesian3.cross(right, direction, new C.Cartesian3());
    viewer.camera.setView({
      destination: C.Matrix4.multiplyByPoint(
        localToWorld,
        new C.Cartesian3(9, -18, 8),
        new C.Cartesian3(),
      ),
      orientation: {
        direction: C.Matrix4.multiplyByPointAsVector(
          localToWorld,
          direction,
          new C.Cartesian3(),
        ),
        up: C.Matrix4.multiplyByPointAsVector(
          localToWorld,
          up,
          new C.Cartesian3(),
        ),
      },
    });
    viewer.camera.frustum.near = 0.1;
    viewer.camera.frustum.far = 300;
  },
};
const gui = new GUI({
  title: `${planar ? "平面" : "球面"}局部环境探针`,
  container: document.getElementById("controls"),
});
const captureButton = gui
  .add(state, "capture")
  .name("捕获 / 更新探针")
  .disable();
gui.add(state, "show").name("启用局部探针").onChange(state.apply);
gui.add(state, "occlusion").name("环境遮挡").onChange(state.apply);
gui.add(state, "reflections").name("局部镜面反射").onChange(state.apply);
gui.add(state, "ao").name("接触遮蔽 GTAO").onChange(state.apply);
gui.add(state, "ssr").name("屏幕空间反射").onChange(state.apply);
gui.add(state, "hour", 6, 18, 0.1).name("太阳时间（UTC）").onChange(state.time);
const moveButton = gui
  .add(state, "moved")
  .name("移动屏幕外红墙")
  .onChange(state.move)
  .disable();
gui.add(state, "reset").name("恢复视角");
state.reset();
state.time();
state.apply();
async function captureProbe() {
  captureButton.disable();
  document.getElementById("error").textContent = "";
  try {
    await probes.capture(models);
    const stats = probes._state;
    document.getElementById("status").textContent =
      `第 ${probe.generation} 次捕获完成 · ${stats.captureDraws} 次颜色绘制 · 静止时复用`;
  } catch (error) {
    document.getElementById("error").textContent = error.message;
  } finally {
    if (!disposed) {
      captureButton.enable();
    }
  }
}
const removeError = scene.renderError.addEventListener((...args) => {
  const error = args[1];
  document.getElementById("error").textContent = error.message;
});
exposeExample(
  viewer,
  gui,
  { state, effects, environment, probes, probe, models, ssr, ao },
  () => {
    disposed = true;
    removeReady?.();
    removeError();
    viewer.removeController(effects);
    if (environment) {
      viewer.removeController(environment);
    }
    shaders.forEach((shader) => shader.destroy());
    urls.forEach((url) => URL.revokeObjectURL(url));
  },
);
async function box(position, scale, color) {
  const shader = new C.CustomShader({
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { m.diffuse = vec3(${color.join(",")}); m.specular = vec3(0.04); m.roughness = 0.7; m.clearcoatFactor = 0.0; }`,
  });
  shaders.push(shader);
  const matrix = C.Matrix4.multiplyByTranslation(
    localToWorld,
    C.Cartesian3.fromArray(position),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(matrix, C.Cartesian3.fromArray(scale), matrix);
  const model = await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
    modelMatrix: matrix,
    customShader: shader,
    incrementallyLoadTextures: false,
    shadows: C.ShadowMode.ENABLED,
  });
  if (disposed) {
    model.destroy();
    return;
  }
  models.push(scene.primitives.add(model));
  return model;
}
try {
  await box([0, 0, -0.2], [25, 30, 0.4], [0.36, 0.38, 0.4]);
  await box([-6, 2, 3], [0.4, 10, 6], [0.55, 0.12, 0.035]);
  await box([6, 2, 3], [0.4, 10, 6], [0.04, 0.18, 0.55]);
  await box([0, 6, 3], [12, 0.4, 6], [0.52, 0.55, 0.5]);
  await box([0, 3, 6], [12, 7, 0.3], [0.6, 0.61, 0.56]);
  redWall = await box([0, -22, 3], [12, 0.5, 6], [0.8, 0.015, 0.01]);
  for (const [i, roughness] of [0.08, 0.3, 0.65].entries()) {
    const model = await C.Model.fromGltfAsync({
      url: sphereUrl(roughness, true),
      modelMatrix: C.Matrix4.multiplyByTranslation(
        localToWorld,
        new C.Cartesian3((i - 1) * 3.5, 0, 1.1),
        new C.Matrix4(),
      ),
      incrementallyLoadTextures: false,
      shadows: C.ShadowMode.ENABLED,
    });
    if (disposed) {
      model.destroy();
      break;
    }
    models.push(scene.primitives.add(model));
  }
  removeReady = scene.postRender.addEventListener(() => {
    if (!disposed && models.every((model) => model.ready) && effects.ready) {
      state.ready = true;
      captureButton.enable();
      moveButton.enable();
      document.getElementById("status").textContent =
        "就绪 · 点击捕获建立局部环境缓存";
      removeReady();
      removeReady = undefined;
    }
  });
} catch (error) {
  document.getElementById("error").textContent = error.message;
}

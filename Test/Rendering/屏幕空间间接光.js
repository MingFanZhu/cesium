/* global window, document, URLSearchParams, btoa, Blob, URL */
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
    C.Cartesian3.normalize(new C.Cartesian3(-1, 0.2, -1.4), new C.Cartesian3()),
  ),
  intensity: 0.6,
});
const ssil = new C.SceneGISScreenSpaceIndirectLighting({
  scene,
  enabled: true,
  radius: 4,
  thickness: 0.6,
});
const ssr = new C.SceneGISScreenSpaceReflections({ scene });
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: new C.Cartesian2(1, 0),
  sphericalHarmonicCoefficients: Array.from(
    Array(9).keys(),
    (i) =>
      new C.Cartesian3(
        i === 0 ? 0.035 : 0,
        i === 0 ? 0.035 : 0,
        i === 0 ? 0.035 : 0,
      ),
  ),
});
const models = [];
const emission = new C.CustomShader({
  fragmentShaderText:
    "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.emissive += max(material.diffuse - vec3(0.5), vec3(0.0)) * 3.0; }",
});
const state = {
  ao: false,
  ssr: false,
  emission: true,
  antialiasing: "TAA",
  reset() {
    viewer.camera.setView({
      destination: point(new C.Cartesian3(5, -9, 5)),
      orientation: {
        direction: vector(
          C.Cartesian3.normalize(
            new C.Cartesian3(-5, 10, -4),
            new C.Cartesian3(),
          ),
        ),
        up: vector(C.Cartesian3.UNIT_Z),
      },
    });
    viewer.camera.frustum.near = 0.1;
    viewer.camera.frustum.far = 10000;
    taa.reset();
  },
  apply() {
    scene.postProcessStages.ambientOcclusion.enabled = state.ao;
    scene.postProcessStages.ambientOcclusion.uniforms.lengthCap = 0.6;
    ssr.enabled = state.ssr;
    taa.enabled = state.antialiasing === "TAA";
    scene.msaaSamples = state.antialiasing === "4×MSAA" ? 4 : 1;
    for (const model of models) {
      model.customShader = state.emission ? emission : undefined;
    }
    taa.reset();
    ssr.reset();
  },
};
const gui = new GUI({
  title: `${planar ? "平面" : "球面"}屏幕空间间接光`,
  container: document.getElementById("controls"),
});
gui
  .add(ssil, "enabled")
  .name("屏幕空间间接光")
  .onChange(() => taa.reset());
gui
  .add(ssil, "intensity", 0, 4, 0.05)
  .name("间接光强度")
  .onChange(() => taa.reset());
gui.add(ssil, "radius", 0.5, 10, 0.1).name("作用距离（米）");
gui.add(ssil, "thickness", 0.05, 2, 0.05).name("表面厚度（米）");
gui
  .add(ssil, "resolutionScale", { 半分辨率: 0.5, 全分辨率: 1 })
  .name("计算分辨率");
gui.add(ssil, "directionCount", 1, 8, 1).name("方向数");
gui.add(ssil, "stepCount", 2, 16, 1).name("每侧采样数");
gui.add(state, "emission").name("彩墙自发光").onChange(state.apply);
gui.add(state, "ao").name("环境遮挡").onChange(state.apply);
gui.add(state, "ssr").name("屏幕空间反射").onChange(state.apply);
gui
  .add(state, "antialiasing", ["无 AA", "TAA", "4×MSAA"])
  .name("抗锯齿")
  .onChange(state.apply);
gui.add(state, "reset").name("恢复视角");
let disposed = false;
exposeExample(viewer, gui, { ssil, ssr, taa, state, models }, () => {
  disposed = true;
  ibl.destroy();
  emission.destroy();
});
scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
state.reset();
const removeInitialView = scene.postRender.addEventListener(() => {
  removeInitialView();
  state.reset();
});
function mesh(geometry, material) {
  const positions = new Float32Array(geometry.attributes.position.values);
  const normals = geometry.attributes.normal.values;
  const indices = new Uint32Array(geometry.indices);
  const bytes = new Uint8Array(
    positions.byteLength + normals.byteLength + indices.byteLength,
  );
  bytes.set(new Uint8Array(positions.buffer));
  bytes.set(
    new Uint8Array(normals.buffer, normals.byteOffset, normals.byteLength),
    positions.byteLength,
  );
  bytes.set(
    new Uint8Array(indices.buffer),
    positions.byteLength + normals.byteLength,
  );
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const minimum = [Infinity, Infinity, Infinity],
    maximum = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; ++i) {
    minimum[i % 3] = Math.min(minimum[i % 3], positions[i]);
    maximum[i % 3] = Math.max(maximum[i % 3], positions[i]);
  }
  return {
    asset: {
      version: "2.0",
      generator: "SceneGIS indirect lighting fixture",
    },
    extensionsUsed: ["KHR_materials_clearcoat"],
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
        min: minimum,
        max: maximum,
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: normals.length / 3,
        type: "VEC3",
      },
      {
        bufferView: 2,
        componentType: 5125,
        count: indices.length,
        type: "SCALAR",
      },
    ],
    materials: [material],
    meshes: [
      {
        primitives: [
          { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
        ],
      },
    ],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
}
async function add(geometry, position, material) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(mesh(geometry, material))], {
      type: "model/gltf+json",
    }),
  );
  let model;
  try {
    model = await C.Model.fromGltfAsync({
      url,
      upAxis: C.Axis.Z,
      forwardAxis: C.Axis.Y,
      modelMatrix: C.Matrix4.multiply(
        frame,
        C.Matrix4.fromTranslation(position),
        new C.Matrix4(),
      ),
      imageBasedLighting: ibl,
    });
  } finally {
    URL.revokeObjectURL(url);
  }
  if (disposed) {
    model.destroy();
    return;
  }
  scene.primitives.add(model);
  models.push(model);
}
async function box(position, dimensions, color, metal = 0) {
  const geometry = C.BoxGeometry.createGeometry(
    C.BoxGeometry.fromDimensions({
      dimensions: new C.Cartesian3(...dimensions),
      vertexFormat: C.VertexFormat.POSITION_AND_NORMAL,
    }),
  );
  await add(geometry, new C.Cartesian3(...position), {
    pbrMetallicRoughness: {
      baseColorFactor: [...color, 1],
      metallicFactor: metal,
      roughnessFactor: metal ? 0.15 : 0.85,
    },
  });
}
try {
  await box([0, 0, -0.15], [8, 8, 0.3], [0.45, 0.45, 0.45]);
  await box([-3, 0.5, 1.5], [0.2, 5, 3], [0.95, 0.025, 0.01]);
  await box([0, 3, 1.5], [6, 0.2, 3], [0.02, 0.75, 0.035]);
  await box([-1, 1, 0.75], [0.8, 1.5, 1.5], [0.18, 0.18, 0.18]);
  await box([1.2, 0.3, 0.4], [1.3, 1.3, 0.8], [0.5, 0.5, 0.5], 1);
  await box([-2, -1.3, 0.9], [0.12, 0.12, 1.8], [0.3, 0.3, 0.3]);
  state.apply();
  document.getElementById("status").textContent =
    "已加载。比较彩墙附近的地面与灰色方块；金属不会接收漫反射。";
} catch (error) {
  document.getElementById("error").textContent = error.message;
}

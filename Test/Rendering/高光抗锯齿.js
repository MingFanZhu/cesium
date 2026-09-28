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
    C.Cartesian3.normalize(
      new C.Cartesian3(-0.3, 1, -0.25),
      new C.Cartesian3(),
    ),
  ),
  intensity: 3,
});
const specularAA = new C.SceneGISSpecularAntialiasing({ scene, enabled: true });
const taa = new C.SceneGISTemporalAntialiasing({ scene });
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: new C.Cartesian2(0.5, 1),
  specularEnvironmentMaps:
    "/Specs/Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2",
});
const state = {
  antialiasing: "无 AA",
  reset() {
    viewer.camera.setView({
      destination: point(new C.Cartesian3(0, -19, 7)),
      orientation: {
        direction: vector(
          C.Cartesian3.normalize(
            new C.Cartesian3(0, 19, -1.2),
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
    taa.enabled = state.antialiasing === "TAA";
    scene.msaaSamples = state.antialiasing === "4×MSAA" ? 4 : 1;
    taa.reset();
  },
};
const gui = new GUI({
  title: `${planar ? "平面" : "球面"}高光抗锯齿`,
  container: document.getElementById("controls"),
});
gui
  .add(specularAA, "enabled")
  .name("高光抗锯齿")
  .onChange(() => taa.reset());
gui
  .add(state, "antialiasing", ["无 AA", "TAA", "4×MSAA"])
  .name("轮廓抗锯齿")
  .onChange(state.apply);
gui.add(state, "reset").name("恢复视角");
const models = [];
let disposed = false;
exposeExample(viewer, gui, { specularAA, taa, state, models }, () => {
  disposed = true;
  ibl.destroy();
});
scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
state.reset();
const removeInitialView = scene.postRender.addEventListener(() => {
  removeInitialView();
  state.reset();
});

// Local, deterministic test geometry assembled as glTF to exercise native Model PBR.
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
      generator: "SceneGIS geometric specular AA fixture",
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
async function load() {
  const sphere = C.EllipsoidGeometry.createGeometry(
    new C.EllipsoidGeometry({
      radii: new C.Cartesian3(0.65, 0.65, 0.65),
      stackPartitions: 64,
      slicePartitions: 64,
      vertexFormat: C.VertexFormat.POSITION_AND_NORMAL,
    }),
  );
  for (let row = 0; row < 2; ++row) {
    for (let i = 0; i < 5; ++i) {
      const roughness = [0.02, 0.05, 0.1, 0.2, 0.4][i];
      await add(sphere, new C.Cartesian3(-4 + i * 2, 0, 7.8 - row * 2), {
        pbrMetallicRoughness: {
          baseColorFactor: row ? [0.03, 0.15, 0.28, 1] : [0.8, 0.65, 0.35, 1],
          metallicFactor: row ? 0 : 1,
          roughnessFactor: row ? 0.5 : roughness,
        },
        ...(row
          ? {
              extensions: {
                KHR_materials_clearcoat: {
                  clearcoatFactor: 1,
                  clearcoatRoughnessFactor: roughness,
                },
              },
            }
          : {}),
      });
    }
  }
  for (let i = 0; i < 32; ++i) {
    const radius = i < 16 ? 0.025 : 0.07;
    const cylinder = C.CylinderGeometry.createGeometry(
      new C.CylinderGeometry({
        length: 3,
        topRadius: radius,
        bottomRadius: radius,
        slices: 32,
        vertexFormat: C.VertexFormat.POSITION_AND_NORMAL,
      }),
    );
    await add(cylinder, new C.Cartesian3(-5 + i * 0.32, 0, 2.8), {
      pbrMetallicRoughness: {
        baseColorFactor: [0.7, 0.7, 0.7, 1],
        metallicFactor: 1,
        roughnessFactor: 0.03,
      },
    });
  }
  if (!disposed) {
    document.getElementById("status").textContent =
      "已加载 · 上方金属与清漆，下方细圆杆";
  }
}
load().catch((error) => {
  if (!disposed) {
    document.getElementById("error").textContent = error.message;
  }
});

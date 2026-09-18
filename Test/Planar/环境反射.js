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
scene.shadowMap.maximumDistance = 200;
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
const models = [];
const urls = [];
const ibls = [];

// Deterministic local glTF spheres exercise the native metallic/roughness and clearcoat paths.
function sphereUrl(roughness, metal) {
  const geometry = C.SphereGeometry.createGeometry(
    new C.SphereGeometry({
      radius: 3,
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
const state = {
  reflection: true,
  hour: 10,
  brightness: 3,
  reset() {
    const destination = C.Matrix4.multiplyByPoint(
      localToWorld,
      new C.Cartesian3(30, -48, 23),
      new C.Cartesian3(),
    );
    const direction = C.Cartesian3.normalize(
      new C.Cartesian3(-30, 52, -19),
      new C.Cartesian3(),
    );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    const up = C.Cartesian3.cross(right, direction, new C.Cartesian3());
    viewer.camera.setView({
      destination,
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
  },
};
function setTime() {
  viewer.clock.currentTime = C.JulianDate.addHours(
    C.JulianDate.fromIso8601("2026-06-21T00:00:00Z"),
    state.hour,
    new C.JulianDate(),
  );
}
setTime();
state.reset();
const gui = new GUI({
  title: `${planar ? "平面" : "球面"}环境反射`,
  container: document.getElementById("controls"),
});
gui
  .add(state, "reflection")
  .name("镜面环境反射")
  .onChange(() => {
    for (const ibl of ibls) {
      ibl.imageBasedLightingFactor = new C.Cartesian2(
        1,
        state.reflection ? 1 : 0,
      );
    }
  });
gui.add(state, "hour", 0, 24, 0.1).name("时间（UTC）").onChange(setTime);
gui
  .add(state, "brightness", 0, 12, 0.1)
  .name("光照亮度")
  .onChange(() => {
    effects.surfaceRadianceScale = effects.backgroundRadianceScale =
      state.brightness;
  });
gui.add(state, "reset").name("恢复视角");
exposeExample(viewer, gui, { effects, environment, models, state }, () => {
  viewer.removeController(effects);
  if (environment) {
    viewer.removeController(environment);
  }
  for (const ibl of ibls) {
    ibl.destroy();
  }
  for (const url of urls) {
    URL.revokeObjectURL(url);
  }
});
try {
  for (let row = 0; row < 2; row++) {
    for (const [column, roughness] of [0.04, 0.2, 0.4, 0.65, 0.9].entries()) {
      const ibl = new C.ImageBasedLighting({
        imageBasedLightingFactor: new C.Cartesian2(1, state.reflection ? 1 : 0),
      });
      ibls.push(ibl);
      const model = await C.Model.fromGltfAsync({
        url: sphereUrl(roughness, row === 0),
        modelMatrix: C.Matrix4.multiplyByTranslation(
          localToWorld,
          new C.Cartesian3((column - 2) * 8, row * 10, 3),
          new C.Matrix4(),
        ),
        imageBasedLighting: ibl,
      });
      if (viewer.isDestroyed()) {
        model.destroy();
        break;
      }
      models.push(scene.primitives.add(model));
    }
  }
} catch (error) {
  document.getElementById("error").textContent = error.message;
}

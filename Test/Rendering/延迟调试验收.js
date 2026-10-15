/* global window, document */
import "./延迟默认环境验收.js";
import * as C from "/Build/CesiumUnminified/index.js";

const example = window.example;
const { scene, mode } = example;
const byId = (id) => document.getElementById(id);
// Use an oblique primary light so cast shadows are visible in both worlds.
byId("primary").value = "custom";
byId("primary").dispatchEvent(new window.Event("change"));
byId("shadows").checked = true;
byId("shadows").dispatchEvent(new window.Event("change"));
const origin =
  mode === "planar"
    ? C.Matrix4.IDENTITY
    : C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(118, 32));
const matrix = (x, y, z) =>
  C.Matrix4.multiplyByTranslation(
    origin,
    new C.Cartesian3(x, y, z),
    new C.Matrix4(),
  );
const position = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    origin,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const taa = new C.SceneGISTemporalAntialiasing({ scene });
const ssr = new C.SceneGISScreenSpaceReflections({ scene });
const ssil = new C.SceneGISScreenSpaceIndirectLighting({ scene });
const lights = new C.SceneGISLightCollection({ scene });
const light = lights.add(
  new C.SceneGISPointLight({
    position: position(-3000, 3000, 2000),
    range: 6000,
    intensity: 5000000,
    show: false,
  }),
);
const extended = scene.primitives.add(
  await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/BoxAnisotropy/glTF/BoxAnisotropy.gltf",
    modelMatrix: matrix(-3200, 3000, 700),
    scale: 1400,
    id: "扩展材质模型",
    shadows: C.ShadowMode.ENABLED,
    gltfCallback(gltf) {
      gltf.extensionsUsed = [
        "KHR_materials_specular",
        "KHR_materials_clearcoat",
        "KHR_materials_anisotropy",
        "EXT_mesh_features",
        "EXT_structural_metadata",
      ];
      gltf.materials[0].extensions = {
        KHR_materials_specular: { specularFactor: 0.6 },
        KHR_materials_clearcoat: {
          clearcoatFactor: 0.8,
          clearcoatRoughnessFactor: 0.3,
        },
        KHR_materials_anisotropy: { anisotropyStrength: 0.7 },
      };
      gltf.extensions = {
        EXT_structural_metadata: {
          schema: { classes: { surface: { properties: {} } } },
          propertyTables: [{ class: "surface", count: 1 }],
        },
      };
      gltf.meshes[0].primitives[0].extensions = {
        EXT_mesh_features: {
          featureIds: [{ featureCount: 1, constant: 0, propertyTable: 0 }],
        },
      };
    },
  }),
);
scene.primitives.add(
  new C.Primitive({
    asynchronous: false,
    modelMatrix: matrix(0, 3000, 1100),
    geometryInstances: new C.GeometryInstance({
      id: "透明蓝板",
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(1800, 150, 2200),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          new C.Color(0.1, 0.5, 1, 0.45),
        ),
      },
    }),
    appearance: new C.PerInstanceColorAppearance({ translucent: true }),
  }),
);
const water = scene.primitives.add(
  new C.SceneGISWaterSurface({
    polygonHierarchy: new C.PolygonHierarchy([
      new C.Cartesian3(-1800, -1800, 0),
      new C.Cartesian3(1800, -1800, 0),
      new C.Cartesian3(1800, 1800, 0),
      new C.Cartesian3(-1800, 1800, 0),
    ]),
    modelMatrix: matrix(3200, 3000, 400),
    waveAmplitude: 0,
    foamIntensity: 0,
    reflections: true,
    maximumReflectionDistance: 12000,
    reflectionThickness: 20,
    refractionStrength: 0,
  }),
);
const labels = scene.primitives.add(new C.LabelCollection());
for (const [x, text] of [
  [-3200, "扩展材质"],
  [0, "透明蓝板"],
  [3200, "水面与标注"],
]) {
  labels.add({
    position: position(x, 3000, 1800),
    text,
    font: "22px sans-serif",
    showBackground: true,
    backgroundColor: new C.Color(0.1, 0.15, 0.2, 0.5),
    id: text,
    horizontalOrigin: C.HorizontalOrigin.CENTER,
  });
}
const errors = [];
scene.renderError.addEventListener((...[, error]) => {
  errors.push(error.message);
  byId("error").textContent = error.message;
});
byId("debug").onchange = () => {
  const mode = byId("debug").value;
  scene.debugShowCommands = mode === "commands";
  scene.debugShowFrustums = mode === "frustums";
  scene.shadowMap.debugCascadeColors = mode === "cascades";
  if (mode === "cascades") {
    byId("shadows").checked = true;
    byId("shadows").dispatchEvent(new window.Event("change"));
  }
};
byId("multi").onchange = () => {
  scene.farToNearRatio = scene.logarithmicDepthFarToNearRatio = byId("multi")
    .checked
    ? 2
    : 1e9;
};
byId("taa").onchange = () => {
  if (byId("taa").checked) {
    byId("hdr").checked = scene.highDynamicRange = true;
  }
  taa.enabled = byId("taa").checked;
};
byId("hdr").addEventListener("change", () => {
  if (!scene.highDynamicRange) {
    taa.enabled = byId("taa").checked = false;
    ssr.enabled = ssil.enabled = byId("screen").checked = false;
    scene.postProcessStages.ambientOcclusion.enabled = light.show = false;
  }
});
byId("screen").onchange = () => {
  const enabled = byId("screen").checked;
  if (enabled) {
    byId("hdr").checked = scene.highDynamicRange = true;
  }
  scene.postProcessStages.ambientOcclusion.enabled =
    ssr.enabled =
    ssil.enabled =
    light.show =
      enabled;
};
byId("water").onchange = () => {
  water.show = byId("water").checked;
};
const input = new C.ScreenSpaceEventHandler(scene.canvas);
input.setInputAction((event) => {
  const picked = scene.pick(event.position);
  byId("pick").textContent =
    `拾取：${picked?.id ?? (picked ? "场景物体" : "无")}`;
}, C.ScreenSpaceEventType.LEFT_CLICK);
scene.postRender.addEventListener(() => {
  const renderer = scene._sceneGISDeferred;
  byId("cost").textContent =
    `调试额外提交 ${renderer.debugTintDrawCount ?? 0}；调试纹理 ${((renderer.debugTintByteLength ?? 0) / 1048576).toFixed(2)} MiB`;
});
window.addEventListener(
  "pagehide",
  (event) => {
    if (!event.persisted) {
      input.destroy();
      taa.destroy();
      ssr.destroy();
      ssil.destroy();
      lights.destroy();
    }
  },
  { capture: true },
);
Object.assign(example, {
  taa,
  ssr,
  ssil,
  lights,
  extended,
  water,
  labels,
  errors,
});

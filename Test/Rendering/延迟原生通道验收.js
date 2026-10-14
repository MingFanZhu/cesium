/* global window, document */
import * as C from "/Build/CesiumUnminified/index.js";
const byId = (id) => document.getElementById(id);
const viewer = new C.Viewer("map", {
  globe: false,
  skyBox: false,
  skyAtmosphere: false,
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  selectionIndicator: false,
  infoBox: false,
  scene3DOnly: true,
});
const scene = viewer.scene;
scene.highDynamicRange = true;
scene.fog.enabled = false;
scene.sun = scene.moon = undefined;
scene.backgroundColor = C.Color.fromCssColorString("#26384f");
viewer.clock.shouldAnimate = false;
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-03-20T14:00:00Z");
const point = (x, y, z) => new C.Cartesian3(7000000 + x, y, z);
const matrix = (x, y, z) => C.Matrix4.fromTranslation(point(x, y, z));
function home() {
  scene.camera.setView({
    destination: point(0, -8, -28),
    orientation: {
      direction: C.Cartesian3.normalize(
        new C.Cartesian3(0, 8, 28),
        new C.Cartesian3(),
      ),
      up: C.Cartesian3.normalize(
        new C.Cartesian3(0, 28, -8),
        new C.Cartesian3(),
      ),
    },
  });
  const aspectRatio = scene.drawingBufferWidth / scene.drawingBufferHeight;
  scene.camera.frustum =
    byId("projection").value === "orthographic"
      ? new C.OrthographicFrustum({
          width: 34,
          aspectRatio,
          near: 0.1,
          far: 200,
        })
      : new C.PerspectiveFrustum({
          fov: Math.PI / 3,
          aspectRatio,
          near: 0.1,
          far: 200,
        });
}
home();
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: new C.Cartesian2(0, 0),
});
const errors = [];
scene.renderError.addEventListener((...args) => {
  const error = args[1];
  errors.push(error.message);
  byId("error").textContent = error.message;
});
async function load(
  x,
  callback,
  id,
  url = "/Specs/Data/Models/glTF-2.0/PlanarFill/glTF/planar-fill-polygons.gltf",
) {
  const model = await C.Model.fromGltfAsync({
    url,
    modelMatrix: matrix(x, 0, 0),
    imageBasedLighting: ibl,
    gltfCallback: callback,
    id,
  });
  return scene.primitives.add(model);
}
const fill = await load(
  9,
  (gltf) => {
    const index = gltf.nodes.findIndex((n) => n.mesh === 15);
    gltf.scenes[0].nodes = [index];
    gltf.nodes[index].translation = [0, 0, 0];
    for (const mesh of gltf.meshes) {
      for (const primitive of mesh.primitives) {
        delete primitive.extensions?.EXT_mesh_primitive_edge_visibility;
      }
    }
  },
  "要素填充",
);
fill.modelMatrix = C.Matrix4.multiplyByUniformScale(
  fill.modelMatrix,
  0.6,
  new C.Matrix4(),
);
const edge = await load(
  0,
  (gltf) => {
    gltf.scenes[0].nodes = [0];
    const primitive = gltf.meshes[gltf.nodes[0].mesh].primitives[0];
    primitive.extensions.EXT_mesh_primitive_edge_visibility.material =
      gltf.materials.length;
    gltf.materials.push({
      pbrMetallicRoughness: { baseColorFactor: [0, 1, 0, 1] },
    });
  },
  "制图边线",
  "/Specs/Data/Models/glTF-2.0/EdgeVisibility/glTF-Binary/EdgeVisibilityMaterial.glb",
);
edge.edgeDisplayMode = C.EdgeDisplayMode.SURFACES_AND_EDGES;
const surface = scene.primitives.add(
  new C.Primitive({
    asynchronous: false,
    geometryInstances: new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(6, 6, 0.2),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(C.Color.RED),
      },
    }),
    modelMatrix: matrix(-9, 0, 5),
    appearance: new C.PerInstanceColorAppearance({
      translucent: false,
      flat: true,
    }),
  }),
);
const voxel = scene.primitives.add(
  new C.VoxelPrimitive({
    calculateStatistics: true,
    modelMatrix: C.Matrix4.multiplyByUniformScale(
      matrix(-9, 0, 0),
      3,
      new C.Matrix4(),
    ),
    customShader: new C.CustomShader({
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse=vec3(0.1,0.9,0.5); material.alpha=0.12; }",
    }),
  }),
);
voxel.stepSize = 0.2;
const waterMatrix = (z) =>
  C.Matrix4.fromRotationTranslation(
    C.Matrix3.fromRotationX(Math.PI),
    point(-9, 0, z),
  );
const water = scene.primitives.add(
  new C.SceneGISWaterSurface({
    polygonHierarchy: new C.PolygonHierarchy([
      new C.Cartesian3(-4, -4, 0),
      new C.Cartesian3(4, -4, 0),
      new C.Cartesian3(4, 4, 0),
      new C.Cartesian3(-4, 4, 0),
    ]),
    modelMatrix: waterMatrix(4),
    waveAmplitude: 0,
    foamIntensity: 0,
    reflections: false,
    refractionStrength: 0,
  }),
);
water.show = false;
byId("water").onchange = () => {
  water.show = byId("water").checked;
};
byId("waterPosition").onchange = () => {
  water.modelMatrix = waterMatrix(Number(byId("waterPosition").value));
};
byId("edges").onchange = () => {
  edge.edgeDisplayMode = Number(byId("edges").value);
};
byId("volume").onchange = () => {
  voxel.show = byId("volume").checked;
};
byId("surface").onchange = () => {
  surface.modelMatrix = matrix(-9, 0, Number(byId("surface").value));
};
byId("depth").onchange = () => {
  voxel.depthTest = byId("depth").checked;
};
byId("projection").onchange = home;
byId("multi").onchange = () => {
  scene.farToNearRatio = byId("multi").checked ? 1.2 : 10000;
  scene.logarithmicDepthFarToNearRatio = byId("multi").checked ? 1.2 : 1e9;
};
byId("taa").onchange = () => {
  taa.enabled = byId("taa").checked;
};
byId("ao").onchange = () => {
  scene.postProcessStages.ambientOcclusion.enabled = byId("ao").checked;
};
byId("home").onclick = home;
const input = new C.ScreenSpaceEventHandler(scene.canvas);
input.setInputAction((event) => {
  const picked = scene.pick(event.position);
  byId("pick").textContent = picked
    ? `拾取：${  picked.id ?? (picked.primitive === voxel ? "体积" : "遮挡面")}`
    : "未拾取";
}, C.ScreenSpaceEventType.LEFT_CLICK);
let disposed = false;
function destroy() {
  if (disposed) {return;}
  disposed = true;
  input.destroy();
  taa.destroy();
  viewer.destroy();
  ibl.destroy();
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {destroy();}
});
window.example = {
  viewer,
  scene,
  fill,
  edge,
  voxel,
  water,
  surface,
  taa,
  errors,
  destroy,
};

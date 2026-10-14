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
scene.backgroundColor = C.Color.fromCssColorString("#26364d");
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-03-20T14:00:00Z");
viewer.clock.shouldAnimate = false;
const frame = C.Transforms.eastNorthUpToFixedFrame(
  C.Cartesian3.fromDegrees(0, 51, 100),
);
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
function home() {
  scene.camera.lookAt(
    point(-4, 1, 2),
    new C.HeadingPitchRange(0.08, -0.56, 39),
  );
  scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
}
home();
scene.light = new C.DirectionalLight({
  direction: C.Matrix4.multiplyByPointAsVector(
    frame,
    new C.Cartesian3(0.4, 0.6, -1),
    new C.Cartesian3(),
  ),
  intensity: 2.5,
});
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: new C.Cartesian2(1, 1),
  sphericalHarmonicCoefficients: [
    new C.Cartesian3(0.7, 0.8, 1),
    ...Array.from({ length: 8 }, () => new C.Cartesian3()),
  ],
  specularEnvironmentMaps:
    "/Specs/Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2",
});
const ssr = new C.SceneGISScreenSpaceReflections({ scene, enabled: true });
const ssil = new C.SceneGISScreenSpaceIndirectLighting({
  scene,
  enabled: true,
});
scene.postProcessStages.ambientOcclusion.enabled = true;
scene.postProcessStages.ambientOcclusion.uniforms.lengthCap = 3;
const custom = new C.CustomShader({
  fragmentShaderText:
    "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial m) { m.diffuse=vec3(0.16,0.3,0.5); m.specular=vec3(0.06); m.specularWeight=0.8; m.clearcoatFactor=0.8; m.clearcoatRoughness=0.15; m.clearcoatNormal=m.normalEC; m.roughness=0.35; }",
});
const errors = [],
  models = [];
let disposed = false,
  tileset,
  combined,
  anisotropy,
  outlined;
const clipping = new C.ClippingPlaneCollection({
  planes: [new C.ClippingPlane(C.Cartesian3.UNIT_X, 0)],
  enabled: false,
  edgeColor: C.Color.YELLOW,
  edgeWidth: 2,
});
const floor = scene.primitives.add(
  new C.Primitive({
    asynchronous: false,
    geometryInstances: new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(31, 17, 0.4),
      }),
      modelMatrix: C.Matrix4.multiplyByTranslation(
        frame,
        new C.Cartesian3(0, 2, -0.2),
        new C.Matrix4(),
      ),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          new C.Color(0.35, 0.39, 0.45, 1),
        ),
      },
    }),
    appearance: new C.PerInstanceColorAppearance({
      closed: true,
      translucent: false,
    }),
  }),
);
const volume = scene.primitives.add(
  new C.ClassificationPrimitive({
    asynchronous: false,
    show: false,
    classificationType: C.ClassificationType.CESIUM_3D_TILE,
    geometryInstances: new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(5, 10, 8),
      }),
      modelMatrix: C.Matrix4.multiplyByTranslation(
        frame,
        new C.Cartesian3(1, 6, 2),
        new C.Matrix4(),
      ),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          new C.Color(0.1, 0.5, 1, 0.45),
        ),
      },
    }),
  }),
);
function pointStyle() {
  if (!tileset) {
    return;
  }
  const kind = byId("points").value;
  tileset.style = new C.Cesium3DTileStyle({
    show: kind !== "hidden",
    color:
      kind === "cyan"
        ? "rgb(80,210,240)"
        : kind === "translucent"
          ? "rgba(245,155,55,0.4)"
          : "rgb(245,155,55)",
    pointSize: Number(byId("pointSize").value),
  });
}
byId("effects").onchange = () => {
  const enabled = byId("effects").checked;
  ssr.enabled =
    ssil.enabled =
    scene.postProcessStages.ambientOcclusion.enabled =
      enabled;
};
byId("classification").onchange = () => {
  volume.show = byId("classification").checked;
};
byId("clip").onchange = () => {
  clipping.enabled = byId("clip").checked;
};
byId("clipPosition").oninput = () => {
  clipping.get(0).distance = Number(byId("clipPosition").value);
};
byId("silhouette").onchange = () => {
  if (anisotropy) {
    anisotropy.silhouetteSize = byId("silhouette").checked ? 3 : 0;
  }
};
byId("outline").onchange = () => {
  if (outlined) {
    outlined.showOutline = byId("outline").checked;
  }
};
byId("points").onchange = pointStyle;
byId("pointSize").oninput = pointStyle;
byId("hdr").onchange = () => {
  scene.highDynamicRange = byId("hdr").checked;
};
byId("home").onclick = home;
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const hit = scene.pick(position);
  byId("picked").textContent = hit
    ? `已选：${hit.id?.name ?? hit.id ?? "受光点云"}`
    : "未选中物体";
}, C.ScreenSpaceEventType.LEFT_CLICK);
scene.renderError.addEventListener((...args) => {
  const error = args[1];
  errors.push(error.message);
  byId("error").textContent = error.message;
});
scene.postRender.addEventListener(() => {
  const d = scene._sceneGISDeferred;
  byId("stats").textContent = d.ready
    ? `${d.drawCount} 次材质 + ${d.materialExtensionDrawCount} 次附加材质 · ${d.lightDrawCount} 次光照 + ${d.colorCorrectionDrawCount} 次点云校正 · ${(d.byteLength / 1048576).toFixed(2)} MiB`
    : "等待场景材质…";
});
window.example = {
  viewer,
  models,
  errors,
  ssr,
  ssil,
  ibl,
  volume,
  floor,
  point,
  home,
  get tileset() {
    return tileset;
  },
  get combined() {
    return combined;
  },
  deferred: scene._sceneGISDeferred,
};
window.addEventListener("pagehide", (event) => {
  if (!event.persisted && !disposed) {
    disposed = true;
    handler.destroy();
    viewer.destroy();
    if (!clipping.isDestroyed()) {
      clipping.destroy();
    }
    ibl.destroy();
    custom.destroy();
  }
});
try {
  for (const [index, kind] of [
    "Specular",
    "Clearcoat",
    "Anisotropy",
    "Anisotropy",
    "WithPrimitiveOutline",
  ].entries()) {
    const label = ["镜面权重", "清漆层", "各向异性", "组合与裁剪", "原生轮廓"][
      index
    ];
    const matrix = C.Matrix4.multiplyByUniformScale(
      C.Matrix4.multiplyByTranslation(
        frame,
        new C.Cartesian3((index - 2) * 5, 0, 1.5),
        new C.Matrix4(),
      ),
      2.8,
      new C.Matrix4(),
    );
    const options = {
      url: `/Specs/Data/Models/glTF-2.0/Box${kind}/glTF/Box${kind}.gltf`,
      id: label,
      modelMatrix: matrix,
      imageBasedLighting: ibl,
      environmentMapOptions: { enabled: false },
    };
    if (index === 3) {
      options.customShader = custom;
      options.clippingPlanes = clipping;
      options.gltfCallback = (gltf) => {
        gltf.extensionsUsed = [
          "KHR_materials_specular",
          "KHR_materials_clearcoat",
          "KHR_materials_anisotropy",
        ];
        gltf.materials[0].extensions = {
          KHR_materials_specular: { specularFactor: 0.8 },
          KHR_materials_clearcoat: {
            clearcoatFactor: 0.8,
            clearcoatRoughnessFactor: 0.15,
          },
          KHR_materials_anisotropy: { anisotropyStrength: 0.8 },
        };
      };
    }
    const model = await C.Model.fromGltfAsync(options);
    if (disposed) {
      model.destroy();
      break;
    }
    scene.primitives.add(model);
    models.push(model);
    if (index === 2) {
      anisotropy = model;
      model.silhouetteColor = C.Color.CYAN;
      model.silhouetteSize = 3;
    }
    if (index === 3) {
      combined = model;
    }
    if (index === 4) {
      outlined = model;
      model.outlineColor = C.Color.YELLOW;
    }
    viewer.entities.add({
      position: point((index - 2) * 5, -2.8, 0.15),
      label: {
        text: label,
        font: "16px sans-serif",
        fillColor: C.Color.WHITE,
        showBackground: false,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    });
  }
  if (!disposed) {
    const loaded = await C.Cesium3DTileset.fromUrl(
      "/Specs/Data/Cesium3DTiles/PointCloud/PointCloudNormals/tileset.json",
      { imageBasedLighting: ibl, environmentMapOptions: { enabled: false } },
    );
    if (disposed) {
      loaded.destroy();
    } else {
      const center = C.Cartesian3.clone(loaded.boundingSphere.center);
      const destination = C.Matrix4.multiplyByUniformScale(
        C.Matrix4.multiplyByTranslation(
          frame,
          new C.Cartesian3(0, 6, 3),
          new C.Matrix4(),
        ),
        0.7,
        new C.Matrix4(),
      );
      loaded.modelMatrix = C.Matrix4.multiply(
        destination,
        C.Matrix4.fromTranslation(
          C.Cartesian3.negate(center, new C.Cartesian3()),
        ),
        new C.Matrix4(),
      );
      tileset = scene.primitives.add(loaded);
      pointStyle();
    }
  }
} catch (error) {
  if (!disposed) {
    errors.push(error.message);
    byId("error").textContent = error.message;
  }
}

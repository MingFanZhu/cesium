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
scene.backgroundColor = C.Color.fromCssColorString("#14283f");
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-03-20T14:00:00Z");
viewer.clock.shouldAnimate = false;
const frame = C.Transforms.eastNorthUpToFixedFrame(
  C.Cartesian3.fromRadians(-1.31968, 0.698874),
);
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const matrix = (x, y, z, scale) =>
  C.Matrix4.multiplyByUniformScale(
    C.Matrix4.multiplyByTranslation(
      frame,
      new C.Cartesian3(x, y, z),
      new C.Matrix4(),
    ),
    scale,
    new C.Matrix4(),
  );
function home() {
  scene.camera.lookAt(
    point(-6, 0, 2),
    new C.HeadingPitchRange(0.12, -0.55, 54),
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
  intensity: 2,
});
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: new C.Cartesian2(0.2, 0),
  sphericalHarmonicCoefficients: [
    new C.Cartesian3(0.3, 0.3, 0.3),
    ...Array.from({ length: 8 }, () => new C.Cartesian3()),
  ],
});
const shaders = new Set();
const models = [];
const errors = [];
let disposed = false;
let editable, tileset, custom;
function texture() {
  const colors =
    byId("texture").value === "warm"
      ? [230, 80, 24, 255, 255, 180, 40, 255]
      : [30, 150, 200, 255, 60, 220, 140, 255];
  return new C.TextureUniform({
    typedArray: new Uint8Array([
      ...colors,
      ...colors.slice(4),
      ...colors.slice(0, 4),
    ]),
    width: 2,
    height: 2,
    minificationFilter: C.TextureMinificationFilter.NEAREST,
    magnificationFilter: C.TextureMagnificationFilter.NEAREST,
  });
}
function createCustom(options) {
  const result = new C.CustomShader(options);
  shaders.add(result);
  return result;
}
function replaceCustom() {
  if (!editable) {
    return;
  }
  const alpha = Number(byId("alpha").value);
  const previous = custom;
  custom = createCustom({
    mode: C.CustomShaderMode[byId("mode").value],
    lightingModel: C.LightingModel[byId("lighting").value],
    translucencyMode:
      alpha < 1
        ? C.CustomShaderTranslucencyMode.TRANSLUCENT
        : C.CustomShaderTranslucencyMode.OPAQUE,
    uniforms: {
      u_tex: { type: C.UniformType.SAMPLER_2D, value: texture() },
      u_shift: {
        type: C.UniformType.FLOAT,
        value: Number(byId("shift").value),
      },
      u_cutout: { type: C.UniformType.BOOL, value: byId("cutout").checked },
      u_alpha: { type: C.UniformType.FLOAT, value: alpha },
    },
    varyings: { v_local: C.VaryingType.VEC3 },
    vertexShaderText: `void vertexMain(VertexInput vsInput, inout czm_modelVertexOutput vsOutput) {
      v_local = vsInput.attributes.positionMC;
      vsOutput.positionMC.x += u_shift * (vsOutput.positionMC.z + 0.5);
    }`,
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      if (u_cutout && length(v_local.xy) < 0.25) { discard; }
      material.diffuse = texture(u_tex, (v_local.xy + v_local.yz + v_local.xz) * 2.0).rgb;
      material.specular = vec3(0.04); material.roughness = 0.45;
      material.normalEC = normalize(fsInput.attributes.normalEC);
      material.emissive = vec3(0.0); material.occlusion = 1.0; material.alpha = u_alpha;
    }`,
  });
  editable.customShader = byId("enabled").checked ? custom : undefined;
  if (previous) {
    previous.destroy();
    shaders.delete(previous);
  }
}
function solid(x, y, z, dimensions, color, id, show = true) {
  return scene.primitives.add(
    new C.Primitive({
      asynchronous: false,
      show,
      geometryInstances: new C.GeometryInstance({
        id,
        geometry: C.BoxGeometry.fromDimensions({
          dimensions,
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: C.Matrix4.multiplyByTranslation(
          frame,
          new C.Cartesian3(x, y, z),
          new C.Matrix4(),
        ),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(color),
        },
      }),
      appearance: new C.PerInstanceColorAppearance({
        flat: true,
        translucent: false,
      }),
    }),
  );
}
solid(
  0,
  1,
  -0.2,
  new C.Cartesian3(34, 16, 0.4),
  C.Color.fromCssColorString("#53616c"),
  "底板",
);
solid(
  0,
  4,
  3,
  new C.Cartesian3(7, 0.5, 6),
  C.Color.fromCssColorString("#ffd65c"),
  "透明模型后方黄板",
);
const occluder = solid(
  0,
  -4,
  3,
  new C.Cartesian3(8, 0.5, 6),
  C.Color.fromCssColorString("#297cf5"),
  "前方蓝板",
  false,
);
async function loadModel(x, y, z, scale, id, customShader) {
  const value = await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    id,
    modelMatrix: matrix(x, y, z, scale),
    forwardAxis: C.Axis.X,
    customShader,
    imageBasedLighting: ibl,
    environmentMapOptions: { enabled: false },
  });
  if (disposed) {
    value.destroy();
    return undefined;
  }
  scene.primitives.add(value);
  models.push(value);
  return value;
}
function transparent(color) {
  return createCustom({
    lightingModel: C.LightingModel.PBR,
    translucencyMode: C.CustomShaderTranslucencyMode.TRANSLUCENT,
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(${color}); material.specular=vec3(0.02); material.roughness=0.6; material.alpha=0.4; }`,
  });
}
const tileShader = createCustom({
  mode: C.CustomShaderMode.REPLACE_MATERIAL,
  lightingModel: C.LightingModel.UNLIT,
  uniforms: { u_selected: { type: C.UniformType.INT, value: -1 } },
  fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
    float id = float(fsInput.featureIds.featureId_0);
    material.diffuse = fsInput.featureIds.featureId_0 == u_selected ? vec3(1.0,0.2,0.12) : mix(vec3(0.15,0.5,0.9),vec3(0.7,0.3,0.85),fract(id*0.37));
  }`,
});
async function load() {
  editable = await loadModel(-11, 0, 3, 6, "可编辑纹理模型");
  if (disposed) {
    return;
  }
  replaceCustom();
  await loadModel(-1, 0, 2.5, 5, "红色透明模型", transparent("0.9,0.12,0.08"));
  if (disposed) {
    return;
  }
  await loadModel(1, 1, 3.5, 5, "绿色透明模型", transparent("0.08,0.8,0.22"));
  if (disposed) {
    return;
  }
  const value = await C.Cesium3DTileset.fromUrl(
    "/Specs/Data/Cesium3DTiles/Batched/BatchedWithBatchTable/tileset.json",
    {
      customShader: tileShader,
      imageBasedLighting: ibl,
      environmentMapOptions: { enabled: false },
    },
  );
  if (disposed) {
    value.destroy();
    return;
  }
  value.modelMatrix = C.Matrix4.multiply(
    matrix(11, 0, 0, 0.075),
    C.Matrix4.inverseTransformation(frame, new C.Matrix4()),
    new C.Matrix4(),
  );
  tileset = scene.primitives.add(value);
}
for (const id of ["mode", "lighting"]) {
  byId(id).onchange = replaceCustom;
}
byId("alpha").oninput = () => {
  const alpha = Number(byId("alpha").value);
  const mode =
    alpha < 1
      ? C.CustomShaderTranslucencyMode.TRANSLUCENT
      : C.CustomShaderTranslucencyMode.OPAQUE;
  if (custom?.translucencyMode !== mode) {
    replaceCustom();
  } else {
    custom.setUniform("u_alpha", alpha);
  }
};
byId("shift").oninput = () =>
  custom?.setUniform("u_shift", Number(byId("shift").value));
byId("cutout").onchange = () =>
  custom?.setUniform("u_cutout", byId("cutout").checked);
byId("texture").onchange = () => custom?.setUniform("u_tex", texture());
byId("enabled").onchange = () => {
  if (editable) {
    editable.customShader = byId("enabled").checked ? custom : undefined;
  }
};
byId("light").oninput = () => {
  scene.light.intensity = Number(byId("light").value);
};
byId("occluder").onchange = () => {
  occluder.show = byId("occluder").checked;
};
byId("hdr").onchange = () => {
  scene.highDynamicRange = byId("hdr").checked;
};
byId("home").onclick = home;
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const picked = scene.pick(position);
  if (picked instanceof C.Cesium3DTileFeature) {
    tileShader.setUniform("u_selected", picked.featureId);
    byId("picked").textContent = `3D Tiles 要素 ${picked.featureId}`;
  } else {
    byId("picked").textContent = picked?.id ?? "未选中物体";
  }
}, C.ScreenSpaceEventType.LEFT_CLICK);
scene.renderError.addEventListener((...args) => {
  const error = args[1];
  errors.push(String(error));
  byId("error").textContent = String(error);
});
const stopStats = scene.postRender.addEventListener(() => {
  const d = scene._sceneGISDeferred;
  byId("stats").textContent =
    models.length === 3 && models.every((m) => m.ready) && tileset?.tilesLoaded
      ? `材质提交 ${d.drawCount} · 屏幕光照 ${d.lightDrawCount} · 材质目标 ${(d.byteLength / 1048576).toFixed(2)} MiB`
      : "加载本地内容…";
});
window.example = {
  viewer,
  models,
  errors,
  point,
  occluder,
  get editable() {
    return editable;
  },
  get custom() {
    return custom;
  },
  get tileset() {
    return tileset;
  },
  tileShader,
  get deferred() {
    return scene._sceneGISDeferred;
  },
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted || disposed) {
    return;
  }
  disposed = true;
  stopStats();
  handler.destroy();
  viewer.destroy();
  for (const value of shaders) {
    value.destroy();
  }
  ibl.destroy();
});
load().catch((error) => {
  if (!disposed) {
    errors.push(String(error));
    byId("error").textContent = String(error);
  }
});

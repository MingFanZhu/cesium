/* global window, document, URLSearchParams, Blob, URL, fetch */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const params = new URLSearchParams(window.location.search);
const planar = params.get("world") !== "globe";
const composite = document.body.dataset.composite === "true";
const original = params.get("textures") === "original";
const variant = original ? "original-4k" : "delivery-2k";
const panelButton = document.getElementById("toggle-panels");
function togglePanels() {
  const hidden = document.body.classList.toggle("panels-hidden");
  panelButton.textContent = hidden ? "显示面板" : "隐藏面板";
}
panelButton.addEventListener("click", togglePanels);
const local = "./pbr-data/local/";
const intel = `${local}${original ? "" : "2k/"}`;
const khronos = `${local}khronos/Models/`;
const longitude = -75.596;
const latitude = 40.038;
const frame = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(longitude, latitude),
    );
for (const link of document.querySelectorAll("a[data-world]")) {
  link.search = new URLSearchParams({
    world: link.dataset.world,
    textures: original ? "original" : "2k",
  });
}
document.getElementById("other-page").search = params;
const textureLink = document.getElementById("texture-link");
textureLink.search = new URLSearchParams({
  world: planar ? "planar" : "globe",
  textures: original ? "2k" : "original",
});
if (original) {
  textureLink.textContent = "返回 2K 纹理交付版";
}
document.getElementById("variant").textContent = original
  ? "原始 4K 纹理 · 高显存占用"
  : "2K 纹理交付版 · 原始几何与材质 · 本地加载";

const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -100,
            minimumY: -100,
            maximumX: 100,
            maximumY: 100,
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
// Architectural views can look upward; surface navigation deliberately cannot.
// These examples use the same public Camera operations in both Worlds.
if (planar) {
  viewer.removeController(viewer.planarCameraController);
}
scene.screenSpaceCameraController.enableInputs = false;
const input = new C.ScreenSpaceEventHandler(scene.canvas);
let looking = false;
let panning = false;
input.setInputAction(() => {
  looking = true;
}, C.ScreenSpaceEventType.LEFT_DOWN);
input.setInputAction(() => {
  looking = false;
}, C.ScreenSpaceEventType.LEFT_UP);
input.setInputAction(() => {
  panning = true;
}, C.ScreenSpaceEventType.MIDDLE_DOWN);
input.setInputAction(() => {
  panning = false;
}, C.ScreenSpaceEventType.MIDDLE_UP);
input.setInputAction((movement) => {
  const dx = movement.endPosition.x - movement.startPosition.x;
  const dy = movement.endPosition.y - movement.startPosition.y;
  if (looking) {
    viewer.camera.lookRight(dx * 0.003);
    viewer.camera.lookUp(dy * 0.003);
  }
  if (panning) {
    viewer.camera.moveRight(-dx * 0.005);
    viewer.camera.moveUp(dy * 0.005);
  }
}, C.ScreenSpaceEventType.MOUSE_MOVE);
input.setInputAction((delta) => {
  viewer.camera.moveForward(C.Math.clamp(delta * 0.003, -0.8, 0.8));
}, C.ScreenSpaceEventType.WHEEL);
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
scene.sunBloom = false;
scene.highDynamicRange = true;
scene.backgroundColor = C.Color.fromCssColorString("#8295a7");
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = false;
scene.postProcessStages.exposure = 1;
scene.shadowMap.size = 2048;
scene.shadowMap.maximumDistance = 60;
scene.shadowMap.softShadows = true;
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T19:00:00Z");
viewer.clock.shouldAnimate = false;

function point(position) {
  return C.Matrix4.multiplyByPoint(
    frame,
    C.Cartesian3.fromArray(position),
    new C.Cartesian3(),
  );
}
function vector(value) {
  return C.Matrix4.multiplyByPointAsVector(frame, value, new C.Cartesian3());
}
const lightDirection = C.Cartesian3.normalize(
  new C.Cartesian3(-0.35, 0.55, -1),
  new C.Cartesian3(),
);
scene.light = new C.DirectionalLight({
  direction: vector(lightDirection),
  intensity: 2.5,
});
const ibl = new C.ImageBasedLighting({
  sphericalHarmonicCoefficients: [
    new C.Cartesian3(0.55, 0.7, 0.9),
    ...Array.from({ length: 8 }, () => new C.Cartesian3()),
  ],
  specularEnvironmentMaps:
    "/Specs/Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2",
});
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
const ssr = new C.SceneGISScreenSpaceReflections({
  scene,
  enabled: false,
  maximumDistance: 35,
  thickness: 0.15,
});
const ao = scene.postProcessStages.ambientOcclusion;
const baseline = Object.freeze({
  shadows: true,
  ao: false,
  ssr: false,
  antialiasing: "TAA",
  aoIntensity: 0.8,
  aoRadius: 0.7,
});
const trial = { ...baseline, ao: true, ssr: true };
const models = [];
const shaders = [];
let water;
let disposed = false;
let removeReady;
let manifest;

// glTF Y-up becomes local Z-up using Model's explicit forwardAxis=X option.
// The first pose is Intel's PhysCamera001, with the same axis conversion.
const views = {
  "中庭（作者视角）": {
    position: [-8.80743, 0.85825783, 1.59221947],
    direction: [0.96391072, -0.1819838, 0.19431372],
    up: [-0.19094054, 0.03604903, 0.98093933],
    yfov: 1.02122664,
  },
  上层与阴影: {
    position: [10.5311031, -1.52825129, 7.352985],
    direction: [-0.99188308, 0.12515381, 0.02246328],
    up: [0.02228658, -0.00281202, 0.99974773],
    yfov: 1.02323031,
  },
  拱廊接触: {
    position: [2.70301843, -2.11138153, 1.35489559],
    direction: [-0.93945209, 0.33160769, 0.08640775],
    up: [0.08148066, -0.02876108, 0.99625995],
    yfov: 0.6327615,
  },
  ...(composite
    ? {
        材质矩阵: {
          position: [4.5, -1.6, 1.65],
          target: [4.5, 0.6, 1.65],
          yfov: 1.35,
        },
        头盔与玻璃: {
          position: [-3.25, -1.8, 1.42],
          target: [-3.05, -0.45, 1.23],
          yfov: 0.95,
        },
        水池反射: {
          position: [-3.6, -1.9, 1.8],
          target: [0, 0.45, 0.5],
          yfov: 1.0,
        },
      }
    : {}),
};
const state = {
  ready: false,
  comparison: "实验 B",
  view: "中庭（作者视角）",
  animate: false,
  resetView() {
    const view = views[state.view];
    const direction = view.direction
      ? C.Cartesian3.fromArray(view.direction)
      : C.Cartesian3.normalize(
          C.Cartesian3.subtract(
            C.Cartesian3.fromArray(view.target),
            C.Cartesian3.fromArray(view.position),
            new C.Cartesian3(),
          ),
          new C.Cartesian3(),
        );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    const up = view.up
      ? C.Cartesian3.fromArray(view.up)
      : C.Cartesian3.cross(right, direction, new C.Cartesian3());
    viewer.camera.setView({
      destination: point(view.position),
      orientation: { direction: vector(direction), up: vector(up) },
    });
    // Cesium's fov is horizontal for a landscape viewport; preserve authored vertical FOV.
    const aspect = scene.drawingBufferWidth / scene.drawingBufferHeight;
    viewer.camera.frustum.fov =
      aspect > 1 ? 2 * Math.atan(Math.tan(view.yfov / 2) * aspect) : view.yfov;
    viewer.camera.frustum.near = 0.05;
    viewer.camera.frustum.far = 250;
    taa.reset();
  },
  apply() {
    const settings = state.comparison === "基线 A" ? baseline : trial;
    viewer.shadows = settings.shadows;
    ao.enabled = settings.ao;
    ao.uniforms.intensity = settings.aoIntensity;
    ao.uniforms.lengthCap = settings.aoRadius;
    ssr.enabled = settings.ssr;
    taa.enabled = settings.antialiasing === "TAA";
    scene.msaaSamples = settings.antialiasing === "4×MSAA" ? 4 : 1;
    scene.postProcessStages.fxaa.enabled = settings.antialiasing === "FXAA";
    document.getElementById("comparison").textContent =
      `${state.comparison} · 固定光照 / 曝光 1 · ${settings.antialiasing}`;
    scene.requestRender();
  },
  setAnimation() {
    viewer.clock.shouldAnimate = state.animate;
    if (!state.animate) {
      viewer.clock.currentTime = C.JulianDate.fromIso8601(
        "2026-06-21T19:00:00Z",
      );
    }
  },
  snapshot() {
    return {
      schema: "scenegis-pbr-reference-v1",
      asset: manifest?.id,
      khronosRevision: manifest?.khronos.revision,
      layout: composite ? "composite" : "sponza-main",
      textures: variant,
      world: planar ? "planar" : "globe",
      comparison: state.comparison,
      settings: { ...(state.comparison === "基线 A" ? baseline : trial) },
      lighting: {
        directionLocal: C.Cartesian3.pack(lightDirection, []),
        intensity: scene.light.intensity,
        exposure: scene.postProcessStages.exposure,
        specularEnvironment: ibl.specularEnvironmentMaps,
        diffuseSH: ibl.sphericalHarmonicCoefficients.map((v) =>
          C.Cartesian3.pack(v, []),
        ),
      },
      time: C.JulianDate.toIso8601(viewer.clock.currentTime),
      animate: state.animate,
      view: state.view,
      camera: {
        position: C.Cartesian3.pack(viewer.camera.positionWC, []),
        direction: C.Cartesian3.pack(viewer.camera.directionWC, []),
        up: C.Cartesian3.pack(viewer.camera.upWC, []),
        fov: viewer.camera.frustum.fov,
        near: viewer.camera.frustum.near,
        far: viewer.camera.frustum.far,
      },
      resolution: [scene.drawingBufferWidth, scene.drawingBufferHeight],
      unsupportedMaterials: manifest?.unsupported,
    };
  },
  exportConfig() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state.snapshot(), null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `pbr-reference-${composite ? "composite" : "main"}-${planar ? "planar" : "globe"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  },
};
const gui = new GUI({
  title: composite ? "PBR 综合验收" : "Sponza 主体基准",
  container: document.getElementById("controls"),
});
gui
  .add(state, "view", Object.keys(views))
  .name("固定视角")
  .onChange(state.resetView);
gui.add(state, "resetView").name("恢复固定视角");
const comparisonController = gui
  .add(state, "comparison", ["基线 A", "实验 B"])
  .name("对比状态");
const trialFolder = gui.addFolder("实验 B 参数");
comparisonController.onChange(() => {
  trialFolder.show(state.comparison === "实验 B");
  state.apply();
});
trialFolder.add(trial, "shadows").name("几何阴影").onChange(state.apply);
trialFolder.add(trial, "ao").name("环境光遮蔽").onChange(state.apply);
trialFolder
  .add(trial, "aoIntensity", 0, 2, 0.05)
  .name("遮蔽强度")
  .onChange(state.apply);
trialFolder
  .add(trial, "aoRadius", 0.1, 2, 0.1)
  .name("遮蔽半径（米）")
  .onChange(state.apply);
trialFolder.add(trial, "ssr").name("屏幕空间反射").onChange(state.apply);
trialFolder
  .add(trial, "antialiasing", ["无 AA", "FXAA", "TAA", "4×MSAA"])
  .name("抗锯齿")
  .onChange(state.apply);
if (composite) {
  gui
    .add(state, "animate")
    .name("播放水面（退出固定时刻）")
    .onChange(state.setAnimation);
}
gui.add(state, "exportConfig").name("导出验收配置");
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
exposeExample(
  viewer,
  gui,
  { state, baseline, trial, models, taa, ssr, ao, ibl },
  () => {
    disposed = true;
    input.destroy();
    panelButton.removeEventListener("click", togglePanels);
    removeError();
    removeReady?.();
    shaders.forEach((shader) => shader.destroy());
    ibl.destroy();
  },
);
state.resetView();
state.apply();

async function addModel(
  url,
  position = [0, 0, 0],
  scale = [1, 1, 1],
  customShader,
) {
  const matrix = C.Matrix4.multiplyByTranslation(
    frame,
    C.Cartesian3.fromArray(position),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(matrix, C.Cartesian3.fromArray(scale), matrix);
  const model = await C.Model.fromGltfAsync({
    url,
    modelMatrix: matrix,
    upAxis: C.Axis.Y,
    forwardAxis: C.Axis.X,
    imageBasedLighting: ibl,
    customShader,
    shadows: C.ShadowMode.ENABLED,
    incrementallyLoadTextures: false,
  });
  if (disposed) {
    model.destroy();
    return;
  }
  models.push(scene.primitives.add(model));
  return model;
}
async function box(position, scale, color) {
  const shader = new C.CustomShader({
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(${color.join(",")}); material.specular = vec3(0.04); material.roughness = 0.65; }`,
  });
  shaders.push(shader);
  return addModel(
    "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    position,
    scale,
    shader,
  );
}
async function loadScene() {
  const response = await fetch(`${local}prepared.json`);
  if (!response.ok) {
    throw new Error(
      "尚未准备本地数据：请按 pbr-data/README.md 运行 prepare-pbr-reference.mjs，然后刷新。",
    );
  }
  const prepared = await response.json();
  manifest = await (await fetch("./pbr-data/manifest.json")).json();
  if (prepared.id !== manifest.id) {
    throw new Error("本地数据与当前验收版本不一致，请重新运行资源准备脚本。");
  }
  if (disposed) {
    return;
  }
  await addModel(`${intel}main_sponza/NewSponza_Main_glTF_003.gltf`);
  if (disposed) {
    return;
  }
  if (composite) {
    await addModel(`${intel}pkg_a_curtains/NewSponza_Curtains_glTF.gltf`);
    if (disposed) {
      return;
    }
    await addModel(
      `${khronos}MetalRoughSpheres/glTF-Binary/MetalRoughSpheres.glb`,
      [4.5, 0.6, 1.72],
      [0.32, 0.32, 0.32],
    );
    if (disposed) {
      return;
    }
    await box([-3.0, -0.45, 0.42], [1.65, 1.0, 0.8], [0.2, 0.21, 0.23]);
    if (disposed) {
      return;
    }
    await addModel(
      `${khronos}FlightHelmet/glTF/FlightHelmet.gltf`,
      [-3.35, -0.45, 0.83],
      [1.25, 1.25, 1.25],
    );
    if (disposed) {
      return;
    }
    await addModel(
      `${khronos}GlassHurricaneCandleHolder/glTF-Binary/GlassHurricaneCandleHolder.glb`,
      [-2.7, -0.45, 0.83],
      [2.2, 2.2, 2.2],
    );
    if (disposed) {
      return;
    }
    await box([0.4, 0.6, 0.14], [3.8, 2.5, 0.24], [0.12, 0.21, 0.22]);
    for (const [position, scale] of [
      [
        [0.4, -0.69, 0.38],
        [4.1, 0.18, 0.68],
      ],
      [
        [0.4, 1.89, 0.38],
        [4.1, 0.18, 0.68],
      ],
      [
        [-1.56, 0.6, 0.38],
        [0.18, 2.4, 0.68],
      ],
      [
        [2.36, 0.6, 0.38],
        [0.18, 2.4, 0.68],
      ],
    ]) {
      if (disposed) {
        return;
      }
      await box(position, scale, [0.33, 0.34, 0.32]);
    }
    if (disposed) {
      return;
    }
    water = scene.primitives.add(
      new C.SceneGISWaterSurface({
        polygonHierarchy: new C.PolygonHierarchy(
          [
            [-1.45, -0.58, 0],
            [2.25, -0.58, 0],
            [2.25, 1.78, 0],
            [-1.45, 1.78, 0],
          ].map((v) => C.Cartesian3.fromArray(v)),
        ),
        modelMatrix: C.Matrix4.multiplyByTranslation(
          frame,
          new C.Cartesian3(0, 0, 0.59),
          new C.Matrix4(),
        ),
        waveAmplitude: 0.012,
        waveLength: 0.8,
        flowSpeed: 0.08,
        roughness: 0.08,
        foamWidth: 0.05,
        foamIntensity: 0.12,
      }),
    );
    window.example.water = water;
  }
  if (disposed) {
    return;
  }
  removeReady = scene.postRender.addEventListener(() => {
    if (
      models.every((model) => model.ready) &&
      ibl.useSpecularEnvironmentMaps
    ) {
      state.ready = true;
      document.getElementById("status").textContent = composite
        ? "本地资源就绪 · 约 635 万三角面"
        : "本地资源就绪 · 375 万三角面";
      removeReady();
      removeReady = undefined;
    }
  });
}
window.example.loading = loadScene().catch((error) => {
  if (!disposed) {
    document.getElementById("error").textContent = error.message;
  }
});

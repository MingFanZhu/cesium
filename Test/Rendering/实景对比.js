/* global window, document, URLSearchParams, Blob, URL */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const longitude = -75.596;
const latitude = 40.038;
const localToWorld = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(longitude, latitude, 0),
    );
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -2500,
            minimumY: -2500,
            maximumX: 2500,
            maximumY: 2500,
          },
          maximumLevel: 0,
          enableLighting: true,
          baseColor: C.Color.fromCssColorString("#73766c"),
        },
      }
    : { baseLayer: false }),
  shadows: true,
  terrainShadows: C.ShadowMode.RECEIVE_ONLY,
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
scene.highDynamicRange = true;
scene.fog.enabled = false;
scene.sunBloom = false;
scene.shadowMap.size = 2048;
scene.shadowMap.maximumDistance = 1600;
scene.shadowMap.softShadows = true;
scene.postProcessStages.exposure = 1;
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#73766c");
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
      originLongitude: C.Math.toRadians(longitude),
      originLatitude: C.Math.toRadians(latitude),
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
const ao = scene.postProcessStages.ambientOcclusion;
const ssr = new C.SceneGISScreenSpaceReflections({
  scene,
  enabled: false,
  maximumDistance: 500,
  thickness: 1,
});
const baseline = Object.freeze({
  shadows: true,
  ao: true,
  aoIntensity: 0.8,
  aoRadius: 2,
  ssr: false,
  originalTexture: false,
});
const trial = { ...baseline };
const models = [];
const shaders = [];
let tileset;
let disposed = false;
let removeReady;
let removeTileError;
const originalTextureShader = new C.CustomShader({
  lightingModel: C.LightingModel.UNLIT,
  fragmentShaderText:
    "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {}",
});
shaders.push(originalTextureShader);
function point(x, y, z) {
  return C.Matrix4.multiplyByPoint(
    localToWorld,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
}
function vector(v) {
  return C.Matrix4.multiplyByPointAsVector(localToWorld, v, new C.Cartesian3());
}
const views = {
  园区总览: { position: [470, -580, 360], target: [0, 10, 15] },
  建筑近景: { position: [120, -155, 78], target: [0, 0, 18] },
  背阴与接触: { position: [-160, 110, 60], target: [0, 0, 16] },
  "GLB 与反射": { position: [435, -195, 72], target: [350, -75, 8] },
};
const times = {
  午后: "2026-06-21T19:00:00Z",
  低角度阳光: "2026-06-21T23:00:00Z",
  夜间基线: "2026-06-22T04:00:00Z",
};
const state = {
  comparison: "基线 A",
  view: "园区总览",
  time: "午后",
  showGlb: true,
  ready: false,
  resetView() {
    const v = views[state.view];
    const direction = C.Cartesian3.normalize(
      C.Cartesian3.subtract(
        C.Cartesian3.fromArray(v.target),
        C.Cartesian3.fromArray(v.position),
        new C.Cartesian3(),
      ),
      new C.Cartesian3(),
    );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    viewer.camera.setView({
      destination: point(...v.position),
      orientation: {
        direction: vector(direction),
        up: vector(C.Cartesian3.cross(right, direction, new C.Cartesian3())),
      },
    });
    viewer.camera.frustum.near = 0.2;
    viewer.camera.frustum.far = 10000;
    scene.requestRender();
  },
  setTime() {
    viewer.clock.currentTime = C.JulianDate.fromIso8601(times[state.time]);
    viewer.clock.shouldAnimate = false;
    scene.requestRender();
  },
  apply() {
    const settings = state.comparison === "基线 A" ? baseline : trial;
    viewer.shadows = settings.shadows;
    ao.enabled = settings.ao;
    ao.uniforms.intensity = settings.aoIntensity;
    ao.uniforms.lengthCap = settings.aoRadius;
    ssr.enabled = settings.ssr;
    if (tileset) {
      tileset.customShader = settings.originalTexture
        ? originalTextureShader
        : undefined;
    }
    for (const model of models) {
      model.show = state.showGlb;
    }
    document.getElementById("comparison").textContent =
      `${state.comparison} · ${state.time} · ${settings.originalTexture ? "原始贴图" : "动态照明"}`;
    scene.requestRender();
  },
  snapshot() {
    return {
      schema: "scenegis-rendering-reference-v1",
      asset: "agi-hq-reference-v1",
      baseline: "R8-b4a27c7358",
      world: planar ? "planar" : "globe",
      comparison: state.comparison,
      settings: { ...(state.comparison === "基线 A" ? baseline : trial) },
      view: state.view,
      showGlb: state.showGlb,
      time: C.JulianDate.toIso8601(viewer.clock.currentTime),
      camera: {
        position: C.Cartesian3.pack(viewer.camera.positionWC, []),
        direction: C.Cartesian3.pack(viewer.camera.directionWC, []),
        up: C.Cartesian3.pack(viewer.camera.upWC, []),
        fov: viewer.camera.frustum.fov,
        near: viewer.camera.frustum.near,
        far: viewer.camera.frustum.far,
      },
      resolution: [scene.drawingBufferWidth, scene.drawingBufferHeight],
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
    link.download = `rendering-reference-${planar ? "planar" : "globe"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  },
};
const gui = new GUI({
  title: "实景对比",
  container: document.getElementById("controls"),
});
gui
  .add(state, "view", Object.keys(views))
  .name("固定视角")
  .onChange(state.resetView);
gui.add(state, "resetView").name("恢复固定视角");
gui
  .add(state, "time", Object.keys(times))
  .name("固定时间")
  .onChange(() => {
    state.setTime();
    state.apply();
  });
gui.add(state, "showGlb").name("显示 GLB 参照区").onChange(state.apply);
const comparisonController = gui
  .add(state, "comparison", ["基线 A", "实验 B"])
  .name("对比状态");
const trialFolder = gui.addFolder("实验 B 参数");
comparisonController.onChange(() => {
  if (state.comparison === "实验 B") {
    trialFolder.show();
  } else {
    trialFolder.hide();
  }
  state.apply();
});
state.restoreTrial = function () {
  Object.assign(trial, baseline);
  trialFolder.controllers.forEach((c) => c.updateDisplay());
  state.apply();
};
trialFolder.add(trial, "shadows").name("几何阴影").onChange(state.apply);
trialFolder.add(trial, "ao").name("环境光遮蔽").onChange(state.apply);
trialFolder
  .add(trial, "aoIntensity", 0, 2, 0.05)
  .name("遮蔽强度")
  .onChange(state.apply);
trialFolder
  .add(trial, "aoRadius", 0.2, 6, 0.1)
  .name("遮蔽半径（米）")
  .onChange(state.apply);
trialFolder.add(trial, "ssr").name("屏幕空间反射").onChange(state.apply);
trialFolder
  .add(trial, "originalTexture")
  .name("原始贴图（不重打光）")
  .onChange(state.apply);
trialFolder.add(state, "restoreTrial").name("恢复基线参数");
trialFolder.hide();
gui.add(state, "exportConfig").name("导出当前配置");
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
exposeExample(
  viewer,
  gui,
  { state, trial, baseline, effects, environment, models, ssr, ao },
  () => {
    disposed = true;
    removeError();
    removeReady?.();
    removeTileError?.();
    viewer.removeController(effects);
    if (environment) {
      viewer.removeController(environment);
    }
    for (const shader of shaders) {
      shader.destroy();
    }
  },
);
state.setTime();
state.resetView();
state.apply();
async function addModel(url, position, scale, shader) {
  const matrix = C.Matrix4.multiplyByTranslation(
    localToWorld,
    new C.Cartesian3(...position),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(matrix, new C.Cartesian3(...scale), matrix);
  const model = await C.Model.fromGltfAsync({
    url,
    modelMatrix: matrix,
    customShader: shader,
  });
  if (disposed) {
    model.destroy();
    return;
  }
  model.show = state.showGlb;
  models.push(scene.primitives.add(model));
}
try {
  tileset = await C.Cesium3DTileset.fromUrl("./data/tileset.json", {
    modelMatrix: localToWorld,
    maximumScreenSpaceError: 8,
    shadows: C.ShadowMode.ENABLED,
  });
  if (disposed) {
    tileset.destroy();
  } else {
    scene.primitives.add(tileset);
    window.example.tileset = tileset;
    removeTileError = tileset.tileFailed.addEventListener((error) => {
      document.getElementById("error").textContent = error.message;
    });
    state.apply();
    const mirror = new C.CustomShader({
      fragmentShaderText:
        "void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(0.04); material.specular = vec3(0.75); material.roughness = 0.12; }",
    });
    shaders.push(mirror);
    await addModel(
      "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
      [350, -80, 1],
      [80, 70, 2],
      mirror,
    );
    if (!disposed) {
      await addModel(
        "/Apps/SampleData/models/CesiumMilkTruck/CesiumMilkTruck.glb",
        [350, -80, 2],
        [2, 2, 2],
      );
    }
    if (!disposed) {
      removeReady = scene.postRender.addEventListener(() => {
        if (tileset.root.contentReady && models.every((model) => model.ready)) {
          state.ready = true;
          document.getElementById("status").textContent =
            "本地数据已载入 · 13.9 万三角面 · 无公网依赖";
          removeReady();
          removeReady = undefined;
        }
      });
    }
  }
} catch (error) {
  if (!disposed) {
    document.getElementById("error").textContent = error.message;
  }
}

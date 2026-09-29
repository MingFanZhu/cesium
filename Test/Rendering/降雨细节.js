/* global window, document, URLSearchParams */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

// Both detail pages share this local fixture; only their lens controls differ.
const snowExample = document.documentElement.dataset.weather === "snow";
const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -100,
            maximumX: 100,
            minimumY: -100,
            maximumY: 100,
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
scene.world.show = false;
scene.highDynamicRange = true;
scene.msaaSamples = 1;
scene.fog.enabled = false;
scene.postProcessStages.fxaa.enabled = true;
scene.backgroundColor = C.Color.fromCssColorString("#69818a");
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-09-29T00:00:00Z");
viewer.clock.shouldAnimate = true;
const frame = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(118.785, 32.045),
    );
const point = (p) =>
  C.Matrix4.multiplyByPoint(frame, new C.Cartesian3(...p), new C.Cartesian3());
const vector = (p) =>
  C.Matrix4.multiplyByPointAsVector(
    frame,
    new C.Cartesian3(...p),
    new C.Cartesian3(),
  );
scene.light = new C.DirectionalLight({
  direction: C.Cartesian3.normalize(
    vector([-0.25, -0.85, -0.45]),
    new C.Cartesian3(),
  ),
  intensity: 3,
});
const surfaceWeather = new C.SceneGISSurfaceWeather({
  scene,
  enabled: true,
  wetness: snowExample ? 0.35 : 1,
  snowCoverage: snowExample ? 0.5 : 0,
  rippleIntensity: snowExample ? 0 : 0.85,
});
const rainLens = snowExample
  ? undefined
  : scene.postProcessStages.add(
      new C.SceneGISRainLensStage({ scene, enabled: true, intensity: 0.6 }),
    );
const snowLens = snowExample
  ? scene.postProcessStages.add(
      new C.SceneGISSnowLensStage({ scene, enabled: true, intensity: 0.6 }),
    )
  : undefined;
const lens = snowLens ?? rainLens;
const reflections = new C.SceneGISScreenSpaceReflections({
  scene,
  enabled: true,
});
const ibl = new C.ImageBasedLighting({
  imageBasedLightingFactor: new C.Cartesian2(0.4, 1),
  specularEnvironmentMaps:
    "/Specs/Data/EnvironmentMap/kiara_6_afternoon_2k_ibl.ktx2",
});
const shaders = [];
const settings = {
  intensity: 0.85,
  ripples: !snowExample,
  lens: true,
  lensStrength: 0.7,
  animate: true,
  view: "近看地面",
  home() {
    const eye = settings.view === "鸟瞰淡出" ? [20, -30, 50] : [5, -8, 3.5];
    viewer.camera.setView({
      destination: point(eye),
      orientation: {
        direction: C.Cartesian3.normalize(
          vector([-eye[0], 1 - eye[1], -eye[2]]),
          new C.Cartesian3(),
        ),
        up: vector([0, 0, 1]),
      },
    });
  },
};
settings.home();
const gui = new GUI({
  title: `${snowExample ? "降雪" : "降雨"}细节 · ${planar ? "平面" : "球面"}`,
  container: document.getElementById("controls"),
});
function syncPrecipitation() {
  surfaceWeather.rippleIntensity = settings.ripples ? settings.intensity : 0;
  lens.intensity = settings.intensity * settings.lensStrength;
  lens.enabled = settings.lens && lens.intensity > 0;
}
gui
  .add(settings, "intensity", 0, 1, 0.01)
  .name(snowExample ? "降雪强度" : "降雨强度")
  .onChange(syncPrecipitation);
if (!snowExample) {
  gui.add(settings, "ripples").name("湿地涟漪").onChange(syncPrecipitation);
  gui.add(surfaceWeather, "rippleScale", 0.2, 2, 0.05).name("涟漪尺度（米）");
}
gui.add(surfaceWeather, "wetness", 0, 1, 0.01).name("湿润程度");
gui.add(surfaceWeather, "snowCoverage", 0, 1, 0.01).name("积雪覆盖");
gui.add(reflections, "enabled").name("模型 SSR");
gui
  .add(settings, "lens")
  .name(snowExample ? "镜头结霜" : "镜头雨滴")
  .onChange(syncPrecipitation);
gui
  .add(settings, "lensStrength", 0, 1, 0.01)
  .name(snowExample ? "结霜强度" : "镜头雨滴强度")
  .onChange(syncPrecipitation);
if (snowExample) {
  gui.add(snowLens, "coverage", 0, 1, 0.01).name("结霜范围");
} else {
  gui.add(rainLens, "dropletSize", 8, 80, 1).name("雨滴尺度（像素）");
  gui.add(rainLens, "distortion", 0, 30, 0.5).name("镜头折射（像素）");
}
gui
  .add(settings, "animate")
  .name("场景时间推进")
  .onChange((v) => {
    viewer.clock.shouldAnimate = v;
  });
gui
  .add(settings, "view", ["近看地面", "鸟瞰淡出"])
  .name("观察视角")
  .onChange(settings.home);
gui.add(settings, "home").name("还原视角");
syncPrecipitation();
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
exposeExample(
  viewer,
  gui,
  { surfaceWeather, rainLens, snowLens, reflections, settings },
  () => {
    removeError();
    scene.primitives.removeAll();
    shaders.forEach((s) => s.destroy());
    ibl.destroy();
  },
);

async function box(position, size, color, floor = false) {
  const customShader = new C.CustomShader({
    fragmentShaderText: `
    void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      material.diffuse = vec3(${color.join(",")});
      ${
        floor
          ? `vec2 uv = fsInput.attributes.texCoord_0 * vec2(14.0);
        vec2 line = smoothstep(vec2(0.025), vec2(0.055), min(fract(uv), 1.0 - fract(uv)));
        material.diffuse *= mix(0.7, 1.0, line.x * line.y);`
          : ""
      }
      material.specular = vec3(0.04); material.roughness = 0.8; material.clearcoatFactor = 0.0;
    }`,
  });
  shaders.push(customShader);
  const modelMatrix = C.Matrix4.multiplyByTranslation(
    frame,
    new C.Cartesian3(...position),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(
    modelMatrix,
    new C.Cartesian3(...size),
    modelMatrix,
  );
  const model = await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
    modelMatrix,
    customShader,
    imageBasedLighting: ibl,
  });
  if (viewer.isDestroyed()) {
    model.destroy();
    return;
  }
  scene.primitives.add(model);
}
try {
  await box([0, 0, -0.2], [28, 28, 0.4], [0.28, 0.3, 0.32], true);
  for (let i = 0; i < 7 && !viewer.isDestroyed(); i++) {
    await box(
      [i * 3 - 9, 7, 1.5 + (i % 3) * 0.7],
      [1.8, 1.8, 3 + (i % 3) * 1.4],
      [
        [0.5, 0.15, 0.08],
        [0.1, 0.25, 0.45],
        [0.5, 0.4, 0.12],
      ][i % 3],
    );
  }
  if (!viewer.isDestroyed()) {
    document.getElementById("status").textContent = "本地场景已加载";
  }
} catch (error) {
  if (!viewer.isDestroyed()) {
    document.getElementById("error").textContent = error.message;
  }
}

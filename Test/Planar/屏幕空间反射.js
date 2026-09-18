/* global window, document, URLSearchParams */
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

const ssr = new C.SceneGISScreenSpaceReflections({
  scene,
  enabled: true,
  maximumDistance: 100,
  thickness: 0.5,
});
const state = {
  roughness: 0.08,
  reset() {
    const direction = C.Cartesian3.normalize(
      new C.Cartesian3(-18, 39, -15),
      new C.Cartesian3(),
    );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    viewer.camera.setView({
      destination: C.Matrix4.multiplyByPoint(
        localToWorld,
        new C.Cartesian3(18, -33, 17),
        new C.Cartesian3(),
      ),
      orientation: {
        direction: C.Matrix4.multiplyByPointAsVector(
          localToWorld,
          direction,
          new C.Cartesian3(),
        ),
        up: C.Matrix4.multiplyByPointAsVector(
          localToWorld,
          C.Cartesian3.cross(right, direction, new C.Cartesian3()),
          new C.Cartesian3(),
        ),
      },
    });
  },
};
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T10:00:00Z");
state.reset();
const shaders = [];
const gui = new GUI({
  title: `${planar ? "平面" : "球面"}屏幕空间反射`,
  container: document.getElementById("controls"),
});
gui.add(ssr, "enabled").name("屏幕空间反射");
gui
  .add(state, "roughness", 0.02, 0.8, 0.01)
  .name("地板粗糙度")
  .onChange((value) => shaders[0]?.setUniform("u_roughness", value));
gui.add(ssr, "maximumDistance", 5, 150, 1).name("反射距离（米）");
gui.add(ssr, "thickness", 0.05, 2, 0.05).name("求交厚度（米）");
gui.add(ssr, "stepCount", 16, 256, 16).name("追踪步数");
gui.add(state, "reset").name("恢复视角");
exposeExample(viewer, gui, { effects, environment, models, state, ssr }, () => {
  viewer.removeController(effects);
  if (environment) {
    viewer.removeController(environment);
  }
  for (const shader of shaders) {
    shader.destroy();
  }
});
scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
async function box(position, scale, color, mirror) {
  const shader = new C.CustomShader({
    uniforms: {
      u_roughness: {
        type: C.UniformType.FLOAT,
        value: mirror ? state.roughness : 0.45,
      },
    },
    fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) { material.diffuse = vec3(${color.join(",")}); material.specular = vec3(${mirror ? "0.85" : "0.04"}); material.roughness = u_roughness; }`,
  });
  shaders.push(shader);
  const matrix = C.Matrix4.multiplyByTranslation(
    localToWorld,
    new C.Cartesian3(...position),
    new C.Matrix4(),
  );
  C.Matrix4.multiplyByScale(matrix, new C.Cartesian3(...scale), matrix);
  const model = await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    modelMatrix: matrix,
    customShader: shader,
  });
  if (viewer.isDestroyed()) {
    model.destroy();
    return;
  }
  models.push(scene.primitives.add(model));
}
try {
  await box([0, 1, 0.3], [36, 32, 0.5], [0.025, 0.03, 0.035], true);
  await box([-8, 7, 4], [4, 4, 7], [0.9, 0.055, 0.025], false);
  await box([0, 8, 3], [4, 5, 5], [0.02, 0.45, 0.75], false);
  await box([8, 7, 5], [4, 4, 9], [0.8, 0.55, 0.025], false);
  await box([-10, -4, 2], [3, 3, 3], [0.08, 0.55, 0.12], false);
} catch (error) {
  document.getElementById("error").textContent = error.message;
}

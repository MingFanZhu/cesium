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
  surfaceRadianceScale: 1,
  backgroundRadianceScale: 1,
});
viewer.addController(effects);
viewer.clock.shouldAnimate = true;
const origin = planar ? C.Cartesian3.ZERO : C.Cartesian3.fromDegrees(0, 35, 0);
const localToWorld = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(origin);
const models = [];

const ssr = new C.SceneGISScreenSpaceReflections({
  scene,
  enabled: false,
  maximumDistance: 100,
  thickness: 0.5,
});
const state = {
  roughness: 0.12,
  preset: "清水",
  waveMode: "FFT 风浪",
  show: true,
  reflections: true,
  refractionStrength: 0.2,
  foamIntensity: 0.35,
  foamWidth: 0.35,
  reset() {
    const direction = C.Cartesian3.normalize(
      new C.Cartesian3(-19, 38, -18),
      new C.Cartesian3(),
    );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    viewer.camera.setView({
      destination: C.Matrix4.multiplyByPoint(
        localToWorld,
        new C.Cartesian3(19, -30, 20),
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
const waves = new C.SceneGISWindWaves({
  resolution: 128,
  patchLength: 32,
  windSpeed: 5,
  fetchLength: 300,
  waterDepth: 2,
  amplitudeScale: 0.6,
  whitecapIntensity: 0.15,
});
const waters = [undefined, waves].map((windWaves) =>
  scene.primitives.add(
    new C.SceneGISWaterSurface({
      windWaves,
      meshSpacing: 0.5,
      polygonHierarchy: new C.PolygonHierarchy([
        new C.Cartesian3(-24, -21, 0),
        new C.Cartesian3(24, -21, 0),
        new C.Cartesian3(24, 21, 0),
        new C.Cartesian3(-24, 21, 0),
      ]),
      modelMatrix: C.Matrix4.multiplyByTranslation(
        localToWorld,
        new C.Cartesian3(0, 0, 2.5),
        new C.Matrix4(),
      ),
      id: windWaves ? "wind-water" : "normal-water",
      waveAmplitude: 0.06,
      roughness: 0.12,
      foamWidth: 0.35,
      foamIntensity: 0.35,
    }),
  ),
);
const water = waters[1];
const presets = {
  原有配色: { absorption: [0.45, 0.12, 0.06], scattering: undefined, g: 0 },
  清水: {
    absorption: [0.18, 0.055, 0.028],
    scattering: [0.012, 0.018, 0.016],
    g: 0.35,
  },
  湖水: {
    absorption: [0.35, 0.12, 0.075],
    scattering: [0.1, 0.16, 0.11],
    g: 0.45,
  },
  浑水: { absorption: [0.6, 0.8, 1.15], scattering: [1.2, 0.95, 0.6], g: 0.4 },
};
function applyPreset() {
  const preset = presets[state.preset];
  for (const surface of waters) {
    surface.absorption = new C.Cartesian3(...preset.absorption);
    surface.scattering = preset.scattering
      ? new C.Cartesian3(...preset.scattering)
      : undefined;
    surface.scatteringAnisotropy = preset.g;
  }
}
function applyControls() {
  waters.forEach((surface, i) => {
    surface.show = state.show && i === (state.waveMode === "FFT 风浪" ? 1 : 0);
    for (const key of [
      "roughness",
      "reflections",
      "refractionStrength",
      "foamIntensity",
      "foamWidth",
    ]) {
      surface[key] = state[key];
    }
  });
}
applyPreset();
applyControls();
const gui = new GUI({
  title: `${planar ? "平面" : "球面"}局部水面`,
  container: document.getElementById("controls"),
});
gui
  .add(state, "preset", Object.keys(presets))
  .name("水体预设")
  .onChange(applyPreset);
gui
  .add(state, "waveMode", ["法线波纹", "FFT 风浪"])
  .name("波浪模式")
  .onChange(applyControls);
gui.add(state, "show").name("显示水面").onChange(applyControls);
gui.add(state, "reflections").name("场景倒影").onChange(applyControls);
gui
  .add(state, "roughness", 0.02, 0.6, 0.01)
  .name("粗糙度")
  .onChange(applyControls);
gui
  .add(state, "refractionStrength", 0, 1, 0.01)
  .name("折射强度")
  .onChange(applyControls);
const normalControls = gui.addFolder("法线波纹参数").close();
normalControls
  .add(waters[0], "waveAmplitude", 0, 0.2, 0.005)
  .name("波纹幅度（米）");
normalControls.add(waters[0], "waveLength", 0.5, 8, 0.1).name("波长（米）");
normalControls
  .add(waters[0], "flowSpeed", 0, 2, 0.05)
  .name("相位速度（米／秒）");
const windControls = gui.addFolder("FFT 风浪参数").close();
windControls.add(waves, "windSpeed", 0, 12, 0.1).name("风速（米／秒）");
windControls.add(waves, "amplitudeScale", 0, 2, 0.05).name("浪幅比例");
windControls.add(waves, "whitecapIntensity", 0, 1, 0.05).name("浪尖白沫");
const foamControls = gui.addFolder("接触泡沫参数").close();
foamControls
  .add(state, "foamIntensity", 0, 1, 0.05)
  .name("浅岸泡沫")
  .onChange(applyControls);
foamControls
  .add(state, "foamWidth", 0, 1.5, 0.05)
  .name("泡沫水深（米）")
  .onChange(applyControls);

gui.add(viewer.clock, "shouldAnimate").name("时间动画");
gui.add(state, "reset").name("恢复视角");
exposeExample(
  viewer,
  gui,
  { effects, environment, models, state, ssr, water, waters, waves },
  () => {
    for (const surface of waters) {
      scene.primitives.remove(surface);
    }
    waves.destroy();
    viewer.removeController(effects);
    if (environment) {
      viewer.removeController(environment);
    }
    for (const shader of shaders) {
      shader.destroy();
    }
  },
);
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
  await box([0, 1, 0.2], [46, 41, 0.4], [0.3, 0.27, 0.17], false);
  await box([-9, 7, 4], [3, 3, 8], [0.85, 0.13, 0.055], false);
  await box([8, 9, 5], [4, 4, 10], [0.65, 0.56, 0.28], false);
  await box([0, 12, 2], [6, 4, 4], [0.12, 0.28, 0.11], false);
  await box([-13, -4, 1.4], [5, 5, 1.8], [0.48, 0.4, 0.25], false);
  await box([6, -4, 1], [4, 3, 1], [0.5, 0.47, 0.34], false);
  // The four banks cross the water plane continuously, without a separate shoreline mesh.
  const inner = [
    [-17, -10, 0.4],
    [17, -10, 0.4],
    [17, 11, 0.4],
    [-17, 11, 0.4],
  ];
  const outer = [
    [-24, -21, 3.5],
    [24, -21, 3.5],
    [24, 21, 3.5],
    [-24, 21, 3.5],
  ];
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    scene.primitives.add(
      new C.Primitive({
        geometryInstances: new C.GeometryInstance({
          geometry: new C.CoplanarPolygonGeometry({
            polygonHierarchy: new C.PolygonHierarchy(
              [outer[i], outer[next], inner[next], inner[i]].map(
                (p) => new C.Cartesian3(...p),
              ),
            ),
            vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: C.ColorGeometryInstanceAttribute.fromColor(
              new C.Color(0.47, 0.41, 0.26),
            ),
          },
        }),
        appearance: new C.PerInstanceColorAppearance({
          translucent: false,
          closed: false,
        }),
        modelMatrix: localToWorld,
        asynchronous: false,
      }),
    );
  }
} catch (error) {
  document.getElementById("error").textContent = error.message;
}

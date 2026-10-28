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
  transmissionColor: "#ffffff",
  colorDistance: 5,
  scatteringColor: "#ffffff",
  turbidity: 0.018,
  anisotropy: 0.35,
  show: true,
  reflections: true,
  refractionStrength: 0.2,
  foamIntensity: 0.35,
  foamWidth: 0.35,
  underwater: true,
  causticsIntensity: 1,
  dive() {
    underwaterView(false);
  },
  lookUp() {
    underwaterView(true);
  },
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
      underwaterDepth: 2.5,
      causticsIntensity: 1,
      bathymetry: createBathymetry(),
    }),
  ),
);
function createBathymetry() {
  const width = 256,
    height = 256;
  const depths = new Float32Array(width * height);
  // Sample the authored bank planes and boxes once, independently of the camera.
  const boxes = [
    [-9, 7, 3, 3, 8],
    [8, 9, 4, 4, 10],
    [0, 12, 6, 4, 4],
    [-13, -4, 5, 5, 2.3],
    [6, -4, 4, 3, 1.5],
  ];
  for (let y = 0; y < height; ++y) {
    for (let x = 0; x < width; ++x) {
      const px = -24 + (x / (width - 1)) * 48,
        py = -21 + (y / (height - 1)) * 42;
      let bed =
        0.4 +
        3.1 *
          Math.max(0, (Math.abs(px) - 17) / 7, (py - 11) / 10, (-10 - py) / 11);
      for (const [bx, by, sx, sy, top] of boxes) {
        if (Math.abs(px - bx) < sx / 2 && Math.abs(py - by) < sy / 2) {
          bed = Math.max(bed, top);
        }
      }
      depths[y * width + x] = 2.5 - bed;
    }
  }
  return {
    rectangle: new C.BoundingRectangle(-24, -21, 48, 42),
    width,
    height,
    depths,
  };
}
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
function srgbToLinear(value) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(value) {
  return value <= 0.0031308
    ? value * 12.92
    : 1.055 * value ** (1 / 2.4) - 0.055;
}
function cssToLinear(css) {
  const c = C.Color.fromCssColorString(css);
  return [c.red, c.green, c.blue].map(srgbToLinear);
}
function linearToCss(rgb) {
  return new C.Color(...rgb.map(linearToSrgb)).toCssHexString();
}
function applyColors() {
  const a = cssToLinear(state.transmissionColor).map(
    (v) => -Math.log(Math.max(v, 1e-4)) / state.colorDistance,
  );
  const s = cssToLinear(state.scatteringColor).map((v) => v * state.turbidity);
  for (const surface of waters) {
    surface.absorption = new C.Cartesian3(...a);
    surface.scattering = new C.Cartesian3(...s);
    surface.scatteringAnisotropy = state.anisotropy;
  }
}
function editColors() {
  state.preset = "自定义";
  applyColors();
}
function applyPreset() {
  const preset = presets[state.preset];
  if (!preset) {
    return;
  }
  state.colorDistance = 5;
  state.transmissionColor = linearToCss(
    preset.absorption.map((a) => Math.exp(-a * state.colorDistance)),
  );
  state.turbidity = preset.scattering ? Math.max(...preset.scattering) : 0;
  state.scatteringColor = linearToCss(
    preset.scattering
      ? preset.scattering.map((s) => s / state.turbidity)
      : [1, 1, 1],
  );
  state.anisotropy = preset.g;
  applyColors();
  if (!preset.scattering) {
    waters.forEach((surface) => {
      surface.scattering = undefined;
    });
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
      "causticsIntensity",
    ]) {
      surface[key] = state[key];
    }
    surface.underwaterDepth = state.underwater ? 2.5 : 0;
  });
}
function underwaterView(upward) {
  const direction = C.Cartesian3.normalize(
    new C.Cartesian3(0, upward ? 0.35 : 1, upward ? 1 : 0.05),
    new C.Cartesian3(),
  );
  const right = C.Cartesian3.normalize(
    C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  viewer.camera.setView({
    destination: C.Matrix4.multiplyByPoint(
      localToWorld,
      new C.Cartesian3(0, -7, 1.4),
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
}
applyPreset();
applyControls();
const gui = new GUI({
  title: `${planar ? "平面" : "球面"}局部水面`,
  container: document.getElementById("controls"),
});
gui
  .add(state, "preset", [...Object.keys(presets), "自定义"])
  .listen()
  .name("水体预设")
  .onChange(applyPreset);
const colorControls = gui.addFolder("水体颜色");
colorControls
  .addColor(state, "transmissionColor")
  .name("透射颜色")
  .listen()
  .onChange(editColors);
colorControls
  .add(state, "colorDistance", 0.2, 30, 0.1)
  .name("着色距离（米）")
  .listen()
  .onChange(editColors);
colorControls
  .addColor(state, "scatteringColor")
  .name("散射颜色")
  .listen()
  .onChange(editColors);
colorControls
  .add(state, "turbidity", 0, 3, 0.005)
  .name("浑浊度（每米）")
  .listen()
  .onChange(editColors);
colorControls
  .add(state, "anisotropy", -0.9, 0.9, 0.05)
  .name("散射方向性")
  .listen()
  .onChange(editColors);
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
windControls.add(waves, "foamHalfLife", 0, 10, 0.1).name("白沫半衰期（秒）");
const foamControls = gui.addFolder("接触泡沫参数").close();
foamControls
  .add(state, "foamIntensity", 0, 1, 0.05)
  .name("浅岸泡沫")
  .onChange(applyControls);
foamControls
  .add(state, "foamWidth", 0, 1.5, 0.05)
  .name("浅水／岸距（米）")
  .onChange(applyControls);

gui.add(viewer.clock, "shouldAnimate").name("时间动画");
const underwaterControls = gui.addFolder("水下效果");
underwaterControls
  .add(state, "underwater")
  .name("水下视效")
  .onChange(applyControls);
underwaterControls
  .add(state, "causticsIntensity", 0, 2, 0.05)
  .name("水底焦散")
  .onChange(applyControls);
underwaterControls.add(state, "dive").name("进入水下");
underwaterControls.add(state, "lookUp").name("水下仰视");
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

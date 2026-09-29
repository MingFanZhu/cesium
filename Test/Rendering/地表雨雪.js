/* global window, document, URLSearchParams */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -300,
            maximumX: 300,
            minimumY: -300,
            maximumY: 300,
          },
          maximumLevel: 0,
          enableLighting: true,
          baseColor: C.Color.fromCssColorString("#686958"),
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
scene.highDynamicRange = true;
scene.msaaSamples = 1;
scene.fog.enabled = false;
scene.postProcessStages.fxaa.enabled = true;
scene.backgroundColor = C.Color.fromCssColorString("#637b90");
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#686958");
  scene.globe.enableLighting = true;
  scene.globe.showGroundAtmosphere = false;
  scene.globe.lightingFadeOutDistance = 0;
  scene.globe.lightingFadeInDistance = 1;
}
const frame = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(118.785, 32.045),
    );
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const vector = (x, y, z) =>
  C.Matrix4.multiplyByPointAsVector(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
scene.light = new C.DirectionalLight({
  direction: C.Cartesian3.normalize(
    vector(-0.4, 0.8, -0.8),
    new C.Cartesian3(),
  ),
  intensity: 2,
});
const surfaceWeather = new C.SceneGISSurfaceWeather({
  scene,
  enabled: true,
  snowCoverage: 0.65,
  patchScale: 8,
});
const instances = [];
for (let i = 0; i < 3; ++i) {
  instances.push(
    new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(9, 10, 5 + i * 4),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      modelMatrix: C.Matrix4.multiplyByTranslation(
        frame,
        new C.Cartesian3(-15, i * 16 - 16, (5 + i * 4) / 2),
        new C.Matrix4(),
      ),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.fromCssColorString(["#a56743", "#687e91", "#888375"][i]),
        ),
      },
    }),
  );
}
scene.primitives.add(
  new C.Primitive({
    geometryInstances: instances,
    asynchronous: false,
    appearance: new C.PerInstanceColorAppearance({
      translucent: false,
      closed: true,
    }),
  }),
);
const shaders = [];
const settings = {
  preset: "薄雪",
  home() {
    viewer.camera.setView({
      destination: point(70, -90, 72),
      orientation: {
        direction: C.Cartesian3.normalize(
          vector(-70, 90, -65),
          new C.Cartesian3(),
        ),
        up: vector(0, 0, 1),
      },
    });
  },
};
settings.home();
const gui = new GUI({
  title: planar ? "地表雨雪 · 平面" : "地表雨雪 · 球面",
  container: document.getElementById("controls"),
});
gui.add(surfaceWeather, "enabled").name("显示地表覆盖");
gui
  .add(settings, "preset", ["干燥", "湿润", "薄雪", "积雪"])
  .name("地表预设")
  .onChange((value) => {
    surfaceWeather.wetness = value === "湿润" ? 1 : 0;
    surfaceWeather.snowCoverage =
      value === "薄雪" ? 0.65 : value === "积雪" ? 1 : 0;
  });
gui.add(surfaceWeather, "wetness", 0, 1, 0.01).name("湿润程度").listen();
gui.add(surfaceWeather, "snowCoverage", 0, 1, 0.01).name("积雪覆盖").listen();
gui.add(surfaceWeather, "patchScale", 1, 40, 1).name("斑块尺度（米）");
gui.add(settings, "home").name("还原视角");
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
exposeExample(viewer, gui, { surfaceWeather, settings }, () => {
  removeError();
  shaders.forEach((shader) => shader.destroy());
});
try {
  for (let i = 0; i < 3; ++i) {
    const shader = new C.CustomShader({
      fragmentShaderText: `void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
      material.diffuse = vec3(${["0.42, 0.22, 0.12", "0.2, 0.34, 0.45", "0.32, 0.3, 0.27"][i]});
      material.specular = vec3(0.04); material.roughness = 0.8; material.clearcoatFactor = 0.0;
    }`,
    });
    shaders.push(shader);
    const modelMatrix = C.Matrix4.multiplyByTranslation(
      frame,
      new C.Cartesian3(15, i * 16 - 16, (5 + i * 4) / 2),
      new C.Matrix4(),
    );
    C.Matrix4.multiplyByScale(
      modelMatrix,
      new C.Cartesian3(9, 10, 5 + i * 4),
      modelMatrix,
    );
    const model = await C.Model.fromGltfAsync({
      url: "/Specs/Data/Models/glTF-2.0/BoxClearcoat/glTF/BoxClearcoat.gltf",
      modelMatrix,
      customShader: shader,
    });
    if (viewer.isDestroyed()) {
      model.destroy();
      break;
    }
    scene.primitives.add(model);
  }
  if (!viewer.isDestroyed()) {
    document.getElementById("status").textContent = "本地场景已加载";
  }
} catch (error) {
  if (!viewer.isDestroyed()) {
    document.getElementById("error").textContent = error.message;
  }
}

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
const water = scene.primitives.add(
  new C.SceneGISWaterSurface({
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
    id: "local-water",
    waveAmplitude: 0.06,
    roughness: 0.12,
    foamWidth: 0.35,
    foamIntensity: 0.35,
  }),
);
const gui = new GUI({
  title: `${planar ? "平面" : "球面"}局部水面`,
  container: document.getElementById("controls"),
});
gui.add(water, "show").name("显示水面");
gui.add(water, "reflections").name("场景倒影");
gui.add(water, "waveAmplitude", 0, 0.2, 0.005).name("波纹幅度（米）");
gui.add(water, "waveLength", 0.5, 8, 0.1).name("波长（米）");
gui.add(water, "flowSpeed", 0, 2, 0.05).name("流速（米／秒）");
gui.add(water, "roughness", 0.02, 0.6, 0.01).name("粗糙度");
gui.add(water, "refractionStrength", 0, 1, 0.01).name("折射强度");
gui.add(water, "foamIntensity", 0, 1, 0.05).name("浅岸泡沫");
gui.add(water, "foamWidth", 0, 1.5, 0.05).name("泡沫水深（米）");

gui.add(viewer.clock, "shouldAnimate").name("时间动画");
gui.add(state, "reset").name("恢复视角");
exposeExample(
  viewer,
  gui,
  { effects, environment, models, state, ssr, water },
  () => {
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

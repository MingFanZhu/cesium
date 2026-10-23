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
            minimumX: -1000,
            minimumY: -1000,
            maximumX: 1000,
            maximumY: 1000,
          },
          maximumLevel: 0,
          baseColor: C.Color.fromCssColorString("#343f43"),
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
if (planar) {
  viewer.addController(
    new C.SceneGISPlanarEnvironment({
      world: viewer.planarWorld,
      showAtmosphere: false,
      showSun: false,
      showMoon: false,
      sunDirection: C.Cartesian3.UNIT_Z,
      moonDirection: C.Cartesian3.UNIT_Y,
      directionMode: "astronomical",
      originLongitude: 0,
      originLatitude: C.Math.toRadians(35),
    }),
  );
}
viewer.addController(
  new C.SceneGISEnvironmentEffects({
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
  }),
);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T10:00:00Z");
scene.highDynamicRange = true;
scene.fog.enabled = false;
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
if (scene.globe) {
  scene.globe.showGroundAtmosphere = false;
  scene.globe.baseColor = C.Color.fromCssColorString("#343f43");
}
const transform = planar
  ? C.Matrix4.fromTranslation(new C.Cartesian3(0, 0, 0.1))
  : C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(0, 35, 0.1));
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    transform,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const direction = (x, y, z) =>
  C.Matrix4.multiplyByPointAsVector(
    transform,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
scene.light = new C.DirectionalLight({
  direction: direction(-0.4, 0.5, -1),
  intensity: 2,
});
function box(x, y, z, sx, sy, sz, color) {
  return scene.primitives.add(
    new C.Primitive({
      geometryInstances: new C.GeometryInstance({
        geometry: C.BoxGeometry.fromDimensions({
          dimensions: new C.Cartesian3(sx, sy, sz),
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            C.Color.fromCssColorString(color),
          ),
        },
      }),
      appearance: new C.PerInstanceColorAppearance({ translucent: false }),
      modelMatrix: C.Matrix4.multiplyByTranslation(
        transform,
        new C.Cartesian3(x, y, z),
        new C.Matrix4(),
      ),
      asynchronous: false,
    }),
  );
}
box(0, 0, -0.12, 2.4, 2.4, 0.2, "#a8b4b7");
for (let x = 0; x < 12; x++) {
  for (let y = 0; y < 12; y++) {
    box(
      (x - 5.5) * 0.16,
      (y - 5.5) * 0.16,
      -0.01,
      0.156,
      0.156,
      0.025,
      (x + y) % 2 === 0 ? "#3e7f86" : "#5d9da1",
    );
  }
}
box(-1.07, 0, 0.1, 0.14, 2.28, 0.4, "#a8b4b7");
box(1.07, 0, 0.1, 0.14, 2.28, 0.4, "#a8b4b7");
box(0, -1.07, 0.1, 2, 0.14, 0.4, "#9ca9ad");
box(0, 1.07, 0.1, 2, 0.14, 0.4, "#a8b4b7");
box(0, 0, 0.14, 0.16, 0.16, 0.28, "#3c4a51");
box(0.45, 0.6, 0.4, 0.15, 0.15, 0.8, "#d88358");
const fluid = scene.primitives.add(
  new C.SceneGISFluidPrimitive({
    modelMatrix: transform,
    maximumParticles: 4096,
    initialParticles: 2700,
    initialDimensions: new C.Cartesian3(30, 30, 3),
    initialMinimum: new C.Cartesian3(-0.9425, -0.9425, 0.03),
    emitterPosition: new C.Cartesian3(0, 0, 0.3),
    emitterVelocity: new C.Cartesian3(0.2, 0, 4.8),
    emitterRadius: 0.07,
    emissionRate: 270,
    particleLifetime: 20,
    renderRadius: 0.07,
    roughness: 0.12,
  }),
);
viewer.clock.shouldAnimate = true;
const gui = new GUI({
  container: document.getElementById("controls"),
  title: "喷泉控制",
});
gui.add(fluid, "emitting").name("连续发射");
gui.add(fluid, "paused").name("暂停模拟");
gui.add(fluid, "show").name("显示液体");
gui.add(fluid, "emissionRate", 0, 1500, 10).name("每秒发射数");
gui.add(fluid.emitterVelocity, "z", 1, 6, 0.1).name("喷射速度");
gui.add(fluid, "roughness", 0.02, 0.5, 0.01).name("表面粗糙度");
gui.add(fluid, "reflections").name("场景反射");
gui.add(fluid, "reset").name("重置流体");
const controls = {
  resetView() {
    scene.camera.setView({
      destination: point(2.8, -3.7, 2.5),
      orientation: {
        direction: C.Cartesian3.normalize(
          direction(-2.8, 3.7, -1.8),
          new C.Cartesian3(),
        ),
        up: direction(0, 0, 1),
      },
    });
  },
};
gui.add(controls, "resetView").name("复位视角");
controls.resetView();
scene.camera.frustum.near = 0.05;
scene.camera.frustum.far = 200;
scene.debugShowFramesPerSecond = true;
document.getElementById("status").textContent =
  "4096 个流体槽位 · 2 次密度迭代 · 局部容器 2 × 2 米";
exposeExample(viewer, gui, { fluid });

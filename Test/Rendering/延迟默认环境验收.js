/* global window, document */
import * as C from "/Build/CesiumUnminified/index.js";
const byId = (id) => document.getElementById(id);
const mode =
  new window.URL(window.location.href).searchParams.get("world") ?? "globe";
byId("world").value = mode;
const planar = mode === "planar";
const world = planar
  ? new C.SceneGISPlanarWorld({
      coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
        extent: new C.SceneGISPlanarExtent({
          minimumX: -100000,
          minimumY: -100000,
          maximumX: 100000,
          maximumY: 100000,
        }),
      }),
      maximumLevel: 0,
      enableLighting: true,
      baseColor: new C.Color(0.24, 0.32, 0.22),
    })
  : undefined;
const viewer = new C.Viewer("map", {
  world,
  baseLayer: planar ? undefined : false,
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
scene.rethrowRenderErrors = true;
scene.shadowMap.maximumDistance = 40000;
if (scene.globe) {
  scene.globe.baseColor = new C.Color(0.24, 0.32, 0.22);
}
viewer.clock.shouldAnimate = false;
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-03-20T04:00:00Z");
const effects = scene.environmentEffects;
const origin = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(118, 32));
const position = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    origin,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const colors = [C.Color.ORANGE, C.Color.STEELBLUE, C.Color.LIGHTGRAY];
const customLight = new C.DirectionalLight({
  direction: new C.Cartesian3(0, 0, -1),
  intensity: 2,
});
function updateCustomLight() {
  const azimuth = C.Math.toRadians(Number(byId("lightAzimuth").value));
  const local = new C.Cartesian3(
    Math.sin(azimuth) * 0.75,
    Math.cos(azimuth) * 0.75,
    0.66,
  );
  C.Cartesian3.normalize(local, local);
  C.Cartesian3.negate(local, local);
  C.Matrix4.multiplyByPointAsVector(origin, local, customLight.direction);
  C.Color.fromCssColorString(byId("lightColor").value, customLight.color);
  customLight.intensity = Number(byId("lightIntensity").value);
  scene.requestRender();
}
updateCustomLight();
byId("primary").addEventListener("change", () => {
  scene.light =
    byId("primary").value === "custom" ? customLight : new C.SunLight();
  scene.requestRender();
});
for (const id of ["lightColor", "lightIntensity", "lightAzimuth"]) {
  byId(id).addEventListener("input", updateCustomLight);
}
byId("shadows").addEventListener("change", () => {
  const enabled = byId("shadows").checked;
  scene.shadowMap.enabled = enabled;
  if (scene.globe) {
    scene.globe.shadows = enabled
      ? C.ShadowMode.ENABLED
      : C.ShadowMode.DISABLED;
  }
  effects.showCloudShadows = enabled;
});
const model = scene.primitives.add(
  await C.Model.fromGltfAsync({
    url: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    modelMatrix: C.Matrix4.multiplyByTranslation(
      origin,
      new C.Cartesian3(0, -3500, 600),
      new C.Matrix4(),
    ),
    scale: 1200,
    shadows: C.ShadowMode.ENABLED,
    gltfCallback: (gltf) => {
      gltf.materials[0].pbrMetallicRoughness.baseColorFactor = [
        0.8, 0.8, 0.8, 1,
      ];
    },
  }),
);
for (let row = 0; row < 4; row++) {
  for (let col = 0; col < 3; col++) {
    const height = 500 + row * 220;
    scene.primitives.add(
      new C.Primitive({
        asynchronous: false,
        shadows: C.ShadowMode.ENABLED,
        geometryInstances: new C.GeometryInstance({
          geometry: C.BoxGeometry.fromDimensions({
            dimensions: new C.Cartesian3(1200, 1200, height),
            vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: C.Matrix4.multiplyByTranslation(
            origin,
            new C.Cartesian3((col - 1) * 3200, row * 6000, height / 2),
            new C.Matrix4(),
          ),
          attributes: {
            color: C.ColorGeometryInstanceAttribute.fromColor(colors[col]),
          },
        }),
        appearance: new C.PerInstanceColorAppearance({ translucent: false }),
      }),
    );
  }
}
scene.camera.lookAt(
  position(0, 9000, 500),
  new C.HeadingPitchRange(0, -0.1, 22000),
);
scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
if (planar) {
  scene.camera.setView({
    destination: position(0, -13000, 2700),
    orientation: {
      direction: C.Cartesian3.normalize(
        new C.Cartesian3(0, 22000, -2200),
        new C.Cartesian3(),
      ),
      up: C.Cartesian3.UNIT_Z,
    },
  });
}
for (const [id, property] of Object.entries({
  enabled: "enabled",
  atmosphere: "showAtmosphere",
  fog: "showHeightFog",
  aerial: "showAerialPerspective",
  clouds: "showClouds",
})) {
  byId(id).addEventListener("change", () => {
    effects[property] = byId(id).checked;
  });
}
byId("hdr").addEventListener("change", () => {
  scene.highDynamicRange = byId("hdr").checked;
});
byId("world").addEventListener("change", () => {
  window.location.href = `?world=${byId("world").value}`;
});
let errorMessage;
effects.errorEvent.addEventListener((...[, error]) => {
  errorMessage = error.message;
});
scene.postRender.addEventListener(() => {
  if (effects.ready) {
    errorMessage = undefined;
  }
  byId("status").textContent = !effects.enabled
    ? "高级环境已关闭"
    : (errorMessage ??
      (effects.ready
        ? effects.showClouds && !effects._pipeline.hasCloudResources()
          ? "正在加载云"
          : "环境就绪"
        : "正在加载环境"));
});
window.example = { viewer, scene, effects, mode, model, customLight };
window.addEventListener("pagehide", (event) => {
  if (!event.persisted && !viewer.isDestroyed()) {
    viewer.destroy();
  }
});

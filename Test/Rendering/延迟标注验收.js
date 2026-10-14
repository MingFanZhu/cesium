/* global window, document */
import * as C from "/Build/CesiumUnminified/index.js";
const byId = (id) => document.getElementById(id);
const viewer = new C.Viewer("map", {
  globe: false,
  skyBox: false,
  skyAtmosphere: false,
  baseLayer: false,
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
scene.highDynamicRange = true;
scene.fog.enabled = false;
scene.sun = scene.moon = undefined;
scene.backgroundColor = C.Color.fromCssColorString("#26384f");
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-03-20T14:00:00Z");
viewer.clock.shouldAnimate = false;
const point = (x, y, z) => new C.Cartesian3(7000000 + x, y, z);
function home() {
  scene.camera.setView({
    destination: point(0, -12, 24),
    orientation: {
      direction: C.Cartesian3.normalize(
        new C.Cartesian3(0, 12, -24),
        new C.Cartesian3(),
      ),
      up: C.Cartesian3.normalize(
        new C.Cartesian3(0, 24, 12),
        new C.Cartesian3(),
      ),
    },
  });
}
home();
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: true });
const errors = [];
scene.renderError.addEventListener((...args) => {
  const error = args[1];
  errors.push(error.message);
  byId("error").textContent = error.message;
});
function box(x, z, color, width = 4, height = 4) {
  return scene.primitives.add(
    new C.Primitive({
      asynchronous: false,
      geometryInstances: new C.GeometryInstance({
        geometry: C.BoxGeometry.fromDimensions({
          dimensions: new C.Cartesian3(width, height, 0.2),
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(color),
        },
      }),
      modelMatrix: C.Matrix4.fromTranslation(point(x, 0, z)),
      appearance: new C.PerInstanceColorAppearance({
        flat: true,
        translucent: color.alpha < 1,
        closed: true,
      }),
    }),
  );
}
box(-6, 0, C.Color.fromCssColorString("#af473f"));
box(0, 0, C.Color.fromCssColorString("#458958"));
box(6, 0, C.Color.fromCssColorString("#8a659c"));
const far = box(10, -100, C.Color.GRAY, 8, 8);
far.show = false;
const panel = box(0, 1, new C.Color(0.1, 0.6, 1, 0.7));
const water = scene.primitives.add(
  new C.SceneGISWaterSurface({
    polygonHierarchy: new C.PolygonHierarchy([
      new C.Cartesian3(-2, -2, 0),
      new C.Cartesian3(2, -2, 0),
      new C.Cartesian3(2, 2, 0),
      new C.Cartesian3(-2, 2, 0),
    ]),
    modelMatrix: C.Matrix4.fromTranslation(point(6, 0, 1)),
    waveAmplitude: 0,
    foamIntensity: 0,
    reflections: false,
    refractionStrength: 0,
    waterColor: new C.Color(0.05, 0.2, 0.45, 1),
  }),
);
const labels = new C.LabelCollection();
scene.primitives.add(labels);
for (const [x, text] of [
  [-6, "混色背景"],
  [0, "透明物遮挡"],
  [6, "水面遮挡"],
]) {
  labels.add({
    position: point(x, 0, 3),
    text,
    font: "22px sans-serif",
    fillColor: C.Color.WHITE,
    showBackground: true,
    backgroundColor: new C.Color(0.08, 0.12, 0.2, 0.5),
    backgroundPadding: new C.Cartesian2(16, 12),
    horizontalOrigin: C.HorizontalOrigin.CENTER,
    verticalOrigin: C.VerticalOrigin.CENTER,
    id: text,
  });
}
byId("background").onchange = () => {
  for (let i = 0; i < labels.length; ++i) {
    labels.get(i).showBackground = byId("background").checked;
  }
};
byId("alpha").oninput = () => {
  const a = Number(byId("alpha").value);
  byId("alphaValue").textContent = a.toFixed(2);
  for (let i = 0; i < labels.length; ++i) {
    labels.get(i).backgroundColor = new C.Color(0.08, 0.12, 0.2, a);
  }
};
byId("panel").onchange = () => {
  panel.modelMatrix = C.Matrix4.fromTranslation(
    point(0, 0, Number(byId("panel").value)),
  );
};
byId("water").onchange = () => {
  water.modelMatrix = C.Matrix4.fromTranslation(
    point(6, 0, Number(byId("water").value)),
  );
};
byId("multi").onchange = () => {
  const enabled = byId("multi").checked;
  scene.logarithmicDepthFarToNearRatio = enabled ? 2 : 1e9;
  far.show = enabled;
};
byId("taa").onchange = () => {
  taa.enabled = byId("taa").checked;
};
byId("ao").onchange = () => {
  scene.postProcessStages.ambientOcclusion.enabled = byId("ao").checked;
};
byId("home").onclick = home;
const input = new C.ScreenSpaceEventHandler(scene.canvas);
input.setInputAction((event) => {
  const picked = scene.pick(event.position);
  byId("pick").textContent = picked?.id ? `拾取：${picked.id}` : "未拾取标注";
}, C.ScreenSpaceEventType.LEFT_CLICK);
let disposed = false;
function destroy() {
  if (disposed) {
    return;
  }
  disposed = true;
  input.destroy();
  taa.destroy();
  viewer.destroy();
}
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) {
    destroy();
  }
});
window.example = { viewer, scene, labels, water, panel, taa, errors, destroy };

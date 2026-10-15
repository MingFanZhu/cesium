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
scene.sun = scene.moon = undefined;
scene.backgroundColor = C.Color.fromCssColorString("#14283f");
viewer.clock.shouldAnimate = false;
const origin = C.Cartesian3.fromRadians(-1.31968, 0.698874, 5);
const frame = C.Transforms.eastNorthUpToFixedFrame(origin);
const point = (x, y, z) =>
  C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const move = (destination, source) =>
  C.Matrix4.fromTranslation(
    C.Cartesian3.subtract(destination, source, new C.Cartesian3()),
  );
function home() {
  scene.camera.lookAt(point(-1, 0, 0), new C.HeadingPitchRange(0, -0.55, 30));
  scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
}
home();
scene.light = new C.DirectionalLight({
  direction: C.Cartesian3.normalize(
    C.Matrix4.multiplyByPointAsVector(
      frame,
      new C.Cartesian3(0.3, 0.6, -1),
      new C.Cartesian3(),
    ),
    new C.Cartesian3(),
  ),
  intensity: 1,
});
const date = C.JulianDate.fromIso8601("2018-07-19T15:18:00Z");
const dates = [
  date,
  C.JulianDate.addSeconds(date, 1, new C.JulianDate()),
  C.JulianDate.addSeconds(date, 2, new C.JulianDate()),
];
const clock = new C.Clock({ currentTime: date, shouldAnimate: false });
const dynamic = scene.primitives.add(
  new C.TimeDynamicPointCloud({
    clock,
    modelMatrix: move(
      point(4, 0, 0),
      new C.Cartesian3(
        1215012.8828876738,
        -4736313.051199594,
        4081605.22126042,
      ),
    ),
    intervals: C.TimeIntervalCollection.fromJulianDateArray({
      julianDates: dates,
      dataCallback: (interval) => ({
        uri: `/Specs/Data/Cesium3DTiles/PointCloud/PointCloudTimeDynamic/${C.JulianDate.equals(interval.start, dates[0]) ? 0 : 1}.pnts`,
      }),
    }),
    shading: {
      attenuation: true,
      eyeDomeLighting: true,
      eyeDomeLightingRadius: 2,
    },
  }),
);
const panel = scene.primitives.add(
  new C.Primitive({
    show: false,
    asynchronous: false,
    geometryInstances: new C.GeometryInstance({
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(2.6, 0.2, 4),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.CORNFLOWERBLUE,
        ),
      },
      id: "蓝色遮挡板",
    }),
    appearance: new C.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    }),
    modelMatrix: C.Matrix4.multiplyByTranslation(
      frame,
      new C.Cartesian3(-4, -2.6, 0),
      new C.Matrix4(),
    ),
  }),
);
const taa = new C.SceneGISTemporalAntialiasing({ scene, enabled: false });
const errors = [];
let tileset;
let disposed = false;
let frameIndex = 0;
function controls() {
  const alpha = Number(byId("alpha").value);
  for (const shading of [dynamic.shading, tileset?.pointCloudShading].filter(
    Boolean,
  )) {
    shading.attenuation = true;
    shading.eyeDomeLighting = byId("edl").checked;
    shading.eyeDomeLightingRadius = Number(byId("radius").value);
    shading.eyeDomeLightingStrength = Number(byId("strength").value);
    shading.normalShading = byId("normals").checked;
  }
  const style = new C.Cesium3DTileStyle({
    pointSize: 8,
    color: `color('white', ${alpha})`,
  });
  dynamic.style = style;
  if (tileset) {
    tileset.style = style;
  }
  panel.show = byId("occluder").checked;
  taa.enabled = byId("taa").checked;
  scene.logarithmicDepthFarToNearRatio = byId("frustums").checked ? 1.2 : 1e9;
}
document
  .querySelectorAll("input")
  .forEach((input) => input.addEventListener("input", controls));
byId("home").onclick = home;
byId("frame").onclick = () => {
  frameIndex = 1 - frameIndex;
  clock.currentTime = dates[frameIndex];
};
scene.renderError.addEventListener((...args) => {
  const error = args[1];
  errors.push(String(error));
  byId("error").textContent = String(error);
});
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction(({ position }) => {
  const picked = scene.pick(position);
  byId("picked").textContent =
    picked?.id ??
    (picked?.primitive === dynamic
      ? "动态点云"
      : picked
        ? "3D Tiles 点云"
        : "未选中物体");
}, C.ScreenSpaceEventType.LEFT_CLICK);
const stopStats = scene.postRender.addEventListener(() => {
  const d = scene._sceneGISDeferred;
  byId("stats").textContent =
    tileset?.tilesLoaded && dynamic.boundingSphere
      ? `材质 ${d.drawCount} · 点深度 ${d.pointEDLDrawCount} · 光照 ${d.lightDrawCount} · EDL ${(d.pointEDLByteLength / 1048576).toFixed(2)} MiB`
      : "加载本地点云…";
});
window.example = {
  viewer,
  dynamic,
  panel,
  errors,
  point,
  get tileset() {
    return tileset;
  },
  get deferred() {
    return scene._sceneGISDeferred;
  },
};
window.addEventListener("pagehide", (event) => {
  if (event.persisted || disposed) {
    return;
  }
  disposed = true;
  stopStats();
  handler.destroy();
  taa.destroy();
  viewer.destroy();
});
controls();
C.Cesium3DTileset.fromUrl(
  "/Specs/Data/Cesium3DTiles/PointCloud/PointCloudNormals/tileset.json",
  {
    modelMatrix: move(point(-4, 0, 0), origin),
  },
)
  .then((value) => {
    if (disposed) {
      value.destroy();
      return;
    }
    tileset = scene.primitives.add(value);
    controls();
  })
  .catch((error) => {
    errors.push(String(error));
    byId("error").textContent = String(error);
  });

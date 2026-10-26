/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const viewer = new C.Viewer("map", {
  baseLayer: false,
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
  terrainProvider: new C.EllipsoidTerrainProvider(),
});
const scene = viewer.scene;
scene.environmentEffects.enabled = false;
scene.globe.showGroundAtmosphere = false;
scene.skyAtmosphere.show = false;
scene.skyBox.show = false;
scene.sun.show = false;
scene.moon.show = false;
scene.fog.enabled = false;
scene.backgroundColor = C.Color.fromCssColorString("#20252b");
scene.globe.baseColor = C.Color.fromCssColorString("#39b85e");
scene.globe.depthTestAgainstTerrain = true;
scene.screenSpaceCameraController.enableCollisionDetection = false;
viewer.clock.shouldAnimate = false;

const origin = C.Cartesian3.fromDegrees(118.78, 32.04);
const frame = C.Transforms.eastNorthUpToFixedFrame(origin);
const corners = [
  [-40, -110],
  [40, -110],
  [40, 110],
  [-40, 110],
];
const point = (x, y, z = 0) =>
  C.Matrix4.multiplyByPoint(
    frame,
    new C.Cartesian3(x, y, z),
    new C.Cartesian3(),
  );
const controls = {
  mode: "polygon",
  skirts: true,
  quality: 1,
  error: 2,
  closeView,
  overview,
};

function clipping() {
  scene.globe.clippingPolygons = undefined;
  scene.globe.clippingPlanes = undefined;
  if (controls.mode === "polygon") {
    scene.globe.clippingPolygons = new C.ClippingPolygonCollection({
      polygons: [
        new C.ClippingPolygon({
          positions: corners.map(([x, y]) => point(x, y)),
        }),
      ],
      quality: controls.quality,
    });
  } else if (controls.mode === "planes") {
    scene.globe.clippingPlanes = new C.ClippingPlaneCollection({
      modelMatrix: frame,
      planes: [
        new C.ClippingPlane(new C.Cartesian3(1, 0, 0), -40),
        new C.ClippingPlane(new C.Cartesian3(-1, 0, 0), -40),
        new C.ClippingPlane(new C.Cartesian3(0, 1, 0), -110),
        new C.ClippingPlane(new C.Cartesian3(0, -1, 0), -110),
      ],
    });
  }
}
function mesh(positions, indices, color) {
  const geometry = new C.Geometry({
    attributes: {
      position: new C.GeometryAttribute({
        componentDatatype: C.ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: new Float64Array(positions.flat()),
      }),
    },
    indices: new Uint16Array(indices),
    primitiveType: C.PrimitiveType.TRIANGLES,
    boundingSphere: C.BoundingSphere.fromVertices(positions.flat()),
  });
  return scene.primitives.add(
    new C.Primitive({
      geometryInstances: new C.GeometryInstance({
        geometry,
        modelMatrix: frame,
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(color),
        },
      }),
      appearance: new C.PerInstanceColorAppearance({
        flat: true,
        translucent: false,
        closed: false,
      }),
      asynchronous: false,
    }),
  );
}
for (let i = 0; i < 4; i++) {
  const a = corners[i],
    b = corners[(i + 1) % 4];
  mesh(
    [
      [...a, 0],
      [...b, 0],
      [...b, -30],
      [...a, -30],
    ],
    [0, 1, 2, 0, 2, 3],
    C.Color.RED,
  );
}
mesh(
  corners.map((p) => [...p, -30]),
  [0, 1, 2, 0, 2, 3],
  C.Color.ROYALBLUE,
);
function look(position, target) {
  const destination = point(...position);
  const direction = C.Cartesian3.normalize(
    C.Cartesian3.subtract(point(...target), destination, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const vertical = C.Matrix4.multiplyByPointAsVector(
    frame,
    C.Cartesian3.UNIT_Z,
    new C.Cartesian3(),
  );
  const right = C.Cartesian3.normalize(
    C.Cartesian3.cross(direction, vertical, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const up = C.Cartesian3.normalize(
    C.Cartesian3.cross(right, direction, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  viewer.camera.setView({ destination, orientation: { direction, up } });
}
function closeView() {
  look([38, -5, 5], [40, 20, -2]);
}
function overview() {
  look([140, -260, 220], [0, 0, -10]);
}
clipping();
closeView();
const gui = new GUI({ container: document.getElementById("controls") });
gui
  .add(controls, "mode", {
    多边形: "polygon",
    裁剪平面对照: "planes",
    不裁剪: "none",
  })
  .name("裁剪方式")
  .onChange(clipping);
gui
  .add(controls, "skirts")
  .name("地形裙边")
  .onChange((v) => {
    scene.globe.showSkirts = v;
  });
gui.add(controls, "quality", [1, 2]).name("距离场质量").onChange(clipping);
gui
  .add(controls, "error", 0.5, 12, 0.5)
  .name("地形像素误差")
  .onChange((v) => {
    scene.globe.maximumScreenSpaceError = v;
  });
gui.add(controls, "closeView").name("复现近景");
gui.add(controls, "overview").name("俯视全貌");
const removeStatus = scene.postRender.addEventListener(() => {
  const levels = [
    ...new Set(scene.globe._surface._tilesToRender.map((t) => t.level)),
  ].sort((a, b) => a - b);
  document.getElementById("status").textContent =
    `${scene.globe.tilesLoaded ? "地形就绪" : "地形加载中"} · LOD ${levels.join(" / ")}`;
});
exposeExample(
  viewer,
  gui,
  { controls, frame, corners, clipping, look },
  removeStatus,
);

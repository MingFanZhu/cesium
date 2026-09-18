/* global document, window */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

async function main() {
  const parameters = new window.URLSearchParams(window.location.search);
  const kind = parameters.get("format") === "heightmap" ? "heightmap" : "mesh";
  const terrain = await C.SceneGISPlanarLayerTerrainProvider.fromUrl(
    `./data/terrain-layer/${kind}/`,
  );
  const world = new C.SceneGISPlanarWorld({
    tilingScheme: terrain.tilingScheme,
    maximumLevel: terrain.maximumLevel,
    enableLighting: true,
    baseColor: C.Color.fromCssColorString("#91b486"),
  });
  world.terrainProvider = terrain;
  const viewer = new C.Viewer("map", {
    world,
    skyBox: false,
    skyAtmosphere: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    projectionPicker: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false,
    fullscreenButton: false,
  });
  viewer.scene.backgroundColor = C.Color.fromCssColorString("#172a3b");
  viewer.scene.light = new C.DirectionalLight({
    direction: new C.Cartesian3(0.4, 0.2, -1),
  });
  viewer.camera.setView({
    destination: new C.Cartesian3(0, -210, 280),
    orientation: {
      direction: new C.Cartesian3(0, 0.6, -0.8),
      up: new C.Cartesian3(0, 0.8, 0.6),
    },
  });

  // The same public collection classes and property names are used on Globe.
  const clippingPlanes = new C.ClippingPlaneCollection({
    planes: [new C.ClippingPlane(C.Cartesian3.UNIT_X, 0)],
    edgeWidth: 2,
    edgeColor: C.Color.fromCssColorString("#ffca6b"),
  });
  const clippingPolygons = new C.ClippingPolygonCollection();
  world.clippingPlanes = clippingPlanes;
  world.clippingPolygons = clippingPolygons;
  const controls = {
    kind,
    planes: "single",
    offset: 0,
    angle: 0,
    tilt: 0,
    polygons: "off",
    overhead() {
      viewer.camera.setView({
        destination: new C.Cartesian3(0, 0, 320),
        orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
      });
    },
  };
  function updatePlanes() {
    clippingPlanes.enabled = controls.planes !== "off";
    clippingPlanes.unionClippingRegions = controls.planes === "union";
    if (controls.planes === "single" && clippingPlanes.length > 1) {
      clippingPlanes.remove(clippingPlanes.get(1));
    } else if (
      (controls.planes === "union" || controls.planes === "intersection") &&
      clippingPlanes.length === 1
    ) {
      clippingPlanes.add(new C.ClippingPlane(C.Cartesian3.UNIT_Y, 0));
    }
    const angle = C.Math.toRadians(controls.angle);
    const tilt = C.Math.toRadians(controls.tilt);
    clippingPlanes.get(0).normal = new C.Cartesian3(
      Math.cos(angle) * Math.cos(tilt),
      Math.sin(angle) * Math.cos(tilt),
      Math.sin(tilt),
    );
    clippingPlanes.get(0).distance = -controls.offset;
    viewer.scene.requestRender();
  }
  function updatePolygons() {
    clippingPolygons.removeAll();
    const rings = {
      rectangle: [
        [
          [-45, -45],
          [45, -45],
          [45, 45],
          [-45, 45],
        ],
      ],
      concave: [
        [
          [-70, -70],
          [70, -70],
          [70, -15],
          [-15, -15],
          [-15, 70],
          [-70, 70],
        ],
      ],
      multiple: [
        [
          [-70, -50],
          [-20, -50],
          [-20, 50],
          [-70, 50],
        ],
        [
          [20, -50],
          [70, -50],
          [70, 50],
          [20, 50],
        ],
      ],
    };
    for (const ring of rings[controls.polygons] ?? []) {
      clippingPolygons.add(
        new C.ClippingPolygon({
          positions: ring.map(([x, y]) => new C.Cartesian3(x, y, 0)),
        }),
      );
    }
    viewer.scene.requestRender();
  }
  const gui = new GUI({
    title: "地形剖切",
    container: document.getElementById("controls"),
  });
  gui
    .add(controls, "kind", { 三角网: "mesh", 高程图: "heightmap" })
    .name("地形数据")
    .onChange((value) => {
      window.location.search = `?format=${value}`;
    });
  gui
    .add(controls, "planes", {
      关闭: "off",
      单平面: "single",
      双平面交集: "intersection",
      双平面并集: "union",
    })
    .name("平面剖切")
    .onChange(updatePlanes);
  gui
    .add(controls, "offset", -100, 100, 1)
    .name("剖切位置（米）")
    .onChange(updatePlanes);
  gui.add(controls, "angle", 0, 360, 1).name("水平旋转").onChange(updatePlanes);
  gui.add(controls, "tilt", -90, 90, 1).name("倾斜角度").onChange(updatePlanes);
  gui.add(clippingPlanes, "edgeWidth", 0, 8, 0.5).name("边缘宽度");
  gui
    .add(controls, "polygons", {
      关闭: "off",
      矩形: "rectangle",
      凹多边形: "concave",
      多个区域: "multiple",
    })
    .name("多边形裁剪")
    .onChange(updatePolygons);
  gui.add(clippingPolygons, "inverse").name("反向裁剪");
  gui.add(world, "enableLighting").name("地形光照");
  gui.add(controls, "overhead").name("俯视");
  const handler = new C.ScreenSpaceEventHandler(viewer.canvas);
  handler.setInputAction((click) => {
    const point = world.pickTerrainFromWindowPosition(
      click.position,
      viewer.scene,
    );
    document.getElementById("picked").textContent = point
      ? `可见地形：X ${point.x.toFixed(2)}，Y ${point.y.toFixed(2)}，Z ${point.z.toFixed(2)} 米`
      : "当前位置没有可见地形。";
  }, C.ScreenSpaceEventType.LEFT_CLICK);
  const removeError = terrain.errorEvent.addEventListener((error) => {
    document.getElementById("error").textContent =
      `地形加载失败：${error.message}`;
  });
  document.getElementById("status").textContent =
    "地形已接入，可实时调整剖切范围。";
  exposeExample(
    viewer,
    gui,
    { world, terrain, clippingPlanes, clippingPolygons },
    () => {
      handler.destroy();
      removeError();
    },
  );
}
main().catch((error) => {
  document.getElementById("error").textContent = `初始化失败：${error.message}`;
});

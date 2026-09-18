/* global document, window */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

async function main() {
  const parameters = new window.URLSearchParams(window.location.search);
  const kind = parameters.get("format") === "mesh" ? "mesh" : "heightmap";
  const url = parameters.get("url") ?? `./data/terrain-layer/${kind}/`;
  const options = {};
  if (parameters.has("minimumHeight") && parameters.has("maximumHeight")) {
    options.minimumHeight = Number(parameters.get("minimumHeight"));
    options.maximumHeight = Number(parameters.get("maximumHeight"));
  }
  const terrain = await C.SceneGISPlanarLayerTerrainProvider.fromUrl(
    url,
    options,
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
  viewer.scene.debugShowFramesPerSecond = true;
  viewer.scene.light = new C.DirectionalLight({
    direction: new C.Cartesian3(0.4, 0.2, -1),
  });
  const extent = world.coordinateSystem.extent;
  const centerX = (extent.minimumX + extent.maximumX) * 0.5;
  const centerY = (extent.minimumY + extent.maximumY) * 0.5;
  viewer.camera.setView({
    destination: new C.Cartesian3(
      centerX,
      centerY - extent.width * 1.05,
      extent.width * 1.4,
    ),
    orientation: {
      direction: new C.Cartesian3(0, 0.6, -0.8),
      up: new C.Cartesian3(0, 0.8, 0.6),
    },
  });
  const removeError = terrain.errorEvent.addEventListener((error) => {
    document.getElementById("error").textContent =
      `地形加载失败：${error.message}`;
  });
  document.getElementById("status").textContent =
    `描述已读取：${terrain.format}，0–${terrain.maximumLevel} 级。`;
  const gui = new GUI({
    title: "地形服务",
    container: document.getElementById("controls"),
  });
  const controls = { kind };
  gui
    .add(controls, "kind", {
      "RGB24 高程图": "heightmap",
      "Quantized-mesh 三角网": "mesh",
    })
    .name("本地数据")
    .onChange((format) => {
      window.location.search = `?format=${format}`;
    });
  gui.add(world, "enableLighting").name("地形光照");
  exposeExample(viewer, gui, { world, terrain }, removeError);
}

main().catch((error) => {
  document.getElementById("error").textContent = `初始化失败：${error.message}`;
});

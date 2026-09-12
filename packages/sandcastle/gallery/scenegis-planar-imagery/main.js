import * as Cesium from "cesium";

const OPENSTREETMAP_TILE_ENDPOINT =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const WEB_MERCATOR_LIMIT = 20037508.342789244;

const extent = new Cesium.SceneGISPlanarExtent({
  minimumX: -WEB_MERCATOR_LIMIT,
  minimumY: -WEB_MERCATOR_LIMIT,
  maximumX: WEB_MERCATOR_LIMIT,
  maximumY: WEB_MERCATOR_LIMIT,
});
const coordinateSystem = new Cesium.SceneGISPlanarCoordinateSystem({
  extent,
  crs: "EPSG:3857",
});
const world = new Cesium.SceneGISPlanarWorld({
  coordinateSystem,
  maximumLevel: 19,
  baseColor: Cesium.Color.fromCssColorString("#263238"),
});
const widget = new Cesium.CesiumWidget("cesiumContainer", {
  world,
  skyBox: Cesium.SkyBox.createEarthSkyBox(),
});

widget.scene.screenSpaceCameraController.enableInputs = false;
const controller = new Cesium.SceneGISPlanarCameraController({ world });
widget.addController(controller);
controller.viewHome(widget.scene);

const openStreetMapCredit = new Cesium.Credit(
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
  true,
);
const imageryProvider = new Cesium.SceneGISPlanarUrlTemplateImageryProvider({
  url: OPENSTREETMAP_TILE_ENDPOINT,
  tilingScheme: world.tilingScheme,
  urlScheme: "xyz",
  tileWidth: 256,
  tileHeight: 256,
  maximumLevel: 19,
  credit: openStreetMapCredit,
});
const imageryLayer = world.imageryLayers.addImageryProvider(imageryProvider);
const status = document.getElementById("status");
imageryProvider.errorEvent.addEventListener(function (error) {
  status.textContent =
    "OpenStreetMap 服务暂时不可用；当前将继续显示平面底色或已就绪的祖先瓦片。";
  error.retry = false;
});

const defaults = {
  brightness: 1.0,
  contrast: 1.0,
  hue: 0.0,
  saturation: 1.0,
  gamma: 1.0,
  colorToAlphaThreshold: 0.004,
};

for (const property of Object.keys(defaults)) {
  const input = document.getElementById(property);
  input.addEventListener("input", function () {
    imageryLayer[property] = Number(input.value);
  });
}

function updateColorToAlpha() {
  const enabled = document.getElementById("colorToAlphaEnabled").checked;
  imageryLayer.colorToAlpha = enabled
    ? Cesium.Color.fromCssColorString(
        document.getElementById("colorToAlpha").value,
      )
    : undefined;
}

document
  .getElementById("colorToAlphaEnabled")
  .addEventListener("change", updateColorToAlpha);
document
  .getElementById("colorToAlpha")
  .addEventListener("input", updateColorToAlpha);
document.getElementById("resetFilters").addEventListener("click", function () {
  for (const [property, value] of Object.entries(defaults)) {
    document.getElementById(property).value = value;
    imageryLayer[property] = value;
  }
  document.getElementById("colorToAlphaEnabled").checked = false;
  document.getElementById("colorToAlpha").value = "#ffffff";
  imageryLayer.colorToAlpha = undefined;
});

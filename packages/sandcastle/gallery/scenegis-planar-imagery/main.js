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
world.imageryLayers.addImageryProvider(imageryProvider);

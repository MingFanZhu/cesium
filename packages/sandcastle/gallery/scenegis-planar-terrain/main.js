import * as Cesium from "cesium";

const OPENSTREETMAP_TILE_ENDPOINT =
  "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TERRAIN_TILE_ENDPOINT =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer/tile/{z}/{y}/{x}";
const WEB_MERCATOR_LIMIT = 20037508.342789244;

const world = new Cesium.SceneGISPlanarWorld({
  coordinateSystem: new Cesium.SceneGISPlanarCoordinateSystem({
    extent: new Cesium.SceneGISPlanarExtent({
      minimumX: -WEB_MERCATOR_LIMIT,
      minimumY: -WEB_MERCATOR_LIMIT,
      maximumX: WEB_MERCATOR_LIMIT,
      maximumY: WEB_MERCATOR_LIMIT,
    }),
    crs: "EPSG:3857",
  }),
  maximumLevel: 16,
  baseColor: Cesium.Color.fromCssColorString("#263238"),
  enableLighting: true,
});

const openStreetMapCredit = new Cesium.Credit(
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
  true,
);
world.imageryLayers.addImageryProvider(
  new Cesium.SceneGISPlanarUrlTemplateImageryProvider({
    url: OPENSTREETMAP_TILE_ENDPOINT,
    tilingScheme: world.tilingScheme,
    urlScheme: "xyz",
    tileWidth: 256,
    tileHeight: 256,
    maximumLevel: 16,
    credit: openStreetMapCredit,
  }),
);

const terrainCredit = new Cesium.Credit(
  '<a href="https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer" target="_blank">World Elevation services by Esri and listed contributors</a>',
  true,
);
const terrainProvider =
  new Cesium.SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
    url: TERRAIN_TILE_ENDPOINT,
    tilingScheme: world.tilingScheme,
    urlScheme: "xyz",
    heightmapWidth: 257,
    heightmapHeight: 257,
    format: "lerc",
    minimumHeight: -450.0,
    maximumHeight: 8700.0,
    maximumLevel: 16,
    credit: terrainCredit,
  });
world.terrainProvider = terrainProvider;

const terrainStatus = document.querySelector("#terrainStatus");
terrainProvider.errorEvent.addEventListener(function (error) {
  terrainStatus.textContent =
    "Terrain service unavailable; cached ancestors or the flat fallback remain usable.";
  error.retry = false;
});

const viewer = new Cesium.Viewer("cesiumContainer", {
  world,
  skyBox: Cesium.SkyBox.createEarthSkyBox(),
});
viewer.scene.light = new Cesium.DirectionalLight({
  direction: Cesium.Cartesian3.normalize(
    new Cesium.Cartesian3(-1.0, -0.5, -1.5),
    new Cesium.Cartesian3(),
  ),
});

const mountainTarget = new Cesium.Cartesian3(1113194.9, 5780349.2, 0.0);
const navigationMode = document.querySelector("#navigationMode");
const navigationStatus = document.querySelector("#navigationStatus");

function updateNavigationStatus() {
  const mode = viewer.planarCameraController.navigationMode;
  navigationMode.value = mode;
  navigationStatus.textContent =
    mode === "underground"
      ? "Navigation profile: underground; middle-drag vertical orbit crosses the terrain in both directions."
      : "Navigation profile: surface; local +Z clearance prevents terrain penetration.";
}

function setNavigationMode(mode) {
  viewer.planarCameraController.navigationMode = mode;
  updateNavigationStatus();
}

function viewMountains() {
  viewer.scene.camera.setView({
    destination: new Cesium.Cartesian3(
      mountainTarget.x,
      mountainTarget.y - 400000.0,
      300000.0,
    ),
    orientation: {
      direction: new Cesium.Cartesian3(0.0, 0.8, -0.6),
      up: new Cesium.Cartesian3(0.0, 0.6, 0.8),
    },
  });
}

function viewUnderground() {
  setNavigationMode("underground");

  const surfaceHeight = world.getTerrainHeight(mountainTarget) ?? 0.0;
  viewer.scene.camera.setView({
    destination: new Cesium.Cartesian3(
      mountainTarget.x,
      mountainTarget.y - 400000.0,
      surfaceHeight - 300000.0,
    ),
    orientation: {
      direction: new Cesium.Cartesian3(0.0, 0.8, 0.6),
      up: new Cesium.Cartesian3(0.0, -0.6, 0.8),
    },
  });
  viewer.scene.requestRender();
}

function testSurfaceClearance() {
  setNavigationMode("surface");
  const surfaceHeight = world.getTerrainHeight(mountainTarget) ?? 0.0;
  viewer.scene.camera.setView({
    destination: new Cesium.Cartesian3(
      mountainTarget.x,
      mountainTarget.y,
      surfaceHeight - 1000.0,
    ),
    orientation: {
      direction: new Cesium.Cartesian3(0.0, 0.8, -0.6),
      up: new Cesium.Cartesian3(0.0, 0.6, 0.8),
    },
  });
  navigationStatus.textContent =
    "Navigation profile: surface; local +Z clearance correction queued.";
  viewer.scene.requestRender();
}

document
  .querySelector("#lightingToggle")
  .addEventListener("change", (event) => {
    world.enableLighting = event.target.checked;
    viewer.scene.requestRender();
  });
document
  .querySelector("#mountainView")
  .addEventListener("click", viewMountains);
document
  .querySelector("#undergroundView")
  .addEventListener("click", viewUnderground);
document
  .querySelector("#surfaceClearance")
  .addEventListener("click", testSurfaceClearance);
navigationMode.addEventListener("change", (event) => {
  setNavigationMode(event.target.value);
});
document.querySelector("#homeView").addEventListener("click", () => {
  viewer.planarCameraController.viewHome(viewer.scene);
  updateNavigationStatus();
});
updateNavigationStatus();
viewMountains();

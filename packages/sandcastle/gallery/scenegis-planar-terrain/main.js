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

function createRamp(stops) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, canvas.width, 0);
  for (const [offset, color] of stops) {
    gradient.addColorStop(offset, color);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, 1);
  return canvas;
}

const defaultRamps = {
  height: [
    [0.0, "#263238"],
    [0.35, "#2e7d32"],
    [0.7, "#f9a825"],
    [1.0, "#ffffff"],
  ],
  slope: [
    [0.0, "#1b5e20"],
    [0.5, "#fdd835"],
    [1.0, "#b71c1c"],
  ],
  aspect: [
    [0.0, "#ef5350"],
    [0.25, "#ffee58"],
    [0.5, "#66bb6a"],
    [0.75, "#42a5f5"],
    [1.0, "#ef5350"],
  ],
};

const terrainMaterials = {
  contour: Cesium.Material.fromType(Cesium.Material.ElevationContourType, {
    spacing: 250.0,
    width: 1.5,
    color: Cesium.Color.YELLOW,
  }),
  height: Cesium.Material.fromType(Cesium.Material.ElevationRampType, {
    image: createRamp(defaultRamps.height),
    minimumHeight: -450.0,
    maximumHeight: 8700.0,
  }),
  slope: Cesium.Material.fromType(Cesium.Material.SlopeRampMaterialType, {
    image: createRamp(defaultRamps.slope),
  }),
  aspect: Cesium.Material.fromType(Cesium.Material.AspectRampMaterialType, {
    image: createRamp(defaultRamps.aspect),
  }),
};

const terrainStyle = document.querySelector("#terrainStyle");
const contourSpacing = document.querySelector("#contourSpacing");
const contourWidth = document.querySelector("#contourWidth");
const rampLowColor = document.querySelector("#rampLowColor");
const rampHighColor = document.querySelector("#rampHighColor");
function setTerrainStyle(value) {
  world.material = value === "none" ? undefined : terrainMaterials[value];
  terrainStyle.value = value;
  viewer.scene.requestRender();
}

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
terrainStyle.addEventListener("change", (event) => {
  setTerrainStyle(event.target.value);
});
contourSpacing.addEventListener("input", () => {
  terrainMaterials.contour.uniforms.spacing = Number(contourSpacing.value);
  setTerrainStyle("contour");
});
contourWidth.addEventListener("input", () => {
  terrainMaterials.contour.uniforms.width = Number(contourWidth.value);
  setTerrainStyle("contour");
});
function updateSelectedRamp() {
  const style = terrainStyle.value;
  if (style !== "height" && style !== "slope" && style !== "aspect") {
    return;
  }
  terrainMaterials[style].uniforms.image = createRamp([
    [0.0, rampLowColor.value],
    [1.0, rampHighColor.value],
  ]);
  viewer.scene.requestRender();
}
rampLowColor.addEventListener("input", updateSelectedRamp);
rampHighColor.addEventListener("input", updateSelectedRamp);
document.querySelector("#resetStyle").addEventListener("click", () => {
  terrainMaterials.contour.uniforms.spacing = 250.0;
  terrainMaterials.contour.uniforms.width = 1.5;
  terrainMaterials.contour.uniforms.color = Cesium.Color.clone(
    Cesium.Color.YELLOW,
  );
  for (const style of ["height", "slope", "aspect"]) {
    terrainMaterials[style].uniforms.image = createRamp(defaultRamps[style]);
  }
  contourSpacing.value = "250";
  contourWidth.value = "1.5";
  rampLowColor.value = "#263238";
  rampHighColor.value = "#ffffff";
  setTerrainStyle("none");
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

window.addEventListener("unload", () => {
  for (const material of Object.values(terrainMaterials)) {
    if (!material.isDestroyed()) {
      material.destroy();
    }
  }
});

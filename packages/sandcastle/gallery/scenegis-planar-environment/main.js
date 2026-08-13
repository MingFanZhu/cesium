import * as Cesium from "cesium";

function createTerrainImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(
    0,
    0,
    canvas.width,
    canvas.height,
  );
  gradient.addColorStop(0.0, "#1b5e20");
  gradient.addColorStop(0.5, "#78909c");
  gradient.addColorStop(1.0, "#eceff1");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,0.35)";
  context.lineWidth = 3;
  for (let i = -256; i < 512; i += 48) {
    context.beginPath();
    context.moveTo(i, 0);
    context.lineTo(i + 256, 256);
    context.stroke();
  }
  return canvas;
}

const world = new Cesium.SceneGISPlanarWorld({
  coordinateSystem: new Cesium.SceneGISPlanarCoordinateSystem({
    extent: new Cesium.SceneGISPlanarExtent({
      minimumX: -1000.0,
      minimumY: -1000.0,
      maximumX: 1000.0,
      maximumY: 1000.0,
    }),
    crs: "LOCAL_ENU_METERS",
  }),
  maximumLevel: 0,
  baseColor: Cesium.Color.fromCssColorString("#455a64"),
  enableLighting: true,
});

const terrainData = new Cesium.SceneGISPlanarHeightmapTerrainData({
  buffer: new Float32Array([0.0, 700.0, 150.0, 850.0]),
  width: 2,
  height: 2,
});
world.terrainProvider = {
  tilingScheme: world.tilingScheme,
  minimumHeight: 0.0,
  maximumHeight: 850.0,
  maximumLevel: 0,
  errorEvent: new Cesium.Event(),
  credit: new Cesium.Credit("SceneGIS 本地确定性地形", true),
  getLevelMaximumGeometricError: () => 1.0,
  requestTileGeometry: () => Promise.resolve(terrainData),
  getTileDataAvailable: () => undefined,
  loadTileDataAvailability: () => undefined,
};

world.imageryLayers.addImageryProvider({
  tilingScheme: world.tilingScheme,
  minimumLevel: 0,
  maximumLevel: 0,
  tileWidth: 256,
  tileHeight: 256,
  hasAlphaChannel: false,
  errorEvent: new Cesium.Event(),
  credit: new Cesium.Credit("SceneGIS 本地图案", true),
  requestImage: () => Promise.resolve(createTerrainImage()),
});

const viewer = new Cesium.Viewer("cesiumContainer", {
  world,
  skyBox: false,
  skyAtmosphere: false,
});
viewer.scene.camera.setView({
  destination: new Cesium.Cartesian3(0.0, -2200.0, 1800.0),
  orientation: {
    direction: Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(0.0, 1.0, -0.65),
      new Cesium.Cartesian3(),
    ),
    up: Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(0.0, 0.65, 1.0),
      new Cesium.Cartesian3(),
    ),
  },
});

const defaultState = {
  azimuth: 315.0,
  elevation: 35.0,
  intensity: 2.0,
};
const moonDirection = Cesium.Cartesian3.normalize(
  new Cesium.Cartesian3(-1.0, 1.0, 0.5),
  new Cesium.Cartesian3(),
);

function directionFromAngles(azimuthDegrees, elevationDegrees, result) {
  const azimuth = Cesium.Math.toRadians(azimuthDegrees);
  const elevation = Cesium.Math.toRadians(elevationDegrees);
  const horizontal = Math.cos(elevation);
  result.x = Math.sin(azimuth) * horizontal;
  result.y = Math.cos(azimuth) * horizontal;
  result.z = Math.sin(elevation);
  return result;
}

const sunDirection = directionFromAngles(
  defaultState.azimuth,
  defaultState.elevation,
  new Cesium.Cartesian3(),
);
const environment = new Cesium.SceneGISPlanarEnvironment({
  world,
  sunDirection,
  moonDirection,
  sunIntensity: defaultState.intensity,
});
viewer.addController(environment);

const sunAzimuth = document.querySelector("#sunAzimuth");
const sunElevation = document.querySelector("#sunElevation");
const sunIntensity = document.querySelector("#sunIntensity");
const lightingToggle = document.querySelector("#lightingToggle");
const environmentToggle = document.querySelector("#environmentToggle");
const directionStatus = document.querySelector("#directionStatus");

function updateDirection() {
  environment.sunDirection = directionFromAngles(
    Number(sunAzimuth.value),
    Number(sunElevation.value),
    sunDirection,
  );
  const direction = environment.sunDirection;
  directionStatus.textContent =
    `当前太阳方向：东 ${direction.x.toFixed(3)}，北 ${direction.y.toFixed(3)}，` +
    `上 ${direction.z.toFixed(3)}；光强 ${environment.sunIntensity.toFixed(1)}。`;
}

sunAzimuth.addEventListener("input", updateDirection);
sunElevation.addEventListener("input", updateDirection);
sunIntensity.addEventListener("input", () => {
  environment.sunIntensity = Number(sunIntensity.value);
  updateDirection();
});
lightingToggle.addEventListener("change", () => {
  world.enableLighting = lightingToggle.checked;
  viewer.scene.requestRender();
});
environmentToggle.addEventListener("change", () => {
  environment.enabled = environmentToggle.checked;
});
document.querySelector("#resetEnvironment").addEventListener("click", () => {
  sunAzimuth.value = String(defaultState.azimuth);
  sunElevation.value = String(defaultState.elevation);
  sunIntensity.value = String(defaultState.intensity);
  lightingToggle.checked = true;
  environmentToggle.checked = true;
  world.enableLighting = true;
  environment.sunIntensity = defaultState.intensity;
  environment.enabled = true;
  updateDirection();
  viewer.scene.requestRender();
});
updateDirection();

window.addEventListener("unload", () => {
  if (world.environment === environment) {
    viewer.removeController(environment);
  }
});

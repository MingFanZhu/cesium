/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import installMapTest from "./map-test.js";

const half = 20037508.342789244;
const viewer = new C.Viewer("map", {
  baseLayer: false,
  scene3DOnly: true,
  skyBox: false,
  skyAtmosphere: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  homeButton: false,
  infoBox: false,
  selectionIndicator: false,
  baseLayerPicker: false,
  geocoder: false,
  sceneModePicker: false,
  projectionPicker: false,
  navigationHelpButton: false,
  vrButton: false,
});
const scene = viewer.scene;
const world = viewer.scene.globe;
world.baseColor = C.Color.fromCssColorString("#f7f3ee");
world.showGroundAtmosphere = false;
scene.fog.enabled = false;
// Imagery alpha affects its contribution to the surface; Globe alpha affects
// the resulting terrain/imagery color. Neither changes vector opacity.
const testImagery = viewer.imageryLayers.addImageryProvider(
  new C.GridImageryProvider({
    color: C.Color.WHITE,
    backgroundColor: C.Color.fromCssColorString("#274c77"),
    glowColor: C.Color.TRANSPARENT,
  }),
);
testImagery.alpha = 0;
for (const name of ["surface", "imagery"]) {
  document
    .getElementById(`${name}-opacity`)
    .addEventListener("input", (event) => {
      const opacity = Number(event.target.value);
      document.getElementById(`${name}-opacity-value`).value =
        `${Math.round(opacity * 100)}%`;
      if (name === "surface") {
        world.translucency.enabled = opacity < 1;
        world.translucency.frontFaceAlpha = opacity;
        world.translucency.backFaceAlpha = 0;
      } else {
        testImagery.alpha = opacity;
      }
      scene.requestRender();
    });
}
// The vector source uses a single-root Mercator matrix, independently of Globe terrain.
const tilingScheme = new C.SceneGISPlanarTilingScheme({
  coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
    crs: "EPSG:3857",
    extent: new C.SceneGISPlanarExtent({
      minimumX: -half,
      minimumY: -half,
      maximumX: half,
      maximumY: half,
    }),
  }),
});
let terrainGeneration = 0;
let terrainLoading = false;
let terrainError;
let removeTerrainError;

async function setTerrain(enabled, local) {
  const current = ++terrainGeneration;
  removeTerrainError?.();
  removeTerrainError = undefined;
  terrainError = undefined;
  terrainLoading = enabled;
  try {
    const provider = !enabled
      ? new C.EllipsoidTerrainProvider()
      : local
        ? new C.CustomHeightmapTerrainProvider({
            width: 33,
            height: 33,
            callback: (x, y, level) => {
              const rectangle =
                new C.GeographicTilingScheme().tileXYToRectangle(x, y, level);
              const buffer = new Float32Array(33 * 33);
              for (let row = 0; row < 33; row++) {
                for (let column = 0; column < 33; column++) {
                  const longitude = C.Math.lerp(
                    rectangle.west,
                    rectangle.east,
                    column / 32,
                  );
                  const latitude = C.Math.lerp(
                    rectangle.north,
                    rectangle.south,
                    row / 32,
                  );
                  buffer[row * 33 + column] =
                    600 +
                    200 *
                      Math.sin(longitude * 2000) *
                      Math.cos(latitude * 2000);
                }
              }
              return buffer;
            },
          })
        : await C.ArcGISTiledElevationTerrainProvider.fromUrl(
            "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
          );
    if (current !== terrainGeneration || viewer.isDestroyed()) {
      return;
    }
    world.terrainProvider = provider;
    terrainLoading = false;
    world.enableLighting = enabled;
    if (enabled) {
      scene.light = new C.DirectionalLight({
        direction: C.Cartesian3.negate(
          C.Cartesian3.normalize(scene.camera.positionWC, new C.Cartesian3()),
          new C.Cartesian3(),
        ),
      });
      removeTerrainError = provider.errorEvent.addEventListener((error) => {
        error.retry = false;
        terrainError = `地形加载失败：${error.message}；可关闭地形恢复椭球。`;
      });
    }
    scene.requestRender();
  } catch (error) {
    if (current !== terrainGeneration || viewer.isDestroyed()) {
      return;
    }
    terrainLoading = false;
    terrainError = `地形连接失败：${error.message}；可关闭地形恢复椭球。`;
  }
}

installMapTest(viewer, {
  tilingScheme,
  setTerrain,
  setView({ longitude, latitude, referenceHeight, range, pitch, local }) {
    const terrain = !(
      world.terrainProvider instanceof C.EllipsoidTerrainProvider
    );
    const target = C.Cartesian3.fromDegrees(
      longitude,
      latitude,
      terrain ? (local ? 600 : referenceHeight) : 0,
    );
    scene.camera.lookAt(
      target,
      new C.HeadingPitchRange(
        0,
        -pitch,
        range * Math.cos((latitude * Math.PI) / 180),
      ),
    );
    scene.camera.lookAtTransform(C.Matrix4.IDENTITY);
  },
  get terrainStatus() {
    return (
      terrainError ??
      (terrainLoading
        ? "正在准备高程数据…"
        : !(world.terrainProvider instanceof C.EllipsoidTerrainProvider)
          ? world.tilesLoaded
            ? "真实地形已就绪 · 道路与面直接贴地"
            : "加载高程…已就绪地表持续绘制"
          : "原生椭球地表 · 本地模式使用构造地形，在线模式使用 Esri 高程")
    );
  },
  destroy() {
    terrainGeneration++;
    removeTerrainError?.();
  },
});

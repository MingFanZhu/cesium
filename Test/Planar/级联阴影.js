/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const world = new C.SceneGISPlanarWorld({
  coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
    extent: new C.SceneGISPlanarExtent({
      minimumX: -512,
      minimumY: -512,
      maximumX: 512,
      maximumY: 512,
    }),
  }),
  maximumLevel: 0,
  enableLighting: true,
  baseColor: C.Color.fromCssColorString("#b7c2a9"),
});
function height(x, y) {
  return 38 * Math.exp(-((x - 120) ** 2 / 5000 + (y - 50) ** 2 / 18000));
}
world.terrainProvider = {
  tilingScheme: world.tilingScheme,
  minimumHeight: 0,
  maximumHeight: 38,
  maximumLevel: 0,
  errorEvent: new C.Event(),
  getLevelMaximumGeometricError: () => 8,
  getTileDataAvailable: () => true,
  loadTileDataAvailability: () => undefined,
  requestTileGeometry: () => {
    const size = 129;
    const buffer = new Float32Array(size * size);
    for (let y = 0; y < size; ++y) {
      for (let x = 0; x < size; ++x) {
        buffer[y * size + x] = height(-512 + x * 8, 512 - y * 8);
      }
    }
    return Promise.resolve(
      new C.SceneGISPlanarHeightmapTerrainData({
        buffer,
        width: size,
        height: size,
      }),
    );
  },
};
const viewer = new C.Viewer("map", {
  world,
  shadows: true,
  terrainShadows: C.ShadowMode.ENABLED,
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
const scene = viewer.scene;
scene.backgroundColor = C.Color.fromCssColorString("#27394a");
scene.light = new C.DirectionalLight({
  direction: new C.Cartesian3(0.7, 0.3, -1),
});
scene.shadowMap.maximumDistance = 1000;
scene.shadowMap.size = 2048;
scene.shadowMap.softShadows = true;
scene.shadowMap.darkness = 0.35;
scene.debugShowFramesPerSecond = true;
const buildings = [];
for (let row = 0; row < 3; ++row) {
  for (let column = 0; column < 4; ++column) {
    const x = -110 + column * 44;
    const y = -70 + row * 70;
    const h = 18 + ((row * 3 + column * 7) % 5) * 9;
    buildings.push(
      viewer.entities.add({
        name: `建筑 ${row + 1}-${column + 1}`,
        position: new C.Cartesian3(x, y, height(x, y) + h / 2),
        box: {
          dimensions: new C.Cartesian3(24, 30, h),
          material: C.Color.fromCssColorString("#d5d1c8"),
          shadows: C.ShadowMode.ENABLED,
        },
      }),
    );
  }
}
viewer.entities.add({
  name: "本地 glTF 模型",
  position: new C.Cartesian3(-10, -140, 10),
  model: {
    uri: "/Specs/Data/Models/glTF-2.0/Box/glTF/Box.gltf",
    scale: 20,
    shadows: C.ShadowMode.ENABLED,
  },
});
const controls = {
  sunHeight: 48,
  sunAzimuth: 65,
  buildingShadows: true,
  clipping: false,
  view: "透视",
  terrainShadows: C.ShadowMode.ENABLED,
  home() {
    viewer.camera.setView({
      destination: new C.Cartesian3(230, -330, 250),
      orientation: {
        direction: new C.Cartesian3(-0.45, 0.72, -0.53),
        up: C.Cartesian3.UNIT_Z,
      },
    });
  },
  near() {
    viewer.camera.setView({
      destination: new C.Cartesian3(-70, -155, 55),
      orientation: {
        direction: new C.Cartesian3(0.3, 0.88, -0.37),
        up: C.Cartesian3.UNIT_Z,
      },
    });
  },
};
function updateSun() {
  const elevation = C.Math.toRadians(controls.sunHeight);
  const azimuth = C.Math.toRadians(controls.sunAzimuth);
  scene.light.direction = new C.Cartesian3(
    Math.cos(elevation) * Math.sin(azimuth),
    Math.cos(elevation) * Math.cos(azimuth),
    -Math.sin(elevation),
  );
}
updateSun();
controls.home();
const gui = new GUI({
  title: "平面级联阴影",
  container: document.getElementById("controls"),
});
gui.add(viewer, "shadows").name("开启阴影");
gui.add(scene.shadowMap, "softShadows").name("软阴影");
gui
  .add(scene.shadowMap, "maximumDistance", 200, 3000, 50)
  .name("阴影距离（米）");
gui
  .add(scene.shadowMap, "size", { 512: 512, 1024: 1024, 2048: 2048 })
  .name("每级分辨率");
gui.add(scene.shadowMap, "darkness", 0, 0.8, 0.01).name("阴影最低亮度");
gui.add(scene.shadowMap, "debugCascadeColors").name("显示级联分区");
gui
  .add(controls, "sunHeight", -10, 90, 1)
  .name("光源高度角")
  .onChange(updateSun);
gui
  .add(controls, "sunAzimuth", 0, 360, 1)
  .name("光源方位角")
  .onChange(updateSun);
gui
  .add(controls, "buildingShadows")
  .name("建筑投射与接收")
  .onChange((enabled) => {
    for (const entity of buildings) {
      entity.box.shadows = enabled
        ? C.ShadowMode.ENABLED
        : C.ShadowMode.DISABLED;
    }
  });
gui
  .add(controls, "terrainShadows", {
    关闭: 0,
    投射并接收: 1,
    仅投射: 2,
    仅接收: 3,
  })
  .name("地形阴影")
  .onChange((mode) => {
    viewer.terrainShadows = Number(mode);
  });
gui
  .add(controls, "clipping")
  .name("裁去右侧山体")
  .onChange((enabled) => {
    world.clippingPlanes = enabled
      ? new C.ClippingPlaneCollection({
          planes: [new C.ClippingPlane(new C.Cartesian3(-1, 0, 0), 60)],
        })
      : undefined;
  });
gui
  .add(controls, "view", ["透视", "正交"])
  .name("相机投影")
  .onChange((mode) => {
    const aspectRatio = scene.canvas.clientWidth / scene.canvas.clientHeight;
    viewer.camera.frustum =
      mode === "正交"
        ? new C.OrthographicFrustum({
            width: 560,
            aspectRatio,
            near: 1,
            far: 10000,
          })
        : new C.PerspectiveFrustum({
            fov: Math.PI / 3,
            aspectRatio,
            near: 1,
            far: 10000,
          });
  });
gui.add(controls, "home").name("全景视角");
gui.add(controls, "near").name("近景视角");
const removeRenderError = scene.renderError.addEventListener((...args) => {
  const error = args[1];
  document.getElementById("error").textContent = error.message;
});
const removePostRender = scene.postRender.addEventListener(() => {
  document.getElementById("status").textContent = world.tilesLoaded
    ? "本地地形已就绪 · 四级级联阴影"
    : "正在加载本地地形…";
});
exposeExample(viewer, gui, { world, controls }, () => {
  removeRenderError();
  removePostRender();
});

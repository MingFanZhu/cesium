/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const world = new C.SceneGISPlanarWorld({
  coordinateSystem: new C.SceneGISPlanarCoordinateSystem({
    extent: new C.SceneGISPlanarExtent({
      minimumX: -150,
      minimumY: -150,
      maximumX: 150,
      maximumY: 150,
    }),
  }),
  maximumLevel: 0,
  enableLighting: true,
  baseColor: C.Color.fromCssColorString("#b7bdc4"),
});
const viewer = new C.Viewer("map", {
  world,
  shadows: true,
  terrainShadows: C.ShadowMode.RECEIVE_ONLY,
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
scene.backgroundColor = C.Color.fromCssColorString("#283342");
scene.light = new C.DirectionalLight({
  direction: new C.Cartesian3(0.6, 0.4, -1),
  intensity: 0.8,
});
scene.shadowMap.maximumDistance = 350;
scene.shadowMap.size = 2048;
scene.shadowMap.softShadows = true;
scene.shadowMap.darkness = 0.45;
function box(x, y, z, width, depth, height, color = "#dedbd5") {
  return viewer.entities.add({
    position: new C.Cartesian3(x, y, z + height / 2),
    box: {
      dimensions: new C.Cartesian3(width, depth, height),
      material: C.Color.fromCssColorString(color),
      shadows: C.ShadowMode.ENABLED,
    },
  });
}
box(0, 18, 0, 55, 3, 20);
box(-26, 0, 0, 3, 36, 20);
for (let i = 0; i < 5; ++i) {
  box(-10, -8 + i * 4, 0, 18, 4, 2 + i * 2);
}
box(14, 3, 0, 8, 8, 13, "#c99a78");
box(26, -10, 0, 7, 7, 7, "#8195aa");
box(27, -9, 7, 5, 5, 5, "#b6c2cf");
box(9, -21, 2, 9, 6, 2, "#d3b99b");
const ao = scene.postProcessStages.ambientOcclusion;
ao.enabled = true;
ao.uniforms.lengthCap = 6;
ao.uniforms.intensity = 1.5;
const controls = {
  view: "透视",
  home() {
    viewer.camera.setView({
      destination: new C.Cartesian3(65, -85, 65),
      orientation: {
        direction: new C.Cartesian3(-65, 90, -55),
        up: C.Cartesian3.UNIT_Z,
      },
    });
  },
};
controls.home();
const gui = new GUI({
  title: "高质量环境光遮蔽",
  container: document.getElementById("controls"),
});
gui.add(ao, "enabled").name("开启 AO");
gui.add(ao.uniforms, "ambientOcclusionOnly").name("仅遮蔽");
gui.add(ao.uniforms, "lengthCap", 0.2, 15, 0.1).name("遮蔽半径（米）");
gui.add(ao.uniforms, "intensity", 0, 3, 0.05).name("遮蔽强度");
gui.add(ao.uniforms, "bias", 0, 0.2, 0.005).name("表面偏移");
gui.add(ao.uniforms, "directionCount", { 4: 4, 8: 8, 12: 12 }).name("采样方向");
gui.add(ao.uniforms, "stepCount", { 4: 4, 8: 8, 12: 12 }).name("每向采样");
gui.add(viewer, "shadows").name("级联阴影");
gui.add(world, "enableLighting").name("地面光照");
gui
  .add(controls, "view", ["透视", "正交"])
  .name("相机投影")
  .onChange((mode) => {
    const aspectRatio = scene.canvas.clientWidth / scene.canvas.clientHeight;
    viewer.camera.frustum =
      mode === "正交"
        ? new C.OrthographicFrustum({
            width: 140,
            aspectRatio,
            near: 0.1,
            far: 3000,
          })
        : new C.PerspectiveFrustum({
            fov: Math.PI / 3,
            aspectRatio,
            near: 0.1,
            far: 3000,
          });
  });
gui.add(controls, "home").name("恢复视角");
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
exposeExample(viewer, gui, { world, controls, ao }, removeError);

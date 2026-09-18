/* global document */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const viewer = new C.Viewer("map", {
  planarWorld: {
    crs: "LOCAL",
    extent: {
      minimumX: -10000,
      minimumY: -10000,
      maximumX: 10000,
      maximumY: 10000,
    },
    maximumLevel: 0,
    baseColor: C.Color.fromCssColorString("#d9e6d3"),
  },
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
const world = viewer.planarWorld;
viewer.scene.debugShowFramesPerSecond = true;
viewer.camera.setView({
  destination: new C.Cartesian3(0, -12000, 9000),
  orientation: {
    direction: new C.Cartesian3(0, 0.8, -0.6),
    up: new C.Cartesian3(0, 0.6, 0.8),
  },
});
world.imageryLayers.addImageryProvider(
  new C.SceneGISPlanarUrlTemplateImageryProvider({
    url: "/Test/Planar/data/grid.png",
    tilingScheme: world.tilingScheme,
    maximumLevel: 0,
  }),
);
const center = new C.Cartesian3(0, 0, 0);
const bounds = new C.BoundingSphere(center, 6000);
const pose = { x: 0, y: -12000, z: 9000, heading: 25, pitch: -40, roll: 10 };
function viewOptions() {
  return {
    destination: new C.Cartesian3(pose.x, pose.y, pose.z),
    orientation: {
      heading: C.Math.toRadians(pose.heading),
      pitch: C.Math.toRadians(pose.pitch),
      roll: C.Math.toRadians(pose.roll),
    },
  };
}
const options = {
  setView: () => viewer.camera.setView(viewOptions()),
  flyTo: () => viewer.camera.flyTo({ ...viewOptions(), duration: 2 }),
  lookAtWorldPosition: () => viewer.camera.lookAtWorldPosition(center),
  orthographic: () => viewer.camera.switchToOrthographicFrustum(),
  perspective: () => viewer.camera.switchToPerspectiveFrustum(),
  move: () => viewer.camera.moveRight(1000),
  zoom: () => viewer.camera.zoomIn(1000),
  complete: () => viewer.camera.completeFlight(),
  top: () =>
    viewer.camera.setView({
      destination: new C.Cartesian3(0, 0, 16000),
      orientation: {
        direction: new C.Cartesian3(0, 0, -1),
        up: C.Cartesian3.UNIT_Y,
      },
    }),
  orbit: () => {
    viewer.camera.lookAt(center, new C.HeadingPitchRange(0.4, -0.6, 18000));
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  },
  fly: () =>
    viewer.camera.flyToBoundingSphere(bounds, {
      duration: 2,
      offset: new C.HeadingPitchRange(-0.5, -0.8, 18000),
    }),
  cancel: () => viewer.camera.cancelFlight(),
  home: () => viewer.camera.flyHome(2),
};
const gui = new GUI({
  title: document.title,
  container: document.getElementById("controls"),
});
gui.add(options, "top").name("俯视");
gui.add(options, "orbit").name("围绕中心");
gui.add(options, "fly").name("飞行到区域");
gui.add(options, "cancel").name("取消飞行");
gui.add(options, "home").name("全域视图");
const poseGui = gui.addFolder("位置与 HPR 设置");
for (const key of ["x", "y", "z"]) {
  poseGui.add(pose, key).name(`${key.toUpperCase()}（米）`);
}
poseGui.add(pose, "heading", -180, 180, 1).name("Heading（度）");
poseGui.add(pose, "pitch", -90, 90, 1).name("Pitch（度）");
poseGui.add(pose, "roll", -180, 180, 1).name("Roll（度）");
poseGui.add(options, "setView").name("应用 setView");
poseGui.add(options, "flyTo").name("飞行 flyTo");
poseGui.add(options, "complete").name("完成飞行");
const projectionGui = gui.addFolder("朝向与投影");
projectionGui.add(options, "lookAtWorldPosition").name("原地看向中心");
projectionGui.add(options, "orthographic").name("切换正交");
projectionGui.add(options, "perspective").name("切换透视");
projectionGui.add(options, "move").name("右移 1000 米");
projectionGui.add(options, "zoom").name("拉近 1000 米");
const status = document.getElementById("camera-status");
let changedCount = 0;
const removeChanged = viewer.camera.changed.addEventListener(
  () => changedCount++,
);
const removeStatus = viewer.scene.postRender.addEventListener(() => {
  const camera = viewer.camera;
  const position = camera.positionWC;
  const degrees = (value) => C.Math.toDegrees(value).toFixed(2);
  status.textContent = [
    `世界坐标（米）\nX ${position.x.toFixed(1)}  Y ${position.y.toFixed(1)}  Z ${position.z.toFixed(1)}`,
    `H ${degrees(camera.heading)}°  P ${degrees(camera.pitch)}°  R ${degrees(camera.roll)}°`,
    camera.frustum instanceof C.OrthographicFrustum
      ? `正交宽度 ${camera.frustum.width.toFixed(1)} 米`
      : "透视投影",
    `changed 事件 ${changedCount} 次`,
  ].join("\n");
});
exposeExample(viewer, gui, { world, options, pose }, () => {
  removeChanged();
  removeStatus();
});

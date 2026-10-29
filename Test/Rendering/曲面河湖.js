/* global window, document, URLSearchParams, performance */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";
import waterAppearanceControls from "./water-appearance-controls.js";

const river =
  new URLSearchParams(window.location.search).get("sample") === "river";
const viewer = new C.Viewer("map", {
  baseLayer: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  animation: true,
  timeline: true,
  skyBox: false,
  skyAtmosphere: false,
});
const scene = viewer.scene;
scene.highDynamicRange = true;
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = true;
scene.fog.enabled = false;
scene.globe.baseColor = C.Color.fromCssColorString("#58674b");
scene.globe.showGroundAtmosphere = false;
scene.globe.maximumScreenSpaceError = 4;
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T04:00:00Z");
viewer.clock.shouldAnimate = true;
const effects = new C.SceneGISEnvironmentEffects({
  mode: "globe",
  enabled: true,
  showHeightFog: false,
  showClouds: false,
  showAerialPerspective: true,
  showBloom: false,
});
viewer.addController(effects);
const waves = new C.SceneGISWindWaves({
  windSpeed: river ? 6 : 10,
  windDirection: new C.Cartesian2(1, 0.5),
  fetchLength: river ? 5000 : 20000,
  waterDepth: river ? 12 : 30,
  resolution: 128,
  patchLength: 128,
  amplitudeScale: river ? 0.7 : 1,
  whitecapIntensity: river ? 0.12 : 0.25,
  foamHalfLife: river ? 1.5 : 2,
});
const lake = new C.PolygonHierarchy(
  C.Cartesian3.fromDegreesArray([
    117.6, 31.3, 119.1, 31.3, 119.25, 31.9, 118.65, 31.75, 118.9, 32.6, 117.8,
    32.55, 117.5, 31.9,
  ]),
  [
    new C.PolygonHierarchy(
      C.Cartesian3.fromDegreesArray([
        118.05, 31.8, 118.25, 31.76, 118.35, 32.04, 118.1, 32.1,
      ]),
    ),
  ],
);
const channel = new C.PolygonHierarchy(
  C.Cartesian3.fromDegreesArrayHeights([
    117.4, 31.45, 180, 118, 31.7, 120, 118.6, 31.85, 60, 119.2, 32.15, 30,
    119.19, 32.19, 30, 118.58, 31.89, 60, 117.98, 31.74, 120, 117.38, 31.49,
    180,
  ]),
);
const hierarchy = river ? channel : lake;
const start = performance.now();
const water = scene.primitives.add(
  new C.SceneGISWaterSurface({
    geometryMode: "ellipsoid",
    polygonHierarchy: hierarchy,
    height: 30,
    perPositionHeight: river,
    underwaterDepth: river ? 0 : 25,
    windWaves: waves,
    meshSpacing: 1,
    maximumScreenSpaceError: 2,
    maximumTileCount: 512,
    id: river ? "曲面河流" : "曲面湖泊",
    reflectionSteps: 32,
  }),
);
const constructionMilliseconds = performance.now() - start;

function land(polygon, height, id, color = "#647050") {
  return scene.primitives.add(
    new C.Primitive({
      geometryInstances: new C.GeometryInstance({
        geometry: new C.PolygonGeometry({
          polygonHierarchy: polygon,
          height,
          granularity: C.Math.toRadians(0.025),
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            C.Color.fromCssColorString(color),
          ),
        },
        id,
      }),
      appearance: new C.PerInstanceColorAppearance({
        flat: true,
        translucent: false,
      }),
      asynchronous: false,
    }),
  );
}
if (!river) {
  land(
    new C.PolygonHierarchy(
      C.Cartesian3.fromDegreesArray([
        117, 30.8, 119.7, 30.8, 119.7, 33, 117, 33,
      ]),
      [new C.PolygonHierarchy(lake.positions)],
    ),
    32,
    "湖岸",
  );
  land(lake.holes[0], 36, "岛屿");
  land(lake, 10, "示意湖底", "#899a91");
  const bedFrame = C.Transforms.eastNorthUpToFixedFrame(
    C.Cartesian3.fromDegrees(118.55, 31.85, 10),
  );
  const markers = [
    [-12, 15, 8, "#bc7658"],
    [9, 25, 14, "#e2d6ad"],
    [-8, 42, 12, "#769aa5"],
    [16, 58, 18, "#bdc5a5"],
  ];
  for (const [x, y, height, color] of markers) {
    scene.primitives.add(
      new C.Primitive({
        geometryInstances: new C.GeometryInstance({
          geometry: C.BoxGeometry.fromDimensions({
            dimensions: new C.Cartesian3(3, 3, height),
            vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          modelMatrix: C.Matrix4.fromTranslation(
            new C.Cartesian3(x, y, height / 2),
          ),
          attributes: {
            color: C.ColorGeometryInstanceAttribute.fromColor(
              C.Color.fromCssColorString(color),
            ),
          },
          id: "水下深度标记",
        }),
        modelMatrix: bedFrame,
        appearance: new C.PerInstanceColorAppearance({ translucent: false }),
        asynchronous: false,
      }),
    );
  }
}
const gui = new GUI({
  title: river ? "曲面河流" : "曲面湖泊",
  container: document.getElementById("controls"),
});
const settings = {
  view: "全域鸟瞰",
  animate: true,
  show: true,
  heightFog: false,
  underwater: !river,
  viewAt(name) {
    if (name === "水下近景" || name === "水下仰视") {
      viewer.camera.setView({
        destination: C.Cartesian3.fromDegrees(118.55, 31.85, 25),
        orientation: {
          heading: 0,
          pitch: name === "水下仰视" ? 0.6 : -0.22,
          roll: 0,
        },
      });
      return;
    }
    const target = river
      ? C.Cartesian3.fromDegrees(118.59, 31.87, 60)
      : C.Cartesian3.fromDegrees(118.55, 31.85, 30);
    const poses = {
      浪面特写: [120, -0.06],
      水面近景: [800, -0.09],
      低角度远眺: [30000, -0.08],
      全域鸟瞰: [230000, -0.95],
      高空: [2000000, -1.4],
    };
    const [range, pitch] = poses[name];
    viewer.camera.lookAt(target, new C.HeadingPitchRange(0.45, pitch, range));
    viewer.camera.lookAtTransform(C.Matrix4.IDENTITY);
  },
};
gui
  .add(settings, "view", [
    "浪面特写",
    "水面近景",
    "低角度远眺",
    "全域鸟瞰",
    "高空",
    ...(!river ? ["水下近景", "水下仰视"] : []),
  ])
  .name("观察位置")
  .onChange(settings.viewAt);
gui
  .add(settings, "animate")
  .name("时间动画")
  .onChange((v) => {
    viewer.clock.shouldAnimate = v;
  });
gui
  .add(settings, "show")
  .name("显示水面")
  .onChange((v) => {
    water.show = v;
  });
gui.add(water, "maximumScreenSpaceError", 0.5, 8, 0.5).name("曲率误差（像素）");
gui.add(water, "maximumTileCount", 64, 1024, 32).name("网格块上限");
gui.add(waves, "windSpeed", 0, 20, 0.5).name("风速（米/秒）");
gui.add(waves, "directionalSpread", 0, 1, 0.05).name("波浪方向分散度");
gui.add(waves, "rippleIntensity", 0, 4, 0.1).name("细浪强度");
gui.add(waves, "choppiness", 0, 1, 0.05).name("浪尖程度");
gui.add(waves, "whitecapIntensity", 0, 1, 0.05).name("浪尖白沫");
gui.add(waves, "foamHalfLife", 0, 10, 0.1).name("白沫半衰期（秒）");
const appearance = waterAppearanceControls(gui, () => [water], {
  preset: river ? "河水" : "清水",
  foamWidth: river ? 0.5 : 0.4,
  foamIntensity: river ? 0.2 : 0.25,
});
gui.add(water, "reflections").name("场景倒影");
if (!river) {
  gui
    .add(settings, "underwater")
    .name("水下模式")
    .onChange((value) => {
      water.underwaterDepth = value ? 25 : 0;
    });
}
gui
  .add(settings, "heightFog")
  .name("高度雾")
  .onChange((v) => {
    effects.showHeightFog = v;
  });
settings.viewAt(settings.view);
const status = document.getElementById("status");
scene.postRender.addEventListener(() => {
  const s = water.statistics;
  status.textContent = `网格 ${s.selectedTiles ?? 0} 块 · 三角形 ${s.triangles ?? 0} · 缓存 ${((s.geometryBytes ?? 0) / 1048576).toFixed(1)} MiB · 本帧构建 ${s.geometryBuilds ?? 0} 块${s.budgetLimited ? " · 已达网格预算" : ""}`;
});
scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction((event) => {
  const picked = scene.pick(event.position);
  document.getElementById("pick").textContent = picked?.id
    ? `拾取：${picked.id}`
    : "未拾取到水面。";
}, C.ScreenSpaceEventType.LEFT_CLICK);
exposeExample(
  viewer,
  gui,
  {
    water,
    waters: [water],
    waves,
    settings,
    effects,
    appearance,
    constructionMilliseconds,
  },
  () => {
    handler.destroy();
    scene.primitives.remove(water);
    waves.destroy();
    viewer.removeController(effects);
  },
);

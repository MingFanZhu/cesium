/* global window, document, URLSearchParams, performance */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") === "planar";
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -100000,
            minimumY: -100000,
            maximumX: 100000,
            maximumY: 100000,
          },
          maximumLevel: 0,
        },
      }
    : { baseLayer: false }),
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
scene.sunBloom = false;
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#54624b");
  scene.globe.showGroundAtmosphere = false;
}
const transform = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(118.75, 32.05),
    );
function point(x, y, height) {
  if (planar) {
    return new C.Cartesian3(x, y, height);
  }
  const p = C.Matrix4.multiplyByPoint(
    transform,
    new C.Cartesian3(x, y, 0),
    new C.Cartesian3(),
  );
  const c = C.Ellipsoid.WGS84.cartesianToCartographic(p);
  c.height = height;
  return C.Ellipsoid.WGS84.cartographicToCartesian(c);
}
const environment = planar
  ? new C.SceneGISPlanarEnvironment({
      world: viewer.planarWorld,
      showAtmosphere: false,
      sunDirection: C.Cartesian3.UNIT_Z,
      moonDirection: C.Cartesian3.UNIT_Y,
      directionMode: "astronomical",
      originLongitude: C.Math.toRadians(118.75),
      originLatitude: C.Math.toRadians(32.05),
    })
  : undefined;
if (environment) {
  viewer.addController(environment);
}
const effects = new C.SceneGISEnvironmentEffects({
  mode: planar ? "planar" : "globe",
  world: planar ? viewer.planarWorld : undefined,
  enabled: true,
  showHeightFog: false,
  showClouds: false,
  showAerialPerspective: false,
  showBloom: false,
});
viewer.addController(effects);
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T04:00:00Z");
viewer.clock.shouldAnimate = true;
viewer.timeline.zoomTo(
  C.JulianDate.addHours(viewer.clock.currentTime, -1, new C.JulianDate()),
  C.JulianDate.addHours(viewer.clock.currentTime, 2, new C.JulianDate()),
);
const waves = new C.SceneGISWindWaves({
  resolution: 128,
  patchLength: 64,
  windSpeed: 4,
  fetchLength: 1500,
  waterDepth: 3,
  windDirection: new C.Cartesian2(0, 1),
});
const xs = Array.from(Array(17).keys(), (i) => -2400 + i * 300);
const profile = xs.map((x, i) => ({
  x,
  y: 320 * Math.sin(x / 750),
  z: 24 - x * 0.002,
  width: 140 + 40 * Math.cos(x / 600),
  speed: 0.6 + (0.8 * (i % 4)) / 3,
}));
const settings = {
  view: "弯道鸟瞰",
  wind: false,
  level: 0,
  currentSpeedScale: 1,
  currentRippleAmplitude: 0.035,
  currentFoamIntensity: 0.2,
  show: true,
  maximumTileCount: 256,
  showProfile: false,
};
const gui = new GUI({
  title: planar ? "平面河流" : "球面河流",
  container: document.getElementById("controls"),
});
let river, constructionMilliseconds;
function rebuild() {
  if (river) {
    scene.primitives.remove(river);
  }
  const start = performance.now();
  river = scene.primitives.add(
    new C.SceneGISRiverSurface({
      world: scene.world,
      positions: profile.map((p) => point(p.x, p.y, p.z + settings.level)),
      widths: profile.map((p) => p.width),
      speeds: profile.map((p) => p.speed),
      polygonHierarchy: new C.PolygonHierarchy(
        [
          point(-2600, -1000, 0),
          point(2600, -1000, 0),
          point(2600, 1000, 0),
          point(-2600, 1000, 0),
        ],
        [
          new C.PolygonHierarchy([
            point(-20, -16, 0),
            point(20, -16, 0),
            point(20, 16, 0),
            point(-20, 16, 0),
          ]),
        ],
      ),
      windWaves: settings.wind ? waves : undefined,
      id: "沿程河流",
      currentSpeedScale: settings.currentSpeedScale,
      currentRippleAmplitude: settings.currentRippleAmplitude,
      currentFoamIntensity: settings.currentFoamIntensity,
      maximumTileCount: settings.maximumTileCount,
      show: settings.show,
      waterColor: new C.Color(0.018, 0.085, 0.09),
      absorption: new C.Cartesian3(0.24, 0.1, 0.06),
      reflectionSteps: 32,
      foamWidth: 0.8,
    }),
  );
  constructionMilliseconds = performance.now() - start;
  if (window.example) {
    window.example.river = river;
    window.example.constructionMilliseconds = constructionMilliseconds;
  }
}
rebuild();

// Deterministic demonstration ground only; the river itself does not sample terrain.
function bedHeight(x, y) {
  const i = Math.max(
    0,
    Math.min(profile.length - 2, Math.floor((x + 2400) / 300)),
  );
  const a = profile[i],
    b = profile[i + 1],
    t = C.Math.clamp((x - a.x) / (b.x - a.x), 0, 1);
  const center = C.Math.lerp(a.y, b.y, t),
    width = C.Math.lerp(a.width, b.width, t);
  const distance =
    Math.abs(y - center) / Math.hypot(1, (b.y - a.y) / (b.x - a.x));
  const bank = C.Math.clamp((distance - width * 0.5 + 10) / 24, 0, 1);
  const island = C.Math.clamp(
    1 - Math.max(Math.abs(x) / 28, Math.abs(y) / 24),
    0,
    1,
  );
  return 24 - x * 0.002 - 3 + 5 * Math.max(bank, island);
}
const positions = [],
  indices = [];
const cols = 141,
  rows = 71;
for (let j = 0; j < rows; ++j) {
  for (let i = 0; i < cols; ++i) {
    const x = -2800 + i * 40,
      y = -1400 + j * 40;
    const p = point(x, y, bedHeight(x, y));
    positions.push(p.x, p.y, p.z);
    if (i + 1 < cols && j + 1 < rows) {
      const a = j * cols + i;
      indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
}
scene.primitives.add(
  new C.Primitive({
    geometryInstances: new C.GeometryInstance({
      geometry: new C.Geometry({
        attributes: {
          position: new C.GeometryAttribute({
            componentDatatype: C.ComponentDatatype.DOUBLE,
            componentsPerAttribute: 3,
            values: new Float64Array(positions),
          }),
        },
        indices: new Uint16Array(indices),
        boundingSphere: C.BoundingSphere.fromVertices(positions),
      }),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.fromCssColorString("#a3a782"),
        ),
      },
      id: "示意河床与河岸",
    }),
    appearance: new C.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    }),
    asynchronous: false,
  }),
);
const labels = profile.map((p, i) =>
  viewer.entities.add({
    position: point(p.x, p.y, p.z + 8),
    show: false,
    label: {
      text: `${i + 1}  水位 ${p.z.toFixed(1)} m\n流速 ${p.speed.toFixed(1)} m/s`,
      font: "14px sans-serif",
      fillColor: C.Color.WHITE,
      showBackground: true,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }),
);
function setCamera(range, pitch, targetX = 0) {
  const target = point(targetX, 0, 24 - targetX * 0.002 + settings.level);
  const frame = planar
    ? C.Matrix4.fromTranslation(target)
    : C.Transforms.eastNorthUpToFixedFrame(target);
  const offset = new C.Cartesian3(
    range * 0.35,
    -range * Math.cos(pitch),
    range * Math.sin(-pitch),
  );
  const direction = C.Cartesian3.normalize(
    C.Cartesian3.negate(offset, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  const right = C.Cartesian3.normalize(
    C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
    new C.Cartesian3(),
  );
  scene.camera.setView({
    destination: C.Matrix4.multiplyByPoint(frame, offset, new C.Cartesian3()),
    orientation: {
      direction: C.Matrix4.multiplyByPointAsVector(
        frame,
        direction,
        new C.Cartesian3(),
      ),
      up: C.Matrix4.multiplyByPointAsVector(
        frame,
        C.Cartesian3.cross(right, direction, new C.Cartesian3()),
        new C.Cartesian3(),
      ),
    },
  });
  scene.camera.frustum.near = 0.1;
}
function viewAt(name) {
  const poses = {
    水面近景: [180, -0.16],
    弯道鸟瞰: [1500, -0.85],
    全河鸟瞰: [5500, -1.1],
    低角度远眺: [3500, -0.06],
    高空: [150000, -1.3],
  };
  setCamera(...poses[name]);
}
gui
  .add(settings, "view", [
    "水面近景",
    "弯道鸟瞰",
    "全河鸟瞰",
    "低角度远眺",
    "高空",
  ])
  .name("观察位置")
  .onChange(viewAt);
gui.add(settings, "wind").name("叠加 FFT 风浪").onChange(rebuild);
gui
  .add(settings, "level", -2, 3, 0.1)
  .name("整体水位偏移 m")
  .onFinishChange(rebuild);
[
  ["currentSpeedScale", "河流流速倍率", 0, 3, 0.05],
  ["currentRippleAmplitude", "流动波纹幅度 m", 0, 0.15, 0.005],
  ["currentFoamIntensity", "流动水纹", 0, 1, 0.02],
  ["maximumTileCount", "网格块上限", 32, 512, 16],
].forEach(([name, label, lo, hi, step]) => {
  gui
    .add(settings, name, lo, hi, step)
    .name(label)
    .onChange((v) => {
      river[name] = v;
    });
});
gui.add(waves, "windSpeed", 0, 12, 0.2).name("独立风速 m/s");
gui
  .add(settings, "show")
  .name("显示河流")
  .onChange((v) => {
    river.show = v;
  });
gui
  .add(settings, "showProfile")
  .name("控制点水位与流速")
  .onChange((v) => {
    labels.forEach((e) => {
      e.show = v;
    });
  });
gui.add(viewer.clock, "shouldAnimate").name("时间动画");
viewAt(settings.view);
const removeStatus = scene.postRender.addEventListener(() => {
  const s = river.statistics;
  document.getElementById("status").textContent =
    `网格 ${s.selectedTiles} 块 · ${s.triangles} 三角形 · ${(s.geometryBytes / 1048576).toFixed(2)} MiB · 本帧构建 ${s.geometryBuilds} 块`;
});
scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
const handler = new C.ScreenSpaceEventHandler(scene.canvas);
handler.setInputAction((event) => {
  const picked = scene.pick(event.position);
  document.getElementById("pick").textContent = `拾取：${picked?.id ?? "空"}`;
}, C.ScreenSpaceEventType.LEFT_CLICK);
exposeExample(
  viewer,
  gui,
  {
    river,
    waves,
    settings,
    rebuild,
    setCamera,
    viewAt,
    effects,
    point,
    constructionMilliseconds,
  },
  () => {
    removeStatus();
    handler.destroy();
    scene.primitives.remove(river);
    waves.destroy();
    viewer.removeController(effects);
    if (environment) {
      viewer.removeController(environment);
    }
  },
);

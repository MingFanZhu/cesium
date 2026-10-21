/* global window, document, URLSearchParams, URL, performance, fetch */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const viewer = new C.Viewer("map", {
  shadows: false,
  terrainShadows: C.ShadowMode.RECEIVE_ONLY,
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
          enableLighting: true,
          baseColor: C.Color.fromCssColorString("#33483a"),
        },
      }
    : { baseLayer: false }),
  skyBox: false,
  skyAtmosphere: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  animation: false,
  timeline: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
});
const scene = viewer.scene;
scene.shadowMap.maximumDistance = 1500;
scene.shadowMap.size = 2048;
scene.shadowMap.softShadows = true;
scene.highDynamicRange = true;
scene.fog.enabled = false;
scene.sunBloom = false;
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#33483a");
  scene.globe.showGroundAtmosphere = false;
  scene.globe.enableLighting = false;
}
const environment = planar
  ? new C.SceneGISPlanarEnvironment({
      world: viewer.planarWorld,
      showAtmosphere: false,
      showSun: false,
      showMoon: false,
      sunDirection: C.Cartesian3.UNIT_Z,
      moonDirection: C.Cartesian3.UNIT_Y,
      directionMode: "astronomical",
      originLongitude: C.Math.toRadians(118.795),
      originLatitude: C.Math.toRadians(32.075),
    })
  : undefined;
if (environment) {
  viewer.addController(environment);
}
const effects = new C.SceneGISEnvironmentEffects({
  mode: planar ? "planar" : "globe",
  world: planar ? viewer.planarWorld : undefined,
  enabled: true,
  showAtmosphere: true,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showHeightFog: false,
  showAerialPerspective: false,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: false,
  surfaceRadianceScale: 2,
  backgroundRadianceScale: 2,
});
viewer.addController(effects);
viewer.clock.shouldAnimate = true;
const origin = planar
  ? new C.Cartesian3(0, 0, 10)
  : C.Cartesian3.fromDegrees(118.795, 32.075, 10);
const localToWorld = planar
  ? C.Matrix4.fromTranslation(origin)
  : C.Transforms.eastNorthUpToFixedFrame(origin);

scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = true;
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T08:00:00Z");
const fftResolution = Number(
  new URLSearchParams(window.location.search).get("quality") ?? 128,
);
const waves = new C.SceneGISWindWaves({
  windSpeed: 8,
  fetchLength: 1800,
  waterDepth: 2,
  windDirection: new C.Cartesian2(-1, 1),
  resolution: fftResolution,
});
const waters = [],
  shoreObjects = [];
const gui = new GUI({
  title: planar ? "玄武湖 · 平面风浪" : "玄武湖 · 球面风浪",
  container: document.getElementById("controls"),
});
const state = {
  quality: fftResolution,
  windAngle: 135,
  view: "水面近景",
  animate: true,
  showWater: true,
  reflections: true,
  roughness: 0.12,
  changeView() {
    const views = {
      水面近景: [
        [200, -650, 2.2],
        [196, -627, 0],
      ],
      岸边观察: [
        [250, -680, 16],
        [180, -540, 0],
      ],
      全湖鸟瞰: [
        [3000, -3600, 3400],
        [0, 0, 0],
      ],
    };
    const [eye, target] = views[state.view];
    const direction = C.Cartesian3.normalize(
      C.Cartesian3.subtract(
        new C.Cartesian3(...target),
        new C.Cartesian3(...eye),
        new C.Cartesian3(),
      ),
      new C.Cartesian3(),
    );
    const right = C.Cartesian3.normalize(
      C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
      new C.Cartesian3(),
    );
    viewer.camera.setView({
      destination: C.Matrix4.multiplyByPoint(
        localToWorld,
        new C.Cartesian3(...eye),
        new C.Cartesian3(),
      ),
      orientation: {
        direction: C.Matrix4.multiplyByPointAsVector(
          localToWorld,
          direction,
          new C.Cartesian3(),
        ),
        up: C.Matrix4.multiplyByPointAsVector(
          localToWorld,
          C.Cartesian3.cross(right, direction, new C.Cartesian3()),
          new C.Cartesian3(),
        ),
      },
    });
  },
  calm() {
    waves.windSpeed = 2;
    waves.amplitudeScale = 1;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  },
  breeze() {
    waves.windSpeed = 8;
    waves.amplitudeScale = 1;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  },
  strong() {
    waves.windSpeed = 14;
    waves.amplitudeScale = 1;
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  },
};
state.changeView();
viewer.camera.frustum.near = 0.1;

gui
  .add(state, "view", ["水面近景", "岸边观察", "全湖鸟瞰"])
  .name("观察位置")
  .onChange(state.changeView);
gui
  .add(state, "quality", { 轻量: 64, 标准: 128, 精细: 256 })
  .name("风浪精度（重载）")
  .onChange((v) => {
    const url = new URL(window.location.href);
    url.searchParams.set("quality", v);
    window.location.href = url.href;
  });
gui.add(waves, "windSpeed", 0, 18, 0.1).name("10米风速 m/s");
gui
  .add(state, "windAngle", 0, 360, 1)
  .name("波浪去向 °")
  .onChange((v) => {
    waves.windDirection.x = Math.cos(C.Math.toRadians(v));
    waves.windDirection.y = Math.sin(C.Math.toRadians(v));
  });
gui.add(waves, "fetchLength", 100, 5000, 50).name("有效风区 m");
gui.add(waves, "waterDepth", 0.3, 10, 0.1).name("谱平均水深 m");
gui.add(waves, "amplitudeScale", 0, 3, 0.05).name("艺术波高倍率");
gui.add(waves, "directionalSpread", 0, 1, 0.05).name("波浪方向分散度");
gui.add(waves, "rippleIntensity", 0, 4, 0.1).name("细浪强度");
gui.add(waves, "choppiness", 0, 1, 0.05).name("波峰锐度");
gui.add(waves, "whitecapIntensity", 0, 1, 0.05).name("浪尖白沫");
gui
  .add(state, "roughness", 0.04, 0.4, 0.01)
  .name("水面粗糙度")
  .onChange((v) => waters.forEach((w) => (w.roughness = v)));
gui
  .add(state, "reflections")
  .name("屏幕空间倒影")
  .onChange((v) => waters.forEach((w) => (w.reflections = v)));
gui
  .add(state, "showWater")
  .name("显示水面")
  .onChange((v) => waters.forEach((w) => (w.show = v)));
gui.add(viewer.clock, "shouldAnimate").name("时间动画");
const presets = gui.addFolder("风况预设");
presets.add(state, "calm").name("轻风");
presets.add(state, "breeze").name("和风");
presets.add(state, "strong").name("强风");
const status = document.getElementById("status");
let lastStatus = 0;
const removeStatus = scene.postRender.addEventListener(() => {
  const now = performance.now();
  if (now - lastStatus < 500) {
    return;
  }
  lastStatus = now;
  const tiles = waters.flatMap(
    (w) => w._mesh?.tiles.filter((t) => w._commands?.includes(t.command)) ?? [],
  );
  status.textContent = `有效波高 ≈ ${waves.significantWaveHeight.toFixed(2)} m · ${tiles.length} 可见分块 · ${Math.round(tiles.reduce((s, t) => s + t.triangles, 0) / 1000)}k 三角形`;
});
exposeExample(
  viewer,
  gui,
  { effects, environment, waves, waters, state },
  () => {
    removeStatus();
    for (const water of waters) {
      scene.primitives.remove(water);
    }
    waves.destroy();
    viewer.removeController(effects);
    if (environment) {
      viewer.removeController(environment);
    }
  },
);
scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
function polygon(hierarchy, z, color) {
  function height(h) {
    return new C.PolygonHierarchy(
      h.positions.map((p) => new C.Cartesian3(p.x, p.y, z)),
      h.holes.map(height),
    );
  }
  return new C.Primitive({
    geometryInstances: new C.GeometryInstance({
      geometry: new C.CoplanarPolygonGeometry({
        polygonHierarchy: height(hierarchy),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.fromCssColorString(color),
        ),
      },
    }),
    appearance: new C.PerInstanceColorAppearance({
      flat: true,
      translucent: false,
    }),
    modelMatrix: localToWorld,
    asynchronous: false,
  });
}
function inside(x, y, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    ) {
      hit = !hit;
    }
  }
  return hit;
}
async function load() {
  const response = await fetch("./data/XuanwuLake/shoreline.geojson");
  if (!response.ok) {
    throw new Error(`岸线读取失败 ${response.status}`);
  }
  const geo = await response.json();
  if (viewer.isDestroyed()) {
    return;
  }
  const rings = geo.geometry.coordinates.map((ring) =>
    ring
      .slice(0, -1)
      .map(
        ([lon, lat]) =>
          new C.Cartesian3(
            (((lon - 118.795) * Math.PI) / 180) *
              6378137 *
              Math.cos(C.Math.toRadians(32.075)),
            (((lat - 32.075) * Math.PI) / 180) * 6378137,
            0,
          ),
      ),
  );
  const hierarchy = new C.PolygonHierarchy(
    rings[0],
    rings.slice(1).map((r) => new C.PolygonHierarchy(r)),
  );
  const land = new C.PolygonHierarchy(
    [
      new C.Cartesian3(-5000, -5000),
      new C.Cartesian3(5000, -5000),
      new C.Cartesian3(5000, 5000),
      new C.Cartesian3(-5000, 5000),
    ],
    [new C.PolygonHierarchy(rings[0])],
  );
  shoreObjects.push(scene.primitives.add(polygon(land, 1.5, "#4b6145")));
  shoreObjects.push(
    scene.primitives.add(
      polygon(new C.PolygonHierarchy(rings[0]), -2, "#73705a"),
    ),
  );
  for (const ring of rings.slice(1)) {
    shoreObjects.push(
      scene.primitives.add(
        polygon(new C.PolygonHierarchy(ring), 1.5, "#52694a"),
      ),
    );
  }
  const water = scene.primitives.add(
    new C.SceneGISWaterSurface({
      polygonHierarchy: hierarchy,
      modelMatrix: localToWorld,
      windWaves: waves,
      meshSpacing: 1,
      id: "xuanwu-water",
      roughness: state.roughness,
      waterColor: new C.Color(0.018, 0.08, 0.065),
      absorption: new C.Cartesian3(0.45, 0.2, 0.14),
      foamIntensity: 0.3,
      reflectionSteps: 32,
      maximumReflectionDistance: 500,
    }),
  );
  waters.push(water);
  // Stylized park vegetation gives scale and reflection references; no surveyed vegetation is claimed.
  const instances = [];
  let seed = 7;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 1600; ++i) {
    const x = -1400 + random() * 3000,
      y = -1700 + random() * 3400;
    if (!rings.slice(1).some((r) => inside(x, y, r))) {
      continue;
    }
    const height = 6 + random() * 8;
    const treeMatrix = C.Matrix4.multiplyByTranslation(
      localToWorld,
      new C.Cartesian3(x, y, 1.5 + height * 0.5),
      new C.Matrix4(),
    );
    instances.push(
      new C.GeometryInstance({
        geometry: new C.EllipsoidGeometry({
          radii: new C.Cartesian3(height * 0.28, height * 0.28, height * 0.5),
          stackPartitions: 6,
          slicePartitions: 8,
          vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
        }),
        modelMatrix: treeMatrix,
        attributes: {
          color: C.ColorGeometryInstanceAttribute.fromColor(
            new C.Color(0.13 + random() * 0.08, 0.24 + random() * 0.1, 0.1),
          ),
        },
      }),
    );
  }
  scene.primitives.add(
    new C.Primitive({
      geometryInstances: instances,
      appearance: new C.PerInstanceColorAppearance({ translucent: false }),
      asynchronous: false,
    }),
  );
}
load().catch((error) => {
  document.getElementById("error").textContent = error.message;
  throw error;
});

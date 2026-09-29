/* global window, document, URLSearchParams, performance */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
const viewer = new C.Viewer("map", {
  ...(planar
    ? {
        planarWorld: {
          crs: "LOCAL",
          extent: {
            minimumX: -10000,
            maximumX: 10000,
            minimumY: -10000,
            maximumY: 10000,
          },
          maximumLevel: 0,
          enableLighting: true,
          baseColor: C.Color.fromCssColorString("#535f56"),
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
scene.highDynamicRange = true;
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = true;
scene.fog.enabled = false;
scene.sunBloom = false;
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#535f56");
  scene.globe.showGroundAtmosphere = false;
  scene.globe.enableLighting = false;
}
const environment = planar
  ? new C.SceneGISPlanarEnvironment({
      world: viewer.planarWorld,
      showAtmosphere: false,
      showSun: false,
      showMoon: false,
      sunDirection: new C.Cartesian3(-0.5, 0.3, 0.8),
      moonDirection: C.Cartesian3.UNIT_Y,
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
  showAerialPerspective: true,
  showHeightFog: true,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: false,
  heightFogDensity: 0.00025,
  heightFogHeightFalloff: 0.00035,
  heightFogStartDistance: 80,
  heightFogMaximumOpacity: 0.8,
  heightFogInscatteringScale: 0.55,
  surfaceRadianceScale: 1,
  backgroundRadianceScale: 1,
});
viewer.addController(effects);
viewer.clock.shouldAnimate = true;
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T02:00:00Z");
const matrix = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(118.8, 32.07, 0),
    );
const point = (p) => C.Matrix4.multiplyByPoint(matrix, p, new C.Cartesian3());
const vector = (p) =>
  C.Matrix4.multiplyByPointAsVector(matrix, p, new C.Cartesian3());

// Deterministic local geometry keeps weather comparisons independent of network/LOD.
const instances = [];
function box(position, dimensions, color) {
  instances.push(
    new C.GeometryInstance({
      modelMatrix: C.Matrix4.multiplyByTranslation(
        matrix,
        new C.Cartesian3(...position),
        new C.Matrix4(),
      ),
      geometry: C.BoxGeometry.fromDimensions({
        dimensions: new C.Cartesian3(...dimensions),
        vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: C.ColorGeometryInstanceAttribute.fromColor(
          C.Color.fromCssColorString(color),
        ),
      },
    }),
  );
}
box([0, 0, -2], [3200, 3200, 4], "#586552");
box([-1100, 0, 0.2], [260, 3400, 0.4], "#436b77");
for (let i = -5; i <= 5; i++) {
  box([i * 240 + 110, 0, 0.4], [22, 2900, 0.8], "#40484e");
  box([200, i * 240 + 110, 0.4], [2300, 22, 0.8], "#40484e");
}
let seed = 923;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (let x = -3; x <= 5; x++) {
  for (let y = -5; y <= 5; y++) {
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        const h = 18 + random() * 90;
        box(
          [x * 240 + a * 88 - 30, y * 240 + b * 88 - 30, h * 0.5 + 1],
          [40 + random() * 22, 40 + random() * 22, h],
          ["#aeb7b7", "#bbc1bb", "#95a6af", "#c0b6a2"][
            Math.floor(random() * 4)
          ],
        );
      }
    }
  }
}
scene.primitives.add(
  new C.Primitive({
    geometryInstances: instances,
    asynchronous: false,
    appearance: new C.PerInstanceColorAppearance({ translucent: false }),
  }),
);

const weather = scene.primitives.add(
  new C.SceneGISWeather({
    mode: planar ? "planar" : "globe",
    intensity: 0.7,
    quality: "medium",
    windVelocity: new C.Cartesian2(5, 1),
    radius: 1800,
    ceilingHeight: 2500,
  }),
);
const settings = {
  preset: "中雨",
  view: "街区鸟瞰",
  windSpeed: 5,
  windAngle: 10,
  fog: true,
  animate: true,
  home() {
    const views = {
      街区鸟瞰: [
        [700, -1050, 850],
        [0, 0, 30],
      ],
      城市鸟瞰: [
        [2200, -2900, 2200],
        [0, 0, 0],
      ],
      垂直俯视: [
        [0, -1, 1400],
        [0, 0, 0],
      ],
    };
    const [eye, target] = views[settings.view];
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
    const up = C.Cartesian3.cross(right, direction, new C.Cartesian3());
    viewer.camera.setView({
      destination: point(new C.Cartesian3(...eye)),
      orientation: { direction: vector(direction), up: vector(up) },
    });
  },
};
settings.home();
const gui = new GUI({
  title: planar ? "鸟瞰天气 · 平面" : "鸟瞰天气 · 球面",
  container: document.getElementById("controls"),
});
gui
  .add(settings, "preset", ["晴", "小雨", "中雨", "大雨", "小雪", "大雪"])
  .name("天气预设")
  .onChange((v) => {
    weather.type = v.includes("雪") ? "snow" : "rain";
    weather.intensity = {
      晴: 0,
      小雨: 0.25,
      中雨: 0.7,
      大雨: 1,
      小雪: 0.3,
      大雪: 1,
    }[v];
  });
gui.add(weather, "type", { 雨: "rain", 雪: "snow" }).name("降水类型").listen();
gui.add(weather, "intensity", 0, 1, 0.01).name("降水强度").listen();
function wind() {
  const a = C.Math.toRadians(settings.windAngle);
  weather.windVelocity.x = Math.cos(a) * settings.windSpeed;
  weather.windVelocity.y = Math.sin(a) * settings.windSpeed;
}
wind();
gui.add(settings, "windSpeed", 0, 25, 0.1).name("风速（米/秒）").onChange(wind);
gui
  .add(settings, "windAngle", -180, 180, 1)
  .name("风向（去向角度）")
  .onChange(wind);
gui
  .add(weather, "quality", { 低: "low", 中: "medium", 高: "high" })
  .name("降水质量");
gui.add(weather, "particleSize", 0.25, 3, 0.05).name("雨雪尺寸");
gui.add(weather, "transitionDuration", 0, 6, 0.1).name("过渡时间（秒）");
gui.add(settings, "fog").name("能见度随天气变化");
gui.add(weather, "show").name("显示降水");
gui.add(weather, "paused").name("暂停降水模拟");
gui
  .add(settings, "animate")
  .name("场景时间推进")
  .onChange((v) => {
    viewer.clock.shouldAnimate = v;
  });
gui
  .add(settings, "view", ["街区鸟瞰", "城市鸟瞰", "垂直俯视"])
  .name("观察高度")
  .onChange(settings.home);
gui.add(settings, "home").name("还原视角");
let lastStatus = 0;
const removeUpdate = scene.preUpdate.addEventListener(() => {
  effects.showHeightFog = settings.fog;
  effects.heightFogDensity =
    0.000015 + (settings.fog ? weather.actualIntensity * 0.0003 : 0);
  const now = performance.now();
  if (now - lastStatus > 500) {
    lastStatus = now;
    document.getElementById("status").textContent =
      `当前强度 ${weather.actualIntensity.toFixed(2)} · 降水状态 ${(weather.textureMemoryInBytes / 1048576).toFixed(1)} MiB · 风向以东／北为水平轴`;
  }
});
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
exposeExample(viewer, gui, { weather, effects, settings }, () => {
  removeUpdate();
  removeError();
  viewer.removeController(effects);
  if (environment) {
    viewer.removeController(environment);
  }
});

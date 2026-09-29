/* global window, document, URLSearchParams, performance */
import * as C from "/Build/CesiumUnminified/index.js";
import GUI from "/Test/lib/lil-gui/lil-gui.esm.min.js";
import exposeExample from "/Test/example-lifecycle.js";

const planar =
  new URLSearchParams(window.location.search).get("world") !== "globe";
if (!planar) {
  // Keep local credentials in this browser session, never in source or page URLs.
  const ionToken = window.sessionStorage.getItem("sceneGIS.ionAccessToken");
  if (ionToken) {
    C.Ion.defaultAccessToken = ionToken;
  }
}
document.getElementById("city-credit").hidden = planar;
const reference = {
  name: planar ? "本地示意街区" : "Cesium ion · OSM Buildings · 南京",
  primitive: undefined,
  visible: false,
  failed: false,
};
const terrain = planar ? undefined : C.Terrain.fromWorldTerrain();
const imagery = planar ? undefined : C.ImageryLayer.fromWorldImagery();
const removeImageryError = imagery?.errorEvent.addEventListener(() => {
  document.getElementById("error").textContent =
    "世界影像加载失败，请检查网络和 Cesium ion 授权。";
});
const removeTerrainError = terrain?.errorEvent.addEventListener(() => {
  document.getElementById("error").textContent =
    "世界地形加载失败，请检查网络和 Cesium ion 授权。";
});
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
    : { baseLayer: imagery, terrain }),
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
const surfaceWeather = new C.SceneGISSurfaceWeather({
  scene,
  enabled: true,
  wetness: 0.65,
});
const rainLens = scene.postProcessStages.add(
  new C.SceneGISRainLensStage({ scene }),
);
const snowLens = scene.postProcessStages.add(
  new C.SceneGISSnowLensStage({ scene }),
);
scene.highDynamicRange = true;
const reflections = new C.SceneGISScreenSpaceReflections({
  scene,
  enabled: false,
});
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
  showHeightFog: false,
  showClouds: false,
  showCloudShadows: false,
  showCrepuscularRays: false,
  showBloom: false,
  showLensFlare: false,
  showMoonlight: false,
  heightFogDensity: 0,
  heightFogHeightFalloff: 0.00035,
  heightFogStartDistance: 80,
  heightFogMaximumOpacity: 0.8,
  heightFogInscatteringScale: 0.55,
  // Fixed daylight calibration; weather presets never change surface lighting.
  surfaceRadianceScale: 3,
});
viewer.addController(effects);
viewer.clock.shouldAnimate = true;
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-06-21T02:00:00Z");
const matrix = planar
  ? C.Matrix4.IDENTITY
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(118.785, 32.045, 0),
    );
const point = (p) => C.Matrix4.multiplyByPoint(matrix, p, new C.Cartesian3());
const vector = (p) =>
  C.Matrix4.multiplyByPointAsVector(matrix, p, new C.Cartesian3());

if (planar) {
  // Keep the existing local schematic district for Planar.
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
  reference.primitive = scene.primitives.add(
    new C.Primitive({
      geometryInstances: instances,
      asynchronous: false,
      appearance: new C.PerInstanceColorAppearance({ translucent: false }),
    }),
  );
}

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
  surface: "湿润",
  view: planar ? "街区鸟瞰" : "城市鸟瞰",
  windSpeed: 5,
  windAngle: 10,
  fog: true,
  animate: true,
  ripples: true,
  rippleStrength: 1,
  lens: true,
  lensStrength: 0.7,
  snowLens: true,
  snowLensStrength: 0.7,
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
    if (!planar) {
      views.街区鸟瞰 = [
        [900, -1100, 800],
        [0, 0, 30],
      ];
      views.城市鸟瞰 = [
        [2000, -2800, 1800],
        [0, 0, 0],
      ];
      views.垂直俯视 = [
        [0, -1, 2200],
        [0, 0, 0],
      ];
    }
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
const weatherPreset = gui
  .add(settings, "preset", ["晴", "小雨", "中雨", "大雨", "小雪", "大雪"])
  .name("天气预设");
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
const surfaces = gui.addFolder("地表覆盖（可手动调整）");
surfaces.add(reflections, "enabled").name("模型 SSR");
const surfaceEnabled = surfaces
  .add(surfaceWeather, "enabled")
  .name("显示地表覆盖")
  .listen();
weatherPreset.onChange((v) => {
  weather.type = v.includes("雪") ? "snow" : "rain";
  weather.intensity = {
    晴: 0,
    小雨: 0.25,
    中雨: 0.7,
    大雨: 1,
    小雪: 0.3,
    大雪: 1,
  }[v];
  // Presets toggle coverage while preserving the user's wetness/snow values.
  surfaceEnabled.setValue(weather.intensity > 0);
});
surfaces
  .add(settings, "surface", ["干燥", "湿润", "薄雪", "积雪"])
  .name("地表预设")
  .onChange((value) => {
    surfaceWeather.wetness = value === "湿润" ? 0.8 : 0;
    surfaceWeather.snowCoverage =
      value === "薄雪" ? 0.45 : value === "积雪" ? 0.95 : 0;
  });
surfaces.add(surfaceWeather, "wetness", 0, 1, 0.01).name("湿润程度").listen();
surfaces
  .add(surfaceWeather, "snowCoverage", 0, 1, 0.01)
  .name("积雪覆盖")
  .listen();
surfaces.add(surfaceWeather, "patchScale", 5, 150, 1).name("斑块尺度（米）");
const details = gui.addFolder("降雨细节");
details.add(settings, "ripples").name("湿地涟漪");
details.add(settings, "rippleStrength", 0, 1, 0.01).name("涟漪强度");
details.add(surfaceWeather, "rippleScale", 0.2, 2, 0.05).name("涟漪尺度（米）");
details.add(settings, "lens").name("镜头雨滴");
details.add(settings, "lensStrength", 0, 1, 0.01).name("镜头雨滴强度");
details.add(rainLens, "dropletSize", 8, 80, 1).name("雨滴尺度（像素）");
details.add(rainLens, "distortion", 0, 30, 0.5).name("镜头折射（像素）");
const snowDetails = gui.addFolder("降雪镜头");
snowDetails.add(settings, "snowLens").name("镜头结霜");
snowDetails.add(settings, "snowLensStrength", 0, 1, 0.01).name("结霜强度");
snowDetails.add(snowLens, "coverage", 0, 1, 0.01).name("结霜范围");
let lastStatus = 0;
const removeUpdate = scene.preUpdate.addEventListener(() => {
  const rain =
    weather.show && weather.type === "rain" ? weather.actualIntensity : 0;
  const ripples = settings.ripples ? rain * settings.rippleStrength : 0;
  if (surfaceWeather.rippleIntensity !== ripples) {
    surfaceWeather.rippleIntensity = ripples;
  }
  const lens = rain * settings.lensStrength;
  if (rainLens.intensity !== lens) {
    rainLens.intensity = lens;
  }
  rainLens.enabled = settings.lens && lens > 0;
  const snow =
    weather.show && weather.type === "snow" ? weather.actualIntensity : 0;
  const snowAmount = snow * settings.snowLensStrength;
  if (snowLens.intensity !== snowAmount) {
    snowLens.intensity = snowAmount;
  }
  snowLens.enabled = settings.snowLens && snowAmount > 0;
  const fogDensity = settings.fog ? weather.actualIntensity * 0.0003 : 0;
  effects.heightFogDensity = fogDensity;
  effects.showHeightFog = fogDensity > 0;
  const now = performance.now();
  if (now - lastStatus > 500) {
    lastStatus = now;
    document.getElementById("status").textContent =
      `当前强度 ${weather.actualIntensity.toFixed(2)} · 降水状态 ${(weather.textureMemoryInBytes / 1048576).toFixed(1)} MiB · 风向以东／北为水平轴`;
    document.getElementById("data-status").textContent = planar
      ? reference.name
      : `${reference.name} · ${reference.failed ? "加载失败" : reference.primitive ? (reference.primitive.tilesLoaded && reference.visible ? "当前视角已加载" : "正在流式加载…") : "正在连接 ion…"}`;
  }
});
const removeError = scene.renderError.addEventListener((...args) => {
  document.getElementById("error").textContent = args[1].message;
});
const removeTilesetEvents = [];
exposeExample(
  viewer,
  gui,
  {
    weather,
    surfaceWeather,
    rainLens,
    snowLens,
    reflections,
    effects,
    settings,
    reference,
  },
  () => {
    removeUpdate();
    removeError();
    removeTerrainError?.();
    removeImageryError?.();
    for (const remove of removeTilesetEvents) {
      remove();
    }
    viewer.removeController(effects);
    if (environment) {
      viewer.removeController(environment);
    }
  },
);

if (!planar) {
  // Collection ownership begins only after the async ion factory has completed.
  C.createOsmBuildingsAsync({
    style: new C.Cesium3DTileStyle({ color: "color('#cbd0d4')" }),
  })
    .then((tileset) => {
      if (viewer.isDestroyed()) {
        tileset.destroy();
        return;
      }
      reference.primitive = scene.primitives.add(tileset);
      removeTilesetEvents.push(
        tileset.tileVisible.addEventListener(() => {
          reference.visible = true;
        }),
        tileset.tileFailed.addEventListener(() => {
          reference.failed = true;
          document.getElementById("error").textContent =
            "建筑瓦片加载失败，请检查网络和 Cesium ion 授权。";
        }),
      );
    })
    .catch(() => {
      if (!viewer.isDestroyed()) {
        reference.failed = true;
        document.getElementById("error").textContent =
          "OSM Buildings 加载失败，请检查网络和 Cesium ion 授权。";
      }
    });
}

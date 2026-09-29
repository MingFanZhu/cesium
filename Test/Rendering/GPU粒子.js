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
            minimumX: -1000,
            minimumY: -1000,
            maximumX: 1000,
            maximumY: 1000,
          },
          maximumLevel: 0,
          baseColor: C.Color.fromCssColorString("#152a3a"),
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
scene.backgroundColor = C.Color.fromCssColorString("#091420");
scene.fog.enabled = false;
scene.msaaSamples = 1;
scene.postProcessStages.fxaa.enabled = true;
scene.sunBloom = false;
if (scene.sun) {
  scene.sun.show = false;
}
if (scene.moon) {
  scene.moon.show = false;
}
if (scene.globe) {
  scene.globe.baseColor = C.Color.fromCssColorString("#152a3a");
  scene.globe.showGroundAtmosphere = false;
  scene.globe.enableLighting = false;
}
viewer.clock.shouldAnimate = true;
viewer.clock.currentTime = C.JulianDate.fromIso8601("2026-09-29T04:00:00Z");
const modelMatrix = planar
  ? C.Matrix4.fromTranslation(new C.Cartesian3(0, 0, 1))
  : C.Transforms.eastNorthUpToFixedFrame(
      C.Cartesian3.fromDegrees(118.8, 32.07, 1),
    );
const point = (p) =>
  C.Matrix4.multiplyByPoint(modelMatrix, p, new C.Cartesian3());
const vector = (p) =>
  C.Matrix4.multiplyByPointAsVector(modelMatrix, p, new C.Cartesian3());
const direction = C.Cartesian3.normalize(
  new C.Cartesian3(-60, 80, -40),
  new C.Cartesian3(),
);
const right = C.Cartesian3.normalize(
  C.Cartesian3.cross(direction, C.Cartesian3.UNIT_Z, new C.Cartesian3()),
  new C.Cartesian3(),
);
const up = C.Cartesian3.cross(right, direction, new C.Cartesian3());
function home() {
  viewer.camera.setView({
    destination: point(new C.Cartesian3(60, -80, 55)),
    orientation: { direction: vector(direction), up: vector(up) },
  });
}
home();

const boxes = [
  { position: [0, 0, -0.5], dimensions: [80, 80, 1], color: "#294658" },
  { position: [10, 4, 5], dimensions: [5, 7, 10], color: "#8099a4" },
  { position: [-13, 10, 8], dimensions: [6, 6, 16], color: "#9babb3" },
];
scene.primitives.add(
  new C.Primitive({
    asynchronous: false,
    geometryInstances: boxes.map(
      (box) =>
        new C.GeometryInstance({
          modelMatrix: C.Matrix4.multiplyByTranslation(
            modelMatrix,
            new C.Cartesian3(...box.position),
            new C.Matrix4(),
          ),
          geometry: C.BoxGeometry.fromDimensions({
            dimensions: new C.Cartesian3(...box.dimensions),
            vertexFormat: C.PerInstanceColorAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: C.ColorGeometryInstanceAttribute.fromColor(
              C.Color.fromCssColorString(box.color),
            ),
          },
        }),
    ),
    appearance: new C.PerInstanceColorAppearance({ translucent: false }),
  }),
);

// All emitter shapes, forces and trajectories are example-specific GLSL.
const header = `uniform float u_life;
uniform float u_size;
uniform float u_speed;
uniform vec3 u_acceleration;
`;
const shaders = {
  喷泉: `${header}
void initializeParticle(inout SceneGISParticle p) {
    float angle = sceneGISParticleRandom(p.seed, 0.0) * 6.2831853;
    float spread = sqrt(sceneGISParticleRandom(p.seed, 1.0));
    p.position = vec3(cos(angle), sin(angle), 0.2) * vec3(0.8, 0.8, 1.0);
    p.velocity = vec3(cos(angle) * spread * 0.28, sin(angle) * spread * 0.28,
        0.8 + 0.2 * sceneGISParticleRandom(p.seed, 2.0)) * u_speed;
    p.life = u_life;
    p.color = vec4(mix(vec3(0.2, 0.7, 1.0), vec3(1.0, 0.55, 0.12),
        sceneGISParticleRandom(p.seed, 3.0)), 0.8);
}
void updateParticle(inout SceneGISParticle p, float dt) {
    p.position += p.velocity * dt + 0.5 * u_acceleration * dt * dt;
    p.velocity += u_acceleration * dt;
    p.size = vec2(u_size);
    p.color.a = 0.8 * (1.0 - smoothstep(0.65, 1.0, p.age / p.life));
    if (p.position.z < 0.0) { p.life = 0.0; }
}`,
  轨道: `${header}
void initializeParticle(inout SceneGISParticle p) {
    p.life = u_life;
    p.color = vec4(mix(vec3(0.2, 0.9, 0.8), vec3(0.8, 0.3, 1.0),
        sceneGISParticleRandom(p.seed, 0.0)), 0.75);
}
void updateParticle(inout SceneGISParticle p, float dt) {
    float phase = sceneGISParticleRandom(p.seed, 1.0) * 6.2831853;
    float radius = 9.0 + 17.0 * sceneGISParticleRandom(p.seed, 2.0);
    float a = phase + p.age * u_speed / radius;
    p.position = vec3(cos(a) * radius, sin(a) * radius,
        13.0 + sin(a * 2.0 + phase) * 8.0);
    p.rotation = a;
    p.size = vec2(u_size, u_size * 2.0);
    p.color.a = 0.75 * smoothstep(0.0, 0.1, p.age / p.life)
        * (1.0 - smoothstep(0.75, 1.0, p.age / p.life));
}`,
  体积漂浮: `${header}
void initializeParticle(inout SceneGISParticle p) {
    vec3 r = vec3(sceneGISParticleRandom(p.seed, 0.0),
        sceneGISParticleRandom(p.seed, 1.0), sceneGISParticleRandom(p.seed, 2.0));
    p.position = r * vec3(50.0, 50.0, 28.0) - vec3(25.0, 25.0, 0.0);
    p.velocity = (r.yzx - 0.5) * 0.2;
    p.life = u_life;
    p.color = vec4(mix(vec3(0.1, 0.55, 1.0), vec3(1.0, 0.7, 0.2), r.z), 0.65);
}
void updateParticle(inout SceneGISParticle p, float dt) {
    p.position += p.velocity * u_speed * dt;
    p.position = mod(p.position + vec3(25.0, 25.0, 0.0), vec3(50.0, 50.0, 28.0))
        - vec3(25.0, 25.0, 0.0);
    p.size = vec2(u_size);
    p.color.a = 0.65 * smoothstep(0.0, 0.1, p.age / p.life)
        * (1.0 - smoothstep(0.8, 1.0, p.age / p.life));
}`,
};
let particles;
const settings = {
  preset: "喷泉",
  capacity: 65536,
  emissionRate: 12000,
  life: 4,
  size: 0.24,
  speed: 18,
  gravity: 7,
  paused: false,
  show: true,
  reset() {
    particles.reset();
  },
  home,
};
const acceleration = new C.Cartesian3(0, 0, -settings.gravity);
function recreate() {
  if (particles) {
    scene.primitives.remove(particles);
  }
  particles = scene.primitives.add(
    new C.SceneGISGpuParticleSystem({
      maximumParticles: settings.capacity,
      emissionRate: settings.emissionRate,
      modelMatrix,
      boundingSphere: new C.BoundingSphere(C.Cartesian3.ZERO, 250),
      simulationShader: shaders[settings.preset],
      uniformMap: {
        u_life: () => settings.life,
        u_size: () => settings.size,
        u_speed: () => settings.speed,
        u_acceleration: () => acceleration,
      },
      paused: settings.paused,
      show: settings.show,
      id: "programmable-particles",
    }),
  );
  document.getElementById("shader").textContent = shaders[settings.preset];
}
recreate();
const gui = new GUI({
  title: planar ? "GPU 粒子 · 平面" : "GPU 粒子 · 球面",
  container: document.getElementById("controls"),
});
gui
  .add(settings, "preset", Object.keys(shaders))
  .name("运动示例")
  .onChange(recreate);
gui
  .add(settings, "capacity", { "16K": 16384, "64K": 65536, "256K": 262144 })
  .name("粒子池容量")
  .onChange(recreate);
gui
  .add(settings, "emissionRate", 0, 100000, 100)
  .name("每秒发射数")
  .onChange((v) => {
    particles.emissionRate = v;
  });
gui.add(settings, "life", 1, 8, 0.1).name("新粒子寿命（秒）");
gui.add(settings, "size", 0.04, 0.8, 0.01).name("尺寸（米）");
gui.add(settings, "speed", 0, 24, 0.1).name("运动速度参数");
gui
  .add(settings, "gravity", 0, 20, 0.1)
  .name("喷泉重力参数")
  .onChange((v) => {
    acceleration.z = -v;
  });
gui
  .add(settings, "paused")
  .name("暂停模拟")
  .onChange((v) => {
    particles.paused = v;
  });
gui
  .add(settings, "show")
  .name("显示粒子")
  .onChange((v) => {
    particles.show = v;
  });
gui.add(settings, "reset").name("清空并重新发射");
gui.add(settings, "home").name("还原视角");
let lastStatus = 0;
const removeStatus = scene.postRender.addEventListener(() => {
  const now = performance.now();
  if (now - lastStatus < 500) {
    return;
  }
  lastStatus = now;
  document.getElementById("status").textContent =
    `容量 ${particles.maximumParticles.toLocaleString()} · 状态纹理 ${(particles.textureMemoryInBytes / 1048576).toFixed(1)} MiB · ${settings.paused ? "已暂停" : settings.emissionRate === 0 ? "停止发射" : "运行中"}`;
});
const removeError = scene.renderError.addEventListener((...[, error]) => {
  document.getElementById("error").textContent = error.message;
});
exposeExample(
  viewer,
  gui,
  { settings, shaders, modelMatrix, getParticles: () => particles },
  () => {
    removeStatus();
    removeError();
  },
);

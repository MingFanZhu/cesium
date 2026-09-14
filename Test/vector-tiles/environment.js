/* global document */
import * as C from "/Build/CesiumUnminified/index.js";

// Page-owned composition using the existing environment and shadow APIs.
export default function installEnvironment(viewer, globe, getLocation) {
  const scene = viewer.scene,
    world = scene.world;
  const clock = viewer.clock;
  const cloudEpoch = C.JulianDate.fromIso8601("2026-06-21T00:00:00Z");
  clock.startTime = C.JulianDate.clone(cloudEpoch);
  clock.stopTime = C.JulianDate.addDays(cloudEpoch, 1, new C.JulianDate());
  clock.currentTime = C.JulianDate.addHours(
    cloudEpoch,
    12 - getLocation()[0] / 15,
    new C.JulianDate(),
  );
  clock.clockRange = C.ClockRange.UNBOUNDED;
  clock.clockStep = C.ClockStep.SYSTEM_CLOCK_MULTIPLIER;
  clock.multiplier = 600;
  clock.shouldAnimate = false;
  viewer.timeline.zoomTo(clock.startTime, clock.stopTime);

  const toggle = (id, property, label) =>
    `<label class="toggle"><input id="env-${id}" data-property="${property}" type="checkbox" checked />${label}</label>`;
  const number = (property, label, value, min, max, step, scale = 1) =>
    `<label class="env-number" for="env-${property}"><span>${label}</span><input id="env-${property}" data-property="${property}" data-scale="${scale}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" required /></label>`;
  const panel = document.createElement("details");
  panel.id = "environment-panel";
  panel.open = true;
  panel.innerHTML = `<summary>高级环境</summary>
    <label class="toggle"><input id="env-enabled" type="checkbox" />高级大气与物理光照</label>
    <label for="env-light">观察时段</label><select id="env-light">
      <option value="day">白天</option><option value="sunset">低日照</option><option value="night">夜间</option><option value="custom">自定义 · 时间轴</option></select>
    <p class="hint">底部使用 Cesium 原生时间轴与播放控件（UTC）。拖动时间轴改变日照，播放时云随时间移动。</p>
    <label for="env-quality">体积云品质</label><select id="env-quality" data-property="cloudQuality">
      <option value="medium">中</option><option value="high">高</option><option value="low">低</option></select>
    ${toggle("clouds", "showClouds", "体积云")}
    ${toggle("cloud-shadows", "showCloudShadows", "云影")}
    ${toggle("fog", "showHeightFog", "高度雾")}
    ${toggle("rays", "showCrepuscularRays", "体积光")}
    ${globe ? '<label class="toggle"><input id="env-shadows" type="checkbox" />原生地形与物体阴影</label>' : ""}
    <details class="env-settings"><summary>光照与大气参数</summary>
      ${toggle("atmosphere", "showAtmosphere", "大气天空")}
      ${toggle("aerial", "showAerialPerspective", "空气透视")}
      ${toggle("moonlight", "showMoonlight", "月光")}
      ${number("surfaceRadianceScale", "地表亮度", 10, 0, 64, 0.1)}
      ${number("backgroundRadianceScale", "天空亮度", globe ? 4 : 10, 0, 64, 0.1)}
      ${number("aerialRadianceScale", "空气散射强度", 1, 0, 64, 0.1)}
      ${number("moonlightIntensity", "月光强度", 1, 0, 64, 0.1)}
    </details>
    <details class="env-settings"><summary>云层参数</summary>
      <label for="env-cloudPreset">云型</label><select id="env-cloudPreset" data-property="cloudPreset">
        <option value="cumulus">积云</option><option value="stratus">层云</option><option value="cirrus">卷云</option><option value="mixed">混合云</option></select>
      ${number("cloudCoverage", "云量", globe ? 0.3 : 0.45, 0, 1, 0.01)}
      ${number("cloudDensity", "云密度", 1, 0, 64, 0.1)}
      ${number("cloudBaseHeight", "云底高度（米）", globe ? 750 : 1500, -500, 20000, 50)}
      ${number("cloudThickness", "云层厚度（米）", 4500, 0, 20000, 50)}
      ${number("cloudWindSpeed", "风速（米/秒）", 20, 0, 200, 1)}
      ${number("cloudWindDirection", "风向（度）", 45, -180, 180, 1, Math.PI / 180)}
      ${number("cloudRadianceScale", "云层亮度", 1, 0, 64, 0.1)}
    </details>
    <details class="env-settings"><summary>雾与泛光参数</summary>
      ${number("heightFogDensity", "雾密度（×10⁻⁶/米）", 8, 0, 1000, 0.5, 0.000001)}
      ${number("heightFogBaseHeight", "雾基准高度（米）", 0, -60000, 60000, 50)}
      ${number("heightFogStartDistance", "起雾距离（米）", 250, 0, 300000, 50)}
      ${number("heightFogMaximumOpacity", "雾最大不透明度", 0.7, 0, 1, 0.01)}
      ${toggle("bloom", "showBloom", "泛光")}
      ${number("bloomIntensity", "泛光强度", 0.05, 0, 64, 0.01)}
      ${number("bloomThreshold", "泛光阈值", 10, 0, 65504, 0.1)}
      ${toggle("flare", "showLensFlare", "镜头光晕")}
      ${number("lensFlareIntensity", "光晕强度", 5, 0, 64, 0.1)}
    </details>
    <button id="env-reset" class="env-reset" type="button">恢复环境默认参数</button>
    <p id="env-status" class="hint">环境关闭；保持基础地图。</p>`;
  document.getElementById("terrain-status").after(panel);
  const element = (id) => panel.querySelector(`#env-${id}`);
  const controls = Array.from(panel.querySelectorAll("[data-property]"));
  const defaults = controls.map((control) =>
    control.type === "checkbox" ? control.checked : control.value,
  );
  let effects, planar, saved, error, removeError;
  let presetTime = C.JulianDate.clone(clock.currentTime);
  function synchronizeTime() {
    if (effects) {
      effects.cloudTime = C.JulianDate.secondsDifference(
        clock.currentTime,
        cloudEpoch,
      );
    }
    if (presetTime && !C.JulianDate.equals(clock.currentTime, presetTime)) {
      element("light").value = "custom";
      presetTime = undefined;
    }
  }
  function updateLocation() {
    if (planar) {
      const [longitude, latitude] = getLocation();
      planar.originLongitude = C.Math.toRadians(longitude);
      planar.originLatitude = C.Math.toRadians(latitude);
    }
    element("light").value = "custom";
    presetTime = undefined;
    scene.requestRender();
  }
  function lighting() {
    const mode = element("light").value;
    if (mode === "custom") {
      return;
    }
    const [longitude] = getLocation();
    const hour = mode === "day" ? 12 : mode === "sunset" ? 18 : 0;
    const date = C.JulianDate.toDate(
      C.JulianDate.addHours(
        clock.currentTime,
        longitude / 15,
        new C.JulianDate(),
      ),
    );
    clock.currentTime = C.JulianDate.fromDate(
      new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          hour,
        ) -
          (longitude / 15) * 3600000,
      ),
    );
    clock.shouldAnimate = false;
    presetTime = C.JulianDate.clone(clock.currentTime, presetTime);
    viewer.timeline.zoomTo(
      C.JulianDate.addHours(presetTime, -12, new C.JulianDate()),
      C.JulianDate.addHours(presetTime, 12, new C.JulianDate()),
    );
    synchronizeTime();
    scene.requestRender();
  }
  function applyControl(control) {
    if (effects && control.validity.valid) {
      effects[control.dataset.property] =
        control.type === "checkbox"
          ? control.checked
          : control.type === "number"
            ? control.valueAsNumber * Number(control.dataset.scale)
            : control.value;
      scene.requestRender();
    }
  }
  function configure() {
    controls.forEach(applyControl);
  }
  function disable() {
    removeError?.();
    removeError = undefined;
    if (effects) {
      viewer.removeController(effects);
    }
    if (planar) {
      viewer.removeController(planar);
    }
    effects = planar = undefined;
    if (saved) {
      scene.highDynamicRange = saved.hdr;
      world.enableLighting = saved.lighting;
      if (globe) {
        world.showGroundAtmosphere = saved.groundAtmosphere;
      }
      scene.light = saved.light;
      scene.sunBloom = saved.sunBloom;
      scene.fog.enabled = saved.fog;
      scene.postProcessStages.bloom.enabled = saved.bloom;
      for (const [object, show] of saved.bodies) {
        object.show = show;
      }
      saved = undefined;
    }
    error = undefined;
    element("enabled").checked = false;
    scene.requestRender();
  }
  function enable() {
    saved = {
      hdr: scene.highDynamicRange,
      lighting: world.enableLighting,
      groundAtmosphere: globe ? world.showGroundAtmosphere : undefined,
      light: scene.light,
      sunBloom: scene.sunBloom,
      fog: scene.fog.enabled,
      bloom: scene.postProcessStages.bloom.enabled,
      bodies: [scene.skyAtmosphere, scene.skyBox, scene.sun, scene.moon]
        .filter(Boolean)
        .map((object) => [object, object.show]),
    };
    scene.highDynamicRange = true;
    if (globe) {
      world.enableLighting = false;
      world.showGroundAtmosphere = false;
      scene.light = new C.SunLight();
    }
    scene.sunBloom = false;
    scene.fog.enabled = false;
    scene.postProcessStages.bloom.enabled = false;
    for (const [object] of saved.bodies) {
      object.show = false;
    }
    if (globe && scene.moon) {
      scene.moon.show = true;
    }
    if (!globe) {
      planar = new C.SceneGISPlanarEnvironment({
        world,
        showAtmosphere: false,
        showSun: false,
        showMoon: false,
        directionMode: "astronomical",
        originLongitude: C.Math.toRadians(getLocation()[0]),
        originLatitude: C.Math.toRadians(getLocation()[1]),
        sunDirection: new C.Cartesian3(0.45, 0.2, 0.87),
        moonDirection: new C.Cartesian3(-0.5, -0.2, 0.8),
      });
      viewer.addController(planar);
    }
    effects = new C.SceneGISEnvironmentEffects({
      mode: globe ? "globe" : "planar",
      world: globe ? undefined : world,
      enabled: true,
      cloudQuality: element("quality").value,
    });
    removeError = effects.errorEvent.addEventListener((...args) => {
      error = args[1].message;
    });
    viewer.addController(effects);
    configure();
    synchronizeTime();
  }
  element("enabled").onchange = () => {
    try {
      if (element("enabled").checked) {
        enable();
      } else {
        disable();
      }
    } catch (value) {
      disable();
      error = value.message;
      element("status").textContent = error;
    }
  };
  element("light").onchange = lighting;
  for (const control of controls) {
    control.addEventListener(
      control.type === "number" ? "input" : "change",
      () => applyControl(control),
    );
  }
  element("reset").onclick = () => {
    controls.forEach((control, index) => {
      if (control.type === "checkbox") {
        control.checked = defaults[index];
      } else {
        control.value = defaults[index];
      }
    });
    configure();
  };
  const removeTick = clock.onTick.addEventListener(synchronizeTime);
  if (globe) {
    element("shadows").onchange = () => {
      scene.shadowMap.enabled = element("shadows").checked;
      world.shadows = C.ShadowMode.ENABLED;
      scene.requestRender();
    };
  }
  const removePost = scene.postRender.addEventListener(() => {
    element("status").textContent = error
      ? `环境错误：${error}`
      : !effects
        ? "环境关闭；保持基础地图。"
        : effects.ready
          ? "高级环境已就绪 · 地表物理光照"
          : "正在准备环境资源…";
  });
  return {
    get effects() {
      return effects;
    },
    get error() {
      return error;
    },
    updateLocation,
    setBaseLight(light) {
      if (saved) {
        saved.light = light;
      } else {
        scene.light = light;
      }
    },
    setBaseLighting(enabled) {
      if (saved) {
        saved.lighting = enabled;
        if (globe) {
          return;
        }
      }
      world.enableLighting = enabled;
    },
    destroy() {
      removeTick();
      removePost();
      disable();
    },
  };
}

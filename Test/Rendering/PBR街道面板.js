// Development-only assembly of the existing environment and rendering controls.
export default function createStreetControls(options) {
  const {
    gui,
    viewer,
    state,
    atmosphere,
    lighting,
    rendering,
    effects,
    autoExposure,
    ssr,
    ssil,
    taa,
    probeOptions,
    views,
  } = options;
  const refresh = () => {
    taa.reset();
    ssr.reset();
    viewer.scene.requestRender();
  };
  const bind = (
    folder,
    object,
    property,
    label,
    range = [],
    changed = refresh,
  ) =>
    folder
      .add(object, property, ...range)
      .name(label)
      .listen()
      .onChange(changed);
  const environment = (folder, property, label, range = []) =>
    bind(folder, atmosphere, property, label, range, state.applyAtmosphere);
  const render = (folder, property, label, range = []) =>
    bind(folder, rendering, property, label, range, () => {
      state.apply();
      refresh();
    });

  const time = gui.addFolder("场景与时间（UTC / GMT）");
  bind(time, state, "view", "固定视角", [Object.keys(views)], state.resetView);
  time.add(state, "resetView").name("恢复固定视角");
  bind(time, atmosphere, "day", "年内日序（2026）", [1, 365, 1], state.setTime);
  bind(
    time,
    atmosphere,
    "hour",
    "时间（UTC 小时）",
    [0, 23.99, 0.05],
    state.setTime,
  );
  bind(time, state, "animate", "播放时间（太阳）", [], state.setAnimation);
  bind(time, viewer.clock, "multiplier", "时间倍速", [1, 3600, 1]);
  time.add(state, "resetAtmosphere").name("恢复默认时间与大气");

  const sky = gui.addFolder("物理大气与光照").close();
  environment(sky, "mode", "照明模式", [["物理大气", "固定 IBL"]]);
  environment(sky, "showAtmosphere", "物理天空");
  environment(sky, "showAerialPerspective", "空气透视");
  environment(sky, "backgroundRadianceScale", "天空亮度", [0, 16, 0.1]);
  environment(sky, "aerialRadianceScale", "空气散射亮度", [0, 4, 0.05]);
  environment(sky, "surfaceRadianceScale", "太阳与天空总倍率", [0, 8, 0.1]);
  bind(
    sky,
    lighting,
    "diffuse",
    "天空漫反射权重",
    [0, 1, 0.05],
    state.applyLighting,
  );
  bind(
    sky,
    lighting,
    "specular",
    "环境镜面权重",
    [0, 1, 0.05],
    state.applyLighting,
  );
  bind(sky, effects, "showMoonlight", "月光");
  bind(sky, effects, "moonlightIntensity", "月光强度", [0, 64, 0.1]);

  const clouds = gui.addFolder("体积云与云影").close();
  for (const [property, label] of [
    ["showClouds", "体积云"],
    ["showCloudShadows", "云影"],
    ["showCrepuscularRays", "体积光"],
  ]) {
    bind(clouds, effects, property, label);
  }
  bind(clouds, effects, "cloudQuality", "云质量", [
    { 低: "low", 中: "medium", 高: "high" },
  ]);
  bind(clouds, effects, "cloudPreset", "云类型", [
    { 积云: "cumulus", 层云: "stratus", 卷云: "cirrus", 混合: "mixed" },
  ]);
  bind(clouds, effects, "cloudCoverage", "云覆盖率", [0, 1, 0.01]);
  bind(clouds, effects, "cloudDensity", "云密度", [0, 64, 0.01]);
  bind(clouds, effects, "cloudRadianceScale", "云亮度", [0, 64, 0.1]);

  const fog = gui.addFolder("高度雾").close();
  environment(fog, "showHeightFog", "启用高度雾");
  environment(fog, "heightFogDensity", "雾密度（每米）", [0, 0.001, 0.00001]);
  environment(
    fog,
    "heightFogHeightFalloff",
    "高度衰减（每米）",
    [0, 0.001, 0.00001],
  );
  environment(fog, "heightFogBaseHeight", "雾基准高度（米）", [-10, 100, 1]);
  environment(fog, "heightFogStartDistance", "起雾距离（米）", [0, 100, 1]);
  environment(fog, "heightFogMaximumOpacity", "最大不透明度", [0, 1, 0.05]);

  const hdr = gui.addFolder("HDR 与曝光").close();
  environment(hdr, "exposure", "曝光倍率", [0.1, 4, 0.05]);
  bind(hdr, autoExposure, "enabled", "自动曝光");
  bind(hdr, autoExposure, "locked", "锁定当前曝光");
  bind(
    hdr,
    autoExposure,
    "exposureCompensation",
    "曝光补偿（档）",
    [-3, 3, 0.1],
  );
  const metering = hdr.addFolder("自动测光与适应").close();
  for (const [property, label, min, max, step] of [
    ["minimumExposure", "最低自动倍率", 1 / 64, 1, 1 / 64],
    ["maximumExposure", "最高自动倍率", 1, 64, 0.5],
    ["speedUp", "适应亮处（档/秒）", 0.1, 10, 0.1],
    ["speedDown", "适应暗处（档/秒）", 0.1, 10, 0.1],
    ["centerWeight", "中央测光权重", 0, 1, 0.05],
    ["lowPercent", "忽略暗部比例", 0, 0.4, 0.01],
    ["highPercent", "保留亮度上限分位", 0.6, 1, 0.01],
  ]) {
    bind(metering, autoExposure, property, label, [min, max, step]);
  }
  metering.add(autoExposure, "reset").name("立即重新测光");
  bind(hdr, effects, "showBloom", "泛光");
  bind(hdr, effects, "bloomThreshold", "泛光阈值", [0, 64, 0.1]);
  bind(hdr, effects, "bloomIntensity", "泛光强度", [0, 4, 0.01]);
  bind(hdr, effects, "showLensFlare", "镜头光晕");
  bind(hdr, effects, "lensFlareIntensity", "光晕强度", [0, 4, 0.1]);

  const shadows = gui.addFolder("几何阴影").close();
  render(shadows, "shadows", "启用几何阴影");
  bind(
    shadows,
    lighting,
    "shadowDarkness",
    "阴影内直射保留",
    [0, 1, 0.05],
    state.applyLighting,
  );
  bind(
    shadows,
    lighting,
    "shadowSize",
    "每级阴影分辨率",
    [{ 2048: 2048, 4096: 4096 }],
    state.applyLighting,
  );
  bind(
    shadows,
    lighting,
    "shadowDistance",
    "阴影距离（米）",
    [60, 500, 10],
    state.applyLighting,
  );
  bind(shadows, lighting, "softShadows", "阴影柔化", [], state.applyLighting);

  const ao = gui.addFolder("环境光遮蔽").close();
  render(ao, "ao", "启用环境光遮蔽");
  render(ao, "aoIntensity", "遮蔽强度", [0, 2, 0.05]);
  render(ao, "aoRadius", "遮蔽半径（米）", [0.1, 2, 0.1]);
  const reflection = gui.addFolder("屏幕空间反射").close();
  render(reflection, "ssr", "启用屏幕空间反射");
  bind(reflection, ssr, "resolutionScale", "反射分辨率", [
    { 半分辨率: 0.5, 全分辨率: 1 },
  ]);
  bind(reflection, ssr, "temporalFiltering", "反射时域滤波");
  reflection.add(ssr, "reset").name("清除反射历史");
  const indirect = gui.addFolder("屏幕空间间接光").close();
  render(indirect, "ssil", "启用屏幕空间间接光");
  bind(indirect, ssil, "intensity", "间接光强度", [0, 4, 0.05]);
  bind(indirect, ssil, "radius", "间接光距离（米）", [0.5, 20, 0.5]);
  bind(indirect, ssil, "thickness", "间接光厚度（米）", [0.05, 2, 0.05]);
  const aa = gui.addFolder("抗锯齿").close();
  render(aa, "antialiasing", "抗锯齿方式", [
    ["无 AA", "FXAA", "TAA", "4×MSAA"],
  ]);
  render(aa, "specularAA", "高光抗锯齿");

  const probes = gui.addFolder("局部探针（手动捕获）").close();
  const captureButton = probes
    .add(probeOptions, "capture")
    .name("捕获 / 更新局部环境");
  for (const [property, label] of [
    ["show", "启用局部探针"],
    ["occlusion", "环境遮挡"],
    ["reflections", "局部镜面反射"],
  ]) {
    bind(probes, probeOptions, property, label, [], () => {
      probeOptions.apply();
      refresh();
    });
  }
  probes.add(probeOptions, "x", -100, 150, 0.5).name("探针 X（米）");
  probes.add(probeOptions, "y", -100, 100, 0.5).name("探针 Y（米）");
  probes.add(probeOptions, "z", 0.5, 40, 0.5).name("探针 Z（米）");
  probes.add(probeOptions, "range", 5, 60, 1).name("水平半宽（米）");
  gui.add(state, "exportConfig").name("导出验收配置");
  return captureButton;
}

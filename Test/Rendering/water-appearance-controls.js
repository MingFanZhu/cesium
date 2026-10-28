import * as C from "/Build/CesiumUnminified/index.js";

// Demonstration palettes, not measured water-quality data. Coefficients are per meter.
const presets = {
  清水: {
    absorption: [0.18, 0.055, 0.028],
    scattering: [0.012, 0.018, 0.016],
    g: 0.35,
  },
  湖水: {
    absorption: [0.35, 0.12, 0.075],
    scattering: [0.1, 0.16, 0.11],
    g: 0.45,
  },
  河水: {
    absorption: [0.28, 0.14, 0.09],
    scattering: [0.14, 0.17, 0.105],
    g: 0.45,
  },
  浑水: { absorption: [0.6, 0.8, 1.15], scattering: [1.2, 0.95, 0.6], g: 0.4 },
};

function cssToLinear(css) {
  const c = C.Color.fromCssColorString(css);
  return [c.red, c.green, c.blue].map((v) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
}

function linearToCss(rgb) {
  return new C.Color(
    ...rgb.map((v) =>
      v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055,
    ),
  ).toCssHexString();
}

// GUI assembly only. Resolve current surfaces when applying edits or after reconstruction.
export default function waterAppearanceControls(gui, getSurfaces, options) {
  const state = {
    preset: options.preset,
    transmissionColor: "#ffffff",
    colorDistance: 5,
    scatteringColor: "#ffffff",
    turbidity: 0,
    anisotropy: 0,
    roughness: 0.12,
    refractionStrength: 0.2,
    foamWidth: options.foamWidth,
    foamIntensity: options.foamIntensity,
  };
  function apply() {
    const absorption = cssToLinear(state.transmissionColor).map(
      (v) => -Math.log(Math.max(v, 1e-4)) / state.colorDistance,
    );
    const scattering = cssToLinear(state.scatteringColor).map(
      (v) => v * state.turbidity,
    );
    for (const surface of getSurfaces()) {
      surface.absorption = new C.Cartesian3(...absorption);
      surface.scattering = new C.Cartesian3(...scattering);
      surface.scatteringAnisotropy = state.anisotropy;
      for (const key of [
        "roughness",
        "refractionStrength",
        "foamWidth",
        "foamIntensity",
      ]) {
        surface[key] = state[key];
      }
    }
  }
  function applyPreset() {
    const preset = presets[state.preset];
    if (!preset) {
      return;
    }
    state.colorDistance = 5;
    state.transmissionColor = linearToCss(
      preset.absorption.map((a) => Math.exp(-a * state.colorDistance)),
    );
    state.turbidity = Math.max(...preset.scattering);
    state.scatteringColor = linearToCss(
      preset.scattering.map((s) => s / state.turbidity),
    );
    state.anisotropy = preset.g;
    apply();
  }
  function editColors() {
    state.preset = "自定义";
    apply();
  }
  const colors = gui.addFolder("水体颜色");
  colors
    .add(state, "preset", [...Object.keys(presets), "自定义"])
    .name("水体预设")
    .listen()
    .onChange(applyPreset);
  colors
    .addColor(state, "transmissionColor")
    .name("透射颜色")
    .listen()
    .onChange(editColors);
  colors
    .add(state, "colorDistance", 0.2, 30, 0.1)
    .name("着色距离（米）")
    .listen()
    .onChange(editColors);
  colors
    .addColor(state, "scatteringColor")
    .name("散射颜色")
    .listen()
    .onChange(editColors);
  colors
    .add(state, "turbidity", 0, 3, 0.005)
    .name("浑浊度（每米）")
    .listen()
    .onChange(editColors);
  colors
    .add(state, "anisotropy", -0.9, 0.9, 0.05)
    .name("散射方向性")
    .listen()
    .onChange(editColors);
  const surface = gui.addFolder("水面与岸沫").close();
  for (const [key, label, min, max, step] of [
    ["roughness", "水面粗糙度", 0.02, 0.6, 0.01],
    ["refractionStrength", "折射强度", 0, 1, 0.01],
    ["foamWidth", "岸沫范围（米）", 0, 2, 0.05],
    ["foamIntensity", "岸沫强度", 0, 1, 0.05],
  ]) {
    surface.add(state, key, min, max, step).name(label).onChange(apply);
  }
  applyPreset();
  return { state, apply };
}

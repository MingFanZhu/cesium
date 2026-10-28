import {
  Cartesian3,
  Framebuffer,
  PixelDatatype,
  PixelFormat,
  Texture,
} from "../../../index.js";
import optics from "../../../Source/Shaders/SceneGIS/Water/SceneGISWaterOptics.js";
import effects from "../../../Source/Shaders/SceneGIS/Water/SceneGISWaterEffects.js";
import createContext from "../../../../../Specs/createContext.js";

describe("SceneGIS/Scene/SceneGISWaterOptics", function () {
  let context, target, command;
  const state = {
    absorption: new Cartesian3(0.2, 0.1, 0),
    scattering: new Cartesian3(0.05, 0.3, 0),
    background: new Cartesian3(0.8, 0.5, 0.2),
    direct: new Cartesian3(0.7, 0.4, 0.2),
    sky: new Cartesian3(0.1, 0.2, 0.4),
    distance: 2,
    viewCosine: 0.6,
    lightCosine: 0.8,
    hasBottom: true,
    cosine: 0,
    g: 0,
  };
  beforeEach(function () {
    context = createContext();
    target = new Framebuffer({
      context,
      colorTextures: [
        new Texture({
          context,
          width: 1,
          height: 1,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
        }),
      ],
    });
  });
  afterEach(function () {
    command?.shaderProgram.destroy();
    command = undefined;
    target.destroy();
    context.destroyForSpecs();
  });
  function draw(body) {
    command ??= context.createViewportQuadCommand(
      `${optics}\n${effects}
      uniform vec3 u_absorption, u_scattering, u_background, u_direct, u_sky;
      uniform float u_distance, u_viewCosine, u_lightCosine, u_cosine, u_g;
      uniform bool u_hasBottom;
      void main() { ${body} }`,
      {
        framebuffer: target,
        uniformMap: Object.fromEntries(
          Object.keys(state).map((key) => [`u_${key}`, () => state[key]]),
        ),
      },
    );
    command.execute(context);
    return Array.from(
      context.readPixels({ framebuffer: target, width: 1, height: 1 }),
    );
  }
  it("matches independent single-scattering quadrature including transparent, thin and deep limits", function () {
    // Midpoint integration along the viewing ray, independently including incident-light depth.
    function reference(channel) {
      const a = state.absorption[channel],
        s = state.scattering[channel],
        extinction = a + s;
      if (extinction === 0) {
        return state.hasBottom ? state.background[channel] : 0;
      }
      const length = state.hasBottom ? state.distance : 40 / extinction;
      const step = length / 16000;
      let sum = 0;
      for (let i = 0; i < 16000; i++) {
        const distance = (i + 0.5) * step;
        const depth = distance * state.viewCosine;
        sum +=
          s *
          Math.exp(-extinction * distance) *
          (state.direct[channel] *
            Math.exp((-extinction * depth) / state.lightCosine) +
            state.sky[channel] * Math.exp((-extinction * depth) / (2 / 3))) *
          step;
      }
      return (
        sum +
        (state.hasBottom
          ? state.background[channel] * Math.exp(-extinction * length)
          : 0)
      );
    }
    const body = `out_FragColor = vec4(sceneGISWaterMedium(u_background, u_absorption, u_scattering,
      u_distance, u_hasBottom, u_viewCosine, u_lightCosine, u_direct, u_sky), 1.0);`;
    for (const distance of [0, 0.00001, 2, 50]) {
      state.hasBottom = true;
      state.distance = distance;
      expect(draw(body).slice(0, 3)).toEqualEpsilon(
        ["x", "y", "z"].map(reference),
        0.00001,
      );
    }
    state.hasBottom = false;
    expect(draw(body).slice(0, 3)).toEqualEpsilon(
      ["x", "y", "z"].map(reference),
      0.00001,
    );
  });
  it("normalizes HG and distinguishes forward from backward scattering", function () {
    const body =
      "out_FragColor = vec4(sceneGISWaterPhase(u_cosine, u_g), 0.0, 0.0, 1.0);";
    state.g = 0;
    expect(draw(body)[0]).toEqualEpsilon(1 / (4 * Math.PI), 0.000001);
    state.g = 0.6;
    state.cosine = 1;
    const forward = draw(body)[0];
    state.cosine = -1;
    const backward = draw(body)[0];
    expect(forward).toBeGreaterThan(backward * 10);
    state.g = -0.6;
    expect(draw(body)[0]).toEqualEpsilon(forward, 0.000001);
    // Integrate production HG over the sphere in the shader, not a copied CPU formula.
    command.shaderProgram.destroy();
    command = undefined;
    state.g = 0.6;
    expect(
      draw(`float sum = 0.0;
      for (int i = 0; i < 2048; i++) {
        sum += sceneGISWaterPhase(-1.0 + (float(i) + 0.5) / 1024.0, u_g);
      }
      out_FragColor = vec4(sum * (czm_pi / 512.0), 0.0, 0.0, 1.0);`)[0],
    ).toEqualEpsilon(1, 0.0001);
  });
  it("integrates underwater rays toward and away from light, including the parallel exponent limit", function () {
    state.absorption = new Cartesian3(0.2, 0.1, 0);
    state.scattering = new Cartesian3(0.05, 0.3, 0);
    state.lightCosine = 0.8;
    const body = `out_FragColor = vec4(sceneGISWaterUnderwater(u_background, u_absorption, u_scattering,
      u_distance, 3.0, 3.0 - u_distance * u_viewCosine, u_direct, u_sky, u_lightCosine), 1.0);`;
    for (const slope of [-0.6, 0, 0.8, 0.800001]) {
      state.viewCosine = slope;
      state.distance = 2;
      const reference = ["x", "y", "z"].map((c) => {
        const ext = state.absorption[c] + state.scattering[c];
        let value = state.background[c] * Math.exp(-ext * state.distance);
        const dt = state.distance / 16000;
        for (let i = 0; i < 16000; ++i) {
          const t = (i + 0.5) * dt,
            depth = 3 - slope * t;
          value +=
            state.scattering[c] *
            Math.exp(-ext * t) *
            (state.direct[c] * Math.exp((-ext * depth) / 0.8) +
              state.sky[c] * Math.exp((-ext * depth) / (2 / 3))) *
            dt;
        }
        return value;
      });
      expect(draw(body).slice(0, 3)).toEqualEpsilon(reference, 0.00002);
    }
  });
  it("uses the physical water-to-air critical angle", function () {
    const body =
      "out_FragColor = vec4(sceneGISWaterExitFresnel(u_cosine), 0.0, 0.0, 1.0);";
    state.cosine = 1;
    expect(draw(body)[0]).toEqualEpsilon(
      ((1.333 - 1) / (1.333 + 1)) ** 2,
      1e-6,
    );
    state.cosine = 0.5;
    expect(draw(body)[0]).toBe(1);
    state.cosine = 0.8;
    expect(draw(body)[0]).toBeLessThan(1);
  });
});

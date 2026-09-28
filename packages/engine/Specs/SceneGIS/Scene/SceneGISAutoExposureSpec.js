import {
  Color,
  PixelDatatype,
  PixelFormat,
  SceneGISAutoExposure,
  Texture,
  Tonemapper,
  RuntimeError,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISAutoExposure", function () {
  let scene, effect, input, now;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(32, 32) });
    scene.highDynamicRange = true;
    scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
    scene.fog.enabled = false;
    scene.postProcessStages.fxaa.enabled = false;
    scene.backgroundColor = new Color(0.18, 0.18, 0.18, 1);
    scene.renderForSpecs();
    effect = new SceneGISAutoExposure({
      scene,
      enabled: true,
      centerWeight: 0,
    });
    now = spyOn(performance, "now").and.callThrough();
  });
  afterEach(function () {
    input?.destroy();
    input = undefined;
    if (!scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
  });
  function source(value, width = 32, height = 32) {
    input?.destroy();
    const data = new Float32Array(width * height * 4);
    for (let y = 0; y < height; ++y) {
      for (let x = 0; x < width; ++x) {
        const v = typeof value === "function" ? value(x, y) : value;
        data.set([v, v, v, 1], 4 * (y * width + x));
      }
    }
    input = new Texture({
      context: scene.context,
      width,
      height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      source: { width, height, arrayBufferView: data },
    });
  }
  function meter(timestamp = 0) {
    now.and.returnValue(timestamp);
    scene.postProcessStages.update(scene.context, false, true);
    scene.postProcessStages.execute(
      scene.context,
      input,
      scene.context.defaultTexture,
      scene.context.defaultTexture,
    );
    return Array.from(
      scene.context.readPixels({
        framebuffer: effect._state.result.framebuffer,
        width: 1,
        height: 1,
      }),
    );
  }
  function renderPixel() {
    scene.renderForSpecs();
    return Array.from(
      scene.context.readPixels({ x: 16, y: 16, width: 1, height: 1 }),
    );
  }

  it("validates options atomically and attaches only one controller", function () {
    expect(function () {
      return new SceneGISAutoExposure({ scene });
    }).toThrowDeveloperError();
    effect.destroy();
    expect(function () {
      return new SceneGISAutoExposure({
        scene,
        lowPercent: 0.9,
        highPercent: 0.8,
      });
    }).toThrowDeveloperError();
    expect(scene.postProcessStages._sceneGISAutoExposure).toBeUndefined();
    effect = new SceneGISAutoExposure({ scene });
    expect(effect.enabled).toBe(false);
    expect(effect.ready).toBe(false);
    expect(effect._state).toBeUndefined();
    expect(function () {
      effect.minimumExposure = 100;
    }).toThrowDeveloperError();
    expect(function () {
      effect.speedUp = 0;
    }).toThrowDeveloperError();
    expect(function () {
      effect.lowPercent = effect.highPercent - 1e-10;
    }).toThrowDeveloperError();
    expect(function () {
      effect.exposureCompensation = NaN;
    }).toThrowDeveloperError();
    expect(function () {
      effect.locked = 1;
    }).toThrowDeveloperError();
    scene.highDynamicRange = false;
    expect(function () {
      effect.enabled = true;
    }).toThrowError(RuntimeError);
    expect(effect.enabled).toBe(false);
  });

  it("meters linear HDR to middle gray and handles black and gain limits", function () {
    source(0.09);
    let result = meter();
    expect(result[0]).toEqualEpsilon(0.5, 0.0001);
    expect(result[1]).toEqualEpsilon(1, 0.0001);
    expect(result[3]).toEqualEpsilon(Math.log2(0.09), 0.0001);
    source(18);
    effect.reset();
    result = meter(1);
    expect(result[0]).toEqualEpsilon(64, 0.001);
    source(0);
    effect.reset();
    result = meter(2);
    expect(result[1]).toEqualEpsilon(6, 0.001);
    expect(result.every(Number.isFinite)).toBe(true);
  });

  it("clips rare dark and bright outliers using histogram percentiles", function () {
    source((x) => (x === 0 ? 10000 : x === 63 ? 0.0001 : 0.18), 64, 64);
    const trimmed = meter();
    expect(trimmed[1]).toEqualEpsilon(0, 0.001);
    effect.lowPercent = 0;
    effect.highPercent = 1;
    effect.reset();
    expect(Math.abs(meter(1)[1])).toBeGreaterThan(0.05);
  });

  it("weights the center rather than an equally sized bright border", function () {
    source((x, y) => (x >= 8 && x < 24 && y >= 8 && y < 24 ? 0.09 : 1.8));
    const uniform = meter()[1];
    effect.centerWeight = 1;
    effect.reset();
    expect(meter(1)[1]).toBeGreaterThan(uniform + 0.8);
  });

  it("adapts independently of frame rate across linear and exponential travel", function () {
    function run(fps) {
      source(0.18);
      effect.reset();
      meter(0);
      source(0.18 / 16);
      for (let i = 1; i <= fps * 3; ++i) {
        meter((1000 * i) / fps);
      }
      return Array.from(
        scene.context.readPixels({
          framebuffer: effect._state.result.framebuffer,
          width: 1,
          height: 1,
        }),
      )[1];
    }
    const a = run(30),
      b = run(60);
    expect(a).toEqualEpsilon(b, 0.0001);
    expect(a).toEqualEpsilon(4 - 1.5 * Math.exp(-0.5 / 1.5), 0.0001);
  });

  it("uses faster bright adaptation and combines compensation with native exposure", function () {
    source(0.18);
    meter(0);
    source(0.18 * 16);
    const bright = meter(500)[1];
    source(0.18);
    effect.reset();
    meter(1000);
    source(0.18 / 16);
    const dark = meter(1500)[1];
    expect(bright).toEqualEpsilon(-1.5, 0.001);
    expect(dark).toEqualEpsilon(0.5, 0.001);
    effect.locked = true;
    effect.exposureCompensation = 1;
    scene.postProcessStages.exposure = 2;
    const combined = meter(1600);
    expect(combined[0]).toEqualEpsilon(Math.pow(2, -dark) / 4, 0.0001);
    expect(combined[1]).toEqualEpsilon(dark, 0.0001);
  });

  it("freezes history, supports reset while locked and clamps edited limits", function () {
    source(0.09);
    meter();
    effect.locked = true;
    source(1.8);
    spyOn(effect._state.commands[0], "execute").and.callThrough();
    expect(meter(1000)[1]).toEqualEpsilon(1, 0.0001);
    expect(effect._state.commands[0].execute).not.toHaveBeenCalled();
    effect.reset();
    expect(meter(1100)[1]).toEqualEpsilon(Math.log2(0.1), 0.0001);
    expect(effect._state.commands[0].execute).toHaveBeenCalled();
    effect.minimumExposure = 0.5;
    expect(meter(1200)[1]).toEqualEpsilon(-1, 0.0001);
  });

  it("bounds target dimensions and preserves adaptation through resize", function () {
    source(0.18, 256, 144);
    meter();
    const s = effect._state;
    const old = s.luminance.getColorTexture();
    expect(old.width).toBe(128);
    expect(old.height).toBe(72);
    source(0.09, 96, 128);
    const result = meter(500);
    expect(old.isDestroyed()).toBe(true);
    expect(s.luminance.getColorTexture().width).toBe(96);
    expect(result[1]).toBeGreaterThan(0);
    expect(result[1]).toBeLessThan(1);
  });

  it("restores exact manual pixels and exposure after disabling native integration", function () {
    effect.enabled = false;
    scene.postProcessStages.exposure = 1.25;
    const manual = renderPixel();
    effect.enabled = true;
    renderPixel();
    expect(effect.ready).toBe(true);
    const targets = effect._state.targets.map((target) =>
      target.getColorTexture(),
    );
    const programs = effect._state.commands.map(
      (command) => command.shaderProgram,
    );
    effect.enabled = false;
    expect(targets.every((target) => target.isDestroyed())).toBe(true);
    expect(renderPixel()).toEqual(manual);
    scene.context.shaderCache.destroyReleasedShaderPrograms();
    expect(programs.every((program) => program.isDestroyed())).toBe(true);
    expect(scene.postProcessStages.exposure).toBe(1.25);
    effect.enabled = true;
    renderPixel();
    expect(effect.ready).toBe(true);
  });

  it("supports native tone mapper replacement without exposure feedback", function () {
    for (const mode of [Tonemapper.PBR_NEUTRAL, Tonemapper.ACES]) {
      scene.postProcessStages.tonemapper = mode;
      const first = renderPixel();
      const again = renderPixel();
      expect(first).toEqual(again);
      expect(first[0]).toBeGreaterThan(20);
      expect(first[0]).toBeLessThan(250);
      expect(effect.ready).toBe(true);
    }
    scene.postProcessStages.exposure = 0;
    expect(function () {
      renderPixel();
    }).toThrowError(RuntimeError);
  });

  it("releases resources on scene destruction and requests no settling frames", function () {
    renderPixel();
    const targets = effect._state.targets.map((target) =>
      target.getColorTexture(),
    );
    spyOn(scene, "requestRender");
    renderPixel();
    expect(scene.requestRender).not.toHaveBeenCalled();
    scene.destroyForSpecs();
    expect(effect.isDestroyed()).toBe(true);
    expect(targets.every((target) => target.isDestroyed())).toBe(true);
  });
});

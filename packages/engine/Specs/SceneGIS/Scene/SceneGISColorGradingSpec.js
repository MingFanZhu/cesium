import {
  Framebuffer,
  PixelDatatype,
  PixelFormat,
  RuntimeError,
  SceneGISAutoExposure,
  SceneGISColorGrading,
  Texture,
  Tonemapper,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISColorGrading", function () {
  let scene, effect, input;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(8, 8) });
    scene.highDynamicRange = true;
    scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
    scene.fog.enabled = false;
    scene.renderForSpecs();
    effect = new SceneGISColorGrading({ scene });
  });
  afterEach(function () {
    input?.destroy();
    input = undefined;
    if (!scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
  });
  function render(rgb = [0.18, 0.18, 0.18], alpha = 1) {
    input?.destroy();
    const data = new Float32Array(8 * 8 * 4);
    for (let i = 0; i < 64; ++i) {
      data.set([...rgb, alpha], 4 * i);
    }
    input = new Texture({
      context: scene.context,
      width: 8,
      height: 8,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.FLOAT,
      source: { width: 8, height: 8, arrayBufferView: data },
    });
    const stages = scene.postProcessStages;
    stages.update(scene.context, false, true);
    stages.execute(
      scene.context,
      input,
      scene.context.defaultTexture,
      scene.context.defaultTexture,
    );
    const framebuffer = new Framebuffer({
      context: scene.context,
      colorTextures: [stages.outputTexture],
      destroyAttachments: false,
    });
    const pixel = Array.from(
      scene.context.readPixels({ framebuffer, width: 1, height: 1 }),
    );
    framebuffer.destroy();
    return pixel;
  }

  it("validates atomically, defaults to disabled and requires HDR when active", function () {
    expect(effect.enabled).toBe(false);
    expect(effect.temperature).toBe(6500);
    expect(() => new SceneGISColorGrading({ scene })).toThrowDeveloperError();
    expect(() => {
      effect.temperature = 3000;
    }).toThrowDeveloperError();
    expect(() => {
      effect.tint = NaN;
    }).toThrowDeveloperError();
    expect(() => {
      effect.contrast = 0;
    }).toThrowDeveloperError();
    expect(() => {
      effect.saturation = -1;
    }).toThrowDeveloperError();
    expect(() => {
      effect.enabled = 1;
    }).toThrowDeveloperError();
    effect.destroy();
    expect(
      () => new SceneGISColorGrading({ scene, temperature: 26000 }),
    ).toThrowDeveloperError();
    expect(scene.postProcessStages._sceneGISColorGrading).toBeUndefined();
    scene.highDynamicRange = false;
    expect(
      () => new SceneGISColorGrading({ scene, enabled: true }),
    ).toThrowError(RuntimeError);
    expect(scene.postProcessStages._sceneGISColorGrading).toBeUndefined();
  });

  it("preserves native pixels and alpha at neutral for all five tone mappers", function () {
    for (const mapper of Object.values(Tonemapper)) {
      scene.postProcessStages.tonemapper = mapper;
      effect.enabled = false;
      const original = render([0.08, 0.4, 3], 0.4);
      effect.enabled = true;
      expect(render([0.08, 0.4, 3], 0.4)).toEqual(original);
      expect(original[3]).toEqualEpsilon(102, 1);
    }
  });

  it("warms higher camera temperatures, cools lower ones and corrects tint", function () {
    effect.enabled = true;
    effect.temperature = 10000;
    const warm = render();
    expect(warm[0]).toBeGreaterThan(warm[2]);
    effect.temperature = 4000;
    const cool = render();
    expect(cool[2]).toBeGreaterThan(cool[0]);
    effect.temperature = 6500;
    effect.tint = 0.5;
    const magenta = render();
    expect(magenta[0]).toBeGreaterThan(magenta[1]);
    expect(magenta[2]).toBeGreaterThan(magenta[1]);
    effect.tint = -0.5;
    const green = render();
    expect(green[1]).toBeGreaterThan(green[0]);
    expect(green[1]).toBeGreaterThan(green[2]);
  });

  it("neutralizes a daylight blue white in linear HDR", function () {
    effect.enabled = true;
    effect.temperature = 10000;
    // CIE D10000 xy=(0.2787996, 0.2919672), XYZ Y=1, converted to linear Rec.709.
    const pixel = render([0.824, 1.011, 1.399].map((c) => c * 0.18));
    expect(pixel[0]).toEqualEpsilon(pixel[1], 2);
    expect(pixel[2]).toEqualEpsilon(pixel[1], 2);
  });

  it("preserves black and the middle-gray pivot while increasing contrast", function () {
    const middle = render();
    const dark = render([0.06, 0.06, 0.06]);
    const bright = render([0.5, 0.5, 0.5]);
    effect.enabled = true;
    effect.contrast = 1.3;
    expect(render()).toEqual(middle);
    expect(render([0, 0, 0])).toEqual([0, 0, 0, 255]);
    expect(render([0.06, 0.06, 0.06])[0]).toBeLessThan(dark[0]);
    expect(render([0.5, 0.5, 0.5])[0]).toBeGreaterThan(bright[0]);
  });

  it("desaturates HDR before compression and preserves output alpha", function () {
    scene.postProcessStages.tonemapper = Tonemapper.REINHARD;
    effect.enabled = true;
    effect.saturation = 0;
    const pixel = render([4, 0.2, 0.05], 0.6);
    const y = 4 * 0.2126 + 0.2 * 0.7152 + 0.05 * 0.0722;
    const expected = 255 * Math.pow(y / (1 + y), 1 / scene.gamma);
    expect(pixel[0]).toEqualEpsilon(expected, 1);
    expect(pixel[1]).toEqual(pixel[0]);
    expect(pixel[2]).toEqual(pixel[0]);
    expect(pixel[3]).toEqualEpsilon(153, 1);
  });

  it("updates uniforms without extra stages, targets or shader rebuilds", function () {
    effect.enabled = true;
    render();
    const stages = scene.postProcessStages;
    const stage = stages._tonemapping;
    const program = stage._command.shaderProgram;
    const output = stages.outputTexture;
    effect.temperature = 9000;
    effect.contrast = 1.15;
    effect.saturation = 1.1;
    render();
    expect(stages._tonemapping).toBe(stage);
    expect(stage._command.shaderProgram).toBe(program);
    expect(stages.outputTexture).toBe(output);
    expect(stages.length).toBe(0);
  });

  it("leaves auto exposure metering and lock independent of grading", function () {
    const exposure = new SceneGISAutoExposure({
      scene,
      enabled: true,
      locked: true,
    });
    effect.enabled = true;
    render([0.09, 0.09, 0.09]);
    function divisor() {
      return scene.context.readPixels({
        framebuffer: exposure._state.result.framebuffer,
        width: 1,
        height: 1,
      })[0];
    }
    const initial = divisor();
    expect(initial).toEqualEpsilon(0.5, 0.001);
    effect.temperature = 10000;
    effect.contrast = 1.2;
    render([0.09, 0.09, 0.09]);
    expect(divisor()).toBe(initial);
    scene.postProcessStages.tonemapper = Tonemapper.ACES;
    render();
    expect(divisor()).toBe(initial);
    expect(exposure.locked).toBe(true);
  });

  it("restores native output on disable and rebinds before the next frame", function () {
    const original = render();
    effect.enabled = true;
    effect.temperature = 10000;
    const warm = render();
    expect(warm).not.toEqual(original);
    effect.enabled = false;
    expect(render()).toEqual(original);
    effect.enabled = true;
    render();
    effect.destroy();
    effect = new SceneGISColorGrading({
      scene,
      enabled: true,
      temperature: 4000,
    });
    const cool = render();
    expect(cool[2]).toBeGreaterThan(cool[0]);
    effect.destroy();
    expect(render()).toEqual(original);
    effect = new SceneGISColorGrading({ scene, enabled: true });
    render();
    scene.destroyForSpecs();
    expect(effect.isDestroyed()).toBe(true);
  });
});

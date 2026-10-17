import {
  Framebuffer,
  PixelDatatype,
  PixelFormat,
  SceneGISAutoExposure,
  SceneGISColorGrading,
  Texture,
  Tonemapper,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";

describe("SceneGIS/Scene/SceneGISAgXTonemapping", function () {
  let scene, input;
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(8, 8) });
    scene.highDynamicRange = true;
    scene.skyBox = scene.skyAtmosphere = scene.sun = scene.moon = undefined;
    scene.fog.enabled = false;
    scene.renderForSpecs();
  });
  afterEach(function () {
    input?.destroy();
    input = undefined;
    if (!scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
  });

  function render(rgb, alpha = 1) {
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
    stages.update(scene.context, false, true, scene.highDynamicRange);
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
    try {
      return Array.from(
        scene.context.readPixels({ framebuffer, width: 1, height: 1 }),
      );
    } finally {
      framebuffer.destroy();
    }
  }

  it("adds an explicit enum selection while preserving engine defaults", function () {
    const stages = scene.postProcessStages;
    expect(stages.tonemapper).toBe(Tonemapper.PBR_NEUTRAL);
    expect(stages.exposure).toBe(1);
    expect(stages._autoExposureEnabled).toBe(false);
    expect(stages._sceneGISAutoExposure).toBeUndefined();
    expect(Tonemapper.AGX).toBe("AGX");
    stages.tonemapper = Tonemapper.AGX;
    render([0.18, 0.18, 0.18]);
    expect(stages._tonemapping.name).toBe("sceneGIS_agx");
    expect(stages.length).toBe(0);
    expect(() => {
      stages.tonemapper = "unknown";
    }).toThrowDeveloperError();
    expect(stages.tonemapper).toBe(Tonemapper.AGX);
  });

  it("matches pinned reference colors, black and highlights with one output gamma", function () {
    scene.postProcessStages.tonemapper = Tonemapper.AGX;
    // Three.js r179 AgX reference, computed independently in double precision.
    // Linear values precede Cesium's configurable output gamma (ADR-0164).
    const samples = [
      { input: [0, 0, 0], linear: [0, 0, 0] },
      { input: [-1, -0.2, -3], linear: [0, 0, 0] },
      {
        input: [0.18, 0.18, 0.18],
        linear: [0.214548629, 0.214502356, 0.214499165],
      },
      {
        input: [0.08, 0.4, 3],
        linear: [0.281423807, 0.498204693, 0.917822282],
      },
      { input: [8, 1, 0.02], linear: [1, 0.690998065, 0.483847232] },
      {
        input: [65504, 65504, 65504],
        linear: [0.996978349, 0.996878661, 0.996778974],
      },
    ];
    for (const gamma of [1, 2.2]) {
      scene.gamma = gamma;
      scene.renderForSpecs();
      for (const sample of samples) {
        const expected = sample.linear.map((x) => 255 * x ** (1 / gamma));
        expect(render(sample.input, 0.4)).toEqualEpsilon([...expected, 102], 1);
      }
    }
  });

  it("applies manual exposure once and reuses the stage, program and target", function () {
    const stages = scene.postProcessStages;
    stages.tonemapper = Tonemapper.AGX;
    const reference = render([1.8, 1.8, 1.8]);
    expect(reference).toEqualEpsilon([220, 220, 220, 255], 1);
    const stage = stages._tonemapping;
    const program = stage._command.shaderProgram;
    const output = stages.outputTexture;
    stages.exposure = 10;
    expect(render([0.18, 0.18, 0.18])).toEqual(reference);
    expect(stages._tonemapping).toBe(stage);
    expect(stage._command.shaderProgram).toBe(program);
    expect(stages.outputTexture).toBe(output);
    expect(stages.length).toBe(0);
  });

  it("consumes automatic exposure and compensation once without changing metering", function () {
    const stages = scene.postProcessStages;
    stages.tonemapper = Tonemapper.AGX;
    stages.exposure = 10;
    const reference = render([0.18, 0.18, 0.18]);
    const effect = new SceneGISAutoExposure({
      scene,
      enabled: true,
      locked: true,
      exposureCompensation: 1,
    });
    // Meter 0.18 to unit gain; compensation doubles it, manual exposure adds 10.
    expect(render([0.18, 0.18, 0.18])[0]).toBeGreaterThan(reference[0]);
    effect.enabled = false;
    const twice = render([0.36, 0.36, 0.36]);
    effect.enabled = true;
    expect(render([0.18, 0.18, 0.18])).toEqualEpsilon(twice, 1);
    effect.destroy();
    expect(render([0.18, 0.18, 0.18])).toEqual(reference);
  });

  it("grades exposed linear RGB before AgX and preserves alpha", function () {
    scene.postProcessStages.tonemapper = Tonemapper.AGX;
    scene.postProcessStages.exposure = 2;
    const rgb = [0.08, 0.4, 3];
    const y = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    const expected = render([y, y, y], 0.6);
    const effect = new SceneGISColorGrading({
      scene,
      enabled: true,
      saturation: 0,
    });
    expect(render(rgb, 0.6)).toEqualEpsilon(expected, 1);
    effect.destroy();
    expect(render(rgb, 0.6)).not.toEqual(expected);
  });

  it("keeps LDR gamma-only and releases replaced and destroyed display stages", function () {
    const stages = scene.postProcessStages;
    stages.tonemapper = Tonemapper.AGX;
    const rgb = [0.08, 0.4, 3];
    const hdr = render(rgb);
    const old = stages._tonemapping;
    scene.highDynamicRange = false;
    stages.exposure = 10;
    const expected = rgb.map((x) => 255 * Math.min(x, 1) ** (1 / scene.gamma));
    expect(render(rgb, 0.4)).toEqualEpsilon([...expected, 102], 1);
    expect(old.isDestroyed()).toBe(true);
    stages.exposure = 1;
    scene.highDynamicRange = true;
    expect(render(rgb)).toEqual(hdr);
    const agx = stages._tonemapping;
    stages.tonemapper = Tonemapper.PBR_NEUTRAL;
    render(rgb);
    expect(agx.isDestroyed()).toBe(true);
    stages.tonemapper = Tonemapper.AGX;
    expect(render(rgb)).toEqual(hdr);
    const finalStage = stages._tonemapping;
    const output = stages.outputTexture;
    scene.destroyForSpecs();
    expect(finalStage.isDestroyed()).toBe(true);
    expect(output.isDestroyed()).toBe(true);
  });
});

import {
  JulianDate,
  PostProcessStage,
  Resource,
  SceneGISSnowLensStage,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISSnowLensStage", function () {
  let scene;
  const epoch = JulianDate.fromIso8601("2026-09-29T00:00:00Z");
  beforeEach(function () {
    scene = createScene({ canvas: createCanvas(128, 128) });
    scene.postProcessStages.fxaa.enabled = false;
  });
  afterEach(function () {
    scene?.destroyForSpecs();
    scene = undefined;
  });
  function render(seconds = 0) {
    scene.renderForSpecs(
      JulianDate.addSeconds(epoch, seconds, new JulianDate()),
    );
    return Array.from(scene.context.readPixels());
  }
  it("validates configuration and stays allocation-free while disabled", function () {
    const fetch = spyOn(Resource.prototype, "fetchImage").and.callThrough();
    expect(() => new SceneGISSnowLensStage()).toThrowDeveloperError();
    expect(
      () => new SceneGISSnowLensStage({ scene, enabled: 1 }),
    ).toThrowDeveloperError();
    expect(
      () => new SceneGISSnowLensStage({ scene, intensity: 2 }),
    ).toThrowDeveloperError();
    const lens = scene.postProcessStages.add(
      new SceneGISSnowLensStage({ scene }),
    );
    expect(lens instanceof PostProcessStage).toBe(true);
    expect(lens.enabled).toBe(false);
    render();
    expect(lens._command).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(() => {
      lens.coverage = -0.1;
    }).toThrowDeveloperError();
    expect(() => {
      lens.coverage = NaN;
    }).toThrowDeveloperError();
    expect(() => lens.update({}, false)).toThrowDeveloperError();
    expect(scene.postProcessStages.remove(lens)).toBe(true);
    expect(lens.isDestroyed()).toBe(true);
  });

  it("preserves identity/alpha, stays static and reuses/releases its texture and native resources", async function () {
    const pattern = scene.postProcessStages.add(
      new PostProcessStage({
        fragmentShader: `in vec2 v_textureCoordinates;
      void main() {
        vec2 uv = v_textureCoordinates;
        float grid = mod(floor(uv.x * 32.0) + floor(uv.y * 32.0), 2.0);
        out_FragColor = vec4(uv, grid, 0.4 + uv.x * 0.5);
      }`,
      }),
    );
    const lens = scene.postProcessStages.add(
      new SceneGISSnowLensStage({
        scene,
        enabled: true,
        intensity: 0,
      }),
    );
    await pollToPromise(() => {
      render();
      return pattern.ready && lens.ready;
    });
    const original = render(2);
    lens.intensity = 1;
    const snow = render(2);
    expect(snow).not.toEqual(original);
    expect(snow.filter((_, i) => i % 4 === 3)).toEqual(
      original.filter((_, i) => i % 4 === 3),
    );
    expect(render(2)).toEqual(snow);
    expect(render(300)).toEqual(snow);
    expect(render(2)).toEqual(snow);
    const target = lens._command.framebuffer;
    const program = lens._command.shaderProgram;
    const texture = lens._actualUniforms.u_frostTexture;
    expect(texture.width).toBe(1254);
    expect(texture.height).toBe(1254);
    lens.coverage = 0.6;
    render(2);
    expect(lens._command.framebuffer).toBe(target);
    expect(lens._command.shaderProgram).toBe(program);
    expect(lens._actualUniforms.u_frostTexture).toBe(texture);
    lens.enabled = false;
    expect(render(2)).toEqual(original);
    expect(lens._command).toBeUndefined();
    expect(texture.isDestroyed()).toBe(true);
    lens.enabled = true;
    await pollToPromise(() => {
      render();
      return lens.ready;
    });
    const resumedProgram = lens._command.shaderProgram;
    const resumedTexture = lens._actualUniforms.u_frostTexture;
    scene.destroyForSpecs();
    scene = undefined;
    expect(lens.isDestroyed()).toBe(true);
    expect(resumedProgram.isDestroyed()).toBe(true);
    expect(resumedTexture.isDestroyed()).toBe(true);
  });

  it("extends frost inward while preserving the default center and black-scene darkness", async function () {
    let brightness = 0.25;
    const background = scene.postProcessStages.add(
      new PostProcessStage({
        fragmentShader: `uniform float brightness;
      void main() { out_FragColor = vec4(vec3(brightness), 0.6); }`,
        uniforms: { brightness: () => brightness },
      }),
    );
    const lens = scene.postProcessStages.add(
      new SceneGISSnowLensStage({
        scene,
        enabled: true,
        intensity: 0,
      }),
    );
    await pollToPromise(() => {
      render();
      return background.ready && lens.ready;
    });
    const dry = render(2);
    const changedPixels = (pixels) =>
      pixels.filter((v, i) => i % 4 === 0 && v !== dry[i]).length;
    lens.intensity = 1;
    const frost = render(2);
    const center = (64 * 128 + 64) * 4;
    expect(frost.slice(center, center + 4)).toEqual(
      dry.slice(center, center + 4),
    );
    expect(frost.some((v, i) => i % 4 === 0 && v > dry[i] + 5)).toBe(true);
    lens.coverage = 0.8;
    expect(changedPixels(render(2))).toBeGreaterThan(changedPixels(frost));
    lens.coverage = 0;
    expect(render(2)).toEqual(dry);
    lens.coverage = 1;
    brightness = 0;
    expect(
      render(2)
        .filter((_, i) => i % 4 < 3)
        .every((v) => v === 0),
    ).toBe(true);
  });
});

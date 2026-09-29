import {
  JulianDate,
  PostProcessStage,
  Resource,
  SceneGISRainLensStage,
} from "../../../index.js";
import createCanvas from "../../../../../Specs/createCanvas.js";
import createScene from "../../../../../Specs/createScene.js";
import pollToPromise from "../../../../../Specs/pollToPromise.js";

describe("SceneGIS/Scene/SceneGISRainLensStage", function () {
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
  it("validates parameters and uses native collection ownership without default allocation", function () {
    const fetch = spyOn(Resource.prototype, "fetchImage").and.callThrough();
    expect(() => new SceneGISRainLensStage()).toThrowDeveloperError();
    expect(
      () => new SceneGISRainLensStage({ scene, intensity: 2 }),
    ).toThrowDeveloperError();
    const stage = scene.postProcessStages.add(
      new SceneGISRainLensStage({ scene }),
    );
    expect(stage instanceof PostProcessStage).toBe(true);
    expect(stage.enabled).toBe(false);
    render();
    expect(stage._command).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(() => {
      stage.dropletSize = 0;
    }).toThrowDeveloperError();
    expect(() => {
      stage.distortion = NaN;
    }).toThrowDeveloperError();
    expect(() => stage.update({}, false)).toThrowDeveloperError();
    expect(scene.postProcessStages.remove(stage)).toBe(true);
    expect(stage.isDestroyed()).toBe(true);
  });
  it("refracts color, preserves alpha, freezes with Scene time and releases/reuses native resources", async function () {
    const pattern = scene.postProcessStages.add(
      new PostProcessStage({
        fragmentShader: `in vec2 v_textureCoordinates;
        void main() {
          vec2 uv = v_textureCoordinates;
          float checkered = mod(floor(uv.x * 32.0) + floor(uv.y * 32.0), 2.0);
          out_FragColor = vec4(uv, checkered, 0.4 + uv.x * 0.5);
        }`,
      }),
    );
    const lens = scene.postProcessStages.add(
      new SceneGISRainLensStage({
        scene,
        enabled: true,
        intensity: 0,
        dropletSize: 12,
      }),
    );
    await pollToPromise(() => {
      render();
      return pattern.ready && lens.ready;
    });
    const original = render();
    lens.intensity = 1;
    const wet = render();
    expect(wet).not.toEqual(original);
    expect(wet.filter((_, i) => i % 4 === 3)).toEqual(
      original.filter((_, i) => i % 4 === 3),
    );
    expect(render()).toEqual(wet);
    expect(render(0.6)).not.toEqual(wet);
    const target = lens._command.framebuffer;
    const program = lens._command.shaderProgram;
    const sprite = lens._actualUniforms.u_rainSprite;
    expect(sprite.width).toBe(256);
    expect(sprite.height).toBe(256);
    lens.dropletSize = 16;
    lens.distortion = 8;
    render(0.6);
    expect(lens._command.framebuffer).toBe(target);
    expect(lens._command.shaderProgram).toBe(program);
    expect(lens._actualUniforms.u_rainSprite).toBe(sprite);
    lens.enabled = false;
    expect(render()).toEqual(original);
    expect(lens._command).toBeUndefined();
    expect(sprite.isDestroyed()).toBe(true);
    lens.enabled = true;
    await pollToPromise(() => {
      render();
      return lens.ready;
    });
    const resumedProgram = lens._command.shaderProgram;
    const resumedSprite = lens._actualUniforms.u_rainSprite;
    scene.destroyForSpecs();
    scene = undefined;
    expect(lens.isDestroyed()).toBe(true);
    expect(resumedProgram.isDestroyed()).toBe(true);
    expect(resumedSprite.isDestroyed()).toBe(true);
  });

  it("keeps a subtle bead contour without adding synthetic highlights", async function () {
    let brightness = 0.35;
    const background = scene.postProcessStages.add(
      new PostProcessStage({
        fragmentShader: `uniform float brightness;
        void main() { out_FragColor = vec4(vec3(brightness), 0.6); }`,
        uniforms: { brightness: () => brightness },
      }),
    );
    const lens = scene.postProcessStages.add(
      new SceneGISRainLensStage({
        scene,
        enabled: true,
        intensity: 0,
        dropletSize: 16,
      }),
    );
    await pollToPromise(() => {
      render();
      return background.ready && lens.ready;
    });
    const dry = render(3);
    lens.intensity = 1;
    const wet = render(3);
    const reds = wet.filter((_, i) => i % 4 === 0);
    // A uniform scene has no bright source to reflect. Only the subtle lower
    // meniscus attenuates it; a fixed white glint must not appear.
    expect(reds.every((r) => r <= dry[0] + 1)).toBe(true);
    expect(reds.some((r) => r < dry[0] - 3)).toBe(true);
    expect(reds.filter((r) => r === dry[0]).length).toBeGreaterThan(
      reds.length / 2,
    );
    expect(wet.filter((_, i) => i % 4 === 3)).toEqual(
      dry.filter((_, i) => i % 4 === 3),
    );
    brightness = 0;
    expect(
      render(3)
        .filter((_, i) => i % 4 < 3)
        .every((v) => v === 0),
    ).toBe(true);
  });
});

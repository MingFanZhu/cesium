import DeveloperError from "../../Core/DeveloperError.js";
import buildModuleUrl from "../../Core/buildModuleUrl.js";
import Texture from "../../Renderer/Texture.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import PostProcessStageSampleMode from "../../Scene/PostProcessStageSampleMode.js";
import fragmentShader from "../../Shaders/SceneGIS/Weather/SceneGISSnowLens.js";

function range(value, name, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DeveloperError(`${name} must be in [${minimum}, ${maximum}].`);
  }
}

/**
 * Optional static frost extending inward from the edges of the camera lens.
 * Add this stage to the supplied Scene's postProcessStages collection, which
 * normally owns its destruction. Like SceneGISRainLensStage, it uses one native
 * color-only stage after tone mapping and before FXAA, preserving source alpha.
 *
 * A packaged grayscale ice-crystal texture supplies the frost pattern. It loads
 * on first enable and is released with the native stage. There is no animation,
 * depth, history, collision pass or additional frame request. This is an artistic
 * frosted-glass overlay, not a crystal-growth simulation. It does not modify rain,
 * surface coverage, lighting, exposure, the camera or the particle system.
 *
 * @alias SceneGISSnowLensStage
 * @extends PostProcessStage
 * @param {object} options Configuration.
 * @param {Scene} options.scene The live Scene receiving this stage.
 * @param {string} [options.name] Unique native post-process stage name.
 * @param {boolean} [options.enabled=false] Whether to execute the effect.
 * @param {number} [options.intensity=0.5] Frost opacity in [0, 1]. Zero is identity.
 * @param {number} [options.coverage=0.4] Inward extent from the screen edges in [0, 1]. Zero is identity; one reaches the center.
 * @exception {DeveloperError} Configuration violates the documented ranges or Scene ownership.
 * @example
 * const lens = scene.postProcessStages.add(new Cesium.SceneGISSnowLensStage({
 *   scene, enabled: true, intensity: 0.7, coverage: 0.4
 * }));
 * // Explicitly choose rain or snow lens effects when the weather changes.
 * scene.postProcessStages.remove(lens);
 */
class SceneGISSnowLensStage extends PostProcessStage {
  constructor(options = {}) {
    const scene = options.scene;
    if (
      !scene ||
      typeof scene.isDestroyed !== "function" ||
      scene.isDestroyed()
    ) {
      throw new DeveloperError("A live Scene is required.");
    }
    if (options.enabled !== undefined && typeof options.enabled !== "boolean") {
      throw new DeveloperError("enabled must be boolean.");
    }
    const state = { intensity: 0.5, coverage: 0.4 };
    super({
      name: options.name,
      fragmentShader,
      sampleMode: PostProcessStageSampleMode.LINEAR,
      uniforms: {
        u_frostTexture: buildModuleUrl(
          "Assets/SceneGIS/Weather/SnowLens/frost.png",
        ),
        u_snowIntensity: () => state.intensity,
        u_frostCoverage: () => state.coverage,
      },
    });
    this._snowScene = scene;
    this._snowState = state;
    this.enabled = options.enabled ?? false;
    this.intensity = options.intensity ?? 0.5;
    this.coverage = options.coverage ?? 0.4;
  }

  /** Frost opacity in [0, 1]. Zero preserves the input exactly.
   * @type {number}
   * @default 0.5
   */
  get intensity() {
    return this._snowState.intensity;
  }
  set intensity(value) {
    range(value, "intensity", 0, 1);
    this._snowState.intensity = value;
    this._snowScene.requestRender();
  }

  /** Inward extent from the screen edges in [0, 1]. Zero is identity; one reaches the center.
   * @type {number}
   * @default 0.4
   */
  get coverage() {
    return this._snowState.coverage;
  }
  set coverage(value) {
    range(value, "coverage", 0, 1);
    this._snowState.coverage = value;
    this._snowScene.requestRender();
  }

  /** @private */
  update(context, useLogDepth) {
    if (context !== this._snowScene.context) {
      throw new DeveloperError(
        "Snow lens must be added to its supplied Scene.",
      );
    }
    super.update(context, useLogDepth);
  }

  /** Releases the packaged frost texture and native stage resources.
   * @returns {undefined}
   */
  destroy() {
    // Native collection removal clears _textureCache before destroy, which
    // bypasses its image-uniform cleanup. Release this stage's texture first.
    const frost = this._actualUniforms.u_frostTexture;
    if (frost instanceof Texture && !frost.isDestroyed()) {
      frost.destroy();
    }
    delete this._actualUniforms.u_frostTexture;
    return super.destroy();
  }
}

export default SceneGISSnowLensStage;

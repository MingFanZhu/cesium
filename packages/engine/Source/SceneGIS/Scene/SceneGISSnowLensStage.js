import DeveloperError from "../../Core/DeveloperError.js";
import JulianDate from "../../Core/JulianDate.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import PostProcessStageSampleMode from "../../Scene/PostProcessStageSampleMode.js";
import fragmentShader from "../../Shaders/SceneGIS/Weather/SceneGISSnowLens.js";

function range(value, name, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DeveloperError(`${name} must be in [${minimum}, ${maximum}].`);
  }
}

/**
 * Optional attached snow flecks that soften, melt into wet traces and fade.
 * Add this stage to the supplied Scene's postProcessStages collection, which
 * normally owns its destruction. Like SceneGISRainLensStage, it uses one native
 * color-only stage after tone mapping and before FXAA, preserving source alpha.
 *
 * Animation follows Scene time; frozen time freezes the flecks and rewinding is
 * deterministic. No texture asset, depth, history, collision pass or additional
 * frames are requested. This is an artistic lens effect, not snow accumulation
 * or a physical crystal simulation. It does not modify rain, surface coverage,
 * lighting, exposure, the camera or the particle system.
 *
 * @alias SceneGISSnowLensStage
 * @extends PostProcessStage
 * @param {object} options Configuration.
 * @param {Scene} options.scene The live Scene receiving this stage.
 * @param {string} [options.name] Unique native post-process stage name.
 * @param {boolean} [options.enabled=false] Whether to execute the effect.
 * @param {number} [options.intensity=0.5] Snow coverage in [0, 1]. Zero is identity.
 * @param {number} [options.flakeSize=24] Snow fleck scale in drawing-buffer pixels, [8, 128].
 * @param {number} [options.meltDuration=6] Attachment/melting cycle in seconds, [1, 30].
 * @exception {DeveloperError} Configuration violates the documented ranges or Scene ownership.
 * @example
 * const lens = scene.postProcessStages.add(new Cesium.SceneGISSnowLensStage({
 *   scene, enabled: true, intensity: 0.6, flakeSize: 24, meltDuration: 6
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
    const state = { intensity: 0.5, size: 24, duration: 6, time: 0 };
    super({
      name: options.name,
      fragmentShader,
      sampleMode: PostProcessStageSampleMode.LINEAR,
      uniforms: {
        u_snowIntensity: () => state.intensity,
        u_flakeSize: () => state.size,
        u_meltDuration: () => state.duration,
        u_snowTime: () => state.time,
      },
    });
    this._snowScene = scene;
    this._snowState = state;
    this._snowEpoch = undefined;
    this.enabled = options.enabled ?? false;
    this.intensity = options.intensity ?? 0.5;
    this.flakeSize = options.flakeSize ?? 24;
    this.meltDuration = options.meltDuration ?? 6;
  }

  /** Snow coverage in [0, 1]. Zero preserves the input exactly.
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

  /** Snow fleck scale in drawing-buffer pixels, [8, 128].
   * @type {number}
   * @default 24
   */
  get flakeSize() {
    return this._snowState.size;
  }
  set flakeSize(value) {
    range(value, "flakeSize", 8, 128);
    this._snowState.size = value;
    this._snowScene.requestRender();
  }

  /** Attachment/melting cycle in seconds, [1, 30].
   * @type {number}
   * @default 6
   */
  get meltDuration() {
    return this._snowState.duration;
  }
  set meltDuration(value) {
    range(value, "meltDuration", 1, 30);
    this._snowState.duration = value;
    this._snowScene.requestRender();
  }

  /** @private */
  update(context, useLogDepth) {
    if (context !== this._snowScene.context) {
      throw new DeveloperError(
        "Snow lens must be added to its supplied Scene.",
      );
    }
    if (this.enabled) {
      const time = this._snowScene.frameState.time;
      this._snowEpoch ??= JulianDate.clone(time);
      const seconds = JulianDate.secondsDifference(time, this._snowEpoch);
      const period = this._snowState.duration * 256;
      this._snowState.time = ((seconds % period) + period) % period;
    }
    super.update(context, useLogDepth);
  }
}

export default SceneGISSnowLensStage;

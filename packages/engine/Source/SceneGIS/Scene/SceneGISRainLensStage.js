import DeveloperError from "../../Core/DeveloperError.js";
import buildModuleUrl from "../../Core/buildModuleUrl.js";
import JulianDate from "../../Core/JulianDate.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import PostProcessStageSampleMode from "../../Scene/PostProcessStageSampleMode.js";
import Texture from "../../Renderer/Texture.js";
import fragmentShader from "../../Shaders/SceneGIS/Weather/SceneGISRainLens.js";

function range(value, name, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DeveloperError(`${name} must be in [${minimum}, ${maximum}].`);
  }
}

/**
 * Optional screen-space rain beads and falling water trails. Add this stage to
 * the supplied Scene's postProcessStages collection, which normally owns its
 * destruction. Uses one native color-only stage after tone mapping, before FXAA.
 * It does not change the camera, exposure, weather, depth or source alpha.
 *
 * Animation follows Scene time; frozen time freezes drops and rewinding is
 * deterministic. A packaged 256x256 raindrop refraction/height sprite supplies
 * the droplet profile. Native image uniforms load it on first enable and own its
 * texture lifetime; the post-process cache owns the output framebuffer.
 * Visible scene color approximates wide-field reflection without a scene
 * capture. The meniscus has subtle attenuation, without a fixed white glint.
 * No extra frames, history or collision passes are requested.
 * This is an artistic lens effect, not a lens-fluid simulation.
 *
 * @alias SceneGISRainLensStage
 * @extends PostProcessStage
 * @param {object} options Configuration.
 * @param {Scene} options.scene The live Scene receiving this stage.
 * @param {string} [options.name] Unique native post-process stage name.
 * @param {boolean} [options.enabled=false] Whether to execute the effect.
 * @param {number} [options.intensity=0.5] Droplet coverage in [0, 1]. Zero is identity.
 * @param {number} [options.dropletSize=36] Droplet scale in drawing-buffer pixels, [8, 128].
 * @param {number} [options.distortion=12] Maximum refraction scale in pixels, [0, 40].
 * @exception {DeveloperError} Configuration violates the documented ranges or Scene ownership.
 * @example
 * const lens = scene.postProcessStages.add(new Cesium.SceneGISRainLensStage({
 *   scene, enabled: true, intensity: 0.7
 * }));
 * // Removing the stage destroys it using the native collection lifecycle.
 * scene.postProcessStages.remove(lens);
 */
class SceneGISRainLensStage extends PostProcessStage {
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
    const state = { intensity: 0, size: 36, distortion: 12, time: 0 };
    super({
      name: options.name,
      fragmentShader,
      sampleMode: PostProcessStageSampleMode.LINEAR,
      uniforms: {
        u_rainSprite: buildModuleUrl(
          "Assets/SceneGIS/Weather/RainLens/raindrop.png",
        ),
        u_rainIntensity: () => state.intensity,
        u_dropletSize: () => state.size,
        u_distortion: () => state.distortion,
        u_rainTime: () => state.time,
      },
    });
    this._rainScene = scene;
    this._rainState = state;
    this._rainEpoch = undefined;
    this.enabled = options.enabled ?? false;
    this.intensity = options.intensity ?? 0.5;
    this.dropletSize = options.dropletSize ?? 36;
    this.distortion = options.distortion ?? 12;
  }

  /** Droplet coverage in [0, 1]. Zero preserves the input exactly.
   * @type {number}
   * @default 0.5
   */
  get intensity() {
    return this._rainState.intensity;
  }
  set intensity(value) {
    range(value, "intensity", 0, 1);
    this._rainState.intensity = value;
    this._rainScene.requestRender();
  }
  /** Droplet scale in drawing-buffer pixels, [8, 128].
   * @type {number}
   * @default 36
   */
  get dropletSize() {
    return this._rainState.size;
  }
  set dropletSize(value) {
    range(value, "dropletSize", 8, 128);
    this._rainState.size = value;
    this._rainScene.requestRender();
  }
  /** Refraction scale in pixels, [0, 40].
   * @type {number}
   * @default 12
   */
  get distortion() {
    return this._rainState.distortion;
  }
  set distortion(value) {
    range(value, "distortion", 0, 40);
    this._rainState.distortion = value;
    this._rainScene.requestRender();
  }

  /** @private */
  update(context, useLogDepth) {
    if (context !== this._rainScene.context) {
      throw new DeveloperError(
        "Rain lens must be added to its supplied Scene.",
      );
    }
    if (this.enabled) {
      const time = this._rainScene.frameState.time;
      this._rainEpoch ??= JulianDate.clone(time);
      const seconds = JulianDate.secondsDifference(time, this._rainEpoch);
      this._rainState.time = ((seconds % 2048) + 2048) % 2048;
    }
    super.update(context, useLogDepth);
  }

  /** Releases the packaged sprite and native stage resources.
   * @returns {undefined}
   */
  destroy() {
    // Native collection removal clears _textureCache before calling destroy,
    // which makes its image-uniform cleanup skip this stage's owned sprite.
    const sprite = this._actualUniforms.u_rainSprite;
    if (sprite instanceof Texture && !sprite.isDestroyed()) {
      sprite.destroy();
    }
    delete this._actualUniforms.u_rainSprite;
    return super.destroy();
  }
}

export default SceneGISRainLensStage;

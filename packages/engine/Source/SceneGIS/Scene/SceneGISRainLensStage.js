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
 * 可选的屏幕空间镜头雨珠与下落水痕。加入指定 Scene 的 postProcessStages 集合，集合通常负责销毁。在色调映射之后、FXAA 之前使用一个原生纯颜色阶段，不改变相机、曝光、天气、深度或输入 alpha。
 *
 * 动画遵循 Scene 时间，冻结时雨滴冻结，时间回退具有确定性。随包提供的 256x256 雨滴折射/高度精灵定义液滴轮廓。原生图像 uniform 在首次启用时加载，并拥有纹理生命周期；后处理缓存拥有输出帧缓冲。用可见场景颜色近似广角反射，不另捕获场景。弯月面只有轻微衰减，没有固定白色高光。不请求额外帧、历史或碰撞通道。这是艺术化镜头效果，不是镜头液体模拟。
 *
 * @alias SceneGISRainLensStage
 * @extends PostProcessStage
 * @param {object} options 配置。
 * @param {Scene} options.scene 接收此阶段的存活 Scene。
 * @param {string} [options.name] 唯一的原生后处理阶段名称。
 * @param {boolean} [options.enabled=false] 是否执行效果。
 * @param {number} [options.intensity=0.5] 液滴覆盖度，范围 [0,1]；0 不改变输入。
 * @param {number} [options.dropletSize=36] 液滴尺寸，单位为绘制缓冲区像素，范围 [8,128]。
 * @param {number} [options.distortion=12] 最大折射倍率，单位为像素，范围 [0,40]。
 * @exception {DeveloperError} 配置违反文档范围或 Scene 所有权。
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

  /**
   *  液滴覆盖度，范围 [0,1]；0 完整保留输入。
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
  /**
   *  液滴尺寸，单位为绘制缓冲区像素，范围 [8,128]。
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
  /**
   *  折射倍率，单位为像素，范围 [0,40]。
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

  /**
   *  释放随包精灵与原生阶段资源。
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

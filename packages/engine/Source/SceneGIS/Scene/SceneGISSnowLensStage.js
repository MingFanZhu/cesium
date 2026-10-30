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
 * 可选的镜头边缘向内延伸的静态霜冻效果。加入指定 Scene 的 postProcessStages 集合，集合通常负责销毁。与 SceneGISRainLensStage 一样，在色调映射之后、FXAA 之前使用一个原生纯颜色阶段，并保留输入 alpha。
 *
 * 随包的灰度冰晶纹理提供霜花图案，首次启用时加载，随原生阶段释放。没有动画、深度、历史、碰撞通道或额外帧请求。这是艺术化磨砂玻璃覆盖，不是结晶生长模拟。不修改雨、地表覆盖、光照、曝光、相机或粒子系统。
 *
 * @alias SceneGISSnowLensStage
 * @extends PostProcessStage
 * @param {object} options 配置。
 * @param {Scene} options.scene 接收此阶段的存活 Scene。
 * @param {string} [options.name] 唯一的原生后处理阶段名称。
 * @param {boolean} [options.enabled=false] 是否执行效果。
 * @param {number} [options.intensity=0.5] 霜冻不透明度，范围 [0,1]；0 不改变输入。
 * @param {number} [options.coverage=0.4] 从屏幕边缘向内延伸的范围，取值 [0,1]；0 不改变输入，1 达到中心。
 * @exception {DeveloperError} 配置违反文档范围或 Scene 所有权。
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

  /**
   *  霜冻不透明度，范围 [0,1]；0 完整保留输入。
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

  /**
   *  从屏幕边缘向内延伸的范围，取值 [0,1]；0 不改变输入，1 达到中心。
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

  /**
   *  释放随包霜冻纹理和原生阶段资源。
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

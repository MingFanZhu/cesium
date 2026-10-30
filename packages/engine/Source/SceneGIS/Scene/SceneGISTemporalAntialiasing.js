import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import RuntimeError from "../../Core/RuntimeError.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import SceneMode from "../../Scene/SceneMode.js";
import Renderer from "./_private/_SceneGISTemporalAntialiasing.js";

/**
 * 通过仅作用于渲染的亚像素采样，为 HDR 球面和平面场景提供时域抗锯齿。静态几何根据相机运动重投影，结合深度拒绝与颜色裁剪。没有物体运动向量，动画对象、透明内容和标注可能柔化或残留拖尾。背景像素使用当前颜色，原生覆盖内容保持清晰。附加效果归 Scene 所有，禁用释放历史，启用重新开始。按需渲染场景仅在请求的帧上积累；MSAA 和 FXAA 仍归调用方控制。
 *
 * @alias SceneGISTemporalAntialiasing
 * @constructor
 * @param {object} options 初始化选项。
 * @param {Scene} options.scene 存活的 Scene，仅可附加一个效果。
 * @param {boolean} [options.enabled=false] 是否启用时域抗锯齿。
 * @param {number} [options.historyWeight=0.9] 基础历史贡献，范围 [0,0.95]，0 禁用历史混合。
 * @exception {RuntimeError} 启用 TAA 要求 HDR、SCENE3D 及受支持 WebGL2 目标，不支持立体渲染。
 * @example
 * scene.highDynamicRange = true;
 * scene.msaaSamples = 1;
 * scene.postProcessStages.fxaa.enabled = false;
 * const taa = new Cesium.SceneGISTemporalAntialiasing({ scene, enabled: true });
 */
function SceneGISTemporalAntialiasing(options) {
  const scene = options?.scene;
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (defined(scene._sceneGISTemporalAntialiasing)) {
    throw new DeveloperError(
      "Only one SceneGISTemporalAntialiasing may be attached to a Scene.",
    );
  }
  this._scene = scene;
  this._state = undefined;
  this._ready = false;
  this.historyWeight = options.historyWeight ?? 0.9;
  this.enabled = options.enabled ?? false;
  scene._sceneGISTemporalAntialiasing = this;
  scene.requestRender();
}

/**
 * 测试 GPU 支持，独立于 Scene 配置。
 * @param {Scene} scene 需要测试的 Scene。
 * @returns {boolean} 是否支持必需帧缓冲格式。
 */
SceneGISTemporalAntialiasing.isSupported = function (scene) {
  const c = scene.context;
  return (
    c.webgl2 &&
    c.depthTexture &&
    c.colorBufferFloat &&
    c.colorBufferHalfFloat &&
    c.textureHalfFloatLinear &&
    ContextLimits.maximumDrawBuffers >= 2
  );
};

Object.defineProperties(SceneGISTemporalAntialiasing.prototype, {
  /**
   * 是否启用 TAA，禁用释放全部 GPU 历史。
   * @memberof SceneGISTemporalAntialiasing.prototype
   * @type {boolean}
   * @default false
   */
  enabled: {
    get: function () {
      return this._enabled;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("enabled must be boolean.");
      }
      if (value) {
        this._validate();
      }
      if (value === this._enabled) {
        return;
      }
      this._enabled = value;
      if (!value) {
        Renderer.destroy(this);
      }
      this.reset();
    },
  },
  /**
   * 基础历史贡献，较低值对内容变化响应更快。深度拒绝和颜色裁剪后，亮度差异可提高历史保留以抑制亚像素闪烁。0 禁用历史混合。
   * @memberof SceneGISTemporalAntialiasing.prototype
   * @type {number}
   * @default 0.9
   */
  historyWeight: {
    get: function () {
      return this._historyWeight;
    },
    set: function (value) {
      if (!Number.isFinite(value) || value < 0 || value > 0.95) {
        throw new DeveloperError("historyWeight must be in [0, 0.95].");
      }
      this._historyWeight = value;
      this.reset();
    },
  },
  /**
   * 上次渲染是否成功生成时域结果。
   * @memberof SceneGISTemporalAntialiasing.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
});

/**
 * 丢弃历史，例如应用相机跳切或场景替换后；下一渲染帧立即发布当前颜色。
 */
SceneGISTemporalAntialiasing.prototype.reset = function () {
  this._ready = false;
  if (this._state) {
    this._state.valid = false;
    this._state.sample = 0;
  }
  this._scene.requestRender();
};

/** @private */
SceneGISTemporalAntialiasing.prototype._validate = function () {
  const scene = this._scene;
  if (
    scene.mode !== SceneMode.SCENE3D ||
    !scene.highDynamicRange ||
    scene.useWebVR ||
    !SceneGISTemporalAntialiasing.isSupported(scene)
  ) {
    throw new RuntimeError(
      "Temporal antialiasing requires HDR, SCENE3D, a single viewport and WebGL2 floating-point color/depth targets.",
    );
  }
};

/**
 *  @returns {boolean} 此效果是否已销毁。
 */
SceneGISTemporalAntialiasing.prototype.isDestroyed = function () {
  return false;
};

/**
 * 释放自有资源并从 Scene 解绑。
 * @returns {undefined}
 */
SceneGISTemporalAntialiasing.prototype.destroy = function () {
  Renderer.destroy(this);
  this._scene._sceneGISTemporalAntialiasing = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};

export default SceneGISTemporalAntialiasing;

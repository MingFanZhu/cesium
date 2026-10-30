import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import RuntimeError from "../../Core/RuntimeError.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import SceneMode from "../../Scene/SceneMode.js";
import Renderer from "./_private/_SceneGISScreenSpaceIndirectLighting.js";

function numberProperty(name, minimum, maximum, integer = false) {
  return {
    get: function () {
      return this[`_${name}`];
    },
    set: function (value) {
      if (
        !Number.isFinite(value) ||
        value < minimum ||
        value > maximum ||
        (integer && !Number.isInteger(value))
      ) {
        throw new DeveloperError(
          `${name} must be ${integer ? "an integer" : "finite"} in [${minimum}, ${maximum}].`,
        );
      }
      this[`_${name}`] = value;
      this._scene?.requestRender();
    },
  };
}

/**
 * 估算可见不透明 PBR 模型和 3D Tiles 之间的一次局部漫反射反弹。球面和平面共用视空间算法，不包含屏幕外几何、unlit 材质、地形接收者、透明表面或多次反弹。要求 HDR 及已验证的单视锥主通道 MRT 布局；清漆 SSR 与 SSIL 同开会超出原型的八附件预算。不额外绘制几何。稳定空间滤波没有独立历史，可选 TAA 仍归调用方控制。
 *
 * 附加效果归 Scene 所有，提前 destroy 可解绑。禁用保留已分配资源；以禁用状态构造时不分配 GPU 资源。
 *
 * @alias SceneGISScreenSpaceIndirectLighting
 * @constructor
 * @experimental 此功能尚未定稿，可能不按 Cesium 标准弃用流程发生变化。
 * @param {object} options 初始化选项。
 * @param {Scene} options.scene 存活的 Scene，仅可附加一个实例。
 * @param {boolean} [options.enabled=false] 是否启用间接光照。
 * @param {number} [options.radius=5.0] 最大收集距离，单位为米，须大于零。
 * @param {number} [options.thickness=0.5] 假定表面厚度，单位为米，须大于零。
 * @param {number} [options.intensity=1.0] 间接光倍率，范围 [0,4]。
 * @param {number} [options.directionCount=4] 半球切片数，整数，范围 [1,8]。
 * @param {number} [options.stepCount=8] 每个切片每侧的样本数，整数，范围 [2,16]。
 * @param {number} [options.resolutionScale=0.5] 估计分辨率，可取 0.5 或 1。
 * @example
 * viewer.scene.highDynamicRange = true;
 * const indirectLighting = new Cesium.SceneGISScreenSpaceIndirectLighting({
 *   scene: viewer.scene,
 *   enabled: true,
 *   radius: 5.0,
 * });
 */
function SceneGISScreenSpaceIndirectLighting(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  const scene = options.scene;
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (defined(scene._sceneGISScreenSpaceIndirectLighting)) {
    throw new DeveloperError(
      "Only one SceneGISScreenSpaceIndirectLighting may be attached to a Scene.",
    );
  }
  this._ready = false;
  this._state = undefined;
  this.radius = options.radius ?? 5.0;
  this.thickness = options.thickness ?? 0.5;
  this.intensity = options.intensity ?? 1.0;
  this.directionCount = options.directionCount ?? 4;
  this.stepCount = options.stepCount ?? 8;
  this.resolutionScale = options.resolutionScale ?? 0.5;
  this.enabled = options.enabled ?? false;
  this._scene = scene;
  if (this.enabled) {
    this._validate();
  }
  scene._sceneGISScreenSpaceIndirectLighting = this;
  scene.requestRender();
}

/**
 * 测试基本 GPU 支持，当前 Scene 布局在渲染前检查。
 * @param {Scene} scene 需要测试的 Scene。
 * @returns {boolean} 是否支持必需格式与绘制缓冲。
 */
SceneGISScreenSpaceIndirectLighting.isSupported = function (scene) {
  const c = scene.context;
  return (
    c.webgl2 &&
    c.depthTexture &&
    c.colorBufferFloat &&
    c.colorBufferHalfFloat &&
    ContextLimits.maximumDrawBuffers >= 3 &&
    ContextLimits.maximumColorAttachments >= 3
  );
};

Object.defineProperties(SceneGISScreenSpaceIndirectLighting.prototype, {
  /**
   * 是否启用间接光照。
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
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
      if (value && this._scene) {
        this._validate();
      }
      this._enabled = value;
      this._ready = false;
      this._scene?.requestRender();
    },
  },
  /**
   * 当前帧是否已生成间接光照结果。
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
  /**
   * 最大收集距离，单位为米。
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 5.0
   */
  radius: numberProperty("radius", Number.EPSILON, Number.MAX_VALUE),
  /**
   * 假定表面厚度，单位为米；单层深度无法恢复真实厚度。
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 0.5
   */
  thickness: numberProperty("thickness", Number.EPSILON, Number.MAX_VALUE),
  /**
   * 间接光倍率，范围 [0,4]。
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 1.0
   */
  intensity: numberProperty("intensity", 0, 4),
  /**
   * 半球切片数，范围 [1,8]。
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 4
   */
  directionCount: numberProperty("directionCount", 1, 8, true),
  /**
   * 每个切片每侧的样本数，范围 [2,16]。
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 8
   */
  stepCount: numberProperty("stepCount", 2, 16, true),
  /**
   * 估计分辨率，可取 0.5 或 1。
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 0.5
   */
  resolutionScale: {
    get: function () {
      return this._resolutionScale;
    },
    set: function (value) {
      if (value !== 0.5 && value !== 1) {
        throw new DeveloperError("resolutionScale must be 0.5 or 1.");
      }
      this._resolutionScale = value;
      this._scene?.requestRender();
    },
  },
});

/** @private */
SceneGISScreenSpaceIndirectLighting.prototype._validate = function () {
  const scene = this._scene;
  if (
    scene.mode !== SceneMode.SCENE3D ||
    !scene.highDynamicRange ||
    !SceneGISScreenSpaceIndirectLighting.isSupported(scene)
  ) {
    throw new RuntimeError(
      "SSIL requires SCENE3D, HDR, WebGL2, floating-point color/depth targets and three draw buffers.",
    );
  }
};

/**
 *  @returns {boolean} 此效果是否已销毁。
 */
SceneGISScreenSpaceIndirectLighting.prototype.isDestroyed = function () {
  return false;
};

/**
 * 释放自有 GPU 资源并从 Scene 解绑。
 * @returns {undefined}
 */
SceneGISScreenSpaceIndirectLighting.prototype.destroy = function () {
  Renderer.destroy(this);
  this._scene._sceneGISScreenSpaceIndirectLighting = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};

export default SceneGISScreenSpaceIndirectLighting;

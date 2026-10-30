import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import RuntimeError from "../../Core/RuntimeError.js";
import Renderer from "./_private/_SceneGISAutoExposure.js";

function numberProperty(name, minimum, maximum) {
  return {
    get: function () {
      return this[`_${name}`];
    },
    set: function (value) {
      if (!Number.isFinite(value) || value < minimum || value > maximum) {
        throw new DeveloperError(
          `${name} must be finite in [${minimum}, ${maximum}].`,
        );
      }
      if (
        (name === "minimumExposure" && value > this._maximumExposure) ||
        (name === "maximumExposure" && value < this._minimumExposure) ||
        (name === "lowPercent" && this._highPercent - value < 0.0001) ||
        (name === "highPercent" && value - this._lowPercent < 0.0001)
      ) {
        throw new DeveloperError(
          "Exposure limits must be ordered and highPercent - lowPercent must be at least 0.0001.",
        );
      }
      this[`_${name}`] = value;
      this._scene?.requestRender();
    },
  };
}

/**
 * 用于 HDR 球面和平面场景的全局直方图自动曝光。在原生泛光和色调映射之前进行有界 GPU 测光，不重绘几何。将相对亮度映射到中灰（0.18），不提供 EV100 标定。原生 postProcessStages.exposure 仍作为额外的正倍率。
 *
 * 此控制器归 Scene 所有。禁用会释放 GPU 资源，并在下一次渲染帧恢复原生手动曝光。不自动请求额外收敛帧，按需渲染应用须控制自身刷新节奏。适应过程使用渲染帧之间的实际时间，不使用模拟时钟。相机跳变或内容替换后调用 reset 可立即重新测光。
 *
 * @alias SceneGISAutoExposure
 * @constructor
 * @experimental 此功能尚未定稿，可能不按 Cesium 标准弃用流程发生变化。
 * @param {object} options 初始化选项。
 * @param {Scene} options.scene 存活的 Scene，仅可附加一个控制器。
 * @param {boolean} [options.enabled=false] 启用自动曝光，要求 HDR 和 WebGL2 浮点目标。
 * @param {boolean} [options.locked=false] 首次测光帧后冻结适应增益。
 * @param {number} [options.exposureCompensation=0] 适应后应用的曝光补偿，单位为档，范围 [-10,10]。
 * @param {number} [options.minimumExposure=0.015625] 曝光补偿和原生曝光之前的自动线性增益下限，范围 [0.0000152587890625,65536]。
 * @param {number} [options.maximumExposure=64] 曝光补偿和原生曝光之前的自动线性增益上限，范围 [0.0000152587890625,65536]。
 * @param {number} [options.speedUp=3] 向较亮环境适应的速度，单位为档/秒，范围 [0.01,100]。
 * @param {number} [options.speedDown=1] 向较暗环境适应的速度，单位为档/秒，范围 [0.01,100]。
 * @param {number} [options.lowPercent=0.05] 直方图保留下百分位，以比例表示，至少比 highPercent 低 0.0001，范围 [0,0.99]。
 * @param {number} [options.highPercent=0.95] 直方图保留上百分位，以比例表示，至少比 lowPercent 高 0.0001，范围 [0.01,1]。
 * @param {number} [options.centerWeight=0.75] 从均匀测光 0 混合到高斯中心加权 1，范围 [0,1]。
 * @example
 * viewer.scene.highDynamicRange = true;
 * const exposure = new Cesium.SceneGISAutoExposure({ scene: viewer.scene, enabled: true });
 * exposure.exposureCompensation = 0.5;
 */
function SceneGISAutoExposure(options) {
  const scene = options?.scene;
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (scene.postProcessStages._sceneGISAutoExposure) {
    throw new DeveloperError(
      "Only one SceneGISAutoExposure may be attached to a Scene.",
    );
  }
  this._ready = false;
  this._state = undefined;
  this.exposureCompensation = options.exposureCompensation ?? 0;
  this.minimumExposure = options.minimumExposure ?? 0.015625;
  this.maximumExposure = options.maximumExposure ?? 64;
  this.speedUp = options.speedUp ?? 3;
  this.speedDown = options.speedDown ?? 1;
  this.lowPercent = options.lowPercent ?? 0.05;
  this.highPercent = options.highPercent ?? 0.95;
  this.centerWeight = options.centerWeight ?? 0.75;
  this.locked = options.locked ?? false;
  this.enabled = options.enabled ?? false;
  this._scene = scene;
  if (this.enabled) {
    this._validate();
  }
  scene.postProcessStages._sceneGISAutoExposure = this;
  scene.requestRender();
}

/**
 * 测试控制器所需 GPU 格式是否可用，还须启用 HDR。
 * @param {Scene} scene 需要测试的 Scene。
 * @returns {boolean} 是否支持 WebGL2 浮点颜色目标。
 */
SceneGISAutoExposure.isSupported = function (scene) {
  return scene.context.webgl2 && scene.context.colorBufferFloat;
};

Object.defineProperties(SceneGISAutoExposure.prototype, {
  /**
   * 是否启用自动曝光；禁用会释放 GPU 资源。
   * @memberof SceneGISAutoExposure.prototype
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
      if (!value) {
        Renderer.destroy(this);
      }
      this._enabled = value;
      this._scene?.requestRender();
    },
  },
  /**
   * 冻结测光增益，曝光补偿和原生曝光仍可调整。
   * @memberof SceneGISAutoExposure.prototype
   * @type {boolean}
   * @default false
   */
  locked: {
    get: function () {
      return this._locked;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("locked must be boolean.");
      }
      this._locked = value;
      this._scene?.requestRender();
    },
  },
  /**
   * 是否存在可用的测光结果。
   * @memberof SceneGISAutoExposure.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
  /**
   * 适应后应用的曝光补偿，单位为档，范围 [-10,10]。
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0
   */
  exposureCompensation: numberProperty("exposureCompensation", -10, 10),
  /**
   * 曝光补偿和原生曝光之前的自动线性增益下限，范围 [0.0000152587890625,65536]。
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0.015625
   */
  minimumExposure: numberProperty("minimumExposure", 0.0000152587890625, 65536),
  /**
   * 曝光补偿和原生曝光之前的自动线性增益上限，范围 [0.0000152587890625,65536]。
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 64
   */
  maximumExposure: numberProperty("maximumExposure", 0.0000152587890625, 65536),
  /**
   * 向较亮环境适应的速度，单位为档/秒，范围 [0.01,100]。
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 3
   */
  speedUp: numberProperty("speedUp", 0.01, 100),
  /**
   * 向较暗环境适应的速度，单位为档/秒，范围 [0.01,100]。
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 1
   */
  speedDown: numberProperty("speedDown", 0.01, 100),
  /**
   * 直方图保留下百分位，以比例表示，范围 [0,0.99]。
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0.05
   */
  lowPercent: numberProperty("lowPercent", 0, 0.99),
  /**
   * 直方图保留上百分位，以比例表示，范围 [0.01,1]。
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0.95
   */
  highPercent: numberProperty("highPercent", 0.01, 1),
  /**
   * 从均匀测光 0 混合到高斯中心加权 1，范围 [0,1]。
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0.75
   */
  centerWeight: numberProperty("centerWeight", 0, 1),
});

/** @private */
SceneGISAutoExposure.prototype._validate = function () {
  if (
    !this._scene.highDynamicRange ||
    !SceneGISAutoExposure.isSupported(this._scene)
  ) {
    throw new RuntimeError(
      "Auto exposure requires HDR, WebGL2 and floating-point color targets.",
    );
  }
  const exposure = this._scene.postProcessStages.exposure;
  if (!Number.isFinite(exposure) || exposure <= 0) {
    throw new RuntimeError(
      "Native exposure must be finite and positive while auto exposure is enabled.",
    );
  }
};

/**
 *  丢弃适应历史，在下一渲染帧立即测光。
 */
SceneGISAutoExposure.prototype.reset = function () {
  this._ready = false;
  this._scene.requestRender();
};

/**
 *  @returns {boolean} 此控制器是否已销毁。
 */
SceneGISAutoExposure.prototype.isDestroyed = function () {
  return false;
};

/**
 * 释放 GPU 资源并从 Scene 解绑。
 * @returns {undefined}
 */
SceneGISAutoExposure.prototype.destroy = function () {
  Renderer.destroy(this);
  this._scene.postProcessStages._sceneGISAutoExposure = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};
export default SceneGISAutoExposure;

import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import RuntimeError from "../../Core/RuntimeError.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import SceneMode from "../../Scene/SceneMode.js";
import Renderer from "./_private/_SceneGISScreenSpaceReflections.js";

function requestRender(effect) {
  effect._ready = false;
  if (effect._state?.tracing) {
    effect._state.tracing.valid = false;
  }
  effect._scene?.requestRender();
}

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
      requestRender(this);
    },
  };
}

/**
 * 为不透明原生 PBR 模型和 3D Tiles 添加分层屏幕空间反射。球面和平面共用视空间追踪，未命中由已有镜面 IBL 补足。不包含透明对象、分类覆盖或屏幕外几何。必须显式开启 HDR。附加效果归 Scene 所有并随 Scene 销毁，提前 destroy 可解绑。禁用保留已分配目标以便复用。
 *
 * @alias SceneGISScreenSpaceReflections
 * @constructor
 * @param {object} options 初始化选项。
 * @param {Scene} options.scene 存活的 Scene，仅可附加一个效果。
 * @param {boolean} [options.enabled=false] 是否启用反射。
 * @param {number} [options.maximumDistance=100.0] 最大射线长度，单位为米，须大于零。
 * @param {number} [options.thickness=0.5] 视空间深度求交容差，单位为米，须大于零。
 * @param {number} [options.maximumRoughness=0.6] 感知粗糙度截止值，范围 (0,1]。
 * @param {number} [options.stepCount=96] 每个瓣的最大遍历步数，整数，范围 [16,256]。
 * @param {number} [options.resolutionScale=0.5] 追踪分辨率，可取 0.5 或 1；全分辨率可保留细反射体。
 * @param {boolean} [options.temporalFiltering=true] 是否复用已验证反射历史；重投影处理相机运动，不处理物体运动。
 * @example
 * viewer.scene.highDynamicRange = true;
 * const reflections = new Cesium.SceneGISScreenSpaceReflections({
 *   scene: viewer.scene,
 *   enabled: true,
 * });
 */
function SceneGISScreenSpaceReflections(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  const scene = options.scene;
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (defined(scene._sceneGISScreenSpaceReflections)) {
    throw new DeveloperError(
      "Only one SceneGISScreenSpaceReflections may be attached to a Scene.",
    );
  }
  this._ready = false;
  this._state = undefined;
  this.maximumDistance = options.maximumDistance ?? 100.0;
  this.thickness = options.thickness ?? 0.5;
  this.maximumRoughness = options.maximumRoughness ?? 0.6;
  this.stepCount = options.stepCount ?? 96;
  this.resolutionScale = options.resolutionScale ?? 0.5;
  this.temporalFiltering = options.temporalFiltering ?? true;
  this.enabled = options.enabled ?? false;
  this._scene = scene;
  if (this.enabled) {
    this._validate();
  }
  scene._sceneGISScreenSpaceReflections = this;
  scene.requestRender();
}

/**
 * 测试 GPU 支持，独立于当前 Scene 模式和 HDR 设置。
 * @param {Scene} scene 需要测试的 Scene。
 * @returns {boolean} 是否支持必需纹理与帧缓冲格式。
 */
SceneGISScreenSpaceReflections.isSupported = function (scene) {
  const c = scene.context;
  return (
    c.webgl2 &&
    c.depthTexture &&
    c.colorBufferFloat &&
    c.colorBufferHalfFloat &&
    c.textureHalfFloatLinear &&
    ContextLimits.maximumDrawBuffers >= 3
  );
};

Object.defineProperties(SceneGISScreenSpaceReflections.prototype, {
  /**
   * 是否启用效果。
   * @memberof SceneGISScreenSpaceReflections.prototype
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
      if (value && defined(this._scene)) {
        this._validate();
      }
      this._enabled = value;
      requestRender(this);
    },
  },
  /**
   * 一次完整的当前渲染是否已生成反射数据。
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
  /**
   * 最大射线长度，单位为米。
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {number}
   * @default 100.0
   */
  maximumDistance: numberProperty(
    "maximumDistance",
    Number.EPSILON,
    Number.MAX_VALUE,
  ),
  /**
   * 视空间深度求交容差，单位为米。
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {number}
   * @default 0.5
   */
  thickness: numberProperty("thickness", Number.EPSILON, Number.MAX_VALUE),
  /**
   * 感知粗糙度截止值，更粗糙表面保留 IBL。
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {number}
   * @default 0.6
   */
  maximumRoughness: numberProperty("maximumRoughness", Number.EPSILON, 1),
  /**
   * 每个瓣的最大遍历步数，范围 [16,256]。
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {number}
   * @default 96
   */
  stepCount: numberProperty("stepCount", 16, 256, true),
  /**
   * 追踪分辨率，可取 0.5 或 1；较低分辨率减少追踪和历史成本。
   * @memberof SceneGISScreenSpaceReflections.prototype
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
      requestRender(this);
    },
  },
  /**
   * 是否复用已验证反射历史。光照或内容不连续变化后调用 reset；仅按相机重投影不能正确跟踪运动物体。
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {boolean}
   * @default true
   */
  temporalFiltering: {
    get: function () {
      return this._temporalFiltering;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("temporalFiltering must be boolean.");
      }
      this._temporalFiltering = value;
      requestRender(this);
    },
  },
});

/**
 * 场景、光照或材质发生不连续修改后丢弃反射历史。请求一次渲染，不调度收敛帧。
 */
SceneGISScreenSpaceReflections.prototype.reset = function () {
  requestRender(this);
};

/** @private */
SceneGISScreenSpaceReflections.prototype._validate = function () {
  const scene = this._scene;
  if (
    scene.mode !== SceneMode.SCENE3D ||
    !scene.highDynamicRange ||
    !SceneGISScreenSpaceReflections.isSupported(scene)
  ) {
    throw new RuntimeError(
      "Screen-space reflections require SCENE3D, HDR, WebGL2, floating-point color/depth targets and three draw buffers.",
    );
  }
};

/**
 *  @returns {boolean} 此效果是否已销毁。
 */
SceneGISScreenSpaceReflections.prototype.isDestroyed = function () {
  return false;
};

/**
 * 释放全部自有 GPU 资源并从 Scene 解绑。
 * @returns {undefined}
 */
SceneGISScreenSpaceReflections.prototype.destroy = function () {
  Renderer.destroy(this);
  this._scene._sceneGISScreenSpaceReflections = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};

export default SceneGISScreenSpaceReflections;

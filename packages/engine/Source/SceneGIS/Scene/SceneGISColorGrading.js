import Cartesian3 from "../../Core/Cartesian3.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Matrix3 from "../../Core/Matrix3.js";
import RuntimeError from "../../Core/RuntimeError.js";
import shader from "../../Shaders/SceneGIS/SceneGISColorGradingStage.js";

const rgbToXyz = new Matrix3(
  0.4124564,
  0.3575761,
  0.1804375,
  0.2126729,
  0.7151522,
  0.072175,
  0.0193339,
  0.119192,
  0.9503041,
);
const xyzToRgb = Matrix3.inverse(rgbToXyz, new Matrix3());
const bradford = new Matrix3(
  0.8951,
  0.2664,
  -0.1614,
  -0.7502,
  1.7135,
  0.0367,
  0.0389,
  -0.0685,
  1.0296,
);
const rgbToLms = Matrix3.multiply(bradford, rgbToXyz, new Matrix3());
const lmsToRgb = Matrix3.multiply(
  xyzToRgb,
  Matrix3.inverse(bradford, new Matrix3()),
  new Matrix3(),
);

// CIE D-series daylight locus, valid from 4000 to 25000 K. See ADR-0154.
function daylightWhite(temperature, tint, result) {
  const t = 1000 / temperature;
  const x =
    temperature <= 7000
      ? ((-4.607 * t + 2.9678) * t + 0.09911) * t + 0.244063
      : ((-2.0064 * t + 1.9018) * t + 0.24748) * t + 0.23704;
  const y = -3 * x * x + 2.87 * x - 0.275 + tint * 0.02;
  result.x = x / y;
  result.y = 1;
  result.z = (1 - x - y) / y;
  return Matrix3.multiplyByVector(bradford, result, result);
}
const neutralWhite = daylightWhite(6500, 0, new Cartesian3());

function whiteBalance(effect) {
  if (effect._whiteBalanceDirty) {
    const white = daylightWhite(effect.temperature, effect.tint, effect._white);
    Cartesian3.divideComponents(neutralWhite, white, white);
    Matrix3.fromScale(white, effect._whiteBalance);
    Matrix3.multiply(effect._whiteBalance, rgbToLms, effect._whiteBalance);
    Matrix3.multiply(lmsToRgb, effect._whiteBalance, effect._whiteBalance);
    effect._whiteBalanceDirty = false;
  }
  return effect._whiteBalance;
}

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
      if (this[`_${name}`] !== value) {
        this[`_${name}`] = value;
        if (name === "temperature" || name === "tint") {
          this._whiteBalanceDirty = true;
        }
        this._scene?.requestRender();
      }
    },
  };
}

/**
 * 在原生色调映射中提供可选的线性 HDR 白平衡和调色。控制器归 Scene 所有，不增加纹理、帧缓冲或渲染通道。处理顺序为曝光之后、原生色调曲线和输出 gamma 之前。自动测光、泛光生成、TAA 历史与场景光照保持不变。全局白平衡不能分别校正多个光源。
 *
 * @alias SceneGISColorGrading
 * @constructor
 * @param {object} options 初始化选项。
 * @param {Scene} options.scene 存活的 Scene，仅可附加一个控制器。
 * @param {boolean} [options.enabled=false] 启用调色，要求 HDR。
 * @param {number} [options.temperature=6500] 日光相机白温，单位为开尔文，范围 [4000,25000]。值越高画面越暖，6500 为中性。
 * @param {number} [options.tint=0] 从绿色 -1 到洋红色 1 的校正，0 为中性。
 * @param {number} [options.contrast=1] 围绕曝光后的线性中灰 0.18 调整亮度对比度，范围 [0.5,2]。
 * @param {number} [options.saturation=1] 保持亮度的饱和度，范围 [0,2]；0 为灰度。
 * @throws {DeveloperError} 选项无效或已有其他控制器附加。
 * @throws {RuntimeError} 未开启 HDR 却启用了调色。
 * @example
 * viewer.scene.highDynamicRange = true;
 * const grading = new Cesium.SceneGISColorGrading({
 *   scene: viewer.scene, enabled: true, temperature: 7500, contrast: 1.1,
 * });
 */
function SceneGISColorGrading(options) {
  const scene = options?.scene;
  if (
    !scene ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (scene.postProcessStages._sceneGISColorGrading) {
    throw new DeveloperError(
      "Only one SceneGISColorGrading may be attached to a Scene.",
    );
  }
  this._white = new Cartesian3();
  this._whiteBalance = new Matrix3();
  this.temperature = options.temperature ?? 6500;
  this.tint = options.tint ?? 0;
  this.contrast = options.contrast ?? 1;
  this.saturation = options.saturation ?? 1;
  this._scene = scene;
  this.enabled = options.enabled ?? false;
  scene.postProcessStages._sceneGISColorGrading = this;
}

Object.defineProperties(SceneGISColorGrading.prototype, {
  /**
   * 是否启用调色；要求 HDR，禁用会恢复原生渲染。
   * @memberof SceneGISColorGrading.prototype
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
      if (value && !this._scene.highDynamicRange) {
        throw new RuntimeError("Color grading requires HDR.");
      }
      this._enabled = value;
      this._scene.requestRender();
    },
  },
  /**
   * 日光相机白温，单位为开尔文，范围 [4000,25000]，值越高画面越暖。
   * @memberof SceneGISColorGrading.prototype
   * @type {number}
   * @default 6500
   */
  temperature: numberProperty("temperature", 4000, 25000),
  /**
   * 从绿色 -1 到洋红色 1 的无量纲校正，不是经过标定的相机色调。
   * @memberof SceneGISColorGrading.prototype
   * @type {number}
   * @default 0
   */
  tint: numberProperty("tint", -1, 1),
  /**
   * 围绕曝光后的线性中灰 0.18 调整亮度对比度，范围 [0.5,2]。
   * @memberof SceneGISColorGrading.prototype
   * @type {number}
   * @default 1
   */
  contrast: numberProperty("contrast", 0.5, 2),
  /**
   * 保持亮度的饱和度，范围 [0,2]，0 产生灰度图。
   * @memberof SceneGISColorGrading.prototype
   * @type {number}
   * @default 1
   */
  saturation: numberProperty("saturation", 0, 2),
});

/**
 *  @returns {boolean} 控制器是否已销毁。
 */
SceneGISColorGrading.prototype.isDestroyed = function () {
  return false;
};

/**
 * 解绑控制器，下一渲染帧恢复原生色调着色器。
 * @returns {undefined}
 */
SceneGISColorGrading.prototype.destroy = function () {
  this._scene.postProcessStages._sceneGISColorGrading = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};

/** @private */
SceneGISColorGrading._update = function (collection, useHdr, context) {
  const active = collection._sceneGISColorGrading?.enabled === true;
  if (active && !useHdr) {
    throw new RuntimeError("Color grading requires HDR.");
  }
  const bound = active ? collection._sceneGISColorGrading : undefined;
  const frameState = context.uniformState.frameState;
  const environment =
    frameState?._sceneGISGlobeLighting ?? frameState?._sceneGISPlanarLighting;
  const solarAvailable = environment?.active === true;
  const changed =
    bound !== collection._sceneGISColorGradingBound ||
    solarAvailable !==
      (collection._sceneGISSolarWhiteBalanceAvailable === true);
  collection._sceneGISSolarWhiteBalanceAvailable = solarAvailable;
  collection._sceneGISSolarWhiteBalanceEnabled =
    solarAvailable && environment.whiteBalance === true;
  collection._sceneGISColorGradingBound = bound;
  collection._sceneGISColorGradingActive = active;
  return changed;
};

/** @private */
SceneGISColorGrading._configureStage = function (collection, stage) {
  if (
    !collection._sceneGISColorGradingActive &&
    !collection._sceneGISSolarWhiteBalanceAvailable
  ) {
    return;
  }
  const effect = collection._sceneGISColorGradingActive
    ? collection._sceneGISColorGrading
    : undefined;
  // The collection calls this exactly once, before the fresh native stage's update.
  stage._fragmentShader = `#define SCENEGIS_COLOR_GRADING\n${shader}\n${stage.fragmentShader}`;
  stage.uniforms.u_sceneGISSolarWhiteBalanceEnabled = () =>
    collection._sceneGISSolarWhiteBalanceEnabled === true;
  stage.uniforms.u_sceneGISWhiteBalance = () =>
    effect ? whiteBalance(effect) : Matrix3.IDENTITY;
  stage.uniforms.u_sceneGISWhiteBalanceEnabled = () =>
    !!effect && (effect.temperature !== 6500 || effect.tint !== 0);
  stage.uniforms.u_sceneGISContrast = () => effect?.contrast ?? 1;
  stage.uniforms.u_sceneGISSaturation = () => effect?.saturation ?? 1;
};

export default SceneGISColorGrading;

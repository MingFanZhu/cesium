import Color from "../../Core/Color.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SplitDirection from "../../Scene/SplitDirection.js";
import { validateImageryProvider } from "./_private/_SceneGISPlanarImagery.js";

function validateAlpha(value) {
  if (!Number.isFinite(value) || value < 0.0 || value > 1.0) {
    throw new DeveloperError("alpha must be a finite number from zero to one.");
  }
}

function validateSplitDirection(value) {
  if (
    value !== SplitDirection.LEFT &&
    value !== SplitDirection.NONE &&
    value !== SplitDirection.RIGHT &&
    value !== SplitDirection.TOP &&
    value !== SplitDirection.BOTTOM
  ) {
    throw new DeveloperError("splitDirection must be a SplitDirection value.");
  }
}

function validateUnitRange(name, value) {
  if (!Number.isFinite(value) || value < 0.0 || value > 1.0) {
    throw new DeveloperError(
      `${name} must be a finite number from zero to one.`,
    );
  }
}

function validateNonNegative(name, value) {
  if (!Number.isFinite(value) || value < 0.0) {
    throw new DeveloperError(`${name} must be a finite non-negative number.`);
  }
}

function validateFinite(name, value) {
  if (!Number.isFinite(value)) {
    throw new DeveloperError(`${name} must be a finite number.`);
  }
}

function validateGamma(value) {
  if (!Number.isFinite(value) || value <= 0.0) {
    throw new DeveloperError("gamma must be a finite positive number.");
  }
}

function validateColorToAlpha(value) {
  if (value === undefined) {
    return;
  }
  if (
    !(value instanceof Color) ||
    !Number.isFinite(value.red) ||
    value.red < 0.0 ||
    value.red > 1.0 ||
    !Number.isFinite(value.green) ||
    value.green < 0.0 ||
    value.green > 1.0 ||
    !Number.isFinite(value.blue) ||
    value.blue < 0.0 ||
    value.blue > 1.0
  ) {
    throw new DeveloperError(
      "colorToAlpha must be undefined or a Color with finite RGB components from zero to one.",
    );
  }
}

function colorsEqualRgb(left, right) {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.red === right.red &&
      left.green === right.green &&
      left.blue === right.blue)
  );
}

/**
 * 按顺序组织的平面栅格影像图层。
 *
 * @alias SceneGISPlanarImageryLayer
 * @constructor
 *
 * @param {SceneGISPlanarImageryProvider} imageryProvider 满足结构契约的平面影像提供者。
 * @param {object} [options] 包含以下属性的对象：
 * @param {boolean} [options.show=true] 是否显示图层。
 * @param {number} [options.alpha=1.0] 图层不透明度。
 * @param {SplitDirection} [options.splitDirection=SplitDirection.NONE] 在 {@link Scene#splitPosition} 的哪一侧显示此图层。
 * @param {number} [options.brightness=1.0] 图层亮度。
 * @param {number} [options.contrast=1.0] 图层对比度。
 * @param {number} [options.hue=0.0] 图层色相旋转，单位为弧度。
 * @param {number} [options.saturation=1.0] 图层饱和度。
 * @param {number} [options.gamma=1.0] 图层 gamma。
 * @param {Color} [options.colorToAlpha] 要变为透明的原始采样 RGB 颜色。
 * @param {number} [options.colorToAlphaThreshold=0.004] 颜色转 alpha 使用的严格最大通道 RGB 距离。
 *
 * @exception {DeveloperError} 提供者、显隐、alpha、分屏方向或滤镜选项无效。
 */
function SceneGISPlanarImageryLayer(imageryProvider, options) {
  validateImageryProvider(imageryProvider);
  options = options ?? Frozen.EMPTY_OBJECT;
  const show = options.show ?? true;
  const alpha = options.alpha ?? 1.0;
  const splitDirection = options.splitDirection ?? SplitDirection.NONE;
  const brightness = options.brightness ?? 1.0;
  const contrast = options.contrast ?? 1.0;
  const hue = options.hue ?? 0.0;
  const saturation = options.saturation ?? 1.0;
  const gamma = options.gamma ?? 1.0;
  const colorToAlpha = options.colorToAlpha;
  const colorToAlphaThreshold = options.colorToAlphaThreshold ?? 0.004;
  if (typeof show !== "boolean") {
    throw new DeveloperError("show must be a boolean.");
  }
  validateAlpha(alpha);
  validateSplitDirection(splitDirection);
  validateNonNegative("brightness", brightness);
  validateNonNegative("contrast", contrast);
  validateFinite("hue", hue);
  validateNonNegative("saturation", saturation);
  validateGamma(gamma);
  validateColorToAlpha(colorToAlpha);
  validateUnitRange("colorToAlphaThreshold", colorToAlphaThreshold);

  this._imageryProvider = imageryProvider;
  this._show = show;
  this._alpha = alpha;
  this._splitDirection = splitDirection;
  this._brightness = brightness;
  this._contrast = contrast;
  this._hue = hue;
  this._saturation = saturation;
  this._gamma = gamma;
  this._colorToAlpha = Color.clone(colorToAlpha);
  this._colorToAlphaThreshold = colorToAlphaThreshold;
  this._collection = undefined;
  this._changeListener = undefined;
}

Object.defineProperties(SceneGISPlanarImageryLayer.prototype, {
  /**
   * 获取满足结构契约的平面影像提供者，图层不拥有它。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {SceneGISPlanarImageryProvider}
   * @readonly
   */
  imageryProvider: {
    get: function () {
      return this._imageryProvider;
    },
  },
  /**
   * 获取或设置此图层是否参与加载与合成。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {boolean}
   * @exception {DeveloperError} 赋值不是布尔值。
   */
  show: {
    get: function () {
      return this._show;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("show must be a boolean.");
      }
      if (value !== this._show) {
        this._show = value;
        this._changeListener?.(this, "show");
      }
    },
  },
  /**
   * 获取或设置从零到一的有限不透明度。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} 赋值超出零到一的有限范围。
   */
  alpha: {
    get: function () {
      return this._alpha;
    },
    set: function (value) {
      validateAlpha(value);
      if (value !== this._alpha) {
        this._alpha = value;
        this._changeListener?.(this, "alpha");
      }
    },
  },
  /**
   * 获取或设置此影像图层在 {@link Scene#splitPosition} 的显示侧。分屏仅影响影像颜色，不影响地表深度或瓦片加载。显式渲染启用时，修改分屏方向或 splitPosition 后使用 {@link Scene#requestRender}。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {SplitDirection}
   * @default SplitDirection.NONE
   * @exception {DeveloperError} 赋值不是 LEFT、NONE 或 RIGHT。
   */
  splitDirection: {
    get: function () {
      return this._splitDirection;
    },
    set: function (value) {
      validateSplitDirection(value);
      if (value !== this._splitDirection) {
        this._splitDirection = value;
        this._changeListener?.(this, "splitDirection");
      }
    },
  },
  /**
   * 获取或设置有限非负亮度。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} 赋值不是有限非负数。
   */
  brightness: {
    get: function () {
      return this._brightness;
    },
    set: function (value) {
      validateNonNegative("brightness", value);
      if (value !== this._brightness) {
        this._brightness = value;
        this._changeListener?.(this, "brightness");
      }
    },
  },
  /**
   * 获取或设置有限非负对比度。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} 赋值不是有限非负数。
   */
  contrast: {
    get: function () {
      return this._contrast;
    },
    set: function (value) {
      validateNonNegative("contrast", value);
      if (value !== this._contrast) {
        this._contrast = value;
        this._changeListener?.(this, "contrast");
      }
    },
  },
  /**
   * 获取或设置有限的色相旋转，单位为弧度。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} 赋值非有限值。
   */
  hue: {
    get: function () {
      return this._hue;
    },
    set: function (value) {
      validateFinite("hue", value);
      if (value !== this._hue) {
        this._hue = value;
        this._changeListener?.(this, "hue");
      }
    },
  },
  /**
   * 获取或设置有限非负饱和度。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} 赋值不是有限非负数。
   */
  saturation: {
    get: function () {
      return this._saturation;
    },
    set: function (value) {
      validateNonNegative("saturation", value);
      if (value !== this._saturation) {
        this._saturation = value;
        this._changeListener?.(this, "saturation");
      }
    },
  },
  /**
   * 获取或设置有限正 gamma。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} 赋值不是有限正数。
   */
  gamma: {
    get: function () {
      return this._gamma;
    },
    set: function (value) {
      validateGamma(value);
      if (value !== this._gamma) {
        this._gamma = value;
        this._changeListener?.(this, "gamma");
      }
    },
  },
  /**
   * 获取或设置将变为透明的原始采样 RGB 颜色，采用隔离副本。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {Color|undefined}
   * @exception {DeveloperError} 赋值不是 undefined 或 RGB 为有限归一化值的 Color。
   */
  colorToAlpha: {
    get: function () {
      return Color.clone(this._colorToAlpha);
    },
    set: function (value) {
      validateColorToAlpha(value);
      if (!colorsEqualRgb(value, this._colorToAlpha)) {
        this._colorToAlpha = Color.clone(value, this._colorToAlpha);
        this._changeListener?.(this, "colorToAlpha");
      }
    },
  },
  /**
   * 获取或设置闭区间内有限的颜色转 alpha 阈值。
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} 赋值超出零到一的有限范围。
   */
  colorToAlphaThreshold: {
    get: function () {
      return this._colorToAlphaThreshold;
    },
    set: function (value) {
      validateUnitRange("colorToAlphaThreshold", value);
      if (value !== this._colorToAlphaThreshold) {
        this._colorToAlphaThreshold = value;
        this._changeListener?.(this, "colorToAlphaThreshold");
      }
    },
  },
});

/**
 * 此对象已销毁时返回 true，否则返回 false。
 * @returns {boolean} 已销毁时为 True。
 */
SceneGISPlanarImageryLayer.prototype.isDestroyed = function () {
  return false;
};

/**
 * 销毁已脱离集合的图层，不销毁影像提供者。
 *
 * @returns {void}
 * @exception {DeveloperError} 图层仍挂载在集合中。
 */
SceneGISPlanarImageryLayer.prototype.destroy = function () {
  if (this._collection !== undefined) {
    throw new DeveloperError(
      "An attached imagery layer must be removed before it is destroyed.",
    );
  }
  this._changeListener = undefined;
  return destroyObject(this);
};

export default SceneGISPlanarImageryLayer;

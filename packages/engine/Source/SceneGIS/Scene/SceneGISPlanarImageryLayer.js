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
    value !== SplitDirection.RIGHT
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
 * An ordered planar raster imagery layer.
 *
 * @alias SceneGISPlanarImageryLayer
 * @constructor
 *
 * @param {SceneGISPlanarImageryProvider} imageryProvider The structural planar imagery provider.
 * @param {object} [options] Object with the following properties:
 * @param {boolean} [options.show=true] Whether the layer is shown.
 * @param {number} [options.alpha=1.0] The layer opacity.
 * @param {SplitDirection} [options.splitDirection=SplitDirection.NONE] The side of {@link Scene#splitPosition} on which to display this layer.
 * @param {number} [options.brightness=1.0] The layer brightness.
 * @param {number} [options.contrast=1.0] The layer contrast.
 * @param {number} [options.hue=0.0] The layer hue rotation in radians.
 * @param {number} [options.saturation=1.0] The layer saturation.
 * @param {number} [options.gamma=1.0] The layer gamma.
 * @param {Color} [options.colorToAlpha] The raw sampled RGB color made transparent.
 * @param {number} [options.colorToAlphaThreshold=0.004] The strict maximum-channel RGB distance used by color-to-alpha.
 *
 * @exception {DeveloperError} The provider, show flag, alpha, split direction, or filter options are invalid.
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
   * Gets the structural planar imagery provider. The layer does not own it.
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
   * Gets or sets whether this layer participates in loading and composition.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {boolean}
   * @exception {DeveloperError} The assigned value is not a boolean.
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
   * Gets or sets the finite opacity from zero through one.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is outside the finite range from zero through one.
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
   * Gets or sets the side of {@link Scene#splitPosition} on which this imagery
   * layer is displayed. Splitting affects imagery color only, not surface depth
   * or tile loading. Use {@link Scene#requestRender} after changing the split
   * direction or splitPosition when explicit rendering is enabled.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {SplitDirection}
   * @default SplitDirection.NONE
   * @exception {DeveloperError} The assigned value is not LEFT, NONE, or RIGHT.
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
   * Gets or sets the finite non-negative brightness.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is not a finite non-negative number.
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
   * Gets or sets the finite non-negative contrast.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is not a finite non-negative number.
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
   * Gets or sets the finite hue rotation in radians.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is not finite.
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
   * Gets or sets the finite non-negative saturation.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is not a finite non-negative number.
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
   * Gets or sets the finite positive gamma.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is not a finite positive number.
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
   * Gets or sets a defensively cloned raw sampled RGB color made transparent.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {Color|undefined}
   * @exception {DeveloperError} The assigned value is not undefined or a Color with finite normalized RGB.
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
   * Gets or sets the inclusive finite color-to-alpha threshold range.
   * @memberof SceneGISPlanarImageryLayer.prototype
   * @type {number}
   * @exception {DeveloperError} The assigned value is outside the finite range from zero through one.
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
 * Returns true if this object was destroyed; otherwise, false.
 * @returns {boolean} True if destroyed.
 */
SceneGISPlanarImageryLayer.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys this detached layer. The imagery provider is not destroyed.
 *
 * @returns {void}
 * @exception {DeveloperError} The layer is attached to a collection.
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

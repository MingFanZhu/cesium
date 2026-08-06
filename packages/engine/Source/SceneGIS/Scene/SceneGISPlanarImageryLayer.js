import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import { validateImageryProvider } from "./_private/_SceneGISPlanarImagery.js";

function validateAlpha(value) {
  if (!Number.isFinite(value) || value < 0.0 || value > 1.0) {
    throw new DeveloperError("alpha must be a finite number from zero to one.");
  }
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
 *
 * @exception {DeveloperError} The provider, show flag, or alpha is invalid.
 */
function SceneGISPlanarImageryLayer(imageryProvider, options) {
  validateImageryProvider(imageryProvider);
  options = options ?? Frozen.EMPTY_OBJECT;
  const show = options.show ?? true;
  const alpha = options.alpha ?? 1.0;
  if (typeof show !== "boolean") {
    throw new DeveloperError("show must be a boolean.");
  }
  validateAlpha(alpha);

  this._imageryProvider = imageryProvider;
  this._show = show;
  this._alpha = alpha;
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

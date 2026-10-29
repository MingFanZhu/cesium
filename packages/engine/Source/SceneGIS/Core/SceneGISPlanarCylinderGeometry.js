import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import CylinderGeometry from "../../Core/CylinderGeometry.js";
import DeveloperError from "../../Core/DeveloperError.js";
import PerInstanceColorAppearance from "../../Scene/PerInstanceColorAppearance.js";

function cloneCenter(value) {
  if (
    !(value instanceof Cartesian3) ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z)
  ) {
    throw new DeveloperError("center must be a finite Cartesian3.");
  }
  return Cartesian3.clone(value);
}

/**
 * An immutable CPU description of a planar cylinder aligned with local Z.
 *
 * @alias SceneGISPlanarCylinderGeometry
 * @constructor
 * @param {object} options Object with the following properties:
 * @param {Cartesian3} options.center The center in planar world coordinates.
 * @param {number} options.length The positive length in meters.
 * @param {number} options.topRadius The nonnegative top radius in meters.
 * @param {number} options.bottomRadius The nonnegative bottom radius in meters.
 * @param {number} [options.slices=128] The safe-integer perimeter subdivision count.
 * @exception {DeveloperError} Any option is invalid.
 */
function SceneGISPlanarCylinderGeometry(options) {
  options = options ?? {};
  const length = options.length;
  const topRadius = options.topRadius;
  const bottomRadius = options.bottomRadius;
  const slices = options.slices ?? 128;
  if (!Number.isFinite(length) || length <= 0.0) {
    throw new DeveloperError("length must be finite and positive.");
  }
  if (
    !Number.isFinite(topRadius) ||
    topRadius < 0.0 ||
    !Number.isFinite(bottomRadius) ||
    bottomRadius < 0.0 ||
    (topRadius === 0.0 && bottomRadius === 0.0)
  ) {
    throw new DeveloperError(
      "radii must be finite and nonnegative, with at least one positive radius.",
    );
  }
  if (!Number.isSafeInteger(slices) || slices < 3) {
    throw new DeveloperError("slices must be a safe integer of at least 3.");
  }
  this._origin = cloneCenter(options.center);
  this._length = length;
  this._topRadius = topRadius;
  this._bottomRadius = bottomRadius;
  this._slices = slices;
  const radius = Math.hypot(Math.max(topRadius, bottomRadius), length * 0.5);
  if (!Number.isFinite(radius)) {
    throw new DeveloperError("The derived cylinder bounds must be finite.");
  }
  this._boundingSphere = new BoundingSphere(Cartesian3.ZERO, radius);
}

Object.defineProperties(SceneGISPlanarCylinderGeometry.prototype, {
  /**
   * @memberof SceneGISPlanarCylinderGeometry.prototype
   * @type {Cartesian3}
   * @readonly
   */
  center: {
    get: function () {
      return Cartesian3.clone(this._origin);
    },
  },
  /**
   * @memberof SceneGISPlanarCylinderGeometry.prototype
   * @type {number}
   * @readonly
   */
  length: {
    get: function () {
      return this._length;
    },
  },
  /**
   * @memberof SceneGISPlanarCylinderGeometry.prototype
   * @type {number}
   * @readonly
   */
  topRadius: {
    get: function () {
      return this._topRadius;
    },
  },
  /**
   * @memberof SceneGISPlanarCylinderGeometry.prototype
   * @type {number}
   * @readonly
   */
  bottomRadius: {
    get: function () {
      return this._bottomRadius;
    },
  },
  /**
   * @memberof SceneGISPlanarCylinderGeometry.prototype
   * @type {number}
   * @readonly
   */
  slices: {
    get: function () {
      return this._slices;
    },
  },
});

/** @private */
SceneGISPlanarCylinderGeometry.prototype._createGeometry = function (
  vertexFormat,
) {
  return CylinderGeometry.createGeometry(
    new CylinderGeometry({
      length: this._length,
      topRadius: this._topRadius,
      bottomRadius: this._bottomRadius,
      slices: this._slices,
      vertexFormat: vertexFormat ?? PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
  );
};

/** @private */
SceneGISPlanarCylinderGeometry.prototype._getLocalBoundingSphere = function (
  result,
) {
  return BoundingSphere.clone(this._boundingSphere, result);
};

export default SceneGISPlanarCylinderGeometry;

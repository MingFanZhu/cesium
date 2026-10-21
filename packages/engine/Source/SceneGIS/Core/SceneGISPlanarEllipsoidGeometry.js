import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import DeveloperError from "../../Core/DeveloperError.js";
import EllipsoidGeometry from "../../Core/EllipsoidGeometry.js";
import PerInstanceColorAppearance from "../../Scene/PerInstanceColorAppearance.js";

function clonePositiveCartesian3(value, name) {
  if (
    !(value instanceof Cartesian3) ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z) ||
    value.x <= 0.0 ||
    value.y <= 0.0 ||
    value.z <= 0.0
  ) {
    throw new DeveloperError(`${name} must be a positive finite Cartesian3.`);
  }
  return Cartesian3.clone(value);
}

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
 * An immutable CPU description of a full planar ellipsoid.
 *
 * @alias SceneGISPlanarEllipsoidGeometry
 * @constructor
 * @param {object} options Object with the following properties:
 * @param {Cartesian3} options.center The center in planar world coordinates.
 * @param {Cartesian3} options.radii The positive radii in meters.
 * @param {number} [options.stackPartitions=64] The safe-integer stack count.
 * @param {number} [options.slicePartitions=64] The safe-integer slice count.
 * @exception {DeveloperError} Any option is invalid.
 */
function SceneGISPlanarEllipsoidGeometry(options) {
  options = options ?? {};
  const stackPartitions = options.stackPartitions ?? 64;
  const slicePartitions = options.slicePartitions ?? 64;
  if (!Number.isSafeInteger(stackPartitions) || stackPartitions < 3) {
    throw new DeveloperError(
      "stackPartitions must be a safe integer of at least 3.",
    );
  }
  if (!Number.isSafeInteger(slicePartitions) || slicePartitions < 3) {
    throw new DeveloperError(
      "slicePartitions must be a safe integer of at least 3.",
    );
  }
  this._origin = cloneCenter(options.center);
  this._radii = clonePositiveCartesian3(options.radii, "radii");
  this._stackPartitions = stackPartitions;
  this._slicePartitions = slicePartitions;
  this._boundingSphere = new BoundingSphere(
    Cartesian3.ZERO,
    Cartesian3.maximumComponent(this._radii),
  );
}

Object.defineProperties(SceneGISPlanarEllipsoidGeometry.prototype, {
  /** @memberof SceneGISPlanarEllipsoidGeometry.prototype @type {Cartesian3} @readonly */
  center: {
    get: function () {
      return Cartesian3.clone(this._origin);
    },
  },
  /** @memberof SceneGISPlanarEllipsoidGeometry.prototype @type {Cartesian3} @readonly */
  radii: {
    get: function () {
      return Cartesian3.clone(this._radii);
    },
  },
  /** @memberof SceneGISPlanarEllipsoidGeometry.prototype @type {number} @readonly */
  stackPartitions: {
    get: function () {
      return this._stackPartitions;
    },
  },
  /** @memberof SceneGISPlanarEllipsoidGeometry.prototype @type {number} @readonly */
  slicePartitions: {
    get: function () {
      return this._slicePartitions;
    },
  },
});

/** @private */
SceneGISPlanarEllipsoidGeometry.prototype._createGeometry = function (
  vertexFormat,
) {
  return EllipsoidGeometry.createGeometry(
    new EllipsoidGeometry({
      radii: this._radii,
      stackPartitions: this._stackPartitions,
      slicePartitions: this._slicePartitions,
      vertexFormat: vertexFormat ?? PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
  );
};

/** @private */
SceneGISPlanarEllipsoidGeometry.prototype._getLocalBoundingSphere = function (
  result,
) {
  return BoundingSphere.clone(this._boundingSphere, result);
};

export default SceneGISPlanarEllipsoidGeometry;

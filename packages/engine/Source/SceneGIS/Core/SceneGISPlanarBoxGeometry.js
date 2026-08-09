import BoundingSphere from "../../Core/BoundingSphere.js";
import BoxGeometry from "../../Core/BoxGeometry.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import DeveloperError from "../../Core/DeveloperError.js";
import PerInstanceColorAppearance from "../../Scene/PerInstanceColorAppearance.js";

function cloneFiniteCartesian3(value, name, positive) {
  if (
    !(value instanceof Cartesian3) ||
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    !Number.isFinite(value.z) ||
    (positive && (value.x <= 0.0 || value.y <= 0.0 || value.z <= 0.0))
  ) {
    throw new DeveloperError(
      `${name} must be a ${positive ? "positive " : ""}finite Cartesian3.`,
    );
  }
  return Cartesian3.clone(value);
}

/**
 * An immutable CPU description of a planar box centered at a meter-based position.
 *
 * @alias SceneGISPlanarBoxGeometry
 * @constructor
 * @param {object} options Object with the following properties:
 * @param {Cartesian3} options.center The center in planar world coordinates.
 * @param {Cartesian3} options.dimensions The positive dimensions in meters.
 * @exception {DeveloperError} center or dimensions is invalid.
 */
function SceneGISPlanarBoxGeometry(options) {
  options = options ?? {};
  this._origin = cloneFiniteCartesian3(options.center, "center", false);
  this._dimensions = cloneFiniteCartesian3(
    options.dimensions,
    "dimensions",
    true,
  );
  const halfDimensions = Cartesian3.multiplyByScalar(
    this._dimensions,
    0.5,
    new Cartesian3(),
  );
  const radius = Math.hypot(
    halfDimensions.x,
    halfDimensions.y,
    halfDimensions.z,
  );
  if (!Number.isFinite(radius)) {
    throw new DeveloperError("The derived box bounds must be finite.");
  }
  this._boundingSphere = new BoundingSphere(Cartesian3.ZERO, radius);
}

Object.defineProperties(SceneGISPlanarBoxGeometry.prototype, {
  /**
   * Gets a clone of the center in planar world coordinates.
   * @memberof SceneGISPlanarBoxGeometry.prototype
   * @type {Cartesian3}
   * @readonly
   */
  center: {
    get: function () {
      return Cartesian3.clone(this._origin);
    },
  },
  /**
   * Gets a clone of the positive dimensions in meters.
   * @memberof SceneGISPlanarBoxGeometry.prototype
   * @type {Cartesian3}
   * @readonly
   */
  dimensions: {
    get: function () {
      return Cartesian3.clone(this._dimensions);
    },
  },
});

/** @private */
SceneGISPlanarBoxGeometry.prototype._createGeometry = function () {
  const half = Cartesian3.multiplyByScalar(
    this._dimensions,
    0.5,
    new Cartesian3(),
  );
  return BoxGeometry.createGeometry(
    new BoxGeometry({
      minimum: Cartesian3.negate(half, new Cartesian3()),
      maximum: half,
      vertexFormat: PerInstanceColorAppearance.VERTEX_FORMAT,
    }),
  );
};

/** @private */
SceneGISPlanarBoxGeometry.prototype._getLocalBoundingSphere = function (
  result,
) {
  return BoundingSphere.clone(this._boundingSphere, result);
};

export default SceneGISPlanarBoxGeometry;

import Check from "../../Core/Check.js";
import defined from "../../Core/defined.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";

function checkFiniteNumber(name, value) {
  Check.typeOf.number(name, value);
  if (!Number.isFinite(value)) {
    throw new DeveloperError(`${name} must be a finite number.`);
  }
}

/**
 * A read-only two-dimensional extent in planar world coordinates.
 *
 * @alias SceneGISPlanarExtent
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {number} options.minimumX The minimum X coordinate in meters.
 * @param {number} options.minimumY The minimum Y coordinate in meters.
 * @param {number} options.maximumX The maximum X coordinate in meters.
 * @param {number} options.maximumY The maximum Y coordinate in meters.
 *
 * @exception {DeveloperError} Any boundary is not a finite number.
 * @exception {DeveloperError} <code>maximumX</code> is not greater than <code>minimumX</code>.
 * @exception {DeveloperError} <code>maximumY</code> is not greater than <code>minimumY</code>.
 * @exception {DeveloperError} The derived width or height is not finite.
 */
function SceneGISPlanarExtent(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  checkFiniteNumber("options.minimumX", options.minimumX);
  checkFiniteNumber("options.minimumY", options.minimumY);
  checkFiniteNumber("options.maximumX", options.maximumX);
  checkFiniteNumber("options.maximumY", options.maximumY);

  if (options.maximumX <= options.minimumX) {
    throw new DeveloperError(
      "options.maximumX must be greater than options.minimumX.",
    );
  }
  if (options.maximumY <= options.minimumY) {
    throw new DeveloperError(
      "options.maximumY must be greater than options.minimumY.",
    );
  }

  const width = options.maximumX - options.minimumX;
  const height = options.maximumY - options.minimumY;
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new DeveloperError("The extent width and height must be finite.");
  }

  this._minimumX = options.minimumX;
  this._minimumY = options.minimumY;
  this._maximumX = options.maximumX;
  this._maximumY = options.maximumY;
}

Object.defineProperties(SceneGISPlanarExtent.prototype, {
  /**
   * Gets the minimum X coordinate in meters.
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  minimumX: {
    get: function () {
      return this._minimumX;
    },
  },

  /**
   * Gets the minimum Y coordinate in meters.
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  minimumY: {
    get: function () {
      return this._minimumY;
    },
  },

  /**
   * Gets the maximum X coordinate in meters.
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  maximumX: {
    get: function () {
      return this._maximumX;
    },
  },

  /**
   * Gets the maximum Y coordinate in meters.
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  maximumY: {
    get: function () {
      return this._maximumY;
    },
  },

  /**
   * Gets the width in meters.
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  width: {
    get: function () {
      return this._maximumX - this._minimumX;
    },
  },

  /**
   * Gets the height in meters.
   *
   * @memberof SceneGISPlanarExtent.prototype
   * @type {number}
   * @readonly
   */
  height: {
    get: function () {
      return this._maximumY - this._minimumY;
    },
  },
});

/**
 * Duplicates an extent.
 *
 * @param {SceneGISPlanarExtent} extent The extent to duplicate.
 * @returns {SceneGISPlanarExtent|undefined} A new extent, or <code>undefined</code> if the input is undefined.
 */
SceneGISPlanarExtent.clone = function (extent) {
  if (!defined(extent)) {
    return undefined;
  }

  return new SceneGISPlanarExtent({
    minimumX: extent.minimumX,
    minimumY: extent.minimumY,
    maximumX: extent.maximumX,
    maximumY: extent.maximumY,
  });
};

/**
 * Compares two extents for exact equality.
 *
 * @param {SceneGISPlanarExtent} [left] The first extent.
 * @param {SceneGISPlanarExtent} [right] The second extent.
 * @returns {boolean} <code>true</code> if both extents are equal; otherwise, <code>false</code>.
 */
SceneGISPlanarExtent.equals = function (left, right) {
  return (
    left === right ||
    (defined(left) &&
      defined(right) &&
      left.minimumX === right.minimumX &&
      left.minimumY === right.minimumY &&
      left.maximumX === right.maximumX &&
      left.maximumY === right.maximumY)
  );
};

/**
 * Determines whether a planar position is inside an extent. All four boundaries are inclusive.
 * The position's Z coordinate, if present, is ignored.
 *
 * @param {SceneGISPlanarExtent} extent The extent to test.
 * @param {Cartesian2|Cartesian3} position The planar position to test.
 * @returns {boolean} <code>true</code> if the position is inside the extent; otherwise, <code>false</code>.
 *
 * @exception {DeveloperError} <code>extent</code> is not a SceneGISPlanarExtent.
 * @exception {DeveloperError} The position does not have finite X and Y coordinates.
 */
SceneGISPlanarExtent.contains = function (extent, position) {
  if (!(extent instanceof SceneGISPlanarExtent)) {
    throw new DeveloperError("extent must be a SceneGISPlanarExtent.");
  }
  Check.typeOf.object("position", position);
  checkFiniteNumber("position.x", position.x);
  checkFiniteNumber("position.y", position.y);

  return (
    position.x >= extent.minimumX &&
    position.x <= extent.maximumX &&
    position.y >= extent.minimumY &&
    position.y <= extent.maximumY
  );
};

export default SceneGISPlanarExtent;

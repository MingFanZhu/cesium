import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SceneGISPlanarExtent from "./SceneGISPlanarExtent.js";

/**
 * Defines a bounded planar coordinate system measured in meters. X points east, Y points north,
 * and Z points up. The CRS identifier is opaque metadata; this type does not perform projection
 * or reprojection.
 *
 * @alias SceneGISPlanarCoordinateSystem
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarExtent} options.extent The strictly square world extent.
 * @param {string} [options.crs] An optional non-empty opaque CRS identifier.
 *
 * @exception {DeveloperError} <code>options.extent</code> is not a SceneGISPlanarExtent.
 * @exception {DeveloperError} The extent is not strictly square.
 * @exception {DeveloperError} <code>options.crs</code> is defined but is not a non-empty string.
 */
function SceneGISPlanarCoordinateSystem(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  if (!(options.extent instanceof SceneGISPlanarExtent)) {
    throw new DeveloperError("options.extent must be a SceneGISPlanarExtent.");
  }
  if (options.extent.width !== options.extent.height) {
    throw new DeveloperError("options.extent must be strictly square.");
  }
  if (
    options.crs !== undefined &&
    (typeof options.crs !== "string" || options.crs.length === 0)
  ) {
    throw new DeveloperError(
      "options.crs must be a non-empty string when defined.",
    );
  }

  this._extent = SceneGISPlanarExtent.clone(options.extent);
  this._crs = options.crs;
}

Object.defineProperties(SceneGISPlanarCoordinateSystem.prototype, {
  /**
   * Gets the owned, read-only world extent.
   *
   * @memberof SceneGISPlanarCoordinateSystem.prototype
   * @type {SceneGISPlanarExtent}
   * @readonly
   */
  extent: {
    get: function () {
      return this._extent;
    },
  },

  /**
   * Gets the opaque CRS identifier, if one was supplied.
   *
   * @memberof SceneGISPlanarCoordinateSystem.prototype
   * @type {string|undefined}
   * @readonly
   */
  crs: {
    get: function () {
      return this._crs;
    },
  },
});

export default SceneGISPlanarCoordinateSystem;

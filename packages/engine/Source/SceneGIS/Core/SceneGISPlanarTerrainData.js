// @ts-check

/* eslint-disable no-unused-vars -- Public JSDoc types require runtime-resolvable imports. */
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import SceneGISPlanarExtent from "./SceneGISPlanarExtent.js";
/* eslint-enable no-unused-vars */

/**
 * @returns {never}
 * @private
 */
function throwPropertyInstantiationError() {
  DeveloperError.throwInstantiationError();
  throw new DeveloperError("Unreachable interface property access.");
}

/**
 * Defines read-only CPU terrain data for one planar tile. Concrete data must
 * interpolate on the same surface triangles used by its future mesh consumer.
 * This interface owns no GPU, request, worker, or destroyable resources and is
 * not intended to be instantiated directly.
 *
 * @interface
 * @exception {DeveloperError} This interface must not be instantiated directly.
 */
class SceneGISPlanarTerrainData {
  constructor() {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Gets the minimum decoded height in meters.
   * @type {number}
   * @constant
   */
  get minimumHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the maximum decoded height in meters.
   * @type {number}
   * @constant
   */
  get maximumHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the credits associated with this tile.
   * @type {Credit[]|undefined}
   * @constant
   */
  get credits() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the water mask owned by this tile.
   * @type {Uint8Array|undefined}
   * @constant
   */
  get waterMask() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets whether this data was created by upsampling.
   * @type {boolean}
   * @constant
   */
  get wasCreatedByUpsampling() {
    return throwPropertyInstantiationError();
  }

  /**
   * Interpolates the terrain height at a planar position.
   *
   * @param {SceneGISPlanarExtent} extent The tile extent represented by this data.
   * @param {number} x The X coordinate in meters.
   * @param {number} y The Y coordinate in meters.
   * @returns {number|undefined} The interpolated height in meters, or undefined when the finite position is outside the extent.
   */
  interpolateHeight(extent, x, y) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Determines whether a direct child tile is available.
   *
   * @param {number} thisX The parent tile X coordinate.
   * @param {number} thisY The parent tile Y coordinate.
   * @param {number} childX The direct child tile X coordinate.
   * @param {number} childY The direct child tile Y coordinate.
   * @returns {boolean} True if the child is available; otherwise, false.
   */
  isChildAvailable(thisX, thisY, childX, childY) {
    DeveloperError.throwInstantiationError();
  }
}

export default SceneGISPlanarTerrainData;

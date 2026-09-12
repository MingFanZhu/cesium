// @ts-check

/* eslint-disable no-unused-vars -- Public JSDoc types require runtime-resolvable imports. */
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Request from "../../Core/Request.js";
import SceneGISPlanarTerrainData from "./SceneGISPlanarTerrainData.js";
import SceneGISPlanarTilingScheme from "./SceneGISPlanarTilingScheme.js";
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
 * Defines the structural contract for terrain providers used with a planar
 * tiling scheme. Implementations must provide a complete Level-0 root tile,
 * are synchronously ready after construction, and express all heights and
 * geometric errors in meters. This type is not intended to be instantiated
 * directly.
 *
 * @interface
 * @exception {DeveloperError} This interface must not be instantiated directly.
 */
class SceneGISPlanarTerrainProvider {
  constructor() {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Gets the provider's canonical planar tiling scheme.
   * @type {SceneGISPlanarTilingScheme}
   * @constant
   */
  get tilingScheme() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the global minimum decoded terrain height in meters.
   * @type {number}
   * @constant
   */
  get minimumHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the global maximum decoded terrain height in meters.
   * @type {number}
   * @constant
   */
  get maximumHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the maximum available terrain level.
   * @type {number}
   * @constant
   */
  get maximumLevel() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the event raised for asynchronous tile failures. The event is
   * structural and must provide <code>addEventListener</code> and
   * <code>raiseEvent</code>; it does not need to be a Cesium {@link Event}.
   *
   * @type {Pick.<Event.<*>, "addEventListener"|"raiseEvent">}
   * @constant
   */
  get errorEvent() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the provider attribution.
   * @type {Credit|undefined}
   * @constant
   */
  get credit() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the maximum geometric error in meters for a tile at a level. The
   * result must be finite, non-negative, and non-increasing with level.
   *
   * @param {number} level The tile level.
   * @returns {number} The maximum geometric error in meters.
   */
  getLevelMaximumGeometricError(level) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Requests terrain data for a canonical northwest-origin XYZ tile address.
   * Returning <code>undefined</code> indicates that scheduling deferred the
   * request. Rejected promises report asynchronous failures; retry and event
   * policy are owned by the consuming runtime.
   *
   * @param {number} x The tile X coordinate.
   * @param {number} y The tile Y coordinate.
   * @param {number} level The tile level.
   * @param {Request} request The request used for cancellation and scheduling.
   * @returns {Promise<SceneGISPlanarTerrainData>|undefined} The terrain data promise, or undefined when deferred.
   */
  requestTileGeometry(x, y, level, request) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * Determines whether data is available for a tile.
   *
   * @param {number} x The tile X coordinate.
   * @param {number} y The tile Y coordinate.
   * @param {number} level The tile level.
   * @returns {boolean|undefined} True if available, false if unavailable, or undefined if unknown.
   */
  getTileDataAvailable(x, y, level) {
    return undefined;
  }

  /**
   * Starts loading availability metadata for a tile, if supported.
   *
   * @param {number} x The tile X coordinate.
   * @param {number} y The tile Y coordinate.
   * @param {number} level The tile level.
   * @returns {Promise<void>|undefined} A promise for availability metadata, or undefined when unsupported or deferred.
   */
  loadTileDataAvailability(x, y, level) {
    return undefined;
  }
}

export default SceneGISPlanarTerrainProvider;

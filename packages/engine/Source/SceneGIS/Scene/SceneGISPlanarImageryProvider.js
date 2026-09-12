// @ts-check

/* eslint-disable no-unused-vars -- Public JSDoc types require runtime-resolvable imports. */
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Request from "../../Core/Request.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";
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
 * Defines the structural contract for imagery providers used by a
 * {@link SceneGISPlanarWorld}. Implementations must provide a complete
 * northwest-origin Level-0 pyramid and return images in the provider's
 * declared tile dimensions. This type is not intended to be instantiated
 * directly.
 *
 * @interface
 * @exception {DeveloperError} This interface must not be instantiated directly.
 */
class SceneGISPlanarImageryProvider {
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
   * Gets the minimum level, which must be zero.
   * @type {number}
   * @constant
   */
  get minimumLevel() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the maximum available level.
   * @type {number}
   * @constant
   */
  get maximumLevel() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the tile width in pixels.
   * @type {number}
   * @constant
   */
  get tileWidth() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the tile height in pixels.
   * @type {number}
   * @constant
   */
  get tileHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets whether imagery has an alpha channel.
   * @type {boolean}
   * @constant
   */
  get hasAlphaChannel() {
    return throwPropertyInstantiationError();
  }

  /**
   * Gets the event raised for asynchronous tile failures.
   * The event is structural and must provide <code>addEventListener</code>
   * and <code>raiseEvent</code>; it does not need to be a Cesium
   * {@link Event} instance.
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
   * Requests an image for a canonical northwest-origin XYZ tile address.
   * The request may be throttled by returning <code>undefined</code>.
   *
   * @param {number} x The tile X coordinate.
   * @param {number} y The tile Y coordinate.
   * @param {number} level The tile level.
   * @param {Request} request The request used for cancellation and scheduling.
   * @returns {Promise<ImageBitmap|HTMLImageElement|HTMLCanvasElement>|undefined} The image promise, or undefined when deferred.
   */
  requestImage(x, y, level, request) {
    DeveloperError.throwInstantiationError();
  }
}

export default SceneGISPlanarImageryProvider;

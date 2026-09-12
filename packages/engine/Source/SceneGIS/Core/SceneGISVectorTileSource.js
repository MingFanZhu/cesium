import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Request from "../../Core/Request.js";
import Resource from "../../Core/Resource.js";
import SceneGISPlanarTilingScheme from "./SceneGISPlanarTilingScheme.js";
import SceneGISVectorTile from "./SceneGISVectorTile.js";

/**
 * An independently decoded MVT URL source with explicit single-root planar addressing.
 * Construction performs no requests. The caller owns request cancellation and any tile cache.
 * A supplied Resource is cloned; its explicit headers, proxy, and retry behavior are preserved.
 * This source does not own the World, GPU resources, or a destroyable runtime.
 * @alias SceneGISVectorTileSource
 * @constructor
 * @experimental This API is experimental and subject to change.
 * @param {object} options Source configuration.
 * @param {string|Resource} options.url A template containing {z}, {x}, and {y}.
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme The explicitly matched source matrix.
 * @param {number} [options.minimumLevel=0] Minimum requestable level.
 * @param {number} [options.maximumLevel=22] Maximum requestable level.
 * @param {string} [options.scheme="xyz"] URL row scheme, "xyz" or "tms".
 * @param {string|Credit} [options.credit] Attribution for the consuming layer.
 * @exception {DeveloperError} Source configuration is invalid.
 */
function SceneGISVectorTileSource(options) {
  options = options ?? {};
  if (!(options.tilingScheme instanceof SceneGISPlanarTilingScheme)) {
    throw new DeveloperError(
      "tilingScheme must be a SceneGISPlanarTilingScheme.",
    );
  }
  if (typeof options.url !== "string" && !(options.url instanceof Resource)) {
    throw new DeveloperError("url must be a URL template string or Resource.");
  }
  const resource = Resource.createIfNeeded(options.url).clone();
  const url = resource.getUrlComponent(true, false);
  if (
    !["{x}", "{y}", "{z}"].every((token) => url.includes(token)) ||
    /{(?!x}|y}|z})[^}]*}/.test(url)
  ) {
    throw new DeveloperError(
      "url must contain {z}, {x}, and {y} with no unresolved extra templates.",
    );
  }
  const minimumLevel = options.minimumLevel ?? 0;
  const maximumLevel = options.maximumLevel ?? 22;
  options.tilingScheme.getNumberOfXTilesAtLevel(minimumLevel);
  options.tilingScheme.getNumberOfXTilesAtLevel(maximumLevel);
  if (maximumLevel < minimumLevel) {
    throw new DeveloperError("maximumLevel must be at least minimumLevel.");
  }
  const scheme = options.scheme ?? "xyz";
  if (scheme !== "xyz" && scheme !== "tms") {
    throw new DeveloperError('scheme must be "xyz" or "tms".');
  }
  if (
    options.credit !== undefined &&
    typeof options.credit !== "string" &&
    !(options.credit instanceof Credit)
  ) {
    throw new DeveloperError("credit must be a string or Credit.");
  }
  this._resource = resource;
  this._tilingScheme = options.tilingScheme;
  this._minimumLevel = minimumLevel;
  this._maximumLevel = maximumLevel;
  this._scheme = scheme;
  this._credit =
    typeof options.credit === "string"
      ? new Credit(options.credit)
      : options.credit;
}

Object.defineProperties(SceneGISVectorTileSource.prototype, {
  /**
   * The matching source matrix.
   * @memberof SceneGISVectorTileSource.prototype
   * @type {SceneGISPlanarTilingScheme}
   * @readonly
   */
  tilingScheme: {
    get: function () {
      return this._tilingScheme;
    },
  },
  /**
   * The minimum requestable level.
   * @memberof SceneGISVectorTileSource.prototype
   * @type {number}
   * @readonly
   */
  minimumLevel: {
    get: function () {
      return this._minimumLevel;
    },
  },
  /**
   * The maximum requestable level.
   * @memberof SceneGISVectorTileSource.prototype
   * @type {number}
   * @readonly
   */
  maximumLevel: {
    get: function () {
      return this._maximumLevel;
    },
  },
  /**
   * The URL row scheme.
   * @memberof SceneGISVectorTileSource.prototype
   * @type {string}
   * @readonly
   */
  scheme: {
    get: function () {
      return this._scheme;
    },
  },
  /**
   * Attribution for the consuming layer.
   * @memberof SceneGISVectorTileSource.prototype
   * @type {Credit|undefined}
   * @readonly
   */
  credit: {
    get: function () {
      return this._credit;
    },
  },
});

/**
 * Builds a resource for a canonical tile address. TMS changes the URL row only.
 * @param {number} x Canonical XYZ column.
 * @param {number} y Canonical XYZ row.
 * @param {number} level Canonical level.
 * @param {Request} [request] Caller-owned request.
 * @returns {Resource} A new resource with resolved tile template values.
 * @exception {DeveloperError} The address or request is invalid.
 */
SceneGISVectorTileSource.prototype.getTileResource = function (
  x,
  y,
  level,
  request,
) {
  this._tilingScheme.tileXYToExtent(x, y, level);
  if (level < this._minimumLevel || level > this._maximumLevel) {
    throw new DeveloperError("level is outside the source availability range.");
  }
  if (request !== undefined && !(request instanceof Request)) {
    throw new DeveloperError("request must be a Request.");
  }
  return this._resource.getDerivedResource({
    request,
    templateValues: {
      x,
      y: this._scheme === "tms" ? 2 ** level - y - 1 : y,
      z: level,
    },
  });
};

/**
 * Requests and independently decodes a tile. An empty fulfilled response is an empty tile.
 * Network, HTTP, cancellation, and malformed-payload failures remain rejected promises.
 * @param {number} x Canonical XYZ column.
 * @param {number} y Canonical XYZ row.
 * @param {number} level Canonical level.
 * @param {Request} [request] Caller-owned request.
 * @returns {Promise<SceneGISVectorTile.Data>|undefined} Decoded data, or undefined when scheduling was deferred.
 * @exception {DeveloperError} The address or request is invalid.
 */
SceneGISVectorTileSource.prototype.requestTile = function (
  x,
  y,
  level,
  request,
) {
  const promise = this.getTileResource(x, y, level, request).fetchArrayBuffer();
  if (promise === undefined) {
    return undefined;
  }
  return promise.then((buffer) =>
    buffer === undefined ? { layers: [] } : SceneGISVectorTile.decode(buffer),
  );
};

export default SceneGISVectorTileSource;

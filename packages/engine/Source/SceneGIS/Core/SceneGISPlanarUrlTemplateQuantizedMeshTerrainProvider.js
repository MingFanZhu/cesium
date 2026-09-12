import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Frozen from "../../Core/Frozen.js";
import Resource from "../../Core/Resource.js";
import SceneGISPlanarTerrainWorkerScheduler from "./_private/_SceneGISPlanarTerrainWorkerScheduler.js";
import SceneGISPlanarQuantizedMeshTerrainData from "./SceneGISPlanarQuantizedMeshTerrainData.js";
import SceneGISPlanarTilingScheme from "./SceneGISPlanarTilingScheme.js";

const ACCEPT =
  "application/vnd.quantized-mesh,application/octet-stream;q=0.9,*/*;q=0.01";

function copySubdomains(value) {
  if (typeof value !== "string" && !Array.isArray(value)) {
    throw new DeveloperError(
      "subdomains must contain at least one non-empty string.",
    );
  }
  const result = typeof value === "string" ? value.split("") : value.slice();
  if (
    !Array.isArray(result) ||
    result.length === 0 ||
    result.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new DeveloperError(
      "subdomains must contain at least one non-empty string.",
    );
  }
  return result;
}

function validateAddress(provider, x, y, level, restrict) {
  if (
    !Number.isSafeInteger(level) ||
    level < 0 ||
    (restrict && level > provider.maximumLevel)
  ) {
    throw new DeveloperError("level must identify a supported tile level.");
  }
  const count = provider.tilingScheme.getNumberOfXTilesAtLevel(level);
  if (
    !Number.isSafeInteger(x) ||
    x < 0 ||
    x >= count ||
    !Number.isSafeInteger(y) ||
    y < 0 ||
    y >= count
  ) {
    throw new DeveloperError("x and y must identify a tile at level.");
  }
  return count;
}

function createTerrainData(provider, result, level) {
  if (!result || result.kind !== "decodeQuantizedMesh") {
    throw new DeveloperError("The quantized-mesh Worker result is invalid.");
  }
  const data = new SceneGISPlanarQuantizedMeshTerrainData({
    quantizedVertices: result.quantizedVertices,
    indices: result.indices,
    westIndices: result.westIndices,
    southIndices: result.southIndices,
    eastIndices: result.eastIndices,
    northIndices: result.northIndices,
    quantizedMinimumHeight: result.quantizedMinimumHeight,
    quantizedMaximumHeight: result.quantizedMaximumHeight,
    childTileMask: level < provider.maximumLevel ? 15 : 0,
  });
  if (
    data.minimumHeight < provider.minimumHeight ||
    data.maximumHeight > provider.maximumHeight
  ) {
    throw new DeveloperError(
      "Quantized-mesh heights must be within the provider range.",
    );
  }
  return data;
}

/**
 * A coordinate-system-agnostic planar quantized-mesh URL-template provider.
 *
 * @alias SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider
 * @constructor
 *
 * @param {SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.ConstructorOptions} options The construction options.
 *
 * @exception {DeveloperError} The URL, tiling scheme, levels, height range, error, URL scheme, subdomains, or credit are invalid.
 */
function SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  if (!(options.tilingScheme instanceof SceneGISPlanarTilingScheme)) {
    throw new DeveloperError(
      "options.tilingScheme must be a SceneGISPlanarTilingScheme.",
    );
  }
  if (!(typeof options.url === "string" || options.url instanceof Resource)) {
    throw new DeveloperError("options.url must be a string or Resource.");
  }
  if (
    !Number.isInteger(options.maximumLevel) ||
    options.maximumLevel < 0 ||
    options.maximumLevel > options.tilingScheme.maximumSafeLevel
  ) {
    throw new DeveloperError(
      "options.maximumLevel must be a supported non-negative integer.",
    );
  }
  if (
    !Number.isFinite(options.minimumHeight) ||
    !Number.isFinite(options.maximumHeight) ||
    !Number.isFinite(options.maximumHeight - options.minimumHeight) ||
    options.maximumHeight < options.minimumHeight
  ) {
    throw new DeveloperError(
      "options.minimumHeight and options.maximumHeight must be finite and ordered.",
    );
  }
  if (
    !Number.isFinite(options.levelZeroMaximumGeometricError) ||
    options.levelZeroMaximumGeometricError < 0
  ) {
    throw new DeveloperError(
      "options.levelZeroMaximumGeometricError is required and must be finite and non-negative.",
    );
  }
  const urlScheme = options.urlScheme ?? "xyz";
  if (urlScheme !== "xyz" && urlScheme !== "tms") {
    throw new DeveloperError(
      'options.urlScheme must be either "xyz" or "tms".',
    );
  }
  let credit = options.credit;
  if (typeof credit === "string") {
    credit = new Credit(credit);
  } else if (credit !== undefined && !(credit instanceof Credit)) {
    throw new DeveloperError("options.credit must be a string or Credit.");
  }
  this._resource = Resource.createIfNeeded(options.url);
  this._tilingScheme = options.tilingScheme;
  this._maximumLevel = options.maximumLevel;
  this._minimumHeight = options.minimumHeight;
  this._maximumHeight = options.maximumHeight;
  this._levelZeroMaximumGeometricError = options.levelZeroMaximumGeometricError;
  this._urlScheme = urlScheme;
  this._subdomains = copySubdomains(options.subdomains ?? "abc");
  this._credit = credit;
  this._errorEvent = new Event();
}

Object.defineProperties(
  SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype,
  {
    /**
     * Gets the caller-supplied canonical tiling scheme.
     * @memberof SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype
     * @type {SceneGISPlanarTilingScheme}
     * @readonly
     */
    tilingScheme: {
      get: function () {
        return this._tilingScheme;
      },
    },
    /**
     * Gets the global minimum height in meters.
     * @memberof SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype
     * @type {number}
     * @readonly
     */
    minimumHeight: {
      get: function () {
        return this._minimumHeight;
      },
    },
    /**
     * Gets the global maximum height in meters.
     * @memberof SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype
     * @type {number}
     * @readonly
     */
    maximumHeight: {
      get: function () {
        return this._maximumHeight;
      },
    },
    /**
     * Gets the maximum available level.
     * @memberof SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype
     * @type {number}
     * @readonly
     */
    maximumLevel: {
      get: function () {
        return this._maximumLevel;
      },
    },
    /**
     * Gets the event observed by the planar terrain runtime.
     * @memberof SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype
     * @type {Event<function(TileProviderError):void>}
     * @readonly
     */
    errorEvent: {
      get: function () {
        return this._errorEvent;
      },
    },
    /**
     * Gets the provider attribution.
     * @memberof SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype
     * @type {Credit|undefined}
     * @readonly
     */
    credit: {
      get: function () {
        return this._credit;
      },
    },
    /**
     * Gets the owned URL template.
     * @memberof SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype
     * @type {string}
     * @readonly
     */
    url: {
      get: function () {
        return this._resource.url;
      },
    },
    /**
     * Gets the URL row scheme.
     * @memberof SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype
     * @type {"xyz"|"tms"}
     * @readonly
     */
    urlScheme: {
      get: function () {
        return this._urlScheme;
      },
    },
  },
);

/**
 * Gets the maximum geometric error for a level.
 * @param {number} level The tile level.
 * @returns {number} The maximum geometric error in meters.
 * @exception {DeveloperError} The level is invalid or unavailable.
 */
SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype.getLevelMaximumGeometricError =
  function (level) {
    validateAddress(this, 0, 0, level, true);
    return this._levelZeroMaximumGeometricError / 2 ** level;
  };

/**
 * Requests one quantized-mesh terrain tile.
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 * @param {Request} [request] The scheduler request.
 * @returns {Promise<SceneGISPlanarQuantizedMeshTerrainData>|undefined} The terrain data promise, or undefined when deferred.
 * @exception {DeveloperError} The tile address is invalid.
 */
SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype.requestTileGeometry =
  function (x, y, level, request) {
    const count = validateAddress(this, x, y, level, true);
    const urlY = this._urlScheme === "tms" ? count - y - 1 : y;
    const subdomain = this._subdomains[(x + y) % this._subdomains.length];
    const resource = this._resource.getDerivedResource({
      request,
      headers: { Accept: ACCEPT },
      templateValues: { x, y: urlY, z: level, s: subdomain },
    });
    const promise = resource.fetchArrayBuffer();
    if (promise === undefined) {
      return undefined;
    }
    return Promise.resolve(promise).then((arrayBuffer) => {
      if (!(arrayBuffer instanceof ArrayBuffer)) {
        throw new DeveloperError(
          "The quantized-mesh response must be an ArrayBuffer.",
        );
      }
      const taskPromise =
        SceneGISPlanarTerrainWorkerScheduler.scheduleDecodeQuantizedMesh(
          { kind: "decodeQuantizedMesh", arrayBuffer },
          [arrayBuffer],
        );
      if (taskPromise === undefined) {
        throw new DeveloperError(
          "The quantized-mesh Worker task could not be scheduled.",
        );
      }
      return Promise.resolve(taskPromise).then((result) =>
        createTerrainData(this, result, level),
      );
    });
  };

/**
 * Gets full-pyramid availability for a tile address.
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 * @returns {boolean} Whether the tile is available.
 * @exception {DeveloperError} The tile address is invalid.
 */
SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype.getTileDataAvailable =
  function (x, y, level) {
    validateAddress(this, x, y, level, false);
    return level <= this._maximumLevel;
  };

/**
 * Reports that no availability metadata request is required.
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 * @returns {undefined} Always undefined.
 * @exception {DeveloperError} The tile address is invalid.
 */
SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype.loadTileDataAvailability =
  function (x, y, level) {
    validateAddress(this, x, y, level, false);
    return undefined;
  };

/**
 * Initialization options for SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.
 *
 * @typedef {object} SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.ConstructorOptions
 * @property {string|Resource} url The quantized-mesh URL template.
 * @property {SceneGISPlanarTilingScheme} tilingScheme The caller-supplied canonical tiling scheme.
 * @property {number} maximumLevel The maximum available level.
 * @property {number} minimumHeight The global minimum height in meters.
 * @property {number} maximumHeight The global maximum height in meters.
 * @property {number} levelZeroMaximumGeometricError The Level-0 error in meters.
 * @property {"xyz"|"tms"} [urlScheme="xyz"] The network row scheme.
 * @property {string|string[]} [subdomains="abc"] URL subdomains.
 * @property {Credit|string} [credit] Provider attribution.
 */

export default SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider;

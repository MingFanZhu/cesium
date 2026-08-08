import Lerc from "lerc";
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Frozen from "../../Core/Frozen.js";
import getImagePixels from "../../Core/getImagePixels.js";
import Resource from "../../Core/Resource.js";
/* eslint-disable no-unused-vars -- Public JSDoc types require runtime-resolvable imports. */
import Request from "../../Core/Request.js";
import TileProviderError from "../../Core/TileProviderError.js";
import SceneGISPlanarTerrainData from "./SceneGISPlanarTerrainData.js";
/* eslint-enable no-unused-vars */
import SceneGISPlanarHeightmapTerrainData from "./SceneGISPlanarHeightmapTerrainData.js";
import SceneGISPlanarTilingScheme from "./SceneGISPlanarTilingScheme.js";

function validateSampleDimension(name, value) {
  if (!Number.isSafeInteger(value) || value < 2) {
    throw new DeveloperError(`${name} must be a safe integer of at least 2.`);
  }
}

function copySubdomains(value) {
  const subdomains = typeof value === "string" ? value.split("") : value;
  if (
    !Array.isArray(subdomains) ||
    subdomains.length === 0 ||
    subdomains.some(
      (subdomain) => typeof subdomain !== "string" || subdomain.length === 0,
    )
  ) {
    throw new DeveloperError(
      "subdomains must be a non-empty string or an array of non-empty strings.",
    );
  }
  return subdomains.slice();
}

function validateImageStructure(structure, width, height) {
  if (!structure || typeof structure !== "object") {
    throw new DeveloperError(
      "structure is required for image format and must describe RGBA pixels.",
    );
  }
  const elementsPerHeight = structure.elementsPerHeight ?? 1;
  const stride = structure.stride ?? elementsPerHeight;
  const heightScale = structure.heightScale ?? 1.0;
  const heightOffset = structure.heightOffset ?? 0.0;
  const elementMultiplier = structure.elementMultiplier ?? 256.0;
  const isBigEndian = structure.isBigEndian ?? false;
  if (
    !Number.isSafeInteger(elementsPerHeight) ||
    elementsPerHeight < 1 ||
    elementsPerHeight > 4 ||
    stride !== 4
  ) {
    throw new DeveloperError(
      "image structure must use one through four elements per height and an RGBA stride of 4.",
    );
  }
  if (!Number.isFinite(heightScale) || !Number.isFinite(heightOffset)) {
    throw new DeveloperError(
      "image structure heightScale and heightOffset must be finite.",
    );
  }
  if (!Number.isFinite(elementMultiplier) || elementMultiplier <= 0.0) {
    throw new DeveloperError(
      "image structure elementMultiplier must be finite and positive.",
    );
  }
  if (typeof isBigEndian !== "boolean") {
    throw new DeveloperError("image structure isBigEndian must be a boolean.");
  }
  const bufferLength = width * height * stride;
  if (!Number.isSafeInteger(bufferLength)) {
    throw new DeveloperError(
      "heightmap dimensions and image structure stride must produce a safe buffer length.",
    );
  }
  return {
    heightScale,
    heightOffset,
    elementsPerHeight,
    stride,
    elementMultiplier,
    isBigEndian,
  };
}

function isNumericTypedArray(value) {
  return (
    ArrayBuffer.isView(value) &&
    !(value instanceof DataView) &&
    !(typeof BigInt64Array !== "undefined" && value instanceof BigInt64Array) &&
    !(typeof BigUint64Array !== "undefined" && value instanceof BigUint64Array)
  );
}

function validateAddress(provider, x, y, level, restrictToMaximumLevel) {
  const maximumLevel = restrictToMaximumLevel
    ? provider._maximumLevel
    : provider._tilingScheme.maximumSafeLevel;
  if (!Number.isInteger(level) || level < 0 || level > maximumLevel) {
    throw new DeveloperError("level must be within the supported level range.");
  }
  const count = provider._tilingScheme.getNumberOfXTilesAtLevel(level);
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= count ||
    y >= count
  ) {
    throw new DeveloperError("x and y must identify a tile at level.");
  }
  return count;
}

function closeImage(image) {
  if (image && typeof image.close === "function") {
    image.close();
  }
}

function createTerrainData(provider, buffer, level, structure) {
  const terrainData = new SceneGISPlanarHeightmapTerrainData({
    buffer,
    width: provider._heightmapWidth,
    height: provider._heightmapHeight,
    structure,
    childTileMask: level < provider._maximumLevel ? 15 : 0,
  });
  if (
    terrainData.minimumHeight < provider._minimumHeight ||
    terrainData.maximumHeight > provider._maximumHeight
  ) {
    throw new DeveloperError(
      "Decoded heights must remain within the configured global height range.",
    );
  }
  return terrainData;
}

function decodeImage(provider, image, level) {
  try {
    if (
      !image ||
      image.width !== provider._heightmapWidth ||
      image.height !== provider._heightmapHeight
    ) {
      throw new DeveloperError(
        "The fetched image dimensions must match the configured heightmap dimensions.",
      );
    }
    const pixels = getImagePixels(
      image,
      provider._heightmapWidth,
      provider._heightmapHeight,
    );
    return createTerrainData(provider, pixels, level, provider._structure);
  } finally {
    closeImage(image);
  }
}

function decodeLerc(provider, arrayBuffer, level) {
  const decoded = Lerc.decode(arrayBuffer);
  if (
    !decoded ||
    decoded.width !== provider._heightmapWidth ||
    decoded.height !== provider._heightmapHeight ||
    !Array.isArray(decoded.pixels) ||
    decoded.pixels.length !== 1 ||
    !isNumericTypedArray(decoded.pixels[0])
  ) {
    throw new DeveloperError(
      "LERC data must contain one numeric band with the configured dimensions.",
    );
  }

  const samples = decoded.pixels[0];
  const sampleCount = provider._heightmapWidth * provider._heightmapHeight;
  if (samples.length !== sampleCount) {
    throw new DeveloperError(
      "The LERC band length must match the configured dimensions.",
    );
  }
  const mask = decoded.mask;
  if (
    mask !== null &&
    mask !== undefined &&
    (!isNumericTypedArray(mask) ||
      mask.length !== sampleCount ||
      Array.prototype.some.call(mask, (value) => value === 0))
  ) {
    throw new DeveloperError("LERC data must make every height sample valid.");
  }
  if (!Array.isArray(decoded.statistics) || decoded.statistics.length !== 1) {
    throw new DeveloperError("LERC data must contain one statistics record.");
  }
  const statistics = decoded.statistics[0];
  if (
    !statistics ||
    !Number.isFinite(statistics.minValue) ||
    !Number.isFinite(statistics.maxValue) ||
    statistics.maxValue < statistics.minValue ||
    statistics.minValue === Number.MAX_VALUE
  ) {
    throw new DeveloperError("LERC statistics must describe finite heights.");
  }
  const noDataValue = statistics.noDataValue;
  if (noDataValue !== undefined && !Number.isFinite(noDataValue)) {
    throw new DeveloperError("LERC noDataValue must be finite when defined.");
  }
  for (let i = 0; i < samples.length; ++i) {
    const value = samples[i];
    if (!Number.isFinite(value) || value === noDataValue) {
      throw new DeveloperError("LERC height samples must be finite and valid.");
    }
  }
  return createTerrainData(provider, samples, level);
}

/**
 * Provides boundary-sampled planar heightmaps from a coordinate-agnostic URL
 * template containing any of <code>{x}</code>, <code>{y}</code>,
 * <code>{z}</code>, and <code>{s}</code>.
 *
 * @alias SceneGISPlanarUrlTemplateHeightmapTerrainProvider
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {string|Resource} options.url The URL template or Resource.
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme The caller-supplied canonical planar tiling scheme.
 * @param {number} options.maximumLevel The maximum available level.
 * @param {number} options.heightmapWidth The number of west-to-east samples.
 * @param {number} options.heightmapHeight The number of north-to-south samples.
 * @param {number} options.minimumHeight The global minimum height in meters.
 * @param {number} options.maximumHeight The global maximum height in meters.
 * @param {"image"|"lerc"} options.format The encoded tile format.
 * @param {"xyz"|"tms"} [options.urlScheme="xyz"] The URL row scheme.
 * @param {string|string[]} [options.subdomains="abc"] The URL subdomains.
 * @param {Credit|string} [options.credit] The provider attribution.
 * @param {SceneGISPlanarHeightmapTerrainData.Structure} [options.structure] The required RGBA height structure for image format.
 * @param {number} [options.levelZeroMaximumGeometricError] The Level-0 maximum geometric error in meters.
 *
 * @exception {DeveloperError} The URL, tiling scheme, levels, dimensions, height range, format, subdomains, credit, structure, or geometric error are invalid.
 */
function SceneGISPlanarUrlTemplateHeightmapTerrainProvider(options) {
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
      "maximumLevel must be an integer from zero through maximumSafeLevel.",
    );
  }
  validateSampleDimension("heightmapWidth", options.heightmapWidth);
  validateSampleDimension("heightmapHeight", options.heightmapHeight);
  if (
    !Number.isFinite(options.minimumHeight) ||
    !Number.isFinite(options.maximumHeight) ||
    options.maximumHeight < options.minimumHeight
  ) {
    throw new DeveloperError(
      "minimumHeight and maximumHeight must be finite and ordered.",
    );
  }
  const format = options.format;
  if (format !== "image" && format !== "lerc") {
    throw new DeveloperError('format must be either "image" or "lerc".');
  }
  const urlScheme = options.urlScheme ?? "xyz";
  if (urlScheme !== "xyz" && urlScheme !== "tms") {
    throw new DeveloperError('urlScheme must be either "xyz" or "tms".');
  }
  let structure;
  if (format === "image") {
    structure = validateImageStructure(
      options.structure,
      options.heightmapWidth,
      options.heightmapHeight,
    );
  } else if (options.structure !== undefined) {
    throw new DeveloperError("structure is only supported for image format.");
  }
  let credit = options.credit;
  if (typeof credit === "string") {
    credit = new Credit(credit);
  } else if (credit !== undefined && !(credit instanceof Credit)) {
    throw new DeveloperError("credit must be a string or Credit.");
  }

  const extent = options.tilingScheme.coordinateSystem.extent;
  const defaultError =
    Math.max(
      extent.width / (options.heightmapWidth - 1),
      extent.height / (options.heightmapHeight - 1),
    ) * 0.25;
  const levelZeroMaximumGeometricError =
    options.levelZeroMaximumGeometricError ?? defaultError;
  if (
    !Number.isFinite(levelZeroMaximumGeometricError) ||
    levelZeroMaximumGeometricError < 0.0
  ) {
    throw new DeveloperError(
      "levelZeroMaximumGeometricError must be finite and non-negative.",
    );
  }

  this._resource = Resource.createIfNeeded(options.url);
  this._tilingScheme = options.tilingScheme;
  this._maximumLevel = options.maximumLevel;
  this._heightmapWidth = options.heightmapWidth;
  this._heightmapHeight = options.heightmapHeight;
  this._minimumHeight = options.minimumHeight;
  this._maximumHeight = options.maximumHeight;
  this._format = format;
  this._urlScheme = urlScheme;
  this._subdomains = copySubdomains(options.subdomains ?? "abc");
  this._credit = credit;
  this._structure = structure;
  this._levelZeroMaximumGeometricError = levelZeroMaximumGeometricError;
  this._errorEvent = new Event();
}

Object.defineProperties(
  SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype,
  {
    /**
     * Gets the caller-supplied canonical planar tiling scheme.
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
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
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
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
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
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
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
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
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
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
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
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
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
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
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
     * @type {"xyz"|"tms"}
     * @readonly
     */
    urlScheme: {
      get: function () {
        return this._urlScheme;
      },
    },
    /**
     * Gets the west-to-east sample count.
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
     * @type {number}
     * @readonly
     */
    heightmapWidth: {
      get: function () {
        return this._heightmapWidth;
      },
    },
    /**
     * Gets the north-to-south sample count.
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
     * @type {number}
     * @readonly
     */
    heightmapHeight: {
      get: function () {
        return this._heightmapHeight;
      },
    },
    /**
     * Gets the encoded tile format.
     * @memberof SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype
     * @type {"image"|"lerc"}
     * @readonly
     */
    format: {
      get: function () {
        return this._format;
      },
    },
  },
);

/**
 * Gets the maximum geometric error for a level.
 * @param {number} level The tile level.
 * @returns {number} The maximum geometric error in meters.
 * @exception {DeveloperError} The level is outside the provider range.
 */
SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype.getLevelMaximumGeometricError =
  function (level) {
    validateAddress(this, 0, 0, level, true);
    return this._levelZeroMaximumGeometricError / 2 ** level;
  };

/**
 * Requests terrain data for a canonical northwest-origin XYZ tile address.
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 * @param {Request} request The request used for cancellation and scheduling.
 * @returns {Promise<SceneGISPlanarTerrainData>|undefined} The terrain promise, or undefined when deferred.
 * @exception {DeveloperError} The tile address or level is invalid.
 */
SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype.requestTileGeometry =
  function (x, y, level, request) {
    const count = validateAddress(this, x, y, level, true);
    const urlY = this._urlScheme === "tms" ? count - y - 1 : y;
    const subdomainIndex =
      ((x % this._subdomains.length) + (y % this._subdomains.length)) %
      this._subdomains.length;
    const resource = this._resource.getDerivedResource({
      request,
      templateValues: {
        x,
        y: urlY,
        z: level,
        s: this._subdomains[subdomainIndex],
      },
    });
    const promise =
      this._format === "image"
        ? resource.fetchImage({
            preferImageBitmap: true,
            skipColorSpaceConversion: true,
          })
        : resource.fetchArrayBuffer();
    if (promise === undefined) {
      return undefined;
    }
    return Promise.resolve(promise).then((payload) =>
      this._format === "image"
        ? decodeImage(this, payload, level)
        : decodeLerc(this, payload, level),
    );
  };

/**
 * Returns full-pyramid availability for a canonical tile address.
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 * @returns {boolean} Whether the provider exposes the tile.
 * @exception {DeveloperError} The tile address or level is invalid.
 */
SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype.getTileDataAvailable =
  function (x, y, level) {
    validateAddress(this, x, y, level, false);
    return level <= this._maximumLevel;
  };

/**
 * This full-pyramid provider has no availability metadata to load.
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 * @returns {undefined} Always undefined.
 * @exception {DeveloperError} The tile address or level is invalid.
 */
SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype.loadTileDataAvailability =
  function (x, y, level) {
    validateAddress(this, x, y, level, false);
    return undefined;
  };

export default SceneGISPlanarUrlTemplateHeightmapTerrainProvider;

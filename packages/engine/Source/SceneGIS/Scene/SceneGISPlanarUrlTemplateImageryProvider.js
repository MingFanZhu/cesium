import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Frozen from "../../Core/Frozen.js";
import Resource from "../../Core/Resource.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";

function validatePositiveInteger(name, value) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new DeveloperError(`${name} must be a positive integer.`);
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

/**
 * Provides planar raster tiles from a URL template. Supported tags are
 * x, y, z, s, reverseX, reverseY, reverseZ, width, height, westProjected,
 * southProjected, eastProjected, and northProjected. Projected bounds use
 * the world's meter coordinates. Additional tags can be supplied with customTags.
 *
 * @alias SceneGISPlanarUrlTemplateImageryProvider
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {string|Resource} options.url The URL template or Resource.
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme The canonical planar tiling scheme.
 * @param {"xyz"|"tms"} [options.urlScheme="xyz"] The URL row scheme.
 * @param {number} [options.maximumLevel=options.tilingScheme.maximumSafeLevel] The maximum available level.
 * @param {number} [options.tileWidth=256] The image width in pixels.
 * @param {number} [options.tileHeight=options.tileWidth] The image height in pixels.
 * @param {string|string[]} [options.subdomains="abc"] The URL subdomains.
 * @param {boolean} [options.hasAlphaChannel=true] Whether images have an alpha channel.
 * @param {Credit|string} [options.credit] The provider attribution.
 * @param {number} [options.minimumLevel=0] The minimum level; must be zero.
 * @param {object} [options.customTags] Functions keyed by tag name, called with (provider, x, y, level).
 * @param {object} [options.urlSchemeZeroPadding] Minimum digit widths keyed by braced tag, such as {"{x}": "0000"}.
 *
 * @exception {DeveloperError} The URL, tiling scheme, levels, dimensions, subdomains, alpha flag, or credit are invalid.
 */
function SceneGISPlanarUrlTemplateImageryProvider(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  if (!(options.tilingScheme instanceof SceneGISPlanarTilingScheme)) {
    throw new DeveloperError(
      "options.tilingScheme must be a SceneGISPlanarTilingScheme.",
    );
  }
  if (!(typeof options.url === "string" || options.url instanceof Resource)) {
    throw new DeveloperError("options.url must be a string or Resource.");
  }

  const urlScheme = options.urlScheme ?? "xyz";
  if (urlScheme !== "xyz" && urlScheme !== "tms") {
    throw new DeveloperError('urlScheme must be either "xyz" or "tms".');
  }
  const maximumLevel =
    options.maximumLevel ?? options.tilingScheme.maximumSafeLevel;
  if ((options.minimumLevel ?? 0) !== 0) {
    throw new DeveloperError("minimumLevel must be zero.");
  }
  if (
    !Number.isInteger(maximumLevel) ||
    maximumLevel < 0 ||
    maximumLevel > options.tilingScheme.maximumSafeLevel
  ) {
    throw new DeveloperError(
      "maximumLevel must be an integer from zero through maximumSafeLevel.",
    );
  }
  const tileWidth = options.tileWidth ?? 256;
  const tileHeight = options.tileHeight ?? tileWidth;
  validatePositiveInteger("tileWidth", tileWidth);
  validatePositiveInteger("tileHeight", tileHeight);
  const hasAlphaChannel = options.hasAlphaChannel ?? true;
  if (typeof hasAlphaChannel !== "boolean") {
    throw new DeveloperError("hasAlphaChannel must be a boolean.");
  }
  let credit = options.credit;
  if (typeof credit === "string") {
    credit = new Credit(credit);
  } else if (credit !== undefined && !(credit instanceof Credit)) {
    throw new DeveloperError("credit must be a string or Credit.");
  }

  this._resource = Resource.createIfNeeded(options.url);
  this._tilingScheme = options.tilingScheme;
  this._urlScheme = urlScheme;
  this._maximumLevel = maximumLevel;
  this._tileWidth = tileWidth;
  this._tileHeight = tileHeight;
  this._subdomains = copySubdomains(options.subdomains ?? "abc");
  this._hasAlphaChannel = hasAlphaChannel;
  this._credit = credit;
  this._errorEvent = new Event();
  this._customTags = { ...options.customTags };
  this._urlSchemeZeroPadding = { ...options.urlSchemeZeroPadding };
  for (const tag of Object.values(this._customTags)) {
    if (typeof tag !== "function") {
      throw new DeveloperError("customTags values must be functions.");
    }
  }
  for (const padding of Object.values(this._urlSchemeZeroPadding)) {
    if (typeof padding !== "string" || !/^0+$/.test(padding)) {
      throw new DeveloperError(
        "urlSchemeZeroPadding values must be zero strings.",
      );
    }
  }
}

Object.defineProperties(SceneGISPlanarUrlTemplateImageryProvider.prototype, {
  /**
   * Gets the canonical planar tiling scheme.
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
   * @type {SceneGISPlanarTilingScheme}
   * @readonly
   */
  tilingScheme: {
    get: function () {
      return this._tilingScheme;
    },
  },
  /**
   * Gets the minimum available level, which is always zero.
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
   * @type {number}
   * @readonly
   */
  minimumLevel: {
    get: function () {
      return 0;
    },
  },
  /**
   * Gets the maximum available level.
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
   * @type {number}
   * @readonly
   */
  maximumLevel: {
    get: function () {
      return this._maximumLevel;
    },
  },
  /**
   * Gets the tile width in pixels.
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
   * @type {number}
   * @readonly
   */
  tileWidth: {
    get: function () {
      return this._tileWidth;
    },
  },
  /**
   * Gets the tile height in pixels.
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
   * @type {number}
   * @readonly
   */
  tileHeight: {
    get: function () {
      return this._tileHeight;
    },
  },
  /**
   * Gets whether imagery has an alpha channel.
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
   * @type {boolean}
   * @readonly
   */
  hasAlphaChannel: {
    get: function () {
      return this._hasAlphaChannel;
    },
  },
  /**
   * Gets the event raised for asynchronous tile failures.
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
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
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
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
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
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
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
   * @type {"xyz"|"tms"}
   * @readonly
   */
  urlScheme: {
    get: function () {
      return this._urlScheme;
    },
  },
});

/**
 * Requests an image for a canonical northwest-origin XYZ tile address.
 *
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 * @param {Request} request The request used for cancellation and scheduling.
 * @returns {Promise<ImageBitmap|HTMLImageElement>|undefined} The image promise, or undefined when deferred.
 * @exception {DeveloperError} The tile address or level is invalid.
 */
SceneGISPlanarUrlTemplateImageryProvider.prototype.requestImage = function (
  x,
  y,
  level,
  request,
) {
  return this._buildImageResource(x, y, level, request).fetchImage({
    preferImageBitmap: true,
    flipY: true,
  });
};

SceneGISPlanarUrlTemplateImageryProvider.prototype._validateTileAddress =
  function (x, y, level) {
    if (!Number.isInteger(level) || level < 0 || level > this._maximumLevel) {
      throw new DeveloperError(
        "level must be within the provider level range.",
      );
    }
    const count = this._tilingScheme.getNumberOfXTilesAtLevel(level);
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
  };

SceneGISPlanarUrlTemplateImageryProvider.prototype._buildImageResource =
  function (x, y, level, request) {
    this._validateTileAddress(x, y, level);
    const count = this._tilingScheme.getNumberOfXTilesAtLevel(level);
    const urlY = this._urlScheme === "tms" ? count - y - 1 : y;
    const subdomainIndex =
      ((x % this._subdomains.length) + (y % this._subdomains.length)) %
      this._subdomains.length;
    const templateValues = {
      x,
      y: urlY,
      z: level,
      s: this._subdomains[subdomainIndex],
      reverseX: count - x - 1,
      reverseY: count - y - 1,
      reverseZ:
        level < this._maximumLevel ? this._maximumLevel - level - 1 : level,
      width: this._tileWidth,
      height: this._tileHeight,
    };
    const tags =
      this._resource.getUrlComponent(true).match(/\{([^}]+)\}/g) ?? [];
    let extent;
    for (const match of tags) {
      const tag = match.slice(1, -1);
      const custom = this._customTags[tag];
      if (custom) {
        templateValues[tag] = custom(this, x, y, level);
      } else if (/^(west|south|east|north)Projected$/.test(tag)) {
        extent ??= this._tilingScheme.tileXYToExtent(x, y, level);
        const bounds = {
          westProjected: extent.minimumX,
          southProjected: extent.minimumY,
          eastProjected: extent.maximumX,
          northProjected: extent.maximumY,
        };
        templateValues[tag] = bounds[tag];
      }
      const padding = this._urlSchemeZeroPadding[match];
      if (padding && templateValues[tag] !== undefined) {
        templateValues[tag] = String(templateValues[tag]).padStart(
          padding.length,
          "0",
        );
      }
    }
    return this._resource.getDerivedResource({
      request,
      templateValues,
    });
  };

export default SceneGISPlanarUrlTemplateImageryProvider;

import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Frozen from "../../Core/Frozen.js";
import Resource from "../../Core/Resource.js";
import SceneGISPlanarExtent from "../Core/SceneGISPlanarExtent.js";
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
 * 通过 URL 模板提供平面栅格瓦片。支持 x、y、z、s、reverseX、reverseY、reverseZ、width、height、westProjected、southProjected、eastProjected 和 northProjected 标签。投影范围使用世界米制坐标，可通过 customTags 增加标签。
 *
 * @alias SceneGISPlanarUrlTemplateImageryProvider
 * @constructor
 *
 * @param {object} options 包含以下属性的对象：
 * @param {string|Resource} options.url URL 模板或 Resource。
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme 标准平面切片方案。
 * @param {"xyz"|"tms"} [options.urlScheme="xyz"] URL 行号方案。
 * @param {number} [options.maximumLevel=options.tilingScheme.maximumSafeLevel] 可用最高层级。
 * @param {number} [options.tileWidth=256] 图像宽度，单位为像素。
 * @param {number} [options.tileHeight=options.tileWidth] 图像高度，单位为像素。
 * @param {string|string[]} [options.subdomains="abc"] URL 子域。
 * @param {boolean} [options.hasAlphaChannel=true] 图像是否具有 alpha 通道。
 * @param {Credit|string} [options.credit] 提供者署名。
 * @param {SceneGISPlanarExtent} [options.coverageExtent] 世界米制覆盖范围，不改变瓦片地址。
 * @param {number} [options.minimumLevel=0] 可用最低标准层级。
 * @param {object} [options.customTags] 以标签名为键的函数，使用 (provider, x, y, level) 调用。
 * @param {object} [options.urlSchemeZeroPadding] 按带花括号标签指定的最小数字宽度，如 {"{x}": "0000"}。
 *
 * @exception {DeveloperError} URL、切片方案、层级、尺寸、子域、alpha 标志或署名无效。
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
  const minimumLevel = options.minimumLevel ?? 0;
  if (
    !Number.isInteger(minimumLevel) ||
    minimumLevel < 0 ||
    minimumLevel > maximumLevel
  ) {
    throw new DeveloperError(
      "minimumLevel must be an integer from zero through maximumLevel.",
    );
  }
  if (
    options.coverageExtent !== undefined &&
    !(options.coverageExtent instanceof SceneGISPlanarExtent)
  ) {
    throw new DeveloperError("coverageExtent must be a SceneGISPlanarExtent.");
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
  this._minimumLevel = minimumLevel;
  this._coverageExtent = options.coverageExtent;
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
   * 获取标准平面切片方案。
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
   * 获取可选世界米制覆盖范围。矩形外图层透明，标准瓦片边界与地址不变。
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
   * @type {SceneGISPlanarExtent|undefined}
   * @readonly
   */
  coverageExtent: {
    get: function () {
      return this._coverageExtent;
    },
  },
  /**
   * 获取可用最低标准层级。
   * @memberof SceneGISPlanarUrlTemplateImageryProvider.prototype
   * @type {number}
   * @readonly
   */
  minimumLevel: {
    get: function () {
      return this._minimumLevel;
    },
  },
  /**
   * 获取可用最高层级。
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
   * 获取瓦片宽度，单位为像素。
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
   * 获取瓦片高度，单位为像素。
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
   * 获取影像是否具有 alpha 通道。
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
   * 获取异步瓦片失败时触发的事件。
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
   * 获取提供者署名。
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
   * 获取自有 URL 模板。
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
   * 获取 URL 行号方案。
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
 * 按标准西北原点 XYZ 地址请求图像。
 *
 * @param {number} x 瓦片 X 坐标。
 * @param {number} y 瓦片 Y 坐标。
 * @param {number} level 瓦片层级。
 * @param {Request} request 用于取消与调度的请求。
 * @returns {Promise<ImageBitmap|HTMLImageElement>|undefined} 图像 Promise，延后时为 undefined。
 * @exception {DeveloperError} 瓦片地址或层级无效。
 */
SceneGISPlanarUrlTemplateImageryProvider.prototype.requestImage = function (
  x,
  y,
  level,
  request,
) {
  return this._buildImageResource(x, y, level, request).fetchImage({
    preferBlob: true,
    preferImageBitmap: true,
    flipY: true,
  });
};

SceneGISPlanarUrlTemplateImageryProvider.prototype._validateTileAddress =
  function (x, y, level) {
    if (
      !Number.isInteger(level) ||
      level < this._minimumLevel ||
      level > this._maximumLevel
    ) {
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

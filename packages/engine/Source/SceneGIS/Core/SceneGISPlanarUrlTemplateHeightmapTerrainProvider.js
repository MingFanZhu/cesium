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
import terrainWorkerScheduler from "./_private/_SceneGISPlanarTerrainWorkerScheduler.js";

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

function createLercTask(provider, arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new DeveloperError(
      "The fetched LERC payload must be an ArrayBuffer.",
    );
  }
  return {
    parameters: {
      kind: "decodeLerc",
      arrayBuffer,
      width: provider._heightmapWidth,
      height: provider._heightmapHeight,
      minimumHeight: provider._minimumHeight,
      maximumHeight: provider._maximumHeight,
    },
    transferableObjects: [arrayBuffer],
  };
}

function decodeLercResult(provider, result, level) {
  if (
    !result ||
    result.kind !== "decodeLerc" ||
    result.width !== provider._heightmapWidth ||
    result.height !== provider._heightmapHeight ||
    !isNumericTypedArray(result.samples)
  ) {
    throw new DeveloperError(
      "The LERC Worker result must contain one numeric band with the configured dimensions.",
    );
  }
  const samples = result.samples;
  const sampleCount = provider._heightmapWidth * provider._heightmapHeight;
  if (samples.length !== sampleCount) {
    throw new DeveloperError(
      "The LERC Worker band length must match the configured dimensions.",
    );
  }
  return createTerrainData(provider, samples, level);
}

/**
 * 通过与坐标系无关的 URL 模板提供含边界采样的平面高度图，模板可包含 <code>{x}</code>、<code>{y}</code>、<code>{z}</code> 和 <code>{s}</code>。
 *
 * @alias SceneGISPlanarUrlTemplateHeightmapTerrainProvider
 * @constructor
 *
 * @param {object} options 包含以下属性的对象：
 * @param {string|Resource} options.url URL 模板或 Resource。
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme 调用方提供的标准平面切片方案。
 * @param {number} options.maximumLevel 可用最高层级。
 * @param {number} options.heightmapWidth 从西到东的样本数。
 * @param {number} options.heightmapHeight 从北到南的样本数。
 * @param {number} options.minimumHeight 全局最低高度，单位为米。
 * @param {number} options.maximumHeight 全局最高高度，单位为米。
 * @param {"image"|"lerc"} options.format 瓦片编码格式。
 * @param {"xyz"|"tms"} [options.urlScheme="xyz"] URL 行号方案。
 * @param {string|string[]} [options.subdomains="abc"] URL 子域。
 * @param {Credit|string} [options.credit] 提供者署名。
 * @param {SceneGISPlanarHeightmapTerrainData.Structure} [options.structure] 图像格式必需的 RGBA 高度结构。
 * @param {number} [options.levelZeroMaximumGeometricError] 零级最大几何误差，单位为米。
 *
 * @exception {DeveloperError} URL、切片方案、层级、尺寸、高度范围、格式、子域、署名、结构或几何误差无效。
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
     * 获取调用方提供的标准平面切片方案。
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
     * 获取全局最低高度，单位为米。
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
     * 获取全局最高高度，单位为米。
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
     * 获取可用最高层级。
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
     * 获取平面地形运行时观测的事件。
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
     * 获取提供者署名。
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
     * 获取自有 URL 模板。
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
     * 获取 URL 行号方案。
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
     * 获取从西到东的样本数。
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
     * 获取从北到南的样本数。
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
     * 获取瓦片编码格式。
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
 * 获取某层的最大几何误差。
 * @param {number} level 瓦片层级。
 * @returns {number} 最大几何误差，单位为米。
 * @exception {DeveloperError} 层级超出提供者范围。
 */
SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype.getLevelMaximumGeometricError =
  function (level) {
    validateAddress(this, 0, 0, level, true);
    return this._levelZeroMaximumGeometricError / 2 ** level;
  };

/**
 * 按标准西北原点 XYZ 地址请求地形数据。
 * @param {number} x 瓦片 X 坐标。
 * @param {number} y 瓦片 Y 坐标。
 * @param {number} level 瓦片层级。
 * @param {Request} request 用于取消与调度的请求。
 * @returns {Promise<SceneGISPlanarTerrainData>|undefined} 地形 Promise；延后时为 undefined。
 * @exception {DeveloperError} 瓦片地址或层级无效。
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
    return Promise.resolve(promise).then((payload) => {
      if (this._format === "image") {
        return decodeImage(this, payload, level);
      }
      const task = createLercTask(this, payload);
      const taskPromise = terrainWorkerScheduler.scheduleDecodeLerc(
        task.parameters,
        task.transferableObjects,
      );
      if (taskPromise === undefined) {
        throw new DeveloperError(
          "The LERC Worker task could not be scheduled.",
        );
      }
      return Promise.resolve(taskPromise).then((result) =>
        decodeLercResult(this, result, level),
      );
    });
  };

/**
 * 返回标准瓦片地址在完整金字塔中的可用性。
 * @param {number} x 瓦片 X 坐标。
 * @param {number} y 瓦片 Y 坐标。
 * @param {number} level 瓦片层级。
 * @returns {boolean} 提供者是否暴露此瓦片。
 * @exception {DeveloperError} 瓦片地址或层级无效。
 */
SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype.getTileDataAvailable =
  function (x, y, level) {
    validateAddress(this, x, y, level, false);
    return level <= this._maximumLevel;
  };

/**
 * 此完整金字塔提供者没有需要加载的可用性元数据。
 * @param {number} x 瓦片 X 坐标。
 * @param {number} y 瓦片 Y 坐标。
 * @param {number} level 瓦片层级。
 * @returns {undefined} 始终为 undefined。
 * @exception {DeveloperError} 瓦片地址或层级无效。
 */
SceneGISPlanarUrlTemplateHeightmapTerrainProvider.prototype.loadTileDataAvailability =
  function (x, y, level) {
    validateAddress(this, x, y, level, false);
    return undefined;
  };

export default SceneGISPlanarUrlTemplateHeightmapTerrainProvider;

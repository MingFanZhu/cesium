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
 * 与坐标系无关的平面 quantized-mesh URL 模板提供者。
 *
 * @alias SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider
 * @constructor
 *
 * @param {SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.ConstructorOptions} options 构造选项。
 *
 * @exception {DeveloperError} URL、切片方案、层级、高度范围、误差、URL 方案、子域或署名无效。
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
     * 获取调用方提供的标准切片方案。
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
     * 获取全局最低高度，单位为米。
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
     * 获取全局最高高度，单位为米。
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
     * 获取可用最高层级。
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
     * 获取平面地形运行时观测的事件。
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
     * 获取提供者署名。
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
     * 获取自有 URL 模板。
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
     * 获取 URL 行号方案。
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
 * 获取某层的最大几何误差。
 * @param {number} level 瓦片层级。
 * @returns {number} 最大几何误差，单位为米。
 * @exception {DeveloperError} 层级无效或不可用。
 */
SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype.getLevelMaximumGeometricError =
  function (level) {
    validateAddress(this, 0, 0, level, true);
    return this._levelZeroMaximumGeometricError / 2 ** level;
  };

/**
 * 请求单个 quantized-mesh 地形瓦片。
 * @param {number} x 瓦片 X 坐标。
 * @param {number} y 瓦片 Y 坐标。
 * @param {number} level 瓦片层级。
 * @param {Request} [request] 调度器请求。
 * @returns {Promise<SceneGISPlanarQuantizedMeshTerrainData>|undefined} 地形数据 Promise；延后时为 undefined。
 * @exception {DeveloperError} 瓦片地址无效。
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
 * 获取瓦片地址在完整金字塔中的可用性。
 * @param {number} x 瓦片 X 坐标。
 * @param {number} y 瓦片 Y 坐标。
 * @param {number} level 瓦片层级。
 * @returns {boolean} 瓦片是否可用。
 * @exception {DeveloperError} 瓦片地址无效。
 */
SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype.getTileDataAvailable =
  function (x, y, level) {
    validateAddress(this, x, y, level, false);
    return level <= this._maximumLevel;
  };

/**
 * 报告无需请求可用性元数据。
 * @param {number} x 瓦片 X 坐标。
 * @param {number} y 瓦片 Y 坐标。
 * @param {number} level 瓦片层级。
 * @returns {undefined} 始终为 undefined。
 * @exception {DeveloperError} 瓦片地址无效。
 */
SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.prototype.loadTileDataAvailability =
  function (x, y, level) {
    validateAddress(this, x, y, level, false);
    return undefined;
  };

/**
 * SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider 的初始化选项。
 *
 * @typedef {object} SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.ConstructorOptions
 * @property {string|Resource} url quantized-mesh URL 模板。
 * @property {SceneGISPlanarTilingScheme} tilingScheme 调用方提供的标准切片方案。
 * @property {number} maximumLevel 可用最高层级。
 * @property {number} minimumHeight 全局最低高度，单位为米。
 * @property {number} maximumHeight 全局最高高度，单位为米。
 * @property {number} levelZeroMaximumGeometricError 零级误差，单位为米。
 * @property {"xyz"|"tms"} [urlScheme="xyz"] 网络行号方案。
 * @property {string|string[]} [subdomains="abc"] URL 子域。
 * @property {Credit|string} [credit] 提供者署名。
 */

export default SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider;

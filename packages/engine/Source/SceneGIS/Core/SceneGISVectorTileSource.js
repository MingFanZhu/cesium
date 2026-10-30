import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Request from "../../Core/Request.js";
import Resource from "../../Core/Resource.js";
import SceneGISPlanarTilingScheme from "./SceneGISPlanarTilingScheme.js";
import WorkerPool from "./_private/_SceneGISVectorWorkerPool.js";

let decodePool;

/**
 * 独立解码、采用显式单根平面寻址的 MVT URL 数据源。构造时不发起请求，调用方拥有请求取消与瓦片缓存。传入的 Resource 会被复制，并保留显式 headers、proxy 和 retry 行为。此数据源不拥有 World、GPU 资源或需要销毁的运行时。
 * @alias SceneGISVectorTileSource
 * @constructor
 * @experimental 此 API 为实验性，可能发生变化。
 * @param {object} options 源配置。
 * @param {string|Resource} options.url 包含 {z}、{x} 和 {y} 的模板。
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme 显式匹配的源矩阵。
 * @param {number} [options.minimumLevel=0] 可请求最低层级。
 * @param {number} [options.maximumLevel=22] 可请求最高层级。
 * @param {string} [options.scheme="xyz"] URL 行号方案，取值 "xyz" 或 "tms"。
 * @param {string|Credit} [options.credit] 供消费图层使用的署名。
 * @exception {DeveloperError} 源配置无效。
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
   * 匹配的源矩阵。
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
   * 可请求的最低层级。
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
   * 可请求的最高层级。
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
   * URL 行号方案。
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
   * 供消费图层使用的署名。
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
 * 为标准瓦片地址创建资源，TMS 仅改变 URL 行号。
 * @param {number} x 标准 XYZ 列号。
 * @param {number} y 标准 XYZ 行号。
 * @param {number} level 标准层级。
 * @param {Request} [request] 调用方所有的请求。
 * @returns {Resource} 解析瓦片模板值后的新资源。
 * @exception {DeveloperError} 地址或请求无效。
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
 * 请求并独立解码瓦片。成功返回的空响应表示空瓦片，网络、HTTP、取消和载荷格式错误仍以 Promise 拒绝报告。
 * @param {number} x 标准 XYZ 列号。
 * @param {number} y 标准 XYZ 行号。
 * @param {number} level 标准层级。
 * @param {Request} [request] 调用方所有的请求。
 * @param {boolean} [decode=true] 是否在 Worker 解码；false 返回原始 MVT 字节供异步准备。
 * @returns {Promise<SceneGISVectorTile.Data|ArrayBuffer>|undefined} 瓦片内容；网络调度延后时为 undefined。
 * @exception {DeveloperError} 地址或请求无效。
 */
SceneGISVectorTileSource.prototype.requestTile = function (
  x,
  y,
  level,
  request,
  decode = true,
) {
  if (typeof decode !== "boolean") {
    throw new DeveloperError("decode must be a boolean.");
  }
  const promise = this.getTileResource(x, y, level, request).fetchArrayBuffer();
  if (promise === undefined) {
    return undefined;
  }
  return promise.then((buffer) => {
    buffer ??= new ArrayBuffer(0);
    if (!decode) {
      return buffer;
    }
    decodePool ??= new WorkerPool();
    return decodePool
      .enqueue({ kind: "decode", buffer }, [buffer])
      .then((result) => result.data);
  });
};

export default SceneGISVectorTileSource;

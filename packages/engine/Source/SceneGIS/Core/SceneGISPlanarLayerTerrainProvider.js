/* eslint-disable no-unused-vars -- Public JSDoc types require runtime-resolvable imports. */
import Credit from "../../Core/Credit.js";
import Event from "../../Core/Event.js";
import Request from "../../Core/Request.js";
import SceneGISPlanarTerrainData from "./SceneGISPlanarTerrainData.js";
/* eslint-enable no-unused-vars */
import DeveloperError from "../../Core/DeveloperError.js";
import Resource from "../../Core/Resource.js";
import RuntimeError from "../../Core/RuntimeError.js";
import SceneGISPlanarCoordinateSystem from "./SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "./SceneGISPlanarExtent.js";
import SceneGISPlanarTilingScheme from "./SceneGISPlanarTilingScheme.js";
import SceneGISPlanarUrlTemplateHeightmapTerrainProvider from "./SceneGISPlanarUrlTemplateHeightmapTerrainProvider.js";
import SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider from "./SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider.js";

const heightmapProfile = "scenegis-planar-heightmap-rgb24-v2";
const meshProfile = "scenegis-planar-quantized-mesh-v2";

function requireMetadata(condition, message) {
  if (!condition) {
    throw new RuntimeError(`Invalid planar layer.json: ${message}`);
  }
}

function readTilingScheme(metadata, supplied) {
  const space = metadata.coordinateSpace;
  requireMetadata(
    space?.role === "private" &&
      space.unit === "metre" &&
      Array.isArray(space.axes) &&
      space.axes.join(",") === "east,north,up",
    "coordinateSpace must declare private east/north/up metres.",
  );
  const range = space.rootRange;
  requireMetadata(
    Array.isArray(range) && range.length === 4 && range.every(Number.isFinite),
    "coordinateSpace.rootRange must contain four finite numbers.",
  );
  const [minimumX, minimumY, maximumX, maximumY] = range;
  requireMetadata(
    maximumX > minimumX &&
      maximumY > minimumY &&
      Number.isFinite(maximumX - minimumX) &&
      maximumX - minimumX === maximumY - minimumY,
    "rootRange must be a nonempty square in metres.",
  );
  if (supplied !== undefined) {
    if (!(supplied instanceof SceneGISPlanarTilingScheme)) {
      throw new DeveloperError(
        "options.tilingScheme must be a planar tiling scheme.",
      );
    }
    const extent = supplied.coordinateSystem.extent;
    requireMetadata(
      extent.minimumX === minimumX &&
        extent.minimumY === minimumY &&
        extent.maximumX === maximumX &&
        extent.maximumY === maximumY,
      "rootRange does not match the supplied tilingScheme.",
    );
    return supplied;
  }
  requireMetadata(
    space.id === undefined ||
      (typeof space.id === "string" && space.id.length > 0),
    "coordinateSpace.id must be a nonempty string when supplied.",
  );
  return new SceneGISPlanarTilingScheme({
    coordinateSystem: new SceneGISPlanarCoordinateSystem({
      extent: new SceneGISPlanarExtent({
        minimumX,
        minimumY,
        maximumX,
        maximumY,
      }),
      crs: space.id,
    }),
  });
}

function readAvailability(layer, maximumLevel) {
  requireMetadata(
    Array.isArray(layer.available) &&
      layer.available.length === maximumLevel + 1,
    "available must explicitly describe every level from zero through maxzoom.",
  );
  const available = layer.available.map((ranges, level) => {
    requireMetadata(
      Array.isArray(ranges),
      "each availability level must be an array.",
    );
    const count = 2 ** level;
    return ranges.map((range) => {
      requireMetadata(
        range &&
          [range.startX, range.startY, range.endX, range.endY].every(
            Number.isSafeInteger,
          ) &&
          range.startX >= 0 &&
          range.startY >= 0 &&
          range.endX >= range.startX &&
          range.endY >= range.startY &&
          range.endX < count &&
          range.endY < count,
        "availability ranges must fit the single-root tile matrix.",
      );
      return {
        startX: range.startX,
        endX: range.endX,
        startY: count - range.endY - 1,
        endY: count - range.startY - 1,
      };
    });
  });
  requireMetadata(
    available[0].length > 0,
    "the complete Level-0 root must be available.",
  );
  return available;
}

function readProvider(layer, resource, options) {
  requireMetadata(
    layer && typeof layer === "object",
    "a JSON object is required.",
  );
  requireMetadata(
    layer.parentUrl === undefined && layer.metadataAvailability === undefined,
    "parentUrl and dynamic metadataAvailability are not supported.",
  );
  const metadata = layer.scenegis;
  const format = layer.format;
  requireMetadata(
    (format === heightmapProfile || format === meshProfile) &&
      metadata?.profile === format,
    "format must identify a supported SceneGIS planar profile; Globe tiles cannot be reinterpreted as planar tiles.",
  );
  requireMetadata(
    metadata.unit === "metre" && metadata.verticalTransform === false,
    "heights must be in metres without a vertical transform.",
  );
  const tilingScheme = readTilingScheme(metadata, options.tilingScheme);
  const maximumLevel = layer.maxzoom;
  requireMetadata(
    (layer.minzoom ?? 0) === 0 &&
      Number.isInteger(maximumLevel) &&
      maximumLevel >= 0 &&
      maximumLevel <= tilingScheme.maximumSafeLevel &&
      (metadata.logicalMinLevel ?? 0) === 0 &&
      metadata.logicalMaxLevel === maximumLevel,
    "levels must describe a supported zero-based pyramid.",
  );
  const scheme = layer.scheme ?? "tms";
  requireMetadata(
    scheme === "tms" || scheme === "slippyMap",
    "scheme must be tms or slippyMap.",
  );
  const available = readAvailability(layer, maximumLevel);
  requireMetadata(
    Array.isArray(layer.tiles) &&
      layer.tiles.length > 0 &&
      layer.tiles.every((url) => typeof url === "string" && url.length > 0),
    "tiles must contain a URL template.",
  );
  requireMetadata(
    layer.version === undefined || typeof layer.version === "string",
    "version must be a string.",
  );
  const tileResource = resource.getDerivedResource({
    url: layer.tiles[0],
    templateValues: { version: layer.version ?? "1.0.0" },
  });
  const grid = metadata.grid;
  requireMetadata(
    grid?.placement === "posts" &&
      Number.isSafeInteger(grid.width) &&
      grid.width >= 2 &&
      Number.isSafeInteger(grid.height) &&
      grid.height >= 2,
    "grid must describe a boundary-inclusive sample grid.",
  );
  const minimumHeight = options.minimumHeight ?? metadata.heightRange?.minimum;
  const maximumHeight = options.maximumHeight ?? metadata.heightRange?.maximum;
  requireMetadata(
    Number.isFinite(minimumHeight) &&
      Number.isFinite(maximumHeight) &&
      maximumHeight >= minimumHeight &&
      Number.isFinite(maximumHeight - minimumHeight),
    "a finite global height range is required in metadata or options.minimumHeight and options.maximumHeight.",
  );
  const extent = tilingScheme.coordinateSystem.extent;
  const geometricError =
    options.levelZeroMaximumGeometricError ??
    Math.max(
      extent.width / (grid.width - 1),
      extent.height / (grid.height - 1),
    ) * 0.25;
  requireMetadata(
    Number.isFinite(geometricError) && geometricError >= 0,
    "geometric error must be finite and non-negative.",
  );
  const providerOptions = {
    url: tileResource,
    tilingScheme,
    maximumLevel,
    minimumHeight,
    maximumHeight,
    levelZeroMaximumGeometricError: geometricError,
    urlScheme: scheme === "tms" ? "tms" : "xyz",
    credit: options.credit ?? layer.attribution,
  };
  let provider;
  let minimumError = 0;
  if (format === heightmapProfile) {
    const structure = metadata.structure;
    requireMetadata(
      structure?.elementsPerHeight === 3 &&
        structure.stride === 4 &&
        structure.elementMultiplier === 256 &&
        structure.isBigEndian === true &&
        Number.isFinite(structure.heightScale) &&
        structure.heightScale > 0 &&
        Number.isFinite(structure.heightOffset),
      "RGB24 structure must declare three big-endian channels in RGBA pixels.",
    );
    provider = new SceneGISPlanarUrlTemplateHeightmapTerrainProvider({
      ...providerOptions,
      format: "image",
      heightmapWidth: grid.width,
      heightmapHeight: grid.height,
      structure,
    });
  } else {
    const maxError = metadata.quantization?.maxError;
    const minimumDepth = metadata.skirt?.minimumDepth;
    requireMetadata(
      Number.isFinite(maxError) &&
        maxError > 0 &&
        Number.isFinite(minimumDepth) &&
        minimumDepth >= 0,
      "mesh quantization error and minimum skirt depth must be finite.",
    );
    // The existing planar Worker builds skirts at four times the geometric error.
    minimumError = Math.max(maxError, minimumDepth / 4);
    provider = new SceneGISPlanarUrlTemplateQuantizedMeshTerrainProvider(
      providerOptions,
    );
  }
  return { provider, available, minimumError, format, url: resource.url };
}

/**
 * 加载由 layer.json 描述的 SceneGIS 平面地形图层。使用 {@link SceneGISPlanarLayerTerrainProvider.fromUrl}，不要直接调用此构造函数。提供者仅拥有元数据，使用它的 World 拥有瓦片和 GPU 资源。
 *
 * @alias SceneGISPlanarLayerTerrainProvider
 * @constructor
 * @param {object} options fromUrl 生成的内部初始化值。
 * @exception {DeveloperError} 使用 fromUrl 构造此提供者。
 */
function SceneGISPlanarLayerTerrainProvider(options) {
  if (!options?.provider) {
    throw new DeveloperError("Use SceneGISPlanarLayerTerrainProvider.fromUrl.");
  }
  this._provider = options.provider;
  this._available = options.available;
  this._minimumError = options.minimumError;
  this._format = options.format;
  this._url = options.url;
}

Object.defineProperties(SceneGISPlanarLayerTerrainProvider.prototype, {
  /** @memberof SceneGISPlanarLayerTerrainProvider.prototype
   * @type {SceneGISPlanarTilingScheme}
   * @readonly */
  tilingScheme: {
    get: function () {
      return this._provider.tilingScheme;
    },
  },
  /** @memberof SceneGISPlanarLayerTerrainProvider.prototype
   * @type {number}
   * @readonly */
  minimumHeight: {
    get: function () {
      return this._provider.minimumHeight;
    },
  },
  /** @memberof SceneGISPlanarLayerTerrainProvider.prototype
   * @type {number}
   * @readonly */
  maximumHeight: {
    get: function () {
      return this._provider.maximumHeight;
    },
  },
  /** @memberof SceneGISPlanarLayerTerrainProvider.prototype
   * @type {number}
   * @readonly */
  maximumLevel: {
    get: function () {
      return this._provider.maximumLevel;
    },
  },
  /** @memberof SceneGISPlanarLayerTerrainProvider.prototype
   * @type {Event}
   * @readonly */
  errorEvent: {
    get: function () {
      return this._provider.errorEvent;
    },
  },
  /** @memberof SceneGISPlanarLayerTerrainProvider.prototype
   * @type {Credit|undefined}
   * @readonly */
  credit: {
    get: function () {
      return this._provider.credit;
    },
  },
  /** @memberof SceneGISPlanarLayerTerrainProvider.prototype
   * @type {string}
   * @readonly */
  format: {
    get: function () {
      return this._format;
    },
  },
  /** @memberof SceneGISPlanarLayerTerrainProvider.prototype
   * @type {string}
   * @readonly */
  url: {
    get: function () {
      return this._url;
    },
  },
});

/**
 * 加载元数据后创建同步就绪的提供者，支持 scenegis-planar-heightmap-rgb24-v2 与 scenegis-planar-quantized-mesh-v2。可用性行号始终采用 Cesium TMS 约定，独立于瓦片 URL 方案。不进行坐标或垂直转换。
 *
 * @param {string|Resource} url 地形目录或显式 layer.json URL。
 * @param {object} [options] 构造提供者时使用的选项。
 * @param {SceneGISPlanarTilingScheme} [options.tilingScheme] 已有世界的标准切片方案，其范围须匹配元数据。
 * @param {number} [options.minimumHeight] 保守全局最低高度，单位为米，元数据缺失时必需。
 * @param {number} [options.maximumHeight] 保守全局最高高度，单位为米，元数据缺失时必需。
 * @param {number} [options.levelZeroMaximumGeometricError] 零级误差，单位为米，默认声明采样间距的四分之一。
 * @param {Credit|string} [options.credit] 覆盖 layer.json 署名的来源署名。
 * @returns {Promise<SceneGISPlanarLayerTerrainProvider>} 就绪的提供者。
 * @exception {RuntimeError} 元数据无效、不支持或缺少全局高度范围。
 *
 * @example
 * const terrain = await Cesium.SceneGISPlanarLayerTerrainProvider.fromUrl("terrain/");
 * const world = new Cesium.SceneGISPlanarWorld({
 *   tilingScheme: terrain.tilingScheme,
 *   maximumLevel: terrain.maximumLevel,
 * });
 * world.terrainProvider = terrain;
 */
SceneGISPlanarLayerTerrainProvider.fromUrl = async function (
  url,
  options = {},
) {
  if (!(typeof url === "string" || url instanceof Resource)) {
    throw new DeveloperError("url must be a string or Resource.");
  }
  let resource = Resource.createIfNeeded(url).clone();
  if (!/\.json$/i.test(resource.getUrlComponent(false))) {
    resource.appendForwardSlash();
    resource = resource.getDerivedResource({ url: "layer.json" });
  }
  const layer = await resource.fetchJson();
  return new SceneGISPlanarLayerTerrainProvider(
    readProvider(layer, resource, options),
  );
};

/**
 * 获取指定层级的几何误差，包含网格量化和裙边下限。
 * @param {number} level 瓦片层级。
 * @returns {number} 误差，单位为米。
 */
SceneGISPlanarLayerTerrainProvider.prototype.getLevelMaximumGeometricError =
  function (level) {
    return Math.max(
      this._provider.getLevelMaximumGeometricError(level),
      this._minimumError,
    );
  };

/**
 * 按标准西北原点 XYZ 坐标测试元数据可用性。
 * @param {number} x 列号。
 * @param {number} y 行号。
 * @param {number} level 层级。
 * @returns {boolean} 瓦片是否存在。
 */
SceneGISPlanarLayerTerrainProvider.prototype.getTileDataAvailable = function (
  x,
  y,
  level,
) {
  if (!this._provider.getTileDataAvailable(x, y, level)) {
    return false;
  }
  return this._available[level].some(
    (range) =>
      x >= range.startX &&
      x <= range.endX &&
      y >= range.startY &&
      y <= range.endY,
  );
};

/**
 * 请求可用瓦片，不增加重试或独立瓦片缓存。
 * @param {number} x 列号。
 * @param {number} y 行号。
 * @param {number} level 层级。
 * @param {Request} [request] 调用方的调度请求。
 * @returns {Promise<SceneGISPlanarTerrainData>|undefined} 地形数据；调度延后时为 undefined。
 */
SceneGISPlanarLayerTerrainProvider.prototype.requestTileGeometry = function (
  x,
  y,
  level,
  request,
) {
  if (!this.getTileDataAvailable(x, y, level)) {
    return Promise.reject(
      new RuntimeError(`Terrain tile ${level}/${x}/${y} is unavailable.`),
    );
  }
  return this._provider.requestTileGeometry(x, y, level, request);
};

/**
 * fromUrl 已加载全部可用性信息，无需额外请求。
 * @param {number} x 列号。
 * @param {number} y 行号。
 * @param {number} level 层级。
 * @returns {undefined} 始终为 undefined。
 */
SceneGISPlanarLayerTerrainProvider.prototype.loadTileDataAvailability =
  function (x, y, level) {
    this.getTileDataAvailable(x, y, level);
    return undefined;
  };

export default SceneGISPlanarLayerTerrainProvider;

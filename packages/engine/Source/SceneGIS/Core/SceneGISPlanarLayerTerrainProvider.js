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
 * Loads a SceneGIS planar terrain layer described by layer.json. Use
 * {@link SceneGISPlanarLayerTerrainProvider.fromUrl} instead of this constructor.
 * The provider owns metadata only; the consuming world owns tile and GPU resources.
 *
 * @alias SceneGISPlanarLayerTerrainProvider
 * @constructor
 * @param {object} options Internal initialization values produced by fromUrl.
 * @exception {DeveloperError} Use fromUrl to construct this provider.
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
 * Creates a synchronously ready provider after loading its metadata. Supports
 * scenegis-planar-heightmap-rgb24-v2 and scenegis-planar-quantized-mesh-v2.
 * Availability rows always use Cesium's TMS convention, independently of the
 * tile URL scheme.
 * No coordinate or vertical conversion is performed.
 *
 * @param {string|Resource} url The terrain directory or an explicit layer.json URL.
 * @param {object} [options] Options used when constructing the provider.
 * @param {SceneGISPlanarTilingScheme} [options.tilingScheme] An existing world's canonical scheme, whose extent must match the metadata.
 * @param {number} [options.minimumHeight] The conservative global minimum height in metres; required when absent from metadata.
 * @param {number} [options.maximumHeight] The conservative global maximum height in metres; required when absent from metadata.
 * @param {number} [options.levelZeroMaximumGeometricError] The Level-0 error in metres; defaults to one quarter of the declared sample spacing.
 * @param {Credit|string} [options.credit] Attribution overriding layer.json attribution.
 * @returns {Promise<SceneGISPlanarLayerTerrainProvider>} A ready provider.
 * @exception {RuntimeError} Metadata is invalid, unsupported, or lacks a global height range.
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
 * Gets a level's geometric error, including the mesh quantization/skirt floor.
 * @param {number} level The tile level.
 * @returns {number} The error in metres.
 */
SceneGISPlanarLayerTerrainProvider.prototype.getLevelMaximumGeometricError =
  function (level) {
    return Math.max(
      this._provider.getLevelMaximumGeometricError(level),
      this._minimumError,
    );
  };

/**
 * Tests metadata availability using canonical northwest-origin XYZ coordinates.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} level The level.
 * @returns {boolean} Whether a tile is present.
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
 * Requests an available tile without adding retries or a separate tile cache.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} level The level.
 * @param {Request} [request] The caller's scheduler request.
 * @returns {Promise<SceneGISPlanarTerrainData>|undefined} Terrain data, or undefined when scheduling is deferred.
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
 * All availability was loaded by fromUrl; no additional request is necessary.
 * @param {number} x The column.
 * @param {number} y The row.
 * @param {number} level The level.
 * @returns {undefined} Always undefined.
 */
SceneGISPlanarLayerTerrainProvider.prototype.loadTileDataAvailability =
  function (x, y, level) {
    this.getTileDataAvailable(x, y, level);
    return undefined;
  };

export default SceneGISPlanarLayerTerrainProvider;

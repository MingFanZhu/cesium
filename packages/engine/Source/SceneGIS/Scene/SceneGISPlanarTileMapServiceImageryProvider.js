import DeveloperError from "../../Core/DeveloperError.js";
import Resource from "../../Core/Resource.js";
import RuntimeError from "../../Core/RuntimeError.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";
import SceneGISPlanarUrlTemplateImageryProvider from "./SceneGISPlanarUrlTemplateImageryProvider.js";

function metadataError(message) {
  return new RuntimeError(`Invalid planar TMS metadata: ${message}`);
}

function requireElement(parent, name) {
  const node = parent?.getElementsByTagName(name)[0];
  if (!node) {
    throw metadataError(`${name} is required.`);
  }
  return node;
}

function numberAttribute(node, name) {
  const text = node.getAttribute(name);
  const value = Number(text);
  if (text === null || text.trim() === "" || !Number.isFinite(value)) {
    throw metadataError(`${node.tagName}.${name} must be finite.`);
  }
  return value;
}

function matches(actual, expected, scale) {
  return Math.abs(actual - expected) <= Math.abs(scale) * 1e-10;
}

/**
 * Loads a TMS pyramid in the canonical planar grid. Use fromUrl to read and validate
 * tilemapresource.xml. The synchronous constructor instead uses explicitly configured
 * dimensions and levels with the conventional z/x/y.extension paths.
 * Service rows increase northward; public addresses remain northwest-origin XYZ.
 *
 * @alias SceneGISPlanarTileMapServiceImageryProvider
 * @extends SceneGISPlanarUrlTemplateImageryProvider
 *
 * @param {object} options Initialization options.
 * @param {string|Resource} options.url The TMS directory.
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme The world's canonical tiling scheme.
 * @param {string} [options.fileExtension="png"] The image file extension, without a dot.
 * @param {number} [options.minimumLevel=0] The minimum level; must be zero.
 * @param {number} [options.maximumLevel] The maximum available level.
 * @param {number} [options.tileWidth=256] The image width in pixels.
 * @param {number} [options.tileHeight=options.tileWidth] The image height in pixels.
 * @param {boolean} [options.hasAlphaChannel=true] Whether imagery has alpha.
 * @param {Credit|string} [options.credit] Attribution.
 * @exception {DeveloperError} The options are invalid.
 */
class SceneGISPlanarTileMapServiceImageryProvider extends SceneGISPlanarUrlTemplateImageryProvider {
  constructor(options = {}) {
    if (!(typeof options.url === "string" || options.url instanceof Resource)) {
      throw new DeveloperError("options.url must be a string or Resource.");
    }
    const extension = options.fileExtension ?? "png";
    if (typeof extension !== "string" || !/^[a-zA-Z0-9]+$/.test(extension)) {
      throw new DeveloperError(
        "fileExtension must contain only letters and digits.",
      );
    }
    const resource = Resource.createIfNeeded(options.url);
    resource.appendForwardSlash();
    super({
      ...options,
      urlScheme: "tms",
      url: resource.getDerivedResource({
        url: `{z}/{x}/{y}.${extension}`,
      }),
    });
    this._tileResources = undefined;
    this._fileExtension = extension;
  }

  /**
   * Reads standard TMS metadata. BoundingBox and Origin must cover the whole world;
   * SRS must match coordinateSystem.crs and resolutions must halve at every level.
   * TileSet order values and hrefs are preserved even when the first order is nonzero.
   * Metadata errors are rejected rather than replaced by a guessed Earth grid.
   *
   * @param {string|Resource} url The TMS directory or tilemapresource XML URL.
   * @param {object} options Initialization options.
   * @param {SceneGISPlanarTilingScheme} options.tilingScheme The canonical scheme, including its CRS identifier.
   * @param {number} [options.minimumLevel=0] The minimum level; must be zero.
   * @param {number} [options.maximumLevel] A cap on the levels declared in the metadata.
   * @param {boolean} [options.hasAlphaChannel=true] Whether imagery has alpha.
   * @param {Credit|string} [options.credit] Attribution.
   * @returns {Promise<SceneGISPlanarTileMapServiceImageryProvider>} A ready provider.
   * @exception {RuntimeError} The metadata is missing, malformed, or incompatible with the world grid.
   *
   * @example
   * const provider = await SceneGISPlanarTileMapServiceImageryProvider.fromUrl("/imagery/", {
   *   tilingScheme: world.tilingScheme,
   * });
   * world.imageryLayers.addImageryProvider(provider);
   */
  static async fromUrl(url, options = {}) {
    if (!(typeof url === "string" || url instanceof Resource)) {
      throw new DeveloperError("url must be a string or Resource.");
    }
    const scheme = options.tilingScheme;
    if (!(scheme instanceof SceneGISPlanarTilingScheme)) {
      throw new DeveloperError(
        "options.tilingScheme must be a SceneGISPlanarTilingScheme.",
      );
    }
    let resource = Resource.createIfNeeded(url);
    if (!/\.xml$/i.test(resource.getUrlComponent(false))) {
      resource.appendForwardSlash();
      resource = resource.getDerivedResource({ url: "tilemapresource.xml" });
    }
    const xml = await resource.fetchXML();
    const root = requireElement(xml, "TileMap");
    const srs = requireElement(root, "SRS").textContent.trim();
    if (!srs || srs !== scheme.coordinateSystem.crs) {
      throw metadataError("SRS must match tilingScheme.coordinateSystem.crs.");
    }
    const extent = scheme.coordinateSystem.extent;
    const bounds = requireElement(root, "BoundingBox");
    const origin = requireElement(root, "Origin");
    for (const [attribute, expected] of [
      ["minx", extent.minimumX],
      ["miny", extent.minimumY],
      ["maxx", extent.maximumX],
      ["maxy", extent.maximumY],
    ]) {
      if (
        !matches(numberAttribute(bounds, attribute), expected, extent.width)
      ) {
        throw metadataError(
          "BoundingBox must equal the canonical world extent.",
        );
      }
    }
    if (
      !matches(numberAttribute(origin, "x"), extent.minimumX, extent.width) ||
      !matches(numberAttribute(origin, "y"), extent.minimumY, extent.height)
    ) {
      throw metadataError("Origin must be the world's southwest corner.");
    }
    const format = requireElement(root, "TileFormat");
    const width = numberAttribute(format, "width");
    const height = numberAttribute(format, "height");
    const extension = format.getAttribute("extension");
    if (
      !Number.isInteger(width) ||
      width <= 0 ||
      width !== height ||
      !/^[a-zA-Z0-9]+$/.test(extension ?? "")
    ) {
      throw metadataError(
        "TileFormat must describe square pixels in a square tile with a valid extension.",
      );
    }
    const sets = Array.from(
      requireElement(root, "TileSets").getElementsByTagName("TileSet"),
    )
      .map((node) => ({
        node,
        order: numberAttribute(node, "order"),
        resolution: numberAttribute(node, "units-per-pixel"),
      }))
      .sort((a, b) => a.order - b.order);
    if (sets.length === 0 || sets.length - 1 > scheme.maximumSafeLevel) {
      throw metadataError(
        "TileSets must provide a non-empty addressable pyramid.",
      );
    }
    const tileResources = [];
    for (let level = 0; level < sets.length; ++level) {
      const set = sets[level];
      const resolution = extent.width / width / 2 ** level;
      if (
        !Number.isSafeInteger(set.order) ||
        set.order < 0 ||
        (level > 0 && set.order !== sets[level - 1].order + 1) ||
        !matches(set.resolution, resolution, resolution)
      ) {
        throw metadataError(
          "TileSet resolutions must form the complete canonical quadtree from level zero.",
        );
      }
      const href = set.node.getAttribute("href");
      if (!href) {
        throw metadataError("TileSet.href is required.");
      }
      const tileResource = resource.getDerivedResource({ url: href });
      tileResource.appendForwardSlash();
      tileResources.push(tileResource);
    }
    const maximumLevel = options.maximumLevel ?? sets.length - 1;
    if (maximumLevel > sets.length - 1) {
      throw metadataError("maximumLevel exceeds the metadata pyramid.");
    }
    const provider = new SceneGISPlanarTileMapServiceImageryProvider({
      ...options,
      url: resource.getDerivedResource({ url: "." }),
      maximumLevel,
      tileWidth: width,
      tileHeight: height,
      fileExtension: extension,
    });
    provider._tileResources = tileResources;
    return provider;
  }

  /** @private */
  _buildImageResource(x, y, level, request) {
    if (!this._tileResources) {
      return super._buildImageResource(x, y, level, request);
    }
    this._validateTileAddress(x, y, level);
    const row = this.tilingScheme.getNumberOfYTilesAtLevel(level) - y - 1;
    return this._tileResources[level].getDerivedResource({
      url: `${x}/${row}.${this._fileExtension}`,
      request,
    });
  }
}

export default SceneGISPlanarTileMapServiceImageryProvider;

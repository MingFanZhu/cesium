import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import SceneGISPlanarUrlTemplateImageryProvider from "./SceneGISPlanarUrlTemplateImageryProvider.js";

const reservedDimensions =
  /^(service|request|version|layer|style|format|tilematrixset|tilematrix|tilerow|tilecol|s)$/i;

function copyDimensions(value) {
  if (
    value !== undefined &&
    (value === null || typeof value !== "object" || Array.isArray(value))
  ) {
    throw new DeveloperError("dimensions must be an object.");
  }
  const result = { ...value };
  for (const [key, dimension] of Object.entries(result)) {
    if (
      reservedDimensions.test(key) ||
      !(
        typeof dimension === "string" ||
        (typeof dimension === "number" && Number.isFinite(dimension))
      )
    ) {
      throw new DeveloperError(
        "dimensions must contain non-reserved string or finite number values.",
      );
    }
  }
  return Object.freeze(result);
}

/**
 * Loads WMTS imagery using KVP or REST resource templates in a planar world.
 * The selected matrix set must match the world's single-root, north-origin quadtree.
 * Matrix labels map canonical levels to service identifiers; no CRS conversion is performed.
 *
 * @alias SceneGISPlanarWebMapTileServiceImageryProvider
 * @extends SceneGISPlanarUrlTemplateImageryProvider
 *
 * @param {object} options Initialization options.
 * @param {string|Resource} options.url The WMTS endpoint or REST template.
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme The world's canonical tiling scheme.
 * @param {string} options.layer The WMTS layer identifier.
 * @param {string} options.style The WMTS style identifier.
 * @param {string} options.tileMatrixSetID The tile matrix set identifier.
 * @param {string[]} [options.tileMatrixLabels] Matrix identifiers indexed by canonical level.
 * @param {string} [options.format="image/jpeg"] The image MIME type.
 * @param {object} [options.dimensions] Static dimension names and values. Assign a new object to reload tiles.
 * @param {number} [options.minimumLevel=0] The minimum level; must be zero.
 * @param {number} [options.maximumLevel] The highest level, defaulting to the last label or maximumSafeLevel.
 * @param {number} [options.tileWidth=256] The image width in pixels.
 * @param {number} [options.tileHeight=options.tileWidth] The image height in pixels.
 * @param {string|string[]} [options.subdomains="abc"] URL subdomains.
 * @param {boolean} [options.hasAlphaChannel=true] Whether imagery has alpha.
 * @param {Credit|string} [options.credit] Attribution.
 * @exception {DeveloperError} Required options are missing or the level mapping is invalid.
 *
 * @example
 * const provider = new SceneGISPlanarWebMapTileServiceImageryProvider({
 *   url: "/wmts", layer: "ortho", style: "default", tileMatrixSetID: "local",
 *   tilingScheme: world.tilingScheme, tileMatrixLabels: ["root", "detail"],
 * });
 * world.imageryLayers.addImageryProvider(provider);
 */
class SceneGISPlanarWebMapTileServiceImageryProvider extends SceneGISPlanarUrlTemplateImageryProvider {
  constructor(options = {}) {
    for (const key of ["layer", "style", "tileMatrixSetID"]) {
      if (
        typeof options[key] !== "string" ||
        (key !== "style" && options[key].length === 0)
      ) {
        throw new DeveloperError(`options.${key} must be a string.`);
      }
    }
    if (options.clock !== undefined || options.times !== undefined) {
      throw new DeveloperError(
        "Clock/times are not supported; update dimensions explicitly.",
      );
    }
    const labels = options.tileMatrixLabels;
    if (
      labels !== undefined &&
      (!Array.isArray(labels) ||
        labels.length === 0 ||
        Array.from(labels).some(
          (label) => typeof label !== "string" || label.length === 0,
        ))
    ) {
      throw new DeveloperError(
        "tileMatrixLabels must be a non-empty array of strings.",
      );
    }
    super({
      ...options,
      maximumLevel:
        options.maximumLevel ?? (labels ? labels.length - 1 : undefined),
    });
    if (labels && labels.length <= this.maximumLevel) {
      throw new DeveloperError(
        "tileMatrixLabels must cover every requested level.",
      );
    }
    this._tileMatrixLabels = labels ? Object.freeze(labels.slice()) : undefined;
    this._layer = options.layer;
    this._style = options.style;
    this._tileMatrixSetID = options.tileMatrixSetID;
    this._format = options.format ?? "image/jpeg";
    if (typeof this._format !== "string" || this._format.length === 0) {
      throw new DeveloperError("format must be a non-empty MIME type string.");
    }
    this._dimensions = copyDimensions(options.dimensions);
    this._reloadEvent = new Event();
    this._useKvp = !/\{/.test(
      this._resource.getUrlComponent(true).replace(/\{s\}/g, ""),
    );
    if (this._useKvp) {
      // KVP parameter names are case-insensitive; avoid retaining an uppercase
      // GetCapabilities request alongside the per-tile GetTile parameters.
      for (const key of Object.keys(this._resource.queryParameters)) {
        if (
          /^(service|request|version|layer|style|format|tilematrixset|tilematrix|tilerow|tilecol)$/i.test(
            key,
          )
        ) {
          delete this._resource.queryParameters[key];
        }
      }
    }
  }

  /**
   * Gets the layer identifier.
   * @type {string}
   * @readonly
   */
  get layer() {
    return this._layer;
  }
  /**
   * Gets the style identifier.
   * @type {string}
   * @readonly
   */
  get style() {
    return this._style;
  }
  /**
   * Gets the image MIME type.
   * @type {string}
   * @readonly
   */
  get format() {
    return this._format;
  }
  /**
   * Gets the matrix set identifier.
   * @type {string}
   * @readonly
   */
  get tileMatrixSetID() {
    return this._tileMatrixSetID;
  }
  /**
   * Gets the immutable level labels.
   * @type {ReadonlyArray<string>|undefined}
   * @readonly
   */
  get tileMatrixLabels() {
    return this._tileMatrixLabels;
  }
  /**
   * Gets or replaces the immutable dimensions. Replacement reloads all attached layers
   * on their next normal frame. Editing a returned object is not supported.
   * @type {object}
   */
  get dimensions() {
    return this._dimensions;
  }
  set dimensions(value) {
    const next = copyDimensions(value);
    const previous = this._dimensions;
    if (
      Object.keys(next).length === Object.keys(previous).length &&
      Object.keys(next).every((key) => next[key] === previous[key])
    ) {
      return;
    }
    this._dimensions = next;
    this._reloadEvent.raiseEvent();
  }

  /** @private */
  _buildImageResource(x, y, level, request) {
    const resource = super._buildImageResource(x, y, level, request);
    const matrix = this._tileMatrixLabels?.[level] ?? String(level);
    if (this._useKvp) {
      resource.setQueryParameters({
        ...this._dimensions,
        service: "WMTS",
        version: "1.0.0",
        request: "GetTile",
        layer: this._layer,
        style: this._style,
        format: this._format,
        tilematrixset: this._tileMatrixSetID,
        tilematrix: matrix,
        tilerow: y,
        tilecol: x,
      });
    } else {
      resource.setTemplateValues({
        ...this._dimensions,
        TileMatrixSet: this._tileMatrixSetID,
        TileMatrix: matrix,
        TileRow: y,
        TileCol: x,
        Style: this._style,
        style: this._style,
        Layer: this._layer,
        layer: this._layer,
        Format: this._format,
        format: this._format,
      });
    }
    return resource;
  }
}

export default SceneGISPlanarWebMapTileServiceImageryProvider;

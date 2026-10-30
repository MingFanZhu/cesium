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
 * 在平面世界中通过 KVP 或 REST 资源模板加载 WMTS 影像。所选矩阵集须匹配世界的单根、北侧原点四叉树。矩阵标签将标准层级映射到服务标识，不进行 CRS 转换。
 *
 * @alias SceneGISPlanarWebMapTileServiceImageryProvider
 * @extends SceneGISPlanarUrlTemplateImageryProvider
 *
 * @param {object} options 初始化选项。
 * @param {string|Resource} options.url WMTS 端点或 REST 模板。
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme 世界的标准切片方案。
 * @param {string} options.layer WMTS 图层标识。
 * @param {string} options.style WMTS 样式标识。
 * @param {string} options.tileMatrixSetID 瓦片矩阵集标识。
 * @param {string[]} [options.tileMatrixLabels] 按标准层级索引的矩阵标识。
 * @param {string} [options.format="image/jpeg"] 图像 MIME 类型。
 * @param {object} [options.dimensions] 静态维度名称和值；赋予新对象可重新加载瓦片。
 * @param {SceneGISPlanarExtent} [options.coverageExtent] 世界米制覆盖范围，不改变瓦片地址。
 * @param {number} [options.minimumLevel=0] 可用最低标准层级。
 * @param {number} [options.maximumLevel] 最高层级，默认最后一个标签或 maximumSafeLevel。
 * @param {number} [options.tileWidth=256] 图像宽度，单位为像素。
 * @param {number} [options.tileHeight=options.tileWidth] 图像高度，单位为像素。
 * @param {string|string[]} [options.subdomains="abc"] URL 子域。
 * @param {boolean} [options.hasAlphaChannel=true] 影像是否具有 alpha。
 * @param {Credit|string} [options.credit] 署名。
 * @exception {DeveloperError} 缺少必需选项或层级映射无效。
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
      (!Array.isArray(labels) || labels.length === 0)
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
    if (labels) {
      for (let level = this.minimumLevel; level <= this.maximumLevel; ++level) {
        if (typeof labels[level] !== "string" || labels[level].length === 0) {
          throw new DeveloperError(
            "tileMatrixLabels must cover every requested canonical level.",
          );
        }
      }
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
   * 获取图层标识。
   * @type {string}
   * @readonly
   */
  get layer() {
    return this._layer;
  }
  /**
   * 获取样式标识。
   * @type {string}
   * @readonly
   */
  get style() {
    return this._style;
  }
  /**
   * 获取图像 MIME 类型。
   * @type {string}
   * @readonly
   */
  get format() {
    return this._format;
  }
  /**
   * 获取矩阵集标识。
   * @type {string}
   * @readonly
   */
  get tileMatrixSetID() {
    return this._tileMatrixSetID;
  }
  /**
   * 获取不可变层级标签。
   * @type {ReadonlyArray<string>|undefined}
   * @readonly
   */
  get tileMatrixLabels() {
    return this._tileMatrixLabels;
  }
  /**
   * 获取或替换不可变维度。替换使全部已挂载图层在下一正常帧重新加载，不支持修改返回对象。
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

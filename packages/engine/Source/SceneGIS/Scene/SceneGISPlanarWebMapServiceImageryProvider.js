import DeveloperError from "../../Core/DeveloperError.js";
import Resource from "../../Core/Resource.js";
import SceneGISPlanarUrlTemplateImageryProvider from "./SceneGISPlanarUrlTemplateImageryProvider.js";

/**
 * 按平面瓦片范围加载 WMS GetMap 图像。坐标以米为单位，按配置的 CRS 发送，不执行投影或重投影。任意 CRS 标识不隐含坐标轴定义，因此 WMS 1.3.0 轴顺序须显式配置。
 *
 * @alias SceneGISPlanarWebMapServiceImageryProvider
 * @extends SceneGISPlanarUrlTemplateImageryProvider
 *
 * @param {object} options 初始化选项。
 * @param {string|Resource} options.url WMS 服务端点。
 * @param {string} options.layers 以逗号分隔的图层名。
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme 世界的标准切片方案。
 * @param {object} [options.parameters] WMS 参数，包含 version、styles、format、transparent 和 time。
 * @param {string} [options.crs] WMS 1.3.0 CRS，默认 coordinateSystem.crs。
 * @param {string} [options.srs] WMS 1.1.1 SRS，默认 coordinateSystem.crs。
 * @param {"xy"|"yx"} [options.axisOrder="xy"] WMS 1.3.0 BBOX 轴顺序，WMS 1.1.1 始终使用 XY。
 * @param {SceneGISPlanarExtent} [options.coverageExtent] 世界米制覆盖范围，不改变瓦片地址。
 * @param {number} [options.minimumLevel=0] 可用最低标准层级。
 * @param {number} [options.maximumLevel] 可用最高层级。
 * @param {number} [options.tileWidth=256] 图像宽度，单位为像素。
 * @param {number} [options.tileHeight=options.tileWidth] 图像高度，单位为像素。
 * @param {string|string[]} [options.subdomains="abc"] URL 子域。
 * @param {boolean} [options.hasAlphaChannel=true] 影像是否具有 alpha。
 * @param {Credit|string} [options.credit] 署名。
 * @exception {DeveloperError} 图层、CRS、版本或轴顺序无效。
 *
 * @example
 * world.imageryLayers.addImageryProvider(new SceneGISPlanarWebMapServiceImageryProvider({
 *   url: "/wms", layers: "ortho", tilingScheme: world.tilingScheme,
 *   parameters: { version: "1.3.0", format: "image/png", transparent: true },
 *   crs: "LOCAL:PROJECT", axisOrder: "xy",
 * }));
 */
class SceneGISPlanarWebMapServiceImageryProvider extends SceneGISPlanarUrlTemplateImageryProvider {
  constructor(options = {}) {
    if (typeof options.layers !== "string" || options.layers.length === 0) {
      throw new DeveloperError("options.layers must be a non-empty string.");
    }
    if (options.clock !== undefined || options.times !== undefined) {
      throw new DeveloperError(
        "Clock/times are not supported by the planar WMS provider.",
      );
    }
    if (!(typeof options.url === "string" || options.url instanceof Resource)) {
      throw new DeveloperError("options.url must be a string or Resource.");
    }
    const resource = Resource.createIfNeeded(options.url);
    const parameters = {
      service: "WMS",
      version: "1.1.1",
      request: "GetMap",
      styles: "",
      format: "image/jpeg",
    };
    for (const [key, value] of Object.entries(resource.queryParameters)) {
      if (
        /^(service|version|request|styles|format|transparent|layers|bbox|width|height|crs|srs)$/i.test(
          key,
        )
      ) {
        parameters[key.toLowerCase()] = value;
        delete resource.queryParameters[key];
      }
    }
    for (const [key, value] of Object.entries(options.parameters ?? {})) {
      parameters[key.toLowerCase()] = value;
    }
    if (parameters.version !== "1.1.1" && parameters.version !== "1.3.0") {
      throw new DeveloperError("WMS version must be 1.1.1 or 1.3.0.");
    }
    const modern = parameters.version === "1.3.0";
    const axisOrder = options.axisOrder ?? "xy";
    if (axisOrder !== "xy" && axisOrder !== "yx") {
      throw new DeveloperError("axisOrder must be xy or yx.");
    }
    const crs =
      (modern
        ? (options.crs ?? parameters.crs)
        : (options.srs ?? parameters.srs)) ??
      options.tilingScheme?.coordinateSystem.crs;
    if (typeof crs !== "string" || crs.length === 0) {
      throw new DeveloperError(
        "An explicit WMS CRS/SRS or coordinateSystem.crs is required.",
      );
    }
    delete parameters.crs;
    delete parameters.srs;
    Object.assign(parameters, {
      service: "WMS",
      request: "GetMap",
      layers: options.layers,
      width: "{width}",
      height: "{height}",
      bbox:
        modern && axisOrder === "yx"
          ? "{southProjected},{westProjected},{northProjected},{eastProjected}"
          : "{westProjected},{southProjected},{eastProjected},{northProjected}",
      [modern ? "crs" : "srs"]: crs,
    });
    resource.setQueryParameters(parameters);
    super({ ...options, url: resource });
    this._layers = options.layers;
  }

  /**
   * 获取请求的图层名。
   * @type {string}
   * @readonly
   */
  get layers() {
    return this._layers;
  }
}

export default SceneGISPlanarWebMapServiceImageryProvider;

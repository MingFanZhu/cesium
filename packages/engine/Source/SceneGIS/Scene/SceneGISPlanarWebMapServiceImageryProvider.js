import DeveloperError from "../../Core/DeveloperError.js";
import Resource from "../../Core/Resource.js";
import SceneGISPlanarUrlTemplateImageryProvider from "./SceneGISPlanarUrlTemplateImageryProvider.js";

/**
 * Loads WMS GetMap images for planar tile extents. Coordinates are sent in meters
 * in the configured CRS, without projection or reprojection. WMS 1.3.0 axis order
 * is explicit because arbitrary CRS identifiers do not imply an axis definition.
 *
 * @alias SceneGISPlanarWebMapServiceImageryProvider
 * @extends SceneGISPlanarUrlTemplateImageryProvider
 *
 * @param {object} options Initialization options.
 * @param {string|Resource} options.url The WMS endpoint.
 * @param {string} options.layers Comma-separated layer names.
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme The world's canonical tiling scheme.
 * @param {object} [options.parameters] WMS parameters, including version, styles, format, transparent, and time.
 * @param {string} [options.crs] The WMS 1.3.0 CRS, defaulting to coordinateSystem.crs.
 * @param {string} [options.srs] The WMS 1.1.1 SRS, defaulting to coordinateSystem.crs.
 * @param {"xy"|"yx"} [options.axisOrder="xy"] WMS 1.3.0 BBOX axis order. WMS 1.1.1 always uses XY.
 * @param {number} [options.minimumLevel=0] The minimum level; must be zero.
 * @param {number} [options.maximumLevel] The maximum available level.
 * @param {number} [options.tileWidth=256] The image width in pixels.
 * @param {number} [options.tileHeight=options.tileWidth] The image height in pixels.
 * @param {string|string[]} [options.subdomains="abc"] URL subdomains.
 * @param {boolean} [options.hasAlphaChannel=true] Whether imagery has alpha.
 * @param {Credit|string} [options.credit] Attribution.
 * @exception {DeveloperError} The layers, CRS, version, or axis order is invalid.
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
   * Gets the requested layer names.
   * @type {string}
   * @readonly
   */
  get layers() {
    return this._layers;
  }
}

export default SceneGISPlanarWebMapServiceImageryProvider;

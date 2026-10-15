import DeveloperError from "../../Core/DeveloperError.js";
import Resource from "../../Core/Resource.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";
import SceneGISPlanarUrlTemplateImageryProvider from "./SceneGISPlanarUrlTemplateImageryProvider.js";

/**
 * Maps a single image onto the entire planar world. Image pixels may have a
 * different aspect ratio than the square world. Higher terrain levels sample
 * this level-zero image using the normal ancestor texture transform.
 *
 * @alias SceneGISPlanarSingleTileImageryProvider
 * @extends SceneGISPlanarUrlTemplateImageryProvider
 *
 * @param {object} options Initialization options.
 * @param {string|Resource} options.url The image URL or Resource.
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme The canonical tiling scheme.
 * @param {number} options.tileWidth The image's natural width in pixels.
 * @param {number} options.tileHeight The image's natural height in pixels.
 * @param {boolean} [options.hasAlphaChannel=true] Whether the image has alpha.
 * @param {Credit|string} [options.credit] Attribution.
 * @exception {DeveloperError} Dimensions, URL, or tiling scheme are invalid.
 */
class SceneGISPlanarSingleTileImageryProvider extends SceneGISPlanarUrlTemplateImageryProvider {
  constructor(options = {}) {
    if (options.coverageExtent !== undefined) {
      throw new DeveloperError(
        "SingleTile imagery covers the whole world; coverageExtent is not supported.",
      );
    }
    if (options.tileWidth === undefined || options.tileHeight === undefined) {
      throw new DeveloperError(
        "tileWidth and tileHeight are required; use fromUrl to detect them.",
      );
    }
    super({ ...options, maximumLevel: 0 });
    this._image = undefined;
  }

  /**
   * Loads an image and detects its natural size. The provider retains a reusable
   * HTML image rather than sharing a closable ImageBitmap between layers.
   * Providers remain caller-owned and have no GPU resources or destroy requirement.
   *
   * @param {string|Resource} url The image URL or Resource.
   * @param {object} options Initialization options.
   * @param {SceneGISPlanarTilingScheme} options.tilingScheme The canonical tiling scheme.
   * @param {boolean} [options.hasAlphaChannel=true] Whether the image has alpha.
   * @param {Credit|string} [options.credit] Attribution.
   * @returns {Promise<SceneGISPlanarSingleTileImageryProvider>} A ready provider.
   */
  static async fromUrl(url, options = {}) {
    if (
      !(options.tilingScheme instanceof SceneGISPlanarTilingScheme) ||
      !(typeof url === "string" || url instanceof Resource)
    ) {
      throw new DeveloperError(
        "A URL and canonical planar tilingScheme are required.",
      );
    }
    const resource = Resource.createIfNeeded(url);
    const image = await resource.fetchImage({ preferImageBitmap: false });
    const provider = new SceneGISPlanarSingleTileImageryProvider({
      ...options,
      url: resource,
      tileWidth: image.width,
      tileHeight: image.height,
    });
    provider._image = image;
    return provider;
  }

  /**
   * Requests the root image. An image loaded by fromUrl can be shared by layers.
   * @param {number} x Must be zero.
   * @param {number} y Must be zero.
   * @param {number} level Must be zero.
   * @param {Request} [request] The scheduling and cancellation request.
   * @returns {Promise<HTMLImageElement|ImageBitmap>|undefined} The image or undefined when throttled.
   */
  requestImage(x, y, level, request) {
    this._validateTileAddress(x, y, level);
    return this._image
      ? Promise.resolve(this._image)
      : super.requestImage(x, y, level, request);
  }
}

export default SceneGISPlanarSingleTileImageryProvider;

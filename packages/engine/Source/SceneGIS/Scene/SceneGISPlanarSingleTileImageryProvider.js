import DeveloperError from "../../Core/DeveloperError.js";
import Resource from "../../Core/Resource.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";
import SceneGISPlanarUrlTemplateImageryProvider from "./SceneGISPlanarUrlTemplateImageryProvider.js";

/**
 * 将单张图像映射到整个平面世界。图像像素宽高比可以不同于正方形世界；更高地形层级通过标准祖先纹理变换采样这张零级图像。
 *
 * @alias SceneGISPlanarSingleTileImageryProvider
 * @extends SceneGISPlanarUrlTemplateImageryProvider
 *
 * @param {object} options 初始化选项。
 * @param {string|Resource} options.url 图像 URL 或 Resource。
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme 标准切片方案。
 * @param {number} options.tileWidth 图像原始宽度，单位为像素。
 * @param {number} options.tileHeight 图像原始高度，单位为像素。
 * @param {boolean} [options.hasAlphaChannel=true] 图像是否具有 alpha。
 * @param {Credit|string} [options.credit] 署名。
 * @exception {DeveloperError} 尺寸、URL 或切片方案无效。
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
   * 加载图像并检测原始尺寸。提供者保留可复用 HTML 图像，不在图层间共享可关闭的 ImageBitmap。提供者仍归调用方所有，无 GPU 资源，也不要求销毁。
   *
   * @param {string|Resource} url 图像 URL 或 Resource。
   * @param {object} options 初始化选项。
   * @param {SceneGISPlanarTilingScheme} options.tilingScheme 标准切片方案。
   * @param {boolean} [options.hasAlphaChannel=true] 图像是否具有 alpha。
   * @param {Credit|string} [options.credit] 署名。
   * @returns {Promise<SceneGISPlanarSingleTileImageryProvider>} 就绪的提供者。
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
   * 请求根图像，fromUrl 加载的图像可由图层共享。
   * @param {number} x 必须为零。
   * @param {number} y 必须为零。
   * @param {number} level 必须为零。
   * @param {Request} [request] 调度与取消请求。
   * @returns {Promise<HTMLImageElement|ImageBitmap>|undefined} 图像；限流时为 undefined。
   */
  requestImage(x, y, level, request) {
    this._validateTileAddress(x, y, level);
    return this._image
      ? Promise.resolve(this._image)
      : super.requestImage(x, y, level, request);
  }
}

export default SceneGISPlanarSingleTileImageryProvider;

// @ts-check

/* eslint-disable no-unused-vars -- Public JSDoc types require runtime-resolvable imports. */
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Request from "../../Core/Request.js";
import SceneGISPlanarExtent from "../Core/SceneGISPlanarExtent.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";
/* eslint-enable no-unused-vars */

/**
 * @returns {never}
 * @private
 */
function throwPropertyInstantiationError() {
  DeveloperError.throwInstantiationError();
  throw new DeveloperError("Unreachable interface property access.");
}

/**
 * 定义 {@link SceneGISPlanarWorld} 使用的影像提供者结构契约。实现须在西北原点的标准格网中声明连续层级区间，并按提供者声明的瓦片尺寸返回图像。此类型不应直接实例化。
 *
 * @interface
 * @exception {DeveloperError} 此接口不能直接实例化。
 */
class SceneGISPlanarImageryProvider {
  constructor() {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 获取提供者的标准平面切片方案。
   * @type {SceneGISPlanarTilingScheme}
   * @constant
   */
  get tilingScheme() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取可用最低标准层级。
   * @type {number}
   * @constant
   */
  get minimumLevel() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取可选的世界米制覆盖范围。undefined 表示覆盖全世界，此矩形不改变标准瓦片地址或图像边界。
   * @type {SceneGISPlanarExtent=}
   * @constant
   */
  get coverageExtent() {
    return undefined;
  }

  /**
   * 获取可用最高层级。
   * @type {number}
   * @constant
   */
  get maximumLevel() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取瓦片宽度，单位为像素。
   * @type {number}
   * @constant
   */
  get tileWidth() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取瓦片高度，单位为像素。
   * @type {number}
   * @constant
   */
  get tileHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取影像是否具有 alpha 通道。
   * @type {boolean}
   * @constant
   */
  get hasAlphaChannel() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取异步瓦片失败时触发的事件。此事件采用结构契约，须提供 <code>addEventListener</code> 与 <code>raiseEvent</code>，不必是 Cesium {@link Event} 实例。
   *
   * @type {Pick.<Event.<*>, "addEventListener"|"raiseEvent">}
   * @constant
   */
  get errorEvent() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取提供者署名。
   * @type {Credit|undefined}
   * @constant
   */
  get credit() {
    return throwPropertyInstantiationError();
  }

  /**
   * 按标准西北原点 XYZ 地址请求图像。可返回 <code>undefined</code> 表示限流。以 statusCode 404 拒绝表示影像缺失，不触发运行时 errorEvent；其他失败保留普通错误与重试行为。
   *
   * @param {number} x 瓦片 X 坐标。
   * @param {number} y 瓦片 Y 坐标。
   * @param {number} level 瓦片层级。
   * @param {Request} request 用于取消与调度的请求。
   * @returns {Promise<ImageBitmap|HTMLImageElement|HTMLCanvasElement>|undefined} 图像 Promise，延后时为 undefined。
   */
  requestImage(x, y, level, request) {
    DeveloperError.throwInstantiationError();
  }
}

export default SceneGISPlanarImageryProvider;

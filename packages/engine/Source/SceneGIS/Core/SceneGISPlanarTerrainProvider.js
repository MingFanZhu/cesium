// @ts-check

/* eslint-disable no-unused-vars -- Public JSDoc types require runtime-resolvable imports. */
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Request from "../../Core/Request.js";
import SceneGISPlanarTerrainData from "./SceneGISPlanarTerrainData.js";
import SceneGISPlanarTilingScheme from "./SceneGISPlanarTilingScheme.js";
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
 * 定义平面切片方案所用地形提供者的结构契约。实现须提供完整零级根瓦片，构造后同步就绪，全部高度与几何误差以米表示。此类型不应直接实例化。
 *
 * @interface
 * @exception {DeveloperError} 此接口不能直接实例化。
 */
class SceneGISPlanarTerrainProvider {
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
   * 获取全局最小解码地形高度，单位为米。
   * @type {number}
   * @constant
   */
  get minimumHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取全局最大解码地形高度，单位为米。
   * @type {number}
   * @constant
   */
  get maximumHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取可用最高地形层级。
   * @type {number}
   * @constant
   */
  get maximumLevel() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取异步瓦片失败事件。此事件采用结构契约，须提供 <code>addEventListener</code> 和 <code>raiseEvent</code>，不必是 Cesium {@link Event}。
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
   * 获取某层瓦片的最大几何误差，单位为米。结果须有限、非负，并随层级增加而不增大。
   *
   * @param {number} level 瓦片层级。
   * @returns {number} 最大几何误差，单位为米。
   */
  getLevelMaximumGeometricError(level) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 按标准西北原点 XYZ 地址请求地形。返回 <code>undefined</code> 表示调度延后，请求拒绝报告异步失败；重试及事件策略归使用此提供者的运行时管理。
   *
   * @param {number} x 瓦片 X 坐标。
   * @param {number} y 瓦片 Y 坐标。
   * @param {number} level 瓦片层级。
   * @param {Request} request 用于取消与调度的请求。
   * @returns {Promise<SceneGISPlanarTerrainData>|undefined} 地形数据 Promise；延后时为 undefined。
   */
  requestTileGeometry(x, y, level, request) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 判断瓦片数据是否可用。
   *
   * @param {number} x 瓦片 X 坐标。
   * @param {number} y 瓦片 Y 坐标。
   * @param {number} level 瓦片层级。
   * @returns {boolean|undefined} 可用为 True，不可用为 false，未知为 undefined。
   */
  getTileDataAvailable(x, y, level) {
    return undefined;
  }

  /**
   * 若支持，开始加载瓦片的可用性元数据。
   *
   * @param {number} x 瓦片 X 坐标。
   * @param {number} y 瓦片 Y 坐标。
   * @param {number} level 瓦片层级。
   * @returns {Promise<void>|undefined} 可用性元数据 Promise；不支持或延后时返回 undefined。
   */
  loadTileDataAvailability(x, y, level) {
    return undefined;
  }
}

export default SceneGISPlanarTerrainProvider;

// @ts-check

/* eslint-disable no-unused-vars -- Public JSDoc types require runtime-resolvable imports. */
import Credit from "../../Core/Credit.js";
import DeveloperError from "../../Core/DeveloperError.js";
import SceneGISPlanarExtent from "./SceneGISPlanarExtent.js";
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
 * 定义单个平面瓦片的只读 CPU 地形数据。具体数据须在未来网格消费者使用的相同表面三角形上插值。此接口不拥有 GPU、请求、Worker 或可销毁资源，不应直接实例化。
 *
 * @interface
 * @exception {DeveloperError} 此接口不能直接实例化。
 */
class SceneGISPlanarTerrainData {
  constructor() {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 获取最小解码高度，单位为米。
   * @type {number}
   * @constant
   */
  get minimumHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取最大解码高度，单位为米。
   * @type {number}
   * @constant
   */
  get maximumHeight() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取与此瓦片关联的署名。
   * @type {Credit[]|undefined}
   * @constant
   */
  get credits() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取此瓦片所有的水面掩码。
   * @type {Uint8Array|undefined}
   * @constant
   */
  get waterMask() {
    return throwPropertyInstantiationError();
  }

  /**
   * 获取数据是否由上采样创建。
   * @type {boolean}
   * @constant
   */
  get wasCreatedByUpsampling() {
    return throwPropertyInstantiationError();
  }

  /**
   * 插值平面位置的地形高度。
   *
   * @param {SceneGISPlanarExtent} extent 此数据表示的瓦片范围。
   * @param {number} x X 坐标，单位为米。
   * @param {number} y Y 坐标，单位为米。
   * @returns {number|undefined} 插值高度，单位为米；有限位置在范围外时返回 undefined。
   */
  interpolateHeight(extent, x, y) {
    DeveloperError.throwInstantiationError();
  }

  /**
   * 判断直接子瓦片是否可用。
   *
   * @param {number} thisX 父瓦片的 X 坐标。
   * @param {number} thisY 父瓦片的 Y 坐标。
   * @param {number} childX 直接子瓦片的 X 坐标。
   * @param {number} childY 直接子瓦片的 Y 坐标。
   * @returns {boolean} 子瓦片可用时为 true，否则为 false。
   */
  isChildAvailable(thisX, thisY, childX, childY) {
    DeveloperError.throwInstantiationError();
  }
}

export default SceneGISPlanarTerrainData;

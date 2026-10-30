import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SceneGISPlanarExtent from "./SceneGISPlanarExtent.js";

/**
 * 定义有界米制平面坐标系：X 向东，Y 向北，Z 向上。CRS 标识仅为不透明元数据，此类型不执行投影或重投影。
 *
 * @alias SceneGISPlanarCoordinateSystem
 * @constructor
 *
 * @param {object} options 包含以下属性的对象：
 * @param {SceneGISPlanarExtent} options.extent 严格正方形的世界范围。
 * @param {string} [options.crs] 可选的非空、不透明 CRS 标识。
 *
 * @exception {DeveloperError} <code>options.extent</code> 不是 SceneGISPlanarExtent。
 * @exception {DeveloperError} 范围不是严格正方形。
 * @exception {DeveloperError} <code>options.crs</code> 已定义但不是非空字符串。
 */
function SceneGISPlanarCoordinateSystem(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  if (!(options.extent instanceof SceneGISPlanarExtent)) {
    throw new DeveloperError("options.extent must be a SceneGISPlanarExtent.");
  }
  if (options.extent.width !== options.extent.height) {
    throw new DeveloperError("options.extent must be strictly square.");
  }
  if (
    options.crs !== undefined &&
    (typeof options.crs !== "string" || options.crs.length === 0)
  ) {
    throw new DeveloperError(
      "options.crs must be a non-empty string when defined.",
    );
  }

  this._extent = SceneGISPlanarExtent.clone(options.extent);
  this._crs = options.crs;
}

Object.defineProperties(SceneGISPlanarCoordinateSystem.prototype, {
  /**
   * 获取自有只读世界范围。
   *
   * @memberof SceneGISPlanarCoordinateSystem.prototype
   * @type {SceneGISPlanarExtent}
   * @readonly
   */
  extent: {
    get: function () {
      return this._extent;
    },
  },

  /**
   * 获取提供的、不透明 CRS 标识。
   *
   * @memberof SceneGISPlanarCoordinateSystem.prototype
   * @type {string|undefined}
   * @readonly
   */
  crs: {
    get: function () {
      return this._crs;
    },
  },
});

export default SceneGISPlanarCoordinateSystem;

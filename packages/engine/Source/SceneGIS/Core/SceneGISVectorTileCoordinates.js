import Cartesian3 from "../../Core/Cartesian3.js";
import DeveloperError from "../../Core/DeveloperError.js";
import SceneGISPlanarTilingScheme from "./SceneGISPlanarTilingScheme.js";

function positive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DeveloperError(`${name} must be finite and positive.`);
  }
}

function validatePoint(u, v, height) {
  if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(height)) {
    throw new DeveloperError("u, v, and height must be finite.");
  }
}

/**
 * 将一个 MVT 图层的瓦片局部坐标映射到显式匹配的平面瓦片。不读取 CRS 元数据，不重投影、裁剪缓冲区或采样地形。
 * @alias SceneGISVectorTileCoordinates
 * @constructor
 * @experimental 此 API 为实验性，可能发生变化。
 * @param {object} options 瓦片映射。
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme 与源匹配的切片方案。
 * @param {number} options.x 标准 XYZ 列号。
 * @param {number} options.y 标准 XYZ 行号，向南递增。
 * @param {number} options.level 标准瓦片层级。
 * @param {number} options.extent 图层的正整数范围。
 * @exception {DeveloperError} 方案、地址或范围无效。
 */
function SceneGISVectorTileCoordinates(options) {
  options = options ?? {};
  if (!(options.tilingScheme instanceof SceneGISPlanarTilingScheme)) {
    throw new DeveloperError(
      "tilingScheme must be a SceneGISPlanarTilingScheme.",
    );
  }
  if (
    !Number.isInteger(options.extent) ||
    options.extent <= 0 ||
    options.extent > 0xffffffff
  ) {
    throw new DeveloperError("extent must be a positive uint32.");
  }
  this._bounds = options.tilingScheme.tileXYToExtent(
    options.x,
    options.y,
    options.level,
  );
  this._extent = options.extent;
  this._origin = Object.freeze(
    new Cartesian3(this._bounds.minimumX, this._bounds.maximumY, 0),
  );
}

Object.defineProperties(SceneGISVectorTileCoordinates.prototype, {
  /**
   * 获取以完整米制坐标表示的不可变西北瓦片原点。
   * @memberof SceneGISVectorTileCoordinates.prototype
   * @type {Cartesian3}
   * @readonly
   */
  origin: {
    get: function () {
      return this._origin;
    },
  },
});

/**
 * 将瓦片局部坐标转换为原点相对米，不因 Float32 丢失世界原点精度。
 * @param {number} u 瓦片局部 X，允许缓冲区坐标。
 * @param {number} v 瓦片局部 Y，向下递增。
 * @param {number} [height=0] 绝对 Z，单位为米。
 * @param {Cartesian3} [result] 结果存储对象。
 * @returns {Cartesian3} 相对原点的坐标。
 * @exception {DeveloperError} 输入或映射坐标非有限值。
 */
SceneGISVectorTileCoordinates.prototype.toLocal = function (
  u,
  v,
  height = 0,
  result,
) {
  validatePoint(u, v, height);
  const x = (u / this._extent) * this._bounds.width;
  const y = -(v / this._extent) * this._bounds.height;
  validatePoint(x, y, height);
  return Cartesian3.fromElements(x, y, height, result);
};

/**
 * 将瓦片局部坐标转换为完整米制坐标，仅翻转一次 Y。
 * @param {number} u 瓦片局部 X，允许缓冲区坐标。
 * @param {number} v 瓦片局部 Y，向下递增。
 * @param {number} [height=0] 绝对 Z，单位为米。
 * @param {Cartesian3} [result] 结果存储对象。
 * @returns {Cartesian3} 完整平面世界坐标。
 * @exception {DeveloperError} 输入或映射坐标非有限值。
 */
SceneGISVectorTileCoordinates.prototype.toWorld = function (
  u,
  v,
  height = 0,
  result,
) {
  const local = this.toLocal(u, v, height, result);
  const bounds = this._bounds;
  // Preserve the canonical shared boundaries instead of recomputing endpoints.
  local.x = u === this._extent ? bounds.maximumX : bounds.minimumX + local.x;
  local.y = v === this._extent ? bounds.minimumY : bounds.maximumY + local.y;
  validatePoint(local.x, local.y, local.z);
  return local;
};

/**
 * 将参考平面的每 CSS 像素米数换算为连续样式缩放。输入不含瓦片 LOD、源最高层级或设备像素比。
 * @param {number} rootWidth 完整正方形根范围宽度，单位为米。
 * @param {number} metersPerPixel 所选参考平面上每 CSS 像素对应的米数。
 * @param {number} [tileSize=512] 参考瓦片宽度，单位为 CSS 像素。
 * @returns {number} 连续样式缩放，可以为负。
 * @exception {DeveloperError} 输入非有限值或非正值。
 */
SceneGISVectorTileCoordinates.computeStyleZoom = function (
  rootWidth,
  metersPerPixel,
  tileSize = 512,
) {
  positive("rootWidth", rootWidth);
  positive("metersPerPixel", metersPerPixel);
  positive("tileSize", tileSize);
  return Math.log2(rootWidth) - Math.log2(metersPerPixel) - Math.log2(tileSize);
};

export default SceneGISVectorTileCoordinates;

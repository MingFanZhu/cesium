import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import defined from "../../Core/defined.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SceneGISPlanarCoordinateSystem from "./SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "./SceneGISPlanarExtent.js";

const maximumSafeIntegerLevel = 52;
const minimumNormal = 2 ** -1022;

function computeUlp(value) {
  const magnitude = Math.abs(value);
  if (magnitude === 0.0 || magnitude < minimumNormal) {
    return Number.MIN_VALUE;
  }
  return 2 ** (Math.floor(Math.log2(magnitude)) - 52);
}

function computeBoundary(minimum, maximum, size, index, count) {
  if (index === 0) {
    return minimum;
  }
  if (index === count) {
    return maximum;
  }
  return minimum + size * (index / count);
}

function computeDescendingBoundary(minimum, maximum, size, index, count) {
  if (index === 0) {
    return maximum;
  }
  if (index === count) {
    return minimum;
  }
  return maximum - size * (index / count);
}

function hasSafeResolution(minimum, maximum, size, count) {
  // index / count is exact because count is a power of two and both values are
  // safe integers. One ULP of the multiplication plus one ULP of the final
  // addition/subtraction conservatively bounds the separation error between
  // adjacent computed boundaries across the entire configured axis.
  const idealSpacing = size / count;
  const maximumRoundingSeparation =
    computeUlp(size) + Math.max(computeUlp(minimum), computeUlp(maximum));
  return idealSpacing > maximumRoundingSeparation;
}

function boundariesAreGuaranteed(extent, level) {
  const count = 2 ** level;
  const size = extent.width;
  if (
    !hasSafeResolution(extent.minimumX, extent.maximumX, size, count) ||
    !hasSafeResolution(extent.minimumY, extent.maximumY, size, count)
  ) {
    return false;
  }

  const firstWest = computeBoundary(
    extent.minimumX,
    extent.maximumX,
    size,
    0,
    count,
  );
  const firstEast = computeBoundary(
    extent.minimumX,
    extent.maximumX,
    size,
    1,
    count,
  );
  const lastWest = computeBoundary(
    extent.minimumX,
    extent.maximumX,
    size,
    count - 1,
    count,
  );
  const lastEast = computeBoundary(
    extent.minimumX,
    extent.maximumX,
    size,
    count,
    count,
  );

  const firstNorth = computeDescendingBoundary(
    extent.minimumY,
    extent.maximumY,
    size,
    0,
    count,
  );
  const firstSouth = computeDescendingBoundary(
    extent.minimumY,
    extent.maximumY,
    size,
    1,
    count,
  );
  const lastNorth = computeDescendingBoundary(
    extent.minimumY,
    extent.maximumY,
    size,
    count - 1,
    count,
  );
  const lastSouth = computeDescendingBoundary(
    extent.minimumY,
    extent.maximumY,
    size,
    count,
    count,
  );

  return (
    firstEast > firstWest &&
    lastEast > lastWest &&
    firstNorth > firstSouth &&
    lastNorth > lastSouth
  );
}

function computeMaximumSafeLevel(extent) {
  let maximumSafeLevel = 0;
  for (let level = 1; level <= maximumSafeIntegerLevel; ++level) {
    if (!boundariesAreGuaranteed(extent, level)) {
      break;
    }
    maximumSafeLevel = level;
  }
  return maximumSafeLevel;
}

function validateLevel(tilingScheme, level) {
  if (!Number.isInteger(level) || level < 0) {
    throw new DeveloperError("level must be a non-negative integer.");
  }
  if (level > tilingScheme.maximumSafeLevel) {
    throw new DeveloperError(
      "level must not exceed the tiling scheme maximumSafeLevel.",
    );
  }
}

function validateTileIndex(name, value, count) {
  if (!Number.isInteger(value) || value < 0 || value >= count) {
    throw new DeveloperError(
      `${name} must be an integer in the range [0, ${count}).`,
    );
  }
}

function findEastOwnedTile(positionX, extent, count) {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const boundary = computeBoundary(
      extent.minimumX,
      extent.maximumX,
      extent.width,
      middle,
      count,
    );
    if (boundary <= positionX) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return Math.min(low - 1, count - 1);
}

function findSouthOwnedTile(positionY, extent, count) {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = low + Math.floor((high - low + 1) / 2);
    const boundary = computeDescendingBoundary(
      extent.minimumY,
      extent.maximumY,
      extent.height,
      middle,
      count,
    );
    if (boundary >= positionY) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return Math.min(low, count - 1);
}

/**
 * 平面坐标系的单根四叉树切片方案。零级仅有一个瓦片，瓦片 X 向东递增，瓦片 Y 从西北原点向南递增，不进行环绕。
 *
 * @alias SceneGISPlanarTilingScheme
 * @constructor
 *
 * @param {object} options 包含以下属性的对象：
 * @param {SceneGISPlanarCoordinateSystem} options.coordinateSystem 要切片的平面坐标系。
 *
 * @exception {DeveloperError} <code>options.coordinateSystem</code> 不是 SceneGISPlanarCoordinateSystem。
 */
function SceneGISPlanarTilingScheme(options) {
  options = options ?? Frozen.EMPTY_OBJECT;

  if (!(options.coordinateSystem instanceof SceneGISPlanarCoordinateSystem)) {
    throw new DeveloperError(
      "options.coordinateSystem must be a SceneGISPlanarCoordinateSystem.",
    );
  }

  this._coordinateSystem = options.coordinateSystem;
  this._maximumSafeLevel = computeMaximumSafeLevel(
    options.coordinateSystem.extent,
  );
}

Object.defineProperties(SceneGISPlanarTilingScheme.prototype, {
  /**
   * 获取此方案切片的坐标系。
   *
   * @memberof SceneGISPlanarTilingScheme.prototype
   * @type {SceneGISPlanarCoordinateSystem}
   * @readonly
   */
  coordinateSystem: {
    get: function () {
      return this._coordinateSystem;
    },
  },

  /**
   * 获取保证每条瓦片边界在数值上仍可区分、且全部索引为安全整数的最高层级。这是数学寻址限制，不是数据源可用性限制。
   *
   * @memberof SceneGISPlanarTilingScheme.prototype
   * @type {number}
   * @readonly
   */
  maximumSafeLevel: {
    get: function () {
      return this._maximumSafeLevel;
    },
  },
});

/**
 * 获取某层 X 方向的瓦片数。
 *
 * @param {number} level 细节层级。
 * @returns {number} X 方向瓦片数。
 * @exception {DeveloperError} <code>level</code> 不是此切片方案的有效层级。
 */
SceneGISPlanarTilingScheme.prototype.getNumberOfXTilesAtLevel = function (
  level,
) {
  validateLevel(this, level);
  return 2 ** level;
};

/**
 * 获取某层 Y 方向的瓦片数。
 *
 * @param {number} level 细节层级。
 * @returns {number} Y 方向瓦片数。
 * @exception {DeveloperError} <code>level</code> 不是此切片方案的有效层级。
 */
SceneGISPlanarTilingScheme.prototype.getNumberOfYTilesAtLevel = function (
  level,
) {
  validateLevel(this, level);
  return 2 ** level;
};

/**
 * 获取某层理想正方形瓦片的边长，单位为米。
 *
 * @param {number} level 细节层级。
 * @returns {number} 理想瓦片边长，单位为米。
 * @exception {DeveloperError} <code>level</code> 不是此切片方案的有效层级。
 */
SceneGISPlanarTilingScheme.prototype.getTileSizeAtLevel = function (level) {
  validateLevel(this, level);
  return this._coordinateSystem.extent.width / 2 ** level;
};

/**
 * 将瓦片坐标转换为平面范围。
 *
 * @param {number} x 整数瓦片 X 坐标。
 * @param {number} y 整数瓦片 Y 坐标。
 * @param {number} level 细节层级。
 * @returns {SceneGISPlanarExtent} 此瓦片的新范围。
 * @exception {DeveloperError} <code>level</code> 不是此切片方案的有效层级。
 * @exception {DeveloperError} <code>x</code> 或 <code>y</code> 不是有效瓦片索引。
 * @exception {DeveloperError} 请求的瓦片边界在数值上不可区分。
 */
SceneGISPlanarTilingScheme.prototype.tileXYToExtent = function (x, y, level) {
  validateLevel(this, level);
  const count = 2 ** level;
  validateTileIndex("x", x, count);
  validateTileIndex("y", y, count);

  const extent = this._coordinateSystem.extent;
  const size = extent.width;
  const west = computeBoundary(
    extent.minimumX,
    extent.maximumX,
    size,
    x,
    count,
  );
  const east = computeBoundary(
    extent.minimumX,
    extent.maximumX,
    size,
    x + 1,
    count,
  );
  const north = computeDescendingBoundary(
    extent.minimumY,
    extent.maximumY,
    size,
    y,
    count,
  );
  const south = computeDescendingBoundary(
    extent.minimumY,
    extent.maximumY,
    size,
    y + 1,
    count,
  );

  if (!(east > west) || !(north > south)) {
    throw new DeveloperError(
      "The requested tile boundaries are not numerically distinguishable.",
    );
  }

  return new SceneGISPlanarExtent({
    minimumX: west,
    minimumY: south,
    maximumX: east,
    maximumY: north,
  });
};

/**
 * 查找包含平面世界位置的瓦片。外边界包含；内部 X 边界归东侧瓦片，内部 Y 边界归南侧瓦片。
 *
 * @param {Cartesian3} position 平面世界位置。验证 Z，但 Z 不参与寻址。
 * @param {number} level 细节层级。
 * @param {Cartesian2} [result] 存储瓦片坐标的对象。
 * @returns {Cartesian2|undefined} 瓦片坐标；位置在世界范围外时为 <code>undefined</code>。
 * @exception {DeveloperError} <code>position</code> 不是各分量有限的 Cartesian3。
 * @exception {DeveloperError} <code>level</code> 不是此切片方案的有效层级。
 */
SceneGISPlanarTilingScheme.prototype.positionToTileXY = function (
  position,
  level,
  result,
) {
  validateLevel(this, level);
  if (
    !(position instanceof Cartesian3) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new DeveloperError(
      "position must be a Cartesian3 with finite components.",
    );
  }

  const extent = this._coordinateSystem.extent;
  if (
    position.x < extent.minimumX ||
    position.x > extent.maximumX ||
    position.y < extent.minimumY ||
    position.y > extent.maximumY
  ) {
    return undefined;
  }

  const count = 2 ** level;
  const tileX = findEastOwnedTile(position.x, extent, count);
  const tileY = findSouthOwnedTile(position.y, extent, count);

  if (!defined(result)) {
    return new Cartesian2(tileX, tileY);
  }
  result.x = tileX;
  result.y = tileY;
  return result;
};

export default SceneGISPlanarTilingScheme;

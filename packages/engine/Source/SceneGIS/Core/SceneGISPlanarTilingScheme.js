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
 * A single-root quadtree tiling scheme for a SceneGIS planar coordinate system. Level zero
 * contains one tile. Tile X increases eastward and tile Y increases southward from a northwest
 * origin. The scheme does not wrap.
 *
 * @alias SceneGISPlanarTilingScheme
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarCoordinateSystem} options.coordinateSystem The planar coordinate system to tile.
 *
 * @exception {DeveloperError} <code>options.coordinateSystem</code> is not a SceneGISPlanarCoordinateSystem.
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
   * Gets the coordinate system tiled by this scheme.
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
   * Gets the highest level at which every tile boundary is guaranteed to remain numerically
   * distinguishable and all tile indices are safe integers. This is a mathematical addressing
   * limit, not a data source availability limit.
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
 * Gets the number of tiles in the X direction at a level.
 *
 * @param {number} level The level of detail.
 * @returns {number} The number of tiles in the X direction.
 * @exception {DeveloperError} <code>level</code> is not a valid level for this tiling scheme.
 */
SceneGISPlanarTilingScheme.prototype.getNumberOfXTilesAtLevel = function (
  level,
) {
  validateLevel(this, level);
  return 2 ** level;
};

/**
 * Gets the number of tiles in the Y direction at a level.
 *
 * @param {number} level The level of detail.
 * @returns {number} The number of tiles in the Y direction.
 * @exception {DeveloperError} <code>level</code> is not a valid level for this tiling scheme.
 */
SceneGISPlanarTilingScheme.prototype.getNumberOfYTilesAtLevel = function (
  level,
) {
  validateLevel(this, level);
  return 2 ** level;
};

/**
 * Gets the ideal square tile edge length in meters at a level.
 *
 * @param {number} level The level of detail.
 * @returns {number} The ideal tile edge length in meters.
 * @exception {DeveloperError} <code>level</code> is not a valid level for this tiling scheme.
 */
SceneGISPlanarTilingScheme.prototype.getTileSizeAtLevel = function (level) {
  validateLevel(this, level);
  return this._coordinateSystem.extent.width / 2 ** level;
};

/**
 * Converts tile coordinates to their planar extent.
 *
 * @param {number} x The integer tile X coordinate.
 * @param {number} y The integer tile Y coordinate.
 * @param {number} level The level of detail.
 * @returns {SceneGISPlanarExtent} A new extent for the tile.
 * @exception {DeveloperError} <code>level</code> is not a valid level for this tiling scheme.
 * @exception {DeveloperError} <code>x</code> or <code>y</code> is not a valid tile index.
 * @exception {DeveloperError} The requested tile boundaries are not numerically distinguishable.
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
 * Finds the tile containing a planar world position. Outer boundaries are inclusive. An internal
 * X boundary belongs to the eastern tile, and an internal Y boundary belongs to the southern tile.
 *
 * @param {Cartesian3} position The planar world position. Z is validated but does not affect addressing.
 * @param {number} level The level of detail.
 * @param {Cartesian2} [result] The object in which to store the tile coordinates.
 * @returns {Cartesian2|undefined} The tile coordinates, or <code>undefined</code> when the position is outside the world extent.
 * @exception {DeveloperError} <code>position</code> is not a Cartesian3 with finite components.
 * @exception {DeveloperError} <code>level</code> is not a valid level for this tiling scheme.
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

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
 * Maps one MVT layer's tile-local coordinates into an explicitly matched planar tile.
 * This does not read CRS metadata, reproject, clamp buffers, or sample terrain.
 * @alias SceneGISVectorTileCoordinates
 * @constructor
 * @experimental This API is experimental and subject to change.
 * @param {object} options The tile mapping.
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme The source's matching tiling scheme.
 * @param {number} options.x Canonical XYZ column.
 * @param {number} options.y Canonical XYZ row, increasing southward.
 * @param {number} options.level Canonical tile level.
 * @param {number} options.extent The layer's positive integer extent.
 * @exception {DeveloperError} The scheme, address, or extent is invalid.
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
   * Gets the immutable northwest tile origin in full meter coordinates.
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
 * Converts tile-local coordinates to origin-relative meters without losing the world origin to Float32.
 * @param {number} u Tile-local X; buffer coordinates are allowed.
 * @param {number} v Tile-local Y, increasing downward.
 * @param {number} [height=0] Absolute Z in meters.
 * @param {Cartesian3} [result] Storage for the result.
 * @returns {Cartesian3} Origin-relative coordinates.
 * @exception {DeveloperError} Input or mapped coordinates are not finite.
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
 * Converts tile-local coordinates to full meter coordinates, flipping Y exactly once.
 * @param {number} u Tile-local X; buffer coordinates are allowed.
 * @param {number} v Tile-local Y, increasing downward.
 * @param {number} [height=0] Absolute Z in meters.
 * @param {Cartesian3} [result] Storage for the result.
 * @returns {Cartesian3} Full planar world coordinates.
 * @exception {DeveloperError} Input or mapped coordinates are not finite.
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
 * Converts reference-plane CSS meters per pixel to continuous style zoom.
 * Tile LOD, source maximum level, and device pixel ratio are not inputs.
 * @param {number} rootWidth The full square root width in meters.
 * @param {number} metersPerPixel Meters per CSS pixel at the chosen reference plane.
 * @param {number} [tileSize=512] Reference tile width in CSS pixels.
 * @returns {number} Continuous style zoom, which may be negative.
 * @exception {DeveloperError} An input is not finite and positive.
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

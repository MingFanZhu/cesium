import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Matrix3 from "../../../Core/Matrix3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import OrientedBoundingBox from "../../../Core/OrientedBoundingBox.js";

/**
 * A cached planar surface tile.
 *
 * @alias SceneGISPlanarTile
 * @constructor
 * @private
 *
 * @param {SceneGISPlanarTilingScheme} tilingScheme The canonical tiling scheme.
 * @param {number} x The tile X coordinate.
 * @param {number} y The tile Y coordinate.
 * @param {number} level The tile level.
 */
function SceneGISPlanarTile(tilingScheme, x, y, level) {
  const extent = tilingScheme.tileXYToExtent(x, y, level);
  const width = extent.width;
  const height = extent.height;
  const center = new Cartesian3(
    extent.minimumX + width * 0.5,
    extent.minimumY + height * 0.5,
    0.0,
  );

  this.x = x;
  this.y = y;
  this.level = level;
  this.key = `${level}/${x}/${y}`;
  this.extent = extent;
  this.boundingVolume = new OrientedBoundingBox(
    center,
    new Matrix3(width * 0.5, 0.0, 0.0, 0.0, height * 0.5, 0.0, 0.0, 0.0, 0.0),
  );
  this.commandBoundingVolume = BoundingSphere.fromOrientedBoundingBox(
    this.boundingVolume,
  );
  this.modelMatrix = Matrix4.fromScale(new Cartesian3(width, height, 1.0));
  Matrix4.setTranslation(this.modelMatrix, center, this.modelMatrix);
  this.command = undefined;
  this.lastUsedFrame = -1;
  this._destroyed = false;
}

SceneGISPlanarTile.prototype.isDestroyed = function () {
  return this._destroyed;
};

SceneGISPlanarTile.prototype.destroy = function () {
  if (!this._destroyed) {
    this.command = undefined;
    this._destroyed = true;
  }
};

export default SceneGISPlanarTile;

import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Intersect from "../../../Core/Intersect.js";
import OrthographicFrustum from "../../../Core/OrthographicFrustum.js";
import OrthographicOffCenterFrustum from "../../../Core/OrthographicOffCenterFrustum.js";
import PerspectiveFrustum from "../../../Core/PerspectiveFrustum.js";
import PerspectiveOffCenterFrustum from "../../../Core/PerspectiveOffCenterFrustum.js";
import SceneGISPlanarTile from "./_SceneGISPlanarTile.js";

function distanceToTile(position, extent) {
  const dx =
    position.x < extent.minimumX
      ? extent.minimumX - position.x
      : position.x > extent.maximumX
        ? position.x - extent.maximumX
        : 0.0;
  const dy =
    position.y < extent.minimumY
      ? extent.minimumY - position.y
      : position.y > extent.maximumY
        ? position.y - extent.maximumY
        : 0.0;
  return Math.hypot(dx, dy, Math.abs(position.z));
}

function getOrthographicHeight(frustum) {
  if (
    frustum instanceof PerspectiveFrustum ||
    frustum instanceof PerspectiveOffCenterFrustum ||
    "sseDenominator" in frustum ||
    "infiniteProjectionMatrix" in frustum
  ) {
    return undefined;
  }
  if (frustum instanceof OrthographicFrustum) {
    return frustum.width / frustum.aspectRatio;
  }
  if (frustum instanceof OrthographicOffCenterFrustum) {
    return frustum.top - frustum.bottom;
  }
  if (Number.isFinite(frustum.width) && Number.isFinite(frustum.aspectRatio)) {
    return frustum.width / frustum.aspectRatio;
  }
  if (Number.isFinite(frustum.top) && Number.isFinite(frustum.bottom)) {
    return frustum.top - frustum.bottom;
  }
  return undefined;
}

function getPerspectiveSseDenominator(frustum) {
  if (Number.isFinite(frustum.sseDenominator)) {
    return frustum.sseDenominator;
  }
  if (
    frustum instanceof PerspectiveOffCenterFrustum ||
    "infiniteProjectionMatrix" in frustum
  ) {
    return (frustum.top - frustum.bottom) / frustum.near;
  }

  // Structural fallback keeps private unit fixtures useful without confusing Cesium's
  // standard PerspectiveFrustum, which also exposes offCenterFrustum.
  throw new DeveloperError(
    "The camera frustum must be perspective or orthographic.",
  );
}

function computeScreenSpaceError(quadtree, tile, frameState) {
  ++quadtree._debug.sseComputations;
  const height = frameState.context.drawingBufferHeight;
  if (height === 0) {
    return 0.0;
  }
  const geometricError =
    quadtree._tilingScheme.coordinateSystem.extent.width /
    (256.0 * 2 ** tile.level);
  const pixelRatio = frameState.pixelRatio;
  const frustum = frameState.camera.frustum;
  const orthographicHeight = getOrthographicHeight(frustum);
  if (defined(orthographicHeight)) {
    return (geometricError * height) / orthographicHeight / pixelRatio;
  }

  const distance = distanceToTile(frameState.camera.positionWC, tile.extent);
  if (distance === 0.0) {
    return Number.POSITIVE_INFINITY;
  }
  const sseDenominator = getPerspectiveSseDenominator(frustum);
  return (geometricError * height) / (distance * sseDenominator) / pixelRatio;
}

function compareEvictionCandidates(left, right) {
  return (
    left.lastUsedFrame - right.lastUsedFrame ||
    left.key.localeCompare(right.key)
  );
}

/**
 * Selects and caches tiles for a planar surface.
 *
 * @alias SceneGISPlanarQuadtree
 * @constructor
 * @private
 *
 * @param {SceneGISPlanarTilingScheme} tilingScheme The canonical tiling scheme.
 */
function SceneGISPlanarQuadtree(tilingScheme) {
  this._tilingScheme = tilingScheme;
  this._tiles = new Map();
  this._idealTiles = [];
  this._protectedKeys = new Set();
  this._frameNumber = -1;
  this._debug = {
    visited: 0,
    culled: 0,
    selected: 0,
    sseComputations: 0,
    createdTiles: 0,
    evictedTiles: 0,
    destroyedTiles: 0,
  };
}

SceneGISPlanarQuadtree.prototype.beginFrame = function (frameNumber) {
  this._frameNumber = frameNumber;
  this._idealTiles.length = 0;
  this._protectedKeys.clear();
  this._debug.visited = 0;
  this._debug.culled = 0;
  this._debug.selected = 0;
  this._debug.sseComputations = 0;
};

SceneGISPlanarQuadtree.prototype.getOrCreateTile = function (x, y, level) {
  const key = `${level}/${x}/${y}`;
  let tile = this._tiles.get(key);
  if (!defined(tile)) {
    tile = new SceneGISPlanarTile(this._tilingScheme, x, y, level);
    this._tiles.set(key, tile);
    ++this._debug.createdTiles;
  }
  return tile;
};

SceneGISPlanarQuadtree.prototype.selectTiles = function (
  frameState,
  maximumLevel,
  maximumScreenSpaceError,
) {
  const stack = [{ x: 0, y: 0, level: 0 }];
  while (stack.length > 0) {
    const address = stack.pop();
    const tile = this.getOrCreateTile(address.x, address.y, address.level);
    ++this._debug.visited;

    if (
      frameState.cullingVolume.computeVisibility(tile.boundingVolume) ===
      Intersect.OUTSIDE
    ) {
      ++this._debug.culled;
      continue;
    }

    const sse = computeScreenSpaceError(this, tile, frameState);
    if (tile.level < maximumLevel && sse > maximumScreenSpaceError) {
      const x = tile.x * 2;
      const y = tile.y * 2;
      const level = tile.level + 1;
      stack.push(
        { x: x + 1, y: y + 1, level },
        { x, y: y + 1, level },
        { x: x + 1, y, level },
        { x, y, level },
      );
      continue;
    }

    tile.lastUsedFrame = this._frameNumber;
    this._idealTiles.push(tile);
    this._protectedKeys.add(tile.key);
  }

  this._debug.selected = this._idealTiles.length;
  return this._idealTiles;
};

SceneGISPlanarQuadtree.prototype.trim = function (tileCacheSize) {
  const candidates = [];
  for (const tile of this._tiles.values()) {
    if (!this._protectedKeys.has(tile.key)) {
      candidates.push(tile);
    }
  }
  candidates.sort(compareEvictionCandidates);
  const removeCount = Math.max(0, candidates.length - tileCacheSize);
  for (let i = 0; i < removeCount; ++i) {
    const tile = candidates[i];
    this._tiles.delete(tile.key);
    tile.destroy();
    ++this._debug.evictedTiles;
    ++this._debug.destroyedTiles;
  }
};

SceneGISPlanarQuadtree.prototype.forEachTile = function (callback) {
  for (const tile of this._tiles.values()) {
    callback(tile);
  }
};

SceneGISPlanarQuadtree.prototype.destroy = function () {
  for (const tile of this._tiles.values()) {
    if (!tile.isDestroyed()) {
      tile.destroy();
      ++this._debug.destroyedTiles;
    }
  }
  this._tiles.clear();
  this._idealTiles.length = 0;
  this._protectedKeys.clear();
};

export default SceneGISPlanarQuadtree;

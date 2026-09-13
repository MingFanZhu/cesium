import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Intersect from "../../../Core/Intersect.js";
import Matrix3 from "../../../Core/Matrix3.js";
import OrientedBoundingBox from "../../../Core/OrientedBoundingBox.js";
import SceneGISVectorTileCoordinates from "../../Core/SceneGISVectorTileCoordinates.js";
import SceneGISPlanarQuadtree from "./_SceneGISPlanarQuadtree.js";

const scratchPixelSize = new Cartesian2();
const scratchBox = new OrientedBoundingBox();
const scratchScale = new Cartesian3();
const scratchLodTile = {
  extent: undefined,
  minimumHeight: 0,
  maximumHeight: 0,
};

function visible(frameState, bounds) {
  Cartesian3.fromElements(
    bounds.minimumX + bounds.width * 0.5,
    bounds.minimumY + bounds.height * 0.5,
    0,
    scratchBox.center,
  );
  Cartesian3.fromElements(
    bounds.width * 0.5,
    bounds.height * 0.5,
    0,
    scratchScale,
  );
  Matrix3.fromScale(scratchScale, scratchBox.halfAxes);
  return (
    frameState.cullingVolume.computeVisibility(scratchBox) !== Intersect.OUTSIDE
  );
}

function selectLevel(frameState, scheme, level, limit) {
  const tiles = [];
  const stack = [{ x: 0, y: 0, level: 0 }];
  while (stack.length > 0) {
    const tile = stack.pop();
    const bounds = scheme.tileXYToExtent(tile.x, tile.y, tile.level);
    if (!visible(frameState, bounds)) {
      continue;
    }
    if (tile.level === level) {
      tiles.push({ ...tile, bounds, key: `${tile.level}/${tile.x}/${tile.y}` });
      if (tiles.length > limit) {
        return undefined;
      }
    } else {
      const x = tile.x * 2;
      const y = tile.y * 2;
      const childLevel = tile.level + 1;
      stack.push(
        { x: x + 1, y: y + 1, level: childLevel },
        { x, y: y + 1, level: childLevel },
        { x: x + 1, y, level: childLevel },
        { x, y, level: childLevel },
      );
    }
  }
  return tiles;
}

function screenSpaceError(frameState, tile, maximumDistance) {
  scratchLodTile.extent = tile.bounds;
  // Vector sources use a canonical 512-pixel tile, independent of MVT extent.
  return SceneGISPlanarQuadtree.computeScreenSpaceError(
    frameState,
    scratchLodTile,
    tile.bounds.width / 512,
    maximumDistance,
  );
}

function compareTiles(a, b) {
  return a.level - b.level || a.y - b.y || a.x - b.x;
}

function selectAdaptive(frameState, source, limit, maximumTiltedTileDistance) {
  const maximumDistance =
    SceneGISPlanarQuadtree.computeMaximumTiltedTileDistance(
      frameState,
      maximumTiltedTileDistance,
    );
  const scheme = source.tilingScheme;
  const roots = selectLevel(frameState, scheme, source.minimumLevel, limit);
  if (roots === undefined) {
    return undefined;
  }
  const leaves = new Map(roots.map((tile) => [tile.key, tile]));
  const queue = [];
  function enqueue(tile) {
    const error = screenSpaceError(frameState, tile, maximumDistance);
    // Use the same strict refinement threshold as planar imagery and terrain.
    if (tile.level < source.maximumLevel && error > 2) {
      queue.push({ tile, error });
    }
  }
  roots.forEach(enqueue);
  while (queue.length > 0) {
    queue.sort((a, b) => b.error - a.error || compareTiles(a.tile, b.tile));
    const { tile } = queue.shift();
    const children = [];
    const level = tile.level + 1;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const x = tile.x * 2 + dx;
        const y = tile.y * 2 + dy;
        const bounds = scheme.tileXYToExtent(x, y, level);
        if (visible(frameState, bounds)) {
          children.push({ x, y, level, bounds, key: `${level}/${x}/${y}` });
        }
      }
    }
    // Replace the complete visible sibling set or retain the parent. Budget
    // pressure must never remove coverage or coarsen the entire foreground.
    if (leaves.size - 1 + children.length > limit) {
      continue;
    }
    leaves.delete(tile.key);
    for (const child of children) {
      leaves.set(child.key, child);
      enqueue(child);
    }
  }
  return [...leaves.values()].sort(
    (a, b) =>
      screenSpaceError(frameState, b, maximumDistance) -
        screenSpaceError(frameState, a, maximumDistance) || compareTiles(a, b),
  );
}

/** Bounded, coordinate-neutral planar view selection independent of terrain tiles. @private */
const SceneGISVectorTileCover = {};

SceneGISVectorTileCover.computeZoom = function (frameState, rootWidth) {
  const camera = frameState.camera;
  const position = camera.positionWC;
  const direction = camera.directionWC;
  if (
    position.z === 0 ||
    direction.z === 0 ||
    position.z * direction.z >= 0 ||
    frameState.context.drawingBufferHeight === 0 ||
    frameState.context.drawingBufferWidth === 0
  ) {
    return undefined;
  }
  // Measure at the forward reference-plane target. The point directly below
  // the camera has a different eye depth when pitched (sin(pitch)^2 as large).
  const distance = -position.z / direction.z;
  // The eye distance is already known. A round trip through a large world-space
  // target and Camera.getPixelSize adds translation/heading roundoff to zoom.
  const pixelSize = camera.frustum.getPixelDimensions(
    frameState.context.drawingBufferWidth,
    frameState.context.drawingBufferHeight,
    distance,
    frameState.pixelRatio,
    scratchPixelSize,
  );
  const zoom = SceneGISVectorTileCoordinates.computeStyleZoom(
    rootWidth,
    Math.max(pixelSize.x, pixelSize.y),
  );
  // Mercator camera subtraction can turn an exact z16 orbit into 15.9999999999999,
  // changing integer layout and minzoom gates without an actual zoom gesture.
  const integer = Math.round(zoom);
  return Math.abs(zoom - integer) < 1e-10 ? integer : zoom;
};

SceneGISVectorTileCover.select = function (
  frameState,
  source,
  limit,
  maximumTiltedTileDistance = Infinity,
) {
  const tiles = selectAdaptive(
    frameState,
    source,
    limit,
    maximumTiltedTileDistance,
  );
  if (tiles !== undefined) {
    return tiles;
  }
  throw new DeveloperError(
    "The visible source cover at minimumLevel exceeds maximumVisibleTiles.",
  );
};

export default SceneGISVectorTileCover;

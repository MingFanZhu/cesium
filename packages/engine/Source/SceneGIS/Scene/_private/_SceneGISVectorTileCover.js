import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Intersect from "../../../Core/Intersect.js";
import Matrix3 from "../../../Core/Matrix3.js";
import OrientedBoundingBox from "../../../Core/OrientedBoundingBox.js";
import SceneGISVectorTileCoordinates from "../../Core/SceneGISVectorTileCoordinates.js";

const scratchSphere = new BoundingSphere(new Cartesian3(), 0);
const scratchBox = new OrientedBoundingBox();
const scratchScale = new Cartesian3();

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

/** Bounded, coordinate-neutral planar view selection independent of terrain tiles. @private */
const SceneGISVectorTileCover = {};

SceneGISVectorTileCover.computeZoom = function (frameState, rootWidth) {
  const position = frameState.camera.positionWC;
  if (
    position.z === 0 ||
    frameState.context.drawingBufferHeight === 0 ||
    frameState.context.drawingBufferWidth === 0
  ) {
    return undefined;
  }
  Cartesian3.fromElements(position.x, position.y, 0, scratchSphere.center);
  const metersPerPixel =
    frameState.camera.getPixelSize(
      scratchSphere,
      frameState.context.drawingBufferWidth,
      frameState.context.drawingBufferHeight,
    ) * frameState.pixelRatio;
  return SceneGISVectorTileCoordinates.computeStyleZoom(
    rootWidth,
    metersPerPixel,
  );
};

SceneGISVectorTileCover.select = function (frameState, source, zoom, limit) {
  let level = Math.max(
    source.minimumLevel,
    Math.min(source.maximumLevel, Math.floor(zoom)),
  );
  while (level >= source.minimumLevel) {
    const tiles = selectLevel(frameState, source.tilingScheme, level, limit);
    if (tiles !== undefined) {
      return tiles;
    }
    level--;
  }
  throw new DeveloperError(
    "The visible source cover at minimumLevel exceeds maximumVisibleTiles.",
  );
};

export default SceneGISVectorTileCover;

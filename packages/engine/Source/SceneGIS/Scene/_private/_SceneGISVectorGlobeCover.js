import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Ellipsoid from "../../../Core/Ellipsoid.js";
import Intersect from "../../../Core/Intersect.js";
import IntersectionTests from "../../../Core/IntersectionTests.js";
import EllipsoidalOccluder from "../../../Core/EllipsoidalOccluder.js";
import Rectangle from "../../../Core/Rectangle.js";
import Ray from "../../../Core/Ray.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import TileBoundingRegion from "../../../Scene/TileBoundingRegion.js";
import Coordinates from "../../Core/_private/_SceneGISVectorGlobeCoordinates.js";

const pixelSize = new Cartesian2();
const point = new Cartesian3();
const ray = new Ray();
const ellipsoid = Ellipsoid.WGS84;
const scaledOrigin = new Cartesian3();
const scaledDirection = new Cartesian3();

function region(bounds, heights) {
  return new TileBoundingRegion({
    rectangle: Coordinates.rectangle(bounds),
    minimumHeight: heights.x,
    maximumHeight: heights.y,
    ellipsoid,
  });
}

function computeZoom(layer, frameState) {
  const camera = frameState.camera;
  const context = frameState.context;
  if (!context.drawingBufferWidth || !context.drawingBufferHeight) {
    return undefined;
  }
  Cartesian3.clone(camera.positionWC, ray.origin);
  Cartesian3.clone(camera.directionWC, ray.direction);
  const intersection = IntersectionTests.rayEllipsoid(ray, ellipsoid);
  let distance = intersection?.start;
  if (distance > 0) {
    Ray.getPoint(ray, distance, point);
  } else {
    // Continue the surface reference across the ellipsoid tangent. The nearest
    // point of the forward scaled ray converges to the same tangent point;
    // projecting it to the surface also preserves a real distance when facing
    // away from the globe. The camera's near plane is not a surface reference.
    ellipsoid.transformPositionToScaledSpace(ray.origin, scaledOrigin);
    ellipsoid.transformPositionToScaledSpace(ray.direction, scaledDirection);
    const closest = Math.max(
      0,
      -Cartesian3.dot(scaledOrigin, scaledDirection) /
        Cartesian3.magnitudeSquared(scaledDirection),
    );
    Ray.getPoint(ray, closest, point);
    if (!ellipsoid.scaleToGeodeticSurface(point, point)) {
      return undefined;
    }
    distance = Cartesian3.distance(ray.origin, point);
  }
  const cartographic = ellipsoid.cartesianToCartographic(point);
  if (!cartographic) {
    return undefined;
  }
  camera.frustum.getPixelDimensions(
    context.drawingBufferWidth,
    context.drawingBufferHeight,
    distance,
    frameState.pixelRatio,
    pixelSize,
  );
  const latitude = Math.min(
    Math.abs(cartographic.latitude),
    Coordinates.latitude(Coordinates.halfWidth),
  );
  const sin = Math.sin(latitude);
  const metric =
    Math.cos(latitude) /
    Math.sqrt(1 - Coordinates.eccentricitySquared * sin * sin);
  const projectedPixelSize = Math.max(pixelSize.x, pixelSize.y) / metric;
  layer._referenceDepth = distance;
  const zoom = Math.log2(
    (2 * Coordinates.halfWidth) / (512 * projectedPixelSize),
  );
  // ECEF orbit roundoff changes a fixed fractional zoom by ~1e-12, invalidating
  // style and glyph-world-geometry caches every frame. Canonicalize only this
  // numerical noise, with the same 1e-10 precision as the integer zoom boundary.
  return Math.round(zoom * 1e10) / 1e10;
}

function select(layer, frameState, source) {
  const scheme = source.tilingScheme,
    limit = layer._maximumVisibleTiles;
  const heights = layer._globeSelectionHeights;
  const cache = (layer._globeCoverCache ??= new Map());
  const occluder = new EllipsoidalOccluder(
    ellipsoid,
    frameState.camera.positionWC,
  );
  function tile(x, y, level) {
    const key = `${level}/${x}/${y}`;
    let item = cache.get(key);
    if (
      !item ||
      item.globeRegion.minimumHeight !== heights.x ||
      item.globeRegion.maximumHeight !== heights.y
    ) {
      const bounds = scheme.tileXYToExtent(x, y, level);
      item = { x, y, level, key, bounds, globeRegion: region(bounds, heights) };
      const volume = item.globeRegion;
      // A bounding sphere lifts a wide tile far above the actual surface and
      // keeps fully hidden terrain alive. Test the geographic height envelope.
      // Hemispheric/root bounds have no meaningful single occlusion point.
      if (
        Cartesian3.magnitude(volume.boundingSphere.center) >
        ellipsoid.minimumRadius * 0.1
      ) {
        item.horizonPoint =
          occluder.computeHorizonCullingPointPossiblyUnderEllipsoid(
            volume.boundingSphere.center,
            Rectangle.subsample(volume.rectangle, ellipsoid, heights.y),
            heights.x,
          );
      }
      cache.set(key, item);
    }
    item.lastFrame = frameState.frameNumber;
    const volume = item.globeRegion;
    if (
      frameState.cullingVolume.computeVisibility(volume.boundingVolume) ===
        Intersect.OUTSIDE ||
      (item.horizonPoint &&
        !occluder.isScaledSpacePointVisiblePossiblyUnderEllipsoid(
          item.horizonPoint,
          heights.x,
        ))
    ) {
      return undefined;
    }
    const distance = Math.max(1, volume.distanceToCamera(frameState));
    const latitude = (volume.rectangle.north + volume.rectangle.south) * 0.5;
    const error = (item.bounds.width * Math.cos(latitude)) / 512;
    frameState.camera.frustum.getPixelDimensions(
      frameState.context.drawingBufferWidth,
      frameState.context.drawingBufferHeight,
      distance,
      frameState.pixelRatio,
      pixelSize,
    );
    item.error = error / Math.max(pixelSize.x, pixelSize.y);
    return item;
  }
  const roots = [],
    stack = [[0, 0, 0]];
  while (stack.length) {
    const item = tile(...stack.pop());
    if (!item) {
      continue;
    }
    if (item.level === source.minimumLevel) {
      roots.push(item);
      if (roots.length > limit) {
        throw new DeveloperError(
          "The visible source cover at minimumLevel exceeds maximumVisibleTiles.",
        );
      }
    } else {
      for (let y = 1; y >= 0; y--) {
        for (let x = 1; x >= 0; x--) {
          stack.push([item.x * 2 + x, item.y * 2 + y, item.level + 1]);
        }
      }
    }
  }
  const leaves = new Map(roots.map((item) => [item.key, item]));
  const queue = roots.slice();
  const compare = (a, b) =>
    b.error - a.error || a.level - b.level || a.y - b.y || a.x - b.x;
  while (queue.length) {
    queue.sort(compare);
    const item = queue.shift();
    if (item.error <= 2 || item.level >= source.maximumLevel) {
      continue;
    }
    const children = [];
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const child = tile(item.x * 2 + x, item.y * 2 + y, item.level + 1);
        if (child) {
          children.push(child);
        }
      }
    }
    if (leaves.size - 1 + children.length > limit) {
      continue;
    }
    leaves.delete(item.key);
    for (const child of children) {
      leaves.set(child.key, child);
      queue.push(child);
    }
  }
  for (const [key, item] of cache) {
    if (item.lastFrame !== frameState.frameNumber) {
      cache.delete(key);
    }
  }
  return [...leaves.values()].sort(compare);
}

/** Geographic bounds, horizon culling and bounded mixed-level vector selection. @private */
export default { region, computeZoom, select };

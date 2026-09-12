import Cartesian3 from "../../../Core/Cartesian3.js";
import defined from "../../../Core/defined.js";
import IntersectionTests from "../../../Core/IntersectionTests.js";
import Ray from "../../../Core/Ray.js";

const scratchLocalRay = new Ray();
const scratchVertex0 = new Cartesian3();
const scratchVertex1 = new Cartesian3();
const scratchVertex2 = new Cartesian3();

function getVertex(mesh, index, result) {
  const offset = index * 3;
  result.x = mesh.positions[offset];
  result.y = mesh.positions[offset + 1];
  result.z = mesh.positions[offset + 2];
  return result;
}

function interpolateTriangle(mesh, index0, index1, index2, x, y) {
  const positions = mesh.positions;
  const offset0 = index0 * 3;
  const offset1 = index1 * 3;
  const offset2 = index2 * 3;
  const x0 = positions[offset0];
  const y0 = positions[offset0 + 1];
  const x1 = positions[offset1];
  const y1 = positions[offset1 + 1];
  const x2 = positions[offset2];
  const y2 = positions[offset2 + 1];
  const denominator = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
  if (denominator === 0.0) {
    return undefined;
  }
  const weight0 = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / denominator;
  const weight1 = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / denominator;
  const weight2 = 1.0 - weight0 - weight1;
  const tolerance = 1.0e-12;
  if (weight0 < -tolerance || weight1 < -tolerance || weight2 < -tolerance) {
    return undefined;
  }
  return (
    mesh.referenceHeight +
    weight0 * positions[offset0 + 2] +
    weight1 * positions[offset1 + 2] +
    weight2 * positions[offset2 + 2]
  );
}

function getHeight(tile, content, x, y) {
  const mesh = content?.mesh;
  if (!defined(mesh)) {
    return undefined;
  }
  const extent = tile.extent;
  if (
    x < extent.minimumX ||
    x > extent.maximumX ||
    y < extent.minimumY ||
    y > extent.maximumY
  ) {
    return undefined;
  }

  const localX = (x - (extent.minimumX + extent.width * 0.5)) / extent.width;
  const localY = (y - (extent.minimumY + extent.height * 0.5)) / extent.height;
  if (Number.isInteger(mesh.queryGridDimension)) {
    const dimension = mesh.queryGridDimension;
    const cellX = Math.min(
      dimension - 1,
      Math.max(0, Math.floor((localX + 0.5) * dimension)),
    );
    const cellY = Math.min(
      dimension - 1,
      Math.max(0, Math.floor((localY + 0.5) * dimension)),
    );
    const cell = cellY * dimension + cellX;
    const start = mesh.queryGridOffsets[cell];
    const end = mesh.queryGridOffsets[cell + 1];
    for (let i = start; i < end; ++i) {
      const offset = mesh.queryGridTriangles[i] * 3;
      const height = interpolateTriangle(
        mesh,
        mesh.indices[offset],
        mesh.indices[offset + 1],
        mesh.indices[offset + 2],
        localX,
        localY,
      );
      if (defined(height)) {
        return height;
      }
    }
    return undefined;
  }

  const columnCoordinate =
    ((x - extent.minimumX) / extent.width) * (mesh.width - 1);
  const rowCoordinate =
    ((extent.maximumY - y) / extent.height) * (mesh.height - 1);
  const idealColumn = Math.min(Math.floor(columnCoordinate), mesh.width - 2);
  const idealRow = Math.min(Math.floor(rowCoordinate), mesh.height - 2);
  const indices = mesh.indices;
  for (let rowOffset = -1; rowOffset <= 1; ++rowOffset) {
    const row = idealRow + rowOffset;
    if (row < 0 || row >= mesh.height - 1) {
      continue;
    }
    for (let columnOffset = -1; columnOffset <= 1; ++columnOffset) {
      const column = idealColumn + columnOffset;
      if (column < 0 || column >= mesh.width - 1) {
        continue;
      }
      const indexOffset = (row * (mesh.width - 1) + column) * 6;
      const height =
        interpolateTriangle(
          mesh,
          indices[indexOffset],
          indices[indexOffset + 1],
          indices[indexOffset + 2],
          localX,
          localY,
        ) ??
        interpolateTriangle(
          mesh,
          indices[indexOffset + 3],
          indices[indexOffset + 4],
          indices[indexOffset + 5],
          localX,
          localY,
        );
      if (defined(height)) {
        return height;
      }
    }
  }
  return undefined;
}

function updateSlab(origin, direction, minimum, maximum, interval) {
  if (direction === 0.0) {
    return origin >= minimum && origin <= maximum;
  }
  let near = (minimum - origin) / direction;
  let far = (maximum - origin) / direction;
  if (near > far) {
    const swap = near;
    near = far;
    far = swap;
  }
  interval.minimum = Math.max(interval.minimum, near);
  interval.maximum = Math.min(interval.maximum, far);
  return interval.minimum <= interval.maximum;
}

const scratchInterval = { minimum: 0.0, maximum: Number.POSITIVE_INFINITY };

function transformRay(tile, mesh, ray) {
  const extent = tile.extent;
  scratchLocalRay.origin.x =
    (ray.origin.x - (extent.minimumX + extent.width * 0.5)) / extent.width;
  scratchLocalRay.origin.y =
    (ray.origin.y - (extent.minimumY + extent.height * 0.5)) / extent.height;
  scratchLocalRay.origin.z = ray.origin.z - mesh.referenceHeight;
  scratchLocalRay.direction.x = ray.direction.x / extent.width;
  scratchLocalRay.direction.y = ray.direction.y / extent.height;
  scratchLocalRay.direction.z = ray.direction.z;
  return scratchLocalRay;
}

function intersectsMeshBounds(mesh, ray) {
  const interval = scratchInterval;
  interval.minimum = 0.0;
  interval.maximum = Number.POSITIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < mesh.surfaceVertexCount; ++i) {
    const z = mesh.positions[i * 3 + 2];
    minimumZ = Math.min(minimumZ, z);
    maximumZ = Math.max(maximumZ, z);
  }
  return (
    updateSlab(ray.origin.x, ray.direction.x, -0.5, 0.5, interval) &&
    updateSlab(ray.origin.y, ray.direction.y, -0.5, 0.5, interval) &&
    updateSlab(ray.origin.z, ray.direction.z, minimumZ, maximumZ, interval)
  );
}

function intersectTerrain(tile, content, ray) {
  const mesh = content.mesh;
  const localRay = transformRay(tile, mesh, ray);
  if (!intersectsMeshBounds(mesh, localRay)) {
    return undefined;
  }
  let nearest;
  for (let offset = 0; offset < mesh.surfaceIndexCount; offset += 3) {
    const t = IntersectionTests.rayTriangleParametric(
      localRay,
      getVertex(mesh, mesh.indices[offset], scratchVertex0),
      getVertex(mesh, mesh.indices[offset + 1], scratchVertex1),
      getVertex(mesh, mesh.indices[offset + 2], scratchVertex2),
      false,
    );
    if (defined(t) && t >= 0.0 && (!defined(nearest) || t < nearest)) {
      nearest = t;
    }
  }
  return nearest;
}

function intersectFlat(tile, ray) {
  if (ray.direction.z === 0.0) {
    return undefined;
  }
  const t = -ray.origin.z / ray.direction.z;
  if (!Number.isFinite(t) || t < 0.0) {
    return undefined;
  }
  const x = ray.origin.x + ray.direction.x * t;
  const y = ray.origin.y + ray.direction.y * t;
  const extent = tile.extent;
  return x >= extent.minimumX &&
    x <= extent.maximumX &&
    y >= extent.minimumY &&
    y <= extent.maximumY
    ? t
    : undefined;
}

function isCurrent(entry) {
  const activeContent = entry.tile.terrainEntry?.activeContent;
  return (
    !entry.tile.isDestroyed() &&
    activeContent === entry.content &&
    activeContent?.revision === entry.revision &&
    activeContent?.source === entry.source &&
    activeContent?.mesh === entry.mesh
  );
}

function pick(snapshot, count, ray, result) {
  let nearest;
  let nearestKey;
  let nearestIsFlat = false;
  for (let i = 0; i < count; ++i) {
    const entry = snapshot[i];
    if (!isCurrent(entry)) {
      continue;
    }
    const isFlat = entry.source === "FLAT";
    const t = isFlat
      ? intersectFlat(entry.tile, ray)
      : intersectTerrain(entry.tile, entry.content, ray);
    if (
      defined(t) &&
      (!defined(nearest) ||
        t < nearest ||
        (t === nearest && entry.key < nearestKey))
    ) {
      nearest = t;
      nearestKey = entry.key;
      nearestIsFlat = isFlat;
    }
  }
  if (!defined(nearest) || nearestIsFlat) {
    return undefined;
  }
  result = result ?? new Cartesian3();
  result.x = ray.origin.x + ray.direction.x * nearest;
  result.y = ray.origin.y + ray.direction.y * nearest;
  result.z = ray.origin.z + ray.direction.z * nearest;
  return result;
}

/** @private */
const SceneGISPlanarTerrainQuery = {
  getHeight: getHeight,
  pick: pick,
};

export default SceneGISPlanarTerrainQuery;

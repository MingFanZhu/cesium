import { outwardBounds } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianEncodingBounds.js";

export function emptyBounds() {
  return [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
}

export function extendPoint(bounds, x, y, z) {
  bounds[0] = Math.min(bounds[0], x);
  bounds[1] = Math.min(bounds[1], y);
  bounds[2] = Math.min(bounds[2], z);
  bounds[3] = Math.max(bounds[3], x);
  bounds[4] = Math.max(bounds[4], y);
  bounds[5] = Math.max(bounds[5], z);
}

export function unionBounds(target, source) {
  if (!source) {
    return target;
  }
  extendPoint(target, source[0], source[1], source[2]);
  extendPoint(target, source[3], source[4], source[5]);
  return target;
}

export function boundsForGaussianSet(data) {
  if (data.count <= 0) {
    throw new Error("Cannot compute bounds for an empty Gaussian payload");
  }
  const selectionBounds = emptyBounds();
  const strictBounds = emptyBounds();
  for (let index = 0; index < data.count; index++) {
    const position = index * 3;
    const covariance = index * 6;
    const x = data.position[position];
    const y = data.position[position + 1];
    const z = data.position[position + 2];
    extendPoint(selectionBounds, x, y, z);
    extendPoint(
      strictBounds,
      x - 3 * Math.sqrt(Math.max(0, data.covariance[covariance])),
      y - 3 * Math.sqrt(Math.max(0, data.covariance[covariance + 1])),
      z - 3 * Math.sqrt(Math.max(0, data.covariance[covariance + 2])),
    );
    extendPoint(
      strictBounds,
      x + 3 * Math.sqrt(Math.max(0, data.covariance[covariance])),
      y + 3 * Math.sqrt(Math.max(0, data.covariance[covariance + 1])),
      z + 3 * Math.sqrt(Math.max(0, data.covariance[covariance + 2])),
    );
  }
  return Object.freeze({
    selectionBounds: Object.freeze(outwardBounds(selectionBounds)),
    strictBounds: Object.freeze(outwardBounds(strictBounds)),
  });
}

export function boundsEdge(bounds) {
  return Math.max(
    bounds[3] - bounds[0],
    bounds[4] - bounds[1],
    bounds[5] - bounds[2],
  );
}

import { ellipsoidArea } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianMath.js";
import { emptyBounds, extendPoint } from "./bounds.js";
import { readCellRows } from "./prebuiltLodSource.js";

// This is a conservative geometric support-distance bound, not an image metric.
// Every encoded finest Gaussian contributes to a bin, including its coverage mass.
// A target anchor is always an actual supplied Gaussian, never a generated proxy.
const RESOLUTION = 32;
function binKey(position, cell, origin, options) {
  const xyz = position.map((v, c) =>
    Math.max(
      0,
      Math.min(
        RESOLUTION - 1,
        Math.floor(
          (RESOLUTION *
            (v +
              origin[c] -
              options.fixedGridOrigin[c] -
              cell.xyz[c] * options.cellSizeMeters[c])) /
            options.cellSizeMeters[c],
        ),
      ),
    ),
  );
  return xyz[0] + RESOLUTION * (xyz[1] + RESOLUTION * xyz[2]);
}

export async function createReferenceBins(cell, spool, origin, options) {
  const bins = new Map();
  let coverageMass = 0;
  cell.maxSupportRadius = 0;
  for await (const rows of readCellRows(cell, spool)) {
    for (const row of rows) {
      const mass = Math.max(
        Number.EPSILON,
        row.opacity * ellipsoidArea(row.scale, 0),
      );
      const key = binKey(row.position, cell, origin, options);
      let bin = bins.get(key);
      if (!bin) {
        bin = { bounds: emptyBounds(), radius: 0, mass: 0 };
        bins.set(key, bin);
      }
      extendPoint(bin.bounds, ...row.position);
      bin.radius = Math.max(bin.radius, 3 * Math.hypot(...row.scale));
      cell.maxSupportRadius = Math.max(cell.maxSupportRadius, bin.radius);
      bin.mass += mass;
      coverageMass += mass;
    }
  }
  return { bins: [...bins.values()], coverageMass };
}

function tree(points, depth = 0) {
  if (!points.length) {
    return undefined;
  }
  const axis = depth % 3;
  points.sort((a, b) => a.position[axis] - b.position[axis]);
  const mid = Math.floor(points.length / 2);
  return {
    point: points[mid],
    axis,
    left: tree(points.slice(0, mid), depth + 1),
    right: tree(points.slice(mid + 1), depth + 1),
  };
}

function nearest(node, position, best = { distance: Infinity }) {
  if (!node) {
    return best;
  }
  const distance = Math.hypot(
    ...position.map((v, c) => v - node.point.position[c]),
  );
  if (distance < best.distance) {
    best = { distance, point: node.point };
  }
  const delta = position[node.axis] - node.point.position[node.axis];
  best = nearest(delta < 0 ? node.left : node.right, position, best);
  if (Math.abs(delta) <= best.distance) {
    best = nearest(delta < 0 ? node.right : node.left, position, best);
  }
  return best;
}

export const ZERO_ERROR = Object.freeze({
  geometricError: 0,
  coverageWeightedP95Error: 0,
  coverageWeightedP99Error: 0,
});

export function maximumErrors(items) {
  return Object.fromEntries(
    Object.keys(ZERO_ERROR).map((key) => [
      key,
      items.reduce((maximum, item) => Math.max(maximum, item[key]), 0),
    ]),
  );
}

export async function measureImportedError(
  reference,
  target,
  spool,
  origin,
  options,
  previous,
) {
  const anchors = new Map();
  target.maxSupportRadius = 0;
  for await (const rows of readCellRows(target, spool)) {
    for (const row of rows) {
      target.maxSupportRadius = Math.max(
        target.maxSupportRadius,
        3 * Math.hypot(...row.scale),
      );
      const key = binKey(row.position, target, origin, options);
      if (!anchors.has(key)) {
        anchors.set(key, {
          position: row.position,
          radius: 3 * Math.hypot(...row.scale),
        });
      }
    }
  }
  const index = tree([...anchors.values()]);
  const weighted = reference.bins
    .map((bin) => {
      const center = [0, 1, 2].map(
        (c) => (bin.bounds[c] + bin.bounds[c + 3]) * 0.5,
      );
      const anchor = nearest(index, center).point;
      const distance = Math.hypot(
        ...[0, 1, 2].map((c) =>
          Math.max(
            Math.abs(bin.bounds[c] - anchor.position[c]),
            Math.abs(bin.bounds[c + 3] - anchor.position[c]),
          ),
        ),
      );
      return { mass: bin.mass, error: distance + bin.radius + anchor.radius };
    })
    .sort((a, b) => a.error - b.error);
  const totalMass = weighted.reduce((sum, item) => sum + item.mass, 0);
  let mass = 0,
    p95,
    p99;
  for (const item of weighted) {
    mass += item.mass;
    if (p95 === undefined && mass >= totalMass * 0.95) {
      p95 = item.error;
    }
    if (p99 === undefined && mass >= totalMass * 0.99) {
      p99 = item.error;
    }
  }
  return maximumErrors([
    previous,
    {
      geometricError: weighted.at(-1).error,
      coverageWeightedP95Error: p95,
      coverageWeightedP99Error: p99,
    },
  ]);
}

import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import EllipsoidGeodesic from "../../../Core/EllipsoidGeodesic.js";
import PolygonHierarchy from "../../../Core/PolygonHierarchy.js";
import WaterChart, { triangles } from "./_SceneGISWaterChart.js";
import { bounds, segments } from "./_SceneGISWaterMesh.js";

function values(input, count, name, positive) {
  const result =
    typeof input === "number"
      ? Array(count).fill(input)
      : Array.isArray(input)
        ? input.slice()
        : undefined;
  if (
    !result ||
    result.length !== count ||
    result.some((v) => !Number.isFinite(v) || (positive ? v <= 0 : v < 0))
  ) {
    throw new DeveloperError(
      `${name} requires a ${positive ? "positive" : "nonnegative"} finite number or one value per position.`,
    );
  }
  return result;
}
function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function overlaps(a, b) {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}
function checkRing(ring) {
  const edges = ring
    .map((a, index) => {
      const b = ring[(index + 1) % ring.length];
      return { a, b, index, bounds: bounds([a, b]) };
    })
    .sort((a, b) => a.bounds[0] - b.bounds[0]);
  // Sweep horizontal bounds before exact segment tests. Long, sampled centerlines
  // otherwise pay for every pair even when their reaches are far apart.
  for (let i = 0; i < edges.length; ++i) {
    const a = edges[i];
    for (
      let j = i + 1;
      j < edges.length && edges[j].bounds[0] <= a.bounds[2];
      ++j
    ) {
      const b = edges[j];
      const separation = Math.abs(a.index - b.index);
      if (
        separation === 1 ||
        separation === ring.length - 1 ||
        !overlaps(a.bounds, b.bounds)
      ) {
        continue;
      }
      if (
        cross(a.a, a.b, b.a) * cross(a.a, a.b, b.b) <= 0 &&
        cross(b.a, b.b, a.a) * cross(b.a, b.b, a.b) <= 0
      ) {
        throw new DeveloperError(
          "River corridor must not intersect or touch itself; reduce widths or edit the centerline.",
        );
      }
    }
  }
}
function clipTriangle(polygon, mask) {
  let output = polygon;
  for (let i = 0; i < 3 && output.length; ++i) {
    const a = mask[i],
      b = mask[(i + 1) % 3],
      input = output;
    output = [];
    for (let j = 0; j < input.length; ++j) {
      const p = input[j],
        q = input[(j + 1) % input.length];
      const cp = cross(a, b, p),
        cq = cross(a, b, q);
      if (cp >= 0) {
        output.push(p);
      }
      if (cp >= 0 !== cq >= 0) {
        const t = cp / (cp - cq);
        output.push(p.map((v, k) => v + (q[k] - v) * t));
      }
    }
  }
  return output;
}

/**
 * Directed, nonoverlapping corridor triangles carrying height, station, transverse
 * coordinate and speed. Clipping preserves source-reach interpolation through holes.
 * @private
 */
function SceneGISRiverGeometry(options, ellipsoid) {
  const positions = options.positions;
  if (!Array.isArray(positions) || positions.length < 2) {
    throw new DeveloperError(
      "A river requires at least two ordered positions.",
    );
  }
  const count = positions.length;
  const widths = values(options.widths, count, "widths", true);
  const speeds = values(options.speeds ?? 1, count, "speeds", false);
  const chart = new WaterChart(positions, ellipsoid);
  const points = positions.map((p) => chart.project(p));
  const directions = [],
    stations = [0];
  for (let i = 1; i < count; ++i) {
    const a = points[i - 1],
      b = points[i];
    const dx = b.x - a.x,
      dy = b.y - a.y,
      distance = Math.hypot(dx, dy);
    if (distance < 1e-6) {
      throw new DeveloperError(
        "Adjacent river positions must have distinct horizontal coordinates.",
      );
    }
    directions.push([dx / distance, dy / distance]);
    const length = ellipsoid
      ? new EllipsoidGeodesic(
          ellipsoid.cartesianToCartographic(positions[i - 1]),
          ellipsoid.cartesianToCartographic(positions[i]),
          ellipsoid,
        ).surfaceDistance
      : distance;
    stations.push(stations[i - 1] + length);
  }
  const left = [],
    right = [];
  // A fixed transverse scale keeps material coordinates continuous as width changes.
  const transverseScale = (widths.reduce((a, b) => a + b, 0) / count) * 0.5;
  for (let i = 0; i < count; ++i) {
    const before = directions[Math.max(0, i - 1)],
      after = directions[Math.min(count - 2, i)];
    const tx = before[0] + after[0],
      ty = before[1] + after[1],
      length = Math.hypot(tx, ty);
    if (length < 1e-6) {
      throw new DeveloperError(
        "River centerline must not reverse at a control point.",
      );
    }
    const nx = -ty / length,
      ny = tx / length;
    const p = points[i];
    const base = chart.position(p.x, p.y, p.z, new Cartesian3());
    const across = chart.position(p.x + nx, p.y + ny, p.z, new Cartesian3());
    const metric = Cartesian3.distance(base, across);
    const offset =
      (widths[i] * 0.5) / (metric * (nx * -after[1] + ny * after[0]));
    left.push([
      p.x + nx * offset,
      p.y + ny * offset,
      p.z,
      stations[i],
      transverseScale,
      speeds[i],
      tx / length,
      ty / length,
    ]);
    right.push([
      p.x - nx * offset,
      p.y - ny * offset,
      p.z,
      stations[i],
      -transverseScale,
      speeds[i],
      tx / length,
      ty / length,
    ]);
  }
  const ring = [...left, ...right.slice().reverse()];
  checkRing(ring);
  let polygons = [];
  for (let i = 0; i < count - 1; ++i) {
    const pair = [
      [left[i], right[i], right[i + 1]],
      [left[i], right[i + 1], left[i + 1]],
    ];
    if (pair.some((p) => cross(...p) <= 1e-8)) {
      throw new DeveloperError(
        "River cross-sections fold over; reduce widths or edit the centerline.",
      );
    }
    polygons.push(...pair);
  }
  const hierarchy = new PolygonHierarchy(
    ring.map((p) => new Cartesian3(p[0], p[1], p[2])),
  );
  const shores = segments(hierarchy);
  if (options.polygonHierarchy) {
    const mask = chart.projectHierarchy(options.polygonHierarchy, false, 0);
    const masks = triangles(mask).map((p) => ({ p, bounds: bounds(p) }));
    const clipped = [];
    for (const polygon of polygons) {
      const b = bounds(polygon);
      for (const maskTriangle of masks) {
        if (overlaps(b, maskTriangle.bounds)) {
          const p = clipTriangle(polygon, maskTriangle.p);
          if (
            p.length >= 3 &&
            p.some(
              (v, i) =>
                i > 0 && i + 1 < p.length && cross(p[0], v, p[i + 1]) > 1e-8,
            )
          ) {
            clipped.push(p);
          }
        }
      }
    }
    polygons = clipped;
    segments(mask, shores);
  }
  if (!polygons.length) {
    throw new DeveloperError(
      "The river boundary must intersect the authored corridor with nonzero area.",
    );
  }
  this.chart = chart;
  this.polygons = polygons;
  this.shores = shores;
  this.river = true;
}

export default SceneGISRiverGeometry;

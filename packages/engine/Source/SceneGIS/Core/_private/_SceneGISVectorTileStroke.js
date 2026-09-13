import BoundingSphere from "../../../Core/BoundingSphere.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";

function attribute(values, size, double = false) {
  return new GeometryAttribute({
    componentDatatype: double
      ? ComponentDatatype.DOUBLE
      : ComponentDatatype.FLOAT,
    componentsPerAttribute: size,
    values: double ? new Float64Array(values) : new Float32Array(values),
  });
}

function normal(a, b) {
  const x = b.x - a.x;
  const y = b.y - a.y;
  const length = Math.hypot(x, y);
  return [-y / length, x / length];
}

/**
 * Builds a continuous planar stroke strip, independently of Cesium polyline geometry.
 * Join classification follows the geometric approach discussed in ADR-0062.
 * Positions remain tile-local doubles; paint dimensions are CSS pixels.
 * @private
 */
function SceneGISVectorTileStroke(
  part,
  coordinates,
  closed,
  paint,
  layout,
  dash,
) {
  const width = paint["line-width"];
  if (width <= 0) {
    return undefined;
  }
  const points = [];
  for (let i = 0; i < part.length; i += 2) {
    const p = coordinates.toLocal(part[i], part[i + 1]);
    const previous = points[points.length - 1];
    if (previous === undefined || previous.x !== p.x || previous.y !== p.y) {
      points.push(p);
    }
  }
  if (closed && points.length > 1) {
    const last = points[points.length - 1];
    if (last.x === points[0].x && last.y === points[0].y) {
      points.pop();
    }
  }
  if (points.length < (closed ? 3 : 2)) {
    return undefined;
  }
  const distances = [0];
  const normals = [];
  const segmentCount = points.length - (closed ? 0 : 1);
  for (let i = 0; i < segmentCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    normals.push(normal(a, b));
    distances.push(distances[i] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = distances[distances.length - 1];
  const cap = layout["line-cap"] ?? "butt";
  const capCode = cap === "round" ? 2 : cap === "square" ? 1 : 0;
  const join = layout["line-join"] ?? "miter";
  const gap = paint["line-gap-width"] ?? 0;
  const blur = paint["line-blur"] ?? 0;
  const paintValues = [width, gap, paint["line-offset"] ?? 0, blur];
  const positions = [];
  const extrudes = [];
  const offsets = [];
  const metrics = [];
  const paints = [];
  const dashes = [];
  const ends = [];
  const indices = [];
  let left = -1;
  let right = -1;

  function vertex(
    point,
    extrusion,
    side,
    distance,
    offset,
    round = false,
    shift = 0,
  ) {
    const index = positions.length / 3;
    positions.push(point.x, point.y, 0);
    extrudes.push(...extrusion);
    offsets.push(...offset);
    metrics.push(round ? 1 : 0, side, distance, shift);
    paints.push(...paintValues);
    dashes.push(...dash);
    ends.push(closed ? -1 : total, capCode);
    if (left >= 0 && right >= 0) {
      indices.push(left, index, right);
    }
    if (side > 0) {
      left = index;
    } else {
      right = index;
    }
  }

  function pair(
    point,
    n,
    distance,
    endLeft = 0,
    endRight = 0,
    round = false,
    offset = n,
  ) {
    vertex(
      point,
      [n[0] + n[1] * endLeft, n[1] - n[0] * endLeft],
      1,
      distance,
      offset,
      round,
      endLeft,
    );
    vertex(
      point,
      [-n[0] + n[1] * endRight, -n[1] - n[0] * endRight],
      -1,
      distance,
      offset,
      round,
      endRight,
    );
  }

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const distance = distances[i];
    const incoming = normals[(i - 1 + normals.length) % normals.length];
    const outgoing = normals[i % normals.length];
    if (!closed && (i === 0 || i === points.length - 1)) {
      const start = i === 0;
      const n = start ? outgoing : incoming;
      const shift = start ? -1 : 1;
      if (!start) {
        pair(point, n, distance);
      }
      pair(point, n, distance, shift, shift, cap === "round");
      if (start) {
        pair(point, n, distance);
      }
      continue;
    }
    const dot = Math.max(
      -1,
      Math.min(1, incoming[0] * outgoing[0] + incoming[1] * outgoing[1]),
    );
    const sum = [incoming[0] + outgoing[0], incoming[1] + outgoing[1]];
    const sumLength = Math.hypot(...sum);
    const bisector = sumLength === 0 ? [0, 0] : sum.map((v) => v / sumLength);
    const length = sumLength === 0 ? Infinity : 2 / sumLength;
    const turn =
      incoming[0] * outgoing[1] - incoming[1] * outgoing[0] > 0 ? 1 : -1;
    let kind = join;
    const limit = join === "bevel" ? 1.05 : (layout["line-miter-limit"] ?? 2);
    if (kind === "round" && length < (layout["line-round-limit"] ?? 1.05)) {
      kind = "miter";
    }
    if (kind === "miter" && length > limit) {
      kind = "bevel";
    }
    if (kind === "bevel" && length < 1.05) {
      kind = "miter";
    }
    if (kind === "miter") {
      pair(
        point,
        bisector.map((v) => v * length),
        distance,
      );
    } else if (kind === "bevel" && length > 2) {
      // The intersection switches rails at a sharp reversal. Keep finite stations.
      const scale =
        2 / Math.hypot(incoming[0] - outgoing[0], incoming[1] - outgoing[1]);
      const diagonal = [
        -bisector[1] * scale * -turn,
        bisector[0] * scale * -turn,
      ];
      const n = sumLength === 0 ? incoming : diagonal;
      pair(point, n, distance);
      pair(
        point,
        n.map((v) => -v),
        distance,
      );
    } else if (kind === "round" && length > 2) {
      // Two circular end sections meet at a sharp corner without an infinite miter.
      pair(point, incoming, distance);
      pair(point, incoming, distance, 1, 1, true);
      pair(point, outgoing, distance, -1, -1, true);
      pair(point, outgoing, distance);
    } else {
      const tangent = -Math.sqrt(Math.max(0, length * length - 1));
      const endLeft = turn > 0 ? tangent : 0;
      const endRight = turn < 0 ? tangent : 0;
      const offset = bisector.map((v) => v * length);
      pair(point, incoming, distance, endLeft, endRight, false, offset);
      if (kind === "round") {
        const angle = Math.acos(dot);
        const radius = gap / 2 + width * (gap > 0 ? 1 : 0.5);
        // Bound round-join chord error to a quarter CSS pixel at the reference scale.
        const step =
          2 * Math.acos(1 - Math.min(0.25 / Math.max(radius, 0.25), 1));
        const count = Math.max(1, Math.ceil(angle / step));
        const side = -turn;
        const from = Math.atan2(incoming[1] * side, incoming[0] * side);
        for (let j = 1; j < count; j++) {
          const a = from + (turn * angle * j) / count;
          vertex(point, [Math.cos(a), Math.sin(a)], side, distance, offset);
        }
      }
      pair(point, outgoing, distance, -endLeft, -endRight, false, offset);
    }
  }
  if (closed) {
    // Finish at the first incoming station. Its join has already been emitted once.
    for (let i = 0; i < 2; i++) {
      vertex(
        points[0],
        extrudes.slice(i * 2, i * 2 + 2),
        i === 0 ? 1 : -1,
        total,
        offsets.slice(i * 2, i * 2 + 2),
        metrics[i * 4] === 1,
        metrics[i * 4 + 3],
      );
    }
  }
  return new Geometry({
    attributes: {
      position: attribute(positions, 3, true),
      lineExtrude: attribute(extrudes, 2),
      lineOffset: attribute(offsets, 2),
      lineMetrics: attribute(metrics, 4),
      linePaint: attribute(paints, 4),
      lineDash: attribute(dashes, 3),
      lineEnds: attribute(ends, 2),
    },
    indices: IndexDatatype.createTypedArray(positions.length / 3, indices),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions),
  });
}

export default SceneGISVectorTileStroke;

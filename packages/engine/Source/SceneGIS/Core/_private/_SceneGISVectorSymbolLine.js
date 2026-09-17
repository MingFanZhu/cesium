function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function path(points) {
  const vertices = [],
    distances = [];
  let length = 0;
  for (const point of points) {
    const step = vertices.length
      ? distance(vertices[vertices.length - 1], point)
      : 0;
    if (vertices.length && step === 0) {
      continue;
    }
    length += step;
    vertices.push(point);
    distances.push(length);
  }
  return { points: vertices, distances, length };
}

function sample(line, station) {
  if (line.points.length < 2 || station < 0 || station > line.length) {
    return undefined;
  }
  let low = 0,
    high = line.points.length - 2;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (line.distances[mid + 1] < station) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  const a = line.points[low],
    b = line.points[low + 1];
  const t =
    (station - line.distances[low]) /
    (line.distances[low + 1] - line.distances[low]);
  let angle = Math.atan2(b.y - a.y, b.x - a.x);
  const vertex = t === 0 ? low : t === 1 ? low + 1 : undefined;
  if (vertex > 0 && vertex < line.points.length - 1) {
    const before = line.points[vertex - 1],
      at = line.points[vertex],
      after = line.points[vertex + 1];
    const incoming = distance(before, at),
      outgoing = distance(at, after);
    // The bisector gives the same glyph orientation when a path is reversed.
    angle = Math.atan2(
      (at.y - before.y) / incoming + (after.y - at.y) / outgoing,
      (at.x - before.x) / incoming + (after.x - at.x) / outgoing,
    );
  }
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    angle,
    index: low,
    t,
  };
}

// Liang-Barsky clipping keeps separate parts when the polyline leaves a region.
function clip(points, bounds) {
  const result = [];
  let current;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    let start = 0,
      end = 1,
      outside = false;
    for (const [p, q] of [
      [-dx, a.x - bounds.minimumX],
      [dx, bounds.maximumX - a.x],
      [-dy, a.y - bounds.minimumY],
      [dy, bounds.maximumY - a.y],
    ]) {
      if (p === 0) {
        outside ||= q < 0;
      } else if (p < 0) {
        start = Math.max(start, q / p);
      } else {
        end = Math.min(end, q / p);
      }
    }
    if (outside || start >= end) {
      current = undefined;
      continue;
    }
    const first = { x: a.x + dx * start, y: a.y + dy * start };
    const last = { x: a.x + dx * end, y: a.y + dy * end };
    if (!current || distance(current[current.length - 1], first) > 0) {
      current = [first];
      result.push(current);
    }
    current.push(last);
    if (end < 1) {
      current = undefined;
    }
  }
  return result;
}

function anchors(line, spacing, placement) {
  if (line.points.length < 2) {
    return [];
  }
  if (placement === "line-center" || line.length < spacing) {
    return [line.length * 0.5];
  }
  const result = [];
  for (let station = spacing * 0.5; station < line.length; station += spacing) {
    result.push(station);
  }
  return result;
}

function corners(box, x = 0, y = 0, angle = 0, center = 0) {
  const cos = Math.cos(angle),
    sin = Math.sin(angle);
  return [
    [box[0], box[1]],
    [box[2], box[1]],
    [box[2], box[3]],
    [box[0], box[3]],
  ].map(([u, v]) => [
    x + (u - center) * cos - v * sin,
    y + (u - center) * sin + v * cos,
  ]);
}

function turn(line, start, end) {
  const first = sample(line, Math.min(start, end)),
    last = sample(line, Math.max(start, end));
  const a = line.points[first.index],
    b = line.points[first.index + 1];
  let sum = 0,
    angle = Math.atan2(b.y - a.y, b.x - a.x);
  for (let i = first.index + 1; i <= last.index; i++) {
    const a = line.points[i],
      b = line.points[i + 1];
    const next = Math.atan2(b.y - a.y, b.x - a.x);
    sum += Math.abs(Math.atan2(Math.sin(next - angle), Math.cos(next - angle)));
    angle = next;
  }
  return sum;
}

function bend(shape, line, station, flip, rotation, maxAngle) {
  if (!shape.quads.length) {
    return [];
  }
  const direction = flip ? -1 : 1;
  const span = shape.span ?? [shape.box[0], shape.box[2]];
  if (
    !sample(line, station + direction * span[0]) ||
    !sample(line, station + direction * span[1])
  ) {
    return undefined;
  }
  const result = [];
  let previous;
  for (const quad of shape.quads) {
    const center = quad.center ?? 0;
    const offset = station + direction * center;
    const point = sample(line, offset);
    if (
      !point ||
      (previous &&
        previous.row === quad.row &&
        turn(line, previous.offset, offset) > maxAngle)
    ) {
      return undefined;
    }
    result.push({
      ...quad,
      corners: corners(
        quad.box,
        point.x,
        point.y,
        point.angle + (flip ? Math.PI : 0) + rotation,
        center,
      ),
    });
    previous = { offset, row: quad.row };
  }
  return result;
}

/** Pure polyline metrics and glyph placement in a caller-selected label plane. @private */
const SceneGISVectorSymbolLine = { path, sample, clip, anchors, corners, bend };
export default SceneGISVectorSymbolLine;

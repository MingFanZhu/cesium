import Cartesian3 from "../../../Core/Cartesian3.js";
import IntersectionTests from "../../../Core/IntersectionTests.js";
import TerrainEncoding from "../../../Core/TerrainEncoding.js";
import Ray from "../../../Core/Ray.js";
import Ellipsoid from "../../../Core/Ellipsoid.js";
import Rectangle from "../../../Core/Rectangle.js";
import Coordinates from "./_SceneGISVectorGlobeCoordinates.js";

function build(parameters) {
  const encoding = TerrainEncoding.clone(parameters.encoding);
  const vertices = parameters.vertices,
    indices = parameters.indices;
  const center = parameters.center;
  const count = vertices.length / encoding.stride;
  const positions = new Float64Array(count * 3);
  const point = new Cartesian3();
  for (let i = 0; i < count; i++) {
    encoding.getExaggeratedPosition(vertices, i, point);
    positions[i * 3] = point.x - center.x;
    positions[i * 3 + 1] = point.y - center.y;
    positions[i * 3 + 2] = point.z - center.z;
  }
  const order = Array.from({ length: indices.length / 3 }, (_, i) => i);
  const bounds = [],
    nodes = [];
  function branch(first, last) {
    const node = nodes.length / 4;
    nodes.push(-1, -1, first, last - first);
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (let i = first; i < last; i++) {
      for (let j = 0; j < 3; j++) {
        const offset = indices[order[i] * 3 + j] * 3;
        for (let axis = 0; axis < 3; axis++) {
          lo[axis] = Math.min(lo[axis], positions[offset + axis]);
          hi[axis] = Math.max(hi[axis], positions[offset + axis]);
        }
      }
    }
    bounds.push(...lo, ...hi);
    if (last - first > 8) {
      let axis = 0;
      for (let i = 1; i < 3; i++) {
        if (hi[i] - lo[i] > hi[axis] - lo[axis]) {
          axis = i;
        }
      }
      const coordinate = (triangle) =>
        positions[indices[triangle * 3] * 3 + axis] +
        positions[indices[triangle * 3 + 1] * 3 + axis] +
        positions[indices[triangle * 3 + 2] * 3 + axis];
      const sorted = order
        .slice(first, last)
        .sort((a, b) => coordinate(a) - coordinate(b));
      for (let i = 0; i < sorted.length; i++) {
        order[first + i] = sorted[i];
      }
      const middle = (first + last) >>> 1;
      nodes[node * 4] = branch(first, middle);
      nodes[node * 4 + 1] = branch(middle, last);
    }
    return node;
  }
  branch(0, order.length);
  return {
    positions,
    indices,
    center,
    bounds: new Float64Array(bounds),
    nodes: new Int32Array(nodes),
    order: new Uint32Array(order),
  };
}

const ray = new Ray();
const a = new Cartesian3(),
  b = new Cartesian3(),
  c = new Cartesian3();

function intersect(data, origin, direction) {
  Cartesian3.subtract(origin, data.center, ray.origin);
  Cartesian3.clone(direction, ray.direction);
  const stack = [0];
  let closest = Infinity;
  while (stack.length) {
    const node = stack.pop(),
      offset = node * 6;
    let near = 0,
      far = closest;
    for (let axis = 0; axis < 3; axis++) {
      const key = axis === 0 ? "x" : axis === 1 ? "y" : "z";
      const o = ray.origin[key],
        d = ray.direction[key];
      const lo = data.bounds[offset + axis],
        hi = data.bounds[offset + axis + 3];
      if (d === 0) {
        if (o < lo || o > hi) {
          far = -1;
          break;
        }
      } else {
        const t0 = (lo - o) / d,
          t1 = (hi - o) / d;
        near = Math.max(near, Math.min(t0, t1));
        far = Math.min(far, Math.max(t0, t1));
      }
    }
    if (near > far) {
      continue;
    }
    const n = node * 4;
    if (data.nodes[n] >= 0) {
      stack.push(data.nodes[n], data.nodes[n + 1]);
      continue;
    }
    const first = data.nodes[n + 2],
      last = first + data.nodes[n + 3];
    for (let i = first; i < last; i++) {
      const triangle = data.order[i] * 3;
      Cartesian3.fromArray(data.positions, data.indices[triangle] * 3, a);
      Cartesian3.fromArray(data.positions, data.indices[triangle + 1] * 3, b);
      Cartesian3.fromArray(data.positions, data.indices[triangle + 2] * 3, c);
      const t = IntersectionTests.rayTriangleParametric(ray, a, b, c, false);
      if (t !== undefined && t >= 0) {
        closest = Math.min(closest, t);
      }
    }
  }
  return closest === Infinity ? undefined : closest;
}

const sample = new Cartesian3();
const downward = new Cartesian3();

function height(entries, x, y) {
  const ll = Coordinates.cartographic(x, y);
  ll.longitude = Math.atan2(Math.sin(ll.longitude), Math.cos(ll.longitude));
  for (const entry of entries) {
    if (!Rectangle.contains(entry.rectangle, ll)) {
      continue;
    }
    entry.needed = true;
    if (!entry.result) {
      continue;
    }
    ll.height = entry.height;
    Ellipsoid.WGS84.cartographicToCartesian(ll, sample);
    Ellipsoid.WGS84.geodeticSurfaceNormalCartographic(ll, downward);
    Cartesian3.negate(downward, downward);
    const distance = intersect(entry.result, sample, downward);
    if (distance !== undefined) {
      return entry.height - distance;
    }
    // Quantized shared edges may be owned by either adjacent mesh.
  }
  return 0;
}

/** Worker-built surface-only BVH with exact CPU ray/triangle queries. @private */
export default { build, intersect, height };

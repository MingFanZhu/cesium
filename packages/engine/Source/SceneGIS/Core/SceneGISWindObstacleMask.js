import Cartesian3 from "../../Core/Cartesian3.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Matrix4 from "../../Core/Matrix4.js";
import model from "./_private/_SceneGISWindModel.js";

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function onSegment(a, b, p) {
  return (
    cross(a, b, p) === 0 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}
function intersects(a, b, c, d) {
  const abC = cross(a, b, c),
    abD = cross(a, b, d),
    cdA = cross(c, d, a),
    cdB = cross(c, d, b);
  return (
    (abC > 0 !== abD > 0 && cdA > 0 !== cdB > 0) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
function inside(points, p) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[j],
      b = points[i];
    if (onSegment(a, b, p)) {
      return true;
    }
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    ) {
      result = !result;
    }
  }
  return result;
}
function validatePolygon(polygon) {
  const p = polygon.positions;
  if (
    !Array.isArray(p) ||
    p.length < 3 ||
    p.some((v) => !Number.isFinite(v?.x) || !Number.isFinite(v?.y)) ||
    !Number.isFinite(polygon.minimumHeight) ||
    !Number.isFinite(polygon.maximumHeight) ||
    polygon.maximumHeight <= polygon.minimumHeight ||
    polygon.holes !== undefined
  ) {
    throw new DeveloperError(
      "Each obstacle requires a simple Cartesian2 ring and finite minimumHeight < maximumHeight; holes are unsupported.",
    );
  }
  let area = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i],
      b = p[(i + 1) % p.length];
    if (a.x === b.x && a.y === b.y) {
      throw new DeveloperError(
        "Polygon edges must have positive length; do not repeat the closing vertex.",
      );
    }
    area += a.x * b.y - b.x * a.y;
    for (let j = i + 1; j < p.length; j++) {
      if (j === (i + 1) % p.length || (j + 1) % p.length === i) {
        continue;
      }
      if (intersects(a, b, p[j], p[(j + 1) % p.length])) {
        throw new DeveloperError(
          "Obstacle polygons must not self-intersect or touch themselves.",
        );
      }
    }
  }
  if (area === 0) {
    throw new DeveloperError("Obstacle polygons must have nonzero area.");
  }
  model.rigid(polygon.modelMatrix ?? Matrix4.IDENTITY);
}

/**
 * Deterministic, explicit preprocessing of static obstacles for a local wind grid.
 * Does not read scene objects, terrain, screen depth or private model geometry.
 * @namespace SceneGISWindObstacleMask
 */
const SceneGISWindObstacleMask = {};

/**
 * A closed prism defined in its own local meters. Ring may be concave, clockwise or counterclockwise.
 * @typedef {object} SceneGISWindObstacleMask.ExtrudedPolygon
 * @property {Cartesian2[]} positions Simple XY outer ring without repeated closing vertex or holes.
 * @property {number} minimumHeight Bottom local Z in meters.
 * @property {number} maximumHeight Top local Z in meters.
 * @property {Matrix4} [modelMatrix=Matrix4.IDENTITY] Rigid geometry-local to simulation-local transform.
 */

/**
 * Fill cells whose centers lie inside any transformed prism (union). Centers on the closed
 * boundary count as solid. This is center sampling, not conservative triangle coverage; features
 * thinner than a cell can be missed. Use finer grids or supply an explicitly voxelized mask.
 * Preprocessing is synchronous, limited to each prism's transformed bounding box. Geometry is
 * read only during this call. The returned array is caller-owned; simulation copies its input.
 * @param {object} options Grid and explicit geometry.
 * @param {Cartesian3} options.dimensions Integer cell counts >=4; product <=2097152.
 * @param {number} options.cellSize Cubic width in meters.
 * @param {Cartesian3} [options.minimum=Cartesian3.ZERO] Simulation-local minimum in meters.
 * @param {SceneGISWindObstacleMask.ExtrudedPolygon[]} options.polygons Static closed prisms.
 * @param {number} [options.groundHeight] Optional horizontal solid half-space below this simulation-local Z.
 * @returns {Uint8Array} 0 fluid / 1 solid, x-fastest index x+nx*(y+ny*z).
 * @throws {DeveloperError} Invalid grid, simple polygon or rigid transform.
 */
SceneGISWindObstacleMask.fromExtrudedPolygons = function (options) {
  const n = options.dimensions;
  model.finiteVector("dimensions", n);
  const count = n.x * n.y * n.z;
  const dx = options.cellSize;
  const min = options.minimum ?? Cartesian3.ZERO;
  model.finiteVector("minimum", min);
  if (
    ![n.x, n.y, n.z].every((v) => Number.isInteger(v) && v >= 4) ||
    !Number.isSafeInteger(count) ||
    count > 2097152 ||
    !Number.isFinite(dx) ||
    dx <= 0 ||
    !Array.isArray(options.polygons) ||
    (options.groundHeight !== undefined &&
      !Number.isFinite(options.groundHeight))
  ) {
    throw new DeveloperError(
      "Invalid wind voxel grid or explicit polygons array.",
    );
  }
  options.polygons.forEach(validatePolygon);
  const result = new Uint8Array(count);
  if (options.groundHeight !== undefined) {
    for (let z = 0; z < n.z; z++) {
      if (min.z + (z + 0.5) * dx <= options.groundHeight) {
        result.fill(1, z * n.x * n.y, (z + 1) * n.x * n.y);
      }
    }
  }
  const local = new Cartesian3(),
    transformed = new Cartesian3();
  const low = new Cartesian3(),
    high = new Cartesian3();
  const point = new Cartesian3();
  for (const polygon of options.polygons) {
    const matrix = polygon.modelMatrix ?? Matrix4.IDENTITY;
    const inverse = Matrix4.inverseTransformation(matrix, new Matrix4());
    low.x = low.y = low.z = Infinity;
    high.x = high.y = high.z = -Infinity;
    for (const p of polygon.positions) {
      for (const z of [polygon.minimumHeight, polygon.maximumHeight]) {
        local.x = p.x;
        local.y = p.y;
        local.z = z;
        Matrix4.multiplyByPoint(matrix, local, transformed);
        Cartesian3.minimumByComponent(low, transformed, low);
        Cartesian3.maximumByComponent(high, transformed, high);
      }
    }
    for (const axis of ["x", "y", "z"]) {
      low[axis] = Math.max(0, Math.ceil((low[axis] - min[axis]) / dx - 0.5));
      high[axis] = Math.min(
        n[axis] - 1,
        Math.floor((high[axis] - min[axis]) / dx - 0.5),
      );
    }
    for (let z = low.z; z <= high.z; z++) {
      for (let y = low.y; y <= high.y; y++) {
        for (let x = low.x; x <= high.x; x++) {
          const index = x + n.x * (y + n.y * z);
          if (result[index]) {
            continue;
          }
          point.x = min.x + (x + 0.5) * dx;
          point.y = min.y + (y + 0.5) * dx;
          point.z = min.z + (z + 0.5) * dx;
          Matrix4.multiplyByPoint(inverse, point, local);
          if (
            local.z >= polygon.minimumHeight &&
            local.z <= polygon.maximumHeight &&
            inside(polygon.positions, local)
          ) {
            result[index] = 1;
          }
        }
      }
    }
  }
  return result;
};
export default SceneGISWindObstacleMask;

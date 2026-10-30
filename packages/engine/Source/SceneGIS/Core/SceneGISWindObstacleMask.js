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
 * 为局部风场格网确定性、显式预处理静态障碍。不读取场景对象、地形、屏幕深度或模型私有几何。
 * @namespace SceneGISWindObstacleMask
 */
const SceneGISWindObstacleMask = {};

/**
 * 以自身局部米制定义的闭合棱柱，环可为凹形、顺时针或逆时针。
 * @typedef {object} SceneGISWindObstacleMask.ExtrudedPolygon
 * @property {Cartesian2[]} positions 简单 XY 外环，不含重复闭合顶点或孔洞。
 * @property {number} minimumHeight 底部局部 Z，单位为米。
 * @property {number} maximumHeight 顶部局部 Z，单位为米。
 * @property {Matrix4} [modelMatrix=Matrix4.IDENTITY] 几何局部到模拟局部的刚体变换。
 */

/**
 * 填充格心位于任一已变换棱柱内部的单元，取并集。格心位于闭合边界也视为固体。这是格心采样，不是保守三角形覆盖；小于格宽的特征可能遗漏，应使用更细格网或显式体素掩码。预处理同步执行，限制在各棱柱变换后的包围盒内。几何仅在此调用期间读取。返回数组归调用方所有，模拟会复制输入。
 * @param {object} options 格网与显式几何。
 * @param {Cartesian3} options.dimensions 整数单元数须 >=4，总乘积 <=2097152。
 * @param {number} options.cellSize 立方格宽，单位为米。
 * @param {Cartesian3} [options.minimum=Cartesian3.ZERO] 模拟局部最小点，单位为米。
 * @param {SceneGISWindObstacleMask.ExtrudedPolygon[]} options.polygons 静态闭合棱柱。
 * @param {number} [options.groundHeight] 可选的水平固体半空间，位于此模拟局部 Z 以下。
 * @returns {Uint8Array} 0 为流体，1 为固体；X 最快，索引为 x+nx*(y+ny*z)。
 * @throws {DeveloperError} 格网、简单多边形或刚体变换无效。
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

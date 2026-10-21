import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import PolygonHierarchy from "../../../Core/PolygonHierarchy.js";
import PolygonPipeline from "../../../Core/PolygonPipeline.js";

const normalScratch = new Cartesian3();

/**
 * Fixed regional water coordinates. Planar coordinates remain metric XYZ; the
 * ellipsoid chart maps geodetic normals onto a common gnomonic tangent plane.
 * @private
 */
function SceneGISWaterChart(positions, ellipsoid) {
  this.ellipsoid = ellipsoid;
  this.radius = ellipsoid?.minimumRadius ?? 0;
  this.origin = Cartesian3.clone(positions[0]);
  this.up = new Cartesian3(0, 0, 1);
  this.east = new Cartesian3(1, 0, 0);
  this.north = new Cartesian3(0, 1, 0);
  if (!ellipsoid) {
    return;
  }
  Cartesian3.clone(Cartesian3.ZERO, this.up);
  for (const p of positions) {
    const c = cartographic(ellipsoid, p);
    Cartesian3.add(
      this.up,
      ellipsoid.geodeticSurfaceNormalCartographic(c, normalScratch),
      this.up,
    );
  }
  if (Cartesian3.magnitude(this.up) < 1e-8) {
    throw new DeveloperError("Water requires a regional hemisphere origin.");
  }
  Cartesian3.normalize(this.up, this.up);
  const axis =
    Math.abs(this.up.z) < 1 - 1e-12
      ? Cartesian3.UNIT_Z
      : Cartesian3.mostOrthogonalAxis(this.up, new Cartesian3());
  Cartesian3.normalize(Cartesian3.cross(axis, this.up, this.east), this.east);
  Cartesian3.cross(this.up, this.east, this.north);
}

function checkPosition(p) {
  if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) {
    throw new DeveloperError(
      "Water positions must be finite Cartesian3 values.",
    );
  }
}

function cartographic(ellipsoid, p) {
  checkPosition(p);
  const c = ellipsoid.cartesianToCartographic(p);
  if (!c) {
    throw new DeveloperError("Invalid ECEF water position.");
  }
  return c;
}

SceneGISWaterChart.prototype.project = function (p) {
  checkPosition(p);
  if (!this.ellipsoid) {
    return new Cartesian3(p.x - this.origin.x, p.y - this.origin.y, p.z);
  }
  const c = cartographic(this.ellipsoid, p);
  const n = this.ellipsoid.geodeticSurfaceNormalCartographic(c, normalScratch);
  const denominator = Cartesian3.dot(n, this.up);
  if (denominator <= 0 || c.height <= -this.radius) {
    throw new DeveloperError(
      "Water must fit the origin's open tangent hemisphere above the ellipsoid center.",
    );
  }
  return new Cartesian3(
    (this.radius * Cartesian3.dot(n, this.east)) / denominator,
    (this.radius * Cartesian3.dot(n, this.north)) / denominator,
    c.height,
  );
};

SceneGISWaterChart.prototype.normal = function (x, y, result) {
  if (!this.ellipsoid) {
    return Cartesian3.clone(Cartesian3.UNIT_Z, result);
  }
  result.x = this.up.x + (this.east.x * x + this.north.x * y) / this.radius;
  result.y = this.up.y + (this.east.y * x + this.north.y * y) / this.radius;
  result.z = this.up.z + (this.east.z * x + this.north.z * y) / this.radius;
  return Cartesian3.normalize(result, result);
};

SceneGISWaterChart.prototype.position = function (x, y, height, result) {
  if (!this.ellipsoid) {
    return Cartesian3.fromElements(
      x + this.origin.x,
      y + this.origin.y,
      height,
      result,
    );
  }
  const n = this.normal(x, y, normalScratch);
  const k = Cartesian3.multiplyComponents(
    this.ellipsoid.radiiSquared,
    n,
    result,
  );
  const gamma = Math.sqrt(Cartesian3.dot(n, k));
  result.x = k.x / gamma + n.x * height;
  result.y = k.y / gamma + n.y * height;
  result.z = k.z / gamma + n.z * height;
  return result;
};

SceneGISWaterChart.prototype.projectHierarchy = function (
  hierarchy,
  perPositionHeight = true,
  height = 0,
) {
  if (!hierarchy?.positions || hierarchy.positions.length < 3) {
    throw new DeveloperError(
      "polygonHierarchy requires at least three positions per ring.",
    );
  }
  const positions = hierarchy.positions.map((p) => {
    const projected = this.project(p);
    if (!perPositionHeight) {
      if (
        !Number.isFinite(height) ||
        (this.ellipsoid && height <= -this.radius)
      ) {
        throw new DeveloperError(
          "Water height must be finite and above the ellipsoid center.",
        );
      }
      projected.z = height;
    }
    return projected;
  });
  if (Cartesian3.equals(positions[0], positions[positions.length - 1])) {
    positions.pop();
  }
  if (positions.length < 3) {
    throw new DeveloperError("A water ring requires three distinct positions.");
  }
  return new PolygonHierarchy(
    positions,
    (hierarchy.holes ?? []).map((h) =>
      this.projectHierarchy(h, perPositionHeight, height),
    ),
  );
};

function triangles(hierarchy, result = []) {
  const positions = hierarchy.positions.slice();
  const holes = [];
  for (const hole of hierarchy.holes) {
    holes.push(positions.length);
    positions.push(...hole.positions);
    for (const island of hole.holes) {
      triangles(island, result);
    }
  }
  const indices = PolygonPipeline.triangulate(positions, holes);
  for (let i = 0; i < indices.length; i += 3) {
    const p = indices.slice(i, i + 3).map((j) => {
      const v = positions[j];
      return [v.x, v.y, v.z];
    });
    if (
      (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) -
        (p[1][1] - p[0][1]) * (p[2][0] - p[0][0]) <
      0
    ) {
      p.reverse();
    }
    result.push(p);
  }
  return result;
}

export { triangles };
export default SceneGISWaterChart;

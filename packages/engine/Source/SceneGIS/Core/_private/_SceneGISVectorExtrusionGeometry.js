import earcut from "earcut";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import BuildingMaterial from "./_SceneGISVectorBuildingMaterial.js";

function attribute(values, size, double = false) {
  return new GeometryAttribute({
    componentDatatype: double
      ? ComponentDatatype.DOUBLE
      : ComponentDatatype.FLOAT,
    componentsPerAttribute: size,
    values: double ? new Float64Array(values) : new Float32Array(values),
  });
}

/** Builds roofs and walls in projected tile coordinates in the vector Worker. @private */
function extrusionGeometry(feature, coordinates, paint, materials) {
  const base = Math.max(0, paint["fill-extrusion-base"]);
  const height = Math.max(0, paint["fill-extrusion-height"]);
  if (height <= base) {
    return undefined;
  }
  const positions = [],
    normals = [],
    anchors = [],
    data = [],
    gradients = [],
    patternCoordinates = [],
    materialCoordinates = [],
    indices = [];
  const patterned = paint["fill-extrusion-pattern"] !== undefined;
  const parts = feature.geometry.parts;
  const starts = feature.geometry.polygonStarts;
  const extent = coordinates._extent;
  for (let polygon = 0; polygon < starts.length; polygon++) {
    const rings = [];
    const end = starts[polygon + 1] ?? parts.length;
    for (let ring = starts[polygon]; ring < end; ring++) {
      const points = [];
      const part = parts[ring];
      for (let i = 0; i < part.length; i += 2) {
        const u = part[i],
          v = part[i + 1];
        const last = points[points.length - 1];
        if (!last || last.u !== u || last.v !== v) {
          const local = coordinates.toLocal(u, v);
          points.push({ u, v, x: local.x, y: local.y });
        }
      }
      const first = points[0],
        last = points[points.length - 1];
      if (points.length > 1 && first.u === last.u && first.v === last.v) {
        points.pop();
      }
      if (points.length >= 3) {
        rings.push(points);
      }
    }
    if (!rings.length) {
      continue;
    }
    const outer = rings[0];
    const cx = outer.reduce((sum, p) => sum + p.x, 0) / outer.length;
    const cy = outer.reduce((sum, p) => sum + p.y, 0) / outer.length;
    function vertex(point, z, normal, top, wall, distance = 0, tangent, start) {
      positions.push(point.x, point.y, z);
      normals.push(...normal);
      anchors.push(point.x, point.y);
      data.push(cx, cy, z, top);
      gradients.push(
        wall && paint["fill-extrusion-vertical-gradient"] ? 0.7 + 0.3 * top : 1,
      );
      if (patterned) {
        patternCoordinates.push(
          wall ? distance : point.x,
          wall ? z : point.y,
          wall ? 1 : 0,
        );
      }
      if (materials) {
        materialCoordinates.push(
          ...BuildingMaterial.coordinates(
            materials[wall ? 0 : 1],
            coordinates,
            point,
            z,
            wall ? tangent : undefined,
            start,
          ),
        );
      }
    }
    const roofStart = positions.length / 3;
    const xy = [],
      holes = [];
    for (let ring = 0; ring < rings.length; ring++) {
      if (ring > 0) {
        holes.push(xy.length / 2);
      }
      for (const point of rings[ring]) {
        xy.push(point.x, point.y);
        vertex(point, height, [0, 0, 1], 1, false);
      }
    }
    const triangles = earcut(xy, holes);
    for (let i = 0; i < triangles.length; i += 3) {
      const a = triangles[i],
        b = triangles[i + 1],
        c = triangles[i + 2];
      const area =
        (xy[b * 2] - xy[a * 2]) * (xy[c * 2 + 1] - xy[a * 2 + 1]) -
        (xy[b * 2 + 1] - xy[a * 2 + 1]) * (xy[c * 2] - xy[a * 2]);
      indices.push(
        roofStart + a,
        roofStart + (area > 0 ? b : c),
        roofStart + (area > 0 ? c : b),
      );
    }
    for (let ring = 0; ring < rings.length; ring++) {
      const points = rings[ring];
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        area += a.x * b.y - b.x * a.y;
      }
      const sign = (area > 0 ? 1 : -1) * (ring === 0 ? 1 : -1);
      let distance = 0;
      for (let i = 0; i < points.length; i++) {
        const a = points[i],
          b = points[(i + 1) % points.length];
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const start = distance;
        distance += length;
        // Tile clipping edges are not physical building walls, including MVT buffers.
        if (
          (a.u <= 0 && b.u <= 0) ||
          (a.u >= extent && b.u >= extent) ||
          (a.v <= 0 && b.v <= 0) ||
          (a.v >= extent && b.v >= extent)
        ) {
          continue;
        }
        const normal = [
          (sign * (b.y - a.y)) / length,
          (-sign * (b.x - a.x)) / length,
          0,
        ];
        const offset = positions.length / 3;
        const direction = b.x > a.x || (b.x === a.x && b.y > a.y) ? 1 : -1;
        const tangent = [
          (direction * (b.x - a.x)) / length,
          (direction * (b.y - a.y)) / length,
        ];
        vertex(a, base, normal, 0, true, start, tangent, a);
        vertex(b, base, normal, 0, true, distance, tangent, a);
        vertex(b, height, normal, 1, true, distance, tangent, a);
        vertex(a, height, normal, 1, true, start, tangent, a);
        for (const index of sign > 0
          ? [0, 1, 2, 0, 2, 3]
          : [0, 2, 1, 0, 3, 2]) {
          indices.push(offset + index);
        }
      }
    }
  }
  if (!indices.length) {
    return undefined;
  }
  return new Geometry({
    attributes: {
      position: attribute(positions, 3, true),
      normal: attribute(normals, 3),
      vectorAnchor: attribute(anchors, 2),
      extrusionData: attribute(data, 4),
      extrusionGradient: attribute(gradients, 1),
      ...(materials
        ? { materialCoordinate: attribute(materialCoordinates, 3) }
        : {}),
      ...(patterned
        ? { patternCoordinate: attribute(patternCoordinates, 3) }
        : {}),
    },
    indices: IndexDatatype.createTypedArray(positions.length / 3, indices),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromVertices(positions),
  });
}
export default extrusionGeometry;

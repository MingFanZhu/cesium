import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import GeometryAttributes from "../../../Core/GeometryAttributes.js";
import GeometryPipeline from "../../../Core/GeometryPipeline.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";

/**
 * Adds face-projected material inputs to an owned, local-DOUBLE triangle mesh.
 * Projection seams are intentional at dominant-axis boundaries. Color geometry
 * never enters this path. The input geometry and its buffers remain unmodified.
 * @private
 */
function createSceneGISPlanarMaterialGeometry(source, format, rotation = 0) {
  const positions = source.attributes.position.values;
  const sourceNormals = source.attributes.normal?.values;
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    minimum[axis] = Math.min(minimum[axis], positions[i]);
    maximum[axis] = Math.max(maximum[axis], positions[i]);
  }
  const values = [];
  const normals = [];
  const uv = [];
  const a = new Cartesian3();
  const b = new Cartesian3();
  const c = new Cartesian3();
  const ab = new Cartesian3();
  const ac = new Cartesian3();
  const normal = new Cartesian3();
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  for (let i = 0; i < source.indices.length; i += 3) {
    Cartesian3.unpack(positions, source.indices[i] * 3, a);
    Cartesian3.unpack(positions, source.indices[i + 1] * 3, b);
    Cartesian3.unpack(positions, source.indices[i + 2] * 3, c);
    Cartesian3.subtract(b, a, ab);
    Cartesian3.subtract(c, a, ac);
    Cartesian3.cross(ab, ac, normal);
    // Zero-height extrusion edges can legitimately produce zero-area sides.
    if (Cartesian3.magnitudeSquared(normal) === 0) {
      continue;
    }
    Cartesian3.normalize(normal, normal);
    const x = Math.abs(normal.x);
    const y = Math.abs(normal.y);
    const z = Math.abs(normal.z);
    const u = z >= x && z >= y ? 0 : x >= y ? 1 : 0;
    const v = z >= x && z >= y ? 1 : 2;
    const reverseU =
      z >= x && z >= y ? normal.z < 0 : x >= y ? normal.x < 0 : normal.y > 0;
    for (let j = 0; j < 3; j++) {
      const offset = source.indices[i + j] * 3;
      values.push(
        positions[offset],
        positions[offset + 1],
        positions[offset + 2],
      );
      if (format.normal) {
        normals.push(
          sourceNormals?.[offset] ?? normal.x,
          sourceNormals?.[offset + 1] ?? normal.y,
          sourceNormals?.[offset + 2] ?? normal.z,
        );
      }
      if (format.st) {
        let s =
          (positions[offset + u] - minimum[u]) / (maximum[u] - minimum[u]) -
          0.5;
        if (reverseU) {
          s = -s;
        }
        const t =
          (positions[offset + v] - minimum[v]) / (maximum[v] - minimum[v]) -
          0.5;
        uv.push(cosine * s - sine * t + 0.5, sine * s + cosine * t + 0.5);
      }
    }
  }
  const attributes = new GeometryAttributes({
    position: new GeometryAttribute({
      componentDatatype: ComponentDatatype.DOUBLE,
      componentsPerAttribute: 3,
      values: new Float64Array(values),
    }),
  });
  for (const [name, data, size] of [
    ["normal", normals, 3],
    ["st", uv, 2],
  ]) {
    if (data.length !== 0) {
      attributes[name] = new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: size,
        values: new Float32Array(data),
      });
    }
  }
  const count = values.length / 3;
  const indices = IndexDatatype.createTypedArray(count, count);
  for (let i = 0; i < count; i++) {
    indices[i] = i;
  }
  const geometry = new Geometry({
    attributes,
    indices,
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.clone(source.boundingSphere),
  });
  if (format.tangent || format.bitangent) {
    GeometryPipeline.computeTangentAndBitangent(geometry);
  }
  return geometry;
}

export default createSceneGISPlanarMaterialGeometry;

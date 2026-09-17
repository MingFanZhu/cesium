import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import GeometryInstance from "../../../Core/GeometryInstance.js";
import GeometryPipeline from "../../../Core/GeometryPipeline.js";
import packGround from "./_SceneGISVectorGroundGeometry.js";

function repeated(bytes, count) {
  const values = new Uint8Array(count * 4);
  for (let i = 0; i < values.length; i += 4) {
    values.set(bytes, i);
  }
  return new GeometryAttribute({
    componentDatatype: ComponentDatatype.UNSIGNED_BYTE,
    componentsPerAttribute: 4,
    normalize: true,
    values,
  });
}

/** CPU-only combination and precision encoding; pick tokens are resolved at upload. @private */
function prepareVectorBatch(item, allowPicking, ground = false) {
  const identities = [],
    indices = new Map();
  const copies = item.instances.map((instance) => {
    const input = instance.geometry;
    const count = input.attributes.position.values.length / 3;
    const attributes = {
      ...input.attributes,
      color: repeated(instance.attributes.color.value, count),
    };
    if (allowPicking) {
      let index = indices.get(instance.id);
      if (index === undefined) {
        index = identities.length;
        identities.push(instance.id);
        indices.set(instance.id, index);
      }
      attributes.pickColor = repeated(
        new Uint8Array(new Uint32Array([index]).buffer),
        count,
      );
    }
    return new GeometryInstance({
      geometry: new Geometry({
        attributes,
        indices: input.indices,
        primitiveType: input.primitiveType,
        boundingSphere: input.boundingSphere,
      }),
    });
  });
  const result = [];
  for (const geometry of GeometryPipeline.combineInstances(copies)) {
    for (const name of Object.keys(geometry.attributes)) {
      if (
        geometry.attributes[name].componentDatatype === ComponentDatatype.DOUBLE
      ) {
        GeometryPipeline.encodeAttribute(
          geometry,
          name,
          `${name}3DHigh`,
          `${name}3DLow`,
        );
      }
    }
    // Keep individual uploads bounded and usable without uint32 index support.
    for (const part of GeometryPipeline.fitToUnsignedShortIndices(geometry)) {
      // The splitting branch produces ordinary arrays, unlike the unsplit branch.
      if (!(part.indices instanceof Uint16Array)) {
        part.indices = new Uint16Array(part.indices);
      }
      for (const attribute of Object.values(part.attributes)) {
        if (!ArrayBuffer.isView(attribute.values)) {
          attribute.values = ComponentDatatype.createTypedArray(
            attribute.componentDatatype,
            attribute.values,
          );
        }
      }
      const packed =
        ground && item.kind !== "circle" && item.kind !== "fill-extrusion"
          ? packGround(part, item.kind, allowPicking)
          : undefined;
      const bytes = packed
        ? packed.vertices.byteLength + packed.triangles.byteLength
        : part.indices.byteLength +
          Object.values(part.attributes).reduce(
            (sum, attribute) => sum + attribute.values.byteLength,
            0,
          );
      let minimumHeight = 0,
        maximumHeight = 0;
      const extrusion = part.attributes.extrusionData?.values;
      for (let i = 2; i < (extrusion?.length ?? 0); i += 4) {
        minimumHeight = Math.min(minimumHeight, extrusion[i]);
        maximumHeight = Math.max(maximumHeight, extrusion[i]);
      }
      result.push({
        kind: item.kind,
        minimumHeight,
        maximumHeight,
        geometries: packed ? undefined : [part],
        ground: packed,
        identities,
        fringe: part.attributes.fringe !== undefined,
        uniformPaint: item.uniformPaint,
        dashIntervals: new Float32Array(item.dashIntervals ?? []),
        byteLength: bytes,
      });
    }
  }
  return result;
}
export default prepareVectorBatch;

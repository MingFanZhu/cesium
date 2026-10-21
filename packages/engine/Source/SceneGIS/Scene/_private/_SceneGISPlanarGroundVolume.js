import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import GeometryAttributes from "../../../Core/GeometryAttributes.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import Matrix4 from "../../../Core/Matrix4.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import SceneGISPlanarPolygonGeometry from "../../Core/SceneGISPlanarPolygonGeometry.js";

const MINIMUM_PADDING = 1.0;

function getEnvelope(world) {
  const provider = world.terrainProvider;
  const minimum = provider?.minimumHeight ?? 0.0;
  const maximum = provider?.maximumHeight ?? 0.0;
  const span = maximum - minimum;
  const padding = Math.max(MINIMUM_PADDING, span * 0.01);
  return {
    minimum: minimum - padding,
    maximum: maximum + padding,
  };
}

function getEnvelopeMatrix(world, origin, result) {
  const envelope = getEnvelope(world);
  const center = (envelope.minimum + envelope.maximum) * 0.5;
  const scale = envelope.maximum - envelope.minimum;
  Matrix4.fromTranslation(new Cartesian3(origin.x, origin.y, center), result);
  Matrix4.multiplyByScale(result, new Cartesian3(1.0, 1.0, scale), result);
  return envelope;
}

function addVertex(values, point, z, origin) {
  values.push(point.x - origin.x, point.y - origin.y, z);
  return values.length / 3 - 1;
}

function createPolygonVolume(geometry, batchOrigin) {
  const source = geometry._getDrapeSource();
  const origin = batchOrigin ?? source.origin;
  const values = [];
  const indices = [];
  const flattened = source.rings.flat();
  const extent = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const point of flattened) {
    extent.minX = Math.min(extent.minX, point.x);
    extent.minY = Math.min(extent.minY, point.y);
    extent.maxX = Math.max(extent.maxX, point.x);
    extent.maxY = Math.max(extent.maxY, point.y);
  }
  const extentValues = [];
  const bottom = new Array(flattened.length);
  const top = new Array(flattened.length);
  for (let i = 0; i < flattened.length; ++i) {
    bottom[i] = addVertex(values, flattened[i], -0.5, origin);
    top[i] = addVertex(values, flattened[i], 0.5, origin);
    for (let j = 0; j < 2; j++) {
      // Subtract world coordinates in DOUBLE before storing relative FLOAT data.
      extentValues.push(
        extent.minX - flattened[i].x,
        extent.minY - flattened[i].y,
        extent.maxX - extent.minX,
        extent.maxY - extent.minY,
      );
    }
  }
  for (let i = 0; i < source.topTriangles.length; i += 3) {
    const a = source.topTriangles[i];
    let b = source.topTriangles[i + 1];
    let c = source.topTriangles[i + 2];
    const pa = flattened[a];
    const pb = flattened[b];
    const pc = flattened[c];
    if ((pb.x - pa.x) * (pc.y - pa.y) - (pb.y - pa.y) * (pc.x - pa.x) < 0.0) {
      const swap = b;
      b = c;
      c = swap;
    }
    indices.push(top[a], top[b], top[c], bottom[a], bottom[c], bottom[b]);
  }
  let offset = 0;
  for (let r = 0; r < source.rings.length; r++) {
    const ring = source.rings[r];
    let area = 0.0;
    for (let i = 0; i < ring.length; ++i) {
      const next = ring[(i + 1) % ring.length];
      area +=
        (ring[i].x - ring[0].x) * (next.y - ring[0].y) -
        (next.x - ring[0].x) * (ring[i].y - ring[0].y);
    }
    for (let i = 0; i < ring.length; ++i) {
      const a = offset + i;
      const b = offset + ((i + 1) % ring.length);
      // Inner walls must face the hole, opposite to the outer boundary walls.
      if (area > 0.0 === (r === 0)) {
        indices.push(bottom[a], bottom[b], top[b], bottom[a], top[b], top[a]);
      } else {
        indices.push(bottom[a], top[b], bottom[b], bottom[a], top[a], top[b]);
      }
    }
    offset += ring.length;
  }
  return {
    values,
    indices,
    origin,
    extent,
    extentValues,
    footprintPoints: flattened,
  };
}

function joinNormal(ax, ay, bx, by) {
  const aLength = Math.hypot(ax, ay);
  const bLength = Math.hypot(bx, by);
  const x = (aLength === 0 ? 0 : ax / aLength) + bx / bLength;
  const y = (aLength === 0 ? 0 : ay / aLength) + by / bLength;
  const length = Math.hypot(x, y);
  // A reversal has no bisector; its segment keeps a perpendicular end cap.
  return length === 0 ? [bx / bLength, by / bLength] : [x / length, y / length];
}

function createPolylineVolume(geometry, batchOrigin) {
  const source = geometry._getDrapeSource();
  const origin = batchOrigin ?? source.origin;
  const values = [];
  const previousValues = [];
  const nextValues = [];
  const expandDirections = [];
  const segmentNormals = [];
  const segmentOffsets = [];
  const indices = [];
  // Inside-out winding matches the shadow-volume role used by Cesium's
  // GroundPolylineGeometry at the documented upstream baseline.
  const boxIndices = [
    0, 2, 1, 0, 3, 2, 0, 7, 3, 0, 4, 7, 0, 5, 4, 0, 1, 5, 5, 7, 4, 5, 6, 7, 5,
    2, 6, 5, 1, 2, 3, 6, 2, 3, 7, 6,
  ];
  const positions = source.positions;
  const last = positions.length - 1;
  const closed =
    positions[0].x === positions[last].x &&
    positions[0].y === positions[last].y;
  for (let i = 0; i < last; ++i) {
    const a = positions[i];
    const b = positions[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude === 0.0) {
      continue;
    }
    const start = values.length / 3;
    const endpoints = [a, b, b, a, a, b, b, a];
    const previous =
      i > 0 ? positions[i - 1] : closed ? positions[last - 1] : a;
    const next =
      i + 2 < positions.length ? positions[i + 2] : closed ? positions[1] : b;
    const startNormal = joinNormal(a.x - previous.x, a.y - previous.y, dx, dy);
    const endNormal = joinNormal(b.x - next.x, b.y - next.y, -dx, -dy);
    const previousPoints = [previous, a, a, previous, previous, a, a, previous];
    const nextPoints = [b, next, next, b, b, next, next, b];
    const sides = [1, 1, 1, 1, -1, -1, -1, -1];
    const heights = [-0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5];
    for (let vertex = 0; vertex < 8; ++vertex) {
      const z = heights[vertex];
      addVertex(values, endpoints[vertex], z, origin);
      // Subtract in CPU DOUBLE precision before storing origin-independent directions.
      previousValues.push(
        endpoints[vertex].x - previousPoints[vertex].x,
        endpoints[vertex].y - previousPoints[vertex].y,
      );
      nextValues.push(
        nextPoints[vertex].x - endpoints[vertex].x,
        nextPoints[vertex].y - endpoints[vertex].y,
      );
      expandDirections.push(sides[vertex]);
      segmentNormals.push(...startNormal, ...endNormal);
      segmentOffsets.push(
        a.x - endpoints[vertex].x,
        a.y - endpoints[vertex].y,
        b.x - endpoints[vertex].x,
        b.y - endpoints[vertex].y,
      );
    }
    for (const index of boxIndices) {
      indices.push(start + index);
    }
  }
  return {
    values,
    indices,
    origin,
    previousValues,
    nextValues,
    expandDirections,
    segmentNormals,
    segmentOffsets,
    width: source.width,
    footprintPoints: positions,
  };
}

function createPresentationBounds(points) {
  let minimumX = points[0].x;
  let minimumY = points[0].y;
  let maximumX = minimumX;
  let maximumY = minimumY;
  for (let i = 1; i < points.length; ++i) {
    const point = points[i];
    minimumX = Math.min(minimumX, point.x);
    minimumY = Math.min(minimumY, point.y);
    maximumX = Math.max(maximumX, point.x);
    maximumY = Math.max(maximumY, point.y);
  }
  const center = new Cartesian3(
    minimumX * 0.5 + maximumX * 0.5,
    minimumY * 0.5 + maximumY * 0.5,
    0.0,
  );
  let horizontalRadius = 0.0;
  for (const point of points) {
    horizontalRadius = Math.max(
      horizontalRadius,
      Math.hypot(point.x - center.x, point.y - center.y),
    );
  }
  return { center, horizontalRadius };
}

/**
 * Builds the stable coordinate-neutral volume consumed by planar classification.
 *
 * The z-fail command structure follows the algorithmic roles in Cesium's
 * ClassificationPrimitive and GroundPolylinePrimitive at upstream baseline
 * 6d5d8b1f0725b6f831b336463f4b11c98023427b. Recheck those sources when their
 * stencil masks, pass ordering, or shadow-volume shader contracts change.
 *
 * @private
 */
const SceneGISPlanarGroundVolume = {};

SceneGISPlanarGroundVolume.createPresentationBounds = function (geometry) {
  const source = geometry._getDrapeSource();
  const points =
    geometry instanceof SceneGISPlanarPolygonGeometry
      ? source.rings.flat()
      : source.positions;
  return createPresentationBounds(points);
};

SceneGISPlanarGroundVolume.create = function (
  world,
  geometry,
  batchOrigin,
  material = false,
) {
  const data =
    geometry instanceof SceneGISPlanarPolygonGeometry
      ? createPolygonVolume(geometry, batchOrigin)
      : createPolylineVolume(geometry, batchOrigin);
  const envelope = getEnvelope(world);
  const typedValues = new Float64Array(data.values);
  const points = new Array(typedValues.length / 3);
  for (let i = 0; i < points.length; ++i) {
    points[i] = Cartesian3.unpack(typedValues, i * 3, new Cartesian3());
  }
  const attributes = new GeometryAttributes({
    position: new GeometryAttribute({
      componentDatatype: ComponentDatatype.DOUBLE,
      componentsPerAttribute: 3,
      values: typedValues,
    }),
  });
  if (data.extentValues !== undefined) {
    attributes.groundExtents = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 4,
      values: new Float32Array(data.extentValues),
    });
  }
  if (material) {
    attributes.groundRotation = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 1,
      values: new Float32Array(points.length).fill(geometry.stRotation),
    });
  }
  if (data.nextValues !== undefined) {
    attributes.incomingDirection = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 2,
      values: new Float32Array(data.previousValues),
    });
    attributes.outgoingDirection = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 2,
      values: new Float32Array(data.nextValues),
    });
    attributes.expandDirection = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 1,
      values: new Float32Array(data.expandDirections),
    });
    attributes.lineWidth = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 1,
      values: new Float32Array(points.length).fill(data.width),
    });
    attributes.segmentNormals = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 4,
      values: new Float32Array(data.segmentNormals),
    });
    attributes.segmentOffsets = new GeometryAttribute({
      componentDatatype: ComponentDatatype.FLOAT,
      componentsPerAttribute: 4,
      values: new Float32Array(data.segmentOffsets),
    });
  }
  const raw = new Geometry({
    attributes,
    indices: IndexDatatype.createTypedArray(points.length, data.indices),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromPoints(points),
  });
  const modelMatrix = new Matrix4();
  getEnvelopeMatrix(world, data.origin, modelMatrix);
  return {
    geometry: raw,
    modelMatrix,
    envelope,
    origin: data.origin,
    width: data.width,
    extent: data.extent,
    presentationBounds: createPresentationBounds(data.footprintPoints),
  };
};

SceneGISPlanarGroundVolume.updatePresentationBoundingSphere = function (
  world,
  presentationBounds,
  result,
) {
  Cartesian3.clone(presentationBounds.center, result.center);
  result.center.z = world.getTerrainHeight(result.center) ?? 0.0;
  const envelope = getEnvelope(world);
  const verticalRadius = Math.max(
    Math.abs(envelope.minimum - result.center.z),
    Math.abs(envelope.maximum - result.center.z),
  );
  result.radius = Math.hypot(
    presentationBounds.horizontalRadius,
    verticalRadius,
  );
  return result;
};

SceneGISPlanarGroundVolume.updateEnvelope = function (
  world,
  origin,
  modelMatrix,
) {
  return getEnvelopeMatrix(world, origin, modelMatrix);
};

export default SceneGISPlanarGroundVolume;

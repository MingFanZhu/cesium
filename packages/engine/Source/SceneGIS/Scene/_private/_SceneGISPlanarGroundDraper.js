import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Geometry from "../../../Core/Geometry.js";
import GeometryAttribute from "../../../Core/GeometryAttribute.js";
import GeometryAttributes from "../../../Core/GeometryAttributes.js";
import HeightReference from "../../../Scene/HeightReference.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import PrimitiveType from "../../../Core/PrimitiveType.js";
import SceneGISPlanarPolygonGeometry from "../../Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolylineGeometry from "../../Core/SceneGISPlanarPolylineGeometry.js";

const EPSILON = 1.0e-12;

function cross(a, b, p) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function interpolate(a, b, t, result) {
  result.x = a.x + (b.x - a.x) * t;
  result.y = a.y + (b.y - a.y) * t;
  result.z = a.z + (b.z - a.z) * t;
  return result;
}

function finitePosition(x, y, z) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new DeveloperError("Derived ground geometry must be finite.");
  }
  return new Cartesian3(x, y, z);
}

function triangleHeight(triangle, x, y) {
  const a = triangle[0];
  const b = triangle[1];
  const c = triangle[2];
  const denominator = cross(a, b, c);
  if (!Number.isFinite(denominator) || denominator === 0.0) {
    throw new DeveloperError(
      "Ground surface triangles must be finite and nondegenerate.",
    );
  }
  const wb = ((x - a.x) * (c.y - a.y) - (y - a.y) * (c.x - a.x)) / denominator;
  const wc = ((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)) / denominator;
  const z = a.z + wb * (b.z - a.z) + wc * (c.z - a.z);
  if (!Number.isFinite(z)) {
    throw new DeveloperError("Derived ground heights must be finite.");
  }
  return z;
}

function applyReference(sourceZ, surfaceZ, reference) {
  if (reference === HeightReference.NONE) {
    return sourceZ;
  }
  if (reference === HeightReference.CLAMP_TO_GROUND) {
    return surfaceZ;
  }
  return surfaceZ + sourceZ;
}

function getGeometryBounds(geometry) {
  const source = geometry._getDrapeSource();
  const positions =
    geometry instanceof SceneGISPlanarPolylineGeometry
      ? source.positions
      : source.bottom === undefined
        ? source.top
        : [...source.top, ...source.bottom];
  const bounds = {
    minimumX: Number.POSITIVE_INFINITY,
    minimumY: Number.POSITIVE_INFINITY,
    maximumX: Number.NEGATIVE_INFINITY,
    maximumY: Number.NEGATIVE_INFINITY,
  };
  for (const position of positions) {
    bounds.minimumX = Math.min(bounds.minimumX, position.x);
    bounds.minimumY = Math.min(bounds.minimumY, position.y);
    bounds.maximumX = Math.max(bounds.maximumX, position.x);
    bounds.maximumY = Math.max(bounds.maximumY, position.y);
  }
  return bounds;
}

function boundsForPositions(positions) {
  const bounds = {
    minimumX: Number.POSITIVE_INFINITY,
    minimumY: Number.POSITIVE_INFINITY,
    maximumX: Number.NEGATIVE_INFINITY,
    maximumY: Number.NEGATIVE_INFINITY,
  };
  for (const position of positions) {
    bounds.minimumX = Math.min(bounds.minimumX, position.x);
    bounds.minimumY = Math.min(bounds.minimumY, position.y);
    bounds.maximumX = Math.max(bounds.maximumX, position.x);
    bounds.maximumY = Math.max(bounds.maximumY, position.y);
  }
  return bounds;
}

function intersectsBounds(bounds, extent) {
  return !(
    bounds.maximumX < extent.minimumX ||
    bounds.minimumX > extent.maximumX ||
    bounds.maximumY < extent.minimumY ||
    bounds.minimumY > extent.maximumY
  );
}

function meshVertex(entry, index) {
  const mesh = entry.mesh;
  const offset = index * 3;
  return finitePosition(
    (mesh.positions[offset] + 0.5) * entry.extent.width + entry.extent.minimumX,
    (mesh.positions[offset + 1] + 0.5) * entry.extent.height +
      entry.extent.minimumY,
    mesh.positions[offset + 2] + mesh.referenceHeight,
  );
}

function visitEntryTriangles(entry, bounds, visitor, debug) {
  const extent = entry.extent;
  if (!intersectsBounds(bounds, extent)) {
    return;
  }
  if (debug !== undefined) {
    ++debug.relevantEntries;
  }
  const mesh = entry.mesh;
  if (mesh === undefined) {
    const sw = finitePosition(extent.minimumX, extent.minimumY, 0.0);
    const se = finitePosition(extent.maximumX, extent.minimumY, 0.0);
    const nw = finitePosition(extent.minimumX, extent.maximumY, 0.0);
    const ne = finitePosition(extent.maximumX, extent.maximumY, 0.0);
    const flat = [
      [sw, se, ne],
      [sw, ne, nw],
    ];
    for (const triangle of flat) {
      if (debug !== undefined) {
        ++debug.visitedTriangles;
      }
      visitor(triangle);
    }
    return;
  }

  const columnScale = (mesh.width - 1) / extent.width;
  const rowScale = (mesh.height - 1) / extent.height;
  const minimumColumn = Math.max(
    0,
    Math.floor((bounds.minimumX - extent.minimumX) * columnScale) - 1,
  );
  const maximumColumn = Math.min(
    mesh.width - 2,
    Math.floor((bounds.maximumX - extent.minimumX) * columnScale) + 1,
  );
  const minimumRow = Math.max(
    0,
    Math.floor((extent.maximumY - bounds.maximumY) * rowScale) - 1,
  );
  const maximumRow = Math.min(
    mesh.height - 2,
    Math.floor((extent.maximumY - bounds.minimumY) * rowScale) + 1,
  );
  const indices = mesh.indices;
  for (let row = minimumRow; row <= maximumRow; ++row) {
    for (let column = minimumColumn; column <= maximumColumn; ++column) {
      const offset = (row * (mesh.width - 1) + column) * 6;
      for (let half = 0; half < 2; ++half) {
        const triangleOffset = offset + half * 3;
        if (triangleOffset + 2 >= mesh.surfaceIndexCount) {
          continue;
        }
        const triangle = [
          meshVertex(entry, indices[triangleOffset]),
          meshVertex(entry, indices[triangleOffset + 1]),
          meshVertex(entry, indices[triangleOffset + 2]),
        ];
        if (cross(triangle[0], triangle[1], triangle[2]) < 0.0) {
          const swap = triangle[1];
          triangle[1] = triangle[2];
          triangle[2] = swap;
        }
        if (debug !== undefined) {
          ++debug.visitedTriangles;
        }
        visitor(triangle);
      }
    }
  }
}

function visitSurfaceTriangles(snapshot, count, bounds, visitor, debug) {
  for (let i = 0; i < count; ++i) {
    visitEntryTriangles(snapshot[i], bounds, visitor, debug);
  }
}

function clipSegment(a, b, triangle) {
  let minimum = 0.0;
  let maximum = 1.0;
  for (let i = 0; i < 3; i++) {
    const p = triangle[i];
    const q = triangle[(i + 1) % 3];
    const start = cross(p, q, a);
    const end = cross(p, q, b);
    if (start < -EPSILON && end < -EPSILON) {
      return undefined;
    }
    const delta = end - start;
    if (delta !== 0.0) {
      const t = -start / delta;
      if (start < -EPSILON) {
        minimum = Math.max(minimum, t);
      }
      if (end < -EPSILON) {
        maximum = Math.min(maximum, t);
      }
    }
  }
  return maximum - minimum > EPSILON ? [minimum, maximum] : undefined;
}

function sameXY(left, right) {
  return left.x === right.x && left.y === right.y;
}

function normalizeClippedRing(ring) {
  const normalized = [];
  for (const point of ring) {
    if (normalized.length === 0 || !sameXY(normalized.at(-1), point)) {
      normalized.push(point);
    }
  }
  if (normalized.length > 1 && sameXY(normalized[0], normalized.at(-1))) {
    normalized.pop();
  }
  let changed = true;
  while (changed && normalized.length >= 3) {
    changed = false;
    for (let i = 0; i < normalized.length; ++i) {
      const previous =
        normalized[(i + normalized.length - 1) % normalized.length];
      const current = normalized[i];
      const next = normalized[(i + 1) % normalized.length];
      if (cross(previous, next, current) === 0.0) {
        normalized.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  if (normalized.length < 3) {
    return [];
  }
  let twiceArea = 0.0;
  for (let i = 0; i < normalized.length; ++i) {
    const next = normalized[(i + 1) % normalized.length];
    twiceArea += normalized[i].x * next.y - next.x * normalized[i].y;
  }
  return Number.isFinite(twiceArea) && twiceArea !== 0.0 ? normalized : [];
}

function clipPolygon(subject, triangle) {
  let output = subject;
  for (let e = 0; e < 3 && output.length > 0; e++) {
    const edgeA = triangle[e];
    const edgeB = triangle[(e + 1) % 3];
    const input = output;
    output = [];
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const previous = input[(i + input.length - 1) % input.length];
      const currentInside = cross(edgeA, edgeB, current) >= -EPSILON;
      const previousInside = cross(edgeA, edgeB, previous) >= -EPSILON;
      if (currentInside !== previousInside) {
        const dc = cross(edgeA, edgeB, current);
        const dp = cross(edgeA, edgeB, previous);
        const t = dp / (dp - dc);
        output.push(interpolate(previous, current, t, new Cartesian3()));
      }
      if (currentInside) {
        output.push(Cartesian3.clone(current));
      }
    }
  }
  return normalizeClippedRing(output);
}

function pointKey(point) {
  return `${point.x.toPrecision(15)},${point.y.toPrecision(15)},${point.z.toPrecision(15)}`;
}

function triangleKey(a, b, c) {
  return [pointKey(a), pointKey(b), pointKey(c)].sort().join("|");
}

function pushTriangle(output, keys, a, b, c) {
  finitePosition(a.x, a.y, a.z);
  finitePosition(b.x, b.y, b.z);
  finitePosition(c.x, c.y, c.z);
  if (cross(a, b, c) === 0.0) {
    return;
  }
  const key = triangleKey(a, b, c);
  if (keys.has(key)) {
    return;
  }
  keys.add(key);
  output.push(a, b, c);
}

function validatePair(bottom, top) {
  finitePosition(bottom.x, bottom.y, bottom.z);
  finitePosition(top.x, top.y, top.z);
  if (bottom.z > top.z) {
    throw new DeveloperError(
      "Derived bottom positions must not exceed top positions.",
    );
  }
}

function makeTriangleGeometry(worldPositions, origin) {
  if (worldPositions.length < 3 || worldPositions.length % 3 !== 0) {
    return undefined;
  }
  const local = new Array(worldPositions.length);
  const values = new Float64Array(worldPositions.length * 3);
  for (let i = 0; i < worldPositions.length; i++) {
    local[i] = Cartesian3.subtract(worldPositions[i], origin, new Cartesian3());
    if (
      !Number.isFinite(local[i].x) ||
      !Number.isFinite(local[i].y) ||
      !Number.isFinite(local[i].z)
    ) {
      throw new DeveloperError("Derived ground geometry must be finite.");
    }
    Cartesian3.pack(local[i], values, i * 3);
  }
  const indices = new Array(worldPositions.length);
  for (let i = 0; i < indices.length; i++) {
    indices[i] = i;
  }
  return new Geometry({
    attributes: new GeometryAttributes({
      position: new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values,
      }),
    }),
    indices: IndexDatatype.createTypedArray(worldPositions.length, indices),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.fromPoints(local),
  });
}

function combinePolylineGeometries(geometries) {
  if (geometries.length === 0) {
    return undefined;
  }
  const names = Object.keys(geometries[0].attributes).filter(
    (name) => geometries[0].attributes[name] !== undefined,
  );
  const attributes = new GeometryAttributes();
  for (const name of names) {
    const first = geometries[0].attributes[name];
    let length = 0;
    for (const geometry of geometries) {
      length += geometry.attributes[name].values.length;
    }
    const values = new first.values.constructor(length);
    let offset = 0;
    for (const geometry of geometries) {
      values.set(geometry.attributes[name].values, offset);
      offset += geometry.attributes[name].values.length;
    }
    attributes[name] = new GeometryAttribute({
      componentDatatype: first.componentDatatype,
      componentsPerAttribute: first.componentsPerAttribute,
      normalize: first.normalize,
      values,
    });
  }
  let indexCount = 0;
  let vertexCount = 0;
  for (const geometry of geometries) {
    indexCount += geometry.indices.length;
    const attribute = geometry.attributes[names[0]];
    vertexCount += attribute.values.length / attribute.componentsPerAttribute;
  }
  const indices = IndexDatatype.createTypedArray(vertexCount, indexCount);
  let indexOffset = 0;
  let vertexOffset = 0;
  let boundingSphere;
  for (const geometry of geometries) {
    for (let i = 0; i < geometry.indices.length; i++) {
      indices[indexOffset++] = geometry.indices[i] + vertexOffset;
    }
    const attribute = geometry.attributes[names[0]];
    vertexOffset += attribute.values.length / attribute.componentsPerAttribute;
    boundingSphere =
      boundingSphere === undefined
        ? BoundingSphere.clone(geometry.boundingSphere)
        : BoundingSphere.union(
            boundingSphere,
            geometry.boundingSphere,
            boundingSphere,
          );
  }
  return new Geometry({
    attributes,
    indices,
    primitiveType: geometries[0].primitiveType,
    boundingSphere,
  });
}

function resolveLineHeight(a, b, t, point, surfaceZ, reference, references) {
  if (references === undefined) {
    return applyReference(point.z, surfaceZ, reference);
  }
  const start = applyReference(a.z, surfaceZ, references[0]);
  const end = applyReference(b.z, surfaceZ, references[1]);
  const z = start + (end - start) * t;
  if (!Number.isFinite(z)) {
    throw new DeveloperError("Derived ground heights must be finite.");
  }
  return z;
}

function drapePolyline(
  geometry,
  reference,
  references,
  snapshot,
  count,
  debug,
) {
  const source = geometry._getDrapeSource();
  const geometries = [];
  for (let i = 0; i + 1 < source.positions.length; i++) {
    const a = source.positions[i];
    const b = source.positions[i + 1];
    const pieces = new Map();
    visitSurfaceTriangles(
      snapshot,
      count,
      boundsForPositions([a, b]),
      (triangle) => {
        const interval = clipSegment(a, b, triangle);
        if (interval === undefined) {
          return;
        }
        const key = `${interval[0].toPrecision(15)}:${interval[1].toPrecision(15)}`;
        if (!pieces.has(key)) {
          pieces.set(key, { interval, triangle });
        }
      },
      debug,
    );
    const ordered = [...pieces.values()].sort(
      (left, right) => left.interval[0] - right.interval[0],
    );
    for (const piece of ordered) {
      const positions = piece.interval.map((t) => {
        const point = interpolate(a, b, t, new Cartesian3());
        point.z = resolveLineHeight(
          a,
          b,
          t,
          point,
          triangleHeight(piece.triangle, point.x, point.y),
          reference,
          references === undefined ? undefined : references.slice(i, i + 2),
        );
        return point;
      });
      if (Cartesian3.equals(positions[0], positions[1])) {
        continue;
      }
      geometries.push(
        new SceneGISPlanarPolylineGeometry({
          positions,
          width: source.width,
          origin: source.origin,
        })._createGeometry(),
      );
    }
  }
  const combined = combinePolylineGeometries(geometries);
  return combined === undefined
    ? undefined
    : { geometry: combined, origin: source.origin };
}

function drapePolygon(
  geometry,
  topReference,
  bottomReference,
  snapshot,
  count,
  debug,
) {
  const source = geometry._getDrapeSource();
  const output = [];
  const outputKeys = new Set();
  const top = source.top;
  const bottom = source.bottom;
  for (let i = 0; i < source.topTriangles.length; i += 3) {
    const sourceTriangle = [
      top[source.topTriangles[i]],
      top[source.topTriangles[i + 1]],
      top[source.topTriangles[i + 2]],
    ];
    const bottomTriangle =
      bottom === undefined
        ? undefined
        : [
            bottom[source.topTriangles[i]],
            bottom[source.topTriangles[i + 1]],
            bottom[source.topTriangles[i + 2]],
          ];
    visitSurfaceTriangles(
      snapshot,
      count,
      boundsForPositions(sourceTriangle),
      (surfaceTriangle) => {
        const clipped = clipPolygon(sourceTriangle, surfaceTriangle);
        for (let j = 1; j + 1 < clipped.length; j++) {
          const fan = [clipped[0], clipped[j], clipped[j + 1]];
          const topFan = [];
          const bottomFan = [];
          for (const point of fan) {
            const surfaceZ = triangleHeight(surfaceTriangle, point.x, point.y);
            const topPosition = finitePosition(
              point.x,
              point.y,
              applyReference(
                triangleHeight(sourceTriangle, point.x, point.y),
                surfaceZ,
                topReference,
              ),
            );
            topFan.push(topPosition);
            if (bottomTriangle !== undefined) {
              const bottomPosition = finitePosition(
                point.x,
                point.y,
                applyReference(
                  triangleHeight(bottomTriangle, point.x, point.y),
                  surfaceZ,
                  bottomReference,
                ),
              );
              validatePair(bottomPosition, topPosition);
              bottomFan.push(bottomPosition);
            }
          }
          if (source.closeTop) {
            pushTriangle(output, outputKeys, topFan[0], topFan[1], topFan[2]);
          }
          if (bottomTriangle !== undefined && source.closeBottom) {
            pushTriangle(
              output,
              outputKeys,
              bottomFan[0],
              bottomFan[2],
              bottomFan[1],
            );
          }
        }
      },
      debug,
    );
  }

  if (bottom !== undefined) {
    let offset = 0;
    for (const ring of source.rings) {
      const ringOffset = offset;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i];
        const b = ring[(i + 1) % ring.length];
        const ownedIntervals = new Set();
        visitSurfaceTriangles(
          snapshot,
          count,
          boundsForPositions([a, b]),
          (surfaceTriangle) => {
            const interval = clipSegment(a, b, surfaceTriangle);
            if (interval === undefined) {
              return;
            }
            const intervalKey = `${i}:${interval[0].toPrecision(15)}:${interval[1].toPrecision(15)}`;
            if (ownedIntervals.has(intervalKey)) {
              return;
            }
            ownedIntervals.add(intervalKey);
            const pair = interval.map((t) =>
              interpolate(a, b, t, new Cartesian3()),
            );
            const bottomA = bottom[ringOffset + i];
            const bottomB = bottom[ringOffset + ((i + 1) % ring.length)];
            const topPair = [];
            const bottomPair = [];
            for (let j = 0; j < 2; ++j) {
              const point = pair[j];
              const surfaceZ = triangleHeight(
                surfaceTriangle,
                point.x,
                point.y,
              );
              const topPosition = finitePosition(
                point.x,
                point.y,
                applyReference(point.z, surfaceZ, topReference),
              );
              const t = interval[j];
              const bottomZ = bottomA.z + (bottomB.z - bottomA.z) * t;
              const bottomPosition = finitePosition(
                point.x,
                point.y,
                applyReference(bottomZ, surfaceZ, bottomReference),
              );
              validatePair(bottomPosition, topPosition);
              topPair.push(topPosition);
              bottomPair.push(bottomPosition);
            }
            pushTriangle(
              output,
              outputKeys,
              topPair[0],
              topPair[1],
              bottomPair[1],
            );
            pushTriangle(
              output,
              outputKeys,
              topPair[0],
              bottomPair[1],
              bottomPair[0],
            );
          },
          debug,
        );
      }
      offset += ring.length;
    }
  }
  const raw = makeTriangleGeometry(output, source.origin);
  return raw === undefined
    ? undefined
    : { geometry: raw, origin: source.origin };
}

/**
 * Continuously drapes planar geometry over an actual render-cover snapshot.
 *
 * @private
 */
const SceneGISPlanarGroundDraper = {};

SceneGISPlanarGroundDraper.getCoverageSignature = function (
  geometry,
  snapshot,
  count,
  surfaceSignature,
) {
  if (surfaceSignature === "" || snapshot === undefined || count === 0) {
    return "";
  }
  const generation = surfaceSignature.split("|", 1)[0];
  const bounds = getGeometryBounds(geometry);
  const entries = [];
  for (let i = 0; i < count; ++i) {
    const entry = snapshot[i];
    if (intersectsBounds(bounds, entry.extent)) {
      entries.push(`${entry.key}:${entry.source}:${entry.revision}`);
    }
  }
  return `${generation}|${entries.join("|")}`;
};

SceneGISPlanarGroundDraper.drape = function (
  geometry,
  heightReference,
  extrudedHeightReference,
  snapshot,
  count,
  debug,
  heightReferences,
) {
  if (debug !== undefined) {
    debug.visitedTriangles = 0;
    debug.relevantEntries = 0;
  }
  if (geometry instanceof SceneGISPlanarPolylineGeometry) {
    return drapePolyline(
      geometry,
      heightReference,
      heightReferences,
      snapshot,
      count,
      debug,
    );
  }
  if (geometry instanceof SceneGISPlanarPolygonGeometry) {
    return drapePolygon(
      geometry,
      heightReference,
      extrudedHeightReference,
      snapshot,
      count,
      debug,
    );
  }
  throw new DeveloperError("geometry must be a supported planar geometry.");
};

export default SceneGISPlanarGroundDraper;

import createSceneGISPlanarMaterialGeometry from "./_private/_SceneGISPlanarMaterialGeometry.js";
import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import CornerType from "../../Core/CornerType.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Geometry from "../../Core/Geometry.js";
import GeometryAttribute from "../../Core/GeometryAttribute.js";
import GeometryAttributes from "../../Core/GeometryAttributes.js";
import IndexDatatype from "../../Core/IndexDatatype.js";
import CesiumMath from "../../Core/Math.js";
import PolygonPipeline from "../../Core/PolygonPipeline.js";
import PrimitiveType from "../../Core/PrimitiveType.js";

function cross2(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, point) {
  return (
    cross2(a, b, point) === 0.0 &&
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  );
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross2(a, b, c);
  const abD = cross2(a, b, d);
  const cdA = cross2(c, d, a);
  const cdB = cross2(c, d, b);
  return (
    (((abC > 0.0 && abD < 0.0) || (abC < 0.0 && abD > 0.0)) &&
      ((cdA > 0.0 && cdB < 0.0) || (cdA < 0.0 && cdB > 0.0))) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}

function normalizeDirection(from, to) {
  const x = to.x - from.x;
  const y = to.y - from.y;
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length === 0.0) {
    throw new DeveloperError("Adjacent polylinePositions must differ in XY.");
  }
  return new Cartesian2(x / length, y / length);
}

function directionsAreOpposite(from, middle, to) {
  const previousX = middle.x - from.x;
  const previousY = middle.y - from.y;
  const nextX = to.x - middle.x;
  const nextY = to.y - middle.y;
  const previousScale = Math.max(Math.abs(previousX), Math.abs(previousY));
  const nextScale = Math.max(Math.abs(nextX), Math.abs(nextY));
  return (
    previousX / previousScale === -(nextX / nextScale) &&
    previousY / previousScale === -(nextY / nextScale)
  );
}

function validateRoute(source) {
  if (!Array.isArray(source) || source.length < 2) {
    throw new DeveloperError(
      "polylinePositions must contain at least two positions.",
    );
  }
  const route = source.map((position) => {
    if (
      !(position instanceof Cartesian3) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new DeveloperError(
        "polylinePositions must contain finite Cartesian3 values.",
      );
    }
    return Cartesian3.clone(position);
  });
  const directions = new Array(route.length - 1);
  for (let i = 0; i < directions.length; i++) {
    directions[i] = normalizeDirection(route[i], route[i + 1]);
  }
  for (let i = 1; i < directions.length; i++) {
    if (directionsAreOpposite(route[i - 1], route[i], route[i + 1])) {
      throw new DeveloperError(
        "polylinePositions must not contain a 180-degree reversal.",
      );
    }
  }
  for (let i = 0; i < route.length - 1; i++) {
    for (let j = i + 2; j < route.length - 1; j++) {
      if (segmentsIntersect(route[i], route[i + 1], route[j], route[j + 1])) {
        throw new DeveloperError("polylinePositions must not self-intersect.");
      }
    }
  }
  return { route, directions };
}

function validateShape(source) {
  if (!Array.isArray(source) || source.length < 3) {
    throw new DeveloperError(
      "shapePositions must contain at least three positions.",
    );
  }
  const shape = source.map((position) => {
    if (
      !(position instanceof Cartesian2) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      throw new DeveloperError(
        "shapePositions must contain finite Cartesian2 values.",
      );
    }
    return Cartesian2.clone(position);
  });
  if (
    shape.length > 3 &&
    Cartesian2.equals(shape[0], shape[shape.length - 1])
  ) {
    shape.pop();
  }
  let area = 0.0;
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < shape.length; i++) {
    const next = shape[(i + 1) % shape.length];
    if (Cartesian2.equals(shape[i], next)) {
      throw new DeveloperError(
        "shapePositions must contain adjacent distinct positions.",
      );
    }
    area += shape[i].x * next.y - next.x * shape[i].y;
    minimumX = Math.min(minimumX, shape[i].x);
    minimumY = Math.min(minimumY, shape[i].y);
    maximumX = Math.max(maximumX, shape[i].x);
    maximumY = Math.max(maximumY, shape[i].y);
  }
  if (!Number.isFinite(area) || area === 0.0) {
    throw new DeveloperError("shapePositions must have nonzero finite area.");
  }
  for (let i = 0; i < shape.length; i++) {
    const nextI = (i + 1) % shape.length;
    for (let j = i + 1; j < shape.length; j++) {
      const nextJ = (j + 1) % shape.length;
      if (nextI === j || nextJ === i) {
        continue;
      }
      if (segmentsIntersect(shape[i], shape[nextI], shape[j], shape[nextJ])) {
        throw new DeveloperError("shapePositions must be simple.");
      }
    }
  }
  if (area < 0.0) {
    shape.reverse();
  }
  const centerX = minimumX + (maximumX - minimumX) * 0.5;
  const centerY = minimumY + (maximumY - minimumY) * 0.5;
  return shape.map(
    (position) => new Cartesian2(position.x - centerX, position.y - centerY),
  );
}

function left(direction) {
  return new Cartesian2(-direction.y, direction.x);
}

function addStation(stations, routePosition, leftDirection) {
  if (!Number.isFinite(leftDirection.x) || !Number.isFinite(leftDirection.y)) {
    throw new DeveloperError("The derived sweep station must be finite.");
  }
  stations.push({
    position: Cartesian3.clone(routePosition),
    left: Cartesian2.clone(leftDirection),
  });
}

function createStations(route, directions, cornerType, granularity) {
  const stations = [];
  addStation(stations, route[0], left(directions[0]));
  for (let i = 1; i < route.length - 1; i++) {
    const incomingLeft = left(directions[i - 1]);
    const outgoingLeft = left(directions[i]);
    if (cornerType === CornerType.BEVELED) {
      addStation(stations, route[i], incomingLeft);
      addStation(stations, route[i], outgoingLeft);
      continue;
    }
    if (cornerType === CornerType.ROUNDED) {
      const start = Math.atan2(incomingLeft.y, incomingLeft.x);
      let sweep = Math.atan2(
        incomingLeft.x * outgoingLeft.y - incomingLeft.y * outgoingLeft.x,
        incomingLeft.x * outgoingLeft.x + incomingLeft.y * outgoingLeft.y,
      );
      const steps = Math.max(1, Math.ceil(Math.abs(sweep) / granularity));
      if (!Number.isSafeInteger(steps)) {
        throw new DeveloperError(
          "cornerGranularity produces too many sweep stations.",
        );
      }
      sweep /= steps;
      for (let step = 0; step <= steps; step++) {
        const angle = start + sweep * step;
        addStation(
          stations,
          route[i],
          new Cartesian2(Math.cos(angle), Math.sin(angle)),
        );
      }
      continue;
    }
    const sum = Cartesian2.add(incomingLeft, outgoingLeft, new Cartesian2());
    const magnitude = Cartesian2.magnitude(sum);
    if (!Number.isFinite(magnitude) || magnitude === 0.0) {
      throw new DeveloperError("The derived miter station must be finite.");
    }
    Cartesian2.divideByScalar(sum, magnitude, sum);
    const divisor = Cartesian2.dot(sum, outgoingLeft);
    if (!Number.isFinite(divisor) || divisor <= 0.0) {
      throw new DeveloperError("The derived miter station must be finite.");
    }
    Cartesian2.divideByScalar(sum, divisor, sum);
    addStation(stations, route[i], sum);
  }
  addStation(
    stations,
    route[route.length - 1],
    left(directions[directions.length - 1]),
  );
  return stations;
}

function appendTriangle(world, origin, a, b, c, local, normals, indices) {
  const pointA = world[a];
  const pointB = world[b];
  const pointC = world[c];
  const ab = Cartesian3.subtract(pointB, pointA, new Cartesian3());
  const ac = Cartesian3.subtract(pointC, pointA, new Cartesian3());
  const normal = Cartesian3.cross(ab, ac, new Cartesian3());
  const magnitude = Cartesian3.magnitude(normal);
  if (!Number.isFinite(magnitude) || magnitude === 0.0) {
    return;
  }
  Cartesian3.divideByScalar(normal, magnitude, normal);
  const offset = local.length;
  for (const point of [pointA, pointB, pointC]) {
    const value = Cartesian3.subtract(point, origin, new Cartesian3());
    if (
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      !Number.isFinite(value.z)
    ) {
      throw new DeveloperError(
        "Local polyline volume positions must be finite.",
      );
    }
    local.push(value);
    normals.push(Cartesian3.clone(normal));
  }
  indices.push(offset, offset + 1, offset + 2);
}

/**
 * A CPU-only immutable description of a planar polyline-volume sweep.
 *
 * @alias SceneGISPlanarPolylineVolumeGeometry
 * @constructor
 * @param {object} options Object with the following properties:
 * @param {Cartesian3[]} options.polylinePositions The route center positions in planar meters.
 * @param {Cartesian2[]} options.shapePositions The simple cross-section ring.
 * @param {CornerType} [options.cornerType=CornerType.ROUNDED] The planar corner style.
 * @param {number} [options.cornerGranularity=CesiumMath.RADIANS_PER_DEGREE] The positive rounded-corner angular step.
 * @param {Cartesian3} [options.origin] The local origin. The first route position is used by default.
 * @exception {DeveloperError} The route, shape, corner options, origin, or derived mesh is invalid.
 */
function SceneGISPlanarPolylineVolumeGeometry(options) {
  options = options ?? {};
  const routeState = validateRoute(options.polylinePositions);
  const shape = validateShape(options.shapePositions);
  const cornerType = options.cornerType ?? CornerType.ROUNDED;
  if (
    cornerType !== CornerType.ROUNDED &&
    cornerType !== CornerType.MITERED &&
    cornerType !== CornerType.BEVELED
  ) {
    throw new DeveloperError("cornerType is invalid.");
  }
  const granularity =
    options.cornerGranularity ?? CesiumMath.RADIANS_PER_DEGREE;
  if (!Number.isFinite(granularity) || granularity <= 0.0) {
    throw new DeveloperError(
      "cornerGranularity must be finite and greater than zero.",
    );
  }
  const origin = options.origin ?? routeState.route[0];
  if (
    !(origin instanceof Cartesian3) ||
    !Number.isFinite(origin.x) ||
    !Number.isFinite(origin.y) ||
    !Number.isFinite(origin.z)
  ) {
    throw new DeveloperError("origin must be a finite Cartesian3.");
  }
  const stations = createStations(
    routeState.route,
    routeState.directions,
    cornerType,
    granularity,
  );
  const ringSize = shape.length;
  const world = [];
  for (const station of stations) {
    for (const point of shape) {
      world.push(
        new Cartesian3(
          station.position.x + station.left.x * point.x,
          station.position.y + station.left.y * point.x,
          station.position.z + point.y,
        ),
      );
    }
  }
  const triangles = [];
  for (let station = 0; station < stations.length - 1; station++) {
    const current = station * ringSize;
    const next = current + ringSize;
    for (let i = 0; i < ringSize; i++) {
      const j = (i + 1) % ringSize;
      triangles.push(current + i, current + j, next + j);
      triangles.push(current + i, next + j, next + i);
    }
  }
  const cap = PolygonPipeline.triangulate(shape);
  const endOffset = (stations.length - 1) * ringSize;
  for (let i = 0; i < cap.length; i += 3) {
    triangles.push(cap[i], cap[i + 2], cap[i + 1]);
    triangles.push(
      endOffset + cap[i],
      endOffset + cap[i + 1],
      endOffset + cap[i + 2],
    );
  }
  const local = [];
  const normals = [];
  const indices = [];
  for (let i = 0; i < triangles.length; i += 3) {
    appendTriangle(
      world,
      origin,
      triangles[i],
      triangles[i + 1],
      triangles[i + 2],
      local,
      normals,
      indices,
    );
  }
  if (indices.length === 0) {
    throw new DeveloperError("The polyline volume mesh must be nonempty.");
  }
  this._polylinePositions = routeState.route;
  this._shapePositions = shape;
  this._cornerType = cornerType;
  this._cornerGranularity = granularity;
  this._origin = Cartesian3.clone(origin);
  this._stations = stations;
  this._stationRings = new Array(stations.length);
  for (let i = 0; i < stations.length; i++) {
    this._stationRings[i] = world
      .slice(i * ringSize, (i + 1) * ringSize)
      .map((position) => Cartesian3.clone(position));
  }
  this._localPositions = local;
  this._normals = normals;
  this._indices = indices;
  this._boundingSphere = BoundingSphere.fromPoints(local);
  if (!Number.isFinite(this._boundingSphere.radius)) {
    throw new DeveloperError(
      "The derived polyline volume bounds must be finite.",
    );
  }
}

Object.defineProperties(SceneGISPlanarPolylineVolumeGeometry.prototype, {
  /**
   * Gets a cloned snapshot of the route center positions.
   *
   * @memberof SceneGISPlanarPolylineVolumeGeometry.prototype
   * @type {Cartesian3[]}
   * @readonly
   */
  polylinePositions: {
    get: function () {
      return this._polylinePositions.map((position) =>
        Cartesian3.clone(position),
      );
    },
  },
  /**
   * Gets a cloned snapshot of the normalized cross-section ring.
   *
   * @memberof SceneGISPlanarPolylineVolumeGeometry.prototype
   * @type {Cartesian2[]}
   * @readonly
   */
  shapePositions: {
    get: function () {
      return this._shapePositions.map((position) => Cartesian2.clone(position));
    },
  },
  /**
   * Gets the planar corner style.
   *
   * @memberof SceneGISPlanarPolylineVolumeGeometry.prototype
   * @type {CornerType}
   * @readonly
   */
  cornerType: {
    get: function () {
      return this._cornerType;
    },
  },
  /**
   * Gets the rounded-corner angular step.
   *
   * @memberof SceneGISPlanarPolylineVolumeGeometry.prototype
   * @type {number}
   * @readonly
   */
  cornerGranularity: {
    get: function () {
      return this._cornerGranularity;
    },
  },
  /**
   * Gets a clone of the local origin in planar world coordinates.
   *
   * @memberof SceneGISPlanarPolylineVolumeGeometry.prototype
   * @type {Cartesian3}
   * @readonly
   */
  origin: {
    get: function () {
      return Cartesian3.clone(this._origin);
    },
  },
});

/** @private */
SceneGISPlanarPolylineVolumeGeometry.prototype._createGeometry = function (
  vertexFormat,
) {
  const positions = new Float64Array(this._localPositions.length * 3);
  const normals = new Float32Array(this._normals.length * 3);
  for (let i = 0; i < this._localPositions.length; i++) {
    Cartesian3.pack(this._localPositions[i], positions, i * 3);
    Cartesian3.pack(this._normals[i], normals, i * 3);
  }
  const geometry = new Geometry({
    attributes: new GeometryAttributes({
      position: new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values: positions,
      }),
      normal: new GeometryAttribute({
        componentDatatype: ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: normals,
      }),
    }),
    indices: IndexDatatype.createTypedArray(
      this._localPositions.length,
      this._indices,
    ),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.clone(this._boundingSphere),
  });
  return vertexFormat === undefined
    ? geometry
    : createSceneGISPlanarMaterialGeometry(geometry, vertexFormat);
};

/** @private */
SceneGISPlanarPolylineVolumeGeometry.prototype._getLocalBoundingSphere =
  function (result) {
    return BoundingSphere.clone(this._boundingSphere, result);
  };

/** @private */
SceneGISPlanarPolylineVolumeGeometry.prototype._getOutlinePositions =
  function () {
    const lines = [
      [...this._stationRings[0], this._stationRings[0][0]].map((position) =>
        Cartesian3.clone(position),
      ),
      [
        ...this._stationRings[this._stationRings.length - 1],
        this._stationRings[this._stationRings.length - 1][0],
      ].map((position) => Cartesian3.clone(position)),
    ];
    for (
      let shapeIndex = 0;
      shapeIndex < this._shapePositions.length;
      shapeIndex++
    ) {
      lines.push(
        this._stationRings.map((ring) => Cartesian3.clone(ring[shapeIndex])),
      );
    }
    return lines;
  };

export default SceneGISPlanarPolylineVolumeGeometry;

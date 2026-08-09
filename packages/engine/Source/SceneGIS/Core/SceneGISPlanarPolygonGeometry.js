import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Geometry from "../../Core/Geometry.js";
import GeometryAttribute from "../../Core/GeometryAttribute.js";
import GeometryAttributes from "../../Core/GeometryAttributes.js";
import IndexDatatype from "../../Core/IndexDatatype.js";
import PolygonPipeline from "../../Core/PolygonPipeline.js";
import PrimitiveType from "../../Core/PrimitiveType.js";

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}
function cloneFinitePosition(position, name) {
  if (
    !(position instanceof Cartesian3) ||
    !Number.isFinite(position.x) ||
    !Number.isFinite(position.y) ||
    !Number.isFinite(position.z)
  ) {
    throw new DeveloperError(`${name} must contain finite Cartesian3 values.`);
  }
  return Cartesian3.clone(position);
}
function onSegment(a, b, p) {
  return (
    cross(a, b, p) === 0.0 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}
function intersects(a, b, c, d) {
  const ac = cross(a, b, c);
  const ad = cross(a, b, d);
  const ca = cross(c, d, a);
  const cb = cross(c, d, b);
  return (
    (((ac > 0 && ad < 0) || (ac < 0 && ad > 0)) &&
      ((ca > 0 && cb < 0) || (ca < 0 && cb > 0))) ||
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}
function normalizeRing(source, name) {
  if (!Array.isArray(source) || source.length < 3) {
    throw new DeveloperError(`${name} must contain at least three positions.`);
  }
  const ring = source.map((position) => {
    if (
      !(position instanceof Cartesian3) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new DeveloperError(
        `${name} must contain finite Cartesian3 values.`,
      );
    }
    return Cartesian3.clone(position);
  });
  if (
    ring.length > 3 &&
    ring[0].x === ring[ring.length - 1].x &&
    ring[0].y === ring[ring.length - 1].y
  ) {
    ring.pop();
  }
  let area = 0.0;
  const distinct = new Set();
  for (let i = 0; i < ring.length; i++) {
    const next = ring[(i + 1) % ring.length];
    area += ring[i].x * next.y - next.x * ring[i].y;
    distinct.add(`${ring[i].x}\n${ring[i].y}`);
  }
  if (
    ring.length < 3 ||
    distinct.size < 3 ||
    !Number.isFinite(area) ||
    area === 0.0
  ) {
    throw new DeveloperError(`${name} must have nonzero finite area.`);
  }
  for (let i = 0; i < ring.length; i++) {
    for (let j = i + 1; j < ring.length; j++) {
      const ni = (i + 1) % ring.length;
      const nj = (j + 1) % ring.length;
      if (j === i || nj === i || j === ni) {
        continue;
      }
      if (intersects(ring[i], ring[ni], ring[j], ring[nj])) {
        throw new DeveloperError(`${name} must be simple.`);
      }
    }
  }
  return ring;
}
function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    if (onSegment(ring[j], ring[i], point)) {
      return false;
    }
    if (
      ring[j].y !== ring[i].y &&
      point.y < Math.max(ring[j].y, ring[i].y) &&
      point.y >= Math.min(ring[j].y, ring[i].y) &&
      point.x <
        ((point.y - ring[j].y) * (ring[i].x - ring[j].x)) /
          (ring[i].y - ring[j].y) +
          ring[j].x
    ) {
      inside = !inside;
    }
  }
  return inside;
}
function ringsIntersect(a, b) {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (
        intersects(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])
      ) {
        return true;
      }
    }
  }
  return false;
}
function validateHoles(outer, holes) {
  for (let i = 0; i < holes.length; i++) {
    if (ringsIntersect(outer, holes[i]) || !pointInRing(holes[i][0], outer)) {
      throw new DeveloperError(
        "Polygon holes must lie strictly inside the outer ring.",
      );
    }
    for (let j = 0; j < i; j++) {
      if (
        ringsIntersect(holes[i], holes[j]) ||
        pointInRing(holes[i][0], holes[j]) ||
        pointInRing(holes[j][0], holes[i])
      ) {
        throw new DeveloperError(
          "Polygon holes must not overlap or contain each other.",
        );
      }
    }
  }
}

/**
 * A CPU-only immutable description of a simple planar polygon.
 *
 * @alias SceneGISPlanarPolygonGeometry
 * @constructor
 * @param {object} options Object with the following properties:
 * @param {Cartesian3[]} options.positions The outer top ring.
 * @param {Cartesian3[][]} [options.holes=[]] Direct top hole rings.
 * @param {Cartesian3[]} [options.bottomPositions] Flattened bottom vertices matching all normalized top rings.
 * @param {boolean} [options.closeTop=true] Whether to create the top cap.
 * @param {boolean} [options.closeBottom=true] Whether to create the bottom cap.
 * @param {Cartesian3} [options.origin] The local origin.
 * @exception {DeveloperError} The rings, bottom positions, flags, or derived geometry are invalid.
 */
function SceneGISPlanarPolygonGeometry(options) {
  options = options ?? {};
  const outer = normalizeRing(options.positions, "positions");
  const holeSource = options.holes ?? [];
  if (!Array.isArray(holeSource)) {
    throw new DeveloperError("holes must be an array.");
  }
  const holes = holeSource.map((ring, i) => normalizeRing(ring, `holes[${i}]`));
  validateHoles(outer, holes);
  const rings = [outer, ...holes];
  const top = rings.flat();
  const bottomSource = options.bottomPositions;
  let bottom;
  if (bottomSource !== undefined) {
    if (!Array.isArray(bottomSource) || bottomSource.length !== top.length) {
      throw new DeveloperError(
        "bottomPositions must match the normalized top vertex count.",
      );
    }
    bottom = bottomSource.map((p) => cloneFinitePosition(p, "bottomPositions"));
    for (let i = 0; i < top.length; i++) {
      if (bottom[i].z > top[i].z) {
        throw new DeveloperError(
          "bottomPositions must not exceed the top positions.",
        );
      }
    }
  }
  const closeTop = options.closeTop ?? true;
  const closeBottom = options.closeBottom ?? true;
  if (typeof closeTop !== "boolean" || typeof closeBottom !== "boolean") {
    throw new DeveloperError("closeTop and closeBottom must be boolean.");
  }
  const origin =
    options.origin === undefined
      ? Cartesian3.clone(top[0])
      : Cartesian3.clone(options.origin);
  if (
    !(origin instanceof Cartesian3) ||
    !Number.isFinite(origin.x) ||
    !Number.isFinite(origin.y) ||
    !Number.isFinite(origin.z)
  ) {
    throw new DeveloperError("origin must be a finite Cartesian3.");
  }
  const flat2D = [];
  const holeOffsets = [];
  for (let r = 0; r < rings.length; r++) {
    if (r > 0) {
      holeOffsets.push(flat2D.length);
    }
    for (const p of rings[r]) {
      flat2D.push(new Cartesian2(p.x, p.y));
    }
  }
  const topTriangles = PolygonPipeline.triangulate(flat2D, holeOffsets);
  if (topTriangles.length < 3 || topTriangles.length % 3 !== 0) {
    throw new DeveloperError(
      "Polygon triangulation must produce complete triangles.",
    );
  }
  const worldPositions = bottom === undefined ? top : [...top, ...bottom];
  const local = worldPositions.map((p) => {
    const v = Cartesian3.subtract(p, origin, new Cartesian3());
    if (
      !Number.isFinite(v.x) ||
      !Number.isFinite(v.y) ||
      !Number.isFinite(v.z)
    ) {
      throw new DeveloperError("Local polygon positions must be finite.");
    }
    return v;
  });
  const indices = [];
  if (bottom === undefined || closeTop) {
    indices.push(...topTriangles);
  }
  if (bottom !== undefined) {
    const count = top.length;
    if (closeBottom) {
      for (let i = 0; i < topTriangles.length; i += 3) {
        indices.push(
          count + topTriangles[i],
          count + topTriangles[i + 2],
          count + topTriangles[i + 1],
        );
      }
    }
    let offset = 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const a = offset + i;
        const b = offset + ((i + 1) % ring.length);
        indices.push(a, b, count + b, a, count + b, count + a);
      }
      offset += ring.length;
    }
  }
  if (indices.length === 0) {
    throw new DeveloperError("Polygon geometry must contain triangles.");
  }
  this._positions = outer;
  this._holes = holes;
  this._bottomPositions = bottom;
  this._origin = origin;
  this._closeTop = closeTop;
  this._closeBottom = closeBottom;
  this._localPositions = local;
  this._indices = indices;
  this._boundingSphere = BoundingSphere.fromPoints(local);
}

Object.defineProperties(SceneGISPlanarPolygonGeometry.prototype, {
  /**
   * Gets a cloned snapshot of the normalized outer top ring.
   *
   * @memberof SceneGISPlanarPolygonGeometry.prototype
   * @type {Cartesian3[]}
   * @readonly
   */
  positions: {
    get: function () {
      return this._positions.map((p) => Cartesian3.clone(p));
    },
  },
  /**
   * Gets cloned snapshots of the direct top hole rings.
   *
   * @memberof SceneGISPlanarPolygonGeometry.prototype
   * @type {Cartesian3[][]}
   * @readonly
   */
  holes: {
    get: function () {
      return this._holes.map((r) => r.map((p) => Cartesian3.clone(p)));
    },
  },
  /**
   * Gets a clone of the local origin in planar world coordinates.
   *
   * @memberof SceneGISPlanarPolygonGeometry.prototype
   * @type {Cartesian3}
   * @readonly
   */
  origin: {
    get: function () {
      return Cartesian3.clone(this._origin);
    },
  },
  /**
   * Gets whether the top cap is present.
   *
   * @memberof SceneGISPlanarPolygonGeometry.prototype
   * @type {boolean}
   * @readonly
   */
  closeTop: {
    get: function () {
      return this._closeTop;
    },
  },
  /**
   * Gets whether the bottom cap is present.
   *
   * @memberof SceneGISPlanarPolygonGeometry.prototype
   * @type {boolean}
   * @readonly
   */
  closeBottom: {
    get: function () {
      return this._closeBottom;
    },
  },
});

/** @private */
SceneGISPlanarPolygonGeometry.prototype._createGeometry = function () {
  const values = new Float64Array(this._localPositions.length * 3);
  for (let i = 0; i < this._localPositions.length; i++) {
    Cartesian3.pack(this._localPositions[i], values, i * 3);
  }
  return new Geometry({
    attributes: new GeometryAttributes({
      position: new GeometryAttribute({
        componentDatatype: ComponentDatatype.DOUBLE,
        componentsPerAttribute: 3,
        values,
      }),
    }),
    indices: IndexDatatype.createTypedArray(
      this._localPositions.length,
      this._indices,
    ),
    primitiveType: PrimitiveType.TRIANGLES,
    boundingSphere: BoundingSphere.clone(this._boundingSphere),
  });
};
/** @private */
SceneGISPlanarPolygonGeometry.prototype._getLocalBoundingSphere = function (
  result,
) {
  return BoundingSphere.clone(this._boundingSphere, result);
};

export default SceneGISPlanarPolygonGeometry;

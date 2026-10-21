import ArcType from "../../Core/ArcType.js";
import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import DeveloperError from "../../Core/DeveloperError.js";
import PolylineGeometry from "../../Core/PolylineGeometry.js";
import PolylineMaterialAppearance from "../../Scene/PolylineMaterialAppearance.js";

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

/**
 * A CPU-only immutable description of a straight planar polyline.
 * Material st.s is cumulative XYZ length / total length; ground rendering uses XY length.
 * st.t runs from right (0) to left (1): native screen expansion for ordinary lines,
 * XY width for ground lines. Repeating the first position
 * closes the miter join with one 1-to-0 UV seam. Every batch instance starts its own UV.
 *
 * @alias SceneGISPlanarPolylineGeometry
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {Cartesian3[]} options.positions Planar positions in meters.
 * @param {number} options.width The positive line width in pixels.
 * @param {Cartesian3} [options.origin] The local origin. The first normalized position is used by default.
 *
 * @exception {DeveloperError} positions must contain at least two distinct finite Cartesian3 values.
 * @exception {DeveloperError} width must be finite and greater than zero.
 * @exception {DeveloperError} origin must be a finite Cartesian3 when defined.
 */
function SceneGISPlanarPolylineGeometry(options) {
  options = options ?? {};
  const source = options.positions;
  if (!Array.isArray(source) || source.length < 2) {
    throw new DeveloperError("positions must contain at least two positions.");
  }
  const positions = [];
  for (let i = 0; i < source.length; i++) {
    const position = cloneFinitePosition(source[i], "positions");
    if (
      positions.length === 0 ||
      !Cartesian3.equals(position, positions[positions.length - 1])
    ) {
      positions.push(position);
    }
  }
  if (positions.length < 2) {
    throw new DeveloperError(
      "positions must contain at least two adjacent distinct positions.",
    );
  }
  const width = options.width;
  if (!Number.isFinite(width) || width <= 0.0) {
    throw new DeveloperError("width must be finite and greater than zero.");
  }
  const origin =
    options.origin === undefined
      ? Cartesian3.clone(positions[0])
      : cloneFinitePosition(options.origin, "origin");
  const localPositions = new Array(positions.length);
  for (let i = 0; i < positions.length; i++) {
    const local = Cartesian3.subtract(positions[i], origin, new Cartesian3());
    if (
      !Number.isFinite(local.x) ||
      !Number.isFinite(local.y) ||
      !Number.isFinite(local.z)
    ) {
      throw new DeveloperError("Local polyline positions must be finite.");
    }
    localPositions[i] = local;
  }

  this._positions = positions;
  this._localPositions = localPositions;
  this._origin = origin;
  this._width = width;
  this._boundingSphere = BoundingSphere.fromPoints(localPositions);
}

Object.defineProperties(SceneGISPlanarPolylineGeometry.prototype, {
  /**
   * Gets a cloned snapshot of the normalized world positions.
   *
   * @memberof SceneGISPlanarPolylineGeometry.prototype
   * @type {Cartesian3[]}
   * @readonly
   */
  positions: {
    get: function () {
      return this._positions.map((position) => Cartesian3.clone(position));
    },
  },
  /**
   * Gets the line width in pixels.
   *
   * @memberof SceneGISPlanarPolylineGeometry.prototype
   * @type {number}
   * @readonly
   */
  width: {
    get: function () {
      return this._width;
    },
  },
  /**
   * Gets a clone of the local origin in planar world coordinates.
   *
   * @memberof SceneGISPlanarPolylineGeometry.prototype
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
SceneGISPlanarPolylineGeometry.prototype._createGeometry = function () {
  const geometry = PolylineGeometry.createGeometry(
    new PolylineGeometry({
      positions: this._localPositions,
      width: this._width,
      arcType: ArcType.NONE,
      vertexFormat: PolylineMaterialAppearance.VERTEX_FORMAT,
    }),
  );
  // Remap the native index-based s after native duplicate removal. Keep its width/tessellation.
  const attributes = geometry.attributes;
  const positions = attributes.position.values;
  const st = attributes.st.values;
  const count = (positions.length / 3 + 4) / 4;
  const distances = [0];
  const points = [];
  for (let i = 0; i < count; ++i) {
    const index = i === 0 ? 0 : i * 4 - 2;
    points.push(Cartesian3.unpack(positions, index * 3, new Cartesian3()));
    if (i > 0) {
      distances.push(
        distances[i - 1] + Cartesian3.distance(points[i - 1], points[i]),
      );
    }
  }
  for (let i = 0; i < st.length; i += 2) {
    st[i] = distances[Math.round(st[i] * (count - 1))] / distances[count - 1];
  }
  if (Cartesian3.equals(points[0], points[count - 1])) {
    const previous = attributes.prevPosition.values;
    const next = attributes.nextPosition.values;
    for (let i = 0; i < 2; ++i) {
      Cartesian3.pack(points[count - 2], previous, i * 3);
      Cartesian3.pack(points[1], next, positions.length - 6 + i * 3);
    }
  }
  return geometry;
};

/** @private */
SceneGISPlanarPolylineGeometry.prototype._getLocalBoundingSphere = function (
  result,
) {
  return BoundingSphere.clone(this._boundingSphere, result);
};

/** @private */
SceneGISPlanarPolylineGeometry.prototype._getDrapeSource = function () {
  return {
    positions: this._positions,
    origin: this._origin,
    width: this._width,
  };
};

export default SceneGISPlanarPolylineGeometry;

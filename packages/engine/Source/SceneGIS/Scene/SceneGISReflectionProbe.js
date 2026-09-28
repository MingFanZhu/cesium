import Cartesian3 from "../../Core/Cartesian3.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Matrix3 from "../../Core/Matrix3.js";
import Matrix4 from "../../Core/Matrix4.js";

/**
 * An immutable local box for specular radiance and directional environment visibility.
 * Add it to a {@link SceneGISReflectionProbeCollection} and explicitly capture loaded models.
 * The center is both the capture position and the box origin. Keep it in empty space.
 * Visibility is a coarse directional approximation at that position, not per-point GI.
 *
 * @alias SceneGISReflectionProbe
 * @constructor
 * @param {object} options Probe placement.
 * @param {Matrix4} options.modelMatrix Rigid local-to-world transform: Cartesian in Planar, ECEF in Globe.
 * @param {Cartesian3} options.halfSize Positive box half extents in meters.
 * @param {number} [options.blendDistance] Boundary fade distance, default ten percent of the smallest half extent.
 * @param {number} [options.maximumDistance=200.0] Capture distance in meters, larger than the box radius.
 */
function SceneGISReflectionProbe(options = {}) {
  const matrix = options.modelMatrix;
  const half = options.halfSize;
  if (
    !matrix ||
    !Array.from({ length: 16 }, (_, i) => matrix[i]).every(Number.isFinite)
  ) {
    throw new DeveloperError("modelMatrix must be a finite rigid Matrix4.");
  }
  const rotation = Matrix4.getMatrix3(matrix, new Matrix3());
  const product = Matrix3.multiply(
    Matrix3.transpose(rotation, new Matrix3()),
    rotation,
    new Matrix3(),
  );
  if (
    !Matrix3.equalsEpsilon(product, Matrix3.IDENTITY, 1e-8) ||
    Math.abs(Matrix3.determinant(rotation) - 1) > 1e-8 ||
    matrix[3] !== 0 ||
    matrix[7] !== 0 ||
    matrix[11] !== 0 ||
    matrix[15] !== 1
  ) {
    throw new DeveloperError(
      "modelMatrix must have a proper rigid rotation and translation.",
    );
  }
  if (
    !half ||
    ![half.x, half.y, half.z].every((v) => Number.isFinite(v) && v > 0)
  ) {
    throw new DeveloperError("halfSize must contain positive finite meters.");
  }
  const blend =
    options.blendDistance ?? Cartesian3.minimumComponent(half) * 0.1;
  const distance = options.maximumDistance ?? 200;
  if (
    !Number.isFinite(blend) ||
    blend <= 0 ||
    blend > Cartesian3.minimumComponent(half)
  ) {
    throw new DeveloperError(
      "blendDistance must be positive and no larger than the smallest half extent.",
    );
  }
  if (!Number.isFinite(distance) || distance <= Cartesian3.magnitude(half)) {
    throw new DeveloperError("maximumDistance must exceed the box radius.");
  }
  this._modelMatrix = Object.freeze(Matrix4.clone(matrix));
  this._halfSize = Object.freeze(Cartesian3.clone(half));
  this._blendDistance = blend;
  this._maximumDistance = distance;
  this._inverse = Matrix4.inverseTransformation(matrix, new Matrix4());
  this._rotation = rotation;
  this._eyeToLocal = new Matrix4();
  this._owner = undefined;
  this._maps = undefined;
  this._generation = 0;
}

Object.defineProperties(SceneGISReflectionProbe.prototype, {
  /**
   * @memberof SceneGISReflectionProbe.prototype
   * @type {Matrix4}
   * @readonly
   */
  modelMatrix: {
    get() {
      return this._modelMatrix;
    },
  },
  /**
   * @memberof SceneGISReflectionProbe.prototype
   * @type {Cartesian3}
   * @readonly
   */
  halfSize: {
    get() {
      return this._halfSize;
    },
  },
  /**
   * @memberof SceneGISReflectionProbe.prototype
   * @type {number}
   * @readonly
   */
  blendDistance: {
    get() {
      return this._blendDistance;
    },
  },
  /**
   * @memberof SceneGISReflectionProbe.prototype
   * @type {number}
   * @readonly
   */
  maximumDistance: {
    get() {
      return this._maximumDistance;
    },
  },
  /**
   * Whether a complete capture is available.
   * @memberof SceneGISReflectionProbe.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get() {
      return !!this._maps;
    },
  },
  /**
   * Number of successful captures.
   * @memberof SceneGISReflectionProbe.prototype
   * @type {number}
   * @readonly
   */
  generation: {
    get() {
      return this._generation;
    },
  },
});

export default SceneGISReflectionProbe;

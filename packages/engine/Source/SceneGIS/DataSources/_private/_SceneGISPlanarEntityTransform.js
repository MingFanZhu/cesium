import Cartesian3 from "../../../Core/Cartesian3.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix3 from "../../../Core/Matrix3.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Quaternion from "../../../Core/Quaternion.js";

const scratchQuaternion = new Quaternion();
const scratchRotation = new Matrix3();

function normalizeQuaternion(quaternion, result) {
  if (!(quaternion instanceof Quaternion)) {
    throw new DeveloperError("orientation must be a Quaternion when defined.");
  }
  const maximum = Math.max(
    Math.abs(quaternion.x),
    Math.abs(quaternion.y),
    Math.abs(quaternion.z),
    Math.abs(quaternion.w),
  );
  if (!Number.isFinite(maximum) || maximum === 0.0) {
    throw new DeveloperError("orientation must be finite and nonzero.");
  }
  const magnitude = Math.hypot(
    quaternion.x / maximum,
    quaternion.y / maximum,
    quaternion.z / maximum,
    quaternion.w / maximum,
  );
  result.x = quaternion.x / maximum / magnitude;
  result.y = quaternion.y / maximum / magnitude;
  result.z = quaternion.z / maximum / magnitude;
  result.w = quaternion.w / maximum / magnitude;
  return result;
}

/**
 * Computes fixed-planar entity transforms without an ellipsoid or ENU frame.
 *
 * @alias SceneGISPlanarEntityTransform
 * @private
 */
const SceneGISPlanarEntityTransform = {
  computeRotation: function (orientation, result) {
    if (!(result instanceof Matrix4)) {
      throw new DeveloperError("result must be a Matrix4.");
    }
    if (orientation === undefined) {
      return Matrix4.clone(Matrix4.IDENTITY, result);
    }
    normalizeQuaternion(orientation, scratchQuaternion);
    Matrix3.fromQuaternion(scratchQuaternion, scratchRotation);
    Matrix4.fromRotationTranslation(scratchRotation, Cartesian3.ZERO, result);
    return result;
  },
  computeMatrix: function (position, orientation, result) {
    if (
      !(position instanceof Cartesian3) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z) ||
      !(result instanceof Matrix4)
    ) {
      throw new DeveloperError("position and result must be finite values.");
    }
    SceneGISPlanarEntityTransform.computeRotation(orientation, result);
    result[12] = position.x;
    result[13] = position.y;
    result[14] = position.z;
    for (let i = 0; i < 16; i++) {
      if (!Number.isFinite(result[i])) {
        throw new DeveloperError("The derived model matrix must be finite.");
      }
    }
    return result;
  },
};

export default SceneGISPlanarEntityTransform;

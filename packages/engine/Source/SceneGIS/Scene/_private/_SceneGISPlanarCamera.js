import Cartesian3 from "../../../Core/Cartesian3.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import CesiumMath from "../../../Core/Math.js";
import Matrix4 from "../../../Core/Matrix4.js";
import OrthographicFrustum from "../../../Core/OrthographicFrustum.js";
import OrthographicOffCenterFrustum from "../../../Core/OrthographicOffCenterFrustum.js";
import PerspectiveFrustum from "../../../Core/PerspectiveFrustum.js";
import PerspectiveOffCenterFrustum from "../../../Core/PerspectiveOffCenterFrustum.js";
import Ray from "../../../Core/Ray.js";

const scratchRight = new Cartesian3();
const scratchUp = new Cartesian3();
const scratchLocalPosition = new Cartesian3();
const scratchLocalDirection = new Cartesian3();
const scratchLocalUp = new Cartesian3();
const scratchLocalRight = new Cartesian3();
const scratchExpectedDirection = new Cartesian3();
const scratchExpectedUp = new Cartesian3();
const scratchExpectedRight = new Cartesian3();
const scratchInverseTransform = new Matrix4();
const scratchWorldPose = {
  position: new Cartesian3(),
  direction: new Cartesian3(),
  up: new Cartesian3(),
  right: new Cartesian3(),
};

function finiteCartesian3(value) {
  return (
    defined(value) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function validateBounds(bounds) {
  const horizontalSpan = bounds.right - bounds.left;
  const verticalSpan = bounds.top - bounds.bottom;
  const centerX = bounds.left * 0.5 + bounds.right * 0.5;
  const centerY = bounds.bottom * 0.5 + bounds.top * 0.5;
  if (
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.right) ||
    !Number.isFinite(bounds.bottom) ||
    !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.near) ||
    !Number.isFinite(bounds.far) ||
    bounds.left >= bounds.right ||
    bounds.bottom >= bounds.top ||
    bounds.near <= 0.0 ||
    bounds.near >= bounds.far ||
    !Number.isFinite(horizontalSpan) ||
    !Number.isFinite(verticalSpan) ||
    horizontalSpan <= 0.0 ||
    verticalSpan <= 0.0 ||
    !Number.isFinite(centerX) ||
    !Number.isFinite(centerY)
  ) {
    throw new DeveloperError("The camera frustum has invalid bounds.");
  }
  bounds.horizontalSpan = horizontalSpan;
  bounds.verticalSpan = verticalSpan;
  bounds.centerX = centerX;
  bounds.centerY = centerY;
  if (bounds.perspective) {
    const leftSlope = bounds.left / bounds.near;
    const rightSlope = bounds.right / bounds.near;
    const bottomSlope = bounds.bottom / bounds.near;
    const topSlope = bounds.top / bounds.near;
    const centerSlopeX = centerX / bounds.near;
    const centerSlopeY = centerY / bounds.near;
    const horizontalSlopeSpan = horizontalSpan / bounds.near;
    const verticalSlopeSpan = verticalSpan / bounds.near;
    if (
      !Number.isFinite(leftSlope) ||
      !Number.isFinite(rightSlope) ||
      !Number.isFinite(bottomSlope) ||
      !Number.isFinite(topSlope) ||
      !Number.isFinite(centerSlopeX) ||
      !Number.isFinite(centerSlopeY) ||
      !Number.isFinite(horizontalSlopeSpan) ||
      !Number.isFinite(verticalSlopeSpan) ||
      horizontalSlopeSpan <= 0.0 ||
      verticalSlopeSpan <= 0.0
    ) {
      throw new DeveloperError("The camera frustum has invalid slopes.");
    }
    bounds.leftSlope = leftSlope;
    bounds.rightSlope = rightSlope;
    bounds.bottomSlope = bottomSlope;
    bounds.topSlope = topSlope;
    bounds.centerSlopeX = centerSlopeX;
    bounds.centerSlopeY = centerSlopeY;
    bounds.horizontalSlopeSpan = horizontalSlopeSpan;
    bounds.verticalSlopeSpan = verticalSlopeSpan;
  }
  return bounds;
}

function robustNormalize(vector, result) {
  const scale = Math.max(
    Math.abs(vector.x),
    Math.abs(vector.y),
    Math.abs(vector.z),
  );
  if (!Number.isFinite(scale) || scale === 0.0) {
    throw new DeveloperError("The vector is not finite and non-degenerate.");
  }
  result = result ?? vector;
  result.x = vector.x / scale;
  result.y = vector.y / scale;
  result.z = vector.z / scale;
  const magnitude = Math.hypot(result.x, result.y, result.z);
  result.x /= magnitude;
  result.y /= magnitude;
  result.z /= magnitude;
  return result;
}

function isFrustumType(frustum, constructor, typeName) {
  const constructorName = frustum?.constructor?.name;
  return (
    frustum instanceof constructor ||
    (typeof constructorName === "string" && constructorName.endsWith(typeName))
  );
}

/**
 * Classifies a supported planar camera frustum and returns its effective bounds.
 *
 * @param {object} frustum The camera frustum.
 * @param {object} [result] The object in which to store the classification.
 * @returns {object} The classified effective bounds.
 * @private
 */
function getFrustumInfo(frustum, result) {
  let effective;
  let type;
  if (isFrustumType(frustum, PerspectiveFrustum, "PerspectiveFrustum")) {
    type = "perspective";
    effective = frustum.offCenterFrustum;
  } else if (
    isFrustumType(
      frustum,
      PerspectiveOffCenterFrustum,
      "PerspectiveOffCenterFrustum",
    )
  ) {
    type = "perspectiveOffCenter";
    effective = frustum;
  } else if (
    isFrustumType(frustum, OrthographicFrustum, "OrthographicFrustum")
  ) {
    type = "orthographic";
    effective = frustum.offCenterFrustum;
  } else if (
    isFrustumType(
      frustum,
      OrthographicOffCenterFrustum,
      "OrthographicOffCenterFrustum",
    )
  ) {
    type = "orthographicOffCenter";
    effective = frustum;
  } else {
    throw new DeveloperError(
      "The camera frustum must be a supported perspective or orthographic frustum.",
    );
  }

  result = result ?? {};
  result.type = type;
  result.perspective = type.startsWith("perspective");
  result.directOffCenter = type.endsWith("OffCenter");
  result.left = effective.left;
  result.right = effective.right;
  result.bottom = effective.bottom;
  result.top = effective.top;
  result.near = effective.near;
  result.far = effective.far;
  return validateBounds(result);
}

function getWorldPose(camera, result) {
  result = result ?? {
    position: new Cartesian3(),
    direction: new Cartesian3(),
    up: new Cartesian3(),
    right: new Cartesian3(),
  };
  if (defined(camera.transform) && defined(camera.position)) {
    Matrix4.multiplyByPoint(camera.transform, camera.position, result.position);
    Matrix4.multiplyByPointAsVector(
      camera.transform,
      camera.direction,
      result.direction,
    );
    Matrix4.multiplyByPointAsVector(camera.transform, camera.up, result.up);
    Matrix4.multiplyByPointAsVector(
      camera.transform,
      camera.right,
      result.right,
    );
  } else {
    Cartesian3.clone(camera.positionWC, result.position);
    Cartesian3.clone(camera.directionWC, result.direction);
    Cartesian3.clone(camera.upWC, result.up);
    Cartesian3.clone(camera.rightWC, result.right);
  }
  return result;
}

function validateCameraAxes(pose) {
  if (
    !finiteCartesian3(pose.position) ||
    !finiteCartesian3(pose.direction) ||
    !finiteCartesian3(pose.right) ||
    !finiteCartesian3(pose.up) ||
    Cartesian3.magnitudeSquared(pose.direction) === 0.0 ||
    Cartesian3.magnitudeSquared(pose.right) === 0.0 ||
    Cartesian3.magnitudeSquared(pose.up) === 0.0
  ) {
    throw new DeveloperError(
      "The camera must have finite, non-degenerate world axes.",
    );
  }
}

/**
 * Computes a world-space ray for any of the four supported Cesium frusta.
 *
 * @param {Camera} camera The camera.
 * @param {HTMLElement} element The element defining client-space dimensions.
 * @param {Cartesian2} windowPosition The client-space position with a top-left origin.
 * @param {Ray} [result] The object in which to store the ray.
 * @returns {Ray|undefined} The ray, or undefined for a zero-sized element.
 * @private
 */
function getWindowRay(camera, element, windowPosition, result) {
  const width = element.clientWidth;
  const height = element.clientHeight;
  if (width === 0 || height === 0) {
    return undefined;
  }
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 0 ||
    height < 0 ||
    !defined(windowPosition) ||
    !Number.isFinite(windowPosition.x) ||
    !Number.isFinite(windowPosition.y)
  ) {
    throw new DeveloperError(
      "The window position and element dimensions must be finite.",
    );
  }

  const info = getFrustumInfo(camera.frustum);
  const pose = getWorldPose(camera, scratchWorldPose);
  validateCameraAxes(pose);
  result = result ?? new Ray();

  const u = windowPosition.x / width;
  const v = 1.0 - windowPosition.y / height;
  const x = info.perspective
    ? info.leftSlope * (1.0 - u) + info.rightSlope * u
    : info.left + info.horizontalSpan * u;
  const y = info.perspective
    ? info.bottomSlope * (1.0 - v) + info.topSlope * v
    : info.bottom + info.verticalSpan * v;
  if (
    !Number.isFinite(u) ||
    !Number.isFinite(v) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    throw new DeveloperError(
      "The window ray has non-representable frustum coordinates.",
    );
  }

  Cartesian3.clone(pose.position, result.origin);
  if (info.perspective) {
    Cartesian3.clone(pose.direction, result.direction);
    Cartesian3.multiplyByScalar(pose.right, x, scratchRight);
    Cartesian3.add(result.direction, scratchRight, result.direction);
    Cartesian3.multiplyByScalar(pose.up, y, scratchUp);
    Cartesian3.add(result.direction, scratchUp, result.direction);
    robustNormalize(result.direction, result.direction);
  } else {
    Cartesian3.multiplyByScalar(pose.right, x, scratchRight);
    Cartesian3.add(result.origin, scratchRight, result.origin);
    Cartesian3.multiplyByScalar(pose.up, y, scratchUp);
    Cartesian3.add(result.origin, scratchUp, result.origin);
    robustNormalize(pose.direction, result.direction);
  }
  return result;
}

/**
 * Intersects a ray with the infinite Z=0 plane.
 *
 * @param {Ray} ray The ray.
 * @param {Cartesian3} [result] The object in which to store the point.
 * @returns {Cartesian3|undefined} The forward intersection.
 * @private
 */
function intersectPlane(ray, result) {
  const denominator = ray.direction.z;
  if (denominator === 0.0) {
    return undefined;
  }
  const t = -ray.origin.z / denominator;
  if (!Number.isFinite(t) || t < 0.0) {
    return undefined;
  }
  const x = ray.origin.x + ray.direction.x * t;
  const y = ray.origin.y + ray.direction.y * t;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }
  result = result ?? new Cartesian3();
  result.x = x;
  result.y = y;
  result.z = 0.0;
  return result;
}

/**
 * Writes a finite world-space camera pose through the current Camera transform.
 *
 * @param {Camera} camera The camera.
 * @param {Cartesian3} position The world position.
 * @param {Cartesian3} direction The world direction.
 * @param {Cartesian3} up The world up vector.
 * @private
 */
function validateWorldPose(camera, position, direction, up) {
  const inverse = defined(camera.transform)
    ? Matrix4.inverseTransformation(camera.transform, scratchInverseTransform)
    : camera.inverseTransform;
  Matrix4.multiplyByPoint(inverse, position, scratchLocalPosition);
  Matrix4.multiplyByPointAsVector(inverse, direction, scratchLocalDirection);
  Matrix4.multiplyByPointAsVector(inverse, up, scratchLocalUp);
  Cartesian3.cross(scratchLocalDirection, scratchLocalUp, scratchLocalRight);
  if (
    !finiteCartesian3(scratchLocalPosition) ||
    !finiteCartesian3(scratchLocalDirection) ||
    !finiteCartesian3(scratchLocalUp) ||
    !finiteCartesian3(scratchLocalRight) ||
    Cartesian3.magnitudeSquared(scratchLocalDirection) === 0.0 ||
    Cartesian3.magnitudeSquared(scratchLocalUp) === 0.0 ||
    Cartesian3.magnitudeSquared(scratchLocalRight) === 0.0
  ) {
    throw new DeveloperError("The planar camera pose is not representable.");
  }
}

function setWorldPose(camera, position, direction, up) {
  validateWorldPose(camera, position, direction, up);
  Cartesian3.normalize(scratchLocalDirection, scratchLocalDirection);
  Cartesian3.normalize(scratchLocalUp, scratchLocalUp);
  Cartesian3.normalize(scratchLocalRight, scratchLocalRight);
  Cartesian3.clone(scratchLocalPosition, camera.position);
  Cartesian3.clone(scratchLocalDirection, camera.direction);
  Cartesian3.clone(scratchLocalUp, camera.up);
  Cartesian3.clone(scratchLocalRight, camera.right);
}

function getExtentCenter(extent, result) {
  result = result ?? new Cartesian3();
  result.x = extent.minimumX + (extent.maximumX - extent.minimumX) * 0.5;
  result.y = extent.minimumY + (extent.maximumY - extent.minimumY) * 0.5;
  result.z = 0.0;
  return result;
}

function clampTarget(extent, target, result) {
  result = result ?? new Cartesian3();
  result.x = CesiumMath.clamp(target.x, extent.minimumX, extent.maximumX);
  result.y = CesiumMath.clamp(target.y, extent.minimumY, extent.maximumY);
  result.z = 0.0;
  return result;
}

function getAxes(heading, pitch, direction, up, right) {
  const cosinePitch = Math.cos(pitch);
  direction.x = Math.sin(heading) * cosinePitch;
  direction.y = Math.cos(heading) * cosinePitch;
  direction.z = Math.sin(pitch);
  Cartesian3.normalize(direction, direction);
  Cartesian3.cross(direction, Cartesian3.UNIT_Z, right);
  if (Cartesian3.magnitudeSquared(right) === 0.0) {
    right.x = Math.cos(heading);
    right.y = -Math.sin(heading);
    right.z = 0.0;
  } else {
    Cartesian3.normalize(right, right);
  }
  Cartesian3.cross(right, direction, up);
  Cartesian3.normalize(up, up);
}

function getHeadingPitch(camera) {
  const pose = getWorldPose(camera, scratchWorldPose);
  validateCameraAxes(pose);
  const direction = Cartesian3.normalize(
    pose.direction,
    scratchExpectedDirection,
  );
  const horizontalMagnitude = Math.hypot(direction.x, direction.y);
  let heading;
  if (horizontalMagnitude > CesiumMath.EPSILON12) {
    heading = Math.atan2(direction.x, direction.y);
  } else {
    const up = Cartesian3.normalize(pose.up, scratchExpectedUp);
    heading = Math.atan2(up.x, up.y);
  }
  const pitch = Math.asin(CesiumMath.clamp(direction.z, -1.0, 1.0));
  getAxes(
    heading,
    pitch,
    scratchExpectedDirection,
    scratchExpectedUp,
    scratchExpectedRight,
  );
  const actualUp = Cartesian3.normalize(pose.up, scratchLocalUp);
  const actualRight = Cartesian3.normalize(pose.right, scratchLocalRight);
  Cartesian3.cross(direction, actualUp, scratchRight);
  const orthogonalityError = Math.max(
    Math.abs(Cartesian3.dot(direction, actualUp)),
    Math.abs(Cartesian3.dot(direction, actualRight)),
    Math.abs(Cartesian3.dot(actualUp, actualRight)),
    Math.abs(1.0 - Cartesian3.dot(scratchRight, actualRight)),
  );
  return {
    heading: CesiumMath.zeroToTwoPi(heading),
    pitch: pitch,
    roll:
      horizontalMagnitude <= CesiumMath.EPSILON12
        ? 0.0
        : Math.atan2(
            Cartesian3.dot(actualUp, scratchExpectedRight),
            Cartesian3.dot(actualUp, scratchExpectedUp),
          ),
    valid: orthogonalityError <= CesiumMath.EPSILON8,
  };
}

function scaleOrthographicFrustum(frustum, factor) {
  if (!Number.isFinite(factor) || factor <= 0.0) {
    throw new DeveloperError(
      "The orthographic scale must be finite and positive.",
    );
  }
  if (isFrustumType(frustum, OrthographicFrustum, "OrthographicFrustum")) {
    const width = frustum.width * factor;
    if (!Number.isFinite(width) || width <= 0.0) {
      throw new DeveloperError("The scaled orthographic frustum is invalid.");
    }
    frustum.width = width;
  } else if (
    isFrustumType(
      frustum,
      OrthographicOffCenterFrustum,
      "OrthographicOffCenterFrustum",
    )
  ) {
    const left = frustum.left * factor;
    const right = frustum.right * factor;
    const bottom = frustum.bottom * factor;
    const top = frustum.top * factor;
    validateBounds({
      perspective: false,
      left: left,
      right: right,
      bottom: bottom,
      top: top,
      near: frustum.near,
      far: frustum.far,
    });
    frustum.left = left;
    frustum.right = right;
    frustum.bottom = bottom;
    frustum.top = top;
  } else {
    throw new DeveloperError("The camera frustum is not orthographic.");
  }
}

/** @private */
const SceneGISPlanarCamera = {
  clampTarget: clampTarget,
  getAxes: getAxes,
  getExtentCenter: getExtentCenter,
  getFrustumInfo: getFrustumInfo,
  getHeadingPitch: getHeadingPitch,
  getWorldPose: getWorldPose,
  getWindowRay: getWindowRay,
  intersectPlane: intersectPlane,
  robustNormalize: robustNormalize,
  scaleOrthographicFrustum: scaleOrthographicFrustum,
  setWorldPose: setWorldPose,
  validateWorldPose: validateWorldPose,
};

export default SceneGISPlanarCamera;

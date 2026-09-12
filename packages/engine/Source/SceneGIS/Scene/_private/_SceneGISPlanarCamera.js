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
import Rectangle from "../../../Core/Rectangle.js";
import SceneMode from "../../../Scene/SceneMode.js";
import SceneGISPlanarWorld from "../SceneGISPlanarWorld.js";

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
const scratchCandidatePosition = new Cartesian3();
const scratchCandidateDirection = new Cartesian3();
const scratchCandidateUp = new Cartesian3();
const scratchCandidateRight = new Cartesian3();
const scratchProjection = new Cartesian3();
const scratchOffset = new Cartesian3();
const scratchTranslation = new Matrix4();
const scratchHeadingPitchRoll = {
  heading: 0.0,
  pitch: 0.0,
  roll: 0.0,
  valid: false,
};
const scratchBoundingSphereState = {
  position: new Cartesian3(),
  direction: new Cartesian3(),
  up: new Cartesian3(),
  right: new Cartesian3(),
};
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

function validatePlanarCamera(camera) {
  const scene = camera?._scene;
  const world = scene?.world;
  if (!(world instanceof SceneGISPlanarWorld)) {
    throw new DeveloperError(
      "The Camera must belong to a Scene with a SceneGISPlanarWorld.",
    );
  }
  if (world.isDestroyed()) {
    throw new DeveloperError("The SceneGISPlanarWorld has been destroyed.");
  }
  if (scene.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError(
      "Planar Camera view APIs require SceneMode.SCENE3D.",
    );
  }
  getFrustumInfo(camera.frustum, scratchFrustumInfo);
  return world;
}

const scratchFrustumInfo = {};

function isPlanarCamera(camera) {
  return camera?._scene?.world instanceof SceneGISPlanarWorld;
}

function throwIfGlobeOnly(camera, methodName) {
  const scene = camera?._scene;
  const world = scene?.world;
  if (
    defined(world) &&
    !defined(scene.globe) &&
    typeof world.isDestroyed === "function" &&
    !world.isDestroyed()
  ) {
    throw new DeveloperError(
      `Camera.${methodName} is not supported with a non-Globe world. Use fixed-axis Cartesian Camera APIs instead.`,
    );
  }
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
function validateWorldPose(camera, position, direction, up, transform) {
  computeLocalPose(
    transform ?? camera.transform ?? Matrix4.IDENTITY,
    position,
    direction,
    up,
    scratchLocalPose,
  );
}

function computeLocalPose(transform, position, direction, up, result) {
  if (!finiteCartesian3(position) || !finiteCartesian3(direction)) {
    throw new DeveloperError("The planar camera pose must be finite.");
  }
  robustNormalize(direction, scratchCandidateDirection);
  if (!finiteCartesian3(up)) {
    throw new DeveloperError("The planar camera up vector must be finite.");
  }
  const projection = Cartesian3.dot(up, scratchCandidateDirection);
  Cartesian3.multiplyByScalar(
    scratchCandidateDirection,
    projection,
    scratchProjection,
  );
  Cartesian3.subtract(up, scratchProjection, scratchCandidateUp);
  robustNormalize(scratchCandidateUp, scratchCandidateUp);
  Cartesian3.cross(
    scratchCandidateDirection,
    scratchCandidateUp,
    scratchCandidateRight,
  );
  robustNormalize(scratchCandidateRight, scratchCandidateRight);
  Cartesian3.cross(
    scratchCandidateRight,
    scratchCandidateDirection,
    scratchCandidateUp,
  );
  robustNormalize(scratchCandidateUp, scratchCandidateUp);

  const inverse = Matrix4.inverseTransformation(
    transform,
    scratchInverseTransform,
  );
  Matrix4.multiplyByPoint(inverse, position, result.position);
  Matrix4.multiplyByPointAsVector(
    inverse,
    scratchCandidateDirection,
    result.direction,
  );
  Matrix4.multiplyByPointAsVector(inverse, scratchCandidateUp, result.up);
  Matrix4.multiplyByPointAsVector(inverse, scratchCandidateRight, result.right);
  if (
    !finiteCartesian3(result.position) ||
    !finiteCartesian3(result.direction) ||
    !finiteCartesian3(result.up) ||
    !finiteCartesian3(result.right)
  ) {
    throw new DeveloperError("The planar camera pose is not representable.");
  }
  robustNormalize(result.direction, result.direction);
  robustNormalize(result.up, result.up);
  robustNormalize(result.right, result.right);
  return result;
}

const scratchLocalPose = {
  position: scratchLocalPosition,
  direction: scratchLocalDirection,
  up: scratchLocalUp,
  right: scratchLocalRight,
};

function setWorldPose(camera, position, direction, up, transform) {
  transform = transform ?? camera.transform ?? Matrix4.IDENTITY;
  computeLocalPose(transform, position, direction, up, scratchLocalPose);
  if (!Matrix4.equals(camera.transform, transform)) {
    camera._setTransform(transform);
  }
  Cartesian3.clone(scratchLocalPose.position, camera.position);
  Cartesian3.clone(scratchLocalPose.direction, camera.direction);
  Cartesian3.clone(scratchLocalPose.up, camera.up);
  Cartesian3.clone(scratchLocalPose.right, camera.right);
}

function getExtentCenter(extent, result) {
  result = result ?? new Cartesian3();
  result.x = extent.minimumX + (extent.maximumX - extent.minimumX) * 0.5;
  result.y = extent.minimumY + (extent.maximumY - extent.minimumY) * 0.5;
  result.z = 0.0;
  return result;
}

function computeHomeState(camera, element, extent, padding, result) {
  validatePlanarCamera(camera);
  if (
    !defined(element) ||
    !Number.isFinite(element.clientWidth) ||
    !Number.isFinite(element.clientHeight) ||
    element.clientWidth <= 0.0 ||
    element.clientHeight <= 0.0
  ) {
    throw new DeveloperError(
      "The planar home viewport must have a positive finite size.",
    );
  }
  if (!Number.isFinite(padding) || padding < 1.0) {
    throw new DeveloperError(
      "The planar home padding must be finite and at least 1.0.",
    );
  }
  result = result ?? {
    info: {},
    target: new Cartesian3(),
    position: new Cartesian3(),
  };
  const info = getFrustumInfo(camera.frustum, result.info);
  const target = getExtentCenter(extent, result.target);
  const halfWidth = extent.width * padding * 0.5;
  const halfHeight = extent.height * padding * 0.5;
  if (
    !Number.isFinite(halfWidth) ||
    !Number.isFinite(halfHeight) ||
    halfWidth <= 0.0 ||
    halfHeight <= 0.0
  ) {
    throw new DeveloperError("The padded planar extent is not representable.");
  }

  let distance;
  let orthographicScale;
  if (info.perspective) {
    distance = Math.max(
      halfWidth / (info.horizontalSlopeSpan * 0.5),
      halfHeight / (info.verticalSlopeSpan * 0.5),
      info.near * (1.0 + CesiumMath.EPSILON8),
    );
  } else {
    orthographicScale = Math.max(
      (halfWidth * 2.0) / info.horizontalSpan,
      (halfHeight * 2.0) / info.verticalSpan,
    );
    distance = info.near + (info.far - info.near) * 0.5;
  }
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(orthographicScale ?? 1.0) ||
    distance <= info.near ||
    distance >= info.far
  ) {
    throw new DeveloperError(
      "The camera near/far range cannot contain the planar home view.",
    );
  }
  const scale = orthographicScale ?? 1.0;
  result.position.x =
    target.x -
    (info.perspective ? distance * info.centerSlopeX : info.centerX * scale);
  result.position.y =
    target.y -
    (info.perspective ? distance * info.centerSlopeY : info.centerY * scale);
  result.position.z = distance;
  if (!finiteCartesian3(result.position)) {
    throw new DeveloperError(
      "The planar home camera position is not representable.",
    );
  }
  result.heading = 0.0;
  result.pitch = -CesiumMath.PI_OVER_TWO;
  result.roll = 0.0;
  result.orthographicScale = orthographicScale;
  result.maximumRange = info.perspective
    ? distance * Math.hypot(info.centerSlopeX, info.centerSlopeY, 1.0)
    : info.verticalSpan * orthographicScale;
  return result;
}

function clampTarget(extent, target, result) {
  result = result ?? new Cartesian3();
  result.x = CesiumMath.clamp(target.x, extent.minimumX, extent.maximumX);
  result.y = CesiumMath.clamp(target.y, extent.minimumY, extent.maximumY);
  result.z = 0.0;
  return result;
}

function getAxes(heading, pitch, direction, up, right, roll) {
  roll = roll ?? 0.0;
  if (
    !Number.isFinite(heading) ||
    !Number.isFinite(pitch) ||
    !Number.isFinite(roll)
  ) {
    throw new DeveloperError(
      "The planar camera heading, pitch, and roll must be finite.",
    );
  }
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
  if (roll !== 0.0) {
    const cosineRoll = Math.cos(roll);
    const sineRoll = Math.sin(roll);
    Cartesian3.clone(up, scratchExpectedUp);
    Cartesian3.clone(right, scratchExpectedRight);
    Cartesian3.multiplyByScalar(up, cosineRoll, up);
    Cartesian3.multiplyByScalar(
      scratchExpectedRight,
      sineRoll,
      scratchProjection,
    );
    Cartesian3.add(up, scratchProjection, up);
    Cartesian3.multiplyByScalar(right, cosineRoll, right);
    Cartesian3.multiplyByScalar(
      scratchExpectedUp,
      -sineRoll,
      scratchProjection,
    );
    Cartesian3.add(right, scratchProjection, right);
    robustNormalize(up, up);
    robustNormalize(right, right);
  }
}

function getHeadingPitch(camera, result) {
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
    const directionSign = direction.z > 0.0 ? -1.0 : 1.0;
    heading = Math.atan2(up.x * directionSign, up.y * directionSign);
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
  result = result ?? {};
  result.heading = CesiumMath.zeroToTwoPi(heading);
  result.pitch = pitch;
  result.roll =
    horizontalMagnitude <= CesiumMath.EPSILON12
      ? 0.0
      : Math.atan2(
          Cartesian3.dot(actualUp, scratchExpectedRight),
          Cartesian3.dot(actualUp, scratchExpectedUp),
        );
  result.valid = orthogonalityError <= CesiumMath.EPSILON8;
  return result;
}

function validateTransform(transform) {
  if (!defined(transform)) {
    return;
  }
  for (let i = 0; i < 16; ++i) {
    if (!Number.isFinite(transform[i])) {
      throw new DeveloperError(
        "The planar camera transform must have finite components.",
      );
    }
  }
}

function getHeadingPitchRoll(camera, result) {
  validatePlanarCamera(camera);
  const pose = getHeadingPitch(camera, result ?? scratchHeadingPitchRoll);
  if (!pose.valid) {
    throw new DeveloperError(
      "The planar camera axes must form an orthonormal basis.",
    );
  }
  return pose;
}

function setView(camera, options) {
  validatePlanarCamera(camera);
  options = options ?? {};
  const destination = options.destination ?? camera.positionWC;
  if (destination instanceof Rectangle || defined(destination?.west)) {
    throw new DeveloperError(
      "Rectangle destinations are not supported by a planar Camera.",
    );
  }
  if (!finiteCartesian3(destination)) {
    throw new DeveloperError(
      "The planar Camera destination must be a finite Cartesian3.",
    );
  }
  const transform = options.endTransform ?? camera.transform;
  validateTransform(transform);
  const orientation = options.orientation ?? {};
  const hasDirection = defined(orientation.direction);
  const hasUp = defined(orientation.up);
  if (hasDirection !== hasUp) {
    throw new DeveloperError(
      "Planar Camera orientation.direction and orientation.up must be provided together.",
    );
  }
  if (hasDirection) {
    computeLocalPose(
      transform,
      destination,
      orientation.direction,
      orientation.up,
      scratchLocalPose,
    );
  } else {
    const heading = orientation.heading ?? 0.0;
    const pitch = orientation.pitch ?? -CesiumMath.PI_OVER_TWO;
    const roll = orientation.roll ?? 0.0;
    getAxes(
      heading,
      pitch,
      scratchCandidateDirection,
      scratchCandidateUp,
      scratchCandidateRight,
      roll,
    );
    computeLocalPose(
      transform,
      destination,
      scratchCandidateDirection,
      scratchCandidateUp,
      scratchLocalPose,
    );
  }
  if (!Matrix4.equals(camera.transform, transform)) {
    camera._setTransform(transform);
  }
  Cartesian3.clone(scratchLocalPose.position, camera.position);
  Cartesian3.clone(scratchLocalPose.direction, camera.direction);
  Cartesian3.clone(scratchLocalPose.up, camera.up);
  Cartesian3.clone(scratchLocalPose.right, camera.right);
}

function lookAt(camera, target, offset) {
  validatePlanarCamera(camera);
  if (!finiteCartesian3(target)) {
    throw new DeveloperError(
      "The planar Camera lookAt target must be a finite Cartesian3.",
    );
  }
  if (!defined(offset)) {
    throw new DeveloperError("offset is required");
  }

  let direction;
  let up;
  let range;
  if (defined(offset.heading)) {
    if (
      !Number.isFinite(offset.heading) ||
      !Number.isFinite(offset.pitch) ||
      !Number.isFinite(offset.range) ||
      offset.range <= 0.0
    ) {
      throw new DeveloperError(
        "The planar Camera HeadingPitchRange must be finite with a positive range.",
      );
    }
    getAxes(
      offset.heading,
      offset.pitch,
      scratchCandidateDirection,
      scratchCandidateUp,
      scratchCandidateRight,
      0.0,
    );
    Cartesian3.multiplyByScalar(
      scratchCandidateDirection,
      -offset.range,
      scratchOffset,
    );
    Cartesian3.add(target, scratchOffset, scratchCandidatePosition);
    direction = scratchCandidateDirection;
    up = scratchCandidateUp;
    range = offset.range;
  } else {
    if (!finiteCartesian3(offset)) {
      throw new DeveloperError(
        "The planar Camera Cartesian offset must be finite.",
      );
    }
    const offsetMagnitude = Math.hypot(offset.x, offset.y, offset.z);
    if (!Number.isFinite(offsetMagnitude) || offsetMagnitude === 0.0) {
      throw new DeveloperError(
        "The planar Camera Cartesian offset must be non-zero.",
      );
    }
    Cartesian3.add(target, offset, scratchCandidatePosition);
    Cartesian3.negate(offset, scratchCandidateDirection);
    robustNormalize(scratchCandidateDirection, scratchCandidateDirection);
    const horizontal = Math.hypot(
      scratchCandidateDirection.x,
      scratchCandidateDirection.y,
    );
    const heading =
      horizontal > CesiumMath.EPSILON12
        ? Math.atan2(scratchCandidateDirection.x, scratchCandidateDirection.y)
        : 0.0;
    const pitch = Math.asin(
      CesiumMath.clamp(scratchCandidateDirection.z, -1.0, 1.0),
    );
    getAxes(
      heading,
      pitch,
      scratchCandidateDirection,
      scratchCandidateUp,
      scratchCandidateRight,
      0.0,
    );
    direction = scratchCandidateDirection;
    up = scratchCandidateUp;
    range = offsetMagnitude;
  }

  if (
    isFrustumType(camera.frustum, OrthographicFrustum, "OrthographicFrustum") &&
    (!Number.isFinite(range) || range <= 0.0)
  ) {
    throw new DeveloperError(
      "The planar Camera lookAt range must be finite and positive.",
    );
  }

  Matrix4.fromTranslation(target, scratchTranslation);
  setWorldPose(
    camera,
    scratchCandidatePosition,
    direction,
    up,
    scratchTranslation,
  );
  if (
    isFrustumType(camera.frustum, OrthographicFrustum, "OrthographicFrustum")
  ) {
    camera.frustum.width = range;
  }
}

function validateBoundingSphere(boundingSphere) {
  if (
    !defined(boundingSphere) ||
    !finiteCartesian3(boundingSphere.center) ||
    !Number.isFinite(boundingSphere.radius) ||
    boundingSphere.radius < 0.0
  ) {
    throw new DeveloperError(
      "The planar Camera bounding sphere must have a finite center and non-negative radius.",
    );
  }
}

function computeBoundingSphereState(camera, boundingSphere, offset, result) {
  validatePlanarCamera(camera);
  validateBoundingSphere(boundingSphere);
  offset = offset ?? {
    heading: 0.0,
    pitch: -CesiumMath.PI_OVER_FOUR,
    range: 0.0,
  };
  if (
    !Number.isFinite(offset.heading) ||
    !Number.isFinite(offset.pitch) ||
    !Number.isFinite(offset.range) ||
    offset.range < 0.0
  ) {
    throw new DeveloperError(
      "The planar Camera bounding-sphere offset must be finite with a non-negative range.",
    );
  }
  const info = getFrustumInfo(camera.frustum, scratchFrustumInfo);
  const radius = boundingSphere.radius;
  let range = offset.range;
  let orthographicScale;
  if (info.perspective) {
    const leftMargin = info.centerSlopeX - info.leftSlope;
    const rightMargin = info.rightSlope - info.centerSlopeX;
    const bottomMargin = info.centerSlopeY - info.bottomSlope;
    const topMargin = info.topSlope - info.centerSlopeY;
    if (range === 0.0) {
      range = Math.max(
        100.0,
        info.near + radius * (1.0 + CesiumMath.EPSILON8),
        (radius * Math.hypot(1.0, info.leftSlope)) / leftMargin,
        (radius * Math.hypot(1.0, info.rightSlope)) / rightMargin,
        (radius * Math.hypot(1.0, info.bottomSlope)) / bottomMargin,
        (radius * Math.hypot(1.0, info.topSlope)) / topMargin,
      );
    }
  } else {
    const halfWidth = info.horizontalSpan * 0.5;
    const halfHeight = info.verticalSpan * 0.5;
    orthographicScale = Math.max(1.0, radius / halfWidth, radius / halfHeight);
    if (range === 0.0) {
      range = info.near + (info.far - info.near) * 0.5;
    }
  }
  if (
    !Number.isFinite(range) ||
    range <= info.near + radius ||
    range + radius >= info.far
  ) {
    throw new DeveloperError(
      "The camera near/far range cannot contain the planar bounding sphere.",
    );
  }
  result = result ?? {
    position: new Cartesian3(),
    direction: new Cartesian3(),
    up: new Cartesian3(),
    right: new Cartesian3(),
  };
  getAxes(
    offset.heading,
    offset.pitch,
    result.direction,
    result.up,
    result.right,
    0.0,
  );
  Cartesian3.multiplyByScalar(result.direction, -range, scratchOffset);
  Cartesian3.add(boundingSphere.center, scratchOffset, result.position);
  if (info.perspective) {
    Cartesian3.multiplyByScalar(
      result.right,
      -info.centerSlopeX * range,
      scratchOffset,
    );
    Cartesian3.add(result.position, scratchOffset, result.position);
    Cartesian3.multiplyByScalar(
      result.up,
      -info.centerSlopeY * range,
      scratchOffset,
    );
    Cartesian3.add(result.position, scratchOffset, result.position);
  } else {
    Cartesian3.multiplyByScalar(
      result.right,
      -info.centerX * orthographicScale,
      scratchOffset,
    );
    Cartesian3.add(result.position, scratchOffset, result.position);
    Cartesian3.multiplyByScalar(
      result.up,
      -info.centerY * orthographicScale,
      scratchOffset,
    );
    Cartesian3.add(result.position, scratchOffset, result.position);
  }
  result.heading = offset.heading;
  result.pitch = offset.pitch;
  result.roll = 0.0;
  result.range = range;
  result.orthographicScale = orthographicScale;
  return result;
}

function applyBoundingSphereState(camera, state, transform) {
  setWorldPose(
    camera,
    state.position,
    state.direction,
    state.up,
    transform ?? Matrix4.IDENTITY,
  );
  if (defined(state.orthographicScale)) {
    scaleOrthographicFrustum(camera.frustum, state.orthographicScale);
  }
}

function viewBoundingSphere(camera, boundingSphere, offset) {
  const state = computeBoundingSphereState(
    camera,
    boundingSphere,
    offset,
    scratchBoundingSphereState,
  );
  Matrix4.fromTranslation(boundingSphere.center, scratchTranslation);
  applyBoundingSphereState(camera, state, scratchTranslation);
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
  applyBoundingSphereState: applyBoundingSphereState,
  clampTarget: clampTarget,
  computeBoundingSphereState: computeBoundingSphereState,
  computeHomeState: computeHomeState,
  getAxes: getAxes,
  getExtentCenter: getExtentCenter,
  getFrustumInfo: getFrustumInfo,
  getHeadingPitch: getHeadingPitch,
  getHeadingPitchRoll: getHeadingPitchRoll,
  getWorldPose: getWorldPose,
  getWindowRay: getWindowRay,
  intersectPlane: intersectPlane,
  isPlanarCamera: isPlanarCamera,
  lookAt: lookAt,
  robustNormalize: robustNormalize,
  scaleOrthographicFrustum: scaleOrthographicFrustum,
  setView: setView,
  setWorldPose: setWorldPose,
  throwIfGlobeOnly: throwIfGlobeOnly,
  validatePlanarCamera: validatePlanarCamera,
  validateWorldPose: validateWorldPose,
  viewBoundingSphere: viewBoundingSphere,
};

export default SceneGISPlanarCamera;

import Cartesian3 from "../../../Core/Cartesian3.js";
import Check from "../../../Core/Check.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";

const globeMode = "globe";
const planarMode = "planar";
const perspectiveProjection = "perspective";
const orthographicProjection = "orthographic";
const minimumMagnitudeSquared = 1.0e-24;

function isFiniteCartesian3(value) {
  return (
    defined(value) &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function validateStorage(name, value) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object(name, value);
  const vectorNames = [
    "cameraPosition",
    "cameraDirection",
    "cameraUp",
    "cameraRight",
    "surfacePosition",
    "east",
    "north",
    "vertical",
    "ellipsoidCenter",
    "ellipsoidRadii",
  ];
  for (let i = 0; i < vectorNames.length; i++) {
    if (!defined(value[vectorNames[i]])) {
      throw new DeveloperError(`${name}.${vectorNames[i]} is required.`);
    }
  }
  //>>includeEnd('debug');
}

function validateLiveScene(scene) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("options.scene", scene);
  if (
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed() ||
    !defined(scene.camera)
  ) {
    throw new DeveloperError("options.scene must be a live Scene.");
  }
  //>>includeEnd('debug');
}

function validateCameraVector(name, value, allowZero) {
  //>>includeStart('debug', pragmas.debug);
  if (
    !isFiniteCartesian3(value) ||
    (!allowZero &&
      Cartesian3.magnitudeSquared(value) <= minimumMagnitudeSquared)
  ) {
    throw new DeveloperError(`${name} must be a finite Cartesian3.`);
  }
  //>>includeEnd('debug');
}

function getProjection(frustum) {
  const projectionMatrix = frustum.projectionMatrix;
  if (defined(projectionMatrix) && projectionMatrix[15] === 0.0) {
    return perspectiveProjection;
  }
  if (defined(projectionMatrix) && projectionMatrix[15] === 1.0) {
    return orthographicProjection;
  }

  //>>includeStart('debug', pragmas.debug);
  throw new DeveloperError("The Camera frustum is not supported.");
  //>>includeEnd('debug');
}

function publishCamera(scene, candidate) {
  const camera = scene.camera;
  const position = camera.positionWC;
  const direction = camera.directionWC;
  const up = camera.upWC;
  const right = camera.rightWC;

  validateCameraVector("Camera.positionWC", position, true);
  validateCameraVector("Camera.directionWC", direction, false);
  validateCameraVector("Camera.upWC", up, false);
  validateCameraVector("Camera.rightWC", right, false);

  Cartesian3.clone(position, candidate.cameraPosition);
  Cartesian3.clone(direction, candidate.cameraDirection);
  Cartesian3.clone(up, candidate.cameraUp);
  Cartesian3.clone(right, candidate.cameraRight);
  candidate.projection = getProjection(camera.frustum);
}

function publishGlobe(scene, candidate) {
  const globe = scene.globe;
  //>>includeStart('debug', pragmas.debug);
  if (
    !defined(globe) ||
    scene.world !== globe ||
    (typeof globe.isDestroyed === "function" && globe.isDestroyed())
  ) {
    throw new DeveloperError("globe mode requires a live Globe Scene.");
  }
  //>>includeEnd('debug');

  const ellipsoid = scene.ellipsoid;
  const position = candidate.cameraPosition;
  const surface = ellipsoid.scaleToGeodeticSurface(
    position,
    candidate.surfacePosition,
  );
  //>>includeStart('debug', pragmas.debug);
  if (!defined(surface)) {
    throw new DeveloperError(
      "The Globe Camera position must resolve to an ellipsoid surface.",
    );
  }
  //>>includeEnd('debug');

  ellipsoid.geodeticSurfaceNormal(surface, candidate.vertical);
  Cartesian3.cross(Cartesian3.UNIT_Z, candidate.vertical, candidate.east);
  if (Cartesian3.magnitudeSquared(candidate.east) <= minimumMagnitudeSquared) {
    Cartesian3.cross(Cartesian3.UNIT_Y, candidate.vertical, candidate.east);
  }
  Cartesian3.normalize(candidate.east, candidate.east);
  Cartesian3.cross(candidate.vertical, candidate.east, candidate.north);
  Cartesian3.normalize(candidate.north, candidate.north);

  const dx = position.x - surface.x;
  const dy = position.y - surface.y;
  const dz = position.z - surface.z;
  candidate.altitude =
    dx * candidate.vertical.x +
    dy * candidate.vertical.y +
    dz * candidate.vertical.z;
  candidate.baseHeight = 0.0;
  Cartesian3.clone(Cartesian3.ZERO, candidate.ellipsoidCenter);
  Cartesian3.clone(ellipsoid.radii, candidate.ellipsoidRadii);
  candidate.mode = globeMode;
}

function publishPlanar(scene, world, baseHeight, candidate) {
  //>>includeStart('debug', pragmas.debug);
  if (
    !defined(world) ||
    typeof world.isDestroyed !== "function" ||
    world.isDestroyed() ||
    scene.world !== world ||
    defined(scene.globe)
  ) {
    throw new DeveloperError(
      "planar mode requires the Scene's live SceneGISPlanarWorld.",
    );
  }
  if (!Number.isFinite(baseHeight)) {
    throw new DeveloperError("options.baseHeight must be finite.");
  }
  //>>includeEnd('debug');

  const position = candidate.cameraPosition;
  Cartesian3.fromElements(
    position.x,
    position.y,
    baseHeight,
    candidate.surfacePosition,
  );
  Cartesian3.clone(Cartesian3.UNIT_X, candidate.east);
  Cartesian3.clone(Cartesian3.UNIT_Y, candidate.north);
  Cartesian3.clone(Cartesian3.UNIT_Z, candidate.vertical);
  Cartesian3.clone(Cartesian3.ZERO, candidate.ellipsoidCenter);
  Cartesian3.clone(Cartesian3.ZERO, candidate.ellipsoidRadii);
  candidate.altitude = position.z - baseHeight;
  candidate.baseHeight = baseHeight;
  candidate.mode = planarMode;
}

function validateCandidate(candidate) {
  const vectorNames = [
    "cameraPosition",
    "cameraDirection",
    "cameraUp",
    "cameraRight",
    "surfacePosition",
    "east",
    "north",
    "vertical",
    "ellipsoidCenter",
    "ellipsoidRadii",
  ];
  for (let i = 0; i < vectorNames.length; i++) {
    //>>includeStart('debug', pragmas.debug);
    if (!isFiniteCartesian3(candidate[vectorNames[i]])) {
      throw new DeveloperError(
        `The reference frame ${vectorNames[i]} must be finite.`,
      );
    }
    //>>includeEnd('debug');
  }
  //>>includeStart('debug', pragmas.debug);
  if (
    !Number.isFinite(candidate.altitude) ||
    !Number.isFinite(candidate.baseHeight)
  ) {
    throw new DeveloperError("The reference-frame heights must be finite.");
  }
  //>>includeEnd('debug');
}

function commit(candidate, result) {
  result.mode = candidate.mode;
  result.projection = candidate.projection;
  result.altitude = candidate.altitude;
  result.baseHeight = candidate.baseHeight;
  Cartesian3.clone(candidate.cameraPosition, result.cameraPosition);
  Cartesian3.clone(candidate.cameraDirection, result.cameraDirection);
  Cartesian3.clone(candidate.cameraUp, result.cameraUp);
  Cartesian3.clone(candidate.cameraRight, result.cameraRight);
  Cartesian3.clone(candidate.surfacePosition, result.surfacePosition);
  Cartesian3.clone(candidate.east, result.east);
  Cartesian3.clone(candidate.north, result.north);
  Cartesian3.clone(candidate.vertical, result.vertical);
  Cartesian3.clone(candidate.ellipsoidCenter, result.ellipsoidCenter);
  Cartesian3.clone(candidate.ellipsoidRadii, result.ellipsoidRadii);
}

function createSnapshot() {
  return {
    mode: undefined,
    projection: undefined,
    altitude: 0.0,
    baseHeight: 0.0,
    cameraPosition: new Cartesian3(),
    cameraDirection: new Cartesian3(),
    cameraUp: new Cartesian3(),
    cameraRight: new Cartesian3(),
    surfacePosition: new Cartesian3(),
    east: new Cartesian3(),
    north: new Cartesian3(),
    vertical: new Cartesian3(),
    ellipsoidCenter: new Cartesian3(),
    ellipsoidRadii: new Cartesian3(),
  };
}

function publish(options, result, scratch) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("options", options);
  validateStorage("result", result);
  validateStorage("scratch", scratch);
  if (result === scratch) {
    throw new DeveloperError("result and scratch must be different objects.");
  }
  if (options.mode !== globeMode && options.mode !== planarMode) {
    throw new DeveloperError('options.mode must be "globe" or "planar".');
  }
  //>>includeEnd('debug');

  const scene = options.scene;
  validateLiveScene(scene);
  publishCamera(scene, scratch);
  if (options.mode === globeMode) {
    publishGlobe(scene, scratch);
  } else {
    publishPlanar(scene, options.world, options.baseHeight, scratch);
  }
  validateCandidate(scratch);
  commit(scratch, result);
  return result;
}

/**
 * Dual-world atmosphere reference-frame utilities.
 *
 * @private
 */
const SceneGISAtmosphereReferenceFrame = {
  GLOBE: globeMode,
  PLANAR: planarMode,
  createSnapshot,
  publish,
};

export default SceneGISAtmosphereReferenceFrame;

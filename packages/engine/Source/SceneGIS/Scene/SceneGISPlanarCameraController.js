import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import defined from "../../Core/defined.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import CesiumMath from "../../Core/Math.js";
import CameraEventAggregator from "../../Scene/CameraEventAggregator.js";
import CameraEventType from "../../Scene/CameraEventType.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";
import SceneGISPlanarCamera from "./_private/_SceneGISPlanarCamera.js";

const MINIMUM_PITCH = -CesiumMath.PI_OVER_TWO;
const MAXIMUM_PITCH = -CesiumMath.toRadians(5.0);
const MINIMUM_UNDERGROUND_PITCH = -MAXIMUM_PITCH;
const MAXIMUM_UNDERGROUND_PITCH = -MINIMUM_PITCH;
const PITCH_ROUND_TRIP_TOLERANCE = CesiumMath.EPSILON10;
const ROTATE_RATE = Math.PI;
const MAXIMUM_WHEEL_RATIO = 0.1;
const WHEEL_ZOOM_RATE = 5.0;
const DEFAULT_MINIMUM_TERRAIN_CLEARANCE = 1.0;
const TANGENT_RELEASE_PITCH_EPSILON = CesiumMath.EPSILON6;
const INERTIA_MAXIMUM_CLICK_TIME = 0.4;
const INERTIA_MINIMUM_MOVEMENT = 0.5;

const scratchCenter = new Cartesian2();
const scratchRay = { origin: new Cartesian3(), direction: new Cartesian3() };
const scratchPoint = new Cartesian3();
const scratchPoint2 = new Cartesian3();
const scratchPosition = new Cartesian3();
const scratchDirection = new Cartesian3();
const scratchUp = new Cartesian3();
const scratchRight = new Cartesian3();
const scratchCameraPose = {
  position: new Cartesian3(),
  direction: new Cartesian3(),
  up: new Cartesian3(),
  right: new Cartesian3(),
};
const scratchHome = {
  info: {},
  target: new Cartesian3(),
  position: new Cartesian3(),
};

function validateBoolean(name, value) {
  if (typeof value !== "boolean") {
    throw new DeveloperError(`${name} must be a boolean.`);
  }
}

function validateInertia(name, value) {
  if (!Number.isFinite(value) || value < 0.0 || value >= 1.0) {
    throw new DeveloperError(`${name} must be a finite number in [0.0, 1.0).`);
  }
}

function getInertiaCoefficient(controller, type) {
  if (type === CameraEventType.MIDDLE_DRAG) {
    return controller._inertiaSpin;
  }
  return type === CameraEventType.LEFT_DRAG
    ? controller._inertiaTranslate
    : controller._inertiaZoom;
}

function recordInertia(controller, type, movement) {
  const inertia = controller._inertia;
  inertia.type = type;
  inertia.running = false;
  inertia.pressTime = controller._aggregator.getButtonPressTime(type);
  Cartesian2.subtract(
    movement.endPosition,
    movement.startPosition,
    inertia.delta,
  );
  Cartesian2.clone(movement.endPosition, inertia.movement.endPosition);
}

function getInertiaMovement(controller) {
  const inertia = controller._inertia;
  const type = inertia.type;
  const aggregator = controller._aggregator;
  if (!defined(type) || aggregator.isButtonDown(type)) {
    return undefined;
  }
  const pressTime = inertia.pressTime;
  const releaseTime = aggregator.getButtonReleaseTime(type);
  const coefficient = getInertiaCoefficient(controller, type);
  const clickTime = (releaseTime - pressTime) / 1000.0;
  const elapsed = (Date.now() - releaseTime) / 1000.0;
  if (
    coefficient === 0.0 ||
    !(clickTime >= 0.0 && clickTime < INERTIA_MAXIMUM_CLICK_TIME) ||
    !(elapsed >= 0.0)
  ) {
    inertia.type = undefined;
    return undefined;
  }
  // Match ScreenSpaceCameraController's release-time exponential decay.
  const scale = 0.5 * Math.exp(-(1.0 - coefficient) * 25.0 * elapsed);
  if (Cartesian2.magnitude(inertia.delta) * scale < INERTIA_MINIMUM_MOVEMENT) {
    inertia.type = undefined;
    return undefined;
  }
  const movement = inertia.movement;
  Cartesian2.clone(movement.endPosition, movement.startPosition);
  Cartesian2.multiplyByScalar(inertia.delta, scale, movement.endPosition);
  Cartesian2.add(
    movement.startPosition,
    movement.endPosition,
    movement.endPosition,
  );
  inertia.running = true;
  return movement;
}

function cancelInterruptedInertia(controller, scene) {
  const inertia = controller._inertia;
  if (!defined(inertia.type)) {
    return;
  }
  const aggregator = controller._aggregator;
  const pose = SceneGISPlanarCamera.getWorldPose(
    scene.camera,
    scratchCameraPose,
  );
  const previous = inertia.pose;
  const changedPress =
    aggregator.getButtonPressTime(inertia.type) !== inertia.pressTime;
  const newPress =
    changedPress ||
    (aggregator.anyButtonDown && !aggregator.isButtonDown(inertia.type));
  // Camera's world-coordinate getters can normalize its axes between updates.
  const changedPose =
    !Cartesian3.equals(pose.position, previous.position) ||
    !Cartesian3.equalsEpsilon(
      pose.direction,
      previous.direction,
      CesiumMath.EPSILON12,
    ) ||
    !Cartesian3.equalsEpsilon(pose.up, previous.up, CesiumMath.EPSILON12);
  if (newPress || changedPose) {
    const type = inertia.type;
    inertia.type = undefined;
    if (
      changedPose ||
      !aggregator.isButtonDown(CameraEventType.LEFT_DRAG) ||
      (changedPress && type === CameraEventType.LEFT_DRAG)
    ) {
      controller._panActive = false;
    }
    if (
      changedPose ||
      !aggregator.isButtonDown(CameraEventType.MIDDLE_DRAG) ||
      (changedPress && type === CameraEventType.MIDDLE_DRAG)
    ) {
      controller._rotateActive = false;
    }
  }
}

function validateNavigationMode(value) {
  if (value !== "surface" && value !== "underground") {
    throw new DeveloperError(
      'navigationMode must be either "surface" or "underground".',
    );
  }
}

function validateMinimumTerrainClearance(value) {
  if (!Number.isFinite(value) || value <= 0.0) {
    throw new DeveloperError(
      "minimumTerrainClearance must be a finite number greater than 0.0.",
    );
  }
}

function isWorldAlive(world) {
  return !world.isDestroyed();
}

function getCenter(scene, result) {
  result.x = scene.canvas.clientWidth * 0.5;
  result.y = scene.canvas.clientHeight * 0.5;
  return result;
}

function getCameraSurfaceHeight(controller, position) {
  const terrainHeight = controller._world.getTerrainHeight(position);
  return Number.isFinite(terrainHeight) ? terrainHeight : 0.0;
}

function getUnboundedCenterTarget(controller, scene, surfaceHeight, result) {
  const center = getCenter(scene, scratchCenter);
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    center,
    scratchRay,
  );
  if (!ray) {
    return undefined;
  }
  const terrainPosition = controller._world.pickTerrain(ray, result);
  if (isFiniteCartesian3(terrainPosition)) {
    return Cartesian3.clone(terrainPosition, result);
  }
  return intersectHorizontalPlane(ray, surfaceHeight, result);
}

function getCenterPlaneTarget(scene, height, result) {
  const center = getCenter(scene, scratchCenter);
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    center,
    scratchRay,
  );
  return ray && intersectHorizontalPlane(ray, height, result);
}

function isFiniteCartesian3(position) {
  return (
    defined(position) &&
    Number.isFinite(position.x) &&
    Number.isFinite(position.y) &&
    Number.isFinite(position.z)
  );
}

function isInsideExtent(extent, position) {
  return (
    position.x >= extent.minimumX &&
    position.x <= extent.maximumX &&
    position.y >= extent.minimumY &&
    position.y <= extent.maximumY
  );
}

function intersectHorizontalPlane(ray, height, result) {
  if (
    !defined(ray) ||
    !isFiniteCartesian3(ray.origin) ||
    !isFiniteCartesian3(ray.direction) ||
    !Number.isFinite(height) ||
    ray.direction.z === 0.0
  ) {
    return undefined;
  }

  const t = (height - ray.origin.z) / ray.direction.z;
  if (!Number.isFinite(t) || t < 0.0) {
    return undefined;
  }

  result.x = ray.origin.x + ray.direction.x * t;
  result.y = ray.origin.y + ray.direction.y * t;
  result.z = height;
  return isFiniteCartesian3(result) ? result : undefined;
}

function resolveNavigationAnchor(controller, scene, windowPosition, result) {
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    windowPosition,
    scratchRay,
  );
  if (!ray) {
    return undefined;
  }

  const extent = controller._world.coordinateSystem.extent;
  if (scene.pickPositionSupported) {
    const depthPosition = scene.pickPosition(windowPosition, result);
    if (
      isFiniteCartesian3(depthPosition) &&
      isInsideExtent(extent, depthPosition)
    ) {
      return Cartesian3.clone(depthPosition, result);
    }
  }

  const terrainPosition = controller._world.pickTerrain(ray, result);
  if (isFiniteCartesian3(terrainPosition)) {
    return Cartesian3.clone(terrainPosition, result);
  }
  const referencePosition = controller._world.pick(ray, result);
  return isFiniteCartesian3(referencePosition)
    ? Cartesian3.clone(referencePosition, result)
    : undefined;
}

function translateCamera(camera, translation) {
  const pose = SceneGISPlanarCamera.getWorldPose(camera, scratchCameraPose);
  Cartesian3.add(pose.position, translation, scratchPosition);
  SceneGISPlanarCamera.setWorldPose(
    camera,
    scratchPosition,
    pose.direction,
    pose.up,
  );
}

function applyTerrainClearance(controller, scene) {
  if (controller._navigationMode === "underground") {
    return undefined;
  }

  const worldPose = SceneGISPlanarCamera.getWorldPose(
    scene.camera,
    scratchCameraPose,
  );
  if (!isFiniteCartesian3(worldPose.position)) {
    throw new DeveloperError(
      "The planar camera position must be finite for terrain clearance.",
    );
  }

  const surfaceHeight = getCameraSurfaceHeight(controller, worldPose.position);
  const minimumZ = surfaceHeight + controller._minimumTerrainClearance;
  const deltaZ = minimumZ - worldPose.position.z;
  if (!Number.isFinite(minimumZ) || !Number.isFinite(deltaZ)) {
    throw new DeveloperError(
      "The planar terrain clearance position is not representable.",
    );
  }
  if (deltaZ <= 0.0) {
    return surfaceHeight;
  }

  scratchPoint2.x = 0.0;
  scratchPoint2.y = 0.0;
  scratchPoint2.z = deltaZ;
  translateCamera(scene.camera, scratchPoint2);
  return surfaceHeight;
}

function getRotationDistance(scene, pivot, windowAnchor, position) {
  const camera = scene.camera;
  if (SceneGISPlanarCamera.getFrustumInfo(camera.frustum).perspective) {
    Cartesian3.subtract(position, pivot, scratchPoint);
    return Math.hypot(scratchPoint.x, scratchPoint.y, scratchPoint.z);
  }
  const ray = SceneGISPlanarCamera.getWindowRay(
    camera,
    scene.canvas,
    windowAnchor,
    scratchRay,
  );
  return (pivot.z - ray.origin.z) / ray.direction.z;
}

function positionForWindowAnchor(
  scene,
  point,
  windowPosition,
  direction,
  up,
  right,
  distance,
  result,
) {
  const info = SceneGISPlanarCamera.getFrustumInfo(scene.camera.frustum);
  const width = scene.canvas.clientWidth;
  const height = scene.canvas.clientHeight;
  const u = windowPosition.x / width;
  const v = 1.0 - windowPosition.y / height;
  const x = info.perspective
    ? info.leftSlope * (1.0 - u) + info.rightSlope * u
    : info.left + info.horizontalSpan * u;
  const y = info.perspective
    ? info.bottomSlope * (1.0 - v) + info.topSlope * v
    : info.bottom + info.verticalSpan * v;
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new DeveloperError("The window anchor is not representable.");
  }

  if (info.perspective) {
    Cartesian3.clone(direction, scratchPoint2);
    Cartesian3.multiplyByScalar(right, x, scratchPoint);
    Cartesian3.add(scratchPoint2, scratchPoint, scratchPoint2);
    Cartesian3.multiplyByScalar(up, y, scratchPoint);
    Cartesian3.add(scratchPoint2, scratchPoint, scratchPoint2);
    SceneGISPlanarCamera.robustNormalize(scratchPoint2, scratchPoint2);
    Cartesian3.multiplyByScalar(scratchPoint2, distance, scratchPoint2);
    return Cartesian3.subtract(point, scratchPoint2, result);
  }

  Cartesian3.multiplyByScalar(right, x, scratchPoint2);
  Cartesian3.multiplyByScalar(up, y, scratchPoint);
  Cartesian3.add(scratchPoint2, scratchPoint, scratchPoint2);
  Cartesian3.multiplyByScalar(direction, distance, scratchPoint);
  Cartesian3.add(scratchPoint2, scratchPoint, scratchPoint2);
  return Cartesian3.subtract(point, scratchPoint2, result);
}

function normalizeUndergroundTangent(controller, scene) {
  if (
    controller._navigationMode !== "underground" ||
    !controller._rotateActive
  ) {
    return;
  }
  const worldPose = SceneGISPlanarCamera.getWorldPose(
    scene.camera,
    scratchCameraPose,
  );
  const tangentTolerance = Math.max(
    CesiumMath.EPSILON8,
    Math.abs(controller._rotateDistance) * CesiumMath.EPSILON8,
  );
  if (
    Math.abs(worldPose.position.z - controller._rotatePivot.z) >
    tangentTolerance
  ) {
    return;
  }

  let side = Math.sign(controller._pitch);
  if (side === 0) {
    side = controller._rotatePitchDirection || 1.0;
  }
  const normalizedPitch = CesiumMath.clamp(
    controller._pitch + side * TANGENT_RELEASE_PITCH_EPSILON,
    MINIMUM_PITCH,
    MAXIMUM_UNDERGROUND_PITCH,
  );
  SceneGISPlanarCamera.getAxes(
    controller._heading,
    normalizedPitch,
    scratchDirection,
    scratchUp,
    scratchRight,
  );
  positionForWindowAnchor(
    scene,
    controller._rotatePivot,
    controller._rotateWindowAnchor,
    scratchDirection,
    scratchUp,
    scratchRight,
    controller._rotateDistance,
    scratchPosition,
  );
  if (!isFiniteCartesian3(scratchPosition)) {
    return;
  }
  SceneGISPlanarCamera.setWorldPose(
    scene.camera,
    scratchPosition,
    scratchDirection,
    scratchUp,
  );
  controller._pitch = normalizedPitch;
}

/**
 * A deterministic mouse camera controller for a {@link SceneGISPlanarWorld}.
 * The caller must disable the legacy controller before registering this
 * controller and must remove this controller before destroying its widget.
 *
 * @alias SceneGISPlanarCameraController
 * @constructor
 * @implements Controller
 *
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarWorld} options.world The live planar world to navigate.
 * @param {"surface"|"underground"} [options.navigationMode="surface"] The side-aware navigation profile.
 * @param {number} [options.minimumTerrainClearance=1.0] The minimum vertical distance, in meters, maintained above resident terrain in surface mode.
 *
 * @exception {DeveloperError} <code>options.world</code> is missing, has the wrong type, or has been destroyed.
 * @exception {DeveloperError} <code>options.navigationMode</code> is not <code>"surface"</code> or <code>"underground"</code>.
 * @exception {DeveloperError} <code>options.minimumTerrainClearance</code> is not finite or is not greater than zero.
 *
 * @example
 * widget.scene.screenSpaceCameraController.enableInputs = false;
 * const controller = new Cesium.SceneGISPlanarCameraController({
 *   world: widget.scene.world,
 * });
 * widget.addController(controller);
 * // Before widget.destroy():
 * widget.removeController(controller);
 */
function SceneGISPlanarCameraController(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  if (
    !(options.world instanceof SceneGISPlanarWorld) ||
    !isWorldAlive(options.world)
  ) {
    throw new DeveloperError(
      "options.world must be a live SceneGISPlanarWorld.",
    );
  }
  const navigationMode = options.navigationMode ?? "surface";
  validateNavigationMode(navigationMode);
  const minimumTerrainClearance =
    options.minimumTerrainClearance ?? DEFAULT_MINIMUM_TERRAIN_CLEARANCE;
  validateMinimumTerrainClearance(minimumTerrainClearance);

  this._world = options.world;
  this._navigationMode = navigationMode;
  this._minimumTerrainClearance = minimumTerrainClearance;
  this._enabled = true;
  this._enablePan = true;
  this._enableRotate = true;
  this._enableZoom = true;
  this._inertiaSpin = 0.9;
  this._inertiaTranslate = 0.9;
  this._inertiaZoom = 0.8;
  this._inertia = {
    type: undefined,
    running: false,
    pressTime: undefined,
    delta: new Cartesian2(),
    pointer: new Cartesian2(),
    zoomAnchorValid: false,
    movement: {
      startPosition: new Cartesian2(),
      endPosition: new Cartesian2(),
    },
    pose: {
      position: new Cartesian3(),
      direction: new Cartesian3(),
      up: new Cartesian3(),
      right: new Cartesian3(),
    },
  };
  this._homePadding = 1.05;
  this._element = undefined;
  this._aggregator = undefined;
  this._scene = undefined;
  this._panActive = false;
  this._rotateActive = false;
  this._panAnchor = new Cartesian3();
  this._rotatePivot = new Cartesian3();
  this._rotateWindowAnchor = new Cartesian2();
  this._rotateDistance = 0.0;
  this._rotatePitchDirection = 0.0;
  this._zoomAnchor = new Cartesian3();
  this._dragTarget = new Cartesian3();
  this._dragSurfaceHeight = undefined;
  this._target = new Cartesian3();
  this._surfaceHeight = undefined;
  this._heading = 0.0;
  this._pitch = MINIMUM_PITCH;
  this._minimumRange = undefined;
  this._quarantinedLeft = false;
  this._quarantinedMiddle = false;
  this._quarantinedLeftPressTime = undefined;
  this._quarantinedMiddlePressTime = undefined;
  this._flightSuspensionCount = 0;
  this._trackingSuspensionCount = 0;
}

Object.defineProperties(SceneGISPlanarCameraController.prototype, {
  /**
   * Gets the planar world navigated by this controller.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {SceneGISPlanarWorld}
   * @readonly
   */
  world: {
    get: function () {
      return this._world;
    },
  },
  /**
   * Gets or sets the side-aware navigation profile.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {"surface"|"underground"}
   * @default "surface"
   * @exception {DeveloperError} The assigned value is not <code>"surface"</code> or <code>"underground"</code>.
   */
  navigationMode: {
    get: function () {
      return this._navigationMode;
    },
    set: function (value) {
      validateNavigationMode(value);
      if (value === this._navigationMode) {
        return;
      }
      this._navigationMode = value;
      this._clearInputState();
    },
  },
  /**
   * Gets or sets the minimum vertical distance maintained above resident terrain in surface mode.
   * Assigning this property does not move the Camera; the new value is applied on the next controller update.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {number}
   * @default 1.0
   * @exception {DeveloperError} The assigned value is not finite or is not greater than zero.
   */
  minimumTerrainClearance: {
    get: function () {
      return this._minimumTerrainClearance;
    },
    set: function (value) {
      validateMinimumTerrainClearance(value);
      if (value === this._minimumTerrainClearance) {
        return;
      }
      this._minimumTerrainClearance = value;
    },
  },
  /**
   * Gets or sets whether the controller is enabled.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {boolean}
   * @exception {DeveloperError} The assigned value is not a boolean.
   */
  enabled: {
    get: function () {
      return this._enabled;
    },
    set: function (value) {
      validateBoolean("enabled", value);
      const changed = value !== this._enabled;
      this._enabled = value;
      if (changed) {
        this._clearInputState();
      }
    },
  },
  /**
   * Gets or sets whether left-drag panning is enabled.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {boolean}
   * @exception {DeveloperError} The assigned value is not a boolean.
   */
  enablePan: {
    get: function () {
      return this._enablePan;
    },
    set: function (value) {
      validateBoolean("enablePan", value);
      const changed = value !== this._enablePan;
      this._enablePan = value;
      if (changed) {
        this._panActive = false;
        this._cancelEvent(CameraEventType.LEFT_DRAG);
      }
    },
  },
  /**
   * Gets or sets whether middle-drag rotation is enabled.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {boolean}
   * @exception {DeveloperError} The assigned value is not a boolean.
   */
  enableRotate: {
    get: function () {
      return this._enableRotate;
    },
    set: function (value) {
      validateBoolean("enableRotate", value);
      const changed = value !== this._enableRotate;
      this._enableRotate = value;
      if (changed) {
        this._rotateActive = false;
        this._cancelEvent(CameraEventType.MIDDLE_DRAG);
      }
    },
  },
  /**
   * Gets or sets whether wheel zoom is enabled.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {boolean}
   * @exception {DeveloperError} The assigned value is not a boolean.
   */
  enableZoom: {
    get: function () {
      return this._enableZoom;
    },
    set: function (value) {
      validateBoolean("enableZoom", value);
      const changed = value !== this._enableZoom;
      this._enableZoom = value;
      if (changed) {
        this._cancelEvent(CameraEventType.WHEEL);
      }
    },
  },
  /**
   * Gets or sets the multiplicative padding used by {@link SceneGISPlanarCameraController#viewHome}.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {number}
   * @default 1.05
   * @exception {DeveloperError} The assigned value is not finite or is less than 1.0.
   */
  homePadding: {
    get: function () {
      return this._homePadding;
    },
    set: function (value) {
      if (!Number.isFinite(value) || value < 1.0) {
        throw new DeveloperError(
          "homePadding must be a finite number greater than or equal to 1.0.",
        );
      }
      this._homePadding = value;
    },
  },
  /**
   * Gets or sets the rotation inertia coefficient. Zero disables inertia.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {number}
   * @default 0.9
   * @exception {DeveloperError} The assigned value is not finite or is outside [0.0, 1.0).
   */
  inertiaSpin: {
    get: function () {
      return this._inertiaSpin;
    },
    set: function (value) {
      validateInertia("inertiaSpin", value);
      this._inertiaSpin = value;
      if (value === 0.0 && this._inertia.type === CameraEventType.MIDDLE_DRAG) {
        this._inertia.type = undefined;
      }
    },
  },
  /**
   * Gets or sets the pan inertia coefficient. Zero disables inertia.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {number}
   * @default 0.9
   * @exception {DeveloperError} The assigned value is not finite or is outside [0.0, 1.0).
   */
  inertiaTranslate: {
    get: function () {
      return this._inertiaTranslate;
    },
    set: function (value) {
      validateInertia("inertiaTranslate", value);
      this._inertiaTranslate = value;
      if (value === 0.0 && this._inertia.type === CameraEventType.LEFT_DRAG) {
        this._inertia.type = undefined;
      }
    },
  },
  /**
   * Gets or sets the wheel zoom inertia coefficient. Zero disables inertia.
   *
   * @memberof SceneGISPlanarCameraController.prototype
   * @type {number}
   * @default 0.8
   * @exception {DeveloperError} The assigned value is not finite or is outside [0.0, 1.0).
   */
  inertiaZoom: {
    get: function () {
      return this._inertiaZoom;
    },
    set: function (value) {
      validateInertia("inertiaZoom", value);
      this._inertiaZoom = value;
      if (value === 0.0 && this._inertia.type === CameraEventType.WHEEL) {
        this._inertia.type = undefined;
      }
    },
  },
});

SceneGISPlanarCameraController.prototype._cancelEvent = function (type) {
  if (this._inertia.type === type) {
    this._inertia.type = undefined;
  }
  if (!defined(this._aggregator)) {
    return;
  }
  const key = `${type}`;
  this._aggregator._update[key] = true;
  if (type === CameraEventType.LEFT_DRAG) {
    if (
      !this._quarantinedLeft &&
      this._aggregator.isButtonDown(CameraEventType.LEFT_DRAG)
    ) {
      this._quarantinedLeft = true;
      this._quarantinedLeftPressTime = this._aggregator.getButtonPressTime(
        CameraEventType.LEFT_DRAG,
      );
    }
  } else if (type === CameraEventType.MIDDLE_DRAG) {
    if (
      !this._quarantinedMiddle &&
      this._aggregator.isButtonDown(CameraEventType.MIDDLE_DRAG)
    ) {
      this._quarantinedMiddle = true;
      this._quarantinedMiddlePressTime = this._aggregator.getButtonPressTime(
        CameraEventType.MIDDLE_DRAG,
      );
    }
  }
};

SceneGISPlanarCameraController.prototype._clearInputState = function () {
  this._inertia.type = undefined;
  this._panActive = false;
  this._rotateActive = false;
  this._rotatePitchDirection = 0.0;
  this._dragSurfaceHeight = undefined;
  if (defined(this._aggregator)) {
    this._cancelEvent(CameraEventType.LEFT_DRAG);
    this._cancelEvent(CameraEventType.MIDDLE_DRAG);
    this._cancelEvent(CameraEventType.WHEEL);
    this._aggregator.reset();
  }
};

SceneGISPlanarCameraController.prototype._discardQuarantinedInput =
  function () {
    const aggregator = this._aggregator;
    if (this._quarantinedLeft) {
      if (
        !aggregator.isButtonDown(CameraEventType.LEFT_DRAG) ||
        aggregator.getButtonPressTime(CameraEventType.LEFT_DRAG) !==
          this._quarantinedLeftPressTime
      ) {
        this._quarantinedLeft = false;
        this._quarantinedLeftPressTime = undefined;
      } else {
        aggregator._update[`${CameraEventType.LEFT_DRAG}`] = true;
      }
    }
    if (this._quarantinedMiddle) {
      if (
        !aggregator.isButtonDown(CameraEventType.MIDDLE_DRAG) ||
        aggregator.getButtonPressTime(CameraEventType.MIDDLE_DRAG) !==
          this._quarantinedMiddlePressTime
      ) {
        this._quarantinedMiddle = false;
        this._quarantinedMiddlePressTime = undefined;
      } else {
        aggregator._update[`${CameraEventType.MIDDLE_DRAG}`] = true;
      }
    }
  };

SceneGISPlanarCameraController.prototype._validateScene = function (scene) {
  if (!defined(scene) || (scene.isDestroyed && scene.isDestroyed())) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (!isWorldAlive(this._world) || scene.world !== this._world) {
    throw new DeveloperError(
      "scene.world must be the controller's live planar world.",
    );
  }
  if (scene.mode !== SceneMode.SCENE3D) {
    throw new DeveloperError("Planar navigation requires SceneMode.SCENE3D.");
  }
  SceneGISPlanarCamera.getFrustumInfo(scene.camera.frustum);
  if (scene.screenSpaceCameraController.enableInputs !== false) {
    throw new DeveloperError(
      "Disable scene.screenSpaceCameraController.enableInputs before planar navigation.",
    );
  }
  if (defined(this._scene) && this._scene !== scene) {
    throw new DeveloperError(
      "A connected planar controller cannot navigate another Scene.",
    );
  }
};

/**
 * Connects this controller to the element used for mouse input.
 *
 * @param {HTMLElement} element The element containing the Scene.
 * @exception {DeveloperError} <code>element</code> is missing or this instance is already connected.
 */
SceneGISPlanarCameraController.prototype.connectedCallback = function (
  element,
) {
  if (!defined(element)) {
    throw new DeveloperError("element is required.");
  }
  if (defined(this._aggregator)) {
    throw new DeveloperError(
      "A SceneGISPlanarCameraController instance must not be registered twice.",
    );
  }
  this._element = element;
  this._aggregator = new CameraEventAggregator(element);
  this._quarantinedLeft = false;
  this._quarantinedMiddle = false;
  this._quarantinedLeftPressTime = undefined;
  this._quarantinedMiddlePressTime = undefined;
};

/**
 * Disconnects this controller and destroys its input aggregator.
 *
 * @param {HTMLElement} element The element containing the Scene.
 */
SceneGISPlanarCameraController.prototype.disconnectedCallback = function (
  element,
) {
  if (defined(this._aggregator) && !this._aggregator.isDestroyed()) {
    this._aggregator.destroy();
  }
  this._aggregator = undefined;
  this._element = undefined;
  this._scene = undefined;
  this._quarantinedLeft = false;
  this._quarantinedMiddle = false;
  this._quarantinedLeftPressTime = undefined;
  this._quarantinedMiddlePressTime = undefined;
  this._clearInputState();
};

SceneGISPlanarCameraController.prototype._syncRig = function (
  scene,
  allowHome,
  clearanceSurfaceHeight,
) {
  const camera = scene.camera;
  let worldPose = SceneGISPlanarCamera.getWorldPose(camera, scratchCameraPose);
  let surfaceHeight = defined(clearanceSurfaceHeight)
    ? clearanceSurfaceHeight
    : getCameraSurfaceHeight(this, worldPose.position);
  let target = getUnboundedCenterTarget(
    this,
    scene,
    surfaceHeight,
    scratchPoint,
  );
  let pose = SceneGISPlanarCamera.getHeadingPitch(camera);
  let locallyAbove = worldPose.position.z > surfaceHeight;
  let above = defined(target) && worldPose.position.z > target.z;
  const below = defined(target) && worldPose.position.z < target.z;
  let negativePitch =
    pose.pitch >= MINIMUM_PITCH - PITCH_ROUND_TRIP_TOLERANCE &&
    pose.pitch <= MAXIMUM_PITCH + PITCH_ROUND_TRIP_TOLERANCE;
  let valid =
    defined(target) &&
    pose.valid &&
    Math.abs(pose.roll) <= CesiumMath.EPSILON8 &&
    (this._navigationMode === "surface"
      ? locallyAbove && above && negativePitch
      : (above && pose.pitch < 0.0) || (below && pose.pitch > 0.0));
  if (!valid) {
    if (!allowHome || this._navigationMode === "underground") {
      return false;
    }
    this.viewHome(scene);
    worldPose = SceneGISPlanarCamera.getWorldPose(camera, scratchCameraPose);
    surfaceHeight = getCameraSurfaceHeight(this, worldPose.position);
    target = getUnboundedCenterTarget(this, scene, surfaceHeight, scratchPoint);
    pose = SceneGISPlanarCamera.getHeadingPitch(camera);
    locallyAbove = worldPose.position.z > surfaceHeight;
    above = defined(target) && worldPose.position.z > target.z;
    negativePitch =
      pose.pitch >= MINIMUM_PITCH - PITCH_ROUND_TRIP_TOLERANCE &&
      pose.pitch <= MAXIMUM_PITCH + PITCH_ROUND_TRIP_TOLERANCE;
    valid =
      defined(target) &&
      pose.valid &&
      Math.abs(pose.roll) <= CesiumMath.EPSILON8 &&
      locallyAbove &&
      above &&
      negativePitch;
  }
  if (!valid) {
    return false;
  }
  this._applyTargetClamp(scene, target);
  this._surfaceHeight = surfaceHeight;
  const synchronizedPose = SceneGISPlanarCamera.getHeadingPitch(camera);
  const synchronizedWorldPose = SceneGISPlanarCamera.getWorldPose(
    camera,
    scratchCameraPose,
  );
  const synchronizedBelow = synchronizedWorldPose.position.z < this._target.z;
  const synchronizedMinimumPitch =
    this._navigationMode === "underground" || !synchronizedBelow
      ? MINIMUM_PITCH
      : MINIMUM_UNDERGROUND_PITCH;
  const synchronizedMaximumPitch =
    this._navigationMode === "underground" || synchronizedBelow
      ? MAXIMUM_UNDERGROUND_PITCH
      : MAXIMUM_PITCH;
  this._heading = CesiumMath.zeroToTwoPi(synchronizedPose.heading);
  this._pitch = CesiumMath.clamp(
    synchronizedPose.pitch,
    synchronizedMinimumPitch,
    synchronizedMaximumPitch,
  );
  return true;
};

/**
 * Validates the registered Scene and synchronizes the initial planar rig.
 *
 * @param {Scene} scene The host Scene.
 * @param {JulianDate} time The current simulation time.
 * @exception {DeveloperError} The controller is disconnected, the Scene/world/mode/frustum is invalid, or legacy input is enabled.
 */
SceneGISPlanarCameraController.prototype.firstUpdate = function (scene, time) {
  if (!defined(this._aggregator)) {
    throw new DeveloperError(
      "The planar controller must be connected before its first update.",
    );
  }
  this._validateScene(scene);
  this._scene = scene;
  if (this._flightSuspensionCount > 0 || this._trackingSuspensionCount > 0) {
    this._clearInputState();
    return;
  }
  const clearanceSurfaceHeight = applyTerrainClearance(this, scene);
  if (scene.canvas.clientWidth !== 0 && scene.canvas.clientHeight !== 0) {
    this._syncRig(scene, true, clearanceSurfaceHeight);
  }
  this._clearInputState();
};

SceneGISPlanarCameraController.prototype._applyTargetClamp = function (
  scene,
  target,
  height,
) {
  if (!defined(target)) {
    target = getCenterPlaneTarget(scene, height, scratchPoint);
  }
  if (!target) {
    return;
  }
  const extent = this._world.coordinateSystem.extent;
  this._target.x = CesiumMath.clamp(target.x, extent.minimumX, extent.maximumX);
  this._target.y = CesiumMath.clamp(target.y, extent.minimumY, extent.maximumY);
  this._target.z = target.z;
  const clamped = this._target;
  if (!Cartesian3.equals(clamped, target)) {
    Cartesian3.subtract(clamped, target, scratchPoint2);
    translateCamera(scene.camera, scratchPoint2);
  }
};

SceneGISPlanarCameraController.prototype._pan = function (scene, movement) {
  if (!this._panActive) {
    const start = this._aggregator.getStartMousePosition(
      CameraEventType.LEFT_DRAG,
    );
    const anchor = resolveNavigationAnchor(this, scene, start, this._panAnchor);
    if (!anchor) {
      return;
    }
    this._panActive = true;
    Cartesian3.clone(this._target, this._dragTarget);
    this._dragSurfaceHeight = this._surfaceHeight;
  }
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    movement.endPosition,
    scratchRay,
  );
  const current =
    ray && intersectHorizontalPlane(ray, this._panAnchor.z, scratchPoint);
  if (!current) {
    return;
  }
  Cartesian3.subtract(this._panAnchor, current, scratchPoint2);
  translateCamera(scene.camera, scratchPoint2);
  this._applyTargetClamp(scene, undefined, this._dragTarget.z);
  Cartesian3.clone(this._target, this._dragTarget);
};

SceneGISPlanarCameraController.prototype._rotate = function (scene, movement) {
  const camera = scene.camera;
  const starting = !this._rotateActive;
  if (starting) {
    const start = this._aggregator.getStartMousePosition(
      CameraEventType.MIDDLE_DRAG,
    );
    const pivot = resolveNavigationAnchor(
      this,
      scene,
      start,
      this._rotatePivot,
    );
    if (!pivot) {
      Cartesian3.clone(this._target, this._rotatePivot);
      getCenter(scene, this._rotateWindowAnchor);
    } else {
      Cartesian2.clone(start, this._rotateWindowAnchor);
    }
    Cartesian3.clone(this._target, this._dragTarget);
    this._dragSurfaceHeight = this._surfaceHeight;
    this._rotatePitchDirection = 0.0;
  }
  const dx =
    (movement.endPosition.x - movement.startPosition.x) /
    scene.canvas.clientWidth;
  const dy =
    (movement.endPosition.y - movement.startPosition.y) /
    scene.canvas.clientHeight;
  const worldPose = SceneGISPlanarCamera.getWorldPose(
    camera,
    scratchCameraPose,
  );
  if (starting) {
    const distance = getRotationDistance(
      scene,
      this._rotatePivot,
      this._rotateWindowAnchor,
      worldPose.position,
    );
    if (!Number.isFinite(distance) || distance < 0.0) {
      return;
    }
    this._rotateDistance = distance;
    this._rotateActive = true;
  }
  const belowPivot = worldPose.position.z < this._rotatePivot.z;
  const allowsCrossing = this._navigationMode === "underground";
  if (
    (!allowsCrossing && worldPose.position.z === this._rotatePivot.z) ||
    (belowPivot && !allowsCrossing)
  ) {
    return;
  }
  const minimumPitch = MINIMUM_PITCH;
  const maximumPitch = allowsCrossing
    ? MAXIMUM_UNDERGROUND_PITCH
    : MAXIMUM_PITCH;
  const pitchDelta = -dy * ROTATE_RATE;
  if (pitchDelta !== 0.0) {
    this._rotatePitchDirection = Math.sign(pitchDelta);
  }
  this._heading = CesiumMath.zeroToTwoPi(this._heading + dx * ROTATE_RATE);
  this._pitch = CesiumMath.clamp(
    this._pitch + pitchDelta,
    minimumPitch,
    maximumPitch,
  );
  SceneGISPlanarCamera.getAxes(
    this._heading,
    this._pitch,
    scratchDirection,
    scratchUp,
    scratchRight,
  );
  // Boundary and clearance corrections must not grow the held orbit radius.
  positionForWindowAnchor(
    scene,
    this._rotatePivot,
    this._rotateWindowAnchor,
    scratchDirection,
    scratchUp,
    scratchRight,
    this._rotateDistance,
    scratchPosition,
  );
  const remainsOnPivotSide =
    allowsCrossing ||
    (belowPivot
      ? scratchPosition.z < this._rotatePivot.z
      : scratchPosition.z > this._rotatePivot.z);
  if (!isFiniteCartesian3(scratchPosition) || !remainsOnPivotSide) {
    return;
  }
  SceneGISPlanarCamera.setWorldPose(
    camera,
    scratchPosition,
    scratchDirection,
    scratchUp,
  );
  if (!allowsCrossing) {
    this._applyTargetClamp(scene, undefined, this._dragTarget.z);
    Cartesian3.clone(this._target, this._dragTarget);
  }
};

SceneGISPlanarCameraController.prototype._computeHomeState = function (scene) {
  return SceneGISPlanarCamera.computeHomeState(
    scene.camera,
    scene.canvas,
    this._world.coordinateSystem.extent,
    this._homePadding,
    scratchHome,
  );
};

SceneGISPlanarCameraController.prototype._getRanges = function (scene) {
  const extent = this._world.coordinateSystem.extent;
  const maxCoordinate = Math.max(
    Math.abs(extent.minimumX),
    Math.abs(extent.maximumX),
    Math.abs(extent.minimumY),
    Math.abs(extent.maximumY),
    extent.width,
  );
  const pixels = Math.max(scene.canvas.clientWidth, scene.canvas.clientHeight);
  const info = SceneGISPlanarCamera.getFrustumInfo(scene.camera.frustum);
  const coordinateResolution = Number.EPSILON * maxCoordinate * pixels;
  this._minimumRange = info.perspective
    ? Math.max(
        info.near *
          Math.hypot(info.centerSlopeX, info.centerSlopeY, 1.0) *
          (1.0 + CesiumMath.EPSILON8),
        coordinateResolution,
      )
    : coordinateResolution;
  return this._computeHomeState(scene).maximumRange;
};

SceneGISPlanarCameraController.prototype._zoom = function (
  scene,
  movement,
  inertial = false,
) {
  const maximum = this._getRanges(scene);
  const camera = scene.camera;
  const inertia = this._inertia;
  if (!inertial) {
    Cartesian2.clone(
      this._aggregator.getStartMousePosition(CameraEventType.WHEEL),
      inertia.pointer,
    );
    inertia.zoomAnchorValid = defined(
      resolveNavigationAnchor(this, scene, inertia.pointer, this._zoomAnchor),
    );
  }
  const pointer = inertia.pointer;
  const anchor = inertia.zoomAnchorValid ? this._zoomAnchor : undefined;
  const difference = movement.endPosition.y - movement.startPosition.y;
  const ratio = CesiumMath.clamp(
    difference / scene.canvas.clientHeight,
    -MAXIMUM_WHEEL_RATIO,
    MAXIMUM_WHEEL_RATIO,
  );
  const factor = Math.exp(-WHEEL_ZOOM_RATE * ratio);
  const info = SceneGISPlanarCamera.getFrustumInfo(camera.frustum);
  if (info.perspective) {
    const worldPose = SceneGISPlanarCamera.getWorldPose(
      camera,
      scratchCameraPose,
    );
    Cartesian3.subtract(worldPose.position, this._target, scratchPosition);
    const range = Math.hypot(
      scratchPosition.x,
      scratchPosition.y,
      scratchPosition.z,
    );
    const newRange = CesiumMath.clamp(
      range * factor,
      this._minimumRange,
      maximum,
    );
    Cartesian3.multiplyByScalar(
      scratchPosition,
      newRange / range,
      scratchPosition,
    );
    Cartesian3.add(this._target, scratchPosition, scratchPosition);
    SceneGISPlanarCamera.setWorldPose(
      camera,
      scratchPosition,
      worldPose.direction,
      worldPose.up,
    );
  } else {
    const currentSpan = info.top - info.bottom;
    const newSpan = CesiumMath.clamp(
      currentSpan * factor,
      this._minimumRange,
      maximum,
    );
    SceneGISPlanarCamera.scaleOrthographicFrustum(
      camera.frustum,
      newSpan / currentSpan,
    );
  }
  if (anchor) {
    const ray = SceneGISPlanarCamera.getWindowRay(
      camera,
      scene.canvas,
      pointer,
      scratchRay,
    );
    const after = ray && intersectHorizontalPlane(ray, anchor.z, scratchPoint2);
    if (after) {
      Cartesian3.subtract(anchor, after, scratchPoint2);
      translateCamera(camera, scratchPoint2);
    }
  }
  this._applyTargetClamp(scene, undefined, this._target.z);
  if (this._rotateActive && this._navigationMode === "surface") {
    const worldPose = SceneGISPlanarCamera.getWorldPose(
      camera,
      scratchCameraPose,
    );
    this._rotateDistance = getRotationDistance(
      scene,
      this._rotatePivot,
      this._rotateWindowAnchor,
      worldPose.position,
    );
  }
};

/**
 * Applies one deterministic frame in which middle-drag takes priority over
 * left-drag and wheel input is processed last.
 *
 * @param {Scene} scene The host Scene.
 * @param {JulianDate} time The current simulation time.
 * @exception {DeveloperError} The controller is disconnected, the Scene/world/mode/frustum is invalid, or legacy input is enabled.
 */
SceneGISPlanarCameraController.prototype.update = function (scene, time) {
  if (
    !this._enabled ||
    this._flightSuspensionCount > 0 ||
    this._trackingSuspensionCount > 0
  ) {
    this._clearInputState();
    return;
  }
  this._validateScene(scene);
  if (!defined(this._aggregator)) {
    throw new DeveloperError(
      "The planar controller must be connected before update.",
    );
  }
  cancelInterruptedInertia(this, scene);
  const clearanceSurfaceHeight = applyTerrainClearance(this, scene);
  const aggregator = this._aggregator;
  if (scene.canvas.clientWidth === 0 || scene.canvas.clientHeight === 0) {
    this._clearInputState();
    return;
  }
  this._discardQuarantinedInput();
  const middleMoving = aggregator.isMoving(CameraEventType.MIDDLE_DRAG);
  const leftMoving = aggregator.isMoving(CameraEventType.LEFT_DRAG);
  const wheelMoving = aggregator.isMoving(CameraEventType.WHEEL);
  const inertia = this._inertia;
  if (inertia.running && (middleMoving || leftMoving || wheelMoving)) {
    inertia.type = undefined;
    inertia.running = false;
    this._panActive = false;
    this._rotateActive = false;
  }
  if (middleMoving && !this._enableRotate) {
    this._cancelEvent(CameraEventType.MIDDLE_DRAG);
  }
  if (leftMoving && !this._enablePan) {
    this._cancelEvent(CameraEventType.LEFT_DRAG);
  }
  const middleWillRun = middleMoving && this._enableRotate;
  const leftWillRun = !middleWillRun && leftMoving && this._enablePan;
  const dragStarting =
    (middleWillRun && !this._rotateActive) || (leftWillRun && !this._panActive);
  const dragRigReady =
    !dragStarting || this._syncRig(scene, true, clearanceSurfaceHeight);
  let inputMayMoveCamera = false;
  try {
    if (dragRigReady && middleWillRun) {
      inputMayMoveCamera = true;
      this._panActive = false;
      this._rotate(scene, aggregator.getMovement(CameraEventType.MIDDLE_DRAG));
      if (this._rotateActive) {
        recordInertia(
          this,
          CameraEventType.MIDDLE_DRAG,
          aggregator.getMovement(CameraEventType.MIDDLE_DRAG),
        );
      }
    } else if (dragRigReady && leftWillRun) {
      inputMayMoveCamera = true;
      this._rotateActive = false;
      this._pan(scene, aggregator.getMovement(CameraEventType.LEFT_DRAG));
      if (this._panActive) {
        recordInertia(
          this,
          CameraEventType.LEFT_DRAG,
          aggregator.getMovement(CameraEventType.LEFT_DRAG),
        );
      }
    }
    if (wheelMoving && this._enableZoom) {
      const dragActive = this._panActive || this._rotateActive;
      const wheelRigReady = dragStarting
        ? dragRigReady
        : this._syncRig(scene, true, clearanceSurfaceHeight);
      if (wheelRigReady) {
        inputMayMoveCamera = true;
        this._zoom(scene, aggregator.getMovement(CameraEventType.WHEEL));
        recordInertia(
          this,
          CameraEventType.WHEEL,
          aggregator.getMovement(CameraEventType.WHEEL),
        );
      }
      if (dragActive) {
        Cartesian3.clone(this._dragTarget, this._target);
        this._surfaceHeight = this._dragSurfaceHeight;
      }
    }
    if (!middleMoving && !leftMoving && !wheelMoving) {
      const movement = getInertiaMovement(this);
      if (defined(movement)) {
        inputMayMoveCamera = true;
        if (inertia.type === CameraEventType.MIDDLE_DRAG) {
          this._rotate(scene, movement);
        } else if (inertia.type === CameraEventType.LEFT_DRAG) {
          this._pan(scene, movement);
        } else {
          this._zoom(scene, movement, true);
        }
      }
    }
    if (
      !aggregator.isButtonDown(CameraEventType.LEFT_DRAG) &&
      inertia.type !== CameraEventType.LEFT_DRAG
    ) {
      this._panActive = false;
    }
    if (
      !aggregator.isButtonDown(CameraEventType.MIDDLE_DRAG) &&
      inertia.type !== CameraEventType.MIDDLE_DRAG
    ) {
      normalizeUndergroundTangent(this, scene);
      this._rotateActive = false;
    }
    if (inputMayMoveCamera) {
      applyTerrainClearance(this, scene);
    }
    if (defined(inertia.type)) {
      SceneGISPlanarCamera.getWorldPose(scene.camera, inertia.pose);
    }
  } finally {
    aggregator.reset();
  }
};

SceneGISPlanarCameraController.prototype._suspendForCameraFlight = function (
  scene,
) {
  if (this._world !== scene.world || !defined(this._aggregator)) {
    throw new DeveloperError(
      "The planar Camera controller must be registered for the flight Scene.",
    );
  }
  this._flightSuspensionCount++;
  this._clearInputState();
  return {
    controller: this,
    active: true,
  };
};

SceneGISPlanarCameraController.prototype._resumeFromCameraFlight = function (
  token,
) {
  if (!defined(token) || token.controller !== this || !token.active) {
    return;
  }
  token.active = false;
  this._flightSuspensionCount = Math.max(0, this._flightSuspensionCount - 1);
};

SceneGISPlanarCameraController.prototype._suspendForEntityTracking = function (
  scene,
) {
  if (this._world !== scene.world || !defined(this._aggregator)) {
    throw new DeveloperError(
      "The planar Camera controller must be registered for the tracking Scene.",
    );
  }
  this._trackingSuspensionCount++;
  this._clearInputState();
  return {
    controller: this,
    active: true,
  };
};

SceneGISPlanarCameraController.prototype._resumeFromEntityTracking = function (
  token,
) {
  if (!defined(token) || token.controller !== this || !token.active) {
    return;
  }
  token.active = false;
  this._trackingSuspensionCount = Math.max(
    0,
    this._trackingSuspensionCount - 1,
  );
};

SceneGISPlanarCameraController._getRegisteredForScene = function (scene) {
  const controllers = scene?.controllerHost?._controllers;
  if (!Array.isArray(controllers)) {
    return undefined;
  }
  let result;
  for (const controller of controllers) {
    if (
      controller instanceof SceneGISPlanarCameraController &&
      controller._world === scene.world &&
      defined(controller._aggregator)
    ) {
      if (defined(result)) {
        throw new DeveloperError(
          "Only one registered SceneGISPlanarCameraController may own planar Camera input.",
        );
      }
      result = controller;
    }
  }
  return result;
};

/**
 * Sets an immediate north-up, nadir view that contains the padded world extent.
 *
 * @param {Scene} scene The live SCENE3D scene whose primary world is this controller's world.
 * @exception {DeveloperError} The scene, world, legacy input state, camera pose, or frustum is invalid.
 * @exception {DeveloperError} The existing near/far range cannot contain the fitted home view.
 */
SceneGISPlanarCameraController.prototype.viewHome = function (scene) {
  this._validateScene(scene);
  const canvas = scene.canvas;
  if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
    return;
  }
  const camera = scene.camera;
  const frustum = camera.frustum;
  const home = this._computeHomeState(scene);
  const homeDirection = Cartesian3.negate(Cartesian3.UNIT_Z, scratchDirection);
  const homeUp = Cartesian3.clone(Cartesian3.UNIT_Y, scratchUp);
  SceneGISPlanarCamera.validateWorldPose(
    camera,
    home.position,
    homeDirection,
    homeUp,
  );
  this._clearInputState();
  if (defined(home.orthographicScale)) {
    SceneGISPlanarCamera.scaleOrthographicFrustum(
      frustum,
      home.orthographicScale,
    );
  }
  SceneGISPlanarCamera.setWorldPose(
    camera,
    home.position,
    homeDirection,
    homeUp,
  );
  Cartesian3.clone(home.target, this._target);
  this._heading = 0.0;
  this._pitch = MINIMUM_PITCH;
  this._getRanges(scene);
};

export default SceneGISPlanarCameraController;

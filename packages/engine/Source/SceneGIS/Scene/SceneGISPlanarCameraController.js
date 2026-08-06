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
const PITCH_ROUND_TRIP_TOLERANCE = CesiumMath.EPSILON10;
const ROTATE_RATE = Math.PI;
const MAXIMUM_WHEEL_RATIO = 0.1;
const WHEEL_ZOOM_RATE = 5.0;

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

function validateBoolean(name, value) {
  if (typeof value !== "boolean") {
    throw new DeveloperError(`${name} must be a boolean.`);
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

function getUnboundedCenterTarget(scene, result) {
  const center = getCenter(scene, scratchCenter);
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    center,
    scratchRay,
  );
  return ray && SceneGISPlanarCamera.intersectPlane(ray, result);
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
 *
 * @exception {DeveloperError} <code>options.world</code> is missing, has the wrong type, or has been destroyed.
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

  this._world = options.world;
  this._enabled = true;
  this._enablePan = true;
  this._enableRotate = true;
  this._enableZoom = true;
  this._homePadding = 1.05;
  this._element = undefined;
  this._aggregator = undefined;
  this._scene = undefined;
  this._panActive = false;
  this._rotateActive = false;
  this._panAnchor = new Cartesian3();
  this._rotatePivot = new Cartesian3();
  this._rotateWindowAnchor = new Cartesian2();
  this._target = new Cartesian3();
  this._heading = 0.0;
  this._pitch = MINIMUM_PITCH;
  this._minimumRange = undefined;
  this._quarantinedLeft = false;
  this._quarantinedMiddle = false;
  this._quarantinedLeftPressTime = undefined;
  this._quarantinedMiddlePressTime = undefined;
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
});

SceneGISPlanarCameraController.prototype._cancelEvent = function (type) {
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
  this._panActive = false;
  this._rotateActive = false;
  if (defined(this._aggregator)) {
    this._cancelEvent(CameraEventType.LEFT_DRAG);
    this._cancelEvent(CameraEventType.MIDDLE_DRAG);
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
) {
  let target = getUnboundedCenterTarget(scene, scratchPoint);
  const camera = scene.camera;
  const pose = SceneGISPlanarCamera.getHeadingPitch(camera);
  const worldPose = SceneGISPlanarCamera.getWorldPose(
    camera,
    scratchCameraPose,
  );
  if (
    !defined(target) ||
    worldPose.position.z <= 0.0 ||
    pose.pitch < MINIMUM_PITCH - PITCH_ROUND_TRIP_TOLERANCE ||
    pose.pitch > MAXIMUM_PITCH + PITCH_ROUND_TRIP_TOLERANCE ||
    !pose.valid ||
    Math.abs(pose.roll) > CesiumMath.EPSILON8
  ) {
    if (!allowHome) {
      return false;
    }
    this.viewHome(scene);
    target = getUnboundedCenterTarget(scene, scratchPoint);
  }
  if (!defined(target)) {
    return false;
  }
  this._applyTargetClamp(scene);
  const synchronizedPose = SceneGISPlanarCamera.getHeadingPitch(camera);
  this._heading = CesiumMath.zeroToTwoPi(synchronizedPose.heading);
  this._pitch = CesiumMath.clamp(
    synchronizedPose.pitch,
    MINIMUM_PITCH,
    MAXIMUM_PITCH,
  );
  return defined(target);
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
  if (scene.canvas.clientWidth !== 0 && scene.canvas.clientHeight !== 0) {
    this._syncRig(scene, true);
  }
  this._clearInputState();
};

SceneGISPlanarCameraController.prototype._applyTargetClamp = function (scene) {
  const center = getCenter(scene, scratchCenter);
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    center,
    scratchRay,
  );
  const target = ray && SceneGISPlanarCamera.intersectPlane(ray, scratchPoint);
  if (!target) {
    return;
  }
  const clamped = SceneGISPlanarCamera.clampTarget(
    this._world.coordinateSystem.extent,
    target,
    this._target,
  );
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
    const anchor = this._world.pickFromWindowPosition(
      start,
      scene,
      this._panAnchor,
    );
    if (!anchor) {
      return;
    }
    this._panActive = true;
  }
  const ray = SceneGISPlanarCamera.getWindowRay(
    scene.camera,
    scene.canvas,
    movement.endPosition,
    scratchRay,
  );
  const current = ray && SceneGISPlanarCamera.intersectPlane(ray, scratchPoint);
  if (!current) {
    return;
  }
  Cartesian3.subtract(this._panAnchor, current, scratchPoint2);
  translateCamera(scene.camera, scratchPoint2);
  this._applyTargetClamp(scene);
};

SceneGISPlanarCameraController.prototype._rotate = function (scene, movement) {
  const camera = scene.camera;
  if (!this._rotateActive) {
    const start = this._aggregator.getStartMousePosition(
      CameraEventType.MIDDLE_DRAG,
    );
    const pivot = this._world.pickFromWindowPosition(
      start,
      scene,
      this._rotatePivot,
    );
    if (!pivot) {
      Cartesian3.clone(this._target, this._rotatePivot);
      getCenter(scene, this._rotateWindowAnchor);
    } else {
      Cartesian2.clone(start, this._rotateWindowAnchor);
    }
    this._rotateActive = true;
  }
  const dx =
    (movement.endPosition.x - movement.startPosition.x) /
    scene.canvas.clientWidth;
  const dy =
    (movement.endPosition.y - movement.startPosition.y) /
    scene.canvas.clientHeight;
  this._heading = CesiumMath.zeroToTwoPi(this._heading + dx * ROTATE_RATE);
  this._pitch = CesiumMath.clamp(
    this._pitch - dy * ROTATE_RATE,
    MINIMUM_PITCH,
    MAXIMUM_PITCH,
  );
  SceneGISPlanarCamera.getAxes(
    this._heading,
    this._pitch,
    scratchDirection,
    scratchUp,
    scratchRight,
  );
  const oldRay = SceneGISPlanarCamera.getWindowRay(
    camera,
    scene.canvas,
    this._rotateWindowAnchor,
    scratchRay,
  );
  const worldPose = SceneGISPlanarCamera.getWorldPose(
    camera,
    scratchCameraPose,
  );
  Cartesian3.subtract(worldPose.position, this._rotatePivot, scratchPoint);
  let distance = Math.hypot(scratchPoint.x, scratchPoint.y, scratchPoint.z);
  if (!SceneGISPlanarCamera.getFrustumInfo(camera.frustum).perspective) {
    distance = (this._rotatePivot.z - oldRay.origin.z) / oldRay.direction.z;
  }
  positionForWindowAnchor(
    scene,
    this._rotatePivot,
    this._rotateWindowAnchor,
    scratchDirection,
    scratchUp,
    scratchRight,
    distance,
    scratchPosition,
  );
  if (scratchPosition.z <= 0.0 || !Number.isFinite(scratchPosition.z)) {
    return;
  }
  SceneGISPlanarCamera.setWorldPose(
    camera,
    scratchPosition,
    scratchDirection,
    scratchUp,
  );
  this._applyTargetClamp(scene);
};

SceneGISPlanarCameraController.prototype._computeHomeState = function (scene) {
  const canvas = scene.canvas;
  if (
    !Number.isFinite(canvas.clientWidth) ||
    !Number.isFinite(canvas.clientHeight) ||
    canvas.clientWidth <= 0 ||
    canvas.clientHeight <= 0
  ) {
    throw new DeveloperError(
      "The planar home viewport must have a positive finite size.",
    );
  }
  const info = SceneGISPlanarCamera.getFrustumInfo(scene.camera.frustum);
  const extent = this._world.coordinateSystem.extent;
  const target = SceneGISPlanarCamera.getExtentCenter(extent, new Cartesian3());
  const halfSize = extent.width * this._homePadding * 0.5;
  if (!Number.isFinite(halfSize) || halfSize <= 0.0) {
    throw new DeveloperError("The padded planar extent is not representable.");
  }

  let distance;
  let orthoScale;
  let maximumRange;
  if (info.perspective) {
    const horizontalSlope = info.horizontalSlopeSpan * 0.5;
    const verticalSlope = info.verticalSlopeSpan * 0.5;
    distance = Math.max(
      halfSize / horizontalSlope,
      halfSize / verticalSlope,
      info.near * (1.0 + CesiumMath.EPSILON8),
    );
    maximumRange =
      distance * Math.hypot(info.centerSlopeX, info.centerSlopeY, 1.0);
  } else {
    orthoScale = Math.max(
      (halfSize * 2.0) / info.horizontalSpan,
      (halfSize * 2.0) / info.verticalSpan,
    );
    distance = info.near + (info.far - info.near) * 0.5;
    maximumRange = info.verticalSpan * orthoScale;
  }
  if (
    !Number.isFinite(distance) ||
    !Number.isFinite(maximumRange) ||
    !Number.isFinite(orthoScale ?? 1.0) ||
    distance <= info.near ||
    distance >= info.far ||
    maximumRange <= 0.0
  ) {
    throw new DeveloperError(
      "The camera near/far range cannot contain the planar home view.",
    );
  }

  const scale = orthoScale ?? 1.0;
  const scaledCenterX = info.centerX * scale;
  const scaledCenterY = info.centerY * scale;
  const position = new Cartesian3(
    target.x -
      (info.perspective ? distance * info.centerSlopeX : scaledCenterX),
    target.y -
      (info.perspective ? distance * info.centerSlopeY : scaledCenterY),
    distance,
  );
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new DeveloperError(
      "The planar home camera position is not representable.",
    );
  }
  return {
    info: info,
    target: target,
    position: position,
    orthoScale: orthoScale,
    maximumRange: maximumRange,
  };
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

SceneGISPlanarCameraController.prototype._zoom = function (scene, movement) {
  const maximum = this._getRanges(scene);
  const camera = scene.camera;
  const pointer = this._aggregator.getStartMousePosition(CameraEventType.WHEEL);
  const pointerAnchor = this._world.pickFromWindowPosition(
    pointer,
    scene,
    scratchPoint,
  );
  const anchor =
    pointerAnchor && Cartesian3.clone(pointerAnchor, new Cartesian3());
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
    const after =
      ray && SceneGISPlanarCamera.intersectPlane(ray, scratchPoint2);
    if (after) {
      Cartesian3.subtract(anchor, after, scratchPoint2);
      translateCamera(camera, scratchPoint2);
    }
  }
  this._applyTargetClamp(scene);
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
  if (!this._enabled) {
    this._clearInputState();
    return;
  }
  this._validateScene(scene);
  if (!defined(this._aggregator)) {
    throw new DeveloperError(
      "The planar controller must be connected before update.",
    );
  }
  const aggregator = this._aggregator;
  if (scene.canvas.clientWidth === 0 || scene.canvas.clientHeight === 0) {
    this._clearInputState();
    return;
  }
  this._discardQuarantinedInput();
  const middleMoving = aggregator.isMoving(CameraEventType.MIDDLE_DRAG);
  const leftMoving = aggregator.isMoving(CameraEventType.LEFT_DRAG);
  const wheelMoving = aggregator.isMoving(CameraEventType.WHEEL);
  if (middleMoving && !this._enableRotate) {
    this._cancelEvent(CameraEventType.MIDDLE_DRAG);
  }
  if (leftMoving && !this._enablePan) {
    this._cancelEvent(CameraEventType.LEFT_DRAG);
  }
  if (middleMoving || leftMoving || wheelMoving) {
    this._syncRig(scene, true);
  }
  try {
    if (middleMoving && this._enableRotate) {
      this._panActive = false;
      this._rotate(scene, aggregator.getMovement(CameraEventType.MIDDLE_DRAG));
    } else if (leftMoving && this._enablePan) {
      this._rotateActive = false;
      this._pan(scene, aggregator.getMovement(CameraEventType.LEFT_DRAG));
    }
    if (wheelMoving && this._enableZoom) {
      this._zoom(scene, aggregator.getMovement(CameraEventType.WHEEL));
    }
    if (!aggregator.isButtonDown(CameraEventType.LEFT_DRAG)) {
      this._panActive = false;
    }
    if (!aggregator.isButtonDown(CameraEventType.MIDDLE_DRAG)) {
      this._rotateActive = false;
    }
  } finally {
    aggregator.reset();
  }
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
  if (defined(home.orthoScale)) {
    SceneGISPlanarCamera.scaleOrthographicFrustum(frustum, home.orthoScale);
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

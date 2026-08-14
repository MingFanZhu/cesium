import Cartesian3 from "../../../Core/Cartesian3.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import EasingFunction from "../../../Core/EasingFunction.js";
import Frozen from "../../../Core/Frozen.js";
import CesiumMath from "../../../Core/Math.js";
import Matrix4 from "../../../Core/Matrix4.js";
import OrthographicFrustum from "../../../Core/OrthographicFrustum.js";
import OrthographicOffCenterFrustum from "../../../Core/OrthographicOffCenterFrustum.js";
import Rectangle from "../../../Core/Rectangle.js";
import SceneGISPlanarCameraController from "../SceneGISPlanarCameraController.js";
import SceneGISPlanarCamera from "./_SceneGISPlanarCamera.js";

const planarFlights = new WeakMap();
const scratchPosition = new Cartesian3();
const scratchDirection = new Cartesian3();
const scratchUp = new Cartesian3();
const scratchRight = new Cartesian3();
const scratchProjection = new Cartesian3();
const scratchPose = {
  position: new Cartesian3(),
  direction: new Cartesian3(),
  up: new Cartesian3(),
  right: new Cartesian3(),
};
const scratchHpr = {};
const scratchHome = {
  info: {},
  target: new Cartesian3(),
  position: new Cartesian3(),
};
const scratchBounding = {
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

function cloneStateVector(value) {
  return Cartesian3.clone(value, new Cartesian3());
}

function normalizeOrientation(direction, up, result) {
  if (!finiteCartesian3(direction) || !finiteCartesian3(up)) {
    throw new DeveloperError(
      "The planar Camera flight direction and up vectors must be finite.",
    );
  }
  SceneGISPlanarCamera.robustNormalize(direction, result.direction);
  const projection = Cartesian3.dot(up, result.direction);
  Cartesian3.multiplyByScalar(result.direction, projection, scratchProjection);
  Cartesian3.subtract(up, scratchProjection, result.up);
  SceneGISPlanarCamera.robustNormalize(result.up, result.up);
  Cartesian3.cross(result.direction, result.up, result.right);
  SceneGISPlanarCamera.robustNormalize(result.right, result.right);
  Cartesian3.cross(result.right, result.direction, result.up);
  SceneGISPlanarCamera.robustNormalize(result.up, result.up);
}

function axesToHeadingPitchRoll(direction, up, right, result) {
  const horizontal = Math.hypot(direction.x, direction.y);
  let heading;
  if (horizontal > CesiumMath.EPSILON12) {
    heading = Math.atan2(direction.x, direction.y);
  } else {
    const directionSign = direction.z > 0.0 ? -1.0 : 1.0;
    heading = Math.atan2(up.x * directionSign, up.y * directionSign);
  }
  const pitch = Math.asin(CesiumMath.clamp(direction.z, -1.0, 1.0));
  SceneGISPlanarCamera.getAxes(
    heading,
    pitch,
    scratchDirection,
    scratchUp,
    scratchRight,
  );
  result.heading = CesiumMath.zeroToTwoPi(heading);
  result.pitch = pitch;
  result.roll =
    horizontal <= CesiumMath.EPSILON12
      ? 0.0
      : Math.atan2(
          Cartesian3.dot(up, scratchRight),
          Cartesian3.dot(up, scratchUp),
        );
  return result;
}

function adjustAngleForLerp(start, end) {
  if (
    CesiumMath.equalsEpsilon(start, CesiumMath.TWO_PI, CesiumMath.EPSILON11)
  ) {
    start = 0.0;
  }
  if (end > start + Math.PI) {
    start += CesiumMath.TWO_PI;
  } else if (end < start - Math.PI) {
    start -= CesiumMath.TWO_PI;
  }
  return start;
}

function createHeightFunction(start, end, optionMaximum, horizontalDistance) {
  let maximum = optionMaximum;
  if (!defined(maximum)) {
    maximum =
      Math.max(start, end) + Math.min(horizontalDistance * 0.2, 1000000000.0);
  }
  const endpointMaximum = Math.max(start, end);
  if (maximum > endpointMaximum) {
    const power = 8.0;
    const factor = 1000000.0;
    const startRoot = -Math.pow((maximum - start) * factor, 1.0 / power);
    const endRoot = Math.pow((maximum - end) * factor, 1.0 / power);
    return function (time) {
      const x = time * (endRoot - startRoot) + startRoot;
      return -Math.pow(x, power) / factor + maximum;
    };
  }
  return function (time) {
    return CesiumMath.lerp(start, end, time);
  };
}

function createPitchFunction(start, end, heightFunction, adjustHeight) {
  const startHeight = heightFunction(0.0);
  const endHeight = heightFunction(1.0);
  const middleHeight = heightFunction(0.5);
  if (
    defined(adjustHeight) &&
    middleHeight > adjustHeight &&
    middleHeight > Math.max(startHeight, endHeight)
  ) {
    return function (time) {
      const height = heightFunction(time);
      if (time <= 0.5) {
        return CesiumMath.lerp(
          start,
          -CesiumMath.PI_OVER_TWO,
          (height - startHeight) / (middleHeight - startHeight),
        );
      }
      return CesiumMath.lerp(
        -CesiumMath.PI_OVER_TWO,
        end,
        1.0 - (height - endHeight) / (middleHeight - endHeight),
      );
    };
  }
  return function (time) {
    return CesiumMath.lerp(start, end, time);
  };
}

function captureFrustumScale(frustum, endScale) {
  if (!defined(endScale)) {
    return undefined;
  }
  if (frustum instanceof OrthographicFrustum) {
    return { type: "orthographic", width: frustum.width, endScale };
  }
  if (frustum instanceof OrthographicOffCenterFrustum) {
    return {
      type: "orthographicOffCenter",
      left: frustum.left,
      right: frustum.right,
      bottom: frustum.bottom,
      top: frustum.top,
      endScale,
    };
  }
  throw new DeveloperError(
    "Only an orthographic planar Camera flight may scale its frustum.",
  );
}

function applyFrustumScale(frustum, state, time) {
  if (!defined(state)) {
    return;
  }
  const scale = CesiumMath.lerp(1.0, state.endScale, time);
  if (!Number.isFinite(scale) || scale <= 0.0) {
    throw new DeveloperError("The planar Camera flight scale is invalid.");
  }
  if (state.type === "orthographic") {
    frustum.width = state.width * scale;
  } else {
    frustum.left = state.left * scale;
    frustum.right = state.right * scale;
    frustum.bottom = state.bottom * scale;
    frustum.top = state.top * scale;
  }
}

function restoreInput(state) {
  if (defined(state.controller)) {
    state.controller._resumeFromCameraFlight(state.suspensionToken);
  }
  state.suspensionToken = undefined;
}

function releaseFlight(state, tween) {
  try {
    restoreInput(state);
  } finally {
    planarFlights.delete(tween);
    if (state.camera._currentFlight === tween) {
      state.camera._currentFlight = undefined;
    }
  }
}

function buildFlightCandidate(camera, options, stateOptions) {
  const world = SceneGISPlanarCamera.validatePlanarCamera(camera);
  const destination = stateOptions?.destination ?? options.destination;
  if (!defined(destination)) {
    throw new DeveloperError("destination is required.");
  }
  if (destination instanceof Rectangle || defined(destination.west)) {
    throw new DeveloperError(
      "Rectangle destinations are not supported by a planar Camera flight.",
    );
  }
  if (!finiteCartesian3(destination)) {
    throw new DeveloperError(
      "The planar Camera flight destination must be a finite Cartesian3.",
    );
  }
  if (
    defined(options.flyOverLongitude) ||
    defined(options.flyOverLongitudeWeight)
  ) {
    throw new DeveloperError(
      "flyOverLongitude and flyOverLongitudeWeight are not supported by a planar Camera flight.",
    );
  }
  for (const [name, value] of [
    ["duration", options.duration],
    ["maximumHeight", options.maximumHeight],
    ["pitchAdjustHeight", options.pitchAdjustHeight],
  ]) {
    if (defined(value) && !Number.isFinite(value)) {
      throw new DeveloperError(
        `${name} must be finite for a planar Camera flight.`,
      );
    }
  }

  const orientation = stateOptions?.orientation ?? options.orientation ?? {};
  const hasDirection = defined(orientation.direction);
  const hasUp = defined(orientation.up);
  if (hasDirection !== hasUp) {
    throw new DeveloperError(
      "Planar Camera orientation.direction and orientation.up must be provided together.",
    );
  }
  const endAxes = {
    direction: new Cartesian3(),
    up: new Cartesian3(),
    right: new Cartesian3(),
  };
  if (hasDirection) {
    normalizeOrientation(orientation.direction, orientation.up, endAxes);
    axesToHeadingPitchRoll(
      endAxes.direction,
      endAxes.up,
      endAxes.right,
      scratchHpr,
    );
  } else {
    scratchHpr.heading = orientation.heading ?? 0.0;
    scratchHpr.pitch = orientation.pitch ?? -CesiumMath.PI_OVER_TWO;
    scratchHpr.roll = orientation.roll ?? 0.0;
    SceneGISPlanarCamera.getAxes(
      scratchHpr.heading,
      scratchHpr.pitch,
      endAxes.direction,
      endAxes.up,
      endAxes.right,
      scratchHpr.roll,
    );
  }
  const transform = Matrix4.clone(
    options.endTransform ?? camera.transform,
    new Matrix4(),
  );
  SceneGISPlanarCamera.validateWorldPose(
    camera,
    destination,
    endAxes.direction,
    endAxes.up,
    transform,
  );

  const startPose = SceneGISPlanarCamera.getWorldPose(camera, scratchPose);
  const startHpr = SceneGISPlanarCamera.getHeadingPitchRoll(camera, {});
  const horizontalDistance = Math.hypot(
    destination.x - startPose.position.x,
    destination.y - startPose.position.y,
  );
  const heightFunction = createHeightFunction(
    startPose.position.z,
    destination.z,
    options.maximumHeight,
    horizontalDistance,
  );
  const pitchFunction = createPitchFunction(
    startHpr.pitch,
    scratchHpr.pitch,
    heightFunction,
    options.pitchAdjustHeight,
  );
  let duration = options.duration;
  if (!defined(duration)) {
    duration = Math.min(
      Math.ceil(
        Cartesian3.distance(startPose.position, destination) / 1000000.0,
      ) + 2.0,
      3.0,
    );
  }
  const orientationUnchanged =
    CesiumMath.equalsEpsilon(
      CesiumMath.negativePiToPi(startHpr.heading),
      CesiumMath.negativePiToPi(scratchHpr.heading),
      CesiumMath.EPSILON10,
    ) &&
    CesiumMath.equalsEpsilon(
      CesiumMath.negativePiToPi(startHpr.pitch),
      CesiumMath.negativePiToPi(scratchHpr.pitch),
      CesiumMath.EPSILON10,
    ) &&
    CesiumMath.equalsEpsilon(
      CesiumMath.negativePiToPi(startHpr.roll),
      CesiumMath.negativePiToPi(scratchHpr.roll),
      CesiumMath.EPSILON10,
    );
  if (
    Cartesian3.equalsEpsilon(
      startPose.position,
      destination,
      CesiumMath.EPSILON10,
    ) &&
    orientationUnchanged &&
    (!defined(stateOptions?.orthographicScale) ||
      CesiumMath.equalsEpsilon(
        stateOptions.orthographicScale,
        1.0,
        CesiumMath.EPSILON10,
      ))
  ) {
    duration = 0.0;
  }
  let easingFunction = options.easingFunction;
  if (!defined(easingFunction)) {
    easingFunction =
      startPose.position.z > destination.z && startPose.position.z > 11500.0
        ? EasingFunction.CUBIC_OUT
        : EasingFunction.QUINTIC_IN_OUT;
  }
  const state = {
    world,
    camera,
    scene: camera._scene,
    startPosition: cloneStateVector(startPose.position),
    destination: cloneStateVector(destination),
    transform,
    originalTransform: Matrix4.clone(camera.transform, new Matrix4()),
    startHeading: adjustAngleForLerp(startHpr.heading, scratchHpr.heading),
    endHeading: scratchHpr.heading,
    startPitch: startHpr.pitch,
    endPitch: scratchHpr.pitch,
    startRoll: adjustAngleForLerp(startHpr.roll, scratchHpr.roll),
    endRoll: scratchHpr.roll,
    heightFunction,
    pitchFunction,
    duration,
    easingFunction,
    complete: options.complete,
    cancel: options.cancel,
    completingExplicitly: false,
    controller: SceneGISPlanarCameraController._getRegisteredForScene(
      camera._scene,
    ),
    suspensionToken: undefined,
    frustumScale: captureFrustumScale(
      camera.frustum,
      stateOptions?.orthographicScale,
    ),
    endDirection: cloneStateVector(endAxes.direction),
    endUp: cloneStateVector(endAxes.up),
    preloadCullingVolume: undefined,
  };
  const preloadFrustum = camera.frustum.clone();
  applyFrustumScale(preloadFrustum, state.frustumScale, 1.0);
  state.preloadCullingVolume = preloadFrustum.computeCullingVolume(
    state.destination,
    state.endDirection,
    state.endUp,
  );
  return state;
}

function updateFlight(state, time) {
  const camera = state.camera;
  const ratio = state.duration === 0.0 ? 1.0 : time / state.duration;
  if (ratio >= 1.0) {
    Cartesian3.clone(state.destination, scratchPosition);
  } else {
    scratchPosition.x = CesiumMath.lerp(
      state.startPosition.x,
      state.destination.x,
      ratio,
    );
    scratchPosition.y = CesiumMath.lerp(
      state.startPosition.y,
      state.destination.y,
      ratio,
    );
    scratchPosition.z = state.heightFunction(ratio);
  }
  const heading = CesiumMath.lerp(state.startHeading, state.endHeading, ratio);
  const pitch = state.pitchFunction(ratio);
  const roll = CesiumMath.lerp(state.startRoll, state.endRoll, ratio);
  SceneGISPlanarCamera.getAxes(
    heading,
    pitch,
    scratchDirection,
    scratchUp,
    scratchRight,
    roll,
  );
  SceneGISPlanarCamera.setWorldPose(
    camera,
    scratchPosition,
    scratchDirection,
    scratchUp,
  );
  applyFrustumScale(camera.frustum, state.frustumScale, ratio);
}

function addFlight(camera, options, stateOptions) {
  const state = buildFlightCandidate(camera, options, stateOptions);
  if (state.duration <= 0.0) {
    try {
      if (defined(state.controller)) {
        state.suspensionToken = state.controller._suspendForCameraFlight(
          state.scene,
        );
      }
      camera.cancelFlight();
      if (!Matrix4.equals(camera.transform, state.transform)) {
        camera._setTransform(state.transform);
      }
      updateFlight(state, state.duration);
      restoreInput(state);
      state.scene.requestRender();
    } catch (error) {
      restoreInput(state);
      if (!Matrix4.equals(camera.transform, state.originalTransform)) {
        camera._setTransform(state.originalTransform);
      }
      throw error;
    }
    if (typeof state.complete === "function") {
      state.complete();
    }
    return;
  }

  let tween;
  try {
    if (defined(state.controller)) {
      state.suspensionToken = state.controller._suspendForCameraFlight(
        state.scene,
      );
    }
    const tweenOptions = {
      duration: state.duration,
      easingFunction: state.easingFunction,
      startObject: { time: 0.0 },
      stopObject: { time: state.duration },
      update(value) {
        try {
          updateFlight(state, value.time);
        } catch (error) {
          restoreInput(state);
          throw error;
        }
      },
      complete() {
        releaseFlight(state, tween);
        if (typeof state.complete === "function") {
          state.complete();
        }
      },
      cancel() {
        releaseFlight(state, tween);
        if (!state.completingExplicitly && typeof state.cancel === "function") {
          state.cancel();
        }
      },
    };
    tween = state.scene.tweens.add(tweenOptions);
    planarFlights.set(tween, state);
    camera.cancelFlight();
    if (!Matrix4.equals(camera.transform, state.transform)) {
      camera._setTransform(state.transform);
    }
    camera._currentFlight = tween;
    state.scene.preloadFlightCullingVolume = state.preloadCullingVolume;
    state.scene.requestRender();
  } catch (error) {
    restoreInput(state);
    if (defined(tween)) {
      planarFlights.delete(tween);
      tween.cancelTween();
    }
    if (!Matrix4.equals(camera.transform, state.originalTransform)) {
      camera._setTransform(state.originalTransform);
    }
    throw error;
  }
}

function flyTo(camera, options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  addFlight(camera, options);
}

function flyHome(camera, duration) {
  const world = SceneGISPlanarCamera.validatePlanarCamera(camera);
  const controller = SceneGISPlanarCameraController._getRegisteredForScene(
    camera._scene,
  );
  const padding = controller?._homePadding ?? 1.05;
  const home = SceneGISPlanarCamera.computeHomeState(
    camera,
    camera._scene.canvas,
    world.coordinateSystem.extent,
    padding,
    scratchHome,
  );
  addFlight(
    camera,
    {
      destination: Cartesian3.clone(home.position, new Cartesian3()),
      orientation: {
        heading: home.heading,
        pitch: home.pitch,
        roll: home.roll,
      },
      duration,
    },
    { orthographicScale: home.orthographicScale },
  );
}

function flyToBoundingSphere(camera, boundingSphere, options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  const state = SceneGISPlanarCamera.computeBoundingSphereState(
    camera,
    boundingSphere,
    options.offset,
    scratchBounding,
  );
  addFlight(
    camera,
    {
      destination: Cartesian3.clone(state.position, new Cartesian3()),
      orientation: {
        direction: Cartesian3.clone(state.direction, new Cartesian3()),
        up: Cartesian3.clone(state.up, new Cartesian3()),
      },
      duration: options.duration,
      complete: options.complete,
      cancel: options.cancel,
      endTransform: options.endTransform,
      maximumHeight: options.maximumHeight,
      pitchAdjustHeight: options.pitchAdjustHeight,
      easingFunction: options.easingFunction,
      flyOverLongitude: options.flyOverLongitude,
      flyOverLongitudeWeight: options.flyOverLongitudeWeight,
    },
    {
      orthographicScale: state.orthographicScale,
      orientation: state,
    },
  );
}

function cancelFlight(camera) {
  const tween = camera._currentFlight;
  if (!defined(tween) || !planarFlights.has(tween)) {
    return false;
  }
  tween.cancelTween();
  planarFlights.delete(tween);
  camera._currentFlight = undefined;
  return true;
}

function completeFlight(camera) {
  const tween = camera._currentFlight;
  const state = defined(tween) ? planarFlights.get(tween) : undefined;
  if (!defined(state)) {
    return false;
  }
  state.completingExplicitly = true;
  try {
    tween.cancelTween();
    updateFlight(state, state.duration);
    state.scene.requestRender();
    if (typeof tween.complete === "function") {
      tween.complete();
    }
  } finally {
    state.completingExplicitly = false;
    releaseFlight(state, tween);
  }
  return true;
}

/** @private */
const SceneGISPlanarCameraFlight = {
  cancelFlight,
  completeFlight,
  flyHome,
  flyTo,
  flyToBoundingSphere,
};

export default SceneGISPlanarCameraFlight;

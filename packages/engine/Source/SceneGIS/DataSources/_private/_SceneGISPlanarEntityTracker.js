import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix4 from "../../../Core/Matrix4.js";
import ReferenceFrame from "../../../Core/ReferenceFrame.js";
import TrackingReferenceFrame from "../../../Core/TrackingReferenceFrame.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import Entity from "../../../DataSources/Entity.js";
import Property from "../../../DataSources/Property.js";
import SceneMode from "../../../Scene/SceneMode.js";
import SceneGISPlanarCameraController from "../../Scene/SceneGISPlanarCameraController.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";
import SceneGISPlanarCamera from "../../Scene/_private/_SceneGISPlanarCamera.js";

function isLivePlanarWidget(widget) {
  const world = widget?.scene?.world;
  return world instanceof SceneGISPlanarWorld && !world.isDestroyed();
}

function validateStaticTarget(target) {
  if (!(target instanceof Entity)) {
    throw new DeveloperError(
      "A planar trackedEntity must be an Entity with a FIXED position.",
    );
  }
  if (!defined(target.position)) {
    throw new DeveloperError("A planar trackedEntity must define a position.");
  }
  if (target.position.referenceFrame !== ReferenceFrame.FIXED) {
    throw new DeveloperError(
      "A planar trackedEntity position must use ReferenceFrame.FIXED.",
    );
  }
  const trackingReferenceFrame = target.trackingReferenceFrame;
  if (
    trackingReferenceFrame !== TrackingReferenceFrame.AUTODETECT &&
    trackingReferenceFrame !== TrackingReferenceFrame.ENU
  ) {
    throw new DeveloperError(
      "A planar trackedEntity trackingReferenceFrame must be AUTODETECT or ENU.",
    );
  }
}

function isFiniteCartesian3(value) {
  return (
    value instanceof Cartesian3 &&
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

function validatePosition(value) {
  if (!isFiniteCartesian3(value)) {
    throw new DeveloperError(
      "A defined planar trackedEntity position must be a finite Cartesian3.",
    );
  }
}

function validateOffset(value, name) {
  if (
    !isFiniteCartesian3(value) ||
    Cartesian3.magnitudeSquared(value) === 0.0
  ) {
    throw new DeveloperError(`${name} must be a finite non-zero Cartesian3.`);
  }
}

function getCurrentPosition(entity, time, result) {
  return Property.getValueOrUndefined(entity.position, time, result);
}

function getCurrentViewFrom(entity, time, result) {
  return Property.getValueOrUndefined(entity.viewFrom, time, result);
}

function isCurrentTarget(tracker, entity, revision) {
  return tracker._entity === entity && tracker._targetRevision === revision;
}

function validateScene(tracker, scene) {
  const world = tracker._widget.scene.world;
  if (
    scene !== tracker._widget.scene ||
    !(world instanceof SceneGISPlanarWorld) ||
    world.isDestroyed() ||
    scene.world !== world ||
    scene.mode !== SceneMode.SCENE3D
  ) {
    throw new DeveloperError(
      "Planar Entity tracking requires the connected SCENE3D Scene and its live SceneGISPlanarWorld.",
    );
  }
  SceneGISPlanarCamera.validatePlanarCamera(scene.camera);
}

function requestDefinitionRender(tracker) {
  if (tracker._definitionRenderRequested) {
    return;
  }
  tracker._definitionRenderRequested = true;
  tracker._widget.scene.requestRender();
}

function removeDefinitionListener(tracker) {
  const remove = tracker._removeDefinitionListener;
  tracker._removeDefinitionListener = undefined;
  if (defined(remove)) {
    remove();
  }
}

function releaseInputAuthority(tracker) {
  const token = tracker._inputToken;
  tracker._inputToken = undefined;
  if (defined(token)) {
    token.controller._resumeFromEntityTracking(token);
  }
}

function stopAuthority(tracker) {
  const hadAuthority = tracker._hasAuthority;
  tracker._hasAuthority = false;
  tracker._hasLastPosition = false;
  tracker._hasOffset = false;
  tracker._flightWasActive = false;
  try {
    if (
      hadAuthority &&
      defined(tracker._scene) &&
      !defined(tracker._scene.camera._currentFlight)
    ) {
      tracker._scene.camera.lookAtTransform(Matrix4.IDENTITY);
    }
  } finally {
    releaseInputAuthority(tracker);
  }
}

function acquireInputAuthority(tracker, scene) {
  const controller =
    SceneGISPlanarCameraController._getRegisteredForScene(scene);
  return defined(controller)
    ? controller._suspendForEntityTracking(scene)
    : undefined;
}

function synchronizeInputAuthority(tracker, scene) {
  const controller =
    SceneGISPlanarCameraController._getRegisteredForScene(scene);
  const currentToken = tracker._inputToken;
  if (currentToken?.controller === controller && currentToken.active) {
    return;
  }
  const nextToken = defined(controller)
    ? controller._suspendForEntityTracking(scene)
    : undefined;
  tracker._inputToken = nextToken;
  if (defined(currentToken)) {
    currentToken.controller._resumeFromEntityTracking(currentToken);
  }
}

function snapshotCamera(tracker, camera) {
  SceneGISPlanarCamera.getWorldPose(camera, tracker._cameraSnapshot);
  Matrix4.clone(camera.transform, tracker._transformSnapshot);
}

function restoreCamera(tracker, camera) {
  const pose = tracker._cameraSnapshot;
  SceneGISPlanarCamera.setWorldPose(
    camera,
    pose.position,
    pose.direction,
    pose.up,
    tracker._transformSnapshot,
  );
}

function acquireAuthority(tracker, scene, time, position, entity, revision) {
  const camera = scene.camera;
  let offset = getCurrentViewFrom(entity, time, tracker._candidateOffset);
  if (!isCurrentTarget(tracker, entity, revision)) {
    return false;
  }
  if (defined(offset)) {
    validateOffset(offset, "A planar trackedEntity viewFrom");
  }
  let state;
  if (!defined(offset)) {
    state = tracker._widget._dataSourceDisplay.getBoundingSphere(
      entity,
      false,
      tracker._boundingSphere,
    );
    if (!isCurrentTarget(tracker, entity, revision)) {
      return false;
    }
    if (state === BoundingSphereState.PENDING) {
      return false;
    }
    if (state === BoundingSphereState.FAILED) {
      const pose = SceneGISPlanarCamera.getWorldPose(
        camera,
        tracker._worldPose,
      );
      Cartesian3.subtract(pose.position, position, tracker._candidateOffset);
      validateOffset(
        tracker._candidateOffset,
        "The planar tracking Camera offset",
      );
      offset = tracker._candidateOffset;
    }
  }

  snapshotCamera(tracker, camera);
  let token;
  try {
    token = acquireInputAuthority(tracker, scene);
    if (state === BoundingSphereState.DONE) {
      camera.viewBoundingSphere(tracker._boundingSphere);
      const framedPose = SceneGISPlanarCamera.getWorldPose(
        camera,
        tracker._worldPose,
      );
      Cartesian3.subtract(
        framedPose.position,
        position,
        tracker._candidateOffset,
      );
      validateOffset(
        tracker._candidateOffset,
        "The planar tracking bounds offset",
      );
      offset = tracker._candidateOffset;
    }
    camera.lookAt(position, offset);
  } catch (error) {
    restoreCamera(tracker, camera);
    if (defined(token)) {
      token.controller._resumeFromEntityTracking(token);
    }
    throw error;
  }

  Cartesian3.clone(offset, tracker._offset);
  Cartesian3.clone(position, tracker._lastPosition);
  tracker._hasOffset = true;
  tracker._hasLastPosition = true;
  tracker._hasAuthority = true;
  tracker._inputToken = token;
  tracker._flightWasActive = false;
  return true;
}

/**
 * Fixed-axis planar Entity tracking controller owned by one CesiumWidget.
 *
 * @private
 */
function SceneGISPlanarEntityTracker(widget) {
  if (!isLivePlanarWidget(widget)) {
    throw new DeveloperError(
      "A planar Entity tracker requires a CesiumWidget with a live SceneGISPlanarWorld.",
    );
  }
  this._widget = widget;
  this._entity = undefined;
  this._targetRevision = 0;
  this._element = undefined;
  this._scene = undefined;
  this._removeDefinitionListener = undefined;
  this._definitionRenderRequested = false;
  this._hasAuthority = false;
  this._hasOffset = false;
  this._hasLastPosition = false;
  this._inputToken = undefined;
  this._flightWasActive = false;
  this._position = new Cartesian3();
  this._candidateOffset = new Cartesian3();
  this._offset = new Cartesian3();
  this._lastPosition = new Cartesian3();
  this._boundingSphere = new BoundingSphere();
  this._worldPose = {
    position: new Cartesian3(),
    direction: new Cartesian3(),
    up: new Cartesian3(),
    right: new Cartesian3(),
  };
  this._cameraSnapshot = {
    position: new Cartesian3(),
    direction: new Cartesian3(),
    up: new Cartesian3(),
    right: new Cartesian3(),
  };
  this._transformSnapshot = new Matrix4();
}

Object.defineProperties(SceneGISPlanarEntityTracker.prototype, {
  enabled: {
    get: function () {
      return defined(this._entity);
    },
  },
});

SceneGISPlanarEntityTracker.prototype.connectedCallback = function (element) {
  if (!defined(element) || defined(this._element)) {
    throw new DeveloperError(
      "The planar Entity tracker requires one ControllerHost connection.",
    );
  }
  this._element = element;
};

SceneGISPlanarEntityTracker.prototype.disconnectedCallback = function (
  element,
) {
  if (!defined(this._element) || element !== this._element) {
    throw new DeveloperError(
      "element must match the connected planar Entity tracker host.",
    );
  }
  removeDefinitionListener(this);
  stopAuthority(this);
  this._entity = undefined;
  this._scene = undefined;
  this._element = undefined;
};

SceneGISPlanarEntityTracker.prototype.firstUpdate = function (scene, time) {
  if (!defined(this._element)) {
    throw new DeveloperError(
      "The planar Entity tracker must be connected before firstUpdate.",
    );
  }
  validateScene(this, scene);
  this._scene = scene;
};

SceneGISPlanarEntityTracker.prototype.update = function (scene, time) {
  validateScene(this, scene);
  this._scene = scene;
  this._definitionRenderRequested = false;

  const entity = this._entity;
  if (!defined(entity)) {
    return;
  }
  validateStaticTarget(entity);
  const revision = this._targetRevision;
  const position = getCurrentPosition(entity, time, this._position);
  if (!isCurrentTarget(this, entity, revision)) {
    return;
  }
  if (defined(position)) {
    validatePosition(position);
  }
  if (this._hasAuthority) {
    synchronizeInputAuthority(this, scene);
  }
  if (!defined(position)) {
    return;
  }
  if (defined(scene.camera._currentFlight)) {
    this._flightWasActive = true;
    return;
  }
  if (!this._hasAuthority) {
    acquireAuthority(this, scene, time, position, entity, revision);
    return;
  }
  scene.camera.lookAt(position, this._offset);
  if (!Cartesian3.equals(position, this._lastPosition)) {
    Cartesian3.clone(position, this._lastPosition);
  }
  this._flightWasActive = false;
};

SceneGISPlanarEntityTracker.prototype.setTarget = function (entity) {
  if (entity === this._entity) {
    return;
  }
  if (defined(entity)) {
    validateStaticTarget(entity);
  }
  removeDefinitionListener(this);
  stopAuthority(this);
  this._entity = entity;
  this._targetRevision++;
  this._definitionRenderRequested = false;
  if (defined(entity)) {
    this._removeDefinitionListener = entity.definitionChanged.addEventListener(
      function () {
        requestDefinitionRender(this);
      },
      this,
    );
  }
};

SceneGISPlanarEntityTracker.prototype.destroy = function () {
  removeDefinitionListener(this);
  stopAuthority(this);
  this._entity = undefined;
};

function ensure(widget) {
  let tracker = widget._sceneGISPlanarEntityTracker;
  if (!defined(tracker)) {
    tracker = new SceneGISPlanarEntityTracker(widget);
    widget.addController(tracker);
    widget._sceneGISPlanarEntityTracker = tracker;
  }
  return tracker;
}

function setTarget(widget, entity) {
  const tracker = ensure(widget);
  tracker.setTarget(entity);
}

function clear(widget) {
  const tracker = widget._sceneGISPlanarEntityTracker;
  if (defined(tracker)) {
    tracker.setTarget(undefined);
  }
}

function clearForSuccessfulFraming(widget) {
  if (!defined(widget._trackedEntity)) {
    return;
  }
  clear(widget);
  widget._trackedEntity = undefined;
  widget._needTrackedEntityUpdate = false;
  widget._entityView = undefined;
  widget._trackedEntityChanged.raiseEvent(undefined);
  widget.scene.requestRender();
}

function destroy(widget) {
  const tracker = widget._sceneGISPlanarEntityTracker;
  if (!defined(tracker)) {
    return;
  }
  tracker.destroy();
  widget.removeController(tracker);
  widget._sceneGISPlanarEntityTracker = undefined;
}

function canTrack(widget, entity, time) {
  if (!isLivePlanarWidget(widget)) {
    return false;
  }
  try {
    validateStaticTarget(entity);
    return defined(getCurrentPosition(entity, time, scratchPosition));
  } catch {
    return false;
  }
}

const scratchPosition = new Cartesian3();

const SceneGISPlanarEntityTrackerApi = {
  SceneGISPlanarEntityTracker,
  canTrack,
  clear,
  clearForSuccessfulFraming,
  destroy,
  isLivePlanarWidget,
  setTarget,
  validateStaticTarget,
};

export default SceneGISPlanarEntityTrackerApi;

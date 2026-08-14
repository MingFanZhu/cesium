import {
  BoundingSphere,
  BoundingSphereState,
  CallbackPositionProperty,
  CallbackProperty,
  Cartesian3,
  CesiumWidget,
  Color,
  ConstantPositionProperty,
  Entity,
  JulianDate,
  Matrix4,
  ReferenceFrame,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  TrackingReferenceFrame,
} from "../../../../index.js";
import getWebGLStub from "../../../../../../Specs/getWebGLStub.js";

describe("SceneGIS/DataSources/_private/SceneGISPlanarEntityTracker", function () {
  let container;
  let widget;
  let controller;

  function createWorld() {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
      }),
      maximumLevel: 0,
      baseColor: Color.BLACK,
    });
  }

  function createWidget(withController = true) {
    const contextOptions = { webgl: { antialias: false } };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    const world = createWorld();
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      requestRenderMode: true,
      contextOptions,
    });
    widget.scene.rethrowRenderErrors = true;
    widget.scene.screenSpaceCameraController.enableInputs = false;
    if (withController) {
      controller = new SceneGISPlanarCameraController({ world });
      widget.addController(controller);
    }
    return widget;
  }

  function createEntity(options = {}) {
    return new Entity({
      id: options.id,
      position:
        options.position ??
        new ConstantPositionProperty(
          new Cartesian3(10.0, 20.0, 5.0),
          ReferenceFrame.FIXED,
        ),
      trackingReferenceFrame:
        options.trackingReferenceFrame ?? TrackingReferenceFrame.AUTODETECT,
      viewFrom: options.viewFrom,
    });
  }

  beforeEach(function () {
    container = document.createElement("div");
    container.style.width = "96px";
    container.style.height = "96px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      widget = widget.destroy();
    }
    widget = undefined;
    controller = undefined;
    document.body.removeChild(container);
  });

  it("validates the exact fixed-axis Entity profile", function () {
    createWidget(false);
    const valid = createEntity();
    const enu = createEntity({
      trackingReferenceFrame: TrackingReferenceFrame.ENU,
    });
    expect(
      widget._canTrackSceneGISPlanarEntity(valid, widget.clock.currentTime),
    ).toBe(true);
    expect(
      widget._canTrackSceneGISPlanarEntity(enu, widget.clock.currentTime),
    ).toBe(true);

    expect(function () {
      widget.trackedEntity = {};
    }).toThrowDeveloperError();
    expect(function () {
      widget.trackedEntity = new Entity();
    }).toThrowDeveloperError();
    expect(function () {
      widget.trackedEntity = createEntity({
        position: new ConstantPositionProperty(
          new Cartesian3(1.0, 2.0, 3.0),
          ReferenceFrame.INERTIAL,
        ),
      });
    }).toThrowDeveloperError();
    function setTrackedEntityWithReferenceFrame(targetWidget, referenceFrame) {
      targetWidget.trackedEntity = createEntity({
        trackingReferenceFrame: referenceFrame,
      });
    }
    for (const referenceFrame of [
      TrackingReferenceFrame.INERTIAL,
      TrackingReferenceFrame.VELOCITY,
      12345,
    ]) {
      expect(
        setTrackedEntityWithReferenceFrame.bind(
          undefined,
          widget,
          referenceFrame,
        ),
      ).toThrowDeveloperError();
    }
  });

  it("acquires one fixed viewFrom offset and follows Clock samples", function () {
    createWidget();
    let sample = new Cartesian3(10.0, 20.0, 5.0);
    const position = new CallbackPositionProperty(
      function (time, result) {
        return definedClone(sample, result);
      },
      false,
      ReferenceFrame.FIXED,
    );
    const entity = createEntity({
      position,
      viewFrom: new Cartesian3(0.0, -30.0, 40.0),
    });
    const time = JulianDate.fromIso8601("2026-08-14T00:00:00Z");

    widget.trackedEntity = entity;
    widget.scene.controllerHost.update(widget.scene, time);
    expect(widget.camera.positionWC).toEqual(new Cartesian3(10.0, -10.0, 45.0));
    expect(controller._trackingSuspensionCount).toBe(1);
    const tracker = widget._sceneGISPlanarEntityTracker;
    const listenerCount = entity.definitionChanged.numberOfListeners;
    const token = tracker._inputToken;

    sample = new Cartesian3(15.0, 25.0, 7.0);
    widget.scene.controllerHost.update(widget.scene, time);
    expect(widget.camera.positionWC).toEqual(new Cartesian3(15.0, -5.0, 47.0));
    expect(tracker._inputToken).toBe(token);
    expect(entity.definitionChanged.numberOfListeners).toBe(listenerCount);

    Cartesian3.clone(Cartesian3.ZERO, widget.camera.position);
    widget.scene.controllerHost.update(widget.scene, time);
    expect(widget.camera.positionWC).toEqual(new Cartesian3(15.0, -5.0, 47.0));

    sample = undefined;
    const gapPose = Cartesian3.clone(widget.camera.positionWC);
    widget.scene.controllerHost.update(widget.scene, time);
    expect(widget.camera.positionWC).toEqual(gapPose);
    expect(controller._trackingSuspensionCount).toBe(1);

    sample = new Cartesian3(20.0, 30.0, 9.0);
    widget.scene.controllerHost.update(widget.scene, time);
    expect(widget.camera.positionWC).toEqual(new Cartesian3(20.0, 0.0, 49.0));

    widget.trackedEntity = undefined;
    expect(controller._trackingSuspensionCount).toBe(0);
    expect(widget.camera.transform).toEqual(Matrix4.IDENTITY);
    expect(entity.definitionChanged.numberOfListeners).toBe(listenerCount - 1);
  });

  it("discards stale position and viewFrom target transactions", function () {
    createWidget();
    const time = widget.clock.currentTime;
    widget.scene.controllerHost.update(widget.scene, time);
    const positionSample = new Cartesian3(10.0, 20.0, 5.0);
    const changes = [];
    widget.trackedEntityChanged.addEventListener(function (value) {
      changes.push(value);
    });

    let clearDuringPosition = true;
    const clearingEntity = createEntity({
      position: new CallbackPositionProperty(
        function (sampleTime, result) {
          if (clearDuringPosition) {
            clearDuringPosition = false;
            widget.trackedEntity = undefined;
          }
          return Cartesian3.clone(positionSample, result);
        },
        false,
        ReferenceFrame.FIXED,
      ),
    });
    const clearingListenerCount =
      clearingEntity.definitionChanged.numberOfListeners;
    const clearPose = Cartesian3.clone(widget.camera.positionWC);
    widget.trackedEntity = clearingEntity;
    widget.scene.controllerHost.update(widget.scene, time);
    const tracker = widget._sceneGISPlanarEntityTracker;
    expect(widget.trackedEntity).toBeUndefined();
    expect(tracker._hasAuthority).toBe(false);
    expect(tracker._inputToken).toBeUndefined();
    expect(controller._trackingSuspensionCount).toBe(0);
    expect(widget.camera.positionWC).toEqual(clearPose);
    expect(clearingEntity.definitionChanged.numberOfListeners).toBe(
      clearingListenerCount,
    );
    expect(changes.slice(-2)).toEqual([clearingEntity, undefined]);

    const positionReplacement = createEntity({
      position: new Cartesian3(40.0, 50.0, 6.0),
      viewFrom: new Cartesian3(0.0, -20.0, 20.0),
    });
    let replaceDuringPosition = true;
    const positionSource = createEntity({
      position: new CallbackPositionProperty(
        function (sampleTime, result) {
          if (replaceDuringPosition) {
            replaceDuringPosition = false;
            widget.trackedEntity = positionReplacement;
          }
          return Cartesian3.clone(positionSample, result);
        },
        false,
        ReferenceFrame.FIXED,
      ),
    });
    const sourceListenerCount =
      positionSource.definitionChanged.numberOfListeners;
    const replacementListenerCount =
      positionReplacement.definitionChanged.numberOfListeners;
    const replacementPose = Cartesian3.clone(widget.camera.positionWC);
    widget.trackedEntity = positionSource;
    widget.scene.controllerHost.update(widget.scene, time);
    expect(widget.trackedEntity).toBe(positionReplacement);
    expect(tracker._hasAuthority).toBe(false);
    expect(tracker._inputToken).toBeUndefined();
    expect(widget.camera.positionWC).toEqual(replacementPose);
    expect(positionSource.definitionChanged.numberOfListeners).toBe(
      sourceListenerCount,
    );
    expect(positionReplacement.definitionChanged.numberOfListeners).toBe(
      replacementListenerCount + 1,
    );
    widget.scene.controllerHost.update(widget.scene, time);
    expect(tracker._hasAuthority).toBe(true);
    expect(tracker._lastPosition).toEqual(new Cartesian3(40.0, 50.0, 6.0));
    widget.trackedEntity = undefined;

    const viewFromReplacement = createEntity({
      position: new Cartesian3(70.0, 80.0, 9.0),
      viewFrom: new Cartesian3(0.0, -30.0, 30.0),
    });
    let replaceDuringViewFrom = true;
    const viewFromSample = new Cartesian3(0.0, -25.0, 25.0);
    const viewFromSource = createEntity({
      position: new Cartesian3(15.0, 25.0, 7.0),
      viewFrom: new CallbackProperty(function (sampleTime, result) {
        if (replaceDuringViewFrom) {
          replaceDuringViewFrom = false;
          widget.trackedEntity = viewFromReplacement;
        }
        return Cartesian3.clone(viewFromSample, result);
      }, false),
    });
    const viewFromPose = Cartesian3.clone(widget.camera.positionWC);
    widget.trackedEntity = viewFromSource;
    widget.scene.controllerHost.update(widget.scene, time);
    expect(widget.trackedEntity).toBe(viewFromReplacement);
    expect(tracker._hasAuthority).toBe(false);
    expect(tracker._inputToken).toBeUndefined();
    expect(widget.camera.positionWC).toEqual(viewFromPose);
    widget.scene.controllerHost.update(widget.scene, time);
    expect(tracker._hasAuthority).toBe(true);
    expect(tracker._lastPosition).toEqual(new Cartesian3(70.0, 80.0, 9.0));
    widget.trackedEntity = undefined;

    const sameEntity = createEntity({
      position: new CallbackPositionProperty(
        function (sampleTime, result) {
          widget.trackedEntity = sameEntity;
          return Cartesian3.clone(positionSample, result);
        },
        false,
        ReferenceFrame.FIXED,
      ),
      viewFrom: new Cartesian3(0.0, -20.0, 20.0),
    });
    widget.trackedEntity = sameEntity;
    widget.scene.controllerHost.update(widget.scene, time);
    expect(widget.trackedEntity).toBe(sameEntity);
    expect(tracker._hasAuthority).toBe(true);
    expect(tracker._lastPosition).toEqual(positionSample);
  });

  it("waits for PENDING bounds and supports DONE and FAILED acquisition", function () {
    createWidget(false);
    const time = widget.clock.currentTime;
    const entity = createEntity();
    let state = BoundingSphereState.PENDING;
    spyOn(widget.dataSourceDisplay, "getBoundingSphere").and.callFake(
      function (target, allowPartial, result) {
        expect(target).toBe(entity);
        expect(allowPartial).toBe(false);
        if (state === BoundingSphereState.DONE) {
          BoundingSphere.clone(
            new BoundingSphere(new Cartesian3(10.0, 20.0, 5.0), 4.0),
            result,
          );
        }
        return state;
      },
    );
    widget.trackedEntity = entity;
    const tracker = widget._sceneGISPlanarEntityTracker;
    tracker.firstUpdate(widget.scene, time);
    tracker.update(widget.scene, time);
    expect(tracker._hasAuthority).toBe(false);

    state = BoundingSphereState.DONE;
    tracker.update(widget.scene, time);
    expect(tracker._hasAuthority).toBe(true);
    expect(Cartesian3.magnitude(tracker._offset)).toBeGreaterThan(0.0);

    widget.trackedEntity = undefined;
    widget.camera.setView({
      destination: new Cartesian3(30.0, -40.0, 50.0),
    });
    state = BoundingSphereState.FAILED;
    widget.trackedEntity = entity;
    tracker.update(widget.scene, time);
    expect(tracker._offset).toEqual(new Cartesian3(20.0, -60.0, 45.0));
  });

  it("keeps warm authority across direct flight and rejects invalid dynamic samples", function () {
    createWidget();
    let sample = new Cartesian3(10.0, 20.0, 5.0);
    const entity = createEntity({
      position: new CallbackPositionProperty(
        function (time, result) {
          return definedClone(sample, result);
        },
        false,
        ReferenceFrame.FIXED,
      ),
      viewFrom: new Cartesian3(0.0, -20.0, 20.0),
    });
    const time = widget.clock.currentTime;
    widget.trackedEntity = entity;
    widget.scene.controllerHost.update(widget.scene, time);
    const tracker = widget._sceneGISPlanarEntityTracker;
    const token = tracker._inputToken;

    widget.camera._currentFlight = {};
    sample = new Cartesian3(30.0, 40.0, 10.0);
    const flightPose = Cartesian3.clone(widget.camera.positionWC);
    tracker.update(widget.scene, time);
    expect(widget.camera.positionWC).toEqual(flightPose);
    expect(tracker._inputToken).toBe(token);

    widget.camera._currentFlight = undefined;
    tracker.update(widget.scene, time);
    expect(widget.camera.positionWC).toEqual(new Cartesian3(30.0, 20.0, 30.0));

    sample = new Cartesian3(Number.NaN, 0.0, 0.0);
    const validPose = Cartesian3.clone(widget.camera.positionWC);
    expect(function () {
      tracker.update(widget.scene, time);
    }).toThrowDeveloperError();
    expect(widget.camera.positionWC).toEqual(validPose);
    expect(tracker._inputToken).toBe(token);
    expect(controller._trackingSuspensionCount).toBe(1);
  });

  it("reconciles replacement input controllers during position gaps and direct flights", function () {
    createWidget();
    const world = widget.scene.world;
    const firstController = controller;
    let sample = new Cartesian3(10.0, 20.0, 5.0);
    const entity = createEntity({
      position: new CallbackPositionProperty(
        function (time, result) {
          return definedClone(sample, result);
        },
        false,
        ReferenceFrame.FIXED,
      ),
      viewFrom: new Cartesian3(0.0, -20.0, 20.0),
    });
    const time = widget.clock.currentTime;
    widget.trackedEntity = entity;
    widget.scene.controllerHost.update(widget.scene, time);
    const tracker = widget._sceneGISPlanarEntityTracker;
    const resumeFirst = spyOn(
      firstController,
      "_resumeFromEntityTracking",
    ).and.callThrough();

    sample = undefined;
    widget.removeController(firstController);
    const secondController = new SceneGISPlanarCameraController({ world });
    const resumeSecond = spyOn(
      secondController,
      "_resumeFromEntityTracking",
    ).and.callThrough();
    widget.addController(secondController);
    const gapPose = Cartesian3.clone(widget.camera.positionWC);
    widget.scene.controllerHost.update(widget.scene, time);

    expect(resumeFirst).toHaveBeenCalledTimes(1);
    expect(firstController._trackingSuspensionCount).toBe(0);
    expect(secondController._trackingSuspensionCount).toBe(1);
    expect(tracker._inputToken.controller).toBe(secondController);
    secondController.update(widget.scene, time);
    expect(widget.camera.positionWC).toEqual(gapPose);

    sample = new Cartesian3(30.0, 40.0, 10.0);
    widget.camera._currentFlight = {};
    widget.removeController(secondController);
    const thirdController = new SceneGISPlanarCameraController({ world });
    const resumeThird = spyOn(
      thirdController,
      "_resumeFromEntityTracking",
    ).and.callThrough();
    widget.addController(thirdController);
    const flightPose = Cartesian3.clone(widget.camera.positionWC);
    widget.scene.controllerHost.update(widget.scene, time);

    expect(resumeSecond).toHaveBeenCalledTimes(1);
    expect(secondController._trackingSuspensionCount).toBe(0);
    expect(thirdController._trackingSuspensionCount).toBe(1);
    expect(tracker._inputToken.controller).toBe(thirdController);
    expect(widget.camera.positionWC).toEqual(flightPose);

    widget.trackedEntity = undefined;
    expect(resumeThird).toHaveBeenCalledTimes(1);
    expect(thirdController._trackingSuspensionCount).toBe(0);
    widget.destroy();
    expect(resumeThird).toHaveBeenCalledTimes(1);
    widget = undefined;
  });

  it("reconciles a controller replaced inside a position callback", function () {
    createWidget();
    const world = widget.scene.world;
    const firstController = controller;
    let replaceController = false;
    const secondController = new SceneGISPlanarCameraController({ world });
    const sample = new Cartesian3(10.0, 20.0, 5.0);
    const entity = createEntity({
      position: new CallbackPositionProperty(
        function (time, result) {
          if (replaceController) {
            replaceController = false;
            widget.removeController(firstController);
            widget.addController(secondController);
            return undefined;
          }
          return Cartesian3.clone(sample, result);
        },
        false,
        ReferenceFrame.FIXED,
      ),
      viewFrom: new Cartesian3(0.0, -20.0, 20.0),
    });
    const time = widget.clock.currentTime;
    widget.trackedEntity = entity;
    widget.scene.controllerHost.update(widget.scene, time);
    const tracker = widget._sceneGISPlanarEntityTracker;
    const resumeFirst = spyOn(
      firstController,
      "_resumeFromEntityTracking",
    ).and.callThrough();
    const resumeSecond = spyOn(
      secondController,
      "_resumeFromEntityTracking",
    ).and.callThrough();
    const gapPose = Cartesian3.clone(widget.camera.positionWC);

    replaceController = true;
    widget.scene.controllerHost.update(widget.scene, time);

    expect(resumeFirst).toHaveBeenCalledTimes(1);
    expect(firstController._trackingSuspensionCount).toBe(0);
    expect(secondController._trackingSuspensionCount).toBe(1);
    expect(tracker._inputToken.controller).toBe(secondController);
    expect(widget.camera.positionWC).toEqual(gapPose);
    secondController.update(widget.scene, time);
    expect(widget.camera.positionWC).toEqual(gapPose);

    widget.trackedEntity = undefined;
    expect(resumeSecond).toHaveBeenCalledTimes(1);
    expect(secondController._trackingSuspensionCount).toBe(0);
    widget.destroy();
    expect(resumeSecond).toHaveBeenCalledTimes(1);
    widget = undefined;
  });

  it("requests one definition frame and cleans up on destroy", function () {
    createWidget();
    const entity = createEntity({
      viewFrom: new Cartesian3(0.0, -20.0, 20.0),
    });
    const requestRender = spyOn(
      widget.scene,
      "requestRender",
    ).and.callThrough();
    widget.trackedEntity = entity;
    const tracker = widget._sceneGISPlanarEntityTracker;
    const listenerCount = entity.definitionChanged.numberOfListeners;
    requestRender.calls.reset();

    entity.name = "changed once";
    entity.description = "changed twice before the next frame";
    expect(requestRender).toHaveBeenCalledTimes(1);
    tracker.firstUpdate(widget.scene, widget.clock.currentTime);
    tracker.update(widget.scene, widget.clock.currentTime);
    entity.name = "changed after update";
    expect(requestRender).toHaveBeenCalledTimes(2);

    widget.destroy();
    expect(entity.definitionChanged.numberOfListeners).toBe(listenerCount - 1);
    expect(controller._trackingSuspensionCount).toBe(0);
    expect(tracker._element).toBeUndefined();
    widget = undefined;
  });

  it("reuses one tracker across replacement and Entity removal", function () {
    createWidget();
    const first = widget.entities.add(
      createEntity({
        id: "first",
        viewFrom: new Cartesian3(0.0, -20.0, 20.0),
      }),
    );
    const second = widget.entities.add(
      createEntity({
        id: "second",
        viewFrom: new Cartesian3(0.0, -30.0, 30.0),
      }),
    );
    const firstBaseline = first.definitionChanged.numberOfListeners;
    const secondBaseline = second.definitionChanged.numberOfListeners;
    const changed = spyOn(
      widget.trackedEntityChanged,
      "raiseEvent",
    ).and.callThrough();

    widget.trackedEntity = first;
    widget.scene.controllerHost.update(widget.scene, widget.clock.currentTime);
    const tracker = widget._sceneGISPlanarEntityTracker;
    expect(first.definitionChanged.numberOfListeners).toBe(firstBaseline + 1);
    widget.trackedEntity = first;
    expect(changed).toHaveBeenCalledTimes(1);

    widget.trackedEntity = second;
    expect(widget._sceneGISPlanarEntityTracker).toBe(tracker);
    expect(first.definitionChanged.numberOfListeners).toBe(firstBaseline);
    expect(second.definitionChanged.numberOfListeners).toBe(secondBaseline + 1);
    widget.scene.controllerHost.update(widget.scene, widget.clock.currentTime);
    expect(controller._trackingSuspensionCount).toBe(1);

    widget.entities.remove(second);
    expect(widget.trackedEntity).toBeUndefined();
    expect(tracker._removeDefinitionListener).toBeUndefined();
    expect(tracker._definitionRenderRequested).toBe(false);
    second.definitionChanged.raiseEvent(second, "name", "changed");
    expect(tracker._definitionRenderRequested).toBe(false);
    expect(controller._trackingSuspensionCount).toBe(0);
    expect(changed).toHaveBeenCalledTimes(3);
  });
});

function definedClone(value, result) {
  return value === undefined ? undefined : Cartesian3.clone(value, result);
}

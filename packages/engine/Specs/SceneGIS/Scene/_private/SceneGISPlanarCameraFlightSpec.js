import {
  Cartesian3,
  Matrix4,
  PerspectiveFrustum,
  SceneMode,
} from "../../../../index.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarCamera from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js";
import SceneGISPlanarCameraFlight from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCameraFlight.js";
import SceneGISPlanarCameraController from "../../../../Source/SceneGIS/Scene/SceneGISPlanarCameraController.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";

describe("SceneGIS/Scene/SceneGISPlanarCameraFlight", function () {
  let world;
  let controller;

  function createFixture(withController = true) {
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1000.0,
          minimumY: -1000.0,
          maximumX: 1000.0,
          maximumY: 1000.0,
        }),
      }),
      maximumLevel: 0,
    });
    const frustum = new PerspectiveFrustum();
    frustum.fov = Math.PI / 3.0;
    frustum.aspectRatio = 1.0;
    frustum.near = 1.0;
    frustum.far = 1000000.0;
    const scene = {
      world,
      mode: SceneMode.SCENE3D,
      canvas: document.createElement("canvas"),
      controllerHost: { _controllers: [] },
      preloadFlightCullingVolume: undefined,
      requestCount: 0,
      requestRender() {
        this.requestCount++;
      },
      tweens: {
        last: undefined,
        add(options) {
          const tween = {
            options,
            complete: options.complete,
            cancel: options.cancel,
            canceled: false,
            cancelTween() {
              if (this.canceled) {
                return;
              }
              this.canceled = true;
              if (typeof this.cancel === "function") {
                this.cancel();
              }
            },
          };
          this.last = tween;
          return tween;
        },
      },
    };
    scene.canvas.width = 100;
    scene.canvas.height = 100;
    Object.defineProperties(scene.canvas, {
      clientWidth: { value: 100 },
      clientHeight: { value: 100 },
    });
    const camera = {
      _scene: scene,
      _currentFlight: undefined,
      transform: Matrix4.clone(Matrix4.IDENTITY),
      position: new Cartesian3(0.0, 0.0, 100.0),
      direction: new Cartesian3(0.0, 0.0, -1.0),
      up: Cartesian3.clone(Cartesian3.UNIT_Y),
      right: Cartesian3.clone(Cartesian3.UNIT_X),
      frustum,
      _setTransform(transform) {
        Matrix4.clone(transform, this.transform);
      },
      cancelFlight() {
        SceneGISPlanarCameraFlight.cancelFlight(this);
      },
    };
    scene.camera = camera;
    if (withController) {
      controller = new SceneGISPlanarCameraController({ world });
      controller.connectedCallback(scene.canvas);
      controller._scene = scene;
      scene.controllerHost._controllers.push(controller);
    }
    return { camera, scene };
  }

  afterEach(function () {
    if (controller && controller._aggregator) {
      controller.disconnectedCallback(controller._element);
    }
    if (world && !world.isDestroyed()) {
      world.destroy();
    }
    controller = undefined;
    world = undefined;
  });

  it("interpolates Cartesian position and HPR without per-update pose allocation", function () {
    const { camera, scene } = createFixture();
    const positionIdentity = camera.position;
    const directionIdentity = camera.direction;
    const upIdentity = camera.up;
    const clearInputState = spyOn(
      controller,
      "_clearInputState",
    ).and.callThrough();
    SceneGISPlanarCameraFlight.flyTo(camera, {
      destination: new Cartesian3(1000.0, 500.0, 200.0),
      orientation: { heading: 1.2, pitch: -0.5, roll: 0.2 },
      duration: 2.0,
      maximumHeight: 500.0,
    });
    expect(controller._flightSuspensionCount).toBe(1);
    expect(clearInputState).toHaveBeenCalledTimes(1);
    expect(scene.preloadFlightCullingVolume).toBeDefined();

    scene.tweens.last.options.update({ time: 1.0 });
    let pose = SceneGISPlanarCamera.getWorldPose(camera);
    expect(pose.position.x).toEqualEpsilon(500.0, 1e-12);
    expect(pose.position.y).toEqualEpsilon(250.0, 1e-12);
    expect(pose.position.z).toEqualEpsilon(500.0, 1e-11);
    expect(camera.position).toBe(positionIdentity);
    expect(camera.direction).toBe(directionIdentity);
    expect(camera.up).toBe(upIdentity);

    scene.tweens.last.options.update({ time: 2.0 });
    scene.tweens.last.options.complete();
    pose = SceneGISPlanarCamera.getWorldPose(camera);
    const hpr = SceneGISPlanarCamera.getHeadingPitchRoll(camera, {});
    expect(pose.position).toEqualEpsilon(
      new Cartesian3(1000.0, 500.0, 200.0),
      1e-12,
    );
    expect(hpr.heading).toEqualEpsilon(1.2, 1e-14);
    expect(hpr.pitch).toEqualEpsilon(-0.5, 1e-14);
    expect(hpr.roll).toEqualEpsilon(0.2, 1e-14);
    expect(controller._flightSuspensionCount).toBe(0);
    expect(camera._currentFlight).toBeUndefined();
  });

  it("restores the caller enabled state across cancel, replacement, and completion", function () {
    const { camera, scene } = createFixture();
    controller.enabled = false;
    const firstCancel = jasmine.createSpy("firstCancel");
    SceneGISPlanarCameraFlight.flyTo(camera, {
      destination: new Cartesian3(10.0, 0.0, 100.0),
      duration: 2.0,
      cancel: firstCancel,
    });
    const firstTween = camera._currentFlight;
    SceneGISPlanarCameraFlight.flyTo(camera, {
      destination: new Cartesian3(20.0, 0.0, 100.0),
      duration: 2.0,
    });
    expect(firstTween.canceled).toBe(true);
    expect(firstCancel).toHaveBeenCalledTimes(1);
    expect(controller.enabled).toBe(false);
    expect(controller._flightSuspensionCount).toBe(1);

    SceneGISPlanarCameraFlight.completeFlight(camera);
    expect(controller.enabled).toBe(false);
    expect(controller._flightSuspensionCount).toBe(0);
    expect(SceneGISPlanarCamera.getWorldPose(camera).position.x).toBe(20.0);
    expect(scene.requestCount).toBeGreaterThan(0);
  });

  it("publishes explicit completion without cancel and cleans state before callbacks", function () {
    const { camera } = createFixture();
    const callbackOrder = [];
    const destination = new Cartesian3(40.0, -20.0, 80.0);
    SceneGISPlanarCameraFlight.flyTo(camera, {
      destination,
      duration: 2.0,
      cancel() {
        callbackOrder.push("cancel");
      },
      complete() {
        callbackOrder.push("complete");
        expect(camera._currentFlight).toBeUndefined();
        expect(controller._flightSuspensionCount).toBe(0);
      },
    });

    expect(SceneGISPlanarCameraFlight.completeFlight(camera)).toBe(true);
    expect(callbackOrder).toEqual(["complete"]);
    expect(SceneGISPlanarCamera.getWorldPose(camera).position).toEqualEpsilon(
      destination,
      1e-12,
    );
    expect(camera._currentFlight).toBeUndefined();
    expect(controller._flightSuspensionCount).toBe(0);
    expect(SceneGISPlanarCameraFlight.completeFlight(camera)).toBe(false);
    expect(SceneGISPlanarCameraFlight.cancelFlight(camera)).toBe(false);
  });

  it("cleans explicit completion state when final update or complete throws", function () {
    const fixture = createFixture();
    const updateFailure = new Error("final update failed");
    const cancel = jasmine.createSpy("cancel");
    const complete = jasmine.createSpy("complete");
    SceneGISPlanarCameraFlight.flyTo(fixture.camera, {
      destination: new Cartesian3(10.0, 20.0, 30.0),
      duration: 1.0,
      cancel,
      complete,
    });
    spyOn(SceneGISPlanarCamera, "setWorldPose").and.throwError(updateFailure);

    expect(() =>
      SceneGISPlanarCameraFlight.completeFlight(fixture.camera),
    ).toThrowError(Error, updateFailure.message);
    expect(cancel).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    expect(fixture.camera._currentFlight).toBeUndefined();
    expect(controller._flightSuspensionCount).toBe(0);
    expect(SceneGISPlanarCameraFlight.completeFlight(fixture.camera)).toBe(
      false,
    );

    SceneGISPlanarCamera.setWorldPose.calls.reset();
    SceneGISPlanarCamera.setWorldPose.and.callThrough();
    const completeFailure = new Error("nonzero complete failed");
    const destination = new Cartesian3(-30.0, 40.0, 50.0);
    SceneGISPlanarCameraFlight.flyTo(fixture.camera, {
      destination,
      duration: 1.0,
      cancel,
      complete() {
        expect(fixture.camera._currentFlight).toBeUndefined();
        expect(controller._flightSuspensionCount).toBe(0);
        throw completeFailure;
      },
    });

    expect(() =>
      SceneGISPlanarCameraFlight.completeFlight(fixture.camera),
    ).toThrowError(Error, completeFailure.message);
    expect(cancel).not.toHaveBeenCalled();
    expect(
      SceneGISPlanarCamera.getWorldPose(fixture.camera).position,
    ).toEqualEpsilon(destination, 1e-12);
    expect(fixture.camera._currentFlight).toBeUndefined();
    expect(controller._flightSuspensionCount).toBe(0);
    expect(SceneGISPlanarCameraFlight.cancelFlight(fixture.camera)).toBe(false);
  });

  it("preserves default/custom timing callbacks requestRender and final preload", function () {
    const { camera, scene } = createFixture();
    const easingFunction = (time) => time;
    const complete = jasmine.createSpy("complete");
    const cancel = jasmine.createSpy("cancel");
    const cullingVolume = {};
    const computeCullingVolume = jasmine
      .createSpy("computeCullingVolume")
      .and.returnValue(cullingVolume);
    spyOn(camera.frustum, "clone").and.returnValue({ computeCullingVolume });

    SceneGISPlanarCameraFlight.flyTo(camera, {
      destination: new Cartesian3(80.0, -40.0, 120.0),
      orientation: { heading: 0.25, pitch: -0.75, roll: -0.1 },
      easingFunction,
      complete,
      cancel,
    });
    expect(scene.tweens.last.options.duration).toBeGreaterThan(0.0);
    expect(scene.tweens.last.options.duration).toBeLessThanOrEqual(3.0);
    expect(scene.tweens.last.options.easingFunction).toBe(easingFunction);
    expect(scene.requestCount).toBe(1);
    expect(computeCullingVolume).toHaveBeenCalledTimes(1);
    expect(computeCullingVolume.calls.argsFor(0)[0]).toEqual(
      new Cartesian3(80.0, -40.0, 120.0),
    );
    expect(scene.preloadFlightCullingVolume).toBe(cullingVolume);

    scene.tweens.last.options.update({
      time: scene.tweens.last.options.duration,
    });
    scene.tweens.last.options.complete();
    expect(complete).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(controller._flightSuspensionCount).toBe(0);

    SceneGISPlanarCameraFlight.flyTo(camera, {
      destination: new Cartesian3(100.0, 0.0, 150.0),
      duration: 1.0,
      cancel,
    });
    SceneGISPlanarCameraFlight.cancelFlight(camera);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(controller._flightSuspensionCount).toBe(0);
  });

  it("keeps an active flight atomic when a new candidate is invalid", function () {
    const { camera, scene } = createFixture();
    SceneGISPlanarCameraFlight.flyTo(camera, {
      destination: new Cartesian3(10.0, 0.0, 100.0),
      duration: 2.0,
    });
    const currentFlight = camera._currentFlight;
    const count = controller._flightSuspensionCount;
    expect(() =>
      SceneGISPlanarCameraFlight.flyTo(camera, {
        destination: new Cartesian3(20.0, 0.0, 100.0),
        flyOverLongitude: 0.0,
      }),
    ).toThrowDeveloperError();
    expect(camera._currentFlight).toBe(currentFlight);
    expect(currentFlight.canceled).toBe(false);
    expect(controller._flightSuspensionCount).toBe(count);

    spyOn(scene.tweens, "add").and.throwError("candidate add failed");
    expect(() =>
      SceneGISPlanarCameraFlight.flyTo(camera, {
        destination: new Cartesian3(30.0, 0.0, 100.0),
        duration: 1.0,
      }),
    ).toThrowError("candidate add failed");
    expect(camera._currentFlight).toBe(currentFlight);
    expect(currentFlight.canceled).toBe(false);
    expect(controller._flightSuspensionCount).toBe(count);
  });

  it("supports zero-duration and low-level scenes without a planar controller", function () {
    let fixture = createFixture();
    const complete = jasmine.createSpy("complete");
    SceneGISPlanarCameraFlight.flyTo(fixture.camera, {
      destination: new Cartesian3(5.0, 6.0, 7.0),
      duration: 0.0,
      complete,
    });
    expect(complete).toHaveBeenCalledTimes(1);
    expect(controller._flightSuspensionCount).toBe(0);
    controller.disconnectedCallback(controller._element);
    controller = undefined;
    world.destroy();

    fixture = createFixture(false);
    SceneGISPlanarCameraFlight.flyTo(fixture.camera, {
      destination: new Cartesian3(15.0, 16.0, 17.0),
      duration: 1.0,
    });
    fixture.scene.tweens.last.options.update({ time: 1.0 });
    fixture.scene.tweens.last.options.complete();
    expect(SceneGISPlanarCamera.getWorldPose(fixture.camera).position).toEqual(
      new Cartesian3(15.0, 16.0, 17.0),
    );
  });

  it("preserves a zenith direction and up axis through a public flight", function () {
    const { camera, scene } = createFixture();
    const direction = new Cartesian3();
    const up = new Cartesian3();
    const right = new Cartesian3();
    SceneGISPlanarCamera.getAxes(0.7, Math.PI / 2.0, direction, up, right);
    SceneGISPlanarCameraFlight.flyTo(camera, {
      destination: new Cartesian3(20.0, 30.0, 40.0),
      orientation: { direction, up },
      duration: 1.0,
    });

    scene.tweens.last.options.update({ time: 1.0 });
    scene.tweens.last.options.complete();

    const pose = SceneGISPlanarCamera.getWorldPose(camera);
    expect(pose.direction).toEqualEpsilon(direction, 1e-14);
    expect(pose.up).toEqualEpsilon(up, 1e-14);
    expect(controller._flightSuspensionCount).toBe(0);
    expect(camera._currentFlight).toBeUndefined();
  });

  it("keeps a zero-duration final pose committed when complete throws", function () {
    const { camera, scene } = createFixture();
    controller.enabled = false;
    const endTransform = Matrix4.fromTranslation(
      new Cartesian3(100.0, -200.0, 30.0),
    );
    const destination = new Cartesian3(500.0, 600.0, 700.0);
    const direction = Cartesian3.clone(Cartesian3.UNIT_Z);
    const up = Cartesian3.negate(Cartesian3.UNIT_Y, new Cartesian3());

    expect(() =>
      SceneGISPlanarCameraFlight.flyTo(camera, {
        destination,
        orientation: { direction, up },
        endTransform,
        duration: 0.0,
        complete() {
          throw new Error("complete failed");
        },
      }),
    ).toThrowError("complete failed");

    const pose = SceneGISPlanarCamera.getWorldPose(camera);
    expect(camera.transform).toEqual(endTransform);
    expect(pose.position).toEqualEpsilon(destination, 1e-12);
    expect(pose.direction).toEqualEpsilon(direction, 1e-14);
    expect(pose.up).toEqualEpsilon(up, 1e-14);
    expect(controller.enabled).toBe(false);
    expect(controller._flightSuspensionCount).toBe(0);
    expect(camera._currentFlight).toBeUndefined();
    expect(scene.tweens.last).toBeUndefined();
    expect(scene.requestCount).toBe(1);
  });
});

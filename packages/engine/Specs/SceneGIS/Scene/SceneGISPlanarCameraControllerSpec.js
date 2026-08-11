import {
  Cartesian2,
  Cartesian3,
  CesiumWidget,
  Math as CesiumMath,
  JulianDate,
  Matrix4,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
  PerspectiveOffCenterFrustum,
  SceneGISPlanarCameraController,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../index.js";
import CameraEventType from "../../../Source/Scene/CameraEventType.js";
import SceneGISPlanarCamera from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js";
import getWebGLStub from "../../../../../Specs/getWebGLStub.js";

describe("SceneGIS/Scene/SceneGISPlanarCameraController", function () {
  let container;
  let widget;
  let world;
  let controller;
  let inputSequence;

  function createWorld(offset = 0.0) {
    return new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: offset - 128.0,
          minimumY: offset - 128.0,
          maximumX: offset + 128.0,
          maximumY: offset + 128.0,
        }),
      }),
      maximumLevel: 2,
    });
  }

  function createWidget(offset) {
    world = createWorld(offset);
    const contextOptions = { webgl: {} };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    widget = new CesiumWidget(container, {
      world,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    widget.scene.screenSpaceCameraController.enableInputs = false;
    return widget.scene;
  }

  function perspective() {
    const frustum = new PerspectiveFrustum();
    frustum.fov = Math.PI / 3.0;
    frustum.aspectRatio = 2.0;
    frustum.near = 1.0;
    frustum.far = 10000.0;
    return frustum;
  }

  function perspectiveOffCenter(left, right, bottom, top, near, far) {
    const frustum = new PerspectiveOffCenterFrustum();
    frustum.left = left;
    frustum.right = right;
    frustum.bottom = bottom;
    frustum.top = top;
    frustum.near = near;
    frustum.far = far;
    return frustum;
  }

  function createFrusta() {
    const perspectiveOffCenter = new PerspectiveOffCenterFrustum();
    perspectiveOffCenter.left = -1.0;
    perspectiveOffCenter.right = 2.0;
    perspectiveOffCenter.bottom = -0.75;
    perspectiveOffCenter.top = 1.0;
    perspectiveOffCenter.near = 1.0;
    perspectiveOffCenter.far = 10000.0;

    const orthographic = new OrthographicFrustum();
    orthographic.width = 10.0;
    orthographic.aspectRatio = 2.0;
    orthographic.near = 1.0;
    orthographic.far = 10000.0;

    const orthographicOffCenter = new OrthographicOffCenterFrustum();
    orthographicOffCenter.left = -5.0;
    orthographicOffCenter.right = 10.0;
    orthographicOffCenter.bottom = -4.0;
    orthographicOffCenter.top = 6.0;
    orthographicOffCenter.near = 1.0;
    orthographicOffCenter.far = 10000.0;
    return [
      perspective(),
      perspectiveOffCenter,
      orthographic,
      orthographicOffCenter,
    ];
  }

  function queueMovement(type, start, end) {
    const aggregator = controller._aggregator;
    const key = `${type}`;
    if (
      (type === CameraEventType.LEFT_DRAG ||
        type === CameraEventType.RIGHT_DRAG ||
        type === CameraEventType.MIDDLE_DRAG) &&
      !aggregator._isDown[key]
    ) {
      aggregator._isDown[key] = true;
      aggregator._buttonsDown++;
      aggregator._pressTime[key] = new Date(++inputSequence);
    }
    Cartesian2.clone(start, aggregator._eventStartPosition[key]);
    Cartesian2.clone(
      type === CameraEventType.WHEEL ? Cartesian2.ZERO : start,
      aggregator._movement[key].startPosition,
    );
    Cartesian2.clone(end, aggregator._movement[key].endPosition);
    aggregator._update[key] = false;
    Cartesian2.clone(end, aggregator._currentMousePosition);
  }

  function releaseButton(type) {
    const aggregator = controller._aggregator;
    const key = `${type}`;
    if (aggregator._isDown[key]) {
      aggregator._isDown[key] = false;
      aggregator._buttonsDown--;
      aggregator._releaseTime[key] = new Date(++inputSequence);
    }
  }

  function getZoomRange(scene) {
    const info = SceneGISPlanarCamera.getFrustumInfo(scene.camera.frustum);
    return info.perspective
      ? Cartesian3.distance(scene.camera.positionWC, controller._target)
      : info.top - info.bottom;
  }

  function dispatchWheel(scene, deltaY) {
    scene.canvas.dispatchEvent(
      new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        clientX: scene.canvas.clientWidth * 0.5,
        clientY: scene.canvas.clientHeight * 0.5,
        deltaY: deltaY,
      }),
    );
  }

  function project(scene, position) {
    const camera = scene.camera;
    const info = SceneGISPlanarCamera.getFrustumInfo(camera.frustum);
    const offset = Cartesian3.subtract(
      position,
      camera.positionWC,
      new Cartesian3(),
    );
    const depth = Cartesian3.dot(offset, camera.directionWC);
    let x = Cartesian3.dot(offset, camera.rightWC);
    let y = Cartesian3.dot(offset, camera.upWC);
    if (info.perspective) {
      x = (x * info.near) / depth;
      y = (y * info.near) / depth;
    }
    return new Cartesian2(
      ((x - info.left) / (info.right - info.left)) * scene.canvas.clientWidth,
      ((info.top - y) / (info.top - info.bottom)) * scene.canvas.clientHeight,
    );
  }

  function intersectAtHeight(scene, windowPosition, height, result) {
    const ray = SceneGISPlanarCamera.getWindowRay(
      scene.camera,
      scene.canvas,
      windowPosition,
    );
    const t = (height - ray.origin.z) / ray.direction.z;
    return Cartesian3.fromElements(
      ray.origin.x + ray.direction.x * t,
      ray.origin.y + ray.direction.y * t,
      height,
      result,
    );
  }

  function intersectRayAtHeight(ray, height, result) {
    const t = (height - ray.origin.z) / ray.direction.z;
    return Cartesian3.fromElements(
      ray.origin.x + ray.direction.x * t,
      ray.origin.y + ray.direction.y * t,
      height,
      result,
    );
  }

  beforeEach(function () {
    inputSequence = 0;
    container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "100px";
    document.body.appendChild(container);
  });

  afterEach(function () {
    if (widget && !widget.isDestroyed()) {
      if (controller && controller._aggregator) {
        widget.removeController(controller);
      }
      widget = widget.destroy();
    }
    document.body.removeChild(container);
    widget = undefined;
    controller = undefined;
  });

  it("validates construction and public properties", function () {
    expect(() => new SceneGISPlanarCameraController()).toThrowDeveloperError();
    const localWorld = createWorld();
    controller = new SceneGISPlanarCameraController({ world: localWorld });
    expect(controller.world).toBe(localWorld);
    expect(controller.navigationMode).toBe("surface");
    expect(controller.minimumTerrainClearance).toBe(1.0);
    expect(controller.enabled).toBe(true);
    expect(controller.enablePan).toBe(true);
    expect(controller.enableRotate).toBe(true);
    expect(controller.enableZoom).toBe(true);
    expect(controller.homePadding).toBe(1.05);
    expect(
      Object.getOwnPropertyDescriptor(
        SceneGISPlanarCameraController.prototype,
        "world",
      ).set,
    ).toBeUndefined();
    expect(() => {
      controller.enabled = 1;
    }).toThrowDeveloperError();
    expect(() => {
      controller.enablePan = 1;
    }).toThrowDeveloperError();
    expect(() => {
      controller.enableRotate = 1;
    }).toThrowDeveloperError();
    expect(() => {
      controller.enableZoom = 1;
    }).toThrowDeveloperError();
    expect(() => {
      controller.homePadding = 0.99;
    }).toThrowDeveloperError();
    expect(() => {
      controller.homePadding = Infinity;
    }).toThrowDeveloperError();
    expect(() => {
      controller.homePadding = Number.NaN;
    }).toThrowDeveloperError();
    expect(() => {
      controller.navigationMode = "free";
    }).toThrowDeveloperError();
    function expectInvalidMinimumTerrainClearance(value) {
      expect(() => {
        controller.minimumTerrainClearance = value;
      }).toThrowDeveloperError();
      expect(
        () =>
          new SceneGISPlanarCameraController({
            world: localWorld,
            minimumTerrainClearance: value,
          }),
      ).toThrowDeveloperError();
    }
    for (const value of [0.0, -1.0, Number.NaN, Infinity]) {
      expectInvalidMinimumTerrainClearance(value);
    }
    controller.minimumTerrainClearance = 2.5;
    expect(controller.minimumTerrainClearance).toBe(2.5);
    controller.minimumTerrainClearance = 2.5;
    expect(
      () =>
        new SceneGISPlanarCameraController({
          world: localWorld,
          navigationMode: "free",
        }),
    ).toThrowDeveloperError();
    const undergroundController = new SceneGISPlanarCameraController({
      world: localWorld,
      navigationMode: "underground",
      minimumTerrainClearance: 3.0,
    });
    expect(undergroundController.navigationMode).toBe("underground");
    expect(undergroundController.minimumTerrainClearance).toBe(3.0);
    localWorld.destroy();
  });

  it("pushes surface poses upward without changing pose axes or pulling downward", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({
      world,
      minimumTerrainClearance: 2.0,
    });
    widget.addController(controller);
    const direction = new Cartesian3();
    const up = new Cartesian3();
    SceneGISPlanarCamera.getAxes(
      0.25,
      -CesiumMath.PI_OVER_FOUR,
      direction,
      up,
      new Cartesian3(),
    );
    SceneGISPlanarCamera.setWorldPose(
      scene.camera,
      new Cartesian3(0.0, -20.0, 5.0),
      direction,
      up,
    );
    let height = 10.0;
    const heightSpy = spyOn(world, "getTerrainHeight").and.callFake(
      () => height,
    );
    spyOn(controller, "viewHome").and.callThrough();
    const beforeDirection = Cartesian3.clone(scene.camera.directionWC);
    const beforeUp = Cartesian3.clone(scene.camera.upWC);
    const beforeRight = Cartesian3.clone(scene.camera.rightWC);
    const frustum = scene.camera.frustum;

    controller.firstUpdate(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqualEpsilon(
      new Cartesian3(0.0, -20.0, 12.0),
      1e-12,
    );
    expect(scene.camera.directionWC).toEqualEpsilon(beforeDirection, 1e-12);
    expect(scene.camera.upWC).toEqualEpsilon(beforeUp, 1e-12);
    expect(scene.camera.rightWC).toEqualEpsilon(beforeRight, 1e-12);
    expect(scene.camera.frustum).toBe(frustum);
    expect(controller.viewHome).not.toHaveBeenCalled();

    height = 20.0;
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBe(22.0);
    height = -50.0;
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBe(22.0);
    height = undefined;
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBe(22.0);

    controller.navigationMode = "underground";
    SceneGISPlanarCamera.setWorldPose(
      scene.camera,
      new Cartesian3(0.0, -20.0, -100.0),
      direction,
      up,
    );
    heightSpy.calls.reset();
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBe(-100.0);
    expect(heightSpy).not.toHaveBeenCalled();

    controller.navigationMode = "surface";
    expect(scene.camera.positionWC.z).toBe(-100.0);
    controller.minimumTerrainClearance = 4.0;
    expect(scene.camera.positionWC.z).toBe(-100.0);
    expect(heightSpy).not.toHaveBeenCalled();
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBe(4.0);
    expect(controller.navigationMode).toBe("surface");
    expect(controller.viewHome).not.toHaveBeenCalled();
  });

  it("corrects transformed large-offset poses atomically", function () {
    const offset = 1000000000.0;
    const scene = createWidget(offset);
    scene.camera.frustum = perspective();
    scene.camera._setTransform(
      Matrix4.fromTranslation(new Cartesian3(1000.0, -2000.0, 50.0)),
    );
    const direction = new Cartesian3();
    const up = new Cartesian3();
    SceneGISPlanarCamera.getAxes(0.4, -0.7, direction, up, new Cartesian3());
    SceneGISPlanarCamera.setWorldPose(
      scene.camera,
      new Cartesian3(offset, offset, -10.0),
      direction,
      up,
    );
    controller = new SceneGISPlanarCameraController({
      world,
      minimumTerrainClearance: 2.0,
    });
    widget.addController(controller);
    const beforeDirection = Cartesian3.clone(scene.camera.directionWC);
    const beforeUp = Cartesian3.clone(scene.camera.upWC);
    const frustum = scene.camera.frustum;
    const heightSpy = spyOn(world, "getTerrainHeight").and.returnValue(-5.0);

    controller.firstUpdate(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqualEpsilon(
      new Cartesian3(offset, offset, -3.0),
      1e-7,
    );
    expect(scene.camera.directionWC).toEqualEpsilon(beforeDirection, 1e-12);
    expect(scene.camera.upWC).toEqualEpsilon(beforeUp, 1e-12);
    expect(scene.camera.frustum).toBe(frustum);
    expect(heightSpy).toHaveBeenCalledTimes(1);

    const beforePosition = Cartesian3.clone(scene.camera.positionWC);
    heightSpy.and.returnValue(Number.MAX_VALUE);
    controller.minimumTerrainClearance = Number.MAX_VALUE;
    expect(() =>
      controller.update(scene, JulianDate.now()),
    ).toThrowDeveloperError();
    expect(scene.camera.positionWC).toEqual(beforePosition);
  });

  it("applies endpoint clearance after pan rotate and wheel input", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    spyOn(scene, "pickPosition").and.returnValue(undefined);
    spyOn(world, "pickTerrain").and.returnValue(undefined);
    let heights = [];
    const heightSpy = spyOn(world, "getTerrainHeight").and.callFake(() =>
      heights.shift(),
    );
    spyOn(controller, "viewHome").and.callThrough();
    const center = new Cartesian2(100.0, 50.0);

    for (const type of [
      CameraEventType.LEFT_DRAG,
      CameraEventType.MIDDLE_DRAG,
      CameraEventType.WHEEL,
    ]) {
      controller.viewHome(scene);
      controller.viewHome.calls.reset();
      heightSpy.calls.reset();
      heights = [0.0, 1000.0];
      const end =
        type === CameraEventType.WHEEL
          ? new Cartesian2(0.0, 8.0)
          : new Cartesian2(104.0, 52.0);
      queueMovement(type, center, end);

      controller.update(scene, JulianDate.now());
      expect(scene.camera.positionWC.z).toBe(1001.0);
      expect(heightSpy).toHaveBeenCalledTimes(2);
      expect(controller.viewHome).not.toHaveBeenCalled();

      if (type !== CameraEventType.WHEEL) {
        releaseButton(type);
        heights = [0.0];
        controller.update(scene, JulianDate.now());
      }
    }
  });

  it("switches navigation modes atomically and isolates held input", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const terrainSpy = spyOn(world, "getTerrainHeight").and.returnValue(10.0);
    const beforePosition = Cartesian3.clone(scene.camera.positionWC);
    const beforeDirection = Cartesian3.clone(scene.camera.directionWC);
    const beforeTarget = Cartesian3.clone(controller._target);
    const frustum = scene.camera.frustum;
    const center = new Cartesian2(100.0, 50.0);
    queueMovement(
      CameraEventType.LEFT_DRAG,
      center,
      new Cartesian2(120.0, 50.0),
    );
    queueMovement(
      CameraEventType.MIDDLE_DRAG,
      center,
      new Cartesian2(110.0, 50.0),
    );
    queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, 1.0));

    controller.navigationMode = "underground";
    expect(controller.navigationMode).toBe("underground");
    expect(scene.camera.positionWC).toEqual(beforePosition);
    expect(scene.camera.directionWC).toEqual(beforeDirection);
    expect(controller._target).toEqual(beforeTarget);
    expect(scene.camera.frustum).toBe(frustum);
    expect(terrainSpy).not.toHaveBeenCalled();
    expect(controller._quarantinedLeft).toBe(true);
    expect(controller._quarantinedMiddle).toBe(true);
    expect(controller._aggregator._update[`${CameraEventType.WHEEL}`]).toBe(
      true,
    );
    expect(controller._aggregator.anyButtonDown).toBe(true);

    controller.navigationMode = "underground";
    expect(controller._quarantinedLeft).toBe(true);
    queueMovement(
      CameraEventType.LEFT_DRAG,
      center,
      new Cartesian2(140.0, 50.0),
    );
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(beforePosition);
    releaseButton(CameraEventType.LEFT_DRAG);
    releaseButton(CameraEventType.MIDDLE_DRAG);
    controller.update(scene, JulianDate.now());
    expect(controller._quarantinedLeft).toBe(false);
    expect(controller._quarantinedMiddle).toBe(false);
  });

  it("resolves the center from rendered terrain then the resident relationship plane", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    const depthSpy = spyOn(scene, "pickPosition");
    const heightSpy = spyOn(world, "getTerrainHeight").and.returnValue(12.0);
    const terrainSpy = spyOn(world, "pickTerrain").and.returnValue(undefined);

    controller.firstUpdate(scene, JulianDate.now());
    expect(controller._target.z).toBe(12.0);
    expect(heightSpy).toHaveBeenCalledTimes(1);
    expect(terrainSpy).toHaveBeenCalledTimes(1);
    expect(depthSpy).not.toHaveBeenCalled();

    heightSpy.calls.reset();
    terrainSpy.calls.reset();
    terrainSpy.and.callFake((ray, result) =>
      intersectRayAtHeight(ray, 30.0, result),
    );
    expect(controller._syncRig(scene, false)).toBe(true);
    expect(controller._target.z).toBe(30.0);
    expect(heightSpy).toHaveBeenCalledTimes(1);
    expect(terrainSpy).toHaveBeenCalledTimes(1);
    expect(depthSpy).not.toHaveBeenCalled();

    terrainSpy.and.returnValue(undefined);
    heightSpy.and.returnValue(-15.0);
    expect(controller._syncRig(scene, false)).toBe(true);
    expect(controller._target.z).toBe(-15.0);
    expect(controller.navigationMode).toBe("surface");
    heightSpy.and.returnValue(undefined);
    expect(controller._syncRig(scene, false)).toBe(true);
    expect(controller._target.z).toBe(0.0);

    terrainSpy.calls.reset();
    controller.update(scene, JulianDate.now());
    expect(terrainSpy).not.toHaveBeenCalled();
  });

  it("snapshots center terrain and relationship across held pan and rotate", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const center = new Cartesian2(100.0, 50.0);
    spyOn(scene, "pickPosition").and.callFake((windowPosition, result) =>
      intersectAtHeight(scene, windowPosition, 20.0, result),
    );
    let terrainHeight = 10.0;
    let localHeight = 5.0;
    const terrainSpy = spyOn(world, "pickTerrain").and.callFake((ray, result) =>
      intersectRayAtHeight(ray, terrainHeight, result),
    );
    const heightSpy = spyOn(world, "getTerrainHeight").and.callFake(
      () => localHeight,
    );
    spyOn(controller, "viewHome").and.callThrough();

    for (const type of [
      CameraEventType.LEFT_DRAG,
      CameraEventType.MIDDLE_DRAG,
    ]) {
      controller.viewHome.calls.reset();
      terrainSpy.calls.reset();
      heightSpy.calls.reset();
      terrainHeight = 10.0;
      localHeight = 5.0;
      queueMovement(type, center, new Cartesian2(104.0, 51.0));
      controller.update(scene, JulianDate.now());
      expect(controller._target.z).toBe(10.0);
      expect(terrainSpy).toHaveBeenCalledTimes(1);
      expect(heightSpy).toHaveBeenCalledTimes(2);
      const firstPosition = Cartesian3.clone(scene.camera.positionWC);

      terrainHeight = 40.0;
      localHeight = 60.0;
      queueMovement(type, center, new Cartesian2(108.0, 52.0));
      controller.update(scene, JulianDate.now());
      expect(controller._target.z).toBe(10.0);
      expect(scene.camera.positionWC.z).toBeGreaterThan(10.0);
      expect(Number.isFinite(scene.camera.positionWC.x)).toBe(true);
      expect(Cartesian3.equals(scene.camera.positionWC, firstPosition)).toBe(
        false,
      );
      expect(terrainSpy).toHaveBeenCalledTimes(1);
      expect(heightSpy).toHaveBeenCalledTimes(4);
      expect(controller.viewHome).not.toHaveBeenCalled();

      releaseButton(type);
      controller.update(scene, JulianDate.now());
      queueMovement(type, center, new Cartesian2(104.0, 51.0));
      controller.update(scene, JulianDate.now());
      expect(controller._target.z).toBe(40.0);
      expect(terrainSpy).toHaveBeenCalledTimes(2);
      expect(heightSpy).toHaveBeenCalledTimes(7);
      releaseButton(type);
      controller.update(scene, JulianDate.now());
      controller.viewHome(scene);
    }
  });

  it("keeps camera-local relationship independent from the center target", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const direction = new Cartesian3();
    const up = new Cartesian3();
    SceneGISPlanarCamera.getAxes(
      0.0,
      -CesiumMath.PI_OVER_FOUR,
      direction,
      up,
      new Cartesian3(),
    );
    const lowCamera = new Cartesian3(0.0, -50.0, 50.0);
    SceneGISPlanarCamera.setWorldPose(scene.camera, lowCamera, direction, up);
    const heightSpy = spyOn(world, "getTerrainHeight").and.returnValue(100.0);
    const terrainSpy = spyOn(world, "pickTerrain").and.callFake((ray, result) =>
      intersectRayAtHeight(ray, 0.0, result),
    );
    spyOn(controller, "viewHome").and.callThrough();

    controller.firstUpdate(scene, JulianDate.now());
    expect(controller.viewHome).not.toHaveBeenCalled();
    expect(scene.camera.positionWC.z).toBe(101.0);
    expect(controller.navigationMode).toBe("surface");
    expect(heightSpy).toHaveBeenCalled();
    expect(terrainSpy).toHaveBeenCalled();

    controller.navigationMode = "underground";
    SceneGISPlanarCamera.setWorldPose(scene.camera, lowCamera, direction, up);
    controller.viewHome.calls.reset();
    heightSpy.calls.reset();
    terrainSpy.calls.reset();
    controller.firstUpdate(scene, JulianDate.now());
    expect(controller.viewHome).not.toHaveBeenCalled();
    expect(controller.navigationMode).toBe("underground");
    expect(controller._surfaceHeight).toBe(100.0);
    expect(controller._target.z).toBe(0.0);
    expect(heightSpy).toHaveBeenCalledTimes(1);
    expect(terrainSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps valid below-side underground gestures on their terrain side", function () {
    const offset = 1000000000.0;
    const scene = createWidget(offset);
    controller = new SceneGISPlanarCameraController({
      world,
      navigationMode: "underground",
    });
    widget.addController(controller);
    spyOn(scene, "pickPosition").and.returnValue(undefined);
    spyOn(world, "getTerrainHeight").and.returnValue(20.0);
    spyOn(world, "pickTerrain").and.callFake((ray, result) =>
      intersectRayAtHeight(ray, 20.0, result),
    );
    spyOn(controller, "viewHome").and.callThrough();
    const center = new Cartesian2(100.0, 50.0);
    const direction = new Cartesian3();
    const up = new Cartesian3();
    const right = new Cartesian3();

    for (const frustum of [perspective(), createFrusta()[2]]) {
      scene.camera.frustum = frustum;
      SceneGISPlanarCamera.getAxes(
        0.0,
        CesiumMath.PI_OVER_FOUR,
        direction,
        up,
        right,
      );
      SceneGISPlanarCamera.setWorldPose(
        scene.camera,
        new Cartesian3(offset, offset - 100.0, -80.0),
        direction,
        up,
      );
      controller.firstUpdate(scene, JulianDate.now());
      expect(controller._target.z).toBe(20.0);
      expect(controller._pitch).toBeGreaterThan(0.0);

      queueMovement(
        CameraEventType.LEFT_DRAG,
        center,
        new Cartesian2(105.0, 50.0),
      );
      controller.update(scene, JulianDate.now());
      expect(scene.camera.positionWC.z).toBeLessThan(20.0);
      releaseButton(CameraEventType.LEFT_DRAG);
      controller.update(scene, JulianDate.now());

      queueMovement(
        CameraEventType.MIDDLE_DRAG,
        center,
        new Cartesian2(105.0, 52.0),
      );
      controller.update(scene, JulianDate.now());
      expect(scene.camera.positionWC.z).toBeLessThan(20.0);
      releaseButton(CameraEventType.MIDDLE_DRAG);
      controller.update(scene, JulianDate.now());

      queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, 1.0));
      controller.update(scene, JulianDate.now());
      expect(scene.camera.positionWC.z).toBeLessThan(20.0);
    }
    expect(controller.viewHome).not.toHaveBeenCalled();
    controller.viewHome.and.callThrough();
    controller.viewHome(scene);
    expect(controller.navigationMode).toBe("underground");
  });

  it("homes invalid surface-side poses while underground Home stays above", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    spyOn(scene, "pickPosition").and.returnValue(undefined);
    spyOn(world, "getTerrainHeight").and.returnValue(20.0);
    spyOn(world, "pickTerrain").and.callFake((ray, result) =>
      intersectRayAtHeight(ray, 20.0, result),
    );
    spyOn(controller, "viewHome").and.callThrough();
    const direction = new Cartesian3();
    const up = new Cartesian3();
    SceneGISPlanarCamera.getAxes(
      0.0,
      CesiumMath.PI_OVER_FOUR,
      direction,
      up,
      new Cartesian3(),
    );
    SceneGISPlanarCamera.setWorldPose(
      scene.camera,
      new Cartesian3(0.0, -100.0, -80.0),
      direction,
      up,
    );

    controller.firstUpdate(scene, JulianDate.now());
    expect(controller.viewHome).toHaveBeenCalledTimes(1);
    expect(scene.camera.positionWC.z).toBeGreaterThan(controller._target.z);
    controller.navigationMode = "underground";
    controller.viewHome(scene);
    expect(controller.navigationMode).toBe("underground");
    controller.viewHome.calls.reset();
    const center = new Cartesian2(100.0, 50.0);
    queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, 1.0));
    controller.update(scene, JulianDate.now());
    expect(controller.viewHome).not.toHaveBeenCalled();
    expect(scene.camera.positionWC.z).toBeGreaterThan(controller._target.z);
  });

  it("homes every real frustum around a large-offset extent", function () {
    const scene = createWidget(1000000000.0);
    controller = new SceneGISPlanarCameraController({ world });
    for (const [width, height] of [
      [200, 100],
      [100, 200],
      [160, 160],
    ]) {
      container.style.width = `${width}px`;
      container.style.height = `${height}px`;
      widget.resize();
      for (const frustum of createFrusta()) {
        const infoBefore = SceneGISPlanarCamera.getFrustumInfo(frustum);
        const horizontalOffsetBefore =
          (infoBefore.left + infoBefore.right) /
          (infoBefore.right - infoBefore.left);
        const verticalOffsetBefore =
          (infoBefore.bottom + infoBefore.top) /
          (infoBefore.top - infoBefore.bottom);
        const near = frustum.near;
        const far = frustum.far;
        const fov = frustum.fov;
        const aspectRatio = frustum.aspectRatio;
        scene.camera.frustum = frustum;
        controller.viewHome(scene);
        const hit = world.pickFromWindowPosition(
          new Cartesian2(
            scene.canvas.clientWidth / 2,
            scene.canvas.clientHeight / 2,
          ),
          scene,
        );
        expect(hit.x).toEqualEpsilon(1000000000.0, 1e-7);
        expect(hit.y).toEqualEpsilon(1000000000.0, 1e-7);
        expect(scene.camera.positionWC.z).toBeGreaterThan(0.0);
        expect(scene.camera.directionWC).toEqualEpsilon(
          new Cartesian3(0, 0, -1),
          1e-12,
        );
        expect(scene.camera.upWC).toEqualEpsilon(Cartesian3.UNIT_Y, 1e-12);
        expect(frustum.near).toBe(near);
        expect(frustum.far).toBe(far);
        expect(frustum.fov).toBe(fov);
        expect(frustum.aspectRatio).toBe(aspectRatio);
        const infoAfter = SceneGISPlanarCamera.getFrustumInfo(frustum);
        expect(
          (infoAfter.left + infoAfter.right) /
            (infoAfter.right - infoAfter.left),
        ).toEqualEpsilon(horizontalOffsetBefore, 1e-14);
        expect(
          (infoAfter.bottom + infoAfter.top) /
            (infoAfter.top - infoAfter.bottom),
        ).toEqualEpsilon(verticalOffsetBefore, 1e-14);
        for (const x of [999999872.0, 1000000128.0]) {
          for (const y of [999999872.0, 1000000128.0]) {
            const windowPosition = project(scene, new Cartesian3(x, y, 0.0));
            expect(windowPosition.x).toBeGreaterThanOrEqual(0.0);
            expect(windowPosition.x).toBeLessThanOrEqual(
              scene.canvas.clientWidth,
            );
            expect(windowPosition.y).toBeGreaterThanOrEqual(0.0);
            expect(windowPosition.y).toBeLessThanOrEqual(
              scene.canvas.clientHeight,
            );
          }
        }
      }
    }
  });

  it("throws atomically when perspective near/far cannot contain home", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    const frustum = perspective();
    frustum.far = 2.0;
    scene.camera.frustum = frustum;
    const position = Cartesian3.clone(scene.camera.positionWC);
    const fov = frustum.fov;
    expect(() => controller.viewHome(scene)).toThrowDeveloperError();
    expect(scene.camera.positionWC).toEqual(position);
    expect(frustum.fov).toBe(fov);
    expect(frustum.far).toBe(2.0);
  });

  it("rejects derived frustum overflow before atomically applying home", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    const frustum = new OrthographicOffCenterFrustum();
    frustum.left = -Number.MAX_VALUE;
    frustum.right = Number.MAX_VALUE;
    frustum.bottom = -1.0;
    frustum.top = 1.0;
    frustum.near = 1.0;
    frustum.far = Number.MAX_VALUE;
    scene.camera.frustum = frustum;
    const originalFrustum = scene.camera.frustum;
    const position = Cartesian3.clone(scene.camera.position);
    const direction = Cartesian3.clone(scene.camera.direction);
    const up = Cartesian3.clone(scene.camera.up);
    const right = Cartesian3.clone(scene.camera.right);

    expect(() => controller.viewHome(scene)).toThrowDeveloperError();

    expect(scene.camera.frustum).toBe(originalFrustum);
    expect(frustum.left).toBe(-Number.MAX_VALUE);
    expect(frustum.right).toBe(Number.MAX_VALUE);
    expect(frustum.bottom).toBe(-1.0);
    expect(frustum.top).toBe(1.0);
    expect(scene.camera.position).toEqual(position);
    expect(scene.camera.direction).toEqual(direction);
    expect(scene.camera.up).toEqual(up);
    expect(scene.camera.right).toEqual(right);
  });

  it("homes and anchors representable huge and subnormal perspective slopes", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    spyOn(scene, "pickPosition").and.returnValue(undefined);
    const fixtures = [
      perspectiveOffCenter(
        -1.0e300,
        1.0e300,
        -1.0e300,
        1.0e300,
        1.5e306,
        2.0e306,
      ),
      perspectiveOffCenter(
        -Number.MIN_VALUE,
        Number.MIN_VALUE,
        -Number.MIN_VALUE,
        Number.MIN_VALUE,
        Number.MIN_VALUE,
        1000.0,
      ),
    ];

    for (const frustum of fixtures) {
      scene.camera.frustum = frustum;
      const fields = {
        left: frustum.left,
        right: frustum.right,
        bottom: frustum.bottom,
        top: frustum.top,
        near: frustum.near,
        far: frustum.far,
      };
      controller.viewHome(scene);
      let pose = SceneGISPlanarCamera.getWorldPose(scene.camera);
      expect(Number.isFinite(pose.position.x)).toBe(true);
      expect(Number.isFinite(pose.position.y)).toBe(true);
      expect(Number.isFinite(pose.position.z)).toBe(true);
      expect(frustum.left).toBe(fields.left);
      expect(frustum.right).toBe(fields.right);
      expect(frustum.bottom).toBe(fields.bottom);
      expect(frustum.top).toBe(fields.top);
      expect(frustum.near).toBe(fields.near);
      expect(frustum.far).toBe(fields.far);

      const center = new Cartesian2(
        scene.canvas.clientWidth * 0.5,
        scene.canvas.clientHeight * 0.5,
      );
      expect(world.pickFromWindowPosition(center, scene)).toEqualEpsilon(
        Cartesian3.ZERO,
        1e-12,
      );
      for (const position of [
        Cartesian2.ZERO,
        new Cartesian2(scene.canvas.clientWidth, scene.canvas.clientHeight),
      ]) {
        const ray = SceneGISPlanarCamera.getWindowRay(
          scene.camera,
          scene.canvas,
          position,
        );
        const hit = SceneGISPlanarCamera.intersectPlane(ray);
        expect(Number.isFinite(hit.x)).toBe(true);
        expect(Number.isFinite(hit.y)).toBe(true);
      }

      const before = Cartesian3.clone(pose.position);
      queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, -120.0));
      controller.update(scene, JulianDate.now());
      pose = SceneGISPlanarCamera.getWorldPose(scene.camera);
      expect(pose.position).toEqualEpsilon(before, 1e-12);
    }
  });

  it("resolves navigation anchors in depth, terrain, then Z-zero order", function () {
    const offset = 1000000000.0;
    const scene = createWidget(offset);
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const center = new Cartesian2(100.0, 50.0);
    const depthSpy = spyOn(scene, "pickPosition").and.returnValue(
      new Cartesian3(offset, offset, 25.0),
    );
    const terrainSpy = spyOn(world, "pickTerrain").and.callFake((ray, result) =>
      Cartesian3.fromElements(offset, offset, -10.0, result),
    );
    const planeSpy = spyOn(world, "pick").and.callThrough();

    queueMovement(CameraEventType.LEFT_DRAG, center, center);
    controller.update(scene, JulianDate.now());
    expect(controller._panAnchor.z).toBe(25.0);
    expect(terrainSpy.calls.count()).toBe(1);
    expect(planeSpy).not.toHaveBeenCalled();
    releaseButton(CameraEventType.LEFT_DRAG);
    controller.update(scene, JulianDate.now());

    depthSpy.and.returnValue(new Cartesian3(offset + 129.0, offset, 100.0));
    queueMovement(CameraEventType.MIDDLE_DRAG, center, center);
    controller.update(scene, JulianDate.now());
    expect(controller._rotatePivot.z).toBe(-10.0);
    expect(terrainSpy.calls.count()).toBe(3);
    expect(planeSpy).not.toHaveBeenCalled();
    releaseButton(CameraEventType.MIDDLE_DRAG);
    controller.update(scene, JulianDate.now());

    depthSpy.and.returnValue(new Cartesian3(Number.NaN, 0.0, 1.0));
    terrainSpy.and.returnValue(undefined);
    queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, 1.0));
    controller.update(scene, JulianDate.now());
    expect(controller._zoomAnchor.z).toBe(0.0);
    expect(terrainSpy.calls.count()).toBe(5);
    expect(planeSpy.calls.count()).toBe(1);
  });

  it("keeps a nonzero pan anchor fixed until release", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const start = new Cartesian2(100.0, 50.0);
    const depthSpy = spyOn(scene, "pickPosition").and.callFake(
      (windowPosition, result) =>
        intersectAtHeight(scene, windowPosition, 20.0, result),
    );
    const beforeZ = scene.camera.positionWC.z;

    queueMovement(
      CameraEventType.LEFT_DRAG,
      start,
      new Cartesian2(120.0, 50.0),
    );
    controller.update(scene, JulianDate.now());
    expect(controller._panAnchor.z).toBe(20.0);
    expect(scene.camera.positionWC.z).toEqualEpsilon(beforeZ, 1e-12);
    expect(depthSpy.calls.count()).toBe(1);

    queueMovement(
      CameraEventType.LEFT_DRAG,
      start,
      new Cartesian2(140.0, 50.0),
    );
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toEqualEpsilon(beforeZ, 1e-12);
    expect(depthSpy.calls.count()).toBe(1);

    releaseButton(CameraEventType.LEFT_DRAG);
    controller.update(scene, JulianDate.now());
    queueMovement(
      CameraEventType.LEFT_DRAG,
      start,
      new Cartesian2(120.0, 50.0),
    );
    controller.update(scene, JulianDate.now());
    expect(depthSpy.calls.count()).toBe(2);
  });

  it("rotates real projection families around a full three-dimensional pivot", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const start = new Cartesian2(115.0, 45.0);
    spyOn(scene, "pickPosition").and.callFake((windowPosition, result) =>
      intersectAtHeight(scene, windowPosition, 30.0, result),
    );
    const terrainSpy = spyOn(world, "pickTerrain").and.returnValue(undefined);

    for (const frustum of [perspective(), createFrusta()[2]]) {
      scene.camera.frustum = frustum;
      controller.viewHome(scene);
      controller.firstUpdate(scene, JulianDate.now());
      queueMovement(
        CameraEventType.MIDDLE_DRAG,
        start,
        new Cartesian2(120.0, 48.0),
      );
      controller.update(scene, JulianDate.now());
      expect(controller._rotatePivot.z).toBe(30.0);
      expect(project(scene, controller._rotatePivot)).toEqualEpsilon(
        start,
        1e-8,
      );
      releaseButton(CameraEventType.MIDDLE_DRAG);
      controller.update(scene, JulianDate.now());
    }
    expect(terrainSpy).toHaveBeenCalled();
  });

  it("crosses an underground pivot in both directions with one held middle drag", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({
      world,
      navigationMode: "underground",
    });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const start = new Cartesian2(115.0, 45.0);
    const depthSpy = spyOn(scene, "pickPosition").and.callFake(
      (windowPosition, result) =>
        intersectAtHeight(scene, windowPosition, 20.0, result),
    );
    const terrainSpy = spyOn(world, "pickTerrain").and.callThrough();
    const heightSpy = spyOn(world, "getTerrainHeight").and.returnValue(0.0);
    const homeSpy = spyOn(controller, "viewHome").and.callThrough();
    const frustumInfo = SceneGISPlanarCamera.getFrustumInfo(
      scene.camera.frustum,
    );
    const v = 1.0 - start.y / scene.canvas.clientHeight;
    const anchorSlope =
      frustumInfo.bottomSlope * (1.0 - v) + frustumInfo.topSlope * v;
    const tangentPitch = -Math.atan(anchorSlope);

    const tangentEnd = new Cartesian2(
      start.x,
      start.y +
        ((controller._pitch - tangentPitch) / Math.PI) *
          scene.canvas.clientHeight,
    );
    queueMovement(CameraEventType.MIDDLE_DRAG, start, tangentEnd);
    controller.update(scene, JulianDate.now());
    const pivot = Cartesian3.clone(controller._rotatePivot);
    const target = Cartesian3.clone(controller._dragTarget);
    const depthCalls = depthSpy.calls.count();
    const heightCalls = heightSpy.calls.count();
    const terrainCalls = terrainSpy.calls.count();
    expect(start).not.toEqual(
      new Cartesian2(
        scene.canvas.clientWidth * 0.5,
        scene.canvas.clientHeight * 0.5,
      ),
    );
    expect(scene.camera.positionWC.z).toEqualEpsilon(pivot.z, 1e-10);
    expect(project(scene, pivot)).toEqualEpsilon(start, 1e-8);

    const belowEnd = new Cartesian2(tangentEnd.x, tangentEnd.y - 10.0);
    queueMovement(CameraEventType.MIDDLE_DRAG, tangentEnd, belowEnd);
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeLessThan(pivot.z);
    expect(scene.camera.directionWC.z).toBeGreaterThan(0.0);
    expect(controller._rotatePivot).toEqual(pivot);
    expect(project(scene, pivot)).toEqualEpsilon(start, 1e-8);
    expect(depthSpy.calls.count()).toBe(depthCalls);
    expect(heightSpy.calls.count()).toBe(heightCalls);
    expect(terrainSpy.calls.count()).toBe(terrainCalls);
    expect(homeSpy).not.toHaveBeenCalled();

    releaseButton(CameraEventType.MIDDLE_DRAG);
    controller.update(scene, JulianDate.now());
    const belowPosition = Cartesian3.clone(scene.camera.positionWC);
    queueMovement(
      CameraEventType.LEFT_DRAG,
      start,
      new Cartesian2(start.x + 5.0, start.y),
    );
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeLessThan(controller._target.z);
    expect(scene.camera.positionWC).not.toEqual(belowPosition);
    releaseButton(CameraEventType.LEFT_DRAG);
    controller.update(scene, JulianDate.now());
    queueMovement(CameraEventType.WHEEL, start, new Cartesian2(0.0, 10.0));
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeLessThan(controller._target.z);

    const reverseStart = new Cartesian2(115.0, 45.0);
    const reverseTangentEnd = new Cartesian2(
      reverseStart.x,
      reverseStart.y +
        ((controller._pitch - tangentPitch) / Math.PI) *
          scene.canvas.clientHeight,
    );
    queueMovement(CameraEventType.MIDDLE_DRAG, reverseStart, reverseTangentEnd);
    controller.update(scene, JulianDate.now());
    const reversePivot = Cartesian3.clone(controller._rotatePivot);
    expect(scene.camera.positionWC.z).toEqualEpsilon(reversePivot.z, 1e-10);
    const aboveEnd = new Cartesian2(
      reverseTangentEnd.x,
      reverseTangentEnd.y + 10.0,
    );
    queueMovement(CameraEventType.MIDDLE_DRAG, reverseTangentEnd, aboveEnd);
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeGreaterThan(reversePivot.z);
    expect(scene.camera.directionWC.z).toBeLessThan(0.0);
    expect(project(scene, reversePivot)).toEqualEpsilon(reverseStart, 1e-8);
    expect(homeSpy).not.toHaveBeenCalled();
    expect(controller._dragTarget.z).toBe(target.z);
  });

  it("keeps the surface profile on the press-time pivot side", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const start = new Cartesian2(115.0, 45.0);
    spyOn(scene, "pickPosition").and.callFake((windowPosition, result) =>
      intersectAtHeight(scene, windowPosition, 20.0, result),
    );
    const homeSpy = spyOn(controller, "viewHome").and.callThrough();
    queueMovement(
      CameraEventType.MIDDLE_DRAG,
      start,
      new Cartesian2(start.x, start.y - scene.canvas.clientHeight),
    );
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeGreaterThan(
      controller._rotatePivot.z,
    );
    expect(scene.camera.directionWC.z).toBeLessThan(0.0);
    expect(project(scene, controller._rotatePivot)).toEqualEpsilon(start, 1e-8);
    expect(homeSpy).not.toHaveBeenCalled();
  });

  it("keeps a finite orthographic orbit distance through exact tangent", function () {
    const scene = createWidget();
    scene.camera.frustum = createFrusta()[2];
    controller = new SceneGISPlanarCameraController({
      world,
      navigationMode: "underground",
    });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    spyOn(scene, "pickPosition").and.callFake((windowPosition, result) =>
      intersectAtHeight(scene, windowPosition, 0.0, result),
    );
    const heightSpy = spyOn(world, "getTerrainHeight").and.callThrough();
    const tangentEnd = new Cartesian2(
      center.x,
      center.y - scene.canvas.clientHeight * 0.5,
    );

    queueMovement(CameraEventType.MIDDLE_DRAG, center, tangentEnd);
    controller.update(scene, JulianDate.now());
    const pivot = Cartesian3.clone(controller._rotatePivot);
    const distance = controller._rotateDistance;
    const heightCalls = heightSpy.calls.count();
    expect(Number.isFinite(distance)).toBe(true);
    expect(scene.camera.positionWC.z).toEqualEpsilon(pivot.z, 1e-12);

    const belowEnd = new Cartesian2(tangentEnd.x, tangentEnd.y - 10.0);
    queueMovement(CameraEventType.MIDDLE_DRAG, tangentEnd, belowEnd);
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeLessThan(pivot.z);
    expect(scene.camera.directionWC.z).toBeGreaterThan(0.0);
    expect(controller._rotateDistance).toBe(distance);
    expect(project(scene, pivot)).toEqualEpsilon(center, 1e-8);
    expect(heightSpy.calls.count()).toBe(heightCalls);
  });

  it("normalizes an exact tangent release before new gestures", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({
      world,
      navigationMode: "underground",
    });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    spyOn(scene, "pickPosition").and.callFake((windowPosition, result) =>
      intersectAtHeight(scene, windowPosition, 0.0, result),
    );
    const heightSpy = spyOn(world, "getTerrainHeight").and.callThrough();
    const terrainSpy = spyOn(world, "pickTerrain").and.callThrough();
    const homeSpy = spyOn(controller, "viewHome").and.callThrough();
    const tangentEnd = new Cartesian2(
      center.x,
      center.y - scene.canvas.clientHeight * 0.5,
    );

    queueMovement(CameraEventType.MIDDLE_DRAG, center, tangentEnd);
    controller.update(scene, JulianDate.now());
    const pivot = Cartesian3.clone(controller._rotatePivot);
    expect(scene.camera.positionWC.z).toEqualEpsilon(pivot.z, 1e-12);
    const heightCalls = heightSpy.calls.count();
    const terrainCalls = terrainSpy.calls.count();

    releaseButton(CameraEventType.MIDDLE_DRAG);
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC.z).toBeLessThan(pivot.z);
    expect(Math.abs(controller._pitch)).toBeLessThan(1e-4);
    expect(heightSpy.calls.count()).toBe(heightCalls);
    expect(terrainSpy.calls.count()).toBe(terrainCalls);
    expect(homeSpy).not.toHaveBeenCalled();
    expect(controller.navigationMode).toBe("underground");

    const beforePan = Cartesian3.clone(scene.camera.positionWC);
    queueMovement(
      CameraEventType.LEFT_DRAG,
      center,
      new Cartesian2(center.x + 5.0, center.y),
    );
    controller.update(scene, JulianDate.now());
    expect(controller._panActive).toBe(true);
    expect(scene.camera.positionWC).not.toEqual(beforePan);
    releaseButton(CameraEventType.LEFT_DRAG);
    controller.update(scene, JulianDate.now());

    queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, 10.0));
    controller.update(scene, JulianDate.now());
    expect(controller._zoomAnchor).toBeDefined();
    expect(Number.isFinite(scene.camera.positionWC.z)).toBe(true);

    queueMovement(
      CameraEventType.MIDDLE_DRAG,
      center,
      new Cartesian2(center.x + 2.0, center.y - 2.0),
    );
    controller.update(scene, JulianDate.now());
    expect(controller._rotateActive).toBe(true);
    expect(Number.isFinite(scene.camera.positionWC.z)).toBe(true);
    expect(homeSpy).not.toHaveBeenCalled();
  });

  it("keeps reusable nonzero zoom anchors for perspective and orthographic views", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const pointer = new Cartesian2(115.0, 45.0);
    const zoomAnchor = controller._zoomAnchor;
    const depthSpy = spyOn(scene, "pickPosition").and.callFake(
      (windowPosition, result) => {
        expect(result).toBe(zoomAnchor);
        return intersectAtHeight(scene, windowPosition, 20.0, result);
      },
    );
    const terrainSpy = spyOn(world, "pickTerrain").and.callThrough();

    for (const frustum of [perspective(), createFrusta()[2]]) {
      scene.camera.frustum = frustum;
      controller.viewHome(scene);
      controller.firstUpdate(scene, JulianDate.now());
      const anchor = intersectAtHeight(scene, pointer, 20.0, new Cartesian3());
      queueMovement(CameraEventType.WHEEL, pointer, new Cartesian2(0.0, 1.0));
      Cartesian2.clone(pointer, controller._aggregator._currentMousePosition);
      controller.update(scene, JulianDate.now());
      expect(depthSpy).toHaveBeenCalled();
      expect(terrainSpy).toHaveBeenCalled();
      expect(controller._zoomAnchor).toBe(zoomAnchor);
      expect(controller._zoomAnchor).toEqualEpsilon(anchor, 1e-8);
      expect(project(scene, anchor)).toEqualEpsilon(pointer, 1e-7);
    }
  });

  it("rejects legacy input conflicts before camera mutation", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    scene.camera.frustum = perspective();
    scene.camera._setTransform(Matrix4.IDENTITY);
    const before = Cartesian3.clone(scene.camera.positionWC);
    scene.screenSpaceCameraController.enableInputs = true;
    expect(() => controller.viewHome(scene)).toThrowDeveloperError();
    expect(scene.camera.positionWC).toEqual(before);
  });

  it("connects, removes, and reconnects with exactly-once aggregator cleanup", function () {
    createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const first = controller._aggregator;
    expect(first.isDestroyed()).toBe(false);
    widget.removeController(controller);
    expect(first.isDestroyed()).toBe(true);
    expect(controller._aggregator).toBeUndefined();
    widget.addController(controller);
    expect(controller._aggregator).not.toBe(first);
    expect(controller._aggregator.isDestroyed()).toBe(false);
  });

  it("processes drag before wheel and has no residual input", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    queueMovement(
      CameraEventType.LEFT_DRAG,
      center,
      new Cartesian2(center.x + 10.0, center.y),
    );
    queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, 120.0));
    controller.update(scene, JulianDate.now());
    const changed = Cartesian3.clone(scene.camera.positionWC);
    controller._aggregator._isDown[`${CameraEventType.LEFT_DRAG}`] = false;
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(changed);
  });

  it("clears pending feature input when disabled", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const before = Cartesian3.clone(scene.camera.positionWC);
    queueMovement(
      CameraEventType.LEFT_DRAG,
      new Cartesian2(100, 50),
      new Cartesian2(120, 50),
    );
    controller.enablePan = false;
    queueMovement(
      CameraEventType.LEFT_DRAG,
      new Cartesian2(100, 50),
      new Cartesian2(140, 50),
    );
    controller.enablePan = true;
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);

    queueMovement(
      CameraEventType.MIDDLE_DRAG,
      new Cartesian2(100, 50),
      new Cartesian2(120, 60),
    );
    controller.enableRotate = false;
    queueMovement(
      CameraEventType.MIDDLE_DRAG,
      new Cartesian2(100, 50),
      new Cartesian2(140, 70),
    );
    controller.enableRotate = true;
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);

    queueMovement(
      CameraEventType.WHEEL,
      new Cartesian2(100, 50),
      new Cartesian2(0, 120),
    );
    controller.enableZoom = false;
    queueMovement(
      CameraEventType.WHEEL,
      new Cartesian2(100, 50),
      new Cartesian2(0, -240),
    );
    controller.enableZoom = true;
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);

    controller.enabled = false;
    queueMovement(
      CameraEventType.LEFT_DRAG,
      new Cartesian2(100, 50),
      new Cartesian2(160, 50),
    );
    controller.enabled = true;
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);
  });

  it("quarantines held canceled drags until release without corrupting button state", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const before = Cartesian3.clone(scene.camera.positionWC);
    const start = new Cartesian2(100, 50);

    queueMovement(CameraEventType.LEFT_DRAG, start, new Cartesian2(120, 50));
    expect(controller._aggregator.anyButtonDown).toBe(true);
    controller.enabled = false;
    controller.enabled = true;
    queueMovement(CameraEventType.LEFT_DRAG, start, new Cartesian2(150, 50));
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);
    expect(controller._aggregator.anyButtonDown).toBe(true);

    releaseButton(CameraEventType.LEFT_DRAG);
    expect(controller._aggregator.anyButtonDown).toBe(false);
    controller.update(scene, JulianDate.now());
    queueMovement(CameraEventType.LEFT_DRAG, start, new Cartesian2(120, 50));
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).not.toEqual(before);
    expect(controller._aggregator.anyButtonDown).toBe(true);
    releaseButton(CameraEventType.LEFT_DRAG);
    expect(controller._aggregator.anyButtonDown).toBe(false);
  });

  it("quarantines stale first-update, feature-disabled, and zero-canvas drags", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const start = new Cartesian2(100, 50);
    queueMovement(CameraEventType.MIDDLE_DRAG, start, new Cartesian2(110, 50));
    controller.firstUpdate(scene, JulianDate.now());
    const before = Cartesian3.clone(scene.camera.positionWC);
    queueMovement(CameraEventType.MIDDLE_DRAG, start, new Cartesian2(130, 50));
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);
    releaseButton(CameraEventType.MIDDLE_DRAG);
    controller.update(scene, JulianDate.now());

    queueMovement(CameraEventType.LEFT_DRAG, start, new Cartesian2(120, 50));
    controller.enablePan = false;
    controller.enablePan = true;
    queueMovement(CameraEventType.LEFT_DRAG, start, new Cartesian2(150, 50));
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);
    expect(controller._aggregator.anyButtonDown).toBe(true);

    Object.defineProperty(scene.canvas, "clientWidth", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(scene.canvas, "clientHeight", {
      configurable: true,
      value: 0,
    });
    controller.update(scene, JulianDate.now());
    Object.defineProperty(scene.canvas, "clientWidth", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(scene.canvas, "clientHeight", {
      configurable: true,
      value: 100,
    });
    queueMovement(CameraEventType.LEFT_DRAG, start, new Cartesian2(170, 50));
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);
    releaseButton(CameraEventType.LEFT_DRAG);
    expect(controller._aggregator.anyButtonDown).toBe(false);
  });

  it("keeps a valid initial and externally mutated camera idle", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    scene.camera._setTransform(Matrix4.IDENTITY);
    Cartesian3.clone(new Cartesian3(0, 0, 100), scene.camera.position);
    Cartesian3.clone(new Cartesian3(0, 0, -1), scene.camera.direction);
    Cartesian3.clone(Cartesian3.UNIT_Y, scene.camera.up);
    Cartesian3.clone(Cartesian3.UNIT_X, scene.camera.right);
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const initial = Cartesian3.clone(scene.camera.positionWC);
    controller.firstUpdate(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(initial);

    scene.camera.position.x += 5.0;
    const external = Cartesian3.clone(scene.camera.positionWC);
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(external);
  });

  it("preserves nadir heading through a non-identity transform and homes rolled poses", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    scene.camera._setTransform(
      Matrix4.fromTranslation(new Cartesian3(1000.0, -2000.0, 50.0)),
    );
    SceneGISPlanarCamera.setWorldPose(
      scene.camera,
      new Cartesian3(0.0, 0.0, 100.0),
      new Cartesian3(0.0, 0.0, -1.0),
      Cartesian3.UNIT_X,
    );
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.firstUpdate(scene, JulianDate.now());
    expect(controller._heading).toEqualEpsilon(Math.PI / 2.0, 1e-12);
    queueMovement(
      CameraEventType.MIDDLE_DRAG,
      new Cartesian2(100, 50),
      new Cartesian2(101, 50),
    );
    controller.update(scene, JulianDate.now());
    expect(controller._heading).toEqualEpsilon(
      Math.PI / 2.0 + Math.PI / scene.canvas.clientWidth,
      1e-12,
    );
    releaseButton(CameraEventType.MIDDLE_DRAG);
    controller.update(scene, JulianDate.now());

    const direction = new Cartesian3();
    const up = new Cartesian3();
    const right = new Cartesian3();
    SceneGISPlanarCamera.getAxes(0.4, -0.7, direction, up, right);
    const rolledUp = Cartesian3.add(
      Cartesian3.multiplyByScalar(up, Math.cos(0.2), new Cartesian3()),
      Cartesian3.multiplyByScalar(right, Math.sin(0.2), new Cartesian3()),
      new Cartesian3(),
    );
    SceneGISPlanarCamera.setWorldPose(
      scene.camera,
      new Cartesian3(0.0, 0.0, 100.0),
      direction,
      rolledUp,
    );
    queueMovement(
      CameraEventType.WHEEL,
      new Cartesian2(100, 50),
      new Cartesian2(0, -120),
    );
    controller.update(scene, JulianDate.now());
    expect(scene.camera.directionWC).toEqualEpsilon(
      new Cartesian3(0.0, 0.0, -1.0),
      1e-12,
    );
    expect(scene.camera.upWC).toEqualEpsilon(Cartesian3.UNIT_Y, 1e-12);
    expect(controller._heading).toBe(0.0);
  });

  it("does not mutate the camera for input on a zero-sized canvas", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.firstUpdate(scene, JulianDate.now());
    const before = Cartesian3.clone(scene.camera.positionWC);
    Object.defineProperty(scene.canvas, "clientWidth", {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(scene.canvas, "clientHeight", {
      configurable: true,
      value: 0,
    });
    expect(scene.canvas.clientWidth).toBe(0);
    expect(scene.canvas.clientHeight).toBe(0);
    queueMovement(
      CameraEventType.LEFT_DRAG,
      Cartesian2.ZERO,
      new Cartesian2(10.0, 10.0),
    );

    expect(() => controller.update(scene, JulianDate.now())).not.toThrow();
    expect(scene.camera.positionWC).toEqual(before);
  });

  it("pans from a bounded anchor through an unbounded movement to the boundary", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    queueMovement(
      CameraEventType.LEFT_DRAG,
      center,
      new Cartesian2(10000, center.y),
    );
    controller.update(scene, JulianDate.now());
    expect(controller._target.x).toBe(-128.0);
    const centerRay = SceneGISPlanarCamera.getWindowRay(
      scene.camera,
      scene.canvas,
      center,
    );
    const unbounded = SceneGISPlanarCamera.intersectPlane(centerRay);
    expect(unbounded.x).toBe(-128.0);
    const target = world.pickFromWindowPosition(center, scene);
    expect(target.x).toBe(-128.0);
    expect(target.y).toEqualEpsilon(0.0, 1e-12);
    expect(scene.camera.positionWC.z).toBeGreaterThan(0.0);
  });

  it("rotates around a fixed pivot with heading wrap and pitch clamps", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.firstUpdate(scene, JulianDate.now());
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    queueMovement(
      CameraEventType.MIDDLE_DRAG,
      center,
      new Cartesian2(500, -1000),
    );
    controller.update(scene, JulianDate.now());
    expect(controller._heading).toBeGreaterThanOrEqual(0.0);
    expect(controller._heading).toBeLessThan(CesiumMath.TWO_PI);
    expect(controller._pitch).toBeLessThanOrEqual(-CesiumMath.toRadians(5));
    expect(controller._pitch).toBeGreaterThanOrEqual(-CesiumMath.PI_OVER_TWO);
    expect(scene.camera.positionWC.z).toBeGreaterThan(0.0);
    expect(
      Cartesian3.dot(scene.camera.directionWC, scene.camera.upWC),
    ).toBeCloseTo(0.0, 12);
    expect(scene.camera.rightWC.z).toBeCloseTo(0.0, 12);
  });

  it("uses the viewport center as the fallback rotation anchor", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    const missedStart = new Cartesian2(scene.canvas.clientWidth + 50, center.y);

    for (const frustum of [
      perspective(),
      createFrusta()[2],
      createFrusta()[1],
    ]) {
      releaseButton(CameraEventType.MIDDLE_DRAG);
      controller.update(scene, JulianDate.now());
      scene.camera.frustum = frustum;
      controller.viewHome(scene);
      expect(world.pickFromWindowPosition(missedStart, scene)).toBeUndefined();
      const pivot = Cartesian3.clone(controller._target);
      queueMovement(
        CameraEventType.MIDDLE_DRAG,
        missedStart,
        new Cartesian2(251, 51),
      );
      controller.update(scene, JulianDate.now());
      const projected = project(scene, pivot);
      expect(projected.x).toEqualEpsilon(center.x, 1e-9);
      expect(projected.y).toEqualEpsilon(center.y, 1e-9);
      expect(Math.abs(controller._target.x)).toBeLessThan(128.0);
      expect(Math.abs(controller._target.y)).toBeLessThan(128.0);
    }
  });

  it("maps real DOM wheel events through Cesium input normalization", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);

    for (const frustum of [perspective(), createFrusta()[2]]) {
      scene.camera.frustum = frustum;
      controller.viewHome(scene);
      const homeRange = getZoomRange(scene);

      dispatchWheel(scene, -120.0);
      controller.update(scene, JulianDate.now());
      const zoomedInRange = getZoomRange(scene);
      expect(zoomedInRange).toBeLessThan(homeRange);
      expect(zoomedInRange).toEqualEpsilon(homeRange * Math.exp(-0.5), 1e-12);

      dispatchWheel(scene, 120.0);
      controller.update(scene, JulianDate.now());
      expect(getZoomRange(scene)).toEqualEpsilon(homeRange, 1e-12);
    }
  });

  it("uses viewport-normalized exponential wheel scaling with a cap", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const center = new Cartesian2(100.0, 50.0);

    for (const frustum of [perspective(), createFrusta()[2]]) {
      scene.camera.frustum = frustum;
      controller.viewHome(scene);
      let range = getZoomRange(scene);
      queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, 1.0));
      controller.update(scene, JulianDate.now());
      expect(getZoomRange(scene)).toEqualEpsilon(
        range * Math.exp(-5.0 / scene.canvas.clientHeight),
        1e-12,
      );

      controller.viewHome(scene);
      range = getZoomRange(scene);
      queueMovement(
        CameraEventType.WHEEL,
        center,
        new Cartesian2(0.0, 1000000.0),
      );
      controller.update(scene, JulianDate.now());
      expect(getZoomRange(scene)).toEqualEpsilon(range * Math.exp(-0.5), 1e-12);
    }
  });

  it("clamps outside center targets through gesture updates without invoking home", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    spyOn(controller, "viewHome").and.callThrough();
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );

    for (const frustum of [perspective(), createFrusta()[2]]) {
      scene.camera.frustum = frustum;
      for (const point of [
        new Cartesian2(-200.0, 0.0),
        new Cartesian2(200.0, 0.0),
        new Cartesian2(0.0, -200.0),
        new Cartesian2(0.0, 200.0),
        new Cartesian2(-200.0, -200.0),
        new Cartesian2(-200.0, 200.0),
        new Cartesian2(200.0, -200.0),
        new Cartesian2(200.0, 200.0),
      ]) {
        SceneGISPlanarCamera.setWorldPose(
          scene.camera,
          new Cartesian3(point.x, point.y, 100.0),
          new Cartesian3(0.0, 0.0, -1.0),
          Cartesian3.UNIT_Y,
        );
        const before = Cartesian3.clone(scene.camera.positionWC);
        queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, 1.0));
        Cartesian2.clone(center, controller._aggregator._currentMousePosition);
        controller.update(scene, JulianDate.now());

        const expected = new Cartesian3(
          CesiumMath.clamp(point.x, -128.0, 128.0),
          CesiumMath.clamp(point.y, -128.0, 128.0),
          0.0,
        );
        const ray = SceneGISPlanarCamera.getWindowRay(
          scene.camera,
          scene.canvas,
          center,
        );
        const unbounded = SceneGISPlanarCamera.intersectPlane(ray);
        const bounded = world.pickFromWindowPosition(center, scene);
        const pose = SceneGISPlanarCamera.getWorldPose(scene.camera);

        expect(controller.viewHome).not.toHaveBeenCalled();
        expect(scene.camera.positionWC).not.toEqual(before);
        expect(controller._target).toEqualEpsilon(expected, 1e-12);
        expect(unbounded).toEqualEpsilon(expected, 1e-12);
        expect(bounded).toEqualEpsilon(expected, 1e-12);
        for (const vector of [
          pose.position,
          pose.direction,
          pose.up,
          pose.right,
        ]) {
          expect(Number.isFinite(vector.x)).toBe(true);
          expect(Number.isFinite(vector.y)).toBe(true);
          expect(Number.isFinite(vector.z)).toBe(true);
        }
      }
    }
  });

  it("tolerates narrow maximum-pitch round trips without homing", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const maximumPitch = -CesiumMath.toRadians(5.0);
    const direction = new Cartesian3();
    const up = new Cartesian3();
    SceneGISPlanarCamera.getAxes(
      0.0,
      maximumPitch + CesiumMath.EPSILON12,
      direction,
      up,
      new Cartesian3(),
    );
    const position = Cartesian3.multiplyByScalar(
      direction,
      -100.0,
      new Cartesian3(),
    );
    SceneGISPlanarCamera.setWorldPose(scene.camera, position, direction, up);
    spyOn(controller, "viewHome").and.callThrough();

    controller.firstUpdate(scene, JulianDate.now());
    expect(controller.viewHome).not.toHaveBeenCalled();
    expect(controller._pitch).toBe(maximumPitch);
    for (let i = 0; i < 3; ++i) {
      queueMovement(
        CameraEventType.WHEEL,
        new Cartesian2(100.0, 50.0),
        new Cartesian2(0.0, 1.0),
      );
      controller.update(scene, JulianDate.now());
      expect(controller.viewHome).not.toHaveBeenCalled();
      expect(controller._pitch).toBe(maximumPitch);
    }

    const center = new Cartesian2(100.0, 50.0);
    queueMovement(
      CameraEventType.LEFT_DRAG,
      center,
      new Cartesian2(101.0, 50.0),
    );
    controller.update(scene, JulianDate.now());
    releaseButton(CameraEventType.LEFT_DRAG);
    controller.update(scene, JulianDate.now());
    queueMovement(
      CameraEventType.LEFT_DRAG,
      center,
      new Cartesian2(99.0, 50.0),
    );
    controller.update(scene, JulianDate.now());
    expect(controller.viewHome).not.toHaveBeenCalled();
    expect(controller._pitch).toBe(maximumPitch);
  });

  it("homes a maximum-pitch violation outside the round-trip tolerance", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const direction = new Cartesian3();
    const up = new Cartesian3();
    SceneGISPlanarCamera.getAxes(
      0.0,
      -CesiumMath.toRadians(5.0) + CesiumMath.EPSILON8,
      direction,
      up,
      new Cartesian3(),
    );
    const position = Cartesian3.multiplyByScalar(
      direction,
      -100.0,
      new Cartesian3(),
    );
    SceneGISPlanarCamera.setWorldPose(scene.camera, position, direction, up);
    spyOn(controller, "viewHome").and.callThrough();
    queueMovement(
      CameraEventType.WHEEL,
      new Cartesian2(100.0, 50.0),
      new Cartesian2(0.0, 1.0),
    );

    controller.update(scene, JulianDate.now());

    expect(controller.viewHome).toHaveBeenCalledTimes(1);
    expect(controller._pitch).toBe(-CesiumMath.PI_OVER_TWO);
    expect(scene.camera.directionWC).toEqualEpsilon(
      new Cartesian3(0.0, 0.0, -1.0),
      1e-12,
    );
  });

  it("zooms deterministically without changing perspective frustum fields", function () {
    const scene = createWidget();
    const frustum = perspective();
    scene.camera.frustum = frustum;
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    controller.firstUpdate(scene, JulianDate.now());
    const beforeDistance = Cartesian3.distance(
      scene.camera.positionWC,
      controller._target,
    );
    const before = {
      fov: frustum.fov,
      aspectRatio: frustum.aspectRatio,
      near: frustum.near,
      far: frustum.far,
    };
    controller._aggregator._currentMousePosition.x =
      scene.canvas.clientWidth * 0.5;
    controller._aggregator._currentMousePosition.y =
      scene.canvas.clientHeight * 0.5;
    queueMovement(
      CameraEventType.WHEEL,
      new Cartesian2(
        scene.canvas.clientWidth * 0.5,
        scene.canvas.clientHeight * 0.5,
      ),
      new Cartesian2(0, 120),
    );
    controller._aggregator._currentMousePosition.x =
      scene.canvas.clientWidth * 0.5;
    controller._aggregator._currentMousePosition.y =
      scene.canvas.clientHeight * 0.5;
    controller.update(scene, JulianDate.now());
    expect(
      Cartesian3.distance(scene.camera.positionWC, controller._target),
    ).toEqualEpsilon(beforeDistance * Math.exp(-0.5), 1e-12);
    expect(frustum.fov).toBe(before.fov);
    expect(frustum.aspectRatio).toBe(before.aspectRatio);
    expect(frustum.near).toBe(before.near);
    expect(frustum.far).toBe(before.far);
  });

  it("zooms a valid initial perspective camera out using a center-range metric", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    scene.camera._setTransform(Matrix4.IDENTITY);
    SceneGISPlanarCamera.setWorldPose(
      scene.camera,
      new Cartesian3(0.0, 0.0, 100.0),
      new Cartesian3(0.0, 0.0, -1.0),
      Cartesian3.UNIT_Y,
    );
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.firstUpdate(scene, JulianDate.now());
    const before = Cartesian3.distance(
      scene.camera.positionWC,
      controller._target,
    );
    queueMovement(
      CameraEventType.WHEEL,
      new Cartesian2(100, 50),
      new Cartesian2(0, -120),
    );
    controller.update(scene, JulianDate.now());
    expect(
      Cartesian3.distance(scene.camera.positionWC, controller._target),
    ).toBeGreaterThan(before);
  });

  it("keeps off-center pointer zoom at the dynamic home maximum", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const pointer = new Cartesian2(120, 50);
    for (const frustum of [perspective(), createFrusta()[1]]) {
      scene.camera.frustum = frustum;
      controller.viewHome(scene);
      expect(world.pickFromWindowPosition(pointer, scene)).toBeDefined();
      const position = Cartesian3.clone(scene.camera.positionWC);
      const target = Cartesian3.clone(controller._target);
      queueMovement(CameraEventType.WHEEL, pointer, new Cartesian2(0, -120));
      controller.update(scene, JulianDate.now());
      expect(scene.camera.positionWC).toEqualEpsilon(position, 1e-12);
      expect(controller._target).toEqualEpsilon(target, 1e-12);
    }
  });

  it("recomputes perspective home maximum after padding, frustum, and resize changes", function () {
    const scene = createWidget();
    const frustum = createFrusta()[1];
    scene.camera.frustum = frustum;
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.viewHome(scene);
    queueMovement(
      CameraEventType.WHEEL,
      new Cartesian2(100, 50),
      new Cartesian2(0, 1200),
    );
    controller.update(scene, JulianDate.now());

    controller.homePadding = 1.2;
    frustum.left = -0.5;
    frustum.right = 2.5;
    container.style.width = "300px";
    container.style.height = "100px";
    widget.resize();
    const expected = controller._computeHomeState(scene).maximumRange;
    const pointer = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    for (let i = 0; i < 10; ++i) {
      queueMovement(CameraEventType.WHEEL, pointer, new Cartesian2(0, -120000));
      controller.update(scene, JulianDate.now());
    }
    expect(
      Cartesian3.distance(scene.camera.positionWC, controller._target),
    ).toEqualEpsilon(expected, 1e-10);
  });

  it("clamps perspective and orthographic zoom to minimum and home maximum", function () {
    const scene = createWidget();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );

    for (const frustum of [perspective(), createFrusta()[2]]) {
      scene.camera.frustum = frustum;
      controller.viewHome(scene);
      controller._aggregator._currentMousePosition.x = center.x;
      controller._aggregator._currentMousePosition.y = center.y;
      const info = SceneGISPlanarCamera.getFrustumInfo(frustum);
      const home = info.perspective
        ? Cartesian3.distance(scene.camera.positionWC, controller._target)
        : info.top - info.bottom;

      queueMovement(
        CameraEventType.WHEEL,
        center,
        new Cartesian2(0.0, -120000.0),
      );
      controller.update(scene, JulianDate.now());
      let currentInfo = SceneGISPlanarCamera.getFrustumInfo(frustum);
      let current = currentInfo.perspective
        ? Cartesian3.distance(scene.camera.positionWC, controller._target)
        : currentInfo.top - currentInfo.bottom;
      expect(current).toEqualEpsilon(home, 1e-12);

      queueMovement(
        CameraEventType.WHEEL,
        center,
        new Cartesian2(0.0, 120000.0),
      );
      controller.update(scene, JulianDate.now());
      currentInfo = SceneGISPlanarCamera.getFrustumInfo(frustum);
      current = currentInfo.perspective
        ? Cartesian3.distance(scene.camera.positionWC, controller._target)
        : currentInfo.top - currentInfo.bottom;
      expect(current).toBeLessThan(home);
      expect(current).toBeGreaterThan(0.0);

      queueMovement(
        CameraEventType.WHEEL,
        center,
        new Cartesian2(0.0, -120000.0),
      );
      controller.update(scene, JulianDate.now());
      currentInfo = SceneGISPlanarCamera.getFrustumInfo(frustum);
      current = currentInfo.perspective
        ? Cartesian3.distance(scene.camera.positionWC, controller._target)
        : currentInfo.top - currentInfo.bottom;
      expect(current).toEqualEpsilon(home, 1e-12);
    }
  });

  it("homes an invalid external camera on the next gesture", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.firstUpdate(scene, JulianDate.now());
    scene.camera.position.z = -10.0;
    queueMovement(
      CameraEventType.WHEEL,
      new Cartesian2(100.0, 50.0),
      new Cartesian2(0.0, -120.0),
    );

    controller.update(scene, JulianDate.now());

    expect(scene.camera.positionWC.z).toBeGreaterThan(0.0);
    expect(controller._target.x).toBeGreaterThanOrEqual(-128.0);
    expect(controller._target.x).toBeLessThanOrEqual(128.0);
    expect(controller._target.y).toBeGreaterThanOrEqual(-128.0);
    expect(controller._target.y).toBeLessThanOrEqual(128.0);
  });

  it("gives middle drag priority over left drag in the same frame", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.firstUpdate(scene, JulianDate.now());
    const center = new Cartesian2(
      scene.canvas.clientWidth * 0.5,
      scene.canvas.clientHeight * 0.5,
    );
    queueMovement(CameraEventType.LEFT_DRAG, center, new Cartesian2(120, 50));
    queueMovement(CameraEventType.MIDDLE_DRAG, center, new Cartesian2(110, 50));
    controller.update(scene, JulianDate.now());
    expect(controller._rotateActive).toBe(true);
    expect(controller._panActive).toBe(false);
    expect(scene.camera.directionWC.x).not.toBe(0.0);
  });

  it("ignores unsupported right drag and pinch input", function () {
    const scene = createWidget();
    scene.camera.frustum = perspective();
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
    controller.firstUpdate(scene, JulianDate.now());
    const before = Cartesian3.clone(scene.camera.positionWC);
    queueMovement(
      CameraEventType.RIGHT_DRAG,
      new Cartesian2(100, 50),
      new Cartesian2(150, 75),
    );
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);
    queueMovement(
      CameraEventType.PINCH,
      new Cartesian2(100, 50),
      new Cartesian2(150, 75),
    );
    controller.update(scene, JulianDate.now());
    expect(scene.camera.positionWC).toEqual(before);
  });
});

describe("Scene/Controllers/ControllerHost/SceneGISPlanarCameraController", function () {
  it("registers and unregisters through CesiumWidget with paired cleanup", function () {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const localWorld = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        }),
      }),
      maximumLevel: 0,
    });
    const contextOptions = { webgl: {} };
    if (!!window.webglStub) {
      contextOptions.getWebGLStub = getWebGLStub;
    }
    const localWidget = new CesiumWidget(container, {
      world: localWorld,
      useDefaultRenderLoop: false,
      contextOptions,
    });
    localWidget.scene.screenSpaceCameraController.enableInputs = false;
    const localController = new SceneGISPlanarCameraController({
      world: localWorld,
    });

    localWidget.addController(localController);
    const aggregator = localController._aggregator;
    expect(aggregator.isDestroyed()).toBe(false);
    localWidget.removeController(localController);
    expect(aggregator.isDestroyed()).toBe(true);
    expect(localController._aggregator).toBeUndefined();

    localWidget.destroy();
    document.body.removeChild(container);
  });
});

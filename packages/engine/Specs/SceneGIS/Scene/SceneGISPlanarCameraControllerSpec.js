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
    Cartesian2.clone(start, aggregator._movement[key].startPosition);
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
    localWorld.destroy();
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
      queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, 120.0));
      controller.update(scene, JulianDate.now());
      pose = SceneGISPlanarCamera.getWorldPose(scene.camera);
      expect(pose.position).toEqualEpsilon(before, 1e-12);
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
    queueMovement(CameraEventType.WHEEL, center, new Cartesian2(0.0, -120.0));
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
      new Cartesian2(0, -120),
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

  it("zooms deterministically without changing perspective frustum fields", function () {
    const scene = createWidget();
    const frustum = perspective();
    scene.camera.frustum = frustum;
    controller = new SceneGISPlanarCameraController({ world });
    widget.addController(controller);
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
      Cartesian2.ZERO,
      new Cartesian2(0, -120),
    );
    controller.update(scene, JulianDate.now());
    expect(
      Cartesian3.distance(scene.camera.positionWC, controller._target),
    ).toBeLessThan(beforeDistance);
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
      new Cartesian2(0, 120),
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
      queueMovement(CameraEventType.WHEEL, pointer, new Cartesian2(0, 120));
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
      new Cartesian2(0, -1200),
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
    queueMovement(CameraEventType.WHEEL, pointer, new Cartesian2(0, 120000));
    controller.update(scene, JulianDate.now());
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
        new Cartesian2(0.0, 120000.0),
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
        new Cartesian2(0.0, -120000.0),
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
        new Cartesian2(0.0, 120000.0),
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

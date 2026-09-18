import {
  BoundingSphere,
  Camera,
  Cartesian2,
  Cartesian3,
  GeographicProjection,
  HeadingPitchRange,
  Matrix3,
  Matrix4,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveOffCenterFrustum,
  Ray,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
  SceneMode,
  TweenCollection,
} from "../../../index.js";

describe("SceneGIS/Scene/SceneGISPlanarCameraApi", function () {
  let world;
  let scene;
  let camera;

  beforeEach(function () {
    world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1000,
          minimumY: -1000,
          maximumX: 1000,
          maximumY: 1000,
        }),
      }),
      maximumLevel: 0,
    });
    scene = {
      world,
      mode: SceneMode.SCENE3D,
      canvas: { clientWidth: 200, clientHeight: 100 },
      drawingBufferWidth: 200,
      drawingBufferHeight: 100,
      pixelRatio: 1,
      mapProjection: new GeographicProjection(),
      tweens: new TweenCollection(),
      requestRender: jasmine.createSpy("requestRender"),
    };
    camera = new Camera(scene);
    scene.camera = camera;
    camera.setView({ destination: new Cartesian3(100, 200, 100) });
  });

  afterEach(function () {
    camera.cancelFlight();
    world.destroy();
  });

  function rotatedFrame() {
    return Matrix4.fromRotationTranslation(
      Matrix3.fromRotationZ(0.6),
      new Cartesian3(500000, 3000000, 25),
    );
  }

  it("round-trips public HPR and world/local properties through setView and flyTo", function () {
    const destination = new Cartesian3(500120, 3000230, 180);
    const orientation = { heading: 0.7, pitch: -0.4, roll: 0.2 };
    const transform = rotatedFrame();
    camera.setView({ destination, orientation, endTransform: transform });
    expect(camera.positionWC).toEqualEpsilon(destination, 1e-9);
    expect(camera.heading).toEqualEpsilon(orientation.heading, 1e-12);
    expect(camera.pitch).toEqualEpsilon(orientation.pitch, 1e-12);
    expect(camera.roll).toEqualEpsilon(orientation.roll, 1e-12);
    expect(
      camera.cameraToWorldCoordinatesPoint(camera.position),
    ).toEqualEpsilon(destination, 1e-9);
    expect(camera.worldToCameraCoordinatesPoint(destination)).toEqualEpsilon(
      camera.position,
      1e-9,
    );
    expect(
      Matrix4.multiply(
        camera.viewMatrix,
        camera.inverseViewMatrix,
        new Matrix4(),
      ),
    ).toEqualEpsilon(Matrix4.IDENTITY, 1e-8);
    const up = Cartesian3.clone(camera.upWC);
    const direction = Cartesian3.clone(camera.directionWC);
    const complete = jasmine.createSpy("complete");
    const cancel = jasmine.createSpy("cancel");
    camera.flyTo({
      destination: Cartesian3.add(
        destination,
        new Cartesian3(30, 40, 50),
        new Cartesian3(),
      ),
      orientation: { direction, up },
      duration: 1,
      complete,
      cancel,
    });
    camera.completeFlight();
    expect(camera.directionWC).toEqualEpsilon(direction, 1e-12);
    expect(camera.upWC).toEqualEpsilon(up, 1e-12);
    expect(camera.heading).toEqualEpsilon(orientation.heading, 1e-12);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(cancel).not.toHaveBeenCalled();
    expect(scene.tweens.length).toBe(0);
  });

  it("looks at a world position using fixed Z up without moving or changing the reference frame", function () {
    const position = new Cartesian3(500120, 3000230, 180);
    const target = new Cartesian3(500120, 3000330, 80);
    const transform = rotatedFrame();
    camera.setView({ destination: position, endTransform: transform });
    camera.lookAtWorldPosition(target);
    expect(camera.positionWC).toEqualEpsilon(position, 1e-9);
    expect(camera.transform).toEqual(transform);
    expect(camera.directionWC).toEqualEpsilon(
      new Cartesian3(0, Math.SQRT1_2, -Math.SQRT1_2),
      1e-10,
    );
    expect(camera.upWC).toEqualEpsilon(
      new Cartesian3(0, Math.SQRT1_2, Math.SQRT1_2),
      1e-10,
    );
    expect(camera.roll).toEqualEpsilon(0, 1e-10);
  });

  it("constructs perspective off-center pick rays from the actual near-plane bounds", function () {
    camera.frustum = new PerspectiveOffCenterFrustum({
      left: -1,
      right: 3,
      bottom: -1,
      top: 1,
      near: 1,
      far: 1000,
    });
    const result = new Ray();
    expect(camera.getPickRay(new Cartesian2(100, 50), result)).toBe(result);
    expect(result.origin).toEqualEpsilon(camera.positionWC, 1e-12);
    expect(result.direction).toEqualEpsilon(
      new Cartesian3(Math.SQRT1_2, 0, -Math.SQRT1_2),
      1e-12,
    );
  });

  it("retains the orthographic off-center pick-ray origin shift", function () {
    camera.frustum = new OrthographicOffCenterFrustum({
      left: -100,
      right: 300,
      bottom: -50,
      top: 50,
      near: 1,
      far: 1000,
    });
    const ray = camera.getPickRay(new Cartesian2(100, 50));
    expect(ray.origin).toEqualEpsilon(new Cartesian3(200, 200, 100), 1e-12);
    expect(ray.direction).toEqualEpsilon(new Cartesian3(0, 0, -1), 1e-12);
  });

  it("switches to a positive planar orthographic scale before any depth frame exists", function () {
    camera.switchToOrthographicFrustum();
    expect(camera.frustum.width).toEqualEpsilon(100, 1e-10);
    expect(function () {
      return camera.frustum.projectionMatrix;
    }).not.toThrow();
  });

  it("keeps orthographic width during translation and orbit, and zooms explicitly", function () {
    camera.frustum = new OrthographicFrustum({
      width: 200,
      aspectRatio: 2,
      near: 1,
      far: 1000,
    });
    camera.moveRight(20);
    expect(camera.frustum.width).toBe(200);
    camera.rotate(Cartesian3.UNIT_Z, 0.1);
    expect(camera.frustum.width).toBe(200);
    camera.zoomIn(20);
    expect(camera.frustum.width).toBe(180);
    camera.zoomOut(20);
    expect(camera.frustum.width).toBe(200);
  });

  it("raises changed for planar translation independently of ellipsoid height", function () {
    const listener = jasmine.createSpy("changed");
    camera.changed.addEventListener(listener);
    camera._updateCameraChanged();
    camera.moveRight(75);
    camera._updateCameraChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.calls.mostRecent()?.args[0]).toEqualEpsilon(0.75, 1e-12);
  });

  it("keeps Cartesian look, twist, bounds and reference-frame operations usable", function () {
    const target = new Cartesian3(500120, 3000230, 80);
    camera.lookAt(target, new HeadingPitchRange(0.6, -0.7, 100));
    expect(Matrix4.getTranslation(camera.transform, new Cartesian3())).toEqual(
      target,
    );
    expect(camera.heading).toEqualEpsilon(0.6, 1e-12);
    expect(camera.pitch).toEqualEpsilon(-0.7, 1e-12);
    camera.lookAtTransform(Matrix4.IDENTITY);
    const position = Cartesian3.clone(camera.positionWC);
    camera.lookRight(0.1);
    camera.twistLeft(0.2);
    expect(camera.positionWC).toEqual(position);
    expect(Cartesian3.dot(camera.directionWC, camera.upWC)).toEqualEpsilon(
      0,
      1e-12,
    );
    const bounds = new BoundingSphere(target, 10);
    camera.viewBoundingSphere(bounds, new HeadingPitchRange(0.3, -0.8, 100));
    expect(camera.distanceToBoundingSphere(bounds)).toEqualEpsilon(90, 1e-7);
    expect(camera.getPixelSize(bounds, 200, 100)).toBeGreaterThan(0);
  });

  it("keeps vertical and coincident world look targets finite and preserves the pose on invalid input", function () {
    camera.setView({
      destination: new Cartesian3(100, 200, 100),
      orientation: { heading: 0.7, pitch: -0.4, roll: 0.2 },
    });
    const direction = Cartesian3.clone(camera.directionWC);
    camera.lookAtWorldPosition(Cartesian3.clone(camera.positionWC));
    expect(camera.directionWC).toEqualEpsilon(direction, 1e-12);
    expect(camera.roll).toEqualEpsilon(0, 1e-12);
    for (const z of [0, 200]) {
      camera.lookAtWorldPosition(new Cartesian3(100, 200, z));
      expect(Math.abs(camera.directionWC.z)).toEqualEpsilon(1, 1e-12);
      expect(Cartesian3.dot(camera.directionWC, camera.upWC)).toEqualEpsilon(
        0,
        1e-12,
      );
      expect(Cartesian3.magnitude(camera.rightWC)).toEqualEpsilon(1, 1e-12);
    }
    const before = Matrix4.clone(camera.viewMatrix);
    expect(function () {
      camera.lookAtWorldPosition(new Cartesian3(NaN, 0, 0));
    }).toThrowDeveloperError();
    expect(camera.viewMatrix).toEqual(before);
  });

  it("keeps finite orthographic projection when looking horizontally or from below the surface", function () {
    camera.setView({
      destination: new Cartesian3(500000, 3000000, -100),
      orientation: { heading: 0, pitch: 0 },
    });
    camera.switchToOrthographicFrustum();
    expect(camera.frustum.width).toBe(100);
    camera.lookAtTransform(rotatedFrame(), new Cartesian3(0, -300, 400));
    expect(camera.frustum.width).toBe(500);
    camera.zoomIn(10000);
    expect(camera.frustum.width).toBe(camera.frustum.near);
    camera.switchToPerspectiveFrustum();
    expect(camera.frustum.fov).toBeGreaterThan(0);
  });

  it("scales off-center orthographic bounds together and emits changed for zoom without translation", function () {
    camera.frustum = new OrthographicOffCenterFrustum({
      left: -100,
      right: 300,
      bottom: -50,
      top: 50,
      near: 1,
      far: 1000,
    });
    const position = Cartesian3.clone(camera.positionWC);
    const listener = jasmine.createSpy("changed");
    camera.percentageChanged = 0.1;
    camera.changed.addEventListener(listener);
    camera._updateCameraChanged();
    camera.zoomIn(100);
    camera._updateCameraChanged();
    expect(camera.frustum.left).toBe(-75);
    expect(camera.frustum.right).toBe(225);
    expect(camera.frustum.bottom).toBe(-37.5);
    expect(camera.frustum.top).toBe(37.5);
    expect(camera.positionWC).toEqual(position);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.calls.mostRecent().args[0]).toBe(0.25);
    camera._updateCameraChanged();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("measures movement above resident terrain and below Z zero with a positive scale", function () {
    spyOn(world, "getTerrainHeight").and.returnValue(50);
    const listener = jasmine.createSpy("changed");
    camera.changed.addEventListener(listener);
    camera._updateCameraChanged();
    camera.moveRight(30);
    camera._updateCameraChanged();
    expect(listener.calls.mostRecent().args[0]).toEqualEpsilon(0.6, 1e-12);
    world.getTerrainHeight.and.returnValue(undefined);
    camera.setView({ destination: new Cartesian3(100, 200, -100) });
    camera._updateCameraChanged();
    listener.calls.reset();
    camera.moveRight(75);
    camera._updateCameraChanged();
    expect(listener.calls.mostRecent().args[0]).toEqualEpsilon(0.75, 1e-12);
  });

  it("uses the shifted perspective center and transformed axes when picking", function () {
    camera.setView({
      destination: new Cartesian3(500120, 3000230, 180),
      endTransform: rotatedFrame(),
    });
    camera.frustum.xOffset = 0.4;
    camera.frustum.yOffset = -0.2;
    const frustum = camera.frustum.offCenterFrustum;
    const ray = camera.getPickRay(new Cartesian2(100, 50));
    const expected = Cartesian3.normalize(
      new Cartesian3(
        ((frustum.left + frustum.right) * 0.5) / frustum.near,
        ((frustum.bottom + frustum.top) * 0.5) / frustum.near,
        -1,
      ),
      new Cartesian3(),
    );
    expect(ray.direction).toEqualEpsilon(expected, 1e-12);
    expect(ray.origin).toEqualEpsilon(camera.positionWC, 1e-9);
    scene.canvas.clientWidth = 0;
    expect(camera.getPickRay(new Cartesian2(0, 0))).toBeUndefined();
  });

  it("accepts the four planar frustum types at the frame update boundary", function () {
    const planarCamera = camera;
    for (const Type of [
      PerspectiveOffCenterFrustum,
      OrthographicOffCenterFrustum,
    ]) {
      camera.frustum = new Type({
        left: -1,
        right: 3,
        bottom: -1,
        top: 1,
        near: 1,
        far: 1000,
      });
      expect(function () {
        planarCamera.update(SceneMode.SCENE3D);
      }).not.toThrow();
    }
  });

  it("normalizes a negative roll to the same positive angular range as Cesium", function () {
    camera.setView({ orientation: { heading: 0.4, pitch: -0.5, roll: -0.3 } });
    expect(camera.roll).toEqualEpsilon(2 * Math.PI - 0.3, 1e-12);
    const up = Cartesian3.clone(camera.upWC);
    camera.flyTo({
      destination: new Cartesian3(200, 300, 200),
      orientation: {
        heading: camera.heading,
        pitch: camera.pitch,
        roll: camera.roll,
      },
      duration: 0,
    });
    expect(camera.upWC).toEqualEpsilon(up, 1e-12);
  });

  it("reads HPR near vertical without rejecting an orthonormal camera basis", function () {
    for (const pitch of [
      -Math.PI / 2 + 1.4855563729324827e-8,
      Math.PI / 2 - 1.4855563729324827e-8,
    ]) {
      camera.setView({ orientation: { heading: 0.7, pitch, roll: 0.2 } });
      expect(Cartesian3.dot(camera.direction, camera.up)).toEqualEpsilon(
        0,
        1e-15,
      );
      expect(camera.heading).toEqualEpsilon(0.7, 1e-12);
      expect(camera.pitch).toEqualEpsilon(pitch, 1e-15);
      expect(camera.roll).toEqualEpsilon(0.2, 1e-12);
    }
  });

  it("keeps near-vertical Cartesian lookAt and direction/up flight targets", function () {
    const offset = new Cartesian3(0, -100 * 1.4855563729324827e-8, 100);
    const direction = Cartesian3.normalize(
      Cartesian3.negate(offset, new Cartesian3()),
      new Cartesian3(),
    );
    camera.lookAt(new Cartesian3(100, 200, 0), offset);
    expect(camera.directionWC).toEqualEpsilon(direction, 1e-14);
    camera.lookAtTransform(Matrix4.IDENTITY);
    const up = new Cartesian3(0, 1, direction.y);
    camera.flyTo({
      destination: new Cartesian3(100, 200, 100),
      orientation: { direction, up },
      duration: 0,
    });
    expect(camera.directionWC).toEqualEpsilon(direction, 1e-14);
  });

  it("reads HPR and updates changed throughout the final frames of a Home flight", function () {
    const listener = jasmine.createSpy("changed");
    camera.changed.addEventListener(listener);
    camera.setView({ orientation: { heading: 0.4, pitch: -0.7, roll: 0.2 } });
    camera.flyHome(2);
    scene.tweens.update(0);
    for (const time of [0.5, 1, 1.5, 1.95, 1.96, 1.97, 1.98, 1.99, 2]) {
      scene.tweens.update(time);
      camera._updateCameraChanged();
      expect(Number.isFinite(camera.heading)).toBe(true);
      expect(Number.isFinite(camera.pitch)).toBe(true);
      expect(Number.isFinite(camera.roll)).toBe(true);
    }
    expect(camera._currentFlight).toBeUndefined();
    expect(camera.pitch).toEqualEpsilon(-Math.PI / 2, 1e-15);
  });
});

import {
  Cartesian2,
  Cartesian3,
  Matrix4,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
  PerspectiveOffCenterFrustum,
  Ray,
} from "../../../../index.js";
import SceneGISPlanarCamera from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarCamera.js";

describe("SceneGIS/Scene/SceneGISPlanarCamera", function () {
  const element = { clientWidth: 200, clientHeight: 100 };

  function createCamera(frustum) {
    return {
      frustum,
      positionWC: new Cartesian3(1000000000.0, -2000000000.0, 100.0),
      directionWC: new Cartesian3(0.0, 0.0, -1.0),
      rightWC: Cartesian3.UNIT_X,
      upWC: Cartesian3.UNIT_Y,
      inverseTransform: Matrix4.IDENTITY,
      position: new Cartesian3(),
      direction: new Cartesian3(),
      up: new Cartesian3(),
      right: new Cartesian3(),
    };
  }

  function createFrusta() {
    const perspective = new PerspectiveFrustum();
    perspective.fov = Math.PI / 3.0;
    perspective.aspectRatio = 2.0;
    perspective.near = 1.0;
    perspective.far = 1000.0;

    const perspectiveOffCenter = new PerspectiveOffCenterFrustum();
    perspectiveOffCenter.left = -1.0;
    perspectiveOffCenter.right = 3.0;
    perspectiveOffCenter.bottom = -1.0;
    perspectiveOffCenter.top = 1.0;
    perspectiveOffCenter.near = 1.0;
    perspectiveOffCenter.far = 1000.0;

    const orthographic = new OrthographicFrustum();
    orthographic.width = 200.0;
    orthographic.aspectRatio = 2.0;
    orthographic.near = 1.0;
    orthographic.far = 1000.0;

    const orthographicOffCenter = new OrthographicOffCenterFrustum();
    orthographicOffCenter.left = -100.0;
    orthographicOffCenter.right = 300.0;
    orthographicOffCenter.bottom = -50.0;
    orthographicOffCenter.top = 50.0;
    orthographicOffCenter.near = 1.0;
    orthographicOffCenter.far = 1000.0;
    return [
      perspective,
      perspectiveOffCenter,
      orthographic,
      orthographicOffCenter,
    ];
  }

  it("reuses an optional frustum classification result", function () {
    const result = {};
    for (const frustum of createFrusta()) {
      expect(SceneGISPlanarCamera.getFrustumInfo(frustum, result)).toBe(result);
      expect(Number.isFinite(result.horizontalSpan)).toBe(true);
      expect(Number.isFinite(result.verticalSpan)).toBe(true);
    }
  });

  it("classifies all four real frustum types before using effective bounds", function () {
    const types = createFrusta().map(
      (frustum) => SceneGISPlanarCamera.getFrustumInfo(frustum).type,
    );
    expect(types).toEqual([
      "perspective",
      "perspectiveOffCenter",
      "orthographic",
      "orthographicOffCenter",
    ]);
  });

  it("computes center and non-center rays for all four real frusta", function () {
    for (const frustum of createFrusta()) {
      const camera = createCamera(frustum);
      const center = SceneGISPlanarCamera.getWindowRay(
        camera,
        element,
        new Cartesian2(100, 50),
      );
      const corner = SceneGISPlanarCamera.getWindowRay(
        camera,
        element,
        new Cartesian2(0, 0),
      );
      expect(Number.isFinite(center.origin.x)).toBe(true);
      expect(center.direction.z).toBeLessThan(0.0);
      expect(Number.isFinite(corner.origin.x)).toBe(true);
      expect(Number.isFinite(corner.direction.x)).toBe(true);
    }
  });

  it("keeps direct perspective off-center rays perspective", function () {
    const camera = createCamera(createFrusta()[1]);
    const ray = SceneGISPlanarCamera.getWindowRay(
      camera,
      element,
      new Cartesian2(100, 50),
    );
    expect(ray.origin).toEqual(camera.positionWC);
    expect(ray.direction.x).toBeGreaterThan(0.0);
    expect(ray.direction.z).toBeLessThan(0.0);
  });

  it("uses finite slopes for huge and subnormal perspective near planes", function () {
    const fixtures = [
      {
        bound: 1.0e300,
        near: 1.5e306,
        far: 2.0e306,
      },
      {
        bound: Number.MIN_VALUE,
        near: Number.MIN_VALUE,
        far: 1000.0,
      },
    ];
    for (const fixture of fixtures) {
      const frustum = new PerspectiveOffCenterFrustum();
      frustum.left = -fixture.bound;
      frustum.right = fixture.bound;
      frustum.bottom = -fixture.bound;
      frustum.top = fixture.bound;
      frustum.near = fixture.near;
      frustum.far = fixture.far;
      const info = SceneGISPlanarCamera.getFrustumInfo(frustum);
      expect(info.horizontalSlopeSpan).toBeGreaterThan(0.0);
      expect(info.verticalSlopeSpan).toBeGreaterThan(0.0);

      const camera = createCamera(frustum);
      for (const position of [
        new Cartesian2(100, 50),
        new Cartesian2(0, 0),
        new Cartesian2(200, 100),
      ]) {
        const ray = SceneGISPlanarCamera.getWindowRay(
          camera,
          element,
          position,
        );
        expect(Number.isFinite(ray.direction.x)).toBe(true);
        expect(Number.isFinite(ray.direction.y)).toBe(true);
        expect(Number.isFinite(ray.direction.z)).toBe(true);
        expect(
          Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z),
        ).toEqualEpsilon(1.0, 1e-15);
      }
    }
  });

  it("returns undefined for zero canvas and validates unsupported frusta", function () {
    const camera = createCamera(createFrusta()[0]);
    expect(
      SceneGISPlanarCamera.getWindowRay(
        camera,
        { clientWidth: 0, clientHeight: 100 },
        Cartesian2.ZERO,
      ),
    ).toBeUndefined();
    camera.frustum = {};
    expect(() =>
      SceneGISPlanarCamera.getWindowRay(camera, element, Cartesian2.ZERO),
    ).toThrowDeveloperError();
  });

  it("intersects the infinite plane without an epsilon direction cutoff", function () {
    const result = new Cartesian3();
    const ray = {
      origin: new Cartesian3(2.0, 3.0, 1.0e-300),
      direction: new Cartesian3(0.0, 0.0, -1.0e-300),
    };
    expect(SceneGISPlanarCamera.intersectPlane(ray, result)).toBe(result);
    expect(result).toEqual(new Cartesian3(2.0, 3.0, 0.0));
    expect(
      SceneGISPlanarCamera.intersectPlane(
        new Ray(Cartesian3.UNIT_Z, Cartesian3.UNIT_X),
      ),
    ).toBeUndefined();
  });

  it("preserves nadir heading and detects roll from world axes", function () {
    const camera = createCamera(createFrusta()[0]);
    camera.upWC = Cartesian3.UNIT_X;
    camera.rightWC = Cartesian3.negate(Cartesian3.UNIT_Y, new Cartesian3());
    let pose = SceneGISPlanarCamera.getHeadingPitch(camera);
    expect(pose.heading).toEqualEpsilon(Math.PI / 2.0, 1e-14);
    expect(pose.pitch).toBe(-Math.PI / 2.0);
    expect(pose.roll).toBe(0.0);

    const heading = 0.4;
    const pitch = -0.7;
    const direction = new Cartesian3();
    const up = new Cartesian3();
    const right = new Cartesian3();
    SceneGISPlanarCamera.getAxes(heading, pitch, direction, up, right);
    camera.directionWC = direction;
    camera.upWC = Cartesian3.add(
      Cartesian3.multiplyByScalar(up, Math.cos(0.2), new Cartesian3()),
      Cartesian3.multiplyByScalar(right, Math.sin(0.2), new Cartesian3()),
      new Cartesian3(),
    );
    camera.rightWC = Cartesian3.cross(
      camera.directionWC,
      camera.upWC,
      new Cartesian3(),
    );
    pose = SceneGISPlanarCamera.getHeadingPitch(camera);
    expect(pose.heading).toEqualEpsilon(heading, 1e-14);
    expect(pose.pitch).toEqualEpsilon(pitch, 1e-14);
    expect(Math.abs(pose.roll)).toEqualEpsilon(0.2, 1e-14);
  });

  it("rejects non-representable derived geometry for every frustum family", function () {
    const perspective = new PerspectiveFrustum();
    perspective.fov = Math.PI / 2.0;
    perspective.aspectRatio = 4.0;
    perspective.near = Number.MAX_VALUE * 0.75;
    perspective.far = Number.MAX_VALUE;

    const perspectiveOffCenter = new PerspectiveOffCenterFrustum();
    perspectiveOffCenter.left = -Number.MAX_VALUE;
    perspectiveOffCenter.right = Number.MAX_VALUE;
    perspectiveOffCenter.bottom = -1.0;
    perspectiveOffCenter.top = 1.0;
    perspectiveOffCenter.near = 1.0;
    perspectiveOffCenter.far = Number.MAX_VALUE;

    const orthographic = new OrthographicFrustum();
    orthographic.width = Number.MAX_VALUE;
    orthographic.aspectRatio = 0.5;
    orthographic.near = 1.0;
    orthographic.far = Number.MAX_VALUE;

    const orthographicOffCenter = new OrthographicOffCenterFrustum();
    orthographicOffCenter.left = -Number.MAX_VALUE;
    orthographicOffCenter.right = Number.MAX_VALUE;
    orthographicOffCenter.bottom = -1.0;
    orthographicOffCenter.top = 1.0;
    orthographicOffCenter.near = 1.0;
    orthographicOffCenter.far = Number.MAX_VALUE;

    for (const frustum of [
      perspective,
      perspectiveOffCenter,
      orthographic,
      orthographicOffCenter,
    ]) {
      const camera = createCamera(frustum);
      expect(() =>
        SceneGISPlanarCamera.getFrustumInfo(frustum),
      ).toThrowDeveloperError();
      expect(() =>
        SceneGISPlanarCamera.getWindowRay(
          camera,
          element,
          new Cartesian2(100, 50),
        ),
      ).toThrowDeveloperError();
    }
  });
});

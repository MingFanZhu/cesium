import {
  Cartesian3,
  Ellipsoid,
  Globe,
  Math as CesiumMath,
  OrthographicFrustum,
  PerspectiveFrustum,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarWorld,
} from "../../../../index.js";
import createScene from "../../../../../../Specs/createScene.js";
import SceneGISAtmosphereReferenceFrame from "../../../../Source/SceneGIS/Scene/_private/_SceneGISAtmosphereReferenceFrame.js";

describe("SceneGIS/Scene/_private/SceneGISAtmosphereReferenceFrame", function () {
  let scene;

  function createPlanarWorld() {
    return new SceneGISPlanarWorld({
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
  }

  function createStorage() {
    return SceneGISAtmosphereReferenceFrame.createSnapshot();
  }

  afterEach(function () {
    if (scene && !scene.isDestroyed()) {
      scene.destroyForSpecs();
    }
  });

  it("publishes finite Globe radial state for perspective and camera moves", function () {
    scene = createScene({ ellipsoid: Ellipsoid.WGS84 });
    scene.globe = new Globe(Ellipsoid.WGS84);
    const result = createStorage();
    const scratch = createStorage();
    const destination = Cartesian3.fromDegrees(0.0, 0.0, 1000.0);
    scene.camera.setView({ destination });

    expect(
      SceneGISAtmosphereReferenceFrame.publish(
        {
          mode: SceneGISAtmosphereReferenceFrame.GLOBE,
          scene,
        },
        result,
        scratch,
      ),
    ).toBe(result);
    expect(result.mode).toBe("globe");
    expect(result.projection).toBe("perspective");
    expect(result.altitude).toEqualEpsilon(1000.0, 1.0e-6);
    expect(result.vertical).toEqualEpsilon(Cartesian3.UNIT_X, 1.0e-12);
    expect(result.ellipsoidRadii).toEqual(Ellipsoid.WGS84.radii);

    const firstPosition = Cartesian3.clone(result.cameraPosition);
    scene.camera.setView({
      destination: Cartesian3.fromDegrees(45.0, 30.0, 1000000.0),
    });
    SceneGISAtmosphereReferenceFrame.publish(
      {
        mode: SceneGISAtmosphereReferenceFrame.GLOBE,
        scene,
      },
      result,
      scratch,
    );
    expect(result.cameraPosition).not.toEqual(firstPosition);
    expect(result.altitude).toEqualEpsilon(1000000.0, 1.0e-5);

    scene.camera.frustum = new OrthographicFrustum({
      width: 1000000.0,
      aspectRatio: 1.0,
    });
    SceneGISAtmosphereReferenceFrame.publish(
      {
        mode: SceneGISAtmosphereReferenceFrame.GLOBE,
        scene,
      },
      result,
      scratch,
    );
    expect(result.projection).toBe("orthographic");
  });

  it("publishes planar fixed axes and explicit base height for orthographic", function () {
    scene = createScene({ scene3DOnly: true });
    const world = createPlanarWorld();
    scene._initializeWorld(world);
    scene.camera.frustum = new OrthographicFrustum({
      width: 500.0,
      aspectRatio: 1.0,
    });
    scene.camera.setView({
      destination: new Cartesian3(25.0, -40.0, 120.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });
    const result = createStorage();
    const scratch = createStorage();

    SceneGISAtmosphereReferenceFrame.publish(
      {
        mode: SceneGISAtmosphereReferenceFrame.PLANAR,
        scene,
        world,
        baseHeight: 20.0,
      },
      result,
      scratch,
    );

    expect(result.mode).toBe("planar");
    expect(result.projection).toBe("orthographic");
    expect(result.altitude).toBe(100.0);
    expect(result.baseHeight).toBe(20.0);
    expect(result.surfacePosition).toEqual(new Cartesian3(25.0, -40.0, 20.0));
    expect(result.east).toEqual(Cartesian3.UNIT_X);
    expect(result.north).toEqual(Cartesian3.UNIT_Y);
    expect(result.vertical).toEqual(Cartesian3.UNIT_Z);
    expect(result.ellipsoidRadii).toEqual(Cartesian3.ZERO);

    scene.camera.frustum = new PerspectiveFrustum({
      fov: CesiumMath.PI_OVER_THREE,
      aspectRatio: 1.0,
    });
    const ellipsoid = scene._ellipsoid;
    scene._ellipsoid = new Proxy(
      {},
      {
        get: function () {
          throw new Error("Planar publication read the Scene ellipsoid.");
        },
      },
    );
    try {
      SceneGISAtmosphereReferenceFrame.publish(
        {
          mode: SceneGISAtmosphereReferenceFrame.PLANAR,
          scene,
          world,
          baseHeight: 20.0,
        },
        result,
        scratch,
      );
    } finally {
      scene._ellipsoid = ellipsoid;
    }
    expect(result.projection).toBe("perspective");
    expect(result.altitude).toBe(100.0);
  });

  it("keeps the last good result when planar publication fails", function () {
    scene = createScene({ scene3DOnly: true });
    const world = createPlanarWorld();
    scene._initializeWorld(world);
    scene.camera.setView({
      destination: new Cartesian3(10.0, 20.0, 30.0),
      orientation: {
        direction: new Cartesian3(0.0, 0.0, -1.0),
        up: Cartesian3.UNIT_Y,
      },
    });
    const result = createStorage();
    const scratch = createStorage();
    SceneGISAtmosphereReferenceFrame.publish(
      {
        mode: SceneGISAtmosphereReferenceFrame.PLANAR,
        scene,
        world,
        baseHeight: 5.0,
      },
      result,
      scratch,
    );
    const stablePosition = Cartesian3.clone(result.cameraPosition);
    const stableAltitude = result.altitude;

    expect(function () {
      SceneGISAtmosphereReferenceFrame.publish(
        {
          mode: SceneGISAtmosphereReferenceFrame.PLANAR,
          scene,
          world,
          baseHeight: Number.NaN,
        },
        result,
        scratch,
      );
    }).toThrowDeveloperError();
    expect(result.cameraPosition).toEqual(stablePosition);
    expect(result.altitude).toBe(stableAltitude);
  });

  it("rejects inferred or crossed world modes before result mutation", function () {
    scene = createScene({ scene3DOnly: true });
    const world = createPlanarWorld();
    scene._initializeWorld(world);
    const result = createStorage();
    const scratch = createStorage();

    expect(function () {
      SceneGISAtmosphereReferenceFrame.publish(
        { mode: "automatic", scene, world, baseHeight: 0.0 },
        result,
        scratch,
      );
    }).toThrowDeveloperError();
    expect(function () {
      SceneGISAtmosphereReferenceFrame.publish(
        { mode: SceneGISAtmosphereReferenceFrame.GLOBE, scene },
        result,
        scratch,
      );
    }).toThrowDeveloperError();
    expect(result.mode).toBeUndefined();
  });
});

import {
  Cartesian2,
  Cartesian3,
  Color,
  Event,
  OrthographicFrustum,
  OrthographicOffCenterFrustum,
  PerspectiveFrustum,
  PerspectiveOffCenterFrustum,
  Ray,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISPlanarWorld,
  SceneMode,
} from "../../../index.js";

describe("SceneGIS/Scene/SceneGISPlanarWorld", function () {
  function createCoordinateSystem(minimum = -128.0, maximum = 128.0) {
    return new SceneGISPlanarCoordinateSystem({
      extent: new SceneGISPlanarExtent({
        minimumX: minimum,
        minimumY: minimum,
        maximumX: maximum,
        maximumY: maximum,
      }),
    });
  }

  function createWorld(options = {}) {
    return new SceneGISPlanarWorld({
      coordinateSystem: options.coordinateSystem ?? createCoordinateSystem(),
      maximumLevel: options.maximumLevel ?? 4,
      maximumScreenSpaceError: options.maximumScreenSpaceError,
      tileCacheSize: options.tileCacheSize,
      baseColor: options.baseColor,
    });
  }

  function createTerrainProvider(world, options = {}) {
    return {
      tilingScheme: options.tilingScheme ?? world.tilingScheme,
      minimumHeight: options.minimumHeight ?? -10.0,
      maximumHeight: options.maximumHeight ?? 40.0,
      maximumLevel: options.maximumLevel ?? world.maximumLevel,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: (level) => 4.0 / 2 ** level,
      requestTileGeometry: () => undefined,
      getTileDataAvailable: () => undefined,
      loadTileDataAvailability: () => undefined,
      destroy: jasmine.createSpy("destroyProvider"),
    };
  }

  it("constructs the canonical tiling scheme and defaults", function () {
    const coordinateSystem = createCoordinateSystem();
    const world = createWorld({ coordinateSystem });

    expect(world.coordinateSystem).toBe(coordinateSystem);
    expect(world.tilingScheme).toBeInstanceOf(SceneGISPlanarTilingScheme);
    expect(world.tilingScheme.coordinateSystem).toBe(coordinateSystem);
    expect(world.maximumLevel).toBe(4);
    expect(world.maximumScreenSpaceError).toBe(2.0);
    expect(world.tileCacheSize).toBe(100);
    expect(world.baseColor).toEqual(Color.GRAY);
    expect(world.show).toBe(true);
    expect(world.tilesLoaded).toBe(true);
    expect(world.imageryLayers.tilingScheme).toBe(world.tilingScheme);
    expect(world.terrainProvider).toBeUndefined();
    world.destroy();
  });

  it("atomically attaches, replaces, and detaches caller-owned terrain providers", function () {
    const world = createWorld();
    const first = createTerrainProvider(world);
    const second = createTerrainProvider(world);
    world.terrainProvider = first;
    expect(world.terrainProvider).toBe(first);
    const runtime = world._surface._terrain;
    world.terrainProvider = first;
    expect(world._surface._terrain).toBe(runtime);

    const invalid = createTerrainProvider(world, { tilingScheme: {} });
    expect(() => {
      world.terrainProvider = invalid;
    }).toThrowDeveloperError();
    expect(world.terrainProvider).toBe(first);
    expect(world._surface._terrain.provider).toBe(first);

    world.terrainProvider = second;
    expect(world.terrainProvider).toBe(second);
    world.terrainProvider = undefined;
    expect(world.terrainProvider).toBeUndefined();
    expect(world._surface._terrain).toBeUndefined();
    expect(world.tilesLoaded).toBe(true);
    world.destroy();
    expect(first.destroy).not.toHaveBeenCalled();
    expect(second.destroy).not.toHaveBeenCalled();
  });

  it("accepts a provider below the world maximum level without clamping world LOD", function () {
    const world = createWorld();
    const provider = createTerrainProvider(world, { maximumLevel: 0 });
    const errorSpy = spyOn(
      provider,
      "getLevelMaximumGeometricError",
    ).and.returnValue(4.0);

    world.terrainProvider = provider;
    expect(world.maximumLevel).toBe(4);
    expect(world.terrainProvider).toBe(provider);
    expect(errorSpy).toHaveBeenCalledOnceWith(0);
    expect(world._surface._terrain.geometricErrors).toEqual([
      4.0, 4.0, 4.0, 4.0, 4.0,
    ]);
    world.destroy();
  });

  it("keeps identity properties getter-only", function () {
    const world = createWorld();
    for (const property of [
      "coordinateSystem",
      "tilingScheme",
      "maximumLevel",
      "tilesLoaded",
      "imageryLayers",
    ]) {
      expect(
        Object.getOwnPropertyDescriptor(SceneGISPlanarWorld.prototype, property)
          .set,
      ).toBeUndefined();
    }
    world.destroy();
  });

  it("owns its imagery layer collection", function () {
    const world = createWorld();
    expect(function () {
      world.imageryLayers.destroy();
    }).toThrowDeveloperError();
    expect(world.imageryLayers.isDestroyed()).toBe(false);
    const collection = world.imageryLayers;
    world.destroy();
    expect(collection.isDestroyed()).toBe(true);
  });

  it("owns baseColor values on construction, get, and set", function () {
    const input = Color.clone(Color.RED);
    const world = createWorld({ baseColor: input });
    input.green = 1.0;
    expect(world.baseColor).toEqual(Color.RED);

    const result = world.baseColor;
    result.alpha = 0.0;
    expect(world.baseColor.alpha).toBe(1.0);

    const replacement = Color.clone(Color.BLUE);
    world.baseColor = replacement;
    replacement.red = 1.0;
    expect(world.baseColor).toEqual(Color.BLUE);
    world.destroy();
  });

  it("validates required constructor values and mutable properties", function () {
    expect(() => new SceneGISPlanarWorld()).toThrowDeveloperError();
    expect(
      () => new SceneGISPlanarWorld({ coordinateSystem: {}, maximumLevel: 0 }),
    ).toThrowDeveloperError();

    const coordinateSystem = createCoordinateSystem();
    const maximumSafeLevel = new SceneGISPlanarTilingScheme({
      coordinateSystem,
    }).maximumSafeLevel;
    for (const maximumLevel of [undefined, -1, 1.5, maximumSafeLevel + 1]) {
      expect(
        () => new SceneGISPlanarWorld({ coordinateSystem, maximumLevel }),
      ).toThrowDeveloperError();
    }

    const world = createWorld();
    for (const value of [0.0, -1.0, Infinity, Number.NaN]) {
      expect(() => {
        world.maximumScreenSpaceError = value;
      }).toThrowDeveloperError();
    }
    for (const value of [-1, 0.5, Infinity]) {
      expect(() => {
        world.tileCacheSize = value;
      }).toThrowDeveloperError();
    }
    for (const value of [undefined, {}, new Color(1, 0, 0, 0.5)]) {
      expect(() => {
        world.baseColor = value;
      }).toThrowDeveloperError();
    }
    expect(() => {
      world.show = 1;
    }).toThrowDeveloperError();
    world.destroy();
  });

  it("rejects tile scales outside positive finite Float32", function () {
    for (const size of [1.0e-50, 1.0e40]) {
      const coordinateSystem = createCoordinateSystem(0.0, size);
      expect(
        () => new SceneGISPlanarWorld({ coordinateSystem, maximumLevel: 0 }),
      ).toThrowDeveloperError();
    }
  });

  it("supports only SCENE3D even while hidden", function () {
    const world = createWorld();
    world.show = false;
    expect(() =>
      world.update({ mode: SceneMode.SCENE2D }),
    ).toThrowDeveloperError(
      "SceneGISPlanarWorld only supports SceneMode.SCENE3D.",
    );
    expect(() => world.update({ mode: SceneMode.SCENE3D })).not.toThrow();
    world.destroy();
  });

  it("is safe to destroy before the first frame", function () {
    const world = createWorld();
    expect(world.isDestroyed()).toBe(false);
    world.destroy();
    expect(world.isDestroyed()).toBe(true);
  });

  it("picks the bounded mathematical surface inclusively", function () {
    const world = createWorld();
    const result = new Cartesian3();
    expect(
      world.pick(
        new Ray(new Cartesian3(0.0, 0.0, 10.0), new Cartesian3(0, 0, -1)),
        result,
      ),
    ).toBe(result);
    expect(result).toEqual(new Cartesian3(0.0, 0.0, 0.0));
    for (const x of [-128.0, 0.0, 128.0]) {
      for (const y of [-128.0, 0.0, 128.0]) {
        expect(
          world.pick(
            new Ray(new Cartesian3(x, y, 1.0), new Cartesian3(0, 0, -1)),
          ),
        ).toEqual(new Cartesian3(x, y, 0.0));
      }
    }
    for (const [x, y] of [
      [-128.0000000001, 0.0],
      [128.0000000001, 0.0],
      [0.0, -128.0000000001],
      [0.0, 128.0000000001],
    ]) {
      expect(
        world.pick(
          new Ray(new Cartesian3(x, y, 1.0), new Cartesian3(0, 0, -1)),
        ),
      ).toBeUndefined();
    }
    world.destroy();
  });

  it("handles both ray sides, scaled directions, and plane misses", function () {
    const world = createWorld();
    expect(
      world.pick(
        new Ray(new Cartesian3(5.0, 6.0, -2.0), new Cartesian3(0, 0, 4)),
      ),
    ).toEqual(new Cartesian3(5.0, 6.0, 0.0));
    expect(
      world.pick(new Ray(new Cartesian3(0, 0, 1), new Cartesian3(0, 0, 2))),
    ).toBeUndefined();
    expect(
      world.pick(new Ray(new Cartesian3(0, 0, 1), Cartesian3.UNIT_X)),
    ).toBeUndefined();
    expect(
      world.pick(new Ray(new Cartesian3(0, 0, 0), Cartesian3.UNIT_X)),
    ).toBeUndefined();
    world.destroy();
  });

  it("validates rays and destroyed use", function () {
    const world = createWorld();
    for (const ray of [
      undefined,
      {},
      { origin: Cartesian3.ZERO, direction: Cartesian3.ZERO },
      {
        origin: new Cartesian3(Number.NaN, 0, 0),
        direction: Cartesian3.UNIT_Z,
      },
    ]) {
      expect(() => world.pick(ray)).toThrowDeveloperError();
    }
    world.destroy();
    expect(() =>
      world.pick(new Ray(Cartesian3.UNIT_Z, new Cartesian3(0, 0, -1))),
    ).toThrowDeveloperError();
  });

  it("preserves near-zero and large-offset intersections and rejects overflow", function () {
    const world = createWorld();
    const nearZero = Number.MIN_VALUE;
    expect(
      world.pick({
        origin: new Cartesian3(nearZero, -nearZero, 1.0e-300),
        direction: new Cartesian3(0.0, 0.0, -1.0e-300),
      }),
    ).toEqual(new Cartesian3(nearZero, -nearZero, 0.0));
    expect(
      world.pick({
        origin: new Cartesian3(0.0, 0.0, Number.MAX_VALUE),
        direction: new Cartesian3(0.0, 0.0, -Number.MIN_VALUE),
      }),
    ).toBeUndefined();
    world.destroy();

    const minimum = 1.0e9;
    const offsetWorld = createWorld({
      coordinateSystem: createCoordinateSystem(minimum, minimum + 256.0),
    });
    expect(
      offsetWorld.pick(
        new Ray(
          new Cartesian3(minimum + 64.0, minimum + 192.0, 10.0),
          new Cartesian3(0.0, 0.0, -2.0),
        ),
      ),
    ).toEqual(new Cartesian3(minimum + 64.0, minimum + 192.0, 0.0));
    offsetWorld.destroy();
  });

  it("picks from a perspective window without rendering", function () {
    const world = createWorld();
    const frustum = new PerspectiveFrustum();
    frustum.fov = Math.PI / 3.0;
    frustum.aspectRatio = 2.0;
    frustum.near = 1.0;
    frustum.far = 1000.0;
    const scene = {
      world,
      mode: SceneMode.SCENE3D,
      camera: {
        frustum,
        positionWC: new Cartesian3(0, 0, 10),
        directionWC: new Cartesian3(0, 0, -1),
        rightWC: Cartesian3.UNIT_X,
        upWC: Cartesian3.UNIT_Y,
      },
      canvas: { clientWidth: 200, clientHeight: 100 },
      isDestroyed: function () {
        return false;
      },
    };
    const result = new Cartesian3();
    expect(
      world.pickFromWindowPosition(new Cartesian2(100, 50), scene, result),
    ).toBe(result);
    expect(result).toEqual(Cartesian3.ZERO);
    scene.canvas.clientWidth = 0;
    expect(
      world.pickFromWindowPosition(new Cartesian2(0, 0), scene),
    ).toBeUndefined();
    world.destroy();
  });

  it("uses every supported window frustum and validates scene state", function () {
    const world = createWorld();
    const perspective = new PerspectiveFrustum({
      fov: Math.PI / 3.0,
      aspectRatio: 2.0,
      near: 1.0,
      far: 1000.0,
    });
    const perspectiveOffCenter = new PerspectiveOffCenterFrustum();
    perspectiveOffCenter.left = -1.0;
    perspectiveOffCenter.right = 2.0;
    perspectiveOffCenter.bottom = -0.5;
    perspectiveOffCenter.top = 1.0;
    perspectiveOffCenter.near = 1.0;
    perspectiveOffCenter.far = 1000.0;
    const orthographic = new OrthographicFrustum({
      width: 100.0,
      aspectRatio: 2.0,
      near: 1.0,
      far: 1000.0,
    });
    const orthographicOffCenter = new OrthographicOffCenterFrustum();
    orthographicOffCenter.left = -50.0;
    orthographicOffCenter.right = 100.0;
    orthographicOffCenter.bottom = -25.0;
    orthographicOffCenter.top = 50.0;
    orthographicOffCenter.near = 1.0;
    orthographicOffCenter.far = 1000.0;
    const scene = {
      world,
      mode: SceneMode.SCENE3D,
      camera: {
        frustum: perspective,
        positionWC: new Cartesian3(0.0, 0.0, 10.0),
        directionWC: new Cartesian3(0.0, 0.0, -1.0),
        rightWC: Cartesian3.UNIT_X,
        upWC: Cartesian3.UNIT_Y,
      },
      canvas: { clientWidth: 200, clientHeight: 100 },
      isDestroyed: function () {
        return false;
      },
    };

    for (const frustum of [
      perspective,
      perspectiveOffCenter,
      orthographic,
      orthographicOffCenter,
    ]) {
      scene.camera.frustum = frustum;
      expect(
        world.pickFromWindowPosition(new Cartesian2(100.0, 50.0), scene),
      ).toBeDefined();
      expect(
        world.pickFromWindowPosition(new Cartesian2(25.0, 25.0), scene),
      ).toBeDefined();
    }

    expect(
      world.pickFromWindowPosition(new Cartesian2(-10000.0, -10000.0), scene),
    ).toBeUndefined();
    const otherWorld = createWorld();
    scene.world = otherWorld;
    expect(() =>
      world.pickFromWindowPosition(Cartesian2.ZERO, scene),
    ).toThrowDeveloperError();
    scene.world = world;
    scene.mode = SceneMode.SCENE2D;
    expect(() =>
      world.pickFromWindowPosition(Cartesian2.ZERO, scene),
    ).toThrowDeveloperError();
    scene.mode = SceneMode.SCENE3D;
    scene.camera.frustum = {};
    expect(() =>
      world.pickFromWindowPosition(Cartesian2.ZERO, scene),
    ).toThrowDeveloperError();
    expect(() =>
      world.pickFromWindowPosition(new Cartesian2(Number.NaN, 0.0), scene),
    ).toThrowDeveloperError();

    otherWorld.destroy();
    world.destroy();
  });
});

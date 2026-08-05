import {
  Color,
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
    world.destroy();
  });

  it("keeps identity properties getter-only", function () {
    const world = createWorld();
    for (const property of [
      "coordinateSystem",
      "tilingScheme",
      "maximumLevel",
      "tilesLoaded",
    ]) {
      expect(
        Object.getOwnPropertyDescriptor(SceneGISPlanarWorld.prototype, property)
          .set,
      ).toBeUndefined();
    }
    world.destroy();
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
});

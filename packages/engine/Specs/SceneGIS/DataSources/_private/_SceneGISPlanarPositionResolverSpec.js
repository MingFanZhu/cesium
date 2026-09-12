import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import HeightReference from "../../../../Source/Scene/HeightReference.js";
import SceneGISPlanarCoordinateSystem from "../../../../Source/SceneGIS/Core/SceneGISPlanarCoordinateSystem.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarPositionResolver from "../../../../Source/SceneGIS/DataSources/_private/_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarWorld from "../../../../Source/SceneGIS/Scene/SceneGISPlanarWorld.js";

describe("SceneGIS/DataSources/SceneGISPlanarPositionResolver", function () {
  let worlds;

  function createWorld() {
    const world = new SceneGISPlanarWorld({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -10.0,
          minimumY: -10.0,
          maximumX: 10.0,
          maximumY: 10.0,
        }),
      }),
      maximumLevel: 2,
    });
    worlds.push(world);
    return world;
  }

  beforeEach(function () {
    worlds = [];
  });

  afterEach(function () {
    for (const world of worlds) {
      if (!world.isDestroyed()) {
        world.destroy();
      }
    }
  });

  it("preserves absolute positions without reading terrain", function () {
    const world = createWorld();
    world.getTerrainHeight = jasmine.createSpy("getTerrainHeight");
    const position = new Cartesian3(2.0, -3.0, 14.0);

    const resolved = SceneGISPlanarPositionResolver.resolve(
      world,
      position,
      HeightReference.NONE,
    );

    expect(resolved).not.toBe(position);
    expect(resolved).toEqual(position);
    expect(world.getTerrainHeight).not.toHaveBeenCalled();
  });

  it("clamps to a resident terrain height with one query", function () {
    const world = createWorld();
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(37.5);
    const position = new Cartesian3(1.0, 2.0, 9.0);

    expect(
      SceneGISPlanarPositionResolver.resolve(
        world,
        position,
        HeightReference.CLAMP_TO_GROUND,
      ),
    ).toEqual(new Cartesian3(1.0, 2.0, 37.5));
    expect(world.getTerrainHeight).toHaveBeenCalledOnceWith(position);
  });

  it("uses the reference plane when clamped terrain is unavailable", function () {
    const world = createWorld();
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(undefined);

    expect(
      SceneGISPlanarPositionResolver.resolve(
        world,
        new Cartesian3(1.0, 2.0, 9.0),
        HeightReference.CLAMP_TO_GROUND,
      ),
    ).toEqual(new Cartesian3(1.0, 2.0, 0.0));
  });

  it("adds relative height to resident terrain or the reference plane", function () {
    const world = createWorld();
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValues(-4.0, undefined);
    const position = new Cartesian3(-2.0, 3.0, 6.0);

    expect(
      SceneGISPlanarPositionResolver.resolve(
        world,
        position,
        HeightReference.RELATIVE_TO_GROUND,
      ),
    ).toEqual(new Cartesian3(-2.0, 3.0, 2.0));
    expect(
      SceneGISPlanarPositionResolver.resolve(
        world,
        position,
        HeightReference.RELATIVE_TO_GROUND,
      ),
    ).toEqual(position);
    expect(world.getTerrainHeight).toHaveBeenCalledTimes(2);
  });

  it("accepts every inclusive outer boundary", function () {
    const world = createWorld();
    const positions = [
      new Cartesian3(-10.0, 0.0, 1.0),
      new Cartesian3(10.0, 0.0, 2.0),
      new Cartesian3(0.0, -10.0, 3.0),
      new Cartesian3(0.0, 10.0, 4.0),
    ];

    for (const position of positions) {
      expect(
        SceneGISPlanarPositionResolver.resolve(
          world,
          position,
          HeightReference.NONE,
        ),
      ).toEqual(position);
    }
  });

  it("returns undefined outside the extent without reading terrain", function () {
    const world = createWorld();
    world.getTerrainHeight = jasmine.createSpy("getTerrainHeight");

    expect(
      SceneGISPlanarPositionResolver.resolve(
        world,
        new Cartesian3(10.0001, 0.0, 5.0),
        HeightReference.CLAMP_TO_GROUND,
      ),
    ).toBeUndefined();
    expect(world.getTerrainHeight).not.toHaveBeenCalled();
  });

  it("rejects invalid worlds and positions", function () {
    const world = createWorld();
    const invalidPositions = [
      {},
      new Cartesian3(Number.NaN, 0.0, 0.0),
      new Cartesian3(0.0, Number.POSITIVE_INFINITY, 0.0),
      new Cartesian3(0.0, 0.0, Number.NEGATIVE_INFINITY),
    ];

    expect(function () {
      SceneGISPlanarPositionResolver.resolve(
        {},
        new Cartesian3(),
        HeightReference.NONE,
      );
    }).toThrowDeveloperError();
    for (const position of invalidPositions) {
      expect(function () {
        SceneGISPlanarPositionResolver.resolve(
          world,
          position,
          HeightReference.NONE,
        );
      }).toThrowDeveloperError();
    }

    world.destroy();
    expect(function () {
      SceneGISPlanarPositionResolver.resolve(
        world,
        new Cartesian3(),
        HeightReference.NONE,
      );
    }).toThrowDeveloperError();
  });

  it("rejects unsupported height references", function () {
    const world = createWorld();
    const unsupported = [
      HeightReference.CLAMP_TO_TERRAIN,
      HeightReference.RELATIVE_TO_TERRAIN,
      HeightReference.CLAMP_TO_3D_TILE,
      HeightReference.RELATIVE_TO_3D_TILE,
      999,
    ];

    for (const heightReference of unsupported) {
      expect(function () {
        SceneGISPlanarPositionResolver.resolve(
          world,
          new Cartesian3(),
          heightReference,
        );
      }).toThrowDeveloperError();
    }
  });

  it("supports result reuse and aliasing the input", function () {
    const world = createWorld();
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(20.0);
    const position = new Cartesian3(1.0, 2.0, 3.0);
    const result = new Cartesian3();

    expect(
      SceneGISPlanarPositionResolver.resolve(
        world,
        position,
        HeightReference.RELATIVE_TO_GROUND,
        result,
      ),
    ).toBe(result);
    expect(result).toEqual(new Cartesian3(1.0, 2.0, 23.0));
    expect(position).toEqual(new Cartesian3(1.0, 2.0, 3.0));

    expect(
      SceneGISPlanarPositionResolver.resolve(
        world,
        position,
        HeightReference.CLAMP_TO_GROUND,
        position,
      ),
    ).toBe(position);
    expect(position).toEqual(new Cartesian3(1.0, 2.0, 20.0));
  });

  it("fails atomically when a relative height overflows", function () {
    const world = createWorld();
    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(Number.MAX_VALUE);
    const position = new Cartesian3(1.0, 2.0, Number.MAX_VALUE);
    const result = new Cartesian3(7.0, 8.0, 9.0);

    expect(function () {
      SceneGISPlanarPositionResolver.resolve(
        world,
        position,
        HeightReference.RELATIVE_TO_GROUND,
        result,
      );
    }).toThrowDeveloperError();
    expect(position).toEqual(new Cartesian3(1.0, 2.0, Number.MAX_VALUE));
    expect(result).toEqual(new Cartesian3(7.0, 8.0, 9.0));
  });

  it("rejects invalid result and non-finite terrain atomically", function () {
    const world = createWorld();
    const position = new Cartesian3(1.0, 2.0, 3.0);
    const result = new Cartesian3(7.0, 8.0, 9.0);

    expect(function () {
      SceneGISPlanarPositionResolver.resolve(
        world,
        position,
        HeightReference.NONE,
        {},
      );
    }).toThrowDeveloperError();

    world.getTerrainHeight = jasmine
      .createSpy("getTerrainHeight")
      .and.returnValue(Number.NaN);
    expect(function () {
      SceneGISPlanarPositionResolver.resolve(
        world,
        position,
        HeightReference.CLAMP_TO_GROUND,
        result,
      );
    }).toThrowDeveloperError();
    expect(position).toEqual(new Cartesian3(1.0, 2.0, 3.0));
    expect(result).toEqual(new Cartesian3(7.0, 8.0, 9.0));
  });
});

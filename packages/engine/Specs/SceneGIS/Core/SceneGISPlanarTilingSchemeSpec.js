import {
  Cartesian2,
  Cartesian3,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISPlanarTilingScheme", function () {
  function createCoordinateSystem(options) {
    options = options ?? {};
    return new SceneGISPlanarCoordinateSystem({
      extent: new SceneGISPlanarExtent({
        minimumX: options.minimumX ?? -300.0,
        minimumY: options.minimumY ?? 100.0,
        maximumX: options.maximumX ?? 700.0,
        maximumY: options.maximumY ?? 1100.0,
      }),
      crs: options.crs,
    });
  }

  function createTilingScheme(options) {
    return new SceneGISPlanarTilingScheme({
      coordinateSystem: createCoordinateSystem(options),
    });
  }

  it("keeps the same coordinate system reference with getter-only properties", function () {
    const coordinateSystem = createCoordinateSystem();
    const tilingScheme = new SceneGISPlanarTilingScheme({ coordinateSystem });
    const coordinateSystemDescriptor = Object.getOwnPropertyDescriptor(
      SceneGISPlanarTilingScheme.prototype,
      "coordinateSystem",
    );
    const maximumSafeLevelDescriptor = Object.getOwnPropertyDescriptor(
      SceneGISPlanarTilingScheme.prototype,
      "maximumSafeLevel",
    );

    expect(tilingScheme.coordinateSystem).toBe(coordinateSystem);
    expect(coordinateSystemDescriptor.set).toBeUndefined();
    expect(maximumSafeLevelDescriptor.set).toBeUndefined();
  });

  it("uses one root tile and powers of two without bitshift overflow", function () {
    const tilingScheme = createTilingScheme();

    expect(tilingScheme.getNumberOfXTilesAtLevel(0)).toBe(1);
    expect(tilingScheme.getNumberOfYTilesAtLevel(0)).toBe(1);
    expect(tilingScheme.getNumberOfXTilesAtLevel(1)).toBe(2);
    expect(tilingScheme.getNumberOfYTilesAtLevel(2)).toBe(4);
    expect(tilingScheme.getNumberOfXTilesAtLevel(32)).toBe(2 ** 32);
    expect(tilingScheme.getNumberOfYTilesAtLevel(40)).toBe(2 ** 40);
    expect(tilingScheme.maximumSafeLevel).toBeLessThanOrEqual(52);
    expect(tilingScheme.maximumSafeLevel).toBeGreaterThanOrEqual(40);
  });

  it("returns the ideal tile size", function () {
    const tilingScheme = createTilingScheme();
    expect(tilingScheme.getTileSizeAtLevel(0)).toBe(1000.0);
    expect(tilingScheme.getTileSizeAtLevel(1)).toBe(500.0);
    expect(tilingScheme.getTileSizeAtLevel(2)).toBe(250.0);
  });

  it("returns the complete root extent as a new value", function () {
    const tilingScheme = createTilingScheme();
    const tileExtent = tilingScheme.tileXYToExtent(0, 0, 0);

    expect(tileExtent).not.toBe(tilingScheme.coordinateSystem.extent);
    expect(
      SceneGISPlanarExtent.equals(
        tileExtent,
        tilingScheme.coordinateSystem.extent,
      ),
    ).toBe(true);
  });

  it("preserves cancellation-sensitive root outer boundaries exactly", function () {
    const minimum = -1.0e16;
    const maximum = 1.0;
    const tilingScheme = createTilingScheme({
      minimumX: minimum,
      minimumY: minimum,
      maximumX: maximum,
      maximumY: maximum,
    });
    const root = tilingScheme.tileXYToExtent(0, 0, 0);

    expect(root.minimumX).toBe(minimum);
    expect(root.minimumY).toBe(minimum);
    expect(root.maximumX).toBe(maximum);
    expect(root.maximumY).toBe(maximum);
  });

  it("avoids intermediate overflow for a large finite span", function () {
    const maximum = 1.0e308;
    const tilingScheme = createTilingScheme({
      minimumX: 0.0,
      minimumY: 0.0,
      maximumX: maximum,
      maximumY: maximum,
    });
    const northwest = tilingScheme.tileXYToExtent(0, 0, 1);
    const northeast = tilingScheme.tileXYToExtent(1, 0, 1);
    const southwest = tilingScheme.tileXYToExtent(0, 1, 1);
    const southeast = tilingScheme.tileXYToExtent(1, 1, 1);

    for (const tile of [northwest, northeast, southwest, southeast]) {
      expect(Number.isFinite(tile.minimumX)).toBe(true);
      expect(Number.isFinite(tile.minimumY)).toBe(true);
      expect(Number.isFinite(tile.maximumX)).toBe(true);
      expect(Number.isFinite(tile.maximumY)).toBe(true);
    }
    expect(northwest.minimumX).toBe(0.0);
    expect(northwest.maximumY).toBe(maximum);
    expect(northeast.maximumX).toBe(maximum);
    expect(southwest.minimumY).toBe(0.0);
    expect(southeast.maximumX).toBe(maximum);
    expect(southeast.minimumY).toBe(0.0);
    expect(northwest.maximumX).toBe(northeast.minimumX);
    expect(southwest.maximumX).toBe(southeast.minimumX);
    expect(northwest.minimumY).toBe(southwest.maximumY);
    expect(northeast.minimumY).toBe(southeast.maximumY);
  });

  it("numbers level one tiles from the northwest", function () {
    const tilingScheme = createTilingScheme();
    const northwest = tilingScheme.tileXYToExtent(0, 0, 1);
    const northeast = tilingScheme.tileXYToExtent(1, 0, 1);
    const southwest = tilingScheme.tileXYToExtent(0, 1, 1);
    const southeast = tilingScheme.tileXYToExtent(1, 1, 1);

    expect(northwest).toEqual(
      new SceneGISPlanarExtent({
        minimumX: -300.0,
        minimumY: 600.0,
        maximumX: 200.0,
        maximumY: 1100.0,
      }),
    );
    expect(northeast.minimumX).toBe(200.0);
    expect(northeast.minimumY).toBe(600.0);
    expect(southwest.maximumX).toBe(200.0);
    expect(southwest.maximumY).toBe(600.0);
    expect(southeast.minimumX).toBe(200.0);
    expect(southeast.minimumY).toBe(100.0);
  });

  it("computes representative level two boundaries directly from the root", function () {
    const tilingScheme = createTilingScheme();
    const tile = tilingScheme.tileXYToExtent(2, 1, 2);

    expect(tile.minimumX).toBe(200.0);
    expect(tile.maximumX).toBe(450.0);
    expect(tile.minimumY).toBe(600.0);
    expect(tile.maximumY).toBe(850.0);
  });

  it("shares exact adjacent boundaries and preserves all outer boundaries", function () {
    const tilingScheme = createTilingScheme();
    const west = tilingScheme.tileXYToExtent(1, 1, 2);
    const east = tilingScheme.tileXYToExtent(2, 1, 2);
    const north = tilingScheme.tileXYToExtent(1, 1, 2);
    const south = tilingScheme.tileXYToExtent(1, 2, 2);
    const northwest = tilingScheme.tileXYToExtent(0, 0, 2);
    const southeast = tilingScheme.tileXYToExtent(3, 3, 2);

    expect(west.maximumX).toBe(east.minimumX);
    expect(north.minimumY).toBe(south.maximumY);
    expect(northwest.minimumX).toBe(-300.0);
    expect(northwest.maximumY).toBe(1100.0);
    expect(southeast.maximumX).toBe(700.0);
    expect(southeast.minimumY).toBe(100.0);
  });

  it("supports EPSG:3857-scale coordinates", function () {
    const limit = 20037508.342789244;
    const tilingScheme = createTilingScheme({
      minimumX: -limit,
      minimumY: -limit,
      maximumX: limit,
      maximumY: limit,
      crs: "EPSG:3857",
    });
    const northwest = tilingScheme.tileXYToExtent(0, 0, 1);

    expect(tilingScheme.coordinateSystem.crs).toBe("EPSG:3857");
    expect(northwest.minimumX).toBe(-limit);
    expect(northwest.maximumX).toBe(0.0);
    expect(northwest.minimumY).toBe(0.0);
    expect(northwest.maximumY).toBe(limit);
  });

  it("addresses all outer corners inclusively", function () {
    const tilingScheme = createTilingScheme();

    expect(
      tilingScheme.positionToTileXY(new Cartesian3(-300.0, 1100.0, 0.0), 1),
    ).toEqual(new Cartesian2(0, 0));
    expect(
      tilingScheme.positionToTileXY(new Cartesian3(700.0, 1100.0, 0.0), 1),
    ).toEqual(new Cartesian2(1, 0));
    expect(
      tilingScheme.positionToTileXY(new Cartesian3(-300.0, 100.0, 0.0), 1),
    ).toEqual(new Cartesian2(0, 1));
    expect(
      tilingScheme.positionToTileXY(new Cartesian3(700.0, 100.0, 0.0), 1),
    ).toEqual(new Cartesian2(1, 1));
  });

  it("assigns internal X boundaries east and internal Y boundaries south", function () {
    const tilingScheme = createTilingScheme();
    const xBoundary = tilingScheme.tileXYToExtent(1, 0, 2).maximumX;
    const yBoundary = tilingScheme.tileXYToExtent(0, 1, 2).minimumY;

    expect(
      tilingScheme.positionToTileXY(new Cartesian3(xBoundary, 1000.0, 0.0), 2),
    ).toEqual(new Cartesian2(2, 0));
    expect(
      tilingScheme.positionToTileXY(new Cartesian3(-250.0, yBoundary, 0.0), 2),
    ).toEqual(new Cartesian2(0, 2));
    expect(
      tilingScheme.positionToTileXY(new Cartesian3(200.0, 600.0, 0.0), 1),
    ).toEqual(new Cartesian2(1, 1));
  });

  it("ignores finite Z when addressing", function () {
    const tilingScheme = createTilingScheme();
    const low = tilingScheme.positionToTileXY(
      new Cartesian3(100.0, 900.0, -1000000.0),
      2,
    );
    const high = tilingScheme.positionToTileXY(
      new Cartesian3(100.0, 900.0, 1000000.0),
      2,
    );
    expect(low).toEqual(high);
  });

  it("returns undefined outside without wrapping or clamping", function () {
    const tilingScheme = createTilingScheme();
    const outside = [
      new Cartesian3(-300.1, 600.0, 0.0),
      new Cartesian3(700.1, 600.0, 0.0),
      new Cartesian3(200.0, 99.9, 0.0),
      new Cartesian3(200.0, 1100.1, 0.0),
    ];

    for (const position of outside) {
      expect(tilingScheme.positionToTileXY(position, 2)).toBeUndefined();
    }
  });

  it("creates Cartesian2 results and reuses a supplied result", function () {
    const tilingScheme = createTilingScheme();
    const position = new Cartesian3(100.0, 900.0, 0.0);
    const first = tilingScheme.positionToTileXY(position, 2);
    const second = tilingScheme.positionToTileXY(position, 2);
    const result = new Cartesian2(-1.0, -1.0);

    expect(first).toEqual(new Cartesian2(1, 0));
    expect(first).not.toBe(second);
    expect(tilingScheme.positionToTileXY(position, 2, result)).toBe(result);
    expect(result).toEqual(new Cartesian2(1, 0));
  });

  it("lowers maximumSafeLevel when large coordinates collapse boundaries", function () {
    const minimum = 1.0e16;
    const size = 1024.0;
    const tilingScheme = createTilingScheme({
      minimumX: minimum,
      minimumY: minimum,
      maximumX: minimum + size,
      maximumY: minimum + size,
    });
    const level = tilingScheme.maximumSafeLevel;
    const count = 2 ** level;
    const first = tilingScheme.tileXYToExtent(0, 0, level);
    const last = tilingScheme.tileXYToExtent(count - 1, count - 1, level);

    expect(level).toBeLessThan(52);
    expect(first.width).toBeGreaterThan(0.0);
    expect(first.height).toBeGreaterThan(0.0);
    expect(last.width).toBeGreaterThan(0.0);
    expect(last.height).toBeGreaterThan(0.0);
    expect(function () {
      tilingScheme.getNumberOfXTilesAtLevel(level + 1);
    }).toThrowDeveloperError();
    expect(function () {
      tilingScheme.tileXYToExtent(0, 0, level + 1);
    }).toThrowDeveloperError();
  });

  it("uses a global resolution bound for every accepted boundary", function () {
    const minimum = 701624666.4462324;
    const size = 326.48212373256683;
    const tilingScheme = createTilingScheme({
      minimumX: minimum,
      minimumY: minimum,
      maximumX: minimum + size,
      maximumY: minimum + size,
    });
    const level = tilingScheme.maximumSafeLevel;
    const count = 2 ** level;
    const counterexampleIndexAtLevel32 = 2968473518;
    const internalIndex = Math.min(
      Math.floor(counterexampleIndexAtLevel32 / 2 ** (32 - level)),
      count - 2,
    );

    expect(level).toBeLessThan(32);
    for (const index of [0, internalIndex, count - 1]) {
      const tile = tilingScheme.tileXYToExtent(index, index, level);
      expect(tile.width).toBeGreaterThan(0.0);
      expect(tile.height).toBeGreaterThan(0.0);
    }
    expect(function () {
      tilingScheme.tileXYToExtent(0, 0, level + 1);
    }).toThrowDeveloperError();
  });

  it("rejects an invalid coordinate system", function () {
    expect(function () {
      return new SceneGISPlanarTilingScheme();
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarTilingScheme({ coordinateSystem: {} });
    }).toThrowDeveloperError();
  });

  it("rejects invalid levels in every addressing method", function () {
    const tilingScheme = createTilingScheme();
    const invalidLevels = [
      -1,
      0.5,
      Number.NaN,
      Infinity,
      "1",
      tilingScheme.maximumSafeLevel + 1,
    ];
    const methods = [
      (level) => tilingScheme.getNumberOfXTilesAtLevel(level),
      (level) => tilingScheme.getNumberOfYTilesAtLevel(level),
      (level) => tilingScheme.getTileSizeAtLevel(level),
      (level) => tilingScheme.tileXYToExtent(0, 0, level),
      (level) =>
        tilingScheme.positionToTileXY(new Cartesian3(0.0, 500.0, 0.0), level),
    ];

    for (const method of methods) {
      for (const level of invalidLevels) {
        expect(function () {
          method(level);
        }).toThrowDeveloperError();
      }
    }
  });

  it("rejects invalid and out-of-range tile indices", function () {
    const tilingScheme = createTilingScheme();
    const invalidIndices = [-1, 0.5, Number.NaN, Infinity, "0", 4];

    for (const index of invalidIndices) {
      expect(function () {
        tilingScheme.tileXYToExtent(index, 0, 2);
      }).toThrowDeveloperError();
      expect(function () {
        tilingScheme.tileXYToExtent(0, index, 2);
      }).toThrowDeveloperError();
    }
  });

  it("rejects invalid or nonfinite positions", function () {
    const tilingScheme = createTilingScheme();
    const invalidPositions = [
      undefined,
      new Cartesian2(0.0, 0.0),
      new Cartesian3(Number.NaN, 0.0, 0.0),
      new Cartesian3(0.0, Infinity, 0.0),
      new Cartesian3(0.0, 0.0, -Infinity),
    ];

    for (const position of invalidPositions) {
      expect(function () {
        tilingScheme.positionToTileXY(position, 0);
      }).toThrowDeveloperError();
    }
  });
});

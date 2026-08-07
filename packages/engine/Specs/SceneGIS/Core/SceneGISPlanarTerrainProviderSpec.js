import {
  Event,
  Request,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarTerrainProvider,
  SceneGISPlanarTilingScheme,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISPlanarTerrainProvider", function () {
  function createTilingScheme() {
    return new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1.0,
          minimumY: -1.0,
          maximumX: 1.0,
          maximumY: 1.0,
        }),
      }),
    });
  }

  it("cannot be instantiated directly", function () {
    expect(function () {
      return new SceneGISPlanarTerrainProvider();
    }).toThrowDeveloperError();
  });

  it("provides default unknown availability behavior", function () {
    expect(
      SceneGISPlanarTerrainProvider.prototype.getTileDataAvailable(0, 0, 0),
    ).toBeUndefined();
    expect(
      SceneGISPlanarTerrainProvider.prototype.loadTileDataAvailability(0, 0, 0),
    ).toBeUndefined();
  });

  it("supports a synchronous structural provider returning terrain promises", async function () {
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([0.0, 1.0, 2.0, 3.0]),
      width: 2,
      height: 2,
    });
    const provider = {
      tilingScheme: createTilingScheme(),
      minimumHeight: 0.0,
      maximumHeight: 3.0,
      maximumLevel: 2,
      errorEvent: new Event(),
      credit: undefined,
      getLevelMaximumGeometricError: function (level) {
        return 4.0 / 2 ** level;
      },
      requestTileGeometry: function (x, y, level, request) {
        expect([x, y, level]).toEqual([0, 0, 0]);
        expect(request).toBeInstanceOf(Request);
        return Promise.resolve(terrainData);
      },
      getTileDataAvailable:
        SceneGISPlanarTerrainProvider.prototype.getTileDataAvailable,
      loadTileDataAvailability:
        SceneGISPlanarTerrainProvider.prototype.loadTileDataAvailability,
    };

    expect(provider.tilingScheme).toBeInstanceOf(SceneGISPlanarTilingScheme);
    expect(provider.getLevelMaximumGeometricError(1)).toBe(2.0);
    expect(provider.getTileDataAvailable(0, 0, 0)).toBeUndefined();
    expect(provider.loadTileDataAvailability(0, 0, 0)).toBeUndefined();
    await expectAsync(
      provider.requestTileGeometry(0, 0, 0, new Request()),
    ).toBeResolvedTo(terrainData);
  });

  it("keeps required interface members abstract", function () {
    const abstractProperties = [
      "tilingScheme",
      "minimumHeight",
      "maximumHeight",
      "maximumLevel",
      "errorEvent",
      "credit",
    ];
    for (const propertyName of abstractProperties) {
      expect(function () {
        return SceneGISPlanarTerrainProvider.prototype[propertyName];
      }).toThrowDeveloperError();
    }
    expect(function () {
      SceneGISPlanarTerrainProvider.prototype.getLevelMaximumGeometricError(0);
    }).toThrowDeveloperError();
    expect(function () {
      SceneGISPlanarTerrainProvider.prototype.requestTileGeometry(
        0,
        0,
        0,
        new Request(),
      );
    }).toThrowDeveloperError();
  });
});

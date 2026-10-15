import {
  Event,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarImageryProvider,
  SceneGISPlanarTilingScheme,
} from "../../../index.js";

describe("SceneGIS/Scene/SceneGISPlanarImageryProvider", function () {
  function createTilingScheme() {
    return new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: -1,
          minimumY: -1,
          maximumX: 1,
          maximumY: 1,
        }),
      }),
    });
  }

  function createProvider(overrides = {}) {
    return {
      tilingScheme: createTilingScheme(),
      minimumLevel: 0,
      maximumLevel: 2,
      tileWidth: 256,
      tileHeight: 256,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: function () {},
      ...overrides,
    };
  }

  it("cannot be instantiated directly", function () {
    expect(function () {
      return new SceneGISPlanarImageryProvider();
    }).toThrowDeveloperError();
  });

  it("accepts a complete structural provider", function () {
    const provider = createProvider();
    const layer = new SceneGISPlanarImageryLayer(provider);
    expect(layer.imageryProvider).toBe(provider);
    layer.destroy();
  });

  it("rejects incomplete or inconsistent structural providers", function () {
    for (const overrides of [
      { minimumLevel: 3 },
      { maximumLevel: -1 },
      { tileWidth: 0 },
      { tileHeight: 0 },
      { hasAlphaChannel: "true" },
      { errorEvent: {} },
      { requestImage: undefined },
      { credit: {} },
    ]) {
      expect(function () {
        return new SceneGISPlanarImageryLayer(createProvider(overrides));
      }).toThrowDeveloperError();
    }
  });

  it("accepts rectangular pixel dimensions without changing physical tile coverage", function () {
    const layer = new SceneGISPlanarImageryLayer(
      createProvider({ tileHeight: 128 }),
    );
    expect(layer.imageryProvider.tileWidth).toBe(256);
    expect(layer.imageryProvider.tileHeight).toBe(128);
    layer.destroy();
  });
  it("accepts nonzero minimum and rejects invalid intervals or coverage", function () {
    const layer = new SceneGISPlanarImageryLayer(
      createProvider({ minimumLevel: 2 }),
    );
    layer.destroy();
    for (const overrides of [
      { minimumLevel: -1 },
      { minimumLevel: 0.5 },
      { coverageExtent: {} },
    ]) {
      expect(
        () => new SceneGISPlanarImageryLayer(createProvider(overrides)),
      ).toThrowDeveloperError();
    }
  });
});

import {
  Event,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarImageryLayerCollection,
  SceneGISPlanarTilingScheme,
} from "../../../index.js";

describe("SceneGIS/Scene/SceneGISPlanarImageryLayer", function () {
  function createProvider() {
    const tilingScheme = new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: 0,
          minimumY: 0,
          maximumX: 1,
          maximumY: 1,
        }),
      }),
    });
    return {
      tilingScheme,
      minimumLevel: 0,
      maximumLevel: 1,
      tileWidth: 1,
      tileHeight: 1,
      hasAlphaChannel: true,
      errorEvent: new Event(),
      credit: undefined,
      requestImage: function () {},
    };
  }

  it("owns show and alpha state without owning the provider", function () {
    const provider = createProvider();
    const layer = new SceneGISPlanarImageryLayer(provider, {
      show: false,
      alpha: 0.25,
    });
    expect(layer.imageryProvider).toBe(provider);
    expect(layer.show).toBe(false);
    expect(layer.alpha).toBe(0.25);
    layer.show = true;
    layer.alpha = 1.0;
    expect(layer.show).toBe(true);
    expect(layer.alpha).toBe(1.0);
    layer.destroy();
    expect(layer.isDestroyed()).toBe(true);
  });

  it("rejects invalid setters without changing state", function () {
    const layer = new SceneGISPlanarImageryLayer(createProvider());
    expect(function () {
      layer.show = 1;
    }).toThrowDeveloperError();
    expect(function () {
      layer.alpha = -1;
    }).toThrowDeveloperError();
    expect(function () {
      layer.alpha = Number.NaN;
    }).toThrowDeveloperError();
    expect(layer.show).toBe(true);
    expect(layer.alpha).toBe(1.0);
    layer.destroy();
  });

  it("cannot be destroyed while attached", function () {
    const provider = createProvider();
    const layer = new SceneGISPlanarImageryLayer(provider);
    const collection = new SceneGISPlanarImageryLayerCollection({
      tilingScheme: provider.tilingScheme,
    });
    collection.add(layer);
    expect(function () {
      layer.destroy();
    }).toThrowDeveloperError();
    expect(layer.isDestroyed()).toBe(false);
    collection.remove(layer, false);
    layer.destroy();
    collection.destroy();
  });
});

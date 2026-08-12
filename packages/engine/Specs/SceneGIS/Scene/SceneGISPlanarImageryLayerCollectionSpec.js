import {
  Event,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarImageryLayerCollection,
  SceneGISPlanarTilingScheme,
} from "../../../index.js";

describe("SceneGIS/Scene/SceneGISPlanarImageryLayerCollection", function () {
  function createTilingScheme(offset = 0) {
    return new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: offset,
          minimumY: offset,
          maximumX: offset + 1,
          maximumY: offset + 1,
        }),
      }),
    });
  }

  function createProvider(tilingScheme) {
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

  it("adds, indexes, reorders, and removes layers bottom-to-top", function () {
    const tilingScheme = createTilingScheme();
    const collection = new SceneGISPlanarImageryLayerCollection({
      tilingScheme,
    });
    const first = collection.addImageryProvider(createProvider(tilingScheme));
    const second = new SceneGISPlanarImageryLayer(createProvider(tilingScheme));
    collection.add(second, 0);
    expect(collection.length).toBe(2);
    expect(collection.get(0)).toBe(second);
    expect(collection.contains(first)).toBe(true);
    collection.raise(second);
    expect(collection.get(1)).toBe(second);
    collection.lowerToBottom(second);
    collection.raiseToTop(second);
    collection.lower(second);
    expect(collection.get(0)).toBe(second);
    expect(collection.remove(second, false)).toBe(true);
    expect(collection.remove(second)).toBe(false);
    second.destroy();
    collection.destroy();
  });

  it("forwards the changed property from attached layers", function () {
    const tilingScheme = createTilingScheme();
    const collection = new SceneGISPlanarImageryLayerCollection({
      tilingScheme,
    });
    const changed = jasmine.createSpy("changed");
    collection._changeListener = changed;
    const layer = collection.addImageryProvider(createProvider(tilingScheme));
    changed.calls.reset();

    layer.brightness = 0.5;

    expect(changed).toHaveBeenCalledOnceWith("changed", layer, "brightness");
    collection.destroy();
  });

  it("requires exact tiling-scheme identity and a detached live layer", function () {
    const tilingScheme = createTilingScheme();
    const collection = new SceneGISPlanarImageryLayerCollection({
      tilingScheme,
    });
    const wrong = new SceneGISPlanarImageryLayer(
      createProvider(createTilingScheme()),
    );
    expect(function () {
      collection.add(wrong);
    }).toThrowDeveloperError();
    wrong.destroy();

    const layer = collection.addImageryProvider(createProvider(tilingScheme));
    expect(function () {
      collection.add(layer);
    }).toThrowDeveloperError();
    const another = new SceneGISPlanarImageryLayer(
      createProvider(tilingScheme),
    );
    another.destroy();
    expect(function () {
      collection.add(another);
    }).toThrowDeveloperError();
    collection.destroy();
  });

  it("validates indices and membership before mutation", function () {
    const tilingScheme = createTilingScheme();
    const collection = new SceneGISPlanarImageryLayerCollection({
      tilingScheme,
    });
    const layer = new SceneGISPlanarImageryLayer(createProvider(tilingScheme));
    expect(function () {
      collection.add(layer, 1);
    }).toThrowDeveloperError();
    expect(function () {
      collection.get(0);
    }).toThrowDeveloperError();
    expect(function () {
      collection.raise(layer);
    }).toThrowDeveloperError();
    expect(collection.length).toBe(0);
    layer.destroy();
    collection.destroy();
  });

  it("destroys attached layers but never providers", function () {
    const tilingScheme = createTilingScheme();
    const provider = createProvider(tilingScheme);
    provider.destroy = jasmine.createSpy("destroy");
    const collection = new SceneGISPlanarImageryLayerCollection({
      tilingScheme,
    });
    const first = collection.addImageryProvider(provider);
    const second = collection.addImageryProvider(provider);
    collection.removeAll(false);
    expect(first.isDestroyed()).toBe(false);
    expect(second.isDestroyed()).toBe(false);
    first.destroy();
    second.destroy();
    collection.addImageryProvider(provider);
    collection.destroy();
    expect(provider.destroy).not.toHaveBeenCalled();
  });
});

import {
  Color,
  Event,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarImageryLayer,
  SceneGISPlanarImageryLayerCollection,
  SceneGISPlanarTilingScheme,
  SplitDirection,
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

  it("validates native split directions and notifies only on change", function () {
    const provider = createProvider();
    const layer = new SceneGISPlanarImageryLayer(provider);
    const changed = jasmine.createSpy("changed");
    layer._changeListener = changed;
    expect(layer.splitDirection).toBe(SplitDirection.NONE);
    for (const direction of [
      SplitDirection.LEFT,
      SplitDirection.RIGHT,
      SplitDirection.TOP,
      SplitDirection.BOTTOM,
      SplitDirection.NONE,
    ]) {
      const configured = new SceneGISPlanarImageryLayer(provider, {
        splitDirection: direction,
      });
      expect(configured.splitDirection).toBe(direction);
      configured.destroy();
      layer.splitDirection = direction;
      layer.splitDirection = direction;
    }
    expect(changed).toHaveBeenCalledTimes(5);
    expect(changed).toHaveBeenCalledWith(layer, "splitDirection");
    for (const invalid of [
      3,
      -3,
      0.5,
      Number.NaN,
      Infinity,
      "LEFT",
      undefined,
      null,
    ]) {
      expect(() => {
        layer.splitDirection = invalid;
      }).toThrowDeveloperError();
      expect(layer.splitDirection).toBe(SplitDirection.NONE);
      if (invalid !== undefined && invalid !== null) {
        expect(
          () =>
            new SceneGISPlanarImageryLayer(provider, {
              splitDirection: invalid,
            }),
        ).toThrowDeveloperError();
      }
    }
    expect(changed).toHaveBeenCalledTimes(5);
    layer.destroy();
  });

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

  it("owns validated filter defaults and constructor values", function () {
    const target = new Color(0.1, 0.2, 0.3, Number.NaN);
    const layer = new SceneGISPlanarImageryLayer(createProvider(), {
      brightness: 1.2,
      contrast: 0.8,
      hue: -Math.PI,
      saturation: 0.5,
      gamma: 2.0,
      colorToAlpha: target,
      colorToAlphaThreshold: 0.25,
    });
    target.red = 0.9;
    expect(layer.brightness).toBe(1.2);
    expect(layer.contrast).toBe(0.8);
    expect(layer.hue).toBe(-Math.PI);
    expect(layer.saturation).toBe(0.5);
    expect(layer.gamma).toBe(2.0);
    expect(layer.colorToAlpha.red).toBe(0.1);
    expect(layer.colorToAlpha.green).toBe(0.2);
    expect(layer.colorToAlpha.blue).toBe(0.3);
    expect(Number.isNaN(layer.colorToAlpha.alpha)).toBe(true);
    expect(layer.colorToAlphaThreshold).toBe(0.25);
    layer.destroy();
  });

  it("defensively clones color-to-alpha and treats RGB-equal assignment as a no-op", function () {
    const layer = new SceneGISPlanarImageryLayer(createProvider());
    const changed = jasmine.createSpy("changed");
    layer._changeListener = changed;
    const assigned = new Color(0.2, 0.3, 0.4, 0.1);
    layer.colorToAlpha = assigned;
    assigned.green = 0.9;
    const returned = layer.colorToAlpha;
    returned.blue = 0.9;
    expect(layer.colorToAlpha).toEqual(new Color(0.2, 0.3, 0.4, 0.1));
    expect(changed).toHaveBeenCalledTimes(1);
    layer.colorToAlpha = new Color(0.2, 0.3, 0.4, 1.0);
    expect(changed).toHaveBeenCalledTimes(1);
    layer.colorToAlpha = undefined;
    expect(layer.colorToAlpha).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(2);
    layer.destroy();
  });

  it("rejects invalid setters without changing state", function () {
    const layer = new SceneGISPlanarImageryLayer(createProvider());
    const changed = jasmine.createSpy("changed");
    layer._changeListener = changed;
    expect(function () {
      layer.show = 1;
    }).toThrowDeveloperError();
    expect(function () {
      layer.alpha = -1;
    }).toThrowDeveloperError();
    expect(function () {
      layer.alpha = Number.NaN;
    }).toThrowDeveloperError();
    for (const property of ["brightness", "contrast", "saturation"]) {
      expect(function () {
        layer[property] = -1.0;
      }).toThrowDeveloperError();
      expect(function () {
        layer[property] = Number.NaN;
      }).toThrowDeveloperError();
    }
    expect(function () {
      layer.hue = Number.POSITIVE_INFINITY;
    }).toThrowDeveloperError();
    expect(function () {
      layer.gamma = 0.0;
    }).toThrowDeveloperError();
    expect(function () {
      layer.colorToAlpha = new Color(1.1, 0.0, 0.0, 1.0);
    }).toThrowDeveloperError();
    expect(function () {
      layer.colorToAlphaThreshold = 1.1;
    }).toThrowDeveloperError(
      "colorToAlphaThreshold must be a finite number from zero to one.",
    );
    expect(layer.show).toBe(true);
    expect(layer.alpha).toBe(1.0);
    expect(layer.brightness).toBe(1.0);
    expect(layer.contrast).toBe(1.0);
    expect(layer.hue).toBe(0.0);
    expect(layer.saturation).toBe(1.0);
    expect(layer.gamma).toBe(1.0);
    expect(layer.colorToAlpha).toBeUndefined();
    expect(layer.colorToAlphaThreshold).toBe(0.004);
    expect(changed).not.toHaveBeenCalled();
    layer.destroy();
  });

  it("notifies once for changed scalar filters and not for equal assignments", function () {
    const layer = new SceneGISPlanarImageryLayer(createProvider());
    const changed = jasmine.createSpy("changed");
    layer._changeListener = changed;
    for (const [property, value] of [
      ["brightness", 0.5],
      ["contrast", 0.5],
      ["hue", 0.5],
      ["saturation", 0.5],
      ["gamma", 2.0],
      ["colorToAlphaThreshold", 0.5],
    ]) {
      layer[property] = value;
      layer[property] = value;
    }
    expect(changed.calls.allArgs().map((args) => args[1])).toEqual([
      "brightness",
      "contrast",
      "hue",
      "saturation",
      "gamma",
      "colorToAlphaThreshold",
    ]);
    layer.destroy();
  });

  it("rejects invalid constructor filters before creating state", function () {
    const provider = createProvider();
    for (const options of [
      { brightness: -1.0 },
      { contrast: Number.NaN },
      { hue: Number.POSITIVE_INFINITY },
      { saturation: -1.0 },
      { gamma: 0.0 },
      { colorToAlpha: {} },
      { colorToAlpha: new Color(0.0, -0.1, 0.0, 1.0) },
      { colorToAlphaThreshold: -0.1 },
    ]) {
      expect(function () {
        return new SceneGISPlanarImageryLayer(provider, options);
      }).toThrowDeveloperError();
    }
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

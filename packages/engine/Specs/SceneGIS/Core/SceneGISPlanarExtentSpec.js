import {
  Cartesian2,
  Cartesian3,
  SceneGISPlanarExtent,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISPlanarExtent", function () {
  it("constructs a rectangular extent with negative coordinates", function () {
    const extent = new SceneGISPlanarExtent({
      minimumX: -20.0,
      minimumY: -5.0,
      maximumX: 40.0,
      maximumY: 15.0,
    });

    expect(extent.minimumX).toBe(-20.0);
    expect(extent.minimumY).toBe(-5.0);
    expect(extent.maximumX).toBe(40.0);
    expect(extent.maximumY).toBe(15.0);
    expect(extent.width).toBe(60.0);
    expect(extent.height).toBe(20.0);
  });

  it("exposes getter-only properties", function () {
    const propertyNames = [
      "minimumX",
      "minimumY",
      "maximumX",
      "maximumY",
      "width",
      "height",
    ];

    for (const propertyName of propertyNames) {
      const descriptor = Object.getOwnPropertyDescriptor(
        SceneGISPlanarExtent.prototype,
        propertyName,
      );
      expect(descriptor.get).toBeDefined();
      expect(descriptor.set).toBeUndefined();
    }
  });

  it("clones to an independent extent and preserves undefined", function () {
    const extent = new SceneGISPlanarExtent({
      minimumX: 1.0,
      minimumY: 2.0,
      maximumX: 5.0,
      maximumY: 8.0,
    });
    const clone = SceneGISPlanarExtent.clone(extent);

    expect(clone).not.toBe(extent);
    expect(SceneGISPlanarExtent.equals(clone, extent)).toBe(true);
    expect(SceneGISPlanarExtent.clone(undefined)).toBeUndefined();
  });

  it("compares exact boundaries with identity and undefined semantics", function () {
    const left = new SceneGISPlanarExtent({
      minimumX: 0.0,
      minimumY: 0.0,
      maximumX: 2.0,
      maximumY: 3.0,
    });
    const equal = SceneGISPlanarExtent.clone(left);
    const different = new SceneGISPlanarExtent({
      minimumX: 0.0,
      minimumY: 0.0,
      maximumX: 2.0,
      maximumY: 4.0,
    });

    expect(SceneGISPlanarExtent.equals(left, left)).toBe(true);
    expect(SceneGISPlanarExtent.equals(left, equal)).toBe(true);
    expect(SceneGISPlanarExtent.equals(left, different)).toBe(false);
    expect(SceneGISPlanarExtent.equals(left, undefined)).toBe(false);
    expect(SceneGISPlanarExtent.equals(undefined, undefined)).toBe(true);
  });

  it("contains all outer boundaries inclusively and ignores Z", function () {
    const extent = new SceneGISPlanarExtent({
      minimumX: -10.0,
      minimumY: 20.0,
      maximumX: 30.0,
      maximumY: 50.0,
    });

    expect(
      SceneGISPlanarExtent.contains(extent, new Cartesian2(-10.0, 20.0)),
    ).toBe(true);
    expect(
      SceneGISPlanarExtent.contains(extent, new Cartesian2(30.0, 50.0)),
    ).toBe(true);
    expect(
      SceneGISPlanarExtent.contains(
        extent,
        new Cartesian3(5.0, 35.0, Number.MAX_VALUE),
      ),
    ).toBe(true);
    expect(
      SceneGISPlanarExtent.contains(extent, new Cartesian2(-10.1, 35.0)),
    ).toBe(false);
    expect(
      SceneGISPlanarExtent.contains(extent, new Cartesian2(5.0, 50.1)),
    ).toBe(false);
  });

  it("rejects missing, nonnumeric, and nonfinite boundaries", function () {
    const valid = {
      minimumX: 0.0,
      minimumY: 0.0,
      maximumX: 1.0,
      maximumY: 1.0,
    };
    const invalidValues = [undefined, "0", Number.NaN, Infinity, -Infinity];

    for (const propertyName of Object.keys(valid)) {
      for (const invalidValue of invalidValues) {
        expect(function () {
          return new SceneGISPlanarExtent({
            ...valid,
            [propertyName]: invalidValue,
          });
        }).toThrowDeveloperError();
      }
    }
  });

  it("rejects zero-sized, inverted, and missing extents", function () {
    expect(function () {
      return new SceneGISPlanarExtent();
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarExtent({
        minimumX: 1.0,
        minimumY: 0.0,
        maximumX: 1.0,
        maximumY: 2.0,
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarExtent({
        minimumX: 2.0,
        minimumY: 0.0,
        maximumX: 1.0,
        maximumY: 2.0,
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarExtent({
        minimumX: 0.0,
        minimumY: 2.0,
        maximumX: 2.0,
        maximumY: 2.0,
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarExtent({
        minimumX: 0.0,
        minimumY: 3.0,
        maximumX: 2.0,
        maximumY: 2.0,
      });
    }).toThrowDeveloperError();
  });

  it("rejects finite endpoints whose derived span overflows", function () {
    expect(function () {
      return new SceneGISPlanarExtent({
        minimumX: -Number.MAX_VALUE,
        minimumY: 0.0,
        maximumX: Number.MAX_VALUE,
        maximumY: 1.0,
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarExtent({
        minimumX: 0.0,
        minimumY: -Number.MAX_VALUE,
        maximumX: 1.0,
        maximumY: Number.MAX_VALUE,
      });
    }).toThrowDeveloperError();
  });

  it("rejects invalid contains arguments", function () {
    const extent = new SceneGISPlanarExtent({
      minimumX: 0.0,
      minimumY: 0.0,
      maximumX: 1.0,
      maximumY: 1.0,
    });

    expect(function () {
      SceneGISPlanarExtent.contains({}, new Cartesian2());
    }).toThrowDeveloperError();
    expect(function () {
      SceneGISPlanarExtent.contains(extent, undefined);
    }).toThrowDeveloperError();
    expect(function () {
      SceneGISPlanarExtent.contains(extent, new Cartesian2(Number.NaN, 0.0));
    }).toThrowDeveloperError();
    expect(function () {
      SceneGISPlanarExtent.contains(extent, new Cartesian2(0.0, Infinity));
    }).toThrowDeveloperError();
  });
});

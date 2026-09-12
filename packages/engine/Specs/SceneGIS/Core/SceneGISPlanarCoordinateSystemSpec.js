import {
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISPlanarCoordinateSystem", function () {
  function createSquareExtent() {
    return new SceneGISPlanarExtent({
      minimumX: -200.0,
      minimumY: 100.0,
      maximumX: 800.0,
      maximumY: 1100.0,
    });
  }

  it("owns a clone of a strictly square extent", function () {
    const inputExtent = createSquareExtent();
    const coordinateSystem = new SceneGISPlanarCoordinateSystem({
      extent: inputExtent,
    });

    expect(coordinateSystem.extent).not.toBe(inputExtent);
    expect(
      SceneGISPlanarExtent.equals(coordinateSystem.extent, inputExtent),
    ).toBe(true);
    Object.defineProperty(inputExtent, "minimumX", { value: 999.0 });
    expect(coordinateSystem.extent.minimumX).toBe(-200.0);
  });

  it("supports an omitted CRS", function () {
    const coordinateSystem = new SceneGISPlanarCoordinateSystem({
      extent: createSquareExtent(),
    });
    expect(coordinateSystem.crs).toBeUndefined();
  });

  it("preserves local and EPSG CRS identifiers as opaque strings", function () {
    const local = new SceneGISPlanarCoordinateSystem({
      extent: createSquareExtent(),
      crs: " local-grid ",
    });
    const webMercator = new SceneGISPlanarCoordinateSystem({
      extent: createSquareExtent(),
      crs: "EPSG:3857",
    });

    expect(local.crs).toBe(" local-grid ");
    expect(webMercator.crs).toBe("EPSG:3857");
  });

  it("exposes getter-only extent and CRS properties", function () {
    const extentDescriptor = Object.getOwnPropertyDescriptor(
      SceneGISPlanarCoordinateSystem.prototype,
      "extent",
    );
    const crsDescriptor = Object.getOwnPropertyDescriptor(
      SceneGISPlanarCoordinateSystem.prototype,
      "crs",
    );

    expect(extentDescriptor.get).toBeDefined();
    expect(extentDescriptor.set).toBeUndefined();
    expect(crsDescriptor.get).toBeDefined();
    expect(crsDescriptor.set).toBeUndefined();
  });

  it("rejects a rectangular extent with strict equality", function () {
    const rectangle = new SceneGISPlanarExtent({
      minimumX: 0.0,
      minimumY: 0.0,
      maximumX: 10.0,
      maximumY: 10.000000000000002,
    });

    expect(function () {
      return new SceneGISPlanarCoordinateSystem({ extent: rectangle });
    }).toThrowDeveloperError();
  });

  it("rejects a missing or invalid extent", function () {
    expect(function () {
      return new SceneGISPlanarCoordinateSystem();
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarCoordinateSystem({ extent: {} });
    }).toThrowDeveloperError();
  });

  it("rejects invalid CRS values", function () {
    const invalidCrsValues = ["", 3857, null, {}, []];
    for (const crs of invalidCrsValues) {
      expect(function () {
        return new SceneGISPlanarCoordinateSystem({
          extent: createSquareExtent(),
          crs,
        });
      }).toThrowDeveloperError();
    }
  });
});

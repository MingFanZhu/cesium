import {
  Cartesian3,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISVectorTileCoordinates,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISVectorTileCoordinates", function () {
  function scheme(
    minimumX = 100,
    minimumY = 200,
    width = 1024,
    crs = "custom",
  ) {
    return new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX,
          minimumY,
          maximumX: minimumX + width,
          maximumY: minimumY + width,
        }),
        crs,
      }),
    });
  }
  function mapping(tilingScheme = scheme(), x = 0, y = 0, level = 0) {
    return new SceneGISVectorTileCoordinates({
      tilingScheme,
      x,
      y,
      level,
      extent: 4096,
    });
  }

  it("maps the same tile-local coordinates through different root extents", function () {
    expect(mapping().toWorld(1024, 3072, 17)).toEqual(
      new Cartesian3(356, 456, 17),
    );
    expect(
      mapping(scheme(-2000, 500, 2048, "another")).toWorld(1024, 3072, 17),
    ).toEqual(new Cartesian3(-1488, 1012, 17));
  });
  it("flips Y once and keeps buffer coordinates and reusable results", function () {
    const transform = mapping();
    const result = new Cartesian3();
    expect(transform.toWorld(-4096, 8192, 5, result)).toBe(result);
    expect(result).toEqual(new Cartesian3(-924, -824, 5));
    expect(transform.toLocal(4096, 4096)).toEqual(
      new Cartesian3(1024, -1024, 0),
    );
    expect(Object.isFrozen(transform.origin)).toBe(true);
  });
  it("retains exact shared boundaries at Web Mercator scale", function () {
    const half = Math.PI * 6378137;
    const tilingScheme = scheme(-half, -half, 2 * half, "EPSG:3857");
    const west = mapping(tilingScheme, 12011, 12300, 15);
    const east = mapping(tilingScheme, 12012, 12300, 15);
    expect(west.toWorld(4096, 1234).x).toBe(east.toWorld(0, 1234).x);
    expect(west.toLocal(1, 0).x).toBeGreaterThan(0);
    expect(Math.abs(west.origin.x)).toBeGreaterThan(1000000);
  });
  it("computes fractional CSS-pixel zoom without source LOD or overflow", function () {
    expect(SceneGISVectorTileCoordinates.computeStyleZoom(512, 1)).toBe(0);
    expect(SceneGISVectorTileCoordinates.computeStyleZoom(512, 2 ** -3.5)).toBe(
      3.5,
    );
    expect(
      SceneGISVectorTileCoordinates.computeStyleZoom(1e300, 1e-200),
    ).toBeGreaterThan(1000);
  });
  it("rejects invalid addresses, extents, and numeric inputs", function () {
    expect(() => mapping(scheme(), 2, 0, 0)).toThrowDeveloperError();
    expect(
      () =>
        new SceneGISVectorTileCoordinates({
          tilingScheme: scheme(),
          x: 0,
          y: 0,
          level: 0,
          extent: 0,
        }),
    ).toThrowDeveloperError();
    expect(() => mapping().toWorld(NaN, 0)).toThrowDeveloperError();
    expect(() =>
      SceneGISVectorTileCoordinates.computeStyleZoom(512, 0),
    ).toThrowDeveloperError();
  });
});

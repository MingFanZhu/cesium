import ArcType from "../../../Source/Core/ArcType.js";
import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import SceneGISPlanarPolylineGeometry from "../../../Source/SceneGIS/Core/SceneGISPlanarPolylineGeometry.js";

describe("SceneGIS/Core/SceneGISPlanarPolylineGeometry", function () {
  it("snapshots positions and rebases EPSG:3857-scale coordinates", function () {
    const positions = [
      new Cartesian3(20000000.0, -20000000.0, 10.0),
      new Cartesian3(20000010.0, -19999995.0, 12.0),
    ];
    const geometry = new SceneGISPlanarPolylineGeometry({
      positions,
      width: 2.5,
    });
    positions[0].x = 0.0;
    expect(geometry.positions[0].x).toBe(20000000.0);
    expect(geometry.origin).toEqual(
      new Cartesian3(20000000.0, -20000000.0, 10.0),
    );
    expect(geometry.width).toBe(2.5);
    const created = geometry._createGeometry();
    expect(created.attributes.position).toBeDefined();
    expect(created.indices.length).toBeGreaterThan(0);
  });

  it("uses an explicit origin and ArcType.NONE standard geometry", function () {
    const geometry = new SceneGISPlanarPolylineGeometry({
      positions: [new Cartesian3(5, 6, 7), new Cartesian3(8, 9, 10)],
      width: 300.25,
      origin: Cartesian3.ZERO,
    });
    expect(geometry.origin).toEqual(Cartesian3.ZERO);
    expect(geometry._createGeometry().primitiveType).toBeDefined();
    expect(ArcType.NONE).toBe(0);
  });

  it("normalizes adjacent duplicates and rejects invalid inputs", function () {
    const a = new Cartesian3(1, 2, 3);
    const b = new Cartesian3(4, 5, 6);
    expect(
      new SceneGISPlanarPolylineGeometry({ positions: [a, a, b], width: 1 })
        .positions.length,
    ).toBe(2);
    expect(function () {
      return new SceneGISPlanarPolylineGeometry({
        positions: [a, a],
        width: 1,
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarPolylineGeometry({
        positions: [a, b],
        width: 0,
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarPolylineGeometry({
        positions: [a, b],
        width: Number.POSITIVE_INFINITY,
      });
    }).toThrowDeveloperError();
  });
});

import ArcType from "../../../Source/Core/ArcType.js";
import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import SceneGISPlanarPolylineGeometry from "../../../Source/SceneGIS/Core/SceneGISPlanarPolylineGeometry.js";

describe("SceneGIS/Core/SceneGISPlanarPolylineGeometry", function () {
  it("uses cumulative XYZ length and a single closed-loop seam", function () {
    const points = [
      new Cartesian3(0, 0, 0),
      new Cartesian3(3, 0, 4),
      new Cartesian3(3, 12, 4),
      new Cartesian3(0, 0, 0),
    ];
    const attributes = new SceneGISPlanarPolylineGeometry({
      positions: points,
      width: 12,
    })._createGeometry().attributes;
    const total = 5 + 12 + 13;
    expect(attributes.st.values[4]).toEqualEpsilon(5 / total, 1e-7);
    expect(attributes.st.values[12]).toEqualEpsilon(17 / total, 1e-7);
    expect(Array.from(attributes.st.values.slice(-4))).toEqual([1, 0, 1, 1]);
    expect(Array.from(attributes.prevPosition.values.slice(0, 3))).toEqual([
      3, 12, 4,
    ]);
    expect(Array.from(attributes.nextPosition.values.slice(-3))).toEqual([
      3, 0, 4,
    ]);
  });

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

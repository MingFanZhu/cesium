import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import ComponentDatatype from "../../../Source/Core/ComponentDatatype.js";
import PrimitiveType from "../../../Source/Core/PrimitiveType.js";
import SceneGISPlanarPolygonGeometry from "../../../Source/SceneGIS/Core/SceneGISPlanarPolygonGeometry.js";

describe("SceneGIS/Core/SceneGISPlanarPolygonGeometry", function () {
  const outer = [
    new Cartesian3(10000000, 10000000, 10),
    new Cartesian3(10000100, 10000000, 10),
    new Cartesian3(10000100, 10000100, 10),
    new Cartesian3(10000000, 10000100, 10),
  ];

  it("snapshots, normalizes closure, triangulates holes, and rebases", function () {
    const hole = [
      new Cartesian3(10000020, 10000020, 10),
      new Cartesian3(10000040, 10000020, 10),
      new Cartesian3(10000040, 10000040, 10),
      new Cartesian3(10000020, 10000040, 10),
    ];
    const geometry = new SceneGISPlanarPolygonGeometry({
      positions: [...outer, outer[0]],
      holes: [hole],
    });
    outer[0].x = 0;
    expect(geometry.positions.length).toBe(4);
    expect(geometry.holes.length).toBe(1);
    expect(geometry.origin.x).toBe(10000000);
    const created = geometry._createGeometry();
    expect(created.primitiveType).toBe(PrimitiveType.TRIANGLES);
    expect(created.attributes.position.componentDatatype).toBe(
      ComponentDatatype.DOUBLE,
    );
    expect(created.indices.length).toBeGreaterThan(6);
  });

  it("creates caps and sides for matching bottom vertices", function () {
    const bottom = outer.map((p) => new Cartesian3(p.x, p.y, 0));
    const geometry = new SceneGISPlanarPolygonGeometry({
      positions: outer,
      bottomPositions: bottom,
    });
    expect(geometry._createGeometry().indices.length).toBe(36);
  });

  it("rejects invalid topology and derived values", function () {
    expect(function () {
      return new SceneGISPlanarPolygonGeometry({
        positions: [outer[0], outer[1], outer[1]],
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarPolygonGeometry({
        positions: outer,
        holes: [
          [
            new Cartesian3(20000000, 0, 0),
            new Cartesian3(20000001, 0, 0),
            new Cartesian3(20000000, 1, 0),
          ],
        ],
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarPolygonGeometry({
        positions: outer,
        origin: new Cartesian3(Number.NaN, 0, 0),
      });
    }).toThrowDeveloperError();
  });
});

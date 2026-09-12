import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import SceneGISPlanarWallGeometry from "../../../Source/SceneGIS/Core/SceneGISPlanarWallGeometry.js";

describe("SceneGIS/Core/SceneGISPlanarWallGeometry", function () {
  it("snapshots a large-offset route and creates hard-normal wall segments", function () {
    const positions = [
      new Cartesian3(20000000, -20000000, 10),
      new Cartesian3(20000020, -20000000, 20),
      new Cartesian3(20000020, -19999980, 30),
    ];
    const geometry = new SceneGISPlanarWallGeometry({ positions });
    positions[0].x = 0;
    expect(geometry.positions[0].x).toBe(20000000);
    const created = geometry._createGeometry();
    expect(created.attributes.position.values.length).toBe(24);
    expect(created.attributes.normal.values.length).toBe(24);
    expect(created.indices.length).toBe(12);
    expect(geometry._getOutlinePositions().length).toBe(5);
    expect(geometry._getLocalBoundingSphere().radius).toBeGreaterThan(0);
  });

  it("supports explicit heights and rejects invalid wall topology", function () {
    const geometry = new SceneGISPlanarWallGeometry({
      positions: [Cartesian3.ZERO, Cartesian3.UNIT_X],
      minimumHeights: [-2, -1],
      maximumHeights: [3, 4],
    });
    expect(geometry.minimumHeights).toEqual([-2, -1]);
    expect(geometry.maximumHeights).toEqual([3, 4]);
    expect(function () {
      return new SceneGISPlanarWallGeometry({
        positions: [Cartesian3.ZERO, new Cartesian3(0, 0, 1)],
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarWallGeometry({
        positions: [Cartesian3.ZERO, Cartesian3.UNIT_X],
        minimumHeights: [2, 0],
        maximumHeights: [1, 1],
      });
    }).toThrowDeveloperError();
  });
});

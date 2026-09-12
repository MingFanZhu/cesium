import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import SceneGISPlanarCylinderGeometry from "../../../Source/SceneGIS/Core/SceneGISPlanarCylinderGeometry.js";

describe("SceneGIS/Core/SceneGISPlanarCylinderGeometry", function () {
  it("snapshots options and creates a finite local mesh", function () {
    const geometry = new SceneGISPlanarCylinderGeometry({
      center: new Cartesian3(10000000, -10000000, 50),
      length: 12,
      topRadius: 2,
      bottomRadius: 4,
      slices: 16,
    });
    expect(geometry.length).toBe(12);
    expect(geometry.slices).toBe(16);
    expect(geometry._createGeometry().attributes.normal).toBeDefined();
    expect(geometry._getLocalBoundingSphere().radius).toBeCloseTo(
      Math.hypot(4, 6),
      12,
    );
  });

  it("rejects degenerate dimensions and subdivisions", function () {
    expect(function () {
      return new SceneGISPlanarCylinderGeometry({
        center: Cartesian3.ZERO,
        length: 1,
        topRadius: 0,
        bottomRadius: 0,
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarCylinderGeometry({
        center: Cartesian3.ZERO,
        length: 1,
        topRadius: 1,
        bottomRadius: 1,
        slices: 3.5,
      });
    }).toThrowDeveloperError();
  });
});

import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import SceneGISPlanarEllipsoidGeometry from "../../../Source/SceneGIS/Core/SceneGISPlanarEllipsoidGeometry.js";

describe("SceneGIS/Core/SceneGISPlanarEllipsoidGeometry", function () {
  it("snapshots a full ellipsoid and creates position/normal geometry", function () {
    const radii = new Cartesian3(3, 5, 7);
    const geometry = new SceneGISPlanarEllipsoidGeometry({
      center: new Cartesian3(20000000, 20000000, 40),
      radii,
      stackPartitions: 8,
      slicePartitions: 12,
    });
    radii.z = 1;
    expect(geometry.radii.z).toBe(7);
    expect(geometry.stackPartitions).toBe(8);
    expect(geometry._createGeometry().attributes.normal).toBeDefined();
    expect(geometry._getLocalBoundingSphere().radius).toBe(7);
  });

  it("rejects partial or degenerate option values by construction shape", function () {
    expect(function () {
      return new SceneGISPlanarEllipsoidGeometry({
        center: Cartesian3.ZERO,
        radii: new Cartesian3(1, -1, 1),
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarEllipsoidGeometry({
        center: Cartesian3.ZERO,
        radii: Cartesian3.ONE,
        stackPartitions: 2,
      });
    }).toThrowDeveloperError();
  });
});

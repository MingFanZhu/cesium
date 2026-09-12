import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import SceneGISPlanarBoxGeometry from "../../../Source/SceneGIS/Core/SceneGISPlanarBoxGeometry.js";

describe("SceneGIS/Core/SceneGISPlanarBoxGeometry", function () {
  it("snapshots a large-offset center and creates local position/normal geometry", function () {
    const center = new Cartesian3(20000000, -20000000, 30);
    const dimensions = new Cartesian3(4, 6, 8);
    const geometry = new SceneGISPlanarBoxGeometry({ center, dimensions });
    center.x = 0;
    dimensions.z = 1;
    expect(geometry.center.x).toBe(20000000);
    expect(geometry.dimensions.z).toBe(8);
    const created = geometry._createGeometry();
    expect(created.attributes.position).toBeDefined();
    expect(created.attributes.normal).toBeDefined();
    expect(geometry._getLocalBoundingSphere().radius).toBeCloseTo(
      Math.sqrt(29),
      12,
    );
  });

  it("rejects invalid centers and dimensions", function () {
    expect(function () {
      return new SceneGISPlanarBoxGeometry({
        center: Cartesian3.ZERO,
        dimensions: new Cartesian3(1, 0, 1),
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarBoxGeometry({
        center: new Cartesian3(Number.NaN, 0, 0),
        dimensions: Cartesian3.ONE,
      });
    }).toThrowDeveloperError();
  });
});

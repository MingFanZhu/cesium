import Cartesian2 from "../../../Source/Core/Cartesian2.js";
import Cartesian3 from "../../../Source/Core/Cartesian3.js";
import CornerType from "../../../Source/Core/CornerType.js";
import SceneGISPlanarPolylineVolumeGeometry from "../../../Source/SceneGIS/Core/SceneGISPlanarPolylineVolumeGeometry.js";

const square = [
  new Cartesian2(-1, -2),
  new Cartesian2(1, -2),
  new Cartesian2(1, 2),
  new Cartesian2(-1, 2),
];

function expectOutwardNormals(geometry) {
  const created = geometry._createGeometry();
  const positions = created.attributes.position.values;
  const normals = created.attributes.normal.values;
  const volumeCenter = new Cartesian3(5, 0, 0);
  for (let i = 0; i < positions.length; i += 9) {
    const triangleCenter = new Cartesian3(
      (positions[i] + positions[i + 3] + positions[i + 6]) / 3.0,
      (positions[i + 1] + positions[i + 4] + positions[i + 7]) / 3.0,
      (positions[i + 2] + positions[i + 5] + positions[i + 8]) / 3.0,
    );
    const outward = Cartesian3.subtract(
      triangleCenter,
      volumeCenter,
      new Cartesian3(),
    );
    const normal = Cartesian3.fromArray(normals, i);
    expect(Cartesian3.dot(outward, normal)).toBeGreaterThan(0.0);
  }
}

describe("SceneGIS/Core/SceneGISPlanarPolylineVolumeGeometry", function () {
  it("creates finite closed sweeps for all planar corner types", function () {
    for (const cornerType of [
      CornerType.MITERED,
      CornerType.BEVELED,
      CornerType.ROUNDED,
    ]) {
      const geometry = new SceneGISPlanarPolylineVolumeGeometry({
        polylinePositions: [
          new Cartesian3(20000000, -20000000, 30),
          new Cartesian3(20000020, -20000000, 32),
          new Cartesian3(20000020, -19999980, 34),
        ],
        shapePositions: square,
        cornerType,
        cornerGranularity: Math.PI / 8,
      });
      const created = geometry._createGeometry();
      expect(created.indices.length).toBeGreaterThan(0);
      expect(
        created.attributes.position.values.every(Number.isFinite),
      ).toBeTrue();
      expect(
        created.attributes.normal.values.every(Number.isFinite),
      ).toBeTrue();
      expect(geometry._getOutlinePositions().length).toBe(6);
      expect(geometry._getLocalBoundingSphere().radius).toBeGreaterThan(0);
    }
  });

  it("snapshots input and rejects invalid route and shape topology", function () {
    const route = [new Cartesian3(), new Cartesian3(1, 0, 0)];
    const geometry = new SceneGISPlanarPolylineVolumeGeometry({
      polylinePositions: route,
      shapePositions: [...square, square[0]],
    });
    route[0].x = 10;
    expect(geometry.polylinePositions[0]).toEqual(Cartesian3.ZERO);
    expect(geometry.shapePositions.length).toBe(4);
    expect(function () {
      return new SceneGISPlanarPolylineVolumeGeometry({
        polylinePositions: [
          Cartesian3.ZERO,
          Cartesian3.UNIT_X,
          Cartesian3.ZERO,
        ],
        shapePositions: square,
      });
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarPolylineVolumeGeometry({
        polylinePositions: route,
        shapePositions: [Cartesian2.ZERO, Cartesian2.UNIT_X, Cartesian2.ZERO],
      });
    }).toThrowDeveloperError();
  });

  it("canonicalizes clockwise shapes to outward closed volume winding", function () {
    const options = {
      polylinePositions: [Cartesian3.ZERO, new Cartesian3(10, 0, 0)],
      cornerType: CornerType.MITERED,
    };
    const counterClockwise = new SceneGISPlanarPolylineVolumeGeometry({
      ...options,
      shapePositions: square,
    });
    const clockwise = new SceneGISPlanarPolylineVolumeGeometry({
      ...options,
      shapePositions: [...square].reverse(),
    });
    expectOutwardNormals(counterClockwise);
    expectOutwardNormals(clockwise);
    expect(clockwise._createGeometry().indices.length).toBe(
      counterClockwise._createGeometry().indices.length,
    );
    expect(clockwise._getLocalBoundingSphere().radius).toBeCloseTo(
      counterClockwise._getLocalBoundingSphere().radius,
      12,
    );
  });

  it("rejects exact non-axis reversals for every corner type", function () {
    for (const cornerType of [
      CornerType.ROUNDED,
      CornerType.BEVELED,
      CornerType.MITERED,
    ]) {
      expect(function () {
        return new SceneGISPlanarPolylineVolumeGeometry({
          polylinePositions: [
            Cartesian3.ZERO,
            new Cartesian3(1, 2, 0),
            Cartesian3.ZERO,
          ],
          shapePositions: square,
          cornerType,
        });
      }).toThrowDeveloperError();
      expect(function () {
        return new SceneGISPlanarPolylineVolumeGeometry({
          polylinePositions: [
            Cartesian3.ZERO,
            new Cartesian3(1, 2, 0),
            new Cartesian3(0, 0.001, 0),
          ],
          shapePositions: square,
          cornerType,
        });
      }).not.toThrow();
    }
  });
});

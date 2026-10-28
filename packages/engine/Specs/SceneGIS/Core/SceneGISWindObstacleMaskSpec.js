import {
  Cartesian2,
  Cartesian3,
  Matrix4,
  SceneGISWindObstacleMask,
} from "../../../index.js";

describe("SceneGIS/Core/SceneGISWindObstacleMask", function () {
  const ring = [
    [0, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 2],
    [0, 2],
  ].map((p) => new Cartesian2(...p));
  function options() {
    return {
      dimensions: new Cartesian3(4, 4, 4),
      cellSize: 1,
      polygons: [
        {
          positions: ring,
          minimumHeight: 1,
          maximumHeight: 3,
          modelMatrix: Matrix4.fromTranslation(new Cartesian3(1, 1, 0)),
        },
      ],
    };
  }
  it("voxelizes transformed concave prisms by closed cell centers and unions ground", function () {
    const o = options();
    o.groundHeight = 0.5;
    o.polygons.push(o.polygons[0]);
    const mask = SceneGISWindObstacleMask.fromExtrudedPolygons(o);
    expect(mask.reduce((a, b) => a + b, 0)).toEqual(22);
    expect(mask[1 + 4 * (1 + 4 * 1)]).toEqual(1);
    expect(mask[2 + 4 * (2 + 4 * 1)]).toEqual(0);
    expect(mask[1 + 4 * (1 + 4 * 3)]).toEqual(0);
  });
  it("rejects ambiguous rings, holes, scale and invalid grid", function () {
    for (const mutate of [
      (o) =>
        (o.polygons[0].positions = [
          new Cartesian2(0, 0),
          new Cartesian2(2, 2),
          new Cartesian2(0, 2),
          new Cartesian2(2, 0),
        ]),
      (o) => (o.polygons[0].holes = []),
      (o) => (o.polygons[0].modelMatrix = Matrix4.fromUniformScale(2)),
      (o) => (o.dimensions.x = 3),
    ]) {
      const o = options();
      mutate(o);
      expect(() =>
        SceneGISWindObstacleMask.fromExtrudedPolygons(o),
      ).toThrowDeveloperError();
    }
  });
});

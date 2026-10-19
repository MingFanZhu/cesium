import { Cartesian3, SceneGISPlanarPolygonGeometry } from "../../../index.js";
import planAreas from "../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarGroundAreaBatch.js";

describe("SceneGIS/Scene/SceneGISPlanarGroundAreaBatch", function () {
  const left = [
    [0, 0],
    [10, 0],
    [10, 2],
    [2, 2],
    [2, 10],
    [0, 10],
  ];
  const right = [
    [5, 13],
    [13, 13],
    [13, 5],
    [15, 5],
    [15, 15],
    [5, 15],
  ];
  const rectangle = (x, y, size) => [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ];
  function polygon(points, holes = [], offset = 0) {
    const ring = (r) =>
      r.map(([x, y]) => new Cartesian3(x + offset, y + offset, 0));
    return new SceneGISPlanarPolygonGeometry({
      positions: ring(points),
      holes: holes.map(ring),
    });
  }
  function plan(geometries) {
    const extents = geometries.map((geometry) => {
      const points = geometry.positions;
      return {
        minX: Math.min(...points.map((p) => p.x)),
        minY: Math.min(...points.map((p) => p.y)),
        maxX: Math.max(...points.map((p) => p.x)),
        maxY: Math.max(...points.map((p) => p.y)),
      };
    });
    return planAreas(geometries, extents);
  }

  it("accepts common concave voids at large coordinates in either winding", function () {
    for (const offset of [0, 20000000]) {
      for (const reverse of [false, true]) {
        const a = polygon(reverse ? left.slice().reverse() : left, [], offset);
        const b = polygon(right, [], offset);
        expect(plan([a, b])).toEqual({
          order: [0, 1],
          lastConflicts: [-1, -1],
        });
      }
    }
  });

  it("checks diagonal edges instead of treating their boxes as filled", function () {
    const a = polygon([
      [0, 0],
      [10, 0],
      [0, 10],
    ]);
    const b = polygon([
      [6, 15],
      [15, 6],
      [15, 15],
    ]);
    expect(plan([a, b]).lastConflicts).toEqual([-1, -1]);
    const touching = polygon([
      [5, 15],
      [15, 5],
      [15, 15],
    ]);
    expect(plan([a, touching]).lastConflicts).toEqual([-1, 0]);
    const almostTouching = polygon([
      [5 + Number.EPSILON * 4, 15],
      [15, 5 + Number.EPSILON * 4],
      [15, 15],
    ]);
    expect(plan([a, almostTouching]).lastConflicts).toEqual([-1, 0]);
  });

  it("keeps a hole-contained object separate and includes all hole boundaries", function () {
    const outer = polygon(rectangle(0, 0, 10), [rectangle(2, 2, 6)]);
    const inner = polygon(rectangle(3, 3, 2));
    expect(plan([outer, inner]).lastConflicts).toEqual([-1, 0]);
    // A hole outside the common rectangle must not change the outer footprint.
    const a = polygon(left, [rectangle(0.5, 4, 0.5)]);
    expect(plan([a, polygon(right)]).lastConflicts).toEqual([-1, -1]);
    const crossing = polygon([
      [1, 12],
      [12, 1],
      [12, 12],
    ]);
    expect(plan([a, crossing]).lastConflicts).toEqual([-1, 0]);
  });

  it("retains a predecessor contained only by a later concave bbox", function () {
    const a = polygon(rectangle(6, 6, 1));
    const b = polygon(left);
    const c = polygon(right);
    // B contains A's bbox but not its filled region. C is compatible with B
    // while its extent still includes A; deleting A would incorrectly batch A/C.
    expect(plan([a, b, c])).toEqual({
      order: [0, 1, 2],
      lastConflicts: [-1, 0, 0],
    });
  });

  it("transfers constraints through proven rectangle or shared-geometry containment", function () {
    const rectangleGeometry = polygon(rectangle(0, 0, 10));
    const concaveGeometry = polygon(left);
    expect(
      plan([
        polygon(rectangle(3, 3, 1)),
        rectangleGeometry,
        polygon(rectangle(8, 8, 1)),
      ]).lastConflicts,
    ).toEqual([-1, 0, 1]);
    expect(
      plan([concaveGeometry, concaveGeometry, polygon(rectangle(6, 6, 1))])
        .lastConflicts,
    ).toEqual([-1, 0, 1]);
  });

  it("transfers identical XY footprints but retains different rings with the same bbox", function () {
    const a = polygon(left);
    const copy = new SceneGISPlanarPolygonGeometry({
      positions: left.map(([x, y]) => new Cartesian3(x, y, 50)),
    });
    expect(plan([a, copy, polygon(rectangle(6, 6, 1))]).lastConflicts).toEqual([
      -1, 0, 1,
    ]);
    const opposite = polygon([
      [0, 8],
      [8, 8],
      [8, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(plan([opposite, a, polygon(right)])).toEqual({
      order: [0, 1, 2],
      lastConflicts: [-1, 0, 0],
    });
  });

  it("maps the last conflicting predecessor into the reordered instance array", function () {
    const a = polygon(rectangle(0, 0, 4));
    const b = polygon(rectangle(1, 0, 4));
    const c = polygon(rectangle(20, 0, 4));
    const d = polygon(rectangle(21, 0, 4));
    expect(plan([a, b, c, d])).toEqual({
      order: [0, 2, 1, 3],
      lastConflicts: [-1, -1, 0, 1],
    });
    const bridge = polygon(rectangle(3, 0, 20));
    expect(plan([a, b, c, d, bridge])).toEqual({
      order: [0, 2, 1, 3, 4],
      lastConflicts: [-1, -1, 0, 1, 3],
    });
  });
});

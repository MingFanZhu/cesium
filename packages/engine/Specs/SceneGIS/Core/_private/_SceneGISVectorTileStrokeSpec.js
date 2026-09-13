import stroke from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorTileStroke.js";

describe("SceneGIS/Core/_private/SceneGISVectorTileStroke", function () {
  const coordinates = { toLocal: (x, y) => ({ x, y, z: 0 }) };
  function make(part, layout = {}, closed = false, width = 12) {
    return stroke(
      new Float64Array(part),
      coordinates,
      closed,
      { "line-width": width },
      layout,
      [0, 0, 0],
    );
  }
  it("preserves borrowed coordinates and ignores zero-length paths and duplicate stations", function () {
    const part = new Float64Array([0, 0, 0, 0, 40, 0, 40, 0]);
    const result = stroke(
      part,
      coordinates,
      false,
      { "line-width": 12 },
      {},
      [0, 0, 0],
    );
    expect(Array.from(part)).toEqual([0, 0, 0, 0, 40, 0, 40, 0]);
    expect(result.attributes.position.values.length).toBe(
      make([0, 0, 40, 0]).attributes.position.values.length,
    );
    expect(make([0, 0, 0, 0])).toBeUndefined();
    expect(make([0, 0, 40, 0], {}, false, 0)).toBeUndefined();
  });
  it("bounds a sharp miter by the configured join limit", function () {
    const part = [-40, 0, 0, 0, -30, 10];
    const limited = make(part, { "line-miter-limit": 2 });
    const extended = make(part, { "line-miter-limit": 10 });
    const maximum = (geometry) =>
      Math.max(...geometry.attributes.lineExtrude.values.map(Math.abs));
    expect(maximum(limited)).toBeLessThan(2);
    expect(maximum(extended)).toBeGreaterThan(5);
  });
  it("keeps reversal and closed-ring meshes finite with valid indices and continuous total length", function () {
    for (const join of ["miter", "bevel", "round"]) {
      for (const closed of [false, true]) {
        const result = make(
          [0, 0, 40, 0, 0, 0, 0, 40],
          { "line-join": join },
          closed,
        );
        for (const a of Object.values(result.attributes)) {
          expect(Array.from(a.values).every(Number.isFinite)).toBeTrue();
        }
        expect(Math.max(...result.indices)).toBeLessThan(
          result.attributes.position.values.length / 3,
        );
        if (closed) {
          expect(result.attributes.lineEnds.values[0]).toBe(-1);
          const metrics = result.attributes.lineMetrics.values;
          expect(metrics[metrics.length - 2]).toBe(160);
        }
      }
    }
  });
});

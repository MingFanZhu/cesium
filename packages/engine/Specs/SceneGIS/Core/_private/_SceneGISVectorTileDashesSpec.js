import Dashes from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorTileDashes.js";

describe("SceneGIS/Core/_private/SceneGISVectorTileDashes", function () {
  it("deduplicates patterns with linear storage and preserves absent solid lines", function () {
    const table = new Dashes();
    expect(table.add(undefined)).toEqual([0, 0, 0]);
    const first = table.add([2, 3, 4, 5]);
    expect(first).toEqual([0, 2, 14]);
    expect(table.add([2, 3, 4, 5])).toBe(first);
    expect(table.values).toEqual([0, 2, 0, 0, 5, 9, 0, 0]);
    expect(table.add([1, 1])).toEqual([2, 1, 2]);
  });
  it("joins odd-array end dashes across the period and preserves zero-length dots", function () {
    const table = new Dashes();
    expect(table.add([2, 3, 1])).toEqual([0, 2, 6]);
    expect(table.values).toEqual([-1, 2, 0, 0, 5, 6, 0, 0]);
    expect(table.add([0, 3])).toEqual([2, 1, 3]);
    expect(table.values.slice(8)).toEqual([0, 0, 0, 0]);
  });
  it("rejects undefined periodic distances without mutating an existing table", function () {
    const table = new Dashes();
    table.add([1, 2]);
    for (const array of [[], [0, 0], [-1, 2], [NaN, 2], [Infinity, 1]]) {
      expect(() => table.add(array)).toThrowDeveloperError();
    }
    expect(table.values).toEqual([0, 1, 0, 0]);
  });
});

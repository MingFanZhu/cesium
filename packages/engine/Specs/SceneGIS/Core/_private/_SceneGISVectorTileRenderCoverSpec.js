import cover from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorTileRenderCover.js";

describe("SceneGIS/Core/_private/SceneGISVectorTileRenderCover", function () {
  function tile(x, y, level, published = false) {
    return { x, y, level, signature: published ? "ready" : undefined };
  }
  it("clips the nearest published ancestor to each missing desired region", function () {
    const root = tile(0, 0, 0, true);
    const parent = tile(0, 0, 1, true);
    const exact = tile(0, 0, 2, true);
    const missing = tile(1, 0, 2);
    const regions = cover.select(
      [exact, missing],
      [root, parent, exact, missing],
    );
    expect(regions).toEqual([
      { entry: exact, region: exact },
      { entry: parent, region: missing },
    ]);
    expect(regions[1].region).toBe(missing);
  });
  it("uses disjoint descendants when no ancestor is available and preserves unknown holes", function () {
    const target = tile(0, 0, 0);
    const child = tile(0, 0, 1, true);
    const redundant = tile(1, 1, 2, true);
    const deep = tile(3, 3, 2, true);
    expect(cover.select([target], [target, child, redundant, deep])).toEqual([
      { entry: child, region: child },
      { entry: deep, region: deep },
    ]);
  });
  it("treats a published empty tile as exact coverage and never treats failure as empty", function () {
    const parent = tile(0, 0, 0, true);
    const exact = tile(0, 0, 1, true);
    exact.data = { layers: [] };
    expect(cover.select([exact], [parent, exact])[0].entry).toBe(exact);
    exact.signature = undefined;
    exact.state = "failed";
    expect(cover.select([exact], [parent, exact])[0].entry).toBe(parent);
    expect(cover.select([exact], [exact])).toEqual([]);
  });
});

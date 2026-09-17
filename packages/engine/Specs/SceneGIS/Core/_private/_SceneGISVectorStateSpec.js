import { Color, SceneGISVectorTileStyle } from "../../../../index.js";
import State from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorState.js";

describe("SceneGIS/Core/SceneGISVectorState", function () {
  function definition() {
    return {
      version: 8,
      sources: { s: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
      layers: [
        {
          id: "fill",
          type: "fill",
          source: "s",
          "source-layer": "a",
          paint: {
            "fill-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "red",
              ["coalesce", ["global-state", "color"], "blue"],
            ],
          },
        },
      ],
    };
  }
  it("evaluates state through explicit context and keeps compiled styles shareable", function () {
    const style = new SceneGISVectorTileStyle(definition());
    const feature = { id: "1", type: 3, properties: {} };
    expect(style.evaluateLayer("fill", feature, 4).paint["fill-color"]).toEqual(
      Color.BLUE,
    );
    expect(
      style.evaluateLayer("fill", feature, 4, {
        featureState: { selected: true },
      }).paint["fill-color"],
    ).toEqual(Color.RED);
    expect(
      style.evaluateLayer("fill", feature, 4, {
        globalState: { color: "lime" },
      }).paint["fill-color"],
    ).toEqual(Color.LIME);
    expect(style.evaluateLayer("fill", feature, 4).paint["fill-color"]).toEqual(
      Color.BLUE,
    );
    const old = style._evaluateVisibleLayer("fill", feature, 4);
    const next = style._evaluateVisibleLayer("fill", feature, 4, old, {
      featureState: { selected: true },
    });
    expect(next.value.layout).toBe(old.value.layout);
    expect(next.value.paint["fill-color"]).toEqual(Color.RED);
  });
  it("rejects state in layout/filter and tracks keys without interpreting literal arrays", function () {
    const json = definition();
    json.layers[0].layout = {
      visibility: [
        "case",
        ["boolean", ["global-state", "on"], false],
        "visible",
        "none",
      ],
    };
    expect(
      SceneGISVectorTileStyle.validate(json).some((e) =>
        e.includes("only in paint"),
      ),
    ).toBeTrue();
    delete json.layers[0].layout;
    json.layers[0].filter = ["boolean", ["feature-state", "on"], false];
    expect(
      SceneGISVectorTileStyle.validate(json).some((e) =>
        e.includes("only in paint"),
      ),
    ).toBeTrue();
    const deps = State.dependencies([
      "case",
      ["feature-state", "selected"],
      ["global-state", "color"],
      ["literal", ["feature-state", "ignored"]],
    ]);
    expect([...deps.feature]).toEqual(["selected"]);
    expect([...deps.global]).toEqual(["color"]);
    expect(
      State.dependencies([
        "match",
        ["get", "kind"],
        ["feature-state", "literal"],
        "red",
        "blue",
      ]).feature.size,
    ).toBe(0);
  });
  it("copies JSON without aliasing and rejects unsupported or cyclic values", function () {
    const input = { nested: { x: [1, true, null] } };
    const copy = State.copy(input);
    copy.nested.x[0] = 8;
    expect(input.nested.x[0]).toBe(1);
    const cyclic = {};
    cyclic.self = cyclic;
    for (const value of [
      undefined,
      NaN,
      Infinity,
      1n,
      new Date(),
      cyclic,
      { f: () => 1 },
    ]) {
      expect(() => State.copy(value)).toThrowDeveloperError();
    }
  });
});

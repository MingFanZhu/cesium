import { Color, SceneGISVectorTileStyle } from "../../../index.js";

describe("SceneGIS/Core/SceneGISVectorTileStyle", function () {
  function json(layer = {}) {
    return {
      version: 8,
      sources: { local: { type: "vector", tiles: ["/tiles/{z}/{x}/{y}.mvt"] } },
      layers: [
        {
          id: "roads",
          type: "line",
          source: "local",
          "source-layer": "transportation",
          ...layer,
        },
      ],
    };
  }
  function feature(properties = {}) {
    return { id: "42", type: 2, properties };
  }

  it("preserves layer order and isolates compiled configuration from caller mutation", function () {
    const input = json({ paint: { "line-width": 3 } });
    input.layers.unshift({
      id: "base",
      type: "background",
      paint: { "background-color": "#123456" },
    });
    const style = new SceneGISVectorTileStyle(input);
    input.layers[1].paint["line-width"] = 99;
    input.sources.local.tiles[0] = "changed";
    expect(style.layerIds).toEqual(["base", "roads"]);
    expect(style.profile).toBe("scenegis-vector-v1");
    expect(style.sources.local.tiles[0]).toBe("/tiles/{z}/{x}/{y}.mvt");
    expect(Object.isFrozen(style.sources.local.tiles)).toBe(true);
    expect(style.evaluateLayer("roads", feature(), 4).paint["line-width"]).toBe(
      3,
    );
    expect(
      style.evaluateLayer("base", undefined, 4).paint["background-color"],
    ).toEqual(Color.fromCssColorString("#123456"));
  });

  it("evaluates data colors, rgba alpha, and property dependencies", function () {
    const style = new SceneGISVectorTileStyle(
      json({
        paint: {
          "line-color": [
            "match",
            ["get", "class"],
            ["main", "trunk"],
            "rgba(255,0,0,0.5)",
            "#00ff00",
          ],
        },
      }),
    );
    const result = style.evaluateLayer("roads", feature({ class: "main" }), 2);
    expect(result.paint["line-color"]).toEqual(new Color(1, 0, 0, 0.5));
    expect(style.getPropertyKind("roads", "paint", "line-color")).toBe(
      "source",
    );
    expect(style.getPropertyKind("roads", "paint", "line-width")).toBe(
      "constant",
    );
    expect(
      style.getPropertyKind("roads", "paint", "line-dasharray"),
    ).toBeUndefined();
  });

  it("uses fractional paint zoom and integer layout zoom", function () {
    const style = new SceneGISVectorTileStyle(
      json({
        paint: {
          "line-width": ["interpolate", ["linear"], ["zoom"], 0, 1, 10, 11],
        },
        layout: { "line-cap": ["step", ["zoom"], "butt", 3, "round"] },
      }),
    );
    const result = style.evaluateLayer("roads", feature(), 2.5);
    expect(result.paint["line-width"]).toBe(3.5);
    expect(result.layout["line-cap"]).toBe("butt");
    expect(style.evaluateLayer("roads", feature(), 3).layout["line-cap"]).toBe(
      "round",
    );
    expect(style.getPropertyKind("roads", "paint", "line-width")).toBe(
      "camera",
    );
  });

  it("evaluates composite zoom/property expressions without changing raw data", function () {
    const style = new SceneGISVectorTileStyle(
      json({
        paint: {
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            ["get", "width"],
            10,
            ["*", ["get", "width"], 2],
          ],
        },
      }),
    );
    const data = feature({ width: 4 });
    expect(style.evaluateLayer("roads", data, 5).paint["line-width"]).toBe(6);
    expect(style.getPropertyKind("roads", "paint", "line-width")).toBe(
      "composite",
    );
    expect(data.properties.width).toBe(4);
  });

  it("applies expression and legacy filters with layer zoom and visibility", function () {
    for (const filter of [
      ["==", ["get", "kind"], "road"],
      ["==", "kind", "road"],
    ]) {
      const style = new SceneGISVectorTileStyle(
        json({ filter, minzoom: 2, maxzoom: 4 }),
      );
      expect(
        style.evaluateLayer("roads", feature({ kind: "road" }), 2).show,
      ).toBe(true);
      expect(
        style.evaluateLayer("roads", feature({ kind: "road" }), 4).show,
      ).toBe(false);
      expect(
        style.evaluateLayer("roads", feature({ kind: "water" }), 3).show,
      ).toBe(false);
    }
    const hidden = new SceneGISVectorTileStyle(
      json({ layout: { visibility: "none" } }),
    );
    expect(hidden.evaluateLayer("roads", feature(), 3).show).toBe(false);
  });

  it("filters renderer features before property evaluation and preserves fractional paint with cached integer layout", function () {
    const style = new SceneGISVectorTileStyle(
      json({
        filter: ["==", ["get", "kind"], "road"],
        layout: { "line-cap": ["step", ["zoom"], "butt", 3, "round"] },
        paint: {
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            0,
            ["get", "width"],
            10,
            ["*", ["get", "width"], 2],
          ],
        },
      }),
    );
    const compiled = style._compiled.get("roads");
    const width = spyOn(
      compiled.paint["line-width"],
      "evaluate",
    ).and.callThrough();
    expect(
      style._evaluateVisibleLayer("roads", feature({ kind: "water" }), 2),
    ).toBeUndefined();
    expect(width).not.toHaveBeenCalled();
    const input = feature({ kind: "road", width: 4 });
    const old = style._evaluateVisibleLayer("roads", input, 2.1);
    const next = style._evaluateVisibleLayer("roads", input, 2.7, old);
    expect(next.value).toEqual(style.evaluateLayer("roads", input, 2.7));
    expect(next.value.layout["line-cap"]).toBe("butt");
    expect(next.value.paint["line-width"]).toBeGreaterThan(
      old.value.paint["line-width"],
    );
    const changed = style._evaluateVisibleLayer("roads", input, 3, next);
    expect(changed.value.layout["line-cap"]).toBe("round");
    input.properties.width = 9;
    expect(style.evaluateLayer("roads", input, 0).paint["line-width"]).toBe(9);
  });

  it("keeps IDs and unsafe integer properties lossless in style matching", function () {
    const style = new SceneGISVectorTileStyle(
      json({
        filter: ["==", ["id"], "42"],
        paint: {
          "line-width": ["match", ["get", "serial"], "9007199254740993", 9, 1],
        },
      }),
    );
    const data = feature({ serial: 9007199254740993n });
    expect(style.evaluateLayer("roads", data, 1).show).toBe(true);
    expect(style.evaluateLayer("roads", data, 1).paint["line-width"]).toBe(9);
    expect(data.properties.serial).toBe(9007199254740993n);
  });

  it("preserves the specification default for missing runtime values", function () {
    spyOn(console, "warn");
    const style = new SceneGISVectorTileStyle(
      json({ paint: { "line-width": ["get", "missing"] } }),
    );
    expect(style.evaluateLayer("roads", feature(), 1).paint["line-width"]).toBe(
      1,
    );
    const guarded = new SceneGISVectorTileStyle(
      json({ paint: { "line-width": ["coalesce", ["get", "missing"], 5] } }),
    );
    expect(
      guarded.evaluateLayer("roads", feature(), 1).paint["line-width"],
    ).toBe(5);
  });

  it("supports constant dash arrays without exposing mutable compiled arrays", function () {
    const style = new SceneGISVectorTileStyle(
      json({ paint: { "line-dasharray": [2, 3] } }),
    );
    style.evaluateLayer("roads", feature(), 1).paint["line-dasharray"][0] = 100;
    expect(
      style.evaluateLayer("roads", feature(), 1).paint["line-dasharray"],
    ).toEqual([2, 3]);
  });

  it("computes fill and circle values as frontend capabilities", function () {
    const fill = new SceneGISVectorTileStyle(
      json({
        type: "fill",
        paint: { "fill-color": "#00f", "fill-opacity": 0.4 },
      }),
    );
    expect(
      fill.evaluateLayer("roads", { ...feature(), type: 3 }, 1).paint[
        "fill-opacity"
      ],
    ).toBe(0.4);
    const circle = new SceneGISVectorTileStyle(
      json({
        type: "circle",
        paint: { "circle-radius": 8, "circle-stroke-width": 2 },
      }),
    );
    expect(
      circle.evaluateLayer("roads", { ...feature(), type: 1 }, 1).paint[
        "circle-radius"
      ],
    ).toBe(8);
  });

  it("returns path-bearing diagnostics for unsupported layers, properties, operators, and TileJSON", function () {
    const cases = [
      [json({ type: "fill-extrusion" }), "layers[0].type"],
      [
        json({ paint: { "line-pattern": "road" } }),
        "layers[0].paint.line-pattern",
      ],
      [
        json({ paint: { "line-width": ["feature-state", "width"] } }),
        "layers[0].paint.line-width[0]",
      ],
      [{ ...json(), imports: [] }, "style.imports"],
      [
        {
          ...json(),
          sources: { local: { type: "vector", url: "/tiles.json" } },
        },
        "sources.local",
      ],
      [
        json({
          paint: {
            "line-width": {
              stops: [
                [0, 1],
                [4, 2],
              ],
            },
          },
        }),
        "legacy style function",
      ],
    ];
    for (const [input, path] of cases) {
      expect(SceneGISVectorTileStyle.validate(input).join("\n")).toContain(
        path,
      );
      expect(() => new SceneGISVectorTileStyle(input)).toThrowDeveloperError();
    }
  });

  it("rejects wrong property types, literal ranges, and expression syntax", function () {
    for (const paint of [
      { "line-width": -1 },
      { "line-color": "not-a-color" },
      { "line-width": ["get"] },
    ]) {
      expect(
        SceneGISVectorTileStyle.validate(json({ paint })).length,
      ).toBeGreaterThan(0);
      expect(
        () => new SceneGISVectorTileStyle(json({ paint })),
      ).toThrowDeveloperError();
    }
    expect(SceneGISVectorTileStyle.validate(json())).toEqual([]);
  });

  it("rejects non-JSON input and invalid evaluation arguments", function () {
    expect(
      SceneGISVectorTileStyle.validate({ ...json(), metadata: { x: NaN } })
        .length,
    ).toBeGreaterThan(0);
    const style = new SceneGISVectorTileStyle(json());
    expect(() =>
      style.evaluateLayer("missing", feature(), 1),
    ).toThrowDeveloperError();
    expect(() =>
      style.evaluateLayer("roads", undefined, 1),
    ).toThrowDeveloperError();
    expect(() =>
      style.evaluateLayer("roads", feature(), Infinity),
    ).toThrowDeveloperError();
  });
});

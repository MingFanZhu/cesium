import { RuntimeError, SceneGISVectorTileStyle } from "../../../../index.js";
import IconFit from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorIconFit.js";
import Layout from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorSymbolLayout.js";
import { glyph } from "../vectorSymbolFixture.js";

describe("SceneGIS/Core/SceneGISVectorIconFit", function () {
  const image = { x: 10, y: 20, width: 20, height: 10, pixelRatio: 1 };
  function prepare(mode = "both", metadata = image, extra = {}) {
    const style = new SceneGISVectorTileStyle({
      version: 8,
      glyphs: "/{fontstack}/{range}.pbf",
      sprite: "/sprite",
      sources: { test: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
      layers: [
        {
          id: "label",
          type: "symbol",
          source: "test",
          "source-layer": "data",
          layout: {
            "text-field": "AA",
            "text-font": ["Test"],
            "text-size": 24,
            "icon-image": "shield",
            "icon-text-fit": mode,
            "icon-text-fit-padding": [1, 2, 3, 4],
            ...extra,
          },
        },
      ],
    });
    const layout = style.evaluateLayer(
      "label",
      { type: 1, properties: {} },
      0,
    ).layout;
    const text = Layout.text("AA", layout, (code) => ({
      glyph: glyph(code),
      rect: { x: 0, y: 0, width: 18, height: 24 },
      page: "glyph",
    }));
    return mode === "none"
      ? Layout.icon(metadata, "sprite", layout)
      : IconFit.prepare(metadata, "sprite", layout, text);
  }
  it("fits width/height/both using logical text size and four-edge padding, while none stays natural", function () {
    expect(prepare("none").box).toEqual([-10, -5, 10, 5]);
    for (const [mode, expected] of [
      ["width", [-20, -5, 18, 5]],
      ["height", [-10, -15.4, 10, 17.4]],
      ["both", [-20, -15.4, 18, 17.4]],
    ]) {
      const shape = IconFit.scale(prepare(mode), 1, 1);
      shape.box.forEach((value, i) =>
        expect(value).toBeCloseTo(expected[i], 10),
      );
      expect(shape.quads.length).toBe(1);
      expect(shape.quads[0].rect).toEqual({
        x: 10,
        y: 20,
        width: 20,
        height: 10,
      });
    }
  });
  it("ignores icon anchor for fit, respects offset, pixelRatio and independently varying sizes", function () {
    const shape = prepare(
      "width",
      { ...image, width: 40, height: 20, pixelRatio: 2 },
      {
        "icon-anchor": "bottom-right",
        "icon-offset": [2, 3],
      },
    );
    expect(IconFit.scale(shape, 0.5, 2).box).toEqual([-20, -4, 24, 16]);
    expect(IconFit.scale(shape, 1, 0).quads.length).toBe(0);
  });
  it("preserves multiple fixed bands and exterior borders, including below the minimum content size", function () {
    const shape = prepare(
      "both",
      {
        ...image,
        width: 32,
        height: 24,
        content: [4, 4, 28, 20],
        stretchX: [
          [4, 12],
          [20, 28],
        ],
        stretchY: [[4, 20]],
      },
      { "icon-text-fit-padding": [0, 0, 0, 0] },
    );
    const normal = IconFit.scale(shape, 1, 1);
    expect(normal.quads.length).toBe(15);
    expect(normal.box[2] - normal.box[0]).toBe(40);
    expect(normal.quads[0].box[2] - normal.quads[0].box[0]).toBe(4);
    expect(normal.quads[6].box[2] - normal.quads[6].box[0]).toBe(8);
    const large = IconFit.scale(shape, 1, 2);
    expect(large.quads[0].box[2] - large.quads[0].box[0]).toBe(4);
    expect(large.box[2] - large.box[0]).toBe(72);
    const tiny = IconFit.scale(shape, 0.01, 1);
    expect(tiny.box[2] - tiny.box[0]).toBe(16);
    expect(
      tiny.quads.every(
        (q) =>
          q.box.every(Number.isFinite) &&
          q.box[2] >= q.box[0] &&
          q.box[3] >= q.box[1],
      ),
    ).toBeTrue();
  });
  it("reports malformed content/stretch metadata and unsupported proportional constraints", function () {
    for (const metadata of [
      { content: [5, 0, 4, 8] },
      { content: [0, 0, 30, 5] },
      {
        stretchX: [
          [4, 8],
          [7, 12],
        ],
      },
      { stretchY: [] },
      { stretchX: [[0, 25]] },
      { content: [0, 0, 2, 2], stretchX: [[4, 8]] },
      { textFitWidth: "proportional" },
    ]) {
      expect(() => prepare("both", { ...image, ...metadata })).toThrowError(
        RuntimeError,
      );
    }
  });
});

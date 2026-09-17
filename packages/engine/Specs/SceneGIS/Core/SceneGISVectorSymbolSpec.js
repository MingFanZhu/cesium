import { RuntimeError, SceneGISVectorTileStyle } from "../../../index.js";
import Glyphs from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorGlyphs.js";
import Layout from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorSymbolLayout.js";
import { encodeGlyphs, glyph } from "./vectorSymbolFixture.js";

describe("SceneGIS/Core/SceneGISVectorSymbol", function () {
  function input(layout = {}) {
    return {
      version: 8,
      glyphs: "/{fontstack}/{range}.pbf",
      sprite: "/sprite",
      sources: { local: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
      layers: [
        {
          id: "labels",
          type: "symbol",
          source: "local",
          "source-layer": "data",
          layout: { "text-font": ["Test"], ...layout },
        },
      ],
    };
  }
  function evaluate(layout = {}, zoom = 2.5) {
    return new SceneGISVectorTileStyle(input(layout)).evaluateLayer(
      "labels",
      { id: "42", type: 1, properties: { name: "A中", icon: "hospital" } },
      zoom,
    ).layout;
  }
  function lookup(code) {
    const g = glyph(code);
    return { glyph: g, rect: { x: 1, y: 1, width: 18, height: 24 }, page: {} };
  }
  it("decodes signed bearings and omitted whitespace bitmap, then packs a padded atlas", function () {
    const decoded = Glyphs.decode(
      encodeGlyphs([
        glyph(),
        { id: 32, width: 0, height: 0, left: 0, top: -26, advance: 6 },
      ]),
    );
    expect(decoded.get(65).top).toBe(-8);
    expect(decoded.get(32).bitmap.length).toBe(0);
    const page = Glyphs.pack(decoded),
      rect = page.positions.get(65);
    expect(page.width).toBe(512);
    expect(page.arrayBufferView[(rect.y + 3) * 512 + rect.x + 3]).toBe(255);
    expect(page.arrayBufferView[rect.y * 512 + rect.x]).toBe(0);
    expect(page.positions.has(32)).toBeFalse();
  });
  it("rejects truncated messages, duplicate IDs and mismatched bitmap dimensions", function () {
    const bytes = encodeGlyphs();
    for (const invalid of [
      bytes.subarray(0, bytes.length - 1),
      encodeGlyphs([glyph(), glyph()]),
      encodeGlyphs([{ ...glyph(), bitmap: new Uint8Array(2) }]),
    ]) {
      expect(() => Glyphs.decode(invalid)).toThrowError(RuntimeError);
    }
  });
  it("resolves tokens and returns plain font and four-edge padding arrays", function () {
    const l = evaluate({
      "text-field": "{name} / {missing}",
      "icon-image": "{icon}",
      "icon-padding": [1, 2, 3, 4],
    });
    expect(l["text-field"]).toBe("A中 / ");
    expect(l["icon-image"]).toBe("hospital");
    expect(l["text-font"]).toEqual(["Test"]);
    expect(l["icon-padding"]).toEqual([1, 2, 3, 4]);
    const s = new SceneGISVectorTileStyle(input());
    expect(s.glyphs).toBe("/{fontstack}/{range}.pbf");
    expect(s.sprite).toBe("/sprite");
  });
  it("uses exact fractional zoom for both symbol sizes while other layout uses floor zoom", function () {
    const l = evaluate({
      "text-size": ["interpolate", ["linear"], ["zoom"], 0, 10, 10, 30],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 0, 1, 10, 3],
      "text-offset": [
        "step",
        ["zoom"],
        ["literal", [0, 0]],
        2.2,
        ["literal", [1, 1]],
      ],
    });
    expect(l["text-size"]).toBe(15);
    expect(l["icon-size"]).toBe(1.5);
    expect(l["text-offset"]).toEqual([0, 0]);
  });
  it("rejects unimplemented rich text and anchor-offset collections at construction", function () {
    for (const l of [
      { "text-variable-anchor-offset": ["top", [0, 1]] },
      { "text-field": ["format", "A", {}] },
      { "icon-text-fit": "invalid" },
    ]) {
      expect(
        () => new SceneGISVectorTileStyle(input(l)),
      ).toThrowDeveloperError();
    }
  });
  it("directs radial and variable offsets using anchor edges and preserves ordinary offsets", function () {
    const base = { "text-field": "A", "text-size": 24 };
    for (const [anchor, x, y] of [
      ["left", 24, 0],
      ["top", 0, 17],
      ["bottom-right", -24 / Math.SQRT2, -24 / Math.SQRT2 + 7],
    ]) {
      const normal = Layout.text(
        "A",
        evaluate({ ...base, "text-anchor": anchor }),
        lookup,
      );
      const radial = Layout.text(
        "A",
        evaluate({ ...base, "text-anchor": anchor, "text-radial-offset": 1 }),
        lookup,
      );
      expect(radial.box[0] - normal.box[0]).toBeCloseTo(x, 10);
      expect(radial.box[1] - normal.box[1]).toBeCloseTo(y, 10);
    }
    const variable = evaluate({
      ...base,
      "text-variable-anchor": ["top-left", "bottom"],
      "text-anchor": "top-left",
      "text-offset": [-2, -1],
    });
    const normal = Layout.text(
      "A",
      evaluate({ ...base, "text-anchor": "top-left" }),
      lookup,
    );
    const offset = Layout.text("A", variable, lookup);
    expect(offset.box[0] - normal.box[0]).toBe(48);
    expect(offset.box[1] - normal.box[1]).toBeCloseTo(17, 10);
    const zero = Layout.text(
      "A",
      { ...variable, "text-radial-offset": 0 },
      lookup,
    );
    expect(zero.box[0]).toBe(normal.box[0]);
    expect(zero.box[1] - normal.box[1]).toBeCloseTo(-7, 10);
  });
  it("uses each variable anchor for multiline auto justification and validates point-only anchors", function () {
    const l = evaluate({
      "text-field": "AA\\nA",
      "text-size": 24,
      "text-variable-anchor": ["left", "right"],
      "text-justify": "auto",
    });
    const left = Layout.text("AA\nA", { ...l, "text-anchor": "left" }, lookup);
    const right = Layout.text(
      "AA\nA",
      { ...l, "text-anchor": "right" },
      lookup,
    );
    expect(left.quads[2].box[0]).toBe(left.quads[0].box[0]);
    expect(right.quads[2].box[2]).toBe(right.quads[1].box[2]);
    expect(() =>
      evaluate({ "text-field": "A", "text-variable-anchor": ["invalid"] }),
    ).toThrowDeveloperError();
    expect(() =>
      evaluate({
        "text-field": "A",
        "symbol-placement": "line",
        "text-variable-anchor": ["top"],
      }),
    ).toThrowDeveloperError();
  });
  it("positions 24-em metrics around the baseline and respects anchor/offset", function () {
    const centered = Layout.text("A", evaluate({ "text-size": 24 }), lookup);
    expect(centered.box).toEqual([-11, -12, 7, 12]);
    const top = Layout.text(
      "A",
      evaluate({
        "text-size": 24,
        "text-anchor": "top",
        "text-offset": [1, 2],
      }),
      lookup,
    );
    expect(top.box[0] - centered.box[0]).toBe(24);
    expect(top.box[1] - centered.box[1]).toBeCloseTo(62.4, 10);
  });
  it("keeps Latin words intact and breaks CJK or explicit newlines with line-height", function () {
    const l = evaluate({
      "text-size": 24,
      "text-max-width": 1,
      "text-line-height": 1.5,
    });
    expect(Layout.text("AB", l, lookup).quads[0].box[1]).toBe(
      Layout.text("AB", l, lookup).quads[1].box[1],
    );
    for (const text of ["中中", "A\nA"]) {
      const q = Layout.text(text, l, lookup).quads;
      expect(q[1].box[1] - q[0].box[1]).toBe(36);
    }
  });
  it("places icons in CSS pixels using sprite pixelRatio and icon offset", function () {
    const icon = Layout.icon(
      { x: 0, y: 0, width: 40, height: 20, pixelRatio: 2 },
      {},
      evaluate({ "icon-size": 1.5, "icon-offset": [2, 4] }),
    );
    expect(icon.box).toEqual([-12, -1.5, 18, 13.5]);
  });
  it("treats text and icon as one collision decision unless a part is optional", function () {
    const collision = Layout.collision();
    collision.insert([0, 0, 20, 20]);
    const l = evaluate();
    expect(
      Layout.place([1, 1, 10, 10], [30, 30, 40, 40], l, collision),
    ).toEqual({ text: false, icon: false });
    expect(
      Layout.place(
        [1, 1, 10, 10],
        [30, 30, 40, 40],
        { ...l, "text-optional": true },
        collision,
      ),
    ).toEqual({ text: false, icon: true });
  });
  it("distinguishes allow-overlap from ignore-placement and finds collisions across cells", function () {
    const collision = Layout.collision(),
      l = evaluate();
    collision.insert([60, 60, 70, 70]);
    expect(collision.hits([68, 68, 80, 80])).toBeTrue();
    expect(
      Layout.place(
        [65, 65, 90, 90],
        undefined,
        { ...l, "text-allow-overlap": true, "text-ignore-placement": true },
        collision,
      ).text,
    ).toBeTrue();
    expect(collision.hits([80, 80, 85, 85])).toBeFalse();
  });
});

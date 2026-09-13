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
  it("rejects unimplemented placement, alignment, rich text and variable anchors at construction", function () {
    for (const l of [
      { "symbol-placement": "line" },
      { "text-rotation-alignment": "map" },
      { "text-variable-anchor": ["top", "bottom"] },
      { "text-field": ["format", "A", {}] },
      { "icon-text-fit": "both" },
    ]) {
      expect(
        () => new SceneGISVectorTileStyle(input(l)),
      ).toThrowDeveloperError();
    }
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

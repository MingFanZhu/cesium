import { SceneGISVectorTileStyle } from "../../../index.js";
import Line from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorSymbolLine.js";
import Layout from "../../../Source/SceneGIS/Core/_private/_SceneGISVectorSymbolLayout.js";

describe("SceneGIS/Core/SceneGISVectorSymbolLine", function () {
  const shape = {
    span: [-36, 36],
    box: [-36, -8, 36, 8],
    quads: [-24, 0, 24].map((center) => ({
      center,
      row: 0,
      box: [center - 10, -8, center + 10, 8],
    })),
  };
  it("clips disjoint visits without joining across an exterior segment and preserves direction", function () {
    const clipped = Line.clip(
      [
        { x: -10, y: 2 },
        { x: 20, y: 2 },
        { x: 20, y: 8 },
        { x: -10, y: 8 },
      ],
      { minimumX: 0, minimumY: 0, maximumX: 10, maximumY: 10 },
    );
    expect(clipped).toEqual([
      [
        { x: 0, y: 2 },
        { x: 10, y: 2 },
      ],
      [
        { x: 10, y: 8 },
        { x: 0, y: 8 },
      ],
    ]);
  });
  it("measures arc length, removes zero segments and keeps regular anchor spacing", function () {
    const line = Line.path([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ]);
    expect(line.length).toBe(300);
    expect(Line.anchors(line, 100, "line")).toEqual([50, 150, 250]);
    expect(Line.anchors(line, 100, "line-center")).toEqual([150]);
    expect(Line.sample(line, 150).x).toBe(100);
    expect(Line.sample(line, 150).y).toBe(50);
    expect(Line.sample(line, 301)).toBeUndefined();
  });
  it("bends individual glyphs along different tangents and reverses reading independently of geometry", function () {
    const points = [
      { x: -100, y: 0 },
      { x: 0, y: 0 },
      { x: 100, y: 50 },
    ];
    const line = Line.path(points);
    const quads = Line.bend(shape, line, 100, false, 0, Math.PI / 4);
    expect(quads[0].corners[0][1]).toBe(quads[0].corners[1][1]);
    expect(quads[2].corners[1][1]).toBeGreaterThan(quads[2].corners[0][1]);
    const reversed = Line.path(points.slice().reverse());
    const upright = Line.bend(
      shape,
      reversed,
      reversed.length - 100,
      true,
      0,
      Math.PI / 4,
    );
    for (let i = 0; i < quads.length; i++) {
      for (let j = 0; j < 4; j++) {
        expect(upright[i].corners[j][0]).toBeCloseTo(
          quads[i].corners[j][0],
          10,
        );
        expect(upright[i].corners[j][1]).toBeCloseTo(
          quads[i].corners[j][1],
          10,
        );
      }
    }
  });
  it("rejects a short line or excessive intervening turns instead of drawing a partial name", function () {
    expect(
      Line.bend(
        shape,
        Line.path([
          { x: 0, y: 0 },
          { x: 40, y: 0 },
        ]),
        20,
        false,
        0,
        Math.PI,
      ),
    ).toBeUndefined();
    const line = Line.path([
      { x: -100, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 100 },
    ]);
    expect(Line.bend(shape, line, 100, false, 0, Math.PI / 4)).toBeUndefined();
    expect(Line.bend(shape, line, 100, false, 0, Math.PI)).toBeDefined();
  });
  it("keeps viewport icon rotation independent of the directed line", function () {
    const icon = { box: [-8, -4, 8, 4], quads: [{ box: [-8, -4, 8, 4] }] };
    const line = Line.path([
      { x: 100, y: 0 },
      { x: -100, y: 0 },
    ]);
    const directed = Line.bend(icon, line, 100, false, 0, Infinity);
    expect(directed[0].corners[1][0]).toBeLessThan(directed[0].corners[0][0]);
    const opposite = Line.bend(icon, line, 100, false, Math.PI, Infinity);
    expect(opposite[0].corners[1][0]).toBeGreaterThan(
      opposite[0].corners[0][0],
    );
  });
  it("collides with the glyph corridor, leaving empty space inside a curved label available", function () {
    const collision = Layout.collision();
    Layout.place(
      [
        [0, 0, 10, 10],
        [20, 20, 30, 30],
      ],
      [],
      {},
      collision,
    );
    expect(collision.hits([20, 0, 30, 10])).toBeFalse();
    expect(collision.hits([25, 25, 35, 35])).toBeTrue();
    expect(
      Layout.place([[40, 40, 50, 50]], [[25, 25, 35, 35]], {}, collision),
    ).toEqual({ text: false, icon: false });
  });
  it("accepts the original shield zoom transition, map arrows and line controls", function () {
    const style = new SceneGISVectorTileStyle({
      version: 8,
      glyphs: "/{fontstack}/{range}.pbf",
      sources: { local: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
      layers: [
        {
          id: "road",
          type: "symbol",
          source: "local",
          "source-layer": "roads",
          layout: {
            "text-field": "{ref}",
            "symbol-placement": ["step", ["zoom"], "point", 11, "line"],
            "text-rotation-alignment": "map",
            "text-pitch-alignment": "viewport",
            "text-rotate": 10,
            "text-max-angle": 30,
            "text-keep-upright": true,
            "icon-rotate": 180,
            "icon-keep-upright": false,
            "symbol-spacing": 120,
          },
        },
      ],
    });
    const feature = { type: 2, properties: { ref: "A12" } };
    expect(
      style.evaluateLayer("road", feature, 10.9).layout["symbol-placement"],
    ).toBe("point");
    expect(
      style.evaluateLayer("road", feature, 11.1).layout["symbol-placement"],
    ).toBe("line");
    expect(
      style.evaluateLayer("road", feature, 11.1).layout["icon-rotate"],
    ).toBe(180);
  });
});

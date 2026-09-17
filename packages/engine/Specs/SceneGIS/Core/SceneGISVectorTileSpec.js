import { SceneGISVectorTile, RuntimeError } from "../../../index.js";
import fixture from "./_private/VectorTileFixture.js";

describe("SceneGIS/Core/SceneGISVectorTile", function () {
  function decode(options) {
    return SceneGISVectorTile.decode(fixture([options])).layers[0];
  }

  it("decodes an independently hand-authored point and retains its source ID and version", function () {
    const bytes = new Uint8Array([
      26, 23, 120, 2, 10, 5, 97, 117, 100, 105, 116, 40, 128, 32, 18, 9, 8, 42,
      24, 1, 34, 3, 9, 20, 40,
    ]);
    const layer = SceneGISVectorTile.decode(bytes).layers[0];
    expect(layer.name).toBe("audit");
    expect(layer.version).toBe(2);
    expect(layer.extent).toBe(4096);
    expect(layer.features[0].id).toBe("42");
    expect(layer.features[0].geometry.parts[0]).toEqual(
      new Float64Array([10, 20]),
    );
    bytes.fill(0);
    expect(layer.features[0].geometry.parts[0][1]).toBe(20);
  });

  it("keeps per-layer extents, absent IDs, zero IDs, and maximum uint64 IDs", function () {
    const bytes = fixture([
      {
        name: "a",
        extent: 256,
        features: [{ id: "0", type: 1, geometry: [9, 0, 0] }],
      },
      {
        name: "b",
        extent: 8192,
        features: [
          { id: "18446744073709551615", type: 1, geometry: [9, 0, 0] },
          { type: 1, geometry: [9, 0, 0] },
        ],
      },
    ]);
    const offset = new Uint8Array(bytes.length + 4);
    offset.set(bytes, 2);
    const layers = SceneGISVectorTile.decode(
      offset.subarray(2, bytes.length + 2),
    ).layers;
    expect(layers.map((layer) => layer.extent)).toEqual([256, 8192]);
    expect(layers[0].features[0].id).toBe("0");
    expect(layers[1].features[0].id).toBe("18446744073709551615");
    expect(layers[1].features[1].id).toBeUndefined();
  });

  it("preserves all scalar kinds and prototype-named properties", function () {
    const keys = [
      "name",
      "float",
      "double",
      "int",
      "uint",
      "sint",
      "false",
      "true",
      "__proto__",
      "constructor",
    ];
    const values = [
      { string: "道路" },
      { float: 1.5 },
      { double: 1 / 3 },
      { int64: "-9223372036854775808" },
      { uint64: "18446744073709551615" },
      { sint64: "-9007199254740993" },
      { bool: false },
      { bool: true },
      { string: "safe" },
      { int64: "-42" },
    ];
    const tags = keys.flatMap((_key, index) => [index, index]);
    const result = decode({
      keys,
      values,
      features: [{ type: 1, geometry: [9, 0, 0], tags }],
    }).features[0].properties;
    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(result.name).toBe("道路");
    expect(result.float).toBe(1.5);
    expect(result.double).toBe(1 / 3);
    expect(result.int).toBe(-9223372036854775808n);
    expect(result.uint).toBe(18446744073709551615n);
    expect(result.sint).toBe(-9007199254740993n);
    expect(result.false).toBe(false);
    expect(result.true).toBe(true);
    expect(result.__proto__).toBe("safe");
    expect(result.constructor).toBe(-42);
  });

  it("preserves buffers and multipoints in unpacked protobuf fields", function () {
    const feature = decode({
      features: [{ type: 1, unpacked: true, geometry: [17, 1, 4, 8196, 0] }],
    }).features[0];
    expect(feature.geometry.parts[0]).toEqual(
      new Float64Array([-1, 2, 4097, 2]),
    );
  });

  it("retains the delta cursor between line parts", function () {
    const result = decode({
      features: [
        { type: 2, geometry: [9, 0, 0, 10, 20, 0, 9, 0, 20, 10, 19, 0] },
      ],
    }).features[0].geometry;
    expect(result.parts).toEqual([
      new Float64Array([0, 0, 10, 0]),
      new Float64Array([10, 10, 0, 10]),
    ]);
    expect(result.polygonStarts.length).toBe(0);
  });

  it("groups outer, hole, and a second polygon while keeping ClosePath cursor semantics", function () {
    const geometry = [
      9, 0, 0, 26, 20, 0, 0, 20, 19, 0, 15, 9, 4, 15, 26, 0, 12, 12, 0, 0, 11,
      15, 9, 24, 3, 26, 20, 0, 0, 20, 19, 0, 15,
    ];
    const result = decode({ features: [{ type: 3, geometry }] }).features[0]
      .geometry;
    expect(result.polygonStarts).toEqual(new Uint32Array([0, 2]));
    expect(result.parts[1]).toEqual(new Float64Array([2, 2, 2, 8, 8, 8, 8, 2]));
    expect(result.parts[2]).toEqual(
      new Float64Array([20, 0, 30, 0, 30, 10, 20, 10]),
    );
  });

  it("accepts empty tiles and skips a valid unknown field", function () {
    expect(SceneGISVectorTile.decode(new ArrayBuffer(0))).toEqual({
      layers: [],
    });
    expect(decode({ features: [] }).features.length).toBe(0);
    expect(SceneGISVectorTile.decode(new Uint8Array([128, 1, 1]))).toEqual({
      layers: [],
    });
  });

  it("rejects duplicate names, unsupported versions, and missing required layer fields", function () {
    expect(() => SceneGISVectorTile.decode(fixture([{}, {}]))).toThrowError(
      RuntimeError,
    );
    for (const options of [
      { name: null },
      { extent: null },
      { extent: 0 },
      { version: null },
      { version: 1 },
      { version: 3 },
    ]) {
      expect(() => decode(options)).toThrowError(RuntimeError);
    }
  });

  it("rejects broken property tables and ambiguous scalar values", function () {
    for (const tags of [[0], [1, 0], [0, 1], [0, 0, 0, 0]]) {
      expect(() =>
        decode({
          keys: ["a"],
          values: [{ string: "b" }],
          features: [{ type: 1, geometry: [9, 0, 0], tags }],
        }),
      ).toThrowError(RuntimeError);
    }
    for (const value of [{}, { string: "x", bool: true }]) {
      expect(() => decode({ values: [value] })).toThrowError(RuntimeError);
    }
  });

  it("rejects incomplete and illegal command sequences", function () {
    for (const [type, geometry] of [
      [0, [9, 0, 0]],
      [1, []],
      [1, [9, 20]],
      [1, [1]],
      [1, [11]],
      [1, [9, 0, 0, 10, 2, 2]],
      [2, [9, 0, 0]],
      [2, [10, 0, 0]],
      [2, [17, 0, 0, 2, 2]],
      [3, [9, 0, 0, 10, 2, 2, 15]],
      [3, [9, 0, 0, 18, 2, 0, 2, 0, 15]],
      [3, [9, 0, 0, 18, 0, 20, 20, 0, 15]],
      [1, [9, 0xffffffff, 0]],
    ]) {
      expect(() => decode({ features: [{ type, geometry }] })).toThrowError(
        RuntimeError,
      );
    }
  });

  it("rejects truncated messages, illegal tags and overwide uint32/uint64", function () {
    const valid = fixture([
      {
        features: [
          { id: "18446744073709551615", type: 1, geometry: [9, 0, 0] },
        ],
      },
    ]);
    const corruptId = valid.slice();
    const idStart = corruptId.indexOf(8, 4);
    corruptId[idStart + 10] = 2;
    for (const bytes of [
      valid.subarray(0, valid.length - 1),
      new Uint8Array([0]),
      new Uint8Array([27]),
      new Uint8Array([26, 128, 128, 128, 128, 16]),
      corruptId,
      new Uint8Array([
        26, 16, 120, 2, 10, 1, 97, 40, 128, 32, 18, 6, 24, 1, 34, 2, 9, 20,
      ]),
    ]) {
      expect(() => SceneGISVectorTile.decode(bytes)).toThrowError(RuntimeError);
    }
  });

  it("rejects non-byte input as an API error", function () {
    expect(() => SceneGISVectorTile.decode([1, 2])).toThrowDeveloperError();
  });
});

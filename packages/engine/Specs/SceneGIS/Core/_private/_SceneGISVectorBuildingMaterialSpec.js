import {
  SceneGISVectorTileStyle as Style,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISVectorTileCoordinates,
  TaskProcessor,
} from "../../../../index.js";
import Material from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorBuildingMaterial.js";
import atlas from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorMaterialAtlas.js";
import geometry from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorTileGeometry.js";

describe("SceneGIS/Core/SceneGISVectorBuildingMaterial", function () {
  function json() {
    return {
      version: 8,
      sources: { s: { type: "vector", tiles: ["/{z}/{x}/{y}.pbf"] } },
      materialOrigin: [1000000000, 2000000000],
      materials: {
        brick: { repeat: [3, 3], roughness: 0.8 },
        glass: { repeat: [2, 3], roughness: 0.1, metallic: 0.7 },
      },
      layers: [
        {
          id: "buildings",
          type: "fill-extrusion",
          source: "s",
          "source-layer": "building",
          paint: {
            "fill-extrusion-height": 30,
            "fill-extrusion-wall-material": [
              "match",
              ["get", "kind"],
              "office",
              "glass",
              "brick",
            ],
            "fill-extrusion-roof-material": "brick",
          },
        },
      ],
    };
  }
  const feature = {
    id: 42,
    type: 3,
    properties: { kind: "office" },
    geometry: {
      parts: [new Float64Array([100, 100, 112, 100, 112, 112, 100, 112])],
      polygonStarts: new Uint32Array([0]),
    },
  };
  const scheme = new SceneGISPlanarTilingScheme({
    coordinateSystem: new SceneGISPlanarCoordinateSystem({
      extent: new SceneGISPlanarExtent({
        minimumX: 1e9,
        minimumY: 2e9,
        maximumX: 1e9 + 4096,
        maximumY: 2e9 + 4096,
      }),
    }),
  });
  function coordinates(x = 0, level = 0) {
    return new SceneGISVectorTileCoordinates({
      tilingScheme: scheme,
      x,
      y: 0,
      level,
      extent: 4096,
    });
  }
  it("selects independent wall/roof materials with attributes and stable IDs and preserves snapshots", function () {
    const input = json(),
      style = new Style(input);
    input.materials.glass.repeat[0] = 99;
    const paint = style.evaluateLayer("buildings", feature, 16).paint;
    expect(paint[Material.properties[0]]).toBe("glass");
    expect(paint[Material.properties[1]]).toBe("brick");
    expect(Material.resolve(style, paint, false)[0].repeat).toEqual([2, 3]);
    const selected = style._withRule(
      "buildings",
      "paint",
      Material.properties[0],
      ["case", ["==", ["%", ["id"], 2], 0], "glass", "brick"],
    );
    expect(
      selected.evaluateLayer("buildings", feature, 14).paint[
        Material.properties[0]
      ],
    ).toBe("glass");
    expect(selected._getSnapshot().materials).toEqual(
      style._snapshot.materials,
    );
    expect(
      style
        ._withRule("buildings", "paint", Material.properties[0], null)
        .evaluateLayer("buildings", feature, 16).paint[Material.properties[0]],
    ).toBe("");
  });
  it("rejects invalid factors, origin, repeat, selectors and unknown material names", function () {
    for (const edit of [
      (s) => {
        s.materials.brick.repeat[0] = 0;
      },
      (s) => {
        s.materials.brick.roughness = 2;
      },
      (s) => {
        delete s.materialOrigin;
      },
      (s) => {
        s.materials.brick.secretOption = true;
      },
      (s) => {
        s.layers[0].paint[Material.properties[0]] = 4;
      },
      (s) => {
        s.layers[0].paint[Material.properties[1]] = "missing";
      },
    ]) {
      const input = json();
      edit(input);
      expect(() => new Style(input)).toThrowDeveloperError();
    }
    const style = new Style(json());
    expect(() =>
      Material.resolve(style, { [Material.properties[0]]: "missing" }, false),
    ).toThrowError(/Unknown building material/);
  });
  it("keeps all buildings in one batch while separating roof and wall material indices and meter proportions", function () {
    const style = new Style(json());
    const result = geometry.build(
      {
        name: "building",
        features: [feature, { ...feature, id: 43, properties: {} }],
      },
      style.getLayerDefinition("buildings"),
      style,
      coordinates(),
      16,
      { x: 0, y: 0, level: 0 },
    );
    expect(result.length).toBe(1);
    expect(result[0].instances.length).toBe(2);
    expect(result[0].material).toBe(true);
    const attributes = result[0].instances[0].geometry.attributes;
    const uv = attributes.materialCoordinate.values;
    expect(uv[2]).toBe(0);
    expect(uv[14]).toBe(1);
    expect(uv[15] - uv[12]).toBeCloseTo(6, 6);
    expect(uv[19] - uv[16]).toBeCloseTo(10, 6);
  });
  it("preserves phase after wall splitting, tile changes and parent/child LOD at large coordinates", function () {
    const m = { origin: [1e9, 2e9], scale: 1, repeat: [3, 3], index: 0 };
    const parent = coordinates();
    const child = coordinates(1, 1);
    const point = { x: 2050.25, y: -20 };
    const a = Material.coordinates(m, parent, point, 9, [1, 0], {
      x: 2000,
      y: -20,
    });
    const b = Material.coordinates(m, parent, point, 9, [1, 0], {
      x: 2048,
      y: -20,
    });
    const c = Material.coordinates(m, child, { x: 2.25, y: -20 }, 9, [1, 0], {
      x: 0,
      y: -20,
    });
    expect(a[0] - b[0]).toBeCloseTo(Math.round(a[0] - b[0]), 10);
    expect(b).toEqual(c);
    expect(a[1]).toBe(3);
    const roofA = Material.coordinates(m, parent, point, 9);
    const roofB = Material.coordinates(m, child, { x: 2.25, y: -20 }, 9);
    expect(roofA[0] - roofB[0]).toBeCloseTo(
      Math.round(roofA[0] - roofB[0]),
      10,
    );
  });
  it("keeps wall phase independent of polygon winding", function () {
    const style = new Style(json());
    const reversed = {
      ...feature,
      geometry: {
        ...feature.geometry,
        parts: [new Float64Array([100, 112, 112, 112, 112, 100, 100, 100])],
      },
    };
    const samples = (f) => {
      const attrs = geometry.build(
        { name: "building", features: [f] },
        style.getLayerDefinition("buildings"),
        style,
        coordinates(),
        16,
        { x: 0, y: 0, level: 0 },
      )[0].instances[0].geometry.attributes;
      const uv = attrs.materialCoordinate.values,
        p = attrs.position.values,
        result = [];
      for (let i = 4; i < p.length / 3; i++) {
        const fraction = uv[i * 3] - Math.floor(uv[i * 3]);
        result.push(
          [p[i * 3], p[i * 3 + 1], p[i * 3 + 2], fraction, uv[i * 3 + 1]].join(
            ",",
          ),
        );
      }
      return result.sort();
    };
    expect(samples(feature)).toEqual(samples(reversed));
  });
  it("uses a fixed geographic meter metric for Globe and leaves Planar source meters unchanged", function () {
    const input = json();
    input.materialOrigin = [0, 5621521.486192066];
    const style = new Style(input),
      paint = style.evaluateLayer("buildings", feature, 16).paint;
    expect(Material.resolve(style, paint, true)[0].scale).toBeCloseTo(
      Math.SQRT1_2,
      10,
    );
    expect(Material.resolve(style, paint, false)[0].scale).toBe(1);
  });
  function fixture() {
    return {
      materials: {
        a: { repeat: [3, 3], baseColorTexture: "a" },
        b: { repeat: [1, 1], baseColorTexture: "b" },
      },
      images: {
        a: {
          width: 2,
          height: 2,
          arrayBufferView: new Uint8Array([
            0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255,
          ]),
        },
        b: {
          width: 2,
          height: 2,
          arrayBufferView: new Uint8Array([
            255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255,
          ]),
        },
      },
      maximumTextureSize: 4096,
      maximumBytes: 1024 * 1024,
    };
  }
  it("isolates periodic mip borders and averages color in linear light within a bounded shared atlas", function () {
    const result = atlas(fixture());
    const table = result.parameters.arrayBufferView;
    const mip = table.slice(16, 20);
    const image = result.atlases[0];
    const offset = (mip[1] * image.width + mip[0]) * 4;
    expect(image.arrayBufferView[offset]).toBe(188);
    expect(image.arrayBufferView[offset + 1]).toBe(188);
    const rect = table.slice(12, 16);
    expect(
      image.arrayBufferView[(rect[1] * image.width + rect[0] - 1) * 4],
    ).toBe(255);
    expect(() => atlas({ ...fixture(), maximumBytes: 1 })).toThrowError(
      /maximumMaterialTextureBytes/,
    );
    const mismatched = fixture();
    mismatched.materials.a.normalTexture = "bad";
    expect(() => atlas(mismatched)).toThrowError(/matching RGBA dimensions/);
  });
  it("runs material packing through the existing real Worker and transfers its results", async function () {
    const processor = new TaskProcessor("SceneGISVectorTileWorker");
    try {
      const result = await processor.scheduleTask({
        kind: "materials",
        ...fixture(),
      });
      expect(result.kind).toBe("materials");
      expect(result.atlases.length).toBe(4);
      expect(result.parameters.arrayBufferView instanceof Float32Array).toBe(
        true,
      );
      expect(result.byteLength).toBeGreaterThan(0);
    } finally {
      processor.destroy();
    }
  });
  it("retains normal variance and filters roughness in squared space", function () {
    const input = fixture();
    input.materials.a.normalTexture = "n";
    input.materials.a.metallicRoughnessTexture = "r";
    input.images.n = {
      width: 2,
      height: 2,
      arrayBufferView: new Uint8Array([
        255, 128, 128, 255, 0, 128, 128, 255, 255, 128, 128, 255, 0, 128, 128,
        255,
      ]),
    };
    input.images.r = input.images.a;
    const result = atlas(input);
    const rect = result.parameters.arrayBufferView.slice(16, 20);
    const index = (rect[1] * result.atlases[1].width + rect[0]) * 4;
    expect(result.atlases[1].arrayBufferView.slice(index, index + 3)).toEqual(
      new Uint8Array([128, 128, 128]),
    );
    expect(result.atlases[2].arrayBufferView[index + 1]).toBe(180);
  });
});

import { SceneGISVectorTileStyle, TaskProcessor } from "../../../../index.js";
import Pattern from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorPattern.js";

describe("SceneGIS/Core/SceneGISVectorPattern", function () {
  const images = {
    stripes: { x: 0, y: 0, width: 16, height: 8, pixelRatio: 2 },
    dots: { x: 16, y: 0, width: 8, height: 8, pixelRatio: 1 },
  };
  function configuration(type) {
    return {
      extent: {
        minimumX: 1000000000,
        minimumY: 2000000000,
        maximumX: 1000004096,
        maximumY: 2000004096,
      },
      style: {
        version: 8,
        sprite: "/sprite",
        sources: { s: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
        layers: [
          {
            id: "patterns",
            type,
            source: "s",
            "source-layer": "data",
            paint: {
              [`${type}-pattern`]: ["get", "pattern"],
              [`${type}-color`]: "rgba(0,0,255,0)",
              ...(type === "fill-extrusion"
                ? { "fill-extrusion-height": 40 }
                : {}),
            },
          },
        ],
      },
    };
  }
  it("validates ordinary sprite dimensions and resolves feature image expressions", function () {
    expect(Pattern.image(images, "stripes").size).toEqual([8, 4]);
    expect(() => Pattern.image(images, "missing")).toThrowError();
    expect(() =>
      Pattern.image({ bad: { ...images.dots, sdf: true } }, "bad"),
    ).toThrowError();
    for (const type of ["fill", "line", "fill-extrusion"]) {
      const style = new SceneGISVectorTileStyle(configuration(type).style);
      expect(
        style.evaluateLayer(
          "patterns",
          { id: "1", type: 3, properties: { pattern: "dots" } },
          5,
        ).paint[`${type}-pattern`],
      ).toBe("dots");
    }
  });
  it("transfers patterned fill, line and extrusion as shared batches without tinting or color-alpha culling", async function () {
    const worker = new TaskProcessor("SceneGISVectorTileWorker", 1);
    try {
      for (const type of ["fill", "line", "fill-extrusion"]) {
        const result = await worker.scheduleTask({
          kind: "tile",
          configuration: configuration(type),
          patterns: images,
          records: [{ id: "patterns", signature: "pattern" }],
          zoom: 5,
          ground: true,
          allowPicking: true,
          maximumLevel: 0,
          tile: { x: 0, y: 0, level: 0 },
          data: {
            layers: [
              {
                name: "data",
                extent: 4096,
                features: ["stripes", "dots"].map((pattern, i) => ({
                  id: String(i),
                  type: type === "line" ? 2 : 3,
                  properties: { pattern },
                  geometry: {
                    parts: [
                      new Float64Array([
                        100, 100, 400, 100, 400, 400, 100, 400,
                      ]),
                    ],
                    polygonStarts: new Uint32Array([0]),
                  },
                })),
              },
            ],
          },
        });
        const batches = result.layers[0].batches;
        expect(batches.length).toBe(1);
        expect(batches[0].pattern).toBeTrue();
        expect(batches[0].identities.length).toBe(2);
        if (type === "fill-extrusion") {
          const attributes = batches[0].geometries[0].attributes;
          expect(Array.from(attributes.color.values.subarray(0, 4))).toEqual([
            255, 255, 255, 255,
          ]);
          expect(
            attributes.patternCoordinate.values.some(
              (v, i) => i % 3 === 2 && v === 1,
            ),
          ).toBeTrue();
          expect(
            Array.from(attributes.patternSize.values.subarray(0, 2)),
          ).toEqual([8, 4]);
        } else {
          expect(batches[0].ground.stride).toBe(type === "line" ? 9 : 5);
          expect(Array.from(batches[0].ground.vertices.subarray(4, 8))).toEqual(
            [1, 1, 1, 1],
          );
        }
      }
    } finally {
      worker.destroy();
    }
  });
});

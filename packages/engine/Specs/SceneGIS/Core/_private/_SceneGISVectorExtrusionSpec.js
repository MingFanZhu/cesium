import {
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
  SceneGISVectorTileCoordinates,
  SceneGISVectorTileStyle,
  TaskProcessor,
} from "../../../../index.js";
import geometry from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorTileGeometry.js";

describe("SceneGIS/Core/SceneGISVectorExtrusion", function () {
  const extent = {
    minimumX: 1000000000,
    minimumY: 2000000000,
    maximumX: 1000004096,
    maximumY: 2000004096,
  };
  const scheme = new SceneGISPlanarTilingScheme({
    coordinateSystem: new SceneGISPlanarCoordinateSystem({
      extent: new SceneGISPlanarExtent(extent),
    }),
  });
  const coordinates = new SceneGISVectorTileCoordinates({
    tilingScheme: scheme,
    x: 0,
    y: 0,
    level: 0,
    extent: 4096,
  });
  function feature(parts, starts = [0]) {
    return {
      id: "building",
      type: 3,
      properties: { height: 40, base: 5 },
      geometry: {
        parts: parts.map((p) => new Float64Array(p)),
        polygonStarts: new Uint32Array(starts),
      },
    };
  }
  const paint = {
    "fill-extrusion-height": ["get", "height"],
    "fill-extrusion-base": ["get", "base"],
    "fill-extrusion-color": "rgba(255,0,0,0.1)",
  };
  function style(extra = {}) {
    return {
      version: 8,
      sources: { s: { type: "vector", tiles: ["/{z}/{x}/{y}"] } },
      layers: [
        {
          id: "buildings",
          type: "fill-extrusion",
          source: "s",
          "source-layer": "data",
          paint: { ...paint, ...extra },
        },
      ],
    };
  }
  function build(f, extra) {
    const json = style(extra);
    return geometry.build(
      { name: "data", features: [f] },
      json.layers[0],
      new SceneGISVectorTileStyle(json),
      coordinates,
      16,
      { x: 0, y: 0, level: 0 },
    );
  }
  it("triangulates a courtyard roof and outward walls with meter heights and unchanged input", function () {
    const f = feature([
      [100, 100, 200, 100, 200, 200, 100, 200],
      [125, 125, 125, 175, 175, 175, 175, 125],
    ]);
    const before = JSON.stringify(f);
    const instance = build(f)[0].instances[0];
    const g = instance.geometry,
      p = g.attributes.position.values,
      n = g.attributes.normal.values;
    let roofArea = 0,
      walls = 0;
    for (let i = 0; i < g.indices.length; i += 3) {
      const a = g.indices[i] * 3,
        b = g.indices[i + 1] * 3,
        c = g.indices[i + 2] * 3;
      const ab = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]];
      const ac = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
      const cross = [
        ab[1] * ac[2] - ab[2] * ac[1],
        ab[2] * ac[0] - ab[0] * ac[2],
        ab[0] * ac[1] - ab[1] * ac[0],
      ];
      expect(
        cross[0] * n[a] + cross[1] * n[a + 1] + cross[2] * n[a + 2],
      ).toBeGreaterThan(0);
      if (n[a + 2] === 1) {
        roofArea += cross[2] / 2;
      } else {
        walls++;
      }
    }
    expect(roofArea).toBe(7500);
    expect(walls).toBe(16);
    expect(Math.min(...p.filter((v, i) => i % 3 === 2))).toBe(5);
    expect(Math.max(...p.filter((v, i) => i % 3 === 2))).toBe(40);
    expect(instance.attributes.color.value[3]).toBe(255);
    expect(JSON.stringify(f)).toBe(before);
  });
  it("omits tile clipping walls and empty volumes, and honors the gradient switch", function () {
    const f = feature([[0, 100, 100, 100, 100, 200, 0, 200]]);
    const g = build(f, { "fill-extrusion-vertical-gradient": false })[0]
      .instances[0].geometry;
    expect(g.indices.length).toBe(6 + 3 * 6);
    expect(
      Array.from(g.attributes.extrusionGradient.values).every((v) => v === 1),
    ).toBeTrue();
    expect(build(f, { "fill-extrusion-height": 5 })).toEqual([]);
    expect(build({ ...f, type: 2 })).toEqual([]);
    expect(
      SceneGISVectorTileStyle.validate(
        style({ "fill-extrusion-pattern": "wall" }),
      ).length,
    ).toBeGreaterThan(0);
  });
  it("prepares and transfers extrusion buffers through the actual vector Worker", async function () {
    const worker = new TaskProcessor("SceneGISVectorTileWorker");
    try {
      const result = await worker.scheduleTask({
        kind: "tile",
        configuration: { extent, style: style() },
        data: {
          layers: [
            {
              name: "data",
              extent: 4096,
              version: 2,
              features: [feature([[100, 100, 200, 100, 200, 200, 100, 200]])],
            },
          ],
        },
        tile: { x: 0, y: 0, level: 0 },
        maximumLevel: 0,
        zoom: 16,
        ground: true,
        allowPicking: true,
        records: [{ id: "buildings", signature: "buildings" }],
      });
      const batch = result.layers[0].batches[0];
      expect(batch.kind).toBe("fill-extrusion");
      expect(batch.ground).toBeUndefined();
      expect(batch.maximumHeight).toBe(40);
      expect(batch.identities[0].featureId).toBe("building");
      expect(
        batch.geometries[0].attributes.extrusionData.values instanceof
          Float32Array,
      ).toBeTrue();
      expect(batch.geometries[0].indices instanceof Uint16Array).toBeTrue();
      expect(result.byteLength).toBe(batch.byteLength);
    } finally {
      worker.destroy();
    }
  });

  it("resolves roof and ground vertices in the actual Worker without detaching borrowed terrain", async function () {
    const worker = new TaskProcessor("SceneGISVectorTileWorker");
    const radius = 6378137;
    const positions = new Float64Array([
      120, -100, -100, 120, 100, -100, 120, 100, 100, 120, -100, 100,
    ]);
    const coordinates = new Float32Array([0, 0, 0, 0]);
    try {
      const result = await worker.scheduleTask({
        kind: "extrusion-terrain",
        bounds: { minimumX: 0, maximumY: 0 },
        origin: { x: radius, y: 0, z: 0 },
        streams: [
          { coordinates, data: new Float32Array([0, 0, 80, 1, 0, 0, 0, 0]) },
        ],
        entries: [
          {
            rectangle: {
              west: -0.001,
              east: 0.001,
              south: -0.001,
              north: 0.001,
            },
            height: 121,
            result: {
              center: { x: radius, y: 0, z: 0 },
              positions,
              indices: new Uint16Array([0, 1, 2, 0, 2, 3]),
              bounds: new Float64Array([120, -100, -100, 120, 100, 100]),
              nodes: new Int32Array([-1, -1, 0, 2]),
              order: new Uint32Array([0, 1]),
            },
          },
        ],
      });
      const { high, low } = result.streams[0];
      expect(high instanceof Float32Array).toBeTrue();
      expect(high[0] + low[0]).toEqualEpsilon(200, 1e-6);
      expect(high[3] + low[3]).toEqualEpsilon(120, 1e-6);
      expect(positions.length).toBe(12);
      expect(coordinates.length).toBe(4);
    } finally {
      worker.destroy();
    }
  });
});

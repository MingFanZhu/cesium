import TaskProcessor from "../../../../Source/Core/TaskProcessor.js";
import RuntimeError from "../../../../Source/Core/RuntimeError.js";
import Tile from "../../../../Source/SceneGIS/Core/SceneGISVectorTile.js";
import Style from "../../../../Source/SceneGIS/Core/SceneGISVectorTileStyle.js";
import Pool from "../../../../Source/SceneGIS/Core/_private/_SceneGISVectorWorkerPool.js";
import fixture from "./VectorTileFixture.js";
import { encodeGlyphs } from "../vectorSymbolFixture.js";

describe("SceneGIS/Core/SceneGISVectorWorker", function () {
  let processor, pool;
  const style = {
    version: 8,
    glyphs: "https://example.invalid/{fontstack}/{range}.pbf",
    sources: {
      test: { type: "vector", tiles: ["https://example.invalid/{z}/{x}/{y}"] },
    },
    layers: [
      { id: "points", type: "circle", source: "test", "source-layer": "data" },
      {
        id: "labels",
        type: "symbol",
        source: "test",
        "source-layer": "data",
        layout: { "text-field": "A", "text-font": ["Test"], "text-size": 24 },
      },
    ],
  };
  beforeEach(function () {
    processor = new TaskProcessor("SceneGISVectorTileWorker");
  });
  afterEach(function () {
    processor.destroy();
    pool?.destroy();
    pool = undefined;
  });

  it("transfers actual MVT bytes and returns independent decoded typed geometry", async function () {
    const bytes = fixture([
      {
        features: [
          { id: "18446744073709551615", type: 1, geometry: [9, 20, 40] },
        ],
      },
    ]);
    const expected = Tile.decode(bytes);
    const result = await processor.scheduleTask(
      { kind: "decode", buffer: bytes.buffer },
      [bytes.buffer],
    );
    expect(bytes.byteLength).toBe(0);
    expect(result.data).toEqual(expected);
    expect(
      result.data.layers[0].features[0].geometry.parts[0] instanceof
        Float64Array,
    ).toBeTrue();
  });

  it("dynamic rules reconfigure both existing Worker slots without recreating the pool", async function () {
    pool = new Pool({
      extent: { minimumX: -512, minimumY: -512, maximumX: 512, maximumY: 512 },
      style,
    });
    const data = Tile.decode(
      fixture([{ features: [{ id: "1", type: 1, geometry: [9, 20, 40] }] }]),
    );
    const task = () =>
      pool.schedule({
        kind: "tile",
        data,
        tile: { x: 0, y: 0, level: 0 },
        maximumLevel: 0,
        zoom: 0,
        allowPicking: false,
        records: [{ id: "labels", order: 1 }],
      });
    const before = await Promise.all([task(), task()]);
    expect(before.map((r) => r.symbols[0][1].labels[0].names.text)).toEqual([
      "A",
      "A",
    ]);
    const processors = pool.slots.map((slot) => slot.processor);
    pool.configuration = {
      ...pool.configuration,
      style: new Style(style)
        ._withRule("labels", "layout", "text-field", "AA")
        ._getSnapshot(),
    };
    const after = await Promise.all([task(), task()]);
    expect(after.map((r) => r.symbols[0][1].labels[0].names.text)).toEqual([
      "AA",
      "AA",
    ]);
    expect(pool.slots.map((slot) => slot.processor)).toEqual(processors);
  });

  it("prepares GPU buffers, stable feature identity and world anchors in a real Worker", async function () {
    const bytes = fixture([
      {
        features: [
          { id: "18446744073709551615", type: 1, geometry: [9, 20, 40] },
        ],
      },
    ]);
    const transferred = bytes.slice().buffer;
    const result = await processor.scheduleTask(
      {
        kind: "tile",
        configuration: {
          extent: {
            minimumX: -512,
            minimumY: -512,
            maximumX: 512,
            maximumY: 512,
          },
          style,
        },
        buffer: transferred,
        tile: { x: 0, y: 0, level: 0 },
        maximumLevel: 0,
        zoom: 0,
        allowPicking: true,
        records: [
          { id: "points", signature: "point" },
          { id: "labels", order: 1 },
        ],
      },
      [transferred],
    );
    expect(transferred.byteLength).toBe(0);
    expect(bytes.byteLength).toBeGreaterThan(0);
    const batch = result.layers[0].batches[0];
    expect(batch.identities[0].featureId).toBe("18446744073709551615");
    expect(
      batch.geometries[0].attributes.position3DLow.values instanceof
        Float32Array,
    ).toBeTrue();
    expect(batch.geometries[0].indices instanceof Uint16Array).toBeTrue();
    expect(batch.byteLength).toBeGreaterThan(0);
    const label = result.symbols[0][1].labels[0];
    expect(label.feature.geometry).toBeUndefined();
    expect(label.anchors[0].position).toEqual({ x: -509.5, y: 507, z: 0 });
    expect(label.names.text).toBe("A");
    expect(label.names.requirements).toEqual([
      { key: "Test/0", font: "Test", range: 0 },
    ]);
    expect(result.errors).toEqual([]);
  });

  it("decodes and packs glyphs then shapes normalized text without transferring atlas images again", async function () {
    const bytes = encodeGlyphs().slice();
    const result = await processor.scheduleTask(
      { kind: "glyphs", range: 0, buffer: bytes.buffer },
      [bytes.buffer],
    );
    expect(bytes.byteLength).toBe(0);
    expect(result.image.width).toBe(512);
    expect(result.image.arrayBufferView.length).toBe(
      result.image.width * result.image.height,
    );
    const glyph = result.glyphs.get(65),
      rect = result.image.positions.get(65);
    const layout = new Style(style).evaluateLayer(
      "labels",
      { id: "1", type: 1, properties: {} },
      0,
    ).layout;
    const shape = await processor.scheduleTask({
      kind: "shapes",
      items: [
        {
          key: "A",
          text: "A",
          layout,
          glyphs: new Map([[65, { glyph, rect, page: "Test/0" }]]),
        },
      ],
    });
    expect(shape.shapes[0].text.span).toEqual([-8, 8]);
    expect(shape.shapes[0].text.quads[0].page).toBe("Test/0");
    expect(shape.shapes[0].text.quads[0].scale).toBe(1);
    expect(result.image.arrayBufferView.byteLength).toBeGreaterThan(0);
  });

  it("keeps extreme overzoom line anchors as compact exact station ranges", async function () {
    const result = await processor.scheduleTask({
      kind: "tile",
      configuration: {
        extent: {
          minimumX: -512,
          minimumY: -512,
          maximumX: 512,
          maximumY: 512,
        },
        style: {
          ...style,
          layers: [
            {
              ...style.layers[1],
              layout: {
                ...style.layers[1].layout,
                "symbol-placement": "line",
                "symbol-spacing": 250,
              },
            },
          ],
        },
      },
      data: {
        layers: [
          {
            name: "data",
            version: 2,
            extent: 4096,
            features: [
              {
                id: "road",
                type: 2,
                properties: {},
                geometry: {
                  parts: [new Float64Array([0, 2048, 2048, 2048, 4096, 0])],
                  polygonStarts: new Uint32Array(),
                },
              },
            ],
          },
        ],
      },
      tile: { x: 0, y: 0, level: 0 },
      maximumLevel: 0,
      zoom: 26,
      records: [{ id: "labels", order: 0 }],
    });
    const label = result.symbols[0][1].labels[0];
    expect(label.anchors.length).toBe(0);
    expect(label.runs.length).toBe(2);
    const [first, second] = label.runs;
    const spacing = (250 * 2) / 2 ** 26;
    expect(first.spacing).toBe(spacing);
    expect(first.start).toBe(spacing * 0.5);
    expect(first.first).toBe(0);
    expect(second.first).toBe(first.end);
    expect(second.line).toBe(first.line);
    expect(second.end).toBe(Math.ceil(first.line.length / spacing - 0.5));
    expect(second.end).toBeGreaterThan(100000000);
    expect(JSON.stringify(label).length).toBeLessThan(10000);
    expect(result.errors).toEqual([]);
  });

  it("transfers ground triangle tables with exact feature tokens and byte accounting", async function () {
    const bytes = fixture([
      {
        features: [
          {
            id: "99",
            type: 3,
            geometry: [9, 0, 0, 26, 8192, 0, 0, 8192, 8191, 0, 15],
          },
        ],
      },
    ]);
    const result = await processor.scheduleTask(
      {
        kind: "tile",
        ground: true,
        allowPicking: true,
        buffer: bytes.buffer,
        configuration: {
          extent: {
            minimumX: -512,
            minimumY: -512,
            maximumX: 512,
            maximumY: 512,
          },
          style: {
            ...style,
            layers: [
              {
                id: "land",
                type: "fill",
                source: "test",
                "source-layer": "data",
                paint: { "fill-antialias": false },
              },
            ],
          },
        },
        tile: { x: 0, y: 0, level: 0 },
        maximumLevel: 0,
        zoom: 0,
        records: [{ id: "land", signature: "ground" }],
      },
      [bytes.buffer],
    );
    expect(bytes.byteLength).toBe(0);
    const batch = result.layers[0].batches[0];
    expect(batch.geometries).toBeUndefined();
    expect(batch.identities[0].featureId).toBe("99");
    expect(batch.ground.stride).toBe(3);
    expect(batch.ground.triangles.length).toBe(8);
    expect(batch.ground.vertices instanceof Float32Array).toBeTrue();
    expect(batch.ground.triangles instanceof Float32Array).toBeTrue();
    for (let i = 2; i < batch.ground.vertices.length; i += 12) {
      expect(batch.ground.vertices[i]).toBe(0);
    }
    expect(result.byteLength).toBe(
      batch.ground.vertices.byteLength + batch.ground.triangles.byteLength,
    );
  });

  it("returns typed transferable buffers when a dense tile exceeds the Uint16 vertex limit", async function () {
    const count = 17000;
    const geometry = [count * 8 + 1];
    for (let i = 0; i < count; i++) {
      geometry.push(2, 0);
    }
    const bytes = fixture([{ features: [{ id: "1", type: 1, geometry }] }]);
    const result = await processor.scheduleTask(
      {
        kind: "tile",
        buffer: bytes.buffer,
        configuration: {
          extent: {
            minimumX: -512,
            minimumY: -512,
            maximumX: 512,
            maximumY: 512,
          },
          style,
        },
        tile: { x: 0, y: 0, level: 0 },
        maximumLevel: 0,
        zoom: 0,
        allowPicking: true,
        records: [{ id: "points", signature: "dense" }],
      },
      [bytes.buffer],
    );
    const batches = result.layers[0].batches;
    expect(batches.length).toBeGreaterThan(1);
    let vertices = 0,
      indices = 0,
      byteLength = 0;
    for (const batch of batches) {
      const mesh = batch.geometries[0];
      expect(mesh.indices instanceof Uint16Array).toBeTrue();
      expect(
        mesh.attributes.position3DHigh.values instanceof Float32Array,
      ).toBeTrue();
      expect(mesh.attributes.pickColor.values instanceof Uint8Array).toBeTrue();
      expect(mesh.attributes.position3DHigh.values.length / 3).toBeLessThan(
        65536,
      );
      vertices += mesh.attributes.position3DHigh.values.length / 3;
      indices += mesh.indices.length;
      byteLength += batch.byteLength;
    }
    expect(vertices).toBeGreaterThanOrEqual(count * 4);
    expect(indices).toBe(count * 6);
    expect(Number.isSafeInteger(result.byteLength)).toBeTrue();
    expect(result.byteLength).toBe(byteLength);
  });

  it("propagates malformed payload errors without a main-thread fallback", async function () {
    await expectAsync(
      processor.scheduleTask({
        kind: "decode",
        buffer: new Uint8Array([26, 50]).buffer,
      }),
    ).toBeRejectedWithError(RuntimeError);
    await expectAsync(
      processor.scheduleTask({
        kind: "glyphs",
        range: 1,
        buffer: encodeGlyphs().slice().buffer,
      }),
    ).toBeRejectedWithError(RuntimeError);
    await expectAsync(
      processor.scheduleTask({ kind: "unknown" }),
    ).toBeRejected();
  });

  it("bounds active Workers, defers extra tile tasks, and terminates owned jobs on destruction", async function () {
    pool = new Pool();
    expect(pool.slots.length).toBe(0);
    const first = pool.schedule({ kind: "decode", buffer: fixture().buffer });
    const second = pool.schedule({ kind: "decode", buffer: fixture().buffer });
    expect(pool.slots.length).toBe(2);
    expect(
      pool.schedule({ kind: "decode", buffer: fixture().buffer }),
    ).toBeUndefined();
    const queued = pool.enqueue({ kind: "decode", buffer: fixture().buffer });
    expect(pool.queue.length).toBe(1);
    await Promise.all([first, second, queued]);
    expect(pool.statistics.completed).toBe(3);
    const pending = pool.schedule({ kind: "decode", buffer: fixture().buffer });
    const rejection = expectAsync(pending).toBeRejectedWithError(RuntimeError);
    pool.destroy();
    pool = undefined;
    await rejection;
  });

  it("rejects active and queued jobs when the Worker entry cannot load", async function () {
    pool = new Pool();
    const jobs = [
      pool.enqueue({ kind: "decode", buffer: fixture().buffer }),
      pool.enqueue({ kind: "decode", buffer: fixture().buffer }),
      pool.enqueue({ kind: "decode", buffer: fixture().buffer }),
    ];
    const checks = jobs.map((job) =>
      expectAsync(job).toBeRejectedWithError(
        RuntimeError,
        "Worker entry failed",
      ),
    );
    const processors = pool.slots.map((slot) => slot.processor);
    processors[0]._worker.dispatchEvent(
      new ErrorEvent("error", {
        message: "Worker entry failed",
        cancelable: true,
      }),
    );
    await Promise.all(checks);
    expect(processors.every((item) => item.isDestroyed())).toBeTrue();
    expect(pool.slots.length).toBe(0);
    expect(pool.queue.length).toBe(0);
    await expectAsync(
      pool.enqueue({ kind: "decode", buffer: fixture().buffer }),
    ).toBeRejectedWithError(RuntimeError, "Worker entry failed");
    expect(pool.slots.length).toBe(0);
  });
});

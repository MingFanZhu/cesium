import Lerc from "lerc";
import Resource from "../../../../Source/Core/Resource.js";
import TaskProcessor from "../../../../Source/Core/TaskProcessor.js";
import processSceneGISPlanarTerrainTask from "../../../../Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js";

describe("SceneGIS/Core/SceneGISPlanarTerrainWorkerTasks", function () {
  let taskProcessor;

  afterEach(function () {
    if (taskProcessor && !taskProcessor.isDestroyed()) {
      taskProcessor = taskProcessor.destroy();
    }
  });

  it("decodes and validates one transferable LERC band", function () {
    const samples = new Float32Array([4.0, 3.0, 2.0, 1.0]);
    spyOn(Lerc, "decode").and.returnValue({
      width: 2,
      height: 2,
      pixels: [samples],
      mask: new Uint8Array([1, 1, 1, 1]),
      statistics: [{ minValue: 1.0, maxValue: 4.0 }],
    });
    const transferableObjects = [];
    const result = processSceneGISPlanarTerrainTask(
      {
        kind: "decodeLerc",
        arrayBuffer: new ArrayBuffer(8),
        width: 2,
        height: 2,
        minimumHeight: 0.0,
        maximumHeight: 5.0,
      },
      transferableObjects,
    );

    expect(result.kind).toBe("decodeLerc");
    expect(result.samples).toBe(samples);
    expect(transferableObjects).toEqual([samples.buffer]);
  });

  it("creates encoded surface and skirt positions without indices", function () {
    const buffer = new Uint8Array([
      0, 10, 0, 0, 0, 20, 0, 0, 0, 30, 0, 0, 0, 40, 0, 0,
    ]);
    const transferableObjects = [];
    const result = processSceneGISPlanarTerrainTask(
      {
        kind: "createHeightmapMesh",
        buffer,
        structure: {
          heightScale: 1.0,
          heightOffset: 0.0,
          elementsPerHeight: 2,
          stride: 4,
          elementMultiplier: 256.0,
          isBigEndian: true,
        },
        width: 2,
        height: 2,
        minimumHeight: 10.0,
        maximumHeight: 40.0,
        effectiveGeometricError: 5.0,
        providerMinimumHeight: -20.0,
        extent: {
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        },
      },
      transferableObjects,
    );

    expect(result.kind).toBe("createHeightmapMesh");
    expect(Array.from(result.positions.slice(0, 12))).toEqual([
      -0.5, 0.5, -15.0, 0.5, 0.5, -5.0, -0.5, -0.5, 5.0, 0.5, -0.5, 15.0,
    ]);
    expect(result.surfaceVertexCount).toBe(4);
    expect(result.skirtVertexCount).toBe(8);
    expect(result.skirtMinimumHeight).toBe(-10.0);
    expect(result.indices).toBeUndefined();
    expect(transferableObjects).toEqual([result.positions.buffer]);
  });

  it("runs both tasks through the built TaskProcessor Worker with transfer", async function () {
    const compressed = await Resource.fetchArrayBuffer(
      "./Data/ArcGIS/9_214_379/tile_9_214_379.tile",
    );
    taskProcessor = new TaskProcessor("SceneGISPlanarTerrainWorker");
    const decoded = await taskProcessor.scheduleTask(
      {
        kind: "decodeLerc",
        arrayBuffer: compressed,
        width: 257,
        height: 257,
        minimumHeight: -1000.0,
        maximumHeight: 9000.0,
      },
      [compressed],
    );
    expect(compressed.byteLength).toBe(0);
    expect(decoded.samples.length).toBe(257 * 257);
    expect(decoded.samples.buffer.byteLength).toBeGreaterThan(0);

    const samples = decoded.samples;
    const mesh = await taskProcessor.scheduleTask(
      {
        kind: "createHeightmapMesh",
        buffer: samples,
        structure: {
          heightScale: 1.0,
          heightOffset: 0.0,
          elementsPerHeight: 1,
          stride: 1,
          elementMultiplier: 256.0,
          isBigEndian: false,
        },
        width: 257,
        height: 257,
        minimumHeight: Math.min(...samples),
        maximumHeight: Math.max(...samples),
        effectiveGeometricError: 30.0,
        providerMinimumHeight: -1000.0,
        extent: {
          minimumX: -20037508.342789244,
          minimumY: -20037508.342789244,
          maximumX: 20037508.342789244,
          maximumY: 20037508.342789244,
        },
      },
      [samples.buffer],
    );
    expect(samples.buffer.byteLength).toBe(0);
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.surfaceVertexCount).toBe(257 * 257);
    expect(mesh.positions.buffer.byteLength).toBeGreaterThan(0);

    await expectAsync(
      taskProcessor.scheduleTask({ kind: "unknown" }),
    ).toBeRejectedWithError("The planar terrain Worker task kind is invalid.");
  });
});

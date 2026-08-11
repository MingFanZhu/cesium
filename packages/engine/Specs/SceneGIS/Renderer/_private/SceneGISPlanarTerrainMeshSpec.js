import {
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
} from "../../../../index.js";
import SceneGISPlanarQuantizedMeshTerrainData from "../../../../Source/SceneGIS/Core/SceneGISPlanarQuantizedMeshTerrainData.js";
import DirectSceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import processSceneGISPlanarTerrainTask from "../../../../Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js";
import {
  createSceneGISPlanarTerrainMeshTask,
  finalizeSceneGISPlanarTerrainMesh,
} from "../../../../Source/SceneGIS/Renderer/_private/_SceneGISPlanarTerrainMesh.js";

describe("SceneGIS/Renderer/SceneGISPlanarTerrainMesh", function () {
  const extent = new SceneGISPlanarExtent({
    minimumX: -20037508.342789244,
    minimumY: -20037508.342789244,
    maximumX: 20037508.342789244,
    maximumY: 20037508.342789244,
  });

  function buildSceneGISPlanarTerrainMesh(
    data,
    tileExtent,
    error = 0.0,
    minimum = data?.minimumHeight,
  ) {
    const task = createSceneGISPlanarTerrainMeshTask(
      data,
      tileExtent,
      error,
      minimum,
    );
    const result = processSceneGISPlanarTerrainTask(task.parameters, []);
    return finalizeSceneGISPlanarTerrainMesh(data, result);
  }

  it("builds a north-west row-major non-coplanar mesh with SW-to-NE triangles", function () {
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float32Array([10.0, 30.0, -10.0, 50.0]),
      width: 2,
      height: 2,
    });
    const mesh = buildSceneGISPlanarTerrainMesh(data, extent, 5.0, -20.0);

    expect(Array.from(mesh.positions.slice(0, 12))).toEqual([
      -0.5, 0.5, -10.0, 0.5, 0.5, 10.0, -0.5, -0.5, -30.0, 0.5, -0.5, 30.0,
    ]);
    expect(Array.from(mesh.indices.slice(0, 6))).toEqual([0, 2, 1, 1, 2, 3]);
    expect(buildSceneGISPlanarTerrainMesh(data, extent).indices).toBe(
      mesh.indices,
    );
    expect(mesh.surfaceVertexCount).toBe(4);
    expect(mesh.skirtVertexCount).toBe(8);
    expect(mesh.vertexCount).toBe(12);
    expect(mesh.surfaceIndexCount).toBe(6);
    expect(mesh.indexCount).toBe(30);
    expect(mesh.skirtMinimumHeight).toBe(-20.0);
    expect(mesh.topologyKey).toBe("2/2/skirt");
    expect(mesh.referenceHeight).toBe(20.0);
    expect(mesh.minimumHeight).toBe(-10.0);
    expect(mesh.maximumHeight).toBe(50.0);
    expect(mesh.octEncodedNormals).toBeInstanceOf(Uint8Array);
    expect(mesh.octEncodedNormals.length).toBe(mesh.vertexCount * 2);
    expect(mesh.normalByteLength).toBe(mesh.vertexCount * 2);
  });

  it("keeps rectangular and large-offset meshes tile-local and finite", function () {
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float64Array([-5.0, 0.0, 5.0, 15.0, 20.0, 25.0]),
      width: 3,
      height: 2,
    });
    const mesh = buildSceneGISPlanarTerrainMesh(data, extent);
    expect(mesh.surfaceVertexCount).toBe(6);
    expect(mesh.vertexCount).toBe(16);
    expect(mesh.surfaceIndexCount).toBe(12);
    expect(mesh.indexCount).toBe(48);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(mesh.positions[i]).toBeGreaterThanOrEqual(-0.5);
      expect(mesh.positions[i]).toBeLessThanOrEqual(0.5);
      expect(mesh.positions[i + 1]).toBeGreaterThanOrEqual(-0.5);
      expect(mesh.positions[i + 1]).toBeLessThanOrEqual(0.5);
      expect(Number.isFinite(mesh.positions[i + 2])).toBe(true);
    }
  });

  it("clamps skirt heights to the provider minimum", function () {
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float64Array([10.0, 20.0, 30.0, 40.0]),
      width: 2,
      height: 2,
    });
    const mesh = buildSceneGISPlanarTerrainMesh(data, extent, 100.0, -50.0);
    expect(mesh.skirtMinimumHeight).toBe(-50.0);
    for (
      let i = mesh.surfaceVertexCount * 3 + 2;
      i < mesh.positions.length;
      i += 3
    ) {
      expect(mesh.positions[i] + mesh.referenceHeight).toBe(-50.0);
    }
  });

  it("rejects unsupported inputs and non-Float32 relative heights", function () {
    expect(() =>
      buildSceneGISPlanarTerrainMesh({}, extent),
    ).toThrowDeveloperError();
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float64Array([
        -Number.MAX_VALUE,
        Number.MAX_VALUE,
        -Number.MAX_VALUE,
        Number.MAX_VALUE,
      ]),
      width: 2,
      height: 2,
    });
    expect(() =>
      buildSceneGISPlanarTerrainMesh(data, extent),
    ).toThrowDeveloperError();
  });

  it("keeps the source buffer owned and rejects malformed Worker output", function () {
    const source = new Float32Array([10.0, 20.0, 30.0, 40.0]);
    const data = new SceneGISPlanarHeightmapTerrainData({
      buffer: source,
      width: 2,
      height: 2,
    });
    const task = createSceneGISPlanarTerrainMeshTask(data, extent, 1.0, 0.0);
    expect(task.parameters.buffer).not.toBe(source);
    expect(Array.from(task.parameters.buffer)).toEqual(Array.from(source));
    task.parameters.buffer[0] = -100.0;
    expect(data._getSample(0, 0)).toBe(10.0);

    const result = processSceneGISPlanarTerrainTask(
      createSceneGISPlanarTerrainMeshTask(data, extent, 1.0, 0.0).parameters,
      [],
    );
    result.positions = new Float32Array(1);
    expect(() =>
      finalizeSceneGISPlanarTerrainMesh(data, result),
    ).toThrowDeveloperError();

    for (const invalidNormals of [new Uint16Array(12), new Uint8Array(1)]) {
      const malformed = processSceneGISPlanarTerrainTask(
        createSceneGISPlanarTerrainMeshTask(data, extent, 1.0, 0.0).parameters,
        [],
      );
      malformed.octEncodedNormals = invalidNormals;
      expect(() =>
        finalizeSceneGISPlanarTerrainMesh(data, malformed),
      ).toThrowDeveloperError();
    }
  });

  it("builds irregular quantized surface, skirt, owned indices, and bounded query metadata", function () {
    const quantizedExtent = new DirectSceneGISPlanarExtent({
      minimumX: extent.minimumX,
      minimumY: extent.minimumY,
      maximumX: extent.maximumX,
      maximumY: extent.maximumY,
    });
    const data = new SceneGISPlanarQuantizedMeshTerrainData({
      quantizedVertices: new Uint16Array([
        0, 32767, 0, 32767, 0, 0, 32767, 32767, 8192, 24575, 16384, 12288,
      ]),
      indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
      westIndices: new Uint16Array([0, 2]),
      southIndices: new Uint16Array([0, 1]),
      eastIndices: new Uint16Array([1, 3]),
      northIndices: new Uint16Array([2, 3]),
      quantizedMinimumHeight: -10.0,
      quantizedMaximumHeight: 90.0,
    });
    const mesh = buildSceneGISPlanarTerrainMesh(
      data,
      quantizedExtent,
      5.0,
      -100.0,
    );
    expect(mesh.surfaceVertexCount).toBe(4);
    expect(mesh.surfaceIndexCount).toBe(6);
    expect(mesh.vertexCount).toBe(12);
    expect(mesh.indices.length).toBeGreaterThan(6);
    expect(mesh.ownsIndices).toBe(true);
    expect(mesh.topologyKey).toBeUndefined();
    expect(mesh.queryGridOffsets.length).toBe(mesh.queryGridDimension ** 2 + 1);
    expect(mesh.queryGridTriangles.length).toBeLessThanOrEqual(16);
    expect(mesh.minimumHeight).toBe(data.minimumHeight);
    expect(mesh.maximumHeight).toBe(data.maximumHeight);
    expect(mesh.referenceHeight).toBe(
      data.minimumHeight * 0.5 + data.maximumHeight * 0.5,
    );
    expect(mesh.octEncodedNormals).toBeInstanceOf(Uint8Array);
    expect(mesh.octEncodedNormals.length).toBe(mesh.vertexCount * 2);

    const task = createSceneGISPlanarTerrainMeshTask(
      data,
      quantizedExtent,
      5.0,
      -100.0,
    );
    const malformed = processSceneGISPlanarTerrainTask(task.parameters, []);
    malformed.queryGridTriangles[0] = 999;
    expect(function () {
      return finalizeSceneGISPlanarTerrainMesh(data, malformed);
    }).toThrowDeveloperError();
  });
});

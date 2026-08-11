import Lerc from "lerc";
import AttributeCompression from "../../../../Source/Core/AttributeCompression.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Resource from "../../../../Source/Core/Resource.js";
import TaskProcessor from "../../../../Source/Core/TaskProcessor.js";
import processSceneGISPlanarTerrainTask from "../../../../Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js";

describe("SceneGIS/Core/SceneGISPlanarTerrainWorkerTasks", function () {
  let taskProcessor;

  function decodeNormal(mesh, index, result = new Cartesian3()) {
    return AttributeCompression.octDecode(
      mesh.octEncodedNormals[index * 2],
      mesh.octEncodedNormals[index * 2 + 1],
      result,
    );
  }

  function buildHeightmapMesh(samples, width, height, extent) {
    return processSceneGISPlanarTerrainTask(
      {
        kind: "createHeightmapMesh",
        buffer: new Float32Array(samples),
        structure: {
          heightScale: 1.0,
          heightOffset: 0.0,
          elementsPerHeight: 1,
          stride: 1,
          elementMultiplier: 256.0,
          isBigEndian: false,
        },
        width,
        height,
        minimumHeight: Math.min(...samples),
        maximumHeight: Math.max(...samples),
        effectiveGeometricError: 1.0,
        providerMinimumHeight: -100.0,
        extent,
      },
      [],
    );
  }

  function expectCanonicalSkirt(mesh, edgeLengths, expectedEdges) {
    let skirtOffset = 0;
    let indexOffset = mesh.surfaceIndexCount;
    for (let edgeIndex = 0; edgeIndex < edgeLengths.length; ++edgeIndex) {
      const length = edgeLengths[edgeIndex];
      const expected = expectedEdges[edgeIndex];
      const sources = [];
      for (let i = 0; i + 1 < length; ++i) {
        sources.push(mesh.indices[indexOffset], mesh.indices[indexOffset + 2]);
        indexOffset += 6;
      }
      expect(sources).toEqual(
        expected.flatMap((value, index) =>
          index + 1 < expected.length ? [value, expected[index + 1]] : [],
        ),
      );
      const axis = edgeIndex === 0 || edgeIndex === 2 ? 1 : 0;
      const direction = edgeIndex === 0 || edgeIndex === 3 ? 1 : -1;
      let previous;
      for (let i = 0; i < length; ++i) {
        const coordinate =
          mesh.positions[
            (mesh.surfaceVertexCount + skirtOffset + i) * 3 + axis
          ];
        if (previous !== undefined) {
          expect((coordinate - previous) * direction).toBeGreaterThan(0.0);
        }
        previous = coordinate;
      }
      skirtOffset += length;
    }
  }

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
    expect(result.octEncodedNormals).toBeInstanceOf(Uint8Array);
    expect(result.octEncodedNormals.length).toBe(result.vertexCount * 2);
    expect(result.normalByteLength).toBe(result.vertexCount * 2);
    expect(transferableObjects).toEqual([
      result.positions.buffer,
      result.octEncodedNormals.buffer,
    ]);
    const edges = [
      [2, 0],
      [3, 2],
      [1, 3],
      [0, 1],
    ];
    let skirtVertex = result.surfaceVertexCount;
    for (const edge of edges) {
      for (const source of edge) {
        expect(
          Array.from(
            result.octEncodedNormals.slice(
              skirtVertex * 2,
              skirtVertex * 2 + 2,
            ),
          ),
        ).toEqual(
          Array.from(
            result.octEncodedNormals.slice(source * 2, source * 2 + 2),
          ),
        );
        ++skirtVertex;
      }
    }
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
    expect(mesh.octEncodedNormals).toBeInstanceOf(Uint8Array);
    expect(mesh.octEncodedNormals.byteLength).toBe(mesh.vertexCount * 2);

    await expectAsync(
      taskProcessor.scheduleTask({ kind: "unknown" }),
    ).toBeRejectedWithError("The planar terrain Worker task kind is invalid.");
  });

  it("decodes the repository quantized-mesh fixture through the built Worker", async function () {
    const payload = await Resource.fetchArrayBuffer(
      "./Data/CesiumTerrainTileJson/QuantizedMesh/tile.terrain",
    );
    taskProcessor = new TaskProcessor("SceneGISPlanarTerrainWorker");
    const result = await taskProcessor.scheduleTask(
      { kind: "decodeQuantizedMesh", arrayBuffer: payload },
      [payload],
    );
    expect(payload.byteLength).toBe(0);
    expect(result.quantizedVertices).toBeInstanceOf(Uint16Array);
    expect(result.indices).toBeInstanceOf(Uint16Array);
    expect(result.indices.length % 3).toBe(0);
    expect(result.westIndices.length).toBeGreaterThan(0);

    const edgeSnapshots = [
      result.westIndices,
      result.southIndices,
      result.eastIndices,
      result.northIndices,
    ].map((edge) => Array.from(edge));
    const vertexCount = result.quantizedVertices.length / 3;
    const heights = result.quantizedVertices.subarray(vertexCount * 2);
    const decodedHeights = Array.from(
      heights,
      (height) =>
        result.quantizedMinimumHeight +
        (height / 32767.0) *
          (result.quantizedMaximumHeight - result.quantizedMinimumHeight),
    );
    const mesh = processSceneGISPlanarTerrainTask(
      {
        ...result,
        kind: "createQuantizedMeshMesh",
        minimumHeight: Math.min(...decodedHeights),
        maximumHeight: Math.max(...decodedHeights),
        effectiveGeometricError: 20.0,
        providerMinimumHeight: -1000.0,
        extent: {
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        },
      },
      [],
    );
    const u = result.quantizedVertices;
    const v = result.quantizedVertices.subarray(vertexCount, vertexCount * 2);
    const canonical = [
      Array.from(result.westIndices).sort((a, b) => v[a] - v[b] || a - b),
      Array.from(result.southIndices).sort((a, b) => u[b] - u[a] || a - b),
      Array.from(result.eastIndices).sort((a, b) => v[b] - v[a] || a - b),
      Array.from(result.northIndices).sort((a, b) => u[a] - u[b] || a - b),
    ];
    expectCanonicalSkirt(
      mesh,
      edgeSnapshots.map((edge) => edge.length),
      canonical,
    );
    expect(
      [
        result.westIndices,
        result.southIndices,
        result.eastIndices,
        result.northIndices,
      ].map((edge) => Array.from(edge)),
    ).toEqual(edgeSnapshots);
  });

  it("rejects the repository 32-bit fixture's degenerate triangle after decoding its branch", async function () {
    const payload = await Resource.fetchArrayBuffer(
      "./Data/CesiumTerrainTileJson/QuantizedMeshWith32BitIndices/tile.32bitIndices.terrain",
    );
    expect(function () {
      processSceneGISPlanarTerrainTask(
        { kind: "decodeQuantizedMesh", arrayBuffer: payload },
        [],
      );
    }).toThrowDeveloperError();
  });

  it("creates an irregular mesh, bounded query grid, and direct-child quantized fallback", function () {
    const quantized = {
      quantizedVertices: new Uint16Array([
        0, 16384, 32767, 0, 16384, 32767, 0, 16384, 32767, 0, 0, 0, 16384,
        16384, 16384, 32767, 32767, 32767, 0, 4096, 8192, 12288, 16384, 20480,
        24576, 28672, 32767,
      ]),
      indices: new Uint16Array([
        0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4, 3, 4, 6, 4, 7, 6, 4, 5, 7, 5, 8, 7,
      ]),
      westIndices: new Uint16Array([3, 0, 6]),
      southIndices: new Uint16Array([1, 2, 0]),
      eastIndices: new Uint16Array([8, 2, 5]),
      northIndices: new Uint16Array([7, 6, 8]),
      quantizedMinimumHeight: -10.0,
      quantizedMaximumHeight: 90.0,
    };
    const transfer = [];
    const mesh = processSceneGISPlanarTerrainTask(
      {
        kind: "createQuantizedMeshMesh",
        ...quantized,
        minimumHeight: -10.0,
        maximumHeight: 90.0,
        effectiveGeometricError: 5.0,
        providerMinimumHeight: -100.0,
        extent: {
          minimumX: -128.0,
          minimumY: -128.0,
          maximumX: 128.0,
          maximumY: 128.0,
        },
      },
      transfer,
    );
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.octEncodedNormals).toBeInstanceOf(Uint8Array);
    expect(mesh.octEncodedNormals.length).toBe(mesh.vertexCount * 2);
    expect(mesh.ownsIndices).toBe(true);
    expect(mesh.surfaceIndexCount).toBe(24);
    expect(mesh.queryGridTriangles.length).toBeLessThanOrEqual(64);
    expect(mesh.queryGridOffsets.length).toBe(mesh.queryGridDimension ** 2 + 1);
    expect(transfer).toContain(mesh.indices.buffer);
    const centerNormal = decodeNormal(mesh, 4);
    expect(
      [centerNormal.x, centerNormal.y, centerNormal.z].every(Number.isFinite),
    ).toBe(true);
    expect(Cartesian3.magnitude(centerNormal)).toBeCloseTo(1.0, 6);
    const worldCenterNormal = Cartesian3.normalize(
      new Cartesian3(
        centerNormal.x / 256.0,
        centerNormal.y / 256.0,
        centerNormal.z,
      ),
      new Cartesian3(),
    );
    const expectedWorldNormal = Cartesian3.normalize(
      new Cartesian3(
        -((8192.0 / 32767.0) * 100.0) / 256.0,
        -((24576.0 / 32767.0) * 100.0) / 256.0,
        1.0,
      ),
      new Cartesian3(),
    );
    expect(worldCenterNormal.z).toBeGreaterThan(0.9);
    expect(
      Cartesian3.dot(worldCenterNormal, expectedWorldNormal),
    ).toBeGreaterThan(0.998);
    expectCanonicalSkirt(
      mesh,
      [3, 3, 3, 3],
      [
        [0, 3, 6],
        [2, 1, 0],
        [8, 5, 2],
        [6, 7, 8],
      ],
    );
    let skirtVertex = mesh.surfaceVertexCount;
    for (const edge of [
      [0, 3, 6],
      [2, 1, 0],
      [8, 5, 2],
      [6, 7, 8],
    ]) {
      for (const source of edge) {
        expect(
          Array.from(
            mesh.octEncodedNormals.slice(skirtVertex * 2, skirtVertex * 2 + 2),
          ),
        ).toEqual(
          Array.from(mesh.octEncodedNormals.slice(source * 2, source * 2 + 2)),
        );
        ++skirtVertex;
      }
    }

    const child = processSceneGISPlanarTerrainTask(
      {
        kind: "upsampleQuantizedMesh",
        ...quantized,
        sourceAddress: { x: 0, y: 0, level: 0 },
        childAddress: { x: 1, y: 0, level: 1 },
      },
      [],
    );
    expect(child.kind).toBe("upsampleQuantizedMesh");
    expect(child.quantizedVertices).toBeInstanceOf(Uint16Array);
    expect(child.indices.length).toBeGreaterThan(0);
    expect(child.westIndices.length).toBeGreaterThan(0);
    expect(child.eastIndices.length).toBeGreaterThan(0);
  });

  it("creates per-tile Uint32 indices when an irregular mesh exceeds the Uint16 vertex range", function () {
    const vertexCount = 65537;
    const quantizedVertices = new Uint16Array(vertexCount * 3);
    quantizedVertices.fill(1, 4, vertexCount);
    quantizedVertices.fill(1, vertexCount + 4, vertexCount * 2);
    quantizedVertices.set([0, 32767, 0, 32767]);
    quantizedVertices.set([0, 0, 32767, 32767], vertexCount);
    const result = processSceneGISPlanarTerrainTask(
      {
        kind: "createQuantizedMeshMesh",
        quantizedVertices,
        indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
        westIndices: new Uint32Array([0, 2]),
        southIndices: new Uint32Array([1, 0]),
        eastIndices: new Uint32Array([3, 1]),
        northIndices: new Uint32Array([2, 3]),
        quantizedMinimumHeight: 0.0,
        quantizedMaximumHeight: 0.0,
        minimumHeight: 0.0,
        maximumHeight: 0.0,
        effectiveGeometricError: 1.0,
        providerMinimumHeight: -10.0,
        extent: {
          minimumX: 0.0,
          minimumY: 0.0,
          maximumX: 1.0,
          maximumY: 1.0,
        },
      },
      [],
    );

    expect(result.indices).toBeInstanceOf(Uint32Array);
    expect(result.surfaceVertexCount).toBe(vertexCount);
    expect(result.ownsIndices).toBe(true);
  });

  it("smooths shared vertices and preserves representative tile and LOD boundary normals", function () {
    const curved = buildHeightmapMesh(
      [0.0, 0.0, 0.0, 0.0, 10.0, 0.0, 0.0, 0.0, 0.0],
      3,
      3,
      { minimumX: -1.0, minimumY: -1.0, maximumX: 1.0, maximumY: 1.0 },
    );
    function triangleNormal(i0, i1, i2) {
      const p0 = Cartesian3.fromArray(
        curved.positions,
        i0 * 3,
        new Cartesian3(),
      );
      const p1 = Cartesian3.fromArray(
        curved.positions,
        i1 * 3,
        new Cartesian3(),
      );
      const p2 = Cartesian3.fromArray(
        curved.positions,
        i2 * 3,
        new Cartesian3(),
      );
      return Cartesian3.normalize(
        Cartesian3.cross(
          Cartesian3.subtract(p1, p0, p1),
          Cartesian3.subtract(p2, p0, p2),
          p0,
        ),
        p0,
      );
    }
    const firstFace = triangleNormal(0, 3, 1);
    const secondFace = triangleNormal(1, 3, 4);
    const perFaceJump = Math.acos(
      Math.max(-1.0, Math.min(1.0, Cartesian3.dot(firstFace, secondFace))),
    );
    function interpolateCandidateNormal(indices, weights) {
      const candidate = new Cartesian3();
      const weighted = new Cartesian3();
      for (let i = 0; i < indices.length; ++i) {
        Cartesian3.multiplyByScalar(
          decodeNormal(curved, indices[i], weighted),
          weights[i],
          weighted,
        );
        Cartesian3.add(candidate, weighted, candidate);
      }
      return Cartesian3.normalize(candidate, candidate);
    }
    const firstCandidate = interpolateCandidateNormal(
      [0, 3, 1],
      [0.25, 0.1875, 0.5625],
    );
    const secondCandidate = interpolateCandidateNormal(
      [4, 1, 3],
      [0.25, 0.5625, 0.1875],
    );
    const smoothEdgeJump = Math.acos(
      Math.max(
        -1.0,
        Math.min(1.0, Cartesian3.dot(firstCandidate, secondCandidate)),
      ),
    );
    expect(perFaceJump).toBeGreaterThan(0.1);
    expect(Cartesian3.magnitude(firstCandidate)).toBeCloseTo(1.0, 6);
    expect(Cartesian3.magnitude(secondCandidate)).toBeCloseTo(1.0, 6);
    expect(smoothEdgeJump).toBeGreaterThan(0.0);
    expect(smoothEdgeJump).toBeLessThan(perFaceJump);

    function buildPlane(extent) {
      const samples = [];
      for (let row = 0; row < 3; ++row) {
        const y =
          extent.maximumY - (row / 2) * (extent.maximumY - extent.minimumY);
        for (let column = 0; column < 3; ++column) {
          const x =
            extent.minimumX +
            (column / 2) * (extent.maximumX - extent.minimumX);
          samples.push(0.25 * x - 0.125 * y);
        }
      }
      return buildHeightmapMesh(samples, 3, 3, extent);
    }
    function worldNormal(mesh, index, width) {
      const normal = decodeNormal(mesh, index);
      normal.x /= width;
      normal.y /= width;
      return Cartesian3.normalize(normal, normal);
    }
    const parentExtent = {
      minimumX: -2.0,
      minimumY: -2.0,
      maximumX: 2.0,
      maximumY: 2.0,
    };
    const parent = buildPlane(parentExtent);
    const reference = worldNormal(parent, 4, 4.0);
    const childExtents = [
      { minimumX: -2.0, minimumY: 0.0, maximumX: 0.0, maximumY: 2.0 },
      { minimumX: 0.0, minimumY: 0.0, maximumX: 2.0, maximumY: 2.0 },
      { minimumX: -2.0, minimumY: -2.0, maximumX: 0.0, maximumY: 0.0 },
      { minimumX: 0.0, minimumY: -2.0, maximumX: 2.0, maximumY: 0.0 },
    ];
    for (const childExtent of childExtents) {
      const child = buildPlane(childExtent);
      for (let i = 0; i < child.surfaceVertexCount; ++i) {
        expect(
          Cartesian3.dot(reference, worldNormal(child, i, 2.0)),
        ).toBeGreaterThan(0.999);
      }
    }
  });
});

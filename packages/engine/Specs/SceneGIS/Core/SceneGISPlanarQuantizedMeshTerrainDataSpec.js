import Credit from "../../../Source/Core/Credit.js";
import SceneGISPlanarExtent from "../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarQuantizedMeshTerrainData from "../../../Source/SceneGIS/Core/SceneGISPlanarQuantizedMeshTerrainData.js";

describe("SceneGIS/Core/SceneGISPlanarQuantizedMeshTerrainData", function () {
  function createOptions(overrides = {}) {
    return {
      quantizedVertices: new Uint16Array([
        0, 32767, 0, 32767, 0, 0, 32767, 32767, 0, 32767, 16384, 8192,
      ]),
      indices: new Uint16Array([0, 1, 2, 1, 3, 2]),
      westIndices: new Uint16Array([0, 2]),
      southIndices: new Uint16Array([0, 1]),
      eastIndices: new Uint16Array([1, 3]),
      northIndices: new Uint16Array([2, 3]),
      quantizedMinimumHeight: -10.0,
      quantizedMaximumHeight: 90.0,
      ...overrides,
    };
  }

  it("owns validated irregular topology and publishes actual decoded range", function () {
    const credit = new Credit("tile");
    const options = createOptions({ credits: [credit], childTileMask: 6 });
    const data = new SceneGISPlanarQuantizedMeshTerrainData(options);

    expect(data.minimumHeight).toBe(-10.0);
    expect(data.maximumHeight).toBe(90.0);
    expect(data.credits).toEqual([credit]);
    expect(data.waterMask).toBeUndefined();
    expect(data.wasCreatedByUpsampling).toBe(false);
    expect(data.isChildAvailable(0, 0, 0, 0)).toBe(true);
    expect(data.isChildAvailable(0, 0, 0, 1)).toBe(false);
  });

  it("interpolates the true quantized triangles with inclusive boundaries", function () {
    const data = new SceneGISPlanarQuantizedMeshTerrainData(createOptions());
    const extent = new SceneGISPlanarExtent({
      minimumX: -20037508.342789244,
      minimumY: -20037508.342789244,
      maximumX: 20037508.342789244,
      maximumY: 20037508.342789244,
    });
    expect(
      data.interpolateHeight(extent, extent.minimumX, extent.minimumY),
    ).toBe(-10.0);
    expect(
      data.interpolateHeight(extent, extent.maximumX, extent.minimumY),
    ).toBe(90.0);
    expect(data.interpolateHeight(extent, 0.0, 0.0)).toBeCloseTo(
      -10.0 + ((32767 + 16384) * 0.5 * 100.0) / 32767,
      8,
    );
    expect(
      data.interpolateHeight(extent, extent.maximumX + 1.0, 0.0),
    ).toBeUndefined();
  });

  it("creates independent transferable mesh and upsample payloads", function () {
    const options = createOptions();
    const data = new SceneGISPlanarQuantizedMeshTerrainData(options);
    const extent = new SceneGISPlanarExtent({
      minimumX: -1.0,
      minimumY: -1.0,
      maximumX: 1.0,
      maximumY: 1.0,
    });
    const mesh = data._createMeshTaskPayload(extent, 2.0, -100.0);
    const upsample = data._createUpsampleTaskPayload(
      { x: 0, y: 0, level: 0 },
      { x: 1, y: 0, level: 1 },
    );
    expect(mesh.parameters.quantizedVertices).not.toBe(
      options.quantizedVertices,
    );
    expect(upsample.parameters.indices).not.toBe(options.indices);
    mesh.parameters.quantizedVertices[0] = 1;
    expect(data.interpolateHeight(extent, -1.0, -1.0)).toBe(-10.0);
    expect(mesh.transferableObjects.length).toBe(6);
    expect(upsample.transferableObjects.length).toBe(6);
  });

  it("rejects malformed vertices, triangles, and incomplete edges atomically", function () {
    expect(function () {
      return new SceneGISPlanarQuantizedMeshTerrainData(
        createOptions({ quantizedVertices: new Uint16Array([0, 1, 2]) }),
      );
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarQuantizedMeshTerrainData(
        createOptions({ indices: new Uint16Array([0, 2, 1]) }),
      );
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarQuantizedMeshTerrainData(
        createOptions({ westIndices: new Uint16Array([0]) }),
      );
    }).toThrowDeveloperError();
    expect(function () {
      return new SceneGISPlanarQuantizedMeshTerrainData(
        createOptions({
          quantizedMinimumHeight: -Number.MAX_VALUE,
          quantizedMaximumHeight: Number.MAX_VALUE,
        }),
      );
    }).toThrowDeveloperError();
  });

  it("supports Uint32 topology and validates direct child addresses", function () {
    const options = createOptions({
      indices: new Uint32Array([0, 1, 2, 1, 3, 2]),
      westIndices: new Uint32Array([0, 2]),
      southIndices: new Uint32Array([0, 1]),
      eastIndices: new Uint32Array([1, 3]),
      northIndices: new Uint32Array([2, 3]),
    });
    const data = new SceneGISPlanarQuantizedMeshTerrainData(options);
    expect(data.isChildAvailable(4, 3, 9, 7)).toBe(true);
    expect(function () {
      data.isChildAvailable(4, 3, 9, 8);
    }).toThrowDeveloperError();
  });
});

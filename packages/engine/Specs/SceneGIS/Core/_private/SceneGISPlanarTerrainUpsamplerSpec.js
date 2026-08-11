import Credit from "../../../../Source/Core/Credit.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarHeightmapTerrainData from "../../../../Source/SceneGIS/Core/SceneGISPlanarHeightmapTerrainData.js";
import SceneGISPlanarQuantizedMeshTerrainData from "../../../../Source/SceneGIS/Core/SceneGISPlanarQuantizedMeshTerrainData.js";
import upsampleSceneGISPlanarTerrain from "../../../../Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainUpsampler.js";
import processSceneGISPlanarTerrainTask from "../../../../Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js";

describe("SceneGIS/Core/SceneGISPlanarTerrainUpsampler", function () {
  const rootExtent = new SceneGISPlanarExtent({
    minimumX: -20037508.342789244,
    minimumY: -20037508.342789244,
    maximumX: 20037508.342789244,
    maximumY: 20037508.342789244,
  });
  const northwestExtent = new SceneGISPlanarExtent({
    minimumX: rootExtent.minimumX,
    minimumY: 0.0,
    maximumX: 0.0,
    maximumY: rootExtent.maximumY,
  });
  const northeastExtent = new SceneGISPlanarExtent({
    minimumX: 0.0,
    minimumY: 0.0,
    maximumX: rootExtent.maximumX,
    maximumY: rootExtent.maximumY,
  });
  const southwestExtent = new SceneGISPlanarExtent({
    minimumX: rootExtent.minimumX,
    minimumY: rootExtent.minimumY,
    maximumX: 0.0,
    maximumY: 0.0,
  });
  const southeastExtent = new SceneGISPlanarExtent({
    minimumX: 0.0,
    minimumY: rootExtent.minimumY,
    maximumX: rootExtent.maximumX,
    maximumY: 0.0,
  });

  it("upsamples one direct child in north-west row order", function () {
    const credit = new Credit("terrain");
    const source = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float64Array([20.0, 100.0, 0.0, 40.0]),
      width: 2,
      height: 2,
      credits: [credit],
    });
    const result = upsampleSceneGISPlanarTerrain(
      source,
      rootExtent,
      { x: 0, y: 0, level: 0 },
      northwestExtent,
      { x: 0, y: 0, level: 1 },
    );

    expect(result.width).toBe(2);
    expect(result.height).toBe(2);
    expect(result.wasCreatedByUpsampling).toBe(true);
    expect(result.credits).toBe(source.credits);
    expect(result.waterMask).toBeUndefined();
    expect(result._getSample(0, 0)).toBe(20.0);
    expect(result._getSample(0, 1)).toBeCloseTo(60.0, 12);
    expect(result._getSample(1, 0)).toBeCloseTo(10.0, 12);
    expect(result._getSample(1, 1)).toBeCloseTo(50.0, 12);
    expect(result.isChildAvailable(0, 0, 0, 0)).toBe(false);
  });

  it("preserves the southwest-to-northeast triangle surface", function () {
    const source = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float64Array([20.0, 60.0, 100.0, 0.0, 20.0, 40.0]),
      width: 3,
      height: 2,
    });
    const result = upsampleSceneGISPlanarTerrain(
      source,
      rootExtent,
      { x: 0, y: 0, level: 0 },
      northwestExtent,
      { x: 0, y: 0, level: 1 },
    );
    for (let row = 0; row < result.height; ++row) {
      const y =
        northwestExtent.maximumY -
        (row / (result.height - 1)) * northwestExtent.height;
      for (let column = 0; column < result.width; ++column) {
        const x =
          northwestExtent.minimumX +
          (column / (result.width - 1)) * northwestExtent.width;
        expect(result._getSample(row, column)).toBeCloseTo(
          source.interpolateHeight(rootExtent, x, y),
          12,
        );
      }
    }
  });

  it("rejects non-direct addresses and invalid samples", function () {
    const source = new SceneGISPlanarHeightmapTerrainData({
      buffer: new Float64Array([0.0, 1.0, 2.0, 3.0]),
      width: 2,
      height: 2,
    });
    expect(function () {
      upsampleSceneGISPlanarTerrain(
        source,
        rootExtent,
        { x: 0, y: 0, level: 0 },
        northwestExtent,
        { x: 0, y: 0, level: 2 },
      );
    }).toThrowDeveloperError();

    spyOn(source, "interpolateHeight").and.returnValue(undefined);
    expect(function () {
      upsampleSceneGISPlanarTerrain(
        source,
        rootExtent,
        { x: 0, y: 0, level: 0 },
        northwestExtent,
        { x: 0, y: 0, level: 1 },
      );
    }).toThrowDeveloperError();
  });

  it("clips true quantized triangles into an independent direct child", function () {
    const source = new SceneGISPlanarQuantizedMeshTerrainData({
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
      credits: [new Credit("quantized")],
    });
    const fixtures = [
      { address: { x: 0, y: 0, level: 1 }, extent: northwestExtent },
      { address: { x: 1, y: 0, level: 1 }, extent: northeastExtent },
      { address: { x: 0, y: 1, level: 1 }, extent: southwestExtent },
      { address: { x: 1, y: 1, level: 1 }, extent: southeastExtent },
    ];
    const children = fixtures.map((fixture) => {
      const task = source._createUpsampleTaskPayload(
        { x: 0, y: 0, level: 0 },
        fixture.address,
      );
      const result = processSceneGISPlanarTerrainTask(task.parameters, []);
      const child = new SceneGISPlanarQuantizedMeshTerrainData({
        ...result,
        childTileMask: 0,
        createdByUpsampling: true,
        credits: source.credits,
      });
      const x = fixture.extent.minimumX + fixture.extent.width * 0.37;
      const y = fixture.extent.minimumY + fixture.extent.height * 0.61;
      expect(child.wasCreatedByUpsampling).toBe(true);
      expect(child.credits).toBe(source.credits);
      expect(child.waterMask).toBeUndefined();
      expect(
        child.isChildAvailable(
          fixture.address.x,
          fixture.address.y,
          fixture.address.x * 2,
          fixture.address.y * 2,
        ),
      ).toBe(false);
      expect(child.interpolateHeight(fixture.extent, x, y)).toBeCloseTo(
        source.interpolateHeight(rootExtent, x, y),
        2,
      );
      return child;
    });
    const seamY = rootExtent.maximumY * 0.5;
    expect(
      children[0].interpolateHeight(northwestExtent, 0.0, seamY),
    ).toBeCloseTo(
      children[1].interpolateHeight(northeastExtent, 0.0, seamY),
      5,
    );
  });
});

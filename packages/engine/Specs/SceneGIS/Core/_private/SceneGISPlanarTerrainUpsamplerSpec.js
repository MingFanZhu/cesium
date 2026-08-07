import Credit from "../../../../Source/Core/Credit.js";
import SceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarHeightmapTerrainData from "../../../../Source/SceneGIS/Core/SceneGISPlanarHeightmapTerrainData.js";
import upsampleSceneGISPlanarTerrain from "../../../../Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainUpsampler.js";

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
});

import {
  Matrix4,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarTilingScheme,
} from "../../../../index.js";
import SceneGISPlanarTile from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarTile.js";

describe("SceneGIS/Scene/SceneGISPlanarTile", function () {
  function createTilingScheme(minimum = -100.0, maximum = 100.0) {
    return new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({
        extent: new SceneGISPlanarExtent({
          minimumX: minimum,
          minimumY: minimum,
          maximumX: maximum,
          maximumY: maximum,
        }),
      }),
    });
  }

  it("stores a stable address, extent, and zero-thickness bounding box", function () {
    const tile = new SceneGISPlanarTile(createTilingScheme(), 1, 0, 1);

    expect(tile.key).toBe("1/1/0");
    expect(tile.extent.minimumX).toBe(0.0);
    expect(tile.extent.maximumY).toBe(100.0);
    expect(tile.boundingVolume.center.x).toBe(50.0);
    expect(tile.boundingVolume.center.y).toBe(50.0);
    expect(tile.boundingVolume.center.z).toBe(0.0);
    expect(tile.boundingVolume.halfAxes[8]).toBe(0.0);
  });

  it("places a shared unit quad with a finite model matrix", function () {
    const minimum = 1.0e9;
    const tile = new SceneGISPlanarTile(
      createTilingScheme(minimum, minimum + 1024.0),
      1,
      1,
      1,
    );

    expect(tile.modelMatrix[0]).toBe(512.0);
    expect(tile.modelMatrix[5]).toBe(512.0);
    expect(tile.modelMatrix[12]).toBe(minimum + 768.0);
    expect(tile.modelMatrix[13]).toBe(minimum + 256.0);
    for (let i = 0; i < Matrix4.packedLength; ++i) {
      expect(Number.isFinite(tile.modelMatrix[i])).toBe(true);
    }
  });

  it("destroys tile-owned state exactly once", function () {
    const tile = new SceneGISPlanarTile(createTilingScheme(), 0, 0, 0);
    tile.command = {};

    tile.destroy();
    tile.destroy();

    expect(tile.isDestroyed()).toBe(true);
    expect(tile.command).toBeUndefined();
  });
});

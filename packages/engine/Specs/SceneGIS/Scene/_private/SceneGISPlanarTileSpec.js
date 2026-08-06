import {
  Cartesian3,
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

  function expectCommandBoundingVolume(tile) {
    const volume = tile.commandBoundingVolume;
    expect(volume.center).toEqual(tile.boundingVolume.center);
    expect(Number.isFinite(volume.radius)).toBe(true);
    expect(volume.radius).toBeGreaterThan(0.0);

    const extent = tile.extent;
    const corners = [
      new Cartesian3(extent.minimumX, extent.minimumY, 0.0),
      new Cartesian3(extent.minimumX, extent.maximumY, 0.0),
      new Cartesian3(extent.maximumX, extent.minimumY, 0.0),
      new Cartesian3(extent.maximumX, extent.maximumY, 0.0),
    ];
    for (const corner of corners) {
      expect(Cartesian3.distance(volume.center, corner)).toBeLessThanOrEqual(
        volume.radius,
      );
    }
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
    expectCommandBoundingVolume(tile);
  });

  it("derives one conservative command volume for large-offset and maximum-level tiles", function () {
    const largeOffset = new SceneGISPlanarTile(
      createTilingScheme(1.0e9, 1.0e9 + 1024.0),
      1,
      1,
      1,
    );
    expect(largeOffset.boundingVolume.halfAxes[8]).toBe(0.0);
    expectCommandBoundingVolume(largeOffset);

    const tilingScheme = createTilingScheme();
    const level = tilingScheme.maximumSafeLevel;
    const count = 2 ** level;
    const maximumLevelTile = new SceneGISPlanarTile(
      tilingScheme,
      count - 1,
      Math.floor(count * 0.5),
      level,
    );
    expect(maximumLevelTile.boundingVolume.halfAxes[8]).toBe(0.0);
    expectCommandBoundingVolume(maximumLevelTile);
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

    expect(tile.imageryBindings).toBeUndefined();
    expect(tile._imageryRelease).toBeUndefined();

    tile.destroy();
    tile.destroy();

    expect(tile.isDestroyed()).toBe(true);
    expect(tile.command).toBeUndefined();
  });

  it("releases imagery bindings when the cached tile is evicted", function () {
    const tile = new SceneGISPlanarTile(createTilingScheme(), 0, 0, 0);
    const release = jasmine.createSpy("release");
    tile._imageryRelease = release;
    tile.imageryBindings = new Map();
    tile.imageryBindings.set({}, {});

    tile.destroy();
    tile.destroy();

    expect(release).toHaveBeenCalledOnceWith(tile);
    expect(tile.imageryBindings).toBeUndefined();
    expect(tile._imageryRelease).toBeUndefined();
  });
});

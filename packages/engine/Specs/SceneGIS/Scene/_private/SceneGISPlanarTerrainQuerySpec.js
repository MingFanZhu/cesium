import {
  Cartesian3,
  Ray,
  SceneGISPlanarCoordinateSystem,
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
  SceneGISPlanarTilingScheme,
} from "../../../../index.js";
import {
  createSceneGISPlanarTerrainMeshTask,
  finalizeSceneGISPlanarTerrainMesh,
} from "../../../../Source/SceneGIS/Renderer/_private/_SceneGISPlanarTerrainMesh.js";
import DirectSceneGISPlanarExtent from "../../../../Source/SceneGIS/Core/SceneGISPlanarExtent.js";
import SceneGISPlanarQuantizedMeshTerrainData from "../../../../Source/SceneGIS/Core/SceneGISPlanarQuantizedMeshTerrainData.js";
import processSceneGISPlanarTerrainTask from "../../../../Source/SceneGIS/Core/_private/_SceneGISPlanarTerrainWorkerTasks.js";
import SceneGISPlanarTerrainQuery from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarTerrainQuery.js";
import SceneGISPlanarTile from "../../../../Source/SceneGIS/Scene/_private/_SceneGISPlanarTile.js";

describe("SceneGIS/Scene/_SceneGISPlanarTerrainQuery", function () {
  function createTile(options = {}) {
    const extent =
      options.extent ??
      new SceneGISPlanarExtent({
        minimumX: -128.0,
        minimumY: -128.0,
        maximumX: 128.0,
        maximumY: 128.0,
      });
    const tilingScheme = new SceneGISPlanarTilingScheme({
      coordinateSystem: new SceneGISPlanarCoordinateSystem({ extent }),
    });
    const tile = new SceneGISPlanarTile(tilingScheme, 0, 0, 0);
    const width = options.width ?? 2;
    const height = options.height ?? 2;
    const terrainData = new SceneGISPlanarHeightmapTerrainData({
      buffer: options.buffer ?? new Float32Array([-10.0, 10.0, 20.0, 40.0]),
      width,
      height,
    });
    const task = createSceneGISPlanarTerrainMeshTask(
      terrainData,
      tile.extent,
      4.0,
      -100.0,
    );
    const mesh = finalizeSceneGISPlanarTerrainMesh(
      terrainData,
      processSceneGISPlanarTerrainTask(task.parameters, []),
    );
    const content = {
      source: options.source ?? "DIRECT",
      revision: options.revision ?? 1,
      terrainData,
      mesh,
    };
    tile.terrainEntry = { activeContent: content };
    return { tile, terrainData, content };
  }

  function snapshotEntry(fixture) {
    return {
      tile: fixture.tile,
      content: fixture.content,
      mesh: fixture.content.mesh,
      source: fixture.content.source,
      revision: fixture.content.revision,
      key: fixture.tile.key,
    };
  }

  it("evaluates the actual Float32 SW-to-NE surface triangle", function () {
    const fixture = createTile();
    const x = 32.0;
    const y = -48.0;
    expect(
      SceneGISPlanarTerrainQuery.getHeight(fixture.tile, fixture.content, x, y),
    ).toEqual(fixture.terrainData.interpolateHeight(fixture.tile.extent, x, y));
    expect(
      SceneGISPlanarTerrainQuery.getHeight(
        fixture.tile,
        fixture.content,
        -128.0,
        128.0,
      ),
    ).toBe(-10.0);
  });

  it("retains tile-local Float32 interpolation at an EPSG:3857 offset", function () {
    const half = 20037508.342789244;
    const fixture = createTile({
      extent: new SceneGISPlanarExtent({
        minimumX: -half,
        minimumY: -half,
        maximumX: half,
        maximumY: half,
      }),
    });
    const x = half * 0.375;
    const y = -half * 0.125;
    const height = SceneGISPlanarTerrainQuery.getHeight(
      fixture.tile,
      fixture.content,
      x,
      y,
    );
    expect(Number.isFinite(height)).toBe(true);
    expect(height).toEqual(
      fixture.terrainData.interpolateHeight(fixture.tile.extent, x, y),
    );
  });

  it("finds the actual Float32 cell beside a non-power-of-two grid line", function () {
    const fixture = createTile({
      width: 4,
      height: 4,
      buffer: new Float64Array([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
      ]),
    });
    const x = 42.66666666666666;
    const y = 13.123;
    const height = SceneGISPlanarTerrainQuery.getHeight(
      fixture.tile,
      fixture.content,
      x,
      y,
    );
    const picked = SceneGISPlanarTerrainQuery.pick(
      [snapshotEntry(fixture)],
      1,
      {
        origin: new Cartesian3(x, y, 100.0),
        direction: new Cartesian3(0.0, 0.0, -2.0),
      },
    );

    expect(height).toBeDefined();
    expect(picked).toBeDefined();
    expect(height).toBeCloseTo(picked.z, 12);
  });

  it("picks the nearest double-sided surface with affine ray parameters", function () {
    const fixture = createTile({ buffer: new Float32Array([30, 30, 30, 30]) });
    const snapshot = [snapshotEntry(fixture)];
    const result = new Cartesian3();
    expect(
      SceneGISPlanarTerrainQuery.pick(
        snapshot,
        1,
        {
          origin: new Cartesian3(0, 0, 90),
          direction: new Cartesian3(0, 0, -3),
        },
        result,
      ),
    ).toBe(result);
    expect(result).toEqual(new Cartesian3(0, 0, 30));
    expect(
      SceneGISPlanarTerrainQuery.pick(
        snapshot,
        1,
        new Ray(new Cartesian3(0, 0, -10), new Cartesian3(0, 0, 2)),
      ).z,
    ).toBe(30.0);
    expect(
      SceneGISPlanarTerrainQuery.pick(
        snapshot,
        1,
        new Ray(new Cartesian3(0, 0, 30), new Cartesian3(1, 0, 1)),
      ),
    ).toEqual(new Cartesian3(0, 0, 30));
  });

  it("uses actual Float32 surface extrema for non-unit horizontal rays", function () {
    const fixture = createTile({
      buffer: new Float64Array([0.1, 0.2, 0.1, 0.2]),
    });
    const mesh = fixture.content.mesh;
    const westHeight = mesh.referenceHeight + mesh.positions[2];
    expect(westHeight).toBeLessThan(fixture.terrainData.minimumHeight);
    const snapshot = [snapshotEntry(fixture)];
    const westToEast = SceneGISPlanarTerrainQuery.pick(snapshot, 1, {
      origin: new Cartesian3(-256.0, 0.0, westHeight),
      direction: new Cartesian3(2.0, 0.0, 0.0),
    });
    const eastToWest = SceneGISPlanarTerrainQuery.pick(snapshot, 1, {
      origin: new Cartesian3(0.0, 0.0, westHeight),
      direction: new Cartesian3(-2.0, 0.0, 0.0),
    });

    expect(westToEast).toEqualEpsilon(
      new Cartesian3(-128.0, 0.0, westHeight),
      1.0e-12,
    );
    expect(eastToWest).toEqualEpsilon(westToEast, 1.0e-12);
  });

  it("excludes skirts and lets nearest flat coverage occlude terrain", function () {
    const terrain = createTile({
      buffer: new Float32Array([-10, -10, -10, -10]),
    });
    expect(
      SceneGISPlanarTerrainQuery.pick(
        [snapshotEntry(terrain)],
        1,
        new Ray(new Cartesian3(-256, 0, -20), new Cartesian3(1, 0, 0)),
      ),
    ).toBeUndefined();

    const flat = createTile({ source: "FLAT", revision: 2 });
    flat.content.mesh = undefined;
    flat.tile.terrainEntry.activeContent = flat.content;
    flat.tile.key = "0/flat/0";
    expect(
      SceneGISPlanarTerrainQuery.pick(
        [snapshotEntry(terrain), snapshotEntry(flat)],
        2,
        new Ray(new Cartesian3(0, 0, 20), new Cartesian3(0, 0, -1)),
      ),
    ).toBeUndefined();
  });

  it("ignores stale snapshot identities and revisions", function () {
    const fixture = createTile({ buffer: new Float32Array([10, 10, 10, 10]) });
    const snapshot = [snapshotEntry(fixture)];
    fixture.tile.terrainEntry.activeContent = {
      ...fixture.content,
      revision: 2,
    };
    expect(
      SceneGISPlanarTerrainQuery.pick(
        snapshot,
        1,
        new Ray(new Cartesian3(0, 0, 20), new Cartesian3(0, 0, -1)),
      ),
    ).toBeUndefined();
    expect(
      SceneGISPlanarTerrainQuery.pick(
        snapshot,
        0,
        new Ray(new Cartesian3(0, 0, 20), new Cartesian3(0, 0, -1)),
      ),
    ).toBeUndefined();
  });

  it("uses the bounded quantized query grid and true irregular triangles", function () {
    const extent = new DirectSceneGISPlanarExtent({
      minimumX: -128.0,
      minimumY: -128.0,
      maximumX: 128.0,
      maximumY: 128.0,
    });
    const terrainData = new SceneGISPlanarQuantizedMeshTerrainData({
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
    });
    const task = terrainData._createMeshTaskPayload(extent, 4.0, -100.0);
    const mesh = finalizeSceneGISPlanarTerrainMesh(
      terrainData,
      processSceneGISPlanarTerrainTask(task.parameters, []),
    );
    const content = { source: "DIRECT", revision: 1, terrainData, mesh };
    const tile = {
      extent,
      key: "0/0/0",
      terrainEntry: { activeContent: content },
      isDestroyed: function () {
        return false;
      },
    };
    const x = 32.0;
    const y = -48.0;
    const height = SceneGISPlanarTerrainQuery.getHeight(tile, content, x, y);
    expect(height).toBeDefined();
    expect(height).toBeCloseTo(terrainData.interpolateHeight(extent, x, y), 4);
    expect(
      SceneGISPlanarTerrainQuery.pick(
        [
          {
            tile,
            content,
            mesh,
            source: "DIRECT",
            revision: 1,
            key: tile.key,
          },
        ],
        1,
        new Ray(new Cartesian3(x, y, 100.0), new Cartesian3(0, 0, -1)),
      ).z,
    ).toBeCloseTo(height, 5);
  });
});

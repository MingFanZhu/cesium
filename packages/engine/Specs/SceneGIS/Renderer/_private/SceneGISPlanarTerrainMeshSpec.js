import {
  SceneGISPlanarExtent,
  SceneGISPlanarHeightmapTerrainData,
} from "../../../../index.js";
import buildSceneGISPlanarTerrainMesh from "../../../../Source/SceneGIS/Renderer/_private/_SceneGISPlanarTerrainMesh.js";

describe("SceneGIS/Renderer/SceneGISPlanarTerrainMesh", function () {
  const extent = new SceneGISPlanarExtent({
    minimumX: -20037508.342789244,
    minimumY: -20037508.342789244,
    maximumX: 20037508.342789244,
    maximumY: 20037508.342789244,
  });

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
});

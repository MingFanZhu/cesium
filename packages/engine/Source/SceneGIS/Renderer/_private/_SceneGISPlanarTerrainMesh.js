import DeveloperError from "../../../Core/DeveloperError.js";
import TerrainProvider from "../../../Core/TerrainProvider.js";

/**
 * Creates a transferable Worker payload without transferring TerrainData-owned storage.
 *
 * @param {SceneGISPlanarHeightmapTerrainData} terrainData The source terrain data.
 * @param {SceneGISPlanarExtent} extent The represented tile extent.
 * @param {number} effectiveGeometricError The effective tile error in meters.
 * @param {number} providerMinimumHeight The provider minimum height in meters.
 * @returns {{parameters: object, transferableObjects: ArrayBuffer[]}} The task payload.
 * @private
 */
function createSceneGISPlanarTerrainMeshTask(
  terrainData,
  extent,
  effectiveGeometricError,
  providerMinimumHeight,
) {
  if (
    !terrainData ||
    typeof terrainData._createMeshTaskPayload !== "function"
  ) {
    throw new DeveloperError(
      "terrainData must be a SceneGISPlanarHeightmapTerrainData.",
    );
  }
  return terrainData._createMeshTaskPayload(
    extent,
    effectiveGeometricError,
    providerMinimumHeight,
  );
}

/**
 * Preflights a Worker result and attaches main-thread shared topology.
 *
 * @param {SceneGISPlanarHeightmapTerrainData} terrainData The source terrain data.
 * @param {object} result The Worker result.
 * @returns {object} The validated CPU mesh.
 * @private
 */
function finalizeSceneGISPlanarTerrainMesh(terrainData, result) {
  const width = terrainData?.width;
  const height = terrainData?.height;
  const topology =
    Number.isInteger(width) && Number.isInteger(height)
      ? TerrainProvider.getRegularGridAndSkirtIndicesAndEdgeIndices(
          width,
          height,
        )
      : undefined;
  const surfaceVertexCount = width * height;
  const skirtVertexCount = height + width + height + width;
  const vertexCount = surfaceVertexCount + skirtVertexCount;
  if (
    !result ||
    result.kind !== "createHeightmapMesh" ||
    !(result.positions instanceof Float32Array) ||
    result.width !== width ||
    result.height !== height ||
    result.surfaceVertexCount !== surfaceVertexCount ||
    result.skirtVertexCount !== skirtVertexCount ||
    result.vertexCount !== vertexCount ||
    result.positions.length !== vertexCount * 3 ||
    result.positionByteLength !== result.positions.byteLength ||
    result.topologyKey !== `${width}/${height}/skirt` ||
    !Number.isFinite(result.referenceHeight) ||
    result.minimumHeight !== terrainData.minimumHeight ||
    result.maximumHeight !== terrainData.maximumHeight ||
    !Number.isFinite(result.skirtMinimumHeight) ||
    result.skirtMinimumHeight > result.minimumHeight
  ) {
    throw new DeveloperError(
      "The planar terrain mesh Worker result is invalid.",
    );
  }
  for (let i = 0; i < result.positions.length; ++i) {
    if (!Number.isFinite(result.positions[i])) {
      throw new DeveloperError(
        "Every planar terrain mesh Worker position must be finite.",
      );
    }
  }
  const expectedReference =
    terrainData.minimumHeight * 0.5 + terrainData.maximumHeight * 0.5;
  if (result.referenceHeight !== expectedReference) {
    throw new DeveloperError(
      "The planar terrain mesh reference height is invalid.",
    );
  }
  const indices = topology.indices;
  return {
    ...result,
    indices,
    surfaceIndexCount: topology.indexCountWithoutSkirts,
    indexCount: indices.length,
    indexByteLength: indices.byteLength,
  };
}

export {
  createSceneGISPlanarTerrainMeshTask,
  finalizeSceneGISPlanarTerrainMesh,
};
export default finalizeSceneGISPlanarTerrainMesh;

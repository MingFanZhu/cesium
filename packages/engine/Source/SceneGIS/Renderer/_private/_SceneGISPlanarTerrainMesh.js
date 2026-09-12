import DeveloperError from "../../../Core/DeveloperError.js";
import TerrainProvider from "../../../Core/TerrainProvider.js";

function hasValidNormals(result, vertexCount) {
  return (
    result.octEncodedNormals instanceof Uint8Array &&
    result.octEncodedNormals.length === vertexCount * 2 &&
    result.normalByteLength === result.octEncodedNormals.byteLength &&
    result.octEncodedNormals.buffer !== result.positions.buffer
  );
}

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
      "terrainData must provide a supported planar terrain mesh payload.",
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
  if (result?.kind === "createQuantizedMeshMesh") {
    const metadata = terrainData?._getMeshMetadata?.();
    const surfaceVertexCount = metadata?.vertexCount;
    const expectedReference =
      terrainData?.minimumHeight * 0.5 + terrainData?.maximumHeight * 0.5;
    if (
      !metadata ||
      !(result.positions instanceof Float32Array) ||
      (!(result.indices instanceof Uint16Array) &&
        !(result.indices instanceof Uint32Array)) ||
      !(result.queryGridOffsets instanceof Uint32Array) ||
      !(result.queryGridTriangles instanceof Uint32Array) ||
      !Number.isInteger(result.queryGridDimension) ||
      result.queryGridDimension < 1 ||
      result.queryGridOffsets.length !==
        result.queryGridDimension * result.queryGridDimension + 1 ||
      result.queryGridOffsets[result.queryGridOffsets.length - 1] !==
        result.queryGridTriangles.length ||
      result.surfaceVertexCount !== surfaceVertexCount ||
      result.surfaceIndexCount !== metadata.surfaceIndexCount ||
      result.skirtVertexCount !== metadata.skirtVertexCount ||
      result.vertexCount !== surfaceVertexCount + metadata.skirtVertexCount ||
      result.vertexCount * 3 !== result.positions.length ||
      !hasValidNormals(result, result.vertexCount) ||
      result.indexCount !== result.indices.length ||
      result.indexCount !==
        result.surfaceIndexCount + metadata.skirtIndexCount ||
      result.positionByteLength !== result.positions.byteLength ||
      result.indexByteLength !== result.indices.byteLength ||
      result.minimumHeight !== terrainData.minimumHeight ||
      result.maximumHeight !== terrainData.maximumHeight ||
      result.referenceHeight !== expectedReference ||
      !Number.isFinite(result.skirtMinimumHeight) ||
      result.skirtMinimumHeight > result.minimumHeight ||
      result.ownsIndices !== true ||
      result.topologyKey !== undefined
    ) {
      throw new DeveloperError(
        "The planar quantized terrain mesh Worker result is invalid.",
      );
    }
    for (let i = 0; i < result.positions.length; ++i) {
      if (!Number.isFinite(result.positions[i])) {
        throw new DeveloperError(
          "Every planar quantized terrain mesh position must be finite.",
        );
      }
    }
    for (let i = 0; i < result.indices.length; ++i) {
      if (
        result.indices[i] >= result.vertexCount ||
        (i < result.surfaceIndexCount &&
          result.indices[i] >= result.surfaceVertexCount)
      ) {
        throw new DeveloperError(
          "Every planar quantized terrain mesh index must identify its declared vertex range.",
        );
      }
    }
    const triangleCount = result.surfaceIndexCount / 3;
    for (let i = 0; i < result.queryGridOffsets.length; ++i) {
      if (
        result.queryGridOffsets[i] > result.queryGridTriangles.length ||
        (i > 0 && result.queryGridOffsets[i] < result.queryGridOffsets[i - 1])
      ) {
        throw new DeveloperError(
          "The planar quantized terrain query-grid offsets are invalid.",
        );
      }
    }
    for (let i = 0; i < result.queryGridTriangles.length; ++i) {
      if (result.queryGridTriangles[i] >= triangleCount) {
        throw new DeveloperError(
          "The planar quantized terrain query-grid triangle is invalid.",
        );
      }
    }
    return result;
  }
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
    !hasValidNormals(result, vertexCount) ||
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

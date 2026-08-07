import DeveloperError from "../../../Core/DeveloperError.js";
import TerrainProvider from "../../../Core/TerrainProvider.js";

function midpoint(minimum, maximum) {
  return minimum * 0.5 + maximum * 0.5;
}

/**
 * Builds a tile-local regular-grid mesh from validated planar heightmap data.
 *
 * @param {SceneGISPlanarHeightmapTerrainData} terrainData The source terrain data.
 * @param {SceneGISPlanarExtent} extent The tile extent represented by the mesh.
 * @returns {object} The CPU mesh.
 * @private
 */
function buildSceneGISPlanarTerrainMesh(
  terrainData,
  extent,
  effectiveGeometricError = 0.0,
  providerMinimumHeight = terrainData?.minimumHeight,
) {
  if (
    !terrainData ||
    typeof terrainData._getSample !== "function" ||
    !Number.isInteger(terrainData.width) ||
    !Number.isInteger(terrainData.height)
  ) {
    throw new DeveloperError(
      "terrainData must be a SceneGISPlanarHeightmapTerrainData.",
    );
  }
  if (
    !extent ||
    !Number.isFinite(extent.minimumX) ||
    !Number.isFinite(extent.minimumY) ||
    !Number.isFinite(extent.maximumX) ||
    !Number.isFinite(extent.maximumY)
  ) {
    throw new DeveloperError("extent must be a SceneGISPlanarExtent.");
  }
  if (
    !Number.isFinite(effectiveGeometricError) ||
    effectiveGeometricError < 0.0 ||
    !Number.isFinite(providerMinimumHeight)
  ) {
    throw new DeveloperError(
      "Terrain skirt parameters must be finite and non-negative where required.",
    );
  }

  const width = terrainData.width;
  const height = terrainData.height;
  const surfaceVertexCount = width * height;
  if (!Number.isSafeInteger(surfaceVertexCount)) {
    throw new DeveloperError("The terrain mesh vertex count must be safe.");
  }
  const referenceHeight = midpoint(
    terrainData.minimumHeight,
    terrainData.maximumHeight,
  );
  if (!Number.isFinite(referenceHeight)) {
    throw new DeveloperError("The terrain reference height must be finite.");
  }

  const topology = TerrainProvider.getRegularGridAndSkirtIndicesAndEdgeIndices(
    width,
    height,
  );
  const edges = [
    topology.westIndicesSouthToNorth,
    topology.southIndicesEastToWest,
    topology.eastIndicesNorthToSouth,
    topology.northIndicesWestToEast,
  ];
  let skirtVertexCount = 0;
  for (const edge of edges) {
    skirtVertexCount += edge.length;
  }
  const vertexCount = surfaceVertexCount + skirtVertexCount;
  const positions = new Float32Array(vertexCount * 3);
  let offset = 0;
  for (let row = 0; row < height; ++row) {
    const localY = 0.5 - row / (height - 1);
    for (let column = 0; column < width; ++column) {
      const localX = column / (width - 1) - 0.5;
      const localZ = terrainData._getSample(row, column) - referenceHeight;
      const floatX = Math.fround(localX);
      const floatY = Math.fround(localY);
      const floatZ = Math.fround(localZ);
      if (
        !Number.isFinite(floatX) ||
        !Number.isFinite(floatY) ||
        !Number.isFinite(floatZ)
      ) {
        throw new DeveloperError(
          "Every terrain mesh position must be finite in Float32.",
        );
      }
      positions[offset++] = floatX;
      positions[offset++] = floatY;
      positions[offset++] = floatZ;
    }
  }

  const skirtDepth = effectiveGeometricError * 4.0;
  let skirtMinimumHeight = terrainData.minimumHeight;
  for (const edge of edges) {
    for (const surfaceIndex of edge) {
      const sourceOffset = surfaceIndex * 3;
      const edgeHeight = referenceHeight + positions[sourceOffset + 2];
      const skirtHeight = Math.max(
        edgeHeight - skirtDepth,
        providerMinimumHeight,
      );
      const relativeSkirtHeight = Math.fround(skirtHeight - referenceHeight);
      if (!Number.isFinite(relativeSkirtHeight)) {
        throw new DeveloperError(
          "Every terrain skirt position must be finite in Float32.",
        );
      }
      positions[offset++] = positions[sourceOffset];
      positions[offset++] = positions[sourceOffset + 1];
      positions[offset++] = relativeSkirtHeight;
      skirtMinimumHeight = Math.min(skirtMinimumHeight, skirtHeight);
    }
  }

  const indices = topology.indices;
  return {
    positions,
    indices,
    width,
    height,
    surfaceVertexCount,
    skirtVertexCount,
    vertexCount,
    surfaceIndexCount: topology.indexCountWithoutSkirts,
    indexCount: indices.length,
    referenceHeight,
    minimumHeight: terrainData.minimumHeight,
    maximumHeight: terrainData.maximumHeight,
    skirtMinimumHeight,
    positionByteLength: positions.byteLength,
    indexByteLength: indices.byteLength,
    topologyKey: `${width}/${height}/skirt`,
  };
}

export default buildSceneGISPlanarTerrainMesh;

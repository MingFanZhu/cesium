import DeveloperError from "../../../Core/DeveloperError.js";
import SceneGISPlanarExtent from "../SceneGISPlanarExtent.js";
import SceneGISPlanarHeightmapTerrainData from "../SceneGISPlanarHeightmapTerrainData.js";

function validateAddress(name, address) {
  if (
    !address ||
    !Number.isSafeInteger(address.x) ||
    address.x < 0 ||
    !Number.isSafeInteger(address.y) ||
    address.y < 0 ||
    !Number.isSafeInteger(address.level) ||
    address.level < 0
  ) {
    throw new DeveloperError(`${name} must be a valid tile address.`);
  }
}

/**
 * Upsamples planar heightmap data to one direct child tile.
 *
 * @param {SceneGISPlanarHeightmapTerrainData} sourceData The source heightmap.
 * @param {SceneGISPlanarExtent} sourceExtent The source tile extent.
 * @param {object} sourceAddress The source tile address.
 * @param {SceneGISPlanarExtent} childExtent The direct child extent.
 * @param {object} childAddress The direct child address.
 * @returns {SceneGISPlanarHeightmapTerrainData} The independent child heightmap.
 * @private
 */
function upsampleSceneGISPlanarTerrain(
  sourceData,
  sourceExtent,
  sourceAddress,
  childExtent,
  childAddress,
) {
  if (!(sourceData instanceof SceneGISPlanarHeightmapTerrainData)) {
    throw new DeveloperError(
      "sourceData must be a SceneGISPlanarHeightmapTerrainData.",
    );
  }
  if (!(sourceExtent instanceof SceneGISPlanarExtent)) {
    throw new DeveloperError("sourceExtent must be a SceneGISPlanarExtent.");
  }
  if (!(childExtent instanceof SceneGISPlanarExtent)) {
    throw new DeveloperError("childExtent must be a SceneGISPlanarExtent.");
  }
  validateAddress("sourceAddress", sourceAddress);
  validateAddress("childAddress", childAddress);
  const westChild = sourceAddress.x * 2;
  const northChild = sourceAddress.y * 2;
  if (
    !Number.isSafeInteger(westChild) ||
    !Number.isSafeInteger(northChild) ||
    childAddress.level !== sourceAddress.level + 1 ||
    (childAddress.x !== westChild && childAddress.x !== westChild + 1) ||
    (childAddress.y !== northChild && childAddress.y !== northChild + 1)
  ) {
    throw new DeveloperError("childAddress must be a direct child.");
  }

  const width = sourceData.width;
  const height = sourceData.height;
  const length = width * height;
  if (!Number.isSafeInteger(length)) {
    throw new DeveloperError("The upsampled heightmap length must be safe.");
  }
  const buffer = new Float64Array(length);
  let offset = 0;
  for (let row = 0; row < height; ++row) {
    const rowRatio = row / (height - 1);
    const y =
      row === 0
        ? childExtent.maximumY
        : row === height - 1
          ? childExtent.minimumY
          : childExtent.maximumY - rowRatio * childExtent.height;
    for (let column = 0; column < width; ++column) {
      const columnRatio = column / (width - 1);
      const x =
        column === 0
          ? childExtent.minimumX
          : column === width - 1
            ? childExtent.maximumX
            : childExtent.minimumX + columnRatio * childExtent.width;
      const sample = sourceData.interpolateHeight(sourceExtent, x, y);
      if (!Number.isFinite(sample)) {
        throw new DeveloperError(
          "Every upsampled terrain height must be finite.",
        );
      }
      buffer[offset++] = sample;
    }
  }

  return new SceneGISPlanarHeightmapTerrainData({
    buffer,
    width,
    height,
    childTileMask: 0,
    createdByUpsampling: true,
    credits: sourceData.credits,
  });
}

export default upsampleSceneGISPlanarTerrain;

/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
function nextFloat32(value, upward, floatScratch, wordScratch) {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || rounded === value) {
    return rounded;
  }
  floatScratch[0] = rounded;
  if ((upward && rounded < value) || (!upward && rounded > value)) {
    if (rounded === 0) {
      wordScratch[0] = upward ? 1 : 0x80000001;
    } else if (rounded > 0 === upward) {
      wordScratch[0]++;
    } else {
      wordScratch[0]--;
    }
  }
  return floatScratch[0];
}

/** Reads the shader's outward-rounded XY center-ownership crop using reusable scratch. */
export function createSegmentedCropBoundsReader(index, halo = 0) {
  if (typeof index.readNodeCellBounds !== "function") {
    throw new TypeError("Segmented crop bounds require readNodeCellBounds");
  }
  if (!Number.isFinite(halo) || halo < 0) {
    throw new RangeError("SCALE-1D crop halo must be finite and nonnegative");
  }
  const bounds = new Float64Array(6);
  const floatScratch = new Float32Array(1);
  const wordScratch = new Uint32Array(floatScratch.buffer);
  return function readCropBounds(node, result, offset = 0) {
    index.readNodeCellBounds(node, bounds);
    result[offset] = nextFloat32(
      bounds[0] - halo,
      false,
      floatScratch,
      wordScratch,
    );
    result[offset + 1] = nextFloat32(
      bounds[1] - halo,
      false,
      floatScratch,
      wordScratch,
    );
    result[offset + 2] = nextFloat32(
      bounds[3] + halo,
      true,
      floatScratch,
      wordScratch,
    );
    result[offset + 3] = nextFloat32(
      bounds[4] + halo,
      true,
      floatScratch,
      wordScratch,
    );
    return result;
  };
}

/** @private */
const _SceneGISGaussianSegmentedCropBounds = {
  createSegmentedCropBoundsReader,
};
export default _SceneGISGaussianSegmentedCropBounds;

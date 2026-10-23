/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
const floatScratch = new DataView(new ArrayBuffer(4));

function nextFloat32(value, direction) {
  const rounded = Math.fround(value);
  if (!Number.isFinite(rounded) || direction === 0) {
    return rounded;
  }
  floatScratch.setFloat32(0, rounded, true);
  let bits = floatScratch.getUint32(0, true);
  if (rounded === 0) {
    bits = direction > 0 ? 1 : 0x80000001;
  } else if (rounded > 0 === direction > 0) {
    bits++;
  } else {
    bits--;
  }
  floatScratch.setUint32(0, bits, true);
  return floatScratch.getFloat32(0, true);
}

// Serialized Float32 bounds must never contract the source (Float64) interval.
export function outwardBounds(bounds) {
  return bounds.map((value, index) => {
    const rounded = Math.fround(value);
    if (index < 3 && rounded > value) {
      return nextFloat32(rounded, -1);
    }
    if (index >= 3 && rounded < value) {
      return nextFloat32(rounded, 1);
    }
    return rounded;
  });
}

/** @private */
const _SceneGISGaussianEncodingBounds = { outwardBounds };
export default _SceneGISGaussianEncodingBounds;

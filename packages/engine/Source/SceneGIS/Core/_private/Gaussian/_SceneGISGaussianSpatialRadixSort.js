/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
const RADIX_BITS = 8;
const RADIX_SIZE = 1 << RADIX_BITS;
const MORTON_PASSES = 6;

function stableSort(keys, indices, passes, name) {
  if (!(keys instanceof BigUint64Array) || !(indices instanceof Uint32Array)) {
    throw new TypeError(
      `${name} expects BigUint64Array keys and Uint32Array indices`,
    );
  }
  if (keys.length !== indices.length) {
    throw new Error("Morton keys and indices must have equal lengths");
  }
  const temporaryKeys = new BigUint64Array(keys.length);
  const temporaryIndices = new Uint32Array(indices.length);
  const counts = new Uint32Array(RADIX_SIZE);
  const offsets = new Uint32Array(RADIX_SIZE);
  let sourceKeys = keys;
  let sourceIndices = indices;
  let destinationKeys = temporaryKeys;
  let destinationIndices = temporaryIndices;

  for (let pass = 0; pass < passes; pass++) {
    counts.fill(0);
    const shift = BigInt(pass * RADIX_BITS);
    for (let i = 0; i < sourceKeys.length; i++) {
      counts[Number((sourceKeys[i] >> shift) & 0xffn)]++;
    }
    let offset = 0;
    for (let bucket = 0; bucket < RADIX_SIZE; bucket++) {
      offsets[bucket] = offset;
      offset += counts[bucket];
    }
    for (let i = 0; i < sourceKeys.length; i++) {
      const bucket = Number((sourceKeys[i] >> shift) & 0xffn);
      const destination = offsets[bucket]++;
      destinationKeys[destination] = sourceKeys[i];
      destinationIndices[destination] = sourceIndices[i];
    }
    [sourceKeys, destinationKeys] = [destinationKeys, sourceKeys];
    [sourceIndices, destinationIndices] = [destinationIndices, sourceIndices];
  }

  if (sourceKeys !== keys || sourceIndices !== indices) {
    throw new Error("Internal radix pass count must leave results in place");
  }
  return { pointToBlockScratch: temporaryIndices };
}

export function stableSortMorton(keys, indices) {
  return stableSort(keys, indices, MORTON_PASSES, "Morton sort");
}

/** @private */
const _SceneGISGaussianSpatialRadixSort = { stableSortMorton };
export default _SceneGISGaussianSpatialRadixSort;

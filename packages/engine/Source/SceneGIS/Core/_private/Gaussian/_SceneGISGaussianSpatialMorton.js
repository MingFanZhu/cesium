/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
const MORTON_AXIS_BITS = 16;
const MORTON_AXIS_MAX = 2 ** MORTON_AXIS_BITS - 1;
const MORTON_KEY_BITS = MORTON_AXIS_BITS * 3;

const expand8Table = Array.from({ length: 256 }, (_, value) => {
  let expanded = 0n;
  for (let bit = 0; bit < 8; bit++) {
    expanded |= BigInt((value >> bit) & 1) << BigInt(bit * 3);
  }
  return expanded;
});

function expand16(value) {
  return (
    expand8Table[value & 0xff] | (expand8Table[(value >>> 8) & 0xff] << 24n)
  );
}

export function morton3d16(x, y, z) {
  return expand16(x) | (expand16(y) << 1n) | (expand16(z) << 2n);
}

export function quantizeMortonAxis(value, minimum, maximum) {
  if (!Number.isFinite(value)) {
    throw new Error("Morton input position must be finite");
  }
  const extent = maximum - minimum;
  if (!(extent > 0)) {
    return 0;
  }
  const normalized = Math.max(0, Math.min(1, (value - minimum) / extent));
  return Math.round(normalized * MORTON_AXIS_MAX);
}

export function createMortonCubeBounds(bounds) {
  if (
    !Array.isArray(bounds) ||
    bounds.length !== 6 ||
    !bounds.every(Number.isFinite) ||
    bounds[0] > bounds[3] ||
    bounds[1] > bounds[4] ||
    bounds[2] > bounds[5]
  ) {
    throw new Error("Morton bounds must contain six finite ordered values");
  }
  const extent = Math.max(
    bounds[3] - bounds[0],
    bounds[4] - bounds[1],
    bounds[5] - bounds[2],
  );
  return [
    bounds[0],
    bounds[1],
    bounds[2],
    bounds[0] + extent,
    bounds[1] + extent,
    bounds[2] + extent,
  ];
}

export function computeMortonKeys(x, y, z, bounds) {
  if (x.length !== y.length || x.length !== z.length) {
    throw new Error("Morton position columns must have equal lengths");
  }
  if (!Array.isArray(bounds) || bounds.length !== 6) {
    throw new Error("Morton bounds must contain six values");
  }
  const keys = new BigUint64Array(x.length);
  for (let i = 0; i < x.length; i++) {
    keys[i] = morton3d16(
      quantizeMortonAxis(x[i], bounds[0], bounds[3]),
      quantizeMortonAxis(y[i], bounds[1], bounds[4]),
      quantizeMortonAxis(z[i], bounds[2], bounds[5]),
    );
  }
  return keys;
}

export function commonMortonPrefix(firstKey, lastKey) {
  const difference = firstKey ^ lastKey;
  const commonBits =
    difference === 0n
      ? MORTON_KEY_BITS
      : MORTON_KEY_BITS - difference.toString(2).length;
  const depth = Math.floor(commonBits / 3);
  const prefixBits = depth * 3;
  const prefix =
    prefixBits === 0 ? 0n : firstKey >> BigInt(MORTON_KEY_BITS - prefixBits);
  return { depth, prefix };
}

export { MORTON_AXIS_BITS, MORTON_AXIS_MAX, MORTON_KEY_BITS };

/** @private */
const _SceneGISGaussianSpatialMorton = {
  morton3d16,
  quantizeMortonAxis,
  createMortonCubeBounds,
  computeMortonKeys,
  commonMortonPrefix,
};
export default _SceneGISGaussianSpatialMorton;

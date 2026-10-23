/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
const FLOAT_FIELDS = Object.freeze({
  position: 3,
  scale: 3,
  rotation: 4,
  covariance: 6,
  opacity: 1,
  color: 3,
  errorPosition: 1,
  errorCovariance: 1,
  errorColor: 1,
  errorSh: 1,
});

const RAW_FLOAT_FIELDS = Object.freeze({
  position: 3,
  logScale: 3,
  rotation: 4,
  dc: 3,
  opacityLogit: 1,
});

function createFloatFields(count, definitions, ArrayType = Float64Array) {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, components]) => [
      name,
      new ArrayType(count * components),
    ]),
  );
}

export function createGaussianSet(count, shCount = 0) {
  return {
    count,
    shCount,
    ...createFloatFields(count, FLOAT_FIELDS),
    sh: new Float64Array(count * shCount),
    stableId: new Uint32Array(count),
    sourceCount: new Uint32Array(count),
  };
}

// Raw source columns carry the float32 precision of the input PLY verbatim.
export function createRawGaussianBlock(count, shCount = 0) {
  return {
    count,
    shCount,
    ...createFloatFields(count, RAW_FLOAT_FIELDS, Float32Array),
    sh: new Float32Array(count * shCount),
    stableId: new Uint32Array(count),
  };
}

function copyComponents(source, sourceIndex, target, targetIndex, components) {
  const sourceOffset = sourceIndex * components;
  const targetOffset = targetIndex * components;
  for (let component = 0; component < components; component++) {
    target[targetOffset + component] = source[sourceOffset + component];
  }
}

export function copyGaussian(source, sourceIndex, target, targetIndex) {
  for (const [name, components] of Object.entries(FLOAT_FIELDS)) {
    copyComponents(
      source[name],
      sourceIndex,
      target[name],
      targetIndex,
      components,
    );
  }
  copyComponents(
    source.sh,
    sourceIndex,
    target.sh,
    targetIndex,
    source.shCount,
  );
  target.stableId[targetIndex] = source.stableId[sourceIndex];
  target.sourceCount[targetIndex] = source.sourceCount[sourceIndex];
}

export function trimGaussianSet(source, count) {
  if (count === source.count) {
    return source;
  }
  const result = createGaussianSet(count, source.shCount);
  for (const [name, components] of Object.entries(FLOAT_FIELDS)) {
    result[name].set(source[name].subarray(0, count * components));
  }
  result.sh.set(source.sh.subarray(0, count * source.shCount));
  result.stableId.set(source.stableId.subarray(0, count));
  result.sourceCount.set(source.sourceCount.subarray(0, count));
  return result;
}

export function cloneGaussianSet(source) {
  const result = createGaussianSet(source.count, source.shCount);
  for (const name of Object.keys(FLOAT_FIELDS)) {
    result[name].set(source[name]);
  }
  result.sh.set(source.sh);
  result.stableId.set(source.stableId);
  result.sourceCount.set(source.sourceCount);
  return result;
}

function typedArrayBuffers(object) {
  const buffers = [];
  const seen = new Set();
  for (const value of Object.values(object)) {
    if (ArrayBuffer.isView(value) && !seen.has(value.buffer)) {
      seen.add(value.buffer);
      buffers.push(value.buffer);
    }
  }
  return buffers;
}

export function gaussianSetTransferList(set) {
  return typedArrayBuffers(set);
}

export function rawGaussianBlockTransferList(block) {
  return typedArrayBuffers(block);
}

export function gaussianBytesPerPoint(shCount) {
  return (24 + shCount) * Float64Array.BYTES_PER_ELEMENT + 8;
}

export function rawGaussianBytesPerPoint(shCount) {
  return (14 + shCount) * Float32Array.BYTES_PER_ELEMENT + 4;
}

export { FLOAT_FIELDS, RAW_FLOAT_FIELDS };

/** @private */
const _SceneGISGaussianColumns = {
  createGaussianSet,
  createRawGaussianBlock,
  copyGaussian,
  trimGaussianSet,
  cloneGaussianSet,
  gaussianSetTransferList,
  rawGaussianBlockTransferList,
  gaussianBytesPerPoint,
  rawGaussianBytesPerPoint,
};
export default _SceneGISGaussianColumns;

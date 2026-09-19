/**
 * Suppresses uploads whose packed Float32 representation has not changed.
 * Native packing and validation run before this hook; each uniform owns its cache.
 * @private
 */
function shouldUpload(uniform, values) {
  const state = uniform._sceneGISUploadedArray;
  if (state === undefined) {
    const bits = new Uint32Array(
      values.buffer,
      values.byteOffset,
      values.length,
    );
    uniform._sceneGISUploadedArray = {
      bits,
      uploaded: new Uint32Array(bits),
    };
    return true;
  }
  const { bits, uploaded } = state;
  for (let i = 0; i < bits.length; ++i) {
    if (bits[i] !== uploaded[i]) {
      uploaded.set(bits);
      return true;
    }
  }
  return false;
}

/** @private */
const SceneGISUniformArray = { shouldUpload };
export default SceneGISUniformArray;

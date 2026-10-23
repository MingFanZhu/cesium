/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
const UINT32_MAX = 0xffffffff;

const MANIFEST_SCHEMA = "cesium-gaussian-macro-chunk-manifest";

const MANIFEST_VERSION = 1;

export const RIGID_TRANSFORM_EPSILON = 1.0e-6;

export const MACRO_CHUNK_TRANSFORM_CONTRACT_ID = "rigid-v1";

export const MACRO_CHUNK_SOURCE_UNIT_ID = "metre";

export const METERS_PER_UNIT_EPSILON = 1.0e-12;

function safeInteger(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function uint32(value, name) {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${name} must be an unsigned 32-bit integer`);
  }
  return value;
}

function finiteArray(value, length, name) {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every(Number.isFinite)
  ) {
    throw new TypeError(`${name} must contain ${length} finite numbers`);
  }
  return Object.freeze([...value]);
}

export function validateMacroChunkRigidTransform(
  value,
  name = "coordinate.localToFixed",
) {
  const matrix = finiteArray(value, 16, name);
  if (
    matrix[3] !== 0 ||
    matrix[7] !== 0 ||
    matrix[11] !== 0 ||
    matrix[15] !== 1
  ) {
    throw new RangeError(`${name} must be affine`);
  }
  const column0 = [matrix[0], matrix[1], matrix[2]];
  const column1 = [matrix[4], matrix[5], matrix[6]];
  const column2 = [matrix[8], matrix[9], matrix[10]];
  const dot = (left, right) =>
    left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
  const unitError = Math.max(
    Math.abs(dot(column0, column0) - 1),
    Math.abs(dot(column1, column1) - 1),
    Math.abs(dot(column2, column2) - 1),
  );
  const orthogonalityError = Math.max(
    Math.abs(dot(column0, column1)),
    Math.abs(dot(column0, column2)),
    Math.abs(dot(column1, column2)),
  );
  const determinant =
    matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6]) -
    matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2]) +
    matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]);
  if (
    unitError > RIGID_TRANSFORM_EPSILON ||
    orthogonalityError > RIGID_TRANSFORM_EPSILON ||
    !Number.isFinite(determinant) ||
    Math.abs(determinant - 1) > RIGID_TRANSFORM_EPSILON
  ) {
    throw new RangeError(
      `${name} must be a proper rigid transform (orthonormal with determinant +1)`,
    );
  }
  return matrix;
}

export function validateMacroChunkMetersPerUnit(
  value,
  name = "coordinate.metersPerUnit",
) {
  if (
    !Number.isFinite(value) ||
    Math.abs(value - 1) > METERS_PER_UNIT_EPSILON
  ) {
    throw new RangeError(
      `${name} violates the rigid-v1 Macro Runtime transform contract: ` +
        "the current version supports only metre source coordinates " +
        "(metersPerUnit == 1); uniform source-unit scale conversion for " +
        "non-metre input is not implemented",
    );
  }
  return value;
}

function inputBytes(input, name) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError(`${name} input must be bytes`);
}

export function createMacroChunkRuntimeManifest(index) {
  const byteLength = safeInteger(
    index.byteLength,
    "manifest index byteLength",
    1,
  );
  const checksum = uint32(index.checksum, "manifest index checksum");
  const url = index.url ?? "scene.mci";
  if (typeof url !== "string" || url !== "scene.mci") {
    throw new Error("Macro-Chunk manifest index url must be scene.mci");
  }
  return Object.freeze({
    schema: MANIFEST_SCHEMA,
    version: MANIFEST_VERSION,
    index: Object.freeze({ url, byteLength, checksum }),
  });
}

export function parseMacroChunkRuntimeManifest(input) {
  const bytes = inputBytes(input, "Macro-Chunk Runtime Manifest");
  let value;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error("Macro-Chunk Runtime Manifest is invalid", {
      cause: error,
    });
  }
  if (
    value?.schema !== MANIFEST_SCHEMA ||
    value.version !== MANIFEST_VERSION ||
    value.index?.url !== "scene.mci"
  ) {
    throw new Error("Unsupported Macro-Chunk Runtime Manifest");
  }
  return createMacroChunkRuntimeManifest(value.index);
}

/** @private */
const _SceneGISGaussianManifest = {
  RIGID_TRANSFORM_EPSILON,
  MACRO_CHUNK_TRANSFORM_CONTRACT_ID,
  MACRO_CHUNK_SOURCE_UNIT_ID,
  METERS_PER_UNIT_EPSILON,
  validateMacroChunkRigidTransform,
  validateMacroChunkMetersPerUnit,
  createMacroChunkRuntimeManifest,
  parseMacroChunkRuntimeManifest,
};
export default _SceneGISGaussianManifest;

/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
export function align(value, alignment) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("value must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(alignment) || alignment <= 0) {
    throw new RangeError("alignment must be a positive safe integer");
  }
  return Math.ceil(value / alignment) * alignment;
}

export function asUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new TypeError("Expected an ArrayBuffer or typed array");
}

export function createView(bytes) {
  const array = asUint8Array(bytes);
  return new DataView(array.buffer, array.byteOffset, array.byteLength);
}

export function writeUint64(view, offset, value) {
  const bigint = typeof value === "bigint" ? value : BigInt(value);
  view.setBigUint64(offset, bigint, true);
}

export function readUint64(view, offset) {
  return view.getBigUint64(offset, true);
}

export function toSafeNumber(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || BigInt(number) !== value) {
    throw new RangeError(`${label} exceeds JavaScript's safe integer range`);
  }
  return number;
}

export function writeMagic(target, magic) {
  target.set(magic, 0);
}

export function hasMagic(bytes, magic) {
  const array = asUint8Array(bytes);
  if (array.byteLength < magic.byteLength) {
    return false;
  }
  return magic.every((value, index) => array[index] === value);
}

export function assertZero(bytes, start, end, label) {
  const array = asUint8Array(bytes);
  for (let i = start; i < end; i++) {
    if (array[i] !== 0) {
      throw new Error(`${label} reserved byte ${i} must be zero`);
    }
  }
}

export function identityMatrix4() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** @private */
const _SceneGISGaussianFormatsBinary = {
  align,
  asUint8Array,
  createView,
  writeUint64,
  readUint64,
  toSafeNumber,
  writeMagic,
  hasMagic,
  assertZero,
  identityMatrix4,
};
export default _SceneGISGaussianFormatsBinary;

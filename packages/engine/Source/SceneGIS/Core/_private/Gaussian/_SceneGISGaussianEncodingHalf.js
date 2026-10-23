/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
const scratch = new DataView(new ArrayBuffer(4));

export function float32ToFloat16(value) {
  if (!Number.isFinite(value)) {
    throw new RangeError("Cannot encode a non-finite float16 value");
  }
  scratch.setFloat32(0, value, false);
  const bits = scratch.getUint32(0, false);
  const sign = (bits >>> 16) & 0x8000;
  let exponent = (bits >>> 23) & 0xff;
  let mantissa = bits & 0x7fffff;

  if (exponent === 0) {
    return sign;
  }
  exponent -= 127;
  if (exponent > 15) {
    throw new RangeError(`float16 overflow for value ${value}`);
  }
  if (exponent < -24) {
    return sign;
  }
  if (exponent < -14) {
    mantissa |= 0x800000;
    const shift = -exponent - 1;
    let rounded = mantissa >>> shift;
    const remainder = mantissa & (2 ** shift - 1);
    const halfway = 2 ** (shift - 1);
    if (remainder > halfway || (remainder === halfway && rounded & 1)) {
      rounded++;
    }
    return sign | rounded;
  }

  let halfExponent = exponent + 15;
  let halfMantissa = mantissa >>> 13;
  const remainder = mantissa & 0x1fff;
  if (remainder > 0x1000 || (remainder === 0x1000 && halfMantissa & 1)) {
    halfMantissa++;
    if (halfMantissa === 0x400) {
      halfMantissa = 0;
      halfExponent++;
      if (halfExponent >= 31) {
        throw new RangeError(`float16 overflow for value ${value}`);
      }
    }
  }
  return sign | (halfExponent << 10) | halfMantissa;
}

export function float16ToFloat32(bits) {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) {
    return sign * 2 ** -14 * (mantissa / 1024);
  }
  if (exponent === 31) {
    return mantissa === 0 ? sign * Infinity : Number.NaN;
  }
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

/** @private */
const _SceneGISGaussianEncodingHalf = { float32ToFloat16, float16ToFloat32 };
export default _SceneGISGaussianEncodingHalf;

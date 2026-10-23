/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
import { createView } from "./_SceneGISGaussianFormatsBinary.js";
import { LAYOUT_KIND } from "./_SceneGISGaussianFormatsConstants.js";
import {
  float16ToFloat32,
  float32ToFloat16,
} from "./_SceneGISGaussianEncodingHalf.js";

const SH_COUNTS = [0, 9, 24, 45];
const SH_WORDS = [0, 4, 8, 16];

function assertPageRange(data, start, count) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(count) ||
    start < 0 ||
    count < 0 ||
    start + count > data.count
  ) {
    throw new RangeError("Gaussian page range is out of bounds");
  }
}

function degreeFromShCount(shCount) {
  const degree = SH_COUNTS.indexOf(shCount);
  if (degree < 0) {
    throw new Error(`Unsupported SH component count ${shCount}`);
  }
  return degree;
}

export function encodeQuatOctXy1010R12(rotation, offset = 0) {
  let x = rotation[offset];
  let y = rotation[offset + 1];
  let z = rotation[offset + 2];
  let w = rotation[offset + 3];
  const length = Math.hypot(x, y, z, w);
  if (!Number.isFinite(length) || length <= 0) {
    throw new RangeError("Quaternion must have a finite positive length");
  }
  if (w < 0) {
    x = -x;
    y = -y;
    z = -z;
    w = -w;
  }
  x /= length;
  y /= length;
  z /= length;
  w = Math.min(1, Math.max(0, w / length));
  const theta = 2 * Math.acos(w);
  const xyzLength = Math.hypot(x, y, z);
  let axisX = xyzLength < 1e-6 ? 1 : x / xyzLength;
  let axisY = xyzLength < 1e-6 ? 0 : y / xyzLength;
  const axisZ = xyzLength < 1e-6 ? 0 : z / xyzLength;
  const sum = Math.abs(axisX) + Math.abs(axisY) + Math.abs(axisZ);
  axisX /= sum;
  axisY /= sum;
  if (axisZ < 0) {
    const previousX = axisX;
    axisX = (1 - Math.abs(axisY)) * (axisX >= 0 ? 1 : -1);
    axisY = (1 - Math.abs(previousX)) * (axisY >= 0 ? 1 : -1);
  }
  const quantU = Math.round((axisX * 0.5 + 0.5) * 1023);
  const quantV = Math.round((axisY * 0.5 + 0.5) * 1023);
  const angle = Math.round(theta * (4095 / Math.PI));
  return ((angle << 20) | (quantV << 10) | quantU) >>> 0;
}

export function decodeQuatOctXy1010R12(encoded) {
  const quantU = encoded & 0x3ff;
  const quantV = (encoded >>> 10) & 0x3ff;
  const angle = (encoded >>> 20) & 0xfff;
  let x = (quantU / 1023) * 2 - 1;
  let y = (quantV / 1023) * 2 - 1;
  const z = 1 - Math.abs(x) - Math.abs(y);
  const t = Math.max(-z, 0);
  x += x >= 0 ? -t : t;
  y += y >= 0 ? -t : t;
  const length = Math.hypot(x, y, z);
  const theta = (angle / 4095) * Math.PI;
  const sine = Math.sin(theta * 0.5);
  return [
    (x / length) * sine,
    (y / length) * sine,
    (z / length) * sine,
    Math.cos(theta * 0.5),
  ];
}

export function encodeExtRgb(r, g, b) {
  if (![r, g, b].every(Number.isFinite)) {
    throw new RangeError("SH RGB values must be finite");
  }
  const maxAbs = Math.max(Math.abs(r), Math.abs(g), Math.abs(b));
  // The shared exponent must cover the largest channel. Using floor here
  // saturates every value between adjacent powers of two and can lose almost
  // half its magnitude.
  const base = maxAbs === 0 ? -15 : Math.ceil(Math.log2(maxAbs));
  const biasedBase = Math.max(0, Math.min(31, base + 15));
  const divisor = 2 ** (biasedBase - 15) / 255;
  const red = Math.round(Math.max(0, Math.min(255, Math.abs(r) / divisor)));
  const green = Math.round(Math.max(0, Math.min(255, Math.abs(g) / divisor)));
  const blue = Math.round(Math.max(0, Math.min(255, Math.abs(b) / divisor)));
  const signs = (r < 0 ? 1 : 0) | (g < 0 ? 2 : 0) | (b < 0 ? 4 : 0);
  return (
    (red |
      (green << 8) |
      (blue << 16) |
      (((biasedBase << 3) | signs) << 24)) >>>
    0
  );
}

export function decodeExtRgb(encoded) {
  const divisor = 2 ** (((encoded >>> 27) & 0x1f) - 15) / 255;
  return [
    (encoded & 0x1000000 ? -1 : 1) * (encoded & 0xff) * divisor,
    (encoded & 0x2000000 ? -1 : 1) * ((encoded >>> 8) & 0xff) * divisor,
    (encoded & 0x4000000 ? -1 : 1) * ((encoded >>> 16) & 0xff) * divisor,
  ];
}

export function encodeCorePage(data, start, count) {
  assertPageRange(data, start, count);
  const bytes = new Uint8Array(count * 32);
  const view = createView(bytes);
  for (let localIndex = 0; localIndex < count; localIndex++) {
    const index = start + localIndex;
    const output = localIndex * 32;
    const position = index * 3;
    const rotation = index * 4;
    for (let component = 0; component < 3; component++) {
      const value = data.position[position + component];
      if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
        throw new RangeError(
          "Position cannot be represented as finite float32",
        );
      }
      view.setFloat32(output + component * 4, value, true);
    }
    view.setUint16(output + 12, float32ToFloat16(data.opacity[index]), true);
    view.setUint16(output + 14, 0, true);
    view.setUint16(output + 16, float32ToFloat16(data.color[position]), true);
    view.setUint16(
      output + 18,
      float32ToFloat16(data.color[position + 1]),
      true,
    );
    view.setUint16(
      output + 20,
      float32ToFloat16(data.color[position + 2]),
      true,
    );
    for (let component = 0; component < 3; component++) {
      const scale = data.scale[position + component];
      if (!Number.isFinite(scale) || scale <= 0) {
        throw new RangeError("Scale must be finite and positive");
      }
      view.setUint16(
        output + 22 + component * 2,
        float32ToFloat16(Math.log(scale)),
        true,
      );
    }
    view.setUint32(
      output + 28,
      encodeQuatOctXy1010R12(data.rotation, rotation),
      true,
    );
  }
  return bytes;
}

export function decodeCorePage(input) {
  if (input.byteLength % 32 !== 0) {
    throw new Error("EXT_CORE_32 payload length must be divisible by 32");
  }
  const view = createView(input);
  return Array.from({ length: input.byteLength / 32 }, (_, index) => {
    const offset = index * 32;
    return {
      position: [0, 4, 8].map((byte) => view.getFloat32(offset + byte, true)),
      opacity: float16ToFloat32(view.getUint16(offset + 12, true)),
      color: [16, 18, 20].map((byte) =>
        float16ToFloat32(view.getUint16(offset + byte, true)),
      ),
      scale: [22, 24, 26].map((byte) =>
        Math.exp(float16ToFloat32(view.getUint16(offset + byte, true))),
      ),
      rotation: decodeQuatOctXy1010R12(view.getUint32(offset + 28, true)),
    };
  });
}

export function encodeShPage(data, start, count) {
  assertPageRange(data, start, count);
  const degree = degreeFromShCount(data.shCount);
  if (degree === 0) {
    throw new Error("Cannot encode an SH page without SH coefficients");
  }
  const wordsPerSplat = SH_WORDS[degree];
  const coefficientCount = data.shCount / 3;
  const bytes = new Uint8Array(count * wordsPerSplat * 4);
  const view = createView(bytes);
  for (let localIndex = 0; localIndex < count; localIndex++) {
    const index = start + localIndex;
    for (let coefficient = 0; coefficient < coefficientCount; coefficient++) {
      const source = index * data.shCount + coefficient * 3;
      view.setUint32(
        (localIndex * wordsPerSplat + coefficient) * 4,
        encodeExtRgb(data.sh[source], data.sh[source + 1], data.sh[source + 2]),
        true,
      );
    }
  }
  return bytes;
}

export function decodeShPage(input, degree) {
  if (!Number.isInteger(degree) || degree < 1 || degree > 3) {
    throw new Error(`Unsupported SH degree ${degree}`);
  }
  const wordsPerSplat = SH_WORDS[degree];
  const coefficientCount = SH_COUNTS[degree] / 3;
  if (input.byteLength % (wordsPerSplat * 4) !== 0) {
    throw new Error("SH payload length does not match its layout");
  }
  const view = createView(input);
  const count = input.byteLength / (wordsPerSplat * 4);
  const values = new Float64Array(count * coefficientCount * 3);
  for (let index = 0; index < count; index++) {
    for (let coefficient = 0; coefficient < coefficientCount; coefficient++) {
      values.set(
        decodeExtRgb(
          view.getUint32((index * wordsPerSplat + coefficient) * 4, true),
        ),
        (index * coefficientCount + coefficient) * 3,
      );
    }
  }
  return values;
}

export function shLayoutKind(degree) {
  return [
    undefined,
    LAYOUT_KIND.EXT_SH1_16,
    LAYOUT_KIND.EXT_SH2_32,
    LAYOUT_KIND.EXT_SH3_64,
  ][degree];
}

export { degreeFromShCount };

/** @private */
const _SceneGISGaussianEncodingExt = {
  encodeQuatOctXy1010R12,
  decodeQuatOctXy1010R12,
  encodeExtRgb,
  decodeExtRgb,
  encodeCorePage,
  decodeCorePage,
  encodeShPage,
  decodeShPage,
  shLayoutKind,
};
export default _SceneGISGaussianEncodingExt;

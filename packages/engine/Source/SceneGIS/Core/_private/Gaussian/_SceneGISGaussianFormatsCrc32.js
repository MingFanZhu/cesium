/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
import { asUint8Array } from "./_SceneGISGaussianFormatsBinary.js";

const table = new Uint32Array(8 * 256);
for (let i = 0; i < 256; i++) {
  let value = i;
  for (let bit = 0; bit < 8; bit++) {
    value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  table[i] = value >>> 0;
}
for (let i = 256; i < table.length; i++) {
  const value = table[i - 256];
  table[i] = table[value & 0xff] ^ (value >>> 8);
}

export function crc32(bytes, seed = 0) {
  const array = asUint8Array(bytes);
  let value = (seed ^ 0xffffffff) >>> 0;
  let i = 0;
  // Slicing-by-8 advances each byte through the remaining zero bytes in one
  // lookup. Explicit byte loads also work for unaligned views on either endian.
  for (const end = array.byteLength - 7; i < end; i += 8) {
    const first =
      value ^
      (array[i] |
        (array[i + 1] << 8) |
        (array[i + 2] << 16) |
        (array[i + 3] << 24));
    value =
      table[1792 + (first & 0xff)] ^
      table[1536 + ((first >>> 8) & 0xff)] ^
      table[1280 + ((first >>> 16) & 0xff)] ^
      table[1024 + (first >>> 24)] ^
      table[768 + array[i + 4]] ^
      table[512 + array[i + 5]] ^
      table[256 + array[i + 6]] ^
      table[array[i + 7]];
  }
  for (; i < array.byteLength; i++) {
    value = table[(value ^ array[i]) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

export function crc32WithZeroedRanges(bytes, ranges) {
  const array = asUint8Array(bytes);
  const sorted = [...ranges].sort((left, right) => left[0] - right[0]);
  let cursor = 0;
  let checksum = 0;
  for (const [start, length] of sorted) {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(length) ||
      start < cursor ||
      length < 0 ||
      start + length > array.byteLength
    ) {
      throw new RangeError("Invalid or overlapping CRC zero range");
    }
    checksum = crc32(array.subarray(cursor, start), checksum);
    checksum = crc32(new Uint8Array(length), checksum);
    cursor = start + length;
  }
  return crc32(array.subarray(cursor), checksum);
}

/** @private */
const _SceneGISGaussianFormatsCrc32 = { crc32, crc32WithZeroedRanges };
export default _SceneGISGaussianFormatsCrc32;

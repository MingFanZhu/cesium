/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import RuntimeError from "../../../../Core/RuntimeError.js";
import {
  BYTE_ORDER,
  CHECKSUM,
  CODEC,
  GSP_HEADER_BYTES,
  GSP_MAGIC,
  PAGE_ALIGNMENT,
  VERSION,
} from "../../../Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import {
  crc32,
  crc32WithZeroedRanges,
} from "../../../Core/_private/Gaussian/_SceneGISGaussianFormatsCrc32.js";

const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
const PACK_CHECKSUM_OFFSET = 64;
const PACK_GSI_CHECKSUM_OFFSET = 72;

function asUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new RuntimeError("GSP input must be an ArrayBuffer or typed array.");
}

function hasMagic(bytes, magic) {
  if (bytes.byteLength < magic.length) {
    return false;
  }
  return magic.every(function (value, index) {
    return bytes[index] === value;
  });
}

function assertZero(bytes, start, end, label) {
  for (let index = start; index < end; index++) {
    if (bytes[index] !== 0) {
      throw new RuntimeError(
        `${label} reserved byte ${index - start} must be zero.`,
      );
    }
  }
}

function readSafeUint64(view, offset, label) {
  const value = view.getBigUint64(offset, true);
  if (value > MAX_SAFE_BIGINT) {
    throw new RuntimeError(`${label} exceeds JavaScript's safe integer range.`);
  }
  return Number(value);
}

function parsePackHeader(input, expectedPack, expectedGsiChecksum) {
  const bytes = asUint8Array(input);
  if (bytes.byteLength < GSP_HEADER_BYTES || !hasMagic(bytes, GSP_MAGIC)) {
    throw new RuntimeError("Invalid or truncated GSP pack header.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = {
    major: view.getUint16(8, true),
    minor: view.getUint16(10, true),
    headerBytes: view.getUint32(12, true),
    flags: view.getUint32(16, true),
    packId: view.getUint32(20, true),
    kind: view.getUint8(24),
    codec: view.getUint8(25),
    layoutId: view.getUint16(26, true),
    pageCount: view.getUint32(28, true),
    fileBytes: readSafeUint64(view, 32, "GSP file bytes"),
    payloadOffset: readSafeUint64(view, 40, "GSP payload offset"),
    payloadBytes: readSafeUint64(view, 48, "GSP payload bytes"),
    splatCount: readSafeUint64(view, 56, "GSP splat count"),
    checksum: view.getUint32(64, true),
    checksumType: view.getUint8(68),
    byteOrder: view.getUint8(69),
    gsiChecksum: view.getUint32(72, true),
  };
  if (
    header.major !== VERSION.major ||
    header.headerBytes !== GSP_HEADER_BYTES ||
    header.codec !== CODEC.RAW ||
    header.checksumType !== CHECKSUM.CRC32 ||
    header.byteOrder !== BYTE_ORDER.LITTLE_ENDIAN ||
    header.payloadOffset % PAGE_ALIGNMENT !== 0 ||
    header.payloadOffset + header.payloadBytes !== header.fileBytes
  ) {
    throw new RuntimeError("Unsupported or inconsistent GSP pack header.");
  }
  assertZero(bytes, 70, 72, "GSP header");
  assertZero(bytes, 76, GSP_HEADER_BYTES, "GSP header");
  if (
    expectedPack &&
    (header.packId !== expectedPack.id ||
      header.kind !== expectedPack.kind ||
      (expectedPack.strictA4 === true &&
        (header.minor !== VERSION.minor ||
          header.flags !== 0 ||
          header.layoutId !== expectedPack.layoutId ||
          header.payloadOffset !== expectedPack.payloadOffset ||
          header.payloadBytes !== expectedPack.payloadBytes ||
          header.gsiChecksum !== 0)) ||
      header.pageCount !== expectedPack.pageCount ||
      header.fileBytes !== expectedPack.fileBytes ||
      header.checksum !== expectedPack.checksum ||
      header.splatCount !== expectedPack.splatCount)
  ) {
    throw new RuntimeError("GSP pack header does not match its GSI record.");
  }
  if (
    expectedGsiChecksum !== undefined &&
    header.gsiChecksum !== 0 &&
    header.gsiChecksum !== expectedGsiChecksum
  ) {
    throw new RuntimeError("GSP pack is bound to another GSI index.");
  }
  if (bytes.byteLength === header.fileBytes) {
    const actual = crc32WithZeroedRanges(bytes, [
      [PACK_CHECKSUM_OFFSET, 4],
      [PACK_GSI_CHECKSUM_OFFSET, 4],
    ]);
    if (actual !== header.checksum) {
      throw new RuntimeError("GSP pack checksum mismatch.");
    }
  }
  return header;
}

function validatePagePayload(page, payload) {
  const bytes = asUint8Array(payload);
  if (bytes.byteLength !== page.storedBytes) {
    throw new RuntimeError(`GSP page ${page.index} length mismatch.`);
  }
  if (crc32(bytes) !== page.checksum) {
    throw new RuntimeError(`GSP page ${page.index} checksum mismatch.`);
  }
  return bytes;
}

const _SceneGISGaussianStreamPackFormat = Object.freeze({
  GSP_HEADER_BYTES,
  parsePackHeader,
  validatePagePayload,
});

export { GSP_HEADER_BYTES, parsePackHeader, validatePagePayload };
export default _SceneGISGaussianStreamPackFormat;

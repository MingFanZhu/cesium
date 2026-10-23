/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
import {
  BYTE_ORDER,
  CHECKSUM,
  CODEC,
  GSP_HEADER_BYTES,
  GSP_MAGIC,
  PAGE_ALIGNMENT,
  VERSION,
  UINT32_MAX,
  UINT64_MAX,
} from "./_SceneGISGaussianFormatsConstants.js";
import {
  align,
  assertZero,
  asUint8Array,
  createView,
  hasMagic,
  readUint64,
  toSafeNumber,
  writeMagic,
  writeUint64,
} from "./_SceneGISGaussianFormatsBinary.js";
import {
  crc32,
  crc32WithZeroedRanges,
} from "./_SceneGISGaussianFormatsCrc32.js";

const PACK_CHECKSUM_OFFSET = 64;
const GSI_CHECKSUM_OFFSET = 72;

export function encodePack(options) {
  const pages = options.pages.map(asUint8Array);
  if (
    !Number.isSafeInteger(options.packId) ||
    options.packId < 0 ||
    options.packId > UINT32_MAX
  ) {
    throw new RangeError("GSP packId is outside the uint32 range");
  }
  if (
    !Number.isSafeInteger(options.layoutId) ||
    options.layoutId < 0 ||
    options.layoutId > 0xffff
  ) {
    throw new RangeError("GSP layoutId is outside the uint16 range");
  }
  if (pages.length > UINT32_MAX) {
    throw new RangeError("GSP page count exceeds uint32");
  }
  const splatCount = BigInt(options.splatCount ?? 0);
  if (splatCount < 0n || splatCount > UINT64_MAX) {
    throw new RangeError("GSP splat count exceeds uint64");
  }
  const pageOffsets = [];
  let cursor = GSP_HEADER_BYTES;
  for (const page of pages) {
    cursor = align(cursor, PAGE_ALIGNMENT);
    pageOffsets.push(cursor);
    cursor += page.byteLength;
    if (!Number.isSafeInteger(cursor)) {
      throw new RangeError("GSP pack exceeds JavaScript's safe integer range");
    }
  }

  const bytes = new Uint8Array(cursor);
  const view = createView(bytes);
  writeMagic(bytes, GSP_MAGIC);
  view.setUint16(8, VERSION.major, true);
  view.setUint16(10, VERSION.minor, true);
  view.setUint32(12, GSP_HEADER_BYTES, true);
  view.setUint32(16, options.flags ?? 0, true);
  view.setUint32(20, options.packId, true);
  view.setUint8(24, options.kind);
  view.setUint8(25, CODEC.RAW);
  view.setUint16(26, options.layoutId, true);
  view.setUint32(28, pages.length, true);
  writeUint64(view, 32, bytes.byteLength);
  writeUint64(view, 40, pages.length === 0 ? GSP_HEADER_BYTES : pageOffsets[0]);
  writeUint64(
    view,
    48,
    pages.length === 0 ? 0 : bytes.byteLength - pageOffsets[0],
  );
  writeUint64(view, 56, splatCount);
  view.setUint8(68, CHECKSUM.CRC32);
  view.setUint8(69, BYTE_ORDER.LITTLE_ENDIAN);
  view.setUint32(72, options.gsiChecksum ?? 0, true);

  for (let i = 0; i < pages.length; i++) {
    bytes.set(pages[i], pageOffsets[i]);
  }

  const checksum = crc32WithZeroedRanges(bytes, [
    [PACK_CHECKSUM_OFFSET, 4],
    [GSI_CHECKSUM_OFFSET, 4],
  ]);
  view.setUint32(PACK_CHECKSUM_OFFSET, checksum, true);
  return {
    bytes,
    checksum,
    pages: pages.map((page, index) => ({
      offset: BigInt(pageOffsets[index]),
      storedBytes: BigInt(page.byteLength),
      rawBytes: BigInt(page.byteLength),
      checksum: crc32(page),
    })),
  };
}

export function decodePackHeader(input, options = {}) {
  const bytes = asUint8Array(input);
  if (bytes.byteLength < GSP_HEADER_BYTES) {
    throw new Error("GSP file is shorter than its 256-byte header");
  }
  if (!hasMagic(bytes, GSP_MAGIC)) {
    throw new Error("Invalid GSP pack magic");
  }
  const view = createView(bytes);
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
    fileBytes: readUint64(view, 32),
    payloadOffset: readUint64(view, 40),
    payloadBytes: readUint64(view, 48),
    splatCount: readUint64(view, 56),
    checksum: view.getUint32(64, true),
    checksumType: view.getUint8(68),
    byteOrder: view.getUint8(69),
    gsiChecksum: view.getUint32(72, true),
  };
  if (header.major !== VERSION.major) {
    throw new Error(`Unsupported GSP major version ${header.major}`);
  }
  if (header.headerBytes !== GSP_HEADER_BYTES) {
    throw new Error(`Unexpected GSP header size ${header.headerBytes}`);
  }
  if (header.codec !== CODEC.RAW) {
    throw new Error(`Unsupported GSP codec ${header.codec}`);
  }
  if (header.checksumType !== CHECKSUM.CRC32) {
    throw new Error(`Unsupported GSP checksum type ${header.checksumType}`);
  }
  if (header.byteOrder !== BYTE_ORDER.LITTLE_ENDIAN) {
    throw new Error("Unsupported GSP byte order");
  }
  if (header.payloadOffset % BigInt(PAGE_ALIGNMENT) !== 0n) {
    throw new Error("GSP payload offset is not 256-byte aligned");
  }
  if (header.payloadOffset + header.payloadBytes !== header.fileBytes) {
    throw new Error("GSP payload range does not match its file size");
  }
  assertZero(bytes, 70, 72, "GSP header");
  assertZero(bytes, 76, GSP_HEADER_BYTES, "GSP header");
  if (options.verifyChecksum !== false) {
    const fileBytes = toSafeNumber(header.fileBytes, "GSP fileBytes");
    if (bytes.byteLength !== fileBytes) {
      throw new Error(
        `GSP length mismatch: header=${fileBytes}, actual=${bytes.byteLength}`,
      );
    }
    const actual = crc32WithZeroedRanges(bytes, [
      [PACK_CHECKSUM_OFFSET, 4],
      [GSI_CHECKSUM_OFFSET, 4],
    ]);
    if (actual !== header.checksum) {
      throw new Error(
        `GSP checksum mismatch: expected 0x${header.checksum.toString(16)}, actual 0x${actual.toString(16)}`,
      );
    }
  }
  return header;
}

export function validatePackPage(packBytes, page) {
  const bytes = asUint8Array(packBytes);
  const offset = toSafeNumber(page.offset, "page offset");
  const storedBytes = toSafeNumber(page.storedBytes, "page storedBytes");
  if (offset % PAGE_ALIGNMENT !== 0) {
    throw new Error(`Page offset ${offset} is not 256-byte aligned`);
  }
  if (offset + storedBytes > bytes.byteLength) {
    throw new Error("Page range exceeds its GSP pack");
  }
  const actual = crc32(bytes.subarray(offset, offset + storedBytes));
  if (actual !== page.checksum) {
    throw new Error(
      `Page checksum mismatch: expected 0x${page.checksum.toString(16)}, actual 0x${actual.toString(16)}`,
    );
  }
}

/** @private */
const _SceneGISGaussianFormatsGsp = {
  encodePack,
  decodePackHeader,
  validatePackPage,
};
export default _SceneGISGaussianFormatsGsp;

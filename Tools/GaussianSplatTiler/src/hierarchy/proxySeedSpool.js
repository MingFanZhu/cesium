import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { crc32WithZeroedRanges } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsCrc32.js";

import {
  PROXY_SEED_LAYOUT_ID,
  SEGMENTED_PROXY_POLICY_ID,
} from "./segmentedProxyReducer.js";

const FILE_MAGIC = Buffer.from("CESPSEED", "ascii");
const BLOCK_MAGIC = Buffer.from("PSEEDBLK", "ascii");
const VERSION = 1;
const FILE_HEADER_BYTES = 128;
const BLOCK_HEADER_BYTES = 80;
const FILE_CHECKSUM_OFFSET = 88;
const BLOCK_CHECKSUM_OFFSET = 72;
const INVALID_NODE_INDEX = 0xffffffff;
const MAXIMUM_UINT64 = (1n << 64n) - 1n;
const COPY_BUFFER_BYTES = 1024 * 1024;

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function align8(value) {
  return (value + 7) & ~7;
}

function requireUint32(value, label) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new RangeError(`${label} must be a Uint32`);
  }
  return value;
}

function toSafeNumber(value, label) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${label} exceeds the host safe integer range`);
  }
  return Number(value);
}

function checkedAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} exceeds the host safe integer range`);
  }
  return value;
}

function requireExactArray(seed, field, ArrayType, length) {
  if (!(seed[field] instanceof ArrayType) || seed[field].length !== length) {
    throw new TypeError(
      `seed.${field} must be ${ArrayType.name} of length ${length}`,
    );
  }
}

function seedLayout(count, shCount) {
  requireUint32(count, "seed count");
  requireUint32(shCount, "seed shCount");
  if (count === 0) {
    throw new RangeError("ProxySeed blocks must be non-empty");
  }
  let cursor = BLOCK_HEADER_BYTES;
  const fields = [];
  for (const [name, ArrayType, length] of [
    ["position", Float32Array, count * 3],
    ["scale", Float32Array, count * 3],
    ["rotation", Float32Array, count * 4],
    ["opacity", Float32Array, count],
    ["color", Float32Array, count * 3],
    ["sh", Float32Array, count * shCount],
  ]) {
    const byteLength = length * ArrayType.BYTES_PER_ELEMENT;
    fields.push({ name, ArrayType, length, offset: cursor, byteLength });
    cursor = checkedAdd(cursor, byteLength, `${name} end`);
  }
  const aligned = align8(cursor);
  const padding = aligned - cursor;
  cursor = aligned;
  for (const name of [
    "errorPosition",
    "errorCovariance",
    "errorColor",
    "errorSh",
    "coverageMass",
  ]) {
    const byteLength = count * Float64Array.BYTES_PER_ELEMENT;
    fields.push({
      name,
      ArrayType: Float64Array,
      length: count,
      offset: cursor,
      byteLength,
    });
    cursor = checkedAdd(cursor, byteLength, `${name} end`);
  }
  return Object.freeze({
    fields: Object.freeze(fields),
    padding,
    byteLength: cursor,
  });
}

function validateSeedShape(seed, shCount) {
  if (!seed || typeof seed !== "object") {
    throw new TypeError("seed must be a ProxySeedBlock");
  }
  const count = requireUint32(seed.count, "seed.count");
  if (count === 0 || seed.shCount !== shCount) {
    throw new RangeError("seed count/shCount does not match the spool");
  }
  if (!seed.origin || seed.origin.length !== 3) {
    throw new TypeError("seed.origin must contain three values");
  }
  if (
    typeof seed.representedSourceCount !== "bigint" ||
    seed.representedSourceCount < 1n ||
    seed.representedSourceCount > MAXIMUM_UINT64
  ) {
    throw new RangeError(
      "seed.representedSourceCount must be a positive Uint64",
    );
  }
  const layout = seedLayout(count, shCount);
  for (const field of layout.fields) {
    requireExactArray(seed, field.name, field.ArrayType, field.length);
  }
  return layout;
}

async function writeFully(file, bytes, position) {
  let written = 0;
  while (written < bytes.byteLength) {
    const result = await file.write(
      bytes,
      written,
      bytes.byteLength - written,
      position + written,
    );
    if (result.bytesWritten === 0) {
      throw new Error("ProxySeed spool short write");
    }
    written += result.bytesWritten;
  }
}

async function readFully(file, bytes, position) {
  let read = 0;
  while (read < bytes.byteLength) {
    const result = await file.read(
      bytes,
      read,
      bytes.byteLength - read,
      position + read,
    );
    if (result.bytesRead === 0) {
      throw new Error("ProxySeed spool short read");
    }
    read += result.bytesRead;
  }
}

function encodeFileHeader(shCount) {
  const bytes = Buffer.alloc(FILE_HEADER_BYTES);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  FILE_MAGIC.copy(bytes, 0);
  view.setUint32(8, VERSION, true);
  view.setUint32(12, FILE_HEADER_BYTES, true);
  sha256(PROXY_SEED_LAYOUT_ID).copy(bytes, 16);
  sha256(SEGMENTED_PROXY_POLICY_ID).copy(bytes, 48);
  view.setUint32(80, shCount, true);
  view.setUint32(84, BLOCK_HEADER_BYTES, true);
  view.setUint32(FILE_CHECKSUM_OFFSET, 0, true);
  view.setUint32(
    FILE_CHECKSUM_OFFSET,
    crc32WithZeroedRanges(bytes, [[FILE_CHECKSUM_OFFSET, 4]]),
    true,
  );
  return bytes;
}

function validateFileHeader(bytes, shCount) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    !bytes.subarray(0, 8).equals(FILE_MAGIC) ||
    view.getUint32(8, true) !== VERSION ||
    view.getUint32(12, true) !== FILE_HEADER_BYTES ||
    !bytes.subarray(16, 48).equals(sha256(PROXY_SEED_LAYOUT_ID)) ||
    !bytes.subarray(48, 80).equals(sha256(SEGMENTED_PROXY_POLICY_ID)) ||
    view.getUint32(80, true) !== shCount ||
    view.getUint32(84, true) !== BLOCK_HEADER_BYTES
  ) {
    throw new Error("ProxySeed spool file authority mismatch");
  }
  if (
    view.getUint32(FILE_CHECKSUM_OFFSET, true) !==
    crc32WithZeroedRanges(bytes, [[FILE_CHECKSUM_OFFSET, 4]])
  ) {
    throw new Error("ProxySeed spool header CRC mismatch");
  }
  for (let index = 92; index < FILE_HEADER_BYTES; index++) {
    if (bytes[index] !== 0) {
      throw new Error("ProxySeed spool header reserved bytes must be zero");
    }
  }
}

function encodeBlock(seed, nodeIndex, geometricError, shCount) {
  const layout = validateSeedShape(seed, shCount);
  requireUint32(nodeIndex, "nodeIndex");
  if (!Number.isFinite(geometricError) || geometricError < 0) {
    throw new RangeError("geometricError must be finite and non-negative");
  }
  const bytes = Buffer.alloc(layout.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  BLOCK_MAGIC.copy(bytes, 0);
  view.setUint32(8, BLOCK_HEADER_BYTES, true);
  view.setUint32(12, 0, true);
  view.setUint32(16, nodeIndex, true);
  view.setUint32(20, seed.count, true);
  view.setBigUint64(24, BigInt(bytes.byteLength), true);
  view.setBigUint64(32, seed.representedSourceCount, true);
  view.setFloat64(40, seed.origin[0], true);
  view.setFloat64(48, seed.origin[1], true);
  view.setFloat64(56, seed.origin[2], true);
  view.setFloat64(64, geometricError, true);
  for (const field of layout.fields) {
    const source = new Uint8Array(
      seed[field.name].buffer,
      seed[field.name].byteOffset,
      field.byteLength,
    );
    bytes.set(source, field.offset);
  }
  view.setUint32(
    BLOCK_CHECKSUM_OFFSET,
    crc32WithZeroedRanges(bytes, [[BLOCK_CHECKSUM_OFFSET, 4]]),
    true,
  );
  return bytes;
}

function decodeBlock(bytes, expectedShCount, expectedNodeIndex) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (!bytes.subarray(0, 8).equals(BLOCK_MAGIC)) {
    throw new Error("ProxySeed block magic mismatch");
  }
  if (
    view.getUint32(8, true) !== BLOCK_HEADER_BYTES ||
    view.getUint32(12, true) !== 0 ||
    view.getUint32(76, true) !== 0
  ) {
    throw new Error("ProxySeed block header is invalid");
  }
  const nodeIndex = view.getUint32(16, true);
  if (expectedNodeIndex !== undefined && nodeIndex !== expectedNodeIndex) {
    throw new Error("ProxySeed block owner mismatch");
  }
  const count = view.getUint32(20, true);
  const layout = seedLayout(count, expectedShCount);
  if (
    toSafeNumber(view.getBigUint64(24, true), "ProxySeed block length") !==
      bytes.byteLength ||
    layout.byteLength !== bytes.byteLength
  ) {
    throw new RangeError("ProxySeed block exact length mismatch");
  }
  if (
    view.getUint32(BLOCK_CHECKSUM_OFFSET, true) !==
    crc32WithZeroedRanges(bytes, [[BLOCK_CHECKSUM_OFFSET, 4]])
  ) {
    throw new Error("ProxySeed block CRC mismatch");
  }
  const paddingStart = layout.fields.find((field) => field.name === "sh");
  const shEnd = paddingStart.offset + paddingStart.byteLength;
  for (let index = shEnd; index < align8(shEnd); index++) {
    if (bytes[index] !== 0) {
      throw new Error("ProxySeed block alignment padding must be zero");
    }
  }
  const seed = {
    count,
    shCount: expectedShCount,
    origin: new Float64Array([
      view.getFloat64(40, true),
      view.getFloat64(48, true),
      view.getFloat64(56, true),
    ]),
    representedSourceCount: view.getBigUint64(32, true),
  };
  for (const field of layout.fields) {
    seed[field.name] = new field.ArrayType(
      bytes.buffer,
      bytes.byteOffset + field.offset,
      field.length,
    );
  }
  return Object.freeze({
    nodeIndex,
    geometricError: view.getFloat64(64, true),
    seed: Object.freeze(seed),
    bytes,
  });
}

export async function createProxySeedSpool({
  temporaryDirectory,
  shCount,
} = {}) {
  requireUint32(shCount, "shCount");
  const parent = temporaryDirectory ?? tmpdir();
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "gsp-proxy-seed-"));
  const filePath = path.join(directory, "proxy-seeds.bin");
  const file = await open(filePath, "w+");
  await writeFully(file, encodeFileHeader(shCount), 0);
  let cursor = FILE_HEADER_BYTES;
  let peakBytes = cursor;
  let closed = false;

  async function append(
    seed,
    { nodeIndex = INVALID_NODE_INDEX, geometricError = 0 } = {},
  ) {
    if (closed) {
      throw new Error("ProxySeed spool is closed");
    }
    const bytes = encodeBlock(seed, nodeIndex, geometricError, shCount);
    const record = Object.freeze({
      offset: BigInt(cursor),
      byteLength: BigInt(bytes.byteLength),
      nodeIndex,
    });
    await writeFully(file, bytes, cursor);
    cursor += bytes.byteLength;
    peakBytes = Math.max(peakBytes, cursor);
    return record;
  }

  async function read(record, expectedNodeIndex = record.nodeIndex) {
    const offset = toSafeNumber(record.offset, "ProxySeed record offset");
    const byteLength = toSafeNumber(
      record.byteLength,
      "ProxySeed record byteLength",
    );
    if (offset < FILE_HEADER_BYTES || offset + byteLength > cursor) {
      throw new RangeError("ProxySeed record range is outside the spool");
    }
    const header = Buffer.alloc(FILE_HEADER_BYTES);
    await readFully(file, header, 0);
    validateFileHeader(header, shCount);
    const bytes = Buffer.alloc(byteLength);
    await readFully(file, bytes, offset);
    return decodeBlock(bytes, shCount, expectedNodeIndex);
  }

  async function canonicalizeLeaves(
    entries,
    { compactPartScratch = false } = {},
  ) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new RangeError("canonical leaf entries must be non-empty");
    }
    const canonicalStart = cursor;
    const appended = [];
    let canonicalBytes = 0;
    const sourceOwners = new Set();
    const nodeOwners = new Set();
    for (const entry of entries) {
      const sourceKey = `${entry.record.offset}:${entry.record.byteLength}`;
      if (sourceOwners.has(sourceKey) || nodeOwners.has(entry.nodeIndex)) {
        throw new Error("ProxySeed canonicalization contains duplicate owners");
      }
      sourceOwners.add(sourceKey);
      nodeOwners.add(entry.nodeIndex);
      const decoded = await read(entry.record, INVALID_NODE_INDEX);
      const canonicalRecord = await append(decoded.seed, {
        nodeIndex: entry.nodeIndex,
        geometricError: decoded.geometricError,
      });
      appended.push(canonicalRecord);
      canonicalBytes += toSafeNumber(
        canonicalRecord.byteLength,
        "canonical ProxySeed byteLength",
      );
    }
    const scratchBytes = canonicalStart - FILE_HEADER_BYTES;
    if (
      canonicalBytes !== scratchBytes &&
      !(compactPartScratch && canonicalBytes < scratchBytes)
    ) {
      throw new Error(
        "ProxySeed canonical region does not equal the scratch leaf region",
      );
    }
    const copyBuffer = Buffer.alloc(
      Math.min(COPY_BUFFER_BYTES, canonicalBytes),
    );
    let copied = 0;
    while (copied < canonicalBytes) {
      const byteLength = Math.min(
        copyBuffer.byteLength,
        canonicalBytes - copied,
      );
      const bytes = copyBuffer.subarray(0, byteLength);
      await readFully(file, bytes, canonicalStart + copied);
      await writeFully(file, bytes, FILE_HEADER_BYTES + copied);
      copied += byteLength;
    }
    cursor = FILE_HEADER_BYTES + canonicalBytes;
    await file.truncate(cursor);
    let offset = FILE_HEADER_BYTES;
    return appended.map((record, index) => {
      const canonical = Object.freeze({
        offset: BigInt(offset),
        byteLength: record.byteLength,
        nodeIndex: entries[index].nodeIndex,
      });
      offset += toSafeNumber(record.byteLength, "canonical ProxySeed length");
      return canonical;
    });
  }

  async function close() {
    if (!closed) {
      closed = true;
      await file.close();
    }
  }

  async function cleanup() {
    await close();
    await rm(directory, { recursive: true, force: true });
  }

  return Object.freeze({
    directory,
    filePath,
    shCount,
    append,
    read,
    canonicalizeLeaves,
    close,
    cleanup,
    get byteLength() {
      return cursor;
    },
    get peakBytes() {
      return peakBytes;
    },
  });
}

export {
  BLOCK_HEADER_BYTES as PROXY_SEED_BLOCK_HEADER_BYTES,
  FILE_HEADER_BYTES as PROXY_SEED_FILE_HEADER_BYTES,
  INVALID_NODE_INDEX as PROXY_SEED_INVALID_NODE_INDEX,
};

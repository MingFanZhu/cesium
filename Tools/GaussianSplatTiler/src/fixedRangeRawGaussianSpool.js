import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { streamPlyVertexBatches } from "./io/ply/PlyStreamReader.js";
import { createRawGaussianBlock } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianColumns.js";
import {
  plyGaussianPropertyNames,
  rawGaussianSpoolBlockBufferBytes,
  rawGaussianSpoolRecordBytes,
} from "./io/gaussian/rawGaussianSpool.js";

const RAW_FLOAT_COMPONENT_COUNT = 14;

function findBlock(blocks, sortedPosition) {
  let low = 0;
  let high = blocks.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const block = blocks[middle];
    if (sortedPosition < block.start) {
      high = middle - 1;
    } else if (sortedPosition >= block.start + block.count) {
      low = middle + 1;
    } else {
      return block;
    }
  }
  throw new Error(`Sorted position ${sortedPosition} is outside all blocks`);
}

async function writeFully(file, buffer, position) {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesWritten } = await file.write(
      buffer,
      offset,
      buffer.byteLength - offset,
      position + offset,
    );
    if (bytesWritten === 0) {
      throw new Error("Unable to advance while writing fixed-range raw spool");
    }
    offset += bytesWritten;
  }
}

async function readFully(file, buffer, position) {
  let offset = 0;
  while (offset < buffer.byteLength) {
    const { bytesRead } = await file.read(
      buffer,
      offset,
      buffer.byteLength - offset,
      position + offset,
    );
    if (bytesRead === 0) {
      throw new Error("Unexpected end of fixed-range raw spool");
    }
    offset += bytesRead;
  }
}

export function writeRawRecord(
  view,
  byteOffset,
  batch,
  row,
  localIndex,
  originalIndex,
  schema,
) {
  let offset = byteOffset;
  const writeFloat = (value) => {
    view.setFloat32(offset, value, true);
    offset += Float32Array.BYTES_PER_ELEMENT;
  };
  for (const name of [
    "x",
    "y",
    "z",
    "scale_0",
    "scale_1",
    "scale_2",
    "rot_1",
    "rot_2",
    "rot_3",
    "rot_0",
    "f_dc_0",
    "f_dc_1",
    "f_dc_2",
    "opacity",
  ]) {
    writeFloat(batch.columns[name][row]);
  }
  const coefficientsPerChannel = schema.shCoefficientCount / 3;
  for (
    let coefficient = 0;
    coefficient < coefficientsPerChannel;
    coefficient++
  ) {
    for (let channel = 0; channel < 3; channel++) {
      const plyIndex = channel * coefficientsPerChannel + coefficient;
      writeFloat(batch.columns[`f_rest_${plyIndex}`][row]);
    }
  }
  view.setUint32(offset, localIndex, true);
  view.setUint32(offset + Uint32Array.BYTES_PER_ELEMENT, originalIndex, true);
}

export function readRawRecord(raw, view, byteOffset, localIndex, shCount) {
  let offset = byteOffset;
  const readFloat = () => {
    const value = view.getFloat32(offset, true);
    offset += Float32Array.BYTES_PER_ELEMENT;
    return value;
  };
  const offset3 = localIndex * 3;
  const offset4 = localIndex * 4;
  raw.position[offset3] = readFloat();
  raw.position[offset3 + 1] = readFloat();
  raw.position[offset3 + 2] = readFloat();
  raw.logScale[offset3] = readFloat();
  raw.logScale[offset3 + 1] = readFloat();
  raw.logScale[offset3 + 2] = readFloat();
  raw.rotation[offset4] = readFloat();
  raw.rotation[offset4 + 1] = readFloat();
  raw.rotation[offset4 + 2] = readFloat();
  raw.rotation[offset4 + 3] = readFloat();
  raw.dc[offset3] = readFloat();
  raw.dc[offset3 + 1] = readFloat();
  raw.dc[offset3 + 2] = readFloat();
  raw.opacityLogit[localIndex] = readFloat();
  for (let coefficient = 0; coefficient < shCount; coefficient++) {
    raw.sh[localIndex * shCount + coefficient] = readFloat();
  }
}

export function fixedRangeRawSpoolBookkeepingBytes(blockCount) {
  return (
    blockCount *
    (2 * BigUint64Array.BYTES_PER_ELEMENT + Uint32Array.BYTES_PER_ELEMENT)
  );
}

export function planFixedRangeRawSpool(blocks, shCount) {
  const recordBytes = rawGaussianSpoolRecordBytes(shCount);
  const blockBufferBytes = rawGaussianSpoolBlockBufferBytes(shCount);
  let totalRecordBytes = 0;
  for (const block of blocks) {
    totalRecordBytes += block.count * recordBytes;
    if (!Number.isSafeInteger(totalRecordBytes)) {
      throw new Error("Fixed-range raw spool size exceeds safe integer range");
    }
  }
  return Object.freeze({
    recordBytes,
    blockBufferBytes,
    activeBlockCount: blocks.length,
    activeBlockBufferBytes: blocks.length * blockBufferBytes,
    bookkeepingBytes: fixedRangeRawSpoolBookkeepingBytes(blocks.length),
    totalRecordBytes,
  });
}

async function createFixedRangeRawSpool(filePath, partition, options) {
  const { blocks, sortedIndices, header, schema } = partition;
  const plan = planFixedRangeRawSpool(blocks, schema.shCoefficientCount);
  const parent = options.temporaryDirectory ?? tmpdir();
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "gsp-macro-fixed-spool-"));
  const spoolPath = path.join(directory, "raw-blocks.bin");
  const blockBase = new BigUint64Array(blocks.length);
  const flushedBytes = new BigUint64Array(blocks.length);
  const filled = new Uint32Array(blocks.length);
  const buffers = Buffer.allocUnsafe(plan.activeBlockBufferBytes);
  const originalToSorted = new Uint32Array(sortedIndices.length);
  let base = 0;
  for (const block of blocks) {
    blockBase[block.ordinal] = BigInt(base);
    base += block.count * plan.recordBytes;
  }
  for (
    let sortedPosition = 0;
    sortedPosition < sortedIndices.length;
    sortedPosition++
  ) {
    originalToSorted[sortedIndices[sortedPosition]] = sortedPosition;
  }
  const file = await open(spoolPath, "w");

  async function flush(ordinal, usedBytes) {
    if (usedBytes === 0) {
      return;
    }
    const bufferStart = ordinal * plan.blockBufferBytes;
    const bytes = buffers.subarray(bufferStart, bufferStart + usedBytes);
    const position = Number(blockBase[ordinal]) + Number(flushedBytes[ordinal]);
    await writeFully(file, bytes, position);
    flushedBytes[ordinal] += BigInt(usedBytes);
  }

  try {
    let visited = 0;
    const properties = plyGaussianPropertyNames(schema);
    for await (const batch of streamPlyVertexBatches(filePath, {
      header,
      properties,
      batchSize: options.batchSize,
    })) {
      for (let row = 0; row < batch.count; row++) {
        const originalIndex = batch.start + row;
        const sortedPosition = originalToSorted[originalIndex];
        const block = findBlock(blocks, sortedPosition);
        const ordinal = block.ordinal;
        const usedBytes =
          (filled[ordinal] * plan.recordBytes) % plan.blockBufferBytes;
        const bufferStart = ordinal * plan.blockBufferBytes;
        const view = new DataView(
          buffers.buffer,
          buffers.byteOffset + bufferStart,
          plan.blockBufferBytes,
        );
        writeRawRecord(
          view,
          usedBytes,
          batch,
          row,
          sortedPosition - block.start,
          originalIndex,
          schema,
        );
        filled[ordinal]++;
        visited++;
        if (usedBytes + plan.recordBytes === plan.blockBufferBytes) {
          await flush(ordinal, plan.blockBufferBytes);
        }
      }
    }
    if (visited !== partition.pointCount) {
      throw new Error(
        `Fixed-range raw spool visited ${visited} points, expected ${partition.pointCount}`,
      );
    }
    for (const block of blocks) {
      const ordinal = block.ordinal;
      if (filled[ordinal] !== block.count) {
        throw new Error(
          `Fixed-range raw spool block ${ordinal} filled ${filled[ordinal]} of ${block.count}`,
        );
      }
      const remainingBytes =
        (filled[ordinal] * plan.recordBytes) % plan.blockBufferBytes;
      await flush(ordinal, remainingBytes);
      if (Number(flushedBytes[ordinal]) !== block.count * plan.recordBytes) {
        throw new Error(`Fixed-range raw spool block ${ordinal} is incomplete`);
      }
    }
    await file.close();
    return {
      directory,
      spoolPath,
      blockBase,
      flushedBytes,
      filled,
      plan,
    };
  } catch (error) {
    await file.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function* readFixedRangeRawSpool(spool, partition) {
  const file = await open(spool.spoolPath, "r");
  const readBuffer = Buffer.allocUnsafe(spool.plan.blockBufferBytes);
  try {
    for (const block of partition.blocks) {
      const raw = createRawGaussianBlock(
        block.count,
        partition.schema.shCoefficientCount,
      );
      raw.stableId.fill(0xffffffff);
      const blockBytes = block.count * spool.plan.recordBytes;
      let consumedBytes = 0;
      while (consumedBytes < blockBytes) {
        const byteLength = Math.min(
          spool.plan.blockBufferBytes,
          blockBytes - consumedBytes,
        );
        const bytes = readBuffer.subarray(0, byteLength);
        await readFully(
          file,
          bytes,
          Number(spool.blockBase[block.ordinal]) + consumedBytes,
        );
        const view = new DataView(bytes.buffer, bytes.byteOffset, byteLength);
        for (
          let offset = 0;
          offset < byteLength;
          offset += spool.plan.recordBytes
        ) {
          const indexOffset =
            offset +
            (RAW_FLOAT_COMPONENT_COUNT + partition.schema.shCoefficientCount) *
              Float32Array.BYTES_PER_ELEMENT;
          const localIndex = view.getUint32(indexOffset, true);
          if (
            localIndex >= block.count ||
            raw.stableId[localIndex] !== 0xffffffff
          ) {
            throw new Error(
              `Invalid duplicate fixed-range record for block ${block.ordinal}`,
            );
          }
          readRawRecord(
            raw,
            view,
            offset,
            localIndex,
            partition.schema.shCoefficientCount,
          );
          raw.stableId[localIndex] = view.getUint32(
            indexOffset + Uint32Array.BYTES_PER_ELEMENT,
            true,
          );
        }
        consumedBytes += byteLength;
      }
      if (raw.stableId.includes(0xffffffff)) {
        throw new Error(
          `Fixed-range raw spool did not fill block ${block.ordinal}`,
        );
      }
      yield raw;
    }
  } finally {
    await file.close();
  }
}

export async function* streamFixedRangeRawGaussianBlocks(
  filePath,
  partition,
  options = {},
) {
  const spool = await createFixedRangeRawSpool(filePath, partition, options);
  try {
    options.onSpoolCreated?.(spool.directory, spool.plan);
    if (options.releaseSpatialWorkingSet === true) {
      partition.mortonKeys = undefined;
      partition.sortedIndices = undefined;
    }
    yield* readFixedRangeRawSpool(spool, partition);
  } finally {
    await rm(spool.directory, { recursive: true, force: true });
    options.onSpoolRemoved?.(spool.directory);
  }
}

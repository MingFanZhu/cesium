import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gaussianCorePropertyNames } from "../../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianPlyGaussianSchema.js";
import { streamPlyVertexBatches } from "../ply/PlyStreamReader.js";
import { createRawGaussianBlock } from "../../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianColumns.js";

export const RAW_GAUSSIAN_SPOOL_BUFFER_BYTES = 32 * 1024;
const RAW_FLOAT_COMPONENT_COUNT = 14;

function nonNegativeSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} is outside the supported integer range`);
  }
}

function safeMultiply(left, right, name) {
  nonNegativeSafeInteger(left, `${name} left operand`);
  nonNegativeSafeInteger(right, `${name} right operand`);
  if (left !== 0 && right > Math.floor(Number.MAX_SAFE_INTEGER / left)) {
    throw new Error(`${name} exceeds the supported integer range`);
  }
  return left * right;
}

export function rawGaussianSpoolRecordBytes(shCount) {
  nonNegativeSafeInteger(shCount, "shCount");
  const componentCount = RAW_FLOAT_COMPONENT_COUNT + shCount + 2;
  nonNegativeSafeInteger(componentCount, "raw Gaussian spool component count");
  return safeMultiply(
    componentCount,
    Float32Array.BYTES_PER_ELEMENT,
    "raw Gaussian spool record bytes",
  );
}

export function rawGaussianSpoolBlockBufferBytes(shCount) {
  const recordBytes = rawGaussianSpoolRecordBytes(shCount);
  return Math.max(
    recordBytes,
    RAW_GAUSSIAN_SPOOL_BUFFER_BYTES -
      (RAW_GAUSSIAN_SPOOL_BUFFER_BYTES % recordBytes),
  );
}

export function rawGaussianSpoolBufferBytesForActiveBlocks(
  activeBlockCount,
  shCount,
) {
  nonNegativeSafeInteger(activeBlockCount, "activeBlockCount");
  return safeMultiply(
    activeBlockCount,
    rawGaussianSpoolBlockBufferBytes(shCount),
    "raw Gaussian spool Block buffer bytes",
  );
}

export function planRawGaussianSpoolBlockBuffers(blockCounts, shCount) {
  let activeBlockCount = 0;
  for (const count of blockCounts) {
    nonNegativeSafeInteger(count, "raw Gaussian spool Block count");
    if (count > 0) {
      activeBlockCount++;
    }
  }
  const blockBufferBytes = rawGaussianSpoolBlockBufferBytes(shCount);
  return {
    activeBlockCount,
    blockBufferBytes,
    totalBytes: rawGaussianSpoolBufferBytesForActiveBlocks(
      activeBlockCount,
      shCount,
    ),
  };
}

export function plyGaussianPropertyNames(schema) {
  return [
    ...gaussianCorePropertyNames,
    ...Array.from(
      { length: schema.shCoefficientCount },
      (_, index) => `f_rest_${index}`,
    ),
  ];
}

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
      throw new Error("Unable to advance while writing raw Gaussian spool");
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
      throw new Error("Unexpected end of raw Gaussian spool");
    }
    offset += bytesRead;
  }
}

function createSpoolBuffer(byteLength) {
  const buffer = Buffer.allocUnsafe(byteLength);
  return {
    buffer,
    view: new DataView(buffer.buffer, buffer.byteOffset, byteLength),
    used: 0,
  };
}

function writeRawSpoolRecord(
  target,
  byteOffset,
  batch,
  row,
  localIndex,
  originalIndex,
  schema,
) {
  let offset = byteOffset;
  const writeFloat = (value) => {
    target.view.setFloat32(offset, value, true);
    offset += Float32Array.BYTES_PER_ELEMENT;
  };
  writeFloat(batch.columns.x[row]);
  writeFloat(batch.columns.y[row]);
  writeFloat(batch.columns.z[row]);
  writeFloat(batch.columns.scale_0[row]);
  writeFloat(batch.columns.scale_1[row]);
  writeFloat(batch.columns.scale_2[row]);
  writeFloat(batch.columns.rot_1[row]);
  writeFloat(batch.columns.rot_2[row]);
  writeFloat(batch.columns.rot_3[row]);
  writeFloat(batch.columns.rot_0[row]);
  writeFloat(batch.columns.f_dc_0[row]);
  writeFloat(batch.columns.f_dc_1[row]);
  writeFloat(batch.columns.f_dc_2[row]);
  writeFloat(batch.columns.opacity[row]);
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
  target.view.setUint32(offset, localIndex, true);
  target.view.setUint32(
    offset + Uint32Array.BYTES_PER_ELEMENT,
    originalIndex,
    true,
  );
}

function readRawSpoolRecord(raw, view, byteOffset, localIndex, shCount) {
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

async function createRawGaussianSpool(filePath, partition, options) {
  const { blocks, sortedIndices, header, schema } = partition;
  const parent = options.temporaryDirectory ?? tmpdir();
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "gsp-tree-leaf-spool-"));
  const spoolPath = path.join(directory, "raw-blocks.bin");
  const recordBytes = rawGaussianSpoolRecordBytes(schema.shCoefficientCount);
  const blockBufferBytes = rawGaussianSpoolBlockBufferBytes(
    schema.shCoefficientCount,
  );
  const chunks = Array.from({ length: blocks.length }, () => []);
  const buffers = new Array(blocks.length);
  const filled = new Uint32Array(blocks.length);
  const originalToSorted = new Uint32Array(sortedIndices.length);
  for (
    let sortedPosition = 0;
    sortedPosition < sortedIndices.length;
    sortedPosition++
  ) {
    originalToSorted[sortedIndices[sortedPosition]] = sortedPosition;
  }
  let writePosition = 0;
  let visited = 0;
  const file = await open(spoolPath, "w");

  async function flush(ordinal) {
    const target = buffers[ordinal];
    if (!target || target.used === 0) {
      return;
    }
    const bytes = target.buffer.subarray(0, target.used);
    await writeFully(file, bytes, writePosition);
    chunks[ordinal].push({
      offset: writePosition,
      byteLength: bytes.byteLength,
    });
    writePosition += bytes.byteLength;
    target.used = 0;
  }

  try {
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
        let target = buffers[block.ordinal];
        if (!target) {
          target = createSpoolBuffer(blockBufferBytes);
          buffers[block.ordinal] = target;
        }
        if (target.used + recordBytes > target.buffer.byteLength) {
          await flush(block.ordinal);
        }
        writeRawSpoolRecord(
          target,
          target.used,
          batch,
          row,
          sortedPosition - block.start,
          originalIndex,
          schema,
        );
        target.used += recordBytes;
        filled[block.ordinal]++;
        visited++;
      }
    }
    if (visited !== partition.pointCount) {
      throw new Error(
        `Gaussian spool visited ${visited} points, expected ${partition.pointCount}`,
      );
    }
    for (const block of blocks) {
      if (filled[block.ordinal] !== block.count) {
        throw new Error(
          `Gaussian spool block ${block.ordinal} filled ${filled[block.ordinal]} of ${block.count}`,
        );
      }
      await flush(block.ordinal);
      buffers[block.ordinal] = undefined;
    }
    await file.close();
    return { directory, spoolPath, chunks, recordBytes };
  } catch (error) {
    await file.close();
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function* readRawGaussianSpool(spool, partition) {
  const file = await open(spool.spoolPath, "r");
  try {
    for (const block of partition.blocks) {
      const raw = createRawGaussianBlock(
        block.count,
        partition.schema.shCoefficientCount,
      );
      const filled = new Uint8Array(block.count);
      for (const chunk of spool.chunks[block.ordinal]) {
        const bytes = Buffer.allocUnsafe(chunk.byteLength);
        await readFully(file, bytes, chunk.offset);
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        for (
          let offset = 0;
          offset < bytes.byteLength;
          offset += spool.recordBytes
        ) {
          const indexOffset =
            offset +
            (RAW_FLOAT_COMPONENT_COUNT + partition.schema.shCoefficientCount) *
              Float32Array.BYTES_PER_ELEMENT;
          const localIndex = view.getUint32(indexOffset, true);
          if (localIndex >= block.count || filled[localIndex] !== 0) {
            throw new Error(
              `Invalid duplicate raw spool record for block ${block.ordinal}`,
            );
          }
          readRawSpoolRecord(
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
          filled[localIndex] = 1;
        }
      }
      if (filled.includes(0)) {
        throw new Error(`Raw spool did not fill block ${block.ordinal}`);
      }
      yield raw;
    }
  } finally {
    await file.close();
  }
}

/**
 * Streams raw Gaussian blocks in Morton block order and always removes the
 * temporary source spool when the consumer completes, throws or returns early.
 */
export async function* streamRawGaussianSpoolBlocks(
  filePath,
  partition,
  options = {},
) {
  const spool = await createRawGaussianSpool(filePath, partition, options);
  try {
    options.onSpoolCreated?.(spool.directory);
    if (options.releaseSpatialWorkingSet === true) {
      partition.mortonKeys = undefined;
      partition.sortedIndices = undefined;
    }
    yield* readRawGaussianSpool(spool, partition);
  } finally {
    await rm(spool.directory, { recursive: true, force: true });
    options.onSpoolRemoved?.(spool.directory);
  }
}

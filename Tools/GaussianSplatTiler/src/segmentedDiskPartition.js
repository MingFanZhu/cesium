import { Buffer } from "node:buffer";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { emptyBounds, extendPoint } from "./bounds.js";
import { normalizeSegmentedBuilderOptions } from "./segmentedPartition.js";
import {
  readPlyHeader,
  streamPlyVertexBatches,
} from "./io/ply/PlyStreamReader.js";
import {
  plyGaussianPropertyNames,
  rawGaussianSpoolRecordBytes,
} from "./io/gaussian/rawGaussianSpool.js";
import { readRawRecord, writeRawRecord } from "./fixedRangeRawGaussianSpool.js";
import { inspectGaussianPlySchema } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianPlyGaussianSchema.js";
import {
  computeMortonKeys,
  createMortonCubeBounds,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSpatialMorton.js";
import { createRawGaussianBlock } from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianColumns.js";

const RUN_SPLATS = 262144;
const MERGE_FAN_IN = 32;
const IO_BYTES = 1024 * 1024;
const KEY_BYTES = 12;

function cellCoordinates(x, y, z, options) {
  return [x, y, z].map((value, axis) =>
    Math.floor(
      (value - options.fixedGridOrigin[axis]) / options.cellSizeSource[axis],
    ),
  );
}

function mortonCell(xyz, minimum) {
  let key = 0n;
  for (let axis = 0; axis < 3; axis++) {
    const value = BigInt(xyz[axis] - minimum[axis]);
    for (let bit = 0; bit < 21; bit++) {
      key |= ((value >> BigInt(bit)) & 1n) << BigInt(3 * bit + axis);
    }
  }
  return key;
}

async function scanCells(input, header, options, onProgress) {
  const bounds = emptyBounds();
  const cells = new Map();
  let count = 0;
  for await (const batch of streamPlyVertexBatches(input, {
    header,
    batchSize: options.batchSize,
    properties: ["x", "y", "z"],
  })) {
    for (let i = 0; i < batch.count; i++) {
      const { x, y, z } = batch.columns;
      extendPoint(bounds, x[i], y[i], z[i]);
      const xyz = cellCoordinates(x[i], y[i], z[i], options);
      if (!xyz.every(Number.isSafeInteger)) {
        throw new RangeError("F1 fixed XYZ occupied cell range is invalid");
      }
      const key = xyz.join(",");
      const cell = cells.get(key);
      if (cell) {
        cell.count++;
      } else {
        cells.set(key, { xyz, count: 1 });
      }
    }
    count += batch.count;
    onProgress?.({
      stage: "partition-scan",
      scanned: count,
      total: header.elements.find((element) => element.name === "vertex").count,
    });
  }
  if (count === 0) {
    throw new Error("PLY vertex scan requires nonzero count");
  }
  const minimum = cellCoordinates(...bounds.slice(0, 3), options);
  const maximum = cellCoordinates(...bounds.slice(3), options);
  if (maximum.some((value, axis) => value - minimum[axis] >= 2 ** 21)) {
    throw new RangeError("F1 fixed XYZ hierarchy exceeds 21 octree levels");
  }
  const ordered = [...cells.values()];
  for (const cell of ordered) {
    cell.morton = mortonCell(cell.xyz, minimum);
  }
  // The existing producer radix uses six passes (48 bits). Preserve its order.
  const mask = (1n << 48n) - 1n;
  ordered.sort((a, b) => Number((a.morton & mask) - (b.morton & mask)));
  const chunks = [];
  let start = 0;
  for (const [order, cell] of ordered.entries()) {
    cell.order = order;
    const [tileX, tileY, tileZ] = cell.xyz;
    const min = cell.xyz.map(
      (v, axis) =>
        options.fixedGridOrigin[axis] + v * options.cellSizeSource[axis],
    );
    const cellBounds = [
      ...min,
      ...min.map((v, axis) => v + options.cellSizeSource[axis]),
    ];
    const partCount = Math.ceil(cell.count / options.maximumChunkSplats);
    for (let partIndex = 0; partIndex < partCount; partIndex++) {
      const partSize = Math.min(
        options.maximumChunkSplats,
        cell.count - partIndex * options.maximumChunkSplats,
      );
      chunks.push({
        ordinal: chunks.length,
        chunkId: `t${tileZ}-${tileY}-${tileX}-p${partIndex}`,
        depth: 0,
        prefix: cell.morton.toString(16),
        commonDepth: 0,
        commonPrefix: "0",
        start,
        count: partSize,
        cellBounds,
        logicalTile: {
          tileX,
          tileY,
          tileZ,
          partIndex,
          partCount,
          bounds: cellBounds,
        },
      });
      start += partSize;
    }
  }
  return {
    bounds,
    cells,
    chunks,
    pointCount: count,
    mortonBounds: createMortonCubeBounds(bounds),
  };
}

async function writeFully(file, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesWritten } = await file.write(
      bytes,
      offset,
      bytes.length - offset,
    );
    if (!bytesWritten) {
      throw new Error("Unable to advance partition spool write");
    }
    offset += bytesWritten;
  }
}

async function readFully(file, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const { bytesRead } = await file.read(bytes, offset, bytes.length - offset);
    if (!bytesRead) {
      throw new Error("Unexpected end of partition spool");
    }
    offset += bytesRead;
  }
}

function compareRecords(a, ai, b, bi, stride) {
  return (
    a.readUInt32LE(ai) - b.readUInt32LE(bi) ||
    a.readUInt32LE(ai + 4) - b.readUInt32LE(bi + 4) ||
    a.readUInt32LE(ai + 8) - b.readUInt32LE(bi + 8) ||
    a.readUInt32LE(ai + stride - 4) - b.readUInt32LE(bi + stride - 4)
  );
}

async function createRuns(input, partition, owner, runSplats, onProgress) {
  const { header, schema, options, recordBytes, cells, mortonBounds } =
    partition;
  const capacity = Math.min(runSplats, partition.pointCount);
  const records = Buffer.allocUnsafe(capacity * recordBytes);
  const sorted = Buffer.allocUnsafe(records.length);
  const indices = new Uint32Array(capacity);
  const view = new DataView(records.buffer, records.byteOffset, records.length);
  const runs = [];
  let used = 0;
  async function flush() {
    if (!used) {
      return;
    }
    const order = indices.subarray(0, used);
    for (let i = 0; i < used; i++) {
      order[i] = i;
    }
    order.sort((a, b) =>
      compareRecords(
        records,
        a * recordBytes,
        records,
        b * recordBytes,
        recordBytes,
      ),
    );
    for (let i = 0; i < used; i++) {
      records.copy(
        sorted,
        i * recordBytes,
        order[i] * recordBytes,
        (order[i] + 1) * recordBytes,
      );
    }
    const name = path.join(owner.directory, `run-${runs.length}.bin`);
    const file = await open(name, "wx");
    try {
      await writeFully(file, sorted.subarray(0, used * recordBytes));
    } finally {
      await file.close();
    }
    owner.account(used * recordBytes);
    runs.push({ name, count: used });
    used = 0;
  }
  for await (const batch of streamPlyVertexBatches(input, {
    header,
    batchSize: options.batchSize,
    properties: plyGaussianPropertyNames(schema),
  })) {
    const { x, y, z } = batch.columns;
    const keys = computeMortonKeys(x, y, z, mortonBounds);
    for (let i = 0; i < batch.count; i++) {
      const cell = cells.get(
        cellCoordinates(x[i], y[i], z[i], options).join(","),
      );
      const offset = used * recordBytes;
      records.writeUInt32LE(cell.order, offset);
      records.writeUInt32LE(Number(keys[i] >> 32n), offset + 4);
      records.writeUInt32LE(Number(keys[i] & 0xffffffffn), offset + 8);
      writeRawRecord(
        view,
        offset + KEY_BYTES,
        batch,
        i,
        0,
        batch.start + i,
        schema,
      );
      used++;
      if (used === capacity) {
        await flush();
      }
    }
    onProgress?.({
      stage: "partition-runs",
      scanned: batch.start + batch.count,
      total: partition.pointCount,
      runs: runs.length,
    });
  }
  await flush();
  return runs;
}

async function mergeRuns(runs, name, stride, owner, onProgress) {
  const readers = [];
  const heap = [];
  const capacity = Math.max(1, Math.floor(IO_BYTES / stride));
  const output = Buffer.allocUnsafe(capacity * stride);
  let used = 0;
  let merged = 0;
  const total = runs.reduce((sum, run) => sum + run.count, 0);
  let outputFile;
  function less(a, b) {
    return compareRecords(a.bytes, a.offset, b.bytes, b.offset, stride) < 0;
  }
  function push(item) {
    let i = heap.length;
    heap.push(item);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!less(item, heap[p])) {
        break;
      }
      heap[i] = heap[p];
      i = p;
    }
    heap[i] = item;
  }
  function pop() {
    const first = heap[0],
      last = heap.pop();
    if (heap.length) {
      let i = 0;
      while (i * 2 + 1 < heap.length) {
        let child = i * 2 + 1;
        if (child + 1 < heap.length && less(heap[child + 1], heap[child])) {
          child++;
        }
        if (!less(heap[child], last)) {
          break;
        }
        heap[i] = heap[child];
        i = child;
      }
      heap[i] = last;
    }
    return first;
  }
  async function refill(reader) {
    const count = Math.min(capacity, reader.remaining);
    if (!count) {
      return false;
    }
    await readFully(reader.file, reader.bytes.subarray(0, count * stride));
    reader.remaining -= count;
    reader.offset = 0;
    reader.end = count * stride;
    return true;
  }
  async function flush() {
    await writeFully(outputFile, output.subarray(0, used));
    owner.account(used);
    merged += used / stride;
    onProgress?.({ merged, total });
    used = 0;
  }
  try {
    for (const run of runs) {
      const reader = { file: await open(run.name, "r"), remaining: run.count };
      readers.push(reader);
      reader.bytes = Buffer.allocUnsafe(capacity * stride);
      if (await refill(reader)) {
        push(reader);
      }
    }
    outputFile = await open(name, "wx");
    while (heap.length) {
      const reader = pop();
      reader.bytes.copy(output, used, reader.offset, reader.offset + stride);
      used += stride;
      if (used === output.length) {
        await flush();
      }
      reader.offset += stride;
      if (reader.offset < reader.end || (await refill(reader))) {
        push(reader);
      }
    }
    if (used) {
      await flush();
    }
  } finally {
    await outputFile?.close();
    await Promise.all(readers.map((reader) => reader.file.close()));
  }
  for (const run of runs) {
    await rm(run.name);
    owner.account(-run.count * stride);
  }
  return { name, count: total };
}

/** Build a disk-owned spatial partition without source-count-sized arrays. */
export async function partitionPlyToDisk(
  input,
  rawOptions = {},
  { runSplats = RUN_SPLATS, fanIn = MERGE_FAN_IN } = {},
) {
  if (
    !Number.isSafeInteger(runSplats) ||
    runSplats < 1 ||
    runSplats > RUN_SPLATS ||
    !Number.isInteger(fanIn) ||
    fanIn < 2 ||
    fanIn > MERGE_FAN_IN
  ) {
    throw new RangeError("Invalid bounded partition run size or merge fan-in");
  }
  const options = normalizeSegmentedBuilderOptions(rawOptions);
  const header = await readPlyHeader(input);
  const schema = inspectGaussianPlySchema(header);
  if (schema.vertexCount > 0xffffffff) {
    throw new RangeError(
      "Gaussian source indices require at most uint32 point count",
    );
  }
  await rawOptions.onHeaderValidated?.({ header, schema, options });
  const parent = path.resolve(rawOptions.temporaryDirectory ?? tmpdir());
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(path.join(parent, "gsp-segmented-sort-"));
  const owner = {
    directory,
    bytes: 0,
    peakBytes: 0,
    account(bytes) {
      this.bytes += bytes;
      this.peakBytes = Math.max(this.peakBytes, this.bytes);
    },
  };
  try {
    const partition = {
      ...(await scanCells(input, header, options, rawOptions.onProgress)),
      header,
      schema,
      options,
      directory,
      recordBytes:
        KEY_BYTES + rawGaussianSpoolRecordBytes(schema.shCoefficientCount),
    };
    let runs = await createRuns(
      input,
      partition,
      owner,
      runSplats,
      rawOptions.onProgress,
    );
    partition.cells = undefined;
    let round = 0;
    while (runs.length > 1) {
      const next = [];
      for (let i = 0; i < runs.length; i += fanIn) {
        const group = runs.slice(i, i + fanIn);
        next.push(
          group.length === 1
            ? group[0]
            : await mergeRuns(
                group,
                path.join(directory, `merge-${round}-${i}.bin`),
                partition.recordBytes,
                owner,
                rawOptions.onProgress &&
                  ((progress) =>
                    rawOptions.onProgress({
                      stage: "partition-merge",
                      round,
                      group: Math.floor(i / fanIn) + 1,
                      groups: Math.ceil(runs.length / fanIn),
                      ...progress,
                    })),
              ),
        );
        rawOptions.onProgress?.({
          stage: "partition-merge",
          round,
          completedRuns: Math.min(i + fanIn, runs.length),
          totalRuns: runs.length,
        });
      }
      runs = next;
      round++;
    }
    partition.spoolPath = runs[0].name;
    partition.plan = {
      totalRecordBytes: owner.bytes,
      peakBytes: owner.peakBytes,
      runSplats,
      fanIn,
      mergeRounds: round,
    };
    partition.blocks = partition.chunks;
    return partition;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

/** Sequential parts keep the original source ID and stable Morton ordering. */
export async function* streamDiskPartition(partition, options = {}) {
  let file;
  try {
    options.onSpoolCreated?.(partition.directory, partition.plan);
    file = await open(partition.spoolPath, "r");
    const stride = partition.recordBytes;
    const capacity = Math.max(1, Math.floor(IO_BYTES / stride));
    const bytes = Buffer.allocUnsafe(capacity * stride);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
    for (const block of partition.blocks) {
      const raw = createRawGaussianBlock(
        block.count,
        partition.schema.shCoefficientCount,
      );
      for (let start = 0; start < block.count; start += capacity) {
        const count = Math.min(capacity, block.count - start);
        await readFully(file, bytes.subarray(0, count * stride));
        for (let i = 0; i < count; i++) {
          readRawRecord(
            raw,
            view,
            i * stride + KEY_BYTES,
            start + i,
            raw.shCount,
          );
          raw.stableId[start + i] = view.getUint32((i + 1) * stride - 4, true);
        }
      }
      yield raw;
    }
  } finally {
    await file?.close();
    await rm(partition.directory, { recursive: true, force: true });
    options.onSpoolRemoved?.(partition.directory);
  }
}

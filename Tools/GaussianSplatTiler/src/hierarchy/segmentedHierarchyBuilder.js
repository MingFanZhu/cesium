import { validateSegmentedProductStructure } from "./segmentedProductValidator.js";
import { Buffer } from "node:buffer";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  decodePlyGaussianBlock,
  gaussianSetTransferList,
} from "../io/gaussian/index.js";
import { PACK_KIND } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import {
  MACRO_CHUNK_SOURCE_UNIT_ID,
  MACRO_CHUNK_TRANSFORM_CONTRACT_ID,
  validateMacroChunkMetersPerUnit,
  validateMacroChunkRigidTransform,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianManifest.js";

import { emptyBounds, unionBounds } from "../bounds.js";
import {
  CHUNK_REDUCTION_TASK_KIND,
  dispatchChunkReductionTask,
} from "../chunkReduction.js";
import { ChunkReductionPool } from "../chunkReductionPool.js";
import { createEncodedPageSpool } from "../encodedPageSpool.js";
import {
  partitionPlyToDisk,
  streamDiskPartition,
} from "../segmentedDiskPartition.js";
import { normalizeSegmentedBuilderOptions } from "../segmentedPartition.js";
import { collectPlyCoordinateComments } from "../io/ply/coordinateComments.js";
import { writePayloadPacks } from "../packing.js";

import { sha256FileBounded } from "../sourceHash.js";
import {
  createSegmentedHierarchyProductSections,
  decodeAndValidateSegmentedHierarchyProductInventory,
  encodeSegmentedHierarchyProductInventory,
  sha256Bytes,
} from "./segmentedHierarchyInventory.js";
import {
  composeConstantLeafRepresentation,
  planHalfRateSegmentCount,
  planSegmentedHierarchyCounts,
} from "./segmentedProxyReducer.js";
import {
  PROXY_SEED_FILE_HEADER_BYTES,
  PROXY_SEED_INVALID_NODE_INDEX,
  createProxySeedSpool,
} from "./proxySeedSpool.js";
import { INVALID_NODE_INDEX } from "./sparseHierarchy.js";
import { planSparseFixedGrid3dHierarchy } from "./sparseHierarchy3d.js";
import {
  VISUAL_ERROR_BIN_COUNT,
  DYADIC_VISUAL_ERROR_METHOD,
  applyVisualErrorMonotonicEnvelope,
  mergeVisualErrorHistograms,
  rebaseDyadicVisualErrorHistogram,
} from "./visualErrorHistogram.js";
import {
  g2ProductPolicySha256,
  boundsFromEncodedCorePages,
  deterministicSum,
  resolveG2ProductPolicySha256,
  writeCanonicalProductManifest,
} from "./segmentedHierarchyProductArtifact.js";

const MODE = "package-internal-product-artifact";
const STAGE = "T3B-SCALE-1F-G2";
const UNRESOLVED_SEED_OFFSET = (1n << 64n) - 1n;

function popcount8(mask) {
  let count = 0;
  for (let ordinal = 0; ordinal < 8; ordinal++) {
    count += (mask >> ordinal) & 1;
  }
  return count;
}

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function checkedProductCoordinateOptions(options) {
  validateMacroChunkMetersPerUnit(options.metersPerUnit);
  validateMacroChunkRigidTransform(options.localToFixed);
}

function mergeBounds(records, field) {
  const result = emptyBounds();
  for (const record of records) {
    unionBounds(result, record[field]);
  }
  return result;
}

function partPayload(part, logicalLevel) {
  const payloadId = part.levels[logicalLevel].payloadId;
  return part.payloadById.get(payloadId);
}

function signatureForLevel(parts, logicalLevel) {
  return parts
    .map((part, partIndex) => {
      const payload = partPayload(part, logicalLevel);
      return `${partIndex}:${payload.generatedLevel}`;
    })
    .join("|");
}

function nodePrefix(hierarchy, nodeIndex) {
  return (
    (BigInt(hierarchy.nodePrefixHigh[nodeIndex]) << 32n) |
    BigInt(hierarchy.nodePrefixLow[nodeIndex])
  );
}

function nodeOrigin(hierarchy, nodeIndex, fixedGridOrigin, cellSizeMeters) {
  const depth = hierarchy.nodeDepth[nodeIndex];
  const prefix = nodePrefix(hierarchy, nodeIndex);
  const relative = [0, 0, 0];
  for (let level = 0; level < depth; level++) {
    const shift = BigInt((depth - level - 1) * 3);
    const code = Number((prefix >> shift) & 7n);
    for (let component = 0; component < 3; component++) {
      relative[component] = relative[component] * 2 + ((code >> component) & 1);
    }
  }
  const cellSizeTiles = hierarchy.root.sizeTiles / 2 ** depth;
  return Object.freeze(
    [0, 1, 2].map(
      (component) =>
        fixedGridOrigin[component] +
        (hierarchy.root[
          component === 0 ? "tileX" : component === 1 ? "tileY" : "tileZ"
        ] +
          relative[component] * cellSizeTiles +
          cellSizeTiles / 2) *
          cellSizeMeters[component],
    ),
  );
}

function nodeCellBounds(hierarchy, nodeIndex, fixedGridOrigin, cellSizeMeters) {
  const center = nodeOrigin(
    hierarchy,
    nodeIndex,
    fixedGridOrigin,
    cellSizeMeters,
  );
  const sizeTiles =
    hierarchy.root.sizeTiles / 2 ** hierarchy.nodeDepth[nodeIndex];
  return Object.freeze(
    [0, 1, 2, 0, 1, 2].map((component, index) => {
      const axis = component;
      const halfExtent = (sizeTiles * cellSizeMeters[axis]) / 2;
      return center[axis] + (index < 3 ? -halfExtent : halfExtent);
    }),
  );
}

function createExecutor(workerCount) {
  const pool =
    workerCount > 1 ? new ChunkReductionPool(workerCount) : undefined;
  let active = 0;
  let maximumConcurrentTasks = 0;
  let workerBusyMilliseconds = 0;
  return Object.freeze({
    async run(task, transferList = []) {
      const started = performance.now();
      active++;
      maximumConcurrentTasks = Math.max(maximumConcurrentTasks, active);
      try {
        return await (pool
          ? pool.run(task, transferList)
          : dispatchChunkReductionTask(task));
      } finally {
        active--;
        workerBusyMilliseconds += performance.now() - started;
      }
    },
    async destroy() {
      await pool?.destroy();
    },
    metrics() {
      return Object.freeze({
        workerBusyMilliseconds,
        maximumConcurrentTasks,
      });
    },
  });
}

function createRssSampler(periodMilliseconds = 50) {
  let sampledPeakRssBytes = 0;
  let rssSampleCount = 0;
  function sample() {
    sampledPeakRssBytes = Math.max(
      sampledPeakRssBytes,
      process.memoryUsage().rss,
    );
    rssSampleCount++;
  }
  sample();
  const timer = setInterval(sample, periodMilliseconds);
  timer.unref();
  return Object.freeze({
    sample,
    stop() {
      clearInterval(timer);
      sample();
      return Object.freeze({
        sampledPeakRssBytes,
        rssSampleCount,
        rssSamplePeriodMilliseconds: periodMilliseconds,
      });
    },
  });
}

function taskDelay(rawOptions, key) {
  const value = rawOptions.taskDelayMilliseconds?.(key) ?? 0;
  if (!Number.isInteger(value) || value < 0 || value > 10000) {
    throw new RangeError("taskDelayMilliseconds must return [0, 10000]");
  }
  return value;
}

async function injection(rawOptions, point) {
  await rawOptions.onInjectionPoint?.(point);
  if (rawOptions.failureInjectionPoint === point) {
    throw new Error(`Injected A3 failure at ${point}`);
  }
}

async function appendEncodedPages(spool, payload) {
  const records = [];
  for (const page of payload.encodedPages) {
    records.push(await spool.append(page));
  }
  return records;
}

function seedTransferList(task) {
  const buffers = new Set();
  for (const child of task.childRepresentations) {
    for (const value of Object.values(child.seed)) {
      if (ArrayBuffer.isView(value)) {
        buffers.add(value.buffer);
      }
    }
  }
  return [...buffers];
}

function pageSectionBytes(sections) {
  return Object.fromEntries(
    sections.map((section) => [section.kind, section.data.byteLength]),
  );
}

export async function validateSegmentedHierarchyProductArtifact(
  directory,
  options = {},
) {
  const policy = await resolveG2ProductPolicySha256(
    directory,
    options.expectedPolicySha256,
  );
  return validateSegmentedProductStructure(directory, {
    ...options,
    expectedPolicySha256: policy,
  });
}

export async function buildSegmentedHierarchyProductArtifact(
  input,
  outputDirectory,
  rawOptions = {},
) {
  const started = Date.now();
  const rssSampler = createRssSampler();
  let rssMetrics;
  const target = path.resolve(outputDirectory);
  if (await exists(target)) {
    throw new Error("SCALE-1A product artifact target already exists");
  }
  const options = normalizeSegmentedBuilderOptions(rawOptions);
  checkedProductCoordinateOptions(options);
  const targetParent = path.dirname(target);
  await mkdir(targetParent, { recursive: true });
  const staging = await mkdtemp(
    path.join(targetParent, `.${path.basename(target)}.a4-staging-`),
  );
  const temporaryDirectory = path.resolve(
    rawOptions.temporaryDirectory ?? targetParent,
  );
  let executor;
  let seedSpool;
  let pageSpool;
  let published = false;
  let rawSpoolDirectory;
  let rawSourceSpoolBytes;
  let activeRawSpoolBytes = 0;
  let temporaryDiskPeakBytes = 0;
  let peakInFlight = 0;
  let leafTaskCount = 0;
  let hierarchyTaskCount = 0;
  function sampleTemporaryDisk(extraStagedBytes = 0) {
    temporaryDiskPeakBytes = Math.max(
      temporaryDiskPeakBytes,
      activeRawSpoolBytes +
        (seedSpool?.byteLength ?? 0) +
        (pageSpool?.byteLength ?? 0) +
        extraStagedBytes,
    );
    rssSampler.sample();
  }
  try {
    await injection(rawOptions, "after-staging");
    await mkdir(temporaryDirectory, { recursive: true });
    let sourceCoordinateComments;
    const partition = await partitionPlyToDisk(input, {
      ...rawOptions,
      temporaryDirectory,
      async onHeaderValidated(context) {
        sourceCoordinateComments = collectPlyCoordinateComments([
          context.header,
        ]);
        await rawOptions.onHeaderValidated?.(context);
      },
    });
    rawSpoolDirectory = partition.directory;
    rawSourceSpoolBytes = partition.plan.totalRecordBytes;
    activeRawSpoolBytes = rawSourceSpoolBytes;
    temporaryDiskPeakBytes = partition.plan.peakBytes;
    executor = createExecutor(options.workers);
    pageSpool = await createEncodedPageSpool({ temporaryDirectory });
    seedSpool = await createProxySeedSpool({
      temporaryDirectory,
      shCount: partition.schema.shCoefficientCount,
    });

    const logicalLeaves = [];
    const unfinishedLeaves = new Map();
    async function finishTile(currentTile) {
      if (!currentTile) {
        return;
      }
      const parts = currentTile.parts.sort(
        (a, b) => a.sourcePartIndex - b.sourcePartIndex,
      );
      if (parts.length > 0) {
        for (const part of parts) {
          if (part.seedRecord) {
            part.coarsestSeed = (await seedSpool.read(part.seedRecord)).seed;
            delete part.seedRecord;
          }
        }
        const origin = [0, 1, 2].map(
          (component) =>
            (currentTile.cellBounds[component] +
              currentTile.cellBounds[component + 3]) /
            2,
        );
        const composed = composeConstantLeafRepresentation({
          representationId: 0,
          ownerNodeIndex: 0,
          logicalLevel: 6,
          origin,
          parts: parts.map((part, partIndex) => ({
            partIndex,
            seed: part.coarsestSeed,
          })),
        });
        // Share one domain across every part and LOD of this logical leaf.
        // Nested power-of-two bins allow bounded rebinning of completed work.
        let visualErrorUpperBound = 0;
        for (const part of parts) {
          for (const payload of part.payloadById.values()) {
            visualErrorUpperBound = Math.max(
              visualErrorUpperBound,
              payload.visualErrorHistogram.upperBound,
            );
          }
        }
        for (const part of parts) {
          for (const payload of part.payloadById.values()) {
            payload.visualErrorHistogram = rebaseDyadicVisualErrorHistogram(
              payload.visualErrorHistogram,
              visualErrorUpperBound,
            );
          }
        }
        const visualErrorByLevel = applyVisualErrorMonotonicEnvelope(
          Array.from({ length: 7 }, (_, logicalLevel) => {
            const merged = mergeVisualErrorHistograms(
              parts.map(
                (part) => partPayload(part, logicalLevel).visualErrorHistogram,
              ),
            );
            let maximum = 0;
            for (const part of parts) {
              const error = partPayload(part, logicalLevel).error;
              maximum = Math.max(
                maximum,
                Math.sqrt(3) * error.maximumPosition +
                  2 * Math.sqrt(3 * error.maximumCovariance),
              );
            }
            return Object.freeze({
              maximum,
              p95: Math.min(merged.p95, maximum),
              p99: Math.min(merged.p99, maximum),
            });
          }),
        );
        for (const part of parts) {
          for (const payload of part.payloadById.values()) {
            delete payload.visualErrorHistogram;
          }
        }
        const scratchRecord = await seedSpool.append(composed.seed, {
          nodeIndex: PROXY_SEED_INVALID_NODE_INDEX,
          // This scalar must carry the same LOD envelope into the leaf node
          // and its parent reductions, including coarsest snapshot roundoff.
          geometricError: Math.max(
            composed.geometricError,
            visualErrorByLevel[6].maximum,
          ),
        });
        sampleTemporaryDisk();
        await injection(rawOptions, "after-leaf-seed-append");
        const retainedParts = parts.map((part) => ({
          sourcePartIndex: part.sourcePartIndex,
          retainedCount: part.retainedCount,
          levels: part.levels,
          selectionBounds: part.selectionBounds,
          strictBounds: part.strictBounds,
          payloadById: part.payloadById,
        }));
        const retainedLeaf = {
          tileX: currentTile.tileX,
          tileY: currentTile.tileY,
          tileZ: currentTile.tileZ,
          cellBounds: currentTile.cellBounds,
          origin,
          parts: retainedParts,
          scratchRecord,
          strictBounds: mergeBounds(retainedParts, "strictBounds"),
          selectionBounds: mergeBounds(retainedParts, "selectionBounds"),
          visualErrorByLevel,
        };
        for (const part of retainedLeaf.parts) {
          if (part.coarsestSeed || part.result) {
            throw new Error(
              "A3 retained leaf still owns Worker seed/result backing",
            );
          }
          for (const payload of part.payloadById.values()) {
            if (payload.encodedPages.some((page) => page.bytes !== undefined)) {
              throw new Error("A3 retained leaf still owns encoded Page bytes");
            }
          }
        }
        rawOptions.onLeafBackingReleased?.(
          Object.freeze({
            partCount: retainedLeaf.parts.length,
            workerResultCount: 0,
            encodedPageByteBufferCount: 0,
            coarsestSeedBackingCount: 0,
          }),
        );
        logicalLeaves.push(retainedLeaf);
      }
    }

    const pending = new Map();
    let activeLeafSourceSplats = 0,
      peakActiveLeafSourceSplats = 0;
    let sourceOrdinal = 0;
    async function commitLeaf(entry) {
      const { chunk, retainedCount, result } = entry;
      const tile = chunk.logicalTile;
      const key = `${tile.tileZ}:${tile.tileY}:${tile.tileX}`;
      let currentTile = unfinishedLeaves.get(key);
      if (!currentTile) {
        currentTile = {
          tileX: tile.tileX,
          tileY: tile.tileY,
          tileZ: tile.tileZ,
          cellBounds: chunk.cellBounds,
          parts: [],
          remainingParts: tile.partCount,
        };
        unfinishedLeaves.set(key, currentTile);
      }
      if (retainedCount > 0) {
        const payloadById = new Map();
        for (const payload of result.chunkPayloads) {
          const encodedBounds = boundsFromEncodedCorePages(
            payload.encodedPages,
            result.origin,
          );
          payloadById.set(payload.payloadId, {
            payloadId: payload.payloadId,
            generatedLevel: payload.generatedLevel,
            splatCount: payload.splatCount,
            representedSourceCount: payload.representedSourceCount,
            bounds: payload.bounds,
            error: payload.error,
            coverageMass: payload.coverage.totalMass,
            visualErrorHistogram: payload.visualErrorHistogram,
            encodedBounds,
            encodedPages: await appendEncodedPages(pageSpool, payload),
          });
          sampleTemporaryDisk();
        }
        currentTile.parts.push({
          sourcePartIndex: tile.partIndex,
          retainedCount,
          levels: result.levels.map((level) => ({
            payloadId: level.payloadId,
          })),
          // Completed multi-part leaves retain only spool records while another
          // part is running. Completion order never owns final Page/Asset order.
          ...(tile.partCount === 1
            ? { coarsestSeed: result.coarsestSeed }
            : {
                seedRecord: await seedSpool.append(result.coarsestSeed),
              }),
          selectionBounds: result.selectionBounds,
          strictBounds: result.strictBounds,
          payloadById,
        });
      }
      currentTile.remainingParts--;
      if (currentTile.remainingParts === 0) {
        await finishTile(currentTile);
        unfinishedLeaves.delete(key);
      }
      sampleTemporaryDisk();
      rawOptions.onLeafTaskCompleted?.({
        sourceOrdinal: entry.sourceOrdinal,
        retainedCount,
      });
    }
    async function settleLeafTask() {
      if (pending.size === 0) {
        return;
      }
      const settled = await Promise.race(pending.values());
      pending.delete(settled.entry.sourceOrdinal);
      activeLeafSourceSplats -= settled.entry.chunk.count;
      if (settled.error) {
        throw settled.error;
      }
      await commitLeaf({ ...settled.entry, result: settled.result });
    }

    for await (const raw of streamDiskPartition(partition, {
      onSpoolCreated(directory, plan) {
        rawSpoolDirectory = directory;
        rawSourceSpoolBytes = plan.totalRecordBytes;
        activeRawSpoolBytes = plan.totalRecordBytes;
        sampleTemporaryDisk();
        rawOptions.onRawSpoolCreated?.(directory, plan);
      },
      onSpoolRemoved(directory) {
        rawSpoolDirectory = undefined;
        activeRawSpoolBytes = 0;
        sampleTemporaryDisk();
        rawOptions.onRawSpoolRemoved?.(directory);
      },
    })) {
      const chunk = partition.chunks[sourceOrdinal];
      while (
        pending.size &&
        activeLeafSourceSplats + chunk.count > options.maximumInFlightLeafSplats
      ) {
        await settleLeafTask();
      }
      const decoded = decodePlyGaussianBlock(raw);
      let promise;
      if (decoded.data.count === 0) {
        promise = Promise.resolve(undefined);
      } else {
        const task = {
          kind: CHUNK_REDUCTION_TASK_KIND.SEGMENTED_LEAF_V1,
          sourceChunk: chunk,
          data: decoded.data,
          testDelayMilliseconds: taskDelay(rawOptions, `leaf:${sourceOrdinal}`),
        };
        leafTaskCount++;
        promise = executor.run(task, gaussianSetTransferList(decoded.data));
      }
      const entry = { chunk, sourceOrdinal, retainedCount: decoded.data.count };
      activeLeafSourceSplats += chunk.count;
      peakActiveLeafSourceSplats = Math.max(
        peakActiveLeafSourceSplats,
        activeLeafSourceSplats,
      );
      // Observe every rejection immediately, including while committing another
      // completion to disk. At most workers task results can remain in memory.
      pending.set(
        sourceOrdinal,
        promise.then(
          (result) => ({ entry, result }),
          (error) => ({ entry, error }),
        ),
      );
      peakInFlight = Math.max(peakInFlight, pending.size);
      rawOptions.onLeafTaskDispatched?.({
        sourceOrdinal,
        retainedCount: decoded.data.count,
        activeLeafSourceSplats,
      });
      sourceOrdinal++;
      if (pending.size === options.workers) {
        await settleLeafTask();
      }
    }
    while (pending.size) {
      await settleLeafTask();
    }
    if (unfinishedLeaves.size) {
      throw new Error("Leaf reduction left incomplete physical parts");
    }
    await injection(rawOptions, "after-leaf-reduction");
    if (logicalLeaves.length === 0) {
      throw new Error("All input Gaussian records were filtered");
    }

    const hierarchy = planSparseFixedGrid3dHierarchy({
      tileX: Int32Array.from(logicalLeaves.map((leaf) => leaf.tileX)),
      tileY: Int32Array.from(logicalLeaves.map((leaf) => leaf.tileY)),
      tileZ: Int32Array.from(logicalLeaves.map((leaf) => leaf.tileZ)),
      physicalPartCount: Uint32Array.from(
        logicalLeaves.map((leaf) => leaf.parts.length),
      ),
    });
    let canonicalLeafRecords = await seedSpool.canonicalizeLeaves(
      Array.from({ length: hierarchy.leafCount }, (_, leafOrdinal) => ({
        record:
          logicalLeaves[hierarchy.sourceLeafIndex[leafOrdinal]].scratchRecord,
        nodeIndex: hierarchy.leafNodeIndex[leafOrdinal],
      })),
      { compactPartScratch: true },
    );
    sampleTemporaryDisk();
    await injection(rawOptions, "after-leaf-canonicalization");

    const nodeSeedOffset = new BigUint64Array(hierarchy.nodeCount);
    const nodeSeedByteLength = new BigUint64Array(hierarchy.nodeCount);
    nodeSeedOffset.fill(UNRESOLVED_SEED_OFFSET);
    nodeSeedByteLength.fill(UNRESOLVED_SEED_OFFSET);
    function seedReady(nodeIndex) {
      const hasOffset = nodeSeedOffset[nodeIndex] !== UNRESOLVED_SEED_OFFSET;
      const hasLength =
        nodeSeedByteLength[nodeIndex] !== UNRESOLVED_SEED_OFFSET;
      if (hasOffset !== hasLength) {
        throw new Error(`A3 partial ProxySeed authority for Node ${nodeIndex}`);
      }
      return hasOffset;
    }
    function publishSeedRecord(nodeIndex, record) {
      if (seedReady(nodeIndex)) {
        throw new Error(`A3 duplicate ProxySeed write for Node ${nodeIndex}`);
      }
      nodeSeedOffset[nodeIndex] = record.offset;
      nodeSeedByteLength[nodeIndex] = record.byteLength;
    }
    async function readNodeSeed(nodeIndex) {
      if (!seedReady(nodeIndex)) {
        throw new Error(`A3 missing ProxySeed for Node ${nodeIndex}`);
      }
      return seedSpool.read(
        {
          offset: nodeSeedOffset[nodeIndex],
          byteLength: nodeSeedByteLength[nodeIndex],
          nodeIndex,
        },
        nodeIndex,
      );
    }
    const nodeSeedCounts = new Uint32Array(hierarchy.nodeCount);
    const nodeBounds = new Array(hierarchy.nodeCount);
    const originBounds = new Array(hierarchy.nodeCount);
    const leafBounds = new Array(hierarchy.leafCount);
    const canonicalLeaves = new Array(hierarchy.leafCount);
    for (
      let leafOrdinal = 0;
      leafOrdinal < hierarchy.leafCount;
      leafOrdinal++
    ) {
      const nodeIndex = hierarchy.leafNodeIndex[leafOrdinal];
      const leaf = logicalLeaves[hierarchy.sourceLeafIndex[leafOrdinal]];
      const record = canonicalLeafRecords[leafOrdinal];
      publishSeedRecord(nodeIndex, record);
      leaf.scratchRecord = undefined;
      originBounds[nodeIndex] = leaf.strictBounds;
      canonicalLeaves[leafOrdinal] = leaf;
    }
    canonicalLeafRecords = undefined;

    const representations = [];
    const segments = [];
    const assets = [];
    const leafLevelRepresentations = new Uint32Array(hierarchy.leafCount * 7);
    const nodeRepresentationId = new Uint32Array(hierarchy.nodeCount);
    const nodeProxies = new Array(hierarchy.nodeCount);

    for (
      let leafOrdinal = 0;
      leafOrdinal < hierarchy.leafCount;
      leafOrdinal++
    ) {
      const leaf = canonicalLeaves[leafOrdinal];
      const nodeIndex = hierarchy.leafNodeIndex[leafOrdinal];
      let previousSignature;
      let representationId;
      for (let logicalLevel = 0; logicalLevel < 7; logicalLevel++) {
        const signature = signatureForLevel(leaf.parts, logicalLevel);
        if (signature !== previousSignature) {
          representationId = representations.length;
          const firstAsset = assets.length;
          let representationStart = 0;
          let representedSourceCount = 0n;
          const geometricError = leaf.visualErrorByLevel[logicalLevel].maximum;
          const representationCoverageMasses = [];
          for (let partIndex = 0; partIndex < leaf.parts.length; partIndex++) {
            const payload = partPayload(leaf.parts[partIndex], logicalLevel);
            const assetId = assets.length;
            assets.push({
              assetId,
              payloadId: `a${assetId}`,
              representationId,
              representationStart,
              splatCount: payload.splatCount,
              partIndex,
              contentBounds: payload.encodedBounds.strictBounds,
              positionBounds: payload.encodedBounds.positionBounds,
              coverageMass: payload.coverageMass,
              encodedPages: payload.encodedPages.map((page) => ({
                ...page,
                payloadId: `a${assetId}`,
              })),
            });
            representationStart += payload.splatCount;
            representedSourceCount += BigInt(payload.representedSourceCount);
            representationCoverageMasses.push(payload.coverageMass);
          }
          representations.push({
            representationId,
            ownerNodeIndex: nodeIndex,
            logicalLevel,
            firstSegment: INVALID_NODE_INDEX,
            segmentCount: 0,
            firstAsset,
            assetCount: assets.length - firstAsset,
            splatCount: representationStart,
            mode: "CONSTANT_LEAF",
            representedSourceCount,
            geometricError,
            coverageWeightedP95Error: leaf.visualErrorByLevel[logicalLevel].p95,
            coverageWeightedP99Error: leaf.visualErrorByLevel[logicalLevel].p99,
            origin: leaf.origin,
            coverageMass: deterministicSum(
              representationCoverageMasses,
              `leaf Representation ${representationId} coverage`,
            ),
          });
          previousSignature = signature;
        }
        leafLevelRepresentations[leafOrdinal * 7 + logicalLevel] =
          representationId;
      }
      nodeRepresentationId[nodeIndex] = representationId;
      const decodedSeed = await readNodeSeed(nodeIndex);
      nodeProxies[nodeIndex] = {
        representationId,
        representedSourceCount: decodedSeed.seed.representedSourceCount,
        geometricError: decodedSeed.geometricError,
        coverageWeightedP95Error:
          representations[representationId].coverageWeightedP95Error,
        coverageWeightedP99Error:
          representations[representationId].coverageWeightedP99Error,
        coverageMass: representations[representationId].coverageMass,
      };
      nodeSeedCounts[nodeIndex] = decodedSeed.seed.count;
      representations[representationId] = {
        ...representations[representationId],
        splatCount: decodedSeed.seed.count,
        representedSourceCount: decodedSeed.seed.representedSourceCount,
        geometricError: decodedSeed.geometricError,
        origin: decodedSeed.seed.origin,
      };
    }

    for (
      let leafOrdinal = 0;
      leafOrdinal < hierarchy.leafCount;
      leafOrdinal++
    ) {
      const distinctRepresentations = new Set(
        leafLevelRepresentations.subarray(leafOrdinal * 7, leafOrdinal * 7 + 7),
      );
      const strictRecords = [];
      for (const representationId of distinctRepresentations) {
        const representation = representations[representationId];
        for (
          let assetId = representation.firstAsset;
          assetId < representation.firstAsset + representation.assetCount;
          assetId++
        ) {
          strictRecords.push({ bounds: assets[assetId].contentBounds });
        }
      }
      const finestRepresentation =
        representations[leafLevelRepresentations[leafOrdinal * 7]];
      const positionRecords = [];
      for (
        let assetId = finestRepresentation.firstAsset;
        assetId <
        finestRepresentation.firstAsset + finestRepresentation.assetCount;
        assetId++
      ) {
        positionRecords.push({ bounds: assets[assetId].positionBounds });
      }
      const strictBounds = mergeBounds(strictRecords, "bounds");
      leafBounds[leafOrdinal] = {
        selectionBounds: mergeBounds(positionRecords, "bounds"),
        strictBounds,
      };
      nodeBounds[hierarchy.leafNodeIndex[leafOrdinal]] = strictBounds;
    }
    for (let nodeIndex = hierarchy.nodeCount - 1; nodeIndex >= 0; nodeIndex--) {
      if (originBounds[nodeIndex]) {
        continue;
      }
      const firstChild = hierarchy.nodeFirstChild[nodeIndex];
      const childCount = popcount8(hierarchy.nodeChildMask[nodeIndex]);
      originBounds[nodeIndex] = mergeBounds(
        Array.from({ length: childCount }, (_, ordinal) => ({
          bounds: originBounds[firstChild + ordinal],
        })),
        "bounds",
      );
    }
    const origins = originBounds.map((bounds, nodeIndex) => {
      if (hierarchy.nodeChildMask[nodeIndex] === 0) {
        return canonicalLeaves[hierarchy.nodeFirstLeaf[nodeIndex]].origin;
      }
      return nodeOrigin(
        hierarchy,
        nodeIndex,
        options.fixedGridOrigin,
        options.cellSizeMeters,
      );
    });
    const rootOrigin = origins[0];

    const internalPostorder = [];
    for (let nodeIndex = hierarchy.nodeCount - 1; nodeIndex >= 0; nodeIndex--) {
      if (hierarchy.nodeChildMask[nodeIndex] !== 0) {
        internalPostorder.push(nodeIndex);
        nodeRepresentationId[nodeIndex] = representations.length;
        representations.push(undefined);
      }
    }
    const firstSegmentByNode = new Uint32Array(hierarchy.nodeCount);
    let segmentCursor = 0;
    for (const nodeIndex of internalPostorder) {
      firstSegmentByNode[nodeIndex] = segmentCursor;
      segmentCursor += popcount8(hierarchy.nodeChildMask[nodeIndex]);
    }
    if (segmentCursor !== hierarchy.edgeCount) {
      throw new Error("A3 Segment preassignment does not equal edgeCount");
    }

    let postorderCursor = 0;
    while (postorderCursor < internalPostorder.length) {
      const window = [];
      for (
        let candidate = postorderCursor;
        candidate < internalPostorder.length && window.length < options.workers;
        candidate++
      ) {
        const nodeIndex = internalPostorder[candidate];
        const firstChild = hierarchy.nodeFirstChild[nodeIndex];
        const childCount = popcount8(hierarchy.nodeChildMask[nodeIndex]);
        const ready = Array.from({ length: childCount }, (_, ordinal) =>
          seedReady(firstChild + ordinal),
        ).every(Boolean);
        if (!ready) {
          break;
        }
        const childRepresentations = [];
        for (let ordinal = 0; ordinal < childCount; ordinal++) {
          const childNodeIndex = firstChild + ordinal;
          const decodedSeed = await readNodeSeed(childNodeIndex);
          const childPlan =
            representations[nodeRepresentationId[childNodeIndex]];
          childRepresentations.push({
            representationId: childPlan.representationId,
            ownerNodeIndex: childNodeIndex,
            mode: childPlan.mode,
            logicalLevel: childPlan.logicalLevel,
            origin: decodedSeed.seed.origin,
            firstSegment: childPlan.firstSegment,
            segmentCount: childPlan.segmentCount,
            splatCount: decodedSeed.seed.count,
            representedSourceCount: decodedSeed.seed.representedSourceCount,
            geometricError: decodedSeed.geometricError,
            expectedTargetCount: planHalfRateSegmentCount(
              decodedSeed.seed.count,
            ),
            seed: decodedSeed.seed,
          });
        }
        const task = {
          kind: CHUNK_REDUCTION_TASK_KIND.SEGMENTED_PARENT_V1,
          representationId: nodeRepresentationId[nodeIndex],
          ownerNodeIndex: nodeIndex,
          firstSegmentId: firstSegmentByNode[nodeIndex],
          parentOrigin: origins[nodeIndex],
          expectedChildNodeIndices: childRepresentations.map(
            (child) => child.ownerNodeIndex,
          ),
          childRepresentations,
          ownerBounds: nodeCellBounds(
            hierarchy,
            nodeIndex,
            options.fixedGridOrigin,
            options.cellSizeMeters,
          ),
          maximumAssetSplats: options.maximumChunkSplats,
          testDelayMilliseconds: taskDelay(rawOptions, `parent:${nodeIndex}`),
        };
        hierarchyTaskCount++;
        window.push({
          nodeIndex,
          expectedTargetCounts: childRepresentations.map(
            (child) => child.expectedTargetCount,
          ),
          promise: executor.run(
            task,
            options.workers > 1 ? seedTransferList(task) : [],
          ),
        });
      }
      if (window.length === 0) {
        throw new Error("A3 hierarchy window encountered unresolved children");
      }
      peakInFlight = Math.max(peakInFlight, window.length);
      const results = await Promise.all(window.map((entry) => entry.promise));
      for (let index = 0; index < window.length; index++) {
        const nodeIndex = window[index].nodeIndex;
        const result = results[index];
        const expectedTargetCounts = window[index].expectedTargetCounts;
        if (
          result.segments.length !== expectedTargetCounts.length ||
          result.segments.some(
            (segment, ordinal) =>
              segment.rangeCount !== expectedTargetCounts[ordinal],
          ) ||
          result.representation.splatCount !==
            expectedTargetCounts.reduce((sum, count) => sum + count, 0)
        ) {
          throw new Error(
            `A3 parent ${nodeIndex} expectedTargetCount commit mismatch`,
          );
        }
        await injection(rawOptions, "after-parent-reduction");
        const parentRepresentation = result.representation;
        const parentSeed = parentRepresentation.seed;
        const firstAsset = assets.length;
        for (const localAsset of result.assets) {
          const assetId = assets.length;
          const encodedBounds = boundsFromEncodedCorePages(
            localAsset.encodedPages,
            parentRepresentation.origin,
          );
          const encodedPages = [];
          for (const page of localAsset.encodedPages) {
            encodedPages.push(
              await pageSpool.append({ ...page, payloadId: `a${assetId}` }),
            );
          }
          sampleTemporaryDisk();
          assets.push({
            assetId,
            payloadId: `a${assetId}`,
            representationId: result.representation.representationId,
            representationStart: localAsset.representationStart,
            splatCount: localAsset.count,
            contentBounds: encodedBounds.strictBounds,
            positionBounds: encodedBounds.positionBounds,
            coverageMass: deterministicSum(
              parentSeed.coverageMass.subarray(
                localAsset.representationStart,
                localAsset.representationStart + localAsset.count,
              ),
              `internal Asset ${assetId} coverage`,
            ),
            encodedPages,
          });
          await injection(rawOptions, "after-parent-page-append");
        }
        const record = await seedSpool.append(parentSeed, {
          nodeIndex,
          geometricError: parentRepresentation.geometricError,
        });
        sampleTemporaryDisk();
        representations[parentRepresentation.representationId] = {
          representationId: parentRepresentation.representationId,
          ownerNodeIndex: parentRepresentation.ownerNodeIndex,
          mode: parentRepresentation.mode,
          logicalLevel: parentRepresentation.logicalLevel,
          origin: parentRepresentation.origin,
          firstSegment: parentRepresentation.firstSegment,
          segmentCount: parentRepresentation.segmentCount,
          splatCount: parentRepresentation.splatCount,
          representedSourceCount: parentRepresentation.representedSourceCount,
          geometricError: parentRepresentation.geometricError,
          coverageWeightedP95Error:
            parentRepresentation.coverageWeightedP95Error,
          coverageWeightedP99Error:
            parentRepresentation.coverageWeightedP99Error,
          coverageMass: deterministicSum(
            parentSeed.coverageMass,
            `internal Representation ${parentRepresentation.representationId} coverage`,
          ),
          firstAsset,
          assetCount: assets.length - firstAsset,
        };
        segments.push(
          ...result.segments.map((segment, ordinal) => ({
            ...segment,
            coverageMass:
              result.diagnostics.childReductions[ordinal].coverageMass.output,
          })),
        );
        publishSeedRecord(nodeIndex, record);
        nodeProxies[nodeIndex] = {
          representationId: parentRepresentation.representationId,
          representedSourceCount: parentRepresentation.representedSourceCount,
          geometricError: parentRepresentation.geometricError,
          coverageWeightedP95Error:
            parentRepresentation.coverageWeightedP95Error,
          coverageWeightedP99Error:
            parentRepresentation.coverageWeightedP99Error,
          coverageMass:
            representations[parentRepresentation.representationId].coverageMass,
        };
        nodeSeedCounts[nodeIndex] = parentRepresentation.splatCount;
      }
      postorderCursor += window.length;
    }

    const persistedInternalSeedBackingCount = representations.reduce(
      (count, representation) =>
        count + Number(Object.hasOwn(representation, "seed")),
      0,
    );
    if (persistedInternalSeedBackingCount !== 0) {
      throw new Error(
        "A3 persisted Representation still owns internal seed backing",
      );
    }
    rawOptions.onInternalSeedBackingReleased?.(
      Object.freeze({
        internalRepresentationCount: internalPostorder.length,
        persistedInternalSeedBackingCount,
      }),
    );

    for (let nodeIndex = hierarchy.nodeCount - 1; nodeIndex >= 0; nodeIndex--) {
      if (hierarchy.nodeChildMask[nodeIndex] === 0) {
        continue;
      }
      const firstChild = hierarchy.nodeFirstChild[nodeIndex];
      const childCount = popcount8(hierarchy.nodeChildMask[nodeIndex]);
      const representation = representations[nodeRepresentationId[nodeIndex]];
      const records = Array.from({ length: childCount }, (_, ordinal) => ({
        bounds: nodeBounds[firstChild + ordinal],
      }));
      for (
        let assetId = representation.firstAsset;
        assetId < representation.firstAsset + representation.assetCount;
        assetId++
      ) {
        records.push({ bounds: assets[assetId].contentBounds });
      }
      nodeBounds[nodeIndex] = mergeBounds(records, "bounds");
    }

    const leafSeedCounts = new Uint32Array(hierarchy.leafCount);
    for (
      let leafOrdinal = 0;
      leafOrdinal < hierarchy.leafCount;
      leafOrdinal++
    ) {
      const decoded = await readNodeSeed(hierarchy.leafNodeIndex[leafOrdinal]);
      leafSeedCounts[leafOrdinal] = decoded.seed.count;
    }
    const countProof = planSegmentedHierarchyCounts({
      hierarchy,
      leafSeedCounts,
    });
    let expectedSeedSpoolBytes = BigInt(PROXY_SEED_FILE_HEADER_BYTES);
    for (let nodeIndex = 0; nodeIndex < hierarchy.nodeCount; nodeIndex++) {
      if (
        nodeSeedOffset[nodeIndex] === UNRESOLVED_SEED_OFFSET ||
        nodeSeedByteLength[nodeIndex] === UNRESOLVED_SEED_OFFSET
      ) {
        throw new Error("A3 hierarchy contains an unresolved ProxySeed record");
      }
      expectedSeedSpoolBytes += nodeSeedByteLength[nodeIndex];
    }
    if (
      expectedSeedSpoolBytes !== BigInt(seedSpool.byteLength) ||
      seedSpool.peakBytes < seedSpool.byteLength
    ) {
      throw new Error("A3 ProxySeed spool byte accounting is inconsistent");
    }
    if (
      segments.length !== hierarchy.edgeCount ||
      assets.some((asset) => asset.splatCount > options.maximumChunkSplats)
    ) {
      throw new Error("A3 hierarchy inventory count invariant failed");
    }

    await injection(rawOptions, "before-packs");
    const packing = await writePayloadPacks(
      assets,
      partition.schema.maxShDegree,
      staging,
      options,
      pageSpool,
    );
    const completedPackBytes = packing.packs.reduce(
      (sum, pack) => sum + pack.fileBytes,
      0,
    );
    sampleTemporaryDisk(completedPackBytes);
    const assetIdByPayload = new Map(
      assets.map((asset) => [asset.payloadId, asset.assetId]),
    );
    const corePageIdsByAsset = Array.from({ length: assets.length }, () => []);
    const shPageIdsByAsset = Array.from({ length: assets.length }, () => []);
    const pages = packing.pages.map((page) => {
      const assetId = assetIdByPayload.get(page.payloadId);
      const ownerList = page.kind === 1 ? corePageIdsByAsset : shPageIdsByAsset;
      ownerList[assetId].push(page.pageIndex);
      return {
        ...page,
        assetId,
        assetStart: page.payloadStart,
      };
    });
    const assetPageIndices = [];
    for (const asset of assets) {
      const core = corePageIdsByAsset[asset.assetId];
      const sh = shPageIdsByAsset[asset.assetId];
      asset.corePageListFirst = assetPageIndices.length;
      asset.corePageListCount = core.length;
      assetPageIndices.push(...core);
      asset.shPageListFirst = assetPageIndices.length;
      asset.shPageListCount = sh.length;
      assetPageIndices.push(...sh);
    }

    const sourceShaHex = await sha256FileBounded(input);
    const sourceSha = Buffer.from(sourceShaHex, "hex");
    const productPolicySha = g2ProductPolicySha256(options.cellSizeMeters);
    const finestRepresentationIds = Array.from(
      { length: hierarchy.leafCount },
      (_, leafOrdinal) => leafLevelRepresentations[leafOrdinal * 7],
    );
    const retainedSplatCount = finestRepresentationIds.reduce(
      (sum, representationId) =>
        sum + representations[representationId].splatCount,
      0,
    );
    const sourceCoverageMass = deterministicSum(
      finestRepresentationIds.map(
        (representationId) => representations[representationId].coverageMass,
      ),
      "header source coverage",
    );
    const sections = createSegmentedHierarchyProductSections({
      hierarchy,
      rootOrigin,
      nodeBounds,
      nodeProxies,
      leafBounds,
      leafLevelRepresentations,
      representations,
      segments,
      assets,
      assetPageIndices: Uint32Array.from(assetPageIndices),
      pages,
      packs: packing.packs,
    });
    const mciBytes = encodeSegmentedHierarchyProductInventory({
      header: {
        dimension: 3,
        rootTileOrigin: [
          hierarchy.root.tileX,
          hierarchy.root.tileY,
          hierarchy.root.tileZ,
        ],
        rootSizeTiles: hierarchy.root.sizeTiles,
        rootDepth: hierarchy.root.depth,
        leafCount: hierarchy.leafCount,
        nodeCount: hierarchy.nodeCount,
        fixedGridOrigin: options.fixedGridOrigin,
        cellSizeMeters: options.cellSizeMeters,
        sourceSha256: sourceSha,
        policySha256: productPolicySha,
        coordinateSystem: options.coordinateSystem,
        maxShDegree: partition.schema.maxShDegree,
        maximumAssetSplats: options.maximumChunkSplats,
        maximumPackBytes: options.maxPackBytes,
        sourceVertexCount: partition.pointCount,
        retainedSplatCount,
        sourceCoverageMass,
        transformContractId: MACRO_CHUNK_TRANSFORM_CONTRACT_ID,
        sourceUnitId: MACRO_CHUNK_SOURCE_UNIT_ID,
        metersPerUnit: options.metersPerUnit,
        localOrigin: options.localOrigin,
        localToFixed: options.localToFixed,
        sourceBounds: partition.bounds,
      },
      sections,
    });
    await injection(rawOptions, "before-mci");
    await writeFile(path.join(staging, "scene.mci"), mciBytes);
    await injection(rawOptions, "after-mci");
    const decodedMci = decodeAndValidateSegmentedHierarchyProductInventory(
      mciBytes,
      {
        expectedSourceSha256: sourceSha,
        expectedPolicySha256: productPolicySha,
      },
    );
    const manifest = await writeCanonicalProductManifest(
      staging,
      mciBytes,
      decodedMci.checksum,
    );
    await injection(rawOptions, "after-manifest");
    sampleTemporaryDisk(
      completedPackBytes + mciBytes.byteLength + manifest.bytes,
    );
    await injection(rawOptions, "before-readback");
    const readback = await validateSegmentedHierarchyProductArtifact(staging, {
      expectedSourceSha256: sourceSha,
      expectedPolicySha256: productPolicySha,
      onDuringPackValidation: () =>
        injection(rawOptions, "during-pack-validation"),
    });
    await injection(rawOptions, "after-readback");
    if (readback.mciSha256 !== sha256Bytes(mciBytes)) {
      throw new Error("A4 independent MCI readback hash mismatch");
    }
    rssMetrics = rssSampler.stop();
    const executorMetrics = executor.metrics();
    const wallClockMilliseconds = Date.now() - started;
    const workerCapacityMilliseconds = wallClockMilliseconds * options.workers;
    const perLevel = Array.from({ length: 7 }, (_, logicalLevel) => {
      let splatCount = 0;
      const errors = [];
      const visualP95Errors = [];
      const visualP99Errors = [];
      for (
        let leafOrdinal = 0;
        leafOrdinal < hierarchy.leafCount;
        leafOrdinal++
      ) {
        const representationId =
          leafLevelRepresentations[leafOrdinal * 7 + logicalLevel];
        const representation = representations[representationId];
        splatCount += representation.splatCount;
        errors.push(representation.geometricError);
        visualP95Errors.push(representation.coverageWeightedP95Error);
        visualP99Errors.push(representation.coverageWeightedP99Error);
      }
      errors.sort((left, right) => left - right);
      visualP95Errors.sort((left, right) => left - right);
      visualP99Errors.sort((left, right) => left - right);
      const distribution = (values) => {
        const percentile = (fraction) =>
          values[Math.max(0, Math.ceil(values.length * fraction) - 1)];
        return Object.freeze({
          minimum: values[0],
          p50: percentile(0.5),
          p95: percentile(0.95),
          maximum: values[values.length - 1],
        });
      };
      return Object.freeze({
        logicalLevel,
        splatCount,
        geometricError: distribution(errors),
        coverageWeightedP95Error: distribution(visualP95Errors),
        coverageWeightedP99Error: distribution(visualP99Errors),
      });
    });
    const report = {
      stage: STAGE,
      mode: MODE,
      productArtifactAuthority: true,
      publicRuntimeAuthority: true,
      artifactRouteIdentity: "segmented-active-cut-v3",
      mciVersion: 4,
      rowSchema: 3,
      selectionErrorMetric: "COVERAGE_P99",
      visualErrorMethod: DYADIC_VISUAL_ERROR_METHOD,
      visualErrorBinCount: VISUAL_ERROR_BIN_COUNT,
      source: {
        sha256: sourceShaHex,
        comments: partition.header.comments,
        vertexCount: partition.pointCount,
        retainedSplatCount,
        coverageMass: sourceCoverageMass,
      },
      coordinate: {
        contract: MACRO_CHUNK_TRANSFORM_CONTRACT_ID,
        system: options.coordinateSystem,
        metersPerUnit: options.metersPerUnit,
        localOrigin: options.localOrigin,
        localToFixed: options.localToFixed,
        sourceComments: sourceCoordinateComments,
        note: "PLY CRS comments are provenance only; no projection conversion or datum inference.",
      },
      cellSizeMeters: options.cellSizeMeters,
      occupiedLeafCount: hierarchy.leafCount,
      occupiedZLayerCount: new Set(canonicalLeaves.map((leaf) => leaf.tileZ))
        .size,
      logicalLeafCount: hierarchy.leafCount,
      physicalLeafPartCount: canonicalLeaves.reduce(
        (sum, leaf) => sum + leaf.parts.length,
        0,
      ),
      coverageHoleCount: 0,
      coverageOverlapCount: 0,
      nodeCount: hierarchy.nodeCount,
      edgeCount: hierarchy.edgeCount,
      maximumDepth: hierarchy.maximumDepth,
      compressedUnaryLevelCount: hierarchy.compressedUnaryLevelCount,
      perDepth: [],
      perLevel,
      representationCount: representations.length,
      segmentCount: segments.length,
      assetCount: assets.length,
      pageCount: packing.pages.length,
      packCount: packing.packs.length,
      sectionBytes: pageSectionBytes(sections),
      mciBytes: mciBytes.byteLength,
      mciCrc32: decodedMci.checksum,
      mciSha256: sha256Bytes(mciBytes),
      manifestBytes: manifest.bytes,
      manifestSha256: manifest.sha256,
      leafSeedSplats: Number(countProof.leafSeedSplats),
      internalProxySplats: Number(countProof.internalProxySplats),
      hierarchyEdges: countProof.hierarchyEdges,
      boundSlack: Number(countProof.boundSlack),
      seedSpoolFinalBytes: seedSpool.byteLength,
      seedSpoolPeakBytes: seedSpool.peakBytes,
      proxySeedBytes: seedSpool.byteLength - PROXY_SEED_FILE_HEADER_BYTES,
      rawSourceSpoolBytes,
      spatialSort: partition.plan,
      encodedPageSpoolBytes: pageSpool.byteLength,
      temporaryDiskPeakBytes,
      completedCorePackBytes: packing.packs
        .filter((pack) => pack.kind === PACK_KIND.CORE)
        .reduce((sum, pack) => sum + pack.fileBytes, 0),
      completedShPackBytes: packing.packs
        .filter((pack) => pack.kind === PACK_KIND.SH)
        .reduce((sum, pack) => sum + pack.fileBytes, 0),
      leafTaskCount,
      hierarchyTaskCount,
      peakInFlight,
      peakActiveLeafSourceSplats,
      maximumInFlightLeafSplats: options.maximumInFlightLeafSplats,
      proxyComputeBackend: "proxy-v2-morton-tangent-javascript-cpu",
      sampledPeakRssBytes: rssMetrics.sampledPeakRssBytes,
      rssSampleCount: rssMetrics.rssSampleCount,
      rssSamplePeriodMilliseconds: rssMetrics.rssSamplePeriodMilliseconds,
      wallClockMilliseconds,
      workerCeiling: options.workers,
      actualWorkers: options.workers,
      maximumConcurrentTasks: executorMetrics.maximumConcurrentTasks,
      workerBusyMilliseconds: executorMetrics.workerBusyMilliseconds,
      workerCapacityMilliseconds,
      workerUtilization:
        workerCapacityMilliseconds === 0
          ? 0
          : executorMetrics.workerBusyMilliseconds / workerCapacityMilliseconds,
      validator: readback.validator,
      packs: readback.packs,
      coverageConservationResidual: Math.abs(
        nodeProxies[0].coverageMass - sourceCoverageMass,
      ),
      reportBytes: 0,
    };
    for (let depth = 0; depth <= hierarchy.maximumDepth; depth++) {
      let depthNodeCount = 0;
      let inputProxySplats = 0;
      let outputProxySplats = 0;
      for (let nodeIndex = 0; nodeIndex < hierarchy.nodeCount; nodeIndex++) {
        if (hierarchy.nodeDepth[nodeIndex] !== depth) {
          continue;
        }
        depthNodeCount++;
        outputProxySplats += nodeSeedCounts[nodeIndex];
        const childCount = popcount8(hierarchy.nodeChildMask[nodeIndex]);
        if (childCount === 0) {
          inputProxySplats += nodeSeedCounts[nodeIndex];
        } else {
          const firstChild = hierarchy.nodeFirstChild[nodeIndex];
          for (let ordinal = 0; ordinal < childCount; ordinal++) {
            inputProxySplats += nodeSeedCounts[firstChild + ordinal];
          }
        }
      }
      report.perDepth.push({
        depth,
        nodeCount: depthNodeCount,
        inputProxySplats,
        outputProxySplats,
      });
    }
    const diskPeakBeforeReport = temporaryDiskPeakBytes;
    const reportStageBytes =
      activeRawSpoolBytes +
      seedSpool.byteLength +
      pageSpool.byteLength +
      completedPackBytes +
      mciBytes.byteLength +
      manifest.bytes;
    let reportText;
    let candidatePeak = diskPeakBeforeReport;
    let candidateReportBytes = 0;
    for (let pass = 0; pass < 16; pass++) {
      report.temporaryDiskPeakBytes = candidatePeak;
      report.reportBytes = candidateReportBytes;
      const candidateText = `${JSON.stringify(report, null, 2)}\n`;
      const exactReportBytes = Buffer.byteLength(candidateText);
      const exactPeak = Math.max(
        diskPeakBeforeReport,
        reportStageBytes + exactReportBytes,
      );
      if (
        exactPeak === candidatePeak &&
        exactReportBytes === candidateReportBytes
      ) {
        reportText = candidateText;
        temporaryDiskPeakBytes = exactPeak;
        break;
      }
      candidatePeak = exactPeak;
      candidateReportBytes = exactReportBytes;
    }
    if (reportText === undefined) {
      throw new Error("A4 report byte authority did not reach a fixed point");
    }
    await writeFile(path.join(staging, "scene.report.json"), reportText);

    await executor.destroy();
    await seedSpool.cleanup();
    seedSpool = undefined;
    await pageSpool.cleanup();
    pageSpool = undefined;
    await injection(rawOptions, "before-publish");
    await rename(staging, target);
    published = true;
    return Object.freeze({ directory: target, report, readback });
  } catch (primaryError) {
    if (!rssMetrics) {
      rssSampler.stop();
    }
    const cleanupErrors = [];
    for (const cleanup of [
      () => executor?.destroy(),
      () => seedSpool?.cleanup(),
      () => pageSpool?.cleanup(),
      () =>
        rawSpoolDirectory &&
        rm(rawSpoolDirectory, { recursive: true, force: true }),
      () => rm(staging, { recursive: true, force: true }),
      () => !published && rm(target, { recursive: true, force: true }),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [primaryError, ...cleanupErrors],
        primaryError.message,
        { cause: primaryError },
      );
    }
    throw primaryError;
  }
}

import {
  covarianceFromScaleRotation,
  decomposeCovariance,
  determinantSymmetric,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianMath.js";
import {
  copyGaussian,
  createGaussianSet,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianColumns.js";
import {
  encodeCorePage,
  encodeShPage,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianEncodingExt.js";
import {
  MAX_PAGE_SPLATS,
  PACK_KIND,
} from "../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import { boundsForGaussianSet, emptyBounds, unionBounds } from "./bounds.js";
import { createCoverageMass } from "./coverageMass.js";
import { PROXY_V2_POLICY_ID, buildProxyV2Hierarchy } from "./proxy-v2/index.js";
import { planLodCounts } from "./policy.js";
import {
  planHalfRateSegmentCount,
  reduceDirectChildRepresentation,
} from "./hierarchy/segmentedProxyReducer.js";
import { createDyadicVisualErrorHistogram } from "./hierarchy/visualErrorHistogram.js";

export const CHUNK_REDUCTION_TASK_KIND = Object.freeze({
  SEGMENTED_LEAF_V1: "SEGMENTED_LEAF_V1",
  SEGMENTED_PARENT_V1: "SEGMENTED_PARENT_V1",
});

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function maximum(values) {
  let result = 0;
  for (const value of values) {
    result = Math.max(result, value);
  }
  return result;
}

function errorSummary(data) {
  return Object.freeze({
    maximumPosition: maximum(data.errorPosition),
    maximumCovariance: maximum(data.errorCovariance),
    maximumColor: maximum(data.errorColor),
    maximumSh: maximum(data.errorSh),
  });
}

function qualitySummary(data) {
  let finiteCount = 0;
  let positiveSemidefiniteCount = 0;
  let normalizedRotationCount = 0;
  for (let index = 0; index < data.count; index++) {
    const offset3 = index * 3;
    const offset4 = index * 4;
    const offset6 = index * 6;
    const ranges = [
      data.position.subarray(offset3, offset3 + 3),
      data.scale.subarray(offset3, offset3 + 3),
      data.rotation.subarray(offset4, offset4 + 4),
      data.covariance.subarray(offset6, offset6 + 6),
      data.color.subarray(offset3, offset3 + 3),
      data.sh.subarray(index * data.shCount, (index + 1) * data.shCount),
    ];
    if (
      ranges.every((values) => values.every(Number.isFinite)) &&
      Number.isFinite(data.opacity[index])
    ) {
      finiteCount++;
    }
    const xx = data.covariance[offset6];
    const yy = data.covariance[offset6 + 1];
    const zz = data.covariance[offset6 + 2];
    const xy = data.covariance[offset6 + 3];
    const xz = data.covariance[offset6 + 4];
    const yz = data.covariance[offset6 + 5];
    if (
      xx >= 0 &&
      yy >= 0 &&
      zz >= 0 &&
      xx * yy - xy * xy >= -1e-12 &&
      xx * zz - xz * xz >= -1e-12 &&
      yy * zz - yz * yz >= -1e-12 &&
      determinantSymmetric(data.covariance, offset6) >= -1e-12
    ) {
      positiveSemidefiniteCount++;
    }
    if (
      Math.abs(
        Math.hypot(
          data.rotation[offset4],
          data.rotation[offset4 + 1],
          data.rotation[offset4 + 2],
          data.rotation[offset4 + 3],
        ) - 1,
      ) <= 1e-9
    ) {
      normalizedRotationCount++;
    }
  }
  return Object.freeze({
    finiteCount,
    positiveSemidefiniteCount,
    normalizedRotationCount,
  });
}

function levelPayloadSummary(payload) {
  return {
    selectionBounds: payload.bounds.selectionBounds,
    strictBounds: payload.bounds.strictBounds,
    error: payload.error,
    coverage: payload.coverage,
    quality: payload.quality,
  };
}

const EMPTY_DIAGNOSTICS = Object.freeze({
  pairCandidateCount: 0,
  pairPassCount: 0,
  pairSelectedCount: 0,
  outsideWindowPairCount: 0,
  cardinalityRepairCount: 0,
  cardinalityRepairPairCount: 0,
  pairPasses: Object.freeze([]),
  opacityClampCount: 0,
  coverageMassClampDelta: 0,
});

function encodePayloadPages(payloadId, data) {
  const pages = [];
  for (let start = 0; start < data.count; start += MAX_PAGE_SPLATS) {
    const count = Math.min(MAX_PAGE_SPLATS, data.count - start);
    pages.push({
      payloadId,
      kind: PACK_KIND.CORE,
      start,
      count,
      bytes: encodeCorePage(data, start, count),
    });
  }
  if (data.shCount > 0) {
    for (let start = 0; start < data.count; start += MAX_PAGE_SPLATS) {
      const count = Math.min(MAX_PAGE_SPLATS, data.count - start);
      pages.push({
        payloadId,
        kind: PACK_KIND.SH,
        start,
        count,
        bytes: encodeShPage(data, start, count),
      });
    }
  }
  return pages;
}

async function createPayloadRecord({
  sourceChunk,
  data,
  coverageMass,
  level,
  diagnostics,
}) {
  const payloadId = `${sourceChunk.chunkId}-l${level}`;
  const bounds = boundsForGaussianSet(data);
  return {
    payloadId,
    ownerChunkId: sourceChunk.chunkId,
    generatedLevel: level,
    highestReferencedLevel: level,
    splatCount: data.count,
    representedSourceCount: sum(data.sourceCount),
    bounds,
    error: errorSummary(data),
    quality: qualitySummary(data),
    diagnostics,
    coverage: {
      totalMass: sum(coverageMass),
      opacityClampCount: diagnostics.opacityClampCount,
      coverageMassClampDelta: diagnostics.coverageMassClampDelta,
    },
    encodedPages: encodePayloadPages(payloadId, data),
  };
}

export async function reduceChunkV2(
  { sourceChunk, data },
  payloadRecordFactory = createPayloadRecord,
) {
  const levelPlans = planLodCounts(data.count);
  const byGeneratedLevel = new Map();
  const sourceMass = createCoverageMass(data);
  const l0Diagnostics = {
    ...EMPTY_DIAGNOSTICS,
    proxyPolicyId: PROXY_V2_POLICY_ID,
  };
  const l0 = await payloadRecordFactory({
    sourceChunk,
    data,
    coverageMass: sourceMass,
    level: 0,
    diagnostics: l0Diagnostics,
  });
  byGeneratedLevel.set(0, l0);
  const generatedPlans = levelPlans.filter(
    (level) => level.level > 0 && level.reusedFromLevel === null,
  );
  const hierarchy = await buildProxyV2Hierarchy({
    source: data,
    coverageMass: sourceMass,
    targetCounts: generatedPlans.map((level) => level.actualCount),
    chunkId: sourceChunk.chunkId,
    positionAnchor: [0, 1, 2].map(
      (component) =>
        (sourceChunk.cellBounds[component] +
          sourceChunk.cellBounds[component + 3]) /
        2,
    ),
    async onSnapshot(snapshot, authority) {
      const plan = generatedPlans.find(
        (candidate) => candidate.actualCount === snapshot.data.count,
      );
      if (!plan) {
        throw new Error("Proxy v2 emitted an unplanned snapshot count");
      }
      const diagnostics = {
        ...EMPTY_DIAGNOSTICS,
        proxyPolicyId: PROXY_V2_POLICY_ID,
        snapshotAuthority: authority,
        ...snapshot.diagnostics,
      };
      const record = await payloadRecordFactory({
        sourceChunk,
        data: snapshot.data,
        coverageMass: snapshot.coverageMass,
        level: plan.level,
        diagnostics,
      });
      byGeneratedLevel.set(plan.level, record);
    },
  });
  const hierarchyDiagnostics = {
    policyId: hierarchy.policyId,
    graphId: hierarchy.graphId,
    priorityId: hierarchy.priorityId,
    fitId: hierarchy.fitId,
    ...hierarchy.diagnostics,
  };
  for (const record of byGeneratedLevel.values()) {
    record.diagnostics = {
      ...record.diagnostics,
      hierarchy: hierarchyDiagnostics,
    };
  }
  const chunkPayloads = [...byGeneratedLevel.values()].sort(
    (left, right) => left.generatedLevel - right.generatedLevel,
  );
  const levels = [];
  let currentPayload;
  for (const level of levelPlans) {
    if (level.reusedFromLevel === null) {
      currentPayload = byGeneratedLevel.get(level.level);
      if (!currentPayload) {
        throw new Error("Proxy v2 omitted a required exact-count snapshot");
      }
    }
    currentPayload.highestReferencedLevel = Math.max(
      currentPayload.highestReferencedLevel,
      level.level,
    );
    if (
      currentPayload.permanent !== undefined &&
      currentPayload.permanent !== level.permanent
    ) {
      throw new Error("Physical Payload permanence must include all aliases");
    }
    currentPayload.permanent = level.permanent;
    levels.push({
      ...level,
      payloadId: currentPayload.payloadId,
      representedSourceCount: currentPayload.representedSourceCount,
      ...levelPayloadSummary(currentPayload),
    });
  }
  const strictBounds = emptyBounds();
  for (const payload of chunkPayloads) {
    unionBounds(strictBounds, payload.bounds.strictBounds);
  }
  return {
    levels,
    chunkPayloads,
    selectionBounds: l0.bounds.selectionBounds,
    strictBounds,
  };
}

export async function reduceChunkToEncodedPages(options) {
  return reduceChunkV2(options);
}

function encodeRelativePayloadPages(payloadId, data, origin) {
  const pages = [];
  for (let start = 0; start < data.count; start += MAX_PAGE_SPLATS) {
    const count = Math.min(MAX_PAGE_SPLATS, data.count - start);
    const scratch = createGaussianSet(count, data.shCount);
    for (let localIndex = 0; localIndex < count; localIndex++) {
      const sourceIndex = start + localIndex;
      copyGaussian(data, sourceIndex, scratch, localIndex);
      for (let component = 0; component < 3; component++) {
        scratch.position[localIndex * 3 + component] = Math.fround(
          data.position[sourceIndex * 3 + component] - origin[component],
        );
      }
    }
    pages.push({
      payloadId,
      kind: PACK_KIND.CORE,
      start,
      count,
      bytes: encodeCorePage(scratch, 0, count),
    });
    if (data.shCount > 0) {
      pages.push({
        payloadId,
        kind: PACK_KIND.SH,
        start,
        count,
        bytes: encodeShPage(data, start, count),
      });
    }
  }
  return pages;
}

function compactGaussianSeed(data, coverageMass, origin) {
  const count = data.count;
  const seed = {
    count,
    shCount: data.shCount,
    origin: new Float64Array(origin),
    position: new Float32Array(count * 3),
    scale: new Float32Array(count * 3),
    rotation: new Float32Array(count * 4),
    opacity: new Float32Array(count),
    color: new Float32Array(count * 3),
    sh: new Float32Array(count * data.shCount),
    errorPosition: new Float64Array(count),
    errorCovariance: new Float64Array(count),
    errorColor: new Float64Array(count),
    errorSh: new Float64Array(count),
    coverageMass: new Float64Array(coverageMass),
    representedSourceCount: BigInt(sum(data.sourceCount)),
  };
  for (let index = 0; index < count; index++) {
    const offset3 = index * 3;
    const offset4 = index * 4;
    const offset6 = index * 6;
    let positionDifference = 0;
    let covarianceDifference = 0;
    let colorDifference = 0;
    let shDifference = 0;
    for (let component = 0; component < 3; component++) {
      const relative = data.position[offset3 + component] - origin[component];
      seed.position[offset3 + component] = relative;
      positionDifference = Math.max(
        positionDifference,
        Math.abs(seed.position[offset3 + component] - relative),
      );
      seed.color[offset3 + component] = data.color[offset3 + component];
      colorDifference = Math.max(
        colorDifference,
        Math.abs(
          seed.color[offset3 + component] - data.color[offset3 + component],
        ),
      );
    }
    const covariance = data.covariance.subarray(offset6, offset6 + 6);
    const decomposition = decomposeCovariance(covariance);
    seed.scale.set(decomposition.scale, offset3);
    seed.rotation.set(decomposition.rotation, offset4);
    const reconstructed = covarianceFromScaleRotation(
      seed.scale,
      offset3,
      seed.rotation,
      offset4,
    );
    for (let component = 0; component < 6; component++) {
      covarianceDifference = Math.max(
        covarianceDifference,
        Math.abs(reconstructed[component] - covariance[component]),
      );
    }
    seed.opacity[index] = data.opacity[index];
    for (let coefficient = 0; coefficient < data.shCount; coefficient++) {
      const shIndex = index * data.shCount + coefficient;
      seed.sh[shIndex] = data.sh[shIndex];
      shDifference = Math.max(
        shDifference,
        Math.abs(seed.sh[shIndex] - data.sh[shIndex]),
      );
    }
    seed.errorPosition[index] = data.errorPosition[index] + positionDifference;
    seed.errorCovariance[index] =
      data.errorCovariance[index] + covarianceDifference;
    seed.errorColor[index] = data.errorColor[index] + colorDifference;
    seed.errorSh[index] = data.errorSh[index] + shDifference;
  }
  return Object.freeze(seed);
}

function expandSeedForEncoding(seed, start, count) {
  const data = createGaussianSet(count, seed.shCount);
  for (let localIndex = 0; localIndex < count; localIndex++) {
    const index = start + localIndex;
    const source3 = index * 3;
    const source4 = index * 4;
    const target3 = localIndex * 3;
    const target4 = localIndex * 4;
    const target6 = localIndex * 6;
    data.position.set(seed.position.subarray(source3, source3 + 3), target3);
    data.scale.set(seed.scale.subarray(source3, source3 + 3), target3);
    data.rotation.set(seed.rotation.subarray(source4, source4 + 4), target4);
    data.opacity[localIndex] = seed.opacity[index];
    data.color.set(seed.color.subarray(source3, source3 + 3), target3);
    data.sh.set(
      seed.sh.subarray(index * seed.shCount, (index + 1) * seed.shCount),
      localIndex * seed.shCount,
    );
    data.covariance.set(
      covarianceFromScaleRotation(seed.scale, source3, seed.rotation, source4),
      target6,
    );
  }
  return data;
}

async function reduceSegmentedLeaf(task) {
  const origin = [0, 1, 2].map(
    (component) =>
      (task.sourceChunk.cellBounds[component] +
        task.sourceChunk.cellBounds[component + 3]) /
      2,
  );
  const result = await reduceChunkV2(task, async (options) => {
    const payloadId = `${options.sourceChunk.chunkId}-l${options.level}`;
    const bounds = boundsForGaussianSet(options.data);
    return {
      payloadId,
      generatedLevel: options.level,
      highestReferencedLevel: options.level,
      splatCount: options.data.count,
      representedSourceCount: sum(options.data.sourceCount),
      bounds,
      error: errorSummary(options.data),
      quality: qualitySummary(options.data),
      diagnostics: options.diagnostics,
      coverage: {
        totalMass: sum(options.coverageMass),
        opacityClampCount: options.diagnostics.opacityClampCount,
        coverageMassClampDelta: options.diagnostics.coverageMassClampDelta,
      },
      visualErrorHistogram: createDyadicVisualErrorHistogram({
        errorPosition: options.data.errorPosition,
        errorCovariance: options.data.errorCovariance,
        coverageMass: options.coverageMass,
        sourceCount: options.data.sourceCount,
        ownerBounds: task.sourceChunk.cellBounds,
      }),
      encodedPages: encodeRelativePayloadPages(payloadId, options.data, origin),
      seed: compactGaussianSeed(options.data, options.coverageMass, origin),
    };
  });
  const coarsestId = result.levels[6].payloadId;
  const coarsest = result.chunkPayloads.find(
    (payload) => payload.payloadId === coarsestId,
  );
  return {
    ...result,
    origin,
    coarsestSeed: coarsest.seed,
    coarsestGeometricError:
      Math.sqrt(3) * coarsest.error.maximumPosition +
      2 * Math.sqrt(3 * coarsest.error.maximumCovariance),
    chunkPayloads: result.chunkPayloads.map(({ seed, ...payload }) => payload),
  };
}

async function reduceSegmentedParent(task) {
  for (let ordinal = 0; ordinal < task.childRepresentations.length; ordinal++) {
    const child = task.childRepresentations[ordinal];
    const expectedTargetCount = planHalfRateSegmentCount(child.seed.count);
    if (child.expectedTargetCount !== expectedTargetCount) {
      throw new Error(
        `SEGMENTED_PARENT_V1 child ${ordinal} expectedTargetCount mismatch`,
      );
    }
  }
  const reduced = await reduceDirectChildRepresentation({
    ...task,
    visualErrorDomain: "dyadic-owner-envelope",
  });
  for (let ordinal = 0; ordinal < reduced.segments.length; ordinal++) {
    if (
      reduced.segments[ordinal].rangeCount !==
      task.childRepresentations[ordinal].expectedTargetCount
    ) {
      throw new Error(
        `SEGMENTED_PARENT_V1 child ${ordinal} result target mismatch`,
      );
    }
  }
  const assets = [];
  const seed = reduced.representation.seed;
  for (
    let representationStart = 0;
    representationStart < seed.count;
    representationStart += task.maximumAssetSplats
  ) {
    const count = Math.min(
      task.maximumAssetSplats,
      seed.count - representationStart,
    );
    const encodedPages = [];
    for (let start = 0; start < count; start += MAX_PAGE_SPLATS) {
      const pageCount = Math.min(MAX_PAGE_SPLATS, count - start);
      const data = expandSeedForEncoding(
        seed,
        representationStart + start,
        pageCount,
      );
      encodedPages.push({
        kind: PACK_KIND.CORE,
        start,
        count: pageCount,
        bytes: encodeCorePage(data, 0, pageCount),
      });
      if (seed.shCount > 0) {
        encodedPages.push({
          kind: PACK_KIND.SH,
          start,
          count: pageCount,
          bytes: encodeShPage(data, 0, pageCount),
        });
      }
    }
    assets.push({ representationStart, count, encodedPages });
  }
  return { ...reduced, assets };
}

export async function dispatchChunkReductionTask(task) {
  if (task.testDelayMilliseconds !== undefined) {
    await new Promise((resolve) =>
      setTimeout(resolve, task.testDelayMilliseconds),
    );
  }
  if (task.kind === CHUNK_REDUCTION_TASK_KIND.SEGMENTED_LEAF_V1) {
    return reduceSegmentedLeaf(task);
  }
  if (task.kind === CHUNK_REDUCTION_TASK_KIND.SEGMENTED_PARENT_V1) {
    return reduceSegmentedParent(task);
  }
  return reduceChunkToEncodedPages(task);
}

export function chunkReductionResultTransferList(result) {
  const buffers = new Set();
  function add(value) {
    if (ArrayBuffer.isView(value)) {
      buffers.add(value.buffer);
    }
  }
  for (const payload of result.chunkPayloads ?? []) {
    add(payload.visualErrorHistogram?.bins);
    for (const page of payload.encodedPages) {
      add(page.bytes);
    }
  }
  for (const asset of result.assets ?? []) {
    for (const page of asset.encodedPages) {
      add(page.bytes);
    }
  }
  for (const seed of [result.coarsestSeed, result.representation?.seed]) {
    if (seed) {
      for (const value of Object.values(seed)) {
        add(value);
      }
    }
  }
  return [...buffers];
}

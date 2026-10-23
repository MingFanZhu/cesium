/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
import {
  aabbIntersectsFrustum,
  distanceToAabb,
  validateFrozenView,
} from "./_SceneGISGaussianViewMath.js";
import { SEGMENTED_VISUAL_ERROR_METRIC } from "./_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";
import { createSegmentedViewGeometry } from "./_SceneGISGaussianSegmentedViewGeometry.js";
import { createSegmentedCropBoundsReader } from "./_SceneGISGaussianSegmentedCropBounds.js";

const INVALID_INDEX = 0xffffffff;
const MAX_SEGMENTED_CHILDREN = 8;
const SELECTION_ERROR_METRIC = SEGMENTED_VISUAL_ERROR_METRIC.COVERAGE_P99;
const ANCESTOR_COVERAGE_PRESSURE_REFINE_PIXELS = 32;
const ANCESTOR_COVERAGE_PRESSURE_COARSEN_PIXELS = 24;
const ANCESTOR_COVERAGE_PRESSURE_POLICY_IDENTITY =
  "ancestor-coverage-pressure-v1:32:24";
const DIAGNOSTIC_DISTANCE_BAND_METERS = 10;
const VIEW_PRIORITY_POLICY_IDENTITY =
  "view-footprint-refinement-active-cut-v5:xy-ownership:content-z:edge-pixel-floor:16:12:32:24";
export const SEGMENTED_ACTIVE_CUT_STOP_REASON = Object.freeze({
  SSE_SATISFIED: "SSE_SATISFIED",
  BUDGET_LIMITED: "BUDGET_LIMITED",
  FRONTIER_LIMITED: "FRONTIER_LIMITED",
  DETAIL_EXHAUSTED: "DETAIL_EXHAUSTED",
  QUALITY_PLATEAU: "QUALITY_PLATEAU",
});
const TRANSITION = Object.freeze({
  INTERNAL_UPGRADE: 1,
  INTERNAL_COARSEN: 2,
  LEAF_UPGRADE: 3,
  LEAF_COARSEN: 4,
});

const cutInternals = new WeakMap();
const planInternals = new WeakMap();
const convergedPlanInternals = new WeakMap();
const projectionInternals = new WeakMap();
const diffInternals = new WeakMap();

function requireProtocol(index) {
  if (
    index === null ||
    typeof index !== "object" ||
    !Number.isSafeInteger(index.nodeCount) ||
    index.nodeCount <= 0 ||
    !Number.isSafeInteger(index.leafCount) ||
    index.leafCount <= 0 ||
    !Number.isSafeInteger(index.representationCount) ||
    index.representationCount <= 0 ||
    !Number.isSafeInteger(index.segmentCount) ||
    index.segmentCount < 0 ||
    !Number.isSafeInteger(index.rootNodeIndex) ||
    [
      "writeArtifactIdentity",
      "readNodeTopology",
      "readNodeContentBounds",
      "readNodeProxy",
      "readRepresentation",
      "readRepresentationConservativeError",
      "readRepresentationVisualError",
      "readSegment",
      "readSegmentConservativeError",
      "readSegmentVisualError",
      "leafRepresentationId",
    ].some((name) => typeof index[name] !== "function")
  ) {
    throw new TypeError("Expected a segmented hierarchy index protocol");
  }
}

function requireSafeBudget(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      "maximumSelectedSplats must be a nonnegative safe integer",
    );
  }
  return value;
}

function requireCoverageSlotBudget(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(
      "maximumCoverageSlots must be a positive safe integer",
    );
  }
  return value;
}

function exactCountAdd(left, right, label) {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return result;
}

function artifactWords(index) {
  const words = new Uint32Array(17);
  index.writeArtifactIdentity(words);
  return words;
}

function wordsEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function arraysEqual(left, right) {
  return wordsEqual(left, right);
}

function sameCutState(left, right) {
  return (
    left.selectedSplatCount === right.selectedSplatCount &&
    left.maximumSelectedSplats === right.maximumSelectedSplats &&
    arraysEqual(left.coverageNodeIndices, right.coverageNodeIndices) &&
    arraysEqual(
      left.providerRepresentationIds,
      right.providerRepresentationIds,
    ) &&
    arraysEqual(left.providerRangeStarts, right.providerRangeStarts) &&
    arraysEqual(left.providerRangeCounts, right.providerRangeCounts)
  );
}

function frozenViewProof(view) {
  requireProjectedView(view);
  return Object.freeze({
    viewIdentity: view.viewIdentity,
    cameraPositionScene: Object.freeze([...view.cameraPositionScene]),
    frustumPlanesScene: Object.freeze(
      view.frustumPlanesScene.map((plane) => Object.freeze([...plane])),
    ),
    sceneToClipMatrix: Object.freeze([...view.sceneToClipMatrix]),
    drawingBufferWidth: view.drawingBufferWidth,
    drawingBufferHeight: view.drawingBufferHeight,
    projectionKind: view.projectionKind,
  });
}

function sameViewProof(left, right) {
  if (!right) {
    return false;
  }
  try {
    const candidate = frozenViewProof(right);
    return (
      left.viewIdentity === candidate.viewIdentity &&
      left.drawingBufferWidth === candidate.drawingBufferWidth &&
      left.drawingBufferHeight === candidate.drawingBufferHeight &&
      left.projectionKind === candidate.projectionKind &&
      arraysEqual(left.cameraPositionScene, candidate.cameraPositionScene) &&
      arraysEqual(left.sceneToClipMatrix, candidate.sceneToClipMatrix) &&
      left.frustumPlanesScene.length === candidate.frustumPlanesScene.length &&
      left.frustumPlanesScene.every((plane, index) =>
        arraysEqual(plane, candidate.frustumPlanesScene[index]),
      )
    );
  } catch {
    return false;
  }
}

function popcount8(mask) {
  let count = 0;
  for (let ordinal = 0; ordinal < MAX_SEGMENTED_CHILDREN; ordinal++) {
    count += (mask >> ordinal) & 1;
  }
  return count;
}

function readSegmentForChild(
  index,
  representationId,
  childNodeIndex,
  scratch,
  representationScratch,
) {
  index.readRepresentation(representationId, representationScratch);
  const firstSegment = representationScratch[2];
  const segmentCount = representationScratch[3];
  for (let ordinal = 0; ordinal < segmentCount; ordinal++) {
    index.readSegment(firstSegment + ordinal, scratch);
    if (scratch[1] === childNodeIndex) {
      scratch[7] = firstSegment + ordinal;
      return true;
    }
  }
  return false;
}

function representationSelectionError(index, representationId) {
  return index.readRepresentationVisualError(
    representationId,
    SELECTION_ERROR_METRIC,
  );
}

function segmentSelectionError(index, segmentScratch) {
  return index.readSegmentVisualError(
    segmentScratch[7],
    SELECTION_ERROR_METRIC,
  );
}

function validateCutArrays(index, state) {
  const count = state.coverageNodeIndices.length;
  if (
    state.providerRepresentationIds.length !== count ||
    state.providerRangeStarts.length !== count ||
    state.providerRangeCounts.length !== count ||
    count === 0
  ) {
    throw new Error(
      "Segmented active cut arrays are not equal nonzero lengths",
    );
  }
  const topology = new Uint32Array(8);
  const parentTopology = new Uint32Array(8);
  const representation = new Float64Array(12);
  const segment = new Float64Array(8);
  let expectedFirstLeaf = 0;
  let selectedSplatCount = 0;
  let ancestorProviderSlotCount = 0;
  let maximumTraversalDepth = 0;
  for (let slot = 0; slot < count; slot++) {
    const nodeIndex = state.coverageNodeIndices[slot];
    const representationId = state.providerRepresentationIds[slot];
    if (
      nodeIndex >= index.nodeCount ||
      representationId >= index.representationCount
    ) {
      throw new RangeError("Segmented active cut lookup id is out of range");
    }
    index.readNodeTopology(nodeIndex, topology);
    if (topology[6] !== expectedFirstLeaf) {
      throw new Error("Segmented active cut coverage has a hole or overlap");
    }
    expectedFirstLeaf = exactCountAdd(
      expectedFirstLeaf,
      topology[7],
      "active coverage interval",
    );
    maximumTraversalDepth = Math.max(maximumTraversalDepth, topology[3]);
    index.readRepresentation(representationId, representation);
    const rangeStart = state.providerRangeStarts[slot];
    const rangeCount = state.providerRangeCounts[slot];
    if (representation[0] === nodeIndex) {
      if (rangeStart !== 0 || rangeCount !== representation[6]) {
        throw new Error(
          "Active cut own provider is not a whole Representation",
        );
      }
    } else {
      const parentNodeIndex = topology[0];
      if (
        parentNodeIndex === INVALID_INDEX ||
        representation[0] !== parentNodeIndex
      ) {
        throw new Error(
          "Active cut provider is not an immediate-parent Representation",
        );
      }
      index.readNodeTopology(parentNodeIndex, parentTopology);
      if (
        nodeIndex < parentTopology[1] ||
        nodeIndex >= parentTopology[1] + popcount8(parentTopology[2]) ||
        !readSegmentForChild(
          index,
          representationId,
          nodeIndex,
          segment,
          representation,
        ) ||
        rangeStart !== segment[2] ||
        rangeCount !== segment[3]
      ) {
        throw new Error(
          "Active cut provider is not the exact direct-child Segment",
        );
      }
      ancestorProviderSlotCount++;
    }
    selectedSplatCount = exactCountAdd(
      selectedSplatCount,
      rangeCount,
      "active selected splats",
    );
  }
  if (expectedFirstLeaf !== index.leafCount) {
    throw new Error("Segmented active cut does not partition the root");
  }
  if (
    selectedSplatCount !== state.selectedSplatCount ||
    selectedSplatCount > state.maximumSelectedSplats
  ) {
    throw new Error("Segmented active cut selected count or budget is invalid");
  }
  return { ancestorProviderSlotCount, maximumTraversalDepth };
}

class SegmentedActiveCut {
  constructor(state, metrics) {
    this.artifactIdentityHex = state.artifactIdentityHex;
    this.activeSlotCount = state.coverageNodeIndices.length;
    this.selectedSplatCount = state.selectedSplatCount;
    this.maximumSelectedSplats = state.maximumSelectedSplats;
    this.remainingBudget =
      state.maximumSelectedSplats - state.selectedSplatCount;
    this.byteLength =
      state.artifactIdentityWords.byteLength +
      state.coverageNodeIndices.byteLength +
      state.providerRepresentationIds.byteLength +
      state.providerRangeStarts.byteLength +
      state.providerRangeCounts.byteLength;
    this.metrics = Object.freeze({ ...metrics });
    cutInternals.set(this, state);
    Object.freeze(this);
  }

  get coverageNodeIndices() {
    return cutInternals.get(this).coverageNodeIndices.slice();
  }

  get providerRepresentationIds() {
    return cutInternals.get(this).providerRepresentationIds.slice();
  }

  get providerRangeStarts() {
    return cutInternals.get(this).providerRangeStarts.slice();
  }

  get providerRangeCounts() {
    return cutInternals.get(this).providerRangeCounts.slice();
  }
}

function makeCut(index, arrays, maximumSelectedSplats, metrics = {}) {
  const state = {
    artifactIdentityWords: artifactWords(index),
    artifactIdentityHex: index.artifactIdentityHex ?? "procedural-artifact",
    coverageNodeIndices: Uint32Array.from(arrays.coverageNodeIndices),
    providerRepresentationIds: Uint32Array.from(
      arrays.providerRepresentationIds,
    ),
    providerRangeStarts: Uint32Array.from(arrays.providerRangeStarts),
    providerRangeCounts: Uint32Array.from(arrays.providerRangeCounts),
    selectedSplatCount: arrays.selectedSplatCount,
    maximumSelectedSplats: requireSafeBudget(maximumSelectedSplats),
  };
  const validated = validateCutArrays(index, state);
  return new SegmentedActiveCut(state, {
    visitedNodeCount: metrics.visitedNodeCount ?? 0,
    activeSlotCount: state.coverageNodeIndices.length,
    ancestorProviderSlotCount: validated.ancestorProviderSlotCount,
    splitCount: metrics.splitCount ?? 0,
    joinCount: metrics.joinCount ?? 0,
    candidateCount: metrics.candidateCount ?? 0,
    candidateOrderingPassCount: metrics.candidateOrderingPassCount ?? 0,
    candidateOrderingWorkCount: metrics.candidateOrderingWorkCount ?? 0,
    admittedUpgradeCount: metrics.admittedUpgradeCount ?? 0,
    plannedCoarsenCount: metrics.plannedCoarsenCount ?? 0,
    readyCommittedCount: metrics.readyCommittedCount ?? 0,
    selectedSplatCount: state.selectedSplatCount,
    remainingBudget: state.maximumSelectedSplats - state.selectedSplatCount,
    providerIntervalCount: metrics.providerIntervalCount ?? 0,
    addedProviderIntervalCount: metrics.addedProviderIntervalCount ?? 0,
    removedProviderIntervalCount: metrics.removedProviderIntervalCount ?? 0,
    coverageHoleCount: 0,
    coverageOverlapCount: 0,
    maximumTraversalDepth: validated.maximumTraversalDepth,
    maximumScratchSlots:
      metrics.maximumScratchSlots ?? state.coverageNodeIndices.length,
  });
}

function getCut(cut) {
  const state = cutInternals.get(cut);
  if (state === undefined) {
    throw new TypeError("Expected a canonical segmented active cut");
  }
  return state;
}

function requireSameArtifact(index, words, label) {
  if (!wordsEqual(artifactWords(index), words)) {
    throw new Error(`${label} artifact identity mismatch`);
  }
}

export function createSegmentedActiveCut(index, options) {
  requireProtocol(index);
  const maximumSelectedSplats = requireSafeBudget(
    options?.maximumSelectedSplats,
  );
  const proxy = new Float64Array(4);
  const representation = new Float64Array(12);
  index.readNodeProxy(index.rootNodeIndex, proxy);
  index.readRepresentation(proxy[0], representation);
  const rootCount = representation[6];
  if (rootCount > maximumSelectedSplats) {
    throw new RangeError("Root proxy exceeds maximumSelectedSplats");
  }
  return makeCut(
    index,
    {
      coverageNodeIndices: Uint32Array.of(index.rootNodeIndex),
      providerRepresentationIds: Uint32Array.of(proxy[0]),
      providerRangeStarts: Uint32Array.of(0),
      providerRangeCounts: Uint32Array.of(rootCount),
      selectedSplatCount: rootCount,
    },
    maximumSelectedSplats,
    { visitedNodeCount: 1, maximumScratchSlots: 1 },
  );
}

class ProviderProjection {
  constructor(state) {
    this.artifactIdentityHex = state.artifactIdentityHex;
    this.intervalCount = state.representationIds.length;
    this.byteLength =
      state.representationIds.byteLength +
      state.rangeStarts.byteLength +
      state.rangeCounts.byteLength;
    projectionInternals.set(this, state);
    Object.freeze(this);
  }

  get representationIds() {
    return projectionInternals.get(this).representationIds.slice();
  }

  get rangeStarts() {
    return projectionInternals.get(this).rangeStarts.slice();
  }

  get rangeCounts() {
    return projectionInternals.get(this).rangeCounts.slice();
  }
}

export function projectSegmentedActiveCutProviders(index, cut) {
  requireProtocol(index);
  const state = getCut(cut);
  requireSameArtifact(index, state.artifactIdentityWords, "Cut");
  const maximum = state.coverageNodeIndices.length;
  const representationIds = new Uint32Array(maximum);
  const rangeStarts = new Uint32Array(maximum);
  const rangeCounts = new Uint32Array(maximum);
  let count = 0;
  for (let slot = 0; slot < maximum; slot++) {
    const representationId = state.providerRepresentationIds[slot];
    const start = state.providerRangeStarts[slot];
    const length = state.providerRangeCounts[slot];
    if (
      count > 0 &&
      representationIds[count - 1] === representationId &&
      rangeStarts[count - 1] + rangeCounts[count - 1] === start
    ) {
      rangeCounts[count - 1] = exactCountAdd(
        rangeCounts[count - 1],
        length,
        "provider interval",
      );
    } else {
      representationIds[count] = representationId;
      rangeStarts[count] = start;
      rangeCounts[count] = length;
      count++;
    }
  }
  return new ProviderProjection({
    artifactIdentityWords: state.artifactIdentityWords.slice(),
    artifactIdentityHex: state.artifactIdentityHex,
    representationIds: representationIds.slice(0, count),
    rangeStarts: rangeStarts.slice(0, count),
    rangeCounts: rangeCounts.slice(0, count),
  });
}

function nextPowerOfTwo(value) {
  let result = 1;
  while (result < value) {
    result *= 2;
  }
  return result;
}

function hashSlot(keys, key) {
  const mask = keys.length - 1;
  let slot = Math.imul(key ^ (key >>> 16), 0x45d9f3b) & mask;
  while (keys[slot] !== INVALID_INDEX && keys[slot] !== key) {
    slot = (slot + 1) & mask;
  }
  return slot;
}

function subtractProjection(left, right) {
  const capacity = nextPowerOfTwo(
    Math.max(2, right.representationIds.length * 2),
  );
  const keys = new Uint32Array(capacity);
  keys.fill(INVALID_INDEX);
  const heads = new Int32Array(capacity);
  heads.fill(-1);
  const links = new Int32Array(right.representationIds.length);
  links.fill(-1);
  for (let index = right.representationIds.length - 1; index >= 0; index--) {
    const key = right.representationIds[index];
    const slot = hashSlot(keys, key);
    keys[slot] = key;
    links[index] = heads[slot];
    heads[slot] = index;
  }
  const maximum =
    left.representationIds.length + right.representationIds.length;
  const ids = new Uint32Array(maximum);
  const starts = new Uint32Array(maximum);
  const counts = new Uint32Array(maximum);
  let outputCount = 0;
  for (
    let leftIndex = 0;
    leftIndex < left.representationIds.length;
    leftIndex++
  ) {
    const id = left.representationIds[leftIndex];
    let cursor = left.rangeStarts[leftIndex];
    const end = cursor + left.rangeCounts[leftIndex];
    const slot = hashSlot(keys, id);
    let rightIndex = keys[slot] === id ? heads[slot] : -1;
    while (rightIndex >= 0 && cursor < end) {
      const otherStart = right.rangeStarts[rightIndex];
      const otherEnd = otherStart + right.rangeCounts[rightIndex];
      if (otherEnd > cursor && otherStart < end) {
        if (otherStart > cursor) {
          ids[outputCount] = id;
          starts[outputCount] = cursor;
          counts[outputCount] = Math.min(otherStart, end) - cursor;
          outputCount++;
        }
        cursor = Math.max(cursor, otherEnd);
      }
      rightIndex = links[rightIndex];
    }
    if (cursor < end) {
      ids[outputCount] = id;
      starts[outputCount] = cursor;
      counts[outputCount] = end - cursor;
      outputCount++;
    }
  }
  return {
    representationIds: ids.slice(0, outputCount),
    rangeStarts: starts.slice(0, outputCount),
    rangeCounts: counts.slice(0, outputCount),
  };
}

class ProviderDiff {
  constructor(state) {
    this.addedIntervalCount = state.addedRepresentationIds.length;
    this.removedIntervalCount = state.removedRepresentationIds.length;
    this.byteLength =
      state.addedRepresentationIds.byteLength +
      state.addedRangeStarts.byteLength +
      state.addedRangeCounts.byteLength +
      state.removedRepresentationIds.byteLength +
      state.removedRangeStarts.byteLength +
      state.removedRangeCounts.byteLength;
    diffInternals.set(this, state);
    Object.freeze(this);
  }

  get addedRepresentationIds() {
    return diffInternals.get(this).addedRepresentationIds.slice();
  }
  get addedRangeStarts() {
    return diffInternals.get(this).addedRangeStarts.slice();
  }
  get addedRangeCounts() {
    return diffInternals.get(this).addedRangeCounts.slice();
  }
  get removedRepresentationIds() {
    return diffInternals.get(this).removedRepresentationIds.slice();
  }
  get removedRangeStarts() {
    return diffInternals.get(this).removedRangeStarts.slice();
  }
  get removedRangeCounts() {
    return diffInternals.get(this).removedRangeCounts.slice();
  }
}

export function diffSegmentedActiveCutProviders(index, previousCut, nextCut) {
  const previous = projectSegmentedActiveCutProviders(index, previousCut);
  const next = projectSegmentedActiveCutProviders(index, nextCut);
  const previousState = projectionInternals.get(previous);
  const nextState = projectionInternals.get(next);
  const removed = subtractProjection(previousState, nextState);
  const added = subtractProjection(nextState, previousState);
  return new ProviderDiff({
    addedRepresentationIds: added.representationIds,
    addedRangeStarts: added.rangeStarts,
    addedRangeCounts: added.rangeCounts,
    removedRepresentationIds: removed.representationIds,
    removedRangeStarts: removed.rangeStarts,
    removedRangeCounts: removed.rangeCounts,
  });
}

function normalizePlanOptions(cutState, options) {
  const maximumSelectedSplats = requireSafeBudget(
    options?.maximumSelectedSplats ?? cutState.maximumSelectedSplats,
  );
  if (maximumSelectedSplats !== cutState.maximumSelectedSplats) {
    throw new Error("Plan budget must equal the committed cut budget");
  }
  const refineErrorPixels = options?.refineErrorPixels ?? 2;
  const coarsenErrorPixels = options?.coarsenErrorPixels ?? 1;
  const minimumLeafLogicalLevel = options?.minimumLeafLogicalLevel ?? 1;
  const maximumCoverageSlots = requireCoverageSlotBudget(
    options?.maximumCoverageSlots ?? 200_000,
  );
  if (
    !Number.isFinite(refineErrorPixels) ||
    refineErrorPixels <= 0 ||
    !Number.isFinite(coarsenErrorPixels) ||
    coarsenErrorPixels < 0 ||
    coarsenErrorPixels >= refineErrorPixels ||
    ![0, 1].includes(minimumLeafLogicalLevel)
  ) {
    throw new RangeError("Segmented active-cut hysteresis options are invalid");
  }
  return Object.freeze({
    maximumSelectedSplats,
    refineErrorPixels,
    coarsenErrorPixels,
    minimumLeafLogicalLevel,
    maximumCoverageSlots,
    selectionErrorMetric: SELECTION_ERROR_METRIC,
    ancestorCoveragePressureRefinePixels:
      ANCESTOR_COVERAGE_PRESSURE_REFINE_PIXELS,
    ancestorCoveragePressureCoarsenPixels:
      ANCESTOR_COVERAGE_PRESSURE_COARSEN_PIXELS,
    coveragePressurePolicyIdentity: ANCESTOR_COVERAGE_PRESSURE_POLICY_IDENTITY,
    nearFirstDistanceBandMeters: DIAGNOSTIC_DISTANCE_BAND_METERS,
    nearFirstPolicyIdentity: VIEW_PRIORITY_POLICY_IDENTITY,
    policyIdentity: `${maximumSelectedSplats}:${maximumCoverageSlots}:${refineErrorPixels}:${coarsenErrorPixels}:${minimumLeafLogicalLevel}:${SELECTION_ERROR_METRIC}:${VIEW_PRIORITY_POLICY_IDENTITY}`,
  });
}

function requireProjectedView(view) {
  validateFrozenView(view);
  if (
    !Object.isFrozen(view) ||
    !Array.isArray(view.sceneToClipMatrix) ||
    !Number.isSafeInteger(view.drawingBufferHeight) ||
    !["perspective", "orthographic"].includes(view.projectionKind)
  ) {
    throw new TypeError(
      "Segmented active cut requires a complete projected frozen view",
    );
  }
}

function evaluateNode(
  index,
  nodeIndex,
  error,
  view,
  boundsScratch,
  mathBoundsScratch,
  resultScratch,
) {
  if (!Number.isFinite(error) || error < 0) {
    throw new RangeError("Projected geometric error input is invalid");
  }
  index.readNodeContentBounds(nodeIndex, boundsScratch);
  for (let component = 0; component < 6; component++) {
    mathBoundsScratch[component] = boundsScratch[component];
  }
  const visible = aabbIntersectsFrustum(
    mathBoundsScratch,
    view.frustumPlanesScene,
  );
  const matrix = view.sceneToClipMatrix;
  const xPixelsPerSceneUnit =
    Math.hypot(matrix[0], matrix[4], matrix[8]) * view.drawingBufferWidth * 0.5;
  const yPixelsPerSceneUnit =
    Math.hypot(matrix[1], matrix[5], matrix[9]) *
    view.drawingBufferHeight *
    0.5;
  const pixelScale = Math.max(xPixelsPerSceneUnit, yPixelsPerSceneUnit);
  if (
    !Number.isFinite(xPixelsPerSceneUnit) ||
    xPixelsPerSceneUnit <= 0 ||
    !Number.isFinite(yPixelsPerSceneUnit) ||
    yPixelsPerSceneUnit <= 0 ||
    !Number.isFinite(pixelScale) ||
    pixelScale <= 0
  ) {
    throw new RangeError("Frozen view projection scale is invalid");
  }
  let projectedError;
  const distance = distanceToAabb(view.cameraPositionScene, mathBoundsScratch);
  if (view.projectionKind === "orthographic") {
    projectedError = error * pixelScale;
  } else {
    projectedError = (error * pixelScale) / Math.max(distance, 1.0e-12);
  }
  if (!Number.isFinite(projectedError) || projectedError < 0) {
    throw new RangeError("Projected geometric error is invalid");
  }
  resultScratch[0] = Number(visible);
  resultScratch[1] = projectedError;
  resultScratch[2] = pixelScale;
  resultScratch[3] = distance;
  return resultScratch;
}

function coveragePressure(coverage, count, evaluation) {
  if (
    !Number.isFinite(coverage) ||
    coverage < 0 ||
    !Number.isSafeInteger(count) ||
    count <= 0 ||
    !Number.isFinite(evaluation[2]) ||
    evaluation[2] <= 0 ||
    !Number.isFinite(evaluation[3]) ||
    evaluation[3] < 0
  ) {
    throw new RangeError("Ancestor coverage pressure input is invalid");
  }
  const pressure =
    (Math.sqrt(coverage / count) * evaluation[2]) /
    Math.max(evaluation[3], 1.0e-12);
  if (!Number.isFinite(pressure) || pressure < 0) {
    throw new RangeError("Ancestor coverage pressure is invalid");
  }
  return pressure;
}

function canonicalJoin(index, state, view, policy, metrics) {
  const maximum = state.coverageNodeIndices.length;
  metrics.visitedNodeCount += maximum;
  const nodes = new Uint32Array(maximum);
  const representations = new Uint32Array(maximum);
  const starts = new Uint32Array(maximum);
  const counts = new Uint32Array(maximum);
  const topology = new Uint32Array(8);
  const parentTopology = new Uint32Array(8);
  const representation = new Float64Array(12);
  const parentRepresentation = new Float64Array(12);
  const segment = new Float64Array(8);
  const bounds = new Float64Array(6);
  const mathBounds = Array(6).fill(0);
  const evaluation = new Float64Array(2);
  let output = 0;
  for (let slot = 0; slot < maximum;) {
    const nodeIndex = state.coverageNodeIndices[slot];
    index.readNodeTopology(nodeIndex, topology);
    const parent = topology[0];
    let joined = false;
    if (parent !== INVALID_INDEX) {
      index.readNodeTopology(parent, parentTopology);
      const childCount = popcount8(parentTopology[2]);
      if (nodeIndex === parentTopology[1] && slot + childCount <= maximum) {
        index.readNodeProxy(parent, parentRepresentation);
        const parentRepresentationId = parentRepresentation[0];
        let canonical = true;
        let maximumCurrentError = 0;
        let maximumCurrentProjectedError = 0;
        for (let ordinal = 0; ordinal < childCount; ordinal++) {
          const childSlot = slot + ordinal;
          const childNode = parentTopology[1] + ordinal;
          if (
            state.coverageNodeIndices[childSlot] !== childNode ||
            state.providerRepresentationIds[childSlot] !==
              parentRepresentationId ||
            !readSegmentForChild(
              index,
              parentRepresentationId,
              childNode,
              segment,
              representation,
            ) ||
            state.providerRangeStarts[childSlot] !== segment[2] ||
            state.providerRangeCounts[childSlot] !== segment[3]
          ) {
            canonical = false;
            break;
          }
          const childError = segmentSelectionError(index, segment);
          maximumCurrentError = Math.max(maximumCurrentError, childError);
          evaluateNode(
            index,
            childNode,
            childError,
            view,
            bounds,
            mathBounds,
            evaluation,
          );
          maximumCurrentProjectedError = Math.max(
            maximumCurrentProjectedError,
            evaluation[1],
          );
        }
        if (canonical) {
          index.readRepresentation(parentRepresentationId, representation);
          const targetError = representationSelectionError(
            index,
            parentRepresentationId,
          );
          evaluateNode(
            index,
            parent,
            targetError,
            view,
            bounds,
            mathBounds,
            evaluation,
          );
          const visible = evaluation[0] === 1;
          const targetProjectedError = evaluation[1];
          if (
            !visible ||
            targetProjectedError <= policy.coarsenErrorPixels ||
            (targetError === maximumCurrentError &&
              targetProjectedError === maximumCurrentProjectedError)
          ) {
            nodes[output] = parent;
            representations[output] = parentRepresentationId;
            starts[output] = 0;
            counts[output] = representation[6];
            output++;
            slot += childCount;
            metrics.joinCount++;
            joined = true;
          }
        }
      }
    }
    if (!joined) {
      nodes[output] = state.coverageNodeIndices[slot];
      representations[output] = state.providerRepresentationIds[slot];
      starts[output] = state.providerRangeStarts[slot];
      counts[output] = state.providerRangeCounts[slot];
      output++;
      slot++;
    }
  }
  return {
    coverageNodeIndices: nodes.slice(0, output),
    providerRepresentationIds: representations.slice(0, output),
    providerRangeStarts: starts.slice(0, output),
    providerRangeCounts: counts.slice(0, output),
    selectedSplatCount: state.selectedSplatCount,
  };
}

function splitVisibleInternal(index, state, view, refineThreshold, metrics) {
  const maximum = state.coverageNodeIndices.length * MAX_SEGMENTED_CHILDREN;
  metrics.visitedNodeCount += state.coverageNodeIndices.length;
  const nodes = new Uint32Array(maximum);
  const representations = new Uint32Array(maximum);
  const starts = new Uint32Array(maximum);
  const counts = new Uint32Array(maximum);
  const topology = new Uint32Array(8);
  const representation = new Float64Array(12);
  const segment = new Float64Array(8);
  const bounds = new Float64Array(6);
  const mathBounds = Array(6).fill(0);
  const evaluation = new Float64Array(2);
  let output = 0;
  for (let slot = 0; slot < state.coverageNodeIndices.length; slot++) {
    const nodeIndex = state.coverageNodeIndices[slot];
    index.readNodeTopology(nodeIndex, topology);
    index.readRepresentation(
      state.providerRepresentationIds[slot],
      representation,
    );
    let split = false;
    if (representation[0] === nodeIndex && topology[2] !== 0) {
      evaluateNode(
        index,
        nodeIndex,
        representationSelectionError(
          index,
          state.providerRepresentationIds[slot],
        ),
        view,
        bounds,
        mathBounds,
        evaluation,
      );
      const visible = evaluation[0] === 1;
      const error = evaluation[1];
      if (visible && error > refineThreshold) {
        const childCount = popcount8(topology[2]);
        for (let ordinal = 0; ordinal < childCount; ordinal++) {
          const childNode = topology[1] + ordinal;
          index.readSegment(representation[2] + ordinal, segment);
          if (segment[1] !== childNode) {
            throw new Error("Split Segment child authority is invalid");
          }
          nodes[output] = childNode;
          representations[output] = state.providerRepresentationIds[slot];
          starts[output] = segment[2];
          counts[output] = segment[3];
          output++;
        }
        metrics.splitCount++;
        split = true;
      }
    }
    if (!split) {
      nodes[output] = nodeIndex;
      representations[output] = state.providerRepresentationIds[slot];
      starts[output] = state.providerRangeStarts[slot];
      counts[output] = state.providerRangeCounts[slot];
      output++;
    }
  }
  return {
    coverageNodeIndices: nodes.slice(0, output),
    providerRepresentationIds: representations.slice(0, output),
    providerRangeStarts: starts.slice(0, output),
    providerRangeCounts: counts.slice(0, output),
    selectedSplatCount: state.selectedSplatCount,
    scratchCapacity: maximum,
  };
}

function nextLeafRepresentation(index, leafOrdinal, currentId, direction) {
  if (direction < 0) {
    let found = false;
    for (let level = 6; level >= 0; level--) {
      const id = index.leafRepresentationId(leafOrdinal, level);
      if (id === currentId) {
        found = true;
      } else if (found) {
        return id;
      }
    }
  } else {
    let found = false;
    for (let level = 0; level <= 6; level++) {
      const id = index.leafRepresentationId(leafOrdinal, level);
      if (id === currentId) {
        found = true;
      } else if (found) {
        return id;
      }
    }
  }
  return INVALID_INDEX;
}

function leafRepresentationAllowed(
  index,
  leafOrdinal,
  representationId,
  minimumLeafLogicalLevel,
) {
  for (let level = minimumLeafLogicalLevel; level <= 6; level++) {
    if (index.leafRepresentationId(leafOrdinal, level) === representationId) {
      return true;
    }
  }
  return false;
}

function relativeErrorChange(currentError, targetError) {
  return (targetError - currentError) / Math.max(currentError, 1.0e-12);
}

function isMeaningfulUpgrade(currentProjectedError, targetProjectedError) {
  return targetProjectedError < currentProjectedError;
}

function findMeaningfulLeafTarget(
  index,
  leafOrdinal,
  currentId,
  currentError,
  currentProjectedError,
  nodeIndex,
  view,
  policy,
  representationScratch,
  boundsScratch,
  mathBoundsScratch,
  evaluationScratch,
  resultScratch,
) {
  let foundCurrent = false;
  let previousId = currentId;
  let plateauBlocked = false;
  for (let level = 6; level >= policy.minimumLeafLogicalLevel; level--) {
    const id = index.leafRepresentationId(leafOrdinal, level);
    if (!foundCurrent) {
      foundCurrent = id === currentId;
      continue;
    }
    if (id === previousId) {
      continue;
    }
    previousId = id;
    index.readRepresentation(id, representationScratch);
    const targetError = representationSelectionError(index, id);
    evaluateNode(
      index,
      nodeIndex,
      targetError,
      view,
      boundsScratch,
      mathBoundsScratch,
      evaluationScratch,
    );
    const targetProjectedError = evaluationScratch[1];
    if (isMeaningfulUpgrade(currentProjectedError, targetProjectedError)) {
      resultScratch[0] = id;
      resultScratch[1] = representationScratch[6];
      resultScratch[2] = targetError;
      resultScratch[3] = targetProjectedError;
      resultScratch[4] = 0;
      return true;
    }
    if (
      targetError === currentError &&
      targetProjectedError === currentProjectedError
    ) {
      plateauBlocked = true;
    }
  }
  resultScratch[4] = Number(plateauBlocked);
  return false;
}

function floatSortableWords(values) {
  const low = new Uint32Array(values.length);
  const high = new Uint32Array(values.length);
  const scalar = new DataView(new ArrayBuffer(8));
  for (let index = 0; index < values.length; index++) {
    scalar.setFloat64(0, values[index], true);
    low[index] = scalar.getUint32(0, true);
    high[index] = scalar.getUint32(4, true);
  }
  return { low, high };
}

function stableRadixBytePass(
  source,
  target,
  values,
  shift,
  descending,
  counts,
) {
  counts.fill(0);
  const inversion = descending ? 0xff : 0;
  for (let index = 0; index < source.length; index++) {
    counts[((values[source[index]] >>> shift) & 0xff) ^ inversion]++;
  }
  let offset = 0;
  for (let bucket = 0; bucket < counts.length; bucket++) {
    const length = counts[bucket];
    counts[bucket] = offset;
    offset += length;
  }
  for (let index = 0; index < source.length; index++) {
    const candidateIndex = source[index];
    const digit = ((values[candidateIndex] >>> shift) & 0xff) ^ inversion;
    target[counts[digit]++] = candidateIndex;
  }
}

function orderCandidatesLinear(fields, candidateCount) {
  const order = new Uint32Array(candidateCount);
  if (candidateCount === 0) {
    return {
      order,
      passCount: 0,
      workCount: 0,
      maximumScratchSlots: 0,
    };
  }
  const temporary = new Uint32Array(candidateCount);
  for (let index = 0; index < candidateCount; index++) {
    order[index] = index;
  }
  const currentErrorWords = floatSortableWords(
    fields.currentProjectedError.subarray(0, candidateCount),
  );
  const benefitWords = floatSortableWords(
    fields.benefit.subarray(0, candidateCount),
  );
  const ratioWords = floatSortableWords(
    fields.ratio.subarray(0, candidateCount),
  );
  const coveragePressureWords = floatSortableWords(
    fields.coveragePressure.subarray(0, candidateCount),
  );
  const coverageBenefitPerSplatWords = floatSortableWords(
    fields.coverageBenefitPerSplat.subarray(0, candidateCount),
  );
  const counts = new Uint32Array(256);
  let source = order;
  let target = temporary;
  let passCount = 0;
  let workCount = 4 * candidateCount;
  function pass(values, shift, descending = false) {
    stableRadixBytePass(source, target, values, shift, descending, counts);
    [source, target] = [target, source];
    passCount++;
    workCount += 2 * candidateCount + 2 * counts.length;
  }
  function word(values, descending = false) {
    pass(values, 0, descending);
    pass(values, 8, descending);
    pass(values, 16, descending);
    pass(values, 24, descending);
  }
  function float(words, descending = false) {
    word(words.low, descending);
    word(words.high, descending);
  }

  word(fields.newRepresentation, false);
  word(fields.prefixLow, false);
  word(fields.prefixHigh, false);
  pass(fields.depth, 0, true);
  float(benefitWords, true);
  float(currentErrorWords, true);
  float(ratioWords, true);
  float(coverageBenefitPerSplatWords, true);
  float(coveragePressureWords, true);
  pass(fields.lane, 0, true);
  return {
    order: source,
    passCount,
    workCount,
    maximumScratchSlots: Math.max(candidateCount, counts.length),
  };
}

class SegmentedActiveCutPlan {
  constructor(state, projectedCut, metrics) {
    this.artifactIdentityHex = state.artifactIdentityHex;
    this.policyIdentity = state.policy.policyIdentity;
    this.replacementCount = state.slotIndices.length;
    this.projectedCut = projectedCut;
    this.stopReason = metrics.stopReason;
    this.metrics = Object.freeze({ ...metrics });
    planInternals.set(this, state);
    Object.freeze(this);
  }

  get replacementKinds() {
    return planInternals.get(this).kinds.slice();
  }
  get replacementCoverageNodeIndices() {
    return planInternals.get(this).coverageNodeIndices.slice();
  }
  get oldRepresentationIds() {
    return planInternals.get(this).oldRepresentationIds.slice();
  }
  get newRepresentationIds() {
    return planInternals.get(this).newRepresentationIds.slice();
  }
  get deltas() {
    return planInternals.get(this).deltas.slice();
  }

  readReplacement(recordIndex, scratch, currentCut) {
    const state = planInternals.get(this);
    if (currentCut !== undefined) {
      const current = getCut(currentCut);
      if (
        !wordsEqual(
          current.artifactIdentityWords,
          state.artifactIdentityWords,
        ) ||
        !arraysEqual(
          current.coverageNodeIndices,
          state.currentCoverageNodeIndices,
        ) ||
        !arraysEqual(
          current.providerRepresentationIds,
          state.currentProviderRepresentationIds,
        ) ||
        !arraysEqual(
          current.providerRangeStarts,
          state.currentProviderRangeStarts,
        ) ||
        !arraysEqual(
          current.providerRangeCounts,
          state.currentProviderRangeCounts,
        ) ||
        current.selectedSplatCount !== state.currentSelectedSplatCount ||
        current.maximumSelectedSplats !== state.policy.maximumSelectedSplats
      ) {
        throw new Error("Segmented active-cut plan is stale or rebound");
      }
    }
    if (
      !Number.isSafeInteger(recordIndex) ||
      recordIndex < 0 ||
      recordIndex >= state.slotIndices.length
    ) {
      throw new RangeError("Replacement record index is out of range");
    }
    if (!(scratch instanceof Float64Array) || scratch.length < 10) {
      throw new TypeError("Replacement scratch must be Float64Array[10]");
    }
    scratch[0] = state.kinds[recordIndex];
    scratch[1] = state.coverageNodeIndices[recordIndex];
    scratch[2] = state.oldRepresentationIds[recordIndex];
    scratch[3] = state.oldRangeStarts[recordIndex];
    scratch[4] = state.oldRangeCounts[recordIndex];
    scratch[5] = state.newRepresentationIds[recordIndex];
    scratch[6] = state.newRangeStarts[recordIndex];
    scratch[7] = state.newRangeCounts[recordIndex];
    scratch[8] = state.deltas[recordIndex];
    scratch[9] = state.slotIndices[recordIndex];
    return scratch;
  }
}

export function planSegmentedActiveCut(index, currentCut, view, options = {}) {
  requireProtocol(index);
  requireProjectedView(view);
  const current = getCut(currentCut);
  requireSameArtifact(index, current.artifactIdentityWords, "Cut");
  validateCutArrays(index, current);
  const policy = normalizePlanOptions(current, options);
  const metrics = { visitedNodeCount: 0, splitCount: 0, joinCount: 0 };
  const joined = canonicalJoin(index, current, view, policy, metrics);
  const projectedArrays = splitVisibleInternal(
    index,
    joined,
    view,
    policy.refineErrorPixels,
    metrics,
  );
  const projectedCut = makeCut(
    index,
    projectedArrays,
    policy.maximumSelectedSplats,
    {
      ...metrics,
      maximumScratchSlots: Math.max(
        current.coverageNodeIndices.length,
        joined.coverageNodeIndices.length,
        projectedArrays.scratchCapacity,
      ),
    },
  );
  const projected = getCut(projectedCut);
  const capacity = projected.coverageNodeIndices.length;
  const coarsenSlot = new Uint32Array(capacity);
  const coarsenKind = new Uint8Array(capacity);
  const coarsenNewRepresentation = new Uint32Array(capacity);
  const coarsenNewStart = new Uint32Array(capacity);
  const coarsenNewCount = new Uint32Array(capacity);
  let coarsenCount = 0;
  const candidate = {
    lane: new Uint8Array(capacity),
    slot: new Uint32Array(capacity),
    kind: new Uint8Array(capacity),
    newRepresentation: new Uint32Array(capacity),
    newStart: new Uint32Array(capacity),
    newCount: new Uint32Array(capacity),
    delta: new Float64Array(capacity),
    benefit: new Float64Array(capacity),
    ratio: new Float64Array(capacity),
    relativeReduction: new Float64Array(capacity),
    currentProjectedError: new Float64Array(capacity),
    coveragePressure: new Float64Array(capacity),
    coverageBenefit: new Float64Array(capacity),
    coverageBenefitPerSplat: new Float64Array(capacity),
    depth: new Uint8Array(capacity),
    prefixLow: new Uint32Array(capacity),
    prefixHigh: new Uint32Array(capacity),
  };
  let candidateCount = 0;
  let visibleOverThresholdSlotCount = 0;
  let visibleAncestorCoverageOverThresholdCount = 0;
  let coverageCandidateCount = 0;
  let qualityCandidateCount = 0;
  let coverageCoarsenVetoCount = 0;
  let largestAncestorCoveragePressurePixels = 0;
  let plateauBlockedCandidateCount = 0;
  let plateauBlockedInternalCount = 0;
  let postCoarsenSelectedSplats = projected.selectedSplatCount;
  const topology = new Uint32Array(8);
  const representation = new Float64Array(12);
  const targetRepresentation = new Float64Array(12);
  const segment = new Float64Array(8);
  const bounds = new Float64Array(6);
  const mathBounds = Array(6).fill(0);
  const evaluation = new Float64Array(4);
  const leafTarget = new Float64Array(5);
  const parentProxy = new Float64Array(4);
  metrics.visitedNodeCount += capacity;
  for (let slot = 0; slot < capacity; slot++) {
    const nodeIndex = projected.coverageNodeIndices[slot];
    const currentRepresentationId = projected.providerRepresentationIds[slot];
    index.readNodeTopology(nodeIndex, topology);
    index.readRepresentation(currentRepresentationId, representation);
    const own = representation[0] === nodeIndex;
    let oldError = representationSelectionError(index, currentRepresentationId);
    if (!own) {
      if (
        !readSegmentForChild(
          index,
          currentRepresentationId,
          nodeIndex,
          segment,
          targetRepresentation,
        )
      ) {
        throw new Error("Current provider Segment is missing");
      }
      oldError = segmentSelectionError(index, segment);
    }
    evaluateNode(
      index,
      nodeIndex,
      oldError,
      view,
      bounds,
      mathBounds,
      evaluation,
    );
    const visible = evaluation[0] === 1;
    const oldProjectedError = evaluation[1];
    const currentCoveragePressure = own
      ? 0
      : coveragePressure(
          segment[6],
          projected.providerRangeCounts[slot],
          evaluation,
        );
    if (!own && visible) {
      largestAncestorCoveragePressurePixels = Math.max(
        largestAncestorCoveragePressurePixels,
        currentCoveragePressure,
      );
      if (
        currentCoveragePressure > policy.ancestorCoveragePressureRefinePixels
      ) {
        visibleAncestorCoverageOverThresholdCount++;
      }
    }
    if (visible && oldProjectedError > policy.refineErrorPixels) {
      visibleOverThresholdSlotCount++;
    }
    let targetId = INVALID_INDEX;
    let targetStart = 0;
    let targetCount = 0;
    let transition = 0;
    let targetError = 0;
    if (own && topology[0] !== INVALID_INDEX) {
      if (topology[2] === 0) {
        targetId = nextLeafRepresentation(
          index,
          topology[6],
          currentRepresentationId,
          1,
        );
        if (targetId !== INVALID_INDEX) {
          index.readRepresentation(targetId, targetRepresentation);
          targetCount = targetRepresentation[6];
          targetError = representationSelectionError(index, targetId);
          transition = TRANSITION.LEAF_COARSEN;
        }
      }
      if (targetId === INVALID_INDEX) {
        const parentNode = topology[0];
        index.readNodeProxy(parentNode, parentProxy);
        targetId = parentProxy[0];
        if (
          readSegmentForChild(
            index,
            targetId,
            nodeIndex,
            segment,
            targetRepresentation,
          )
        ) {
          targetStart = segment[2];
          targetCount = segment[3];
          targetError = segmentSelectionError(index, segment);
          transition = TRANSITION.INTERNAL_COARSEN;
        } else {
          targetId = INVALID_INDEX;
        }
      }
      if (targetId !== INVALID_INDEX) {
        evaluateNode(
          index,
          nodeIndex,
          targetError,
          view,
          bounds,
          mathBounds,
          evaluation,
        );
        const targetProjectedError = evaluation[1];
        const coarseTargetCoveragePressure =
          transition === TRANSITION.INTERNAL_COARSEN
            ? coveragePressure(segment[6], targetCount, evaluation)
            : 0;
        const coverageCoarsenVeto =
          transition === TRANSITION.INTERNAL_COARSEN &&
          visible &&
          coarseTargetCoveragePressure >
            policy.ancestorCoveragePressureCoarsenPixels;
        if (coverageCoarsenVeto) {
          coverageCoarsenVetoCount++;
        }
        const forceMinimumLeaf =
          transition === TRANSITION.LEAF_COARSEN &&
          !leafRepresentationAllowed(
            index,
            topology[6],
            currentRepresentationId,
            policy.minimumLeafLogicalLevel,
          );
        const exactVisualAlias =
          targetCount < projected.providerRangeCounts[slot] &&
          targetError === oldError &&
          targetProjectedError === oldProjectedError;
        if (
          !coverageCoarsenVeto &&
          (forceMinimumLeaf ||
            !visible ||
            targetProjectedError <= policy.coarsenErrorPixels ||
            exactVisualAlias)
        ) {
          coarsenSlot[coarsenCount] = slot;
          coarsenKind[coarsenCount] = transition;
          coarsenNewRepresentation[coarsenCount] = targetId;
          coarsenNewStart[coarsenCount] = targetStart;
          coarsenNewCount[coarsenCount] = targetCount;
          postCoarsenSelectedSplats = exactCountAdd(
            postCoarsenSelectedSplats,
            targetCount - projected.providerRangeCounts[slot],
            "post-coarsen selected splats",
          );
          coarsenCount++;
          continue;
        }
      }
    }
    if (!visible) {
      continue;
    }
    let targetProjectedError;
    let lane = 0;
    let candidateCoveragePressure = 0;
    let coverageBenefit = 0;
    if (!own) {
      index.readNodeProxy(nodeIndex, parentProxy);
      targetId = parentProxy[0];
      index.readRepresentation(targetId, targetRepresentation);
      targetCount = targetRepresentation[6];
      targetStart = 0;
      targetError = representationSelectionError(index, targetId);
      transition = TRANSITION.INTERNAL_UPGRADE;
      if (targetCount > 2 * projected.providerRangeCounts[slot] + 1) {
        throw new Error("Internal upgrade violates the local half-rate bound");
      }
    } else if (topology[2] === 0) {
      if (oldProjectedError <= policy.refineErrorPixels) {
        continue;
      }
      leafTarget.fill(0);
      if (
        !findMeaningfulLeafTarget(
          index,
          topology[6],
          currentRepresentationId,
          oldError,
          oldProjectedError,
          nodeIndex,
          view,
          policy,
          targetRepresentation,
          bounds,
          mathBounds,
          evaluation,
          leafTarget,
        )
      ) {
        if (leafTarget[4] === 1) {
          plateauBlockedCandidateCount++;
        }
        continue;
      }
      targetId = leafTarget[0];
      targetCount = leafTarget[1];
      targetStart = 0;
      targetError = leafTarget[2];
      targetProjectedError = leafTarget[3];
      transition = TRANSITION.LEAF_UPGRADE;
    } else {
      continue;
    }
    if (targetProjectedError === undefined) {
      evaluateNode(
        index,
        nodeIndex,
        targetError,
        view,
        bounds,
        mathBounds,
        evaluation,
      );
      targetProjectedError = evaluation[1];
      const meaningfulQualityUpgrade =
        oldProjectedError > policy.refineErrorPixels &&
        isMeaningfulUpgrade(oldProjectedError, targetProjectedError);
      const targetCoveragePressure = coveragePressure(
        targetRepresentation[10],
        targetCount,
        evaluation,
      );
      const coverageUpgrade =
        currentCoveragePressure > policy.ancestorCoveragePressureRefinePixels &&
        targetCount > projected.providerRangeCounts[slot] &&
        targetCoveragePressure < currentCoveragePressure;
      if (!meaningfulQualityUpgrade && !coverageUpgrade) {
        if (oldProjectedError <= policy.refineErrorPixels) {
          continue;
        }
        if (
          targetError === oldError &&
          targetProjectedError === oldProjectedError
        ) {
          plateauBlockedCandidateCount++;
          plateauBlockedInternalCount++;
        }
        continue;
      }
      if (coverageUpgrade) {
        lane = 1;
        candidateCoveragePressure = currentCoveragePressure;
        coverageBenefit = currentCoveragePressure - targetCoveragePressure;
      }
    }
    const delta = targetCount - projected.providerRangeCounts[slot];
    if (!Number.isSafeInteger(delta) || delta < 0) {
      throw new Error("Refine replacement delta is invalid");
    }
    const benefit = oldProjectedError - targetProjectedError;
    const relativeReduction = -relativeErrorChange(oldError, targetError);
    if (!Number.isFinite(benefit) || (lane === 0 && benefit <= 0)) {
      continue;
    }
    const ratio =
      lane === 1 ? 0 : delta === 0 ? Number.MAX_VALUE : benefit / delta;
    const coverageBenefitPerSplat =
      lane === 1
        ? delta === 0
          ? Number.MAX_VALUE
          : coverageBenefit / delta
        : 0;
    if (!Number.isFinite(ratio) || ratio < 0) {
      throw new Error("Refine candidate priority is invalid");
    }
    candidate.lane[candidateCount] = lane;
    candidate.slot[candidateCount] = slot;
    candidate.kind[candidateCount] = transition;
    candidate.newRepresentation[candidateCount] = targetId;
    candidate.newStart[candidateCount] = targetStart;
    candidate.newCount[candidateCount] = targetCount;
    candidate.delta[candidateCount] = delta;
    candidate.benefit[candidateCount] = lane === 1 ? 0 : benefit;
    candidate.ratio[candidateCount] = ratio;
    candidate.relativeReduction[candidateCount] = relativeReduction;
    candidate.currentProjectedError[candidateCount] =
      lane === 1 ? 0 : oldProjectedError;
    candidate.coveragePressure[candidateCount] = candidateCoveragePressure;
    candidate.coverageBenefit[candidateCount] = coverageBenefit;
    candidate.coverageBenefitPerSplat[candidateCount] = coverageBenefitPerSplat;
    candidate.depth[candidateCount] = topology[3];
    candidate.prefixLow[candidateCount] = topology[4];
    candidate.prefixHigh[candidateCount] = topology[5];
    if (lane === 1) {
      coverageCandidateCount++;
    } else {
      qualityCandidateCount++;
    }
    candidateCount++;
  }

  const ordering = orderCandidatesLinear(candidate, candidateCount);
  const order = ordering.order;
  const admitted = new Uint32Array(candidateCount);
  let admittedCount = 0;
  let budgetAdmissibleCandidateCount = 0;
  let coverageBudgetAdmissibleCandidateCount = 0;
  let coverageAdmittedUpgradeCount = 0;
  let smallestAdmittedCoverageBenefitPixels = Number.POSITIVE_INFINITY;
  let admittedSelected = postCoarsenSelectedSplats;
  for (const candidateIndex of order) {
    const delta = candidate.delta[candidateIndex];
    if (delta <= policy.maximumSelectedSplats - postCoarsenSelectedSplats) {
      budgetAdmissibleCandidateCount++;
      if (candidate.lane[candidateIndex] === 1) {
        coverageBudgetAdmissibleCandidateCount++;
      }
    }
    if (
      admittedCount === 0 &&
      delta <= policy.maximumSelectedSplats - admittedSelected
    ) {
      admitted[admittedCount++] = candidateIndex;
      admittedSelected += delta;
      if (candidate.lane[candidateIndex] === 1) {
        coverageAdmittedUpgradeCount++;
        smallestAdmittedCoverageBenefitPixels = Math.min(
          smallestAdmittedCoverageBenefitPixels,
          candidate.coverageBenefit[candidateIndex],
        );
      }
    }
  }
  const replacementCount = coarsenCount + admittedCount;
  let stopReason;
  if (replacementCount === 0) {
    stopReason =
      visibleOverThresholdSlotCount === 0 &&
      visibleAncestorCoverageOverThresholdCount === 0
        ? SEGMENTED_ACTIVE_CUT_STOP_REASON.SSE_SATISFIED
        : candidateCount > 0 && budgetAdmissibleCandidateCount === 0
          ? SEGMENTED_ACTIVE_CUT_STOP_REASON.BUDGET_LIMITED
          : plateauBlockedCandidateCount > 0
            ? SEGMENTED_ACTIVE_CUT_STOP_REASON.QUALITY_PLATEAU
            : SEGMENTED_ACTIVE_CUT_STOP_REASON.DETAIL_EXHAUSTED;
  }
  const replacement = {
    slotIndices: new Uint32Array(replacementCount),
    kinds: new Uint8Array(replacementCount),
    coverageNodeIndices: new Uint32Array(replacementCount),
    depth: new Uint8Array(replacementCount),
    prefixLow: new Uint32Array(replacementCount),
    prefixHigh: new Uint32Array(replacementCount),
    oldRepresentationIds: new Uint32Array(replacementCount),
    oldRangeStarts: new Uint32Array(replacementCount),
    oldRangeCounts: new Uint32Array(replacementCount),
    newRepresentationIds: new Uint32Array(replacementCount),
    newRangeStarts: new Uint32Array(replacementCount),
    newRangeCounts: new Uint32Array(replacementCount),
    deltas: new Float64Array(replacementCount),
  };
  function writeReplacement(output, slot, kind, newId, newStart, newCount) {
    index.readNodeTopology(projected.coverageNodeIndices[slot], topology);
    replacement.slotIndices[output] = slot;
    replacement.kinds[output] = kind;
    replacement.coverageNodeIndices[output] =
      projected.coverageNodeIndices[slot];
    replacement.depth[output] = topology[3];
    replacement.prefixLow[output] = topology[4];
    replacement.prefixHigh[output] = topology[5];
    replacement.oldRepresentationIds[output] =
      projected.providerRepresentationIds[slot];
    replacement.oldRangeStarts[output] = projected.providerRangeStarts[slot];
    replacement.oldRangeCounts[output] = projected.providerRangeCounts[slot];
    replacement.newRepresentationIds[output] = newId;
    replacement.newRangeStarts[output] = newStart;
    replacement.newRangeCounts[output] = newCount;
    replacement.deltas[output] = newCount - projected.providerRangeCounts[slot];
  }
  for (let index = 0; index < coarsenCount; index++) {
    writeReplacement(
      index,
      coarsenSlot[index],
      coarsenKind[index],
      coarsenNewRepresentation[index],
      coarsenNewStart[index],
      coarsenNewCount[index],
    );
  }
  for (let index = 0; index < admittedCount; index++) {
    const candidateIndex = admitted[index];
    writeReplacement(
      coarsenCount + index,
      candidate.slot[candidateIndex],
      candidate.kind[candidateIndex],
      candidate.newRepresentation[candidateIndex],
      candidate.newStart[candidateIndex],
      candidate.newCount[candidateIndex],
    );
  }
  const projection = projectSegmentedActiveCutProviders(index, projectedCut);
  const planMetrics = {
    selectionErrorMetric: policy.selectionErrorMetric,
    visitedNodeCount: metrics.visitedNodeCount,
    activeSlotCount: projected.coverageNodeIndices.length,
    ancestorProviderSlotCount: projectedCut.metrics.ancestorProviderSlotCount,
    splitCount: metrics.splitCount,
    joinCount: metrics.joinCount,
    candidateCount,
    visibleOverThresholdSlotCount,
    qualityCandidateCount,
    visibleAncestorCoverageOverThresholdCount,
    coverageCandidateCount,
    coverageBudgetAdmissibleCandidateCount,
    coverageAdmittedUpgradeCount,
    coverageCoarsenVetoCount,
    largestAncestorCoveragePressurePixels,
    smallestAdmittedCoverageBenefitPixels:
      smallestAdmittedCoverageBenefitPixels === Number.POSITIVE_INFINITY
        ? 0
        : smallestAdmittedCoverageBenefitPixels,
    coveragePressurePolicyIdentity: policy.coveragePressurePolicyIdentity,
    budgetAdmissibleCandidateCount,
    candidateOrderingPassCount: ordering.passCount,
    candidateOrderingWorkCount: ordering.workCount,
    admittedUpgradeCount: admittedCount,
    plateauBlockedCandidateCount,
    plateauBlockedInternalCount,
    largestAdmittedDeltaSplats:
      admittedCount === 0 ? 0 : candidate.delta[admitted[0]],
    smallestAdmittedProjectedBenefitPixels:
      admittedCount === 0 ? 0 : candidate.benefit[admitted[0]],
    smallestAdmittedRelativeErrorReduction:
      admittedCount === 0 ? 0 : candidate.relativeReduction[admitted[0]],
    plannedCoarsenCount: coarsenCount,
    readyCommittedCount: 0,
    selectedSplatCount: admittedSelected,
    remainingBudget: policy.maximumSelectedSplats - admittedSelected,
    stopReason,
    providerIntervalCount: projection.intervalCount,
    addedProviderIntervalCount: 0,
    removedProviderIntervalCount: 0,
    coverageHoleCount: 0,
    coverageOverlapCount: 0,
    maximumTraversalDepth: projectedCut.metrics.maximumTraversalDepth,
    maximumScratchSlots: Math.max(
      current.coverageNodeIndices.length,
      projectedArrays.scratchCapacity,
      projected.coverageNodeIndices.length,
      candidateCount,
      replacementCount,
      ordering.maximumScratchSlots,
    ),
  };
  return new SegmentedActiveCutPlan(
    {
      artifactIdentityWords: current.artifactIdentityWords.slice(),
      artifactIdentityHex: current.artifactIdentityHex,
      policy,
      currentCoverageNodeIndices: current.coverageNodeIndices.slice(),
      currentProviderRepresentationIds:
        current.providerRepresentationIds.slice(),
      currentProviderRangeStarts: current.providerRangeStarts.slice(),
      currentProviderRangeCounts: current.providerRangeCounts.slice(),
      currentSelectedSplatCount: current.selectedSplatCount,
      projectedCut,
      ...replacement,
    },
    projectedCut,
    planMetrics,
  );
}

class ViewPriorityCandidateHeap {
  constructor(capacity) {
    this.length = 0;
    this.capacity = capacity;
    this.nodes = new Uint32Array(capacity);
    this.generations = new Uint32Array(capacity);
    this.distances = new Float64Array(capacity);
    this.priorities = new Float64Array(capacity);
    this.deltas = new Float64Array(capacity);
    this.depths = new Uint8Array(capacity);
    this.prefixHigh = new Uint32Array(capacity);
    this.prefixLow = new Uint32Array(capacity);
    this.targets = new Uint32Array(capacity);
    this.edges = new Uint8Array(capacity);
  }

  better(left, right) {
    if (this.priorities[left] !== this.priorities[right]) {
      return this.priorities[left] > this.priorities[right];
    }
    if (this.distances[left] !== this.distances[right]) {
      return this.distances[left] < this.distances[right];
    }
    if (this.deltas[left] !== this.deltas[right]) {
      return this.deltas[left] < this.deltas[right];
    }
    for (const values of [
      this.depths,
      this.prefixHigh,
      this.prefixLow,
      this.nodes,
      this.targets,
      this.edges,
    ]) {
      if (values[left] !== values[right]) {
        return values[left] < values[right];
      }
    }
    return false;
  }

  swap(left, right) {
    for (const values of [
      this.nodes,
      this.generations,
      this.distances,
      this.priorities,
      this.deltas,
      this.depths,
      this.prefixHigh,
      this.prefixLow,
      this.targets,
      this.edges,
    ]) {
      const value = values[left];
      values[left] = values[right];
      values[right] = value;
    }
  }

  push(candidate) {
    if (this.length >= this.capacity) {
      throw new Error(
        "View-priority candidate heap exceeds coverage-slot bound",
      );
    }
    let slot = this.length++;
    this.nodes[slot] = candidate.node;
    this.generations[slot] = candidate.generation;
    this.distances[slot] = candidate.exactDistance;
    this.priorities[slot] = candidate.priorityProjectedError;
    this.deltas[slot] = candidate.delta;
    this.depths[slot] = candidate.depth;
    this.prefixHigh[slot] = candidate.prefixHigh;
    this.prefixLow[slot] = candidate.prefixLow;
    this.targets[slot] = candidate.targetRepresentationId;
    this.edges[slot] = candidate.edge;
    while (slot > 0) {
      const parent = (slot - 1) >> 1;
      if (!this.better(slot, parent)) {
        break;
      }
      this.swap(slot, parent);
      slot = parent;
    }
  }

  pop() {
    if (this.length === 0) {
      return undefined;
    }
    const result = {
      node: this.nodes[0],
      generation: this.generations[0],
    };
    this.length--;
    if (this.length > 0) {
      for (const values of [
        this.nodes,
        this.generations,
        this.distances,
        this.priorities,
        this.deltas,
        this.depths,
        this.prefixHigh,
        this.prefixLow,
        this.targets,
        this.edges,
      ]) {
        values[0] = values[this.length];
      }
      let slot = 0;
      for (;;) {
        const left = slot * 2 + 1;
        if (left >= this.length) {
          break;
        }
        const right = left + 1;
        let best = left;
        if (right < this.length && this.better(right, left)) {
          best = right;
        }
        if (!this.better(best, slot)) {
          break;
        }
        this.swap(slot, best);
        slot = best;
      }
    }
    return result;
  }
}

function createViewPriorityGeometry(index, view) {
  const geometry = createSegmentedViewGeometry(view);
  const readCropBounds = createSegmentedCropBoundsReader(index);
  const crop = new Float64Array(4);
  const rankingBounds = new Float64Array(6);
  const contentGeometry = new Float64Array(2);
  const pixelFraction =
    1 / (view.drawingBufferWidth * view.drawingBufferHeight);
  return function measure(node, contentBounds, result) {
    readCropBounds(node, crop);
    rankingBounds.set(contentBounds);
    rankingBounds[0] = Math.max(contentBounds[0], crop[0]);
    rankingBounds[1] = Math.max(contentBounds[1], crop[1]);
    rankingBounds[3] = Math.min(contentBounds[3], crop[2]);
    rankingBounds[4] = Math.min(contentBounds[4], crop[3]);
    // The shader owns centers in XY and preserves their full footprints.
    // These bounds rank refinements only; content Z and conservative SSE /
    // visibility remain unchanged.
    if (
      rankingBounds[0] > rankingBounds[3] ||
      rankingBounds[1] > rankingBounds[4]
    ) {
      result[0] = 0;
      result[1] = 1;
      return result;
    }
    geometry.measure(rankingBounds, result);
    if (result[0] === 0) {
      geometry.measure(contentBounds, contentGeometry);
      if (contentGeometry[0] > 0) {
        result[0] = Math.min(contentGeometry[0], pixelFraction);
        result[1] = contentGeometry[1];
      }
    }
    return result;
  };
}

function buildViewPriorityCanonicalTarget(index, view, policy) {
  const measureViewGeometry = createViewPriorityGeometry(index, view);
  const topology = new Uint32Array(8);
  const representation = new Float64Array(12);
  const segment = new Float64Array(8);
  const proxy = new Float64Array(4);
  const bounds = new Float64Array(6);
  const mathBounds = Array(6).fill(0);
  const evaluation = new Float64Array(4);
  const frontier = new Map();
  // Each active state is offered once and is popped before replacement or
  // splitting. The heap therefore cannot exceed the tree's node count, even
  // when the logical coverage budget is much larger than this artifact.
  const heap = new ViewPriorityCandidateHeap(
    Math.min(index.nodeCount, policy.maximumCoverageSlots),
  );
  let generation = 0;
  let selectedSplatCount;
  let admittedEdgeCount = 0;
  let skippedBudgetCandidateCount = 0;
  let skippedCoverageSlotCandidateCount = 0;
  let visitedNodeCount = 0;
  let maximumHeapSize = 0;
  let largestPriorityProjectedError = 0;
  let smallestAdmittedDistanceBand = Number.POSITIVE_INFINITY;
  let largestAdmittedDistanceBand = 0;

  function candidateFor(state, terminalMetrics) {
    index.readNodeTopology(state.node, topology);
    index.readRepresentation(state.providerRepresentationId, representation);
    const own = representation[0] === state.node;
    let error;
    let coverageNeed = 0;
    let edge;
    let targetRepresentationId;
    let targetCount;
    let targetError;
    let targetCoverage = 0;
    let slotDelta = 0;
    if (!own) {
      if (
        !readSegmentForChild(
          index,
          state.providerRepresentationId,
          state.node,
          segment,
          representation,
        )
      ) {
        throw new Error("View-priority provider Segment is missing");
      }
      error = segmentSelectionError(index, segment);
      edge = TRANSITION.INTERNAL_UPGRADE;
      index.readNodeProxy(state.node, proxy);
      targetRepresentationId = proxy[0];
      index.readRepresentation(targetRepresentationId, representation);
      targetCount = representation[6];
      targetError = representationSelectionError(index, targetRepresentationId);
      targetCoverage = representation[10];
      if (targetCount > 2 * state.rangeCount + 1) {
        throw new Error("Internal upgrade violates the local half-rate bound");
      }
    } else if (topology[2] !== 0) {
      error = representationSelectionError(
        index,
        state.providerRepresentationId,
      );
      edge = 0;
      targetRepresentationId = state.providerRepresentationId;
      targetCount = state.rangeCount;
      slotDelta = popcount8(topology[2]) - 1;
    } else {
      error = representationSelectionError(
        index,
        state.providerRepresentationId,
      );
      edge = TRANSITION.LEAF_UPGRADE;
      let foundCurrent = false;
      let previousId = state.providerRepresentationId;
      targetRepresentationId = INVALID_INDEX;
      for (let level = 6; level >= policy.minimumLeafLogicalLevel; level--) {
        const id = index.leafRepresentationId(topology[6], level);
        if (!foundCurrent) {
          foundCurrent = id === state.providerRepresentationId;
          continue;
        }
        if (id === previousId) {
          continue;
        }
        previousId = id;
        const candidateError = representationSelectionError(index, id);
        if (candidateError < error) {
          targetRepresentationId = id;
          targetError = candidateError;
          break;
        }
      }
      if (targetRepresentationId === INVALID_INDEX) {
        if (!terminalMetrics) {
          return undefined;
        }
      } else {
        index.readRepresentation(targetRepresentationId, representation);
        targetCount = representation[6];
      }
    }
    evaluateNode(
      index,
      state.node,
      error,
      view,
      bounds,
      mathBounds,
      evaluation,
    );
    visitedNodeCount++;
    if (evaluation[0] !== 1) {
      return undefined;
    }
    if (!own) {
      coverageNeed = coveragePressure(segment[6], state.rangeCount, evaluation);
    }
    const actualProjectedError = evaluation[1];
    const distance = evaluation[3];
    const qualityNeed = actualProjectedError > policy.refineErrorPixels;
    const ancestorCoverageNeed =
      !own && coverageNeed > policy.ancestorCoveragePressureRefinePixels;
    let qualityEligible = edge === 0 && qualityNeed;
    let coverageEligible = false;
    if (edge !== 0) {
      qualityEligible = qualityNeed && targetError < error;
      if (ancestorCoverageNeed) {
        evaluateNode(
          index,
          state.node,
          targetError,
          view,
          bounds,
          mathBounds,
          evaluation,
        );
        const targetPressure = coveragePressure(
          targetCoverage,
          targetCount,
          evaluation,
        );
        coverageEligible = targetPressure < coverageNeed;
      }
    }
    if (terminalMetrics) {
      terminalMetrics.visibleOverThresholdSlotCount += Number(qualityNeed);
      terminalMetrics.visibleAncestorCoverageOverThresholdCount +=
        Number(ancestorCoverageNeed);
      terminalMetrics.largestAncestorCoveragePressurePixels = Math.max(
        terminalMetrics.largestAncestorCoveragePressurePixels,
        coverageNeed,
      );
      terminalMetrics.visibleNeedsRefinementSlotCount += Number(
        qualityNeed || ancestorCoverageNeed,
      );
      terminalMetrics.qualityCandidateCount += Number(qualityEligible);
      terminalMetrics.coverageCandidateCount += Number(coverageEligible);
      if (qualityEligible || coverageEligible) {
        const budgetBlocked =
          targetCount - state.rangeCount >
          policy.maximumSelectedSplats - selectedSplatCount;
        const frontierBlocked =
          slotDelta > policy.maximumCoverageSlots - frontier.size;
        terminalMetrics.budgetBlockedSlotCount += Number(budgetBlocked);
        terminalMetrics.frontierBlockedSlotCount += Number(frontierBlocked);
        terminalMetrics.budgetAdmissibleCandidateCount += Number(
          !budgetBlocked && !frontierBlocked,
        );
        terminalMetrics.coverageBudgetAdmissibleCandidateCount += Number(
          coverageEligible && !budgetBlocked && !frontierBlocked,
        );
      } else if (qualityNeed || ancestorCoverageNeed) {
        if (
          own &&
          topology[2] === 0 &&
          index.leafRepresentationId(
            topology[6],
            policy.minimumLeafLogicalLevel,
          ) === state.providerRepresentationId
        ) {
          terminalMetrics.detailExhaustedSlotCount++;
        } else {
          // This is an immediate-edge plateau, not proof that all finer
          // descendants lack an improvement.
          terminalMetrics.plateauBlockedCandidateCount++;
          terminalMetrics.plateauBlockedInternalCount += Number(!own);
        }
      }
    }
    if (!qualityEligible && !coverageEligible) {
      return undefined;
    }
    const distanceBand = Math.floor(
      distance / policy.nearFirstDistanceBandMeters,
    );
    // Cache geometry on the active state, sharing it across same-node LOD
    // upgrades. A structural split retires the parent's cache with its state.
    // This remains ranking metadata; conservative SSE and coverage eligibility
    // above still decide which refinements are allowed.
    if (!state.viewGeometry) {
      state.viewGeometry = measureViewGeometry(
        state.node,
        bounds,
        new Float64Array(2),
      );
    }
    const [screenFraction, visibleDepth] = state.viewGeometry;
    const priorityScale =
      Math.sqrt(screenFraction) *
      (view.projectionKind === "orthographic"
        ? evaluation[2]
        : evaluation[2] / visibleDepth);
    // Compare only needs the candidate can improve. Express coverage pressure
    // in equivalent quality-error pixels and do not divide by splat cost.
    const priorityProjectedError = Math.max(
      qualityEligible ? error * priorityScale : 0,
      coverageEligible
        ? Math.sqrt(segment[6] / state.rangeCount) *
            priorityScale *
            (policy.refineErrorPixels /
              policy.ancestorCoveragePressureRefinePixels)
        : 0,
    );
    return {
      node: state.node,
      generation: state.generation,
      edge,
      targetRepresentationId,
      targetCount,
      delta: targetCount - state.rangeCount,
      slotDelta,
      distanceBand,
      exactDistance: distance,
      priorityProjectedError,
      depth: topology[3],
      prefixLow: topology[4],
      prefixHigh: topology[5],
    };
  }

  function offer(state) {
    const candidate = candidateFor(state);
    if (candidate) {
      if (!Number.isSafeInteger(candidate.delta) || candidate.delta < 0) {
        throw new Error("View-priority candidate splat delta is invalid");
      }
      // The view, provider and immediate upgrade remain fixed for this
      // generation. Budget admission is checked when the queued state is used.
      state.queuedCandidate = candidate;
      heap.push(candidate);
      maximumHeapSize = Math.max(maximumHeapSize, heap.length);
      largestPriorityProjectedError = Math.max(
        largestPriorityProjectedError,
        candidate.priorityProjectedError,
      );
    }
  }

  index.readNodeProxy(index.rootNodeIndex, proxy);
  index.readRepresentation(proxy[0], representation);
  const root = {
    node: index.rootNodeIndex,
    providerRepresentationId: proxy[0],
    rangeStart: 0,
    rangeCount: representation[6],
    generation: ++generation,
  };
  frontier.set(root.node, root);
  selectedSplatCount = root.rangeCount;
  offer(root);

  for (let entry = heap.pop(); entry; entry = heap.pop()) {
    const state = frontier.get(entry.node);
    if (!state || state.generation !== entry.generation) {
      continue;
    }
    const candidate = state.queuedCandidate;
    if (!candidate) {
      continue;
    }
    if (candidate.delta > policy.maximumSelectedSplats - selectedSplatCount) {
      skippedBudgetCandidateCount++;
      continue;
    }
    if (candidate.slotDelta > policy.maximumCoverageSlots - frontier.size) {
      skippedCoverageSlotCandidateCount++;
      continue;
    }
    smallestAdmittedDistanceBand = Math.min(
      smallestAdmittedDistanceBand,
      candidate.distanceBand,
    );
    largestAdmittedDistanceBand = Math.max(
      largestAdmittedDistanceBand,
      candidate.distanceBand,
    );
    admittedEdgeCount++;
    if (candidate.edge === 0) {
      index.readNodeTopology(state.node, topology);
      const childCount = popcount8(topology[2]);
      const firstChildNode = topology[1];
      frontier.delete(state.node);
      for (let ordinal = 0; ordinal < childCount; ordinal++) {
        const childNode = firstChildNode + ordinal;
        if (
          !readSegmentForChild(
            index,
            state.providerRepresentationId,
            childNode,
            segment,
            representation,
          )
        ) {
          throw new Error(
            `View-priority structural split Segment is missing: node=${state.node}, child=${childNode}, representation=${state.providerRepresentationId}`,
          );
        }
        const child = {
          node: childNode,
          providerRepresentationId: state.providerRepresentationId,
          rangeStart: segment[2],
          rangeCount: segment[3],
          generation: ++generation,
        };
        frontier.set(childNode, child);
        offer(child);
      }
    } else {
      selectedSplatCount = exactCountAdd(
        selectedSplatCount,
        candidate.delta,
        "view-priority selected splats",
      );
      const replacement = {
        node: state.node,
        providerRepresentationId: candidate.targetRepresentationId,
        rangeStart: 0,
        rangeCount: candidate.targetCount,
        generation: ++generation,
        viewGeometry: state.viewGeometry,
      };
      frontier.set(state.node, replacement);
      offer(replacement);
    }
  }

  const ordered = [...frontier.values()];
  ordered.sort((left, right) => {
    index.readNodeTopology(left.node, topology);
    const leftFirstLeaf = topology[6];
    index.readNodeTopology(right.node, topology);
    return leftFirstLeaf - topology[6] || left.node - right.node;
  });
  const nodes = new Uint32Array(ordered.length);
  const representations = new Uint32Array(ordered.length);
  const starts = new Uint32Array(ordered.length);
  const counts = new Uint32Array(ordered.length);
  const terminalMetrics = {
    visibleOverThresholdSlotCount: 0,
    visibleAncestorCoverageOverThresholdCount: 0,
    visibleNeedsRefinementSlotCount: 0,
    qualityCandidateCount: 0,
    coverageCandidateCount: 0,
    budgetAdmissibleCandidateCount: 0,
    coverageBudgetAdmissibleCandidateCount: 0,
    budgetBlockedSlotCount: 0,
    frontierBlockedSlotCount: 0,
    plateauBlockedCandidateCount: 0,
    plateauBlockedInternalCount: 0,
    detailExhaustedSlotCount: 0,
    largestAncestorCoveragePressurePixels: 0,
  };
  for (let slot = 0; slot < ordered.length; slot++) {
    const state = ordered[slot];
    nodes[slot] = state.node;
    representations[slot] = state.providerRepresentationId;
    starts[slot] = state.rangeStart;
    counts[slot] = state.rangeCount;
    // Audit only the final active frontier. Ineligible leaf endpoints still
    // have an observable error, and historical heap rejections are not a
    // substitute for the final target's unmet needs.
    candidateFor(state, terminalMetrics);
  }
  const stopReason =
    terminalMetrics.visibleNeedsRefinementSlotCount === 0
      ? SEGMENTED_ACTIVE_CUT_STOP_REASON.SSE_SATISFIED
      : terminalMetrics.budgetBlockedSlotCount > 0
        ? SEGMENTED_ACTIVE_CUT_STOP_REASON.BUDGET_LIMITED
        : terminalMetrics.frontierBlockedSlotCount > 0
          ? SEGMENTED_ACTIVE_CUT_STOP_REASON.FRONTIER_LIMITED
          : terminalMetrics.plateauBlockedCandidateCount > 0
            ? SEGMENTED_ACTIVE_CUT_STOP_REASON.QUALITY_PLATEAU
            : SEGMENTED_ACTIVE_CUT_STOP_REASON.DETAIL_EXHAUSTED;
  const targetCut = makeCut(
    index,
    {
      coverageNodeIndices: nodes,
      providerRepresentationIds: representations,
      providerRangeStarts: starts,
      providerRangeCounts: counts,
      selectedSplatCount,
    },
    policy.maximumSelectedSplats,
    {
      visitedNodeCount,
      candidateCount: admittedEdgeCount,
      admittedUpgradeCount: admittedEdgeCount,
      maximumScratchSlots: Math.max(frontier.size, maximumHeapSize),
    },
  );
  return {
    targetCut,
    stopReason,
    metrics: {
      selectionErrorMetric: policy.selectionErrorMetric,
      allocationPolicyIdentity: policy.nearFirstPolicyIdentity,
      distanceBandMeters: policy.nearFirstDistanceBandMeters,
      maximumCoverageSlots: policy.maximumCoverageSlots,
      canonicalRootDerived: true,
      visitedNodeCount,
      maximumScratchSlots: Math.max(frontier.size, maximumHeapSize),
      maximumCandidateHeapSize: maximumHeapSize,
      candidateHeapCapacity: heap.capacity,
      activeSlotCount: frontier.size,
      admittedEdgeCount,
      skippedBudgetCandidateCount,
      skippedCoverageSlotCandidateCount,
      largestPriorityProjectedError,
      smallestAdmittedDistanceBand:
        smallestAdmittedDistanceBand === Number.POSITIVE_INFINITY
          ? 0
          : smallestAdmittedDistanceBand,
      largestAdmittedDistanceBand,
      selectedSplatCount,
      remainingBudget: policy.maximumSelectedSplats - selectedSplatCount,
      ...terminalMetrics,
      coverageHoleCount: 0,
      coverageOverlapCount: 0,
      stopReason,
    },
  };
}

class SegmentedConvergedActiveCutPlan {
  constructor(state) {
    this.artifactIdentityHex = state.artifactIdentityHex;
    this.policyIdentity = state.policyIdentity;
    this.stepCount = state.steps.length;
    this.maximumStepCount = state.maximumStepCount;
    this.finalCut = state.cuts[state.cuts.length - 1];
    this.canonicalFinalCut = state.canonicalFinalCut ?? this.finalCut;
    this.isIntermediate = state.exactCanonicalTarget === false;
    this.selectedSplatCount = this.finalCut.selectedSplatCount;
    this.atSelectedBudget = state.atSelectedBudget;
    this.reachedFixedPoint = state.reachedFixedPoint;
    this.stopReason = state.stopReason;
    this.metrics = Object.freeze({ ...state.metrics });
    convergedPlanInternals.set(this, state);
    Object.freeze(this);
  }

  get proofChain() {
    return convergedPlanInternals.get(this).steps.slice();
  }

  get proofOrdinals() {
    return convergedPlanInternals.get(this).proofOrdinals.slice();
  }

  targetCutAt(stepCount) {
    const state = convergedPlanInternals.get(this);
    if (
      !Number.isSafeInteger(stepCount) ||
      stepCount < 0 ||
      stepCount > state.steps.length
    ) {
      throw new RangeError("Converged target stepCount is out of range");
    }
    return state.cuts[stepCount];
  }
}

export function planSegmentedConvergedActiveCut(
  index,
  currentCut,
  view,
  options = {},
) {
  requireProtocol(index);
  const initial = getCut(currentCut);
  requireSameArtifact(index, initial.artifactIdentityWords, "Cut");
  const viewProof = frozenViewProof(view);
  const policy = normalizePlanOptions(initial, options);
  const allocation = buildViewPriorityCanonicalTarget(index, viewProof, policy);
  const targetState = getCut(allocation.targetCut);
  const changed = !sameCutState(initial, targetState);
  const steps = changed
    ? [
        Object.freeze({
          kind: "CANONICAL_ROOT_TARGET",
          artifactIdentityHex: initial.artifactIdentityHex,
          policyIdentity: policy.policyIdentity,
        }),
      ]
    : [];
  const cuts = changed ? [currentCut, allocation.targetCut] : [currentCut];
  const proofOrdinals = changed ? Uint32Array.of(0, 1) : Uint32Array.of(0);
  const state = {
    artifactIdentityWords: initial.artifactIdentityWords.slice(),
    artifactIdentityHex: initial.artifactIdentityHex,
    policyIdentity: policy.policyIdentity,
    currentCut,
    viewProof,
    steps: Object.freeze(steps.slice()),
    cuts: Object.freeze(cuts.slice()),
    proofOrdinals,
    maximumStepCount: 1,
    reachedFixedPoint: true,
    atSelectedBudget:
      allocation.targetCut.selectedSplatCount ===
      allocation.targetCut.maximumSelectedSplats,
    stopReason: allocation.stopReason,
    directCanonicalTarget: true,
    metrics: {
      logicalClosureStepCount: steps.length,
      maximumLogicalClosureStepCount: 1,
      ...allocation.metrics,
    },
  };
  return new SegmentedConvergedActiveCutPlan(state);
}

export function commitSegmentedConvergedActiveCutPlan(
  index,
  currentCut,
  convergedPlan,
  view,
  acceptedStepCount = convergedPlan?.stepCount,
  proofChain = convergedPlan?.proofChain,
  proofOrdinals = convergedPlan?.proofOrdinals,
) {
  requireProtocol(index);
  const current = getCut(currentCut);
  const state = convergedPlanInternals.get(convergedPlan);
  if (!state) {
    throw new TypeError("Expected an immutable converged active-cut plan");
  }
  requireSameArtifact(index, state.artifactIdentityWords, "Converged plan");
  if (
    currentCut !== state.currentCut ||
    !sameCutState(current, getCut(state.currentCut)) ||
    !sameViewProof(state.viewProof, view) ||
    !Number.isSafeInteger(acceptedStepCount) ||
    acceptedStepCount < 0 ||
    acceptedStepCount > state.steps.length ||
    !Array.isArray(proofChain) ||
    proofChain.length !== state.steps.length ||
    !(proofOrdinals instanceof Uint32Array) ||
    proofOrdinals.length !== state.proofOrdinals.length
  ) {
    throw new Error("Converged active-cut proof authority is stale");
  }
  for (let step = 0; step < state.steps.length; step++) {
    if (
      proofChain[step] !== state.steps[step] ||
      proofOrdinals[step] !== step ||
      proofOrdinals[step + 1] !== step + 1 ||
      proofOrdinals[step + 1] <= proofOrdinals[step] ||
      proofOrdinals[step + 1] > state.maximumStepCount
    ) {
      throw new Error("Converged active-cut proof ordinal is invalid");
    }
  }
  if (state.directCanonicalTarget) {
    return Object.freeze({
      cut: state.cuts[acceptedStepCount],
      acceptedStepCount,
      logicalClosureStepCount: state.steps.length,
      exactFinalTarget:
        acceptedStepCount === state.steps.length &&
        state.exactCanonicalTarget !== false,
    });
  }
  let cursor = currentCut;
  for (let step = 0; step < acceptedStepCount; step++) {
    const oneStep = state.steps[step];
    cursor = commitSegmentedActiveCutPlan(
      index,
      cursor,
      oneStep,
      new Uint8Array(oneStep.replacementCount).fill(1),
    ).cut;
    if (!sameCutState(getCut(cursor), getCut(state.cuts[step + 1]))) {
      throw new Error("Converged active-cut replay diverged");
    }
  }
  return Object.freeze({
    cut: cursor,
    acceptedStepCount,
    logicalClosureStepCount: state.steps.length,
    exactFinalTarget: acceptedStepCount === state.steps.length,
  });
}

function requireFrozenTarget(index, currentCut, finalPlan, view) {
  requireProtocol(index);
  const current = getCut(currentCut);
  const source = convergedPlanInternals.get(finalPlan);
  if (!source || !sameViewProof(source.viewProof, view)) {
    throw new Error("Ready target plan or view proof is stale");
  }
  requireSameArtifact(index, source.artifactIdentityWords, "Ready target");
  requireSameArtifact(index, current.artifactIdentityWords, "Ready source");
  const targetCut = source.canonicalFinalCut ?? finalPlan.finalCut;
  if (current.maximumSelectedSplats !== targetCut.maximumSelectedSplats) {
    throw new Error("Ready target selected budget changed");
  }
  return { source, current, targetCut, target: getCut(targetCut) };
}

function frozenTargetPlan(
  currentCut,
  targetCut,
  source,
  canonicalFinalCut,
  metrics = {},
) {
  const changed = !sameCutState(getCut(currentCut), getCut(targetCut));
  const exactCanonicalTarget = sameCutState(
    getCut(targetCut),
    getCut(canonicalFinalCut),
  );
  const steps = changed
    ? [
        Object.freeze({
          kind: exactCanonicalTarget
            ? "FROZEN_CANONICAL_TARGET"
            : "READY_INTERMEDIATE_TARGET",
          artifactIdentityHex: source.artifactIdentityHex,
          policyIdentity: source.policyIdentity,
        }),
      ]
    : [];
  return new SegmentedConvergedActiveCutPlan({
    ...source,
    currentCut,
    canonicalFinalCut,
    exactCanonicalTarget,
    steps: Object.freeze(steps),
    cuts: Object.freeze(changed ? [currentCut, targetCut] : [currentCut]),
    proofOrdinals: changed ? Uint32Array.of(0, 1) : Uint32Array.of(0),
    maximumStepCount: 1,
    directCanonicalTarget: true,
    reachedFixedPoint: exactCanonicalTarget,
    atSelectedBudget: targetCut.remainingBudget === 0,
    stopReason: exactCanonicalTarget ? source.stopReason : undefined,
    metrics: {
      ...source.metrics,
      ...metrics,
      exactCanonicalTarget,
      intermediate: !exactCanonicalTarget,
      selectedSplatCount: targetCut.selectedSplatCount,
      activeSlotCount: targetCut.activeSlotCount,
      logicalClosureStepCount: steps.length,
    },
  });
}

/** Rebinds the unchanged frozen target after a publication, without selection. */
export function rebaseSegmentedConvergedActiveCutPlan(
  index,
  currentCut,
  finalPlan,
  view,
) {
  const { source, targetCut } = requireFrozenTarget(
    index,
    currentCut,
    finalPlan,
    view,
  );
  return frozenTargetPlan(currentCut, targetCut, source, targetCut);
}

/** Builds one bounded bridge path using only whole, own coarse providers. */
export function planSegmentedProgressiveBridgeCut(
  index,
  currentCut,
  finalPlan,
  view,
  admitCut,
) {
  const { source, current, target } = requireFrozenTarget(
    index,
    currentCut,
    finalPlan,
    view,
  );
  const topology = new Uint32Array(8);
  const representation = new Float64Array(12);
  const proxy = new Float64Array(4);
  const segment = new Float64Array(8);
  // Accumulate only the frozen target's ancestry, never the whole inventory.
  const demand = new Map();
  for (let slot = 0; slot < target.coverageNodeIndices.length; slot++) {
    let node = target.coverageNodeIndices[slot];
    while (node !== INVALID_INDEX) {
      let entry = demand.get(node);
      if (!entry) {
        entry = { count: 0, slots: 0 };
        demand.set(node, entry);
      }
      entry.count += target.providerRangeCounts[slot];
      entry.slots++;
      index.readNodeTopology(node, topology);
      node = topology[0];
    }
  }
  const childrenOf = (node) => {
    index.readNodeTopology(node, topology);
    return Array.from(
      { length: popcount8(topology[2]) },
      (_, child) => topology[1] + child,
    );
  };
  const order = (a, b) =>
    demand.get(b.node).count - demand.get(a.node).count || a.node - b.node;
  let slots = Array.from(current.coverageNodeIndices, (node, ordinal) => ({
    node,
    representation: current.providerRepresentationIds[ordinal],
    start: current.providerRangeStarts[ordinal],
    count: current.providerRangeCounts[ordinal],
  }));
  let choices = [];
  for (let position = 0; position < slots.length; position++) {
    const old = slots[position];
    index.readRepresentation(old.representation, representation);
    if (representation[0] !== old.node) {
      continue;
    }
    for (const node of childrenOf(old.node)) {
      if ((demand.get(node)?.slots ?? 0) > 1) {
        choices.push({ node, position });
      }
    }
  }
  choices.sort((a, b) => order(b, a));
  let bridgeCut;
  const pathNodeIds = [];
  while (choices.length > 0) {
    const choice = choices.pop();
    const old = slots[choice.position];
    index.readRepresentation(old.representation, representation);
    const firstSegment = representation[2];
    const children = childrenOf(old.node);
    const replacements = children.map((node, child) => {
      index.readSegment(firstSegment + child, segment);
      return {
        node,
        representation: old.representation,
        start: segment[2],
        count: segment[3],
      };
    });
    index.readNodeProxy(choice.node, proxy);
    index.readRepresentation(proxy[0], representation);
    replacements[children.indexOf(choice.node)] = {
      node: choice.node,
      representation: proxy[0],
      start: 0,
      count: representation[6],
    };
    const candidateSlots = [
      ...slots.slice(0, choice.position),
      ...replacements,
      ...slots.slice(choice.position + 1),
    ];
    const selected = candidateSlots.reduce((sum, slot) => sum + slot.count, 0);
    if (
      selected > current.maximumSelectedSplats ||
      candidateSlots.length > source.metrics.maximumCoverageSlots
    ) {
      continue;
    }
    const candidateCut = makeCut(
      index,
      {
        coverageNodeIndices: candidateSlots.map((slot) => slot.node),
        providerRepresentationIds: candidateSlots.map(
          (slot) => slot.representation,
        ),
        providerRangeStarts: candidateSlots.map((slot) => slot.start),
        providerRangeCounts: candidateSlots.map((slot) => slot.count),
        selectedSplatCount: selected,
      },
      current.maximumSelectedSplats,
    );
    if (!admitCut(candidateCut)) {
      continue;
    }
    bridgeCut = candidateCut;
    slots = candidateSlots;
    pathNodeIds.push(choice.node);
    // After the first promotion only its dominant descendant may be prefetched.
    // Stop once the final demand branches meaningfully or the byte cap is hit.
    const position = slots.findIndex((slot) => slot.node === choice.node);
    const descendants = childrenOf(choice.node)
      .filter((node) => (demand.get(node)?.slots ?? 0) > 1)
      .map((node) => ({
        node,
        position,
      }))
      .sort(order);
    choices =
      descendants.length > 0 &&
      demand.get(descendants[0].node).count >
        0.9 * demand.get(choice.node).count
        ? [descendants[0]]
        : [];
  }
  return bridgeCut
    ? Object.freeze({ bridgeCut, pathNodeIds: Object.freeze(pathNodeIds) })
    : undefined;
}

/** Builds complete coverage groups; readiness never selects a different final LOD. */
export function planSegmentedReadyActiveCut(
  index,
  currentCut,
  finalPlan,
  view,
  readyTargetSlots,
  fallbackCut = currentCut,
) {
  const { source, targetCut, target } = requireFrozenTarget(
    index,
    currentCut,
    finalPlan,
    view,
  );
  const current = getCut(fallbackCut);
  requireSameArtifact(index, current.artifactIdentityWords, "Ready fallback");
  if (
    current.maximumSelectedSplats !== currentCut.maximumSelectedSplats ||
    current.coverageNodeIndices.length > source.metrics.maximumCoverageSlots
  ) {
    throw new Error("Ready fallback budget changed");
  }
  if (
    !(readyTargetSlots instanceof Uint8Array) ||
    readyTargetSlots.length !== target.coverageNodeIndices.length ||
    readyTargetSlots.some((value) => value !== 0 && value !== 1)
  ) {
    throw new TypeError(
      "Ready target flags must match the frozen target slots",
    );
  }
  const topology = new Uint32Array(8);
  const representation = new Float64Array(12);
  const segment = new Float64Array(8);
  const slot = (state, ordinal) => {
    const node = state.coverageNodeIndices[ordinal];
    index.readNodeTopology(node, topology);
    return {
      node,
      first: topology[6],
      end: topology[6] + topology[7],
      representation: state.providerRepresentationIds[ordinal],
      start: state.providerRangeStarts[ordinal],
      count: state.providerRangeCounts[ordinal],
    };
  };
  const oldSlots = Array.from(current.coverageNodeIndices, (_, ordinal) =>
    slot(current, ordinal),
  );
  const targetSlots = Array.from(target.coverageNodeIndices, (_, ordinal) =>
    slot(target, ordinal),
  );
  const blocks = [];
  const candidates = [];
  function addCandidate(block, position, oldCount, newStart, newEnd) {
    if (
      !readyTargetSlots.subarray(newStart, newEnd).every((value) => value === 1)
    ) {
      return;
    }
    const replacement = targetSlots.slice(newStart, newEnd);
    const previous = block.projected.slice(position, position + oldCount);
    if (
      previous.length === replacement.length &&
      previous.every(
        (value, i) =>
          value.node === replacement[i].node &&
          value.representation === replacement[i].representation &&
          value.start === replacement[i].start &&
          value.count === replacement[i].count,
      )
    ) {
      return;
    }
    candidates.push({
      block,
      position,
      oldCount,
      replacement,
      delta:
        replacement.reduce((sum, value) => sum + value.count, 0) -
        previous.reduce((sum, value) => sum + value.count, 0),
    });
  }
  let oldOrdinal = 0;
  let targetOrdinal = 0;
  while (oldOrdinal < oldSlots.length) {
    const oldStart = oldOrdinal;
    const targetStart = targetOrdinal;
    const old = oldSlots[oldOrdinal];
    const next = targetSlots[targetOrdinal];
    if (old.first !== next.first) {
      throw new Error("Ready target coverage groups do not align");
    }
    const end = Math.max(old.end, next.end);
    while (oldOrdinal < oldSlots.length && oldSlots[oldOrdinal].end <= end) {
      oldOrdinal++;
    }
    while (
      targetOrdinal < targetSlots.length &&
      targetSlots[targetOrdinal].end <= end
    ) {
      targetOrdinal++;
    }
    if (
      oldSlots[oldOrdinal - 1].end !== end ||
      targetSlots[targetOrdinal - 1].end !== end
    ) {
      throw new Error("Ready target subtree coverage is incomplete");
    }
    const original = oldSlots.slice(oldStart, oldOrdinal);
    const block = {
      original,
      projected: original,
      replacements: new Map(),
      active: false,
    };
    blocks.push(block);
    index.readNodeTopology(old.node, topology);
    index.readRepresentation(old.representation, representation);
    if (
      original.length === 1 &&
      targetOrdinal - targetStart > 1 &&
      representation[0] === old.node &&
      topology[2] !== 0
    ) {
      // Only own providers may be split. A parent Segment cannot be cropped
      // recursively into grandchildren without the child's own Representation.
      const children = popcount8(topology[2]);
      const firstChild = topology[1];
      const firstSegment = representation[2];
      block.projected = [];
      let targetChild = targetStart;
      for (let child = 0; child < children; child++) {
        const node = firstChild + child;
        index.readNodeTopology(node, topology);
        index.readSegment(firstSegment + child, segment);
        if (segment[1] !== node) {
          throw new Error("Ready source direct-child Segment is invalid");
        }
        const fallback = {
          node,
          first: topology[6],
          end: topology[6] + topology[7],
          representation: old.representation,
          start: segment[2],
          count: segment[3],
        };
        block.projected.push(fallback);
        const first = targetChild;
        while (
          targetChild < targetOrdinal &&
          targetSlots[targetChild].end <= fallback.end
        ) {
          targetChild++;
        }
        if (
          first === targetChild ||
          targetSlots[first].first !== fallback.first ||
          targetSlots[targetChild - 1].end !== fallback.end
        ) {
          throw new Error("Ready child target coverage is incomplete");
        }
        addCandidate(block, child, 1, first, targetChild);
      }
    } else {
      addCandidate(block, 0, original.length, targetStart, targetOrdinal);
    }
  }
  let selected = current.selectedSplatCount;
  let coverage = current.coverageNodeIndices.length;
  let accepted = 0;
  let upgrades = 0;
  const maximumCoverageSlots = source.metrics.maximumCoverageSlots;
  // Ready coarsenings free the budget before refinements. Each accepted group
  // remains optional: two legal endpoints do not imply every mixture fits.
  for (const positive of [false, true]) {
    for (const candidate of candidates) {
      if (candidate.delta > 0 !== positive) {
        continue;
      }
      const block = candidate.block;
      const slotDelta =
        candidate.replacement.length -
        candidate.oldCount +
        (block.active ? 0 : block.projected.length - block.original.length);
      if (
        selected + candidate.delta > current.maximumSelectedSplats ||
        coverage + slotDelta > maximumCoverageSlots
      ) {
        continue;
      }
      block.active = true;
      block.replacements.set(candidate.position, candidate);
      selected += candidate.delta;
      coverage += slotDelta;
      accepted++;
      upgrades += Number(candidate.delta > 0);
    }
  }
  let mixedCut = currentCut;
  if (readyTargetSlots.every((value) => value === 1)) {
    mixedCut = targetCut;
  } else if (accepted > 0) {
    const slots = [];
    for (const block of blocks) {
      const values = block.active ? block.projected : block.original;
      for (let position = 0; position < values.length; position++) {
        const replacement = block.replacements.get(position);
        if (replacement) {
          slots.push(...replacement.replacement);
          position += replacement.oldCount - 1;
        } else {
          slots.push(values[position]);
        }
      }
    }
    mixedCut = makeCut(
      index,
      {
        coverageNodeIndices: Uint32Array.from(slots, (value) => value.node),
        providerRepresentationIds: Uint32Array.from(
          slots,
          (value) => value.representation,
        ),
        providerRangeStarts: Uint32Array.from(slots, (value) => value.start),
        providerRangeCounts: Uint32Array.from(slots, (value) => value.count),
        selectedSplatCount: selected,
      },
      current.maximumSelectedSplats,
      {},
    );
  }
  return frozenTargetPlan(currentCut, mixedCut, source, targetCut, {
    bridgeFallbackUsed:
      mixedCut !== currentCut &&
      mixedCut !== targetCut &&
      fallbackCut !== currentCut,
    readyReplacementCount: accepted,
    readyUpgradeCount: upgrades,
    readyTargetSlotCount: readyTargetSlots.reduce(
      (sum, value) => sum + value,
      0,
    ),
  });
}

function collapseResourceNeutralJoins(index, state) {
  const maximum = state.coverageNodeIndices.length;
  const nodes = new Uint32Array(maximum);
  const representations = new Uint32Array(maximum);
  const starts = new Uint32Array(maximum);
  const counts = new Uint32Array(maximum);
  const topology = new Uint32Array(8);
  const parentTopology = new Uint32Array(8);
  const proxy = new Float64Array(4);
  const representation = new Float64Array(12);
  const segment = new Float64Array(8);
  let output = 0;
  let joinCount = 0;
  for (let slot = 0; slot < maximum;) {
    const node = state.coverageNodeIndices[slot];
    index.readNodeTopology(node, topology);
    const parent = topology[0];
    let joined = false;
    if (parent !== INVALID_INDEX) {
      index.readNodeTopology(parent, parentTopology);
      const childCount = popcount8(parentTopology[2]);
      if (node === parentTopology[1] && slot + childCount <= maximum) {
        index.readNodeProxy(parent, proxy);
        let canonical = true;
        for (let ordinal = 0; ordinal < childCount; ordinal++) {
          const childSlot = slot + ordinal;
          const child = parentTopology[1] + ordinal;
          if (
            state.coverageNodeIndices[childSlot] !== child ||
            state.providerRepresentationIds[childSlot] !== proxy[0] ||
            !readSegmentForChild(
              index,
              proxy[0],
              child,
              segment,
              representation,
            ) ||
            state.providerRangeStarts[childSlot] !== segment[2] ||
            state.providerRangeCounts[childSlot] !== segment[3]
          ) {
            canonical = false;
            break;
          }
        }
        if (canonical) {
          index.readRepresentation(proxy[0], representation);
          nodes[output] = parent;
          representations[output] = proxy[0];
          starts[output] = 0;
          counts[output] = representation[6];
          output++;
          slot += childCount;
          joinCount++;
          joined = true;
        }
      }
    }
    if (!joined) {
      nodes[output] = state.coverageNodeIndices[slot];
      representations[output] = state.providerRepresentationIds[slot];
      starts[output] = state.providerRangeStarts[slot];
      counts[output] = state.providerRangeCounts[slot];
      output++;
      slot++;
    }
  }
  return {
    coverageNodeIndices: nodes.slice(0, output),
    providerRepresentationIds: representations.slice(0, output),
    providerRangeStarts: starts.slice(0, output),
    providerRangeCounts: counts.slice(0, output),
    selectedSplatCount: state.selectedSplatCount,
    joinCount,
  };
}

export function commitSegmentedActiveCutPlan(
  index,
  currentCut,
  plan,
  readyFlags,
) {
  requireProtocol(index);
  const current = getCut(currentCut);
  const planState = planInternals.get(plan);
  if (planState === undefined) {
    throw new TypeError("Expected an immutable segmented active-cut plan");
  }
  requireSameArtifact(index, current.artifactIdentityWords, "Cut");
  requireSameArtifact(index, planState.artifactIdentityWords, "Plan");
  if (
    !arraysEqual(
      current.coverageNodeIndices,
      planState.currentCoverageNodeIndices,
    ) ||
    !arraysEqual(
      current.providerRepresentationIds,
      planState.currentProviderRepresentationIds,
    ) ||
    !arraysEqual(
      current.providerRangeStarts,
      planState.currentProviderRangeStarts,
    ) ||
    !arraysEqual(
      current.providerRangeCounts,
      planState.currentProviderRangeCounts,
    ) ||
    current.selectedSplatCount !== planState.currentSelectedSplatCount ||
    current.maximumSelectedSplats !== planState.policy.maximumSelectedSplats
  ) {
    throw new Error("Segmented active-cut plan is stale or rebound");
  }
  if (
    !(readyFlags instanceof Uint8Array) ||
    readyFlags.length !== planState.slotIndices.length
  ) {
    throw new TypeError("readyFlags must exactly match replacement records");
  }
  for (const value of readyFlags) {
    if (value !== 0 && value !== 1) {
      throw new RangeError("readyFlags entries must be zero or one");
    }
  }
  const projected = getCut(planState.projectedCut);
  const arrays = {
    coverageNodeIndices: projected.coverageNodeIndices.slice(),
    providerRepresentationIds: projected.providerRepresentationIds.slice(),
    providerRangeStarts: projected.providerRangeStarts.slice(),
    providerRangeCounts: projected.providerRangeCounts.slice(),
    selectedSplatCount: projected.selectedSplatCount,
  };
  let readyCommittedCount = 0;
  for (let record = 0; record < readyFlags.length; record++) {
    if (readyFlags[record] === 0) {
      continue;
    }
    const slot = planState.slotIndices[record];
    if (
      arrays.coverageNodeIndices[slot] !==
        planState.coverageNodeIndices[record] ||
      arrays.providerRepresentationIds[slot] !==
        planState.oldRepresentationIds[record] ||
      arrays.providerRangeStarts[slot] !== planState.oldRangeStarts[record] ||
      arrays.providerRangeCounts[slot] !== planState.oldRangeCounts[record]
    ) {
      throw new Error("Segmented active-cut replacement binding is invalid");
    }
    arrays.providerRepresentationIds[slot] =
      planState.newRepresentationIds[record];
    arrays.providerRangeStarts[slot] = planState.newRangeStarts[record];
    arrays.providerRangeCounts[slot] = planState.newRangeCounts[record];
    arrays.selectedSplatCount = exactCountAdd(
      arrays.selectedSplatCount,
      planState.deltas[record],
      "committed selected splats",
    );
    readyCommittedCount++;
  }
  if (arrays.selectedSplatCount > planState.policy.maximumSelectedSplats) {
    throw new RangeError("Ready commit exceeds maximumSelectedSplats");
  }
  const collapsed = collapseResourceNeutralJoins(index, arrays);
  const provisional = makeCut(
    index,
    collapsed,
    planState.policy.maximumSelectedSplats,
    {
      ...plan.metrics,
      joinCount: plan.metrics.joinCount + collapsed.joinCount,
      readyCommittedCount,
      selectedSplatCount: arrays.selectedSplatCount,
      maximumScratchSlots: Math.max(
        plan.metrics.maximumScratchSlots,
        arrays.coverageNodeIndices.length,
      ),
    },
  );
  const diff = diffSegmentedActiveCutProviders(index, currentCut, provisional);
  const metrics = {
    ...provisional.metrics,
    readyCommittedCount,
    providerIntervalCount: projectSegmentedActiveCutProviders(
      index,
      provisional,
    ).intervalCount,
    addedProviderIntervalCount: diff.addedIntervalCount,
    removedProviderIntervalCount: diff.removedIntervalCount,
  };
  const nextCut = makeCut(
    index,
    getCut(provisional),
    planState.policy.maximumSelectedSplats,
    metrics,
  );
  return Object.freeze({ cut: nextCut, diff, metrics: nextCut.metrics });
}

export {
  ViewPriorityCandidateHeap as SegmentedNearFirstCandidateHeapForTesting,
  TRANSITION as SEGMENTED_ACTIVE_CUT_TRANSITION,
};

/** @private */
const _SceneGISGaussianSegmentedActiveCut = {
  SEGMENTED_ACTIVE_CUT_STOP_REASON,
  createSegmentedActiveCut,
  projectSegmentedActiveCutProviders,
  diffSegmentedActiveCutProviders,
  planSegmentedActiveCut,
  planSegmentedConvergedActiveCut,
  commitSegmentedConvergedActiveCutPlan,
  rebaseSegmentedConvergedActiveCutPlan,
  planSegmentedProgressiveBridgeCut,
  planSegmentedReadyActiveCut,
  commitSegmentedActiveCutPlan,
};
export default _SceneGISGaussianSegmentedActiveCut;

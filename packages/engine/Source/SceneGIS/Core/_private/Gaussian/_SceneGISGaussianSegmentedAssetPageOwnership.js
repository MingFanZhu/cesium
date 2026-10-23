/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
import {
  commitSegmentedActiveCutPlan,
  commitSegmentedConvergedActiveCutPlan,
  diffSegmentedActiveCutProviders,
  projectSegmentedActiveCutProviders,
  planSegmentedReadyActiveCut,
  planSegmentedProgressiveBridgeCut,
} from "./_SceneGISGaussianSegmentedActiveCut.js";

const INVALID_INDEX = 0xffffffff;
const PAGE_PROVENANCE_WIDTH = 7;
const ATLAS_SPLATS_PER_ROW = 256;

export function computeSegmentedAtlasPageFootprint(
  splatCount,
  semantic,
  maxShDegree,
) {
  requireSafe(splatCount, "atlas Page splatCount", true);
  requireSafe(maxShDegree, "atlas Page maxShDegree");
  const semanticBytesPerSplat =
    semantic === 1
      ? 32
      : semantic === 2 && maxShDegree >= 1 && maxShDegree <= 3
        ? [0, 16, 32, 64][maxShDegree]
        : 0;
  if (semanticBytesPerSplat === 0) {
    throw new RangeError("Atlas Page semantic is invalid");
  }
  const reservedSplats =
    Math.ceil(splatCount / ATLAS_SPLATS_PER_ROW) * ATLAS_SPLATS_PER_ROW;
  return Object.freeze({
    reservedSplats,
    semanticBytesPerSplat,
    uploadBytes: exactMultiply(
      reservedSplats,
      semanticBytesPerSplat,
      "atlas Page upload bytes",
    ),
  });
}

function pageUploadBytes(index, page) {
  return computeSegmentedAtlasPageFootprint(page[2], page[4], index.maxShDegree)
    .uploadBytes;
}
const projectionStates = new WeakMap();
const ownershipStates = new WeakMap();
const snapshotStates = new WeakMap();
const progressiveBridgeStates = new WeakMap();
const transitionStates = new WeakMap();
const bootstrapStates = new WeakMap();
const publicationStates = new WeakMap();
const abortStates = new WeakMap();
const preparedPageStates = new WeakMap();
const preparedTransitions = new WeakMap();
const preparedBootstraps = new WeakMap();
const consumedTransactions = new WeakSet();
const consumedPreparedPages = new WeakSet();
const inFlightOwnerships = new WeakSet();

function requireSafe(value, label, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new RangeError(
      `${label} must be a ${positive ? "positive " : ""}safe integer`,
    );
  }
  return value;
}

function exactAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return value;
}

function exactMultiply(left, right, label) {
  const value = left * right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} exceeds the safe integer range`);
  }
  return value;
}

function exactSubtract(left, right, label) {
  const value = left - right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} underflows the safe integer range`);
  }
  return value;
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

function requireArtifact(index, words, label) {
  if (!wordsEqual(artifactWords(index), words)) {
    throw new Error(`${label} artifact identity mismatch`);
  }
}

function nextPowerOfTwo(value) {
  let result = 2;
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

function radixSortUint32(values) {
  let source = values.slice();
  let target = new Uint32Array(values.length);
  const buckets = new Uint32Array(256);
  for (let shift = 0; shift < 32; shift += 8) {
    buckets.fill(0);
    for (const value of source) {
      buckets[(value >>> shift) & 0xff]++;
    }
    let offset = 0;
    for (let bucket = 0; bucket < 256; bucket++) {
      const length = buckets[bucket];
      buckets[bucket] = offset;
      offset += length;
    }
    for (const value of source) {
      const digit = (value >>> shift) & 0xff;
      target[buckets[digit]++] = value;
    }
    [source, target] = [target, source];
  }
  return source;
}

function sortedUnique(ids, label) {
  if (!(ids instanceof Uint32Array)) {
    throw new TypeError(`${label} ids must be Uint32Array`);
  }
  for (let index = 1; index < ids.length; index++) {
    if (ids[index] <= ids[index - 1]) {
      throw new Error(`${label} ids must be strictly increasing`);
    }
  }
}

function containsSorted(ids, value) {
  let low = 0;
  let high = ids.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (ids[middle] < value) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low < ids.length && ids[low] === value;
}

class SegmentedAssetProjection {
  constructor(state) {
    this.artifactIdentityHex = state.artifactIdentityHex;
    this.providerIntervalCount = state.providerRepresentationIds.length;
    this.assetSliceCount = state.assetIds.length;
    this.pageFragmentCount = state.fragmentCorePageIds.length;
    this.byteLength =
      state.artifactIdentityWords.byteLength +
      state.providerRepresentationIds.byteLength +
      state.providerRangeStarts.byteLength +
      state.providerRangeCounts.byteLength +
      state.providerAssetOffsets.byteLength +
      state.assetIds.byteLength +
      state.assetLocalStarts.byteLength +
      state.assetSliceCounts.byteLength +
      state.assetFragmentOffsets.byteLength +
      state.fragmentCorePageIds.byteLength +
      state.fragmentShPageIds.byteLength +
      state.fragmentPageLocalStarts.byteLength +
      state.fragmentCounts.byteLength;
    this.metrics = Object.freeze({ ...state.metrics });
    projectionStates.set(this, state);
    Object.freeze(this);
  }
}

for (const name of [
  "providerRepresentationIds",
  "providerRangeStarts",
  "providerRangeCounts",
  "providerAssetOffsets",
  "assetIds",
  "assetLocalStarts",
  "assetSliceCounts",
  "assetFragmentOffsets",
  "fragmentCorePageIds",
  "fragmentShPageIds",
  "fragmentPageLocalStarts",
  "fragmentCounts",
]) {
  Object.defineProperty(SegmentedAssetProjection.prototype, name, {
    get() {
      return projectionStates.get(this)[name].slice();
    },
  });
}

function projectProviderArrays(index, representationIds, starts, counts) {
  const representation = new Float64Array(12);
  const asset = new Float64Array(8);
  const page = new Float64Array(11);
  const providerAssetOffsets = [0];
  const assetIds = [];
  const assetLocalStarts = [];
  const assetSliceCounts = [];
  const assetFragmentOffsets = [0];
  const fragmentCorePageIds = [];
  const fragmentShPageIds = [];
  const fragmentPageLocalStarts = [];
  const fragmentCounts = [];
  let representationProbes = 0;
  let assetRowsVisited = 0;
  let pageRowsVisited = 0;
  for (let provider = 0; provider < representationIds.length; provider++) {
    const representationId = representationIds[provider];
    const rangeStart = starts[provider];
    const rangeEnd = exactAdd(rangeStart, counts[provider], "Provider range");
    index.readRepresentation(representationId, representation);
    const firstAsset = representation[4];
    const assetCount = representation[5];
    if (rangeEnd > representation[6] || counts[provider] === 0) {
      throw new Error("SCALE-1C provider interval is invalid");
    }
    let low = 0;
    let high = assetCount;
    while (low < high) {
      const middle = (low + high) >>> 1;
      index.readAsset(firstAsset + middle, asset);
      representationProbes++;
      if (asset[1] + asset[2] <= rangeStart) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }
    let providerCursor = rangeStart;
    for (let localAsset = low; localAsset < assetCount; localAsset++) {
      const assetId = firstAsset + localAsset;
      index.readAsset(assetId, asset);
      assetRowsVisited++;
      const assetStart = asset[1];
      if (assetStart >= rangeEnd) {
        break;
      }
      const overlapStart = Math.max(providerCursor, assetStart);
      const overlapEnd = Math.min(rangeEnd, assetStart + asset[2]);
      if (overlapEnd <= overlapStart || overlapStart !== providerCursor) {
        throw new Error("SCALE-1C Asset slices do not cover provider interval");
      }
      assetIds.push(assetId);
      assetLocalStarts.push(overlapStart - assetStart);
      assetSliceCounts.push(overlapEnd - overlapStart);
      const assetRangeStart = overlapStart - assetStart;
      const assetRangeEnd = overlapEnd - assetStart;
      let pageLow = 0;
      let pageHigh = asset[5];
      while (pageLow < pageHigh) {
        const middle = (pageLow + pageHigh) >>> 1;
        const pageId = index.readAssetPageIndex(asset[4] + middle);
        index.readPage(pageId, page);
        pageRowsVisited++;
        if (page[1] + page[2] <= assetRangeStart) {
          pageLow = middle + 1;
        } else {
          pageHigh = middle;
        }
      }
      let fragmentCursor = assetRangeStart;
      for (let localPage = pageLow; localPage < asset[5]; localPage++) {
        const corePageId = index.readAssetPageIndex(asset[4] + localPage);
        index.readPage(corePageId, page);
        pageRowsVisited++;
        if (page[1] >= assetRangeEnd) {
          break;
        }
        const fragmentStart = Math.max(fragmentCursor, page[1]);
        const fragmentEnd = Math.min(assetRangeEnd, page[1] + page[2]);
        if (fragmentEnd <= fragmentStart || fragmentStart !== fragmentCursor) {
          throw new Error("SCALE-1C Page fragments do not cover Asset slice");
        }
        fragmentCorePageIds.push(corePageId);
        fragmentShPageIds.push(
          index.maxShDegree === 0
            ? INVALID_INDEX
            : index.readAssetPageIndex(asset[6] + localPage),
        );
        fragmentPageLocalStarts.push(fragmentStart - page[1]);
        fragmentCounts.push(fragmentEnd - fragmentStart);
        fragmentCursor = fragmentEnd;
      }
      if (fragmentCursor !== assetRangeEnd) {
        throw new Error("SCALE-1C Page fragment coverage is incomplete");
      }
      assetFragmentOffsets.push(fragmentCorePageIds.length);
      providerCursor = overlapEnd;
    }
    if (providerCursor !== rangeEnd) {
      throw new Error("SCALE-1C provider physical projection is incomplete");
    }
    providerAssetOffsets.push(assetIds.length);
  }
  return new SegmentedAssetProjection({
    artifactIdentityWords: artifactWords(index),
    artifactIdentityHex: index.artifactIdentityHex,
    providerRepresentationIds: Uint32Array.from(representationIds),
    providerRangeStarts: Uint32Array.from(starts),
    providerRangeCounts: Uint32Array.from(counts),
    providerAssetOffsets: Uint32Array.from(providerAssetOffsets),
    assetIds: Uint32Array.from(assetIds),
    assetLocalStarts: Uint32Array.from(assetLocalStarts),
    assetSliceCounts: Uint32Array.from(assetSliceCounts),
    assetFragmentOffsets: Uint32Array.from(assetFragmentOffsets),
    fragmentCorePageIds: Uint32Array.from(fragmentCorePageIds),
    fragmentShPageIds: Uint32Array.from(fragmentShPageIds),
    fragmentPageLocalStarts: Uint32Array.from(fragmentPageLocalStarts),
    fragmentCounts: Uint32Array.from(fragmentCounts),
    metrics: {
      representationProbes,
      assetRowsVisited,
      pageRowsVisited,
      coverageHoleCount: 0,
      coverageOverlapCount: 0,
    },
  });
}

export function projectSegmentedAssetIntervals(index, cut) {
  const providers = projectSegmentedActiveCutProviders(index, cut);
  return projectProviderArrays(
    index,
    providers.representationIds,
    providers.rangeStarts,
    providers.rangeCounts,
  );
}

export function projectSegmentedAssetSlots(index, cut) {
  const representationIds = cut?.providerRepresentationIds;
  const rangeStarts = cut?.providerRangeStarts;
  const rangeCounts = cut?.providerRangeCounts;
  if (
    !(representationIds instanceof Uint32Array) ||
    !(rangeStarts instanceof Uint32Array) ||
    !(rangeCounts instanceof Uint32Array) ||
    representationIds.length !== rangeStarts.length ||
    representationIds.length !== rangeCounts.length ||
    representationIds.length !== cut.activeSlotCount
  ) {
    throw new TypeError("SCALE-1D cut slot projection authority is invalid");
  }
  return projectProviderArrays(
    index,
    representationIds,
    rangeStarts,
    rangeCounts,
  );
}

function aggregatePages(index, pageIds) {
  const capacity = nextPowerOfTwo(Math.max(2, pageIds.length * 2));
  const keys = new Uint32Array(capacity);
  keys.fill(INVALID_INDEX);
  const refs = new Uint32Array(capacity);
  const ordered = new Uint32Array(pageIds.length);
  let count = 0;
  let sharedReferencesSaved = 0;
  let storedBytes = 0;
  let rawBytes = 0;
  let hashProbes = 0;
  const page = new Float64Array(11);
  for (const pageId of pageIds) {
    const slot = hashSlot(keys, pageId);
    hashProbes++;
    if (keys[slot] === INVALID_INDEX) {
      keys[slot] = pageId;
      refs[slot] = 1;
      ordered[count++] = pageId;
      index.readPage(pageId, page);
      storedBytes = exactAdd(storedBytes, page[8], "Page stored bytes");
      rawBytes = exactAdd(
        rawBytes,
        pageUploadBytes(index, page),
        "Page physical GPU bytes",
      );
    } else {
      refs[slot]++;
      sharedReferencesSaved++;
    }
  }
  const ids = radixSortUint32(ordered.slice(0, count));
  const referenceCounts = new Uint32Array(count);
  for (let index = 0; index < count; index++) {
    referenceCounts[index] = refs[hashSlot(keys, ids[index])];
  }
  return {
    ids,
    referenceCounts,
    storedBytes,
    rawBytes,
    sharedReferencesSaved,
    hashProbes,
    maximumScratchSlots: capacity,
  };
}

class SegmentedAssetPageOwnership {
  constructor(state) {
    this.artifactIdentityHex = state.artifactIdentityHex;
    this.generation = state.generation;
    this.activeProviderIntervalCount = state.projection.providerIntervalCount;
    this.activeAssetSliceCount = state.projection.assetSliceCount;
    this.activePageFragmentCount = state.projection.pageFragmentCount;
    this.activeUniqueCorePageCount = state.core.ids.length;
    this.optionalShPageCount = state.sh.ids.length;
    this.activeCoreStoredBytes = state.core.storedBytes;
    this.activeCoreRawBytes = state.core.rawBytes;
    this.byteLength =
      state.artifactIdentityWords.byteLength +
      state.projection.byteLength +
      state.core.ids.byteLength +
      state.core.referenceCounts.byteLength +
      state.sh.ids.byteLength +
      state.sh.referenceCounts.byteLength;
    this.metrics = Object.freeze({ ...state.metrics });
    ownershipStates.set(this, state);
    Object.freeze(this);
  }
  get projection() {
    return ownershipStates.get(this).projection;
  }
  get corePageIds() {
    return ownershipStates.get(this).core.ids.slice();
  }
  get coreReferenceCounts() {
    return ownershipStates.get(this).core.referenceCounts.slice();
  }
  get optionalShPageIds() {
    return ownershipStates.get(this).sh.ids.slice();
  }
}

function makeOwnership(index, cut, projection, generation) {
  const projectionState = projectionStates.get(projection);
  requireArtifact(index, projectionState.artifactIdentityWords, "Projection");
  const core = aggregatePages(index, projectionState.fragmentCorePageIds);
  const shIds =
    index.maxShDegree === 0
      ? new Uint32Array(0)
      : projectionState.fragmentShPageIds;
  const sh = aggregatePages(index, shIds);
  return new SegmentedAssetPageOwnership({
    artifactIdentityWords: artifactWords(index),
    artifactIdentityHex: index.artifactIdentityHex,
    cut,
    projection,
    generation,
    core,
    sh,
    metrics: {
      sharedCorePageReferencesSaved: core.sharedReferencesSaved,
      sharedShPageReferencesSaved: sh.sharedReferencesSaved,
      hashProbes: core.hashProbes + sh.hashProbes,
      maximumScratchSlots: Math.max(
        core.maximumScratchSlots,
        sh.maximumScratchSlots,
      ),
    },
  });
}

class SegmentedAssetPagePhysicalSnapshot {
  constructor(state) {
    this.artifactIdentityHex = state.artifactIdentityHex;
    this.cpuGeneration = state.cpuGeneration;
    this.gpuGeneration = state.gpuGeneration;
    this.leaseIdentity = state.leaseIdentity;
    this.cpuStoredBytes = state.cpuStoredBytes;
    this.gpuRawBytes = state.gpuRawBytes;
    this.byteLength =
      state.artifactIdentityWords.byteLength +
      state.cpuPageIds.byteLength +
      state.gpuPageIds.byteLength;
    snapshotStates.set(this, state);
    Object.freeze(this);
  }
  get cpuPageIds() {
    return snapshotStates.get(this).cpuPageIds.slice();
  }
  get gpuPageIds() {
    return snapshotStates.get(this).gpuPageIds.slice();
  }
}

export function createSegmentedAssetPagePhysicalSnapshot(index, receipt) {
  const {
    cpuPageIds,
    cpuStoredBytes,
    cpuPageProvenance,
    gpuPageIds,
    gpuRawBytes,
    gpuPageProvenance,
    cpuGeneration,
    gpuGeneration,
    leaseIdentity,
  } = receipt ?? {};
  sortedUnique(cpuPageIds, "CPU receipt");
  sortedUnique(gpuPageIds, "GPU receipt");
  if (
    !(cpuStoredBytes instanceof Float64Array) ||
    cpuStoredBytes.length !== cpuPageIds.length ||
    !(cpuPageProvenance instanceof Float64Array) ||
    cpuPageProvenance.length !== cpuPageIds.length * PAGE_PROVENANCE_WIDTH ||
    !(gpuRawBytes instanceof Float64Array) ||
    gpuRawBytes.length !== gpuPageIds.length ||
    !(gpuPageProvenance instanceof Float64Array) ||
    gpuPageProvenance.length !== gpuPageIds.length * PAGE_PROVENANCE_WIDTH ||
    typeof leaseIdentity !== "string" ||
    leaseIdentity.length === 0
  ) {
    throw new TypeError("SCALE-1C physical receipt shape is invalid");
  }
  requireSafe(cpuGeneration, "CPU generation");
  requireSafe(gpuGeneration, "GPU generation");
  const page = new Float64Array(11);
  let cpuTotal = 0;
  let gpuTotal = 0;
  for (let position = 0; position < cpuPageIds.length; position++) {
    index.readPage(cpuPageIds[position], page);
    const offset = position * PAGE_PROVENANCE_WIDTH;
    if (
      cpuStoredBytes[position] !== page[8] ||
      cpuPageProvenance[offset] !== page[6] ||
      cpuPageProvenance[offset + 1] !== page[7] ||
      cpuPageProvenance[offset + 2] !== page[8] ||
      cpuPageProvenance[offset + 3] !== page[9] ||
      cpuPageProvenance[offset + 4] !== page[10] ||
      cpuPageProvenance[offset + 5] !== page[3] ||
      cpuPageProvenance[offset + 6] !== page[4]
    ) {
      throw new Error("SCALE-1C CPU receipt Page provenance mismatch");
    }
    cpuTotal = exactAdd(cpuTotal, page[8], "CPU receipt bytes");
  }
  for (let position = 0; position < gpuPageIds.length; position++) {
    index.readPage(gpuPageIds[position], page);
    const offset = position * PAGE_PROVENANCE_WIDTH;
    if (
      gpuRawBytes[position] !== pageUploadBytes(index, page) ||
      gpuPageProvenance[offset] !== page[6] ||
      gpuPageProvenance[offset + 1] !== page[7] ||
      gpuPageProvenance[offset + 2] !== page[8] ||
      gpuPageProvenance[offset + 3] !== page[9] ||
      gpuPageProvenance[offset + 4] !== page[10] ||
      gpuPageProvenance[offset + 5] !== page[3] ||
      gpuPageProvenance[offset + 6] !== page[4]
    ) {
      throw new Error("SCALE-1C GPU receipt Page provenance mismatch");
    }
    gpuTotal = exactAdd(
      gpuTotal,
      pageUploadBytes(index, page),
      "GPU receipt bytes",
    );
  }
  return new SegmentedAssetPagePhysicalSnapshot({
    artifactIdentityWords: artifactWords(index),
    artifactIdentityHex: index.artifactIdentityHex,
    cpuPageIds: cpuPageIds.slice(),
    gpuPageIds: gpuPageIds.slice(),
    cpuGeneration,
    gpuGeneration,
    leaseIdentity,
    cpuStoredBytes: cpuTotal,
    gpuRawBytes: gpuTotal,
  });
}

function normalizeLimits(limits) {
  const normalized = {};
  for (const name of [
    "maximumCpuPageBytes",
    "replacementCpuEscrowBytes",
    "maximumGpuPageBytes",
    "replacementGpuEscrowBytes",
  ]) {
    normalized[name] = requireSafe(limits?.[name], name, true);
  }
  if (
    normalized.replacementCpuEscrowBytes > normalized.maximumCpuPageBytes ||
    normalized.replacementGpuEscrowBytes > normalized.maximumGpuPageBytes
  ) {
    throw new RangeError("SCALE-1C replacement escrow exceeds Page budget");
  }
  normalized.cpuStableLimit =
    normalized.maximumCpuPageBytes - normalized.replacementCpuEscrowBytes;
  normalized.gpuStableLimit =
    normalized.maximumGpuPageBytes - normalized.replacementGpuEscrowBytes;
  return Object.freeze(normalized);
}

function pageReceiptReady(snapshot, pageId) {
  const state = snapshotStates.get(snapshot);
  return (
    containsSorted(state.cpuPageIds, pageId) &&
    containsSorted(state.gpuPageIds, pageId)
  );
}

function requireSnapshot(index, snapshot) {
  const state = snapshotStates.get(snapshot);
  if (!state) {
    throw new TypeError("Expected SCALE-1C physical snapshot");
  }
  requireArtifact(index, state.artifactIdentityWords, "Physical snapshot");
  return state;
}

function requireCompatibleSnapshot(baseSnapshot, nextSnapshot) {
  const base = snapshotStates.get(baseSnapshot);
  const next = snapshotStates.get(nextSnapshot);
  if (base.leaseIdentity !== next.leaseIdentity) {
    throw new Error("SCALE-1C physical receipt identity was rebound");
  }
  for (const [name, baseGeneration, nextGeneration, baseIds, nextIds] of [
    [
      "CPU",
      base.cpuGeneration,
      next.cpuGeneration,
      base.cpuPageIds,
      next.cpuPageIds,
    ],
    [
      "GPU",
      base.gpuGeneration,
      next.gpuGeneration,
      base.gpuPageIds,
      next.gpuPageIds,
    ],
  ]) {
    if (nextGeneration < baseGeneration) {
      throw new Error(`SCALE-1C ${name} physical generation regressed`);
    }
    if (nextGeneration === baseGeneration && !wordsEqual(baseIds, nextIds)) {
      throw new Error(
        `SCALE-1C ${name} Page set changed without generation advance`,
      );
    }
  }
}

export function validateSegmentedAssetPagePhysicalSnapshot(index, snapshot) {
  requireSnapshot(index, snapshot);
  return snapshot;
}

export function validateSegmentedAssetPagePhysicalProgression(
  index,
  previous,
  next,
) {
  requireSnapshot(index, previous);
  requireSnapshot(index, next);
  requireCompatibleSnapshot(previous, next);
  return next;
}

export function validateSegmentedAssetPagePhysicalOwnership(
  index,
  ownership,
  snapshot,
) {
  const ownershipState = ownershipStates.get(ownership);
  if (!ownershipState) {
    throw new TypeError("Expected SCALE-1C Page ownership authority");
  }
  requireArtifact(
    index,
    ownershipState.artifactIdentityWords,
    "Page ownership",
  );
  requireSnapshot(index, snapshot);
  if (!activePagesHeld(ownership, snapshot)) {
    throw new Error("SCALE-1D active Core Page backing is not held");
  }
  return snapshot;
}

function activePagesHeld(ownership, snapshot) {
  const ownershipState = ownershipStates.get(ownership);
  for (const pageId of ownershipState.core.ids) {
    if (!pageReceiptReady(snapshot, pageId)) {
      return false;
    }
  }
  return true;
}

class SegmentedPreparedPagePublication {
  constructor(state) {
    this.kind = state.kind;
    this.sourceCut = state.currentCut ?? null;
    this.sourceOwnership = state.currentOwnership ?? null;
    this.physicalSnapshot = state.physicalSnapshot;
    this.targetCut = state.targetCut;
    this.targetOwnership = state.targetOwnership;
    this.targetGeneration = state.targetOwnership.generation;
    this.committedReplacementCount = state.committedReplacementCount;
    this.metrics = Object.freeze({ ...state.metrics });
    preparedPageStates.set(this, state);
    Object.freeze(this);
  }
  get commitFlags() {
    return preparedPageStates.get(this).commitFlags.slice();
  }
  get releasePageIds() {
    return preparedPageStates.get(this).releasePageIds.slice();
  }
  get abortedStagingPageIds() {
    return preparedPageStates.get(this).abortedStagingPageIds.slice();
  }
}

export function validateSegmentedPreparedPagePublication(
  index,
  prepared,
  physicalSnapshot,
) {
  const state = preparedPageStates.get(prepared);
  if (!state || consumedPreparedPages.has(prepared)) {
    throw new Error(
      "SCALE-1D prepared Page publication is invalid or consumed",
    );
  }
  requireArtifact(index, state.artifactIdentityWords, "Prepared publication");
  if (
    physicalSnapshot !== undefined &&
    state.physicalSnapshot !== physicalSnapshot
  ) {
    throw new Error("SCALE-1D prepared physical snapshot identity changed");
  }
  return prepared;
}

function physicalBytesWithMissingCore(index, snapshotState, corePageIds) {
  let cpuBytes = snapshotState.cpuStoredBytes;
  let gpuBytes = snapshotState.gpuRawBytes;
  const page = new Float64Array(11);
  for (const pageId of corePageIds) {
    index.readPage(pageId, page);
    if (!containsSorted(snapshotState.cpuPageIds, pageId)) {
      cpuBytes = exactAdd(cpuBytes, page[8], "physical CPU Page bytes");
    }
    if (!containsSorted(snapshotState.gpuPageIds, pageId)) {
      gpuBytes = exactAdd(
        gpuBytes,
        pageUploadBytes(index, page),
        "physical GPU Page bytes",
      );
    }
  }
  return { cpuBytes, gpuBytes };
}

function missingCorePageIds(snapshotState, corePageIds) {
  const output = new Uint32Array(corePageIds.length);
  let count = 0;
  for (const pageId of corePageIds) {
    if (
      !containsSorted(snapshotState.cpuPageIds, pageId) ||
      !containsSorted(snapshotState.gpuPageIds, pageId)
    ) {
      output[count++] = pageId;
    }
  }
  return output.slice(0, count);
}

class SegmentedBootstrapPlan {
  constructor(state) {
    this.status = "PLANNED";
    this.requiredCorePageCount = state.ownership.activeUniqueCorePageCount;
    this.requiredCpuBytes = state.ownership.activeCoreStoredBytes;
    this.requiredGpuBytes = state.ownership.activeCoreRawBytes;
    bootstrapStates.set(this, state);
    Object.freeze(this);
  }
  get requiredCorePageIds() {
    return ownershipStates
      .get(bootstrapStates.get(this).ownership)
      .core.ids.slice();
  }
}

export function planSegmentedAssetPageBootstrap(
  index,
  rootCut,
  snapshot,
  limits,
) {
  const snapshotState = requireSnapshot(index, snapshot);
  const normalized = normalizeLimits(limits);
  const projection = projectSegmentedAssetIntervals(index, rootCut);
  const projectionState = projectionStates.get(projection);
  const proxy = new Float64Array(4);
  const representation = new Float64Array(12);
  index.readNodeProxy(index.rootNodeIndex, proxy);
  index.readRepresentation(proxy[0], representation);
  if (
    projection.providerIntervalCount !== 1 ||
    projectionState.providerRepresentationIds[0] !== proxy[0] ||
    projectionState.providerRangeStarts[0] !== 0 ||
    projectionState.providerRangeCounts[0] !== representation[6]
  ) {
    throw new Error("SCALE-1C bootstrap cut is not the exact root provider");
  }
  const ownership = makeOwnership(index, rootCut, projection, 0);
  const bootstrapPhysical = physicalBytesWithMissingCore(
    index,
    snapshotState,
    ownershipStates.get(ownership).core.ids,
  );
  if (
    bootstrapPhysical.cpuBytes > normalized.cpuStableLimit ||
    bootstrapPhysical.gpuBytes > normalized.gpuStableLimit
  ) {
    throw new Error("SCALE-1C root bootstrap exceeds stable Page budget");
  }
  return new SegmentedBootstrapPlan({
    artifactIdentityWords: artifactWords(index),
    rootCut,
    ownership,
    snapshot,
    latestSnapshot: snapshot,
    demandedCorePageIds: missingCorePageIds(
      snapshotState,
      ownershipStates.get(ownership).core.ids,
    ),
    limits: normalized,
  });
}

export function prepareSegmentedAssetPageBootstrapPublication(
  index,
  plan,
  snapshot,
) {
  const state = bootstrapStates.get(plan);
  if (
    !state ||
    consumedTransactions.has(plan) ||
    preparedBootstraps.has(plan)
  ) {
    throw new Error("SCALE-1C bootstrap plan is invalid or consumed");
  }
  requireSnapshot(index, snapshot);
  requireCompatibleSnapshot(state.latestSnapshot, snapshot);
  state.latestSnapshot = snapshot;
  const snapshotState = snapshotStates.get(snapshot);
  if (
    snapshotState.cpuStoredBytes > state.limits.cpuStableLimit ||
    snapshotState.gpuRawBytes > state.limits.gpuStableLimit
  ) {
    throw new Error(
      "SCALE-1C bootstrap physical snapshot exceeds stable Page budget",
    );
  }
  const ready = activePagesHeld(state.ownership, snapshot);
  if (!ready) {
    return null;
  }
  const prepared = new SegmentedPreparedPagePublication({
    kind: "BOOTSTRAP",
    artifactIdentityWords: state.artifactIdentityWords,
    bootstrapPlan: plan,
    physicalSnapshot: snapshot,
    targetCut: state.rootCut,
    targetOwnership: state.ownership,
    commitFlags: new Uint8Array(0),
    releasePageIds: new Uint32Array(0),
    abortedStagingPageIds: new Uint32Array(0),
    committedReplacementCount: 0,
    metrics: {
      preparedCommitCount: 1,
      retainedPageCount: state.ownership.activeUniqueCorePageCount,
      releasedPageCount: 0,
    },
  });
  preparedBootstraps.set(plan, prepared);
  return prepared;
}

export function finalizeSegmentedAssetPageBootstrapPublication(
  index,
  prepared,
  snapshot,
) {
  validateSegmentedPreparedPagePublication(index, prepared, snapshot);
  const preparedState = preparedPageStates.get(prepared);
  const plan = preparedState.bootstrapPlan;
  const state = bootstrapStates.get(plan);
  if (
    preparedState.kind !== "BOOTSTRAP" ||
    preparedBootstraps.get(plan) !== prepared ||
    consumedTransactions.has(plan) ||
    !activePagesHeld(state.ownership, snapshot)
  ) {
    throw new Error("SCALE-1D prepared bootstrap publication is stale");
  }
  consumedTransactions.add(plan);
  consumedPreparedPages.add(prepared);
  preparedBootstraps.delete(plan);
  return Object.freeze({
    cut: state.rootCut,
    ownership: state.ownership,
    published: true,
  });
}

export function abortSegmentedAssetPageBootstrapPublication(index, prepared) {
  validateSegmentedPreparedPagePublication(index, prepared);
  const preparedState = preparedPageStates.get(prepared);
  const plan = preparedState.bootstrapPlan;
  const state = bootstrapStates.get(plan);
  if (
    preparedState.kind !== "BOOTSTRAP" ||
    preparedBootstraps.get(plan) !== prepared ||
    consumedTransactions.has(plan)
  ) {
    throw new Error("SCALE-1D prepared bootstrap publication is stale");
  }
  consumedTransactions.add(plan);
  consumedPreparedPages.add(prepared);
  preparedBootstraps.delete(plan);
  return Object.freeze({
    cancelledDemandPageIds: state.demandedCorePageIds.slice(),
    releaseStagingPageIds: state.demandedCorePageIds.slice(),
    retainedActivePageCount: 0,
  });
}

export function abortSegmentedPreparedPagePublication(index, prepared) {
  validateSegmentedPreparedPagePublication(index, prepared);
  const state = preparedPageStates.get(prepared);
  if (state.kind === "BOOTSTRAP") {
    return abortSegmentedAssetPageBootstrapPublication(index, prepared);
  }
  if (state.kind === "TRANSITION") {
    return abortSegmentedAssetPageTransition(index, state.transition);
  }
  throw new Error("SCALE-1D prepared Page publication kind is invalid");
}

export function commitSegmentedAssetPageBootstrap(
  index,
  plan,
  snapshot,
  presentationReady,
) {
  if (presentationReady !== true) {
    return Object.freeze({ ownership: null, published: false });
  }
  const prepared = prepareSegmentedAssetPageBootstrapPublication(
    index,
    plan,
    snapshot,
  );
  if (prepared === null) {
    return Object.freeze({ ownership: null, published: false });
  }
  return finalizeSegmentedAssetPageBootstrapPublication(
    index,
    prepared,
    snapshot,
  );
}

class SegmentedTransition {
  constructor(state) {
    this.status = state.blocker ? "PLANNED" : "ADMITTED";
    this.replacementCount = state.admittedFlags.length;
    this.acceptedStepCount = state.acceptedStepCount ?? 0;
    this.blocker = state.blocker;
    this.byteLength =
      state.artifactIdentityWords.byteLength +
      state.admittedFlags.byteLength +
      state.demandedCorePageIds.byteLength +
      (state.demandedOptionalShPageIds?.byteLength ?? 0) +
      state.demandOrdinals.byteLength +
      state.recordCorePageOffsets.byteLength +
      state.recordCorePageIds.byteLength +
      state.recordOptionalShPageOffsets.byteLength +
      state.recordOptionalShPageIds.byteLength;
    this.metrics = Object.freeze({ ...state.metrics });
    transitionStates.set(this, state);
    Object.freeze(this);
  }
  get admittedFlags() {
    return transitionStates.get(this).admittedFlags.slice();
  }
  get demandedCorePageIds() {
    return transitionStates.get(this).demandedCorePageIds.slice();
  }
  get demandEarliestReplacementOrdinals() {
    return transitionStates.get(this).demandOrdinals.slice();
  }
  get recordCorePageOffsets() {
    return transitionStates.get(this).recordCorePageOffsets.slice();
  }
  get recordCorePageIds() {
    return transitionStates.get(this).recordCorePageIds.slice();
  }
  get recordOptionalShPageOffsets() {
    return transitionStates.get(this).recordOptionalShPageOffsets.slice();
  }
  get recordOptionalShPageIds() {
    return transitionStates.get(this).recordOptionalShPageIds.slice();
  }
  get targetCorePageIds() {
    return transitionStates.get(this).targetCorePageIds?.slice();
  }
  get targetOptionalShPageIds() {
    return transitionStates.get(this).targetOptionalShPageIds?.slice();
  }
  get demandedOptionalShPageIds() {
    return transitionStates.get(this).demandedOptionalShPageIds?.slice();
  }
}

function exactMissingPageBytes(index, snapshotState, pageIds) {
  let cpuBytes = 0;
  let gpuBytes = 0;
  const page = new Float64Array(11);
  for (const pageId of pageIds) {
    index.readPage(pageId, page);
    if (!containsSorted(snapshotState.cpuPageIds, pageId)) {
      cpuBytes = exactAdd(cpuBytes, page[8], "missing CPU Page bytes");
    }
    if (!containsSorted(snapshotState.gpuPageIds, pageId)) {
      gpuBytes = exactAdd(
        gpuBytes,
        pageUploadBytes(index, page),
        "missing GPU Page bytes",
      );
    }
  }
  return { cpuBytes, gpuBytes };
}

/** Bounds additional acquisition to one coarse bridge path, without ownership. */
export function planSegmentedProgressiveBridge(
  index,
  currentCut,
  finalPlan,
  view,
  { maximumBytes = 8 * 1024 * 1024 } = {},
) {
  requireSafe(maximumBytes, "progressive bridge maximumBytes");
  const currentPages = new Set(
    projectSegmentedAssetIntervals(index, currentCut).fragmentCorePageIds,
  );
  const page = new Float64Array(11);
  const cost = (cut) => {
    const requiredCorePageIds = [
      ...new Set(
        projectSegmentedAssetIntervals(index, cut).fragmentCorePageIds,
      ),
    ].sort((a, b) => a - b);
    const additionalCorePageIds = requiredCorePageIds.filter(
      (id) => !currentPages.has(id),
    );
    let additionalStoredBytes = 0;
    for (const id of additionalCorePageIds) {
      index.readPage(id, page);
      additionalStoredBytes = exactAdd(
        additionalStoredBytes,
        page[8],
        "progressive bridge stored bytes",
      );
    }
    return {
      requiredCorePageIds,
      additionalCorePageIds,
      additionalStoredBytes,
    };
  };
  const planned = planSegmentedProgressiveBridgeCut(
    index,
    currentCut,
    finalPlan,
    view,
    (cut) => cost(cut).additionalStoredBytes <= maximumBytes,
  );
  if (!planned) {
    return undefined;
  }
  const measured = cost(planned.bridgeCut);
  const bridge = Object.freeze({
    ...planned,
    maximumBytes,
    ...measured,
    requiredCorePageIds: Object.freeze(measured.requiredCorePageIds),
    additionalCorePageIds: Object.freeze(measured.additionalCorePageIds),
  });
  progressiveBridgeStates.set(bridge, {
    currentCut,
    canonicalFinalCut: finalPlan.canonicalFinalCut ?? finalPlan.finalCut,
  });
  return bridge;
}

/** Plans from a held current cover and ready target subset, without taking ownership. */
export function planSegmentedReadyConvergedActiveCut(
  index,
  currentCut,
  finalPlan,
  view,
  physicalSnapshot,
  preparedCorePageIds,
  bridgePlan,
) {
  const snapshotState = requireSnapshot(index, physicalSnapshot);
  const prepared = new Set(preparedCorePageIds);
  for (const pageId of prepared) {
    if (
      !Number.isSafeInteger(pageId) ||
      pageId < 0 ||
      pageId >= index.pageCount
    ) {
      throw new Error("Ready Worker Page id is invalid");
    }
  }
  const ready = (pageId) =>
    prepared.has(pageId) &&
    containsSorted(snapshotState.cpuPageIds, pageId) &&
    containsSorted(snapshotState.gpuPageIds, pageId);
  const current = projectSegmentedAssetIntervals(index, currentCut);
  if (!current.fragmentCorePageIds.every(ready)) {
    throw new Error(
      "Ready source Core receipts or Worker positions are missing",
    );
  }
  let fallbackCut = currentCut;
  if (bridgePlan !== undefined) {
    const bridge = progressiveBridgeStates.get(bridgePlan);
    if (
      !bridge ||
      bridge.currentCut !== currentCut ||
      bridge.canonicalFinalCut !==
        (finalPlan.canonicalFinalCut ?? finalPlan.finalCut)
    ) {
      throw new Error("Progressive bridge target or source is stale");
    }
    if (bridgePlan.requiredCorePageIds.every(ready)) {
      fallbackCut = bridgePlan.bridgeCut;
    }
  }
  const target = projectSegmentedAssetSlots(
    index,
    finalPlan.canonicalFinalCut ?? finalPlan.finalCut,
  );
  const flags = new Uint8Array(target.providerIntervalCount).fill(1);
  const assetOffsets = target.providerAssetOffsets;
  const fragmentOffsets = target.assetFragmentOffsets;
  const corePages = target.fragmentCorePageIds;
  for (let slot = 0; slot < flags.length; slot++) {
    const start = fragmentOffsets[assetOffsets[slot]];
    const end = fragmentOffsets[assetOffsets[slot + 1]];
    for (let fragment = start; fragment < end; fragment++) {
      if (!ready(corePages[fragment])) {
        flags[slot] = 0;
        break;
      }
    }
  }
  return planSegmentedReadyActiveCut(
    index,
    currentCut,
    finalPlan,
    view,
    flags,
    fallbackCut,
  );
}

export function planSegmentedConvergedAssetPageTransition(
  index,
  currentOwnership,
  currentCut,
  convergedPlan,
  view,
  physicalSnapshot,
  limits,
) {
  const ownershipState = ownershipStates.get(currentOwnership);
  const snapshotState = requireSnapshot(index, physicalSnapshot);
  const normalized = normalizeLimits(limits);
  if (
    !ownershipState ||
    ownershipState.cut !== currentCut ||
    inFlightOwnerships.has(currentOwnership)
  ) {
    throw new Error("Converged Page transition source is stale");
  }
  let acceptedStepCount = 0;
  let targetCut = currentCut;
  let targetOwnership = currentOwnership;
  let targetCorePageIds = ownershipState.core.ids;
  let targetOptionalShPageIds = ownershipState.sh.ids;
  let demandedCorePageIds = new Uint32Array(0);
  let demandedOptionalShPageIds = new Uint32Array(0);
  let stagedCpuBytes = 0;
  let stagedGpuBytes = 0;
  for (let prefix = convergedPlan.stepCount; prefix >= 1; prefix--) {
    const replay = commitSegmentedConvergedActiveCutPlan(
      index,
      currentCut,
      convergedPlan,
      view,
      prefix,
    );
    const projection = projectSegmentedAssetIntervals(index, replay.cut);
    const candidate = makeOwnership(
      index,
      replay.cut,
      projection,
      currentOwnership.generation + 1,
    );
    const candidateState = ownershipStates.get(candidate);
    const allPages = pageUnion(candidateState.core.ids, candidateState.sh.ids);
    const missing = exactMissingPageBytes(index, snapshotState, allPages);
    const stableCpuBytes = exactAdd(
      candidateState.core.storedBytes,
      candidateState.sh.storedBytes,
      "converged stable CPU Page bytes",
    );
    const stableGpuBytes = exactAdd(
      candidateState.core.rawBytes,
      candidateState.sh.rawBytes,
      "converged stable GPU Page bytes",
    );
    if (
      missing.cpuBytes > normalized.replacementCpuEscrowBytes ||
      missing.gpuBytes > normalized.replacementGpuEscrowBytes ||
      exactAdd(
        snapshotState.cpuStoredBytes,
        missing.cpuBytes,
        "converged pre-swap CPU Page bytes",
      ) > normalized.maximumCpuPageBytes ||
      exactAdd(
        snapshotState.gpuRawBytes,
        missing.gpuBytes,
        "converged pre-swap GPU Page bytes",
      ) > normalized.maximumGpuPageBytes ||
      stableCpuBytes > normalized.cpuStableLimit ||
      stableGpuBytes > normalized.gpuStableLimit
    ) {
      continue;
    }
    acceptedStepCount = prefix;
    targetCut = replay.cut;
    targetOwnership = candidate;
    targetCorePageIds = candidateState.core.ids;
    targetOptionalShPageIds = candidateState.sh.ids;
    demandedCorePageIds = missingCorePageIds(snapshotState, targetCorePageIds);
    demandedOptionalShPageIds = missingCorePageIds(
      snapshotState,
      targetOptionalShPageIds,
    );
    stagedCpuBytes = missing.cpuBytes;
    stagedGpuBytes = missing.gpuBytes;
    break;
  }
  const admittedFlags = new Uint8Array(acceptedStepCount).fill(1);
  const transition = new SegmentedTransition({
    kind: "CONVERGED",
    artifactIdentityWords: artifactWords(index),
    ownership: currentOwnership,
    currentCut,
    convergedPlan,
    view,
    physicalSnapshot,
    latestPhysicalSnapshot: physicalSnapshot,
    limits: normalized,
    acceptedStepCount,
    admittedFlags,
    targetCut,
    targetOwnership,
    targetCorePageIds,
    targetOptionalShPageIds,
    demandedCorePageIds,
    demandedOptionalShPageIds,
    demandedPageIds: pageUnion(demandedCorePageIds, demandedOptionalShPageIds),
    demandOrdinals: new Uint32Array(demandedCorePageIds.length),
    recordCorePageOffsets: new Uint32Array(acceptedStepCount + 1),
    recordCorePageIds: new Uint32Array(0),
    recordOptionalShPageOffsets: new Uint32Array(acceptedStepCount + 1),
    recordOptionalShPageIds: new Uint32Array(0),
    blocker:
      acceptedStepCount === 0 && convergedPlan.stepCount > 0
        ? "REPLACEMENT_ESCROW_EXCEEDED"
        : null,
    metrics: {
      logicalClosureStepCount: convergedPlan.stepCount,
      admittedClosureStepCount: acceptedStepCount,
      stagedUniqueCorePageCount: demandedCorePageIds.length,
      stagedUniqueShPageCount: demandedOptionalShPageIds.length,
      stagedPageStoredBytes: stagedCpuBytes,
      stagedPageRawBytes: stagedGpuBytes,
      exactFinalTarget:
        acceptedStepCount === convergedPlan.stepCount &&
        !convergedPlan.isIntermediate,
    },
  });
  if (acceptedStepCount > 0) {
    inFlightOwnerships.add(currentOwnership);
  }
  return transition;
}

export function prepareSegmentedConvergedAssetPagePublication(
  index,
  currentCut,
  currentOwnership,
  convergedPlan,
  transition,
  physicalSnapshot,
) {
  const state = transitionStates.get(transition);
  if (
    !state ||
    state.kind !== "CONVERGED" ||
    consumedTransactions.has(transition) ||
    preparedTransitions.has(transition) ||
    state.currentCut !== currentCut ||
    state.ownership !== currentOwnership ||
    state.convergedPlan !== convergedPlan ||
    state.acceptedStepCount < 1
  ) {
    throw new Error("Converged Page publication binding is stale");
  }
  const snapshotState = requireSnapshot(index, physicalSnapshot);
  requireCompatibleSnapshot(state.latestPhysicalSnapshot, physicalSnapshot);
  state.latestPhysicalSnapshot = physicalSnapshot;
  if (
    !activePagesHeld(currentOwnership, physicalSnapshot) ||
    !activePagesHeld(state.targetOwnership, physicalSnapshot)
  ) {
    return null;
  }
  const replay = commitSegmentedConvergedActiveCutPlan(
    index,
    currentCut,
    convergedPlan,
    state.view,
    state.acceptedStepCount,
  );
  const expected = projectSegmentedActiveCutProviders(index, state.targetCut);
  const actual = projectSegmentedActiveCutProviders(index, replay.cut);
  if (
    !wordsEqual(expected.representationIds, actual.representationIds) ||
    !wordsEqual(expected.rangeStarts, actual.rangeStarts) ||
    !wordsEqual(expected.rangeCounts, actual.rangeCounts)
  ) {
    throw new Error("Converged Page proof replay diverged");
  }
  const currentState = ownershipStates.get(currentOwnership);
  const targetState = ownershipStates.get(state.targetOwnership);
  const currentHeld = pageUnion(
    currentState.core.ids,
    heldPageSubset(snapshotState, currentState.sh.ids),
  );
  const targetDesired = pageUnion(targetState.core.ids, targetState.sh.ids);
  const releasePageIds = pageDifference(currentHeld, targetDesired);
  const prepared = new SegmentedPreparedPagePublication({
    kind: "TRANSITION",
    artifactIdentityWords: state.artifactIdentityWords,
    transition,
    physicalSnapshot,
    currentCut,
    currentOwnership,
    activeCutPlan: convergedPlan,
    targetCut: state.targetCut,
    targetOwnership: state.targetOwnership,
    providerDiff: diffSegmentedActiveCutProviders(
      index,
      currentCut,
      state.targetCut,
    ),
    commitFlags: state.admittedFlags,
    releasePageIds,
    abortedStagingPageIds: new Uint32Array(0),
    committedReplacementCount: state.acceptedStepCount,
    metrics: {
      logicalClosureStepCount: convergedPlan.stepCount,
      committedClosureStepCount: state.acceptedStepCount,
      retainedPageCount: targetDesired.length,
      releasedPageCount: releasePageIds.length,
      postReleaseCpuStableBytes: exactAdd(
        targetState.core.storedBytes,
        targetState.sh.storedBytes,
        "converged committed CPU Page bytes",
      ),
      postReleaseGpuStableBytes: exactAdd(
        targetState.core.rawBytes,
        targetState.sh.rawBytes,
        "converged committed GPU Page bytes",
      ),
    },
  });
  preparedTransitions.set(transition, prepared);
  return prepared;
}

function projectionFragmentRange(state, provider) {
  const firstAsset = state.providerAssetOffsets[provider];
  const endAsset = state.providerAssetOffsets[provider + 1];
  return [
    state.assetFragmentOffsets[firstAsset],
    state.assetFragmentOffsets[endAsset],
  ];
}

function createPageLedger(
  baseline,
  extraReferenceCount,
  snapshotState,
  initiallyExcludedIds = new Uint32Array(0),
) {
  const capacity = nextPowerOfTwo(
    Math.max(
      2,
      (baseline.ids.length +
        extraReferenceCount +
        initiallyExcludedIds.length) *
        2,
    ),
  );
  const keys = new Uint32Array(capacity);
  keys.fill(INVALID_INDEX);
  const refs = new Float64Array(capacity);
  const excludeWhenUnrequired = new Uint8Array(capacity);
  const cpuPhysicalState = new Int8Array(capacity);
  const gpuPhysicalState = new Int8Array(capacity);
  for (let position = 0; position < baseline.ids.length; position++) {
    const pageId = baseline.ids[position];
    const slot = hashSlot(keys, pageId);
    keys[slot] = pageId;
    refs[slot] = baseline.referenceCounts[position];
    excludeWhenUnrequired[slot] = 1;
  }
  return {
    keys,
    refs,
    excludeWhenUnrequired,
    cpuPhysicalState,
    gpuPhysicalState,
    snapshotState,
    initiallyExcludedIds,
    storedBytes: baseline.storedBytes,
    rawBytes: baseline.rawBytes,
  };
}

function adjustPhysicalAxis(
  physical,
  byteField,
  stateArray,
  slot,
  bytes,
  held,
  requiredWhenMissing,
  excludeWhenUnrequired,
  becameRequired,
) {
  const field = byteField === 8 ? "cpuBytes" : "gpuBytes";
  if (becameRequired) {
    if (stateArray[slot] === -1) {
      physical[field] = exactAdd(physical[field], bytes, "post-release bytes");
      stateArray[slot] = 0;
    } else if (requiredWhenMissing && !held) {
      physical[field] = exactAdd(physical[field], bytes, "post-release bytes");
      stateArray[slot] = 1;
    }
  } else if (stateArray[slot] === 1) {
    physical[field] = exactSubtract(
      physical[field],
      bytes,
      "post-release bytes",
    );
    stateArray[slot] = 0;
  } else if (excludeWhenUnrequired && held && stateArray[slot] === 0) {
    physical[field] = exactSubtract(
      physical[field],
      bytes,
      "post-release bytes",
    );
    stateArray[slot] = -1;
  }
}

function adjustPageLedger(
  index,
  ledger,
  projection,
  provider,
  fieldName,
  delta,
  physical,
  requiredWhenMissing,
) {
  const [start, end] = projectionFragmentRange(projection, provider);
  const page = new Float64Array(11);
  for (let fragment = start; fragment < end; fragment++) {
    const pageId = projection[fieldName][fragment];
    if (pageId === INVALID_INDEX) {
      continue;
    }
    const slot = hashSlot(ledger.keys, pageId);
    const oldReferences =
      ledger.keys[slot] === INVALID_INDEX ? 0 : ledger.refs[slot];
    const nextReferences = oldReferences + delta;
    if (!Number.isSafeInteger(nextReferences) || nextReferences < 0) {
      throw new Error("SCALE-1C Core Page ownership ledger underflow");
    }
    if (ledger.keys[slot] === INVALID_INDEX) {
      ledger.keys[slot] = pageId;
      if (containsSorted(ledger.initiallyExcludedIds, pageId)) {
        ledger.excludeWhenUnrequired[slot] = 1;
        if (containsSorted(ledger.snapshotState.cpuPageIds, pageId)) {
          ledger.cpuPhysicalState[slot] = -1;
        }
        if (containsSorted(ledger.snapshotState.gpuPageIds, pageId)) {
          ledger.gpuPhysicalState[slot] = -1;
        }
      }
    }
    ledger.refs[slot] = nextReferences;
    if ((oldReferences === 0) === (nextReferences === 0)) {
      continue;
    }
    index.readPage(pageId, page);
    if (nextReferences === 0) {
      ledger.storedBytes = exactSubtract(
        ledger.storedBytes,
        page[8],
        "desired Page stored bytes",
      );
      ledger.rawBytes = exactSubtract(
        ledger.rawBytes,
        pageUploadBytes(index, page),
        "desired Page raw bytes",
      );
    } else {
      ledger.storedBytes = exactAdd(
        ledger.storedBytes,
        page[8],
        "desired Page stored bytes",
      );
      ledger.rawBytes = exactAdd(
        ledger.rawBytes,
        pageUploadBytes(index, page),
        "desired Page physical GPU bytes",
      );
    }
    const becameRequired = nextReferences > 0;
    const cpuHeld = containsSorted(ledger.snapshotState.cpuPageIds, pageId);
    const gpuHeld = containsSorted(ledger.snapshotState.gpuPageIds, pageId);
    adjustPhysicalAxis(
      physical,
      8,
      ledger.cpuPhysicalState,
      slot,
      page[8],
      cpuHeld,
      requiredWhenMissing,
      ledger.excludeWhenUnrequired[slot] === 1,
      becameRequired,
    );
    adjustPhysicalAxis(
      physical,
      9,
      ledger.gpuPhysicalState,
      slot,
      pageUploadBytes(index, page),
      gpuHeld,
      requiredWhenMissing,
      ledger.excludeWhenUnrequired[slot] === 1,
      becameRequired,
    );
  }
}

function activePageLedgerIds(ledger) {
  const ids = new Uint32Array(ledger.keys.length);
  let count = 0;
  for (let slot = 0; slot < ledger.keys.length; slot++) {
    if (ledger.keys[slot] !== INVALID_INDEX && ledger.refs[slot] > 0) {
      ids[count++] = ledger.keys[slot];
    }
  }
  return radixSortUint32(ids.slice(0, count));
}

function buildRecordPageCsr(projection, fieldName) {
  const pageIds = projection[fieldName];
  const providerCount = projection.providerRepresentationIds.length;
  const offsets = new Uint32Array(providerCount + 1);
  const ids = new Uint32Array(pageIds.length);
  let count = 0;
  for (let provider = 0; provider < providerCount; provider++) {
    const [start, end] = projectionFragmentRange(projection, provider);
    const capacity = nextPowerOfTwo(Math.max(2, (end - start) * 2));
    const keys = new Uint32Array(capacity);
    keys.fill(INVALID_INDEX);
    for (let fragment = start; fragment < end; fragment++) {
      const pageId = pageIds[fragment];
      if (pageId === INVALID_INDEX) {
        continue;
      }
      const slot = hashSlot(keys, pageId);
      if (keys[slot] === INVALID_INDEX) {
        keys[slot] = pageId;
        ids[count++] = pageId;
      }
    }
    offsets[provider + 1] = count;
  }
  return { offsets, ids: ids.slice(0, count) };
}

function heldOptionalShBytes(index, ownershipState, snapshotState) {
  let cpuBytes = 0;
  let gpuBytes = 0;
  const page = new Float64Array(11);
  for (const pageId of ownershipState.sh.ids) {
    const cpuHeld = containsSorted(snapshotState.cpuPageIds, pageId);
    const gpuHeld = containsSorted(snapshotState.gpuPageIds, pageId);
    if (!cpuHeld && !gpuHeld) {
      continue;
    }
    index.readPage(pageId, page);
    if (cpuHeld) {
      cpuBytes = exactAdd(cpuBytes, page[8], "held optional SH stored bytes");
    }
    if (gpuHeld) {
      gpuBytes = exactAdd(
        gpuBytes,
        pageUploadBytes(index, page),
        "held optional SH physical bytes",
      );
    }
  }
  return { cpuBytes, gpuBytes };
}

export function planSegmentedAssetPageTransition(
  index,
  ownership,
  currentCut,
  activeCutPlan,
  physicalSnapshot,
  limits,
) {
  const ownershipState = ownershipStates.get(ownership);
  if (!ownershipState || ownershipState.cut !== currentCut) {
    throw new Error("SCALE-1C ownership/cut binding is stale");
  }
  if (inFlightOwnerships.has(ownership)) {
    throw new Error("SCALE-1C ownership already has an in-flight transaction");
  }
  requireArtifact(index, ownershipState.artifactIdentityWords, "Ownership");
  requireSnapshot(index, physicalSnapshot);
  if (!activePagesHeld(ownership, physicalSnapshot)) {
    throw new Error("SCALE-1C active Core receipt is not held");
  }
  const normalized = normalizeLimits(limits);
  const snapshotState = snapshotStates.get(physicalSnapshot);
  const heldSh = heldOptionalShBytes(index, ownershipState, snapshotState);
  if (
    snapshotState.cpuStoredBytes > normalized.cpuStableLimit ||
    snapshotState.gpuRawBytes > normalized.gpuStableLimit
  ) {
    throw new Error("SCALE-1C stable consumer occupies replacement escrow");
  }
  const replacementCount = activeCutPlan.replacementCount;
  const scratch = new Float64Array(10);
  const newIds = new Uint32Array(replacementCount);
  const newStarts = new Uint32Array(replacementCount);
  const newCounts = new Uint32Array(replacementCount);
  const oldIds = new Uint32Array(replacementCount);
  const oldStarts = new Uint32Array(replacementCount);
  const oldCounts = new Uint32Array(replacementCount);
  const projectedCut = activeCutPlan.projectedCut;
  const projectedRepresentationIds = projectedCut.providerRepresentationIds;
  const projectedStarts = projectedCut.providerRangeStarts;
  const projectedCounts = projectedCut.providerRangeCounts;
  for (let record = 0; record < replacementCount; record++) {
    activeCutPlan.readReplacement(record, scratch, currentCut);
    const slot = scratch[9];
    if (
      slot >= projectedRepresentationIds.length ||
      projectedRepresentationIds[slot] !== scratch[2] ||
      projectedStarts[slot] !== scratch[3] ||
      projectedCounts[slot] !== scratch[4]
    ) {
      throw new Error("SCALE-1C replacement interval binding is invalid");
    }
    oldIds[record] = scratch[2];
    oldStarts[record] = scratch[3];
    oldCounts[record] = scratch[4];
    newIds[record] = scratch[5];
    newStarts[record] = scratch[6];
    newCounts[record] = scratch[7];
  }
  const oldProjection = projectProviderArrays(
    index,
    oldIds,
    oldStarts,
    oldCounts,
  );
  const newProjection = projectProviderArrays(
    index,
    newIds,
    newStarts,
    newCounts,
  );
  const baseProjection = projectProviderArrays(
    index,
    projectedRepresentationIds,
    projectedStarts,
    projectedCounts,
  );
  const baseState = projectionStates.get(baseProjection);
  const baseCore = aggregatePages(index, baseState.fragmentCorePageIds);
  const baseSh = aggregatePages(
    index,
    index.maxShDegree === 0 ? new Uint32Array(0) : baseState.fragmentShPageIds,
  );
  if (
    !wordsEqual(baseCore.ids, ownershipState.core.ids) ||
    baseCore.storedBytes !== ownership.activeCoreStoredBytes ||
    baseCore.rawBytes !== ownership.activeCoreRawBytes ||
    !wordsEqual(baseSh.ids, ownershipState.sh.ids)
  ) {
    throw new Error("SCALE-1C resource-neutral projection changed ownership");
  }
  const oldState = projectionStates.get(oldProjection);
  const newState = projectionStates.get(newProjection);
  const coreCsr = buildRecordPageCsr(newState, "fragmentCorePageIds");
  const shCsr = buildRecordPageCsr(newState, "fragmentShPageIds");
  const physical = {
    cpuBytes: snapshotState.cpuStoredBytes,
    gpuBytes: snapshotState.gpuRawBytes,
  };
  const coreLedger = createPageLedger(
    baseCore,
    oldState.fragmentCorePageIds.length + newState.fragmentCorePageIds.length,
    snapshotState,
  );
  const shLedger = createPageLedger(
    baseSh,
    oldState.fragmentShPageIds.length + newState.fragmentShPageIds.length,
    snapshotState,
  );
  const admittedFlags = new Uint8Array(replacementCount);
  const demandCapacity = nextPowerOfTwo(
    Math.max(2, newState.fragmentCorePageIds.length * 2),
  );
  const demandKeys = new Uint32Array(demandCapacity);
  demandKeys.fill(INVALID_INDEX);
  const demandPriority = new Uint32Array(demandCapacity);
  const demandOrdered = new Uint32Array(newState.fragmentCorePageIds.length);
  let demandCount = 0;
  let stagedCpuBytes = 0;
  let stagedGpuBytes = 0;
  let maximumSingleRecordCoreStoredBytes = 0;
  let maximumSingleRecordCoreRawBytes = 0;
  let sawEscrowRejection = false;
  let sawStableRejection = false;
  const page = new Float64Array(11);
  for (let record = 0; record < replacementCount; record++) {
    const [start, end] = projectionFragmentRange(newState, record);
    let recordCpu = 0;
    let recordGpu = 0;
    const recordCapacity = nextPowerOfTwo(Math.max(2, (end - start) * 2));
    const recordKeys = new Uint32Array(recordCapacity);
    recordKeys.fill(INVALID_INDEX);
    const recordDemandSlots = new Uint32Array(end - start);
    const recordDemandIds = new Uint32Array(end - start);
    let recordDemandCount = 0;
    for (let fragment = start; fragment < end; fragment++) {
      const pageId = newState.fragmentCorePageIds[fragment];
      const slot = hashSlot(demandKeys, pageId);
      const recordSlot = hashSlot(recordKeys, pageId);
      if (
        demandKeys[slot] !== INVALID_INDEX ||
        recordKeys[recordSlot] !== INVALID_INDEX
      ) {
        continue;
      }
      const cpuHeld = containsSorted(snapshotState.cpuPageIds, pageId);
      const gpuHeld = containsSorted(snapshotState.gpuPageIds, pageId);
      if (cpuHeld && gpuHeld) {
        continue;
      }
      recordKeys[recordSlot] = pageId;
      index.readPage(pageId, page);
      if (!cpuHeld) {
        recordCpu = exactAdd(recordCpu, page[8], "record CPU bytes");
      }
      if (!gpuHeld) {
        recordGpu = exactAdd(
          recordGpu,
          pageUploadBytes(index, page),
          "record GPU bytes",
        );
      }
      recordDemandSlots[recordDemandCount] = slot;
      recordDemandIds[recordDemandCount] = pageId;
      recordDemandCount++;
    }
    maximumSingleRecordCoreStoredBytes = Math.max(
      maximumSingleRecordCoreStoredBytes,
      recordCpu,
    );
    maximumSingleRecordCoreRawBytes = Math.max(
      maximumSingleRecordCoreRawBytes,
      recordGpu,
    );
    adjustPageLedger(
      index,
      coreLedger,
      oldState,
      record,
      "fragmentCorePageIds",
      -1,
      physical,
      true,
    );
    adjustPageLedger(
      index,
      coreLedger,
      newState,
      record,
      "fragmentCorePageIds",
      1,
      physical,
      true,
    );
    adjustPageLedger(
      index,
      shLedger,
      oldState,
      record,
      "fragmentShPageIds",
      -1,
      physical,
      false,
    );
    adjustPageLedger(
      index,
      shLedger,
      newState,
      record,
      "fragmentShPageIds",
      1,
      physical,
      false,
    );
    const nextStagedCpuBytes = exactAdd(
      stagedCpuBytes,
      recordCpu,
      "staged Core stored bytes",
    );
    const nextStagedGpuBytes = exactAdd(
      stagedGpuBytes,
      recordGpu,
      "staged Core raw bytes",
    );
    const exceedsEscrow =
      nextStagedCpuBytes > normalized.replacementCpuEscrowBytes ||
      nextStagedGpuBytes > normalized.replacementGpuEscrowBytes ||
      exactAdd(
        snapshotState.cpuStoredBytes,
        nextStagedCpuBytes,
        "pre-swap CPU Page bytes",
      ) > normalized.maximumCpuPageBytes ||
      exactAdd(
        snapshotState.gpuRawBytes,
        nextStagedGpuBytes,
        "pre-swap GPU Page bytes",
      ) > normalized.maximumGpuPageBytes;
    const exceedsStable =
      physical.cpuBytes > normalized.cpuStableLimit ||
      physical.gpuBytes > normalized.gpuStableLimit;
    if (exceedsEscrow || exceedsStable) {
      sawEscrowRejection ||= exceedsEscrow;
      sawStableRejection ||= exceedsStable;
      adjustPageLedger(
        index,
        shLedger,
        newState,
        record,
        "fragmentShPageIds",
        -1,
        physical,
        false,
      );
      adjustPageLedger(
        index,
        shLedger,
        oldState,
        record,
        "fragmentShPageIds",
        1,
        physical,
        false,
      );
      adjustPageLedger(
        index,
        coreLedger,
        newState,
        record,
        "fragmentCorePageIds",
        -1,
        physical,
        true,
      );
      adjustPageLedger(
        index,
        coreLedger,
        oldState,
        record,
        "fragmentCorePageIds",
        1,
        physical,
        true,
      );
      continue;
    }
    admittedFlags[record] = 1;
    stagedCpuBytes = nextStagedCpuBytes;
    stagedGpuBytes = nextStagedGpuBytes;
    for (let local = 0; local < recordDemandCount; local++) {
      const slot = recordDemandSlots[local];
      const pageId = recordDemandIds[local];
      demandKeys[slot] = pageId;
      demandPriority[slot] = record;
      demandOrdered[demandCount] = pageId;
      demandCount++;
    }
  }
  const demandedCorePageIds = demandOrdered.slice(0, demandCount);
  const sortedIdsOnly = radixSortUint32(demandedCorePageIds);
  const sortedDemand = new Uint32Array(demandCount);
  const sortedOrdinals = new Uint32Array(demandCount);
  for (let index = 0; index < demandCount; index++) {
    sortedDemand[index] = sortedIdsOnly[index];
    const slot = hashSlot(demandKeys, sortedIdsOnly[index]);
    sortedOrdinals[index] = demandPriority[slot];
  }
  const transition = new SegmentedTransition({
    artifactIdentityWords: artifactWords(index),
    ownership,
    currentCut,
    activeCutPlan,
    physicalSnapshot,
    latestPhysicalSnapshot: physicalSnapshot,
    limits: normalized,
    admittedFlags,
    baseProjection,
    oldProjection,
    newProjection,
    demandedCorePageIds: sortedDemand,
    demandOrdinals: sortedOrdinals,
    recordCorePageOffsets: coreCsr.offsets,
    recordCorePageIds: coreCsr.ids,
    recordOptionalShPageOffsets: shCsr.offsets,
    recordOptionalShPageIds: shCsr.ids,
    blocker:
      admittedFlags.some((value) => value === 1) || replacementCount === 0
        ? null
        : sawStableRejection && !sawEscrowRejection
          ? "STABLE_PAGE_LIMIT_EXCEEDED"
          : "REPLACEMENT_ESCROW_EXCEEDED",
    metrics: {
      physicalAdmittedCount: admittedFlags.reduce(
        (sum, value) => sum + value,
        0,
      ),
      stagedUniqueCorePageCount: demandCount,
      stagedCoreStoredBytes: stagedCpuBytes,
      stagedCoreRawBytes: stagedGpuBytes,
      heldOptionalShStoredBytes: heldSh.cpuBytes,
      heldOptionalShRawBytes: heldSh.gpuBytes,
      preSwapCpuPeakBytes: exactAdd(
        snapshotState.cpuStoredBytes,
        stagedCpuBytes,
        "pre-swap CPU Page bytes",
      ),
      preSwapGpuPeakBytes: exactAdd(
        snapshotState.gpuRawBytes,
        stagedGpuBytes,
        "pre-swap GPU Page bytes",
      ),
      maximumSingleRecordCoreStoredBytes,
      maximumSingleRecordCoreRawBytes,
      postSwapCoreStoredBytes: coreLedger.storedBytes,
      postSwapCoreRawBytes: coreLedger.rawBytes,
      postReleaseCpuStableBytes: physical.cpuBytes,
      postReleaseGpuStableBytes: physical.gpuBytes,
      stableCpuPageLimit: normalized.cpuStableLimit,
      stableGpuPageLimit: normalized.gpuStableLimit,
      replacementCpuEscrowLimit: normalized.replacementCpuEscrowBytes,
      replacementGpuEscrowLimit: normalized.replacementGpuEscrowBytes,
    },
  });
  inFlightOwnerships.add(ownership);
  return transition;
}

export function deriveSegmentedAssetPagePhysicalReady(
  index,
  transition,
  snapshot,
) {
  const state = transitionStates.get(transition);
  if (!state) {
    throw new TypeError("Expected SCALE-1C transition");
  }
  requireArtifact(index, state.artifactIdentityWords, "Transition");
  requireSnapshot(index, snapshot);
  requireCompatibleSnapshot(state.latestPhysicalSnapshot, snapshot);
  state.latestPhysicalSnapshot = snapshot;
  if (!activePagesHeld(state.ownership, snapshot)) {
    throw new Error("SCALE-1C active Core receipt disappeared");
  }
  const ready = new Uint8Array(state.admittedFlags.length);
  for (let record = 0; record < ready.length; record++) {
    if (state.admittedFlags[record] === 0) {
      continue;
    }
    const start = state.recordCorePageOffsets[record];
    const end = state.recordCorePageOffsets[record + 1];
    ready[record] = 1;
    for (let position = start; position < end; position++) {
      if (!pageReceiptReady(snapshot, state.recordCorePageIds[position])) {
        ready[record] = 0;
        break;
      }
    }
  }
  return ready;
}

function pageDifference(left, right) {
  const output = new Uint32Array(left.length);
  let count = 0;
  for (const pageId of left) {
    if (!containsSorted(right, pageId)) {
      output[count++] = pageId;
    }
  }
  return output.slice(0, count);
}

function pageUnion(left, right) {
  const output = new Uint32Array(left.length + right.length);
  let leftIndex = 0;
  let rightIndex = 0;
  let count = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    const leftValue = leftIndex < left.length ? left[leftIndex] : Infinity;
    const rightValue = rightIndex < right.length ? right[rightIndex] : Infinity;
    const value = Math.min(leftValue, rightValue);
    output[count++] = value;
    if (leftValue === value) {
      leftIndex++;
    }
    if (rightValue === value) {
      rightIndex++;
    }
  }
  return output.slice(0, count);
}

function heldPageSubset(snapshotState, pageIds) {
  const output = new Uint32Array(pageIds.length);
  let count = 0;
  for (const pageId of pageIds) {
    if (
      containsSorted(snapshotState.cpuPageIds, pageId) ||
      containsSorted(snapshotState.gpuPageIds, pageId)
    ) {
      output[count++] = pageId;
    }
  }
  return output.slice(0, count);
}

function subtractHeldPages(index, physical, snapshotState, pageIds) {
  const page = new Float64Array(11);
  for (const pageId of pageIds) {
    index.readPage(pageId, page);
    if (containsSorted(snapshotState.cpuPageIds, pageId)) {
      physical.cpuBytes = exactSubtract(
        physical.cpuBytes,
        page[8],
        "post-release CPU Page bytes",
      );
    }
    if (containsSorted(snapshotState.gpuPageIds, pageId)) {
      physical.gpuBytes = exactSubtract(
        physical.gpuBytes,
        pageUploadBytes(index, page),
        "post-release GPU Page bytes",
      );
    }
  }
}

class SegmentedPublicationBundle {
  constructor(state) {
    this.cut = state.cut;
    this.ownership = state.ownership;
    this.providerDiff = state.providerDiff;
    this.metrics = Object.freeze({ ...state.metrics });
    publicationStates.set(this, state);
    Object.freeze(this);
  }
  get commitFlags() {
    return publicationStates.get(this).commitFlags.slice();
  }
  get releasePageIds() {
    return publicationStates.get(this).releasePageIds.slice();
  }
  get abortedStagingPageIds() {
    return publicationStates.get(this).abortedStagingPageIds.slice();
  }
}

class SegmentedAbortResult {
  constructor(state) {
    this.retainedActivePageCount = state.retainedActivePageCount;
    abortStates.set(this, state);
    Object.freeze(this);
  }
  get cancelledDemandPageIds() {
    return abortStates.get(this).cancelledDemandPageIds.slice();
  }
  get releaseStagingPageIds() {
    return abortStates.get(this).releaseStagingPageIds.slice();
  }
}

export function prepareSegmentedAssetPagePublication(
  index,
  currentCut,
  currentOwnership,
  activeCutPlan,
  transition,
  physicalSnapshot,
  candidateFlags,
) {
  const state = transitionStates.get(transition);
  const ownershipState = ownershipStates.get(currentOwnership);
  if (
    !state ||
    consumedTransactions.has(transition) ||
    state.currentCut !== currentCut ||
    state.ownership !== currentOwnership ||
    state.activeCutPlan !== activeCutPlan ||
    preparedTransitions.has(transition) ||
    !(candidateFlags instanceof Uint8Array) ||
    candidateFlags.length !== state.admittedFlags.length
  ) {
    throw new Error("SCALE-1C publication binding is stale or invalid");
  }
  for (const value of candidateFlags) {
    if (value !== 0 && value !== 1) {
      throw new Error("SCALE-1D candidate flags are invalid");
    }
  }
  const snapshotState = requireSnapshot(index, physicalSnapshot);
  requireCompatibleSnapshot(state.latestPhysicalSnapshot, physicalSnapshot);
  state.latestPhysicalSnapshot = physicalSnapshot;
  if (
    snapshotState.cpuStoredBytes > state.limits.maximumCpuPageBytes ||
    snapshotState.gpuRawBytes > state.limits.maximumGpuPageBytes
  ) {
    throw new Error("SCALE-1C physical snapshot exceeds hard Page ceiling");
  }
  if (!activePagesHeld(currentOwnership, physicalSnapshot)) {
    throw new Error("SCALE-1C active Core receipt disappeared");
  }
  if (state.admittedFlags.length === 0) {
    consumedTransactions.add(transition);
    inFlightOwnerships.delete(state.ownership);
    return null;
  }
  const physical = deriveSegmentedAssetPagePhysicalReady(
    index,
    transition,
    physicalSnapshot,
  );
  const commitFlags = new Uint8Array(physical.length);
  const baseProjection = projectionStates.get(state.baseProjection);
  const oldProjection = projectionStates.get(state.oldProjection);
  const newProjection = projectionStates.get(state.newProjection);
  const baseCore = aggregatePages(index, baseProjection.fragmentCorePageIds);
  const baseSh = aggregatePages(
    index,
    index.maxShDegree === 0
      ? new Uint32Array(0)
      : baseProjection.fragmentShPageIds,
  );
  const postReleasePhysical = {
    cpuBytes: snapshotState.cpuStoredBytes,
    gpuBytes: snapshotState.gpuRawBytes,
  };
  subtractHeldPages(
    index,
    postReleasePhysical,
    snapshotState,
    state.demandedCorePageIds,
  );
  const commitCoreLedger = createPageLedger(
    baseCore,
    oldProjection.fragmentCorePageIds.length +
      newProjection.fragmentCorePageIds.length,
    snapshotState,
    state.demandedCorePageIds,
  );
  const commitShLedger = createPageLedger(
    baseSh,
    oldProjection.fragmentShPageIds.length +
      newProjection.fragmentShPageIds.length,
    snapshotState,
  );
  let committed = 0;
  for (let record = 0; record < physical.length; record++) {
    const eligible =
      state.admittedFlags[record] & physical[record] & candidateFlags[record];
    if (eligible === 0) {
      continue;
    }
    adjustPageLedger(
      index,
      commitCoreLedger,
      oldProjection,
      record,
      "fragmentCorePageIds",
      -1,
      postReleasePhysical,
      true,
    );
    adjustPageLedger(
      index,
      commitCoreLedger,
      newProjection,
      record,
      "fragmentCorePageIds",
      1,
      postReleasePhysical,
      true,
    );
    adjustPageLedger(
      index,
      commitShLedger,
      oldProjection,
      record,
      "fragmentShPageIds",
      -1,
      postReleasePhysical,
      false,
    );
    adjustPageLedger(
      index,
      commitShLedger,
      newProjection,
      record,
      "fragmentShPageIds",
      1,
      postReleasePhysical,
      false,
    );
    if (
      postReleasePhysical.cpuBytes > state.limits.cpuStableLimit ||
      postReleasePhysical.gpuBytes > state.limits.gpuStableLimit
    ) {
      adjustPageLedger(
        index,
        commitShLedger,
        newProjection,
        record,
        "fragmentShPageIds",
        -1,
        postReleasePhysical,
        false,
      );
      adjustPageLedger(
        index,
        commitShLedger,
        oldProjection,
        record,
        "fragmentShPageIds",
        1,
        postReleasePhysical,
        false,
      );
      adjustPageLedger(
        index,
        commitCoreLedger,
        newProjection,
        record,
        "fragmentCorePageIds",
        -1,
        postReleasePhysical,
        true,
      );
      adjustPageLedger(
        index,
        commitCoreLedger,
        oldProjection,
        record,
        "fragmentCorePageIds",
        1,
        postReleasePhysical,
        true,
      );
      continue;
    }
    commitFlags[record] = 1;
    committed++;
  }
  if (committed === 0) {
    return null;
  }
  const logical = commitSegmentedActiveCutPlan(
    index,
    currentCut,
    activeCutPlan,
    commitFlags,
  );
  const projection = projectSegmentedAssetIntervals(index, logical.cut);
  const nextOwnership = makeOwnership(
    index,
    logical.cut,
    projection,
    currentOwnership.generation + 1,
  );
  if (
    nextOwnership.activeCoreStoredBytes !== commitCoreLedger.storedBytes ||
    nextOwnership.activeCoreRawBytes !== commitCoreLedger.rawBytes ||
    !wordsEqual(
      ownershipStates.get(nextOwnership).sh.ids,
      activePageLedgerIds(commitShLedger),
    ) ||
    postReleasePhysical.cpuBytes > state.limits.cpuStableLimit ||
    postReleasePhysical.gpuBytes > state.limits.gpuStableLimit ||
    !activePagesHeld(nextOwnership, physicalSnapshot)
  ) {
    throw new Error("SCALE-1C post-swap ownership or receipt is illegal");
  }
  const nextState = ownershipStates.get(nextOwnership);
  const oldHeldOptionalSh = heldPageSubset(
    snapshotState,
    ownershipState.sh.ids,
  );
  const oldHeldOwnership = pageUnion(
    ownershipState.core.ids,
    oldHeldOptionalSh,
  );
  const nextDesiredOwnership = pageUnion(nextState.core.ids, nextState.sh.ids);
  const releasePageIds = pageDifference(oldHeldOwnership, nextDesiredOwnership);
  const abortedStagingPageIds = pageDifference(
    state.demandedCorePageIds,
    nextState.core.ids,
  );
  const metrics = {
    physicalReadyCount: physical.reduce((a, b) => a + b, 0),
    committedReplacementCount: committed,
    retainedPageCount: pageUnion(
      nextState.core.ids,
      heldPageSubset(snapshotState, nextState.sh.ids),
    ).length,
    releasedPageCount: releasePageIds.length,
    postReleaseCpuStableBytes: postReleasePhysical.cpuBytes,
    postReleaseGpuStableBytes: postReleasePhysical.gpuBytes,
  };
  const prepared = new SegmentedPreparedPagePublication({
    kind: "TRANSITION",
    artifactIdentityWords: state.artifactIdentityWords,
    transition,
    physicalSnapshot,
    currentCut,
    currentOwnership,
    activeCutPlan,
    targetCut: logical.cut,
    targetOwnership: nextOwnership,
    providerDiff: logical.diff,
    commitFlags,
    releasePageIds,
    abortedStagingPageIds,
    committedReplacementCount: committed,
    metrics,
  });
  preparedTransitions.set(transition, prepared);
  return prepared;
}

export function finalizeSegmentedAssetPagePublication(
  index,
  prepared,
  physicalSnapshot,
) {
  validateSegmentedPreparedPagePublication(index, prepared, physicalSnapshot);
  const preparedState = preparedPageStates.get(prepared);
  const transition = preparedState.transition;
  const transitionState = transitionStates.get(transition);
  if (
    preparedState.kind !== "TRANSITION" ||
    preparedTransitions.get(transition) !== prepared ||
    consumedTransactions.has(transition) ||
    !activePagesHeld(preparedState.currentOwnership, physicalSnapshot)
  ) {
    throw new Error("SCALE-1D prepared Page publication is stale");
  }
  consumedTransactions.add(transition);
  consumedPreparedPages.add(prepared);
  preparedTransitions.delete(transition);
  inFlightOwnerships.delete(transitionState.ownership);
  return new SegmentedPublicationBundle({
    cut: preparedState.targetCut,
    ownership: preparedState.targetOwnership,
    providerDiff: preparedState.providerDiff,
    commitFlags: preparedState.commitFlags,
    releasePageIds: preparedState.releasePageIds,
    abortedStagingPageIds: preparedState.abortedStagingPageIds,
    metrics: preparedState.metrics,
  });
}

export function commitSegmentedAssetPagePublication(
  index,
  currentCut,
  currentOwnership,
  activeCutPlan,
  transition,
  physicalSnapshot,
  presentationReadyFlags,
) {
  const prepared = prepareSegmentedAssetPagePublication(
    index,
    currentCut,
    currentOwnership,
    activeCutPlan,
    transition,
    physicalSnapshot,
    presentationReadyFlags,
  );
  if (prepared !== null) {
    return finalizeSegmentedAssetPagePublication(
      index,
      prepared,
      physicalSnapshot,
    );
  }
  const ownershipState = ownershipStates.get(currentOwnership);
  const snapshotState = snapshotStates.get(physicalSnapshot);
  const physicalReadyCount =
    transition.replacementCount === 0
      ? 0
      : deriveSegmentedAssetPagePhysicalReady(
          index,
          transition,
          physicalSnapshot,
        ).reduce((a, b) => a + b, 0);
  return new SegmentedPublicationBundle({
    cut: currentCut,
    ownership: currentOwnership,
    providerDiff: diffSegmentedActiveCutProviders(
      index,
      currentCut,
      currentCut,
    ),
    commitFlags: new Uint8Array(transition.replacementCount),
    releasePageIds: new Uint32Array(0),
    abortedStagingPageIds: new Uint32Array(0),
    metrics: {
      physicalReadyCount,
      committedReplacementCount: 0,
      retainedPageCount: pageUnion(
        ownershipState.core.ids,
        heldPageSubset(snapshotState, ownershipState.sh.ids),
      ).length,
      releasedPageCount: 0,
      postReleaseCpuStableBytes: snapshotState.cpuStoredBytes,
      postReleaseGpuStableBytes: snapshotState.gpuRawBytes,
    },
  });
}

export function abortSegmentedAssetPageTransition(index, transition) {
  const state = transitionStates.get(transition);
  if (!state || consumedTransactions.has(transition)) {
    throw new Error("SCALE-1C transition is invalid or consumed");
  }
  requireArtifact(index, state.artifactIdentityWords, "Transition");
  const prepared = preparedTransitions.get(transition);
  if (prepared !== undefined) {
    consumedPreparedPages.add(prepared);
    preparedTransitions.delete(transition);
  }
  consumedTransactions.add(transition);
  inFlightOwnerships.delete(state.ownership);
  const ownershipState = ownershipStates.get(state.ownership);
  const snapshotState = snapshotStates.get(state.physicalSnapshot);
  const active =
    state.kind === "CONVERGED"
      ? pageUnion(
          ownershipState.core.ids,
          heldPageSubset(snapshotState, ownershipState.sh.ids),
        )
      : ownershipState.core.ids;
  const retained = pageUnion(
    active,
    heldPageSubset(snapshotState, ownershipState.sh.ids),
  );
  return new SegmentedAbortResult({
    cancelledDemandPageIds: (
      state.demandedPageIds ?? state.demandedCorePageIds
    ).slice(),
    releaseStagingPageIds: pageDifference(
      state.demandedPageIds ?? state.demandedCorePageIds,
      active,
    ),
    retainedActivePageCount: retained.length,
  });
}

/** @private */
const _SceneGISGaussianSegmentedAssetPageOwnership = {
  computeSegmentedAtlasPageFootprint,
  projectSegmentedAssetIntervals,
  projectSegmentedAssetSlots,
  createSegmentedAssetPagePhysicalSnapshot,
  validateSegmentedAssetPagePhysicalSnapshot,
  validateSegmentedAssetPagePhysicalProgression,
  validateSegmentedAssetPagePhysicalOwnership,
  validateSegmentedPreparedPagePublication,
  planSegmentedAssetPageBootstrap,
  prepareSegmentedAssetPageBootstrapPublication,
  finalizeSegmentedAssetPageBootstrapPublication,
  abortSegmentedAssetPageBootstrapPublication,
  abortSegmentedPreparedPagePublication,
  commitSegmentedAssetPageBootstrap,
  planSegmentedProgressiveBridge,
  planSegmentedReadyConvergedActiveCut,
  planSegmentedConvergedAssetPageTransition,
  prepareSegmentedConvergedAssetPagePublication,
  planSegmentedAssetPageTransition,
  deriveSegmentedAssetPagePhysicalReady,
  prepareSegmentedAssetPagePublication,
  finalizeSegmentedAssetPagePublication,
  commitSegmentedAssetPagePublication,
  abortSegmentedAssetPageTransition,
};
export default _SceneGISGaussianSegmentedAssetPageOwnership;

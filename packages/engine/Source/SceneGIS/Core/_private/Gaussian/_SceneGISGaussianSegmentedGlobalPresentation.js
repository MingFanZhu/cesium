/**
 * Segmented Gaussian private shared module.
 * Source provenance: ADR-0188.
 * @private
 */
import {
  abortSegmentedPreparedPagePublication,
  finalizeSegmentedAssetPageBootstrapPublication,
  finalizeSegmentedAssetPagePublication,
  projectSegmentedAssetSlots,
  validateSegmentedAssetPagePhysicalProgression,
  validateSegmentedAssetPagePhysicalOwnership,
  validateSegmentedAssetPagePhysicalSnapshot,
  validateSegmentedPreparedPagePublication,
} from "./_SceneGISGaussianSegmentedAssetPageOwnership.js";
import { createSegmentedCropBoundsReader } from "./_SceneGISGaussianSegmentedCropBounds.js";

const INVALID_INDEX = 0xffffffff;
const ADDRESS_LIMIT = 0x3fffffff;
const SPLATS_PER_ROW = 256;
const ROWS_PER_LAYER = 256;
const SPLATS_PER_LAYER = SPLATS_PER_ROW * ROWS_PER_LAYER;
const MAPPING_WIDTH = 4096;
const ORDERING_WIDTH = 4096;
const ORDERING_ELEMENTS_PER_TEXEL = 4;
const planStates = new WeakMap();
const receiptStates = new WeakMap();
const compositionStates = new WeakMap();
const presentationStates = new WeakMap();
const receiptByPlan = new WeakMap();
const planByPrepared = new WeakMap();
const consumedPlans = new WeakSet();
const consumedReceipts = new WeakSet();
const successorByPresentation = new WeakMap();
const supersededPresentations = new WeakSet();
const reservationStates = new WeakMap();
const ZERO_CURRENT = Object.freeze({
  cpuBytes: 0,
  gpuBytes: 0,
  contentGeneration: 0,
  mappingGeneration: 0,
  orderingGeneration: 0,
});

function requireSafe(value, label, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new RangeError(
      `${label} must be a ${positive ? "positive " : "nonnegative "}safe integer`,
    );
  }
  return value;
}

function exactAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} exceeds safe integer authority`);
  }
  return value;
}

function exactMultiply(left, right, label) {
  const value = left * right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} exceeds safe integer authority`);
  }
  return value;
}

function containsSorted(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low < values.length && values[low] === target;
}

function sortedUniquePageIds(index, values, semantic, label) {
  if (!Array.isArray(values) && !(values instanceof Uint32Array)) {
    throw new TypeError(`${label} must be an Array or Uint32Array`);
  }
  const result = Uint32Array.from(values).sort();
  const page = new Float64Array(11);
  for (let position = 0; position < result.length; position++) {
    const pageId = result[position];
    if (
      !Number.isSafeInteger(pageId) ||
      pageId < 0 ||
      pageId >= index.pageCount ||
      (position > 0 && pageId === result[position - 1])
    ) {
      throw new RangeError(`${label} contains a duplicate or invalid Page id`);
    }
    index.readPage(pageId, page);
    if (page[4] !== semantic) {
      throw new RangeError(`${label} contains the wrong Page semantic`);
    }
  }
  return result;
}

function sameTypedArray(left, right) {
  return (
    left.constructor === right.constructor &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
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

class SegmentedSlotComposition {
  constructor(state) {
    this.artifactIdentityHex = state.artifactIdentityHex;
    this.slotCount = state.slotCoverageNodeIds.length;
    this.assetSliceCount = state.assetIds.length;
    this.fragmentCount = state.fragmentCorePageIds.length;
    this.selectedSplatCount = state.selectedSplatCount;
    this.byteLength = state.byteLength;
    this.metrics = Object.freeze({ ...state.metrics });
    compositionStates.set(this, state);
    Object.freeze(this);
  }
}

for (const name of [
  "slotCoverageNodeIds",
  "slotRepresentationIds",
  "slotRangeStarts",
  "slotRangeCounts",
  "slotPresentationOffsets",
  "slotCropBounds",
  "providerAssetOffsets",
  "assetIds",
  "assetLocalStarts",
  "assetCounts",
  "assetFragmentOffsets",
  "fragmentCorePageIds",
  "fragmentShPageIds",
  "fragmentPageLocalStarts",
  "fragmentCounts",
  "fragmentPresentationStarts",
  "fragmentSlotIds",
]) {
  Object.defineProperty(SegmentedSlotComposition.prototype, name, {
    get() {
      return compositionStates.get(this)[name].slice();
    },
  });
}

export function composeSegmentedGlobalPresentationSlots(
  index,
  cut,
  options = {},
) {
  const halo = options.cropHaloMeters ?? 0;
  const readCropBounds = createSegmentedCropBoundsReader(index, halo);
  const projection = projectSegmentedAssetSlots(index, cut);
  const slotCoverageNodeIds = cut.coverageNodeIndices;
  const slotRepresentationIds = projection.providerRepresentationIds;
  const slotRangeStarts = projection.providerRangeStarts;
  const slotRangeCounts = projection.providerRangeCounts;
  if (
    !(slotCoverageNodeIds instanceof Uint32Array) ||
    slotCoverageNodeIds.length !== projection.providerIntervalCount
  ) {
    throw new Error("SCALE-1D slot/crop authority is not exact");
  }
  const slotPresentationOffsets = new Uint32Array(
    slotCoverageNodeIds.length + 1,
  );
  let selectedSplatCount = 0;
  for (let slot = 0; slot < slotCoverageNodeIds.length; slot++) {
    selectedSplatCount = exactAdd(
      selectedSplatCount,
      slotRangeCounts[slot],
      "slot presentation count",
    );
    slotPresentationOffsets[slot + 1] = selectedSplatCount;
  }
  if (selectedSplatCount !== cut.selectedSplatCount) {
    throw new Error("SCALE-1D slot composition selected count is invalid");
  }

  const slotCropBounds = new Float64Array(slotCoverageNodeIds.length * 4);
  for (let slot = 0; slot < slotCoverageNodeIds.length; slot++) {
    readCropBounds(slotCoverageNodeIds[slot], slotCropBounds, slot * 4);
  }

  const providerAssetOffsets = projection.providerAssetOffsets;
  const assetIds = projection.assetIds;
  const assetLocalStarts = projection.assetLocalStarts;
  const assetCounts = projection.assetSliceCounts;
  const assetFragmentOffsets = projection.assetFragmentOffsets;
  const fragmentCorePageIds = projection.fragmentCorePageIds;
  const fragmentShPageIds = projection.fragmentShPageIds;
  const fragmentPageLocalStarts = projection.fragmentPageLocalStarts;
  const fragmentCounts = projection.fragmentCounts;
  const fragmentPresentationStarts = new Uint32Array(fragmentCounts.length);
  const fragmentSlotIds = new Uint32Array(fragmentCounts.length);
  for (let slot = 0; slot < slotCoverageNodeIds.length; slot++) {
    let cursor = slotPresentationOffsets[slot];
    for (
      let assetPosition = providerAssetOffsets[slot];
      assetPosition < providerAssetOffsets[slot + 1];
      assetPosition++
    ) {
      for (
        let fragment = assetFragmentOffsets[assetPosition];
        fragment < assetFragmentOffsets[assetPosition + 1];
        fragment++
      ) {
        fragmentPresentationStarts[fragment] = cursor;
        fragmentSlotIds[fragment] = slot;
        cursor = exactAdd(
          cursor,
          fragmentCounts[fragment],
          "fragment presentation count",
        );
      }
    }
    if (cursor !== slotPresentationOffsets[slot + 1]) {
      throw new Error("SCALE-1D slot fragment coverage has a hole or overlap");
    }
  }
  const state = {
    artifactIdentityWords: artifactWords(index),
    artifactIdentityHex: index.artifactIdentityHex,
    slotCoverageNodeIds,
    slotRepresentationIds,
    slotRangeStarts,
    slotRangeCounts,
    slotPresentationOffsets,
    slotCropBounds,
    providerAssetOffsets,
    assetIds,
    assetLocalStarts,
    assetCounts,
    assetFragmentOffsets,
    fragmentCorePageIds,
    fragmentShPageIds,
    fragmentPageLocalStarts,
    fragmentCounts,
    fragmentPresentationStarts,
    fragmentSlotIds,
    selectedSplatCount,
    metrics: {
      activeCoverageSlotCount: slotCoverageNodeIds.length,
      activeAssetSliceCount: assetIds.length,
      activePageFragmentCount: fragmentCounts.length,
      coverageHoleCount: 0,
      coverageOverlapCount: 0,
      maximumScratchSlots: Math.max(
        slotCoverageNodeIds.length,
        assetIds.length,
        fragmentCounts.length,
      ),
    },
  };
  state.byteLength =
    state.artifactIdentityWords.byteLength +
    state.slotCoverageNodeIds.byteLength +
    state.slotRepresentationIds.byteLength +
    state.slotRangeStarts.byteLength +
    state.slotRangeCounts.byteLength +
    state.slotPresentationOffsets.byteLength +
    state.slotCropBounds.byteLength +
    state.providerAssetOffsets.byteLength +
    state.assetIds.byteLength +
    state.assetLocalStarts.byteLength +
    state.assetCounts.byteLength +
    state.assetFragmentOffsets.byteLength +
    state.fragmentCorePageIds.byteLength +
    state.fragmentShPageIds.byteLength +
    state.fragmentPageLocalStarts.byteLength +
    state.fragmentCounts.byteLength +
    state.fragmentPresentationStarts.byteLength +
    state.fragmentSlotIds.byteLength;
  return new SegmentedSlotComposition(state);
}

function normalizePlatformLimits(limits, current) {
  const normalized = {
    maximumSelectedSplats: requireSafe(
      limits?.maximumSelectedSplats,
      "maximumSelectedSplats",
      true,
    ),
    maximumCoverageSlots: requireSafe(
      limits?.maximumCoverageSlots,
      "maximumCoverageSlots",
      true,
    ),
    maximumTextureSize: requireSafe(
      limits?.maximumTextureSize,
      "maximumTextureSize",
      true,
    ),
    maximumTextureArrayLayers: requireSafe(
      limits?.maximumTextureArrayLayers,
      "maximumTextureArrayLayers",
      true,
    ),
    maximumCpuBytes: requireSafe(
      limits?.maximumCpuBytes,
      "maximumCpuBytes",
      true,
    ),
    maximumGpuBytes: requireSafe(
      limits?.maximumGpuBytes,
      "maximumGpuBytes",
      true,
    ),
    currentCpuPresentationBytes: current.cpuBytes,
    currentGpuPresentationBytes: current.gpuBytes,
    currentContentGeneration: current.contentGeneration,
    currentMappingGeneration: current.mappingGeneration,
    currentOrderingGeneration: current.orderingGeneration,
    cropHaloMeters: limits?.cropHaloMeters ?? 0,
  };
  if (
    !Number.isFinite(normalized.cropHaloMeters) ||
    normalized.cropHaloMeters < 0
  ) {
    throw new RangeError("cropHaloMeters must be finite and nonnegative");
  }
  for (const [name, authority] of [
    ["currentCpuPresentationBytes", current.cpuBytes],
    ["currentGpuPresentationBytes", current.gpuBytes],
    ["currentContentGeneration", current.contentGeneration],
    ["currentMappingGeneration", current.mappingGeneration],
    ["currentOrderingGeneration", current.orderingGeneration],
  ]) {
    if (limits?.[name] !== undefined) {
      requireSafe(limits[name], name);
      if (limits[name] !== authority) {
        throw new Error(`SCALE-1D ${name} assertion mismatch`);
      }
    }
  }
  return Object.freeze(normalized);
}

function attributeLayout(logicalSplats, bytesPerSplat, width, limits, label) {
  if (logicalSplats === 0) {
    return Object.freeze({
      logicalSplats: 0,
      capacitySplats: 0,
      layerCount: 0,
      textureHeight: 0,
      bytes: 0,
      logicalBytes: 0,
      width,
    });
  }
  if (logicalSplats > ADDRESS_LIMIT || width > limits.maximumTextureSize) {
    throw new RangeError(`SCALE-1D ${label} address/width capacity exceeded`);
  }
  const layerCount = Math.ceil(logicalSplats / SPLATS_PER_LAYER);
  const textureHeight =
    layerCount === 1 ? Math.ceil(logicalSplats / SPLATS_PER_ROW) : 256;
  if (
    layerCount > limits.maximumTextureArrayLayers ||
    textureHeight > limits.maximumTextureSize
  ) {
    throw new RangeError(`SCALE-1D ${label} texture capacity exceeded`);
  }
  const capacitySplats = exactMultiply(
    exactMultiply(layerCount, textureHeight, `${label} layer rows`),
    SPLATS_PER_ROW,
    `${label} capacity`,
  );
  return Object.freeze({
    logicalSplats,
    capacitySplats,
    layerCount,
    textureHeight,
    bytes: exactMultiply(capacitySplats, bytesPerSplat, `${label} bytes`),
    logicalBytes: exactMultiply(
      logicalSplats,
      bytesPerSplat,
      `${label} logical bytes`,
    ),
    width,
  });
}

function dense2dLayout(logical, width, bytesPerElement, limits, label) {
  if (width > limits.maximumTextureSize) {
    throw new RangeError(`SCALE-1D ${label} texture width exceeded`);
  }
  const height = logical === 0 ? 0 : Math.ceil(logical / width);
  if (height > limits.maximumTextureSize) {
    throw new RangeError(`SCALE-1D ${label} texture height exceeded`);
  }
  const capacity = exactMultiply(width, height, `${label} capacity`);
  return Object.freeze({
    logical,
    capacity,
    width,
    height,
    bytes: exactMultiply(capacity, bytesPerElement, `${label} bytes`),
  });
}

function buildLayout(index, composition, snapshot, limits) {
  const compositionState = compositionStates.get(composition);
  const cpuPageIds = snapshot.cpuPageIds;
  const gpuPageIds = snapshot.gpuPageIds;
  const fragmentShDenseStarts = new Uint32Array(
    compositionState.fragmentCounts.length,
  );
  fragmentShDenseStarts.fill(INVALID_INDEX);
  let shLogicalSplats = 0;
  for (
    let fragment = 0;
    fragment < compositionState.fragmentCounts.length;
    fragment++
  ) {
    const shPageId = compositionState.fragmentShPageIds[fragment];
    if (
      shPageId !== INVALID_INDEX &&
      containsSorted(cpuPageIds, shPageId) &&
      containsSorted(gpuPageIds, shPageId)
    ) {
      fragmentShDenseStarts[fragment] = shLogicalSplats;
      shLogicalSplats = exactAdd(
        shLogicalSplats,
        compositionState.fragmentCounts[fragment],
        "dense SH splats",
      );
    }
  }
  const core = attributeLayout(
    composition.selectedSplatCount,
    32,
    512,
    limits,
    "Core",
  );
  const shBytesPerSplat = [0, 16, 32, 64][index.maxShDegree];
  const shTexelsPerSplat = [0, 1, 2, 4][index.maxShDegree];
  const sh = attributeLayout(
    shLogicalSplats,
    shBytesPerSplat,
    256 * shTexelsPerSplat,
    limits,
    "SH",
  );
  const mapping = dense2dLayout(
    composition.selectedSplatCount,
    MAPPING_WIDTH,
    16,
    limits,
    "Mapping",
  );
  const cropWidth = Math.min(
    Math.max(1, composition.slotCount),
    limits.maximumTextureSize,
  );
  const crop = dense2dLayout(
    composition.slotCount,
    cropWidth,
    16,
    limits,
    "crop",
  );
  const orderingLogicalTexels = Math.ceil(
    composition.selectedSplatCount / ORDERING_ELEMENTS_PER_TEXEL,
  );
  const orderingTexels = dense2dLayout(
    orderingLogicalTexels,
    ORDERING_WIDTH,
    16,
    limits,
    "Ordering",
  );
  const orderingPaddedElements = exactMultiply(
    orderingTexels.capacity,
    ORDERING_ELEMENTS_PER_TEXEL,
    "Ordering padded elements",
  );
  const cpuPlanBytes = exactAdd(
    composition.byteLength,
    fragmentShDenseStarts.byteLength,
    "presentation plan bytes",
  );
  const coreCanonicalizationScratchBytes = 0;
  const cpuStagingBytes = [
    mapping.bytes,
    crop.bytes,
    orderingTexels.bytes,
  ].reduce(
    (sum, value) => exactAdd(sum, value, "CPU presentation staging"),
    cpuPlanBytes,
  );
  const gpuPresentationBytes = [
    mapping.bytes,
    crop.bytes,
    orderingTexels.bytes,
  ].reduce((sum, value) => exactAdd(sum, value, "GPU presentation bytes"), 0);
  const cpuPeakBytes = exactAdd(
    limits.currentCpuPresentationBytes,
    cpuStagingBytes,
    "current/work CPU presentation peak",
  );
  const gpuPeakBytes = exactAdd(
    limits.currentGpuPresentationBytes,
    gpuPresentationBytes,
    "current/work GPU presentation peak",
  );
  if (
    composition.selectedSplatCount > limits.maximumSelectedSplats ||
    composition.slotCount > limits.maximumCoverageSlots ||
    cpuPeakBytes > limits.maximumCpuBytes ||
    gpuPeakBytes > limits.maximumGpuBytes
  ) {
    throw new RangeError("SCALE-1D presentation platform budget exceeded");
  }
  return {
    fragmentShDenseStarts,
    descriptor: Object.freeze({
      coreLogicalSplats: core.logicalSplats,
      coreCapacitySplats: core.capacitySplats,
      coreLogicalBytes: core.logicalBytes,
      coreBytes: core.bytes,
      coreLayerCount: core.layerCount,
      coreTextureHeight: core.textureHeight,
      shLogicalSplats: sh.logicalSplats,
      shCapacitySplats: sh.capacitySplats,
      shLogicalBytes: sh.logicalBytes,
      shBytes: sh.bytes,
      shLayerCount: sh.layerCount,
      shTextureHeight: sh.textureHeight,
      mappingLogicalRows: mapping.logical,
      mappingCapacityRows: mapping.capacity,
      mappingBytes: mapping.bytes,
      cropLogicalSlots: crop.logical,
      cropCapacitySlots: crop.capacity,
      cropBytes: crop.bytes,
      orderingLogicalSplats: composition.selectedSplatCount,
      orderingPaddedElements,
      orderingBytes: orderingTexels.bytes,
      coreCanonicalizationScratchBytes,
      cpuPlanBytes,
      cpuStagingBytes,
      gpuPresentationBytes,
      currentWorkCpuPeakBytes: cpuPeakBytes,
      currentWorkGpuPeakBytes: gpuPeakBytes,
    }),
  };
}

export function deriveSegmentedGlobalPresentationLayout(
  index,
  composition,
  physicalSnapshot,
  platformLimits,
) {
  const state = compositionStates.get(composition);
  if (!state) {
    throw new TypeError("SCALE-1D slot composition authority is invalid");
  }
  requireArtifact(index, state.artifactIdentityWords, "Slot composition");
  validateSegmentedAssetPagePhysicalSnapshot(index, physicalSnapshot);
  const limits = normalizePlatformLimits(platformLimits, ZERO_CURRENT);
  const layout = buildLayout(index, composition, physicalSnapshot, limits);
  return Object.freeze({
    descriptor: layout.descriptor,
    get fragmentShDenseStarts() {
      return layout.fragmentShDenseStarts.slice();
    },
  });
}

export function reserveSegmentedGlobalPresentation(
  index,
  targetCut,
  candidateCorePageIds,
  candidateShPageIds,
  platformLimits,
) {
  const composition = composeSegmentedGlobalPresentationSlots(
    index,
    targetCut,
    platformLimits,
  );
  const state = compositionStates.get(composition);
  const coreIds = sortedUniquePageIds(
    index,
    candidateCorePageIds,
    1,
    "candidateCorePageIds",
  );
  const shIds = sortedUniquePageIds(
    index,
    candidateShPageIds,
    2,
    "candidateShPageIds",
  );
  for (const pageId of state.fragmentCorePageIds) {
    if (!containsSorted(coreIds, pageId)) {
      throw new Error("Presentation reservation omits a target Core Page");
    }
  }
  const targetShIds = new Set(
    [...state.fragmentShPageIds].filter((pageId) => pageId !== INVALID_INDEX),
  );
  for (const pageId of shIds) {
    if (!targetShIds.has(pageId)) {
      throw new Error("Presentation reservation contains a foreign SH Page");
    }
  }
  const limits = normalizePlatformLimits(platformLimits, ZERO_CURRENT);
  const heldIds = Uint32Array.from([...coreIds, ...shIds]).sort();
  const layout = buildLayout(
    index,
    composition,
    { cpuPageIds: heldIds, gpuPageIds: heldIds },
    limits,
  );
  const reservationIdentity = Object.freeze({});
  const reservationState = {
    artifactIdentityWords: artifactWords(index),
    targetCut,
    coreIds,
    shIds,
    selectedSplatCount: composition.selectedSplatCount,
    slotCount: composition.slotCount,
  };
  reservationStates.set(reservationIdentity, reservationState);
  const reservation = Object.freeze({
    cpuBytes: layout.descriptor.cpuStagingBytes,
    gpuBytes: layout.descriptor.gpuPresentationBytes,
    selectedSplatCount: composition.selectedSplatCount,
    slotCount: composition.slotCount,
    reservationIdentity,
  });
  reservationStates.set(reservation, reservationState);
  return reservation;
}

export function validateSegmentedGlobalPresentationReservation(
  reservation,
  index,
  targetCut,
  candidateCorePageIds,
  candidateShPageIds,
) {
  const state = reservationStates.get(reservation);
  if (!state) {
    throw new TypeError("Presentation reservation authority is invalid");
  }
  requireArtifact(index, state.artifactIdentityWords, "Reservation");
  const coreIds = sortedUniquePageIds(
    index,
    candidateCorePageIds,
    1,
    "candidateCorePageIds",
  );
  const shIds = sortedUniquePageIds(
    index,
    candidateShPageIds,
    2,
    "candidateShPageIds",
  );
  if (
    targetCut !== state.targetCut ||
    !sameTypedArray(coreIds, state.coreIds) ||
    !sameTypedArray(shIds, state.shIds)
  ) {
    throw new Error("Presentation reservation target authority changed");
  }
  return reservation;
}

class SegmentedGlobalPresentationPlan {
  constructor(state) {
    this.kind = state.kind;
    this.targetCut = state.targetCut;
    this.targetOwnership = state.targetOwnership;
    this.composition = state.composition;
    this.descriptor = state.descriptor;
    this.expectedContentGeneration = state.expectedContentGeneration;
    this.expectedMappingGeneration = state.expectedMappingGeneration;
    this.expectedOrderingGeneration = state.expectedOrderingGeneration;
    this.byteLength = state.metrics.planBytes;
    this.metrics = Object.freeze({ ...state.metrics });
    planStates.set(this, state);
    Object.freeze(this);
  }
  get fragmentShDenseStarts() {
    return planStates.get(this).fragmentShDenseStarts.slice();
  }
}

function exactTypedArray(left, right) {
  if (
    left?.constructor !== right?.constructor ||
    left?.length !== right?.length
  ) {
    return false;
  }
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

/** Package-internal, allocation-free late binding proof for D3. */
export function validateSegmentedGlobalPresentationPlanBinding(plan, proof) {
  const state = planStates.get(plan);
  const composition = compositionStates.get(proof?.composition);
  const plannedComposition = compositionStates.get(state?.composition);
  if (
    !state ||
    !composition ||
    !plannedComposition ||
    state.targetCut !== proof.targetCut ||
    state.targetOwnership !== proof.targetOwnership ||
    state.physicalSnapshot !== proof.physicalSnapshot ||
    state.expectedContentGeneration !== proof.contentGeneration ||
    state.expectedMappingGeneration !== proof.mappingGeneration ||
    state.expectedOrderingGeneration !== proof.orderingGeneration
  ) {
    return false;
  }
  const descriptorKeys = Object.keys(state.descriptor).sort();
  const proofDescriptorKeys = Object.keys(proof.descriptor ?? {}).sort();
  if (
    descriptorKeys.length !== proofDescriptorKeys.length ||
    descriptorKeys.some(
      (key, index) =>
        key !== proofDescriptorKeys[index] ||
        state.descriptor[key] !== proof.descriptor[key],
    )
  ) {
    return false;
  }
  for (const name of [
    "artifactIdentityWords",
    "slotCoverageNodeIds",
    "slotRepresentationIds",
    "slotRangeStarts",
    "slotRangeCounts",
    "slotPresentationOffsets",
    "slotCropBounds",
    "providerAssetOffsets",
    "assetIds",
    "assetLocalStarts",
    "assetCounts",
    "assetFragmentOffsets",
    "fragmentCorePageIds",
    "fragmentShPageIds",
    "fragmentPageLocalStarts",
    "fragmentCounts",
    "fragmentPresentationStarts",
    "fragmentSlotIds",
  ]) {
    if (!exactTypedArray(plannedComposition[name], composition[name])) {
      return false;
    }
  }
  return exactTypedArray(
    state.fragmentShDenseStarts,
    proof.fragmentShDenseStarts,
  );
}

export function createSegmentedGlobalPresentationPlan(
  index,
  preparedPagePublication,
  currentPresentation,
  physicalSnapshot,
  platformLimits,
) {
  validateSegmentedPreparedPagePublication(
    index,
    preparedPagePublication,
    physicalSnapshot,
  );
  if (planByPrepared.has(preparedPagePublication)) {
    throw new Error(
      "SCALE-1D prepared Page target already has a presentation plan",
    );
  }
  validateSegmentedAssetPagePhysicalSnapshot(index, physicalSnapshot);
  let current = ZERO_CURRENT;
  if (preparedPagePublication.kind === "BOOTSTRAP") {
    if (
      currentPresentation !== null ||
      preparedPagePublication.sourceCut !== null ||
      preparedPagePublication.sourceOwnership !== null
    ) {
      throw new Error("SCALE-1D bootstrap presentation requires null current");
    }
  } else if (preparedPagePublication.kind === "TRANSITION") {
    const currentState = requireSuccessorSource(index, currentPresentation);
    if (
      currentState.cut !== preparedPagePublication.sourceCut ||
      currentState.ownership !== preparedPagePublication.sourceOwnership
    ) {
      throw new Error("SCALE-1D prepared Page source presentation mismatch");
    }
    validateSegmentedAssetPagePhysicalProgression(
      index,
      currentState.physicalSnapshot,
      physicalSnapshot,
    );
    current = currentRecord(currentState);
  } else {
    throw new Error("SCALE-1D prepared Page publication kind is invalid");
  }
  const limits = normalizePlatformLimits(platformLimits, current);
  const targetCut = preparedPagePublication.targetCut;
  const targetOwnership = preparedPagePublication.targetOwnership;
  const composition = composeSegmentedGlobalPresentationSlots(
    index,
    targetCut,
    {
      cropHaloMeters: limits.cropHaloMeters,
    },
  );
  const layout = buildLayout(index, composition, physicalSnapshot, limits);
  const state = {
    kind: "CONTENT",
    artifactIdentityWords: artifactWords(index),
    preparedPagePublication,
    currentPresentation,
    physicalSnapshot,
    targetCut,
    targetOwnership,
    composition,
    descriptor: layout.descriptor,
    fragmentShDenseStarts: layout.fragmentShDenseStarts,
    limits,
    expectedContentGeneration: exactAdd(
      limits.currentContentGeneration,
      1,
      "content generation",
    ),
    expectedMappingGeneration: exactAdd(
      limits.currentMappingGeneration,
      1,
      "Mapping generation",
    ),
    expectedOrderingGeneration: exactAdd(
      limits.currentOrderingGeneration,
      1,
      "Ordering generation",
    ),
    contentIdentity: Object.freeze({ preparedPagePublication }),
    mappingIdentity: Object.freeze({
      preparedPagePublication,
      role: "mapping",
    }),
    cropIdentity: Object.freeze({ composition, role: "crop" }),
    orderingIdentity: Object.freeze({
      preparedPagePublication,
      role: "ordering",
    }),
    metrics: {
      preparedCommitCount: 1,
      activeCoverageSlotCount: composition.slotCount,
      activeAssetSliceCount: composition.assetSliceCount,
      activePageFragmentCount: composition.fragmentCount,
      selectedSplatCount: composition.selectedSplatCount,
      planBytes:
        composition.byteLength + layout.fragmentShDenseStarts.byteLength,
      maximumScratchSlots: composition.metrics.maximumScratchSlots,
      coverageHoleCount: 0,
      coverageOverlapCount: 0,
    },
  };
  const plan = new SegmentedGlobalPresentationPlan(state);
  planByPrepared.set(preparedPagePublication, plan);
  if (currentPresentation !== null) {
    successorByPresentation.set(currentPresentation, plan);
  }
  return plan;
}

function requireExternalReceipt(state, external) {
  if (
    external === null ||
    typeof external !== "object" ||
    typeof external.resourceOwnerIdentity !== "string" ||
    external.resourceOwnerIdentity.length === 0
  ) {
    throw new TypeError("SCALE-1D external presentation receipt is invalid");
  }
  const descriptor = state.descriptor;
  const exact = {
    contentGeneration: state.expectedContentGeneration,
    mappingGeneration: state.expectedMappingGeneration,
    orderingGeneration: state.expectedOrderingGeneration,
    selectedSplatCount: state.composition.selectedSplatCount,
    slotCount: state.composition.slotCount,
    coreLogicalBytes: descriptor.coreLogicalBytes,
    coreAllocatedBytes: descriptor.coreBytes,
    shLogicalBytes: descriptor.shLogicalBytes,
    shAllocatedBytes: descriptor.shBytes,
    mappingBytes: descriptor.mappingBytes,
    cropBytes: descriptor.cropBytes,
    orderingBytes: descriptor.orderingBytes,
    gpuPageBindingGeneration:
      state.kind === "ORDERING_REFRESH"
        ? state.gpuPageBindingGeneration
        : state.physicalSnapshot.gpuGeneration,
  };
  for (const [name, value] of Object.entries(exact)) {
    if (external[name] !== value) {
      throw new Error(`SCALE-1D external receipt ${name} mismatch`);
    }
  }
  return exact;
}

class SegmentedGlobalPresentationReceipt {
  constructor(state) {
    this.plan = state.plan;
    this.contentGeneration = state.contentGeneration;
    this.mappingGeneration = state.mappingGeneration;
    this.orderingGeneration = state.orderingGeneration;
    this.resourceOwnerIdentity = state.resourceOwnerIdentity;
    receiptStates.set(this, state);
    Object.freeze(this);
  }
}

export function createSegmentedGlobalPresentationReceipt(
  plan,
  externalReceipt,
) {
  const state = planStates.get(plan);
  if (!state || consumedPlans.has(plan) || receiptByPlan.has(plan)) {
    throw new Error("SCALE-1D presentation plan is invalid or consumed");
  }
  const exact = requireExternalReceipt(state, externalReceipt);
  const receipt = new SegmentedGlobalPresentationReceipt({
    plan,
    ...exact,
    resourceOwnerIdentity: externalReceipt.resourceOwnerIdentity,
  });
  receiptByPlan.set(plan, receipt);
  return receipt;
}

class SegmentedGlobalPresentation {
  constructor(state) {
    this.kind = state.kind;
    this.cut = state.cut;
    this.ownership = state.ownership;
    this.composition = state.composition;
    this.descriptor = state.descriptor;
    this.contentGeneration = state.contentGeneration;
    this.mappingGeneration = state.mappingGeneration;
    this.orderingGeneration = state.orderingGeneration;
    this.resourceOwnerIdentity = state.resourceOwnerIdentity;
    this.contentIdentity = state.contentIdentity;
    this.mappingIdentity = state.mappingIdentity;
    this.cropIdentity = state.cropIdentity;
    this.orderingIdentity = state.orderingIdentity;
    this.gpuPageBindingGeneration = state.gpuPageBindingGeneration;
    presentationStates.set(this, state);
    Object.freeze(this);
  }
  get fragmentShDenseStarts() {
    return presentationStates.get(this).fragmentShDenseStarts.slice();
  }
}

function requireCurrentPresentation(index, currentPresentation) {
  const state = presentationStates.get(currentPresentation);
  if (!state) {
    throw new Error("SCALE-1D current presentation authority is invalid");
  }
  requireArtifact(index, state.artifactIdentityWords, "Current presentation");
  return state;
}

function currentRecord(state) {
  return Object.freeze({
    cpuBytes: state.descriptor.cpuStagingBytes,
    gpuBytes: state.descriptor.gpuPresentationBytes,
    contentGeneration: state.contentGeneration,
    mappingGeneration: state.mappingGeneration,
    orderingGeneration: state.orderingGeneration,
  });
}

function requireSuccessorSource(index, currentPresentation) {
  const state = requireCurrentPresentation(index, currentPresentation);
  if (
    supersededPresentations.has(currentPresentation) ||
    successorByPresentation.has(currentPresentation)
  ) {
    throw new Error("SCALE-1D current presentation successor is unavailable");
  }
  return state;
}

function consumeSuccessor(currentPresentation, plan, supersede) {
  if (successorByPresentation.get(currentPresentation) !== plan) {
    throw new Error("SCALE-1D presentation successor claim is stale");
  }
  successorByPresentation.delete(currentPresentation);
  if (supersede) {
    supersededPresentations.add(currentPresentation);
  }
}

function createRefreshPlan(state) {
  const plan = new SegmentedGlobalPresentationPlan(state);
  return plan;
}

export function createSegmentedGlobalShRefreshPlan(
  index,
  currentPresentation,
  physicalSnapshot,
  platformLimits,
) {
  const current = requireSuccessorSource(index, currentPresentation);
  validateSegmentedAssetPagePhysicalProgression(
    index,
    current.physicalSnapshot,
    physicalSnapshot,
  );
  validateSegmentedAssetPagePhysicalOwnership(
    index,
    current.ownership,
    physicalSnapshot,
  );
  const limits = normalizePlatformLimits(
    platformLimits,
    currentRecord(current),
  );
  const layout = buildLayout(
    index,
    current.composition,
    physicalSnapshot,
    limits,
  );
  const plan = createRefreshPlan({
    kind: "SH_REFRESH",
    artifactIdentityWords: current.artifactIdentityWords,
    physicalSnapshot,
    currentPresentation,
    targetCut: current.cut,
    targetOwnership: current.ownership,
    composition: current.composition,
    descriptor: layout.descriptor,
    fragmentShDenseStarts: layout.fragmentShDenseStarts,
    limits,
    expectedContentGeneration: exactAdd(
      current.contentGeneration,
      1,
      "SH content generation",
    ),
    expectedMappingGeneration: exactAdd(
      current.mappingGeneration,
      1,
      "SH Mapping generation",
    ),
    expectedOrderingGeneration: exactAdd(
      current.orderingGeneration,
      1,
      "SH Ordering generation",
    ),
    contentIdentity: Object.freeze({ currentPresentation, role: "sh-content" }),
    mappingIdentity: Object.freeze({ currentPresentation, role: "sh-mapping" }),
    cropIdentity: current.cropIdentity,
    orderingIdentity: Object.freeze({
      currentPresentation,
      role: "sh-ordering",
    }),
    metrics: {
      preparedCommitCount: 0,
      activeCoverageSlotCount: current.composition.slotCount,
      activeAssetSliceCount: current.composition.assetSliceCount,
      activePageFragmentCount: current.composition.fragmentCount,
      selectedSplatCount: current.composition.selectedSplatCount,
      planBytes:
        current.composition.byteLength +
        layout.fragmentShDenseStarts.byteLength,
      maximumScratchSlots: current.composition.metrics.maximumScratchSlots,
      coverageHoleCount: 0,
      coverageOverlapCount: 0,
    },
  });
  successorByPresentation.set(currentPresentation, plan);
  return plan;
}

export function createSegmentedGlobalOrderingRefreshPlan(
  index,
  currentPresentation,
  platformLimits,
) {
  const current = requireSuccessorSource(index, currentPresentation);
  const limits = normalizePlatformLimits(
    platformLimits,
    currentRecord(current),
  );
  const orderingStagingPeak = exactAdd(
    limits.currentGpuPresentationBytes,
    current.descriptor.orderingBytes,
    "Ordering refresh GPU peak",
  );
  const orderingCpuPeak = exactAdd(
    limits.currentCpuPresentationBytes,
    current.descriptor.orderingBytes,
    "Ordering refresh CPU peak",
  );
  if (
    orderingStagingPeak > limits.maximumGpuBytes ||
    orderingCpuPeak > limits.maximumCpuBytes
  ) {
    throw new RangeError("SCALE-1D Ordering refresh platform budget exceeded");
  }
  const plan = createRefreshPlan({
    kind: "ORDERING_REFRESH",
    artifactIdentityWords: current.artifactIdentityWords,
    physicalSnapshot: null,
    currentPresentation,
    targetCut: current.cut,
    targetOwnership: current.ownership,
    composition: current.composition,
    descriptor: current.descriptor,
    fragmentShDenseStarts: current.fragmentShDenseStarts,
    limits,
    expectedContentGeneration: current.contentGeneration,
    expectedMappingGeneration: current.mappingGeneration,
    expectedOrderingGeneration: exactAdd(
      current.orderingGeneration,
      1,
      "Ordering generation",
    ),
    contentIdentity: current.contentIdentity,
    mappingIdentity: current.mappingIdentity,
    cropIdentity: current.cropIdentity,
    orderingIdentity: Object.freeze({ currentPresentation, role: "ordering" }),
    gpuPageBindingGeneration: current.gpuPageBindingGeneration,
    metrics: {
      preparedCommitCount: 0,
      activeCoverageSlotCount: current.composition.slotCount,
      activeAssetSliceCount: current.composition.assetSliceCount,
      activePageFragmentCount: current.composition.fragmentCount,
      selectedSplatCount: current.composition.selectedSplatCount,
      planBytes: current.descriptor.orderingBytes,
      maximumScratchSlots: current.composition.selectedSplatCount,
      coverageHoleCount: 0,
      coverageOverlapCount: 0,
    },
  });
  successorByPresentation.set(currentPresentation, plan);
  return plan;
}

export function commitSegmentedGlobalPresentationRefresh(
  index,
  currentPresentation,
  presentationReceipt,
  physicalSnapshot,
) {
  const current = requireCurrentPresentation(index, currentPresentation);
  const receiptState = receiptStates.get(presentationReceipt);
  const plan = receiptState?.plan;
  const state = planStates.get(plan);
  if (
    !state ||
    (state.kind !== "SH_REFRESH" && state.kind !== "ORDERING_REFRESH") ||
    state.targetCut !== current.cut ||
    state.targetOwnership !== current.ownership ||
    state.currentPresentation !== currentPresentation ||
    successorByPresentation.get(currentPresentation) !== plan ||
    supersededPresentations.has(currentPresentation) ||
    receiptByPlan.get(plan) !== presentationReceipt ||
    consumedPlans.has(plan) ||
    consumedReceipts.has(presentationReceipt)
  ) {
    throw new Error("SCALE-1D presentation refresh binding is stale");
  }
  if (
    state.kind === "SH_REFRESH" &&
    state.physicalSnapshot !== physicalSnapshot
  ) {
    throw new Error("SCALE-1D SH refresh physical snapshot changed");
  }
  if (state.kind === "SH_REFRESH") {
    validateSegmentedAssetPagePhysicalProgression(
      index,
      current.physicalSnapshot,
      physicalSnapshot,
    );
    validateSegmentedAssetPagePhysicalOwnership(
      index,
      current.ownership,
      physicalSnapshot,
    );
  }
  if (
    state.kind === "ORDERING_REFRESH" &&
    physicalSnapshot !== undefined &&
    physicalSnapshot !== null
  ) {
    throw new Error("SCALE-1D Ordering refresh cannot absorb Page state");
  }
  const presentation = new SegmentedGlobalPresentation({
    kind: state.kind,
    artifactIdentityWords: state.artifactIdentityWords,
    cut: current.cut,
    ownership: current.ownership,
    composition: current.composition,
    descriptor: state.descriptor,
    fragmentShDenseStarts: state.fragmentShDenseStarts,
    contentGeneration: receiptState.contentGeneration,
    mappingGeneration: receiptState.mappingGeneration,
    orderingGeneration: receiptState.orderingGeneration,
    resourceOwnerIdentity: receiptState.resourceOwnerIdentity,
    contentIdentity: state.contentIdentity,
    mappingIdentity: state.mappingIdentity,
    cropIdentity: state.cropIdentity,
    orderingIdentity: state.orderingIdentity,
    gpuPageBindingGeneration:
      state.kind === "SH_REFRESH"
        ? physicalSnapshot.gpuGeneration
        : current.gpuPageBindingGeneration,
    physicalSnapshot:
      state.kind === "SH_REFRESH" ? physicalSnapshot : current.physicalSnapshot,
  });
  consumeSuccessor(currentPresentation, plan, true);
  consumedPlans.add(plan);
  consumedReceipts.add(presentationReceipt);
  return Object.freeze({
    cut: current.cut,
    ownership: current.ownership,
    presentation,
    metrics: Object.freeze({
      contentPublicationCount: state.kind === "SH_REFRESH" ? 1 : 0,
      orderingOnlyPublicationCount: state.kind === "ORDERING_REFRESH" ? 1 : 0,
      preparedCommitCount: 0,
      preparedAbortCount: 0,
      drawCommandCount: 0,
    }),
  });
}

export function abortSegmentedGlobalPresentationRefresh(index, authority) {
  const receiptState = receiptStates.get(authority);
  const plan = receiptState?.plan ?? authority;
  const state = planStates.get(plan);
  if (
    !state ||
    (state.kind !== "SH_REFRESH" && state.kind !== "ORDERING_REFRESH") ||
    consumedPlans.has(plan) ||
    (receiptState && consumedReceipts.has(authority))
  ) {
    throw new Error("SCALE-1D presentation refresh abort authority is invalid");
  }
  requireArtifact(index, state.artifactIdentityWords, "Presentation refresh");
  consumeSuccessor(state.currentPresentation, plan, false);
  consumedPlans.add(plan);
  const receipt = receiptByPlan.get(plan);
  if (receipt !== undefined) {
    consumedReceipts.add(receipt);
  }
  return Object.freeze({
    presentationStagingBytes:
      state.kind === "ORDERING_REFRESH"
        ? state.descriptor.orderingBytes
        : state.descriptor.gpuPresentationBytes,
    metrics: Object.freeze({
      preparedCommitCount: 0,
      preparedAbortCount: 1,
      contentPublicationCount: 0,
      orderingOnlyPublicationCount: 0,
    }),
  });
}

export function commitSegmentedGlobalPresentationPublication(
  index,
  preparedPagePublication,
  presentationReceipt,
  physicalSnapshot,
) {
  const receiptState = receiptStates.get(presentationReceipt);
  const plan = receiptState?.plan;
  const state = planStates.get(plan);
  if (
    !state ||
    state.kind !== "CONTENT" ||
    state.preparedPagePublication !== preparedPagePublication ||
    state.physicalSnapshot !== physicalSnapshot ||
    receiptByPlan.get(plan) !== presentationReceipt ||
    consumedPlans.has(plan) ||
    consumedReceipts.has(presentationReceipt)
  ) {
    throw new Error("SCALE-1D presentation publication binding is stale");
  }
  requireArtifact(index, state.artifactIdentityWords, "Presentation plan");
  validateSegmentedPreparedPagePublication(
    index,
    preparedPagePublication,
    physicalSnapshot,
  );
  validateSegmentedAssetPagePhysicalSnapshot(index, physicalSnapshot);
  if (state.currentPresentation !== null) {
    const current = requireCurrentPresentation(
      index,
      state.currentPresentation,
    );
    if (
      supersededPresentations.has(state.currentPresentation) ||
      successorByPresentation.get(state.currentPresentation) !== plan ||
      current.cut !== preparedPagePublication.sourceCut ||
      current.ownership !== preparedPagePublication.sourceOwnership
    ) {
      throw new Error("SCALE-1D content successor claim is stale");
    }
  }
  if (
    preparedPagePublication.targetCut !== state.targetCut ||
    preparedPagePublication.targetOwnership !== state.targetOwnership
  ) {
    throw new Error("SCALE-1D prepared presentation target changed");
  }
  const presentation = new SegmentedGlobalPresentation({
    kind: "CONTENT",
    artifactIdentityWords: state.artifactIdentityWords,
    cut: state.targetCut,
    ownership: state.targetOwnership,
    composition: state.composition,
    descriptor: state.descriptor,
    fragmentShDenseStarts: state.fragmentShDenseStarts,
    contentGeneration: receiptState.contentGeneration,
    mappingGeneration: receiptState.mappingGeneration,
    orderingGeneration: receiptState.orderingGeneration,
    resourceOwnerIdentity: receiptState.resourceOwnerIdentity,
    contentIdentity: state.contentIdentity,
    mappingIdentity: state.mappingIdentity,
    cropIdentity: state.cropIdentity,
    orderingIdentity: state.orderingIdentity,
    gpuPageBindingGeneration: physicalSnapshot.gpuGeneration,
    physicalSnapshot,
  });
  const pagePublication =
    preparedPagePublication.kind === "BOOTSTRAP"
      ? finalizeSegmentedAssetPageBootstrapPublication(
          index,
          preparedPagePublication,
          physicalSnapshot,
        )
      : finalizeSegmentedAssetPagePublication(
          index,
          preparedPagePublication,
          physicalSnapshot,
        );
  if (state.currentPresentation !== null) {
    consumeSuccessor(state.currentPresentation, plan, true);
  }
  consumedPlans.add(plan);
  consumedReceipts.add(presentationReceipt);
  return Object.freeze({
    cut: state.targetCut,
    ownership: state.targetOwnership,
    presentation,
    pagePublication,
    metrics: Object.freeze({
      contentPublicationCount: 1,
      orderingOnlyPublicationCount: 0,
      preparedCommitCount: 1,
      preparedAbortCount: 0,
      drawCommandCount: 0,
    }),
  });
}

export function abortSegmentedGlobalPresentationPublication(index, authority) {
  const receiptState = receiptStates.get(authority);
  const plan = receiptState?.plan ?? authority;
  const state = planStates.get(plan);
  if (
    !state ||
    state.kind !== "CONTENT" ||
    consumedPlans.has(plan) ||
    (receiptState && consumedReceipts.has(authority))
  ) {
    throw new Error("SCALE-1D presentation abort authority is invalid");
  }
  requireArtifact(index, state.artifactIdentityWords, "Presentation plan");
  const pageAbort = abortSegmentedPreparedPagePublication(
    index,
    state.preparedPagePublication,
  );
  if (state.currentPresentation !== null) {
    consumeSuccessor(state.currentPresentation, plan, false);
  }
  consumedPlans.add(plan);
  const receipt = receiptByPlan.get(plan);
  if (receipt !== undefined) {
    consumedReceipts.add(receipt);
  }
  return Object.freeze({
    pageAbort,
    activePageReleaseIds: new Uint32Array(0),
    presentationStagingBytes: state.descriptor.gpuPresentationBytes,
    metrics: Object.freeze({
      preparedCommitCount: 0,
      preparedAbortCount: 1,
      zeroRetryCount: 0,
    }),
  });
}

/** @private */
const _SceneGISGaussianSegmentedGlobalPresentation = {
  composeSegmentedGlobalPresentationSlots,
  deriveSegmentedGlobalPresentationLayout,
  reserveSegmentedGlobalPresentation,
  validateSegmentedGlobalPresentationReservation,
  validateSegmentedGlobalPresentationPlanBinding,
  createSegmentedGlobalPresentationPlan,
  createSegmentedGlobalPresentationReceipt,
  createSegmentedGlobalShRefreshPlan,
  createSegmentedGlobalOrderingRefreshPlan,
  commitSegmentedGlobalPresentationRefresh,
  abortSegmentedGlobalPresentationRefresh,
  commitSegmentedGlobalPresentationPublication,
  abortSegmentedGlobalPresentationPublication,
};
export default _SceneGISGaussianSegmentedGlobalPresentation;

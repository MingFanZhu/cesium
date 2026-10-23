/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import defined from "../../../../Core/defined.js";
import DeveloperError from "../../../../Core/DeveloperError.js";
import {
  GaussianStreamScheduleClass,
  GaussianStreamWorkClass,
} from "./_SceneGISGaussianStreamWorkPriority.js";

const workStates = new WeakMap();
const cleanupDebtStates = new WeakMap();
const orderingOverlayStates = new WeakMap();
const resourceAdapterAuthorities = new WeakSet();

function exactAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${label} exceeds the safe integer range`);
  }
  return value;
}

function exactSubtract(left, right, label) {
  const value = left - right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${label} became negative or unsafe`);
  }
  return value;
}

function requireSafe(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${label} must be a non-negative safe integer`);
  }
  return value;
}

function requireIdentity(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new DeveloperError(`${label} must be a nonempty string`);
  }
  return value;
}

function sortedUniqueIds(ids, count, label) {
  const result = [...(ids ?? [])].sort((left, right) => left - right);
  for (let index = 0; index < result.length; index++) {
    const id = result[index];
    if (
      !Number.isSafeInteger(id) ||
      id < 0 ||
      id >= count ||
      (index > 0 && result[index - 1] === id)
    ) {
      throw new DeveloperError(`${label} contains an invalid Page id`);
    }
  }
  return result;
}

function samePage(left, right) {
  return (
    left?.artifactIdentity === right?.artifactIdentity &&
    left?.index === right?.index &&
    left?.assetId === right?.assetId &&
    left?.assetLocalStart === right?.assetLocalStart &&
    left?.splatCount === right?.splatCount &&
    left?.kind === right?.kind &&
    left?.semantic === right?.semantic &&
    left?.layoutId === right?.layoutId &&
    left?.packId === right?.packId &&
    left?.offset === right?.offset &&
    left?.storedBytes === right?.storedBytes &&
    left?.rawBytes === right?.rawBytes &&
    left?.checksum === right?.checksum
  );
}

function containsSorted(ids, value) {
  let low = 0;
  let high = ids.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (ids[middle] === value) {
      return true;
    }
    if (ids[middle] < value) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return false;
}

function projectSnapshotColumns(ids, sourceIds, values, provenance) {
  const projectedValues = new Float64Array(ids.length);
  const projectedProvenance = new Float64Array(ids.length * 7);
  for (let output = 0; output < ids.length; output++) {
    const pageId = ids[output];
    let low = 0;
    let high = sourceIds.length - 1;
    let position = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (sourceIds[middle] === pageId) {
        position = middle;
        break;
      }
      if (sourceIds[middle] < pageId) {
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    if (position < 0) {
      throw new DeveloperError("Exact target Page is absent from snapshot");
    }
    projectedValues[output] = values[position];
    projectedProvenance.set(
      provenance.subarray(position * 7, position * 7 + 7),
      output * 7,
    );
  }
  return { values: projectedValues, provenance: projectedProvenance };
}

class GaussianSegmentedResourceWork {
  constructor(state) {
    this.artifactIdentity = state.adapter.artifactIdentity;
    this.generation = state.generation;
    this.kind = state.kind;
    this.loaderOwnerIdentity = state.loaderOwnerIdentity;
    workStates.set(this, state);
    Object.freeze(this);
  }
  get state() {
    return workStates.get(this).phase;
  }
  get physicalSnapshot() {
    return workStates.get(this).physicalSnapshot;
  }
  get presentationDescription() {
    return workStates.get(this).presentationDescription;
  }
}

function validateDependencies(options) {
  const provider = options.descriptorProvider;
  const loader = options.loader;
  const cache = options.cache;
  const gpuLedger = options.gpuLedger;
  const presentation = options.presentation;
  if (
    !provider ||
    typeof provider.readPageRequest !== "function" ||
    !loader ||
    typeof loader.applyPageDemandDelta !== "function" ||
    typeof loader.drainPageWorkSettlements !== "function" ||
    !cache ||
    typeof cache.planCoreLease !== "function" ||
    !gpuLedger ||
    typeof gpuLedger.reserveOwnerPages !== "function" ||
    !presentation ||
    typeof presentation.prepare !== "function" ||
    typeof presentation.preflight !== "function" ||
    typeof presentation.commit !== "function" ||
    typeof presentation.abort !== "function" ||
    typeof presentation.retire !== "function" ||
    typeof options.createPhysicalSnapshot !== "function" ||
    typeof options.validatePhysicalSnapshot !== "function"
  ) {
    throw new DeveloperError(
      "Segmented Resource Adapter dependency is invalid",
    );
  }
}

/**
 * Transactional Engine resource authority for segmented hierarchy products.
 * Creates no Worker, WebGL, texture, DrawCommand, or public route.
 *
 * @alias _SceneGISGaussianSegmentedResourceAdapter
 * @constructor
 * @private
 */
function _SceneGISGaussianSegmentedResourceAdapter(options) {
  options = options ?? {};
  validateDependencies(options);
  this._provider = options.descriptorProvider;
  this._loader = options.loader;
  this._cache = options.cache;
  this._gpuLedger = options.gpuLedger;
  this._presentation = options.presentation;
  this._createPhysicalSnapshot = options.createPhysicalSnapshot;
  this._validatePhysicalSnapshot = options.validatePhysicalSnapshot;
  this.artifactIdentity = requireIdentity(
    this._provider.artifactIdentity,
    "artifactIdentity",
  );
  this.leaseIdentity = requireIdentity(options.leaseIdentity, "leaseIdentity");
  this.maximumCpuBytes = requireSafe(
    options.maximumCpuBytes,
    "maximumCpuBytes",
  );
  this.maximumGpuBytes = requireSafe(
    options.maximumGpuBytes,
    "maximumGpuBytes",
  );
  this._fixed = Object.freeze({
    loaderHttpReserveBytes: requireSafe(
      options.loaderHttpReserveBytes ?? 0,
      "loaderHttpReserveBytes",
    ),
    persistentStagingReserveBytes: requireSafe(
      options.persistentStagingReserveBytes ?? 0,
      "persistentStagingReserveBytes",
    ),
    workerReserveBytes: requireSafe(
      options.workerReserveBytes ?? 0,
      "workerReserveBytes",
    ),
    rendererReserveBytes: requireSafe(
      options.rendererReserveBytes ?? 0,
      "rendererReserveBytes",
    ),
    gpuAtlasAllocatedBytes: requireSafe(
      options.gpuAtlasAllocatedBytes ?? 0,
      "gpuAtlasAllocatedBytes",
    ),
  });
  this._generation = 0;
  this._pageDemandGeneration = 0;
  this._pageDemandStorageIdentity = Object.freeze({
    ownerLifetime: Object.freeze({}),
    ownerLifecycleGeneration: 1,
    storageGeneration: 0,
    sceneIdentity: this.artifactIdentity,
    serial: 1,
  });
  this._releasedCompletions = new WeakSet();
  this._cpuSnapshotGeneration = 0;
  this._gpuSnapshotGeneration = 0;
  this._activeWork = undefined;
  this._checkpointWork = undefined;
  this._current = undefined;
  this._cleanupDebts = new Set();
  this._gpuDebtTokens = new Set();
  this._orderingOverlays = new Set();
  this._orderingOverlayByOwner = new WeakMap();
  this._orderingOverlayGeneration = 0;
  this._destroyRequested = false;
  this._destroyed = false;
  this._retiringPresentationCpuBytes = 0;
  this._retiringPresentationGpuBytes = 0;
  this._statistics = {
    snapshotCaptures: 0,
    snapshotCaptureRetries: 0,
    bootstrapCreated: 0,
    transitionCreated: 0,
    commits: 0,
    aborts: 0,
    staleRejects: 0,
    cleanupSettlements: 0,
    cpuLedgerPeakBytes: 0,
    gpuLedgerPeakBytes: 0,
  };
  resourceAdapterAuthorities.add(this);
}

export function isGaussianSegmentedResourceAdapter(adapter, artifactIdentity) {
  return (
    resourceAdapterAuthorities.has(adapter) &&
    adapter.artifactIdentity === artifactIdentity &&
    !adapter._destroyRequested &&
    !adapter._destroyed
  );
}

_SceneGISGaussianSegmentedResourceAdapter.prototype._requireLiveWork =
  function (work) {
    const state = workStates.get(work);
    if (
      !state ||
      state.adapter !== this ||
      (this._activeWork !== work && this._checkpointWork !== work) ||
      ["ABORTED", "RETIRED"].includes(state.phase)
    ) {
      this._statistics.staleRejects++;
      throw new DeveloperError("Segmented resource work is stale or foreign");
    }
    return state;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._presentationDebtBytes =
  function (side) {
    let total = 0;
    for (const token of this._cleanupDebts) {
      total = exactAdd(
        total,
        cleanupDebtStates.get(token)[side],
        `${side} cleanup debt`,
      );
    }
    return total;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._stableCpuBytes =
  function () {
    if (this._current?.cleanupPending === true) {
      return 0;
    }
    let total = 0;
    for (const descriptor of this._current?.descriptors ?? []) {
      const entry = this._cache.peek(descriptor.index);
      if (entry && samePage(entry.page, descriptor)) {
        total = exactAdd(
          total,
          descriptor.storedBytes,
          "CPU stable Page bytes",
        );
      }
    }
    return total;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._stableGpuBytes =
  function () {
    if (this._current?.cleanupPending === true) {
      return 0;
    }
    let total = 0;
    for (const descriptor of this._current?.descriptors ?? []) {
      if (this._current.receipts.has(descriptor.index)) {
        total = exactAdd(
          total,
          this._gpuLedger.pagePhysicalBytes(descriptor),
          "GPU stable Page bytes",
        );
      }
    }
    return total;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._resourceLedger = function (
  includePagePartitions = true,
) {
  const cpuPageTotal = this._cache.bytesIncludingLeases;
  const gpuPageTotal = exactAdd(
    this._gpuLedger.boundBytes,
    this._gpuLedger.reservedBytes,
    "GPU Page live bytes",
  );
  const gpuPageWarmBytes = this._gpuLedger.warmBytes ?? 0;
  let cpuPageStableBytes;
  let cpuPageEscrowBytes;
  let gpuPageStableBytes;
  let gpuPageEscrowBytes;
  if (includePagePartitions) {
    cpuPageStableBytes = this._stableCpuBytes();
    cpuPageEscrowBytes = exactSubtract(
      cpuPageTotal,
      cpuPageStableBytes,
      "CPU Page escrow bytes",
    );
    gpuPageStableBytes = this._stableGpuBytes();
    gpuPageEscrowBytes = exactSubtract(
      gpuPageTotal,
      gpuPageStableBytes + gpuPageWarmBytes,
      "GPU Page escrow bytes",
    );
  }
  const cpuCleanupDebtBytes = this._presentationDebtBytes("cpuBytes");
  const gpuCleanupDebtBytes = exactAdd(
    this._gpuLedger.cleanupDebtBytes,
    this._presentationDebtBytes("gpuBytes"),
    "GPU cleanup debt bytes",
  );
  let cpuOrderingOverlayBytes = 0;
  let gpuOrderingOverlayBytes = 0;
  for (const receipt of this._orderingOverlays) {
    const overlay = orderingOverlayStates.get(receipt);
    cpuOrderingOverlayBytes = exactAdd(
      cpuOrderingOverlayBytes,
      overlay.cpuBytes,
      "CPU ordering overlay bytes",
    );
    gpuOrderingOverlayBytes = exactAdd(
      gpuOrderingOverlayBytes,
      overlay.gpuBytes,
      "GPU ordering overlay bytes",
    );
  }
  const activeState = defined(this._activeWork)
    ? workStates.get(this._activeWork)
    : undefined;
  const checkpointState = workStates.get(this._checkpointWork);
  const cpuPresentationCurrentBytes = this._current?.cleanupPending
    ? 0
    : (this._current?.cpuBytes ?? 0);
  const gpuPresentationCurrentBytes = this._current?.cleanupPending
    ? 0
    : (this._current?.gpuBytes ?? 0);
  const cpuPresentationWorkBytes = exactAdd(
    (activeState?.presentationCpuBytes ?? 0) +
      (checkpointState?.presentationCpuBytes ?? 0),
    this._retiringPresentationCpuBytes,
    "CPU presentation Work bytes",
  );
  const gpuPresentationWorkBytes = exactAdd(
    (activeState?.presentationGpuBytes ?? 0) +
      (checkpointState?.presentationGpuBytes ?? 0),
    this._retiringPresentationGpuBytes,
    "GPU presentation Work bytes",
  );
  let cpuTotal = 0;
  for (const value of [
    this._provider.compactIndexBytes,
    // Stable plus escrow is the existing cache total, even as Pages move
    // between owners. Availability checks do not need their classification.
    cpuPageTotal,
    cpuPresentationCurrentBytes,
    cpuPresentationWorkBytes,
    this._fixed.loaderHttpReserveBytes,
    this._fixed.persistentStagingReserveBytes,
    this._fixed.workerReserveBytes,
    cpuCleanupDebtBytes,
    cpuOrderingOverlayBytes,
  ]) {
    cpuTotal = exactAdd(cpuTotal, value, "CPU ResourceLedger total");
  }
  let gpuTotal = 0;
  const gpuPageCapacityCommitted = this._fixed.gpuAtlasAllocatedBytes > 0;
  for (const value of [
    this._fixed.gpuAtlasAllocatedBytes,
    gpuPageCapacityCommitted ? 0 : gpuPageTotal,
    gpuPresentationCurrentBytes,
    gpuPresentationWorkBytes,
    this._fixed.rendererReserveBytes,
    gpuPageCapacityCommitted
      ? this._presentationDebtBytes("gpuBytes")
      : gpuCleanupDebtBytes,
    gpuOrderingOverlayBytes,
  ]) {
    gpuTotal = exactAdd(gpuTotal, value, "GPU ResourceLedger total");
  }
  if (!includePagePartitions) {
    return Object.freeze({
      cpuTotal,
      gpuTotal,
      cpuCleanupDebtBytes,
      gpuCleanupDebtBytes,
      cpuOrderingOverlayBytes,
      gpuOrderingOverlayBytes,
    });
  }
  return Object.freeze({
    compactIndexBytes: this._provider.compactIndexBytes,
    cpuPageStableBytes,
    cpuPageEscrowBytes,
    cpuPresentationCurrentBytes,
    cpuPresentationWorkBytes,
    loaderHttpReserveBytes: this._fixed.loaderHttpReserveBytes,
    persistentStagingReserveBytes: this._fixed.persistentStagingReserveBytes,
    workerReserveBytes: this._fixed.workerReserveBytes,
    cpuCleanupDebtBytes,
    cpuOrderingOverlayBytes,
    cpuTotal,
    gpuPageStableBytes,
    gpuPageWarmBytes,
    gpuPageEscrowBytes,
    gpuPresentationCurrentBytes,
    gpuPresentationWorkBytes,
    rendererReserveBytes: this._fixed.rendererReserveBytes,
    gpuAtlasAllocatedBytes: this._fixed.gpuAtlasAllocatedBytes,
    gpuCleanupDebtBytes,
    gpuOrderingOverlayBytes,
    gpuTotal,
  });
};

_SceneGISGaussianSegmentedResourceAdapter.prototype.reserveOrderingOverlay =
  function (owner, cpuBytes, gpuBytes) {
    if (
      this._destroyRequested ||
      this._destroyed ||
      (typeof owner !== "object" && typeof owner !== "function") ||
      owner === null ||
      this._orderingOverlayByOwner.has(owner)
    ) {
      throw new DeveloperError("Ordering overlay owner is invalid");
    }
    cpuBytes = requireSafe(cpuBytes, "ordering overlay CPU bytes");
    gpuBytes = requireSafe(gpuBytes, "ordering overlay GPU bytes");
    const ledger = this._resourceLedger();
    if (
      exactAdd(ledger.cpuTotal, cpuBytes, "projected CPU ordering overlay") >
        this.maximumCpuBytes ||
      exactAdd(ledger.gpuTotal, gpuBytes, "projected GPU ordering overlay") >
        this.maximumGpuBytes
    ) {
      throw new DeveloperError(
        "Ordering overlay exceeds ResourceLedger hard limits",
      );
    }
    const receipt = Object.freeze({
      artifactIdentity: this.artifactIdentity,
      generation: ++this._orderingOverlayGeneration,
    });
    orderingOverlayStates.set(receipt, {
      adapter: this,
      owner,
      cpuBytes,
      gpuBytes,
      settled: false,
    });
    this._orderingOverlays.add(receipt);
    this._orderingOverlayByOwner.set(owner, receipt);
    this._observeLedger();
    return receipt;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.releaseOrderingOverlay =
  function (receipt, remainingCpuBytes = 0, remainingGpuBytes = 0) {
    return this.prepareOrderingOverlayRelease(
      receipt,
      remainingCpuBytes,
      remainingGpuBytes,
    )();
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.prepareOrderingOverlayRelease =
  function (receipt, remainingCpuBytes = 0, remainingGpuBytes = 0) {
    const state = orderingOverlayStates.get(receipt);
    if (
      !state ||
      state.adapter !== this ||
      state.settled ||
      !this._orderingOverlays.has(receipt)
    ) {
      throw new DeveloperError("Ordering overlay receipt is stale or foreign");
    }
    remainingCpuBytes = requireSafe(
      remainingCpuBytes,
      "remaining ordering overlay CPU bytes",
    );
    remainingGpuBytes = requireSafe(
      remainingGpuBytes,
      "remaining ordering overlay GPU bytes",
    );
    if (
      remainingCpuBytes > state.cpuBytes ||
      remainingGpuBytes > state.gpuBytes
    ) {
      throw new DeveloperError("Ordering overlay bytes may only decrease");
    }
    let consumed = false;
    return () => {
      if (consumed) {
        return state.settled;
      }
      consumed = true;
      state.cpuBytes = remainingCpuBytes;
      state.gpuBytes = remainingGpuBytes;
      if (remainingCpuBytes === 0 && remainingGpuBytes === 0) {
        state.settled = true;
        this._orderingOverlayByOwner.delete(state.owner);
        state.owner = undefined;
        this._orderingOverlays.delete(receipt);
        this._continueDestroy();
      }
      return state.settled;
    };
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._observeLedger =
  function () {
    const ledger = this._resourceLedger();
    if (
      ledger.cpuTotal > this.maximumCpuBytes ||
      ledger.gpuTotal > this.maximumGpuBytes
    ) {
      throw new DeveloperError("Segmented ResourceLedger exceeds a hard limit");
    }
    this._statistics.cpuLedgerPeakBytes = Math.max(
      this._statistics.cpuLedgerPeakBytes,
      ledger.cpuTotal,
    );
    this._statistics.gpuLedgerPeakBytes = Math.max(
      this._statistics.gpuLedgerPeakBytes,
      ledger.gpuTotal,
    );
    return ledger;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._beginWork = function (
  kind,
  options,
  acquisitionWork,
) {
  let acquisitionState;
  if (acquisitionWork) {
    acquisitionState = this._requireLiveWork(acquisitionWork);
    if (
      acquisitionWork !== this._activeWork ||
      this._checkpointWork ||
      !["GPU_RESERVED", "LOADING", "CPU_READY", "GPU_READY"].includes(
        acquisitionState.phase,
      )
    ) {
      throw new DeveloperError("Checkpoint requires a live Page acquisition");
    }
  }
  if (
    this._destroyRequested ||
    (defined(this._activeWork) && !acquisitionWork)
  ) {
    throw new DeveloperError("Segmented Resource Adapter is not idle");
  }
  if (kind === "BOOTSTRAP" && defined(this._current)) {
    throw new DeveloperError("Bootstrap cannot replace a current presentation");
  }
  if (kind === "TRANSITION") {
    if (
      !defined(this._current) ||
      options.sourcePresentationIdentity !== this._current.identity
    ) {
      throw new DeveloperError("Transition source presentation is stale");
    }
  }
  if (!defined(options.targetOwnershipIdentity)) {
    throw new DeveloperError("targetOwnershipIdentity is required");
  }
  const coreIds = sortedUniqueIds(
    options.requiredCorePageIds,
    this._provider.pageCount,
    "requiredCorePageIds",
  );
  if (coreIds.length === 0) {
    throw new DeveloperError("At least one required Core Page is required");
  }
  const optionalIds = sortedUniqueIds(
    options.optionalShPageIds,
    this._provider.pageCount,
    "optionalShPageIds",
  );
  const idSet = new Set(coreIds);
  for (const pageId of optionalIds) {
    if (idSet.has(pageId)) {
      throw new DeveloperError("Core and optional SH Page sets overlap");
    }
    idSet.add(pageId);
  }
  const descriptors = [...idSet]
    .sort((left, right) => left - right)
    .map((pageId) => this._provider.readPageRequest(pageId));
  const descriptorById = new Map(
    descriptors.map((descriptor) => [descriptor.index, descriptor]),
  );
  for (const descriptor of descriptors) {
    const entry = this._cache.peek(descriptor.index);
    if (entry && !samePage(entry.page, descriptor)) {
      throw new DeveloperError("CPU Cache Page artifact identity conflicts");
    }
    if (
      acquisitionState &&
      (!entry ||
        !(
          acquisitionState.receipts.has(descriptor.index) ||
          this._current?.receipts.has(descriptor.index)
        ))
    ) {
      throw new DeveloperError("Checkpoint Pages must already be resident");
    }
  }
  for (const pageId of coreIds) {
    if (descriptorById.get(pageId).semantic !== 1) {
      throw new DeveloperError("requiredCorePageIds contains a non-Core Page");
    }
  }
  for (const pageId of optionalIds) {
    if (descriptorById.get(pageId).semantic !== 2) {
      throw new DeveloperError("optionalShPageIds contains a non-SH Page");
    }
  }
  const generation = ++this._generation;
  const cpuOwnerIdentity = `scale-1d-work:${generation}`;
  const gpuOwner = Object.freeze({ generation, kind });
  const plan = this._cache.planCoreLease({
    ownerToken: cpuOwnerIdentity,
    requiredPages: coreIds.map((pageId) => descriptorById.get(pageId)),
  });
  if (plan.admitted !== true) {
    throw new DeveloperError("CPU Core Page reservation exceeds hard capacity");
  }
  let optionalMissingBytes = 0;
  for (const pageId of optionalIds) {
    if (!this._cache.has(pageId)) {
      optionalMissingBytes = exactAdd(
        optionalMissingBytes,
        descriptorById.get(pageId).storedBytes,
        "optional SH CPU escrow",
      );
    }
  }
  const presentationCpuBytes = requireSafe(
    options.presentationCpuBytes ?? 0,
    "presentationCpuBytes",
  );
  const presentationGpuBytes = requireSafe(
    options.presentationGpuBytes ?? 0,
    "presentationGpuBytes",
  );
  let projectedCpu = this._provider.compactIndexBytes;
  for (const value of [
    plan.bytesAfterLease,
    optionalMissingBytes,
    this._current?.cpuBytes ?? 0,
    presentationCpuBytes,
    this._resourceLedger().cpuPresentationWorkBytes,
    this._fixed.loaderHttpReserveBytes,
    this._fixed.persistentStagingReserveBytes,
    this._fixed.workerReserveBytes,
    this._presentationDebtBytes("cpuBytes"),
    this._resourceLedger().cpuOrderingOverlayBytes,
  ]) {
    projectedCpu = exactAdd(projectedCpu, value, "projected CPU total");
  }
  let projectedGpu = 0;
  const gpuPageCapacityCommitted = this._fixed.gpuAtlasAllocatedBytes > 0;
  if (this._gpuLedger.pruneWarmForReservation) {
    const eviction = this._gpuLedger.pruneWarmForReservation(descriptors);
    this._recordGpuDebts(eviction.debts);
    if (!eviction.ready) {
      throw new DeveloperError(
        "GPU Page reservation exceeds available capacity",
      );
    }
  }
  const incrementalGpuPageBytes =
    this._gpuLedger.incrementalReservationBytes(descriptors);
  for (const value of [
    this._fixed.gpuAtlasAllocatedBytes,
    gpuPageCapacityCommitted ? 0 : this._gpuLedger.boundBytes,
    gpuPageCapacityCommitted ? 0 : this._gpuLedger.reservedBytes,
    gpuPageCapacityCommitted ? 0 : this._gpuLedger.cleanupDebtBytes,
    gpuPageCapacityCommitted ? 0 : incrementalGpuPageBytes,
    this._current?.gpuBytes ?? 0,
    presentationGpuBytes,
    this._resourceLedger().gpuPresentationWorkBytes,
    this._fixed.rendererReserveBytes,
    this._presentationDebtBytes("gpuBytes"),
    this._resourceLedger().gpuOrderingOverlayBytes,
  ]) {
    projectedGpu = exactAdd(projectedGpu, value, "projected GPU total");
  }
  if (
    projectedCpu > this.maximumCpuBytes ||
    projectedGpu > this.maximumGpuBytes
  ) {
    throw new DeveloperError(
      "Segmented work exceeds ResourceLedger hard limits",
    );
  }
  const cpuLease = this._cache.commitCoreLease(plan);
  if (!cpuLease) {
    throw new DeveloperError("CPU Core Page reservation became stale");
  }
  let gpuReservation;
  try {
    gpuReservation = this._gpuLedger.reserveOwnerPages(gpuOwner, descriptors);
  } catch (error) {
    this._cache.releaseCoreLease(cpuLease, cpuOwnerIdentity);
    throw error;
  }
  const state = {
    adapter: this,
    acquisitionWork,
    generation,
    kind,
    phase: "GPU_RESERVED",
    targetOwnershipIdentity: options.targetOwnershipIdentity,
    sourcePresentationIdentity: options.sourcePresentationIdentity,
    coreIds,
    preferredCoreIds: new Set(options.preferredCorePageIds ?? []),
    optionalIds,
    descriptors,
    descriptorById,
    cpuOwnerIdentity,
    cpuLease,
    gpuOwner,
    gpuReservation,
    loaderOwnerIdentity: `scale-1d-loader:${generation}`,
    presentationCpuBytes,
    presentationGpuBytes,
    completedIds: new Set(),
    boundIds: new Set(),
    receipts: new Map(),
  };
  const work = new GaussianSegmentedResourceWork(state);
  state.work = work;
  if (acquisitionWork) {
    this._checkpointWork = work;
  } else {
    this._activeWork = work;
  }
  for (const descriptor of descriptors) {
    const source = acquisitionState?.receipts.has(descriptor.index)
      ? acquisitionState
      : this._current;
    const receipt = source?.receipts.get(descriptor.index);
    if (
      receipt &&
      samePage(source.descriptorById.get(descriptor.index), descriptor)
    ) {
      this._gpuLedger.acceptBoundPage(
        gpuReservation,
        descriptor.index,
        receipt,
      );
      state.boundIds.add(descriptor.index);
      state.receipts.set(descriptor.index, receipt);
    }
  }
  this._statistics[
    kind === "BOOTSTRAP" ? "bootstrapCreated" : "transitionCreated"
  ]++;
  this._observeLedger();
  return work;
};

_SceneGISGaussianSegmentedResourceAdapter.prototype.beginBootstrapWork =
  function (options = {}) {
    return this._beginWork("BOOTSTRAP", options);
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.evictWarmGpuPages =
  function (bytes) {
    const eviction = this._gpuLedger.evictWarm(bytes);
    this._recordGpuDebts(eviction.debts);
    this._observeLedger();
    return eviction;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.beginTransitionWork =
  function (options = {}) {
    return this._beginWork("TRANSITION", options);
  };

// A checkpoint borrows ready Pages; its retirement cannot release the parent
// acquisition's leases, requests or bindings. There is at most one child.
_SceneGISGaussianSegmentedResourceAdapter.prototype.beginCheckpointWork =
  function (acquisitionWork, options) {
    const work = this._beginWork("TRANSITION", options, acquisitionWork);
    this._updateReadyPhase(workStates.get(work));
    return work;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.rebaseAcquisitionWork =
  function (work, targetOwnershipIdentity, requiredCorePageIds) {
    const state = this._requireLiveWork(work);
    if (
      work !== this._activeWork ||
      this._checkpointWork ||
      !["GPU_RESERVED", "LOADING", "CPU_READY", "GPU_READY"].includes(
        state.phase,
      ) ||
      !defined(targetOwnershipIdentity) ||
      requiredCorePageIds.length !== state.coreIds.length ||
      !state.coreIds.every((id, index) => id === requiredCorePageIds[index])
    ) {
      throw new DeveloperError(
        "Acquisition rebase must preserve its Core demand",
      );
    }
    state.sourcePresentationIdentity = this._current.identity;
    state.targetOwnershipIdentity = targetOwnershipIdentity;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._updateReadyPhase =
  function (state) {
    const cpuReady = state.coreIds.every((pageId) => {
      const entry = this._cache.peek(pageId);
      return samePage(entry?.page, state.descriptorById.get(pageId));
    });
    const gpuReady = state.coreIds.every((pageId) =>
      state.boundIds.has(pageId),
    );
    if (cpuReady && gpuReady) {
      state.phase = "GPU_READY";
    } else if (cpuReady) {
      state.phase = "CPU_READY";
    }
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.requestRequiredPages =
  function (work) {
    const state = this._requireLiveWork(work);
    if (state.phase !== "GPU_RESERVED") {
      throw new DeveloperError(
        "Segmented work has already requested its Pages",
      );
    }
    const demands = state.descriptors.filter(
      (descriptor) =>
        !samePage(this._cache.get(descriptor.index)?.page, descriptor),
    );
    if (state.preferredCoreIds.size > 0) {
      demands.sort(
        (left, right) =>
          Number(state.preferredCoreIds.has(right.index)) -
          Number(state.preferredCoreIds.has(left.index)),
      );
    }
    state.demandedIds = new Set(demands.map((descriptor) => descriptor.index));
    state.demandKeys = new Map();
    if (demands.length > 0) {
      const deltas = demands.map((descriptor, requestRank) => {
        const core = descriptor.semantic === 1;
        const workIntentIdentity = `segmented:${state.generation}:${descriptor.index}`;
        const mappingPhysicalIdentity = `segmented-sh:${state.generation}`;
        const priority = Object.freeze({
          workClass: core
            ? GaussianStreamWorkClass.VISIBLE_WORK_CORE
            : GaussianStreamWorkClass.ACTIVE_OPTIONAL_SH,
          scheduleClass: core
            ? GaussianStreamScheduleClass.STABLE_MISSING
            : GaussianStreamScheduleClass.MAINTENANCE,
          distanceSquared: 0,
          logicalXyExtentSquared: 0,
          selectedSplats: descriptor.splatCount,
          tileY: 0,
          tileX: descriptor.index,
          canonicalIdentity: `${this.artifactIdentity}:${state.generation}:${descriptor.index}`,
          sequence: requestRank,
          requestRank,
        });
        const contributor = core
          ? Object.freeze({
              token: `acquisition:${workIntentIdentity}:0`,
              kind: "acquisition-core",
              desiredEntryGeneration: state.generation,
              tileKey: `segmented:${this.artifactIdentity}`,
              workIntentIdentity,
              retryOrdinal: 0,
              priority,
            })
          : Object.freeze({
              token: `active-sh:${mappingPhysicalIdentity}:${descriptor.index}`,
              kind: "active-sh",
              desiredEntryGeneration: state.generation,
              activeStateGeneration: state.generation,
              activeTileKey: `segmented:${this.artifactIdentity}`,
              mappingPhysicalIdentity,
              priority,
            });
        const key = `${this.artifactIdentity}:d2:${state.generation}:${descriptor.index}`;
        state.demandKeys.set(descriptor.index, key);
        return Object.freeze({
          pageIndex: descriptor.index,
          record: Object.freeze({
            key,
            pageIndex: descriptor.index,
            page: descriptor,
            contributors: Object.freeze([contributor]),
            priority,
            storageIdentity: this._pageDemandStorageIdentity,
          }),
        });
      });
      const generation = ++this._pageDemandGeneration;
      const applied = this._loader.applyPageDemandDelta({
        generation,
        storageIdentity: this._pageDemandStorageIdentity,
        deltas: Object.freeze(deltas),
      });
      if (
        applied.generation !== generation ||
        applied.storageIdentity !== this._pageDemandStorageIdentity
      ) {
        throw new DeveloperError(
          "Segmented PageDemand acknowledgement is stale",
        );
      }
      state.phase = "LOADING";
    }
    this._updateReadyPhase(state);
    return Object.freeze(demands.map((descriptor) => descriptor.index));
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._releaseCompletion =
  function (completion) {
    if (
      completion &&
      typeof completion === "object" &&
      !this._releasedCompletions.has(completion)
    ) {
      this._releasedCompletions.add(completion);
      completion.release?.();
    }
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._removePageDemands =
  function (state, pageIds) {
    const ids = [...pageIds].filter((pageId) => state.demandKeys?.has(pageId));
    if (ids.length === 0) {
      return;
    }
    const generation = ++this._pageDemandGeneration;
    const deltas = Object.freeze(
      ids.map((pageIndex) => Object.freeze({ pageIndex, record: undefined })),
    );
    const applied = this._loader.applyPageDemandDelta({
      generation,
      storageIdentity: this._pageDemandStorageIdentity,
      deltas,
    });
    if (
      applied.generation !== generation ||
      applied.storageIdentity !== this._pageDemandStorageIdentity
    ) {
      throw new DeveloperError("Segmented PageDemand removal is stale");
    }
    for (const pageId of ids) {
      state.demandKeys.delete(pageId);
      state.demandedIds.delete(pageId);
    }
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.consumePageWorkSettlements =
  function (work, settlements) {
    const state = workStates.get(work);
    if (!state || state.adapter !== this || this._activeWork !== work) {
      return Object.freeze({ coreFailed: false, optionalFailed: 0 });
    }
    const optionalIds = [];
    const coreIds = [];
    for (const settlement of settlements ?? []) {
      for (const record of settlement.records ?? []) {
        if (
          record.storageIdentity !== this._pageDemandStorageIdentity ||
          state.demandKeys.get(record.pageIndex) !== record.pageWorkKey
        ) {
          continue;
        }
        if (state.coreIds.includes(record.pageIndex)) {
          coreIds.push(record.pageIndex);
        } else if (state.optionalIds.includes(record.pageIndex)) {
          optionalIds.push(record.pageIndex);
        }
      }
    }
    this._removePageDemands(state, [...coreIds, ...optionalIds]);
    if (optionalIds.length > 0) {
      const failed = new Set(optionalIds);
      state.optionalIds = state.optionalIds.filter((id) => !failed.has(id));
      state.descriptors = state.descriptors.filter((descriptor) => {
        if (!failed.has(descriptor.index)) {
          return true;
        }
        state.descriptorById.delete(descriptor.index);
        return false;
      });
    }
    return Object.freeze({
      coreFailed: coreIds.length > 0,
      optionalFailed: optionalIds.length,
    });
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.acceptPageWorkCompletion =
  function (work, completion) {
    const state = this._requireLiveWork(work);
    const descriptor = state.descriptorById.get(completion?.page?.index);
    const expectedKey = state.demandKeys?.get(completion?.page?.index);
    if (
      !descriptor ||
      !state.demandedIds?.has(descriptor.index) ||
      completion.pageWorkKey !== expectedKey
    ) {
      this._statistics.staleRejects++;
      this._releaseCompletion(completion);
      return false;
    }
    if (
      state.completedIds.has(descriptor.index) ||
      !samePage(completion.page, descriptor) ||
      !(completion.payload instanceof Uint8Array) ||
      completion.payload.byteLength !== descriptor.storedBytes
    ) {
      this._statistics.staleRejects++;
      this._releaseCompletion(completion);
      throw new DeveloperError(
        "Loader completion is stale, foreign, or corrupt",
      );
    }
    let entry;
    try {
      entry = this._cache.put(descriptor, completion.payload, {
        tier: descriptor.semantic === 1 ? "visible" : "predicted",
        coreLeaseOwner: state.cpuOwnerIdentity,
        etag: completion.etag,
        lastModified: completion.lastModified,
      });
    } finally {
      // RAM now owns an accepted payload. Its former IndexedDB staging charge
      // must end on both acceptance and failure so later lookup batches can run.
      this._releaseCompletion(completion);
    }
    if (!entry) {
      this._releaseCompletion(completion);
      if (descriptor.semantic === 2) {
        return false;
      }
      throw new DeveloperError("Required Core Page was rejected by CPU Cache");
    }
    state.completedIds.add(descriptor.index);
    state.demandKeys.delete(descriptor.index);
    state.demandedIds.delete(descriptor.index);
    this._updateReadyPhase(state);
    this._observeLedger();
    return true;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.reserveAndBindGpuPage =
  function (work, pageId, receipt) {
    const state = this._requireLiveWork(work);
    const descriptor = state.descriptorById.get(pageId);
    const entry = this._cache.peek(pageId);
    if (!descriptor || !samePage(entry?.page, descriptor)) {
      throw new DeveloperError("GPU binding has no exact CPU Page backing");
    }
    this._gpuLedger.acceptBoundPage(state.gpuReservation, pageId, receipt);
    state.boundIds.add(pageId);
    state.receipts.set(pageId, receipt);
    this._updateReadyPhase(state);
    this._observeLedger();
    return work;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.capturePhysicalSnapshot =
  function (work, readyOnly = false) {
    const state = this._requireLiveWork(work);
    if (!readyOnly && this._checkpointWork && work === this._activeWork) {
      throw new DeveloperError(
        "Checkpoint publication must finish before final capture",
      );
    }
    this._updateReadyPhase(state);
    if (state.phase !== "GPU_READY" && !readyOnly) {
      throw new DeveloperError("Required Core Pages are not CPU/GPU ready");
    }
    const cpuGeneration = this._cache.resourceGeneration;
    const gpuGeneration = this._gpuLedger.resourceGeneration;
    let cpuHold;
    let gpuHold;
    try {
      cpuHold = this._cache.captureHeldPageSnapshot(
        work,
        this.artifactIdentity,
      );
      const gpuOwners = [state.gpuOwner];
      if (this._current) {
        gpuOwners.push(this._current.gpuOwner);
      }
      gpuHold = this._gpuLedger.captureBoundPageSnapshot(
        gpuOwners,
        this.artifactIdentity,
      );
      if (
        cpuHold.resourceGeneration !== cpuGeneration ||
        gpuHold.resourceGeneration !== gpuGeneration ||
        this._cache.resourceGeneration !== cpuGeneration ||
        this._gpuLedger.resourceGeneration !== gpuGeneration ||
        cpuHold.leaseIdentity !== this.leaseIdentity ||
        gpuHold.leaseIdentity !== this.leaseIdentity
      ) {
        throw new DeveloperError(
          "Physical snapshot generation or lease changed",
        );
      }
      for (const pageId of readyOnly ? [] : state.coreIds) {
        if (
          !containsSorted(cpuHold.pageIds, pageId) ||
          !containsSorted(gpuHold.pageIds, pageId)
        ) {
          throw new DeveloperError(
            "Required Core Page is absent from snapshot",
          );
        }
      }
      this._cpuSnapshotGeneration = Math.max(
        this._cpuSnapshotGeneration + 1,
        cpuGeneration,
      );
      this._gpuSnapshotGeneration = Math.max(
        this._gpuSnapshotGeneration + 1,
        gpuGeneration,
      );
      const physicalSnapshot = this._createPhysicalSnapshot({
        cpuPageIds: cpuHold.pageIds,
        cpuStoredBytes: cpuHold.pageStoredBytes,
        cpuPageProvenance: cpuHold.pageProvenance,
        gpuPageIds: gpuHold.pageIds,
        gpuRawBytes: gpuHold.pageRawBytes,
        gpuPageProvenance: gpuHold.pageProvenance,
        cpuGeneration: this._cpuSnapshotGeneration,
        gpuGeneration: this._gpuSnapshotGeneration,
        leaseIdentity: this.leaseIdentity,
      });
      if (
        this._validatePhysicalSnapshot(physicalSnapshot) !== physicalSnapshot
      ) {
        throw new DeveloperError(
          "Physical snapshot validator changed identity",
        );
      }
      if (readyOnly) {
        this._recordGpuDebts(this._gpuLedger.releaseBoundPageSnapshot(gpuHold));
        gpuHold = undefined;
        this._cache.releaseHeldPageSnapshot(cpuHold, work);
        cpuHold = undefined;
        return physicalSnapshot;
      }
      state.cpuSnapshotHold = cpuHold;
      state.gpuSnapshotHold = gpuHold;
      state.physicalSnapshot = physicalSnapshot;
      state.cpuSnapshotGeneration = this._cpuSnapshotGeneration;
      state.gpuSnapshotGeneration = this._gpuSnapshotGeneration;
      state.phase = "SNAPSHOT_CAPTURED";
      this._statistics.snapshotCaptures++;
      return physicalSnapshot;
    } catch (error) {
      if (gpuHold) {
        this._gpuLedger.releaseBoundPageSnapshot(gpuHold);
      }
      if (cpuHold) {
        this._cache.releaseHeldPageSnapshot(cpuHold, work);
      }
      this._statistics.snapshotCaptureRetries++;
      throw error;
    }
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.rebindTargetPages =
  function (work, exactCorePageIds, exactHeldShPageIds) {
    const state = this._requireLiveWork(work);
    if (state.phase !== "SNAPSHOT_CAPTURED" || state.targetPagesRebound) {
      throw new DeveloperError(
        "Exact target Page rebind is stale or out of phase",
      );
    }
    const coreIds = sortedUniqueIds(
      exactCorePageIds,
      this._provider.pageCount,
      "exactCorePageIds",
    );
    const optionalIds = sortedUniqueIds(
      exactHeldShPageIds,
      this._provider.pageCount,
      "exactHeldShPageIds",
    );
    const allIds = sortedUniqueIds(
      [...coreIds, ...optionalIds],
      this._provider.pageCount,
      "exact target Page ids",
    );
    const cpuIds = state.cpuSnapshotHold.pageIds;
    const gpuIds = state.gpuSnapshotHold.pageIds;
    const descriptorById = new Map();
    const receipts = new Map();
    for (const pageId of allIds) {
      if (!containsSorted(cpuIds, pageId) || !containsSorted(gpuIds, pageId)) {
        throw new DeveloperError(
          "Exact target Page lacks CPU/GPU snapshot authority",
        );
      }
      const descriptor = this._provider.readPageRequest(pageId);
      if (
        (containsSorted(coreIds, pageId) && descriptor.semantic !== 1) ||
        (containsSorted(optionalIds, pageId) && descriptor.semantic !== 2)
      ) {
        throw new DeveloperError("Exact target Page semantic is invalid");
      }
      const receipt =
        state.receipts.get(pageId) ?? this._current?.receipts.get(pageId);
      const knownDescriptor =
        state.descriptorById.get(pageId) ??
        this._current?.descriptorById.get(pageId);
      if (!receipt || !samePage(knownDescriptor, descriptor)) {
        throw new DeveloperError(
          "Exact target Page receipt is absent or stale",
        );
      }
      descriptorById.set(pageId, descriptor);
      receipts.set(pageId, receipt);
    }
    const cpu = projectSnapshotColumns(
      allIds,
      cpuIds,
      state.cpuSnapshotHold.pageStoredBytes,
      state.cpuSnapshotHold.pageProvenance,
    );
    const gpu = projectSnapshotColumns(
      allIds,
      gpuIds,
      state.gpuSnapshotHold.pageRawBytes,
      state.gpuSnapshotHold.pageProvenance,
    );
    const physicalSnapshot = this._createPhysicalSnapshot({
      cpuPageIds: Uint32Array.from(allIds),
      cpuStoredBytes: cpu.values,
      cpuPageProvenance: cpu.provenance,
      gpuPageIds: Uint32Array.from(allIds),
      gpuRawBytes: gpu.values,
      gpuPageProvenance: gpu.provenance,
      cpuGeneration: state.cpuSnapshotGeneration,
      gpuGeneration: state.gpuSnapshotGeneration,
      leaseIdentity: this.leaseIdentity,
    });
    if (this._validatePhysicalSnapshot(physicalSnapshot) !== physicalSnapshot) {
      throw new DeveloperError(
        "Exact target snapshot validator changed identity",
      );
    }
    state.coreIds = coreIds;
    state.optionalIds = optionalIds;
    state.descriptors = allIds.map((pageId) => descriptorById.get(pageId));
    state.descriptorById = descriptorById;
    state.receipts = receipts;
    state.targetPhysicalSnapshot = physicalSnapshot;
    state.targetPagesRebound = true;
    return physicalSnapshot;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.preparePresentation =
  function (work, input) {
    const state = this._requireLiveWork(work);
    if (state.phase !== "SNAPSHOT_CAPTURED") {
      throw new DeveloperError(
        "Presentation requires an exact physical snapshot",
      );
    }
    const ticket = this._presentation.prepare({
      kind: state.kind,
      current: this._current?.presentation,
      targetOwnershipIdentity: state.targetOwnershipIdentity,
      physicalSnapshot: state.physicalSnapshot,
      input,
    });
    if (!defined(ticket)) {
      throw new DeveloperError("Presentation prepare returned no ticket");
    }
    if (typeof this._presentation.describe === "function") {
      const description = this._presentation.describe(
        ticket,
        state.physicalSnapshot,
      );
      let valid = Object.isFrozen(description);
      let cpuBytes;
      let gpuBytes;
      try {
        cpuBytes = requireSafe(
          description?.cpuBytes,
          "described presentation CPU bytes",
        );
        gpuBytes = requireSafe(
          description?.gpuBytes,
          "described presentation GPU bytes",
        );
        requireSafe(
          description?.selectedSplatCount,
          "described selected splat count",
        );
        requireSafe(description?.slotCount, "described slot count");
        requireIdentity(
          description?.descriptorIdentity,
          "described presentation identity",
        );
      } catch (error) {
        valid = false;
      }
      if (
        !valid ||
        cpuBytes > state.presentationCpuBytes ||
        gpuBytes > state.presentationGpuBytes
      ) {
        this._presentation.abort(ticket, "presentation-reservation-rebind");
        throw new DeveloperError(
          "Presentation exact description exceeds or violates its reservation",
        );
      }
      state.presentationCpuBytes = cpuBytes;
      state.presentationGpuBytes = gpuBytes;
      state.presentationDescription = description;
      this._observeLedger();
    }
    state.presentationTicket = ticket;
    state.phase = "PRESENTATION_PREPARED";
    return ticket;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.commitPresentation =
  function (work, publicationReceipt) {
    const state = this._requireLiveWork(work);
    if (state.phase !== "PRESENTATION_PREPARED") {
      throw new DeveloperError("Presentation work is not prepared");
    }
    const physicalSnapshot = state.physicalSnapshot;
    const authority = this._presentation.preflight(
      state.presentationTicket,
      publicationReceipt,
      physicalSnapshot,
    );
    if (
      !Object.isFrozen(authority) ||
      authority.ticket !== state.presentationTicket ||
      authority.publicationReceipt !== publicationReceipt ||
      authority.physicalSnapshot !== physicalSnapshot ||
      requireIdentity(authority.identity, "preflight presentation identity") ===
        this._current?.identity ||
      requireSafe(authority.cpuBytes, "preflight presentation CPU bytes") !==
        state.presentationCpuBytes ||
      requireSafe(authority.gpuBytes, "preflight presentation GPU bytes") !==
        state.presentationGpuBytes
    ) {
      throw new DeveloperError(
        "Presentation preflight authority is inconsistent",
      );
    }
    const provisional = this._stageProvisionalCurrent(state, authority);
    let presentationState;
    try {
      presentationState = this._presentation.commit(authority);
    } catch (error) {
      this._rollbackProvisionalCurrent(provisional);
      throw error;
    }
    const result = Object.freeze({
      presentation: presentationState,
      identity: authority.identity,
      cpuBytes: authority.cpuBytes,
      gpuBytes: authority.gpuBytes,
    });
    const oldCurrent = this._current;
    this._current = {
      ...provisional,
      presentation: presentationState,
    };
    state.oldCurrent = oldCurrent;
    state.presentationCpuBytes = 0;
    state.presentationGpuBytes = 0;
    this._retiringPresentationCpuBytes = oldCurrent?.cpuBytes ?? 0;
    this._retiringPresentationGpuBytes = oldCurrent?.gpuBytes ?? 0;
    state.phase = "CURRENT_INSTALLED";
    this._statistics.commits++;
    return result;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._stageProvisionalCurrent =
  function (state, authority) {
    const currentCpuOwner = `scale-1d-current:${state.generation}`;
    const currentGpuOwner = Object.freeze({
      currentGeneration: state.generation,
    });
    const currentDescriptors = state.descriptors.filter(
      (descriptor) =>
        state.receipts.has(descriptor.index) &&
        this._cache.has(descriptor.index),
    );
    if (
      !state.coreIds.every((pageId) =>
        currentDescriptors.some((descriptor) => descriptor.index === pageId),
      )
    ) {
      throw new DeveloperError("Provisional current is missing a Core Page");
    }
    const currentCoreDescriptors = state.coreIds.map((pageId) =>
      state.descriptorById.get(pageId),
    );
    const currentCpuPlan = this._cache.planCoreLease({
      ownerToken: currentCpuOwner,
      requiredPages: currentCoreDescriptors,
    });
    if (currentCpuPlan.admitted !== true) {
      throw new DeveloperError(
        "Provisional current CPU owner was not admitted",
      );
    }
    let currentCpuLease;
    let currentGpuReservation;
    try {
      currentCpuLease = this._cache.commitCoreLease(currentCpuPlan);
      if (!currentCpuLease) {
        throw new DeveloperError("Provisional current CPU lease became stale");
      }
      currentGpuReservation = this._gpuLedger.reserveOwnerPages(
        currentGpuOwner,
        currentDescriptors,
      );
      for (const descriptor of currentDescriptors) {
        this._gpuLedger.acceptBoundPage(
          currentGpuReservation,
          descriptor.index,
          state.receipts.get(descriptor.index),
        );
      }
    } catch (error) {
      if (currentGpuReservation) {
        this._recordGpuDebts(this._gpuLedger.releaseOwner(currentGpuOwner));
      }
      if (currentCpuLease) {
        this._cache.releaseCoreLease(currentCpuLease, currentCpuOwner);
      }
      throw error;
    }
    return {
      identity: authority.identity,
      targetOwnershipIdentity: state.targetOwnershipIdentity,
      descriptors: currentDescriptors,
      descriptorById: new Map(
        currentDescriptors.map((descriptor) => [descriptor.index, descriptor]),
      ),
      receipts: new Map(state.receipts),
      cpuOwnerIdentity: currentCpuOwner,
      cpuLease: currentCpuLease,
      gpuOwner: currentGpuOwner,
      gpuReservation: currentGpuReservation,
      cpuBytes: authority.cpuBytes,
      gpuBytes: authority.gpuBytes,
      physicalSnapshot: state.targetPhysicalSnapshot ?? state.physicalSnapshot,
    };
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._rollbackProvisionalCurrent =
  function (provisional) {
    this._recordGpuDebts(this._gpuLedger.releaseOwner(provisional.gpuOwner));
    this._cache.releaseCoreLease(
      provisional.cpuLease,
      provisional.cpuOwnerIdentity,
    );
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._createCleanupUnit =
  function (kind, steps, cpuBytes, gpuBytes, onComplete, authority) {
    const token = Object.freeze({});
    cleanupDebtStates.set(token, {
      adapter: this,
      kind,
      authority: Object.freeze({ ...authority }),
      steps: Object.freeze(steps),
      cursor: 0,
      cpuBytes,
      gpuBytes,
      onComplete,
      settled: false,
    });
    this._cleanupDebts.add(token);
    return token;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype._runCleanupUnit = function (
  token,
  retry,
) {
  const unit = cleanupDebtStates.get(token);
  try {
    while (unit.cursor < unit.steps.length) {
      unit.steps[unit.cursor]();
      unit.cursor++;
    }
  } catch (error) {
    if (retry) {
      throw error;
    }
    return false;
  }
  unit.settled = true;
  this._cleanupDebts.delete(token);
  unit.onComplete();
  return true;
};

_SceneGISGaussianSegmentedResourceAdapter.prototype._recordGpuDebts = function (
  debts,
) {
  for (const token of debts ?? []) {
    this._gpuDebtTokens.add(token);
  }
};

_SceneGISGaussianSegmentedResourceAdapter.prototype._clearWorkPageDemands =
  function (state) {
    this._removePageDemands(state, state.demandKeys?.keys() ?? []);
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.finalizeRetirement =
  function (work) {
    const state = this._requireLiveWork(work);
    if (state.phase !== "CURRENT_INSTALLED") {
      throw new DeveloperError("Current presentation is not installed");
    }
    const steps = [];
    if (state.oldCurrent) {
      steps.push(() =>
        this._presentation.retire(state.oldCurrent.presentation),
      );
    }
    if (state.gpuSnapshotHold) {
      steps.push(() => {
        this._recordGpuDebts(
          this._gpuLedger.releaseBoundPageSnapshot(state.gpuSnapshotHold),
        );
        state.gpuSnapshotHold = undefined;
      });
    }
    if (state.cpuSnapshotHold) {
      steps.push(() => {
        this._cache.releaseHeldPageSnapshot(state.cpuSnapshotHold, state.work);
        state.cpuSnapshotHold = undefined;
      });
    }
    if (state.oldCurrent) {
      steps.push(() => {
        this._recordGpuDebts(
          this._gpuLedger.releaseOwner(state.oldCurrent.gpuOwner),
        );
      });
      steps.push(() => {
        this._cache.releaseCoreLease(
          state.oldCurrent.cpuLease,
          state.oldCurrent.cpuOwnerIdentity,
        );
      });
    }
    steps.push(() => {
      this._recordGpuDebts(this._gpuLedger.releaseOwner(state.gpuOwner));
    });
    steps.push(() => {
      this._cache.releaseCoreLease(state.cpuLease, state.cpuOwnerIdentity);
    });
    steps.push(() => this._clearWorkPageDemands(state));
    const token = this._createCleanupUnit(
      "RETIRE",
      steps,
      this._retiringPresentationCpuBytes,
      this._retiringPresentationGpuBytes,
      () => {
        state.phase = "RETIRED";
        if (this._checkpointWork === work) {
          this._checkpointWork = undefined;
        } else {
          this._activeWork = undefined;
        }
        this._continueDestroy();
      },
      {
        presentation: state.oldCurrent?.presentation,
        cpuSnapshotHold: state.cpuSnapshotHold,
        gpuSnapshotHold: state.gpuSnapshotHold,
        currentCpuLease: state.oldCurrent?.cpuLease,
        currentCpuOwner: state.oldCurrent?.cpuOwnerIdentity,
        currentGpuReservation: state.oldCurrent?.gpuReservation,
        currentGpuOwner: state.oldCurrent?.gpuOwner,
        workCpuLease: state.cpuLease,
        workCpuOwner: state.cpuOwnerIdentity,
        workGpuReservation: state.gpuReservation,
        workGpuOwner: state.gpuOwner,
      },
    );
    this._retiringPresentationCpuBytes = 0;
    this._retiringPresentationGpuBytes = 0;
    state.phase = "RETIRE_CLEANUP_DEBT";
    const complete = this._runCleanupUnit(token, false);
    this._observeLedger();
    return complete;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.abortWork = function (
  work,
  reason,
) {
  const known = workStates.get(work);
  if (
    known?.adapter === this &&
    ["ABORTED", "ABORT_CLEANUP_DEBT"].includes(known.phase)
  ) {
    return false;
  }
  const state = this._requireLiveWork(work);
  if (state.phase === "CURRENT_INSTALLED") {
    throw new DeveloperError("Installed current work cannot be aborted");
  }
  const steps = [];
  if (state.presentationTicket) {
    steps.push(() =>
      this._presentation.abort(state.presentationTicket, reason),
    );
  }
  if (state.gpuSnapshotHold) {
    steps.push(() => {
      this._recordGpuDebts(
        this._gpuLedger.releaseBoundPageSnapshot(state.gpuSnapshotHold),
      );
      state.gpuSnapshotHold = undefined;
    });
  }
  if (state.cpuSnapshotHold) {
    steps.push(() => {
      this._cache.releaseHeldPageSnapshot(state.cpuSnapshotHold, state.work);
      state.cpuSnapshotHold = undefined;
    });
  }
  steps.push(() => {
    this._recordGpuDebts(this._gpuLedger.releaseOwner(state.gpuOwner));
  });
  steps.push(() => {
    this._cache.releaseCoreLease(state.cpuLease, state.cpuOwnerIdentity);
  });
  steps.push(() => this._clearWorkPageDemands(state));
  const token = this._createCleanupUnit(
    "ABORT",
    steps,
    state.presentationCpuBytes,
    state.presentationGpuBytes,
    () => {
      state.phase = "ABORTED";
      if (this._checkpointWork === work) {
        this._checkpointWork = undefined;
      } else {
        this._activeWork = undefined;
      }
      this._statistics.aborts++;
      this._continueDestroy();
    },
    {
      ticket: state.presentationTicket,
      cpuSnapshotHold: state.cpuSnapshotHold,
      gpuSnapshotHold: state.gpuSnapshotHold,
      cpuLease: state.cpuLease,
      cpuOwner: state.cpuOwnerIdentity,
      gpuReservation: state.gpuReservation,
      gpuOwner: state.gpuOwner,
    },
  );
  state.presentationCpuBytes = 0;
  state.presentationGpuBytes = 0;
  state.phase = "ABORT_CLEANUP_DEBT";
  const complete = this._runCleanupUnit(token, false);
  this._observeLedger();
  return complete;
};

_SceneGISGaussianSegmentedResourceAdapter.prototype.settleCleanupDebt =
  function (token) {
    if (this._gpuDebtTokens.has(token)) {
      this._gpuLedger.settleCleanupDebt(token);
      this._gpuDebtTokens.delete(token);
    } else {
      const state = cleanupDebtStates.get(token);
      if (
        !state ||
        state.adapter !== this ||
        state.settled ||
        !this._cleanupDebts.has(token)
      ) {
        throw new DeveloperError("Cleanup debt token is stale or foreign");
      }
      this._runCleanupUnit(token, true);
    }
    this._statistics.cleanupSettlements++;
    this._continueDestroy();
    this._observeLedger();
    return true;
  };

_SceneGISGaussianSegmentedResourceAdapter.prototype.destroy = function () {
  if (this._destroyed || this._destroyRequested) {
    return false;
  }
  this._destroyRequested = true;
  for (const work of [this._checkpointWork, this._activeWork]) {
    if (!work) {
      continue;
    }
    const state = workStates.get(work);
    if (state.phase === "CURRENT_INSTALLED") {
      this.finalizeRetirement(work);
    } else if (
      !["RETIRE_CLEANUP_DEBT", "ABORT_CLEANUP_DEBT"].includes(state.phase)
    ) {
      this.abortWork(work, "destroy");
    }
  }
  this._continueDestroy();
  return true;
};

_SceneGISGaussianSegmentedResourceAdapter.prototype._continueDestroy =
  function () {
    if (
      !this._destroyRequested ||
      this._destroyed ||
      this._activeWork ||
      this._checkpointWork ||
      this._cleanupDebts.size > 0 ||
      this._gpuDebtTokens.size > 0 ||
      this._orderingOverlays.size > 0
    ) {
      return false;
    }
    if (!this._current) {
      if ((this._gpuLedger.warmBytes ?? 0) > 0) {
        this._recordGpuDebts(this._gpuLedger.evictWarm().debts);
        if (this._gpuDebtTokens.size > 0) {
          return false;
        }
      }
      const token = this._createCleanupUnit(
        "TERMINAL_DESTROY",
        [
          () => {
            if (this._gpuDebtTokens.size > 0) {
              throw new DeveloperError(
                "GPU cleanup debt blocks terminal destroy",
              );
            }
          },
          () => this._loader.destroy?.(),
          () => this._cache.clear(),
        ],
        0,
        0,
        () => {
          this._destroyed = true;
        },
        {},
      );
      return this._runCleanupUnit(token, false);
    }
    const current = this._current;
    current.cleanupPending = true;
    const token = this._createCleanupUnit(
      "DESTROY",
      [
        () => this._presentation.retire(current.presentation),
        () => {
          this._recordGpuDebts(this._gpuLedger.releaseOwner(current.gpuOwner));
        },
        () => {
          this._cache.releaseCoreLease(
            current.cpuLease,
            current.cpuOwnerIdentity,
          );
        },
      ],
      current.cpuBytes,
      current.gpuBytes,
      () => {
        this._current = undefined;
        this._continueDestroy();
      },
      {
        presentation: current.presentation,
        cpuLease: current.cpuLease,
        cpuOwner: current.cpuOwnerIdentity,
        gpuReservation: current.gpuReservation,
        gpuOwner: current.gpuOwner,
      },
    );
    return this._runCleanupUnit(token, false);
  };

Object.defineProperties(_SceneGISGaussianSegmentedResourceAdapter.prototype, {
  currentPresentationIdentity: {
    get: function () {
      return this._current?.identity;
    },
  },
  currentPhysicalSnapshot: {
    get: function () {
      return this._current?.physicalSnapshot;
    },
  },
  currentPageIds: {
    get: function () {
      return Object.freeze(
        this._current?.descriptors.map((descriptor) => descriptor.index) ?? [],
      );
    },
  },
  resourceLedger: {
    get: function () {
      return this._resourceLedger();
    },
  },
  resourceAvailability: {
    get: function () {
      return this._resourceLedger(false);
    },
  },
  cleanupDebtTokens: {
    get: function () {
      return Object.freeze([...this._cleanupDebts, ...this._gpuDebtTokens]);
    },
  },
  orderingOverlayReceipts: {
    get: function () {
      return Object.freeze([...this._orderingOverlays]);
    },
  },
  destroyRequested: {
    get: function () {
      return this._destroyRequested;
    },
  },
  destroyed: {
    get: function () {
      return this._destroyed;
    },
  },
  statistics: {
    get: function () {
      const provider = this._provider.statistics;
      const loader = this._loader.statistics ?? {};
      const gpu = this._gpuLedger.statistics;
      return Object.freeze({
        ...this._statistics,
        descriptorPageReads: provider?.descriptorPageReads ?? 0,
        descriptorPackReads: provider?.descriptorPackReads ?? 0,
        loaderRangeRequests: loader.pageRangeRequests ?? 0,
        loaderRangeBytes: loader.pageRangeRequestedBytes ?? 0,
        cpuHeldPages: this._cache.size,
        cpuHeldBytes: this._cache.bytes,
        cpuGeneration: this._cache.resourceGeneration,
        gpuReservedPages: gpu.gpuReservedPages,
        gpuBoundPages: gpu.gpuBoundPages,
        gpuHeldBytes: gpu.gpuHeldBytes,
        gpuGeneration: gpu.gpuGeneration,
        cleanupDebtPages: gpu.cleanupDebtPages + this._cleanupDebts.size,
        cleanupDebtBytes:
          this._gpuLedger.cleanupDebtBytes +
          this._presentationDebtBytes("cpuBytes") +
          this._presentationDebtBytes("gpuBytes"),
      });
    },
  },
});

export default _SceneGISGaussianSegmentedResourceAdapter;

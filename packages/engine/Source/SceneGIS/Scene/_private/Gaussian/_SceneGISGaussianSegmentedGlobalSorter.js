/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import defined from "../../../../Core/defined.js";
import DeveloperError from "../../../../Core/DeveloperError.js";
import TaskProcessor from "../../../../Core/TaskProcessor.js";

const INVALID_INDEX = 0xffffffff;
const CORE_BYTES_PER_SPLAT = 32;
const POSITION_BYTES_PER_SPLAT = 12;
import { computeSegmentedAtlasPageFootprint } from "../../../Core/_private/Gaussian/_SceneGISGaussianSegmentedAssetPageOwnership.js";
import {
  CORE_PREPARATION_WINDOW_BYTES,
  createSegmentedPreparedCoreReceipt,
  discardSegmentedPreparedCoreReceipt,
} from "./_SceneGISGaussianSegmentedCorePreparation.js";
const validationOwners = new WeakMap();

function requireSafe(value, label, positive = false) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) {
    throw new DeveloperError(`Segmented global ${label} is invalid`);
  }
  return value;
}

function exactAdd(values, label) {
  let result = 0;
  for (const value of values) {
    result += value;
    if (!Number.isSafeInteger(result) || result < 0) {
      throw new DeveloperError(
        `Segmented global ${label} exceeds safe integer`,
      );
    }
  }
  return result;
}

function paddedOrderingElements(selectedSplatCount) {
  return Math.ceil(selectedSplatCount / (4096 * 4)) * 4096 * 4;
}

function samePage(left, right) {
  return (
    left?.artifactIdentity === right?.artifactIdentity &&
    left?.pageIndex === right?.pageIndex &&
    left?.checksum === right?.checksum &&
    left?.assetId === right?.assetId &&
    left?.assetLocalStart === right?.assetLocalStart &&
    left?.kind === right?.kind &&
    left?.semantic === right?.semantic &&
    left?.layoutId === right?.layoutId &&
    left?.packId === right?.packId &&
    left?.offset === right?.offset &&
    left?.storedBytes === right?.storedBytes &&
    left?.rawBytes === right?.rawBytes &&
    left?.pageSplatCount === right?.pageSplatCount &&
    left?.expectedCoreBytes === right?.expectedCoreBytes &&
    left?.positionBytes === right?.positionBytes &&
    left?.representationId === right?.representationId &&
    left?.positionOriginX === right?.positionOriginX &&
    left?.positionOriginY === right?.positionOriginY &&
    left?.positionOriginZ === right?.positionOriginZ
  );
}

function validatePage(value, artifactIdentity) {
  if (
    value?.artifactIdentity !== artifactIdentity ||
    !Number.isSafeInteger(value.pageIndex) ||
    value.pageIndex < 0 ||
    !Number.isSafeInteger(value.checksum) ||
    !Number.isSafeInteger(value.pageSplatCount) ||
    value.pageSplatCount < 1 ||
    value.expectedCoreBytes !== value.pageSplatCount * CORE_BYTES_PER_SPLAT ||
    value.semantic !== 1 ||
    value.rawBytes !== value.expectedCoreBytes ||
    value.storedBytes !== value.rawBytes ||
    value.positionBytes !== value.pageSplatCount * POSITION_BYTES_PER_SPLAT ||
    !Number.isSafeInteger(value.representationId) ||
    value.representationId < 0 ||
    !Number.isFinite(value.positionOriginX) ||
    !Number.isFinite(value.positionOriginY) ||
    !Number.isFinite(value.positionOriginZ)
  ) {
    throw new DeveloperError("Segmented global position Page is invalid");
  }
}

function canonicalPages(values, artifactIdentity) {
  if (!Array.isArray(values)) {
    throw new DeveloperError("Segmented global retained Pages are invalid");
  }
  const result = values.map((value) => Object.freeze({ ...value }));
  let previous = -1;
  for (const value of result) {
    validatePage(value, artifactIdentity);
    if (value.pageIndex <= previous) {
      throw new DeveloperError(
        "Segmented global retained Pages are not canonical",
      );
    }
    previous = value.pageIndex;
  }
  return Object.freeze(result);
}

export function estimateGaussianSegmentedGlobalSortWorkingSetBytes(options) {
  const selected = requireSafe(
    options?.selectedSplatCount,
    "selectedSplatCount",
    true,
  );
  const confirmed = requireSafe(
    options.confirmedPositionBytes ?? 0,
    "confirmedPositionBytes",
  );
  const missing = requireSafe(
    options.missingPositionBytes ?? 0,
    "missingPositionBytes",
  );
  const preparationBytes = requireSafe(
    options.preparationBytes ?? 0,
    "preparationBytes",
  );
  const retained = requireSafe(
    options.retainedPositionBytes,
    "retainedPositionBytes",
  );
  const scratchCapacityElements = paddedOrderingElements(selected);
  const requiredWorkerScratchBytes = exactAdd(
    [scratchCapacityElements * 4 * 3, (1024 + 256) * 4],
    "Worker sort scratch",
  );
  const permutationValidationBytes = Math.ceil(selected / 8);
  const residentWorkerScratchBytes = requireSafe(
    options.scratchResidentBytes ?? 0,
    "scratchResidentBytes",
  );
  const workerScratchPeakBytes =
    requiredWorkerScratchBytes > residentWorkerScratchBytes
      ? exactAdd(
          [residentWorkerScratchBytes, requiredWorkerScratchBytes],
          "Worker sort scratch growth",
        )
      : residentWorkerScratchBytes;
  const scratchBytes = exactAdd(
    [workerScratchPeakBytes, permutationValidationBytes],
    "sort scratch and validation peak",
  );
  const orderingBytes = paddedOrderingElements(selected) * 4;
  const repositoryPeakBytes = Math.max(
    retained,
    exactAdd([confirmed, missing, preparationBytes], "repository peak"),
  );
  const totalBytes = exactAdd(
    [repositoryPeakBytes, scratchBytes, orderingBytes],
    "Worker working set",
  );
  return Object.freeze({
    repositoryPeakBytes,
    scratchCapacityElements,
    requiredWorkerScratchBytes,
    residentWorkerScratchBytes,
    workerScratchPeakBytes,
    permutationValidationBytes,
    scratchBytes,
    orderingBytes,
    totalBytes,
  });
}

function validateIntent(intent) {
  for (const name of [
    "artifactIdentity",
    "contentIdentity",
    "dispatchAttemptIdentity",
  ]) {
    if (typeof intent?.[name] !== "string" || intent[name].length === 0) {
      throw new DeveloperError(`Segmented global ${name} is invalid`);
    }
  }
  for (const name of [
    "contentGeneration",
    "mappingGeneration",
    "viewGeneration",
    "requestSerial",
    "selectedSplatCount",
  ]) {
    requireSafe(intent[name], name, true);
  }
  if (
    !Array.isArray(intent.sortCenter) ||
    intent.sortCenter.length !== 3 ||
    !intent.sortCenter.every(Number.isFinite)
  ) {
    throw new DeveloperError("Segmented global sort center is invalid");
  }
  const arrays = [
    intent.fragmentCorePageIds,
    intent.fragmentPageLocalStarts,
    intent.fragmentCounts,
    intent.fragmentPresentationStarts,
  ];
  if (
    arrays.some((value) => !(value instanceof Uint32Array)) ||
    arrays.some((value) => value.length !== arrays[0].length) ||
    arrays[0].length < 1
  ) {
    throw new DeveloperError("Segmented global fragment authority is invalid");
  }
  let cursor = 0;
  for (let index = 0; index < arrays[0].length; index++) {
    if (
      arrays[2][index] < 1 ||
      arrays[3][index] !== cursor ||
      !Number.isSafeInteger(cursor + arrays[2][index])
    ) {
      throw new DeveloperError("Segmented global fragment coverage is invalid");
    }
    cursor += arrays[2][index];
  }
  if (cursor !== intent.selectedSplatCount) {
    throw new DeveloperError(
      "Segmented global fragment coverage is incomplete",
    );
  }
}

function validateAcknowledgement(result, expected, previousGeneration) {
  if (
    !Number.isSafeInteger(result.repositoryGeneration) ||
    result.repositoryGeneration !== previousGeneration + 1 ||
    !Array.isArray(result.retainedPages) ||
    !Array.isArray(result.retainedPageIds) ||
    result.retainedPages.length !== expected.length ||
    result.retainedPageIds.length !== expected.length ||
    result.confirmedPositionPageCount !== expected.length
  ) {
    throw new DeveloperError(
      "Segmented global repository acknowledgement is invalid",
    );
  }
  let bytes = 0;
  for (let index = 0; index < expected.length; index++) {
    if (
      !samePage(result.retainedPages[index], expected[index]) ||
      result.retainedPageIds[index] !== expected[index].pageIndex
    ) {
      throw new DeveloperError(
        "Segmented global repository acknowledgement is stale",
      );
    }
    bytes += expected[index].positionBytes;
  }
  if (result.confirmedPositionBytes !== bytes) {
    throw new DeveloperError("Segmented global repository bytes are invalid");
  }
}

function validateSortResultEnvelope(
  result,
  intent,
  previousRepositoryGeneration,
) {
  validateIntent(intent);
  const retained = canonicalPages(
    intent.retainedPages,
    intent.artifactIdentity,
  );
  if (
    result?.operation !== "SORT" ||
    result?.artifactIdentity !== intent.artifactIdentity ||
    result.contentIdentity !== intent.contentIdentity ||
    result.contentGeneration !== intent.contentGeneration ||
    result.mappingGeneration !== intent.mappingGeneration ||
    result.viewGeneration !== intent.viewGeneration ||
    result.requestSerial !== intent.requestSerial ||
    result.dispatchAttemptIdentity !== intent.dispatchAttemptIdentity ||
    result.selectedSplatCount !== intent.selectedSplatCount ||
    !(result.ordering instanceof Uint32Array) ||
    result.ordering.byteOffset !== 0 ||
    result.ordering.byteLength !== result.ordering.buffer.byteLength ||
    result.ordering.length !== paddedOrderingElements(intent.selectedSplatCount)
  ) {
    throw new DeveloperError(
      "Segmented global sort result is stale or foreign",
    );
  }
  if (result.repositoryGeneration !== previousRepositoryGeneration) {
    throw new DeveloperError("Segmented SORT changed repository generation");
  }
  validateAcknowledgement(result, retained, previousRepositoryGeneration - 1);
  if (result.decodedPositionSplats !== 0) {
    throw new DeveloperError(
      "Segmented global Worker decoded position count is invalid",
    );
  }
  const estimate = intent.workingSetEstimate;
  if (
    !estimate ||
    result.returnedOrderingBytes !== estimate.orderingBytes ||
    !Number.isSafeInteger(result.scratchBytes) ||
    result.scratchBytes < 0 ||
    result.scratchBytes > estimate.scratchBytes
  ) {
    throw new DeveloperError(
      "Segmented global Worker memory report is invalid",
    );
  }
}

export function validateGaussianSegmentedGlobalSortResult(
  result,
  intent,
  previousRepositoryGeneration = 0,
) {
  validateSortResultEnvelope(result, intent, previousRepositoryGeneration);
  const seen = new Uint8Array(Math.ceil(intent.selectedSplatCount / 8));
  for (let index = 0; index < intent.selectedSplatCount; index++) {
    const value = result.ordering[index];
    if (value >= intent.selectedSplatCount) {
      throw new DeveloperError("Segmented global Ordering is out of range");
    }
    const byte = value >>> 3;
    const bit = 1 << (value & 7);
    if ((seen[byte] & bit) !== 0) {
      throw new DeveloperError(
        "Segmented global Ordering is not a permutation",
      );
    }
    seen[byte] |= bit;
  }
  for (
    let index = intent.selectedSplatCount;
    index < result.ordering.length;
    index++
  ) {
    if (result.ordering[index] !== INVALID_INDEX) {
      throw new DeveloperError("Segmented global Ordering padding is invalid");
    }
  }
  validationOwners.set(result.ordering, Object.freeze({ intent, result }));
  return result;
}

export function consumeGaussianSegmentedGlobalOrderingValidation(
  ordering,
  intent,
) {
  const owner = validationOwners.get(ordering);
  if (!owner || owner.intent !== intent) {
    return undefined;
  }
  validationOwners.delete(ordering);
  return owner.result;
}

export default class _SceneGISGaussianSegmentedGlobalSorter {
  constructor(options = {}) {
    this.maximumWorkingSetBytes = requireSafe(
      options.maximumWorkingSetBytes ?? 512 * 1024 * 1024,
      "maximumWorkingSetBytes",
      true,
    );
    this._taskProcessor =
      options.taskProcessor ??
      new TaskProcessor("SceneGISGaussianSortWorker", 1);
    this._desired = undefined;
    this._inFlight = undefined;
    this._settlements = [];
    this._confirmed = new Map();
    this._repositoryGeneration = 0;
    this._preparation = undefined;
    this._pendingPrune = undefined;
    this._pruneSerial = 0;
    this._destroyed = false;
    this._destroyRequested = false;
    this._cancelled = new WeakSet();
    this._statistics = {
      corePreparationCopiedBytes: 0,
      corePreparationConvertedSplats: 0,
      corePreparationLiveBytes: 0,
      corePreparationHighWaterBytes: 0,
      corePreparationBatchDispatchCount: 0,
      corePreparationBatchCompletionCount: 0,
      corePreparationReusePageCount: 0,
      corePreparationRebuildPageCount: 0,
      corePreparationStaleUploadDiscardCount: 0,
      dispatchCount: 0,
      completionCount: 0,
      failureCount: 0,
      staleDiscardCount: 0,
      coalescedRequestCount: 0,
      confirmedPositionBytes: 0,
      scratchBytes: 0,
      workingSetHighWater: 0,
      sortPositionExtractions: 0,
      lastFrameSortPositionExtractions: 0,
      rawCoreCloneBytes: 0,
      lastFrameRawCoreCloneBytes: 0,
      workerDecodedPositionSplats: 0,
      positionRepositoryHitPageCount: 0,
      positionRepositoryMissPageCount: 0,
    };
  }

  request(intent) {
    if (this._destroyed || this._destroyRequested) {
      throw new DeveloperError("Segmented global Sorter is destroyed");
    }
    validateIntent(intent);
    const requestedPages = canonicalPages(
      intent.retainedPages,
      intent.artifactIdentity,
    );
    for (const page of requestedPages) {
      if (!samePage(this._confirmed.get(page.pageIndex), page)) {
        this._statistics.positionRepositoryMissPageCount++;
        throw new DeveloperError(
          "Segmented SORT requires prepared Core positions",
        );
      }
      this._statistics.positionRepositoryHitPageCount++;
    }
    // SORT does not mutate the Worker repository. With history enabled its
    // acknowledgement covers every confirmed Page, even without a RAM payload.
    const retainedPages =
      intent.retainConfirmedPages === true
        ? canonicalPages(
            [...this._confirmed.values()].sort(
              (a, b) => a.pageIndex - b.pageIndex,
            ),
            intent.artifactIdentity,
          )
        : requestedPages;
    const retainedPositionBytes = retainedPages.reduce(
      (sum, page) => sum + page.positionBytes,
      0,
    );
    const workingSetEstimate =
      estimateGaussianSegmentedGlobalSortWorkingSetBytes({
        selectedSplatCount: intent.selectedSplatCount,
        confirmedPositionBytes: this._statistics.confirmedPositionBytes,
        preparationBytes: this._statistics.corePreparationLiveBytes,
        retainedPositionBytes,
        scratchResidentBytes: this._statistics.scratchBytes,
      });
    if (workingSetEstimate.totalBytes > this.maximumWorkingSetBytes) {
      throw new DeveloperError("Segmented global sort exceeds Worker reserve");
    }
    const desired = Object.freeze({
      ...intent,
      retainedPages,
      kind: "SORT",
      workingSetEstimate,
    });
    const occupied = this._desired;
    if (
      occupied &&
      (occupied.ownerIdentity ?? occupied.contentIdentity) !==
        (desired.ownerIdentity ?? desired.contentIdentity)
    ) {
      throw new DeveloperError(
        "Segmented global Sorter cannot overwrite a foreign desired owner",
      );
    }
    if (this._desired) {
      this._statistics.coalescedRequestCount++;
    }
    this._desired = desired;
    return desired;
  }

  requestPreparation(intent) {
    if (
      this._destroyed ||
      this._destroyRequested ||
      this._preparation ||
      this._desired
    ) {
      throw new DeveloperError("Segmented Core preparation owner is occupied");
    }
    const pages = canonicalPages(intent.pages, intent.artifactIdentity);
    let uploadBytes = 0;
    let missingPositionBytes = 0;
    for (const page of pages) {
      if (
        page.uploadBytes !==
        computeSegmentedAtlasPageFootprint(page.pageSplatCount, 1, 0)
          .uploadBytes
      ) {
        throw new DeveloperError("Segmented preparation footprint is invalid");
      }
      uploadBytes += page.uploadBytes;
      const current = this._confirmed.get(page.pageIndex);
      if (current && !samePage(current, page)) {
        throw new DeveloperError("Segmented preparation identity changed");
      }
      if (!current) {
        missingPositionBytes += page.positionBytes;
      }
    }
    if (pages.length === 0 || uploadBytes > CORE_PREPARATION_WINDOW_BYTES) {
      throw new DeveloperError("Segmented preparation exceeds byte window");
    }
    const workingSetEstimate =
      estimateGaussianSegmentedGlobalSortWorkingSetBytes({
        selectedSplatCount: intent.selectedSplatCount,
        confirmedPositionBytes: this._statistics.confirmedPositionBytes,
        missingPositionBytes,
        retainedPositionBytes:
          this._statistics.confirmedPositionBytes + missingPositionBytes,
        preparationBytes: uploadBytes,
        scratchResidentBytes: this._statistics.scratchBytes,
      });
    if (workingSetEstimate.totalBytes > this.maximumWorkingSetBytes) {
      throw new DeveloperError(
        "Segmented Core preparation exceeds Worker reserve",
      );
    }
    const desired = Object.freeze({
      ...intent,
      kind: "PREPARE_CORE",
      pages,
      uploadBytes,
      workingSetEstimate,
    });
    this._preparation = {
      intent: desired,
      buffers: undefined,
      receipts: undefined,
    };
    this._desired = desired;
    return desired;
  }

  releasePreparation(intent, stale = false) {
    const preparation = this._preparation;
    if (!preparation || preparation.intent !== intent) {
      return;
    }
    for (const receipt of preparation.receipts ?? []) {
      discardSegmentedPreparedCoreReceipt(receipt);
    }
    preparation.buffers = undefined;
    preparation.receipts = undefined;
    this._statistics.corePreparationLiveBytes = 0;
    if (stale) {
      this._statistics.corePreparationStaleUploadDiscardCount +=
        intent.pages.length;
    }
    this._preparation = undefined;
  }

  update(preparePayload, maximumPositionExtractions = Number.MAX_SAFE_INTEGER) {
    requireSafe(maximumPositionExtractions, "maximumPositionExtractions");
    if (this._destroyed || this._destroyRequested || this._inFlight) {
      return undefined;
    }
    const intent = this._pendingPrune ?? this._desired;
    if (!intent) {
      return undefined;
    }
    const previousGeneration = this._repositoryGeneration;
    let parameters;
    let transfer = [];
    let expectedPages;
    if (this._pendingPrune) {
      parameters = {
        operation: "PRUNE",
        ...intent,
        repositoryGeneration: previousGeneration,
      };
      expectedPages = intent.retainedPages;
    } else if (intent.kind === "PREPARE_CORE") {
      if (maximumPositionExtractions === 0) {
        return undefined;
      }
      const preparation = this._preparation;
      if (!preparation.buffers) {
        const payloads = intent.pages.map((identity) => {
          const payload = preparePayload?.(identity);
          if (
            !(payload instanceof Uint8Array) ||
            payload.byteLength !== identity.expectedCoreBytes
          ) {
            throw new DeveloperError("Segmented Core payload is unavailable");
          }
          return payload;
        });
        preparation.buffers = intent.pages.map((identity, index) => {
          const payload = payloads[index];
          const core = new Uint8Array(identity.uploadBytes);
          core.set(payload);
          this._statistics.corePreparationCopiedBytes += payload.byteLength;
          return { ...identity, core };
        });
        this._statistics.corePreparationLiveBytes = intent.uploadBytes;
        this._statistics.corePreparationHighWaterBytes = Math.max(
          this._statistics.corePreparationHighWaterBytes,
          intent.uploadBytes,
        );
      }
      const expected = new Map(this._confirmed);
      for (const page of intent.pages) {
        expected.set(page.pageIndex, page);
      }
      expectedPages = [...expected.values()].sort(
        (a, b) => a.pageIndex - b.pageIndex,
      );
      parameters = {
        operation: "PREPARE_CORE",
        artifactIdentity: intent.artifactIdentity,
        contentIdentity: intent.contentIdentity,
        requestSerial: intent.requestSerial,
        repositoryGeneration: previousGeneration,
        corePreparations: preparation.buffers,
      };
      transfer = preparation.buffers.map((page) => page.core.buffer);
    } else {
      parameters = {
        operation: "SORT",
        repositoryGeneration: previousGeneration,
        artifactIdentity: intent.artifactIdentity,
        contentIdentity: intent.contentIdentity,
        contentGeneration: intent.contentGeneration,
        mappingGeneration: intent.mappingGeneration,
        viewGeneration: intent.viewGeneration,
        requestSerial: intent.requestSerial,
        dispatchAttemptIdentity: intent.dispatchAttemptIdentity,
        selectedSplatCount: intent.selectedSplatCount,
        sortCenter: [...intent.sortCenter],
        retainedPages: intent.retainedPages,
        fragmentCorePageIds: intent.fragmentCorePageIds,
        fragmentPageLocalStarts: intent.fragmentPageLocalStarts,
        fragmentCounts: intent.fragmentCounts,
        fragmentPresentationStarts: intent.fragmentPresentationStarts,
        ordering: new Uint32Array(
          paddedOrderingElements(intent.selectedSplatCount),
        ),
      };
      transfer = [parameters.ordering.buffer];
    }
    let promise;
    try {
      promise = this._taskProcessor.scheduleTask(parameters, transfer);
    } catch (error) {
      this._desired = undefined;
      if (intent.kind === "PREPARE_CORE") {
        this.releasePreparation(intent);
      }
      this._settlements.push({ error, intent });
      this._statistics.failureCount++;
      return intent;
    }
    if (!defined(promise)) {
      return undefined;
    }
    this._desired = undefined;
    this._pendingPrune = undefined;
    if (intent.kind === "PREPARE_CORE") {
      this._preparation.buffers = undefined;
      this._statistics.corePreparationBatchDispatchCount++;
      this._statistics.corePreparationRebuildPageCount +=
        intent.rebuildPageCount ?? 0;
    } else if (parameters.operation === "SORT") {
      this._statistics.dispatchCount++;
    }
    const expectedDecodedSplats =
      intent.kind === "PREPARE_CORE"
        ? intent.pages.reduce(
            (sum, page) =>
              sum +
              (this._confirmed.has(page.pageIndex) ? 0 : page.pageSplatCount),
            0,
          )
        : 0;
    const owner = Object.freeze({
      kind: parameters.operation,
      intent,
      expectedPages,
      previousGeneration,
      expectedDecodedSplats,
    });
    this._inFlight = owner;
    this._statistics.workingSetHighWater = Math.max(
      this._statistics.workingSetHighWater,
      intent.workingSetEstimate?.totalBytes ?? 0,
    );
    Promise.resolve(promise).then(
      (result) => this._settle(owner, { result }),
      (error) => this._settle(owner, { error }),
    );
    return intent;
  }

  _settle(owner, settlement) {
    if (this._inFlight !== owner) {
      throw new DeveloperError("Segmented Worker settlement owner changed");
    }
    this._inFlight = undefined;
    const cancelled =
      this._cancelled.has(owner.intent) || this._destroyRequested;
    try {
      const result = settlement.result;
      if (settlement.error) {
        throw settlement.error;
      }
      if (owner.kind === "PREPARE_CORE" || owner.kind === "PRUNE") {
        if (
          result.operation !== owner.kind ||
          result.requestSerial !== owner.intent.requestSerial
        ) {
          throw new DeveloperError(
            "Segmented physical acknowledgement is stale",
          );
        }
        validateAcknowledgement(
          result,
          owner.expectedPages,
          owner.previousGeneration,
        );
        // Physical mutation is acknowledged even after upload authorization was cancelled.
        this._repositoryGeneration = result.repositoryGeneration;
        this._confirmed = new Map(
          result.retainedPages.map((page) => [page.pageIndex, page]),
        );
        this._statistics.confirmedPositionBytes = result.confirmedPositionBytes;
        if (owner.kind === "PREPARE_CORE") {
          if (
            result.decodedPositionSplats !== owner.expectedDecodedSplats ||
            result.contentIdentity !== owner.intent.contentIdentity ||
            !Array.isArray(result.preparedCore) ||
            result.preparedCore.length !== owner.intent.pages.length
          ) {
            throw new DeveloperError(
              "Segmented preparation receipt is foreign",
            );
          }
          const buffers = new Set();
          const receipts = result.preparedCore.map((page, index) => {
            const expected = owner.intent.pages[index];
            if (
              !samePage(page, expected) ||
              page.uploadBytes !== expected.uploadBytes ||
              buffers.has(page.core?.buffer)
            ) {
              throw new DeveloperError(
                "Segmented prepared Page receipt is invalid",
              );
            }
            buffers.add(page.core.buffer);
            return createSegmentedPreparedCoreReceipt(expected, page.core);
          });
          this._preparation.receipts = receipts;
          this._statistics.corePreparationBatchCompletionCount++;
          this._statistics.corePreparationConvertedSplats +=
            result.decodedPositionSplats;
          this._statistics.workerDecodedPositionSplats +=
            result.decodedPositionSplats;
          result.receipts = receipts;
          // Returned buffers are now held only by bounded branded receipts.
          result.preparedCore = undefined;
          if (cancelled) {
            this.releasePreparation(owner.intent, true);
          }
        }
      } else {
        // A cancelled Ordering cannot be installed. Keep its protocol and memory
        // checks, but do not scan or brand the discarded permutation and padding.
        const validateResult = cancelled
          ? validateSortResultEnvelope
          : validateGaussianSegmentedGlobalSortResult;
        validateResult(result, owner.intent, owner.previousGeneration);
        this._statistics.scratchBytes = result.scratchBytes;
        this._statistics.completionCount++;
        if (cancelled) {
          this._statistics.staleDiscardCount++;
          return;
        }
      }
    } catch (error) {
      settlement = { error };
      this._statistics.failureCount++;
      if (owner.kind === "PREPARE_CORE") {
        this.releasePreparation(owner.intent);
      }
    }
    this._settlements.push({ ...settlement, intent: owner.intent, cancelled });
  }

  takeSettlements() {
    return this._settlements.splice(0);
  }

  cancel(intent) {
    if (!intent) {
      return false;
    }
    this._cancelled.add(intent);
    if (this._desired === intent) {
      this._desired = undefined;
    }
    if (intent.kind === "PREPARE_CORE" && this._inFlight?.intent !== intent) {
      this.releasePreparation(intent, true);
    }
    if (intent.kind !== "PREPARE_CORE") {
      this._settlements = this._settlements.filter((s) => s.intent !== intent);
    }
    return true;
  }

  requestPrune(artifactIdentity, retainedPages) {
    if (
      this._destroyed ||
      this._destroyRequested ||
      typeof artifactIdentity !== "string"
    ) {
      throw new DeveloperError("Segmented global prune request is invalid");
    }
    const canonical = canonicalPages(retainedPages, artifactIdentity);
    this._pendingPrune = Object.freeze({
      artifactIdentity,
      retainedPages: canonical,
      requestSerial: ++this._pruneSerial,
    });
    return this._pendingPrune;
  }

  get snapshot() {
    return Object.freeze({
      ...this._statistics,
      confirmedPageCount: this._confirmed.size,
      repositoryGeneration: this._repositoryGeneration,
      hasDesired: !!this._desired,
      hasExtracting: !!this._preparation,
      hasInFlight: !!this._inFlight,
      hasPendingPrune: !!this._pendingPrune,
      destroyed: this._destroyed,
    });
  }

  destroy() {
    if (this._destroyed) {
      return false;
    }
    this._destroyRequested = true;
    if (this._inFlight) {
      return false;
    }
    if (this._preparation) {
      this.releasePreparation(this._preparation.intent, true);
    }
    this._desired = undefined;
    this._pendingPrune = undefined;
    const result = this._taskProcessor.destroy?.();
    if (result === false) {
      return false;
    }
    this._settlements.length = 0;
    this._inFlight = undefined;
    this._confirmed.clear();
    this._statistics.confirmedPositionBytes = 0;
    this._statistics.scratchBytes = 0;
    this._statistics.corePreparationLiveBytes = 0;
    this._destroyed = true;
    return true;
  }
}

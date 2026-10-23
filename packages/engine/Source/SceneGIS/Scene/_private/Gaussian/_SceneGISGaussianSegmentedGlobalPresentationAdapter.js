/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import DeveloperError from "../../../../Core/DeveloperError.js";
import {
  consumeGaussianSegmentedGlobalOrderingValidation,
  estimateGaussianSegmentedGlobalSortWorkingSetBytes,
} from "./_SceneGISGaussianSegmentedGlobalSorter.js";
import { CORE_PREPARATION_WINDOW_BYTES } from "./_SceneGISGaussianSegmentedCorePreparation.js";
import { isGaussianSegmentedResourceAdapter } from "./_SceneGISGaussianSegmentedResourceAdapter.js";

import { computeSegmentedAtlasPageFootprint } from "../../../Core/_private/Gaussian/_SceneGISGaussianSegmentedAssetPageOwnership.js";
const ticketStates = new WeakMap();
const ownerStates = new WeakMap();
const authorityStates = new WeakMap();

const RESOURCE_DESCRIPTOR_FIELDS = [
  "coreLogicalSplats",
  "coreCapacitySplats",
  "coreLogicalBytes",
  "coreBytes",
  "coreLayerCount",
  "coreTextureHeight",
  "shLogicalSplats",
  "shCapacitySplats",
  "shLogicalBytes",
  "shBytes",
  "shLayerCount",
  "shTextureHeight",
  "mappingLogicalRows",
  "mappingCapacityRows",
  "mappingBytes",
  "cropLogicalSlots",
  "cropCapacitySlots",
  "cropBytes",
  "orderingLogicalSplats",
  "orderingPaddedElements",
  "orderingBytes",
  "coreCanonicalizationScratchBytes",
  "cpuPlanBytes",
  "cpuStagingBytes",
  "gpuPresentationBytes",
  "currentWorkCpuPeakBytes",
  "currentWorkGpuPeakBytes",
];

const COMPOSITION_ARRAY_FIELDS = [
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
];

function descriptorIdentity(descriptor) {
  return JSON.stringify(
    RESOURCE_DESCRIPTOR_FIELDS.map((key) => [key, descriptor[key]]),
  );
}

function sameDescriptor(left, right) {
  return descriptorIdentity(left) === descriptorIdentity(right);
}

function sameArray(left, right) {
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

function sameComposition(left, right) {
  if (left === right) {
    return true;
  }
  if (
    left?.artifactIdentityHex === right?.artifactIdentityHex &&
    left?.slotCount === right?.slotCount &&
    left?.assetSliceCount === right?.assetSliceCount &&
    left?.fragmentCount === right?.fragmentCount &&
    left?.selectedSplatCount === right?.selectedSplatCount
  ) {
    return COMPOSITION_ARRAY_FIELDS.every((name) =>
      sameArray(left[name], right[name]),
    );
  }
  return false;
}

function readPageFrame(index, descriptor, assetScratch, originScratch) {
  if (
    !index ||
    typeof index.readAsset !== "function" ||
    typeof index.readRepresentationOrigin !== "function"
  ) {
    throw new DeveloperError("Segmented global Page frame index is invalid");
  }
  index.readAsset(descriptor.assetId, assetScratch);
  const representationId = assetScratch[0];
  index.readRepresentationOrigin(representationId, originScratch);
  if (
    !Number.isSafeInteger(representationId) ||
    representationId < 0 ||
    !originScratch.every(Number.isFinite)
  ) {
    throw new DeveloperError("Segmented global Page frame is invalid");
  }
  return {
    representationId,
    positionOriginX: originScratch[0],
    positionOriginY: originScratch[1],
    positionOriginZ: originScratch[2],
  };
}

function makePageIdentity(index, artifactIdentity, source, scratch) {
  const descriptor = source?.descriptor;
  const pageSplatCount = descriptor?.splatCount;
  if (
    !Number.isSafeInteger(pageSplatCount) ||
    pageSplatCount < 1 ||
    descriptor.artifactIdentity !== artifactIdentity ||
    descriptor.semantic !== 1 ||
    descriptor.rawBytes !== pageSplatCount * 32
  ) {
    throw new DeveloperError("Segmented global Core Page identity is invalid");
  }
  const frame = readPageFrame(index, descriptor, scratch.asset, scratch.origin);
  return Object.freeze({
    artifactIdentity,
    pageIndex: descriptor.index,
    checksum: descriptor.checksum,
    assetId: descriptor.assetId,
    assetLocalStart: descriptor.assetLocalStart,
    kind: descriptor.kind,
    semantic: descriptor.semantic,
    layoutId: descriptor.layoutId,
    packId: descriptor.packId,
    offset: descriptor.offset,
    storedBytes: descriptor.storedBytes,
    rawBytes: descriptor.rawBytes,
    pageSplatCount,
    expectedCoreBytes: descriptor.rawBytes,
    positionBytes: pageSplatCount * 12,
    ...frame,
  });
}

function sameResolvedPage(authority, source) {
  const descriptor = source?.descriptor;
  const expected = authority?.descriptor;
  return (
    authority?.source === source &&
    authority.payload === source?.payload &&
    [
      "artifactIdentity",
      "index",
      "assetId",
      "assetLocalStart",
      "splatCount",
      "kind",
      "semantic",
      "layoutId",
      "packId",
      "offset",
      "storedBytes",
      "rawBytes",
      "checksum",
    ].every((name) => descriptor?.[name] === expected?.[name]) &&
    source.payload.byteLength === expected.rawBytes
  );
}

class SegmentedGlobalPresentationTicket {
  constructor(state) {
    this.kind = state.kind;
    this.selectedSplatCount = state.composition.selectedSplatCount;
    this.slotCount = state.composition.slotCount;
    this.cpuBytes = state.descriptor.cpuStagingBytes;
    this.gpuBytes = state.descriptor.gpuPresentationBytes;
    this.descriptorIdentity = state.descriptorIdentity;
    ticketStates.set(this, state);
    Object.freeze(this);
  }
  get progress() {
    const state = ticketStates.get(this);
    return Object.freeze({
      state: state.phase,
      copiedSplats: state.resourceTicket?.copiedSplats ?? 0,
      uploadedResources: state.resourceTicket?.uploadedResources ?? 0,
      ready: state.phase === "READY",
    });
  }
}

class SegmentedGlobalPresentationOwner {
  constructor(state) {
    this.resourceOwnerIdentity = state.resourceOwnerIdentity;
    ownerStates.set(this, state);
    Object.freeze(this);
  }
  get command() {
    return ownerStates.get(this).command;
  }
  get resources() {
    return ownerStates.get(this).drawResources;
  }
  get presentation() {
    return ownerStates.get(this).d1Presentation;
  }
}

/** D2 presentation capability and private D1/D3 bridge. @private */
export default class _SceneGISGaussianSegmentedGlobalPresentationAdapter {
  constructor(options = {}) {
    if (
      !options.index ||
      !options.d1 ||
      !options.resources ||
      !options.sorter ||
      !options.renderResources ||
      typeof options.resolvePage !== "function"
    ) {
      throw new DeveloperError(
        "Segmented global presentation adapter options are invalid",
      );
    }
    this._index = options.index;
    this._d1 = options.d1;
    this._resources = options.resources;
    this._sorter = options.sorter;
    if (
      options.retainedCorePageIds !== undefined &&
      (typeof options.retainedCorePageIds !== "function" ||
        typeof options.corePagePositionBytes !== "function")
    ) {
      throw new DeveloperError(
        "Segmented history retention callbacks are invalid",
      );
    }
    this._retainedCorePageIds = options.retainedCorePageIds;
    this._corePagePositionBytes = options.corePagePositionBytes;
    this._renderResources = options.renderResources;
    this._resolvePage = options.resolvePage;
    this._platformLimits = options.platformLimits ?? {};
    this._boundingVolume = options.boundingVolume;
    this._createBoundingVolume = options.createBoundingVolume;
    this._consumeOrderingValidation =
      options.consumeOrderingValidation ??
      consumeGaussianSegmentedGlobalOrderingValidation;
    this._serial = 0;
    this._current = undefined;
    this._resourceAdapter = options.resourceAdapter;
    this._pageBackend = options.pageBackend;
    this._destroyed = false;
    this._statistics = {
      contentPublicationCount: 0,
      shPublicationCount: 0,
      orderingOnlyPublicationCount: 0,
      staleSortDiscardCount: 0,
      cleanupDebtBytes: 0,
      maintenanceFailureCount: 0,
      maintenanceRetryCount: 0,
      preparationOverlapMilliseconds: 0,
    };
    this._orderingWork = undefined;
    this._activeSorterOwner = undefined;
    this._pendingContentOwner = undefined;
    this._pendingCorePreparationOwner = undefined;
    this._pendingCurrentOrderingOwner = undefined;
    this._pendingPruneAuthority = undefined;
    this._orderingCleanupDebt = undefined;
    this._destroyState = undefined;
  }

  attachResourceAdapter(adapter) {
    if (this._resourceAdapter || !adapter) {
      throw new DeveloperError(
        "Segmented global D2 adapter attachment is invalid",
      );
    }
    this._resourceAdapter = adapter;
  }

  _limitsForCurrent(owner) {
    const state = ownerStates.get(owner);
    if (!state) {
      return this._platformLimits;
    }
    return {
      ...this._platformLimits,
      currentCpuPresentationBytes: state.descriptor.cpuStagingBytes,
      currentGpuPresentationBytes: state.descriptor.gpuPresentationBytes,
      currentContentGeneration: state.d1Presentation.contentGeneration,
      currentMappingGeneration: state.d1Presentation.mappingGeneration,
      currentOrderingGeneration: state.d1Presentation.orderingGeneration,
    };
  }

  _checkCheckpointCoreContent(content) {
    if (
      content !== undefined &&
      (content !== this._liveCoreContent || content.corePreparationCancelled)
    ) {
      throw new DeveloperError("Segmented checkpoint Core owner is stale");
    }
  }

  prepare(request) {
    if (this._destroyed || request?.physicalSnapshot === undefined) {
      throw new DeveloperError(
        "Segmented global presentation request is invalid",
      );
    }
    const input = request.input ?? {};
    if (
      Object.prototype.hasOwnProperty.call(input, "composition") ||
      Object.prototype.hasOwnProperty.call(input, "layout")
    ) {
      throw new DeveloperError(
        "Segmented global raw composition/layout override is forbidden",
      );
    }
    const isSh = input.kind === "SH_REFRESH";
    const checkpointCoreContent = input.checkpointCoreContent;
    this._checkCheckpointCoreContent(checkpointCoreContent);
    if (isSh && checkpointCoreContent !== undefined) {
      throw new DeveloperError("Segmented SH refresh cannot be a checkpoint");
    }
    const kind = isSh
      ? "SH_REFRESH"
      : request.kind === "BOOTSTRAP"
        ? "CONTENT_BOOTSTRAP"
        : "CONTENT_TRANSITION";
    let composition;
    if (isSh) {
      const currentState = ownerStates.get(request.current);
      if (
        !currentState ||
        (input.targetOwnershipIdentity !== undefined &&
          request.targetOwnershipIdentity !== input.targetOwnershipIdentity)
      ) {
        throw new DeveloperError(
          "Segmented global SH refresh current is invalid",
        );
      }
      composition = currentState.composition;
    } else {
      composition = this._d1.compose(this._index, input.targetCut, {
        cropHaloMeters: this._platformLimits.cropHaloMeters ?? 0,
      });
    }
    let layout = this._d1.derive(
      this._index,
      composition,
      request.physicalSnapshot,
      this._platformLimits,
    );
    const currentState = ownerStates.get(request.current);
    if (currentState) {
      const currentWorkCpuPeakBytes =
        currentState.descriptor.cpuStagingBytes +
        layout.descriptor.cpuStagingBytes;
      const currentWorkGpuPeakBytes =
        currentState.descriptor.gpuPresentationBytes +
        layout.descriptor.gpuPresentationBytes;
      if (
        !Number.isSafeInteger(currentWorkCpuPeakBytes) ||
        !Number.isSafeInteger(currentWorkGpuPeakBytes) ||
        currentWorkCpuPeakBytes > this._platformLimits.maximumCpuBytes ||
        currentWorkGpuPeakBytes > this._platformLimits.maximumGpuBytes
      ) {
        throw new DeveloperError(
          "Segmented global prospective presentation exceeds platform budget",
        );
      }
      layout = Object.freeze({
        descriptor: Object.freeze({
          ...layout.descriptor,
          currentWorkCpuPeakBytes,
          currentWorkGpuPeakBytes,
        }),
        fragmentShDenseStarts: layout.fragmentShDenseStarts,
      });
    }
    const descriptor = layout.descriptor;
    const state = {
      adapter: this,
      kind,
      phase: "PURE",
      request,
      input,
      checkpointCoreContent,
      composition,
      layout,
      descriptor,
      descriptorIdentity: descriptorIdentity(descriptor),
      physicalSnapshot: request.physicalSnapshot,
      targetOwnershipIdentity: request.targetOwnershipIdentity,
      fragmentShDenseStarts: layout.fragmentShDenseStarts,
      serial: ++this._serial,
    };
    return new SegmentedGlobalPresentationTicket(state);
  }

  describe(ticket, physicalSnapshot) {
    const state = ticketStates.get(ticket);
    if (
      !state ||
      state.adapter !== this ||
      state.physicalSnapshot !== physicalSnapshot ||
      state.phase !== "PURE"
    ) {
      throw new DeveloperError(
        "Segmented global described ticket is stale or foreign",
      );
    }
    return Object.freeze({
      cpuBytes: state.descriptor.cpuStagingBytes,
      gpuBytes: state.descriptor.gpuPresentationBytes,
      selectedSplatCount: state.composition.selectedSplatCount,
      slotCount: state.composition.slotCount,
      descriptorIdentity: state.descriptorIdentity,
    });
  }

  beginCorePreparation(content) {
    if (this._liveCoreContent && this._liveCoreContent !== content) {
      throw new DeveloperError("Segmented Core content owner conflicts");
    }
    if (this._liveCoreContent === content) {
      return;
    }
    this._liveCoreContent = content;
    for (const pageId of content.coreIds) {
      if (content.boundIds.has(pageId) && this.hasPreparedCore(pageId)) {
        this._sorter._statistics.corePreparationReusePageCount++;
      }
    }
  }

  coreIdentity(pageId) {
    return makePageIdentity(
      this._index,
      this._index.artifactIdentityHex,
      this._resolvePage(pageId),
      { asset: new Float64Array(8), origin: new Float64Array(3) },
    );
  }

  hasPreparedCore(pageId) {
    const identity = this.coreIdentity(pageId);
    const confirmed = this._sorter._confirmed.get(pageId);
    return (
      confirmed &&
      Object.keys(identity).every((key) => identity[key] === confirmed[key])
    );
  }

  queueCorePreparation(content, pageIds) {
    this.beginCorePreparation(content);
    if (content.preparationOwner || this._pendingCorePreparationOwner) {
      throw new DeveloperError("Segmented Core window is still owned");
    }
    const pages = pageIds
      .map((pageId) => {
        const identity = this.coreIdentity(pageId);
        return Object.freeze({
          ...identity,
          uploadBytes: computeSegmentedAtlasPageFootprint(
            identity.pageSplatCount,
            1,
            0,
          ).uploadBytes,
        });
      })
      .sort((a, b) => a.pageIndex - b.pageIndex);
    const state = {
      schedulerKind: "PREPARE_CORE",
      schedulerIdentity: content.work,
      content,
      pages,
      serial: ++this._serial,
      sortPageAuthorities: new Map(
        pages.map((page) => {
          const source = this._resolvePage(page.pageIndex);
          return [
            page.pageIndex,
            {
              source,
              payload: source.payload,
              descriptor: Object.freeze({ ...source.descriptor }),
            },
          ];
        }),
      ),
    };
    content.preparationOwner = state;
    this._pendingCorePreparationOwner = state;
    this._admitNextSorterOwner();
  }

  releaseCorePreparation(content) {
    const state = content.preparationOwner;
    if (!state) {
      return;
    }
    this._sorter.releasePreparation(state.sortIntent);
    state.sortResult = undefined;
    state.sortPageAuthorities.clear();
    content.preparationOwner = undefined;
  }

  _queueLifecyclePrune() {
    this._pendingPruneAuthority = {
      schedulerKind: "PRUNE",
      artifactIdentity: this._index.artifactIdentityHex,
      attempts: 0,
      failures: 0,
    };
  }

  _retainedPreparedPages(nextOwner) {
    const current = ownerStates.get(this._current)?.composition;
    const live = this._liveCoreContent;
    const ids = new Set(current?.fragmentCorePageIds ?? []);
    for (const pageId of live?.coreIds ?? []) {
      ids.add(pageId);
    }
    if (this._retainedCorePageIds) {
      for (const pageId of nextOwner?.composition?.fragmentCorePageIds ?? []) {
        ids.add(pageId);
      }
      for (const page of nextOwner?.pages ?? []) {
        ids.add(page.pageIndex);
      }
      let mandatoryPositionBytes = 0;
      for (const pageId of ids) {
        const bytes = this._corePagePositionBytes(pageId);
        mandatoryPositionBytes += bytes;
        if (
          !Number.isSafeInteger(bytes) ||
          bytes <= 0 ||
          !Number.isSafeInteger(mandatoryPositionBytes)
        ) {
          throw new DeveloperError("Segmented position reservation is invalid");
        }
      }
      const selectedSplatCount = Math.max(
        1,
        current?.selectedSplatCount ?? 0,
        (live?.targetCut ?? live?.cut)?.selectedSplatCount ?? 0,
        nextOwner?.composition?.selectedSplatCount ?? 0,
        (nextOwner?.content?.targetCut ?? nextOwner?.content?.cut)
          ?.selectedSplatCount ?? 0,
      );
      // Reserve all target positions before they are prepared. History must
      // leave room for the next full Core window and scratch growth as well.
      const estimate = estimateGaussianSegmentedGlobalSortWorkingSetBytes({
        selectedSplatCount,
        confirmedPositionBytes: mandatoryPositionBytes,
        retainedPositionBytes: mandatoryPositionBytes,
        preparationBytes: Math.max(
          CORE_PREPARATION_WINDOW_BYTES,
          this._sorter.snapshot.corePreparationLiveBytes ?? 0,
        ),
        scratchResidentBytes: this._sorter.snapshot.scratchBytes,
      });
      let remaining = this._sorter.maximumWorkingSetBytes - estimate.totalBytes;
      const history = this._retainedCorePageIds();
      for (let index = history.length - 1; index >= 0; index--) {
        const pageId = history[index];
        const page = this._sorter._confirmed.get(pageId);
        if (!ids.has(pageId) && page && page.positionBytes <= remaining) {
          ids.add(pageId);
          remaining -= page.positionBytes;
        }
      }
    }
    return [...this._sorter._confirmed.values()]
      .filter((page) => ids.has(page.pageIndex))
      .sort((a, b) => a.pageIndex - b.pageIndex);
  }

  abortCorePreparation(content) {
    if (!content.corePreparationCancelled) {
      content.corePreparationCancelled = true;
      if (this._liveCoreContent === content) {
        this._liveCoreContent = undefined;
      }
      const state = content.preparationOwner;
      if (state) {
        state.cancelled = true;
        this._sorter.cancel(state.sortIntent);
        if (this._pendingCorePreparationOwner === state) {
          this._pendingCorePreparationOwner = undefined;
        }
        if (
          !state.sortIntent ||
          this._sorter._inFlight?.intent !== state.sortIntent
        ) {
          if (this._activeSorterOwner === state) {
            this._activeSorterOwner = undefined;
          }
          this.releaseCorePreparation(content);
        }
      }
      this._queueLifecyclePrune();
    }
    this._pumpSorter();
    if (content.preparationOwner) {
      if (
        content.preparationOwner.sortIntent &&
        this._sorter._inFlight?.intent === content.preparationOwner.sortIntent
      ) {
        return false;
      }
      this.releaseCorePreparation(content);
    }
    return (
      !this._pendingPruneAuthority &&
      this._activeSorterOwner?.schedulerKind !== "PRUNE"
    );
  }

  _sortIntent(state) {
    const retainedIds = new Set(state.composition.fragmentCorePageIds);
    if (state.kind?.startsWith("CONTENT") && this._current) {
      const currentComposition = ownerStates.get(this._current).composition;
      for (const pageId of currentComposition.fragmentCorePageIds) {
        retainedIds.add(pageId);
      }
    }
    const pageIds = [...retainedIds].sort((a, b) => a - b);
    const frameScratch = {
      asset: new Float64Array(8),
      origin: new Float64Array(3),
    };
    state.sortPageAuthorities = new Map();
    const retainedPages = pageIds.map((pageId) => {
      const source = this._resolvePage(pageId, state.physicalSnapshot);
      const installed = state.installedPageAuthorities?.get(pageId);
      if (installed && !sameResolvedPage(installed, source)) {
        throw new DeveloperError(
          "Segmented global installed Page authority changed",
        );
      }
      state.sortPageAuthorities.set(
        pageId,
        installed ?? {
          source,
          payload: source.payload,
          descriptor: Object.freeze({ ...source.descriptor }),
        },
      );
      return makePageIdentity(
        this._index,
        this._index.artifactIdentityHex,
        source,
        frameScratch,
      );
    });
    return {
      artifactIdentity: this._index.artifactIdentityHex,
      ownerIdentity: state.schedulerIdentity,
      contentIdentity: `segmented-content:${state.serial}`,
      contentGeneration: state.input.contentGeneration ?? state.serial,
      mappingGeneration: state.input.mappingGeneration ?? state.serial,
      viewGeneration: state.input.viewGeneration ?? 1,
      requestSerial: state.serial,
      dispatchAttemptIdentity: `segmented-dispatch:${state.serial}`,
      selectedSplatCount: state.composition.selectedSplatCount,
      sortCenter: [...(state.input.sortCenter ?? [0, 0, 0])],
      fragmentCorePageIds: state.composition.fragmentCorePageIds,
      fragmentPageLocalStarts: state.composition.fragmentPageLocalStarts,
      fragmentCounts: state.composition.fragmentCounts,
      fragmentPresentationStarts: state.composition.fragmentPresentationStarts,
      retainedPages,
      ...((this._retainedCorePageIds || this._liveCoreContent) && {
        retainConfirmedPages: true,
      }),
    };
  }

  _orderingUploadBinding(state, result) {
    return Object.freeze({
      adapterTicketSerial: state.serial,
      sortIntent: state.sortIntent,
      sortRequestSerial: state.sortIntent.requestSerial,
      viewGeneration: state.sortIntent.viewGeneration,
      ordering: result.ordering,
      contentGeneration: state.sortIntent.contentGeneration,
      mappingGeneration: state.sortIntent.mappingGeneration,
    });
  }

  _validatedOrderingUploadBinding(state, result) {
    const expected = this._orderingUploadBinding(state, result);
    const binding = state.orderingUploadBinding;
    if (binding) {
      if (Object.keys(expected).some((key) => binding[key] !== expected[key])) {
        throw new DeveloperError(
          "Segmented global Ordering upload proof changed",
        );
      }
      return binding;
    }
    // Sorter validation is consumed once. This exact immutable binding owns
    // subsequent upload slices until installation, cancellation, or view reset.
    if (
      this._consumeOrderingValidation(
        result.ordering,
        state.sortIntent,
        result,
      ) !== result
    ) {
      throw new DeveloperError("Segmented global Ordering proof is invalid");
    }
    return expected;
  }

  _enqueueSortOwner(state, kind) {
    state.schedulerKind = kind;
    state.schedulerIdentity ??= Object.freeze({ adapter: this, state });
    state.sortResult = undefined;
    state.sortError = undefined;
    if (kind === "CONTENT") {
      if (this._pendingContentOwner && this._pendingContentOwner !== state) {
        throw new DeveloperError(
          "Segmented global content sort is already pending",
        );
      }
      this._pendingContentOwner = state;
    } else {
      const previous = this._pendingCurrentOrderingOwner;
      if (previous && previous !== state) {
        previous.cancelled = true;
      }
      this._pendingCurrentOrderingOwner = state;
    }
    this._admitNextSorterOwner();
  }

  _admitNextSorterOwner() {
    if (this._activeSorterOwner) {
      return false;
    }
    // A checkpoint can sort while the final acquisition keeps its one Core
    // window queued. Only the selected owner may use the single Worker.
    const state =
      this._pendingCurrentOrderingOwner ??
      this._pendingContentOwner ??
      this._pendingCorePreparationOwner;
    if (state) {
      try {
        if (this._retainedCorePageIds) {
          const retained = this._retainedPreparedPages(state);
          if (retained.length < this._sorter._confirmed.size) {
            if (!this._pendingPruneAuthority) {
              this._queueLifecyclePrune();
            }
            return this._admitPrune(retained);
          }
        }
        if (this._pendingCurrentOrderingOwner === state) {
          this._pendingCurrentOrderingOwner = undefined;
        } else if (this._pendingContentOwner === state) {
          this._pendingContentOwner = undefined;
        } else {
          this._pendingCorePreparationOwner = undefined;
        }
        state.sortIntent =
          state.schedulerKind === "PREPARE_CORE"
            ? this._sorter.requestPreparation({
                artifactIdentity: this._index.artifactIdentityHex,
                contentIdentity: state.content.work.loaderOwnerIdentity,
                ownerIdentity: state.schedulerIdentity,
                requestSerial: state.serial,
                selectedSplatCount: (
                  state.content.targetCut ?? state.content.cut
                ).selectedSplatCount,
                pages: state.pages,
                rebuildPageCount: state.pages.filter(
                  (page) =>
                    this._sorter._confirmed.has(page.pageIndex) ||
                    this._pageBackend?.retainedBindingReceipt(
                      state.sortPageAuthorities.get(page.pageIndex).descriptor,
                    ),
                ).length,
              })
            : this._sorter.request(this._sortIntent(state));
        this._activeSorterOwner = state;
        return true;
      } catch (error) {
        if (this._pendingCurrentOrderingOwner === state) {
          this._pendingCurrentOrderingOwner = undefined;
        }
        if (this._pendingContentOwner === state) {
          this._pendingContentOwner = undefined;
        }
        if (this._pendingCorePreparationOwner === state) {
          this._pendingCorePreparationOwner = undefined;
        }
        state.sortError = error;
        return false;
      }
    }
    return this._admitPrune();
  }

  _admitPrune(retainedPages) {
    const prune = this._pendingPruneAuthority;
    if (!prune) {
      return false;
    }
    try {
      prune.attempts++;
      if (prune.attempts > 1) {
        this._statistics.maintenanceRetryCount++;
      }
      prune.sortIntent = this._sorter.requestPrune(
        prune.artifactIdentity,
        retainedPages ?? this._retainedPreparedPages(),
      );
      this._activeSorterOwner = prune;
      return true;
    } catch (_error) {
      prune.failures++;
      this._statistics.maintenanceFailureCount++;
      return false;
    }
  }

  advance(ticket, limits = {}) {
    // Mapping, Crop and Ordering share the caller's frame-local allowance,
    // including a transition from BUILDING to SORTING in this call.
    limits = {
      ...limits,
      textureUploadBudget: limits.textureUploadBudget ?? {
        remainingBytes: Number.MAX_SAFE_INTEGER,
        remainingUploads: limits.maximumTextureUploads ?? 0,
      },
    };
    const state = ticketStates.get(ticket);
    if (
      !state ||
      state.adapter !== this ||
      ["ABORTED", "COMMITTED"].includes(state.phase)
    ) {
      throw new DeveloperError("Segmented global presentation ticket is stale");
    }
    this._checkCheckpointCoreContent(state.checkpointCoreContent);
    if (state.phase === "PURE") {
      state.resourceTicket = this._resources.prepare({
        artifactIdentity: this._index.artifactIdentityHex,
        contentIdentity: `segmented-content:${state.serial}`,
        contentGeneration: state.input.contentGeneration ?? state.serial,
        mappingGeneration: state.input.mappingGeneration ?? state.serial,
        composition: state.composition,
        descriptor: state.descriptor,
        fragmentShDenseStarts: state.fragmentShDenseStarts,
        physicalSnapshot: state.physicalSnapshot,
        maxShDegree: this._index.maxShDegree,
        maximumTextureSize: this._platformLimits.maximumTextureSize,
        resolvePage: (pageId) =>
          this._resolvePage(pageId, state.physicalSnapshot),
      });
      state.phase = "BUILDING";
      state.preparationStartedAt = performance.now();
      this._enqueueSortOwner(state, "CONTENT");
    }
    if (state.phase === "BUILDING") {
      const progress = this._resources.advance(state.resourceTicket, limits);
      this._pumpSorter(limits);
      if (progress.state === "CONTENT_READY") {
        state.mappingReadyAt = performance.now();
        state.phase = "SORTING";
      }
    }
    if (state.phase === "SORTING") {
      this._pumpSorter(limits);
      if (state.sortResult) {
        if (!state.preparationOverlapRecorded) {
          this._statistics.preparationOverlapMilliseconds += Math.max(
            0,
            Math.min(state.mappingReadyAt, state.sortReadyAt) -
              state.preparationStartedAt,
          );
          state.preparationOverlapRecorded = true;
        }
        const result = state.sortResult;
        const intent = state.sortIntent;
        const currentState = ownerStates.get(this._current);
        const currentView = currentState?.viewGeneration ?? 0;
        if (currentView > intent.viewGeneration) {
          this._statistics.staleSortDiscardCount++;
          this.refreshContentView(ticket, {
            viewGeneration: currentView,
            sortCenter: currentState.sortCenter,
          });
          return Object.freeze({
            state: state.phase,
            ready: false,
            copiedSplats: state.resourceTicket.copiedSplats,
            uploadedResources: state.resourceTicket.uploadedResources,
          });
        }
        state.orderingUploadBinding = this._validatedOrderingUploadBinding(
          state,
          result,
        );
        state.orderingUpload ??= this._resources.prepareOrderingUpload(
          state.descriptor,
          result.ordering,
          state.orderingUploadBinding,
        );
        const uploadProgress = this._resources.advanceOrderingUpload(
          state.orderingUpload,
          limits.maximumTextureUploads ?? 0,
          state.orderingUploadBinding,
          result.ordering,
          limits.textureUploadBudget,
        );
        if (!uploadProgress.ready) {
          return Object.freeze({
            state: state.phase,
            ready: false,
            copiedSplats: state.resourceTicket.copiedSplats,
            uploadedResources: state.resourceTicket.uploadedResources,
          });
        }
        this._resources.installPreparedOrdering(
          state.resourceTicket,
          state.orderingUpload,
          state.orderingUploadBinding,
          result.ordering,
        );
        state.orderingUpload = undefined;
        state.orderingUploadBinding = undefined;
        state.resourceReceipt = Object.freeze({
          ticket,
        });
        state.phase = "READY";
      }
      if (state.sortError) {
        throw state.sortError;
      }
    }
    return Object.freeze({
      state: state.phase,
      ready: state.phase === "READY",
      receipt: state.phase === "READY" ? state.resourceReceipt : undefined,
      copiedSplats: state.resourceTicket?.copiedSplats ?? 0,
      uploadedResources: state.resourceTicket?.uploadedResources ?? 0,
    });
  }

  _pumpSorter(limits = {}) {
    this._admitNextSorterOwner();
    this._sorter.update((identity) => {
      const selectedOwner = this._activeSorterOwner;
      const source = this._resolvePage(
        identity.pageIndex,
        selectedOwner?.physicalSnapshot,
      );
      const authority = selectedOwner?.sortPageAuthorities?.get(
        identity.pageIndex,
      );
      if (!sameResolvedPage(authority, source)) {
        throw new DeveloperError(
          "Segmented global sort Page authority changed",
        );
      }
      return source.payload;
    }, limits.maximumPositionExtractions ?? Number.MAX_SAFE_INTEGER);
    this.collectWorkerSettlements();
    this._admitNextSorterOwner();
  }

  collectWorkerSettlements() {
    for (const settlement of this._sorter.takeSettlements()) {
      const owner = this._activeSorterOwner;
      if (!owner || owner.sortIntent !== settlement.intent) {
        this._statistics.staleSortDiscardCount++;
        continue;
      }
      this._activeSorterOwner = undefined;
      if (owner.schedulerKind === "PRUNE") {
        if (settlement.error) {
          owner.failures++;
          this._statistics.maintenanceFailureCount++;
        } else if (this._pendingPruneAuthority === owner) {
          this._pendingPruneAuthority = undefined;
        }
        continue;
      }
      if (owner.schedulerKind === "PREPARE_CORE" && owner.cancelled) {
        this.releaseCorePreparation(owner.content);
        this._queueLifecyclePrune();
      } else if (settlement.error) {
        owner.sortError = settlement.error;
      } else if (settlement.result?.operation !== "PRUNE") {
        owner.sortResult = settlement.result;
        owner.sortReadyAt = performance.now();
      }
    }
  }

  update(limits = {}) {
    if (this._destroyed) {
      throw new DeveloperError("Segmented global presentation is destroyed");
    }
    this._pumpSorter(limits);
    return Object.freeze({
      activeSorterOwnerCount: this._activeSorterOwner ? 1 : 0,
      pendingContentSortCount: this._pendingContentOwner ? 1 : 0,
      pendingCorePreparationCount: this._pendingCorePreparationOwner ? 1 : 0,
      pendingCurrentOrderingSortCount: this._pendingCurrentOrderingOwner
        ? 1
        : 0,
      pendingPruneMaintenanceCount: this._pendingPruneAuthority ? 1 : 0,
      maintenanceFailureCount: this._statistics.maintenanceFailureCount,
    });
  }

  preflight(ticket, publicationReceipt, physicalSnapshot) {
    const state = ticketStates.get(ticket);
    if (
      !state ||
      state.adapter !== this ||
      state.phase !== "READY" ||
      state.resourceReceipt !== publicationReceipt ||
      state.physicalSnapshot !== physicalSnapshot
    ) {
      throw new DeveloperError("Segmented global preflight binding is invalid");
    }
    this._checkCheckpointCoreContent(state.checkpointCoreContent);
    if (state.authority) {
      return state.authority;
    }
    if (this._orderingWork) {
      throw new DeveloperError(
        "Segmented global Ordering refresh blocks content preflight",
      );
    }
    const currentState = ownerStates.get(this._current);
    const latestView = currentState?.viewGeneration ?? 0;
    if (latestView > state.sortIntent.viewGeneration) {
      this._resources.resetOrdering(state.resourceTicket);
      state.resourceReceipt = undefined;
      state.phase = "SORTING";
      state.input.viewGeneration = latestView;
      state.input.sortCenter = [...currentState.sortCenter];
      state.sortResult = undefined;
      this._enqueueSortOwner(state, "CONTENT");
      throw new DeveloperError(
        "Segmented global content Ordering was resubmitted for latest view",
      );
    }
    const currentD1 = ownerStates.get(this._current)?.d1Presentation ?? null;
    const publicationLimits = this._limitsForCurrent(this._current);
    let plan;
    try {
      plan =
        state.kind === "SH_REFRESH"
          ? this._d1.createShPlan(
              this._index,
              currentD1,
              physicalSnapshot,
              publicationLimits,
            )
          : this._d1.createContentPlan(
              this._index,
              state.input.preparedPagePublication,
              currentD1,
              physicalSnapshot,
              publicationLimits,
            );
      state.plan = plan;
      const prepared = state.input.preparedPagePublication;
      const expectedCut =
        state.kind === "SH_REFRESH" ? currentD1.cut : prepared?.targetCut;
      const expectedOwnership =
        state.kind === "SH_REFRESH"
          ? currentD1.ownership
          : prepared?.targetOwnership;
      const proof = {
        targetCut: expectedCut,
        targetOwnership: expectedOwnership,
        composition: state.composition,
        descriptor: state.descriptor,
        fragmentShDenseStarts: state.fragmentShDenseStarts,
        physicalSnapshot,
        contentGeneration: plan.expectedContentGeneration,
        mappingGeneration: plan.expectedMappingGeneration,
        orderingGeneration: plan.expectedOrderingGeneration,
      };
      const canonicalBound =
        typeof this._d1.validatePlanBinding === "function"
          ? this._d1.validatePlanBinding(plan, proof)
          : sameDescriptor(plan.descriptor, state.descriptor) &&
            sameComposition(plan.composition, state.composition) &&
            sameArray(plan.fragmentShDenseStarts, state.fragmentShDenseStarts);
      if (
        !canonicalBound ||
        plan.targetCut !== expectedCut ||
        plan.targetOwnership !== expectedOwnership ||
        (state.kind !== "SH_REFRESH" &&
          plan.targetCut !== state.input.targetCut) ||
        state.targetOwnershipIdentity !==
          state.request.targetOwnershipIdentity ||
        state.physicalSnapshot !== physicalSnapshot ||
        state.sortIntent.contentGeneration !== plan.expectedContentGeneration ||
        state.sortIntent.mappingGeneration !== plan.expectedMappingGeneration ||
        state.sortIntent.viewGeneration !== (state.input.viewGeneration ?? 1) ||
        state.sortIntent.requestSerial !== state.serial ||
        state.sortIntent.ownerIdentity !== state.schedulerIdentity
      ) {
        throw new DeveloperError("Segmented global late D1 authority changed");
      }
    } catch (error) {
      if (state.plan) {
        if (state.kind === "SH_REFRESH") {
          this._d1.abortRefresh(this._index, state.plan);
        } else {
          this._d1.abortContent(this._index, state.plan);
        }
        state.plan = undefined;
      }
      throw error;
    }
    const resourceOwnerIdentity = `segmented-global-owner:${state.serial}`;
    const external = {
      resourceOwnerIdentity,
      contentGeneration: plan.expectedContentGeneration,
      mappingGeneration: plan.expectedMappingGeneration,
      orderingGeneration: plan.expectedOrderingGeneration,
      selectedSplatCount: state.composition.selectedSplatCount,
      slotCount: state.composition.slotCount,
      coreLogicalBytes: state.descriptor.coreLogicalBytes,
      coreAllocatedBytes: state.descriptor.coreBytes,
      shLogicalBytes: state.descriptor.shLogicalBytes,
      shAllocatedBytes: state.descriptor.shBytes,
      mappingBytes: state.descriptor.mappingBytes,
      cropBytes: state.descriptor.cropBytes,
      orderingBytes: state.descriptor.orderingBytes,
      gpuPageBindingGeneration: physicalSnapshot.gpuGeneration,
    };
    try {
      state.d1Receipt = this._d1.createReceipt(plan, external);
      state.resourceOwner = this._resources.createOwner(state.resourceTicket, {
        resourceOwnerIdentity,
      });
      const boundingVolume =
        this._createBoundingVolume?.(state.composition) ?? this._boundingVolume;
      state.command = this._renderResources.createCommand(
        state.resourceOwner,
        boundingVolume,
      );
      const targetPageIds = new Set(state.composition.fragmentCorePageIds);
      state.pruneAuthority = {
        schedulerKind: "PRUNE",
        artifactIdentity: this._index.artifactIdentityHex,
        retainedPages: Object.freeze(
          state.sortIntent.retainedPages.filter((page) =>
            targetPageIds.has(page.pageIndex),
          ),
        ),
        attempts: 0,
        failures: 0,
      };
    } catch (error) {
      try {
        this._cleanupContentState(state, "preflight-failure");
      } catch (cleanupError) {
        state.cleanupError = cleanupError;
      }
      throw error;
    }
    const ownerState = {
      adapter: this,
      resourceOwnerIdentity: external.resourceOwnerIdentity,
      resources: state.resourceOwner,
      drawResources: state.resourceOwner,
      command: state.command,
      composition: state.composition,
      descriptor: state.descriptor,
      d1Presentation: undefined,
      ticket,
      viewGeneration: state.input.viewGeneration ?? 1,
      sortCenter: [...(state.input.sortCenter ?? [0, 0, 0])],
      physicalSnapshot,
      pageAuthorities: new Map(state.sortPageAuthorities),
    };
    const owner = new SegmentedGlobalPresentationOwner(ownerState);
    const authority = Object.freeze({
      ticket,
      publicationReceipt,
      physicalSnapshot,
      identity: `segmented-global-presentation:${state.serial}`,
      cpuBytes: state.descriptor.cpuStagingBytes,
      gpuBytes: state.descriptor.gpuPresentationBytes,
      owner,
      plan,
      d1Receipt: state.d1Receipt,
    });
    authorityStates.set(authority, { adapter: this, state, ownerState });
    state.authority = authority;
    return authority;
  }

  commit(authority) {
    const authorityState = authorityStates.get(authority);
    if (!authorityState || authorityState.adapter !== this) {
      throw new DeveloperError(
        "Segmented global publication authority is stale",
      );
    }
    const { state, ownerState } = authorityState;
    this._checkCheckpointCoreContent(state.checkpointCoreContent);
    const committed =
      state.kind === "SH_REFRESH"
        ? this._d1.commitRefresh(
            this._index,
            ownerStates.get(this._current).d1Presentation,
            authority.d1Receipt,
            state.physicalSnapshot,
          )
        : this._d1.commitContent(
            this._index,
            state.input.preparedPagePublication,
            authority.d1Receipt,
            state.physicalSnapshot,
          );
    ownerState.d1Presentation = committed.presentation;
    this._current = authority.owner;
    state.phase = "COMMITTED";
    authorityStates.delete(authority);
    this._statistics[
      state.kind === "SH_REFRESH"
        ? "shPublicationCount"
        : "contentPublicationCount"
    ]++;
    if (state.checkpointCoreContent === undefined) {
      this._liveCoreContent = undefined;
    }
    this._queueLifecyclePrune();
    return authority.owner;
  }

  refreshContentView(ticket, options) {
    const state = ticketStates.get(ticket);
    if (
      !state ||
      state.adapter !== this ||
      !["PURE", "BUILDING", "SORTING", "READY"].includes(state.phase) ||
      state.authority
    ) {
      throw new DeveloperError("Segmented content view ticket is stale");
    }
    if (
      !Number.isSafeInteger(options.viewGeneration) ||
      options.viewGeneration <= (state.input.viewGeneration ?? 1) ||
      !Array.isArray(options.sortCenter) ||
      options.sortCenter.length !== 3 ||
      !options.sortCenter.every(Number.isFinite)
    ) {
      throw new DeveloperError("Segmented content view is stale or invalid");
    }
    if (state.sortIntent) {
      this._sorter.cancel(state.sortIntent);
      if (this._activeSorterOwner === state) {
        this._activeSorterOwner = undefined;
      }
    }
    if (this._pendingContentOwner === state) {
      this._pendingContentOwner = undefined;
    }
    // A partial upload is bound to its exact old ordering, even if the new
    // content and Mapping are identical. Retain only the view-independent work.
    if (state.orderingUpload) {
      this._resources.abortOrderingUpload(state.orderingUpload);
      state.orderingUpload = undefined;
    }
    state.orderingUploadBinding = undefined;
    if (state.phase === "READY") {
      this._resources.resetOrdering(state.resourceTicket);
      state.resourceReceipt = undefined;
      state.phase = "SORTING";
    }
    state.input.viewGeneration = options.viewGeneration;
    state.input.sortCenter = [...options.sortCenter];
    state.sortIntent = undefined;
    state.sortResult = undefined;
    state.sortError = undefined;
    if (state.phase !== "PURE") {
      this._enqueueSortOwner(state, "CONTENT");
    }
  }

  abort(ticket, reason) {
    const state = ticketStates.get(ticket);
    if (!state || state.adapter !== this || state.phase === "COMMITTED") {
      throw new DeveloperError("Segmented global abort ticket is stale");
    }
    if (state.sortIntent) {
      this._sorter.cancel(state.sortIntent);
      if (this._activeSorterOwner === state) {
        this._activeSorterOwner = undefined;
      }
    }
    if (this._pendingContentOwner === state) {
      this._pendingContentOwner = undefined;
    }
    if (state.orderingUpload) {
      this._resources.abortOrderingUpload(state.orderingUpload);
      state.orderingUpload = undefined;
      state.orderingUploadBinding = undefined;
    }
    this._cleanupContentState(state, reason);
    state.phase = "ABORTED";
    state.abortReason = reason;
    return true;
  }

  _cleanupContentState(state, reason) {
    let failure;
    if (state.plan) {
      try {
        if (state.kind === "SH_REFRESH") {
          this._d1.abortRefresh(this._index, state.plan);
        } else {
          this._d1.abortContent(this._index, state.plan);
        }
        state.plan = undefined;
      } catch (error) {
        failure = error;
      }
    }
    try {
      if (state.resourceOwner) {
        this._resources.retire(state.resourceOwner);
        state.resourceOwner = undefined;
        state.resourceTicket = undefined;
      } else if (state.resourceTicket) {
        this._resources.abort(state.resourceTicket);
        state.resourceTicket = undefined;
      }
    } catch (error) {
      failure ??= error;
    }
    state.abortReason = reason;
    if (failure) {
      throw failure;
    }
    return true;
  }

  retire(owner) {
    const state = ownerStates.get(owner);
    if (!state || state.adapter !== this) {
      throw new DeveloperError("Segmented global presentation owner is stale");
    }
    this._resources.retire(state.resources);
    ownerStates.delete(owner);
    if (this._current === owner) {
      this._current = undefined;
    }
    return true;
  }

  requestOrderingRefresh(options = {}) {
    if (this._destroyed || !this._current || this._orderingCleanupDebt) {
      throw new DeveloperError(
        "Segmented global Ordering refresh is unavailable",
      );
    }
    if (
      !Array.isArray(options.sortCenter) ||
      options.sortCenter.length !== 3 ||
      !options.sortCenter.every(Number.isFinite)
    ) {
      throw new DeveloperError("Segmented global sort center is invalid");
    }
    if (
      !isGaussianSegmentedResourceAdapter(
        this._resourceAdapter,
        this._index.artifactIdentityHex,
      )
    ) {
      throw new DeveloperError(
        "Segmented global Ordering requires a live branded D2 adapter",
      );
    }
    const ownerState = ownerStates.get(this._current);
    const viewGeneration = options.viewGeneration;
    if (
      !Number.isSafeInteger(viewGeneration) ||
      viewGeneration <= ownerState.viewGeneration ||
      (this._orderingWork &&
        viewGeneration <= this._orderingWork.viewGeneration)
    ) {
      throw new DeveloperError("Segmented global view generation is stale");
    }
    if (this._orderingWork) {
      const state = this._orderingWork;
      if (state.sortIntent) {
        this._sorter.cancel(state.sortIntent);
        if (this._activeSorterOwner === state) {
          this._activeSorterOwner = undefined;
        }
      }
      if (this._pendingCurrentOrderingOwner === state) {
        this._pendingCurrentOrderingOwner = undefined;
      }
      // Only an untouched allocation can be rebound. A partially uploaded
      // texture belongs to the old Ordering proof and must be retired first.
      if (state.orderingUploadStarted) {
        this._resources.abortOrderingUpload(state.orderingUpload);
        state.orderingUpload = undefined;
        state.orderingUploadStarted = false;
      }
      state.viewGeneration = viewGeneration;
      state.sortCenter = [...options.sortCenter];
      state.sortResult = undefined;
      state.sortError = undefined;
      state.orderingUploadNeedsRebind = !!state.orderingUpload;
      state.orderingUploadBinding = undefined;
      state.input.viewGeneration = viewGeneration;
      state.input.sortCenter = [...options.sortCenter];
      this._enqueueSortOwner(state, "ORDERING");
      return Object.freeze({ serial: state.serial, viewGeneration });
    }
    const activeContent = this._activeSorterOwner;
    if (activeContent?.schedulerKind === "CONTENT") {
      this._sorter.cancel(activeContent.sortIntent);
      this._activeSorterOwner = undefined;
      activeContent.sortIntent = undefined;
      activeContent.sortResult = undefined;
      activeContent.sortError = undefined;
      this._pendingContentOwner = activeContent;
    }
    const cpuBytes = ownerState.descriptor.orderingBytes;
    const gpuBytes = ownerState.descriptor.orderingBytes;
    const serial = ++this._serial;
    const state = {
      serial,
      phase: "SORTING",
      owner: this._current,
      ownerState,
      cpuBytes,
      gpuBytes,
      viewGeneration,
      sortCenter: [...options.sortCenter],
      input: {
        contentGeneration: ownerState.d1Presentation.contentGeneration,
        mappingGeneration: ownerState.d1Presentation.mappingGeneration,
        viewGeneration,
        sortCenter: [...options.sortCenter],
      },
      composition: ownerState.composition,
      physicalSnapshot: ownerState.physicalSnapshot,
      installedPageAuthorities: ownerState.pageAuthorities,
    };
    state.overlayReceipt = this._resourceAdapter.reserveOrderingOverlay(
      state,
      cpuBytes,
      gpuBytes,
    );
    this._orderingWork = state;
    try {
      this._enqueueSortOwner(state, "ORDERING");
    } catch (error) {
      const debt = {
        cursor: 0,
        cpuBytes,
        gpuBytes,
        steps: [
          () =>
            this._resourceAdapter.releaseOrderingOverlay(
              state.overlayReceipt,
              0,
              0,
            ),
        ],
        error,
      };
      try {
        this._runOrderingCleanup(debt);
      } catch (cleanupError) {
        debt.cleanupError = cleanupError;
        this._orderingCleanupDebt = debt;
        this._statistics.cleanupDebtBytes = cpuBytes + gpuBytes;
      }
      this._orderingWork = undefined;
      throw error;
    }
    return Object.freeze({ serial, viewGeneration });
  }

  advanceOrderingRefresh(limits = {}) {
    const state = this._orderingWork;
    if (!state || state.owner !== this._current) {
      throw new DeveloperError("Segmented global Ordering refresh is stale");
    }
    this._pumpSorter(limits);
    if (state.sortResult) {
      const result = state.sortResult;
      state.orderingUploadBinding = this._validatedOrderingUploadBinding(
        state,
        result,
      );
      let command;
      try {
        if (state.orderingUploadNeedsRebind) {
          this._resources.rebindOrderingUpload(
            state.orderingUpload,
            state.ownerState.descriptor,
            result.ordering,
            state.orderingUploadBinding,
          );
          state.orderingUploadNeedsRebind = false;
        } else {
          state.orderingUpload ??= this._resources.prepareOrderingUpload(
            state.ownerState.descriptor,
            result.ordering,
            state.orderingUploadBinding,
          );
        }
        const upload = this._resources.advanceOrderingUpload(
          state.orderingUpload,
          limits.maximumTextureUploads ?? 0,
          state.orderingUploadBinding,
          result.ordering,
          limits.textureUploadBudget,
        );
        state.orderingUploadStarted ||= upload.uploadedBytes > 0;
        if (!upload.ready) {
          return Object.freeze({
            ready: false,
            viewGeneration: state.viewGeneration,
          });
        }
        state.plan = this._d1.createOrderingPlan(
          this._index,
          state.ownerState.d1Presentation,
          this._limitsForCurrent(this._current),
        );
        if (
          state.plan.targetCut !== state.ownerState.d1Presentation.cut ||
          state.plan.targetOwnership !==
            state.ownerState.d1Presentation.ownership ||
          !sameDescriptor(state.plan.descriptor, state.ownerState.descriptor) ||
          !sameComposition(
            state.plan.composition,
            state.ownerState.composition,
          ) ||
          !sameArray(
            state.plan.fragmentShDenseStarts,
            state.ownerState.d1Presentation.fragmentShDenseStarts,
          ) ||
          state.sortIntent.contentGeneration !==
            state.plan.expectedContentGeneration ||
          state.sortIntent.mappingGeneration !==
            state.plan.expectedMappingGeneration ||
          state.sortIntent.viewGeneration !== state.viewGeneration ||
          state.sortIntent.requestSerial !== state.serial ||
          state.sortIntent.ownerIdentity !== state.schedulerIdentity ||
          state.orderingUploadBinding.adapterTicketSerial !== state.serial ||
          state.orderingUploadBinding.sortIntent !== state.sortIntent ||
          state.orderingUploadBinding.sortRequestSerial !==
            state.sortIntent.requestSerial ||
          state.orderingUploadBinding.viewGeneration !== state.viewGeneration ||
          state.orderingUploadBinding.ordering !== result.ordering ||
          state.orderingUploadBinding.contentGeneration !==
            state.plan.expectedContentGeneration ||
          state.orderingUploadBinding.mappingGeneration !==
            state.plan.expectedMappingGeneration ||
          state.physicalSnapshot !== state.ownerState.physicalSnapshot
        ) {
          throw new DeveloperError(
            "Segmented global Ordering late authority changed",
          );
        }
        const preparedOrdering = this._resources.consumeOrderingUpload(
          state.orderingUpload,
          state.orderingUploadBinding,
          result.ordering,
        );
        state.orderingUpload = undefined;
        state.orderingUploadBinding = undefined;
        state.orderingTexture = preparedOrdering.texture;
        const base = state.ownerState.drawResources;
        const nextResources = Object.freeze({
          ...base,
          orderingTexture: state.orderingTexture,
          ordering: preparedOrdering.ordering,
        });
        command = this._renderResources.createCommand(
          nextResources,
          state.ownerState.command.boundingVolume,
        );
        const external = {
          resourceOwnerIdentity: state.owner.resourceOwnerIdentity,
          contentGeneration: state.plan.expectedContentGeneration,
          mappingGeneration: state.plan.expectedMappingGeneration,
          orderingGeneration: state.plan.expectedOrderingGeneration,
          selectedSplatCount: state.ownerState.composition.selectedSplatCount,
          slotCount: state.ownerState.composition.slotCount,
          coreLogicalBytes: state.ownerState.descriptor.coreLogicalBytes,
          coreAllocatedBytes: state.ownerState.descriptor.coreBytes,
          shLogicalBytes: state.ownerState.descriptor.shLogicalBytes,
          shAllocatedBytes: state.ownerState.descriptor.shBytes,
          mappingBytes: state.ownerState.descriptor.mappingBytes,
          cropBytes: state.ownerState.descriptor.cropBytes,
          orderingBytes: state.ownerState.descriptor.orderingBytes,
          gpuPageBindingGeneration:
            state.ownerState.d1Presentation.gpuPageBindingGeneration,
        };
        state.receipt = this._d1.createReceipt(state.plan, external);
        const installOrdering = this._resources.prepareOrderingSwap(
          state.ownerState.resources,
          state.orderingTexture,
          result.ordering,
        );
        const releaseOverlayCpu =
          this._resourceAdapter.prepareOrderingOverlayRelease(
            state.overlayReceipt,
            0,
            state.gpuBytes,
          );
        const releaseOverlayAll =
          this._resourceAdapter.prepareOrderingOverlayRelease(
            state.overlayReceipt,
            0,
            0,
          );
        const committed = this._d1.commitRefresh(
          this._index,
          state.ownerState.d1Presentation,
          state.receipt,
          null,
        );
        const oldOrdering = installOrdering();
        state.ownerState.d1Presentation = committed.presentation;
        state.ownerState.drawResources = nextResources;
        state.ownerState.command = command;
        state.ownerState.viewGeneration = state.viewGeneration;
        state.ownerState.sortCenter = [...state.sortCenter];
        state.orderingTexture = undefined;
        this._orderingWork = undefined;
        this._statistics.orderingOnlyPublicationCount++;
        releaseOverlayCpu();
        try {
          this._resources.destroyOrderingTexture(oldOrdering);
          releaseOverlayAll();
        } catch (error) {
          this._orderingCleanupDebt = {
            cursor: 0,
            cpuBytes: 0,
            gpuBytes: state.gpuBytes,
            steps: [
              () => this._resources.destroyOrderingTexture(oldOrdering),
              () => releaseOverlayAll(),
            ],
            error,
          };
          this._statistics.cleanupDebtBytes = state.gpuBytes;
        }
      } catch (error) {
        const steps = [];
        if (state.plan) {
          steps.push(() => {
            this._d1.abortRefresh(this._index, state.receipt ?? state.plan);
            state.plan = undefined;
          });
        }
        if (state.orderingUpload) {
          steps.push(() => {
            this._resources.abortOrderingUpload(state.orderingUpload);
            state.orderingUpload = undefined;
            state.orderingUploadBinding = undefined;
          });
        }
        if (state.orderingTexture) {
          steps.push(() => {
            this._resources.destroyOrderingTexture(state.orderingTexture);
            state.orderingTexture = undefined;
          });
        }
        steps.push(() =>
          this._resourceAdapter.releaseOrderingOverlay(
            state.overlayReceipt,
            0,
            0,
          ),
        );
        const debt = {
          cursor: 0,
          steps,
          error,
          parallel: true,
          cpuBytes: state.cpuBytes,
          gpuBytes: state.gpuBytes,
        };
        try {
          this._runOrderingCleanup(debt);
        } catch (cleanupError) {
          debt.cleanupError = cleanupError;
          this._orderingCleanupDebt = debt;
          this._statistics.cleanupDebtBytes = state.cpuBytes + state.gpuBytes;
        }
        this._orderingWork = undefined;
        state.error = error;
      }
    }
    if (state.sortError) {
      const debt = {
        cursor: 0,
        cpuBytes: state.cpuBytes,
        gpuBytes: state.gpuBytes,
        steps: [
          () =>
            this._resourceAdapter.releaseOrderingOverlay(
              state.overlayReceipt,
              0,
              0,
            ),
        ],
        error: state.sortError,
      };
      try {
        this._runOrderingCleanup(debt);
      } catch (cleanupError) {
        debt.cleanupError = cleanupError;
        this._orderingCleanupDebt = debt;
        this._statistics.cleanupDebtBytes = state.cpuBytes + state.gpuBytes;
      }
      this._orderingWork = undefined;
      state.error = state.sortError;
    }
    if (state.error) {
      throw state.error;
    }
    return Object.freeze({
      ready: !this._orderingWork,
      viewGeneration: state.viewGeneration,
    });
  }

  settleOrderingCleanupDebt(token = this._orderingCleanupDebt) {
    if (!token || token !== this._orderingCleanupDebt) {
      throw new DeveloperError(
        "Segmented global Ordering cleanup token is stale",
      );
    }
    this._runOrderingCleanup(token);
    this._orderingCleanupDebt = undefined;
    this._statistics.cleanupDebtBytes = 0;
    return true;
  }

  _runOrderingCleanup(token) {
    if (token.parallel) {
      token.completed ??= new Array(token.steps.length).fill(false);
      let failure;
      for (let index = 0; index < token.steps.length; index++) {
        if (token.completed[index]) {
          continue;
        }
        try {
          token.steps[index]();
          token.completed[index] = true;
        } catch (error) {
          failure ??= error;
        }
      }
      if (failure) {
        throw failure;
      }
      return true;
    }
    while (token.cursor < token.steps.length) {
      token.steps[token.cursor]();
      token.cursor++;
    }
    return true;
  }

  get current() {
    return this._current;
  }

  get currentViewGeneration() {
    return ownerStates.get(this._current)?.viewGeneration ?? 0;
  }

  get copiedSplats() {
    return this._resources.copiedSplats;
  }

  get uploadedResources() {
    return this._resources.uploadedResources;
  }

  get statistics() {
    const resource = this._resources.statistics;
    const sorter = this._sorter.snapshot;
    const pageBackend = this._pageBackend?.statistics;
    const current = ownerStates.get(this._current);
    return Object.freeze({
      globalContentGeneration: current?.d1Presentation?.contentGeneration ?? 0,
      globalMappingGeneration: current?.d1Presentation?.mappingGeneration ?? 0,
      globalOrderingGeneration:
        current?.d1Presentation?.orderingGeneration ?? 0,
      globalViewGeneration: current?.viewGeneration ?? 0,
      globalPresentationSplats: current?.resources.selectedSplatCount ?? 0,
      globalPresentationBytes: current?.descriptor.gpuPresentationBytes ?? 0,
      globalCoreBytes: current?.descriptor.coreBytes ?? 0,
      globalShBytes: current?.descriptor.shBytes ?? 0,
      globalMappingBytes: current?.descriptor.mappingBytes ?? 0,
      globalCropBytes: current?.descriptor.cropBytes ?? 0,
      globalOrderingBytes: current?.descriptor.orderingBytes ?? 0,
      globalBuildCopiedSplats: resource.copiedSplats,
      globalBuildUploadedFragments: resource.uploadedResources,
      presentationCoreRewriteSplats: resource.presentationCoreRewriteSplats,
      mappingEntriesWritten: resource.mappingEntriesWritten,
      lastFrameMappingEntriesWritten: resource.lastFrameMappingEntriesWritten,
      mappingWorkerDispatchCount: resource.mappingWorkerDispatchCount,
      mappingWorkerCompletionCount: resource.mappingWorkerCompletionCount,
      mappingWorkerFailureCount: resource.mappingWorkerFailureCount,
      mappingWorkerMilliseconds: resource.mappingWorkerMilliseconds,
      mappingEntriesProduced: resource.mappingEntriesProduced,
      staleMappingDiscardCount: resource.staleMappingDiscardCount,
      globalPresentationBuildState: this._orderingWork
        ? "ORDERING_REFRESH"
        : current
          ? "CURRENT"
          : "EMPTY",
      ...Object.fromEntries(
        Object.entries(sorter).filter(([key]) =>
          key.startsWith("corePreparation"),
        ),
      ),
      globalSortDispatchCount: sorter.dispatchCount,
      sortPositionExtractions: sorter.sortPositionExtractions,
      lastFrameSortPositionExtractions: sorter.lastFrameSortPositionExtractions,
      rawCoreCloneBytes: sorter.rawCoreCloneBytes,
      lastFrameRawCoreCloneBytes: sorter.lastFrameRawCoreCloneBytes,
      workerDecodedPositionSplats: sorter.workerDecodedPositionSplats,
      positionRepositoryHitPageCount: sorter.positionRepositoryHitPageCount,
      positionRepositoryMissPageCount: sorter.positionRepositoryMissPageCount,
      globalSortCompletionCount: sorter.completionCount,
      globalSortFailureCount: sorter.failureCount,
      globalStaleSortDiscardCount: this._statistics.staleSortDiscardCount,
      globalWorkerConfirmedPageCount: sorter.confirmedPageCount,
      globalWorkerPositionBytes: sorter.confirmedPositionBytes,
      globalWorkerScratchBytes: sorter.scratchBytes,
      globalWorkerWorkingSetHighWater: sorter.workingSetHighWater,
      globalDrawCommandCount: current ? 1 : 0,
      globalGpuPageBackingCount: pageBackend?.backingCount ?? 0,
      globalGpuPageBackingBytes: pageBackend?.backingBytes ?? 0,
      coverageHoleCount: current?.composition.metrics.coverageHoleCount ?? 0,
      coverageOverlapCount:
        current?.composition.metrics.coverageOverlapCount ?? 0,
      d3CleanupDebtBytes: this._statistics.cleanupDebtBytes,
      cpuOrderingRefreshWorkBytes: this._orderingWork?.cpuBytes ?? 0,
      gpuOrderingRefreshWorkBytes: this._orderingWork?.gpuBytes ?? 0,
      cpuOrderingCleanupDebtBytes: this._orderingCleanupDebt?.cpuBytes ?? 0,
      gpuOrderingCleanupDebtBytes: this._orderingCleanupDebt?.gpuBytes ?? 0,
      pendingContentSortCount: this._pendingContentOwner ? 1 : 0,
      pendingCorePreparationCount: this._pendingCorePreparationOwner ? 1 : 0,
      pendingCurrentOrderingSortCount: this._pendingCurrentOrderingOwner
        ? 1
        : 0,
      activeSorterOwnerCount: this._activeSorterOwner ? 1 : 0,
      pendingPruneMaintenanceCount: this._pendingPruneAuthority ? 1 : 0,
      ...this._statistics,
    });
  }

  destroy() {
    if (this._destroyed) {
      return false;
    }
    this._destroyCoreContent ??= this._liveCoreContent;
    if (this._destroyCoreContent) {
      if (!this.abortCorePreparation(this._destroyCoreContent)) {
        return false;
      }
      this._destroyCoreContent = undefined;
    }
    if (!this._destroyState) {
      const token = Object.freeze({});
      const ordering = this._orderingWork;
      this._destroyState = {
        token,
        cursor: 0,
        steps: [
          () => {
            if (ordering?.sortIntent) {
              this._sorter.cancel(ordering.sortIntent);
              if (this._activeSorterOwner === ordering) {
                this._activeSorterOwner = undefined;
              }
            }
            this._pendingCurrentOrderingOwner = undefined;
          },
          () => {
            if (ordering?.plan) {
              this._d1.abortRefresh(
                this._index,
                ordering.receipt ?? ordering.plan,
              );
              ordering.plan = undefined;
            }
          },
          () => {
            if (ordering?.orderingUpload) {
              this._resources.abortOrderingUpload(ordering.orderingUpload);
              ordering.orderingUpload = undefined;
              ordering.orderingUploadBinding = undefined;
            }
          },
          () => {
            if (ordering?.orderingTexture) {
              this._resources.destroyOrderingTexture(ordering.orderingTexture);
              ordering.orderingTexture = undefined;
            }
          },
          () => {
            if (ordering?.overlayReceipt) {
              this._resourceAdapter.releaseOrderingOverlay(
                ordering.overlayReceipt,
                0,
                0,
              );
              ordering.overlayReceipt = undefined;
            }
            this._orderingWork = undefined;
          },
          () => {
            if (this._orderingCleanupDebt) {
              this.settleOrderingCleanupDebt(this._orderingCleanupDebt);
            }
          },
          () => {
            if (this._resourceAdapter) {
              if (!this._destroyState.d2DestroyRequested) {
                this._resourceAdapter.destroy();
                this._destroyState.d2DestroyRequested = true;
              }
              const token = this._resourceAdapter.cleanupDebtTokens[0];
              if (token) {
                this._resourceAdapter.settleCleanupDebt(token);
              }
              if (!this._resourceAdapter.destroyed) {
                throw new DeveloperError("D2 destroy is still converging");
              }
            }
            if (!this._resourceAdapter && this._current) {
              this.retire(this._current);
            }
          },
          () => {
            if (
              !this._sorter.snapshot.destroyed &&
              this._sorter.destroy() !== true
            ) {
              throw new DeveloperError("Sorter destroy is still converging");
            }
          },
          () => {
            if (this._resources.destroy() !== true) {
              throw new DeveloperError(
                "Mapping Worker destroy is still converging",
              );
            }
          },
          () => {
            if (
              !this._renderResources.statistics.destroyed &&
              this._renderResources.destroy() !== true
            ) {
              throw new DeveloperError("Renderer destroy is still converging");
            }
          },
          () => {
            if ((this._pageBackend?.statistics.backingCount ?? 0) !== 0) {
              throw new DeveloperError("GPU Page backing blocks D3 destroy");
            }
            this._pageBackend?.destroy?.();
          },
        ],
      };
    }
    return this._continueDestroy();
  }

  _continueDestroy() {
    const state = this._destroyState;
    try {
      while (state.cursor < state.steps.length) {
        state.steps[state.cursor]();
        state.cursor++;
      }
      this._destroyed = true;
      return true;
    } catch (error) {
      state.error = error;
      return false;
    }
  }

  settleDestroyCleanupDebt(token) {
    if (
      !this._destroyState ||
      token !== this._destroyState.token ||
      this._destroyed
    ) {
      throw new DeveloperError("Segmented global destroy token is stale");
    }
    return this._continueDestroy();
  }

  get destroyCleanupToken() {
    return this._destroyed ? undefined : this._destroyState?.token;
  }
}

/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import { packFileName } from "../../../Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import BoundingSphere from "../../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../../Core/Cartesian3.js";
import DeveloperError from "../../../../Core/DeveloperError.js";
import Matrix4 from "../../../../Core/Matrix4.js";
import _SceneGISGaussianStreamCache from "./_SceneGISGaussianStreamCache.js";
import _SceneGISGaussianStreamLoader from "./_SceneGISGaussianStreamLoader.js";
import _SceneGISGaussianStreamPersistentCache from "./_SceneGISGaussianStreamPersistentCache.js";
import {
  createGaussianMacroChunkFrozenView,
  gaussianMacroChunkViewChanged,
  observeGaussianMacroChunkView,
  updateGaussianSourceRenderTransform,
} from "./_SceneGISGaussianViewObservation.js";
import _SceneGISGaussianSegmentedGlobalContentAtlas from "./_SceneGISGaussianSegmentedGlobalContentAtlas.js";
import _SceneGISGaussianSegmentedGlobalPresentationAdapter from "./_SceneGISGaussianSegmentedGlobalPresentationAdapter.js";
import _SceneGISGaussianSegmentedGlobalPresentationResources from "./_SceneGISGaussianSegmentedGlobalPresentationResources.js";
import _SceneGISGaussianSegmentedGlobalRenderResources from "./_SceneGISGaussianSegmentedGlobalRenderResources.js";
import _SceneGISGaussianSegmentedGlobalSorter, {
  estimateGaussianSegmentedGlobalSortWorkingSetBytes,
} from "./_SceneGISGaussianSegmentedGlobalSorter.js";
import _SceneGISGaussianSegmentedPageBindingLedger from "./_SceneGISGaussianSegmentedPageBindingLedger.js";
import _SceneGISGaussianSegmentedResourceAdapter from "./_SceneGISGaussianSegmentedResourceAdapter.js";
import _SceneGISGaussianSegmentedStreamDescriptorProvider from "./_SceneGISGaussianSegmentedStreamDescriptorProvider.js";
import { SEGMENTED_ACTIVE_CUT_STOP_REASON } from "../../../Core/_private/Gaussian/_SceneGISGaussianSegmentedActiveCut.js";
import {
  abortSegmentedGlobalPresentationPublication,
  abortSegmentedGlobalPresentationRefresh,
  abortSegmentedAssetPageTransition,
  abortSegmentedPreparedPagePublication,
  commitSegmentedConvergedActiveCutPlan,
  computeSegmentedAtlasPageFootprint,
  commitSegmentedGlobalPresentationPublication,
  commitSegmentedGlobalPresentationRefresh,
  composeSegmentedGlobalPresentationSlots,
  createSegmentedActiveCut,
  createSegmentedAssetPagePhysicalSnapshot,
  createSegmentedGlobalOrderingRefreshPlan,
  createSegmentedGlobalPresentationPlan,
  createSegmentedGlobalPresentationReceipt,
  decodeSegmentedHierarchyRuntimeIndex,
  deriveSegmentedGlobalPresentationLayout,
  planSegmentedConvergedActiveCut,
  planSegmentedReadyConvergedActiveCut,
  planSegmentedProgressiveBridge,
  rebaseSegmentedConvergedActiveCutPlan,
  planSegmentedAssetPageBootstrap,
  planSegmentedConvergedAssetPageTransition,
  prepareSegmentedAssetPageBootstrapPublication,
  prepareSegmentedConvergedAssetPagePublication,
  reserveSegmentedGlobalPresentation,
  validateSegmentedAssetPagePhysicalSnapshot,
  validateSegmentedGlobalPresentationPlanBinding,
  validateSegmentedGlobalPresentationReservation,
  validateSegmentedHierarchyRuntimeIndex,
} from "../../../Core/_private/Gaussian/_SceneGISGaussianSegmentedProtocol.js";
import { parseMacroChunkRuntimeManifest } from "../../../Core/_private/Gaussian/_SceneGISGaussianManifest.js";

import {
  CORE_PREPARATION_WINDOW_BYTES,
  discardSegmentedPreparedCoreReceipt,
} from "./_SceneGISGaussianSegmentedCorePreparation.js";
const STATE = Object.freeze({
  LOADING: "LOADING",
  DRAWABLE: "DRAWABLE",
  READY: "READY",
  TRANSITIONING: "TRANSITIONING",
  RESOURCE_BLOCKED: "RESOURCE_BLOCKED",
  DEGRADED: "DEGRADED",
  FAILED: "FAILED",
  DESTROYED: "DESTROYED",
});

const PHASE = Object.freeze({
  INDEX_LOADING: "INDEX_LOADING",
  COMPONENTS_READY: "COMPONENTS_READY",
  ROOT_WORK: "ROOT_WORK",
  ROOT_PRESENTATION: "ROOT_PRESENTATION",
  CURRENT_DRAWABLE: "CURRENT_DRAWABLE",
  READY: "READY",
  TRANSITION_WORK: "TRANSITION_WORK",
  TRANSITION_PRESENTATION: "TRANSITION_PRESENTATION",
  RETIREMENT: "RETIREMENT",
  CLEANUP: "CLEANUP",
  DESTROYING: "DESTROYING",
  FAILED: "FAILED",
  DESTROYED: "DESTROYED",
});

function unique(values) {
  return Uint32Array.from(new Set(values)).sort();
}

const INVALID_PAGE_ID = 0xffffffff;

const planningInvariantErrors = new WeakSet();

function resourceAvailabilityKey(controller) {
  const ledger = controller._d2?.resourceAvailability;
  const sorter = controller._sorter?.snapshot;
  return ledger
    ? [
        ledger.cpuTotal,
        ledger.gpuTotal,
        ledger.cpuCleanupDebtBytes,
        ledger.gpuCleanupDebtBytes,
        ledger.cpuOrderingOverlayBytes,
        ledger.gpuOrderingOverlayBytes,
        sorter?.confirmedPositionBytes ?? 0,
        sorter?.scratchBytes ?? 0,
      ].join(":")
    : "unavailable";
}

function planEvaluationKey(controller) {
  return `${controller._d2.currentPresentationIdentity}:${controller._statistics.contentPublications}:${controller._viewGeneration}:${controller._transformGeneration}:${resourceAvailabilityKey(controller)}`;
}

function targetResourceRequirements(controller, convergedPlan) {
  const targetCut = commitSegmentedConvergedActiveCutPlan(
    controller._index,
    controller._currentCut,
    convergedPlan,
    controller._view,
    1,
  ).cut;
  const composition = composeSegmentedGlobalPresentationSlots(
    controller._index,
    targetCut,
  );
  const coreIds = unique(composition.fragmentCorePageIds);
  const shIds = unique(
    [...composition.fragmentShPageIds].filter(
      (pageId) => pageId !== INVALID_PAGE_ID,
    ),
  );
  const snapshot = controller._currentSnapshot;
  const cpuHeld = new Set(snapshot.cpuPageIds);
  const gpuHeld = new Set(snapshot.gpuPageIds);
  const page = new Float64Array(11);
  let requiredCpuPageBytes = 0;
  let requiredGpuPageBytes = 0;
  for (const pageId of unique([...coreIds, ...shIds])) {
    controller._index.readPage(pageId, page);
    if (!cpuHeld.has(pageId)) {
      requiredCpuPageBytes += page[8];
    }
    if (!gpuHeld.has(pageId)) {
      requiredGpuPageBytes += computeSegmentedAtlasPageFootprint(
        page[2],
        page[4],
        controller._index.maxShDegree,
      ).uploadBytes;
    }
  }
  const reservation = reserveSegmentedGlobalPresentation(
    controller._index,
    targetCut,
    coreIds,
    shIds,
    {
      ...controller._presentationLimits,
      maximumCpuBytes: Number.MAX_SAFE_INTEGER,
      maximumGpuBytes: Number.MAX_SAFE_INTEGER,
    },
  );
  const sort = targetSorterResourceRequirements(
    controller,
    targetCut,
    coreIds,
    page,
  );
  return {
    requiredCpuPageBytes,
    requiredGpuPageBytes,
    requiredCpuPresentationBytes: reservation.cpuBytes,
    requiredGpuPresentationBytes: reservation.gpuBytes,
    requiredSorterBytes: sort.totalBytes,
  };
}

function targetSorterResourceRequirements(
  controller,
  targetCut,
  coreIds,
  page,
) {
  let retainedPositionBytes = 0;
  let missingPositionBytes = 0;
  let preparationBytes = 0;
  for (const pageId of coreIds) {
    controller._index.readPage(pageId, page);
    const positionBytes = page[2] * 12;
    retainedPositionBytes += positionBytes;
    if (!controller._sorter._confirmed.has(pageId)) {
      missingPositionBytes += positionBytes;
    }
    if (
      !controller._sorter._confirmed.has(pageId) ||
      !controller._gpuLedger?._pages.has(pageId)
    ) {
      preparationBytes += computeSegmentedAtlasPageFootprint(
        page[2],
        1,
        0,
      ).uploadBytes;
    }
  }
  const sorter = controller._sorter.snapshot;
  // Historical positions are evictable; only the displayed and target Pages
  // are compulsory when deciding whether a target can fit the Worker reserve.
  const protectedIds = new Set([
    ...coreIds,
    ...(controller._d2?.currentPageIds ?? []),
  ]);
  const protectedPositionBytes = [...controller._sorter._confirmed.values()]
    .filter((entry) => protectedIds.has(entry.pageIndex))
    .reduce((sum, entry) => sum + entry.positionBytes, 0);
  return estimateGaussianSegmentedGlobalSortWorkingSetBytes({
    selectedSplatCount: targetCut.selectedSplatCount,
    confirmedPositionBytes: protectedPositionBytes,
    missingPositionBytes,
    preparationBytes: Math.min(preparationBytes, CORE_PREPARATION_WINDOW_BYTES),
    retainedPositionBytes,
    scratchResidentBytes: sorter.scratchBytes,
  });
}

function resourceBlockerSnapshot(controller, required, reason) {
  const ledger = controller._d2.resourceLedger;
  const snapshot = controller._currentSnapshot;
  const available = {
    availableCpuPageBytes: Math.max(
      0,
      Math.min(
        controller._pageLimits.replacementCpuEscrowBytes,
        controller._pageLimits.maximumCpuPageBytes - snapshot.cpuStoredBytes,
      ),
    ),
    availableGpuPageBytes: Math.max(
      0,
      Math.min(
        controller._pageLimits.replacementGpuEscrowBytes,
        controller._pageLimits.maximumGpuPageBytes - snapshot.gpuRawBytes,
      ),
    ),
    availableCpuPresentationBytes: Math.max(
      0,
      controller._options.maximumCpuBytes - ledger.cpuTotal,
    ),
    availableGpuPresentationBytes: Math.max(
      0,
      controller._options.maximumGpuBytes - ledger.gpuTotal,
    ),
    availableSorterBytes: controller._options.maximumSortWorkingSetBytes,
  };
  return Object.freeze({ reason, ...required, ...available });
}

function makeResourceBlocker(controller, convergedPlan, reason) {
  return resourceBlockerSnapshot(
    controller,
    targetResourceRequirements(controller, convergedPlan),
    reason,
  );
}

function isSortCenterInRange(bounds, center) {
  // Root content bounds include every encoded LOD, including trained proxies.
  // The Worker stores source-local centers as Float32, so round both bounds
  // endpoints the same way before bounding its existing millimetre sort key.
  const dx = Math.max(
    Math.abs(Math.fround(bounds[0]) - center[0]),
    Math.abs(Math.fround(bounds[3]) - center[0]),
  );
  const dy = Math.max(
    Math.abs(Math.fround(bounds[1]) - center[1]),
    Math.abs(Math.fround(bounds[4]) - center[1]),
  );
  const dz = Math.max(
    Math.abs(Math.fround(bounds[2]) - center[2]),
    Math.abs(Math.fround(bounds[5]) - center[2]),
  );
  const metric = -1000 * Math.sqrt(dx * dx + dy * dy + dz * dz);
  return Number.isFinite(metric) && Math.round(metric) >= -2147483648;
}

export const gaussianSegmentedRuntimeControllerSpecHooks = Object.freeze({
  resourceAvailabilityKey,
  targetSorterResourceRequirements,
  resourceBlockerSnapshot,
  isSortCenterInRange,
});

function isResourceAdmissionError(error) {
  return /platform budget exceeded|ResourceLedger hard limits|Worker reserve/.test(
    error?.message ?? "",
  );
}

function emptySnapshot(index, leaseIdentity) {
  const emptyIds = new Uint32Array(0);
  const emptyValues = new Float64Array(0);
  return createSegmentedAssetPagePhysicalSnapshot(index, {
    cpuPageIds: emptyIds,
    cpuStoredBytes: emptyValues,
    cpuPageProvenance: emptyValues,
    gpuPageIds: emptyIds,
    gpuRawBytes: emptyValues,
    gpuPageProvenance: emptyValues,
    cpuGeneration: 0,
    gpuGeneration: 0,
    leaseIdentity,
  });
}

function sourceBoundsSphere(index) {
  const bounds = index.sourceBounds;
  return BoundingSphere.fromCornerPoints(
    Cartesian3.fromElements(bounds[0], bounds[1], bounds[2]),
    Cartesian3.fromElements(bounds[3], bounds[4], bounds[5]),
  );
}

function pageLimits(options) {
  return Object.freeze({
    maximumCpuPageBytes: options.maximumCpuPageBytes,
    replacementCpuEscrowBytes: options.replacementCpuEscrowBytes,
    maximumGpuPageBytes: options.maximumGpuPageBytes,
    replacementGpuEscrowBytes: options.replacementGpuEscrowBytes,
  });
}

function presentationLimits(options, context) {
  return Object.freeze({
    maximumSelectedSplats: options.maximumSelectedSplats,
    maximumCoverageSlots: options.maximumCoverageSlots,
    maximumTextureSize: context._gl.getParameter(context._gl.MAX_TEXTURE_SIZE),
    maximumTextureArrayLayers: context._gl.getParameter(
      context._gl.MAX_ARRAY_TEXTURE_LAYERS,
    ),
    maximumCpuBytes: options.maximumCpuBytes,
    maximumGpuBytes: options.maximumGpuBytes,
    refineErrorPixels: options.refineErrorPixels,
    coarsenErrorPixels: options.coarsenErrorPixels,
  });
}

function d1Authority() {
  return Object.freeze({
    compose: composeSegmentedGlobalPresentationSlots,
    derive: deriveSegmentedGlobalPresentationLayout,
    createContentPlan: createSegmentedGlobalPresentationPlan,
    createOrderingPlan: createSegmentedGlobalOrderingRefreshPlan,
    createReceipt: createSegmentedGlobalPresentationReceipt,
    commitContent: commitSegmentedGlobalPresentationPublication,
    commitRefresh: commitSegmentedGlobalPresentationRefresh,
    abortContent: abortSegmentedGlobalPresentationPublication,
    abortRefresh: abortSegmentedGlobalPresentationRefresh,
    validatePlanBinding: validateSegmentedGlobalPresentationPlanBinding,
  });
}

function _SceneGISGaussianSegmentedRuntimeController(options) {
  this._timingOrigin = performance.now();
  this._primitive = options.primitive;
  this._options = options;
  this._captureFootprintDiagnostics =
    options.captureFootprintDiagnostics === true;
  this._state = STATE.LOADING;
  this._phase = PHASE.INDEX_LOADING;
  this._error = undefined;
  this._index = undefined;
  this._sortBounds = undefined;
  this._provider = undefined;
  this._persistentCache = undefined;
  this._persistentStagingReserveBytes = 0;
  this._persistentCacheDisabledReason =
    options.usePersistentCache === true ? undefined : "explicitly-disabled";
  this._view = undefined;
  this._viewGeneration = 0;
  this._orderingViewGeneration = 0;
  this._transformGeneration = 1;
  this._commandTransformGeneration = 0;
  this._transformedCommand = undefined;
  this._renderTransformNeedsRestore = false;
  this._content = undefined;
  this._cleanup = undefined;
  this._currentCut = undefined;
  this._currentOwnership = undefined;
  this._currentSnapshot = undefined;
  this._orderingActive = false;
  this._orderingRequestedViewGeneration = 0;
  this._destroyRequested = false;
  this._failureCleanupRequested = false;
  this._componentsDestroyed = false;
  this._pageSources = new WeakMap();
  this._evaluatedPlanKey = undefined;
  this._stopReason = undefined;
  this._resourceBlocker = undefined;
  this._lastRecoverableError = undefined;
  this._planMetrics = Object.freeze({});
  this._statistics = {
    visitedNodes: 0,
    demandedPages: 0,
    copiedSplats: 0,
    textureUploads: 0,
    contentPublications: 0,
    checkpointPublications: 0,
    checkpointAttempts: 0,
    checkpointBridgeBytes: 0,
    finalTargetPublications: 0,
    orderingPublications: 0,
    drawCount: 0,
    viewGeneration: 0,
    orderingViewGeneration: 0,
    transformGeneration: this._transformGeneration,
    selectionEvaluations: 0,
    bindInspections: 0,
    logicalClosureStepCount: 0,
    physicalContentPublicationCount: 0,
    gpuPageFeedOperations: 0,
    gpuPageFeedBytes: 0,
    gpuUploadBytes: 0,
    lastFrameGpuUploadBytes: 0,
    maximumFrameGpuUploadBytes: 0,
    gpuPageFeedFrames: 0,
    maximumGpuFeedWorkMilliseconds: 0,
    lastFrameGpuPageFeedOperations: 0,
    lastFrameGpuPageFeedBytes: 0,
  };

  this._loader = new _SceneGISGaussianStreamLoader({
    url: options.url,
    parseIndexManifest: (bytes) => {
      this._statistics.manifestParseStartedMilliseconds =
        performance.now() - this._timingOrigin;
      const manifest = parseMacroChunkRuntimeManifest(bytes);
      this._statistics.manifestParseCompletedMilliseconds =
        performance.now() - this._timingOrigin;
      return manifest;
    },
    parseIndex: (bytes, expected) => {
      this._statistics.indexParseStartedMilliseconds =
        performance.now() - this._timingOrigin;
      const index = validateSegmentedHierarchyRuntimeIndex(
        decodeSegmentedHierarchyRuntimeIndex(bytes, expected),
      );
      this._statistics.indexParseCompletedMilliseconds =
        performance.now() - this._timingOrigin;
      return index;
    },
    packFileName: (pack) => `packs/${packFileName(pack)}`,
    descriptorProviderFactory: (index) => {
      const provider = new _SceneGISGaussianSegmentedStreamDescriptorProvider({
        runtimeIndex: index,
        validateRuntimeIndex: validateSegmentedHierarchyRuntimeIndex,
        packFileName: (pack) => `packs/${packFileName(pack)}`,
      });
      this._provider = provider;
      return provider;
    },
    requestScheduler: options.requestScheduler,
    fetchFunction: options.fetchFunction,
    maximumRequests: options.maximumRequests,
    maximumRequestBytes: options.maximumRequestBytes,
    // Bound each IndexedDB transaction by bytes as well as Page count. Large
    // segmented Pages otherwise fill a near-64 MiB batch before delivery.
    _maximumPersistentLookupBytes: 8 * 1024 * 1024,
    _maximumRawCompletionPagesPerUpdate: Number.MAX_SAFE_INTEGER,
  });
}

_SceneGISGaussianSegmentedRuntimeController.prototype._updateRenderTransform =
  function (frameState) {
    updateGaussianSourceRenderTransform(
      frameState,
      this._primitive._effectiveModelMatrix,
      this._primitive._viewOriginLocal,
      this._primitive._sourceRenderToViewPosition,
      this._primitive._sourceRenderToViewQuaternion,
    );
    this._renderTransformNeedsRestore = false;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._observeView = function (
  frameState,
) {
  const additionalViews = (frameState._sceneGISObservers ?? [])
    .filter((state) => state.gaussianTargets?.includes(this._primitive))
    .map((state) =>
      observeGaussianMacroChunkView(
        {
          ...frameState,
          camera: state.camera,
          cullingVolume: state.cullingVolume,
        },
        state.resolution,
      ),
    );
  const mainObservation = observeGaussianMacroChunkView(frameState);
  const observation = additionalViews.length
    ? Object.freeze({
        ...mainObservation,
        additionalViews: Object.freeze(additionalViews),
      })
    : mainObservation;
  if (!this._index) {
    this._observation = observation;
    return false;
  }
  if (!gaussianMacroChunkViewChanged(this._observation, observation)) {
    if (this._renderTransformNeedsRestore) {
      this._updateRenderTransform(frameState);
    }
    return false;
  }
  // transformChanged() clears the observation, so even an unchanged local
  // center gets a fresh ordering epoch after a model transform change.
  const previousView = this._observation ? this._view : undefined;
  this._observation = observation;
  this._viewGeneration++;
  this._statistics.viewGeneration = this._viewGeneration;
  this._view = createGaussianMacroChunkFrozenView({
    observation,
    effectiveModelMatrix: this._primitive._effectiveModelMatrix,
    selectionEpochGeneration: this._viewGeneration,
    modelTransformGeneration: this._transformGeneration,
  });
  // The radial sort key depends on the exact local center, not direction or
  // projection. Keep its epoch separate from render/selection freshness;
  // existing intent/result/upload proofs retain their original epoch.
  if (
    !previousView ||
    this._view.cameraPositionScene.some(
      (value, component) =>
        value !== previousView.cameraPositionScene[component],
    )
  ) {
    this._orderingViewGeneration = this._viewGeneration;
    this._statistics.orderingViewGeneration = this._orderingViewGeneration;
  }
  this._updateRenderTransform(frameState);
  this._evaluatedPlanKey = undefined;
  return true;
};

_SceneGISGaussianSegmentedRuntimeController.prototype._initializeComponents =
  function (frameState) {
    this._statistics.componentInitializationStartedMilliseconds =
      performance.now() - this._timingOrigin;
    this._index = validateSegmentedHierarchyRuntimeIndex(this._loader.index);
    this._sortBounds = this._index.readNodeContentBounds(
      this._index.rootNodeIndex,
      new Float64Array(6),
    );
    if (!this._provider) {
      throw new DeveloperError("Segmented descriptor provider was not created");
    }
    const options = this._options;
    this._initializePersistentCache();
    const leaseIdentity = `segmented-route:${this._index.artifactIdentityHex}`;
    this._leaseIdentity = leaseIdentity;
    this._pageLimits = pageLimits(options);
    this._presentationLimits = presentationLimits(options, frameState.context);
    Matrix4.multiply(
      this._primitive._modelMatrix,
      Matrix4.fromArray(this._index.localToFixed),
      this._primitive._effectiveModelMatrix,
    );
    this._transformGeneration++;
    this._statistics.transformGeneration = this._transformGeneration;
    this._observation = undefined;
    this._view = undefined;
    const maxShDegree = this._index.maxShDegree;
    this._primitive._maxShDegree = maxShDegree;
    this._cache = new _SceneGISGaussianStreamCache({
      maximumBytes: options.maximumCpuPageBytes,
      maximumCoreBytes: options.maximumCpuPageBytes,
      maximumShBytes: options.maximumCpuPageBytes,
      snapshotLeaseIdentity: leaseIdentity,
    });
    this._pageBackend = new _SceneGISGaussianSegmentedGlobalContentAtlas({
      artifactIdentity: this._provider.artifactIdentity,
      maxShDegree,
      maximumBytes: options.maximumGpuPageBytes,
      maximumTextureSize: this._presentationLimits.maximumTextureSize,
      maximumTextureArrayLayers:
        this._presentationLimits.maximumTextureArrayLayers,
      context: frameState.context,
      captureFootprintDiagnostics: this._captureFootprintDiagnostics,
    });
    this._gpuLedger = new _SceneGISGaussianSegmentedPageBindingLedger({
      artifactIdentity: this._provider.artifactIdentity,
      leaseIdentity,
      maximumBytes: options.maximumGpuPageBytes,
      maxShDegree,
      validateBindingReceipt: (receipt, descriptor, owner) =>
        this._pageBackend.validateBindingReceipt(receipt, descriptor, owner),
      releaseBinding: (receipt, descriptor) =>
        this._pageBackend.releaseBinding(receipt, descriptor),
      retainUnownedPages: true,
    });
    this._sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      maximumWorkingSetBytes: options.maximumSortWorkingSetBytes,
      taskProcessor: options.taskProcessor,
    });
    this._resources = new _SceneGISGaussianSegmentedGlobalPresentationResources(
      {
        context: frameState.context,
        contentAtlas: this._pageBackend,
        captureFootprintDiagnostics: this._captureFootprintDiagnostics,
      },
    );
    this._renderResources = new _SceneGISGaussianSegmentedGlobalRenderResources(
      {
        primitive: this._primitive,
        frameState,
      },
    );
    const resolvePage = (pageId) => {
      const entry = this._cache.peek(pageId);
      if (!entry) {
        return { entry, descriptor: undefined, payload: undefined };
      }
      let source = this._pageSources.get(entry);
      if (!source) {
        source = { entry, descriptor: entry?.page, payload: entry?.payload };
        this._pageSources.set(entry, source);
      }
      return source;
    };
    this._sourceBoundingSphere = sourceBoundsSphere(this._index);
    this._d3 = new _SceneGISGaussianSegmentedGlobalPresentationAdapter({
      index: this._index,
      d1: d1Authority(),
      resources: this._resources,
      sorter: this._sorter,
      renderResources: this._renderResources,
      pageBackend: this._pageBackend,
      retainedCorePageIds: () => this._gpuLedger.warmPageIds,
      corePagePositionBytes: (pageId) =>
        this._provider.readPageRequest(pageId).splatCount * 12,
      resolvePage,
      platformLimits: this._presentationLimits,
      boundingVolume: BoundingSphere.transform(
        this._sourceBoundingSphere,
        this._primitive._effectiveModelMatrix,
      ),
    });
    this._d2 = new _SceneGISGaussianSegmentedResourceAdapter({
      descriptorProvider: this._provider,
      loader: this._loader,
      cache: this._cache,
      gpuLedger: this._gpuLedger,
      presentation: this._d3,
      leaseIdentity,
      maximumCpuBytes: options.maximumCpuBytes,
      maximumGpuBytes: options.maximumGpuBytes,
      workerReserveBytes: options.maximumSortWorkingSetBytes,
      persistentStagingReserveBytes: this._persistentStagingReserveBytes,
      gpuAtlasAllocatedBytes:
        this._pageBackend.statistics.allocatedTextureBytes,
      createPhysicalSnapshot: (receipt) =>
        createSegmentedAssetPagePhysicalSnapshot(this._index, receipt),
      validatePhysicalSnapshot: (snapshot) =>
        validateSegmentedAssetPagePhysicalSnapshot(this._index, snapshot),
    });
    this._d3.attachResourceAdapter(this._d2);
    this._observeView(frameState);
    this._phase = PHASE.COMPONENTS_READY;
    this._statistics.componentInitializationCompletedMilliseconds =
      performance.now() - this._timingOrigin;
    this._startBootstrap();
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._initializePersistentCache =
  function () {
    const options = this._options;
    if (options.usePersistentCache !== true || this._persistentCache) {
      return;
    }
    const headroom = Math.max(
      0,
      options.maximumCpuBytes -
        options.maximumCpuPageBytes -
        options.maximumSortWorkingSetBytes -
        this._provider.compactIndexBytes,
    );
    const stagingBytes = Math.min(
      options.maximumPersistentCacheStagingBytes,
      Math.floor(headroom / 4),
    );
    if (stagingBytes === 0) {
      this._persistentCacheDisabledReason = "cpu-staging-unavailable";
      return;
    }
    let cache;
    try {
      const create =
        options.persistentCacheFactory ??
        ((value) => new _SceneGISGaussianStreamPersistentCache(value));
      cache = create({
        descriptorProvider: this._provider,
        // Each public route has its own storage owner, quota and lifecycle.
        databaseName: "CesiumGaussianSegmentedStreamCache",
        maximumBytes: options.maximumPersistentCacheBytes,
        maximumStagingBytes: stagingBytes,
        requestPersistentStorage: options.requestPersistentStorage,
      });
      this._loader.setPersistentCache(cache);
      this._persistentCache = cache;
      this._persistentStagingReserveBytes = stagingBytes;
    } catch (error) {
      cache?.destroy();
      this._persistentCacheDisabledReason = error?.name ?? "Error";
    }
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._destroyPersistentCache =
  function () {
    this._persistentCache?.destroy();
    this._persistentCache = undefined;
    this._persistentStagingReserveBytes = 0;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._startBootstrap =
  function () {
    this._statistics.bootstrapPlanningStartedMilliseconds =
      performance.now() - this._timingOrigin;
    const cut = createSegmentedActiveCut(this._index, {
      maximumSelectedSplats: this._options.maximumSelectedSplats,
    });
    const empty = emptySnapshot(this._index, this._leaseIdentity);
    const plan = planSegmentedAssetPageBootstrap(
      this._index,
      cut,
      empty,
      this._pageLimits,
    );
    const coreIds = plan.requiredCorePageIds;
    const reservation = reserveSegmentedGlobalPresentation(
      this._index,
      cut,
      coreIds,
      [],
      this._presentationLimits,
    );
    const sort = targetSorterResourceRequirements(
      this,
      cut,
      coreIds,
      new Float64Array(11),
    );
    if (sort.totalBytes > this._options.maximumSortWorkingSetBytes) {
      throw new DeveloperError("Bootstrap exceeds Worker reserve");
    }
    const work = this._d2.beginBootstrapWork({
      targetOwnershipIdentity: plan,
      requiredCorePageIds: coreIds,
      optionalShPageIds: [],
      presentationCpuBytes: reservation.cpuBytes,
      presentationGpuBytes: reservation.gpuBytes,
    });
    const demanded = this._d2.requestRequiredPages(work);
    const demandedIds = new Set(demanded);
    this._statistics.demandedPages += demanded.length;
    this._content = {
      kind: "BOOTSTRAP",
      work,
      acceptedIds: new Set(coreIds.filter((id) => !demandedIds.has(id))),
      plan,
      cut,
      coreIds,
      shIds: new Uint32Array(0),
      reservation,
      boundIds: new Set(),
      bindIds: unique([...coreIds]),
      bindCursor: 0,
      viewGeneration: this._viewGeneration,
      transformGeneration: this._transformGeneration,
      phase: "PAGES",
    };
    this._phase = PHASE.ROOT_WORK;
    this._statistics.bootstrapPlanningCompletedMilliseconds =
      performance.now() - this._timingOrigin;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._acceptCompletions =
  function () {
    const completions = this._loader.drainCompleted();
    if (
      completions.length > 0 &&
      this._content?.kind === "BOOTSTRAP" &&
      this._statistics.bootstrapPageCompletionMilliseconds === undefined
    ) {
      this._statistics.bootstrapPageCompletionMilliseconds =
        performance.now() - this._timingOrigin;
    }
    for (let index = 0; index < completions.length; index++) {
      const completion = completions[index];
      try {
        if (this._content) {
          if (
            this._d2.acceptPageWorkCompletion(this._content.work, completion)
          ) {
            this._content.acceptedIds.add(completion.page.index);
          }
        } else {
          completion.release?.();
        }
      } catch (error) {
        for (
          let remainder = index + 1;
          remainder < completions.length;
          remainder++
        ) {
          completions[remainder].release?.();
        }
        throw error;
      }
    }
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._consumePageWorkSettlements =
  function () {
    const settlements = this._loader.drainPageWorkSettlements();
    if (settlements.length === 0 || !this._content) {
      return false;
    }
    const result = this._d2.consumePageWorkSettlements(
      this._content.work,
      settlements,
    );
    if (result.coreFailed) {
      this._beginCleanup(
        this._content,
        "ABORT",
        this._d3?.current ? "READY" : "FAILED",
      );
      return true;
    }
    return false;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._bindPages = function (
  textureUploadBudget,
) {
  this._statistics.lastFrameGpuPageFeedOperations = 0;
  this._statistics.lastFrameGpuPageFeedBytes = 0;
  const content = this._content;
  if (!content || content.phase !== "PAGES") {
    return;
  }
  this._d3.beginCorePreparation(content);
  let operationBudget = this._options.maximumGpuFeedOperationsPerFrame;
  let byteBudget = Math.min(
    this._options.maximumGpuFeedBytesPerFrame,
    textureUploadBudget?.remainingBytes ?? Number.MAX_SAFE_INTEGER,
  );
  if (
    operationBudget === 0 ||
    this._options.maximumGpuFeedBytesPerFrame === 0
  ) {
    return;
  }
  let operations = 0;
  let bytes = 0;
  const workStarted = performance.now();
  const bind = (pageId, input) => {
    const entry = this._cache.peek(pageId);
    const footprint = computeSegmentedAtlasPageFootprint(
      entry.page.splatCount,
      entry.page.semantic,
      this._index.maxShDegree,
    ).uploadBytes;
    const existing = this._pageBackend.retainedBindingReceipt(entry.page);
    const uploadBytes = existing ? 0 : footprint;
    if (operationBudget === 0 || uploadBytes > byteBudget) {
      return false;
    }
    const firstBootstrapBind =
      content.kind === "BOOTSTRAP" &&
      this._statistics.bootstrapFirstBindStartedMilliseconds === undefined;
    if (firstBootstrapBind) {
      this._statistics.bootstrapFirstBindStartedMilliseconds =
        performance.now() - this._timingOrigin;
    }
    let receipt = existing;
    if (!receipt) {
      // Total free bytes do not guarantee a contiguous range in this semantic's
      // atlas. Release only unprotected history before consuming the receipt.
      while (
        this._pageBackend.canAllocatePage &&
        !this._pageBackend.canAllocatePage(entry.page)
      ) {
        const eviction = this._d2.evictWarmGpuPages(footprint);
        if (eviction.debts.length > 0 || eviction.releasedBytes === 0) {
          throw new DeveloperError("Segmented Page atlas has no free range");
        }
      }
      receipt = this._pageBackend.createBindingReceipt(entry.page, input);
    } else if (entry.page.semantic === 1 && input) {
      discardSegmentedPreparedCoreReceipt(input);
    }
    byteBudget -= uploadBytes;
    if (textureUploadBudget) {
      textureUploadBudget.remainingBytes -= uploadBytes;
    }
    if (!content.boundIds.has(pageId)) {
      try {
        this._d2.reserveAndBindGpuPage(content.work, pageId, receipt);
      } catch (error) {
        if (!existing && !this._gpuLedger._pages.has(pageId)) {
          this._pageBackend.releaseBinding(receipt, entry.page);
        }
        throw error;
      }
      content.boundIds.add(pageId);
    }
    if (firstBootstrapBind) {
      this._statistics.bootstrapFirstBindCompletedMilliseconds =
        performance.now() - this._timingOrigin;
    }
    operationBudget--;
    if (!existing) {
      operations++;
      bytes += footprint;
    }
    return true;
  };
  const preparation = content.preparationOwner;
  if (preparation?.sortError) {
    throw preparation.sortError;
  }
  if (preparation) {
    if (!preparation.sortResult) {
      return;
    }
    preparation.uploadCursor ??= 0;
    while (preparation.uploadCursor < preparation.pages.length) {
      const index = preparation.uploadCursor;
      if (
        !bind(
          preparation.pages[index].pageIndex,
          preparation.sortResult.receipts[index],
        )
      ) {
        break;
      }
      preparation.sortResult.receipts[index] = undefined;
      preparation.uploadCursor++;
    }
    if (preparation.uploadCursor === preparation.pages.length) {
      this._d3.releaseCorePreparation(content);
    }
  }
  if (!content.preparationOwner) {
    const candidates = [];
    let preparationBytes = 0;
    const bindIds = content.bindIds;
    for (let inspected = 0; inspected < bindIds.length; inspected++) {
      const pageId = bindIds[content.bindCursor];
      content.bindCursor = (content.bindCursor + 1) % bindIds.length;
      this._statistics.bindInspections++;
      if (!content.acceptedIds.has(pageId)) {
        continue;
      }
      const entry = this._cache.peek(pageId);
      if (!entry) {
        throw new DeveloperError("Accepted Core Page lost its CPU lease");
      }
      if (entry.page.semantic !== 1) {
        if (!content.boundIds.has(pageId)) {
          bind(pageId, entry.payload);
        }
        continue;
      }
      const prepared = this._d3.hasPreparedCore(pageId);
      const existing = this._pageBackend.retainedBindingReceipt(entry.page);
      if (prepared && existing) {
        if (!content.boundIds.has(pageId)) {
          bind(pageId);
        }
        continue;
      }
      const uploadBytes = computeSegmentedAtlasPageFootprint(
        entry.page.splatCount,
        1,
        0,
      ).uploadBytes;
      if (preparationBytes + uploadBytes > CORE_PREPARATION_WINDOW_BYTES) {
        continue;
      }
      preparationBytes += uploadBytes;
      candidates.push(pageId);
    }
    if (candidates.length) {
      this._d3.queueCorePreparation(content, candidates);
    }
  }
  this._statistics.gpuPageFeedOperations += operations;
  this._statistics.gpuPageFeedBytes += bytes;
  if (operations > 0) {
    this._statistics.gpuPageFeedFrames++;
    this._statistics.maximumGpuFeedWorkMilliseconds = Math.max(
      this._statistics.maximumGpuFeedWorkMilliseconds,
      performance.now() - workStarted,
    );
  }
  this._statistics.lastFrameGpuPageFeedOperations = operations;
  this._statistics.lastFrameGpuPageFeedBytes = bytes;
};

_SceneGISGaussianSegmentedRuntimeController.prototype._prepareContent =
  function (content = this._content) {
    if (
      !content ||
      content.phase !== "PAGES" ||
      content.work.state !== "GPU_READY" ||
      content.preparationOwner ||
      !isSortCenterInRange(this._sortBounds, this._view.cameraPositionScene)
    ) {
      return;
    }
    if (content.kind === "BOOTSTRAP") {
      this._statistics.bootstrapPreparationStartedMilliseconds ??=
        performance.now() - this._timingOrigin;
    }
    const snapshot = this._d2.capturePhysicalSnapshot(content.work);
    let prepared;
    if (content.kind === "BOOTSTRAP") {
      prepared = prepareSegmentedAssetPageBootstrapPublication(
        this._index,
        content.plan,
        snapshot,
      );
    } else {
      prepared = prepareSegmentedConvergedAssetPagePublication(
        this._index,
        this._currentCut,
        this._currentOwnership,
        content.convergedPlan,
        content.plan,
        snapshot,
      );
    }
    if (!prepared) {
      this._beginCleanup(
        content,
        "ABORT",
        this._d3?.current ? "READY" : "FAILED",
      );
      return;
    }
    const heldCpuPageIds = new Set(snapshot.cpuPageIds);
    const heldGpuPageIds = new Set(snapshot.gpuPageIds);
    const exactCoreIds = prepared.targetOwnership.corePageIds;
    const exactShIds = Uint32Array.from(
      [...prepared.targetOwnership.optionalShPageIds].filter(
        (pageId) => heldCpuPageIds.has(pageId) && heldGpuPageIds.has(pageId),
      ),
    );
    const exactSnapshot = this._d2.rebindTargetPages(
      content.work,
      exactCoreIds,
      exactShIds,
    );
    validateSegmentedGlobalPresentationReservation(
      content.reservation,
      this._index,
      content.targetCut ?? content.cut,
      content.reservationCoreIds ?? content.coreIds,
      content.reservationShIds ?? content.shIds,
    );
    const ticket = this._d2.preparePresentation(content.work, {
      targetCut: prepared.targetCut,
      targetOwnershipIdentity: content.plan,
      preparedPagePublication: prepared,
      contentGeneration: this._statistics.contentPublications + 1,
      mappingGeneration: this._statistics.contentPublications + 1,
      viewGeneration: this._orderingViewGeneration,
      sortCenter: this._view.cameraPositionScene,
      ...(content.checkpointCoreContent && {
        checkpointCoreContent: content.checkpointCoreContent,
      }),
    });
    const description = content.work.presentationDescription;
    if (
      description.cpuBytes > content.reservation.cpuBytes ||
      description.gpuBytes > content.reservation.gpuBytes ||
      description.selectedSplatCount !==
        content.reservation.selectedSplatCount ||
      description.slotCount !== content.reservation.slotCount
    ) {
      throw new DeveloperError(
        "Segmented presentation description violates exact reservation",
      );
    }
    content.snapshot = exactSnapshot;
    content.prepared = prepared;
    content.ticket = ticket;
    content.phase = "PRESENTATION";
    this._phase =
      content.kind === "BOOTSTRAP"
        ? PHASE.ROOT_PRESENTATION
        : PHASE.TRANSITION_PRESENTATION;
    if (content.kind === "BOOTSTRAP") {
      this._statistics.bootstrapPreparationCompletedMilliseconds =
        performance.now() - this._timingOrigin;
    }
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._advanceContent =
  function (
    maximumTextureUploads = this._options.maximumTextureUploadsPerFrame,
    textureUploadBudget,
    content = this._content,
  ) {
    if (!content || (content === this._content && this._checkpoint)) {
      return;
    }
    if (content.transformGeneration !== this._transformGeneration) {
      this._beginCleanup(
        content,
        "ABORT",
        this._d3?.current ? "READY" : "FAILED",
      );
      return;
    }
    if (content.phase === "PAGES") {
      this._prepareContent(content);
      if (
        (this._content !== content && this._checkpoint !== content) ||
        content.phase !== "PRESENTATION" ||
        this._cleanup
      ) {
        return;
      }
      // A newly prepared ticket can start Mapping and Ordering with this call's
      // remaining budget; it does not need another render-frame boundary.
    }
    if (content.kind === "BOOTSTRAP") {
      this._statistics.bootstrapPresentationStartedMilliseconds ??=
        performance.now() - this._timingOrigin;
    }
    const progress = this._d3.advance(content.ticket, {
      maximumMappingEntries: this._options.maximumMappingEntriesPerFrame,
      maximumTextureUploads,
      ...(textureUploadBudget && { textureUploadBudget }),
      maximumPositionExtractions:
        this._options.maximumSortPositionExtractionsPerFrame,
    });
    if (!progress.ready || this._orderingActive) {
      return;
    }
    const committed = this._d2.commitPresentation(
      content.work,
      progress.receipt,
    );
    this._currentCut = committed.presentation.presentation.cut;
    this._currentOwnership = committed.presentation.presentation.ownership;
    this._currentSnapshot = this._d2.currentPhysicalSnapshot;
    this._statistics.contentPublications++;
    this._statistics.physicalContentPublicationCount =
      this._statistics.contentPublications;
    if (content.checkpointCoreContent) {
      this._statistics.checkpointPublications++;
      this._statistics.firstCheckpointMilliseconds ??=
        performance.now() - this._timingOrigin;
      content.phase = "RETIRING";
      return;
    }
    if (content.kind === "TRANSITION") {
      this._statistics.finalTargetPublications++;
      this._statistics.firstFinalTargetMilliseconds ??=
        performance.now() - this._timingOrigin;
    }
    this._content = undefined;
    this._evaluatedPlanKey = undefined;
    this._phase = PHASE.RETIREMENT;
    this._state = STATE.DRAWABLE;
    if (content.kind === "BOOTSTRAP") {
      this._statistics.bootstrapPresentationCompletedMilliseconds =
        performance.now() - this._timingOrigin;
    }
    this._cleanup = {
      operation: "RETIRE",
      work: content.work,
      initiated: false,
      targetState: "READY",
    };
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._advanceRetirement =
  function () {
    this._advanceCleanup();
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._startTransition =
  function (
    convergedPlan,
    acquisitionContent,
    readySnapshot,
    allowCheckpoint = true,
  ) {
    const planningView = acquisitionContent?.planningView ?? this._view;
    const transitionStarted = performance.now();
    this._statistics.lastTransitionPlanningStartedMilliseconds =
      transitionStarted - this._timingOrigin;
    const transition = planSegmentedConvergedAssetPageTransition(
      this._index,
      this._currentOwnership,
      this._currentCut,
      convergedPlan,
      planningView,
      readySnapshot ?? this._currentSnapshot,
      this._pageLimits,
    );
    const transitionPlanned = performance.now();
    this._statistics.lastTransitionPlanningCompletedMilliseconds =
      transitionPlanned - this._timingOrigin;
    this._statistics.lastTransitionPlanningDurationMilliseconds =
      transitionPlanned - transitionStarted;
    if (transition.acceptedStepCount === 0) {
      if (acquisitionContent) {
        abortSegmentedAssetPageTransition(this._index, transition);
        return false;
      }
      this._resourceBlocker = makeResourceBlocker(
        this,
        convergedPlan,
        transition.blocker ?? "RESOURCE_ADMISSION_BLOCKED",
      );
      this._stopReason = "RESOURCE_BLOCKED";
      this._state = STATE.RESOURCE_BLOCKED;
      abortSegmentedAssetPageTransition(this._index, transition);
      return false;
    }
    const targetCut = commitSegmentedConvergedActiveCutPlan(
      this._index,
      this._currentCut,
      convergedPlan,
      planningView,
      transition.acceptedStepCount,
    ).cut;
    const finalCoreIds = transition.targetCorePageIds;
    const bridgePlan =
      !acquisitionContent &&
      allowCheckpoint &&
      !finalCoreIds.every((id) => this._gpuLedger._pages.has(id))
        ? planSegmentedProgressiveBridge(
            this._index,
            this._currentCut,
            convergedPlan,
            planningView,
            { maximumBytes: CORE_PREPARATION_WINDOW_BYTES },
          )
        : undefined;
    const coreIds = unique([
      ...finalCoreIds,
      ...(bridgePlan?.additionalCorePageIds ?? []),
    ]);
    const shIds = acquisitionContent
      ? transition.targetOptionalShPageIds.filter(
          (id) =>
            acquisitionContent.boundIds.has(id) ||
            this._d2.currentPageIds.includes(id),
        )
      : transition.targetOptionalShPageIds;
    const composition = composeSegmentedGlobalPresentationSlots(
      this._index,
      targetCut,
    );
    const reservationCoreIds = unique(composition.fragmentCorePageIds);
    const reservationShIds = unique(
      [...composition.fragmentShPageIds].filter(
        (pageId) => pageId !== INVALID_PAGE_ID,
      ),
    );
    let work;
    try {
      const reservation = reserveSegmentedGlobalPresentation(
        this._index,
        targetCut,
        reservationCoreIds,
        reservationShIds,
        this._presentationLimits,
      );
      const workOptions = {
        sourcePresentationIdentity: this._d2.currentPresentationIdentity,
        targetOwnershipIdentity: transition,
        requiredCorePageIds: coreIds,
        preferredCorePageIds: bridgePlan?.requiredCorePageIds,
        optionalShPageIds: shIds,
        presentationCpuBytes: reservation.cpuBytes,
        presentationGpuBytes: reservation.gpuBytes,
      };
      work = acquisitionContent
        ? this._d2.beginCheckpointWork(acquisitionContent.work, workOptions)
        : this._d2.beginTransitionWork(workOptions);
      const retainedPageIds = new Set(this._d2.currentPageIds);
      const content = {
        kind: "TRANSITION",
        work,
        plan: transition,
        convergedPlan,
        targetCut,
        coreIds,
        finalCoreIds,
        bridgePlan,
        shIds,
        reservationCoreIds,
        reservationShIds,
        reservation,
        checkpointCoreContent: acquisitionContent,
        startedAt: performance.now(),
        planningView,
        boundIds: new Set(
          [...coreIds, ...shIds].filter(
            (pageId) => acquisitionContent || retainedPageIds.has(pageId),
          ),
        ),
        bindIds: Uint32Array.from(
          new Set([
            ...(bridgePlan?.requiredCorePageIds ?? []),
            ...coreIds,
            ...shIds,
          ]),
        ),
        bindCursor: 0,
        viewGeneration: this._viewGeneration,
        transformGeneration: this._transformGeneration,
        phase: "PAGES",
      };
      if (acquisitionContent) {
        this._checkpoint = content;
        return true;
      }
      this._content = content;
      this._statistics.checkpointBridgeBytes +=
        bridgePlan?.additionalStoredBytes ?? 0;
      const demanded = this._d2.requestRequiredPages(work);
      const demandedIds = new Set(demanded);
      this._content.acceptedIds = new Set(
        [...coreIds, ...shIds].filter((id) => !demandedIds.has(id)),
      );
      this._statistics.demandedPages += demanded.length;
      this._phase = PHASE.TRANSITION_WORK;
      this._state = STATE.TRANSITIONING;
      this._stopReason = "TRANSITIONING";
      this._resourceBlocker = undefined;
      this._statistics.lastTransitionStartCompletedMilliseconds =
        performance.now() - this._timingOrigin;
      return true;
    } catch (error) {
      if (acquisitionContent) {
        if (work) {
          this._d2.abortWork(work, "checkpoint-admission");
        }
        abortSegmentedAssetPageTransition(this._index, transition);
        if (isResourceAdmissionError(error)) {
          return false;
        }
        throw error;
      }
      if (!work && bridgePlan && isResourceAdmissionError(error)) {
        abortSegmentedAssetPageTransition(this._index, transition);
        return this._startTransition(
          convergedPlan,
          undefined,
          undefined,
          false,
        );
      }
      if (work && this._content) {
        this._beginCleanup(this._content, "ABORT", "READY");
      } else {
        abortSegmentedAssetPageTransition(this._index, transition);
      }
      if (isResourceAdmissionError(error)) {
        this._resourceBlocker = makeResourceBlocker(
          this,
          convergedPlan,
          error.message,
        );
        this._stopReason = "RESOURCE_BLOCKED";
        this._state = STATE.RESOURCE_BLOCKED;
        return false;
      }
      throw error;
    }
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._resumeFinalAcquisition =
  function () {
    const content = this._content;
    if (!content || !content.pureTransactionReleased) {
      return;
    }
    const plan = rebaseSegmentedConvergedActiveCutPlan(
      this._index,
      this._currentCut,
      content.convergedPlan,
      content.planningView,
    );
    const transition = planSegmentedConvergedAssetPageTransition(
      this._index,
      this._currentOwnership,
      this._currentCut,
      plan,
      content.planningView,
      this._d2.capturePhysicalSnapshot(content.work, true),
      this._pageLimits,
    );
    if (
      transition.acceptedStepCount !== plan.stepCount ||
      plan.stepCount === 0
    ) {
      abortSegmentedAssetPageTransition(this._index, transition);
      throw new DeveloperError("Checkpoint continuation lost its final target");
    }
    try {
      this._d2.rebaseAcquisitionWork(content.work, transition, content.coreIds);
    } catch (error) {
      abortSegmentedAssetPageTransition(this._index, transition);
      throw error;
    }
    content.convergedPlan = plan;
    content.plan = transition;
    content.pureTransactionReleased = false;
    this._phase = PHASE.TRANSITION_WORK;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._maybeStartCheckpoint =
  function () {
    const content = this._content;
    if (
      !content ||
      !content.finalCoreIds ||
      content.kind !== "TRANSITION" ||
      content.phase !== "PAGES" ||
      this._checkpoint ||
      content.checkpointAttempted ||
      performance.now() - content.startedAt < 200 ||
      content.finalCoreIds.every((id) => content.boundIds.has(id)) ||
      content.checkpointReadyCount === content.boundIds.size
    ) {
      return;
    }
    content.checkpointReadyCount = content.boundIds.size;
    const snapshot = this._d2.capturePhysicalSnapshot(content.work, true);
    const plan = planSegmentedReadyConvergedActiveCut(
      this._index,
      this._currentCut,
      content.convergedPlan,
      content.planningView,
      snapshot,
      Uint32Array.from(this._sorter._confirmed.keys()),
      content.bridgePlan,
    );
    if (
      !plan.isIntermediate ||
      plan.stepCount === 0 ||
      plan.metrics.readyUpgradeCount === 0
    ) {
      return;
    }
    // A single substantial batch avoids spending a full Mapping/Ordering on a
    // handful of newly arrived splats. This is an admission threshold, not LOD.
    const minimumGain = Math.max(
      1,
      Math.min(100000, Math.ceil(content.targetCut.selectedSplatCount * 0.1)),
    );
    if (
      plan.finalCut.selectedSplatCount - this._currentCut.selectedSplatCount <
      minimumGain
    ) {
      return;
    }
    content.checkpointAttempted = true;
    this._statistics.checkpointAttempts++;
    this._releasePureTransaction(content);
    if (!this._startTransition(plan, content, snapshot)) {
      this._resumeFinalAcquisition();
    }
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._finishCheckpoint =
  function (abort = false) {
    const checkpoint = this._checkpoint;
    if (!checkpoint) {
      return true;
    }
    const retire = checkpoint.phase === "RETIRING";
    if (!retire && !abort) {
      return false;
    }
    if (!checkpoint.cleanupInitiated) {
      checkpoint.cleanupInitiated = true;
      if (retire) {
        this._d2.finalizeRetirement(checkpoint.work);
      } else {
        this._d2.abortWork(checkpoint.work, "checkpoint-cancelled");
      }
    }
    const tokens = this._d2.cleanupDebtTokens;
    if (tokens.length > 0) {
      this._d2.settleCleanupDebt(tokens[0]);
      return false;
    }
    if (checkpoint.work.state !== (retire ? "RETIRED" : "ABORTED")) {
      return false;
    }
    if (!retire) {
      this._releasePureTransaction(checkpoint, true);
    }
    this._checkpoint = undefined;
    if (!abort) {
      this._resumeFinalAcquisition();
    }
    return true;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._createLatestViewPlan =
  function () {
    this._statistics.selectionEvaluations++;
    let convergedPlan;
    try {
      const planningStarted = performance.now();
      this._statistics.lastSelectionPlanningStartedMilliseconds =
        planningStarted - this._timingOrigin;
      convergedPlan = planSegmentedConvergedActiveCut(
        this._index,
        this._currentCut,
        this._view,
        {
          maximumSelectedSplats: this._options.maximumSelectedSplats,
          maximumCoverageSlots: this._options.maximumCoverageSlots,
          refineErrorPixels: this._options.refineErrorPixels,
          coarsenErrorPixels: this._options.coarsenErrorPixels,
          minimumLeafLogicalLevel: this._options.minimumLeafLogicalLevel,
        },
      );
      const planningCompleted = performance.now();
      this._statistics.lastSelectionPlanningCompletedMilliseconds =
        planningCompleted - this._timingOrigin;
      this._statistics.lastSelectionPlanningDurationMilliseconds =
        planningCompleted - planningStarted;
    } catch (error) {
      if (error && (typeof error === "object" || typeof error === "function")) {
        planningInvariantErrors.add(error);
      }
      throw error;
    }
    this._lastRecoverableError = undefined;
    this._planMetrics = convergedPlan.metrics;
    this._statistics.visitedNodes +=
      convergedPlan.metrics.visitedNodeCount ?? 0;
    this._statistics.logicalClosureStepCount += convergedPlan.stepCount;
    return convergedPlan;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._contentMatchesTransform =
  function () {
    // Finish this bounded, valid cut before planning against the latest view.
    // Camera motion must not repeatedly discard Page, Mapping or sort work.
    // Model edits still invalidate the frozen spatial plan immediately.
    return this._content.transformGeneration === this._transformGeneration;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._planLatestView =
  function () {
    if (this._phase !== PHASE.READY || this._content || !this._view) {
      return;
    }
    const evaluationKey = planEvaluationKey(this);
    if (evaluationKey === this._evaluatedPlanKey) {
      return;
    }
    this._evaluatedPlanKey = evaluationKey;
    const convergedPlan = this._createLatestViewPlan();
    if (convergedPlan.stepCount > 0) {
      try {
        if (this._startTransition(convergedPlan)) {
          return;
        }
      } catch (error) {
        if (
          error &&
          (typeof error === "object" || typeof error === "function")
        ) {
          planningInvariantErrors.add(error);
        }
        throw error;
      }
    }
    if (convergedPlan.stepCount === 0) {
      this._observerReadyGeneration = this._viewGeneration;
      this._stopReason =
        convergedPlan.stopReason ??
        SEGMENTED_ACTIVE_CUT_STOP_REASON.DETAIL_EXHAUSTED;
      this._resourceBlocker = undefined;
      this._state = STATE.READY;
    }
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._requestLatestOrdering =
  function () {
    if (
      !this._d3?.current ||
      !this._view ||
      this._orderingActive ||
      this._content?.phase === "PRESENTATION" ||
      this._checkpoint?.phase === "PRESENTATION" ||
      this._d3.currentViewGeneration >= this._orderingViewGeneration ||
      this._orderingRequestedViewGeneration >= this._orderingViewGeneration ||
      !isSortCenterInRange(this._sortBounds, this._view.cameraPositionScene)
    ) {
      return false;
    }
    // _view is the single latest pending request. Complete the admitted sort
    // and upload before sampling it again; let prepared content publish first.
    this._d3.requestOrderingRefresh({
      viewGeneration: this._orderingViewGeneration,
      sortCenter: this._view.cameraPositionScene,
    });
    this._orderingRequestedViewGeneration = this._orderingViewGeneration;
    this._orderingActive = true;
    return true;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._advanceOrdering =
  function (textureUploadBudget) {
    if (!this._orderingActive) {
      return;
    }
    const result = this._d3.advanceOrderingRefresh({
      maximumPositionExtractions:
        this._options.maximumSortPositionExtractionsPerFrame,
      maximumTextureUploads: this._options.maximumTextureUploadsPerFrame,
      ...(textureUploadBudget && { textureUploadBudget }),
    });
    if (result.ready) {
      this._orderingActive = false;
      this._statistics.orderingPublications++;
    }
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._publish = function (
  frameState,
) {
  const current = this._d3?.current;
  if (
    current &&
    (this._commandTransformGeneration !== this._transformGeneration ||
      this._transformedCommand !== current.command)
  ) {
    // A content successor can replace the command after the model stops moving.
    // Its bounds must consume the current transform before first submission.
    current.command.boundingVolume = BoundingSphere.transform(
      this._sourceBoundingSphere,
      this._primitive._effectiveModelMatrix,
    );
    this._commandTransformGeneration = this._transformGeneration;
    this._transformedCommand = current.command;
  }
  if (
    current &&
    this._primitive.show &&
    (frameState.passes.render || frameState.passes.pick)
  ) {
    // Translucent depth picking can reuse the preceding render command list.
    // Submit once per actual list, including after a same-frame list reset.
    if (!frameState.commandList.includes(current.command)) {
      frameState.commandList.push(current.command);
    }
    this._statistics.drawCount = 1;
  } else {
    this._statistics.drawCount = 0;
  }
};

_SceneGISGaussianSegmentedRuntimeController.prototype.captureFootprintDiagnostics =
  function (requests) {
    if (
      !this._captureFootprintDiagnostics ||
      !Array.isArray(requests) ||
      requests.length === 0 ||
      !this._d3?.current
    ) {
      throw new DeveloperError(
        "Segmented footprint diagnostics are not enabled or ready",
      );
    }
    const owner = this._d3.current.resources;
    const toHex = (bytes) =>
      Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(
        "",
      );
    return Object.freeze(
      requests.map((request) => {
        const record = this._pageBackend.diagnosticCoreRecord(
          request.pageId,
          request.pageLocalIndex,
        );
        const mapping = this._resources.diagnosticMapping(
          owner,
          request.presentationOrdinal,
        );
        const atlasCoreRecordHex = toHex(record.bytes);
        return Object.freeze({
          provider: request.provider,
          classification: request.classification,
          pageId: request.pageId,
          pageLocalIndex: request.pageLocalIndex,
          presentationOrdinal: request.presentationOrdinal,
          artifactCoreRecordHex: request.rawCoreRecordHex,
          expectedCanonicalCoreRecordHex: request.canonicalCoreRecordHex,
          atlasCoreRecordHex,
          atlasRecordByteIdentical:
            atlasCoreRecordHex === request.canonicalCoreRecordHex,
          mapping: Array.from(mapping),
          expectedPackedAddress: record.packedAddress,
          mappingRecordIdentical: mapping[0] === record.packedAddress,
        });
      }),
    );
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._releasePureTransaction =
  function (content, afterPresentationAbort = false) {
    if (
      content.pureTransactionReleased ||
      (content.ticket && !afterPresentationAbort)
    ) {
      return;
    }
    if (content.prepared) {
      abortSegmentedPreparedPagePublication(this._index, content.prepared);
    } else if (content.kind === "TRANSITION") {
      abortSegmentedAssetPageTransition(this._index, content.plan);
    }
    content.pureTransactionReleased = true;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._beginCleanup = function (
  content,
  operation,
  targetState,
) {
  if (this._cleanup) {
    if (targetState === "DESTROY") {
      this._cleanup.targetState = "DESTROY";
    }
    return;
  }
  if (operation === "ABORT") {
    this._releasePureTransaction(content);
  }
  this._cleanup = {
    operation,
    work: content.work,
    content,
    initiated: false,
    targetState,
  };
  if (this._content === content) {
    this._content = undefined;
  }
  this._phase = PHASE.CLEANUP;
  if (targetState === "READY") {
    this._state = STATE.DEGRADED;
  }
};

_SceneGISGaussianSegmentedRuntimeController.prototype._advanceCleanup =
  function () {
    const cleanup = this._cleanup;
    if (!cleanup) {
      return false;
    }
    if (!this._finishCheckpoint(true)) {
      return false;
    }
    if (
      cleanup.operation === "ABORT" &&
      !this._d3.abortCorePreparation(cleanup.content)
    ) {
      return false;
    }
    if (!cleanup.initiated) {
      cleanup.initiated = true;
      if (cleanup.operation === "RETIRE") {
        this._d2.finalizeRetirement(cleanup.work);
      } else {
        this._d2.abortWork(cleanup.work, "segmented-controller-cleanup");
      }
    }
    const tokens = this._d2.cleanupDebtTokens;
    if (tokens.length > 0) {
      this._d2.settleCleanupDebt(tokens[0]);
      return false;
    }
    const terminalPhase =
      cleanup.operation === "RETIRE" ? "RETIRED" : "ABORTED";
    if (cleanup.work.state !== terminalPhase) {
      return false;
    }
    if (cleanup.operation === "ABORT") {
      this._releasePureTransaction(cleanup.content, true);
    }
    const targetState = cleanup.targetState;
    this._cleanup = undefined;
    if (targetState === "READY") {
      this._evaluatedPlanKey = undefined;
      this._phase = PHASE.READY;
      this._state = STATE.READY;
    } else if (targetState === "RESOURCE_BLOCKED") {
      this._phase = PHASE.READY;
      this._state = STATE.RESOURCE_BLOCKED;
      this._evaluatedPlanKey = planEvaluationKey(this);
    } else if (targetState === "FAILED") {
      this._evaluatedPlanKey = undefined;
      this._failureCleanupRequested = true;
      this._phase = PHASE.DESTROYING;
    } else if (targetState === "DESTROY") {
      this._evaluatedPlanKey = undefined;
      this._phase = PHASE.DESTROYING;
      this._advanceDestroy();
    }
    return true;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype._fail = function (error) {
  if (planningInvariantErrors.has(error)) {
    this._error ??= error;
    this._state = STATE.FAILED;
    this._stopReason = "FAILED";
    this._resourceBlocker = undefined;
    if (this._content && !this._cleanup) {
      this._beginCleanup(this._content, "ABORT", "FAILED");
    } else if (!this._cleanup) {
      this._failureCleanupRequested = true;
      this._phase = PHASE.DESTROYING;
    }
    return;
  }
  if (
    this._d3?.current &&
    this._content?.convergedPlan &&
    isResourceAdmissionError(error)
  ) {
    this._lastRecoverableError = error;
    this._resourceBlocker = makeResourceBlocker(
      this,
      this._content.convergedPlan,
      error.message,
    );
    this._stopReason = "RESOURCE_BLOCKED";
    if (!this._cleanup) {
      this._beginCleanup(this._content, "ABORT", "RESOURCE_BLOCKED");
    }
    this._state = STATE.RESOURCE_BLOCKED;
    if (!this._cleanup) {
      this._phase = PHASE.READY;
      this._evaluatedPlanKey = planEvaluationKey(this);
    }
    return;
  }
  if (this._d3?.current) {
    this._lastRecoverableError = error;
    if (this._content && !this._cleanup) {
      this._beginCleanup(this._content, "ABORT", "READY");
    }
    this._state = STATE.DEGRADED;
    if (!this._cleanup) {
      this._phase = PHASE.READY;
      this._evaluatedPlanKey = undefined;
    }
    return;
  }
  this._error ??= error;
  this._state = STATE.FAILED;
  if (this._content && !this._cleanup) {
    this._beginCleanup(this._content, "ABORT", "FAILED");
  } else if (!this._cleanup) {
    this._failureCleanupRequested = true;
    this._phase = PHASE.DESTROYING;
  }
};

_SceneGISGaussianSegmentedRuntimeController.prototype._advanceDestroy =
  function (preserveFailure = false) {
    if (this._phase === PHASE.DESTROYED) {
      return;
    }
    if (this._componentsDestroyed) {
      this._phase = preserveFailure ? PHASE.FAILED : PHASE.DESTROYED;
      this._state = preserveFailure ? STATE.FAILED : STATE.DESTROYED;
      this._failureCleanupRequested = false;
      return;
    }
    if (!this._d3) {
      this._loader.destroy();
      this._destroyPersistentCache();
      this._componentsDestroyed = true;
      this._phase = preserveFailure ? PHASE.FAILED : PHASE.DESTROYED;
      this._state = preserveFailure ? STATE.FAILED : STATE.DESTROYED;
      this._failureCleanupRequested = false;
      return;
    }
    let destroyed = this._d3.destroy();
    if (!destroyed && this._d3.destroyCleanupToken) {
      destroyed = this._d3.settleDestroyCleanupDebt(
        this._d3.destroyCleanupToken,
      );
    }
    if (destroyed) {
      this._destroyPersistentCache();
      this._componentsDestroyed = true;
      this._content = undefined;
      this._checkpoint = undefined;
      this._cleanup = undefined;
      this._orderingActive = false;
      this._transformedCommand = undefined;
      this._phase = preserveFailure ? PHASE.FAILED : PHASE.DESTROYED;
      this._state = preserveFailure ? STATE.FAILED : STATE.DESTROYED;
      this._failureCleanupRequested = false;
    }
  };

_SceneGISGaussianSegmentedRuntimeController.prototype.update = function (
  frameState,
) {
  const pickOnly = frameState.passes?.pick && !frameState.passes.render;
  if (!pickOnly) {
    this._statistics.lastFrameGpuUploadBytes = 0;
  }
  if (this._phase === PHASE.DESTROYED) {
    return;
  }
  if (this._phase === PHASE.FAILED && this._componentsDestroyed) {
    return;
  }
  if (this._failureCleanupRequested) {
    this._advanceDestroy(true);
    return;
  }
  if (this._destroyRequested) {
    if (this._cleanup) {
      this._cleanup.targetState = "DESTROY";
      this._advanceCleanup();
      return;
    }
    this._advanceDestroy();
    return;
  }
  let submitCurrent = false;
  let textureUploadBudget;
  try {
    if (pickOnly) {
      // A pick's narrow culling volume is not a new selection target. Keep the
      // displayed resources and update only the transform used by their draw.
      if (this._d3?.current) {
        this._updateRenderTransform(frameState);
        this._renderTransformNeedsRestore = true;
        submitCurrent = true;
      }
      return;
    }
    this._observeView(frameState);
    this._statistics.firstLoaderUpdateMilliseconds ??=
      performance.now() - this._timingOrigin;
    this._loader.update(undefined, this._options.maximumLoaderDeliveryBytes);
    if (
      this._loader.state === _SceneGISGaussianStreamLoader.State.FAILED ||
      this._loader.error
    ) {
      throw this._loader.error ?? new Error("Segmented Loader failed");
    }
    if (!this._index && this._loader.index) {
      this._initializeComponents(frameState);
    }
    if (!this._index) {
      return;
    }
    submitCurrent = true;
    if (this._content && !this._contentMatchesTransform()) {
      this._beginCleanup(
        this._content,
        "ABORT",
        this._d3.current ? "READY" : "FAILED",
      );
    }
    if (this._cleanup) {
      this._advanceCleanup();
      this._d3.update();
      return;
    }
    this._consumePageWorkSettlements();
    if (this._cleanup) {
      this._acceptCompletions();
      this._advanceCleanup();
      this._d3.update();
      return;
    }
    this._acceptCompletions();
    if (this._content?.phase === "PAGES") {
      this._d3.collectWorkerSettlements();
    }
    textureUploadBudget = {
      remainingBytes: this._options.maximumGpuFeedBytesPerFrame,
      remainingUploads: this._options.maximumTextureUploadsPerFrame,
    };
    // Ready Ordering for the displayed content has priority. A worker that
    // has not returned consumes nothing; Core and new content use the rest.
    this._requestLatestOrdering();
    this._advanceOrdering(textureUploadBudget);
    this._bindPages(textureUploadBudget);
    this._maybeStartCheckpoint();
    if (this._checkpoint && this._checkpoint.phase !== "RETIRING") {
      this._advanceContent(
        textureUploadBudget.remainingUploads,
        textureUploadBudget,
        this._checkpoint,
      );
    }
    this._finishCheckpoint();
    this._advanceContent(
      textureUploadBudget.remainingUploads,
      textureUploadBudget,
    );
    this._advanceRetirement();
    this._d3.update();
    this._planLatestView();
    this._requestLatestOrdering();
    this._statistics.copiedSplats = this._d3.copiedSplats;
    this._statistics.textureUploads = this._d3.uploadedResources;
  } catch (error) {
    this._fail(error);
  } finally {
    if (textureUploadBudget) {
      const uploadedBytes =
        this._options.maximumGpuFeedBytesPerFrame -
        textureUploadBudget.remainingBytes;
      this._statistics.lastFrameGpuUploadBytes = uploadedBytes;
      this._statistics.gpuUploadBytes += uploadedBytes;
      this._statistics.maximumFrameGpuUploadBytes = Math.max(
        this._statistics.maximumFrameGpuUploadBytes,
        uploadedBytes,
      );
    }
    if (submitCurrent) {
      this._publish(frameState);
    }
  }
};

_SceneGISGaussianSegmentedRuntimeController.prototype.requestDestroy =
  function () {
    if (this._phase === PHASE.DESTROYED) {
      return true;
    }
    if (this._componentsDestroyed) {
      this._destroyRequested = true;
      this._phase = PHASE.DESTROYED;
      this._state = STATE.DESTROYED;
      return true;
    }
    this._destroyRequested = true;
    this._failureCleanupRequested = false;
    // Scene.destroy tears down Context immediately after removing primitives.
    // Release the VAO and shader synchronously; Worker/page ownership can finish
    // asynchronously without calling Context methods after it has been destroyed.
    if (this._renderResources && !this._renderResources.statistics.destroyed) {
      this._renderResources.destroy();
    }
    if (this._content) {
      this._beginCleanup(this._content, "ABORT", "DESTROY");
      this._advanceCleanup();
      return false;
    }
    if (this._cleanup) {
      this._cleanup.targetState = "DESTROY";
      this._advanceCleanup();
      return false;
    }
    this._phase = PHASE.DESTROYING;
    this._advanceDestroy();
    return this._phase === PHASE.DESTROYED;
  };

_SceneGISGaussianSegmentedRuntimeController.prototype.transformChanged =
  function () {
    this._transformGeneration++;
    this._statistics.transformGeneration = this._transformGeneration;
    this._observation = undefined;
    this._evaluatedPlanKey = undefined;
  };

Object.defineProperties(_SceneGISGaussianSegmentedRuntimeController.prototype, {
  state: {
    get: function () {
      return this._state;
    },
  },
  phase: {
    get: function () {
      return this._phase;
    },
  },
  ready: {
    get: function () {
      return !!this._d3?.current;
    },
  },
  error: {
    get: function () {
      return this._error;
    },
  },
  destroyed: {
    get: function () {
      return this._phase === PHASE.DESTROYED;
    },
  },
  statistics: {
    get: function () {
      const d2 = this._d2?.resourceLedger;
      const d3 = this._d3?.statistics;
      const atlas = this._pageBackend?.statistics;
      const loader = this._loader?.statistics;
      const persistent = this._persistentCache?.statistics;
      return Object.freeze({
        ...this._statistics,
        persistentCacheEnabled: persistent?.enabled ?? false,
        persistentCacheOperational: persistent?.operational ?? false,
        persistentCacheDisabledReason:
          persistent?.disabledReason ?? this._persistentCacheDisabledReason,
        persistentCacheHitPages: persistent?.lookupHitPages ?? 0,
        persistentCacheHitBytes: persistent?.lookupHitBytes ?? 0,
        persistentCacheMissPages: persistent?.lookupMissPages ?? 0,
        persistentCacheWritePages: persistent?.writeCommittedPages ?? 0,
        persistentCacheWriteBytes: persistent?.writeCommittedBytes ?? 0,
        persistentCacheStagingBytes: persistent?.stagingBytes ?? 0,
        persistentCacheStagingReserveBytes: this._persistentStagingReserveBytes,
        phase: this._phase,
        sortDeferredByDistance: !!(
          this._sortBounds &&
          this._view &&
          !isSortCenterInRange(this._sortBounds, this._view.cameraPositionScene)
        ),
        stopReason: this._stopReason,
        selectionErrorMetric:
          this._planMetrics.selectionErrorMetric ??
          this._index?.selectionErrorMetric,
        resourceBlocker: this._resourceBlocker,
        lastRecoverableError: this._lastRecoverableError?.message,
        visibleOverThresholdSlotCount:
          this._planMetrics.visibleOverThresholdSlotCount ?? 0,
        qualityCandidateCount: this._planMetrics.qualityCandidateCount ?? 0,
        visibleAncestorCoverageOverThresholdCount:
          this._planMetrics.visibleAncestorCoverageOverThresholdCount ?? 0,
        coverageCandidateCount: this._planMetrics.coverageCandidateCount ?? 0,
        coverageBudgetAdmissibleCandidateCount:
          this._planMetrics.coverageBudgetAdmissibleCandidateCount ?? 0,
        coverageAdmittedUpgradeCount:
          this._planMetrics.coverageAdmittedUpgradeCount ?? 0,
        coverageCoarsenVetoCount:
          this._planMetrics.coverageCoarsenVetoCount ?? 0,
        largestAncestorCoveragePressurePixels:
          this._planMetrics.largestAncestorCoveragePressurePixels ?? 0,
        smallestAdmittedCoverageBenefitPixels:
          this._planMetrics.smallestAdmittedCoverageBenefitPixels ?? 0,
        coveragePressurePolicyIdentity:
          this._planMetrics.coveragePressurePolicyIdentity ??
          "ancestor-coverage-pressure-v1:32:24",
        allocationPolicyIdentity: this._planMetrics.allocationPolicyIdentity,
        canonicalRootDerived: this._planMetrics.canonicalRootDerived ?? false,
        distanceBandMeters: this._planMetrics.distanceBandMeters ?? 0,
        maximumCoverageSlots:
          this._planMetrics.maximumCoverageSlots ??
          this._options.maximumCoverageSlots,
        maximumCandidateHeapSize:
          this._planMetrics.maximumCandidateHeapSize ?? 0,
        activeSlotCount: this._planMetrics.activeSlotCount ?? 0,
        admittedEdgeCount: this._planMetrics.admittedEdgeCount ?? 0,
        skippedBudgetCandidateCount:
          this._planMetrics.skippedBudgetCandidateCount ?? 0,
        skippedCoverageSlotCandidateCount:
          this._planMetrics.skippedCoverageSlotCandidateCount ?? 0,
        largestPriorityProjectedError:
          this._planMetrics.largestPriorityProjectedError ?? 0,
        smallestAdmittedDistanceBand:
          this._planMetrics.smallestAdmittedDistanceBand ?? 0,
        largestAdmittedDistanceBand:
          this._planMetrics.largestAdmittedDistanceBand ?? 0,
        budgetAdmissibleCandidateCount:
          this._planMetrics.budgetAdmissibleCandidateCount ?? 0,
        plateauBlockedCandidateCount:
          this._planMetrics.plateauBlockedCandidateCount ?? 0,
        plateauBlockedInternalCount:
          this._planMetrics.plateauBlockedInternalCount ?? 0,
        largestAdmittedDeltaSplats:
          this._planMetrics.largestAdmittedDeltaSplats ?? 0,
        smallestAdmittedProjectedBenefitPixels:
          this._planMetrics.smallestAdmittedProjectedBenefitPixels ?? 0,
        smallestAdmittedRelativeErrorReduction:
          this._planMetrics.smallestAdmittedRelativeErrorReduction ?? 0,
        remainingBudget: this._planMetrics.remainingBudget ?? 0,
        liveContentWork: this._content || this._cleanup ? 1 : 0,
        liveOrderingWork: this._orderingActive ? 1 : 0,
        cpuPageBytes:
          (d2?.cpuPageStableBytes ?? 0) + (d2?.cpuPageEscrowBytes ?? 0),
        gpuPageBytes:
          (d2?.gpuPageStableBytes ?? 0) +
          (d2?.gpuPageEscrowBytes ?? 0) +
          (d2?.gpuPageWarmBytes ?? 0),
        gpuWarmPageBytes: d2?.gpuPageWarmBytes ?? 0,
        gpuWarmPageCount: this._gpuLedger?.warmPageIds.length ?? 0,
        gpuWarmPageReservationHits:
          this._gpuLedger?.statistics.warmReservations ?? 0,
        gpuWarmPageEvictions: this._gpuLedger?.statistics.warmEvictions ?? 0,
        cpuPresentationBytes: d2?.cpuPresentationCurrentBytes ?? 0,
        gpuPresentationBytes: d2?.gpuPresentationCurrentBytes ?? 0,
        selectedSplats: d3?.globalPresentationSplats ?? 0,
        slots: this._d3?.current?.presentation?.composition?.slotCount ?? 0,
        contentGeneration: d3?.globalContentGeneration ?? 0,
        mappingGeneration: d3?.globalMappingGeneration ?? 0,
        orderingGeneration: d3?.globalOrderingGeneration ?? 0,
        pageAtlasCanonicalizedCoreSplats:
          atlas?.pageAtlasCanonicalizedCoreSplats ?? 0,
        pageAtlasUploadedCoreBytes: atlas?.pageAtlasUploadedCoreBytes ?? 0,
        pageAtlasRetainedHitCount: atlas?.pageAtlasRetainedHitCount ?? 0,
        gpuAtlasAllocatedBytes: atlas?.allocatedTextureBytes ?? 0,
        presentationCoreRewriteSplats: d3?.presentationCoreRewriteSplats ?? 0,
        mappingEntriesWritten: d3?.mappingEntriesWritten ?? 0,
        mappingWorkerDispatchCount: d3?.mappingWorkerDispatchCount ?? 0,
        mappingWorkerCompletionCount: d3?.mappingWorkerCompletionCount ?? 0,
        mappingWorkerFailureCount: d3?.mappingWorkerFailureCount ?? 0,
        mappingWorkerMilliseconds: d3?.mappingWorkerMilliseconds ?? 0,
        mappingEntriesProduced: d3?.mappingEntriesProduced ?? 0,
        staleMappingDiscardCount: d3?.staleMappingDiscardCount ?? 0,
        lastFrameMappingEntriesWritten: d3?.lastFrameMappingEntriesWritten ?? 0,
        sortPositionExtractions: d3?.sortPositionExtractions ?? 0,
        lastFrameSortPositionExtractions:
          d3?.lastFrameSortPositionExtractions ?? 0,
        corePreparationCopiedBytes: d3?.corePreparationCopiedBytes ?? 0,
        corePreparationConvertedSplats: d3?.corePreparationConvertedSplats ?? 0,
        corePreparationLiveBytes: d3?.corePreparationLiveBytes ?? 0,
        corePreparationHighWaterBytes: d3?.corePreparationHighWaterBytes ?? 0,
        corePreparationBatchDispatchCount:
          d3?.corePreparationBatchDispatchCount ?? 0,
        corePreparationBatchCompletionCount:
          d3?.corePreparationBatchCompletionCount ?? 0,
        corePreparationReusePageCount: d3?.corePreparationReusePageCount ?? 0,
        corePreparationRebuildPageCount:
          d3?.corePreparationRebuildPageCount ?? 0,
        corePreparationStaleUploadDiscardCount:
          d3?.corePreparationStaleUploadDiscardCount ?? 0,
        workerPositionBytes: d3?.globalWorkerPositionBytes ?? 0,
        workerWorkingSetHighWater: d3?.globalWorkerWorkingSetHighWater ?? 0,
        loaderReceivedBytes: this._loader.statistics.receivedBytes,
        rawCoreCloneBytes: d3?.rawCoreCloneBytes ?? 0,
        lastFrameRawCoreCloneBytes: d3?.lastFrameRawCoreCloneBytes ?? 0,
        workerDecodedPositionSplats: d3?.workerDecodedPositionSplats ?? 0,
        positionRepositoryHitPageCount: d3?.positionRepositoryHitPageCount ?? 0,
        positionRepositoryMissPageCount:
          d3?.positionRepositoryMissPageCount ?? 0,
        preparationOverlapMilliseconds: d3?.preparationOverlapMilliseconds ?? 0,
        globalSortDispatchCount: d3?.globalSortDispatchCount ?? 0,
        loaderRawPageDepth: loader?.rawPageDepth ?? 0,
        loaderDeliveredPagesHighWater: loader?.deliveredPagesHighWater ?? 0,
        loaderCompletionFrames: loader?.completionFrames ?? 0,
        maximumLoaderDeliveryWorkMilliseconds:
          loader?.maximumDeliveryWorkMilliseconds ?? 0,
        cleanupDebtBytes:
          (d2?.cpuCleanupDebtBytes ?? 0) +
          (d2?.gpuCleanupDebtBytes ?? 0) +
          (d3?.d3CleanupDebtBytes ?? 0),
      });
    },
  },
});

_SceneGISGaussianSegmentedRuntimeController.State = STATE;
_SceneGISGaussianSegmentedRuntimeController.Phase = PHASE;

export default _SceneGISGaussianSegmentedRuntimeController;

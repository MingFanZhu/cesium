import _SceneGISGaussianSegmentedGlobalPresentationAdapter from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedGlobalPresentationAdapter.js";
import _SceneGISGaussianSegmentedResourceAdapter from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedResourceAdapter.js";
import _SceneGISGaussianSegmentedGlobalSorter, {
  consumeGaussianSegmentedGlobalOrderingValidation,
  estimateGaussianSegmentedGlobalSortWorkingSetBytes,
} from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedGlobalSorter.js";
import { CORE_PREPARATION_WINDOW_BYTES } from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedCorePreparation.js";
import {
  resetGaussianSegmentedGlobalSorterRepositoryForSpecs,
  sortGaussianSegmentedGlobalPositions,
} from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSortTask.js";

describe("SceneGIS/Scene/SceneGISGaussianSegmentedGlobalPresentationAdapter", function () {
  it("worker history: reserves unprepared target positions before retaining newest GPU history", function () {
    const value = harness();
    publish(value);
    const adapter = value.adapter;
    adapter._liveCoreContent = {
      coreIds: [1],
      targetCut: { selectedSplatCount: 1 },
    };
    const required = estimateGaussianSegmentedGlobalSortWorkingSetBytes({
      selectedSplatCount: 1,
      confirmedPositionBytes: 24,
      retainedPositionBytes: 24,
      preparationBytes: CORE_PREPARATION_WINDOW_BYTES,
      scratchResidentBytes: 0,
    });
    adapter._sorter = {
      maximumWorkingSetBytes: required.totalBytes + 12,
      snapshot: { scratchBytes: 0 },
      _confirmed: new Map(
        [0, 2, 3].map((pageIndex) => [
          pageIndex,
          { pageIndex, positionBytes: 12 },
        ]),
      ),
    };
    adapter._retainedCorePageIds = () => Uint32Array.from([2, 3]);
    adapter._corePagePositionBytes = () => 12;
    expect(
      adapter._retainedPreparedPages().map((page) => page.pageIndex),
    ).toEqual([0, 3]);
    expect(adapter._sorter._confirmed.has(1)).toBe(false);
    adapter._retainedCorePageIds = undefined;
    expect(
      adapter._retainedPreparedPages().map((page) => page.pageIndex),
    ).toEqual([0]);
  });

  it("worker history: prunes over-budget history before preparation and preserves its owner through a failed prune", async function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    const value = harness({ omitResourceAdapter: true });
    const operations = [];
    let pruneFailures = 1;
    const maximumWorkingSetBytes =
      estimateGaussianSegmentedGlobalSortWorkingSetBytes({
        selectedSplatCount: 1,
        confirmedPositionBytes: 12,
        retainedPositionBytes: 12,
        preparationBytes: CORE_PREPARATION_WINDOW_BYTES,
        scratchResidentBytes: 0,
      }).totalBytes;
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      maximumWorkingSetBytes,
      taskProcessor: {
        scheduleTask(parameters) {
          operations.push(parameters.operation);
          if (parameters.operation === "PRUNE" && pruneFailures-- > 0) {
            return Promise.reject(new Error("injected prune failure"));
          }
          return Promise.resolve(
            sortGaussianSegmentedGlobalPositions(parameters),
          );
        },
        destroy() {},
      },
    });
    value.adapter._sorter = sorter;
    value.adapter._retainedCorePageIds = () => Uint32Array.from([1]);
    value.adapter._corePagePositionBytes = () => 12;
    const history = {
      ...value.adapter.coreIdentity(0),
      pageIndex: 1,
      uploadBytes: 8192,
    };
    const seed = sorter.requestPreparation({
      artifactIdentity: "artifact",
      contentIdentity: "history-seed",
      requestSerial: 1,
      selectedSplatCount: 1,
      pages: [history],
    });
    sorter.update(() => new Uint8Array(32));
    await Promise.resolve();
    await Promise.resolve();
    expect(sorter.takeSettlements()[0].error).toBeUndefined();
    sorter.releasePreparation(seed);
    const content = {
      work: { loaderOwnerIdentity: "target-work" },
      coreIds: [0],
      boundIds: new Set(),
      cut: { selectedSplatCount: 1 },
    };
    value.adapter.queueCorePreparation(content, [0]);
    const owner = content.preparationOwner;
    expect(value.adapter._pendingCorePreparationOwner).toBe(owner);
    expect(value.adapter._activeSorterOwner.schedulerKind).toBe("PRUNE");
    for (let attempt = 0; attempt < 2; attempt++) {
      value.adapter._pumpSorter();
      await Promise.resolve();
      await Promise.resolve();
      value.adapter.collectWorkerSettlements();
      expect(value.adapter._pendingCorePreparationOwner).toBe(owner);
      expect(owner.sortError).toBeUndefined();
    }
    expect(value.adapter.statistics.maintenanceFailureCount).toBe(1);
    expect(sorter.snapshot.confirmedPageCount).toBe(0);
    value.adapter._pumpSorter();
    await Promise.resolve();
    await Promise.resolve();
    value.adapter.collectWorkerSettlements();
    expect(operations).toEqual([
      "PREPARE_CORE",
      "PRUNE",
      "PRUNE",
      "PREPARE_CORE",
    ]);
    expect(owner.sortResult.operation).toBe("PREPARE_CORE");
    expect([...sorter._confirmed.keys()]).toEqual([0]);
    expect(sorter.snapshot.workingSetHighWater).toBeLessThanOrEqual(
      maximumWorkingSetBytes,
    );
    value.adapter.releaseCorePreparation(content);
    expect(sorter.destroy()).toBe(true);
  });

  it("handoff collect is idempotent and does not dispatch before the current-priority pump", async function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    const value = harness({ omitResourceAdapter: true });
    let finish;
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask(parameters) {
          return new Promise((resolve) => {
            finish = () =>
              resolve(sortGaussianSegmentedGlobalPositions(parameters));
          });
        },
        destroy() {},
      },
    });
    value.adapter._sorter = sorter;
    const content = {
      work: { loaderOwnerIdentity: "handoff-work" },
      coreIds: [0],
      boundIds: new Set(),
      cut: { selectedSplatCount: 1 },
    };
    value.adapter.queueCorePreparation(content, [0]);
    value.adapter._pumpSorter();
    const owner = content.preparationOwner;
    finish();
    await Promise.resolve();
    await Promise.resolve();
    const before = sorter.snapshot;
    const admit = spyOn(
      value.adapter,
      "_admitNextSorterOwner",
    ).and.callThrough();
    const dispatch = spyOn(sorter, "update").and.callThrough();
    value.adapter.collectWorkerSettlements();
    const result = owner.sortResult;
    expect(result.operation).toBe("PREPARE_CORE");
    expect(admit).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(sorter.snapshot.corePreparationCopiedBytes).toBe(
      before.corePreparationCopiedBytes,
    );
    expect(sorter.snapshot.corePreparationLiveBytes).toBe(
      before.corePreparationLiveBytes,
    );
    expect(value.allocations).toBe(0);
    expect(value.orderingUploads).toBe(0);
    value.adapter.collectWorkerSettlements();
    expect(owner.sortResult).toBe(result);
    expect(admit).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    value.adapter.releaseCorePreparation(content);
    // Existing pending slots and admission logic select current before successor.
    const current = { schedulerKind: "CURRENT_ORDERING" };
    const successor = { schedulerKind: "CONTENT" };
    value.adapter._pendingCurrentOrderingOwner = current;
    value.adapter._pendingContentOwner = successor;
    spyOn(value.adapter, "_sortIntent").and.callFake((state) => ({
      owner: state,
    }));
    const request = spyOn(sorter, "request").and.callFake((intent) => intent);
    value.adapter._pumpSorter();
    expect(request.calls.count()).toBe(1);
    expect(request.calls.mostRecent().args[0].owner).toBe(current);
    expect(value.adapter._activeSorterOwner).toBe(current);
    expect(value.adapter._pendingContentOwner).toBe(successor);
    expect(dispatch.calls.count()).toBe(1);
    expect(sorter.destroy()).toBe(true);
  });

  it("F5B retains PAGES destroy authority through delayed preparation and prune", async function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    const value = harness({ omitResourceAdapter: true });
    const pending = [];
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask(parameters) {
          return new Promise((resolve) =>
            pending.push(() =>
              resolve(sortGaussianSegmentedGlobalPositions(parameters)),
            ),
          );
        },
        destroy() {},
      },
    });
    value.adapter._sorter = sorter;
    const content = {
      work: { loaderOwnerIdentity: "pages-work" },
      coreIds: [0],
      boundIds: new Set(),
      cut: { selectedSplatCount: 1 },
    };
    value.adapter.queueCorePreparation(content, [0]);
    value.adapter._pumpSorter();
    expect(pending.length).toBe(1);
    expect(sorter.snapshot.corePreparationLiveBytes).toBeGreaterThan(0);
    expect(value.adapter.destroy()).toBe(false);
    expect(value.adapter._destroyState).toBeUndefined();
    expect(value.adapter.destroy()).toBe(false);
    expect(value.adapter._destroyCoreContent).toBe(content);
    pending.shift()();
    await Promise.resolve();
    await Promise.resolve();
    expect(sorter.snapshot.confirmedPositionBytes).toBe(12);
    expect(value.adapter.destroy()).toBe(false);
    // Settlement admits PRUNE; the next normal pump dispatches it.
    expect(value.adapter.destroy()).toBe(false);
    expect(pending.length).toBe(1);
    expect(content.preparationOwner).toBeUndefined();
    expect(sorter.snapshot.corePreparationLiveBytes).toBe(0);
    pending.shift()();
    await Promise.resolve();
    await Promise.resolve();
    expect(value.adapter.abortCorePreparation(content)).toBe(true);
    expect(sorter.snapshot.confirmedPositionBytes).toBe(0);
    expect(value.orderingUploads).toBe(0);
    expect(value.allocations).toBe(0);
    expect(sorter.destroy()).toBe(true);
  });

  function harness(options = {}) {
    let allocations = 0;
    let retired = 0;
    let resourceAborts = 0;
    let orderingUploads = 0;
    let orderingUploadCursorCount = 0;
    let orderingUploadRebindCount = 0;
    let overlayReservationCount = 0;
    let receiptCreations = 0;
    let pruneRequests = 0;
    let pruneSettlements = 0;
    let d1Aborts = 0;
    let validationConsumptions = 0;
    const validationOwners = new WeakMap();
    let settlementsReleased = !options.holdSettlements;
    const resolvedSnapshots = [];
    const uploadedOrderingViews = [];
    const requestedSortCenters = [];
    const composition = {
      selectedSplatCount: 1,
      slotCount: 1,
      assetSliceCount: 0,
      fragmentCount: 1,
      artifactIdentityHex: "artifact",
      slotCoverageNodeIds: new Uint32Array([0]),
      slotRepresentationIds: new Uint32Array([0]),
      slotRangeStarts: new Uint32Array([0]),
      slotRangeCounts: new Uint32Array([1]),
      slotPresentationOffsets: new Uint32Array([0, 1]),
      slotCropBounds: new Float64Array(4),
      providerAssetOffsets: new Uint32Array([0, 0]),
      assetIds: new Uint32Array(0),
      assetLocalStarts: new Uint32Array(0),
      assetCounts: new Uint32Array(0),
      assetFragmentOffsets: new Uint32Array([0]),
      fragmentCorePageIds: new Uint32Array([0]),
      fragmentShPageIds: new Uint32Array([0xffffffff]),
      fragmentPageLocalStarts: new Uint32Array([0]),
      fragmentCounts: new Uint32Array([1]),
      fragmentPresentationStarts: new Uint32Array([0]),
      fragmentSlotIds: new Uint32Array([0]),
      metrics: { coverageHoleCount: 0, coverageOverlapCount: 0 },
    };
    const descriptor = {
      cpuStagingBytes: 100,
      gpuPresentationBytes: 200,
      coreLogicalBytes: 32,
      coreBytes: 64,
      shLogicalBytes: 0,
      shBytes: 0,
      mappingBytes: 64,
      cropBytes: 16,
      orderingBytes: 56,
    };
    const layout = {
      descriptor,
      fragmentShDenseStarts: new Uint32Array([0xffffffff]),
    };
    const d1 = {
      compose() {
        return composition;
      },
      derive() {
        return layout;
      },
      createContentPlan(index, prepared) {
        return (
          options.mutatePlan?.({
            targetCut: prepared.targetCut,
            targetOwnership: prepared.targetOwnership,
            descriptor,
            composition,
            fragmentShDenseStarts: layout.fragmentShDenseStarts,
            expectedContentGeneration: 1,
            expectedMappingGeneration: 1,
            expectedOrderingGeneration: 1,
          }) ?? {
            targetCut: prepared.targetCut,
            targetOwnership: prepared.targetOwnership,
            descriptor,
            composition,
            fragmentShDenseStarts: layout.fragmentShDenseStarts,
            expectedContentGeneration: 1,
            expectedMappingGeneration: 1,
            expectedOrderingGeneration: 1,
          }
        );
      },
      createReceipt(plan, external) {
        receiptCreations++;
        if (options.failReceipt) {
          throw new Error("injected receipt failure");
        }
        return Object.freeze({ plan, external });
      },
      commitContent(index, prepared, receipt) {
        return {
          presentation: Object.freeze({
            cut: prepared.targetCut,
            ownership: prepared.targetOwnership,
            fragmentShDenseStarts: layout.fragmentShDenseStarts,
            contentGeneration: receipt.external.contentGeneration,
            mappingGeneration: receipt.external.mappingGeneration,
            orderingGeneration: receipt.external.orderingGeneration,
            gpuPageBindingGeneration: receipt.external.gpuPageBindingGeneration,
          }),
        };
      },
      createShPlan() {},
      createOrderingPlan(index, current) {
        return {
          targetCut: current.cut,
          targetOwnership: current.ownership,
          descriptor,
          composition,
          fragmentShDenseStarts: layout.fragmentShDenseStarts,
          expectedContentGeneration: current.contentGeneration,
          expectedMappingGeneration: current.mappingGeneration,
          expectedOrderingGeneration: current.orderingGeneration + 1,
        };
      },
      commitRefresh(index, current, receipt) {
        return {
          presentation: Object.freeze({
            cut: current.cut,
            ownership: current.ownership,
            fragmentShDenseStarts: current.fragmentShDenseStarts,
            contentGeneration: receipt.external.contentGeneration,
            mappingGeneration: receipt.external.mappingGeneration,
            orderingGeneration: receipt.external.orderingGeneration,
            gpuPageBindingGeneration: current.gpuPageBindingGeneration,
          }),
        };
      },
      abortContent() {
        d1Aborts++;
      },
      abortRefresh() {
        d1Aborts++;
      },
    };
    const resourceTicket = { copiedSplats: 0, uploadedResources: 0 };
    const resources = {
      prepare() {
        allocations++;
        return resourceTicket;
      },
      advance() {
        resourceTicket.copiedSplats = 1;
        resourceTicket.uploadedResources = 4;
        return { state: "CONTENT_READY" };
      },
      prepareOrderingUpload(described, ordering, binding) {
        orderingUploadCursorCount++;
        return { described, ordering, binding, uploaded: false };
      },
      rebindOrderingUpload(cursor, described, ordering, binding) {
        if (cursor.uploaded || cursor.described !== described) {
          throw new Error("invalid Ordering upload rebind");
        }
        cursor.ordering = ordering;
        cursor.binding = binding;
        orderingUploadRebindCount++;
      },
      advanceOrderingUpload(cursor, maximumTextureUploads, binding, ordering) {
        if (cursor.binding !== binding || cursor.ordering !== ordering) {
          throw new Error("stale Ordering upload authority");
        }
        if (maximumTextureUploads > 0) {
          cursor.uploaded = true;
          orderingUploads++;
          uploadedOrderingViews.push(ordering[1]);
        }
        return { ready: cursor.uploaded };
      },
      consumeOrderingUpload(cursor, binding, ordering) {
        if (cursor.binding !== binding || cursor.ordering !== ordering) {
          throw new Error("stale Ordering consume authority");
        }
        orderingUploadCursorCount--;
        return {
          texture: { ordering: cursor.ordering },
          ordering: cursor.ordering,
        };
      },
      installPreparedOrdering(ticket, cursor, binding, ordering) {
        this.consumeOrderingUpload(cursor, binding, ordering);
      },
      abortOrderingUpload(cursor) {
        if (cursor) {
          orderingUploadCursorCount--;
        }
      },
      resetOrdering() {},
      createOwner(ticket, options) {
        return Object.freeze({
          resourceOwnerIdentity: options.resourceOwnerIdentity,
          selectedSplatCount: 1,
          coreTexture: {},
          mappingTexture: {},
          cropTexture: {},
          orderingTexture: {},
        });
      },
      prepareOrderingSwap(owner, texture) {
        return () => {
          const previous = owner.orderingTexture;
          this.replacement = texture;
          return previous;
        };
      },
      destroyOrderingTexture(texture) {
        texture.destroyed = true;
      },
      retire() {
        retired++;
      },
      abort() {
        resourceAborts++;
      },
      copiedSplats: 1,
      uploadedResources: 5,
      statistics: { copiedSplats: 1, uploadedResources: 5 },
    };
    let desired;
    const sorter = {
      _confirmed: new Map(),
      request(intent) {
        if (options.rejectForeignDesired && desired) {
          throw new Error("foreign desired overwrite");
        }
        desired = intent;
        requestedSortCenters.push([...intent.sortCenter]);
        return intent;
      },
      update() {},
      takeSettlements() {
        if (!desired || !settlementsReleased) {
          return [];
        }
        const intent = desired;
        desired = undefined;
        if (intent.operation === "PRUNE") {
          pruneSettlements++;
          if (options.failPruneAsync && pruneSettlements === 1) {
            return [{ error: new Error("async prune failure"), intent }];
          }
          return [{ result: { operation: "PRUNE" }, intent }];
        }
        const ordering = new Uint32Array(descriptor.orderingBytes / 4);
        ordering.fill(0xffffffff);
        ordering[0] = 0;
        ordering[1] = intent.viewGeneration;
        const result = { ordering };
        validationOwners.set(ordering, { intent, result });
        return [{ result, intent }];
      },
      cancel(intent) {
        if (desired === intent) {
          desired = undefined;
        }
      },
      requestPrune(artifactIdentity, retainedPages) {
        pruneRequests++;
        if (options.failPruneSync && pruneRequests === 1) {
          throw new Error("injected prune failure");
        }
        desired = { operation: "PRUNE", artifactIdentity, retainedPages };
        return desired;
      },
      destroy() {},
      snapshot: {
        dispatchCount: 1,
        completionCount: 1,
        failureCount: 0,
        confirmedPageCount: 1,
        confirmedPositionBytes: 12,
        scratchBytes: 1,
        workingSetHighWater: 100,
      },
    };
    const renderResources = {
      createCommand(owner, bounds) {
        return Object.freeze({
          owner,
          boundingVolume: bounds,
          instanceCount: 1,
        });
      },
      destroy() {},
    };
    const pageSource = {
      descriptor: {
        artifactIdentity: "artifact",
        index: 0,
        assetId: 0,
        assetLocalStart: 0,
        splatCount: 1,
        kind: 1,
        semantic: 1,
        layoutId: 1,
        packId: 0,
        offset: 256,
        checksum: 4,
        rawBytes: 32,
        storedBytes: 32,
      },
      payload: new Uint8Array(32),
    };
    const resourceAdapter = new _SceneGISGaussianSegmentedResourceAdapter({
      descriptorProvider: {
        artifactIdentity: "artifact",
        compactIndexBytes: 0,
        statistics: {},
        readPageRequest() {},
      },
      loader: {
        applyPageDemandDelta(request) {
          return Object.freeze({
            generation: request.generation,
            storageIdentity: request.storageIdentity,
          });
        },
        drainPageWorkSettlements() {
          return [];
        },
        statistics: {},
      },
      cache: {
        planCoreLease() {},
        peek() {},
        bytesIncludingLeases: 0,
        bytes: 0,
        size: 0,
        resourceGeneration: 0,
      },
      gpuLedger: {
        reserveOwnerPages() {},
        boundBytes: 0,
        reservedBytes: 0,
        cleanupDebtBytes: 0,
        statistics: {},
      },
      presentation: {
        prepare() {},
        preflight() {},
        commit() {},
        abort() {},
        retire() {},
      },
      createPhysicalSnapshot() {},
      validatePhysicalSnapshot() {},
      leaseIdentity: "spec-lease",
      maximumCpuBytes: 1024 * 1024,
      maximumGpuBytes: 1024 * 1024,
    });
    const reserveOrderingOverlay =
      resourceAdapter.reserveOrderingOverlay.bind(resourceAdapter);
    resourceAdapter.reserveOrderingOverlay = function (...args) {
      overlayReservationCount++;
      return reserveOrderingOverlay(...args);
    };
    const adapter = new _SceneGISGaussianSegmentedGlobalPresentationAdapter({
      index: {
        artifactIdentityHex: "artifact",
        maxShDegree: 0,
        readAsset(assetId, target) {
          target.fill(0);
          target[0] = assetId;
          return target;
        },
        readRepresentationOrigin(representationId, target) {
          target.fill(0);
          return target;
        },
      },
      d1,
      resources,
      sorter,
      renderResources,
      resourceAdapter: options.omitResourceAdapter
        ? undefined
        : resourceAdapter,
      resolvePage(pageId, physicalSnapshot) {
        resolvedSnapshots.push(physicalSnapshot);
        return pageSource;
      },
      boundingVolume: {},
      consumeOrderingValidation(ordering, intent, result) {
        const owner = validationOwners.get(ordering);
        if (owner?.intent !== intent || owner.result !== result) {
          return undefined;
        }
        validationOwners.delete(ordering);
        validationConsumptions++;
        return result;
      },
    });
    return {
      adapter,
      composition,
      layout,
      descriptor,
      get allocations() {
        return allocations;
      },
      get retired() {
        return retired;
      },
      get resourceAborts() {
        return resourceAborts;
      },
      get orderingUploads() {
        return orderingUploads;
      },
      get orderingUploadCursorCount() {
        return orderingUploadCursorCount;
      },
      get orderingUploadRebindCount() {
        return orderingUploadRebindCount;
      },
      get overlayReservationCount() {
        return overlayReservationCount;
      },
      get receiptCreations() {
        return receiptCreations;
      },
      get pruneRequests() {
        return pruneRequests;
      },
      get d1Aborts() {
        return d1Aborts;
      },
      get validationConsumptions() {
        return validationConsumptions;
      },
      resolvedSnapshots,
      uploadedOrderingViews,
      requestedSortCenters,
      pageSource,
      resourceAdapter,
      releaseSettlements() {
        settlementsReleased = true;
      },
      holdSettlements() {
        settlementsReleased = false;
      },
    };
  }

  function prepared(targetCut, targetOwnership) {
    return Object.freeze({ targetCut, targetOwnership });
  }

  function publish(value, viewGeneration = 1, extraInput = {}) {
    const targetCut = {};
    const targetOwnership = {};
    const snapshot = Object.freeze({ gpuGeneration: viewGeneration + 6 });
    const ticket = value.adapter.prepare({
      kind: "BOOTSTRAP",
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: snapshot,
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        contentGeneration: 1,
        mappingGeneration: 1,
        viewGeneration,
        sortCenter: [0, 0, 0],
        ...extraInput,
      },
    });
    const progress = value.adapter.advance(ticket, {
      maximumMappingEntries: 1,
      maximumTextureUploads: 5,
      maximumPositionExtractions: 1,
    });
    const owner = value.adapter.commit(
      value.adapter.preflight(ticket, progress.receipt, snapshot),
    );
    return { owner, ticket, snapshot, progress };
  }

  function checkpointRequest(content) {
    const targetCut = {};
    const targetOwnership = {};
    return {
      kind: "BOOTSTRAP",
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: Object.freeze({ gpuGeneration: 7 }),
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        contentGeneration: 1,
        mappingGeneration: 1,
        viewGeneration: 1,
        sortCenter: [0, 0, 0],
        checkpointCoreContent: content,
      },
    };
  }

  it("segmented checkpoint: preserves final Core ownership and positions across commit until final publication", function () {
    const value = harness();
    const adapter = value.adapter;
    const content = {
      coreIds: [0, 1],
      boundIds: new Set(),
      targetCut: { selectedSplatCount: 2 },
    };
    adapter.beginCorePreparation(content);
    adapter._sorter._confirmed = new Map(
      [0, 1].map((pageIndex) => [pageIndex, { pageIndex }]),
    );
    const prune = spyOn(adapter._sorter, "requestPrune").and.callThrough();
    publish(value, 1, { checkpointCoreContent: content });
    expect(adapter._liveCoreContent).toBe(content);
    expect(content.corePreparationCancelled).toBeUndefined();
    adapter.update();
    expect(
      prune.calls.mostRecent().args[1].map((page) => page.pageIndex),
    ).toEqual([0, 1]);
    publish(value);
    expect(adapter._liveCoreContent).toBeUndefined();
    adapter.update();
    expect(
      prune.calls.mostRecent().args[1].map((page) => page.pageIndex),
    ).toEqual([0]);
  });

  it("segmented checkpoint: rejects foreign or canceled final owners before allocation and after preflight", function () {
    const value = harness();
    const adapter = value.adapter;
    const content = { coreIds: [0], boundIds: new Set() };
    adapter.beginCorePreparation(content);
    expect(() =>
      adapter.prepare(checkpointRequest({ ...content })),
    ).toThrowDeveloperError();
    expect(value.allocations).toBe(0);
    const request = checkpointRequest(content);
    const ticket = adapter.prepare(request);
    const progress = adapter.advance(ticket, { maximumTextureUploads: 5 });
    const authority = adapter.preflight(
      ticket,
      progress.receipt,
      request.physicalSnapshot,
    );
    const commit = spyOn(adapter._d1, "commitContent").and.callThrough();
    content.corePreparationCancelled = true;
    // Caller mutation cannot remove the exact owner captured by the ticket.
    request.input.checkpointCoreContent = undefined;
    expect(() => adapter.advance(ticket)).toThrowDeveloperError();
    expect(() =>
      adapter.preflight(ticket, progress.receipt, request.physicalSnapshot),
    ).toThrowDeveloperError();
    expect(() => adapter.commit(authority)).toThrowDeveloperError();
    expect(commit).not.toHaveBeenCalled();
    adapter.abort(ticket, "final canceled");
    expect(value.retired).toBe(1);
    expect(value.d1Aborts).toBe(1);
  });

  it("segmented checkpoint: aborts a checkpoint without canceling the queued final Core window", function () {
    const value = harness({ holdSettlements: true });
    const adapter = value.adapter;
    const content = {
      work: { loaderOwnerIdentity: "checkpoint-final" },
      coreIds: [0],
      boundIds: new Set(),
      targetCut: { selectedSplatCount: 1 },
    };
    adapter.beginCorePreparation(content);
    const ticket = adapter.prepare(checkpointRequest(content));
    adapter.advance(ticket, { maximumTextureUploads: 5 });
    adapter.queueCorePreparation(content, [0]);
    const preparation = content.preparationOwner;
    expect(adapter._pendingCorePreparationOwner).toBe(preparation);
    const release = jasmine.createSpy("releasePreparation");
    adapter._sorter.releasePreparation = release;
    adapter.abort(ticket, "checkpoint discarded");
    expect(adapter._liveCoreContent).toBe(content);
    expect(adapter._pendingCorePreparationOwner).toBe(preparation);
    expect(content.preparationOwner).toBe(preparation);
    expect(content.corePreparationCancelled).toBeUndefined();
    expect(release).not.toHaveBeenCalled();
    // Actual final cancellation removes only its own queued owner and releases
    // that window once; delayed PRUNE settlement still gates cleanup completion.
    expect(adapter.abortCorePreparation(content)).toBe(false);
    expect(adapter._pendingCorePreparationOwner).toBeUndefined();
    expect(adapter._liveCoreContent).toBeUndefined();
    expect(content.preparationOwner).toBeUndefined();
    expect(release.calls.count()).toBe(1);
    value.releaseSettlements();
    expect(adapter.abortCorePreparation(content)).toBe(true);
    expect(release.calls.count()).toBe(1);
  });

  it("segmented checkpoint: schedules current Ordering then checkpoint SORT then final PREPARE on one Worker", async function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    const value = harness({ omitResourceAdapter: true });
    const adapter = value.adapter;
    const sources = [0, 1, 2].map((pageIndex) => ({
      descriptor: {
        ...value.pageSource.descriptor,
        index: pageIndex,
        assetLocalStart: pageIndex,
      },
      payload: new Uint8Array(32),
    }));
    adapter._resolvePage = (pageId) => sources[pageId];
    const operations = [];
    const pending = [];
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask(parameters) {
          expect(pending.length).toBe(0);
          operations.push(parameters.operation);
          return new Promise((resolve) => {
            pending.push(() =>
              resolve(sortGaussianSegmentedGlobalPositions(parameters)),
            );
          });
        },
        destroy() {},
      },
    });
    adapter._sorter = sorter;
    const content = {
      work: { loaderOwnerIdentity: "checkpoint-final" },
      coreIds: [0, 1, 2],
      boundIds: new Set(),
      targetCut: { selectedSplatCount: 3 },
    };
    const settle = async function () {
      expect(pending.length).toBe(1);
      expect(sorter.snapshot.corePreparationLiveBytes).toBeLessThanOrEqual(
        CORE_PREPARATION_WINDOW_BYTES,
      );
      pending.shift()();
      await Promise.resolve();
      await Promise.resolve();
      adapter.collectWorkerSettlements();
      expect(adapter._activeSorterOwner).toBeUndefined();
      expect(pending.length).toBe(0);
    };
    adapter.queueCorePreparation(content, [0, 1]);
    adapter._pumpSorter();
    const makeSortState = (serial) => ({
      serial,
      composition: value.composition,
      input: { viewGeneration: 1, sortCenter: [0, 0, 0] },
    });
    const checkpoint = makeSortState(40);
    const current = makeSortState(41);
    adapter._enqueueSortOwner(checkpoint, "CONTENT");
    adapter._enqueueSortOwner(current, "CURRENT_ORDERING");
    await settle();
    expect(content.preparationOwner.sortResult.operation).toBe("PREPARE_CORE");
    adapter._pumpSorter();
    expect(adapter._activeSorterOwner).toBe(current);
    expect(sorter.snapshot.corePreparationLiveBytes).toBeGreaterThan(0);
    // The returned upload window may be released while SORT is in flight;
    // the next preparation remains queued until both higher-priority sorts end.
    adapter.releaseCorePreparation(content);
    adapter.queueCorePreparation(content, [2]);
    const preparation = content.preparationOwner;
    expect(adapter._activeSorterOwner).toBe(current);
    expect(adapter._pendingContentOwner).toBe(checkpoint);
    expect(adapter._pendingCorePreparationOwner).toBe(preparation);
    adapter._pumpSorter();
    await settle();
    expect(current.sortError).toBeUndefined();
    expect(current.sortResult.ordering[0]).toBe(0);
    expect([...sorter._confirmed.keys()]).toEqual([0, 1]);
    adapter._pumpSorter();
    expect(adapter._activeSorterOwner).toBe(checkpoint);
    expect(adapter._pendingCorePreparationOwner).toBe(preparation);
    await settle();
    expect(checkpoint.sortError).toBeUndefined();
    expect(checkpoint.sortResult.ordering[0]).toBe(0);
    adapter._pumpSorter();
    expect(adapter._activeSorterOwner).toBe(preparation);
    await settle();
    expect(preparation.sortResult.operation).toBe("PREPARE_CORE");
    expect(operations).toEqual([
      "PREPARE_CORE",
      "SORT",
      "SORT",
      "PREPARE_CORE",
    ]);
    expect([...sorter._confirmed.keys()]).toEqual([0, 1, 2]);
    expect(sorter.snapshot.corePreparationCopiedBytes).toBe(3 * 32);
    adapter.releaseCorePreparation(content);
    expect(sorter.snapshot.corePreparationLiveBytes).toBe(0);
    expect(adapter.abortCorePreparation(content)).toBe(false);
    await settle();
    expect(adapter.abortCorePreparation(content)).toBe(true);
    expect(sorter.snapshot.confirmedPositionBytes).toBe(0);
    expect(sorter.destroy()).toBe(true);
  });

  it("segmented checkpoint: consumes a queued canceled Core acknowledgement after child abort before pruning", async function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    const value = harness({ omitResourceAdapter: true });
    const adapter = value.adapter;
    const pending = [];
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask(parameters) {
          return new Promise((resolve) =>
            pending.push(() =>
              resolve(sortGaussianSegmentedGlobalPositions(parameters)),
            ),
          );
        },
        destroy() {},
      },
    });
    adapter._sorter = sorter;
    const parent = {
      work: { loaderOwnerIdentity: "checkpoint-destroy-final" },
      coreIds: [0],
      boundIds: new Set(),
      targetCut: { selectedSplatCount: 1 },
    };
    adapter.queueCorePreparation(parent, [0]);
    adapter._pumpSorter();
    const owner = parent.preparationOwner;
    const child = adapter.prepare(checkpointRequest(parent));
    expect(adapter.advance(child, { maximumTextureUploads: 5 }).ready).toBe(
      false,
    );
    expect(adapter._pendingContentOwner).toBeDefined();
    adapter.abort(child, "destroy checkpoint");
    expect(adapter._pendingContentOwner).toBeUndefined();
    expect(adapter.abortCorePreparation(parent)).toBe(false);
    expect(adapter._activeSorterOwner).toBe(owner);
    expect(owner.cancelled).toBe(true);
    pending.shift()();
    await Promise.resolve();
    await Promise.resolve();
    // Match the Browser state after a canceled physical ACK, before a new pump.
    expect(sorter.snapshot.hasInFlight).toBe(false);
    expect(sorter.snapshot.hasDesired).toBe(false);
    expect(sorter.snapshot.hasExtracting).toBe(false);
    expect(sorter.snapshot.corePreparationLiveBytes).toBe(0);
    expect(sorter._settlements.length).toBe(1);
    expect(sorter._settlements[0].intent).toBe(owner.sortIntent);
    expect(adapter._activeSorterOwner).toBe(owner);
    expect(adapter.abortCorePreparation(parent)).toBe(false);
    expect(parent.preparationOwner).toBeUndefined();
    expect(adapter._activeSorterOwner.schedulerKind).toBe("PRUNE");
    expect(sorter._settlements.length).toBe(0);
    adapter._pumpSorter();
    pending.shift()();
    await Promise.resolve();
    await Promise.resolve();
    expect(adapter.abortCorePreparation(parent)).toBe(true);
    expect(adapter._activeSorterOwner).toBeUndefined();
    expect(sorter.snapshot.confirmedPositionBytes).toBe(0);
    expect(value.orderingUploads).toBe(0);
    expect(sorter.destroy()).toBe(true);
  });

  it("keeps prepare/describe pure and claims D1 only at idempotent preflight", function () {
    const value = harness();
    const snapshot = Object.freeze({ gpuGeneration: 7 });
    const targetCut = {};
    const targetOwnership = {};
    const preparedPagePublication = prepared(targetCut, targetOwnership);
    const ticket = value.adapter.prepare({
      kind: "BOOTSTRAP",
      current: undefined,
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: snapshot,
      input: {
        targetCut,
        preparedPagePublication,
        sortCenter: [0, 0, 0],
      },
    });
    const described = value.adapter.describe(ticket, snapshot);
    expect(described.cpuBytes).toBe(100);
    expect(described.gpuBytes).toBe(200);
    expect(value.allocations).toBe(0);
    const progress = value.adapter.advance(ticket, {
      maximumMappingEntries: 1,
      maximumTextureUploads: 5,
      maximumPositionExtractions: 1,
    });
    expect(progress.ready).toBe(true);
    expect(value.allocations).toBe(1);
    const authority = value.adapter.preflight(
      ticket,
      progress.receipt,
      snapshot,
    );
    expect(value.adapter.preflight(ticket, progress.receipt, snapshot)).toBe(
      authority,
    );
    const owner = value.adapter.commit(authority);
    expect(owner.command.instanceCount).toBe(1);
    expect(owner.presentation.contentGeneration).toBe(1);
    expect(value.adapter.statistics.globalDrawCommandCount).toBe(1);
    expect(value.adapter.retire(owner)).toBe(true);
    expect(value.retired).toBe(1);
  });

  it("rejects a foreign snapshot and resource receipt", function () {
    const value = harness();
    const snapshot = Object.freeze({ gpuGeneration: 7 });
    const targetCut = {};
    const targetOwnership = {};
    const ticket = value.adapter.prepare({
      kind: "BOOTSTRAP",
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: snapshot,
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        sortCenter: [0, 0, 0],
      },
    });
    expect(function () {
      value.adapter.describe(ticket, {});
    }).toThrowDeveloperError();
    value.adapter.advance(ticket, {
      maximumMappingEntries: 1,
      maximumTextureUploads: 5,
      maximumPositionExtractions: 1,
    });
    expect(function () {
      value.adapter.preflight(ticket, {}, snapshot);
    }).toThrowDeveloperError();
    value.adapter.abort(ticket, "spec");
  });

  it("rejects every caller-supplied composition or layout authority", function () {
    const value = harness();
    const targetCut = {};
    const targetOwnership = {};
    const request = {
      kind: "BOOTSTRAP",
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: Object.freeze({ gpuGeneration: 7 }),
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
      },
    };
    for (const override of [
      { composition: value.composition },
      { layout: value.layout },
    ]) {
      expect(function () {
        value.adapter.prepare({
          ...request,
          input: { ...request.input, ...override },
        });
      }).toThrowDeveloperError();
    }
    expect(value.allocations).toBe(0);
  });

  it("scalar diagnostics: tracks installed view without building full statistics", function () {
    const value = harness();
    const adapter = value.adapter;
    expect(adapter.currentViewGeneration).toBe(0);
    const { owner } = publish(value);
    const pageStatistics = jasmine.createSpy("pageStatistics").and.returnValue({
      backingCount: 2,
      backingBytes: 128,
    });
    adapter._pageBackend = {
      get statistics() {
        return pageStatistics();
      },
    };
    const statistics = adapter.statistics;
    expect(statistics.globalGpuPageBackingCount).toBe(2);
    expect(statistics.globalGpuPageBackingBytes).toBe(128);
    expect(pageStatistics.calls.count()).toBe(1);
    expect(adapter.copiedSplats).toBe(statistics.globalBuildCopiedSplats);
    expect(adapter.uploadedResources).toBe(
      statistics.globalBuildUploadedFragments,
    );
    spyOnProperty(adapter, "statistics", "get").and.throwError(
      "Full presentation statistics are diagnostic-only",
    );
    expect(adapter.currentViewGeneration).toBe(1);
    adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [1, 0, 0],
    });
    expect(adapter.currentViewGeneration).toBe(1);
    expect(
      adapter.advanceOrderingRefresh({ maximumTextureUploads: 1 }).ready,
    ).toBe(true);
    expect(adapter.currentViewGeneration).toBe(2);
    expect(adapter.copiedSplats).toBe(1);
    expect(adapter.uploadedResources).toBe(5);
    adapter.retire(owner);
    expect(adapter.currentViewGeneration).toBe(0);
    expect(adapter.copiedSplats).toBe(1);
    expect(adapter.uploadedResources).toBe(5);
    expect(pageStatistics.calls.count()).toBe(1);
  });

  it("refreshes only Ordering and command on the existing owner", function () {
    const value = harness();
    const snapshot = Object.freeze({ gpuGeneration: 7 });
    const targetCut = {};
    const targetOwnership = {};
    const preparedPagePublication = prepared(targetCut, targetOwnership);
    const ticket = value.adapter.prepare({
      kind: "BOOTSTRAP",
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: snapshot,
      input: { targetCut, preparedPagePublication, sortCenter: [0, 0, 0] },
    });
    const progress = value.adapter.advance(ticket, {
      maximumMappingEntries: 1,
      maximumTextureUploads: 5,
      maximumPositionExtractions: 1,
    });
    const owner = value.adapter.commit(
      value.adapter.preflight(ticket, progress.receipt, snapshot),
    );
    const contentResources = owner.resources;
    const command = owner.command;
    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [1, 0, 0],
    });
    expect(
      value.adapter.advanceOrderingRefresh({ maximumTextureUploads: 1 }).ready,
    ).toBe(true);
    expect(value.adapter.current).toBe(owner);
    expect(owner.resources.coreTexture).toBe(contentResources.coreTexture);
    expect(owner.resources.mappingTexture).toBe(
      contentResources.mappingTexture,
    );
    expect(owner.resources.cropTexture).toBe(contentResources.cropTexture);
    expect(owner.resources.orderingTexture).not.toBe(
      contentResources.orderingTexture,
    );
    expect(owner.command).not.toBe(command);
    expect(value.adapter.statistics.orderingOnlyPublicationCount).toBe(1);
  });

  it("rejects omitted Asset projection, target identity, descriptor and generation tamper", function () {
    const mutations = [
      (plan) => ({
        ...plan,
        composition: {
          ...plan.composition,
          providerAssetOffsets: new Uint32Array([0, 1]),
        },
      }),
      (plan) => ({ ...plan, targetOwnership: {} }),
      (plan) => ({
        ...plan,
        descriptor: { ...plan.descriptor, currentWorkCpuPeakBytes: 99 },
      }),
      (plan) => ({ ...plan, expectedContentGeneration: 2 }),
    ];
    for (let mutation = 0; mutation < mutations.length; mutation++) {
      const mutatePlan = mutations[mutation];
      const value = harness({ mutatePlan });
      const targetCut = {};
      const targetOwnership = {};
      const snapshot = Object.freeze({ gpuGeneration: 7 });
      const ticket = value.adapter.prepare({
        kind: "BOOTSTRAP",
        targetOwnershipIdentity: targetOwnership,
        physicalSnapshot: snapshot,
        input: {
          targetCut,
          preparedPagePublication: prepared(targetCut, targetOwnership),
          contentGeneration: 1,
          mappingGeneration: 1,
          viewGeneration: 1,
        },
      });
      const progress = value.adapter.advance(ticket, {
        maximumMappingEntries: 1,
        maximumTextureUploads: 1,
        maximumPositionExtractions: 1,
      });
      expect(function () {
        value.adapter.preflight(ticket, progress.receipt, snapshot);
      })
        .withContext(`mutation ${mutation}`)
        .toThrowDeveloperError();
    }
  });

  it("rejects wrong-artifact Page before upload or extraction", function () {
    const value = harness();
    value.pageSource.descriptor.artifactIdentity = "foreign";
    const targetCut = {};
    const targetOwnership = {};
    const ticket = value.adapter.prepare({
      kind: "BOOTSTRAP",
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: Object.freeze({ gpuGeneration: 1 }),
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
      },
    });
    expect(function () {
      value.adapter.advance(ticket, {
        maximumMappingEntries: 1,
        maximumTextureUploads: 0,
        maximumPositionExtractions: 1,
      });
    }).toThrowDeveloperError();
    expect(value.orderingUploads).toBe(0);
  });

  it("uses the installed physical snapshot for camera sorting", function () {
    const value = harness();
    const published = publish(value);
    value.resolvedSnapshots.length = 0;
    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [1, 0, 0],
    });
    value.adapter.advanceOrderingRefresh({
      maximumPositionExtractions: 1,
      maximumTextureUploads: 1,
    });
    expect(value.resolvedSnapshots.length).toBeGreaterThan(0);
    expect(
      value.resolvedSnapshots.every(
        (snapshot) => snapshot === published.snapshot,
      ),
    ).toBe(true);
  });

  it("queues content and camera desired work without overwriting either owner", function () {
    const value = harness();
    const published = publish(value);
    value.adapter.update();
    value.holdSettlements();
    const targetCut = {};
    const targetOwnership = {};
    const content = value.adapter.prepare({
      kind: "TRANSITION",
      current: published.owner,
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: published.snapshot,
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        contentGeneration: 1,
        mappingGeneration: 1,
        viewGeneration: 1,
      },
    });
    value.adapter.advance(content, {
      maximumMappingEntries: 1,
      maximumTextureUploads: 1,
      maximumPositionExtractions: 1,
    });
    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [1, 0, 0],
    });
    expect(value.adapter.statistics.activeSorterOwnerCount).toBe(1);
    expect(value.adapter.statistics.pendingCurrentOrderingSortCount).toBe(0);
    expect(value.adapter.statistics.pendingContentSortCount).toBe(1);
    value.releaseSettlements();
    expect(
      value.adapter.advanceOrderingRefresh({
        maximumTextureUploads: 1,
        maximumPositionExtractions: 1,
      }).ready,
    ).toBe(true);
    value.adapter.advance(content, {
      maximumTextureUploads: 1,
      maximumPositionExtractions: 1,
    });
    expect(value.adapter.statistics.pendingContentSortCount).toBe(0);
    expect(value.adapter.statistics.activeSorterOwnerCount).toBe(1);
  });

  it("motion convergence: finishes an admitted camera upload, publishes content, then sorts the latest view", async function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    const value = harness();
    value.descriptor.currentWorkCpuPeakBytes = 200;
    value.descriptor.currentWorkGpuPeakBytes = 400;
    const published = publish(value);
    const adapter = value.adapter;
    adapter.update();
    const pending = [];
    const sortedViews = [];
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask(parameters) {
          if (parameters.operation !== "SORT") {
            return Promise.resolve(
              sortGaussianSegmentedGlobalPositions(parameters),
            );
          }
          expect(pending.length).toBe(0);
          sortedViews.push(parameters.viewGeneration);
          return new Promise((resolve) => {
            pending.push(() =>
              resolve(sortGaussianSegmentedGlobalPositions(parameters)),
            );
          });
        },
        destroy() {},
      },
    });
    adapter._sorter = sorter;
    adapter._consumeOrderingValidation =
      consumeGaussianSegmentedGlobalOrderingValidation;
    const preparation = sorter.requestPreparation({
      artifactIdentity: "artifact",
      contentIdentity: "motion-seed",
      requestSerial: 1,
      selectedSplatCount: 1,
      pages: [{ ...adapter.coreIdentity(0), uploadBytes: 8192 }],
    });
    sorter.update(() => value.pageSource.payload);
    await Promise.resolve();
    await Promise.resolve();
    expect(sorter.takeSettlements()[0].error).toBeUndefined();
    sorter.releasePreparation(preparation);
    const settleSort = async function () {
      expect(pending.length).toBe(1);
      pending.shift()();
      await Promise.resolve();
      await Promise.resolve();
    };
    const limits = {
      maximumMappingEntries: 1,
      maximumTextureUploads: 0,
      maximumPositionExtractions: 1,
    };
    adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [2, 0, 0],
    });
    expect(adapter.advanceOrderingRefresh(limits).ready).toBe(false);
    const targetCut = {};
    const targetOwnership = {};
    const ticket = adapter.prepare({
      kind: "TRANSITION",
      current: published.owner,
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: published.snapshot,
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        contentGeneration: 1,
        mappingGeneration: 1,
        viewGeneration: 1,
        sortCenter: [1, 0, 0],
      },
    });
    expect(adapter.advance(ticket, limits).ready).toBe(false);
    await settleSort();
    expect(adapter.advanceOrderingRefresh(limits).ready).toBe(false);
    const cameraUpload = adapter._orderingWork.orderingUpload;
    const resources = adapter._resources;
    const advanceUpload = resources.advanceOrderingUpload.bind(resources);
    const abortUpload = spyOn(
      resources,
      "abortOrderingUpload",
    ).and.callThrough();
    let cameraUploadSlices = 0;
    spyOn(resources, "advanceOrderingUpload").and.callFake((...args) => {
      const progress = advanceUpload(...args);
      if (args[0] === cameraUpload && args[1] > 0) {
        cameraUploadSlices++;
        return { ready: cameraUploadSlices === 2, uploadedBytes: 4 };
      }
      return progress;
    });
    expect(adapter.advance(ticket, limits).ready).toBe(false);
    await settleSort();
    expect(adapter.advance(ticket, limits).ready).toBe(false);
    const uploading = { ...limits, maximumTextureUploads: 1 };
    // Camera observations remain in the controller's latest-view slot. They
    // must not resubmit this already admitted request or reset its upload.
    expect(adapter.advanceOrderingRefresh(uploading).ready).toBe(false);
    expect(adapter._orderingWork.orderingUpload).toBe(cameraUpload);
    expect(adapter.advanceOrderingRefresh(uploading).ready).toBe(true);
    expect(adapter.currentViewGeneration).toBe(2);
    expect(abortUpload).not.toHaveBeenCalled();
    // The older content proof is still rejected, but only this one installed
    // camera generation can force a retry while content has admission priority.
    expect(adapter.advance(ticket, limits).ready).toBe(false);
    expect(abortUpload).toHaveBeenCalledTimes(1);
    expect(adapter.advance(ticket, limits).ready).toBe(false);
    await settleSort();
    const progress = adapter.advance(ticket, uploading);
    expect(progress.ready).toBe(true);
    const successor = adapter.commit(
      adapter.preflight(ticket, progress.receipt, published.snapshot),
    );
    expect(successor).not.toBe(published.owner);
    expect(adapter.statistics.contentPublicationCount).toBe(2);
    expect(adapter.currentViewGeneration).toBe(2);
    // Intermediate observations 3..5 never allocate an owner or worker job.
    adapter.requestOrderingRefresh({
      viewGeneration: 6,
      sortCenter: [6, 0, 0],
    });
    expect(adapter.advanceOrderingRefresh(limits).ready).toBe(false);
    await settleSort();
    expect(adapter.advanceOrderingRefresh(uploading).ready).toBe(true);
    expect(adapter.currentViewGeneration).toBe(6);
    expect(sortedViews).toEqual([2, 1, 2, 6]);
    expect(value.resourceAdapter.orderingOverlayReceipts.length).toBe(0);
    expect(value.orderingUploadCursorCount).toBe(0);
    expect(sorter.destroy()).toBe(true);
  });

  it("coalesces three camera views while retaining one D1 successor", function () {
    const value = harness();
    publish(value);
    value.adapter.update();
    value.holdSettlements();
    for (let viewGeneration = 2; viewGeneration <= 4; viewGeneration++) {
      value.adapter.requestOrderingRefresh({
        viewGeneration,
        sortCenter: [viewGeneration, 0, 0],
      });
    }
    value.releaseSettlements();
    const result = value.adapter.advanceOrderingRefresh({
      maximumPositionExtractions: 1,
      maximumTextureUploads: 1,
    });
    expect(result.ready).toBe(true);
    expect(value.adapter.statistics.globalViewGeneration).toBe(4);
    expect(value.receiptCreations).toBe(2);
  });

  it("resubmits stale content Ordering for the latest installed view", function () {
    const value = harness();
    const published = publish(value);
    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [1, 0, 0],
    });
    value.adapter.advanceOrderingRefresh({
      maximumPositionExtractions: 1,
      maximumTextureUploads: 1,
    });
    const targetCut = {};
    const targetOwnership = {};
    const ticket = value.adapter.prepare({
      kind: "TRANSITION",
      current: published.owner,
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: published.snapshot,
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        contentGeneration: 1,
        mappingGeneration: 1,
        viewGeneration: 1,
      },
    });
    let progress = value.adapter.advance(ticket, {
      maximumMappingEntries: 1,
      maximumTextureUploads: 1,
      maximumPositionExtractions: 1,
    });
    expect(progress.ready).toBe(false);
    for (let step = 0; step < 4 && !progress.ready; step++) {
      progress = value.adapter.advance(ticket, {
        maximumTextureUploads: 1,
        maximumPositionExtractions: 1,
      });
    }
    expect(progress.ready).toBe(true);
    expect(value.requestedSortCenters.slice(-1)).toEqual([[1, 0, 0]]);
  });

  it("refreshes compatible content without redoing Mapping or retaining stale Ordering", function () {
    for (const stage of [
      "PURE",
      "SORTING",
      "UPLOADING",
      "PARTIAL_UPLOAD",
      "READY",
    ]) {
      const value = harness();
      const snapshot = Object.freeze({ gpuGeneration: 7 });
      const targetCut = {};
      const targetOwnership = {};
      const ticket = value.adapter.prepare({
        kind: "BOOTSTRAP",
        targetOwnershipIdentity: targetOwnership,
        physicalSnapshot: snapshot,
        input: {
          targetCut,
          preparedPagePublication: prepared(targetCut, targetOwnership),
          contentGeneration: 1,
          mappingGeneration: 1,
          viewGeneration: 1,
          sortCenter: [1, 0, 0],
        },
      });
      if (stage === "SORTING") {
        value.holdSettlements();
      }
      if (stage === "PARTIAL_UPLOAD") {
        const advance = value.adapter._resources.advanceOrderingUpload;
        spyOn(value.adapter._resources, "advanceOrderingUpload").and.callFake(
          function (...args) {
            const progress = advance.apply(this, args);
            return args[2].viewGeneration === 1 ? { ready: false } : progress;
          },
        );
      }
      if (stage !== "PURE") {
        value.adapter.advance(ticket, {
          maximumMappingEntries: 1,
          maximumTextureUploads: ["READY", "PARTIAL_UPLOAD"].includes(stage)
            ? 1
            : 0,
          maximumPositionExtractions: 1,
        });
      }
      if (["UPLOADING", "PARTIAL_UPLOAD"].includes(stage)) {
        expect(value.orderingUploadCursorCount).toBe(1);
      }
      const staleIntent = value.adapter._activeSorterOwner?.sortIntent;
      const allocations = value.allocations;
      const copied = ticket.progress.copiedSplats;
      value.adapter.refreshContentView(ticket, {
        viewGeneration: 2,
        sortCenter: [2, 0, 0],
      });
      expect(ticket.progress.copiedSplats).toBe(copied);
      expect(value.allocations).toBe(allocations);
      expect(value.resourceAborts).toBe(0);
      expect(value.orderingUploadCursorCount).toBe(0);
      expect(ticket.progress.ready).toBe(false);
      value.releaseSettlements();
      if (stage === "SORTING") {
        const takeSettlements = value.adapter._sorter.takeSettlements;
        let first = true;
        spyOn(value.adapter._sorter, "takeSettlements").and.callFake(
          function () {
            const current = takeSettlements.call(this);
            if (!first) {
              return current;
            }
            first = false;
            return [{ intent: staleIntent, result: {} }, ...current];
          },
        );
      }
      const progress = value.adapter.advance(ticket, {
        maximumMappingEntries: 1,
        maximumTextureUploads: 1,
        maximumPositionExtractions: 1,
      });
      expect(progress.ready).toBe(true);
      expect(value.allocations).toBe(
        stage === "PURE" ? allocations + 1 : allocations,
      );
      expect(value.uploadedOrderingViews.slice(-1)).toEqual([2]);
      expect(value.requestedSortCenters.slice(-1)).toEqual([[2, 0, 0]]);
      expect(value.validationConsumptions).toBe(
        ["PURE", "SORTING"].includes(stage) ? 1 : 2,
      );
      if (stage === "SORTING") {
        expect(value.adapter.statistics.globalStaleSortDiscardCount).toBe(1);
      }
      const authority = value.adapter.preflight(
        ticket,
        progress.receipt,
        snapshot,
      );
      value.adapter.commit(authority);
      expect(value.adapter.statistics.globalViewGeneration).toBe(2);
      expect(() =>
        value.adapter.refreshContentView(ticket, {
          viewGeneration: 3,
          sortCenter: [3, 0, 0],
        }),
      ).toThrowDeveloperError();
      expect(value.orderingUploadCursorCount).toBe(0);
    }
  });

  it("retains cleanup authority when compatible-view cancellation or destruction fails", function () {
    for (const failure of ["cancel", "abortOrderingUpload", "resetOrdering"]) {
      const value = harness();
      const targetCut = {};
      const targetOwnership = {};
      const ticket = value.adapter.prepare({
        kind: "BOOTSTRAP",
        targetOwnershipIdentity: targetOwnership,
        physicalSnapshot: Object.freeze({ gpuGeneration: 7 }),
        input: {
          targetCut,
          preparedPagePublication: prepared(targetCut, targetOwnership),
          contentGeneration: 1,
          mappingGeneration: 1,
          viewGeneration: 1,
        },
      });
      if (failure === "cancel") {
        value.holdSettlements();
      }
      value.adapter.advance(ticket, {
        maximumMappingEntries: 1,
        maximumTextureUploads: failure === "resetOrdering" ? 1 : 0,
        maximumPositionExtractions: 1,
      });
      const target =
        failure === "cancel" ? value.adapter._sorter : value.adapter._resources;
      const original = target[failure];
      let first = true;
      spyOn(target, failure).and.callFake(function (...args) {
        if (first) {
          first = false;
          throw new Error("injected compatible-view cleanup failure");
        }
        return original.apply(this, args);
      });
      expect(() =>
        value.adapter.refreshContentView(ticket, {
          viewGeneration: 2,
          sortCenter: [2, 0, 0],
        }),
      ).toThrowError("injected compatible-view cleanup failure");
      expect(value.resourceAborts).toBe(0);
      expect(value.adapter.abort(ticket, "retry after refresh failure")).toBe(
        true,
      );
      expect(ticket.progress.state).toBe("ABORTED");
      expect(value.resourceAborts).toBe(1);
      expect(value.orderingUploadCursorCount).toBe(0);
    }
  });

  it("aborts D1 and retires resources when receipt creation fails", function () {
    const value = harness({ failReceipt: true });
    const targetCut = {};
    const targetOwnership = {};
    const snapshot = Object.freeze({ gpuGeneration: 7 });
    const ticket = value.adapter.prepare({
      kind: "BOOTSTRAP",
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: snapshot,
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        contentGeneration: 1,
        mappingGeneration: 1,
      },
    });
    const progress = value.adapter.advance(ticket, {
      maximumMappingEntries: 1,
      maximumTextureUploads: 1,
      maximumPositionExtractions: 1,
    });
    expect(function () {
      value.adapter.preflight(ticket, progress.receipt, snapshot);
    }).toThrowError("injected receipt failure");
    expect(value.d1Aborts).toBe(1);
    expect(value.resourceAborts).toBe(1);
  });

  it("commits successfully and retries synchronous and asynchronous prune failure", function () {
    for (const option of ["failPruneSync", "failPruneAsync"]) {
      const value = harness({ [option]: true });
      publish(value);
      value.adapter.update();
      expect(value.adapter.statistics.maintenanceFailureCount).toBe(1);
      value.adapter.update();
      expect(value.adapter.statistics.pendingPruneMaintenanceCount).toBe(0);
      expect(value.adapter.statistics.contentPublicationCount).toBe(1);
    }
  });

  it("rejects camera Ordering before side effects when D2 overlay is absent", function () {
    const value = harness({ omitResourceAdapter: true });
    publish(value);
    const receipts = value.receiptCreations;
    const uploads = value.orderingUploads;
    expect(function () {
      value.adapter.requestOrderingRefresh({
        viewGeneration: 2,
        sortCenter: [1, 0, 0],
      });
    }).toThrowDeveloperError();
    expect(value.receiptCreations).toBe(receipts);
    expect(value.orderingUploads).toBe(uploads);
  });

  it("performs zero Ordering upload at zero limit and one at one limit", function () {
    const value = harness();
    publish(value);
    const baseline = value.orderingUploads;
    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [1, 0, 0],
    });
    expect(
      value.adapter.advanceOrderingRefresh({
        maximumPositionExtractions: 1,
        maximumTextureUploads: 0,
      }).ready,
    ).toBe(false);
    expect(value.orderingUploads).toBe(baseline);
    expect(
      value.adapter.advanceOrderingRefresh({
        maximumPositionExtractions: 1,
        maximumTextureUploads: 1,
      }).ready,
    ).toBe(true);
    expect(value.orderingUploads).toBe(baseline + 1);
  });

  it("continues content Ordering with one-shot validation after zero or partial uploads", function () {
    for (const firstBudget of [0, 1]) {
      const value = harness();
      const targetCut = {};
      const targetOwnership = {};
      const ticket = value.adapter.prepare({
        kind: "BOOTSTRAP",
        targetOwnershipIdentity: targetOwnership,
        physicalSnapshot: Object.freeze({ gpuGeneration: 7 }),
        input: {
          targetCut,
          preparedPagePublication: prepared(targetCut, targetOwnership),
          contentGeneration: 1,
          mappingGeneration: 1,
          viewGeneration: 1,
        },
      });
      const advance = value.adapter._resources.advanceOrderingUpload;
      let chunks = 0;
      spyOn(value.adapter._resources, "advanceOrderingUpload").and.callFake(
        function (...args) {
          advance.apply(this, args);
          chunks += args[1] > 0 ? 1 : 0;
          return { ready: chunks === firstBudget + 1 };
        },
      );
      const limits = {
        maximumMappingEntries: 1,
        maximumTextureUploads: firstBudget,
        maximumPositionExtractions: 1,
      };
      expect(value.adapter.advance(ticket, limits).ready).toBe(false);
      expect(value.validationConsumptions).toBe(1);
      expect(value.orderingUploadCursorCount).toBe(1);
      expect(
        value.adapter.advance(ticket, { ...limits, maximumTextureUploads: 1 })
          .ready,
      ).toBe(true);
      expect(value.validationConsumptions).toBe(1);
      expect(value.orderingUploadCursorCount).toBe(0);
      expect(value.allocations).toBe(1);
    }
  });

  it("continues camera Ordering through partial upload with one-shot validation", function () {
    const value = harness();
    publish(value);
    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [2, 0, 0],
    });
    const advance = value.adapter._resources.advanceOrderingUpload;
    let chunks = 0;
    spyOn(value.adapter._resources, "advanceOrderingUpload").and.callFake(
      function (...args) {
        advance.apply(this, args);
        chunks++;
        return { ready: chunks === 2 };
      },
    );
    const limits = { maximumTextureUploads: 1, maximumPositionExtractions: 1 };
    expect(value.adapter.advanceOrderingRefresh(limits).ready).toBe(false);
    expect(value.validationConsumptions).toBe(2);
    expect(value.adapter.advanceOrderingRefresh(limits).ready).toBe(true);
    expect(value.validationConsumptions).toBe(2);
    expect(value.orderingUploadCursorCount).toBe(0);
    expect(value.adapter.statistics.globalViewGeneration).toBe(2);
    expect(value.resourceAdapter.orderingOverlayReceipts.length).toBe(0);
  });

  it("resets validated content when upload cursor creation fails before allocation", function () {
    const value = harness();
    const targetCut = {};
    const targetOwnership = {};
    const ticket = value.adapter.prepare({
      kind: "BOOTSTRAP",
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: Object.freeze({ gpuGeneration: 7 }),
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        contentGeneration: 1,
        mappingGeneration: 1,
        viewGeneration: 1,
      },
    });
    const prepare = value.adapter._resources.prepareOrderingUpload;
    let first = true;
    spyOn(value.adapter._resources, "prepareOrderingUpload").and.callFake(
      function (...args) {
        if (first) {
          first = false;
          throw new Error("injected before cursor allocation");
        }
        return prepare.apply(this, args);
      },
    );
    const limits = {
      maximumMappingEntries: 1,
      maximumTextureUploads: 1,
      maximumPositionExtractions: 1,
    };
    expect(() => value.adapter.advance(ticket, limits)).toThrowError(
      "injected before cursor allocation",
    );
    expect(value.validationConsumptions).toBe(1);
    expect(value.orderingUploadCursorCount).toBe(0);
    value.adapter.refreshContentView(ticket, {
      viewGeneration: 2,
      sortCenter: [2, 0, 0],
    });
    expect(value.adapter.advance(ticket, limits).ready).toBe(true);
    expect(value.validationConsumptions).toBe(2);
    expect(value.uploadedOrderingViews).toEqual([2]);
    expect(value.orderingUploadCursorCount).toBe(0);
    expect(value.allocations).toBe(1);
  });

  it("requires a new one-shot proof after content view reset", function () {
    const value = harness();
    const targetCut = {};
    const targetOwnership = {};
    const ticket = value.adapter.prepare({
      kind: "BOOTSTRAP",
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: Object.freeze({ gpuGeneration: 7 }),
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        viewGeneration: 1,
      },
    });
    const limits = {
      maximumMappingEntries: 1,
      maximumTextureUploads: 0,
      maximumPositionExtractions: 1,
    };
    expect(value.adapter.advance(ticket, limits).ready).toBe(false);
    expect(value.validationConsumptions).toBe(1);
    value.adapter.refreshContentView(ticket, {
      viewGeneration: 2,
      sortCenter: [2, 0, 0],
    });
    const consume = spyOn(
      value.adapter,
      "_consumeOrderingValidation",
    ).and.returnValue(undefined);
    expect(() =>
      value.adapter.advance(ticket, { ...limits, maximumTextureUploads: 1 }),
    ).toThrowError("Segmented global Ordering proof is invalid");
    expect(consume).toHaveBeenCalledTimes(1);
    expect(ticket.progress.ready).toBe(false);
    expect(value.orderingUploadCursorCount).toBe(0);
    expect(value.adapter.abort(ticket, "missing fresh proof")).toBe(true);
  });

  it("replaces a content upload proof when the installed camera view advances", function () {
    const value = harness();
    const published = publish(value);
    const targetCut = {};
    const targetOwnership = {};
    const ticket = value.adapter.prepare({
      kind: "TRANSITION",
      current: published.owner,
      targetOwnershipIdentity: targetOwnership,
      physicalSnapshot: published.snapshot,
      input: {
        targetCut,
        preparedPagePublication: prepared(targetCut, targetOwnership),
        contentGeneration: 1,
        mappingGeneration: 1,
        viewGeneration: 1,
      },
    });
    const limits = {
      maximumMappingEntries: 1,
      maximumTextureUploads: 0,
      maximumPositionExtractions: 1,
    };
    expect(value.adapter.advance(ticket, limits).ready).toBe(false);
    expect(value.orderingUploadCursorCount).toBe(1);
    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [2, 0, 0],
    });
    expect(
      value.adapter.advanceOrderingRefresh({
        ...limits,
        maximumTextureUploads: 1,
      }).ready,
    ).toBe(true);
    expect(value.adapter.advance(ticket, limits).ready).toBe(false);
    expect(value.orderingUploadCursorCount).toBe(0);
    expect(
      value.adapter.advance(ticket, { ...limits, maximumTextureUploads: 1 })
        .ready,
    ).toBe(true);
    expect(value.validationConsumptions).toBe(4);
    expect(value.uploadedOrderingViews.slice(-1)).toEqual([2]);
    expect(value.orderingUploadCursorCount).toBe(0);
  });

  it("supersedes a zero-upload Ordering cursor with exact latest CPU and GPU identity", function () {
    const value = harness();
    publish(value);
    value.adapter.update();
    const baselineUploads = value.orderingUploads;
    const baselineReceipts = value.receiptCreations;

    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [2, 0, 0],
    });
    expect(
      value.adapter.advanceOrderingRefresh({
        maximumPositionExtractions: 1,
        maximumTextureUploads: 0,
      }).ready,
    ).toBe(false);
    expect(value.orderingUploads).toBe(baselineUploads);
    expect(value.orderingUploadCursorCount).toBe(1);
    expect(value.overlayReservationCount).toBe(1);
    expect(value.resourceAdapter.orderingOverlayReceipts.length).toBe(1);

    value.adapter.requestOrderingRefresh({
      viewGeneration: 3,
      sortCenter: [3, 0, 0],
    });
    expect(
      value.adapter.advanceOrderingRefresh({
        maximumPositionExtractions: 1,
        maximumTextureUploads: 1,
      }).ready,
    ).toBe(true);

    expect(value.orderingUploads).toBe(baselineUploads + 1);
    expect(value.uploadedOrderingViews.slice(-1)).toEqual([3]);
    expect(value.adapter.current.resources.ordering[1]).toBe(3);
    expect(value.adapter.current.resources.orderingTexture.ordering).toBe(
      value.adapter.current.resources.ordering,
    );
    expect(value.adapter.current.resources.orderingTexture.ordering[1]).toBe(3);
    expect(value.adapter.statistics.globalViewGeneration).toBe(3);
    expect(value.orderingUploadRebindCount).toBe(1);
    expect(value.receiptCreations).toBe(baselineReceipts + 1);
    expect(value.overlayReservationCount).toBe(1);
    expect(value.resourceAdapter.orderingOverlayReceipts.length).toBe(0);
    expect(value.resourceAdapter.resourceLedger.cpuOrderingOverlayBytes).toBe(
      0,
    );
    expect(value.resourceAdapter.resourceLedger.gpuOrderingOverlayBytes).toBe(
      0,
    );
    expect(value.orderingUploadCursorCount).toBe(0);
    expect(value.adapter.statistics.d3CleanupDebtBytes).toBe(0);
  });

  it("shared upload budget: aborts a partial camera upload before superseding its proof", function () {
    const value = harness();
    publish(value);
    value.adapter.update();
    const resources = value.adapter._resources;
    const originalAdvance = resources.advanceOrderingUpload.bind(resources);
    const abort = spyOn(resources, "abortOrderingUpload").and.callThrough();
    const rebind = spyOn(resources, "rebindOrderingUpload").and.callThrough();
    spyOn(resources, "advanceOrderingUpload").and.callFake((...args) => {
      const progress = originalAdvance(...args);
      return args[2].viewGeneration === 2
        ? { ready: false, uploadedBytes: 65536 }
        : progress;
    });
    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [2, 0, 0],
    });
    const oldOwner = value.adapter.current;
    const limits = { maximumTextureUploads: 1, maximumPositionExtractions: 1 };
    expect(value.adapter.advanceOrderingRefresh(limits).ready).toBe(false);
    expect(value.adapter.current).toBe(oldOwner);
    const oldCursor = value.adapter._orderingWork.orderingUpload;
    value.adapter.requestOrderingRefresh({
      viewGeneration: 3,
      sortCenter: [3, 0, 0],
    });
    expect(abort).toHaveBeenCalledOnceWith(oldCursor);
    expect(value.orderingUploadCursorCount).toBe(0);
    expect(value.adapter.advanceOrderingRefresh(limits).ready).toBe(true);
    expect(rebind).not.toHaveBeenCalled();
    expect(value.adapter.current.resources.ordering[1]).toBe(3);
    expect(value.validationConsumptions).toBe(3);
    expect(value.overlayReservationCount).toBe(1);
    expect(value.orderingUploadCursorCount).toBe(0);
    expect(value.resourceAdapter.orderingOverlayReceipts.length).toBe(0);
    expect(value.adapter.statistics.d3CleanupDebtBytes).toBe(0);
  });

  it("preserves both consumers when their settlements arrive in either order", function () {
    const value = harness();
    publish(value);
    value.adapter.update();
    value.holdSettlements();
    value.adapter.requestOrderingRefresh({
      viewGeneration: 2,
      sortCenter: [1, 0, 0],
    });
    expect(value.adapter.statistics.activeSorterOwnerCount).toBe(1);
    value.releaseSettlements();
    value.adapter.advanceOrderingRefresh({
      maximumPositionExtractions: 1,
      maximumTextureUploads: 1,
    });
    expect(value.adapter.statistics.globalViewGeneration).toBe(2);
    expect(value.adapter.statistics.globalDrawCommandCount).toBe(1);
  });
});

import _SceneGISGaussianStreamCache from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianStreamCache.js";
import _SceneGISGaussianSegmentedPageBindingLedger from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedPageBindingLedger.js";
import _SceneGISGaussianSegmentedResourceAdapter from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedResourceAdapter.js";

function createHarness(options = {}) {
  const artifactIdentity = "adapter-artifact";
  const leaseIdentity = "adapter-lease";
  const pages = [
    [0, 1, 1, 32],
    [1, 1, 1, 32],
    [2, 2, 2, 16],
    [3, 1, 1, 32],
  ].map(([index, kind, semantic, bytes]) =>
    Object.freeze({
      id: index,
      index,
      assetId: index,
      assetLocalStart: 0,
      splatCount: 1,
      kind,
      semantic,
      layoutId: kind,
      packId: kind - 1,
      packIndex: kind - 1,
      offset: 256 + index * 256,
      storedBytes: bytes,
      rawBytes: bytes,
      checksum: index + 100,
      artifactIdentity,
    }),
  );
  let descriptorPageReads = 0;
  const provider = Object.freeze({
    artifactIdentity,
    compactIndexBytes: 100,
    pageCount: pages.length,
    readPageRequest(pageId) {
      descriptorPageReads++;
      return pages[pageId];
    },
    get statistics() {
      return {
        descriptorPageReads,
        descriptorPackReads: 0,
      };
    },
  });
  const loader = {
    demands: [],
    cancellations: [],
    destroyed: 0,
    destroyAttempts: 0,
    destroyFailuresRemaining: 0,
    pageDemandGeneration: 0,
    settlements: [],
    statistics: {
      pageRangeRequests: 0,
      pageRangeRequestedBytes: 0,
    },
    applyPageDemandDelta(request) {
      this.pageDemandGeneration = request.generation;
      this.demands.push({
        descriptors: request.deltas
          .map((delta) => delta.record?.page)
          .filter(Boolean),
        request,
      });
      return Object.freeze({
        generation: request.generation,
        storageIdentity: request.storageIdentity,
      });
    },
    drainPageWorkSettlements() {
      const result = this.settlements;
      this.settlements = [];
      return result;
    },
    cancelUndesired(ids, generation) {
      this.cancellations.push({ ids: [...ids], generation });
    },
    destroy() {
      this.destroyAttempts++;
      if (this.destroyFailuresRemaining > 0) {
        this.destroyFailuresRemaining--;
        throw new Error("injected Loader destroy failure");
      }
      this.destroyed++;
    },
  };
  const cache = new _SceneGISGaussianStreamCache({
    maximumBytes: 512,
    maxShDegree: 1,
    maximumCoreBytes: 512,
    maximumShBytes: 512,
    snapshotLeaseIdentity: leaseIdentity,
  });
  let cacheClearAttempts = 0;
  let cacheClearSuccesses = 0;
  let cacheClearFailuresRemaining = 0;
  const cacheClear = cache.clear.bind(cache);
  cache.clear = function () {
    cacheClearAttempts++;
    if (cacheClearFailuresRemaining > 0) {
      cacheClearFailuresRemaining--;
      throw new Error("injected Cache clear failure");
    }
    const result = cacheClear();
    cacheClearSuccesses++;
    return result;
  };
  const cachePeek = cache.peek.bind(cache);
  cache.peek = function (...args) {
    if (rejectPostCommitExternal) {
      throw new Error("external Cache call after D1 commit");
    }
    return cachePeek(...args);
  };
  const receiptPages = new WeakMap();
  const receiptsByPage = new Map();
  const releasedPageIds = [];
  const releaseAttemptIds = [];
  const releaseFailures = new Set();
  let provisionalReceiptFailureAt = 0;
  let provisionalReceiptValidations = 0;
  let rejectPostCommitExternal = false;
  const gpuLedger = new _SceneGISGaussianSegmentedPageBindingLedger({
    artifactIdentity,
    leaseIdentity,
    maxShDegree: 1,
    maximumBytes: options.maximumGpuPageBytes ?? 4 * 8192,
    ...(options.retainUnownedPages === true
      ? {
          retainUnownedPages: true,
          maxShDegree: 1,
          maximumBytes: options.maximumGpuPageBytes ?? 4 * 8192,
        }
      : {}),
    validateBindingReceipt(receipt, descriptor, ownerToken) {
      if (rejectPostCommitExternal) {
        throw new Error("external GPU validation after D1 commit");
      }
      if (ownerToken?.currentGeneration) {
        provisionalReceiptValidations++;
        if (provisionalReceiptValidations === provisionalReceiptFailureAt) {
          throw new Error("injected provisional GPU receipt failure");
        }
      }
      if (receiptPages.get(receipt) !== descriptor.index) {
        throw new Error("fake GPU receipt mismatch");
      }
      return receipt;
    },
    releaseBinding(_receipt, descriptor) {
      releaseAttemptIds.push(descriptor.index);
      if (releaseFailures.delete(descriptor.index)) {
        throw new Error("injected fake GPU release failure");
      }
      releasedPageIds.push(descriptor.index);
    },
  });
  const physicalSnapshots = new WeakSet();
  const tickets = new WeakSet();
  const publicationReceipts = new WeakSet();
  const consumedReceipts = new WeakSet();
  const abortedTickets = new WeakSet();
  const authorities = new WeakSet();
  const authorityReceipts = new WeakMap();
  const retired = [];
  const aborted = [];
  let presentationOrdinal = 0;
  let presentationCommitCount = 0;
  let prepareFailure = false;
  let commitFailure = false;
  let abortFailuresRemaining = 0;
  let retireFailuresRemaining = 0;
  let retireAttemptCount = 0;
  const presentation = {
    prepare(request) {
      if (prepareFailure) {
        throw new Error("injected D1 prepare failure");
      }
      if (!physicalSnapshots.has(request.physicalSnapshot)) {
        throw new Error("foreign physical snapshot");
      }
      const ticket = Object.freeze({ request });
      tickets.add(ticket);
      return ticket;
    },
    describe(ticket, physicalSnapshot) {
      if (!tickets.has(ticket) || !physicalSnapshots.has(physicalSnapshot)) {
        throw new Error("fake presentation describe mismatch");
      }
      return Object.freeze({
        cpuBytes: options.describedPresentationCpuBytes ?? 10,
        gpuBytes: options.describedPresentationGpuBytes ?? 20,
        selectedSplatCount: 1,
        slotCount: 1,
        descriptorIdentity: "fake-presentation-descriptor",
      });
    },
    preflight(ticket, receipt, physicalSnapshot) {
      if (
        !tickets.has(ticket) ||
        abortedTickets.has(ticket) ||
        !publicationReceipts.has(receipt) ||
        consumedReceipts.has(receipt) ||
        receipt?.ticket !== ticket ||
        !physicalSnapshots.has(physicalSnapshot)
      ) {
        throw new Error("fake presentation receipt mismatch");
      }
      const authority = Object.freeze({
        ticket,
        publicationReceipt: receipt,
        physicalSnapshot,
        identity: `presentation-${presentationOrdinal + 1}`,
        cpuBytes: 10,
        gpuBytes: 20,
      });
      authorities.add(authority);
      authorityReceipts.set(authority, receipt);
      return authority;
    },
    commit(authority) {
      presentationCommitCount++;
      if (commitFailure) {
        throw new Error("injected D1 commit failure");
      }
      if (!authorities.has(authority)) {
        throw new Error("fake presentation authority mismatch");
      }
      consumedReceipts.add(authorityReceipts.get(authority));
      presentationOrdinal++;
      if (options.guardPostCommitExternal) {
        rejectPostCommitExternal = true;
      }
      return Object.freeze({ presentationOrdinal });
    },
    abort(ticket) {
      if (!tickets.has(ticket)) {
        throw new Error("foreign presentation ticket");
      }
      if (abortFailuresRemaining > 0) {
        abortFailuresRemaining--;
        throw new Error("injected presentation abort failure");
      }
      abortedTickets.add(ticket);
      aborted.push(ticket);
    },
    retire(presentationState) {
      retireAttemptCount++;
      if (retireFailuresRemaining > 0) {
        retireFailuresRemaining--;
        throw new Error("injected presentation retire failure");
      }
      retired.push(presentationState);
    },
  };
  const adapter = new _SceneGISGaussianSegmentedResourceAdapter({
    descriptorProvider: provider,
    loader,
    cache,
    gpuLedger,
    presentation,
    leaseIdentity,
    maximumCpuBytes: options.maximumCpuBytes ?? 1024,
    maximumGpuBytes: options.maximumGpuBytes ?? 128 * 1024,
    loaderHttpReserveBytes: 8,
    persistentStagingReserveBytes: 4,
    workerReserveBytes: 0,
    rendererReserveBytes: 12,
    gpuAtlasAllocatedBytes: options.gpuAtlasAllocatedBytes ?? 0,
    createPhysicalSnapshot(receipt) {
      const snapshot = Object.freeze({
        fakeScale1cPhysicalSnapshot: true,
        receipt,
      });
      physicalSnapshots.add(snapshot);
      return snapshot;
    },
    validatePhysicalSnapshot(snapshot) {
      if (!physicalSnapshots.has(snapshot)) {
        throw new Error("foreign physical snapshot");
      }
      return snapshot;
    },
  });
  return {
    adapter,
    cache,
    gpuLedger,
    loader,
    pages,
    releasedPageIds,
    releaseAttemptIds,
    retired,
    aborted,
    receipt(descriptor) {
      const receipt = Object.freeze({ fakeGpuReceipt: true });
      receiptPages.set(receipt, descriptor.index);
      receiptsByPage.set(descriptor.index, receipt);
      return receipt;
    },
    retainedReceipt(pageId) {
      return receiptsByPage.get(pageId);
    },
    publicationReceipt(ticket) {
      const receipt = Object.freeze({ ticket });
      publicationReceipts.add(receipt);
      return receipt;
    },
    failPageReleaseOnce(pageId) {
      releaseFailures.add(pageId);
    },
    failPrepare(value = true) {
      prepareFailure = value;
    },
    failCommit(value = true) {
      commitFailure = value;
    },
    failNextCurrentCpuLease() {
      const commit = cache.commitCoreLease.bind(cache);
      cache.commitCoreLease = function (plan) {
        if (plan.ownerToken.startsWith("scale-1d-current:")) {
          cache.commitCoreLease = commit;
          return undefined;
        }
        return commit(plan);
      };
    },
    failNextCurrentGpuReservation() {
      const reserve = gpuLedger.reserveOwnerPages.bind(gpuLedger);
      gpuLedger.reserveOwnerPages = function (owner, descriptors) {
        if (owner?.currentGeneration) {
          gpuLedger.reserveOwnerPages = reserve;
          throw new Error("injected provisional GPU reservation failure");
        }
        return reserve(owner, descriptors);
      };
    },
    failProvisionalReceiptAt(ordinal) {
      provisionalReceiptFailureAt = ordinal;
      provisionalReceiptValidations = 0;
    },
    failAbort(times = 1) {
      abortFailuresRemaining = times;
    },
    failRetire(times = 1) {
      retireFailuresRemaining = times;
    },
    failLoaderDestroy(times = 1) {
      loader.destroyFailuresRemaining = times;
    },
    failCacheClear(times = 1) {
      cacheClearFailuresRemaining = times;
    },
    clearPostCommitGuard() {
      rejectPostCommitExternal = false;
    },
    get presentationCommitCount() {
      return presentationCommitCount;
    },
    get retireAttemptCount() {
      return retireAttemptCount;
    },
    get cacheClearCount() {
      return cacheClearSuccesses;
    },
    get cacheClearAttempts() {
      return cacheClearAttempts;
    },
    get cacheClearSuccesses() {
      return cacheClearSuccesses;
    },
  };
}

function loadAndBind(harness, work) {
  const demanded = harness.adapter.requestRequiredPages(work);
  const request = harness.loader.demands.at(-1)?.request;
  for (const pageId of demanded) {
    const descriptor = harness.pages[pageId];
    const record = request.deltas.find(
      (delta) => delta.pageIndex === pageId,
    ).record;
    expect(
      harness.adapter.acceptPageWorkCompletion(work, {
        page: descriptor,
        payload: new Uint8Array(descriptor.storedBytes),
        pageWorkKey: record.key,
      }),
    ).toBe(true);
    harness.adapter.reserveAndBindGpuPage(
      work,
      pageId,
      harness.receipt(descriptor),
    );
  }
}

function publish(harness, work) {
  const snapshot = harness.adapter.capturePhysicalSnapshot(work);
  const ticket = harness.adapter.preparePresentation(work, {});
  harness.adapter.commitPresentation(work, harness.publicationReceipt(ticket));
  harness.adapter.finalizeRetirement(work);
  return snapshot;
}

function prepareForCommit(harness, pageIds = [0]) {
  const work = harness.adapter.beginBootstrapWork({
    targetOwnershipIdentity: {},
    requiredCorePageIds: pageIds,
    presentationCpuBytes: 10,
    presentationGpuBytes: 20,
  });
  loadAndBind(harness, work);
  harness.adapter.capturePhysicalSnapshot(work);
  const ticket = harness.adapter.preparePresentation(work, {});
  return { work, ticket };
}

function expectResourceAvailability(adapter) {
  const full = adapter.resourceLedger;
  const availability = adapter.resourceAvailability;
  expect(Object.isFrozen(availability)).toBe(true);
  expect(availability).toEqual({
    cpuTotal: full.cpuTotal,
    gpuTotal: full.gpuTotal,
    cpuCleanupDebtBytes: full.cpuCleanupDebtBytes,
    gpuCleanupDebtBytes: full.gpuCleanupDebtBytes,
    cpuOrderingOverlayBytes: full.cpuOrderingOverlayBytes,
    gpuOrderingOverlayBytes: full.gpuOrderingOverlayBytes,
  });
}

describe("SceneGIS/Scene/SceneGISGaussianSegmentedResourceAdapter", function () {
  function warmHarness(options = {}) {
    return createHarness({
      retainUnownedPages: true,
      maximumGpuBytes: 128 * 1024,
      ...options,
    });
  }

  function warmWork(harness, pageId) {
    const request = {
      targetOwnershipIdentity: {},
      requiredCorePageIds: [pageId],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    };
    if (harness.adapter.currentPresentationIdentity) {
      request.sourcePresentationIdentity =
        harness.adapter.currentPresentationIdentity;
      return harness.adapter.beginTransitionWork(request);
    }
    return harness.adapter.beginBootstrapWork(request);
  }

  function publishNewWarmPage(harness, pageId) {
    const work = warmWork(harness, pageId);
    loadAndBind(harness, work);
    return publish(harness, work);
  }

  function persistentCompletion(harness, work) {
    harness.adapter.requestRequiredPages(work);
    const descriptor = harness.pages[0];
    const record = harness.loader.demands
      .at(-1)
      .request.deltas.find((delta) => delta.pageIndex === 0).record;
    const payload = Uint8Array.from(
      { length: descriptor.storedBytes },
      (_, index) => index + 1,
    );
    let stagingBytes = payload.byteLength;
    const release = jasmine
      .createSpy("persistent staging release")
      .and.callFake(() => {
        stagingBytes -= payload.byteLength;
      });
    return {
      completion: {
        page: descriptor,
        payload,
        pageWorkKey: record.key,
        release,
      },
      get stagingBytes() {
        return stagingBytes;
      },
    };
  }

  function progressiveAcquisition(options = {}) {
    const harness = warmHarness();
    publishNewWarmPage(harness, 0);
    const parent = harness.adapter.beginTransitionWork({
      sourcePresentationIdentity: harness.adapter.currentPresentationIdentity,
      targetOwnershipIdentity: {},
      requiredCorePageIds: [1, 3],
      presentationCpuBytes: options.presentationCpuBytes ?? 10,
      presentationGpuBytes: options.presentationGpuBytes ?? 20,
    });
    expect(harness.adapter.requestRequiredPages(parent)).toEqual([1, 3]);
    const request = harness.loader.demands.at(-1).request;
    const completions = new Map(
      request.deltas.map(({ pageIndex, record }) => [
        pageIndex,
        {
          page: harness.pages[pageIndex],
          payload: new Uint8Array(harness.pages[pageIndex].storedBytes),
          pageWorkKey: record.key,
        },
      ]),
    );
    const finishPage = (pageId) => {
      expect(
        harness.adapter.acceptPageWorkCompletion(
          parent,
          completions.get(pageId),
        ),
      ).toBe(true);
      harness.adapter.reserveAndBindGpuPage(
        parent,
        pageId,
        harness.receipt(harness.pages[pageId]),
      );
    };
    finishPage(1);
    expect(parent.state).toBe("LOADING");
    const childOptions = {
      sourcePresentationIdentity: harness.adapter.currentPresentationIdentity,
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0, 1],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    };
    return { harness, parent, childOptions, finishPage };
  }

  it("resource availability: keeps exact live totals without scanning current Pages", function () {
    for (const gpuAtlasAllocatedBytes of [0, 64 * 1024]) {
      const harness = warmHarness({ gpuAtlasAllocatedBytes });
      const adapter = harness.adapter;
      expectResourceAvailability(adapter);
      const first = warmWork(harness, 0);
      expectResourceAvailability(adapter);
      loadAndBind(harness, first);
      expectResourceAvailability(adapter);
      publish(harness, first);
      expectResourceAvailability(adapter);
      const cpuScan = spyOn(adapter, "_stableCpuBytes").and.callThrough();
      const gpuScan = spyOn(adapter, "_stableGpuBytes").and.callThrough();
      const stable = adapter.resourceAvailability;
      expect(adapter.resourceAvailability).toEqual(stable);
      expect(cpuScan).not.toHaveBeenCalled();
      expect(gpuScan).not.toHaveBeenCalled();

      const overlay = adapter.reserveOrderingOverlay({}, 64, 128);
      expectResourceAvailability(adapter);
      expect(adapter.resourceAvailability.cpuTotal).toBe(stable.cpuTotal + 64);
      expect(adapter.resourceAvailability.gpuTotal).toBe(stable.gpuTotal + 128);
      const next = warmWork(harness, 1);
      expectResourceAvailability(adapter);
      loadAndBind(harness, next);
      adapter.capturePhysicalSnapshot(next);
      const ticket = adapter.preparePresentation(next, {});
      adapter.commitPresentation(next, harness.publicationReceipt(ticket));
      expectResourceAvailability(adapter);
      harness.failRetire();
      expect(adapter.finalizeRetirement(next)).toBe(false);
      expectResourceAvailability(adapter);
      expect(adapter.resourceAvailability.cpuCleanupDebtBytes).toBe(10);
      expect(adapter.resourceAvailability.gpuCleanupDebtBytes).toBe(20);
      expect(adapter.settleCleanupDebt(adapter.cleanupDebtTokens[0])).toBe(
        true,
      );
      expect(harness.gpuLedger.warmBytes).toBeGreaterThan(0);
      expectResourceAvailability(adapter);
      adapter.releaseOrderingOverlay(overlay, 0, 128);
      expectResourceAvailability(adapter);
      adapter.releaseOrderingOverlay(overlay, 0, 0);

      harness.failRetire();
      adapter.destroy();
      expectResourceAvailability(adapter);
      expect(adapter.settleCleanupDebt(adapter.cleanupDebtTokens[0])).toBe(
        true,
      );
      expect(adapter.destroyed).toBe(true);
      expectResourceAvailability(adapter);
    }
  });

  it("resource availability: includes simultaneous acquisition and checkpoint reservations", function () {
    const { harness, parent, childOptions } = progressiveAcquisition();
    const adapter = harness.adapter;
    expectResourceAvailability(adapter);
    const before = adapter.resourceAvailability;
    const child = adapter.beginCheckpointWork(parent, childOptions);
    expectResourceAvailability(adapter);
    expect(adapter.resourceAvailability.cpuTotal).toBe(before.cpuTotal + 10);
    expect(adapter.resourceAvailability.gpuTotal).toBe(before.gpuTotal + 20);
    adapter.abortWork(child, "test-checkpoint");
    expectResourceAvailability(adapter);
    expect(adapter.resourceAvailability).toEqual(before);
    adapter.destroy();
    expectResourceAvailability(adapter);
  });

  it("progressive checkpoint: keeps the final lease and delayed Page demand through child commit, retirement and exact final publication", function () {
    const { harness, parent, childOptions, finishPage } =
      progressiveAcquisition();
    const adapter = harness.adapter;
    const parentOwner = `scale-1d-work:${parent.generation}`;
    const parentLease = harness.cache._coreLeases.get(parentOwner);
    const parentLoaderOwner = parent.loaderOwnerIdentity;
    const demands = harness.loader.demands.length;
    const cpuHolds = harness.cache._snapshotHolds.size;
    const gpuHolds = harness.gpuLedger._snapshotHolds.size;
    const ready = adapter.capturePhysicalSnapshot(parent, true);
    expect([...ready.receipt.gpuPageIds]).toEqual([0, 1]);
    expect(parent.state).toBe("LOADING");
    expect(parent.physicalSnapshot).toBeUndefined();
    expect(harness.cache._snapshotHolds.size).toBe(cpuHolds);
    expect(harness.gpuLedger._snapshotHolds.size).toBe(gpuHolds);
    expect(() =>
      adapter.beginCheckpointWork(parent, {
        ...childOptions,
        requiredCorePageIds: [0, 1, 3],
      }),
    ).toThrowDeveloperError();
    const child = adapter.beginCheckpointWork(parent, childOptions);
    expect(child.state).toBe("GPU_READY");
    expect(adapter._activeWork).toBe(parent);
    expect(adapter._checkpointWork).toBe(child);
    expect(() =>
      adapter.beginCheckpointWork(parent, childOptions),
    ).toThrowDeveloperError();
    adapter.capturePhysicalSnapshot(child);
    const ticket = adapter.preparePresentation(child, {});
    adapter.commitPresentation(child, harness.publicationReceipt(ticket));
    expect(adapter.currentPageIds).toEqual([0, 1]);
    expect(adapter._activeWork).toBe(parent);
    expect(harness.cache._coreLeases.get(parentOwner)).toBe(parentLease);
    expect(harness.loader.demands.length).toBe(demands);
    expect(adapter.finalizeRetirement(child)).toBe(true);
    expect(adapter._checkpointWork).toBeUndefined();
    expect(adapter._activeWork).toBe(parent);
    expect(parent.state).toBe("LOADING");
    expect(harness.cache._coreLeases.get(parentOwner)).toBe(parentLease);
    expect(harness.loader.demands.length).toBe(demands);
    const finalOwnership = {};
    expect(() =>
      adapter.rebaseAcquisitionWork(parent, finalOwnership, [1]),
    ).toThrowDeveloperError();
    adapter.rebaseAcquisitionWork(parent, finalOwnership, [1, 3]);
    expect(parent.loaderOwnerIdentity).toBe(parentLoaderOwner);
    expect(harness.cache._coreLeases.get(parentOwner)).toBe(parentLease);
    finishPage(3);
    expect(parent.state).toBe("GPU_READY");
    adapter.capturePhysicalSnapshot(parent);
    adapter.rebindTargetPages(parent, [1, 3], []);
    const finalTicket = adapter.preparePresentation(parent, {});
    expect(finalTicket.request.targetOwnershipIdentity).toBe(finalOwnership);
    adapter.commitPresentation(parent, harness.publicationReceipt(finalTicket));
    expect(adapter.finalizeRetirement(parent)).toBe(true);
    expect(adapter.currentPageIds).toEqual([1, 3]);
    expect([...adapter.currentPhysicalSnapshot.receipt.gpuPageIds]).toEqual([
      1, 3,
    ]);
    expect(adapter._activeWork).toBeUndefined();
    expect(harness.cache._coreLeases.has(parentOwner)).toBe(false);
    expect(harness.loader.demands.length).toBe(demands);
    expect(adapter.resourceLedger.cpuPresentationWorkBytes).toBe(0);
    expect(adapter.resourceLedger.gpuPresentationWorkBytes).toBe(0);
    adapter.destroy();
    expect(adapter.destroyed).toBe(true);
  });

  it("progressive checkpoint: includes parent and child presentation reservations and rejects either hard-cap overflow", function () {
    const { harness, parent, childOptions } = progressiveAcquisition({
      presentationCpuBytes: 30,
      presentationGpuBytes: 40,
    });
    const adapter = harness.adapter;
    const before = adapter.resourceLedger;
    const leases = harness.cache.statistics.coreLeaseActiveCount;
    expect(before.cpuPresentationCurrentBytes).toBe(10);
    expect(before.cpuPresentationWorkBytes).toBe(30);
    expect(before.gpuPresentationCurrentBytes).toBe(20);
    expect(before.gpuPresentationWorkBytes).toBe(40);
    adapter.maximumCpuBytes = before.cpuTotal + 9;
    expect(() =>
      adapter.beginCheckpointWork(parent, childOptions),
    ).toThrowDeveloperError();
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(leases);
    adapter.maximumCpuBytes = before.cpuTotal + 10;
    adapter.maximumGpuBytes = before.gpuTotal + 19;
    expect(() =>
      adapter.beginCheckpointWork(parent, childOptions),
    ).toThrowDeveloperError();
    expect(adapter._checkpointWork).toBeUndefined();
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(leases);
    adapter.maximumGpuBytes = before.gpuTotal + 20;
    const child = adapter.beginCheckpointWork(parent, childOptions);
    const ledger = adapter.resourceLedger;
    expect(ledger.cpuTotal).toBe(before.cpuTotal + 10);
    expect(ledger.gpuTotal).toBe(before.gpuTotal + 20);
    expect(ledger.cpuPresentationWorkBytes).toBe(40);
    expect(ledger.gpuPresentationWorkBytes).toBe(60);
    expect(ledger.gpuPageEscrowBytes).toBe(before.gpuPageEscrowBytes);
    expect(adapter.abortWork(child, "budget fixture done")).toBe(true);
    expect(adapter._activeWork).toBe(parent);
    expect(adapter.resourceLedger).toEqual(before);
    adapter.destroy();
    expect(adapter.destroyed).toBe(true);
  });

  it("progressive checkpoint: accepts final Page completion during child presentation but defers final capture until child retirement", function () {
    const { harness, parent, childOptions, finishPage } =
      progressiveAcquisition();
    const adapter = harness.adapter;
    const child = adapter.beginCheckpointWork(parent, childOptions);
    adapter.capturePhysicalSnapshot(child);
    const ticket = adapter.preparePresentation(child, {});
    finishPage(3);
    expect(parent.state).toBe("GPU_READY");
    const cpuHolds = harness.cache._snapshotHolds.size;
    const gpuHolds = harness.gpuLedger._snapshotHolds.size;
    expect(() =>
      adapter.capturePhysicalSnapshot(parent),
    ).toThrowDeveloperError();
    expect(parent.state).toBe("GPU_READY");
    expect(harness.cache._snapshotHolds.size).toBe(cpuHolds);
    expect(harness.gpuLedger._snapshotHolds.size).toBe(gpuHolds);
    expect(() =>
      adapter.preparePresentation(parent, {}),
    ).toThrowDeveloperError();
    const finalOwnership = {};
    expect(() =>
      adapter.rebaseAcquisitionWork(parent, finalOwnership, [1, 3]),
    ).toThrowDeveloperError();
    adapter.commitPresentation(child, harness.publicationReceipt(ticket));
    expect(() =>
      adapter.capturePhysicalSnapshot(parent),
    ).toThrowDeveloperError();
    expect(adapter.finalizeRetirement(child)).toBe(true);
    adapter.rebaseAcquisitionWork(parent, finalOwnership, [1, 3]);
    publish(harness, parent);
    expect(adapter.currentPageIds).toEqual([1, 3]);
    adapter.destroy();
    expect(adapter.destroyed).toBe(true);
  });

  it("progressive checkpoint: child abort debt retains the parent acquisition and settles once", function () {
    const { harness, parent, childOptions, finishPage } =
      progressiveAcquisition();
    const adapter = harness.adapter;
    const demands = harness.loader.demands.length;
    const parentOwner = `scale-1d-work:${parent.generation}`;
    const parentLease = harness.cache._coreLeases.get(parentOwner);
    const child = adapter.beginCheckpointWork(parent, childOptions);
    adapter.capturePhysicalSnapshot(child);
    adapter.preparePresentation(child, {});
    harness.failAbort();
    expect(adapter.abortWork(child, "discard checkpoint")).toBe(false);
    expect(child.state).toBe("ABORT_CLEANUP_DEBT");
    expect(adapter._checkpointWork).toBe(child);
    expect(adapter._activeWork).toBe(parent);
    expect(harness.cache._coreLeases.get(parentOwner)).toBe(parentLease);
    expect(harness.loader.demands.length).toBe(demands);
    expect(adapter.cleanupDebtTokens.length).toBe(1);
    const debt = adapter.cleanupDebtTokens[0];
    expect(adapter.abortWork(child, "duplicate abort")).toBe(false);
    adapter.settleCleanupDebt(debt);
    expect(adapter.cleanupDebtTokens.length).toBe(0);
    expect(adapter._checkpointWork).toBeUndefined();
    expect(adapter._activeWork).toBe(parent);
    expect(harness.cache._coreLeases.get(parentOwner)).toBe(parentLease);
    expect(() => adapter.settleCleanupDebt(debt)).toThrowDeveloperError();
    finishPage(3);
    publish(harness, parent);
    expect(adapter.currentPageIds).toEqual([1, 3]);
    expect(harness.loader.demands.length).toBe(demands);
    adapter.destroy();
    expect(adapter.destroyed).toBe(true);
  });

  it("progressive checkpoint: destroy cancels both works and waits for child cleanup without retaining a final request", function () {
    const { harness, parent, childOptions } = progressiveAcquisition();
    const adapter = harness.adapter;
    const child = adapter.beginCheckpointWork(parent, childOptions);
    adapter.capturePhysicalSnapshot(child);
    adapter.preparePresentation(child, {});
    harness.failAbort();
    expect(adapter.destroy()).toBe(true);
    expect(child.state).toBe("ABORT_CLEANUP_DEBT");
    expect(parent.state).toBe("ABORTED");
    expect(adapter._activeWork).toBeUndefined();
    expect(adapter.destroyed).toBe(false);
    expect(harness.loader.destroyed).toBe(0);
    const removals = harness.loader.demands.flatMap(({ request }) =>
      request.deltas.filter((delta) => delta.record === undefined),
    );
    expect(removals.map((delta) => delta.pageIndex)).toEqual([3]);
    expect(adapter.cleanupDebtTokens.length).toBe(1);
    adapter.settleCleanupDebt(adapter.cleanupDebtTokens[0]);
    expect(adapter._checkpointWork).toBeUndefined();
    expect(adapter.cleanupDebtTokens).toEqual([]);
    expect(adapter.destroyed).toBe(true);
    expect(harness.loader.destroyed).toBe(1);
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(0);
    expect(harness.cache._snapshotHolds.size).toBe(0);
    expect(harness.gpuLedger._snapshotHolds.size).toBe(0);
    expect(harness.gpuLedger.boundBytes).toBe(0);
    expect(harness.gpuLedger.reservedBytes).toBe(0);
    expect(adapter.resourceLedger.cpuPresentationWorkBytes).toBe(0);
    expect(adapter.resourceLedger.gpuPresentationWorkBytes).toBe(0);
    expect(adapter.destroy()).toBe(false);
  });

  it("segmented persistence: releases accepted staging once while RAM retains usable payload", function () {
    const harness = warmHarness();
    const work = warmWork(harness, 0);
    const staged = persistentCompletion(harness, work);
    const { completion } = staged;
    expect(harness.adapter.acceptPageWorkCompletion(work, completion)).toBe(
      true,
    );
    expect(completion.release).toHaveBeenCalledTimes(1);
    expect(staged.stagingBytes).toBe(0);
    expect(harness.cache.peek(0).payload).toBe(completion.payload);
    expect([...harness.cache.peek(0).payload]).toEqual(
      Array.from({ length: 32 }, (_, index) => index + 1),
    );
    expect(harness.cache.bytesIncludingLeases).toBe(32);
    expect(harness.adapter.acceptPageWorkCompletion(work, completion)).toBe(
      false,
    );
    expect(completion.release).toHaveBeenCalledTimes(1);
    expect(staged.stagingBytes).toBe(0);
    harness.adapter.reserveAndBindGpuPage(
      work,
      0,
      harness.receipt(harness.pages[0]),
    );
    publish(harness, work);
    expect(harness.adapter.currentPageIds).toEqual([0]);
    expect(harness.cache.peek(0).payload).toBe(completion.payload);
    expect(harness.cache.peek(0).payload[31]).toBe(32);
    harness.adapter.destroy();
    expect(completion.release).toHaveBeenCalledTimes(1);
  });

  it("segmented persistence: releases staging once when RAM insertion throws or refuses the Page", function () {
    for (const throws of [true, false]) {
      const harness = warmHarness();
      const work = warmWork(harness, 0);
      const staged = persistentCompletion(harness, work);
      const put = spyOn(harness.cache, "put");
      if (throws) {
        put.and.throwError("injected RAM insertion failure");
      } else {
        put.and.returnValue(undefined);
      }
      for (let attempt = 0; attempt < 2; attempt++) {
        expect(() =>
          harness.adapter.acceptPageWorkCompletion(work, staged.completion),
        ).toThrow();
        expect(staged.completion.release).toHaveBeenCalledTimes(1);
        expect(staged.stagingBytes).toBe(0);
      }
      expect(harness.cache.peek(0)).toBeUndefined();
      expect(harness.adapter.currentPageIds).toEqual([]);
      harness.adapter.abortWork(work, "spec insertion failure");
      harness.adapter.destroy();
      expect(staged.completion.release).toHaveBeenCalledTimes(1);
    }
  });

  it("segmented persistence: rejects stale or corrupt completions without releasing either twice", function () {
    for (const staleKey of [true, false]) {
      const harness = warmHarness();
      const work = warmWork(harness, 0);
      const staged = persistentCompletion(harness, work);
      if (staleKey) {
        staged.completion.pageWorkKey = "foreign-page-work";
      } else {
        staged.completion.page = { ...harness.pages[0], checksum: 999 };
      }
      const put = spyOn(harness.cache, "put").and.callThrough();
      for (let attempt = 0; attempt < 2; attempt++) {
        if (staleKey) {
          expect(
            harness.adapter.acceptPageWorkCompletion(work, staged.completion),
          ).toBe(false);
        } else {
          expect(() =>
            harness.adapter.acceptPageWorkCompletion(work, staged.completion),
          ).toThrowDeveloperError();
        }
        expect(staged.completion.release).toHaveBeenCalledTimes(1);
        expect(staged.stagingBytes).toBe(0);
      }
      expect(put).not.toHaveBeenCalled();
      expect(harness.cache.peek(0)).toBeUndefined();
      harness.adapter.abortWork(work, "spec rejected completion");
      harness.adapter.destroy();
    }
  });

  it("warm residency: reuses history without a new reservation or history escrow", function () {
    const harness = warmHarness();
    publishNewWarmPage(harness, 0);
    const firstReceipt = harness.retainedReceipt(0);
    publishNewWarmPage(harness, 1);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        gpuPageStableBytes: 8192,
        gpuPageWarmBytes: 8192,
        gpuPageEscrowBytes: 0,
        gpuTotal: 2 * 8192 + 20 + 12,
      }),
    );

    const bindings = harness.gpuLedger.statistics.bindings;
    const work = warmWork(harness, 0);
    expect(harness.gpuLedger.reservedBytes).toBe(0);
    expect(harness.gpuLedger.warmBytes).toBe(0);
    expect(harness.adapter.requestRequiredPages(work)).toEqual([]);
    harness.adapter.reserveAndBindGpuPage(work, 0, firstReceipt);
    publish(harness, work);
    expect(harness.gpuLedger.statistics.bindings).toBe(bindings);
    expect(harness.gpuLedger.statistics.warmReservations).toBe(1);
    expect(harness.releasedPageIds).toEqual([]);
    expect(harness.adapter.currentPageIds).toEqual([0]);
    expect(harness.adapter.resourceLedger.gpuPageWarmBytes).toBe(8192);
    expect(harness.adapter.resourceLedger.gpuPageEscrowBytes).toBe(0);

    const nextSnapshot = publishNewWarmPage(harness, 3);
    expect([...nextSnapshot.receipt.gpuPageIds]).toEqual([0, 3]);
    expect(harness.adapter.resourceLedger.gpuPageWarmBytes).toBe(2 * 8192);
    expect(harness.adapter.resourceLedger.gpuPageEscrowBytes).toBe(0);
    harness.adapter.destroy();
    expect(harness.gpuLedger.boundBytes).toBe(0);
    expect(harness.gpuLedger.warmBytes).toBe(0);
  });

  it("warm residency: evicts history before hard-cap reservation and protects the requested page", function () {
    const harness = warmHarness({ maximumGpuPageBytes: 2 * 8192 });
    publishNewWarmPage(harness, 0);
    publishNewWarmPage(harness, 1);
    const work = warmWork(harness, 3);
    expect(harness.releasedPageIds).toEqual([0]);
    expect(harness.gpuLedger.boundBytes).toBe(8192);
    expect(harness.gpuLedger.reservedBytes).toBe(8192);
    expect(harness.adapter.currentPageIds).toEqual([1]);
    loadAndBind(harness, work);
    publish(harness, work);

    const returned = warmWork(harness, 1);
    expect(harness.releasedPageIds).toEqual([0]);
    expect(harness.gpuLedger.reservedBytes).toBe(0);
    expect(harness.adapter.requestRequiredPages(returned)).toEqual([]);
    harness.adapter.reserveAndBindGpuPage(
      returned,
      1,
      harness.retainedReceipt(1),
    );
    publish(harness, returned);
    expect(harness.gpuLedger.boundBytes).toBe(2 * 8192);
    expect(harness.adapter.resourceLedger.gpuPageEscrowBytes).toBe(0);
    harness.adapter.destroy();
  });

  it("warm residency: failed admission eviction keeps current and registers settleable debt", function () {
    const harness = warmHarness({ maximumGpuPageBytes: 2 * 8192 });
    publishNewWarmPage(harness, 0);
    publishNewWarmPage(harness, 1);
    harness.failPageReleaseOnce(0);
    expect(() => warmWork(harness, 3)).toThrowDeveloperError();
    expect(harness.adapter.currentPageIds).toEqual([1]);
    expect(harness.gpuLedger.reservedBytes).toBe(0);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        gpuPageStableBytes: 8192,
        gpuPageWarmBytes: 0,
        gpuPageEscrowBytes: 0,
        gpuCleanupDebtBytes: 8192,
        gpuTotal: 2 * 8192 + 20 + 12,
      }),
    );
    expect(harness.adapter.cleanupDebtTokens.length).toBe(1);
    const token = harness.adapter.cleanupDebtTokens[0];
    harness.adapter.settleCleanupDebt(token);
    expect(() =>
      harness.adapter.settleCleanupDebt(token),
    ).toThrowDeveloperError();
    publishNewWarmPage(harness, 3);
    expect(harness.adapter.currentPageIds).toEqual([3]);
    harness.adapter.destroy();
  });

  it("warm residency: terminal destroy clears history and waits for failed backend release", function () {
    for (const allocatedBytes of [0, 2 * 8192]) {
      const harness = warmHarness({
        maximumGpuPageBytes: 2 * 8192,
        gpuAtlasAllocatedBytes: allocatedBytes,
      });
      publishNewWarmPage(harness, 0);
      publishNewWarmPage(harness, 1);
      expect(harness.adapter.resourceLedger.gpuTotal).toBe(2 * 8192 + 32);
      harness.failPageReleaseOnce(0);
      expect(harness.adapter.destroy()).toBe(true);
      expect(harness.loader.destroyed).toBe(0);
      expect(harness.cacheClearCount).toBe(0);
      expect(harness.gpuLedger.warmBytes).toBe(0);
      expect(harness.gpuLedger.boundBytes).toBe(0);
      expect(harness.adapter.resourceLedger).toEqual(
        jasmine.objectContaining({
          gpuPageStableBytes: 0,
          gpuPageWarmBytes: 0,
          gpuPageEscrowBytes: 0,
          gpuCleanupDebtBytes: 8192,
          gpuTotal: (allocatedBytes || 8192) + 12,
        }),
      );
      expect(harness.adapter.cleanupDebtTokens.length).toBe(1);
      const token = harness.adapter.cleanupDebtTokens[0];
      harness.adapter.settleCleanupDebt(token);
      expect(harness.adapter.cleanupDebtTokens).toEqual([]);
      expect(harness.loader.destroyed).toBe(1);
      expect(harness.cacheClearCount).toBe(1);
      expect(harness.releasedPageIds.sort()).toEqual([0, 1]);
      expect(harness.adapter.resourceLedger.gpuCleanupDebtBytes).toBe(0);
      expect(harness.adapter.resourceLedger.gpuTotal).toBe(allocatedBytes + 12);
      expect(() =>
        harness.adapter.settleCleanupDebt(token),
      ).toThrowDeveloperError();
      expect(harness.adapter.destroy()).toBe(false);
    }
  });

  it("rebinds an admitted presentation reservation to exact described bytes", function () {
    const harness = createHarness({
      describedPresentationCpuBytes: 6,
      describedPresentationGpuBytes: 9,
    });
    const work = harness.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, work);
    harness.adapter.capturePhysicalSnapshot(work);
    harness.adapter.preparePresentation(work, {});
    expect(work.presentationDescription.cpuBytes).toBe(6);
    expect(harness.adapter.resourceLedger.cpuPresentationWorkBytes).toBe(6);
    expect(harness.adapter.resourceLedger.gpuPresentationWorkBytes).toBe(9);
    harness.adapter.abortWork(work, "spec");
  });

  it("aborts a pure under-reserved presentation before allocation", function () {
    const harness = createHarness({
      describedPresentationCpuBytes: 11,
      describedPresentationGpuBytes: 21,
    });
    const work = harness.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, work);
    harness.adapter.capturePhysicalSnapshot(work);
    expect(function () {
      harness.adapter.preparePresentation(work, {});
    }).toThrowDeveloperError();
    expect(harness.aborted.length).toBe(1);
    harness.adapter.abortWork(work, "spec");
  });

  it("publishes a root bootstrap through exact CPU/GPU snapshot authority", function () {
    const harness = createHarness();
    const work = harness.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      optionalShPageIds: [],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, work);
    const snapshot = publish(harness, work);
    expect([...snapshot.receipt.cpuPageIds]).toEqual([0]);
    expect([...snapshot.receipt.gpuPageIds]).toEqual([0]);
    expect(snapshot.receipt.leaseIdentity).toBe("adapter-lease");
    expect(harness.adapter.currentPresentationIdentity).toBe("presentation-1");
    expect(harness.adapter.resourceLedger).toEqual({
      compactIndexBytes: 100,
      cpuPageStableBytes: 32,
      cpuPageEscrowBytes: 0,
      cpuPresentationCurrentBytes: 10,
      cpuPresentationWorkBytes: 0,
      loaderHttpReserveBytes: 8,
      persistentStagingReserveBytes: 4,
      workerReserveBytes: 0,
      cpuCleanupDebtBytes: 0,
      cpuOrderingOverlayBytes: 0,
      cpuTotal: 154,
      gpuPageStableBytes: 8192,
      gpuPageWarmBytes: 0,
      gpuPageEscrowBytes: 0,
      gpuPresentationCurrentBytes: 20,
      gpuPresentationWorkBytes: 0,
      rendererReserveBytes: 12,
      gpuAtlasAllocatedBytes: 0,
      gpuCleanupDebtBytes: 0,
      gpuOrderingOverlayBytes: 0,
      gpuTotal: 8192 + 32,
    });
    expect(harness.adapter.statistics.commits).toBe(1);
    expect(harness.adapter.destroy()).toBe(true);
    expect(harness.adapter.destroy()).toBe(false);
  });

  it("captures current, work, history, and optional SH then retires old-only after commit", function () {
    const harness = createHarness();
    const bootstrap = harness.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      optionalShPageIds: [2],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, bootstrap);
    publish(harness, bootstrap);
    const transition = harness.adapter.beginTransitionWork({
      sourcePresentationIdentity: "presentation-1",
      targetOwnershipIdentity: {},
      requiredCorePageIds: [1],
      optionalShPageIds: [],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, transition);
    const snapshot = harness.adapter.capturePhysicalSnapshot(transition);
    expect([...snapshot.receipt.cpuPageIds]).toEqual([0, 1, 2]);
    expect([...snapshot.receipt.gpuPageIds]).toEqual([0, 1, 2]);
    const ticket = harness.adapter.preparePresentation(transition, {});
    harness.adapter.commitPresentation(
      transition,
      harness.publicationReceipt(ticket),
    );
    expect(harness.releasedPageIds).toEqual([]);
    harness.adapter.finalizeRetirement(transition);
    expect(harness.releasedPageIds.sort()).toEqual([0, 2]);
    expect(harness.adapter.currentPresentationIdentity).toBe("presentation-2");
    expect(harness.adapter.resourceLedger.cpuPageStableBytes).toBe(32);
    expect(harness.adapter.resourceLedger.cpuPageEscrowBytes).toBe(48);
    expect(harness.adapter.resourceLedger.gpuPageStableBytes).toBe(8192);
    expect(harness.adapter.resourceLedger.gpuPageEscrowBytes).toBe(0);
    expect(harness.adapter.statistics.cpuGeneration).toBe(3);
    expect(harness.adapter.statistics.gpuGeneration).toBe(5);
    expect(harness.adapter.statistics.cpuLedgerPeakBytes).toBe(212);
    expect(harness.adapter.statistics.gpuLedgerPeakBytes).toBe(
      2 * 8192 + 4096 + 52,
    );
  });

  it("rebinds a partial successor to retained plus admitted exact Pages", function () {
    const harness = createHarness();
    const bootstrap = harness.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, bootstrap);
    publish(harness, bootstrap);

    const retained = harness.adapter.beginTransitionWork({
      sourcePresentationIdentity: "presentation-1",
      targetOwnershipIdentity: {},
      requiredCorePageIds: [1],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, retained);
    harness.adapter.capturePhysicalSnapshot(retained);
    const exact = harness.adapter.rebindTargetPages(retained, [0, 1], []);
    expect([...exact.receipt.cpuPageIds]).toEqual([0, 1]);
    expect([...exact.receipt.gpuPageIds]).toEqual([0, 1]);
    const retainedTicket = harness.adapter.preparePresentation(retained, {});
    harness.adapter.commitPresentation(
      retained,
      harness.publicationReceipt(retainedTicket),
    );
    harness.adapter.finalizeRetirement(retained);
    expect(harness.adapter.currentPageIds).toEqual([0, 1]);
    expect([
      ...harness.adapter.currentPhysicalSnapshot.receipt.cpuPageIds,
    ]).toEqual([0, 1]);

    const releaseOld = harness.adapter.beginTransitionWork({
      sourcePresentationIdentity: "presentation-2",
      targetOwnershipIdentity: {},
      requiredCorePageIds: [1],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, releaseOld);
    harness.adapter.capturePhysicalSnapshot(releaseOld);
    const filtered = harness.adapter.rebindTargetPages(releaseOld, [1], []);
    expect([...filtered.receipt.cpuPageIds]).toEqual([1]);
    const releaseTicket = harness.adapter.preparePresentation(releaseOld, {});
    harness.adapter.commitPresentation(
      releaseOld,
      harness.publicationReceipt(releaseTicket),
    );
    harness.adapter.finalizeRetirement(releaseOld);
    expect(harness.adapter.currentPageIds).toEqual([1]);
    expect([
      ...harness.adapter.currentPhysicalSnapshot.receipt.cpuPageIds,
    ]).toEqual([1]);
    expect(harness.releasedPageIds).toContain(0);
  });

  it("aborts Loader or D1 failure staging without changing current", function () {
    const harness = createHarness();
    const bootstrap = harness.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, bootstrap);
    publish(harness, bootstrap);
    const transition = harness.adapter.beginTransitionWork({
      sourcePresentationIdentity: "presentation-1",
      targetOwnershipIdentity: {},
      requiredCorePageIds: [3],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, transition);
    harness.adapter.capturePhysicalSnapshot(transition);
    harness.failPrepare();
    expect(function () {
      harness.adapter.preparePresentation(transition, {});
    }).toThrowError(/injected D1 prepare failure/);
    expect(harness.adapter.abortWork(transition, "prepare-failed")).toBe(true);
    expect(harness.adapter.abortWork(transition, "duplicate")).toBe(false);
    expect(harness.adapter.currentPresentationIdentity).toBe("presentation-1");
    expect(harness.gpuLedger.statistics.gpuBoundPages).toBe(1);

    harness.failPrepare(false);
    const commitFailure = harness.adapter.beginTransitionWork({
      sourcePresentationIdentity: "presentation-1",
      targetOwnershipIdentity: {},
      requiredCorePageIds: [3],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    harness.adapter.requestRequiredPages(commitFailure);
    harness.adapter.reserveAndBindGpuPage(
      commitFailure,
      3,
      harness.receipt(harness.pages[3]),
    );
    harness.adapter.capturePhysicalSnapshot(commitFailure);
    const ticket = harness.adapter.preparePresentation(commitFailure, {});
    harness.failCommit();
    expect(function () {
      harness.adapter.commitPresentation(
        commitFailure,
        harness.publicationReceipt(ticket),
      );
    }).toThrowError(/injected D1 commit failure/);
    harness.adapter.abortWork(commitFailure, "commit-failed");
    expect(harness.adapter.currentPresentationIdentity).toBe("presentation-1");
    expect(harness.adapter.statistics.aborts).toBe(2);
  });

  it("rolls back every provisional owner failure before D1 commit", function () {
    for (const injection of ["cpu", "gpu", "receipt"]) {
      const harness = createHarness();
      const { work, ticket } = prepareForCommit(harness, [0, 1]);
      if (injection === "cpu") {
        harness.failNextCurrentCpuLease();
      } else if (injection === "gpu") {
        harness.failNextCurrentGpuReservation();
      } else {
        harness.failProvisionalReceiptAt(2);
      }
      expect(function () {
        harness.adapter.commitPresentation(
          work,
          harness.publicationReceipt(ticket),
        );
      }).toThrowError();
      expect(harness.presentationCommitCount).toBe(0);
      expect(harness.cache.statistics.coreLeaseActiveCount).toBe(1);
      expect(harness.adapter.currentPresentationIdentity).toBeUndefined();
      expect(work.state).toBe("PRESENTATION_PREPARED");
      expect(harness.adapter.abortWork(work, injection)).toBe(true);
      expect(harness.cache.statistics.coreLeaseActiveCount).toBe(0);
    }
  });

  it("rejects a frozen publication-receipt lookalike before provisional staging", function () {
    const harness = createHarness();
    const { work, ticket } = prepareForCommit(harness);
    expect(function () {
      harness.adapter.commitPresentation(work, Object.freeze({ ticket }));
    }).toThrowError(/fake presentation receipt mismatch/);
    expect(harness.presentationCommitCount).toBe(0);
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(1);
    expect(work.state).toBe("PRESENTATION_PREPARED");
    expect(harness.adapter.currentPresentationIdentity).toBeUndefined();
    expect(harness.adapter.abortWork(work, "foreign-receipt")).toBe(true);
    expect(function () {
      harness.adapter.commitPresentation(
        work,
        harness.publicationReceipt(ticket),
      );
    }).toThrowDeveloperError();
  });

  it("rolls back provisional owners on D1 failure and makes post-commit install local-only", function () {
    const failed = createHarness();
    const prepared = prepareForCommit(failed);
    failed.failCommit();
    expect(function () {
      failed.adapter.commitPresentation(
        prepared.work,
        failed.publicationReceipt(prepared.ticket),
      );
    }).toThrowError(/injected D1 commit failure/);
    expect(failed.presentationCommitCount).toBe(1);
    expect(failed.cache.statistics.coreLeaseActiveCount).toBe(1);
    expect(prepared.work.state).toBe("PRESENTATION_PREPARED");
    failed.adapter.abortWork(prepared.work, "commit-failed");

    const guarded = createHarness({ guardPostCommitExternal: true });
    const successful = prepareForCommit(guarded);
    expect(function () {
      guarded.adapter.commitPresentation(
        successful.work,
        guarded.publicationReceipt(successful.ticket),
      );
    }).not.toThrow();
    expect(guarded.adapter.currentPresentationIdentity).toBe("presentation-1");
    guarded.clearPostCommitGuard();
    expect(guarded.adapter.finalizeRetirement(successful.work)).toBe(true);
  });

  it("keeps abort backing coupled across repeated cleanup failures", function () {
    const harness = createHarness();
    const { work } = prepareForCommit(harness);
    harness.failAbort(2);
    expect(harness.adapter.abortWork(work, "injected")).toBe(false);
    expect(work.state).toBe("ABORT_CLEANUP_DEBT");
    expect(harness.releasedPageIds).toEqual([]);
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(1);
    expect(harness.gpuLedger.statistics.gpuBoundPages).toBe(1);
    expect(harness.adapter.resourceLedger.cpuCleanupDebtBytes).toBe(10);
    expect(harness.adapter.resourceLedger.gpuCleanupDebtBytes).toBe(20);
    const token = harness.adapter.cleanupDebtTokens[0];
    expect(function () {
      harness.adapter.settleCleanupDebt(token);
    }).toThrowError(/injected presentation abort failure/);
    expect(harness.adapter.cleanupDebtTokens[0]).toBe(token);
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(1);
    expect(harness.releasedPageIds).toEqual([]);
    expect(harness.adapter.settleCleanupDebt(token)).toBe(true);
    expect(work.state).toBe("ABORTED");
    expect(harness.releasedPageIds).toEqual([0]);
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(0);
    expect(function () {
      harness.adapter.settleCleanupDebt(token);
    }).toThrowDeveloperError();
  });

  it("keeps old current backing until retire debt settles once", function () {
    const harness = createHarness();
    const first = prepareForCommit(harness, [0]);
    harness.adapter.commitPresentation(
      first.work,
      harness.publicationReceipt(first.ticket),
    );
    harness.adapter.finalizeRetirement(first.work);
    const transition = harness.adapter.beginTransitionWork({
      sourcePresentationIdentity: "presentation-1",
      targetOwnershipIdentity: {},
      requiredCorePageIds: [1],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, transition);
    harness.adapter.capturePhysicalSnapshot(transition);
    const ticket = harness.adapter.preparePresentation(transition, {});
    harness.adapter.commitPresentation(
      transition,
      harness.publicationReceipt(ticket),
    );
    harness.failRetire();
    expect(harness.adapter.finalizeRetirement(transition)).toBe(false);
    expect(harness.adapter.currentPresentationIdentity).toBe("presentation-2");
    expect(harness.releasedPageIds).toEqual([]);
    const token = harness.adapter.cleanupDebtTokens[0];
    expect(harness.adapter.settleCleanupDebt(token)).toBe(true);
    expect(harness.releasedPageIds).toEqual([0]);
    expect(function () {
      harness.adapter.settleCleanupDebt(token);
    }).toThrowDeveloperError();
  });

  it("retains an empty terminal destroy when Loader fails once", function () {
    const harness = createHarness();
    harness.failLoaderDestroy();
    expect(harness.adapter.destroy()).toBe(true);
    expect(harness.adapter.destroy()).toBe(false);
    expect(harness.adapter.cleanupDebtTokens.length).toBe(1);
    expect(harness.loader.destroyAttempts).toBe(1);
    expect(harness.loader.destroyed).toBe(0);
    expect(harness.cacheClearAttempts).toBe(0);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        cpuPageStableBytes: 0,
        cpuPageEscrowBytes: 0,
        cpuCleanupDebtBytes: 0,
        cpuTotal: 112,
        gpuPageStableBytes: 0,
        gpuPageEscrowBytes: 0,
        gpuCleanupDebtBytes: 0,
        gpuTotal: 12,
      }),
    );
    const token = harness.adapter.cleanupDebtTokens[0];
    expect(harness.adapter.settleCleanupDebt(token)).toBe(true);
    expect(harness.loader.destroyAttempts).toBe(2);
    expect(harness.loader.destroyed).toBe(1);
    expect(harness.cacheClearAttempts).toBe(1);
    expect(harness.cacheClearSuccesses).toBe(1);
    expect(function () {
      harness.adapter.settleCleanupDebt(token);
    }).toThrowDeveloperError();
    expect(function () {
      harness.adapter.settleCleanupDebt(Object.freeze({}));
    }).toThrowDeveloperError();
  });

  it("retains the same empty terminal token across two Loader failures", function () {
    const harness = createHarness();
    harness.failLoaderDestroy(2);
    expect(harness.adapter.destroy()).toBe(true);
    const token = harness.adapter.cleanupDebtTokens[0];
    expect(function () {
      harness.adapter.settleCleanupDebt(token);
    }).toThrowError(/injected Loader destroy failure/);
    expect(harness.adapter.cleanupDebtTokens).toEqual([token]);
    expect(harness.loader.destroyAttempts).toBe(2);
    expect(harness.loader.destroyed).toBe(0);
    expect(harness.cacheClearAttempts).toBe(0);
    expect(harness.adapter.settleCleanupDebt(token)).toBe(true);
    expect(harness.loader.destroyAttempts).toBe(3);
    expect(harness.loader.destroyed).toBe(1);
    expect(harness.cacheClearAttempts).toBe(1);
    expect(harness.cacheClearSuccesses).toBe(1);
  });

  it("aborts unpublished work once before retaining terminal Loader debt", function () {
    const harness = createHarness();
    const work = harness.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    harness.failLoaderDestroy();
    expect(harness.adapter.destroy()).toBe(true);
    expect(work.state).toBe("ABORTED");
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(0);
    expect(harness.gpuLedger.statistics.gpuReservedPages).toBe(0);
    expect(harness.adapter.cleanupDebtTokens.length).toBe(1);
    expect(harness.loader.destroyAttempts).toBe(1);
    expect(harness.adapter.resourceLedger.cpuTotal).toBe(112);
    expect(harness.adapter.resourceLedger.gpuTotal).toBe(12);
    const token = harness.adapter.cleanupDebtTokens[0];
    expect(harness.adapter.settleCleanupDebt(token)).toBe(true);
    expect(work.state).toBe("ABORTED");
    expect(harness.adapter.statistics.aborts).toBe(1);
    expect(harness.loader.destroyAttempts).toBe(2);
    expect(harness.cacheClearSuccesses).toBe(1);
  });

  it("does not clear Cache while destroy retirement is retryable", function () {
    const harness = createHarness();
    const prepared = prepareForCommit(harness);
    harness.adapter.commitPresentation(
      prepared.work,
      harness.publicationReceipt(prepared.ticket),
    );
    harness.adapter.finalizeRetirement(prepared.work);
    harness.failRetire();
    expect(harness.adapter.destroy()).toBe(true);
    expect(harness.cache.size).toBe(1);
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(1);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        cpuPageStableBytes: 0,
        cpuPageEscrowBytes: 32,
        cpuPresentationCurrentBytes: 0,
        cpuCleanupDebtBytes: 10,
        cpuTotal: 154,
        gpuPageStableBytes: 0,
        gpuPageEscrowBytes: 8192,
        gpuPresentationCurrentBytes: 0,
        gpuCleanupDebtBytes: 20,
        gpuTotal: 8192 + 32,
      }),
    );
    expect(harness.retireAttemptCount).toBe(1);
    expect(harness.releaseAttemptIds).toEqual([]);
    expect(harness.cacheClearCount).toBe(0);
    const token = harness.adapter.cleanupDebtTokens[0];
    expect(harness.adapter.settleCleanupDebt(token)).toBe(true);
    expect(harness.cache.size).toBe(0);
    expect(harness.loader.destroyed).toBe(1);
    expect(harness.retireAttemptCount).toBe(2);
    expect(harness.releaseAttemptIds).toEqual([0]);
    expect(harness.cacheClearCount).toBe(1);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        cpuPageStableBytes: 0,
        cpuPageEscrowBytes: 0,
        cpuCleanupDebtBytes: 0,
        cpuTotal: 112,
        gpuPageStableBytes: 0,
        gpuPageEscrowBytes: 0,
        gpuCleanupDebtBytes: 0,
        gpuTotal: 12,
      }),
    );
    expect(harness.adapter.destroy()).toBe(false);
  });

  it("blocks terminal cleanup behind backend debt and then retains its token", function () {
    const harness = createHarness();
    const prepared = prepareForCommit(harness);
    harness.adapter.commitPresentation(
      prepared.work,
      harness.publicationReceipt(prepared.ticket),
    );
    harness.adapter.finalizeRetirement(prepared.work);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        cpuPageStableBytes: 32,
        cpuPageEscrowBytes: 0,
        cpuTotal: 154,
        gpuPageStableBytes: 8192,
        gpuPageEscrowBytes: 0,
        gpuCleanupDebtBytes: 0,
        gpuTotal: 8192 + 32,
      }),
    );
    harness.failPageReleaseOnce(0);
    harness.failLoaderDestroy();
    expect(harness.adapter.destroy()).toBe(true);
    expect(harness.adapter.cleanupDebtTokens.length).toBe(1);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        cpuPageStableBytes: 0,
        cpuPageEscrowBytes: 32,
        cpuCleanupDebtBytes: 0,
        cpuTotal: 144,
        gpuPageStableBytes: 0,
        gpuPageEscrowBytes: 0,
        gpuCleanupDebtBytes: 8192,
        gpuTotal: 8192 + 12,
      }),
    );
    expect(harness.retireAttemptCount).toBe(1);
    expect(harness.releaseAttemptIds).toEqual([0]);
    expect(harness.cacheClearCount).toBe(0);
    expect(harness.loader.destroyAttempts).toBe(0);
    const backendToken = harness.adapter.cleanupDebtTokens[0];
    expect(harness.adapter.settleCleanupDebt(backendToken)).toBe(true);
    expect(harness.adapter.cleanupDebtTokens.length).toBe(1);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        cpuPageStableBytes: 0,
        cpuPageEscrowBytes: 32,
        cpuCleanupDebtBytes: 0,
        cpuTotal: 144,
        gpuPageStableBytes: 0,
        gpuPageEscrowBytes: 0,
        gpuCleanupDebtBytes: 0,
        gpuTotal: 12,
      }),
    );
    expect(harness.loader.destroyAttempts).toBe(1);
    expect(harness.loader.destroyed).toBe(0);
    expect(harness.cacheClearCount).toBe(0);
    const terminalToken = harness.adapter.cleanupDebtTokens[0];
    expect(harness.adapter.settleCleanupDebt(terminalToken)).toBe(true);
    expect(harness.releaseAttemptIds).toEqual([0, 0]);
    expect(harness.retireAttemptCount).toBe(1);
    expect(harness.cacheClearCount).toBe(1);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        cpuPageStableBytes: 0,
        cpuPageEscrowBytes: 0,
        cpuCleanupDebtBytes: 0,
        cpuTotal: 112,
        gpuPageStableBytes: 0,
        gpuPageEscrowBytes: 0,
        gpuCleanupDebtBytes: 0,
        gpuTotal: 12,
      }),
    );
    expect(function () {
      harness.adapter.settleCleanupDebt(backendToken);
    }).toThrowDeveloperError();
  });

  it("does not repeat successful D1, overlay, texture or nested destroy cleanup steps", function () {
    const harness = createHarness();
    const prepared = prepareForCommit(harness);
    harness.adapter.commitPresentation(
      prepared.work,
      harness.publicationReceipt(prepared.ticket),
    );
    harness.adapter.finalizeRetirement(prepared.work);
    harness.failLoaderDestroy();
    expect(harness.adapter.destroy()).toBe(true);
    expect(harness.retireAttemptCount).toBe(1);
    expect(harness.releaseAttemptIds).toEqual([0]);
    expect(harness.loader.destroyAttempts).toBe(1);
    expect(harness.cacheClearCount).toBe(0);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        cpuPageStableBytes: 0,
        cpuPageEscrowBytes: 32,
        cpuCleanupDebtBytes: 0,
        cpuTotal: 144,
        gpuPageStableBytes: 0,
        gpuPageEscrowBytes: 0,
        gpuCleanupDebtBytes: 0,
        gpuTotal: 12,
      }),
    );
    const token = harness.adapter.cleanupDebtTokens[0];
    expect(harness.adapter.settleCleanupDebt(token)).toBe(true);
    expect(harness.retireAttemptCount).toBe(1);
    expect(harness.releaseAttemptIds).toEqual([0]);
    expect(harness.loader.destroyAttempts).toBe(2);
    expect(harness.loader.destroyed).toBe(1);
    expect(harness.cacheClearCount).toBe(1);
  });

  it("retries Cache clear twice without repeating successful Loader destroy", function () {
    const harness = createHarness();
    const prepared = prepareForCommit(harness);
    harness.adapter.commitPresentation(
      prepared.work,
      harness.publicationReceipt(prepared.ticket),
    );
    harness.adapter.finalizeRetirement(prepared.work);
    harness.failCacheClear(2);
    expect(harness.adapter.destroy()).toBe(true);
    expect(harness.loader.destroyAttempts).toBe(1);
    expect(harness.loader.destroyed).toBe(1);
    expect(harness.cacheClearAttempts).toBe(1);
    expect(harness.cacheClearSuccesses).toBe(0);
    expect(harness.adapter.cleanupDebtTokens.length).toBe(1);
    expect(harness.adapter.resourceLedger).toEqual(
      jasmine.objectContaining({
        cpuPageStableBytes: 0,
        cpuPageEscrowBytes: 32,
        cpuCleanupDebtBytes: 0,
        cpuTotal: 144,
        gpuPageStableBytes: 0,
        gpuPageEscrowBytes: 0,
        gpuCleanupDebtBytes: 0,
        gpuTotal: 12,
      }),
    );
    const token = harness.adapter.cleanupDebtTokens[0];
    expect(function () {
      harness.adapter.settleCleanupDebt(token);
    }).toThrowError(/injected Cache clear failure/);
    expect(harness.adapter.cleanupDebtTokens).toEqual([token]);
    expect(harness.loader.destroyAttempts).toBe(1);
    expect(harness.loader.destroyed).toBe(1);
    expect(harness.cacheClearAttempts).toBe(2);
    expect(harness.cacheClearSuccesses).toBe(0);
    expect(harness.adapter.settleCleanupDebt(token)).toBe(true);
    expect(harness.loader.destroyAttempts).toBe(1);
    expect(harness.loader.destroyed).toBe(1);
    expect(harness.cacheClearAttempts).toBe(3);
    expect(harness.cacheClearSuccesses).toBe(1);
  });

  it("rejects a snapshot capture whose CPU generation changes mid-capture", function () {
    const harness = createHarness();
    const work = harness.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, work);
    const capture = harness.cache.captureHeldPageSnapshot.bind(harness.cache);
    harness.cache.captureHeldPageSnapshot = function (...args) {
      const hold = capture(...args);
      this.put(harness.pages[3], new Uint8Array(32));
      return hold;
    };
    expect(function () {
      harness.adapter.capturePhysicalSnapshot(work);
    }).toThrowDeveloperError();
    expect(harness.adapter.statistics.snapshotCaptureRetries).toBe(1);
    harness.cache.captureHeldPageSnapshot = capture;
    expect(harness.adapter.capturePhysicalSnapshot(work)).toBeDefined();
    harness.adapter.abortWork(work, "capture-test");
  });

  it("retains cleanup debt in the budget, blocks conflict, and settles once", function () {
    const harness = createHarness();
    const bootstrap = harness.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, bootstrap);
    publish(harness, bootstrap);
    harness.failPageReleaseOnce(0);
    const transition = harness.adapter.beginTransitionWork({
      sourcePresentationIdentity: "presentation-1",
      targetOwnershipIdentity: {},
      requiredCorePageIds: [1],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    loadAndBind(harness, transition);
    publish(harness, transition);
    expect(harness.adapter.resourceLedger.gpuCleanupDebtBytes).toBe(8192);
    expect(harness.adapter.cleanupDebtTokens.length).toBe(1);
    expect(function () {
      harness.adapter.beginTransitionWork({
        sourcePresentationIdentity: "presentation-2",
        targetOwnershipIdentity: {},
        requiredCorePageIds: [0],
        presentationCpuBytes: 10,
        presentationGpuBytes: 20,
      });
    }).toThrowDeveloperError();
    const token = harness.adapter.cleanupDebtTokens[0];
    expect(harness.adapter.settleCleanupDebt(token)).toBe(true);
    expect(harness.adapter.resourceLedger.gpuCleanupDebtBytes).toBe(0);
    expect(function () {
      harness.adapter.settleCleanupDebt(token);
    }).toThrowDeveloperError();
  });

  it("rejects hard-cap and stale completion before external side effects", function () {
    const harness = createHarness({ maximumCpuBytes: 120 });
    expect(function () {
      harness.adapter.beginBootstrapWork({
        targetOwnershipIdentity: {},
        requiredCorePageIds: [0],
        presentationCpuBytes: 10,
        presentationGpuBytes: 20,
      });
    }).toThrowDeveloperError();
    expect(harness.loader.demands.length).toBe(0);
    expect(harness.cache.statistics.coreLeaseActiveCount).toBe(0);
    expect(harness.gpuLedger.statistics.gpuReservedPages).toBe(0);

    const admitted = createHarness();
    const work = admitted.adapter.beginBootstrapWork({
      targetOwnershipIdentity: {},
      requiredCorePageIds: [0],
      presentationCpuBytes: 10,
      presentationGpuBytes: 20,
    });
    admitted.adapter.requestRequiredPages(work);
    expect(
      admitted.adapter.acceptPageWorkCompletion(work, {
        page: admitted.pages[0],
        payload: new Uint8Array(32),
        generation: work.generation,
        operationOwnerIdentity: "foreign-loader-owner",
      }),
    ).toBe(false);
    expect(admitted.cache.size).toBe(0);
    admitted.adapter.abortWork(work, "stale-completion");
  });

  it("reserves one exact monotonic Ordering overlay in every admission", function () {
    const exact = createHarness({ maximumCpuBytes: 200 });
    const exactReceipt = exact.adapter.reserveOrderingOverlay({}, 88, 0);
    expect(exact.adapter.resourceLedger.cpuTotal).toBe(200);
    exact.adapter.releaseOrderingOverlay(exactReceipt, 0, 0);
    const oneOver = createHarness({ maximumCpuBytes: 200 });
    expect(function () {
      oneOver.adapter.reserveOrderingOverlay({}, 89, 0);
    }).toThrowDeveloperError();

    const harness = createHarness({ maximumCpuBytes: 220 });
    const owner = {};
    const receipt = harness.adapter.reserveOrderingOverlay(owner, 99, 7);
    expect(harness.adapter.resourceLedger.cpuOrderingOverlayBytes).toBe(99);
    expect(harness.adapter.resourceLedger.gpuOrderingOverlayBytes).toBe(7);
    expect(function () {
      harness.adapter.beginBootstrapWork({
        targetOwnershipIdentity: {},
        requiredCorePageIds: [0],
      });
    }).toThrowDeveloperError();
    expect(harness.adapter.releaseOrderingOverlay(receipt, 0, 7)).toBe(false);
    expect(function () {
      harness.adapter.releaseOrderingOverlay(receipt, 1, 7);
    }).toThrowDeveloperError();
    expect(harness.adapter.releaseOrderingOverlay(receipt, 0, 0)).toBe(true);
    expect(function () {
      harness.adapter.releaseOrderingOverlay(receipt, 0, 0);
    }).toThrowDeveloperError();

    const destroying = createHarness();
    const destroyReceipt = destroying.adapter.reserveOrderingOverlay({}, 1, 1);
    expect(destroying.adapter.destroy()).toBe(true);
    expect(destroying.adapter.destroyed).toBe(false);
    expect(
      destroying.adapter.releaseOrderingOverlay(destroyReceipt, 0, 0),
    ).toBe(true);
    expect(destroying.adapter.destroyed).toBe(true);
  });
});

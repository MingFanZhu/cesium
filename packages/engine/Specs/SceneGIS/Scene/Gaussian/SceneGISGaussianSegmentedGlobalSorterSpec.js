import _SceneGISGaussianSegmentedGlobalSorter, {
  consumeGaussianSegmentedGlobalOrderingValidation,
  estimateGaussianSegmentedGlobalSortWorkingSetBytes,
  validateGaussianSegmentedGlobalSortResult,
} from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedGlobalSorter.js";
import {
  prepareGaussianSegmentedCore,
  resetGaussianSegmentedGlobalSorterRepositoryForSpecs,
  sortGaussianSegmentedGlobalPositions,
} from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSortTask.js";

import { computeSegmentedAtlasPageFootprint } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedAssetPageOwnership.js";
import TaskProcessor from "../../../../Source/Core/TaskProcessor.js";

describe("SceneGIS/Scene/SceneGISGaussianSegmentedGlobalSorter", function () {
  function identity(pageIndex, count, options = {}) {
    return Object.freeze({
      artifactIdentity: "artifact",
      pageIndex,
      checksum: pageIndex + 10,
      assetId: 0,
      assetLocalStart: 0,
      kind: 1,
      semantic: 1,
      layoutId: 1,
      packId: 0,
      offset: pageIndex * 256,
      storedBytes: count * 32,
      rawBytes: count * 32,
      pageSplatCount: count,
      expectedCoreBytes: count * 32,
      positionBytes: count * 12,
      representationId: options.representationId ?? 0,
      positionOriginX: options.positionOriginX ?? 0,
      positionOriginY: options.positionOriginY ?? 0,
      positionOriginZ: options.positionOriginZ ?? 0,
    });
  }

  function intent(count = 4) {
    const retainedPages = [identity(2, count)];
    const workingSetEstimate =
      estimateGaussianSegmentedGlobalSortWorkingSetBytes({
        selectedSplatCount: count,
        confirmedPositionBytes: 0,
        missingPositionBytes: count * 12,
        retainedPositionBytes: count * 12,
      });
    return Object.freeze({
      artifactIdentity: "artifact",
      contentIdentity: "content-1",
      contentGeneration: 1,
      mappingGeneration: 1,
      viewGeneration: 1,
      requestSerial: 1,
      dispatchAttemptIdentity: "dispatch-1",
      selectedSplatCount: count,
      sortCenter: [0, 0, 0],
      fragmentCorePageIds: new Uint32Array([2]),
      fragmentPageLocalStarts: new Uint32Array([0]),
      fragmentCounts: new Uint32Array([count]),
      fragmentPresentationStarts: new Uint32Array([0]),
      retainedPages,
      workingSetEstimate,
    });
  }

  function rawCoreFromPositions(positions) {
    const rawCore = new Uint8Array((positions.length / 3) * 32);
    const view = new DataView(rawCore.buffer);
    for (let splat = 0; splat < positions.length / 3; splat++) {
      view.setFloat32(splat * 32, positions[splat * 3], true);
      view.setFloat32(splat * 32 + 4, positions[splat * 3 + 1], true);
      view.setFloat32(splat * 32 + 8, positions[splat * 3 + 2], true);
    }
    return rawCore;
  }

  let generation = 0;
  beforeEach(function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    generation = 0;
  });

  function preparation(page, rawCore) {
    const uploadBytes = computeSegmentedAtlasPageFootprint(
      page.pageSplatCount,
      1,
      0,
    ).uploadBytes;
    const core = new Uint8Array(uploadBytes);
    core.set(rawCore);
    return { ...page, uploadBytes, core };
  }

  function prepareRequest(pages = intent().retainedPages) {
    return {
      artifactIdentity: "artifact",
      contentIdentity: "content-1",
      requestSerial: 1,
      selectedSplatCount: 4,
      pages: pages.map((page) => ({
        ...page,
        uploadBytes: computeSegmentedAtlasPageFootprint(
          page.pageSplatCount,
          1,
          0,
        ).uploadBytes,
      })),
    };
  }

  function registerAndSort(request, positions) {
    // Explicit fixture retirement, not a production replace/prepare fallback.
    const pruned = sortGaussianSegmentedGlobalPositions({
      operation: "PRUNE",
      artifactIdentity: "artifact",
      requestSerial: 1,
      repositoryGeneration: generation,
      retainedPages: [],
    });
    generation = pruned.repositoryGeneration;
    const prepared = sortGaussianSegmentedGlobalPositions({
      operation: "PREPARE_CORE",
      artifactIdentity: request.artifactIdentity,
      contentIdentity: request.contentIdentity,
      requestSerial: request.requestSerial,
      repositoryGeneration: generation,
      corePreparations: [
        preparation(request.retainedPages[0], rawCoreFromPositions(positions)),
      ],
    });
    generation = prepared.repositoryGeneration;
    return sortGaussianSegmentedGlobalPositions({
      ...request,
      operation: "SORT",
      repositoryGeneration: generation,
      ordering: new Uint32Array(request.workingSetEstimate.orderingBytes / 4),
    });
  }

  async function settle(sorter, payload) {
    sorter.update(() => payload);
    await Promise.resolve();
    await Promise.resolve();
  }

  async function pendingSort() {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    let result;
    let resolveTask;
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask(parameters) {
          const returned = sortGaussianSegmentedGlobalPositions(parameters);
          if (parameters.operation !== "SORT") {
            return Promise.resolve(returned);
          }
          result = returned;
          return new Promise((resolve) => {
            resolveTask = resolve;
          });
        },
        destroy() {},
      },
    });
    const preparationOwner = sorter.requestPreparation(prepareRequest());
    await settle(sorter, new Uint8Array(128));
    expect(sorter.takeSettlements()[0].error).toBeUndefined();
    sorter.releasePreparation(preparationOwner);
    const owner = sorter.request(intent());
    sorter.update();
    return {
      sorter,
      owner,
      result,
      async complete() {
        resolveTask(result);
        await Promise.resolve();
        await Promise.resolve();
      },
    };
  }

  it("worker history: validates full confirmed history across current and returning sorts without preparing again", async function () {
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask: (parameters) =>
          Promise.resolve(sortGaussianSegmentedGlobalPositions(parameters)),
        destroy() {},
      },
    });
    const pages = [identity(2, 4), identity(3, 4)];
    const preparationOwner = sorter.requestPreparation(prepareRequest(pages));
    await settle(
      sorter,
      rawCoreFromPositions(
        new Float32Array([1, 0, 0, 3, 0, 0, 2, 0, 0, -3, 0, 0]),
      ),
    );
    expect(sorter.takeSettlements()[0].error).toBeUndefined();
    sorter.releasePreparation(preparationOwner);
    const preparedBytes = sorter.snapshot.corePreparationCopiedBytes;
    for (const page of pages) {
      const request = sorter.request({
        ...intent(),
        fragmentCorePageIds: Uint32Array.from([page.pageIndex]),
        retainedPages: [page],
        retainConfirmedPages: true,
      });
      expect(request.retainedPages.map((value) => value.pageIndex)).toEqual([
        2, 3,
      ]);
      await settle(sorter);
      const settlement = sorter.takeSettlements()[0];
      expect(settlement.error).toBeUndefined();
      expect(settlement.result.retainedPageIds).toEqual([2, 3]);
      expect(settlement.result.confirmedPositionBytes).toBe(96);
      expect(settlement.result.repositoryGeneration).toBe(1);
      expect([...settlement.result.ordering.subarray(0, 4)]).toEqual([
        1, 3, 2, 0,
      ]);
    }
    expect(sorter.snapshot.confirmedPageCount).toBe(2);
    expect(sorter.snapshot.corePreparationBatchDispatchCount).toBe(1);
    expect(sorter.snapshot.corePreparationCopiedBytes).toBe(preparedBytes);
    expect(sorter.snapshot.workerDecodedPositionSplats).toBe(8);
    expect(sorter.snapshot.failureCount).toBe(0);
    expect(sorter.destroy()).toBe(true);
  });

  it("worker history: clears live occupancy only after Worker destruction and preserves totals and peaks", async function () {
    let destroyReady = false;
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask: (parameters) =>
          Promise.resolve(sortGaussianSegmentedGlobalPositions(parameters)),
        destroy: () => destroyReady,
      },
    });
    const preparationOwner = sorter.requestPreparation(
      prepareRequest([identity(2, 4)]),
    );
    await settle(sorter, rawCoreFromPositions(new Float32Array(12)));
    expect(sorter.takeSettlements()[0].error).toBeUndefined();
    sorter.releasePreparation(preparationOwner);
    sorter.request(intent());
    await settle(sorter);
    expect(sorter.takeSettlements()[0].error).toBeUndefined();
    const before = sorter.snapshot;
    expect(before.confirmedPositionBytes).toBe(48);
    expect(before.scratchBytes).toBeGreaterThan(0);
    expect(before.corePreparationHighWaterBytes).toBeGreaterThan(0);
    expect(before.workingSetHighWater).toBeGreaterThan(0);
    expect(sorter.destroy()).toBe(false);
    expect(sorter.snapshot.confirmedPositionBytes).toBe(48);
    expect(sorter.snapshot.scratchBytes).toBe(before.scratchBytes);
    destroyReady = true;
    expect(sorter.destroy()).toBe(true);
    const after = sorter.snapshot;
    expect(after.destroyed).toBe(true);
    expect(after.confirmedPageCount).toBe(0);
    expect(after.confirmedPositionBytes).toBe(0);
    expect(after.scratchBytes).toBe(0);
    expect(after.corePreparationLiveBytes).toBe(0);
    for (const field of [
      "corePreparationCopiedBytes",
      "corePreparationHighWaterBytes",
      "workerDecodedPositionSplats",
      "workingSetHighWater",
      "dispatchCount",
      "completionCount",
    ]) {
      expect(after[field]).withContext(field).toBe(before[field]);
    }
  });

  it("sorts one deterministic far-to-near domain with stable ties", function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    const request = intent();
    const positions = new Float32Array([1, 0, 0, 3, 0, 0, 2, 0, 0, -3, 0, 0]);
    const result = registerAndSort(request, positions);
    validateGaussianSegmentedGlobalSortResult(result, request, generation);
    expect([...result.ordering.subarray(0, 4)]).toEqual([1, 3, 2, 0]);
    expect(result.ordering[4]).toBe(0xffffffff);

    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    generation = 0;
    const second = registerAndSort(request, positions.slice());
    expect([...second.ordering]).toEqual([...result.ordering]);
  });

  it("radix fusion: preserves canonical ties and output across zero through four effective byte passes", function () {
    const cases = [
      { millimetres: [1000, 1000.2, 999.8, 1000], activeBytes: 0 },
      { millimetres: [0, 0.49, -0.49, 0], activeBytes: 0 },
      { millimetres: [1001, 1000, 1002, 1000], activeBytes: 1 },
      { millimetres: [1, 65537, 1, 65537], activeBytes: 1 },
      { millimetres: [255, 257, 256, 255], activeBytes: 2 },
      { millimetres: [1, 65538, 65537, 2], activeBytes: 2 },
      { millimetres: [65535, 65537, 65536, 65535], activeBytes: 3 },
      { millimetres: [0, 0.49, 1, 0.51], activeBytes: 4 },
    ];
    for (const { millimetres, activeBytes } of cases) {
      const positions = new Float32Array(
        millimetres.flatMap((distance) => [distance / 1000, 0, 0]),
      );
      const keys = millimetres.map((_, index) =>
        Math.round(-1000 * Math.abs(positions[index * 3])),
      );
      const varyingBytes = [0, 8, 16, 24].filter(
        (shift) =>
          new Set(keys.map((key) => ((key ^ 0x80000000) >>> shift) & 0xff))
            .size > 1,
      ).length;
      expect(varyingBytes).withContext(String(millimetres)).toBe(activeBytes);
      const expected = keys
        .map((key, ordinal) => ({ key, ordinal }))
        .sort(
          (left, right) => left.key - right.key || left.ordinal - right.ordinal,
        )
        .map((entry) => entry.ordinal);
      const request = intent(millimetres.length);
      const result = registerAndSort(request, positions);
      validateGaussianSegmentedGlobalSortResult(result, request, generation);
      expect([...result.ordering.subarray(0, expected.length)])
        .withContext(String(millimetres))
        .toEqual(expected);
      expect(
        result.ordering
          .subarray(expected.length)
          .every((v) => v === 0xffffffff),
      )
        .withContext(String(millimetres))
        .toBe(true);
    }
  });

  it("radix fusion: rejects malformed fragments and metric overflow before returning an Ordering", function () {
    for (const mutate of [
      (request) => (request.fragmentPresentationStarts = new Uint32Array([1])),
      (request) => (request.fragmentCounts = new Uint32Array([3])),
      (request) => (request.fragmentPageLocalStarts = new Uint32Array([1])),
      (request) => (request.sortCenter = [2147484, 0, 0]),
      (request) => (request.sortCenter = [Number.MAX_VALUE, 0, 0]),
    ]) {
      const request = { ...intent() };
      mutate(request);
      expect(() =>
        registerAndSort(request, new Float32Array(12)),
      ).toThrowDeveloperError();
    }
    // A failed key/fragment pass must not leak partial histograms into the next sort.
    const request = intent();
    const result = registerAndSort(
      request,
      new Float32Array([1, 0, 0, 3, 0, 0, 2, 0, 0, -3, 0, 0]),
    );
    validateGaussianSegmentedGlobalSortResult(result, request, generation);
    expect([...result.ordering.subarray(0, 4)]).toEqual([1, 3, 2, 0]);
  });

  it("rejects permutation, padding, identity, and acknowledgement tamper", function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    const request = intent();
    const result = registerAndSort(request, new Float32Array(12));
    for (const mutate of [
      (value) => (value.ordering[1] = value.ordering[0]),
      (value) => (value.ordering[4] = 0),
      (value) => value.viewGeneration++,
      (value) => (value.retainedPageIds[0] = 99),
      (value) => value.retainedPages[0].positionOriginX++,
    ]) {
      const copy = {
        ...result,
        ordering: result.ordering.slice(),
        retainedPages: result.retainedPages.map((value) => ({ ...value })),
        retainedPageIds: result.retainedPageIds.slice(),
      };
      mutate(copy);
      const expectedGeneration = generation;
      expect(function () {
        validateGaussianSegmentedGlobalSortResult(
          copy,
          request,
          expectedGeneration,
        );
      }).toThrowDeveloperError();
    }
  });

  it("cancelled sort validation: discards payload without a publication proof but preserves physical accounting", async function () {
    for (const destroying of [false, true]) {
      const { sorter, owner, result, complete } = await pendingSort();
      const before = sorter.snapshot;
      // Both the permutation and padding are invalid, but will never be consumed.
      result.ordering.fill(0);
      if (destroying) {
        expect(sorter.destroy()).toBe(false);
      } else {
        sorter.cancel(owner);
      }
      await complete();
      expect(sorter.takeSettlements()).toEqual([]);
      expect(sorter.snapshot.hasInFlight).toBe(false);
      expect(sorter.snapshot.completionCount).toBe(1);
      expect(sorter.snapshot.staleDiscardCount).toBe(1);
      expect(sorter.snapshot.failureCount).toBe(0);
      expect(sorter.snapshot.scratchBytes).toBe(result.scratchBytes);
      expect(sorter.snapshot.repositoryGeneration).toBe(
        before.repositoryGeneration,
      );
      expect(sorter.snapshot.confirmedPositionBytes).toBe(
        before.confirmedPositionBytes,
      );
      expect(
        consumeGaussianSegmentedGlobalOrderingValidation(
          result.ordering,
          owner,
        ),
      ).toBeUndefined();
      expect(sorter.destroy()).toBe(true);
    }
  });

  it("cancelled sort validation: keeps full payload validation for a live exact owner", async function () {
    for (const mutate of [
      (result) => (result.ordering[1] = result.ordering[0]),
      (result) => (result.ordering[0] = result.selectedSplatCount),
      (result) => (result.ordering[result.selectedSplatCount] = 0),
    ]) {
      const { sorter, owner, result, complete } = await pendingSort();
      // A structurally identical object cannot cancel the actual owner.
      sorter.cancel({ ...owner });
      mutate(result);
      await complete();
      const settlements = sorter.takeSettlements();
      expect(settlements.length).toBe(1);
      expect(settlements[0].intent).toBe(owner);
      expect(settlements[0].cancelled).toBe(false);
      expect(settlements[0].error.name).toBe("DeveloperError");
      expect(sorter.snapshot.failureCount).toBe(1);
      expect(sorter.snapshot.completionCount).toBe(0);
      expect(sorter.snapshot.staleDiscardCount).toBe(0);
      expect(
        consumeGaussianSegmentedGlobalOrderingValidation(
          result.ordering,
          owner,
        ),
      ).toBeUndefined();
      sorter.destroy();
    }
    const { sorter, owner, result, complete } = await pendingSort();
    await complete();
    expect(sorter.takeSettlements()[0].result).toBe(result);
    expect(
      consumeGaussianSegmentedGlobalOrderingValidation(result.ordering, owner),
    ).toBe(result);
    sorter.destroy();
  });

  it("cancelled sort validation: still rejects foreign envelopes and invalid memory or repository receipts", async function () {
    const mutations = {
      operation: (result) => (result.operation = "PRUNE"),
      artifactIdentity: (result) => (result.artifactIdentity = "foreign"),
      contentIdentity: (result) => (result.contentIdentity = "foreign"),
      contentGeneration: (result) => result.contentGeneration++,
      mappingGeneration: (result) => result.mappingGeneration++,
      viewGeneration: (result) => result.viewGeneration++,
      requestSerial: (result) => result.requestSerial++,
      dispatchAttemptIdentity: (result) =>
        (result.dispatchAttemptIdentity = "foreign"),
      selectedSplatCount: (result) => result.selectedSplatCount++,
      orderingType: (result) =>
        (result.ordering = new Float32Array(result.ordering.length)),
      orderingLength: (result) => (result.ordering = new Uint32Array(4)),
      orderingOffset: (result) =>
        (result.ordering = new Uint32Array(result.ordering.length + 1).subarray(
          1,
          result.ordering.length + 1,
        )),
      orderingBacking: (result) =>
        (result.ordering = new Uint32Array(result.ordering.length + 1).subarray(
          0,
          result.ordering.length,
        )),
      repositoryGeneration: (result) => result.repositoryGeneration++,
      retainedPageIds: (result) => (result.retainedPageIds[0] = 99),
      retainedPages: (result) =>
        (result.retainedPages = result.retainedPages.map((page) => ({
          ...page,
          positionOriginX: page.positionOriginX + 1,
        }))),
      confirmedPositionPageCount: (result) =>
        result.confirmedPositionPageCount++,
      confirmedPositionBytes: (result) => result.confirmedPositionBytes++,
      decodedPositionSplats: (result) => result.decodedPositionSplats++,
      returnedOrderingBytes: (result) => result.returnedOrderingBytes++,
      scratchNotInteger: (result) => (result.scratchBytes = NaN),
      scratchNegative: (result) => (result.scratchBytes = -1),
      scratchOverReserve: (result, owner) =>
        (result.scratchBytes = owner.workingSetEstimate.scratchBytes + 1),
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const { sorter, owner, result, complete } = await pendingSort();
      const before = sorter.snapshot;
      mutate(result, owner);
      sorter.cancel(owner);
      await complete();
      const settlements = sorter.takeSettlements();
      expect(settlements.length).withContext(name).toBe(1);
      expect(settlements[0].intent).withContext(name).toBe(owner);
      expect(settlements[0].cancelled).withContext(name).toBe(true);
      expect(settlements[0].error.name)
        .withContext(name)
        .toBe("DeveloperError");
      expect(sorter.snapshot.failureCount).withContext(name).toBe(1);
      expect(sorter.snapshot.completionCount).withContext(name).toBe(0);
      expect(sorter.snapshot.staleDiscardCount).withContext(name).toBe(0);
      expect(sorter.snapshot.scratchBytes)
        .withContext(name)
        .toBe(before.scratchBytes);
      expect(sorter.snapshot.repositoryGeneration)
        .withContext(name)
        .toBe(before.repositoryGeneration);
      expect(sorter.snapshot.confirmedPositionBytes)
        .withContext(name)
        .toBe(before.confirmedPositionBytes);
      expect(
        consumeGaussianSegmentedGlobalOrderingValidation(
          result.ordering,
          owner,
        ),
      )
        .withContext(name)
        .toBeUndefined();
      sorter.destroy();
    }
  });

  it("rejects malformed Core and atomically rejects a failed batch", function () {
    const page = identity(2, 4);
    for (const mutation of [
      (value) => (value.core = new Uint8Array(127)),
      (value) => new DataView(value.core.buffer).setFloat32(0, NaN, true),
      (value) => (value.core[value.expectedCoreBytes] = 1),
    ]) {
      const bad = preparation(page, new Uint8Array(128));
      mutation(bad);
      expect(() =>
        sortGaussianSegmentedGlobalPositions({
          operation: "PREPARE_CORE",
          artifactIdentity: "artifact",
          contentIdentity: "work",
          requestSerial: 1,
          repositoryGeneration: 0,
          corePreparations: [
            preparation(identity(1, 4), new Uint8Array(128)),
            bad,
          ],
        }),
      ).toThrowDeveloperError();
      const empty = sortGaussianSegmentedGlobalPositions({
        operation: "PRUNE",
        artifactIdentity: "artifact",
        requestSerial: 2,
        repositoryGeneration: 0,
        retainedPages: [],
      });
      expect(empty.confirmedPositionBytes).toBe(0);
      resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    }
  });

  it("prepares one padded backing with exact XYZ and unchanged raw/non-XYZ bytes", function () {
    const page = identity(2, 2, {
      representationId: 19,
      positionOriginX: 100,
      positionOriginY: -50,
      positionOriginZ: 0.25,
    });
    const raw = rawCoreFromPositions(new Float32Array([-10, 1, 0, 1.5, -2, 3]));
    raw.fill(73, 12, 32);
    raw.fill(91, 44, 64);
    const original = raw.slice();
    const input = preparation(page, raw);
    const positions = prepareGaussianSegmentedCore(input);
    expect([...positions]).toEqual([90, -49, 0.25, 101.5, -52, 3.25]);
    expect(positions.buffer).not.toBe(input.core.buffer);
    expect(raw).toEqual(original);
    const view = new DataView(input.core.buffer);
    for (let i = 0; i < 2; i++) {
      for (let axis = 0; axis < 3; axis++) {
        expect(view.getFloat32(i * 32 + axis * 4, true)).toBe(
          positions[i * 3 + axis],
        );
      }
      expect(input.core.subarray(i * 32 + 12, i * 32 + 32)).toEqual(
        raw.subarray(i * 32 + 12, i * 32 + 32),
      );
    }
    expect(input.core.subarray(raw.byteLength).every((v) => v === 0)).toBe(
      true,
    );
  });

  it("separates resident Worker scratch growth from permutation validation", function () {
    const selected = 2_999_859;
    const sameBucketSelected = 2_999_999;
    const scratchCapacityElements = 3_014_656;
    const requiredWorkerScratchBytes = scratchCapacityElements * 12 + 5_120;
    const permutationValidationBytes = Math.ceil(selected / 8);
    const sameCapacity = estimateGaussianSegmentedGlobalSortWorkingSetBytes({
      selectedSplatCount: selected,
      retainedPositionBytes: 0,
      scratchResidentBytes: requiredWorkerScratchBytes,
    });
    expect(sameCapacity.requiredWorkerScratchBytes).toBe(
      requiredWorkerScratchBytes,
    );
    expect(sameCapacity.scratchCapacityElements).toBe(scratchCapacityElements);
    expect(sameCapacity.workerScratchPeakBytes).toBe(
      requiredWorkerScratchBytes,
    );
    expect(sameCapacity.permutationValidationBytes).toBe(
      permutationValidationBytes,
    );
    expect(sameCapacity.scratchBytes).toBe(
      requiredWorkerScratchBytes + permutationValidationBytes,
    );

    const sameBucket = estimateGaussianSegmentedGlobalSortWorkingSetBytes({
      selectedSplatCount: sameBucketSelected,
      retainedPositionBytes: 0,
      scratchResidentBytes: requiredWorkerScratchBytes,
    });
    expect(sameBucket.scratchCapacityElements).toBe(scratchCapacityElements);
    expect(sameBucket.requiredWorkerScratchBytes).toBe(
      requiredWorkerScratchBytes,
    );
    expect(sameBucket.workerScratchPeakBytes).toBe(requiredWorkerScratchBytes);

    const lowerBucket = estimateGaussianSegmentedGlobalSortWorkingSetBytes({
      selectedSplatCount: 16_384,
      retainedPositionBytes: 0,
    });
    const trueGrowth = estimateGaussianSegmentedGlobalSortWorkingSetBytes({
      selectedSplatCount: 16_385,
      retainedPositionBytes: 0,
      scratchResidentBytes: lowerBucket.requiredWorkerScratchBytes,
    });
    expect(trueGrowth.workerScratchPeakBytes).toBe(
      lowerBucket.requiredWorkerScratchBytes +
        trueGrowth.requiredWorkerScratchBytes,
    );
    expect(trueGrowth.scratchBytes).toBe(
      trueGrowth.workerScratchPeakBytes + Math.ceil(16_385 / 8),
    );

    const smaller = 100;
    const largerResidentWorkerScratchBytes =
      trueGrowth.requiredWorkerScratchBytes;
    const largerResident = estimateGaussianSegmentedGlobalSortWorkingSetBytes({
      selectedSplatCount: smaller,
      retainedPositionBytes: 0,
      scratchResidentBytes: largerResidentWorkerScratchBytes,
    });
    expect(largerResident.workerScratchPeakBytes).toBe(
      largerResidentWorkerScratchBytes,
    );
    expect(largerResident.scratchBytes).toBe(
      largerResidentWorkerScratchBytes + Math.ceil(smaller / 8),
    );
  });

  it("keeps Worker scratch stable inside one Ordering capacity bucket", function () {
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    const first = registerAndSort(intent(), new Float32Array(12));
    const base = intent();
    const page = identity(2, 5);
    const request = Object.freeze({
      ...base,
      contentIdentity: "content-2",
      dispatchAttemptIdentity: "dispatch-2",
      requestSerial: 2,
      selectedSplatCount: 5,
      fragmentCounts: new Uint32Array([5]),
      retainedPages: [page],
      workingSetEstimate: estimateGaussianSegmentedGlobalSortWorkingSetBytes({
        selectedSplatCount: 5,
        missingPositionBytes: page.positionBytes,
        preparationBytes: page.rawBytes,
        retainedPositionBytes: page.positionBytes,
      }),
    });
    const second = registerAndSort(request, new Float32Array(15));
    expect(second.scratchBytes).toBe(first.scratchBytes);
    expect([...second.ordering.subarray(0, 5)]).toEqual([0, 1, 2, 3, 4]);
    const repeated = registerAndSort(request, new Float32Array(15));
    expect([...repeated.ordering]).toEqual([...second.ordering]);
  });

  it("radix fusion: accounts four histograms through Worker scratch growth and later smaller sorts", function () {
    const largeRequest = intent(16385);
    const large = registerAndSort(largeRequest, new Float32Array(16385 * 3));
    expect(large.scratchBytes).toBe(32768 * 12 + 5120);
    validateGaussianSegmentedGlobalSortResult(large, largeRequest, generation);

    const smallRequest = {
      ...intent(),
      workingSetEstimate: estimateGaussianSegmentedGlobalSortWorkingSetBytes({
        selectedSplatCount: 4,
        retainedPositionBytes: 48,
        scratchResidentBytes: large.scratchBytes,
      }),
    };
    const small = registerAndSort(smallRequest, new Float32Array(12));
    expect(small.scratchBytes).toBe(large.scratchBytes);
    expect(smallRequest.workingSetEstimate.requiredWorkerScratchBytes).toBe(
      16384 * 12 + 5120,
    );
    expect(smallRequest.workingSetEstimate.workerScratchPeakBytes).toBe(
      large.scratchBytes,
    );
    validateGaussianSegmentedGlobalSortResult(small, smallRequest, generation);
    expect([...small.ordering.subarray(0, 4)]).toEqual([0, 1, 2, 3]);
  });

  it("radix fusion: admits the exact SORT reserve and rejects one byte below before dispatch", async function () {
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask: (parameters) =>
          Promise.resolve(sortGaussianSegmentedGlobalPositions(parameters)),
        destroy() {},
      },
    });
    const preparationOwner = sorter.requestPreparation(prepareRequest());
    await settle(sorter, new Uint8Array(128));
    expect(sorter.takeSettlements()[0].error).toBeUndefined();
    sorter.releasePreparation(preparationOwner);
    const estimate = estimateGaussianSegmentedGlobalSortWorkingSetBytes({
      selectedSplatCount: 4,
      confirmedPositionBytes: 48,
      retainedPositionBytes: 48,
    });
    sorter.maximumWorkingSetBytes = estimate.totalBytes - 1;
    expect(() => sorter.request(intent())).toThrowDeveloperError();
    expect(sorter.snapshot.dispatchCount).toBe(0);
    expect(sorter.snapshot.hasDesired).toBe(false);
    sorter.maximumWorkingSetBytes = estimate.totalBytes;
    const owner = sorter.request(intent());
    expect(owner.workingSetEstimate).toEqual(estimate);
    await settle(sorter);
    expect(sorter.takeSettlements()[0].error).toBeUndefined();
    expect(sorter.snapshot.scratchBytes).toBe(
      estimate.requiredWorkerScratchBytes,
    );
    expect(sorter.snapshot.completionCount).toBe(1);
    sorter.destroy();
  });

  it("charges padded pending/returned bytes and rejects one byte below before copying", async function () {
    const request = prepareRequest();
    const uploadBytes = request.pages[0].uploadBytes;
    const exact = estimateGaussianSegmentedGlobalSortWorkingSetBytes({
      selectedSplatCount: 4,
      missingPositionBytes: 48,
      preparationBytes: uploadBytes,
      retainedPositionBytes: 48,
    }).totalBytes;
    const processor = {
      scheduleTask: (p) =>
        Promise.resolve(sortGaussianSegmentedGlobalPositions(p)),
      destroy() {},
    };
    const rejected = new _SceneGISGaussianSegmentedGlobalSorter({
      maximumWorkingSetBytes: exact - 1,
      taskProcessor: processor,
    });
    expect(() => rejected.requestPreparation(request)).toThrowDeveloperError();
    expect(rejected.snapshot.corePreparationCopiedBytes).toBe(0);
    rejected.destroy();
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      maximumWorkingSetBytes: exact,
      taskProcessor: processor,
    });
    const owner = sorter.requestPreparation(request);
    sorter.update(() => new Uint8Array(128), 0);
    expect(sorter.snapshot.corePreparationCopiedBytes).toBe(0);
    await settle(sorter, new Uint8Array(128));
    expect(sorter.snapshot.corePreparationCopiedBytes).toBe(128);
    expect(sorter.snapshot.corePreparationConvertedSplats).toBe(4);
    expect(sorter.snapshot.corePreparationLiveBytes).toBe(uploadBytes);
    expect(() => sorter.requestPreparation(request)).toThrowDeveloperError();
    sorter.releasePreparation(owner);
    expect(sorter.snapshot.corePreparationLiveBytes).toBe(0);
    sorter.destroy();
  });

  it("transfers one Core backing back and keeps SORT read-only across successor preparation", function () {
    const old = intent();
    registerAndSort(old, new Float32Array(12));
    const page = identity(3, 4);
    const input = preparation(page, new Uint8Array(128));
    const transfers = [];
    const prepared = sortGaussianSegmentedGlobalPositions(
      {
        operation: "PREPARE_CORE",
        artifactIdentity: "artifact",
        contentIdentity: "successor",
        requestSerial: 2,
        repositoryGeneration: generation,
        corePreparations: [input],
      },
      transfers,
    );
    generation = prepared.repositoryGeneration;
    expect(transfers).toEqual([input.core.buffer]);
    expect(prepared.retainedPageIds).toEqual([2, 3]);
    expect(
      prepared.retainedPages.every(
        (p) => p.positions === undefined && p.core === undefined,
      ),
    ).toBe(true);
    const orderingTransfers = [];
    const sorted = sortGaussianSegmentedGlobalPositions(
      {
        ...old,
        operation: "SORT",
        repositoryGeneration: generation,
        ordering: new Uint32Array(old.workingSetEstimate.orderingBytes / 4),
      },
      orderingTransfers,
    );
    expect(sorted.repositoryGeneration).toBe(generation);
    expect(sorted.decodedPositionSplats).toBe(0);
    expect(orderingTransfers).toEqual([sorted.ordering.buffer]);
    const pruned = sortGaussianSegmentedGlobalPositions({
      operation: "PRUNE",
      artifactIdentity: "artifact",
      requestSerial: 3,
      repositoryGeneration: generation,
      retainedPages: [page],
    });
    expect(pruned.retainedPageIds).toEqual([3]);
    expect(pruned.confirmedPositionBytes).toBe(48);
  });

  it("keeps the 160K global Ordering byte-identical across fresh repositories", async function () {
    const count = 160000;
    const page = identity(5, count);
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      positions[index * 3] = ((index * 48271) % 100003) * 0.001;
      positions[index * 3 + 1] = ((index * 69621) % 65537) * 0.001;
      positions[index * 3 + 2] = (index % 257) * 0.01;
    }
    const orderingLength = Math.ceil(count / (4096 * 4)) * 4096 * 4;
    const request = {
      artifactIdentity: "artifact",
      contentIdentity: "content-160k",
      contentGeneration: 1,
      mappingGeneration: 1,
      viewGeneration: 1,
      requestSerial: 2,
      dispatchAttemptIdentity: "dispatch-160k",
      selectedSplatCount: count,
      sortCenter: [10, 20, 30],
      fragmentCorePageIds: new Uint32Array([5]),
      fragmentPageLocalStarts: new Uint32Array([0]),
      fragmentCounts: new Uint32Array([count]),
      fragmentPresentationStarts: new Uint32Array([0]),
      retainedPages: [page],
    };
    function run(overrides = {}) {
      resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
      const effective = { ...request, ...overrides };
      const prepared = sortGaussianSegmentedGlobalPositions({
        operation: "PREPARE_CORE",
        artifactIdentity: effective.artifactIdentity,
        contentIdentity: effective.contentIdentity,
        requestSerial: effective.requestSerial,
        repositoryGeneration: 0,
        corePreparations: [preparation(page, rawCoreFromPositions(positions))],
      });
      return sortGaussianSegmentedGlobalPositions({
        ...effective,
        operation: "SORT",
        repositoryGeneration: prepared.repositoryGeneration,
        ordering: new Uint32Array(orderingLength),
      }).ordering;
    }
    function hash(values) {
      let value = 2166136261;
      for (const word of values) {
        value = Math.imul(value ^ word, 16777619) >>> 0;
      }
      return value;
    }
    const first = run();
    const second = run();
    expect(hash(first).toString(16)).toBe("ec11a533");
    expect(hash(second)).toBe(hash(first));
    expect(first).toEqual(second);
    async function sha256(values) {
      const digest = await crypto.subtle.digest("SHA-256", values.buffer);
      return [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    }
    expect(await sha256(first)).toBe(
      "35d3f4a55a3a227fc337a05b177dd079311d9499549cb079e6a02bf66c5c11d4",
    );
    const cameraChanged = run({
      viewGeneration: 2,
      requestSerial: 3,
      dispatchAttemptIdentity: "dispatch-160k-camera",
      sortCenter: [-20, 5, 80],
    });
    expect(await sha256(cameraChanged)).toBe(
      "ef6b88a5e6f5d549c7f6a1d7aa97aaca5286da5bd41cfebea2ec7cfae4eaa5cd",
    );
  });

  it("accounts cancelled late preparation before prune and waits for destroy", async function () {
    let resolveTask;
    let destroyed = 0;
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      maximumWorkingSetBytes: 1024 * 1024,
      taskProcessor: {
        scheduleTask(parameters) {
          return new Promise((resolve) => {
            resolveTask = () =>
              resolve(sortGaussianSegmentedGlobalPositions(parameters));
          });
        },
        destroy() {
          destroyed++;
        },
      },
    });
    const owner = sorter.requestPreparation(prepareRequest());
    sorter.update(() => new Uint8Array(128));
    sorter.cancel(owner);
    expect(sorter.snapshot.corePreparationLiveBytes).toBeGreaterThan(0);
    expect(sorter.destroy()).toBe(false);
    expect(destroyed).toBe(0);
    resolveTask();
    await Promise.resolve();
    await Promise.resolve();
    expect(sorter.snapshot.repositoryGeneration).toBe(1);
    expect(sorter.snapshot.confirmedPositionBytes).toBe(48);
    expect(sorter.snapshot.corePreparationLiveBytes).toBe(0);
    expect(sorter.snapshot.corePreparationStaleUploadDiscardCount).toBe(1);
    expect(sorter.takeSettlements()[0].cancelled).toBe(true);
    expect(sorter.destroy()).toBe(true);
    expect(destroyed).toBe(1);
  });

  it("round-trips real Worker Core and Ordering transfers while positions remain resident", async function () {
    const processor = new TaskProcessor("SceneGISGaussianSortWorker", 1);
    try {
      const request = intent();
      const raw = rawCoreFromPositions(
        new Float32Array([1, 0, 0, 3, 0, 0, 2, 0, 0, -3, 0, 0]),
      );
      const input = preparation(request.retainedPages[0], raw);
      const uploadBytes = input.uploadBytes;
      const result = await processor.scheduleTask(
        {
          operation: "PREPARE_CORE",
          artifactIdentity: "artifact",
          contentIdentity: "content-1",
          requestSerial: 1,
          repositoryGeneration: 0,
          corePreparations: [input],
        },
        [input.core.buffer],
      );
      expect(await TaskProcessor._canTransferArrayBuffer).toBe(true);
      expect(input.core.byteLength).toBe(0);
      expect(raw.byteLength).toBe(128);
      expect(result.preparedCore[0].core.byteLength).toBe(uploadBytes);
      const ordering = new Uint32Array(
        request.workingSetEstimate.orderingBytes / 4,
      );
      const sorted = await processor.scheduleTask(
        {
          ...request,
          operation: "SORT",
          repositoryGeneration: result.repositoryGeneration,
          ordering,
        },
        [ordering.buffer],
      );
      expect(ordering.byteLength).toBe(0);
      expect([...sorted.ordering.subarray(0, 4)]).toEqual([1, 3, 2, 0]);
      expect(sorted.decodedPositionSplats).toBe(0);
      expect(sorted.repositoryGeneration).toBe(result.repositoryGeneration);
    } finally {
      processor.destroy();
    }
  });

  it("rejects camera-only positions miss without a hidden raw-copy fallback", function () {
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: { destroy() {} },
    });
    expect(() => sorter.request(intent())).toThrowDeveloperError();
    expect(sorter.snapshot.corePreparationCopiedBytes).toBe(0);
    sorter.destroy();
  });

  it("admits exactly the padded 8 MiB window and rejects an extra Page without copying", function () {
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: { destroy() {} },
    });
    const pages = Array.from({ length: 5 }, (_, i) => identity(i, 65536));
    expect(() =>
      sorter.requestPreparation(prepareRequest(pages)),
    ).toThrowDeveloperError();
    expect(sorter.snapshot.corePreparationCopiedBytes).toBe(0);
    const owner = sorter.requestPreparation(prepareRequest(pages.slice(0, 4)));
    expect(owner.uploadBytes).toBe(8 * 1024 * 1024);
    sorter.cancel(owner);
    expect(sorter.snapshot.corePreparationLiveBytes).toBe(0);
    sorter.destroy();
  });

  it("rejects duplicate transfer backing before repository commit", function () {
    const first = preparation(identity(1, 4), new Uint8Array(128));
    const second = {
      ...preparation(identity(2, 4), new Uint8Array(128)),
      core: first.core,
    };
    expect(() =>
      sortGaussianSegmentedGlobalPositions({
        operation: "PREPARE_CORE",
        artifactIdentity: "artifact",
        contentIdentity: "work",
        requestSerial: 1,
        repositoryGeneration: 0,
        corePreparations: [first, second],
      }),
    ).toThrowDeveloperError();
    const result = sortGaussianSegmentedGlobalPositions({
      operation: "PRUNE",
      artifactIdentity: "artifact",
      requestSerial: 2,
      repositoryGeneration: 0,
      retainedPages: [],
    });
    expect(result.confirmedPositionBytes).toBe(0);
  });

  it("coalesces latest view but rejects a foreign owner without copying prepared Core", async function () {
    const sorter = new _SceneGISGaussianSegmentedGlobalSorter({
      taskProcessor: {
        scheduleTask: (parameters) =>
          Promise.resolve(sortGaussianSegmentedGlobalPositions(parameters)),
        destroy() {},
      },
    });
    const prep = sorter.requestPreparation(prepareRequest());
    await settle(sorter, new Uint8Array(128));
    sorter.takeSettlements();
    sorter.releasePreparation(prep);
    const base = intent();
    sorter.request(base);
    expect(() =>
      sorter.request({ ...base, contentIdentity: "foreign" }),
    ).toThrowDeveloperError();
    sorter.request({ ...base, viewGeneration: 2, requestSerial: 2 });
    await settle(sorter);
    const result = sorter.takeSettlements()[0].result;
    expect(result.viewGeneration).toBe(2);
    expect(result.repositoryGeneration).toBe(1);
    expect(sorter.snapshot.coalescedRequestCount).toBe(1);
    expect(sorter.snapshot.corePreparationCopiedBytes).toBe(128);
    expect(sorter.snapshot.rawCoreCloneBytes).toBe(0);
    expect(sorter.snapshot.corePreparationConvertedSplats).toBe(4);
    sorter.destroy();
  });
});

import {
  defer,
  Request,
  RequestScheduler,
  RequestState,
  RequestType,
} from "../../../../index.js";
import pollToPromise from "../../../../../../Specs/pollToPromise.js";
import _SceneGISGaussianStreamLoader from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianStreamLoader.js";
import _SceneGISGaussianSegmentedStreamDescriptorProvider from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedStreamDescriptorProvider.js";
import { packFileName } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import {
  createMacroChunkRuntimeManifest,
  parseMacroChunkRuntimeManifest,
} from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianManifest.js";
import {
  decodeSegmentedHierarchyRuntimeIndex,
  validateSegmentedHierarchyRuntimeIndex,
} from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedProtocol.js";
import { createFrozenFinalA4Bytes } from "./SceneGISGaussianSegmentedGlobalA4Fixture.js";

describe("SceneGIS/Scene/SceneGISGaussianStreamLoader", function () {
  let loader;
  let original;
  let fetchFunction;

  beforeEach(function () {
    original = {
      maximumRequests: RequestScheduler.maximumRequests,
      maximumRequestsPerServer: RequestScheduler.maximumRequestsPerServer,
      priorityHeapLength: RequestScheduler.priorityHeapLength,
      requestsByServer: RequestScheduler.requestsByServer,
      throttleRequests: RequestScheduler.throttleRequests,
    };
    RequestScheduler.clearForSpecs();
    Object.assign(RequestScheduler, {
      maximumRequests: 10,
      maximumRequestsPerServer: 1,
      priorityHeapLength: 10,
      requestsByServer: {},
      throttleRequests: true,
    });
    const fixture = createFrozenFinalA4Bytes();
    const manifest = createMacroChunkRuntimeManifest({
      byteLength: fixture.mci.length,
      checksum: new DataView(fixture.mci.buffer).getUint32(24, true),
    });
    const files = new Map([
      ["scene.mcl.json", new TextEncoder().encode(JSON.stringify(manifest))],
      ["scene.mci", fixture.mci],
      ...fixture.packs,
    ]);
    fetchFunction = jasmine
      .createSpy("fetchGaussian")
      .and.callFake(async (request) => {
        const file = files.get(new URL(request.url).pathname.slice(1));
        if (request.start !== undefined) {
          return {
            status: 206,
            headers: {
              "content-range": `bytes ${request.start}-${request.end}/${file.length}`,
            },
            arrayBuffer: file.slice(request.start, request.end + 1).buffer,
          };
        }
        return { status: 200, arrayBuffer: file.slice().buffer };
      });
    loader = new _SceneGISGaussianStreamLoader({
      url: "https://gaussian.test/scene.mcl.json",
      requestScheduler: RequestScheduler,
      fetchFunction,
      parseIndexManifest: parseMacroChunkRuntimeManifest,
      parseIndex: decodeSegmentedHierarchyRuntimeIndex,
      packFileName: (pack) => `packs/${packFileName(pack)}`,
      descriptorProviderFactory: (index) =>
        new _SceneGISGaussianSegmentedStreamDescriptorProvider({
          runtimeIndex: index,
          validateRuntimeIndex: validateSegmentedHierarchyRuntimeIndex,
          packFileName: (pack) => `packs/${packFileName(pack)}`,
        }),
      retryDelay: 0,
    });
  });

  afterEach(async function () {
    if (!loader.isDestroyed()) {
      loader.destroy();
    }
    RequestScheduler.clearForSpecs();
    await pollToPromise(() => loader._activeBytes === 0);
    Object.assign(RequestScheduler, original);
  });

  function startTask() {
    loader.update();
    expect(loader.activeRequestCount).toBe(1);
    return [...loader._activeTasks][0];
  }

  async function settleTask(task) {
    await pollToPromise(
      () =>
        loader.activeRequestCount === 0 &&
        task.request === undefined &&
        (!task.pageTasks || task.finalized || task.rawCompletionPending),
    );
    expect(loader._activeBytes).toBe(0);
    expect(task.request).toBeUndefined();
  }

  async function completeTask() {
    const task = startTask();
    RequestScheduler.update();
    await settleTask(task);
    expect(task.state).toBe("complete");
    RequestScheduler.update();
  }

  function demandPages() {
    const priority = Object.freeze({
      workClass: 0,
      scheduleClass: 0,
      distanceSquared: 1,
      logicalXyExtentSquared: 1,
      selectedSplats: 1,
      tileX: 0,
      tileY: 0,
      canonicalIdentity: "visible-core",
      sequence: 0,
    });
    loader.applyPageDemandDelta({
      generation: 1,
      storageIdentity: Object.freeze({
        serial: 1,
        ownerLifecycleGeneration: 1,
        storageGeneration: 1,
      }),
      deltas: [0, 1].map((pageIndex) => ({
        pageIndex,
        record: Object.freeze({
          key: `page:${pageIndex}`,
          pageIndex,
          page: loader._descriptorProvider.readPageRequest(pageIndex),
          priority,
          contributors: Object.freeze([
            Object.freeze({
              token: "acquisition:visible:0",
              kind: "acquisition-core",
              tileKey: "tile",
              workIntentIdentity: "visible",
              retryOrdinal: 0,
              desiredEntryGeneration: 1,
              priority,
            }),
          ]),
        }),
      })),
    });
  }

  async function preparePages() {
    await completeTask(); // Manifest.
    await completeTask(); // MCI.
    demandPages();
    await completeTask(); // Pack header.
  }

  async function saturateServer(task) {
    const response = defer();
    const imagery = new Request({
      url: "https://gaussian.test/basemap.png",
      type: RequestType.IMAGERY,
      throttleByServer: true,
      requestFunction: () => response.promise,
    });
    const promise = RequestScheduler.request(imagery);
    const request = task.request;
    RequestScheduler.update();
    expect(request.state).toBe(RequestState.CANCELLED);
    await settleTask(task);
    response.resolve();
    await promise;
    RequestScheduler.update();
  }

  it("resumes manifest, index, header and merged pages after repeated server contention without spending retries", async function () {
    for (const stage of ["manifest", "index", "header", "pages"]) {
      if (stage === "header") {
        demandPages();
      }
      const calls = fetchFunction.calls.count();
      for (let i = 0; i < 4; ++i) {
        const task = startTask();
        await saturateServer(task);
        expect(task.state).toBe("queued");
        expect(task.attempts).toBe(0);
        expect(task.readyAt).toBe(0);
        expect(loader.error).toBeUndefined();
        expect(loader.drainPageWorkSettlements()).toEqual([]);
        if (loader.error || task.state !== "queued") {
          throw (
            loader.error ??
            new Error(`${stage} stopped after scheduler cancellation`)
          );
        }
      }
      expect(fetchFunction.calls.count()).toBe(calls);
      await completeTask();
    }
    loader.update();
    expect(loader.drainCompleted().map((item) => item.page.index)).toEqual([
      0, 1,
    ]);
    expect(loader.statistics.retries).toBe(0);
    expect(loader.statistics.failures).toBe(0);
    expect(loader.statistics.completedPages).toBe(2);
    expect(loader.state).toBe("STREAMING");
  });

  it("resumes pages displaced from the native priority heap", async function () {
    await preparePages();
    RequestScheduler.priorityHeapLength = 1;
    const task = startTask();
    const request = task.request;
    const higherPriority = new Request({
      url: "https://gaussian.test/basemap.png",
      type: RequestType.IMAGERY,
      throttle: true,
      throttleByServer: true,
      priority: -1,
      requestFunction: () => Promise.resolve(),
    });
    const promise = RequestScheduler.request(higherPriority);
    expect(request.state).toBe(RequestState.CANCELLED);
    RequestScheduler.update();
    await promise;
    await settleTask(task);
    expect(task.state).toBe("queued");
    expect(task.attempts).toBe(0);
    RequestScheduler.update();
    await completeTask();
    loader.update();
    expect(loader.drainCompleted().length).toBe(2);
    expect(loader.statistics.failures).toBe(0);
    expect(loader.statistics.retries).toBe(0);
  });

  it("preserves real failure attempts across scheduler cancellation and terminates at the retry limit", async function () {
    await preparePages();
    fetchFunction.and.rejectWith(new Error("network unavailable"));
    for (let attempt = 1; attempt <= 3; ++attempt) {
      const task = startTask();
      RequestScheduler.update();
      await settleTask(task);
      expect(task.attempts).toBe(attempt);
      RequestScheduler.update();
      if (attempt < 3) {
        expect(task.state).toBe("queued");
        const deferredTask = startTask();
        await saturateServer(deferredTask);
        expect(deferredTask.attempts).toBe(attempt);
      } else {
        expect(task.state).toBe("failed");
      }
    }
    expect(loader.statistics.retries).toBe(2);
    expect(loader.statistics.failures).toBe(1);
    const settlements = loader.drainPageWorkSettlements();
    expect(settlements.length).toBe(1);
    expect(settlements[0].records.length).toBe(2);
    expect(settlements[0].reason).toBe("network unavailable");
  });

  it("does not requeue pages whose demand was removed", async function () {
    await preparePages();
    const task = startTask();
    loader.applyPageDemandDelta({
      generation: 2,
      storageIdentity: loader._pageWorkStorageIdentity,
      deltas: [0, 1].map((pageIndex) => ({ pageIndex })),
    });
    RequestScheduler.update();
    await settleTask(task);
    loader.update();
    expect(task.state).toBe("cancelled");
    expect(loader.activeRequestCount).toBe(0);
    expect(loader._pageTasks.size).toBe(0);
    expect(loader.statistics.failures).toBe(0);
    expect(loader.drainPageWorkSettlements()).toEqual([]);
  });

  it("does not requeue an active transport after destruction", async function () {
    const response = defer();
    fetchFunction.and.returnValue(response.promise);
    const task = startTask();
    const request = task.request;
    RequestScheduler.update();
    const signal = fetchFunction.calls.mostRecent().args[0].signal;
    loader.destroy();
    RequestScheduler.update();
    response.resolve({ status: 200, arrayBuffer: new ArrayBuffer(0) });
    await settleTask(task);
    expect(request.state).toBe(RequestState.CANCELLED);
    expect(signal.aborted).toBe(true);
    expect(task.state).toBe("cancelled");
    expect(loader.isDestroyed()).toBe(true);
    expect(loader.statistics.failures).toBe(0);
    expect(loader.statistics.retries).toBe(0);
  });
});

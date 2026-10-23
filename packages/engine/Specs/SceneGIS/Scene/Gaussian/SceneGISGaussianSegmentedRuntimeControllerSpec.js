import { packFileName } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import { crc32WithZeroedRanges } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsCrc32.js";
import { encodePack } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsGsp.js";
import BoundingSphere from "../../../../Source/Core/BoundingSphere.js";
import Cartesian3 from "../../../../Source/Core/Cartesian3.js";
import Color from "../../../../Source/Core/Color.js";
import Matrix3 from "../../../../Source/Core/Matrix3.js";
import Matrix4 from "../../../../Source/Core/Matrix4.js";
import Quaternion from "../../../../Source/Core/Quaternion.js";
import ContextLimits from "../../../../Source/Renderer/ContextLimits.js";
import DrawCommand from "../../../../Source/Renderer/DrawCommand.js";
import _SceneGISGaussianSegmentedRuntimeController, {
  gaussianSegmentedRuntimeControllerSpecHooks,
} from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedRuntimeController.js";
import _SceneGISGaussianStreamPersistentCache from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianStreamPersistentCache.js";
import _SceneGISGaussianSegmentedStreamDescriptorProvider from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedStreamDescriptorProvider.js";
import {
  createSegmentedActiveCut,
  createSegmentedAssetPagePhysicalSnapshot,
  decodeSegmentedHierarchyRuntimeIndex,
  planSegmentedConvergedActiveCut,
  planSegmentedAssetPageBootstrap,
  commitSegmentedAssetPageBootstrap,
  prepareSegmentedConvergedAssetPagePublication,
  finalizeSegmentedAssetPagePublication,
  projectSegmentedAssetIntervals,
  computeSegmentedAtlasPageFootprint,
} from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedProtocol.js";
import {
  resetGaussianSegmentedGlobalSorterRepositoryForSpecs,
  sortGaussianSegmentedGlobalPositions,
} from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSortTask.js";
import { createMacroChunkRuntimeManifest } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianManifest.js";
import createContext from "../../../../../../Specs/createContext.js";
import createCamera from "../../../../../../Specs/createCamera.js";
import createFrameState from "../../../../../../Specs/createFrameState.js";
import {
  A4_CORE_PACK_NAME,
  createFrozenFinalA4Bytes,
} from "./SceneGISGaussianSegmentedGlobalA4Fixture.js";

// Current-builder tiny MCI fixture; SHA256 e077915e6e00cd5e760501aa6b61a34a54693a7be6f13fe705bc5d8e51ef6837.
function checkpointRuntimeIndex() {
  const binary = atob(
    "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",
  );
  return decodeSegmentedHierarchyRuntimeIndex(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

function manifestBytes(mci) {
  const checksum = new DataView(
    mci.buffer,
    mci.byteOffset,
    mci.byteLength,
  ).getUint32(24, true);
  return new TextEncoder().encode(
    `${JSON.stringify(
      createMacroChunkRuntimeManifest({
        url: "scene.mci",
        byteLength: mci.byteLength,
        checksum,
      }),
      null,
      2,
    )}\n`,
  );
}

function installNonIdentityIndexTransform(mci) {
  const localToFixed = [0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1, 0, 100, 200, 300, 1];
  const view = new DataView(mci.buffer, mci.byteOffset, mci.byteLength);
  for (let component = 0; component < 16; component++) {
    view.setFloat64(296 + component * 8, localToFixed[component], true);
  }
  view.setUint32(24, crc32WithZeroedRanges(mci, [[24, 4]]), true);
  return localToFixed;
}

function primitiveState() {
  return {
    show: true,
    _modelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    _effectiveModelMatrix: Matrix4.clone(Matrix4.IDENTITY),
    _maxShDegree: 0,
    _viewOriginLocal: new Cartesian3(),
    _sourceRenderToViewPosition: new Cartesian3(),
    _sourceRenderToViewQuaternion: new Quaternion(),
    _color: Color.WHITE,
    _renderTuning0: { x: 3, y: 0.1, z: 1024, w: 1 / 255 },
    _renderTuning1: { x: 0.3, y: 0.3, z: 1.2, w: 1 },
    _falloff: 1,
  };
}

function refinementView() {
  return Object.freeze({
    viewIdentity: "d4-controller-refinement",
    cameraPositionScene: Object.freeze([44, 5, 25]),
    frustumPlanesScene: Object.freeze([
      Object.freeze([1, 0, 0, 1e9]),
      Object.freeze([-1, 0, 0, 1e9]),
      Object.freeze([0, 1, 0, 1e9]),
      Object.freeze([0, -1, 0, 1e9]),
      Object.freeze([0, 0, 1, 1e9]),
      Object.freeze([0, 0, -1, 1e9]),
    ]),
    sceneToClipMatrix: Object.freeze([
      1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
    ]),
    drawingBufferWidth: 100,
    drawingBufferHeight: 100,
    projectionKind: "perspective",
  });
}

function createFailureHarness(options = {}) {
  const fixture = createFrozenFinalA4Bytes();
  const manifest = manifestBytes(fixture.mci);
  const context = createContext({ requestWebgl1: false });
  const frameState = createFrameState(
    context,
    createCamera({
      target: Cartesian3.ZERO,
      offset: new Cartesian3(44, 5, 25),
      far: 1_000_000_000,
    }),
  );
  resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
  ContextLimits._maximumTextureSize = context.maximumTextureSize;
  const lineWidthRange = context._gl.getParameter(
    context._gl.ALIASED_LINE_WIDTH_RANGE,
  );
  ContextLimits._minimumAliasedLineWidth = lineWidthRange[0];
  ContextLimits._maximumAliasedLineWidth = lineWidthRange[1];
  const control = {
    packHeaderFailures: 0,
    pageFailures: 0,
    releases: 0,
  };
  const fetchFunction = (request) => {
    let bytes;
    if (request.url.endsWith("scene.mcl.json")) {
      bytes = manifest;
    } else if (request.url.endsWith("scene.mci")) {
      bytes = fixture.mci;
    } else if (request.url.endsWith(packFileName({ id: 0, kind: 1 }))) {
      const header = request.start === 0;
      if (header && control.packHeaderFailures > 0) {
        control.packHeaderFailures--;
        return Promise.reject(new Error("injected Pack header failure"));
      }
      if (!header && control.pageFailures > 0) {
        control.pageFailures--;
        return Promise.reject(new Error("injected Core Page failure"));
      }
      bytes = fixture.packs.get(A4_CORE_PACK_NAME);
    } else {
      return Promise.reject(new Error("unknown segmented fixture URL"));
    }
    const start = request.start ?? 0;
    const end = request.end ?? bytes.byteLength - 1;
    const range = bytes.slice(start, end + 1);
    return Promise.resolve({
      status: request.start === undefined ? 200 : 206,
      headers:
        request.start === undefined
          ? { "content-length": String(range.byteLength) }
          : {
              "content-range": `bytes ${start}-${end}/${bytes.byteLength}`,
              "content-length": String(range.byteLength),
            },
      arrayBuffer: range.buffer,
    });
  };
  const primitive = primitiveState();
  const controller = new _SceneGISGaussianSegmentedRuntimeController({
    primitive,
    url: "https://example.test/scene.mcl.json",
    maximumSelectedSplats: 6,
    maximumCoverageSlots: 100,
    maximumCpuBytes: 100_000_000,
    maximumGpuBytes: 100_000_000,
    maximumCpuPageBytes: 10_000_000,
    replacementCpuEscrowBytes: 5_000_000,
    maximumGpuPageBytes: 10_000_000,
    replacementGpuEscrowBytes: 5_000_000,
    maximumSortWorkingSetBytes: 1_000_000,
    refineErrorPixels: 0.0001,
    coarsenErrorPixels: 0.00001,
    maximumGpuFeedOperationsPerFrame: 1,
    maximumGpuFeedBytesPerFrame: 8 * 1024 * 1024,
    maximumMappingEntriesPerFrame: 1,
    maximumTextureUploadsPerFrame: 1,
    maximumSortPositionExtractionsPerFrame: 1,
    maximumLoaderDeliveryBytes: 1024 * 1024,
    requestScheduler: { request: (request) => request.requestFunction() },
    fetchFunction,
    taskProcessor: {
      scheduleTask: (parameters) =>
        Promise.resolve(sortGaussianSegmentedGlobalPositions(parameters)),
      destroy() {},
    },
    ...options,
  });
  return { context, frameState, primitive, controller, control };
}

async function pumpHarness(harness, predicate, maximum = 500) {
  for (let frame = 0; frame < maximum; frame++) {
    harness.frameState.commandList.length = 0;
    harness.controller.update(harness.frameState);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (predicate()) {
      return;
    }
  }
  throw new Error(
    `${JSON.stringify(harness.controller.statistics)}; recoverable=${harness.controller._lastRecoverableError?.message}; fatal=${harness.controller.error?.stack}`,
  );
}

async function publishRoot(harness) {
  await pumpHarness(harness, () => harness.controller.ready);
  harness.frameState.commandList.length = 0;
  harness.controller.update(harness.frameState);
  expect(harness.frameState.commandList.length).toBe(1);
}

async function startSuccessor(harness) {
  harness.controller._view = refinementView();
  harness.controller._viewGeneration++;
  harness.controller._orderingViewGeneration =
    harness.controller._viewGeneration;
  try {
    await pumpHarness(harness, () => harness.controller._content !== undefined);
  } catch (error) {
    throw new Error(
      `${error.message}; recoverable=${harness.controller._lastRecoverableError?.message}`,
      { cause: error },
    );
  }
  return harness.controller._content;
}

async function destroyHarness(harness) {
  harness.controller.requestDestroy();
  await pumpHarness(harness, () => harness.controller.destroyed, 100);
  harness.context.destroyForSpecs();
}

async function pumpWithOldCurrent(harness, predicate, maximum = 700) {
  for (let frame = 0; frame < maximum; frame++) {
    harness.frameState.commandList.length = 0;
    harness.controller.update(harness.frameState);
    expect(harness.frameState.commandList.length).toBe(1);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (predicate()) {
      return;
    }
  }
  throw new Error(
    `${JSON.stringify(harness.controller.statistics)}; recoverable=${harness.controller._lastRecoverableError?.message}`,
  );
}

describe("SceneGIS/Scene/SceneGISGaussianSegmentedRuntimeController", function () {
  function persistenceHarness(overrides = {}) {
    // Isolate persistence from the historical MCI2 fixture. Only index parsing
    // is a seam; descriptor projection, Pack/CRC validation and Loader are real.
    const indexBytes = new Uint8Array(32);
    const manifest = manifestBytes(indexBytes);
    const pack = encodePack({
      packId: 0,
      kind: 1,
      layoutId: 1,
      splatCount: 1,
      pages: [new Uint8Array(32)],
    });
    const page = pack.pages[0];
    const index = {
      artifactIdentityHex: "persistence-fixture-artifact",
      mciChecksum: 0,
      byteLength: indexBytes.byteLength,
      pageCount: 1,
      packCount: 1,
      readPage(_pageId, target) {
        target.set([
          0,
          0,
          1,
          1,
          1,
          1,
          0,
          Number(page.offset),
          32,
          32,
          page.checksum,
        ]);
        return target;
      },
      readPack(_packId, target) {
        target.set([1, 1, 0, 1, 1, pack.bytes.byteLength, pack.checksum]);
        return target;
      },
    };
    const requests = [];
    const controller = new _SceneGISGaussianSegmentedRuntimeController({
      primitive: primitiveState(),
      url: "https://example.test/scene.mcl.json",
      maximumCpuBytes: 100_000_000,
      maximumCpuPageBytes: 10_000_000,
      maximumSortWorkingSetBytes: 1_000_000,
      usePersistentCache: true,
      maximumPersistentCacheBytes: 123456,
      maximumPersistentCacheStagingBytes: 64 * 1024 ** 2,
      requestPersistentStorage: false,
      requestScheduler: { request: (request) => request.requestFunction() },
      fetchFunction(request) {
        requests.push(request);
        const bytes = request.url.endsWith("scene.mcl.json")
          ? manifest
          : request.url.endsWith("scene.mci")
            ? indexBytes
            : pack.bytes;
        const start = request.start ?? 0;
        const end = request.end ?? bytes.byteLength - 1;
        const range = bytes.slice(start, end + 1);
        return Promise.resolve({
          status: request.start === undefined ? 200 : 206,
          headers:
            request.start === undefined
              ? { "content-length": String(range.byteLength) }
              : {
                  "content-range": `bytes ${start}-${end}/${bytes.byteLength}`,
                  "content-length": String(range.byteLength),
                },
          arrayBuffer: range.buffer,
        });
      },
      ...overrides,
    });
    controller._loader._parseIndex = () => index;
    controller._loader._descriptorProviderFactory = (runtimeIndex) => {
      const provider = new _SceneGISGaussianSegmentedStreamDescriptorProvider({
        runtimeIndex,
        validateRuntimeIndex: (value) => value,
        packFileName: () => A4_CORE_PACK_NAME,
      });
      controller._provider = provider;
      return provider;
    };
    return { controller, requests };
  }

  async function pumpPersistenceLoader(controller, predicate) {
    for (let frame = 0; frame < 100; frame++) {
      controller._loader.update();
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (predicate()) {
        return;
      }
      if (controller._loader.error) {
        throw controller._loader.error;
      }
    }
    throw new Error("Persistent integration fixture did not settle");
  }

  function fakePersistentCache() {
    return {
      enabled: true,
      statistics: {
        enabled: true,
        operational: true,
        lookupHitPages: 2,
        lookupHitBytes: 64,
        lookupMissPages: 3,
        writeCommittedPages: 4,
        writeCommittedBytes: 128,
        stagingBytes: 16,
      },
      destroy: jasmine.createSpy("persistent destroy"),
    };
  }

  it("segmented persistence: injects the initialized descriptor provider once and reports counters", async function () {
    const cache = fakePersistentCache();
    const factory = jasmine
      .createSpy("persistent factory")
      .and.returnValue(cache);
    const { controller } = persistenceHarness({
      persistentCacheFactory: factory,
    });
    try {
      expect(factory).not.toHaveBeenCalled();
      await pumpPersistenceLoader(controller, () => !!controller._loader.index);
      const setCache = spyOn(
        controller._loader,
        "setPersistentCache",
      ).and.callThrough();
      controller._initializePersistentCache();
      controller._initializePersistentCache();
      expect(factory).toHaveBeenCalledTimes(1);
      expect(setCache).toHaveBeenCalledOnceWith(cache);
      expect(controller._loader._persistentCache).toBe(cache);
      expect(controller._loader._maximumPersistentLookupBytes).toBe(
        8 * 1024 * 1024,
      );
      const headroom =
        100_000_000 -
        10_000_000 -
        1_000_000 -
        controller._provider.compactIndexBytes;
      expect(factory.calls.mostRecent().args[0]).toEqual({
        descriptorProvider: controller._provider,
        databaseName: "CesiumGaussianSegmentedStreamCache",
        maximumBytes: 123456,
        maximumStagingBytes: Math.floor(headroom / 4),
        requestPersistentStorage: false,
      });
      expect(controller.statistics).toEqual(
        jasmine.objectContaining({
          persistentCacheEnabled: true,
          persistentCacheOperational: true,
          persistentCacheHitPages: 2,
          persistentCacheHitBytes: 64,
          persistentCacheMissPages: 3,
          persistentCacheWritePages: 4,
          persistentCacheWriteBytes: 128,
          persistentCacheStagingBytes: 16,
          persistentCacheStagingReserveBytes: Math.floor(headroom / 4),
        }),
      );
    } finally {
      controller.requestDestroy();
    }
    expect(cache.destroy).toHaveBeenCalledTimes(1);
    expect(controller.destroyed).toBe(true);
    expect(controller._loader.isDestroyed()).toBe(true);
    expect(controller._persistentCache).toBeUndefined();
    expect(controller.statistics.persistentCacheStagingReserveBytes).toBe(0);
    controller.requestDestroy();
    expect(cache.destroy).toHaveBeenCalledTimes(1);
  });

  it("segmented persistence: caps staging by configured bytes and exact remaining CPU headroom", function () {
    for (const [headroom, requested, expected] of [
      [403, 500, 100],
      [403, 90, 90],
      [3, 500, 0],
      [-1, 500, 0],
    ]) {
      const cache = fakePersistentCache();
      const factory = jasmine
        .createSpy("persistent factory")
        .and.returnValue(cache);
      const { controller } = persistenceHarness({
        maximumCpuBytes: 400 + 100 + 25 + headroom,
        maximumCpuPageBytes: 400,
        maximumSortWorkingSetBytes: 100,
        maximumPersistentCacheStagingBytes: requested,
        persistentCacheFactory: factory,
      });
      controller._provider = { compactIndexBytes: 25 };
      controller._initializePersistentCache();
      expect(controller._persistentStagingReserveBytes).toBe(expected);
      if (expected > 0) {
        expect(factory.calls.mostRecent().args[0].maximumStagingBytes).toBe(
          expected,
        );
      } else {
        expect(factory).not.toHaveBeenCalled();
        expect(controller._loader._persistentCache).toBeUndefined();
        expect(controller.statistics.persistentCacheDisabledReason).toBe(
          "cpu-staging-unavailable",
        );
      }
      controller.requestDestroy();
    }
  });

  it("segmented persistence: continues validated HTTP Page loading after cache construction or open failure", async function () {
    for (const failConstruction of [true, false]) {
      const openError = new Error("injected persistent open failure");
      openError.name = "SecurityError";
      const adapter = {
        open: jasmine.createSpy("persistent open").and.rejectWith(openError),
        close: jasmine.createSpy("persistent close"),
      };
      let cache;
      const factory = jasmine
        .createSpy("persistent factory")
        .and.callFake((value) => {
          if (failConstruction) {
            throw openError;
          }
          cache = new _SceneGISGaussianStreamPersistentCache({
            ...value,
            adapter,
            storage: {},
          });
          return cache;
        });
      const { controller, requests } = persistenceHarness({
        persistentCacheFactory: factory,
      });
      try {
        await pumpPersistenceLoader(
          controller,
          () => !!controller._loader.index,
        );
        controller._initializePersistentCache();
        if (cache) {
          await cache._owner.ready;
          expect(adapter.open).toHaveBeenCalledTimes(1);
        } else {
          expect(controller._persistentStagingReserveBytes).toBe(0);
          expect(adapter.open).not.toHaveBeenCalled();
        }
        expect(controller.statistics.persistentCacheOperational).toBe(false);
        expect(controller.statistics.persistentCacheDisabledReason).toBe(
          "SecurityError",
        );
        const page = controller._provider.readPageRequest(0);
        controller._loader.enqueuePages([page]);
        let completed;
        await pumpPersistenceLoader(controller, () => {
          completed = controller._loader.drainCompleted();
          return completed.length > 0;
        });
        expect(completed.length).toBe(1);
        expect(completed[0].page.index).toBe(0);
        expect(completed[0].payload.byteLength).toBe(page.storedBytes);
        expect(controller._loader.error).toBeUndefined();
        expect(requests.some((request) => request.start === page.offset)).toBe(
          true,
        );
        completed[0].release?.();
      } finally {
        controller.requestDestroy();
      }
      expect(controller.destroyed).toBe(true);
      if (cache) {
        expect(cache._destroyed).toBe(true);
      }
    }
  });

  it("segmented persistence: retains the owner until D3 destroy completes", function () {
    const cache = fakePersistentCache();
    const { controller } = persistenceHarness({
      persistentCacheFactory: () => cache,
    });
    controller._provider = { compactIndexBytes: 25 };
    controller._initializePersistentCache();
    const destroyD3 = jasmine
      .createSpy("D3 destroy")
      .and.returnValues(false, true);
    controller._d3 = { destroy: destroyD3 };
    expect(controller.requestDestroy()).toBe(false);
    expect(cache.destroy).not.toHaveBeenCalled();
    expect(controller._persistentStagingReserveBytes).toBeGreaterThan(0);
    expect(controller.requestDestroy()).toBe(true);
    expect(cache.destroy).toHaveBeenCalledTimes(1);
    expect(controller._persistentStagingReserveBytes).toBe(0);
    controller.requestDestroy();
    expect(cache.destroy).toHaveBeenCalledTimes(1);
    controller._loader.destroy();
  });

  function contentViewHarness(phase = "PAGES") {
    const cut = {
      artifactIdentityHex: "view-content-fixture",
      maximumSelectedSplats: 6,
      selectedSplatCount: 6,
      activeSlotCount: 2,
      coverageNodeIndices: Uint32Array.from([1, 2]),
      providerRepresentationIds: Uint32Array.from([3, 4]),
      providerRangeStarts: Uint32Array.from([0, 2]),
      providerRangeCounts: Uint32Array.from([2, 4]),
    };
    const controller = Object.create(
      _SceneGISGaussianSegmentedRuntimeController.prototype,
    );
    controller._viewGeneration = 2;
    controller._orderingViewGeneration = 2;
    controller._transformGeneration = 1;
    controller._view = refinementView();
    controller._sortBounds = new Float64Array([
      -100, -100, -100, 100, 100, 100,
    ]);
    controller._content = {
      kind: "TRANSITION",
      phase,
      targetCut: cut,
      viewGeneration: 1,
      transformGeneration: 1,
      work: {},
      plan: {},
      preparationOwner: {},
      acceptedIds: new Set([0]),
      boundIds: new Set([0]),
      ticket: phase === "PRESENTATION" ? {} : undefined,
    };
    controller._d3 = {
      refreshContentView: jasmine.createSpy("refreshContentView"),
    };
    const plan = { stepCount: 1, targetCutAt: () => cut };
    spyOn(controller, "_createLatestViewPlan").and.returnValue(plan);
    return { controller, cut, plan };
  }

  function observeViewHarness(offset = new Cartesian3(44, 5, 25)) {
    const harness = contentViewHarness("PRESENTATION");
    const { controller } = harness;
    const context = { drawingBufferWidth: 100, drawingBufferHeight: 100 };
    const camera = createCamera({ offset, far: 1_000_000_000 });
    const frameState = createFrameState(context, camera);
    controller._index = {};
    controller._primitive = primitiveState();
    controller._sourceBoundingSphere = new BoundingSphere(Cartesian3.ZERO, 10);
    controller._viewGeneration = 0;
    controller._orderingViewGeneration = 0;
    controller._view = undefined;
    controller._statistics = {};
    controller._d3.current = {};
    controller._d3.currentViewGeneration = 0;
    controller._d3.requestOrderingRefresh = jasmine.createSpy(
      "requestOrderingRefresh",
    );
    function observe() {
      frameState.cullingVolume = camera.frustum.computeCullingVolume(
        camera.positionWC,
        camera.directionWC,
        camera.upWC,
      );
      return controller._observeView(frameState);
    }
    observe();
    controller._content.viewGeneration = controller._viewGeneration;
    controller._d3.currentViewGeneration = controller._orderingViewGeneration;
    controller._orderingRequestedViewGeneration =
      controller._orderingViewGeneration;
    return { ...harness, context, camera, frameState, observe };
  }

  it("command bounds follow moved content and replacement commands", function () {
    const { controller, frameState } = observeViewHarness();
    const sourceBounds = new BoundingSphere(new Cartesian3(10, 20, 30), 15);
    controller._sourceBoundingSphere = sourceBounds;
    const initialCommand = new DrawCommand({
      boundingVolume: BoundingSphere.clone(sourceBounds),
    });
    controller._d3.current.command = initialCommand;
    controller._publish(frameState);

    Matrix4.fromRotationTranslation(
      Matrix3.fromRotationZ(Math.PI / 2),
      new Cartesian3(200, 300, 400),
      controller._primitive._effectiveModelMatrix,
    );
    controller.transformChanged();
    frameState.commandList.length = 0;
    controller._publish(frameState);
    const movedBounds = new BoundingSphere(new Cartesian3(180, 310, 430), 15);
    expect(initialCommand.boundingVolume).toEqualEpsilon(movedBounds, 1e-12);
    const transformGeneration = controller._transformGeneration;

    // A completed content successor starts with the adapter's original bounds.
    // The stopped model needs no further transform event to place that command.
    const successorCommand = new DrawCommand({
      boundingVolume: BoundingSphere.clone(sourceBounds),
    });
    controller._d3.current = { command: successorCommand };
    frameState.commandList.length = 0;
    controller._publish(frameState);
    expect(frameState.commandList).toEqual([successorCommand]);
    expect(successorCommand.boundingVolume).toEqualEpsilon(movedBounds, 1e-12);
    expect(initialCommand.boundingVolume).toEqualEpsilon(movedBounds, 1e-12);
    expect(controller._transformGeneration).toBe(transformGeneration);

    const stableBounds = successorCommand.boundingVolume;
    controller._publish(frameState);
    expect(successorCommand.boundingVolume).toBe(stableBounds);
    expect(frameState.commandList).toEqual([successorCommand]);

    controller._d3.destroy = jasmine.createSpy("destroy").and.returnValue(true);
    spyOn(controller, "_destroyPersistentCache");
    controller._advanceDestroy();
    expect(controller._transformedCommand).toBeUndefined();
  });

  it("pick isolation: retains the formal view and resources while restoring exact render transforms", function () {
    const { controller, frameState, observe } = observeViewHarness();
    const formalView = controller._view;
    const formalObservation = controller._observation;
    const content = controller._content;
    const generation = controller._viewGeneration;
    const orderingGeneration = controller._orderingViewGeneration;
    const primitive = controller._primitive;
    const formalOrigin = Cartesian3.clone(primitive._viewOriginLocal);
    const formalRotation = Quaternion.clone(
      primitive._sourceRenderToViewQuaternion,
    );
    const command = {};
    controller._d3.current.command = command;
    controller._commandTransformGeneration = controller._transformGeneration;
    controller._evaluatedPlanKey = "formal-plan";
    controller._statistics.lastFrameGpuUploadBytes = 123;
    controller._statistics.gpuUploadBytes = 456;
    controller._loader = { update: jasmine.createSpy("loader update") };
    controller._d3.update = jasmine.createSpy("presentation update");
    for (const name of [
      "_observeView",
      "_bindPages",
      "_advanceOrdering",
      "_planLatestView",
    ]) {
      spyOn(controller, name).and.callThrough();
    }
    spyOn(controller, "_fail").and.callFake((error) => {
      throw error;
    });

    const pickCamera = createCamera({ offset: new Cartesian3(20, 10, 5) });
    pickCamera.frustum.fov = 0.001;
    const pickFrame = createFrameState(frameState.context, pickCamera);
    pickFrame.passes.render = false;
    pickFrame.passes.pick = true;
    pickFrame.passes.depth = true;
    pickFrame.commandList.push(command);
    controller.update(pickFrame);

    expect(pickFrame.commandList).toEqual([command]);
    expect(primitive._viewOriginLocal).toEqual(pickCamera.positionWC);
    expect(primitive._sourceRenderToViewQuaternion).not.toEqual(formalRotation);
    expect(controller._renderTransformNeedsRestore).toBe(true);
    expect(controller._view).toBe(formalView);
    expect(controller._observation).toBe(formalObservation);
    expect(controller._viewGeneration).toBe(generation);
    expect(controller._orderingViewGeneration).toBe(orderingGeneration);
    expect(controller._content).toBe(content);
    expect(controller._evaluatedPlanKey).toBe("formal-plan");
    expect(controller._statistics.lastFrameGpuUploadBytes).toBe(123);
    expect(controller._statistics.gpuUploadBytes).toBe(456);
    expect(controller._loader.update).not.toHaveBeenCalled();
    expect(controller._d3.update).not.toHaveBeenCalled();
    expect(controller._d3.requestOrderingRefresh).not.toHaveBeenCalled();
    expect(controller._observeView).not.toHaveBeenCalled();
    expect(controller._bindPages).not.toHaveBeenCalled();
    expect(controller._advanceOrdering).not.toHaveBeenCalled();
    expect(controller._planLatestView).not.toHaveBeenCalled();

    // The render camera itself never moved, so viewChanged returns false.
    expect(observe()).toBe(false);
    expect(primitive._viewOriginLocal).toEqual(formalOrigin);
    expect(primitive._sourceRenderToViewQuaternion).toEqual(formalRotation);
    expect(controller._renderTransformNeedsRestore).toBe(false);
    expect(controller._view).toBe(formalView);
    expect(controller._viewGeneration).toBe(generation);
    expect(controller._evaluatedPlanKey).toBe("formal-plan");
  });

  it("pick isolation: submits once per command list and resubmits after a same-frame reset", function () {
    const { controller, frameState } = observeViewHarness();
    const command = {};
    const otherCommand = {};
    controller._d3.current.command = command;
    controller._commandTransformGeneration = controller._transformGeneration;
    frameState.passes.render = false;
    frameState.passes.pick = true;
    frameState.passes.depth = true;
    frameState.commandList.push(otherCommand);

    controller.update(frameState);
    controller.update(frameState);
    expect(frameState.commandList).toEqual([otherCommand, command]);
    frameState.commandList.length = 0;
    controller.update(frameState);
    expect(frameState.commandList).toEqual([command]);

    frameState.commandList = [];
    controller._d3.current = undefined;
    controller.update(frameState);
    expect(frameState.commandList).toEqual([]);
  });

  it("pick isolation: preserves failure and destroy cleanup priority", function () {
    for (const kind of ["failure", "destroy", "cleanup"]) {
      const { controller, frameState } = observeViewHarness();
      frameState.passes.render = false;
      frameState.passes.pick = true;
      frameState.passes.depth = true;
      spyOn(controller, "_updateRenderTransform");
      spyOn(controller, "_publish");
      spyOn(controller, "_advanceDestroy");
      spyOn(controller, "_advanceCleanup");
      if (kind === "failure") {
        controller._failureCleanupRequested = true;
      } else {
        controller._destroyRequested = true;
        if (kind === "cleanup") {
          controller._cleanup = { targetState: "READY" };
        }
      }

      controller.update(frameState);

      expect(controller._updateRenderTransform).not.toHaveBeenCalled();
      expect(controller._publish).not.toHaveBeenCalled();
      if (kind === "cleanup") {
        expect(controller._cleanup.targetState).toBe("DESTROY");
        expect(controller._advanceCleanup).toHaveBeenCalledOnceWith();
        expect(controller._advanceDestroy).not.toHaveBeenCalled();
      } else {
        expect(controller._advanceDestroy).toHaveBeenCalledOnceWith(
          ...(kind === "failure" ? [true] : []),
        );
        expect(controller._advanceCleanup).not.toHaveBeenCalled();
      }
    }
  });

  it("ordering input: observes direction, FoV and viewport without refreshing same-center content", function () {
    const { controller, context, camera, observe } = observeViewHarness();
    const content = controller._content;
    const owners = { ...content };
    const center = controller._view.cameraPositionScene;
    const orderingGeneration = controller._orderingViewGeneration;
    const initialRotation = Quaternion.clone(
      controller._primitive._sourceRenderToViewQuaternion,
    );
    for (const change of [
      () => camera.lookRight(0.1),
      () => {
        camera.frustum.fov *= 0.8;
      },
      () => {
        context.drawingBufferWidth += 10;
        context.drawingBufferHeight += 10;
      },
    ]) {
      const previousView = controller._view;
      const previousGeneration = controller._viewGeneration;
      controller._evaluatedPlanKey = "previous-plan";
      change();
      expect(observe()).toBe(true);
      expect(controller._view).not.toBe(previousView);
      expect(controller._viewGeneration).toBe(previousGeneration + 1);
      expect(controller._statistics.viewGeneration).toBe(
        previousGeneration + 1,
      );
      expect(controller._view.cameraPositionScene).toEqual(center);
      expect(controller._orderingViewGeneration).toBe(orderingGeneration);
      expect(controller._statistics.orderingViewGeneration).toBe(
        orderingGeneration,
      );
      expect(controller._evaluatedPlanKey).toBeUndefined();
      expect(controller._requestLatestOrdering()).toBe(false);
      expect(controller._contentMatchesTransform()).toBe(true);
      expect(content.viewGeneration).toBe(owners.viewGeneration);
    }
    expect(controller._createLatestViewPlan).not.toHaveBeenCalled();
    expect(controller._d3.requestOrderingRefresh).not.toHaveBeenCalled();
    expect(controller._d3.refreshContentView).not.toHaveBeenCalled();
    expect(controller._content).toBe(content);
    for (const field of [
      "work",
      "plan",
      "preparationOwner",
      "acceptedIds",
      "boundIds",
      "ticket",
    ]) {
      expect(content[field]).toBe(owners[field]);
    }
    expect(controller._primitive._sourceRenderToViewQuaternion).not.toEqual(
      initialRotation,
    );
    expect(controller._view.drawingBufferWidth).toBe(110);
    expect(controller._view.drawingBufferHeight).toBe(110);
  });

  it("ordering input: reorders for each position component and A-B-A return", function () {
    const { controller, camera, observe } = observeViewHarness();
    const initialPosition = Cartesian3.clone(camera.position);
    controller._content = undefined;
    for (const component of ["x", "y", "z"]) {
      for (const delta of [0.01, 0]) {
        const previousGeneration = controller._orderingViewGeneration;
        camera.position[component] = initialPosition[component] + delta;
        expect(observe()).toBe(true);
        const generation = controller._viewGeneration;
        expect(controller._orderingViewGeneration).toBe(generation);
        expect(generation).toBeGreaterThan(previousGeneration);
        expect(controller._requestLatestOrdering()).toBe(true);
        expect(
          controller._d3.requestOrderingRefresh.calls.mostRecent().args,
        ).toEqual([
          {
            viewGeneration: generation,
            sortCenter: controller._view.cameraPositionScene,
          },
        ]);
        expect(controller._requestLatestOrdering()).toBe(false);
        controller._orderingActive = false;
        controller._d3.currentViewGeneration = generation;
      }
    }
    expect(controller._d3.refreshContentView).not.toHaveBeenCalled();
    expect(controller._d3.requestOrderingRefresh.calls.count()).toBe(6);
  });

  it("ordering input: invalidates ordering after a transform with unchanged local center", function () {
    const { controller, observe } = observeViewHarness(
      new Cartesian3(0, 0, 10),
    );
    const center = controller._view.cameraPositionScene;
    const previousGeneration = controller._orderingViewGeneration;
    const rotation = Matrix4.fromRotationTranslation(
      Matrix3.fromRotationZ(Math.PI / 2),
      Cartesian3.ZERO,
    );
    Matrix4.clone(rotation, controller._primitive._modelMatrix);
    Matrix4.clone(rotation, controller._primitive._effectiveModelMatrix);
    controller.transformChanged();
    expect(observe()).toBe(true);
    expect(controller._view.cameraPositionScene).toEqual(center);
    expect(controller._orderingViewGeneration).toBe(controller._viewGeneration);
    expect(controller._orderingViewGeneration).toBeGreaterThan(
      previousGeneration,
    );
    expect(controller._contentMatchesTransform()).toBe(false);
    expect(controller._createLatestViewPlan).not.toHaveBeenCalled();
    expect(controller._d3.refreshContentView).not.toHaveBeenCalled();
    controller._content = undefined;
    expect(controller._requestLatestOrdering()).toBe(true);
  });

  it("ordering input: retains exact content and preparation owners across center changes", function () {
    for (const phase of ["PAGES", "PRESENTATION"]) {
      const { controller } = contentViewHarness(phase);
      const content = controller._content;
      const owners = { ...content };
      expect(controller._contentMatchesTransform()).toBe(true);
      expect(controller._content).toBe(content);
      expect(content.viewGeneration).toBe(owners.viewGeneration);
      for (const field of [
        "work",
        "plan",
        "preparationOwner",
        "acceptedIds",
        "boundIds",
        "ticket",
      ]) {
        expect(content[field]).toBe(owners[field]);
      }
      expect(controller._d3.refreshContentView).not.toHaveBeenCalled();
      expect(controller._contentMatchesTransform()).toBe(true);
      expect(controller._createLatestViewPlan).not.toHaveBeenCalled();
    }
  });

  it("motion progress: retains admitted content when the desired cut changes, but rejects model edits", function () {
    for (const field of [
      "coverageNodeIndices",
      "providerRepresentationIds",
      "providerRangeStarts",
      "providerRangeCounts",
      "maximumSelectedSplats",
      "selectedSplatCount",
      "activeSlotCount",
      "artifactIdentityHex",
    ]) {
      const { controller, cut, plan } = contentViewHarness();
      controller._orderingViewGeneration = 1;
      const target = { ...cut };
      if (cut[field] instanceof Uint32Array) {
        target[field] = cut[field].slice();
        target[field][0]++;
      } else {
        target[field] = `${cut[field]}-changed`;
      }
      plan.targetCutAt = () => target;
      expect(controller._contentMatchesTransform()).toBe(true);
      expect(controller._content.viewGeneration).toBe(1);
      expect(controller._createLatestViewPlan).not.toHaveBeenCalled();
      expect(controller._d3.refreshContentView).not.toHaveBeenCalled();
    }
    const { controller } = contentViewHarness();
    controller._transformGeneration++;
    expect(controller._contentMatchesTransform()).toBe(false);
    expect(controller._createLatestViewPlan).not.toHaveBeenCalled();
  });

  it("motion progress: finishes each admitted sort and coalesces continuous motion to the latest center", function () {
    const { controller, camera, observe } = observeViewHarness();
    controller._content = undefined;
    controller._options = {
      maximumTextureUploadsPerFrame: 1,
      maximumSortPositionExtractionsPerFrame: 1,
    };
    controller._statistics.orderingPublications = 0;
    let pending;
    let remaining;
    controller._d3.requestOrderingRefresh.and.callFake((request) => {
      expect(pending).toBeUndefined();
      pending = request;
      remaining = 3;
    });
    controller._d3.advanceOrderingRefresh = () => {
      if (--remaining > 0) {
        return { ready: false };
      }
      controller._d3.currentViewGeneration = pending.viewGeneration;
      pending = undefined;
      return { ready: true };
    };
    for (let frame = 0; frame < 12; frame++) {
      camera.position.x += 0.1;
      observe();
      controller._requestLatestOrdering();
      controller._advanceOrdering();
    }
    expect(controller._statistics.orderingPublications).toBe(4);
    expect(controller._d3.requestOrderingRefresh.calls.count()).toBe(4);
    // Stopping motion must still flush the one latest view, with no queued
    // intermediate centers and no dependence on another camera event.
    expect(controller._requestLatestOrdering()).toBe(true);
    expect(pending).toEqual({
      viewGeneration: controller._orderingViewGeneration,
      sortCenter: controller._view.cameraPositionScene,
    });
    for (let frame = 0; frame < 3; frame++) {
      controller._advanceOrdering();
    }
    expect(controller._d3.currentViewGeneration).toBe(
      controller._orderingViewGeneration,
    );
    expect(controller._requestLatestOrdering()).toBe(false);
  });

  it("motion progress: gives prepared content and checkpoints a publication window", function () {
    for (const checkpoint of [false, true]) {
      const { controller, camera, observe } = observeViewHarness();
      const content = controller._content;
      if (checkpoint) {
        controller._content = { ...content, phase: "PAGES" };
        controller._checkpoint = content;
      }
      for (let frame = 0; frame < 12; frame++) {
        camera.position.x += 0.1;
        observe();
        expect(controller._requestLatestOrdering()).toBe(false);
        expect(controller._contentMatchesTransform()).toBe(true);
      }
      expect(controller._d3.requestOrderingRefresh).not.toHaveBeenCalled();
      expect(controller._d3.refreshContentView).not.toHaveBeenCalled();
      expect(controller._createLatestViewPlan).not.toHaveBeenCalled();
      controller._content = undefined;
      controller._checkpoint = undefined;
      expect(controller._requestLatestOrdering()).toBe(true);
      expect(controller._d3.requestOrderingRefresh).toHaveBeenCalledOnceWith({
        viewGeneration: controller._orderingViewGeneration,
        sortCenter: controller._view.cameraPositionScene,
      });
    }
  });

  it("defers compatible content commit until current Ordering refresh settles", function () {
    const { controller } = contentViewHarness("PRESENTATION");
    controller._options = { maximumTextureUploadsPerFrame: 1 };
    controller._orderingActive = true;
    controller._d3.advance = jasmine.createSpy("advance").and.returnValue({
      ready: true,
      receipt: {},
    });
    controller._d2 = { commitPresentation: jasmine.createSpy("commit") };
    const content = controller._content;
    controller._advanceContent();
    expect(controller._d3.advance).toHaveBeenCalled();
    expect(controller._d2.commitPresentation).not.toHaveBeenCalled();
    expect(controller._content).toBe(content);
  });

  it("presentation handoff: advances once in the preparation frame with unchanged upload and commit gates", function () {
    for (const [maximumTextureUploads, ready, orderingActive] of [
      [0, false, false],
      [1, false, false],
      [0, true, true],
      [1, true, true],
      [1, true, false],
    ]) {
      const { controller, cut } = contentViewHarness();
      const content = controller._content;
      const ticket = {};
      const receipt = {};
      controller._options = {
        maximumMappingEntriesPerFrame: 4,
        maximumTextureUploadsPerFrame: 1,
        maximumSortPositionExtractionsPerFrame: 2,
      };
      controller._statistics = { contentPublications: 0 };
      controller._orderingActive = orderingActive;
      controller._d3.advance = jasmine.createSpy("advance").and.returnValue({
        ready,
        receipt,
      });
      controller._d2 = {
        commitPresentation: jasmine.createSpy("commit").and.returnValue({
          presentation: { presentation: { cut, ownership: {} } },
        }),
        currentPhysicalSnapshot: {},
      };
      spyOn(controller, "_prepareContent").and.callFake(() => {
        content.ticket = ticket;
        content.phase = "PRESENTATION";
      });

      controller._advanceContent(maximumTextureUploads);

      expect(controller._prepareContent).toHaveBeenCalledOnceWith(content);
      expect(controller._d3.advance).toHaveBeenCalledOnceWith(ticket, {
        maximumMappingEntries: 4,
        maximumTextureUploads,
        maximumPositionExtractions: 2,
      });
      if (ready && !orderingActive) {
        expect(controller._d2.commitPresentation).toHaveBeenCalledOnceWith(
          content.work,
          receipt,
        );
        expect(controller._content).toBeUndefined();
        expect(controller._statistics.contentPublications).toBe(1);
      } else {
        expect(controller._d2.commitPresentation).not.toHaveBeenCalled();
        expect(controller._content).toBe(content);
      }
    }
  });

  it("presentation handoff: does not advance pending, cleaning or replaced preparation owners", function () {
    for (const outcome of ["pending", "cleanup", "replaced", "removed"]) {
      const { controller } = contentViewHarness();
      const content = controller._content;
      controller._options = { maximumTextureUploadsPerFrame: 1 };
      controller._d3.advance = jasmine.createSpy("advance");
      controller._d2 = { commitPresentation: jasmine.createSpy("commit") };
      spyOn(controller, "_prepareContent").and.callFake(() => {
        if (outcome === "pending") {
          return;
        }
        content.ticket = {};
        content.phase = "PRESENTATION";
        if (outcome === "cleanup") {
          controller._cleanup = { operation: "ABORT" };
        } else if (outcome === "replaced") {
          controller._content = { ...content, ticket: {} };
        } else {
          controller._content = undefined;
        }
      });

      controller._advanceContent();

      expect(controller._prepareContent).toHaveBeenCalledOnceWith(content);
      expect(controller._d3.advance).not.toHaveBeenCalled();
      expect(controller._d2.commitPresentation).not.toHaveBeenCalled();
    }
  });

  function sharedFrameBudgetHarness() {
    const { controller } = contentViewHarness("PRESENTATION");
    controller._content.viewGeneration = controller._viewGeneration;
    controller._phase = "TRANSITION_WORK";
    controller._index = {};
    controller._timingOrigin = performance.now();
    controller._options = {
      maximumGpuFeedBytesPerFrame: 100,
      maximumTextureUploadsPerFrame: 2,
      maximumSortPositionExtractionsPerFrame: 1,
    };
    controller._statistics = {
      gpuUploadBytes: 7,
      maximumFrameGpuUploadBytes: 20,
      lastFrameGpuUploadBytes: 99,
      orderingPublications: 0,
    };
    controller._loader = { update() {} };
    controller._d3.current = {};
    controller._d3.statistics = {};
    controller._d3.update = jasmine.createSpy("update");
    for (const name of [
      "_observeView",
      "_consumePageWorkSettlements",
      "_acceptCompletions",
      "_requestLatestOrdering",
      "_bindPages",
      "_advanceContent",
      "_advanceRetirement",
      "_advanceCleanup",
      "_planLatestView",
      "_publish",
      "_fail",
    ]) {
      spyOn(controller, name).and.stub();
    }
    return controller;
  }

  function farOrderingHarness() {
    const controller = sharedFrameBudgetHarness();
    controller._content = undefined;
    controller._phase = "READY";
    controller._state = "DRAWABLE";
    controller._planMetrics = {};
    controller._loader.statistics = { receivedBytes: 0 };
    controller._primitive = primitiveState();
    controller._sourceBoundingSphere = new BoundingSphere(Cartesian3.ZERO, 10);
    controller._d3.current = { command: {}, presentation: {} };
    controller._d3.currentViewGeneration = 1;
    controller._orderingRequestedViewGeneration = 1;
    controller._d3.requestOrderingRefresh = jasmine.createSpy(
      "requestOrderingRefresh",
    );
    controller._d3.advanceOrderingRefresh = jasmine
      .createSpy("advanceOrderingRefresh")
      .and.returnValue({ ready: false });
    controller._requestLatestOrdering.and.callThrough();
    controller._publish.and.callThrough();
    return controller;
  }

  function changeSortCenter(controller, center) {
    controller._viewGeneration++;
    controller._orderingViewGeneration = controller._viewGeneration;
    controller._view = Object.freeze({
      ...controller._view,
      cameraPositionScene: Object.freeze([...center]),
    });
  }

  it("far sorting: checks rounded millimetres, all corner axes and Float32 position bounds", function () {
    const { isSortCenterInRange } = gaussianSegmentedRuntimeControllerSpecHooks;
    const point = new Float64Array(6);
    expect(isSortCenterInRange(point, [2147483.648, 0, 0])).toBe(true);
    expect(isSortCenterInRange(point, [2147483.6484, 0, 0])).toBe(true);
    expect(isSortCenterInRange(point, [2147483.6486, 0, 0])).toBe(false);
    expect(isSortCenterInRange(point, [-2147483.649, 0, 0])).toBe(false);
    expect(isSortCenterInRange(point, [0, 2147483.649, 0])).toBe(false);
    expect(isSortCenterInRange(point, [0, 0, 2147483.649])).toBe(false);
    expect(isSortCenterInRange(point, [1500000, 1500000, 0])).toBe(true);
    expect(isSortCenterInRange(point, [1500000, 1500000, 1500000])).toBe(false);
    const bounds = new Float64Array([0, 0, 0, 100, 200, 300]);
    expect(isSortCenterInRange(bounds, [-2147483.64, 0, 0])).toBe(false);
    expect(isSortCenterInRange(bounds, [2147483.6, 100, 150])).toBe(true);
    // The Worker reads Float32 positions; rounding the positive endpoint up
    // crosses the limit even though the source Float64 endpoint still fits.
    const rounded = new Float64Array([16777217.1, 0, 0, 16777217.1, 0, 0]);
    expect(isSortCenterInRange(rounded, [14629734.3514, 0, 0])).toBe(false);
  });

  it("far sorting: handles the reported camera, translated scenes and non-finite values", function () {
    const { isSortCenterInRange } = gaussianSegmentedRuntimeControllerSpecHooks;
    const bounds = new Float64Array([
      -64.19989013671875,
      -Math.fround(89.01529),
      -1.420487403869629,
      56.52621841430664,
      30.8549747467041,
      27.519718170166016,
    ]);
    expect(
      isSortCenterInRange(
        bounds,
        [-1201771.6108633932, -503579.535870912, 5772354.006254301],
      ),
    ).toBe(false);
    expect(isSortCenterInRange(bounds, [44, 5, 25])).toBe(true);
    const shift = 2 ** 30;
    const translated = new Float64Array([
      shift,
      shift,
      shift,
      shift + 256,
      shift + 256,
      shift + 256,
    ]);
    expect(
      isSortCenterInRange(translated, [shift + 128, shift + 128, shift + 128]),
    ).toBe(true);
    for (const invalid of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
      for (let axis = 0; axis < 3; axis++) {
        const center = [0, 0, 0];
        center[axis] = invalid;
        expect(isSortCenterInRange(bounds, center)).toBe(false);
      }
      for (let endpoint = 0; endpoint < 6; endpoint++) {
        const invalidBounds = bounds.slice();
        invalidBounds[endpoint] = invalid;
        expect(isSortCenterInRange(invalidBounds, [0, 0, 0])).toBe(false);
      }
    }
  });

  it("far sorting: keeps the current command across skipped updates and resumes at the latest near center", function () {
    const controller = farOrderingHarness();
    const current = controller._d3.current;
    const frameState = { passes: { render: true }, commandList: [] };
    changeSortCenter(controller, [6000000, 0, 0]);
    for (let frame = 0; frame < 2; frame++) {
      frameState.commandList.length = 0;
      controller.update(frameState);
      expect(frameState.commandList).toEqual([current.command]);
      expect(controller._d3.current).toBe(current);
      expect(controller._orderingRequestedViewGeneration).toBe(1);
      expect(controller._orderingActive).toBeUndefined();
      expect(controller.statistics.sortDeferredByDistance).toBe(true);
    }
    expect(controller._d3.requestOrderingRefresh).not.toHaveBeenCalled();
    expect(controller._d3.advanceOrderingRefresh).not.toHaveBeenCalled();
    expect(controller._fail).not.toHaveBeenCalled();
    expect(controller._state).toBe("DRAWABLE");
    changeSortCenter(controller, [45, 6, 26]);
    controller.update(frameState);
    expect(controller._d3.requestOrderingRefresh).toHaveBeenCalledOnceWith({
      viewGeneration: controller._orderingViewGeneration,
      sortCenter: controller._view.cameraPositionScene,
    });
    expect(controller._orderingActive).toBe(true);
    expect(controller.statistics.sortDeferredByDistance).toBe(false);
    expect(controller._d3.current).toBe(current);
    controller.update(frameState);
    expect(controller._d3.requestOrderingRefresh.calls.count()).toBe(1);
  });

  it("far sorting: completes an admitted near Ordering while the latest camera is far", function () {
    const controller = farOrderingHarness();
    const frameState = { passes: { render: true }, commandList: [] };
    expect(controller._requestLatestOrdering()).toBe(true);
    const admitted =
      controller._d3.requestOrderingRefresh.calls.mostRecent().args[0];
    changeSortCenter(controller, [6000000, 0, 0]);
    controller.update(frameState);
    expect(controller._d3.advanceOrderingRefresh.calls.count()).toBe(1);
    expect(controller._orderingActive).toBe(true);
    controller._d3.advanceOrderingRefresh.and.callFake(() => {
      controller._d3.currentViewGeneration = admitted.viewGeneration;
      return { ready: true };
    });
    controller.update(frameState);
    expect(controller._orderingActive).toBe(false);
    expect(controller._statistics.orderingPublications).toBe(1);
    expect(controller._d3.currentViewGeneration).toBe(admitted.viewGeneration);
    expect(controller._d3.currentViewGeneration).toBeLessThan(
      controller._orderingViewGeneration,
    );
    expect(controller._d3.requestOrderingRefresh.calls.count()).toBe(1);
    changeSortCenter(controller, [46, 5, 25]);
    controller.update(frameState);
    expect(controller._d3.requestOrderingRefresh.calls.count()).toBe(2);
    expect(
      controller._d3.requestOrderingRefresh.calls.mostRecent().args[0]
        .sortCenter,
    ).toEqual([46, 5, 25]);
    expect(controller._fail).not.toHaveBeenCalled();
  });

  it("far sorting: preserves cleanup, failure cleanup and explicit destroy priority", function () {
    for (const operation of ["cleanup", "failure", "destroy"]) {
      const controller = farOrderingHarness();
      changeSortCenter(controller, [6000000, 0, 0]);
      const advanceDestroy = spyOn(controller, "_advanceDestroy").and.stub();
      if (operation === "cleanup") {
        controller._cleanup = { targetState: "READY" };
      } else if (operation === "failure") {
        controller._failureCleanupRequested = true;
      } else {
        controller._destroyRequested = true;
      }
      const frameState = { passes: { render: true }, commandList: [] };
      controller.update(frameState);
      if (operation === "cleanup") {
        expect(controller._advanceCleanup).toHaveBeenCalledTimes(1);
        expect(frameState.commandList).toEqual([
          controller._d3.current.command,
        ]);
        expect(controller._d3.update).toHaveBeenCalledTimes(1);
      } else {
        expect(advanceDestroy.calls.count()).toBe(1);
        expect(advanceDestroy.calls.mostRecent().args).toEqual(
          operation === "failure" ? [true] : [],
        );
      }
      expect(controller._d3.requestOrderingRefresh).not.toHaveBeenCalled();
      expect(controller._fail).not.toHaveBeenCalled();
    }
  });

  it("far sorting: observes a real camera returning near without recreating the current owner", function () {
    const { controller, camera, observe } = observeViewHarness();
    controller._content = undefined;
    const current = controller._d3.current;
    const nearPosition = Cartesian3.clone(camera.position);
    const requestedGeneration = controller._orderingRequestedViewGeneration;
    Cartesian3.fromElements(
      -1201771.6108633932,
      -503579.535870912,
      5772354.006254301,
      camera.position,
    );
    expect(observe()).toBe(true);
    expect(controller._requestLatestOrdering()).toBe(false);
    expect(observe()).toBe(false);
    expect(controller._requestLatestOrdering()).toBe(false);
    expect(controller._d3.requestOrderingRefresh).not.toHaveBeenCalled();
    expect(controller._orderingRequestedViewGeneration).toBe(
      requestedGeneration,
    );
    Cartesian3.clone(nearPosition, camera.position);
    expect(observe()).toBe(true);
    expect(controller._requestLatestOrdering()).toBe(true);
    expect(controller._d3.requestOrderingRefresh).toHaveBeenCalledOnceWith({
      viewGeneration: controller._orderingViewGeneration,
      sortCenter: controller._view.cameraPositionScene,
    });
    expect(controller._d3.current).toBe(current);
  });

  it("scalar diagnostics: updates counters and ordering without reading full statistics", function () {
    const controller = sharedFrameBudgetHarness();
    controller._content = undefined;
    controller._d3.currentViewGeneration = 1;
    controller._d3.copiedSplats = 123;
    controller._d3.uploadedResources = 7;
    controller._d3.requestOrderingRefresh = jasmine.createSpy(
      "requestOrderingRefresh",
    );
    Object.defineProperty(controller._d3, "statistics", {
      get() {
        throw new Error("Full presentation statistics are diagnostic-only");
      },
    });
    controller._requestLatestOrdering.and.callThrough();
    spyOn(controller, "_advanceOrdering").and.stub();

    controller.update({});

    expect(controller._fail).not.toHaveBeenCalled();
    expect(controller._statistics.copiedSplats).toBe(123);
    expect(controller._statistics.textureUploads).toBe(7);
    expect(controller._d3.requestOrderingRefresh).toHaveBeenCalledOnceWith({
      viewGeneration: controller._orderingViewGeneration,
      sortCenter: controller._view.cameraPositionScene,
    });
    expect(controller._requestLatestOrdering.calls.count()).toBe(2);

    controller._d3.currentViewGeneration = controller._orderingViewGeneration;
    controller._orderingRequestedViewGeneration = 0;
    controller._d3.copiedSplats = 321;
    controller._d3.uploadedResources = 8;
    controller.update({});

    expect(controller._fail).not.toHaveBeenCalled();
    expect(controller._statistics.copiedSplats).toBe(321);
    expect(controller._statistics.textureUploads).toBe(8);
    expect(controller._d3.requestOrderingRefresh.calls.count()).toBe(1);
  });

  function checkpointPlannerHarness() {
    const controller = Object.create(
      _SceneGISGaussianSegmentedRuntimeController.prototype,
    );
    const index = checkpointRuntimeIndex();
    const view = refinementView();
    const policy = {
      maximumSelectedSplats: 1000000,
      maximumCoverageSlots: 1000,
      refineErrorPixels: 0.0001,
      coarsenErrorPixels: 0,
      minimumLeafLogicalLevel: 0,
    };
    const current = createSegmentedActiveCut(index, policy);
    const finalPlan = planSegmentedConvergedActiveCut(
      index,
      current,
      view,
      policy,
    );
    const currentIds = [
      ...new Set(
        projectSegmentedAssetIntervals(index, current).fragmentCorePageIds,
      ),
    ];
    const finalIds = [
      ...new Set(
        projectSegmentedAssetIntervals(index, finalPlan.finalCut)
          .fragmentCorePageIds,
      ),
    ];
    function snapshot(pageIds, generation) {
      const ids = Uint32Array.from([...pageIds].sort((a, b) => a - b));
      const stored = new Float64Array(ids.length);
      const gpuBytes = new Float64Array(ids.length);
      const provenance = new Float64Array(ids.length * 7);
      const page = new Float64Array(11);
      for (let i = 0; i < ids.length; i++) {
        index.readPage(ids[i], page);
        stored[i] = page[8];
        gpuBytes[i] = computeSegmentedAtlasPageFootprint(
          page[2],
          page[4],
          index.maxShDegree,
        ).uploadBytes;
        provenance.set(
          [page[6], page[7], page[8], page[9], page[10], page[3], page[4]],
          i * 7,
        );
      }
      return createSegmentedAssetPagePhysicalSnapshot(index, {
        cpuPageIds: ids,
        cpuStoredBytes: stored,
        cpuPageProvenance: provenance,
        gpuPageIds: ids,
        gpuRawBytes: gpuBytes,
        gpuPageProvenance: provenance,
        cpuGeneration: generation,
        gpuGeneration: generation,
        leaseIdentity: "checkpoint-controller",
      });
    }
    controller._index = index;
    controller._sortBounds = index.readNodeContentBounds(
      index.rootNodeIndex,
      new Float64Array(6),
    );
    controller._view = view;
    controller._currentCut = current;
    controller._currentSnapshot = snapshot(currentIds, 1);
    controller._pageLimits = {
      maximumCpuPageBytes: 10000000,
      replacementCpuEscrowBytes: 5000000,
      maximumGpuPageBytes: 10000000,
      replacementGpuEscrowBytes: 5000000,
    };
    const bootstrap = planSegmentedAssetPageBootstrap(
      index,
      current,
      snapshot([], 0),
      controller._pageLimits,
    );
    controller._currentOwnership = commitSegmentedAssetPageBootstrap(
      index,
      bootstrap,
      controller._currentSnapshot,
      true,
    ).ownership;
    controller._presentationLimits = {
      maximumSelectedSplats: 1000000,
      maximumCoverageSlots: 1000,
      maximumTextureSize: 4096,
      maximumTextureArrayLayers: 256,
      maximumCpuBytes: 100000000,
      maximumGpuBytes: 100000000,
    };
    controller._viewGeneration = 1;
    controller._orderingViewGeneration = 1;
    controller._transformGeneration = 1;
    controller._timingOrigin = 1000;
    controller._statistics = {
      demandedPages: 0,
      checkpointAttempts: 0,
      checkpointBridgeBytes: 0,
    };
    controller._gpuLedger = {
      _pages: new Map(currentIds.map((id) => [id, {}])),
    };
    controller._d2 = {
      currentPageIds: currentIds,
      currentPresentationIdentity: "checkpoint-bootstrap",
      cleanupDebtTokens: [],
      beginTransitionWork: jasmine
        .createSpy("begin final work")
        .and.callFake(() => ({ state: "LOADING" })),
      requestRequiredPages: jasmine
        .createSpy("request final pages")
        .and.callFake(() => finalIds),
      beginCheckpointWork: jasmine
        .createSpy("begin child work")
        .and.callFake(() => ({ state: "GPU_READY" })),
      finalizeRetirement(work) {
        work.state = "RETIRED";
      },
      rebaseAcquisitionWork: jasmine.createSpy("rebase final work"),
    };
    expect(controller._startTransition(finalPlan)).toBe(true);
    const parent = controller._content;
    const readyIds = new Set([
      ...currentIds,
      ...parent.bridgePlan.requiredCorePageIds,
      finalIds[0],
    ]);
    parent.boundIds = new Set(readyIds);
    const readySnapshot = snapshot(readyIds, 2);
    controller._d2.capturePhysicalSnapshot = jasmine
      .createSpy("capture ready pages")
      .and.returnValue(readySnapshot);
    controller._sorter = {
      _confirmed: new Map([...readyIds].map((id) => [id, {}])),
    };
    return { controller, parent, finalPlan, readySnapshot, snapshot };
  }

  it("far sorting: retains ready Pages without a ticket and prepares once with the latest near center", function () {
    const { controller, parent, snapshot } = checkpointPlannerHarness();
    const readySnapshot = snapshot(
      new Set([...controller._currentSnapshot.cpuPageIds, ...parent.coreIds]),
      2,
    );
    const ticket = {};
    const originalPlan = parent.plan;
    const originalWork = parent.work;
    parent.work.state = "GPU_READY";
    controller._statistics.contentPublications = 1;
    controller._d2.capturePhysicalSnapshot.and.returnValue(readySnapshot);
    controller._d2.rebindTargetPages = jasmine
      .createSpy("rebindTargetPages")
      .and.returnValue(readySnapshot);
    controller._d2.preparePresentation = jasmine
      .createSpy("preparePresentation")
      .and.callFake((work) => {
        work.presentationDescription = parent.reservation;
        return ticket;
      });
    changeSortCenter(controller, [6000000, 0, 0]);
    controller._prepareContent();
    controller._prepareContent();
    expect(parent.phase).toBe("PAGES");
    expect(parent.ticket).toBeUndefined();
    expect(parent.plan).toBe(originalPlan);
    expect(parent.work).toBe(originalWork);
    expect(controller._d2.capturePhysicalSnapshot).not.toHaveBeenCalled();
    expect(controller._d2.preparePresentation).not.toHaveBeenCalled();
    expect(controller._cleanup).toBeUndefined();
    expect(controller._phase).not.toBe("FAILED");
    changeSortCenter(controller, [47, 8, 27]);
    controller._prepareContent();
    controller._prepareContent();
    expect(parent.phase).toBe("PRESENTATION");
    expect(parent.ticket).toBe(ticket);
    expect(parent.plan).toBe(originalPlan);
    expect(parent.work).toBe(originalWork);
    expect(controller._d2.preparePresentation.calls.count()).toBe(1);
    const [work, input] =
      controller._d2.preparePresentation.calls.mostRecent().args;
    expect(work).toBe(originalWork);
    expect(input.sortCenter).toBe(controller._view.cameraPositionScene);
    expect(input.sortCenter).toEqual([47, 8, 27]);
    expect(input.viewGeneration).toBe(controller._orderingViewGeneration);
    controller._releasePureTransaction(parent);
  });

  it("progressive checkpoint: batches for 200 ms, skips complete final data and rebases the same work after its sole intermediate publication", function () {
    const now = spyOn(performance, "now");
    for (const finalReady of [true, false]) {
      now.and.returnValue(1000);
      const { controller, parent, finalPlan, readySnapshot } =
        checkpointPlannerHarness();
      const originalWork = parent.work;
      const originalCoreIds = parent.coreIds;
      if (finalReady) {
        parent.boundIds = new Set(parent.coreIds);
      }
      now.and.returnValue(1199);
      controller._maybeStartCheckpoint();
      expect(controller._d2.capturePhysicalSnapshot).not.toHaveBeenCalled();
      now.and.returnValue(1200);
      controller._maybeStartCheckpoint();
      if (finalReady) {
        expect(controller._checkpoint).toBeUndefined();
        expect(controller._statistics.checkpointAttempts).toBe(0);
        controller._releasePureTransaction(parent);
        continue;
      }
      const child = controller._checkpoint;
      expect(child.checkpointCoreContent).toBe(parent);
      expect(parent.work).toBe(originalWork);
      expect(parent.pureTransactionReleased).toBe(true);
      expect(controller._statistics.checkpointAttempts).toBe(1);
      expect(controller._d2.beginCheckpointWork.calls.count()).toBe(1);
      const prepared = prepareSegmentedConvergedAssetPagePublication(
        controller._index,
        controller._currentCut,
        controller._currentOwnership,
        child.convergedPlan,
        child.plan,
        readySnapshot,
      );
      const committed = finalizeSegmentedAssetPagePublication(
        controller._index,
        prepared,
        readySnapshot,
      );
      controller._currentCut = committed.cut;
      controller._currentOwnership = committed.ownership;
      child.phase = "RETIRING";
      const oldTransition = parent.plan;
      const rebase = controller._d2.rebaseAcquisitionWork;
      rebase.and.throwError("injected D2 rebase failure");
      expect(() => controller._finishCheckpoint()).toThrowError(
        "injected D2 rebase failure",
      );
      const failedTransition = rebase.calls.mostRecent().args[1];
      expect(parent.plan).toBe(oldTransition);
      expect(parent.pureTransactionReleased).toBe(true);
      expect(controller._checkpoint).toBeUndefined();
      rebase.and.stub();
      rebase.calls.reset();
      // A second real plan against the same current ownership would fail if
      // the rejected transition still held the runtime's in-flight authority.
      controller._resumeFinalAcquisition();
      expect(parent.plan).not.toBe(failedTransition);
      expect(controller._checkpoint).toBeUndefined();
      expect(controller._content).toBe(parent);
      expect(parent.work).toBe(originalWork);
      expect(parent.convergedPlan.finalCut).toBe(finalPlan.finalCut);
      expect(parent.pureTransactionReleased).toBe(false);
      expect(controller._d2.rebaseAcquisitionWork).toHaveBeenCalledOnceWith(
        originalWork,
        parent.plan,
        originalCoreIds,
      );
      expect(controller._d2.requestRequiredPages.calls.count()).toBe(1);
      parent.boundIds.add(parent.finalCoreIds[1]);
      now.and.returnValue(5000);
      controller._maybeStartCheckpoint();
      expect(controller._d2.beginCheckpointWork.calls.count()).toBe(1);
      expect(controller._statistics.checkpointAttempts).toBe(1);
      controller._releasePureTransaction(parent);
    }
  });

  it("motion progress: publishes an intermediate cut using its original planning view after camera movement", function () {
    const now = spyOn(performance, "now").and.returnValue(1000);
    const { controller, parent, readySnapshot } = checkpointPlannerHarness();
    const originalView = parent.planningView;
    controller._view = {
      ...originalView,
      cameraPositionScene: [500, 20, 100],
      selectionEpochGeneration: 2,
    };
    controller._viewGeneration = 2;
    controller._orderingViewGeneration = 2;
    now.and.returnValue(1200);
    controller._maybeStartCheckpoint();
    const child = controller._checkpoint;
    expect(child).toBeDefined();
    expect(child.planningView).toBe(originalView);
    const prepared = prepareSegmentedConvergedAssetPagePublication(
      controller._index,
      controller._currentCut,
      controller._currentOwnership,
      child.convergedPlan,
      child.plan,
      readySnapshot,
    );
    const committed = finalizeSegmentedAssetPagePublication(
      controller._index,
      prepared,
      readySnapshot,
    );
    controller._currentCut = committed.cut;
    controller._currentOwnership = committed.ownership;
    child.phase = "RETIRING";
    controller._finishCheckpoint();
    expect(controller._content).toBe(parent);
    expect(parent.planningView).toBe(originalView);
    expect(controller._checkpoint).toBeUndefined();
    expect(controller._d2.requestRequiredPages.calls.count()).toBe(1);
    controller._releasePureTransaction(parent);
  });

  it("progressive checkpoint: keeps final delivery and Core preparation moving with the child's shared frame upload budget", function () {
    const controller = sharedFrameBudgetHarness();
    const parent = controller._content;
    const child = {
      kind: "TRANSITION",
      phase: "PRESENTATION",
      transformGeneration: controller._transformGeneration,
      viewGeneration: controller._viewGeneration,
      checkpointCoreContent: parent,
      ticket: {},
      work: { state: "PRESENTATION_PREPARED" },
    };
    parent.phase = "PAGES";
    parent.coreIds = [0, 1, 2];
    parent.finalCoreIds = parent.coreIds;
    parent.bindIds = Uint32Array.from(parent.coreIds);
    parent.bindCursor = 0;
    parent.acceptedIds = new Set([0]);
    parent.boundIds = new Set();
    parent.preparationOwner = {
      pages: [{ pageIndex: 0 }],
      sortResult: { receipts: [{}] },
    };
    controller._checkpoint = child;
    controller._options.maximumGpuFeedOperationsPerFrame = 1;
    controller._options.maximumGpuFeedBytesPerFrame = 16384;
    controller._index.maxShDegree = 0;
    Object.assign(controller._statistics, {
      bindInspections: 0,
      gpuPageFeedOperations: 0,
      gpuPageFeedBytes: 0,
      gpuPageFeedFrames: 0,
      maximumGpuFeedWorkMilliseconds: 0,
    });
    const completions = [{ page: { index: 1 } }];
    controller._loader.drainCompleted = () => completions.splice(0);
    controller._cache = {
      peek(index) {
        return { page: { index, splatCount: 1, semantic: 1, rawBytes: 32 } };
      },
    };
    const bound = new Map();
    controller._pageBackend = {
      retainedBindingReceipt(page) {
        return bound.get(page.index);
      },
      createBindingReceipt(page, receipt) {
        bound.set(page.index, receipt);
        return receipt;
      },
    };
    controller._d2 = {
      acceptPageWorkCompletion: jasmine
        .createSpy("accept")
        .and.returnValue(true),
      reserveAndBindGpuPage: jasmine.createSpy("bind"),
    };
    controller._d3.collectWorkerSettlements = jasmine.createSpy("collect");
    controller._d3.beginCorePreparation = jasmine.createSpy("begin final Core");
    controller._d3.releaseCorePreparation = (content) => {
      expect(content).toBe(parent);
      content.preparationOwner = undefined;
    };
    controller._d3.hasPreparedCore = (pageId) => pageId === 0;
    controller._d3.queueCorePreparation = jasmine
      .createSpy("queue final Core")
      .and.callFake((content, pageIds) => {
        expect(content).toBe(parent);
        content.preparationOwner = {
          pages: pageIds.map((pageIndex) => ({ pageIndex })),
        };
      });
    controller._d3.advance = jasmine
      .createSpy("advance checkpoint")
      .and.callFake((ticket, limits) => {
        expect(ticket).toBe(child.ticket);
        const budget = controller._bindPages.calls.mostRecent().args[0];
        expect(limits.textureUploadBudget).toBe(budget);
        expect(limits.maximumTextureUploads).toBe(budget.remainingUploads);
        budget.remainingBytes -= 1024;
        budget.remainingUploads--;
        return { ready: false };
      });
    controller._acceptCompletions.and.callThrough();
    controller._bindPages.and.callThrough();
    controller._advanceContent.and.callThrough();
    controller.update({});
    expect(
      controller._d2.acceptPageWorkCompletion.calls.mostRecent().args[0],
    ).toBe(parent.work);
    expect(parent.acceptedIds.has(1)).toBe(true);
    expect(parent.boundIds.has(0)).toBe(true);
    expect(controller._d3.queueCorePreparation).toHaveBeenCalledOnceWith(
      parent,
      [1],
    );
    expect(controller._statistics.lastFrameGpuUploadBytes).toBe(8192 + 1024);
    expect(controller._content).toBe(parent);
    expect(controller._checkpoint).toBe(child);
    completions.push({ page: { index: 2 } });
    controller.update({});
    expect(parent.acceptedIds.has(2)).toBe(true);
    expect(controller._acceptCompletions.calls.count()).toBe(2);
    expect(controller._bindPages.calls.count()).toBe(2);
    expect(controller._d3.advance.calls.count()).toBe(2);
    expect(controller._d3.queueCorePreparation.calls.count()).toBe(1);
    expect(controller._statistics.lastFrameGpuUploadBytes).toBe(1024);
    expect(controller._content).toBe(parent);
    expect(controller._fail).not.toHaveBeenCalled();
  });

  it("progressive checkpoint: view invalidation settles the child before canceling final Worker and Page owners", function () {
    const controller = sharedFrameBudgetHarness();
    const parent = controller._content;
    parent.pureTransactionReleased = true;
    parent.work.state = "LOADING";
    const child = {
      kind: "TRANSITION",
      phase: "PRESENTATION",
      checkpointCoreContent: parent,
      work: { state: "PRESENTATION_PREPARED" },
      ticket: {},
    };
    controller._checkpoint = child;
    const events = [];
    const debts = [];
    controller._d2 = {
      get cleanupDebtTokens() {
        return debts;
      },
      abortWork(work) {
        if (work === child.work) {
          events.push("abort-child");
          work.state = "ABORT_CLEANUP_DEBT";
          debts.push({});
        } else {
          expect(work).toBe(parent.work);
          events.push("abort-parent-pages");
          work.state = "ABORTED";
        }
      },
      settleCleanupDebt(token) {
        expect(token).toBe(debts[0]);
        events.push("settle-child");
        debts.shift();
        child.work.state = "ABORTED";
      },
    };
    let workerReady = false;
    controller._d3.abortCorePreparation = jasmine
      .createSpy("abort final Core")
      .and.callFake((content) => {
        expect(content).toBe(parent);
        events.push(workerReady ? "abort-parent-core" : "wait-parent-core");
        return workerReady;
      });
    spyOn(controller, "_releasePureTransaction").and.callFake((content) => {
      if (!content.pureTransactionReleased) {
        expect(content).toBe(child);
        events.push("release-child-pure");
        content.pureTransactionReleased = true;
      }
    });
    controller._advanceCleanup.and.callThrough();
    controller._transformGeneration++;
    controller.update({});
    expect(events).toEqual(["abort-child", "settle-child"]);
    expect(controller._d3.abortCorePreparation).not.toHaveBeenCalled();
    expect(parent.work.state).toBe("LOADING");
    expect(controller._cleanup.content).toBe(parent);
    controller.update({});
    expect(events).toEqual([
      "abort-child",
      "settle-child",
      "release-child-pure",
      "wait-parent-core",
    ]);
    expect(parent.work.state).toBe("LOADING");
    workerReady = true;
    controller.update({});
    expect(events.slice(-2)).toEqual([
      "abort-parent-core",
      "abort-parent-pages",
    ]);
    expect(controller._checkpoint).toBeUndefined();
    expect(controller._content).toBeUndefined();
    expect(controller._cleanup).toBeUndefined();
    expect(controller._phase).toBe("READY");
    expect(controller._bindPages).not.toHaveBeenCalled();
    expect(controller._fail).not.toHaveBeenCalled();
  });

  it("shared upload budget: gives ready current Ordering priority and leaves waiting Ordering quota available", function () {
    for (const orderingReady of [true, false]) {
      const controller = sharedFrameBudgetHarness();
      const events = [];
      let sharedBudget;
      controller._orderingActive = true;
      controller._d3.advanceOrderingRefresh = (limits) => {
        events.push("ordering");
        sharedBudget = limits.textureUploadBudget;
        expect(sharedBudget).toEqual({
          remainingBytes: 100,
          remainingUploads: 2,
        });
        if (orderingReady) {
          sharedBudget.remainingBytes -= 20;
          sharedBudget.remainingUploads--;
        }
        return { ready: orderingReady };
      };
      controller._bindPages.and.callFake((budget) => {
        events.push("core");
        expect(budget).toBe(sharedBudget);
        expect(budget.remainingBytes).toBe(orderingReady ? 80 : 100);
        budget.remainingBytes -= 30;
      });
      controller._advanceContent.and.callFake((uploads, budget) => {
        events.push("content");
        expect(budget).toBe(sharedBudget);
        expect(budget.remainingBytes).toBe(orderingReady ? 50 : 70);
        expect(uploads).toBe(orderingReady ? 1 : 2);
        expect(uploads).toBe(budget.remainingUploads);
        budget.remainingBytes -= 10;
        budget.remainingUploads--;
      });

      controller.update({});

      expect(events).toEqual(["ordering", "core", "content"]);
      expect(controller._orderingActive).toBe(!orderingReady);
      expect(controller._statistics.lastFrameGpuUploadBytes).toBe(
        orderingReady ? 60 : 40,
      );
      expect(controller._statistics.gpuUploadBytes).toBe(
        orderingReady ? 67 : 47,
      );
      expect(controller._fail).not.toHaveBeenCalled();
    }
  });

  it("shared upload budget: clears cleanup-frame bytes and accounts completed uploads when a later stage throws", function () {
    const cleanupController = sharedFrameBudgetHarness();
    cleanupController._cleanup = { operation: "ABORT" };
    cleanupController.update({});
    expect(cleanupController._advanceCleanup).toHaveBeenCalledOnceWith();
    expect(cleanupController._bindPages).not.toHaveBeenCalled();
    expect(cleanupController._statistics.lastFrameGpuUploadBytes).toBe(0);
    expect(cleanupController._statistics.gpuUploadBytes).toBe(7);
    expect(cleanupController._statistics.maximumFrameGpuUploadBytes).toBe(20);

    const failedController = sharedFrameBudgetHarness();
    const error = new Error("injected failure after an upload");
    failedController._bindPages.and.callFake((budget) => {
      budget.remainingBytes -= 30;
      throw error;
    });
    failedController.update({});
    expect(failedController._fail).toHaveBeenCalledOnceWith(error);
    expect(failedController._advanceContent).not.toHaveBeenCalled();
    expect(failedController._statistics.lastFrameGpuUploadBytes).toBe(30);
    expect(failedController._statistics.gpuUploadBytes).toBe(37);
    expect(failedController._statistics.maximumFrameGpuUploadBytes).toBe(30);
    expect(failedController._publish).toHaveBeenCalledOnceWith({});
  });

  it("motion progress: accepts Page completions across camera changes but cancels stale model work first", function () {
    for (const modelChanged of [false, true]) {
      const controller = sharedFrameBudgetHarness();
      const content = controller._content;
      controller._viewGeneration++;
      controller._orderingViewGeneration++;
      controller._transformGeneration += modelChanged ? 1 : 0;
      spyOn(controller, "_beginCleanup").and.callFake(() => {
        controller._cleanup = {};
        controller._content = undefined;
      });
      controller.update({});
      expect(controller._fail).not.toHaveBeenCalled();
      if (modelChanged) {
        expect(controller._beginCleanup).toHaveBeenCalledOnceWith(
          content,
          "ABORT",
          "READY",
        );
        expect(controller._advanceCleanup).toHaveBeenCalledOnceWith();
        expect(controller._acceptCompletions).not.toHaveBeenCalled();
      } else {
        expect(controller._beginCleanup).not.toHaveBeenCalled();
        expect(controller._acceptCompletions).toHaveBeenCalledOnceWith();
        expect(controller._advanceContent).toHaveBeenCalled();
        expect(controller._createLatestViewPlan).not.toHaveBeenCalled();
        expect(controller._content).toBe(content);
      }
      expect(controller._d3.refreshContentView).not.toHaveBeenCalled();
    }
  });

  it("warm residency: excludes evictable history from target admission without dropping the current positions", function () {
    const confirmed = new Map([
      [1, { pageIndex: 1, positionBytes: 120 }],
      [2, { pageIndex: 2, positionBytes: 240 }],
      [9, { pageIndex: 9, positionBytes: 100000000 }],
    ]);
    const controller = {
      _sorter: {
        _confirmed: confirmed,
        snapshot: { confirmedPositionBytes: 100000360, scratchBytes: 0 },
      },
      _d2: { currentPageIds: [1] },
      _index: {
        readPage(id, target) {
          target[2] = 20;
        },
      },
      _gpuLedger: { _pages: new Map([[2, {}]]) },
    };
    const project = () =>
      gaussianSegmentedRuntimeControllerSpecHooks.targetSorterResourceRequirements(
        controller,
        { selectedSplatCount: 20 },
        [2],
        new Float64Array(11),
      );
    const withHistory = project();
    confirmed.delete(9);
    expect(project().totalBytes).toBe(withHistory.totalBytes);
    confirmed.delete(1);
    expect(project().totalBytes).toBe(withHistory.totalBytes - 120);
  });

  it("uses a snapshot-only Sorter for stable complete resource diagnostics", function () {
    const hooks = gaussianSegmentedRuntimeControllerSpecHooks;
    const controller = {
      _d2: {
        get resourceAvailability() {
          return this.resourceLedger;
        },
        resourceLedger: {
          cpuTotal: 100,
          gpuTotal: 200,
          cpuCleanupDebtBytes: 0,
          gpuCleanupDebtBytes: 0,
          cpuOrderingOverlayBytes: 30,
          gpuOrderingOverlayBytes: 40,
        },
      },
      _sorter: {
        _confirmed: new Set([3]),
        snapshot: Object.freeze({
          confirmedPositionBytes: 48,
          scratchBytes: 2_048,
        }),
      },
      _index: {
        readPage(pageId, page) {
          page[2] = pageId === 3 ? 4 : 6;
        },
      },
      _currentSnapshot: {
        cpuStoredBytes: 50,
        gpuRawBytes: 60,
      },
      _pageLimits: {
        replacementCpuEscrowBytes: 1_000,
        maximumCpuPageBytes: 2_000,
        replacementGpuEscrowBytes: 1_100,
        maximumGpuPageBytes: 2_100,
      },
      _options: {
        maximumCpuBytes: 10_000,
        maximumGpuBytes: 20_000,
        maximumSortWorkingSetBytes: 30_000,
      },
    };
    expect(controller._sorter.statistics).not.toBeDefined();
    const stableKey = hooks.resourceAvailabilityKey(controller);
    expect(hooks.resourceAvailabilityKey(controller)).toBe(stableKey);
    const sort = hooks.targetSorterResourceRequirements(
      controller,
      { selectedSplatCount: 10 },
      Uint32Array.from([3, 4]),
      new Float64Array(11),
    );
    const blocker = hooks.resourceBlockerSnapshot(
      controller,
      {
        requiredCpuPageBytes: 500,
        requiredGpuPageBytes: 600,
        requiredCpuPresentationBytes: 700,
        requiredGpuPresentationBytes: 800,
        requiredSorterBytes: sort.totalBytes,
      },
      "RESOURCE_ADMISSION_BLOCKED",
    );
    expect(blocker.requiredSorterBytes).toBeGreaterThan(0);
    expect(blocker.availableCpuPageBytes).toBe(1_000);
    expect(blocker.availableGpuPageBytes).toBe(1_100);
    expect(blocker.availableCpuPresentationBytes).toBe(9_900);
    expect(blocker.availableGpuPresentationBytes).toBe(19_800);
    expect(blocker.availableSorterBytes).toBe(30_000);
    controller._sorter.snapshot = Object.freeze({
      ...controller._sorter.snapshot,
      scratchBytes: 2_049,
    });
    expect(hooks.resourceAvailabilityKey(controller)).not.toBe(stableKey);
  });

  it("resource availability: keeps the exact planning key without reading the full ledger", function () {
    const hooks = gaussianSegmentedRuntimeControllerSpecHooks;
    const availability = {
      cpuTotal: 100,
      gpuTotal: 200,
      cpuCleanupDebtBytes: 3,
      gpuCleanupDebtBytes: 4,
      cpuOrderingOverlayBytes: 5,
      gpuOrderingOverlayBytes: 6,
    };
    const controller = {
      _d2: {
        get resourceLedger() {
          throw new Error("Planning must not scan the full Page ledger");
        },
        resourceAvailability: availability,
      },
      _sorter: {
        snapshot: { confirmedPositionBytes: 7, scratchBytes: 8 },
      },
    };
    expect(hooks.resourceAvailabilityKey(controller)).toBe(
      "100:200:3:4:5:6:7:8",
    );
    for (const field of Object.keys(availability)) {
      const previous = hooks.resourceAvailabilityKey(controller);
      availability[field]++;
      expect(hooks.resourceAvailabilityKey(controller)).not.toBe(previous);
    }
    expect(hooks.resourceAvailabilityKey(controller)).toBe(
      "101:201:4:5:6:7:7:8",
    );
    expect(hooks.resourceAvailabilityKey({})).toBe("unavailable");
  });

  it("handoff collects before one bind pass and preserves zero and partial frame budgets", function () {
    const uploadBytesPerPage = 256 * 32;
    function feed(maximumOperations, maximumBytes) {
      const controller = Object.create(
        _SceneGISGaussianSegmentedRuntimeController.prototype,
      );
      const events = [];
      const receipts = [{ id: 0 }, { id: 1 }];
      const owner = { pages: [{ pageIndex: 0 }, { pageIndex: 1 }] };
      const content = {
        kind: "TRANSITION",
        phase: "PAGES",
        work: { state: "CPU_READY" },
        transformGeneration: 1,
        viewGeneration: 1,
        bindIds: Uint32Array.from([0, 1, 2]),
        bindCursor: 0,
        boundIds: new Set(),
        acceptedIds: new Set([0, 1, 2]),
        preparationOwner: owner,
      };
      controller._phase = "TRANSITION_WORK";
      controller._transformGeneration = 1;
      controller._viewGeneration = 1;
      controller._orderingViewGeneration = 1;
      controller._timingOrigin = performance.now();
      controller._options = {
        maximumGpuFeedOperationsPerFrame: maximumOperations,
        maximumGpuFeedBytesPerFrame: maximumBytes,
        maximumTextureUploadsPerFrame: 0,
      };
      controller._statistics = {
        bindInspections: 0,
        gpuPageFeedOperations: 0,
        gpuPageFeedBytes: 0,
        gpuPageFeedFrames: 0,
        maximumGpuFeedWorkMilliseconds: 0,
      };
      controller._content = content;
      controller._index = { maxShDegree: 0 };
      controller._loader = { update() {} };
      controller._cache = {
        peek(pageId) {
          return {
            page: { index: pageId, splatCount: 1, semantic: 1, rawBytes: 32 },
          };
        },
      };
      const bindings = new Map();
      controller._pageBackend = {
        retainedBindingReceipt(page) {
          return bindings.get(page.index);
        },
        createBindingReceipt(page, receipt) {
          expect(receipt).toBe(receipts[page.index]);
          events.push(`upload-${page.index}`);
          bindings.set(page.index, receipt);
          return receipt;
        },
      };
      controller._d2 = {
        reserveAndBindGpuPage(work, id) {
          events.push(`bind-${id}`);
        },
      };
      let delivered = false;
      let chargedBytes = 2 * uploadBytesPerPage;
      controller._d3 = {
        statistics: {},
        collectWorkerSettlements() {
          events.push("collect");
          if (!delivered) {
            owner.sortResult = { receipts: [...receipts] };
            delivered = true;
          }
        },
        beginCorePreparation() {},
        releaseCorePreparation() {
          events.push("release-window");
          chargedBytes = 0;
          content.preparationOwner = undefined;
        },
        hasPreparedCore(id) {
          return id < 2;
        },
        queueCorePreparation(work, ids) {
          events.push(`queue-${ids.join(",")}`);
        },
        update() {
          events.push("pump");
        },
      };
      for (const name of [
        "_observeView",
        "_consumePageWorkSettlements",
        "_requestLatestOrdering",
        "_advanceOrdering",
        "_advanceContent",
        "_advanceRetirement",
        "_planLatestView",
        "_publish",
      ]) {
        spyOn(controller, name).and.stub();
      }
      spyOn(controller, "_acceptCompletions").and.callFake(() =>
        events.push("accept"),
      );
      spyOn(controller, "_fail").and.callFake((error) => {
        throw error;
      });
      const bind = spyOn(controller, "_bindPages").and.callThrough();
      controller.update({});
      expect(bind.calls.count()).toBe(1);
      expect(events.indexOf("accept")).toBeLessThan(events.indexOf("collect"));
      expect(events.filter((e) => e === "pump").length).toBe(1);
      if (maximumOperations === 0 || maximumBytes === 0) {
        expect(bindings.size).toBe(0);
        expect(chargedBytes).toBe(2 * uploadBytesPerPage);
        expect(content.preparationOwner).toBe(owner);
      } else {
        const count = Math.min(
          maximumOperations,
          Math.floor(maximumBytes / uploadBytesPerPage),
          2,
        );
        expect(bindings.size).toBe(count);
        expect(events.indexOf("collect")).toBeLessThan(
          events.indexOf("upload-0"),
        );
        expect(controller._statistics.gpuPageFeedBytes).toBe(
          count * uploadBytesPerPage,
        );
        if (count === 1) {
          expect(content.preparationOwner).toBe(owner);
          expect(owner.uploadCursor).toBe(1);
          expect(owner.sortResult.receipts[1]).toBe(receipts[1]);
          expect(chargedBytes).toBe(2 * uploadBytesPerPage);
          expect(events.some((e) => e.startsWith("queue-"))).toBe(false);
          events.length = 0;
          bind.calls.reset();
          controller.update({});
          expect(bind.calls.count()).toBe(1);
          expect(events).not.toContain("upload-0");
          expect(controller._statistics.gpuPageFeedBytes).toBe(
            2 * uploadBytesPerPage,
          );
        }
        expect(chargedBytes).toBe(0);
        expect(events.indexOf("queue-2")).toBeGreaterThan(
          events.indexOf("release-window"),
        );
        expect(events.indexOf("pump")).toBeGreaterThan(
          events.indexOf("queue-2"),
        );
      }
    }
    feed(0, 2 * uploadBytesPerPage);
    feed(2, 0);
    feed(1, 2 * uploadBytesPerPage);
    feed(Number.MAX_SAFE_INTEGER, uploadBytesPerPage);
    feed(Number.MAX_SAFE_INTEGER, 2 * uploadBytesPerPage);
  });

  it("recovers a structured Pack-header terminal while drawing the old current", async function () {
    const harness = createFailureHarness();
    try {
      await publishRoot(harness);
      const initialPublication =
        harness.controller.statistics.contentPublications;
      harness.controller._loader._packHeaders.clear();
      harness.controller._loader._headerTasks.clear();
      harness.control.packHeaderFailures = 3;
      const failedWork = await startSuccessor(harness);
      const failedGeneration = failedWork.work.generation;
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller.phase === "READY" &&
          harness.controller.statistics.liveContentWork === 0,
      );
      expect(harness.controller._loader.state).toBe("STREAMING");
      expect(harness.controller.statistics.cleanupDebtBytes).toBe(0);
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller.statistics.contentPublications >
          initialPublication,
      );
      expect(harness.controller._d2.currentPresentationIdentity).toBeDefined();
      expect(
        harness.controller._content?.work.generation ?? Infinity,
      ).toBeGreaterThan(failedGeneration);
    } finally {
      await destroyHarness(harness);
    }
  });

  it("recovers a structured Core-Page terminal with a new exact work key", async function () {
    const harness = createFailureHarness();
    try {
      await publishRoot(harness);
      harness.control.pageFailures = 3;
      const failedWork = await startSuccessor(harness);
      const oldKey = [...harness.controller._loader._pageWorkRecords.keys()][0];
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller.phase === "READY" &&
          harness.controller.statistics.liveContentWork === 0,
      );
      await pumpWithOldCurrent(
        harness,
        () => harness.controller._content !== undefined,
      );
      const newKey = [...harness.controller._loader._pageWorkRecords.keys()][0];
      expect(harness.controller._content.work.generation).toBeGreaterThan(
        failedWork.work.generation,
      );
      expect(newKey).not.toBe(oldKey);
      await pumpWithOldCurrent(
        harness,
        () => harness.controller.statistics.contentPublications === 2,
      );
    } finally {
      await destroyHarness(harness);
    }
  });

  it("keeps an optional-SH-only structured settlement nonblocking", async function () {
    const harness = createFailureHarness();
    try {
      await publishRoot(harness);
      const content = await startSuccessor(harness);
      const original = harness.controller._d2.consumePageWorkSettlements.bind(
        harness.controller._d2,
      );
      let injected = true;
      harness.controller._d2.consumePageWorkSettlements = function (
        work,
        settlements,
      ) {
        if (injected) {
          injected = false;
          return Object.freeze({ coreFailed: false, optionalFailed: 1 });
        }
        return original(work, settlements);
      };
      harness.controller._loader._pageWorkTerminalSettlements.push(
        Object.freeze({ records: Object.freeze([]), error: new Error("SH") }),
      );
      await pumpWithOldCurrent(
        harness,
        () => harness.controller.statistics.contentPublications === 2,
      );
      expect(harness.controller.state).not.toBe("FAILED");
      expect(harness.controller._currentSnapshot).toBeDefined();
      expect(content.work.generation).toBeLessThanOrEqual(
        harness.controller.statistics.contentGeneration,
      );
    } finally {
      await destroyHarness(harness);
    }
  });

  it("discards a late completion without changing the live work", function () {
    const release = jasmine.createSpy("release");
    const completion = { page: { index: 4 }, release };
    const content = { kind: "TRANSITION", work: {}, acceptedIds: new Set() };
    const controller = {
      _content: content,
      _loader: { drainCompleted: () => [completion] },
      _d2: {
        acceptPageWorkCompletion(work, value) {
          expect(work).toBe(content.work);
          expect(value).toBe(completion);
          value.release();
          return false;
        },
      },
    };
    _SceneGISGaussianSegmentedRuntimeController.prototype._acceptCompletions.call(
      controller,
    );
    expect(release).toHaveBeenCalledTimes(1);
    expect(content.acceptedIds.size).toBe(0);
    expect(controller._content).toBe(content);
  });

  it("releases unvisited completions when the adapter rejects a corrupt payload", function () {
    const releaseBad = jasmine.createSpy("releaseBad");
    const releaseNext = jasmine.createSpy("releaseNext");
    const bad = { release: releaseBad },
      next = { release: releaseNext };
    const controller = {
      _content: { kind: "TRANSITION", work: {} },
      _loader: { drainCompleted: () => [bad, next] },
      _d2: {
        acceptPageWorkCompletion(_work, completion) {
          completion.release();
          throw new Error("corrupt payload");
        },
      },
    };
    expect(() =>
      _SceneGISGaussianSegmentedRuntimeController.prototype._acceptCompletions.call(
        controller,
      ),
    ).toThrowError("corrupt payload");
    expect(releaseBad).toHaveBeenCalledTimes(1);
    expect(releaseNext).toHaveBeenCalledTimes(1);
  });

  it("recovers GPU bind and D3 prepare failures without replacing the old current", async function () {
    const harness = createFailureHarness();
    try {
      await publishRoot(harness);
      await startSuccessor(harness);
      const createReceipt =
        harness.controller._pageBackend.createBindingReceipt.bind(
          harness.controller._pageBackend,
        );
      let gpuFailure = true;
      harness.controller._pageBackend.createBindingReceipt = function (
        ...args
      ) {
        if (gpuFailure) {
          gpuFailure = false;
          throw new Error("injected GPU bind failure");
        }
        return createReceipt(...args);
      };
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller.phase === "READY" &&
          harness.controller.statistics.liveContentWork === 0,
      );
      await startSuccessor(harness);
      const prepare = harness.controller._d3.prepare.bind(
        harness.controller._d3,
      );
      let prepareFailure = true;
      harness.controller._d3.prepare = function (...args) {
        if (prepareFailure) {
          prepareFailure = false;
          throw new Error("injected D3 prepare failure");
        }
        return prepare(...args);
      };
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller.phase === "READY" &&
          harness.controller.statistics.liveContentWork === 0,
      );
      await pumpWithOldCurrent(
        harness,
        () => harness.controller.statistics.contentPublications === 2,
      );
      expect(harness.controller.statistics.cleanupDebtBytes).toBe(0);
    } finally {
      await destroyHarness(harness);
    }
  });

  it("retains one abort and retirement cleanup record across two failures", async function () {
    const harness = createFailureHarness();
    try {
      await publishRoot(harness);
      await startSuccessor(harness);
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller._content?.phase === "PRESENTATION" &&
          harness.controller.statistics.copiedSplats > 5,
      );
      const abort = harness.controller._d3.abort.bind(harness.controller._d3);
      let abortFailures = 2;
      harness.controller._d3.abort = function (...args) {
        if (abortFailures > 0) {
          abortFailures--;
          throw new Error("injected abort cleanup failure");
        }
        return abort(...args);
      };
      const abortWork = harness.controller._d2.abortWork.bind(
        harness.controller._d2,
      );
      let abortEntries = 0;
      harness.controller._d2.abortWork = function (...args) {
        abortEntries++;
        return abortWork(...args);
      };
      harness.controller.transformChanged();
      let cleanupToken;
      await pumpWithOldCurrent(harness, () => {
        const tokens = harness.controller._d2.cleanupDebtTokens;
        if (tokens.length > 0) {
          cleanupToken ??= tokens[0];
          expect(tokens[0]).toBe(cleanupToken);
          expect(harness.controller._content).toBeUndefined();
        }
        return (
          harness.controller.phase === "READY" &&
          harness.controller.statistics.liveContentWork === 0
        );
      });
      expect(abortEntries).toBe(1);
      expect(abortFailures).toBe(0);

      await startSuccessor(harness);
      const retire = harness.controller._d3.retire.bind(harness.controller._d3);
      let retireFailures = 2;
      harness.controller._d3.retire = function (...args) {
        if (retireFailures > 0) {
          retireFailures--;
          throw new Error("injected retirement cleanup failure");
        }
        return retire(...args);
      };
      const finalize = harness.controller._d2.finalizeRetirement.bind(
        harness.controller._d2,
      );
      let retireEntries = 0;
      harness.controller._d2.finalizeRetirement = function (...args) {
        retireEntries++;
        return finalize(...args);
      };
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller.phase === "READY" &&
          harness.controller.statistics.contentPublications === 2,
      );
      expect(retireEntries).toBe(1);
      expect(retireFailures).toBe(0);
      expect(harness.controller.statistics.cleanupDebtBytes).toBe(0);
    } finally {
      await destroyHarness(harness);
    }
  });

  it("keeps pre-current FAILED inert and explicitly destroys once", async function () {
    const harness = createFailureHarness();
    try {
      harness.control.pageFailures = 3;
      await pumpHarness(
        harness,
        () =>
          harness.controller.phase === "FAILED" &&
          harness.controller._componentsDestroyed,
        800,
      );
      const stable = harness.controller.statistics;
      for (let frame = 0; frame < 5; frame++) {
        harness.frameState.commandList.length = 0;
        harness.controller.update(harness.frameState);
        expect(harness.frameState.commandList.length).toBe(0);
        expect(harness.controller.phase).toBe("FAILED");
      }
      expect(harness.controller.statistics).toEqual(stable);
      expect(harness.controller.requestDestroy()).toBe(true);
      expect(harness.controller.destroyed).toBe(true);
      expect(harness.controller.statistics.liveContentWork).toBe(0);
      expect(harness.controller.statistics.liveOrderingWork).toBe(0);
      expect(harness.controller.statistics.cleanupDebtBytes).toBe(0);
    } finally {
      harness.context.destroyForSpecs();
    }
  });

  it("publishes only the latest real transform generation and exact quaternion", async function () {
    const harness = createFailureHarness();
    try {
      await publishRoot(harness);
      await startSuccessor(harness);
      const rotation = Matrix4.fromRotationTranslation(
        Matrix3.fromRotationZ(Math.PI / 3),
        new Cartesian3(20, 30, 40),
      );
      Matrix4.clone(rotation, harness.primitive._modelMatrix);
      Matrix4.clone(rotation, harness.primitive._effectiveModelMatrix);
      const pageGeneration = harness.controller.statistics.transformGeneration;
      harness.controller.transformChanged();
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller.phase === "READY" &&
          harness.controller.statistics.liveContentWork === 0,
      );
      expect(harness.controller.statistics.transformGeneration).toBe(
        pageGeneration + 1,
      );
      await startSuccessor(harness);
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller._content?.phase === "PRESENTATION" &&
          harness.controller.statistics.copiedSplats > 5,
      );
      Matrix4.fromRotationTranslation(
        Matrix3.fromRotationZ(Math.PI / 2),
        new Cartesian3(25, 35, 45),
        harness.primitive._modelMatrix,
      );
      Matrix4.clone(
        harness.primitive._modelMatrix,
        harness.primitive._effectiveModelMatrix,
      );
      harness.controller.transformChanged();
      harness.frameState.commandList.length = 0;
      harness.controller.update(harness.frameState);
      expect(harness.frameState.commandList.length).toBe(1);
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller.phase === "READY" &&
          harness.controller.statistics.liveContentWork === 0,
      );
      await startSuccessor(harness);
      await pumpWithOldCurrent(
        harness,
        () => harness.controller.statistics.contentPublications === 2,
      );
      const renderToWorld = Matrix4.multiplyByTranslation(
        harness.primitive._effectiveModelMatrix,
        harness.primitive._viewOriginLocal,
        new Matrix4(),
      );
      const renderToView = Matrix4.multiplyTransformation(
        harness.frameState.camera.viewMatrix,
        renderToWorld,
        new Matrix4(),
      );
      const expectedQuaternion = Quaternion.fromRotationMatrix(
        Matrix4.getMatrix3(renderToView, new Matrix3()),
      );
      expect(harness.primitive._sourceRenderToViewQuaternion).toEqualEpsilon(
        expectedQuaternion,
        1e-12,
      );
      harness.frameState.camera.setView({
        destination: new Cartesian3(2, 3, 4),
      });
      harness.frameState.commandList.length = 0;
      harness.controller.update(harness.frameState);
      expect(harness.frameState.commandList.length).toBe(1);
      expect(harness.controller.statistics.contentGeneration).toBe(2);
    } finally {
      await destroyHarness(harness);
    }
  });

  it("retains a converged successor during motion and catches up after publication", async function () {
    const harness = createFailureHarness();
    try {
      await publishRoot(harness);
      const successor = await startSuccessor(harness);
      harness.controller._options.maximumMappingEntriesPerFrame = 0;

      for (const x of [44.01, 44.02, 44.03]) {
        const generation = ++harness.controller._viewGeneration;
        harness.controller._orderingViewGeneration = generation;
        harness.controller._statistics.viewGeneration = generation;
        harness.controller._view = Object.freeze({
          ...refinementView(),
          viewIdentity: `r3-current-${generation}`,
          cameraPositionScene: Object.freeze([x, 5, 25]),
        });
        harness.controller._evaluatedPlanKey = undefined;
        harness.frameState.commandList.length = 0;
        harness.controller.update(harness.frameState);
        expect(harness.frameState.commandList.length).toBe(1);
        expect(harness.controller._content).toBe(successor);
      }
      await pumpWithOldCurrent(
        harness,
        () =>
          !harness.controller._orderingActive &&
          harness.controller._content?.phase === "PRESENTATION",
      );
      expect(harness.controller.statistics.liveOrderingWork).toBe(0);
      expect(harness.controller.statistics.drawCount).toBe(1);

      const resumedGeneration = ++harness.controller._viewGeneration;
      harness.controller._orderingViewGeneration = resumedGeneration;
      harness.controller._statistics.viewGeneration = resumedGeneration;
      harness.controller._view = Object.freeze({
        ...refinementView(),
        viewIdentity: `r4-resumed-${resumedGeneration}`,
      });
      harness.controller._evaluatedPlanKey = undefined;
      harness.controller._options.maximumMappingEntriesPerFrame = 1;
      await pumpWithOldCurrent(
        harness,
        () => harness.controller.statistics.contentPublications === 2,
      );
      await pumpWithOldCurrent(
        harness,
        () =>
          harness.controller._d3.statistics.globalViewGeneration ===
          resumedGeneration,
      );
      expect(harness.controller._d3.statistics.globalViewGeneration).toBe(
        resumedGeneration,
      );
      expect(harness.controller.statistics.drawCount).toBe(1);
      expect(harness.controller.statistics.cleanupDebtBytes).toBe(0);
    } finally {
      await destroyHarness(harness);
    }
  });

  it("loads the final A4 route, publishes one global command, and destroys to zero", async function () {
    const fixture = createFrozenFinalA4Bytes();
    const indexTransform = installNonIdentityIndexTransform(fixture.mci);
    const manifest = manifestBytes(fixture.mci);
    const context = createContext({ requestWebgl1: false });
    const frameState = createFrameState(
      context,
      createCamera({
        target: Cartesian3.ZERO,
        offset: new Cartesian3(44, 5, 25),
        far: 1_000_000_000,
      }),
    );
    resetGaussianSegmentedGlobalSorterRepositoryForSpecs();
    ContextLimits._maximumTextureSize = context.maximumTextureSize;
    const lineWidthRange = context._gl.getParameter(
      context._gl.ALIASED_LINE_WIDTH_RANGE,
    );
    ContextLimits._minimumAliasedLineWidth = lineWidthRange[0];
    ContextLimits._maximumAliasedLineWidth = lineWidthRange[1];

    const fetchFunction = (request) => {
      let bytes;
      if (request.url.endsWith("scene.mcl.json")) {
        bytes = manifest;
      } else if (request.url.endsWith("scene.mci")) {
        bytes = fixture.mci;
      } else if (request.url.endsWith(packFileName({ id: 0, kind: 1 }))) {
        bytes = fixture.packs.get(A4_CORE_PACK_NAME);
      } else {
        return Promise.reject(new Error("unknown segmented fixture URL"));
      }
      const start = request.start ?? 0;
      const end = request.end ?? bytes.byteLength - 1;
      const range = bytes.slice(start, end + 1);
      return Promise.resolve({
        status: request.start === undefined ? 200 : 206,
        headers:
          request.start === undefined
            ? { "content-length": String(range.byteLength) }
            : {
                "content-range": `bytes ${start}-${end}/${bytes.byteLength}`,
                "content-length": String(range.byteLength),
              },
        arrayBuffer: range.buffer,
      });
    };
    const primitive = primitiveState();
    Matrix4.fromTranslation(new Cartesian3(10, 20, 30), primitive._modelMatrix);
    const controller = new _SceneGISGaussianSegmentedRuntimeController({
      primitive,
      url: "https://example.test/scene.mcl.json",
      maximumSelectedSplats: 6,
      maximumCoverageSlots: 100,
      maximumCpuBytes: 100_000_000,
      maximumGpuBytes: 100_000_000,
      maximumCpuPageBytes: 10_000_000,
      replacementCpuEscrowBytes: 5_000_000,
      maximumGpuPageBytes: 10_000_000,
      replacementGpuEscrowBytes: 5_000_000,
      maximumSortWorkingSetBytes: 1_000_000,
      refineErrorPixels: 0.0001,
      coarsenErrorPixels: 0.00001,
      maximumGpuFeedOperationsPerFrame: 1,
      maximumGpuFeedBytesPerFrame: 8 * 1024 * 1024,
      maximumMappingEntriesPerFrame: 1,
      maximumTextureUploadsPerFrame: 1,
      maximumSortPositionExtractionsPerFrame: 1,
      maximumLoaderDeliveryBytes: 1024 * 1024,
      requestScheduler: { request: (request) => request.requestFunction() },
      fetchFunction,
      taskProcessor: {
        scheduleTask: (parameters) =>
          Promise.resolve(sortGaussianSegmentedGlobalPositions(parameters)),
        destroy() {},
      },
    });
    try {
      for (let frame = 0; frame < 300 && !controller.ready; frame++) {
        frameState.commandList.length = 0;
        const operations = controller.statistics.gpuPageFeedOperations;
        controller.update(frameState);
        expect(
          controller.statistics.gpuPageFeedOperations - operations,
        ).toBeLessThanOrEqual(1);
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (!controller.ready) {
        throw (
          controller.error ?? new Error(JSON.stringify(controller.statistics))
        );
      }
      expect(controller.ready).toBe(true);
      expect(controller._pageSources instanceof WeakMap).toBe(true);
      const expectedEffective = Matrix4.multiply(
        primitive._modelMatrix,
        Matrix4.fromArray(indexTransform),
        new Matrix4(),
      );
      expect(
        Matrix4.equals(primitive._effectiveModelMatrix, expectedEffective),
      ).toBe(true);
      const expectedSourceCamera = Matrix4.multiplyByPoint(
        Matrix4.inverseTransformation(expectedEffective, new Matrix4()),
        frameState.camera.positionWC,
        new Cartesian3(),
      );
      expect(primitive._viewOriginLocal).toEqual(expectedSourceCamera);
      expect(controller._view.cameraPositionScene).toEqual([
        expectedSourceCamera.x,
        expectedSourceCamera.y,
        expectedSourceCamera.z,
      ]);
      expect(primitive._sourceRenderToViewPosition).toEqualEpsilon(
        Cartesian3.ZERO,
        1e-12,
      );
      expect(frameState.commandList[0].boundingVolume).toEqual(
        BoundingSphere.transform(
          controller._sourceBoundingSphere,
          expectedEffective,
        ),
      );
      controller._view = refinementView();
      controller._viewGeneration++;
      controller._orderingViewGeneration = controller._viewGeneration;
      for (
        let frame = 0;
        frame < 300 && controller.statistics.contentPublications < 2;
        frame++
      ) {
        frameState.commandList.length = 0;
        controller.update(frameState);
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      if (controller.error) {
        throw controller.error;
      }
      if (controller.statistics.contentPublications <= 1) {
        throw new Error(JSON.stringify(controller.statistics));
      }
      expect(frameState.commandList.length).toBe(1);
      expect(controller.statistics.contentPublications).toBe(2);
      expect(controller.statistics.physicalContentPublicationCount).toBe(2);
      expect(controller.statistics.logicalClosureStepCount).toBeGreaterThan(0);
      expect(controller.statistics.presentationCoreRewriteSplats).toBe(0);
      expect(controller.statistics.mappingEntriesWritten).toBe(11);
      expect(
        controller.statistics.pageAtlasCanonicalizedCoreSplats,
      ).toBeLessThan(controller.statistics.mappingEntriesWritten);
      expect(controller.statistics.gpuPageFeedOperations).toBeGreaterThan(0);
      expect(controller.statistics.gpuPageFeedBytes).toBeGreaterThan(0);
      expect(controller.statistics.globalSortDispatchCount).toBeGreaterThan(0);
      expect(controller.statistics.drawCount).toBe(1);
      expect(controller.statistics.cleanupDebtBytes).toBe(0);
      primitive.show = false;
      frameState.commandList.length = 0;
      controller.update(frameState);
      expect(frameState.commandList.length).toBe(0);
      primitive.show = true;
      Matrix4.fromTranslation(
        new Cartesian3(20, 20, 30),
        primitive._modelMatrix,
      );
      Matrix4.multiply(
        primitive._modelMatrix,
        Matrix4.fromArray(indexTransform),
        primitive._effectiveModelMatrix,
      );
      controller.transformChanged();
      frameState.commandList.length = 0;
      controller.update(frameState);
      expect(frameState.commandList.length).toBe(1);
      expect(frameState.commandList[0].boundingVolume).toEqual(
        BoundingSphere.transform(
          controller._sourceBoundingSphere,
          primitive._effectiveModelMatrix,
        ),
      );
      let stableFrames = 0;
      let previousEvaluations = controller.statistics.selectionEvaluations;
      for (let frame = 0; frame < 300 && stableFrames < 5; frame++) {
        frameState.commandList.length = 0;
        controller.update(frameState);
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const currentEvaluations = controller.statistics.selectionEvaluations;
        if (
          controller.statistics.liveContentWork === 0 &&
          currentEvaluations === previousEvaluations
        ) {
          stableFrames++;
        } else {
          stableFrames = 0;
        }
        previousEvaluations = currentEvaluations;
      }
      expect(stableFrames).toBe(5);
      const steady = controller.statistics;
      for (let frame = 0; frame < 100; frame++) {
        frameState.commandList.length = 0;
        controller.update(frameState);
      }
      expect(controller.statistics.selectionEvaluations).toBe(
        steady.selectionEvaluations,
      );
      expect(controller.statistics.visitedNodes).toBe(steady.visitedNodes);
      controller.requestDestroy();
      for (let frame = 0; frame < 20 && !controller.destroyed; frame++) {
        controller.update(frameState);
      }
      expect(controller.destroyed).toBe(true);
      expect(controller.statistics.liveContentWork).toBe(0);
      expect(controller.statistics.liveOrderingWork).toBe(0);
      expect(controller.statistics.cleanupDebtBytes).toBe(0);
    } finally {
      if (!controller.destroyed) {
        controller.requestDestroy();
      }
      context.destroyForSpecs();
    }
  });
});

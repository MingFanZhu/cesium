import assert from "node:assert/strict";
import nodeTest from "node:test";

import {
  createSegmentedActiveCut,
  planSegmentedActiveCut,
  planSegmentedConvergedActiveCut,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedActiveCut.js";
import {
  abortSegmentedAssetPageTransition,
  abortSegmentedPreparedPagePublication,
  commitSegmentedAssetPageBootstrap,
  commitSegmentedAssetPagePublication,
  createSegmentedAssetPagePhysicalSnapshot,
  computeSegmentedAtlasPageFootprint,
  deriveSegmentedAssetPagePhysicalReady,
  finalizeSegmentedAssetPagePublication,
  planSegmentedAssetPageBootstrap,
  planSegmentedAssetPageTransition,
  planSegmentedConvergedAssetPageTransition,
  planSegmentedReadyConvergedActiveCut,
  planSegmentedProgressiveBridge,
  prepareSegmentedConvergedAssetPagePublication,
  projectSegmentedAssetIntervals,
  projectSegmentedAssetSlots,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedAssetPageOwnership.js";
import { decodeSegmentedHierarchyRuntimeIndex } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";
import {
  createFourWideShA4RuntimeFixture,
  createMultiPartLeafA4RuntimeFixture,
  createRealA4RuntimeFixture,
  createShA4RuntimeFixture,
} from "./segmentedHierarchyFixture.js";

const test = globalThis.it ?? nodeTest;

function view() {
  return Object.freeze({
    viewIdentity: "scale-1c",
    cameraPositionScene: [44, 5, 25],
    frustumPlanesScene: [
      [1, 0, 0, 1e9],
      [-1, 0, 0, 1e9],
      [0, 1, 0, 1e9],
      [0, -1, 0, 1e9],
      [0, 0, 1, 1e9],
      [0, 0, -1, 1e9],
    ],
    sceneToClipMatrix: [1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    drawingBufferWidth: 100,
    drawingBufferHeight: 100,
    projectionKind: "perspective",
  });
}

function hiddenView() {
  return Object.freeze({
    ...view(),
    viewIdentity: "scale-1c-hidden",
    frustumPlanesScene: [
      [1, 0, 0, -1e12],
      [-1, 0, 0, 1e12 + 1],
      [0, 1, 0, 1e12],
      [0, -1, 0, 1e12],
      [0, 0, 1, 1e12],
      [0, 0, -1, 1e12],
    ],
  });
}

function limits(overrides = {}) {
  return {
    maximumCpuPageBytes: 10_000_000,
    replacementCpuEscrowBytes: 5_000_000,
    maximumGpuPageBytes: 10_000_000,
    replacementGpuEscrowBytes: 5_000_000,
    ...overrides,
  };
}

function snapshot(index, pageIds, generation = 1, identity = "lease-1") {
  const ids = Uint32Array.from(
    [...pageIds].sort((left, right) => left - right),
  );
  const stored = new Float64Array(ids.length);
  const raw = new Float64Array(ids.length);
  const provenance = new Float64Array(ids.length * 7);
  const page = new Float64Array(11);
  for (let position = 0; position < ids.length; position++) {
    index.readPage(ids[position], page);
    stored[position] = page[8];
    raw[position] = page[9];
    provenance.set(
      [page[6], page[7], page[8], page[9], page[10], page[3], page[4]],
      position * 7,
    );
  }
  return createSegmentedAssetPagePhysicalSnapshot(index, {
    cpuPageIds: ids,
    cpuStoredBytes: stored,
    cpuPageProvenance: provenance,
    gpuPageIds: ids,
    gpuRawBytes: raw,
    gpuPageProvenance: provenance,
    cpuGeneration: generation,
    gpuGeneration: generation,
    leaseIdentity: identity,
  });
}

async function withFixture(callback) {
  const fixture = await createRealA4RuntimeFixture();
  try {
    const index = decodeSegmentedHierarchyRuntimeIndex(fixture.bytes);
    return await callback(index);
  } finally {
    await fixture.cleanup();
  }
}

test("ready intermediate cut intersects RAM GPU and Worker readiness and reuses converged publication", async () => {
  await withFixture((index) => {
    function held(cpuIds, gpuIds = cpuIds, generation = 2) {
      const receipt = {
        cpuGeneration: generation,
        gpuGeneration: generation,
        leaseIdentity: "lease-1",
      };
      for (const [axis, ids] of [
        ["cpu", cpuIds],
        ["gpu", gpuIds],
      ]) {
        const sorted = Uint32Array.from([...ids].sort((a, b) => a - b));
        const bytes = new Float64Array(sorted.length);
        const provenance = new Float64Array(sorted.length * 7);
        const page = new Float64Array(11);
        for (let i = 0; i < sorted.length; i++) {
          index.readPage(sorted[i], page);
          bytes[i] =
            axis === "cpu"
              ? page[8]
              : computeSegmentedAtlasPageFootprint(
                  page[2],
                  page[4],
                  index.maxShDegree,
                ).uploadBytes;
          provenance.set(
            [page[6], page[7], page[8], page[9], page[10], page[3], page[4]],
            i * 7,
          );
        }
        receipt[`${axis}PageIds`] = sorted;
        receipt[`${axis}PageProvenance`] = provenance;
        receipt[axis === "cpu" ? "cpuStoredBytes" : "gpuRawBytes"] = bytes;
      }
      return createSegmentedAssetPagePhysicalSnapshot(index, receipt);
    }
    const policy = {
      maximumSelectedSplats: 1000000,
      maximumCoverageSlots: 1000,
      refineErrorPixels: 0.0001,
      coarsenErrorPixels: 0,
      minimumLeafLogicalLevel: 0,
    };
    const current = createSegmentedActiveCut(index, policy);
    const final = planSegmentedConvergedActiveCut(
      index,
      current,
      view(),
      policy,
    );
    const currentIds = new Set(
      projectSegmentedAssetIntervals(index, current).fragmentCorePageIds,
    );
    const targetIds = new Set(
      projectSegmentedAssetIntervals(index, final.finalCut).fragmentCorePageIds,
    );
    const allIds = new Set([...currentIds, ...targetIds]);
    const missing = [...targetIds].find((pageId) => !currentIds.has(pageId));
    assert.notEqual(missing, undefined);
    const subset = new Set([...allIds].filter((pageId) => pageId !== missing));
    const all = held(allIds);
    const workerMissing = planSegmentedReadyConvergedActiveCut(
      index,
      current,
      final,
      view(),
      all,
      subset,
    );
    assert.equal(workerMissing.isIntermediate, true);
    assert.equal(
      projectSegmentedAssetIntervals(
        index,
        workerMissing.finalCut,
      ).fragmentCorePageIds.includes(missing),
      false,
    );
    for (const missingAxis of ["cpu", "gpu"]) {
      const physical = held(
        missingAxis === "cpu" ? subset : allIds,
        missingAxis === "gpu" ? subset : allIds,
      );
      assert.equal(
        planSegmentedReadyConvergedActiveCut(
          index,
          current,
          final,
          view(),
          physical,
          allIds,
        ).isIntermediate,
        true,
      );
    }
    assert.throws(
      () =>
        planSegmentedReadyConvergedActiveCut(
          index,
          current,
          final,
          view(),
          all,
          [],
        ),
      /source Core/,
    );
    const ready = planSegmentedReadyConvergedActiveCut(
      index,
      current,
      final,
      view(),
      all,
      allIds,
    );
    assert.equal(ready.finalCut, final.finalCut);
    const bridge = planSegmentedProgressiveBridge(
      index,
      current,
      final,
      view(),
    );
    assert.ok(bridge.additionalStoredBytes > 0);
    assert.ok(bridge.additionalStoredBytes <= bridge.maximumBytes);
    assert.equal(
      planSegmentedProgressiveBridge(index, current, final, view(), {
        maximumBytes: 0,
      }),
      undefined,
    );
    assert.throws(() => bridge.additionalCorePageIds.push(0), TypeError);
    const targetSlots = projectSegmentedAssetSlots(index, final.finalCut);
    const topology = new Uint32Array(8);
    index.readNodeTopology(bridge.pathNodeIds[0], topology);
    const firstLeaf = topology[6];
    const readySlot = final.finalCut.coverageNodeIndices.findIndex((node) => {
      index.readNodeTopology(node, topology);
      return topology[6] === firstLeaf;
    });
    const detailPages = targetSlots.fragmentCorePageIds.slice(
      targetSlots.assetFragmentOffsets[
        targetSlots.providerAssetOffsets[readySlot]
      ],
      targetSlots.assetFragmentOffsets[
        targetSlots.providerAssetOffsets[readySlot + 1]
      ],
    );
    const bridgeHeld = new Set([
      ...currentIds,
      ...bridge.requiredCorePageIds,
      ...detailPages,
    ]);
    const bridgeReady = planSegmentedReadyConvergedActiveCut(
      index,
      current,
      final,
      view(),
      held(bridgeHeld),
      bridgeHeld,
      bridge,
    );
    assert.equal(bridgeReady.stepCount, 1);
    assert.equal(bridgeReady.metrics.bridgeFallbackUsed, true);
    assert.equal(bridgeReady.canonicalFinalCut, final.finalCut);
    const missingBridgeId = bridge.additionalCorePageIds.find(
      (id) => !detailPages.includes(id),
    );
    assert.notEqual(missingBridgeId, undefined);
    const bridgeSubset = new Set(
      [...bridgeHeld].filter((id) => id !== missingBridgeId),
    );
    for (const axis of ["cpu", "gpu", "worker"]) {
      const unavailable = planSegmentedReadyConvergedActiveCut(
        index,
        current,
        final,
        view(),
        held(
          axis === "cpu" ? bridgeSubset : bridgeHeld,
          axis === "gpu" ? bridgeSubset : bridgeHeld,
        ),
        axis === "worker" ? bridgeSubset : bridgeHeld,
        bridge,
      );
      assert.equal(unavailable.metrics.bridgeFallbackUsed, false);
    }
    assert.throws(
      () =>
        planSegmentedReadyConvergedActiveCut(
          index,
          current,
          final,
          view(),
          all,
          allIds,
          { ...bridge },
        ),
      /bridge target or source is stale/,
    );
    assert.equal(
      planSegmentedReadyConvergedActiveCut(
        index,
        current,
        final,
        view(),
        all,
        allIds,
        bridge,
      ).finalCut,
      final.finalCut,
    );
    const bootstrap = planSegmentedAssetPageBootstrap(
      index,
      current,
      held([], [], 0),
      limits(),
    );
    const ownership = commitSegmentedAssetPageBootstrap(
      index,
      bootstrap,
      held(currentIds, currentIds, 1),
      true,
    ).ownership;
    assert.equal(workerMissing.stepCount, 1);
    const transition = planSegmentedConvergedAssetPageTransition(
      index,
      ownership,
      current,
      workerMissing,
      view(),
      all,
      limits(),
    );
    const prepared = prepareSegmentedConvergedAssetPagePublication(
      index,
      current,
      ownership,
      workerMissing,
      transition,
      all,
    );
    assert.equal(prepared.targetCut, workerMissing.finalCut);
    assert.equal(transition.metrics.exactFinalTarget, false);
    abortSegmentedPreparedPagePublication(index, prepared);
  });
});

test("provider projection and resource-neutral split preserve exact physical fragments", async () => {
  await withFixture((index) => {
    const cut = createSegmentedActiveCut(index, { maximumSelectedSplats: 6 });
    const before = projectSegmentedAssetIntervals(index, cut);
    const activePlan = planSegmentedActiveCut(index, cut, view(), {
      maximumSelectedSplats: 6,
    });
    const after = projectSegmentedAssetIntervals(
      index,
      activePlan.projectedCut,
    );
    assert.deepEqual(
      [...after.fragmentCorePageIds],
      [...before.fragmentCorePageIds],
    );
    assert.deepEqual([...after.fragmentCounts], [...before.fragmentCounts]);
    assert.deepEqual([...after.assetIds], [...before.assetIds]);
    assert.equal(before.providerIntervalCount, 1);
    assert.ok(before.assetSliceCount > 0);
    assert.ok(before.pageFragmentCount > 0);
    assert.equal(before.metrics.coverageHoleCount, 0);
    assert.equal(before.metrics.coverageOverlapCount, 0);
  });
});

function createProjectionScaleOracle(assetCount, pageCount, packCount) {
  const calls = { asset: 0, page: 0, pageIndex: 0 };
  return {
    artifactIdentityHex: `scale-oracle-${assetCount}-${pageCount}-${packCount}`,
    nodeCount: 1,
    leafCount: 1,
    representationCount: 1,
    segmentCount: 0,
    rootNodeIndex: 0,
    assetCount,
    assetPageIndexCount: pageCount,
    pageCount,
    packCount,
    maxShDegree: 0,
    writeArtifactIdentity(target) {
      target.fill(0);
      target[0] = 0x1c;
      return target;
    },
    readNodeTopology(nodeId, target) {
      assert.equal(nodeId, 0);
      target.fill(0);
      target[0] = 0xffffffff;
      target[1] = 0xffffffff;
      target[6] = 0;
      target[7] = 1;
      return target;
    },
    readNodeContentBounds(nodeId, target) {
      assert.equal(nodeId, 0);
      target.fill(0);
      return target;
    },
    readNodeProxy(nodeId, target) {
      assert.equal(nodeId, 0);
      target.fill(0);
      return target;
    },
    readRepresentation(representationId, target) {
      assert.equal(representationId, 0);
      target.fill(0);
      target[0] = 0;
      target[4] = 0;
      target[5] = 1;
      target[6] = 4;
      return target;
    },
    readSegment() {
      throw new Error("dormant Segment read");
    },
    leafRepresentationId(leafId) {
      assert.equal(leafId, 0);
      return 0;
    },
    readAsset(assetId, target) {
      assert.equal(assetId, 0, "dormant Asset read");
      calls.asset++;
      target.set([0, 0, 4, 0, 0, 1, 0, 0]);
      return target;
    },
    readAssetPageIndex(listIndex) {
      assert.equal(listIndex, 0, "dormant Page-list read");
      calls.pageIndex++;
      return 0;
    },
    readPage(pageId, target) {
      assert.equal(pageId, 0, "dormant Page read");
      calls.page++;
      target.set([0, 0, 4, 0, 0, 0, 0, 256, 128, 128, 1]);
      return target;
    },
    calls,
  };
}

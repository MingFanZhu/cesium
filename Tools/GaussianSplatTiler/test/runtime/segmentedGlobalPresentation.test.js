import assert from "node:assert/strict";
import nodeTest from "node:test";

import {
  createSegmentedActiveCut,
  planSegmentedActiveCut,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedActiveCut.js";
import {
  createSegmentedAssetPagePhysicalSnapshot,
  planSegmentedAssetPageBootstrap,
  planSegmentedAssetPageTransition,
  prepareSegmentedAssetPageBootstrapPublication,
  prepareSegmentedAssetPagePublication,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedAssetPageOwnership.js";
import {
  abortSegmentedGlobalPresentationPublication,
  abortSegmentedGlobalPresentationRefresh,
  commitSegmentedGlobalPresentationPublication,
  commitSegmentedGlobalPresentationRefresh,
  composeSegmentedGlobalPresentationSlots,
  createSegmentedGlobalOrderingRefreshPlan,
  createSegmentedGlobalPresentationPlan,
  createSegmentedGlobalPresentationReceipt,
  createSegmentedGlobalShRefreshPlan,
  deriveSegmentedGlobalPresentationLayout,
  validateSegmentedGlobalPresentationPlanBinding,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedGlobalPresentation.js";
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
    viewIdentity: "scale-1d",
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

function pageLimits(overrides = {}) {
  return {
    maximumCpuPageBytes: 10_000_000,
    replacementCpuEscrowBytes: 5_000_000,
    maximumGpuPageBytes: 10_000_000,
    replacementGpuEscrowBytes: 5_000_000,
    ...overrides,
  };
}

function presentationLimits(overrides = {}) {
  return {
    maximumSelectedSplats: 1_000_000,
    maximumCoverageSlots: 100_000,
    maximumTextureSize: 8192,
    maximumTextureArrayLayers: 64,
    maximumCpuBytes: 1_000_000_000,
    maximumGpuBytes: 1_000_000_000,
    ...overrides,
  };
}

function snapshot(index, pageIds, generation = 1, identity = "scale-1d") {
  return splitSnapshot(index, pageIds, pageIds, generation, identity);
}

function receiptSide(index, pageIds, byteColumn) {
  const ids = Uint32Array.from(
    [...pageIds].sort((left, right) => left - right),
  );
  const stored = new Float64Array(ids.length);
  const provenance = new Float64Array(ids.length * 7);
  const page = new Float64Array(11);
  for (let position = 0; position < ids.length; position++) {
    index.readPage(ids[position], page);
    stored[position] = page[byteColumn];
    provenance.set(
      [page[6], page[7], page[8], page[9], page[10], page[3], page[4]],
      position * 7,
    );
  }
  return { ids, bytes: stored, provenance };
}

function splitSnapshot(
  index,
  cpuPageIds,
  gpuPageIds,
  generation = 1,
  identity = "scale-1d",
) {
  const cpu = receiptSide(index, cpuPageIds, 8);
  const gpu = receiptSide(index, gpuPageIds, 9);
  return createSegmentedAssetPagePhysicalSnapshot(index, {
    cpuPageIds: cpu.ids,
    cpuStoredBytes: cpu.bytes,
    cpuPageProvenance: cpu.provenance,
    gpuPageIds: gpu.ids,
    gpuRawBytes: gpu.bytes,
    gpuPageProvenance: gpu.provenance,
    cpuGeneration: generation,
    gpuGeneration: generation,
    leaseIdentity: identity,
  });
}

function externalReceipt(plan, owner = "presentation-owner") {
  const descriptor = plan.descriptor;
  return {
    contentGeneration: plan.expectedContentGeneration,
    mappingGeneration: plan.expectedMappingGeneration,
    orderingGeneration: plan.expectedOrderingGeneration,
    selectedSplatCount: plan.composition.selectedSplatCount,
    slotCount: plan.composition.slotCount,
    coreLogicalBytes: descriptor.coreLogicalBytes,
    coreAllocatedBytes: descriptor.coreBytes,
    shLogicalBytes: descriptor.shLogicalBytes,
    shAllocatedBytes: descriptor.shBytes,
    mappingBytes: descriptor.mappingBytes,
    cropBytes: descriptor.cropBytes,
    orderingBytes: descriptor.orderingBytes,
    gpuPageBindingGeneration:
      plan.kind === "ORDERING_REFRESH"
        ? plan.expectedOrderingGeneration - 1
        : undefined,
    resourceOwnerIdentity: owner,
  };
}

function receiptFor(plan, physicalSnapshot, owner) {
  const external = externalReceipt(plan, owner);
  external.gpuPageBindingGeneration =
    plan.kind === "ORDERING_REFRESH"
      ? physicalSnapshot
      : physicalSnapshot.gpuGeneration;
  return createSegmentedGlobalPresentationReceipt(plan, external);
}

async function withFixture(createFixture, callback) {
  const fixture = await createFixture();
  try {
    return await callback(decodeSegmentedHierarchyRuntimeIndex(fixture.bytes));
  } finally {
    await fixture.cleanup();
  }
}

function prepareBootstrap(index, maximumSelectedSplats = 6) {
  const cut = createSegmentedActiveCut(index, { maximumSelectedSplats });
  const empty = snapshot(index, []);
  const bootstrap = planSegmentedAssetPageBootstrap(
    index,
    cut,
    empty,
    pageLimits(),
  );
  const held = snapshot(index, bootstrap.requiredCorePageIds, 2);
  return {
    cut,
    empty,
    bootstrap,
    held,
    prepared: prepareSegmentedAssetPageBootstrapPublication(
      index,
      bootstrap,
      held,
    ),
  };
}

function publishBootstrap(index, maximumSelectedSplats = 6) {
  const initial = prepareBootstrap(index, maximumSelectedSplats);
  const plan = createSegmentedGlobalPresentationPlan(
    index,
    initial.prepared,
    null,
    initial.held,
    presentationLimits(),
  );
  const bundle = commitSegmentedGlobalPresentationPublication(
    index,
    initial.prepared,
    receiptFor(plan, initial.held),
    initial.held,
  );
  return { ...initial, plan, bundle };
}

function prepareSingleChild(index, current) {
  const activePlan = planSegmentedActiveCut(index, current.bundle.cut, view(), {
    maximumSelectedSplats: 6,
  });
  const transition = planSegmentedAssetPageTransition(
    index,
    current.bundle.ownership,
    current.bundle.cut,
    activePlan,
    current.held,
    pageLimits(),
  );
  const staged = snapshot(
    index,
    new Set([
      ...current.bundle.ownership.corePageIds,
      ...transition.demandedCorePageIds,
    ]),
    3,
  );
  const prepared = prepareSegmentedAssetPagePublication(
    index,
    current.bundle.cut,
    current.bundle.ownership,
    activePlan,
    transition,
    staged,
    new Uint8Array(activePlan.replacementCount).fill(1),
  );
  return { activePlan, transition, staged, prepared };
}

test("fixed frontier composition is independent of million-leaf inventory size", () => {
  const identity = new Uint32Array(17);
  const fakeIndex = {
    artifactIdentityHex: "million-leaf-fixed-frontier",
    maxShDegree: 0,
    leafCount: 1_000_000,
    pageCount: 1_000_000,
    writeArtifactIdentity(target) {
      target.set(identity);
    },
    readRepresentation(_id, target) {
      target.fill(0);
      target[4] = 0;
      target[5] = 1;
      target[6] = 4;
    },
    readAsset(_id, target) {
      target.fill(0);
      target[2] = 4;
      target[5] = 1;
    },
    readAssetPageIndex() {
      return 0;
    },
    readPage(_id, target) {
      target.fill(0);
      target[2] = 4;
    },
    readNodeCellBounds(node, target) {
      target.set([node, node, 0, node + 1, node + 1, 1]);
    },
  };
  const cut = {
    activeSlotCount: 4,
    selectedSplatCount: 4,
    coverageNodeIndices: Uint32Array.of(10, 11, 12, 13),
    providerRepresentationIds: Uint32Array.of(0, 0, 0, 0),
    providerRangeStarts: Uint32Array.of(0, 1, 2, 3),
    providerRangeCounts: Uint32Array.of(1, 1, 1, 1),
  };
  const composition = composeSegmentedGlobalPresentationSlots(fakeIndex, cut);
  assert.equal(composition.slotCount, 4);
  assert.equal(composition.assetSliceCount, 4);
  assert.equal(composition.fragmentCount, 4);
  assert.ok(composition.byteLength < 1024);
  assert.equal(composition.metrics.maximumScratchSlots, 4);
  assert.notDeepEqual(
    [...composition.slotCropBounds.slice(0, 4)],
    [...composition.slotCropBounds.slice(4, 8)],
    "shared provider must not merge adjacent crop slots",
  );
});

function createLayoutOracle(count, maxShDegree = 0, pageCount = 1) {
  const identity = new Uint32Array(17);
  return {
    artifactIdentityHex: `layout-${count}-${maxShDegree}-${pageCount}`,
    maxShDegree,
    writeArtifactIdentity(target) {
      target.set(identity);
    },
    readRepresentation(_id, target) {
      target.fill(0);
      target[4] = 0;
      target[5] = 1;
      target[6] = count;
    },
    readAsset(_id, target) {
      target.fill(0);
      target[2] = count;
      target[5] = pageCount;
      target[6] = pageCount;
    },
    readAssetPageIndex(position) {
      return position;
    },
    readPage(id, target) {
      const local = id % pageCount;
      const base = Math.floor(count / pageCount);
      const start = local * base;
      target.fill(0);
      target[1] = start;
      target[2] = local === pageCount - 1 ? count - start : base;
    },
    readNodeCellBounds(_node, target) {
      target.set([0, 0, 0, 1, 1, 1]);
    },
  };
}

function composeOracle(index, count, options) {
  return composeSegmentedGlobalPresentationSlots(
    index,
    {
      activeSlotCount: 1,
      selectedSplatCount: count,
      coverageNodeIndices: Uint32Array.of(0),
      providerRepresentationIds: Uint32Array.of(0),
      providerRangeStarts: Uint32Array.of(0),
      providerRangeCounts: Uint32Array.of(count),
    },
    options,
  );
}

test("slot crops retain outward float32 rounding, subnormal edges, and an explicit halo", () => {
  const cases = [
    {
      bounds: [0.1, -0.2, 100, 0.2, -0.1, 101],
      expected: [
        0.09999999403953552, -0.20000000298023224, 0.20000000298023224,
        -0.09999999403953552,
      ],
    },
    {
      bounds: [
        -Number.MIN_VALUE,
        -Number.MIN_VALUE,
        100,
        Number.MIN_VALUE,
        Number.MIN_VALUE,
        101,
      ],
      expected: [-(2 ** -149), -(2 ** -149), 2 ** -149, 2 ** -149],
    },
    {
      bounds: [0.25, 0.5, 100, 0.75, 1, 101],
      halo: 0.125,
      expected: [0.125, 0.375, 0.875, 1.125],
    },
  ];
  for (const { bounds, halo, expected } of cases) {
    const index = {
      ...createLayoutOracle(1),
      readNodeCellBounds(_node, result) {
        result.set(bounds);
        return result;
      },
    };
    const composition = composeOracle(index, 1, { cropHaloMeters: halo });
    assert.deepEqual([...composition.slotCropBounds], expected);
  }
  for (const cropHaloMeters of [-1, NaN, Infinity]) {
    assert.throws(
      () => composeOracle(createLayoutOracle(1), 1, { cropHaloMeters }),
      /crop halo/,
    );
  }
});

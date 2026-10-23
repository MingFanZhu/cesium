import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import nodeTest from "node:test";

import {
  commitSegmentedActiveCutPlan,
  commitSegmentedConvergedActiveCutPlan,
  createSegmentedActiveCut,
  diffSegmentedActiveCutProviders,
  planSegmentedActiveCut,
  planSegmentedConvergedActiveCut,
  planSegmentedReadyActiveCut,
  planSegmentedProgressiveBridgeCut,
  rebaseSegmentedConvergedActiveCutPlan,
  projectSegmentedActiveCutProviders,
  SegmentedNearFirstCandidateHeapForTesting as ViewPriorityCandidateHeap,
  SEGMENTED_ACTIVE_CUT_STOP_REASON as STOP_REASON,
  SEGMENTED_ACTIVE_CUT_TRANSITION as TRANSITION,
} from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedActiveCut.js";
import { decodeSegmentedHierarchyRuntimeIndex } from "../../../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";
import { createRealA4RuntimeFixture } from "./segmentedHierarchyFixture.js";

const test = globalThis.it ?? nodeTest;

function visibleView(identity = "visible") {
  return Object.freeze({
    viewIdentity: identity,
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
    ...visibleView("hidden"),
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

function rotatedView(angle, projectionKind, identity) {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const sceneToClipMatrix =
    projectionKind === "perspective"
      ? [cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0]
      : [cosine, sine, 0, 0, -sine, cosine, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  return Object.freeze({
    ...visibleView(identity),
    sceneToClipMatrix,
    projectionKind,
  });
}

function projectionWords(projection) {
  return {
    representationIds: [...projection.representationIds],
    rangeStarts: [...projection.rangeStarts],
    rangeCounts: [...projection.rangeCounts],
  };
}

function heapCandidate(node, overrides = {}) {
  return {
    node,
    generation: node + 100,
    distanceBand: 0,
    exactDistance: 1,
    priorityProjectedError: 10,
    delta: 1,
    depth: 1,
    prefixHigh: 0,
    prefixLow: node,
    targetRepresentationId: node + 200,
    edge: TRANSITION.LEAF_UPGRADE,
    ...overrides,
  };
}

function popHeapNodes(candidates) {
  const heap = new ViewPriorityCandidateHeap(candidates.length);
  for (const candidate of candidates) {
    heap.push(candidate);
  }
  const nodes = [];
  for (let candidate = heap.pop(); candidate; candidate = heap.pop()) {
    nodes.push(candidate.node);
  }
  return nodes;
}

async function withIndex(callback) {
  const fixture = await createRealA4RuntimeFixture();
  try {
    return await callback(
      decodeSegmentedHierarchyRuntimeIndex(fixture.bytes),
      fixture,
    );
  } finally {
    await fixture.cleanup();
  }
}

test("view-weighted heap prefers projected pressure before distance and delta", () => {
  assert.deepEqual(
    popHeapNodes([
      heapCandidate(1, {
        exactDistance: 9,
        priorityProjectedError: 100,
        delta: 1,
      }),
      heapCandidate(2, {
        exactDistance: 1,
        priorityProjectedError: 1,
        delta: 100,
      }),
    ]),
    [1, 2],
  );
});

test("view-weighted heap uses higher projected pressure at equal distance", () => {
  assert.deepEqual(
    popHeapNodes([
      heapCandidate(1, { priorityProjectedError: 10 }),
      heapCandidate(2, { priorityProjectedError: 11 }),
    ]),
    [2, 1],
  );
});

test("view-weighted heap does not let a distance band override pressure", () => {
  assert.deepEqual(
    popHeapNodes([
      heapCandidate(1, {
        distanceBand: 1,
        exactDistance: 10.001,
        priorityProjectedError: 100,
      }),
      heapCandidate(2, {
        distanceBand: 0,
        exactDistance: 9.999,
        priorityProjectedError: 1,
      }),
    ]),
    [1, 2],
  );
});

test("view-weighted heap preserves canonical ties after pressure, distance, and delta", () => {
  assert.deepEqual(
    popHeapNodes([
      heapCandidate(4, { depth: 2, prefixLow: 0 }),
      heapCandidate(3, { depth: 1, prefixHigh: 1, prefixLow: 0 }),
      heapCandidate(2, { depth: 1, prefixHigh: 0, prefixLow: 2 }),
      heapCandidate(1, { depth: 1, prefixHigh: 0, prefixLow: 1 }),
    ]),
    [1, 2, 3, 4],
  );
});

test("view-weighted heap keeps candidate identities attached through swaps and pops", () => {
  const candidates = [
    heapCandidate(7, {
      exactDistance: 7.25,
      priorityProjectedError: 17,
      delta: 107,
    }),
    heapCandidate(3, {
      exactDistance: 3.25,
      priorityProjectedError: 13,
      delta: 103,
    }),
    heapCandidate(5, {
      exactDistance: 5.25,
      priorityProjectedError: 15,
      delta: 105,
    }),
  ];
  const heap = new ViewPriorityCandidateHeap(candidates.length);
  for (const candidate of candidates) {
    heap.push(candidate);
  }
  for (const expected of [candidates[0], candidates[2], candidates[1]]) {
    const actual = heap.pop();
    assert.equal(actual.node, expected.node);
    assert.equal(actual.generation, expected.generation);
  }
});

function perspectiveBudgetView(position = [0, 0, 0], yaw = 0) {
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);
  const near = 0.1;
  const far = 1000;
  const viewMatrix = [
    cosine,
    0,
    -sine,
    0,
    0,
    1,
    0,
    0,
    sine,
    0,
    cosine,
    0,
    -cosine * position[0] - sine * position[2],
    -position[1],
    sine * position[0] - cosine * position[2],
    1,
  ];
  const projection = [
    1,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    -(far + near) / (far - near),
    -1,
    0,
    0,
    (-2 * near * far) / (far - near),
    0,
  ];
  const matrix = new Array(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      for (let inner = 0; inner < 4; inner++) {
        matrix[column * 4 + row] +=
          projection[inner * 4 + row] * viewMatrix[column * 4 + inner];
      }
    }
  }
  const planes = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const plane = Array.from(
        { length: 4 },
        (_, column) =>
          matrix[column * 4 + 3] + sign * matrix[column * 4 + axis],
      );
      const length = Math.hypot(...plane.slice(0, 3));
      planes.push(plane.map((value) => value / length));
    }
  }
  return Object.freeze({
    viewIdentity: `budget-camera:${position.join(":")}:${yaw}`,
    cameraPositionScene: position,
    frustumPlanesScene: planes,
    sceneToClipMatrix: matrix,
    drawingBufferWidth: 1000,
    drawingBufferHeight: 1000,
    projectionKind: "perspective",
  });
}

function createViewContributionFixture({ contentBounds, cellBounds } = {}) {
  const sideLeaf = 0;
  const targetLeaf = 1;
  const bounds = contentBounds ?? [
    [-1, -2, -14, 9.6, 2, -6],
    [7.9, -2, -8, 9.6, 2, -6],
    [-1, -2, -14, 1, 2, -12],
  ];
  const representationFor = (leaf, level) => leaf * 2 + (level === 0 ? 2 : 1);
  const index = Object.freeze({
    artifactIdentityHex: "view-contribution-fixture",
    rootNodeIndex: 0,
    nodeCount: 3,
    leafCount: 2,
    representationCount: 5,
    segmentCount: 2,
    writeArtifactIdentity(scratch) {
      scratch.fill(17);
      return scratch;
    },
    readNodeTopology(node, scratch) {
      scratch.set(
        node === 0
          ? [0xffffffff, 1, 3, 0, 0, 0, 0, 2]
          : [0, 0, 0, 1, node - 1, 0, node - 1, 1],
      );
      return scratch;
    },
    readNodeContentBounds(node, scratch) {
      scratch.set(bounds[node]);
      return scratch;
    },
    readNodeCellBounds(node, scratch) {
      scratch.set((cellBounds ?? bounds)[node]);
      return scratch;
    },
    readNodeProxy(node, scratch) {
      scratch.set(
        node === 0 ? [0, 2, 10, 2] : [representationFor(node - 1, 1), 1, 1, 1],
      );
      return scratch;
    },
    readRepresentation(id, scratch) {
      scratch.fill(0);
      const node = id === 0 ? 0 : Math.ceil(id / 2);
      const exact = id !== 0 && id % 2 === 0;
      scratch[0] = node;
      scratch[1] = id === 0 ? 0xffffffff : exact ? 0 : 1;
      scratch[3] = id === 0 ? 2 : 0;
      scratch[6] = exact ? 100 : 50;
      scratch[9] = id === 0 ? 10 : exact ? 0 : 1;
      scratch[10] = id === 0 ? 2 : 1;
      return scratch;
    },
    readRepresentationConservativeError(id) {
      return this.readRepresentation(id, new Float64Array(12))[9];
    },
    readRepresentationVisualError(id) {
      return this.readRepresentationConservativeError(id);
    },
    readSegment(segment, scratch) {
      scratch.set([0, segment + 1, segment * 25, 25, 1, 10, 1]);
      return scratch;
    },
    readSegmentConservativeError() {
      return 10;
    },
    readSegmentVisualError() {
      return 10;
    },
    leafRepresentationId: representationFor,
  });
  return { index, sideLeaf, targetLeaf };
}

function selectedLeafRepresentation(cut, index, leaf) {
  const nodes = cut.coverageNodeIndices;
  const representations = cut.providerRepresentationIds;
  for (let slot = 0; slot < nodes.length; slot++) {
    const topology = index.readNodeTopology(nodes[slot], new Uint32Array(8));
    if (topology[2] === 0 && topology[6] === leaf) {
      return representations[slot];
    }
  }
  assert.fail("Expected the selected cut to expose the fixture leaf");
}

test("canonical planning bounds heap storage by the artifact while retaining logical coverage admission", () => {
  const { index, targetLeaf } = createViewContributionFixture();
  for (const maximumCoverageSlots of [1, 2, 200_000]) {
    const policy = {
      maximumSelectedSplats: 150,
      maximumCoverageSlots,
      minimumLeafLogicalLevel: 0,
      refineErrorPixels: 16,
      coarsenErrorPixels: 12,
    };
    const root = createSegmentedActiveCut(index, policy);
    const plan = planSegmentedConvergedActiveCut(
      index,
      root,
      perspectiveBudgetView(),
      policy,
    );
    assert.equal(plan.metrics.maximumCoverageSlots, maximumCoverageSlots);
    assert.ok(plan.metrics.candidateHeapCapacity <= index.nodeCount);
    assert.ok(plan.metrics.candidateHeapCapacity <= maximumCoverageSlots);
    assert.ok(
      plan.metrics.maximumCandidateHeapSize <=
        plan.metrics.candidateHeapCapacity,
    );
    assert.ok(plan.finalCut.activeSlotCount <= maximumCoverageSlots);
    if (maximumCoverageSlots === 1) {
      assert.equal(plan.finalCut.activeSlotCount, 1);
      assert.equal(plan.finalCut.selectedSplatCount, root.selectedSplatCount);
      assert.equal(plan.stopReason, STOP_REASON.FRONTIER_LIMITED);
    } else {
      assert.equal(plan.finalCut.activeSlotCount, 2);
      assert.equal(
        plan.finalCut.selectedSplatCount,
        policy.maximumSelectedSplats,
      );
      assert.equal(
        selectedLeafRepresentation(plan.finalCut, index, targetLeaf),
        index.leafRepresentationId(targetLeaf, 0),
      );
    }
  }
});

test("view contribution redirects a fixed-position budget from a nearer edge to the viewed leaf", () => {
  const { index, sideLeaf, targetLeaf } = createViewContributionFixture();
  const policy = {
    maximumSelectedSplats: 150,
    maximumCoverageSlots: 2,
    minimumLeafLogicalLevel: 0,
    refineErrorPixels: 16,
    coarsenErrorPixels: 12,
  };
  const root = createSegmentedActiveCut(index, policy);
  const front = perspectiveBudgetView();
  const turned = perspectiveBudgetView(front.cameraPositionScene, 0.85);
  const frontCut = planSegmentedConvergedActiveCut(
    index,
    root,
    front,
    policy,
  ).finalCut;
  const turnedCut = planSegmentedConvergedActiveCut(
    index,
    frontCut,
    turned,
    policy,
  ).finalCut;
  assert.deepEqual(front.cameraPositionScene, turned.cameraPositionScene);
  assert.equal(
    selectedLeafRepresentation(frontCut, index, targetLeaf),
    index.leafRepresentationId(targetLeaf, 0),
  );
  assert.equal(
    selectedLeafRepresentation(frontCut, index, sideLeaf),
    index.leafRepresentationId(sideLeaf, 1),
  );
  assert.equal(
    selectedLeafRepresentation(turnedCut, index, sideLeaf),
    index.leafRepresentationId(sideLeaf, 0),
  );
  assert.equal(
    selectedLeafRepresentation(turnedCut, index, targetLeaf),
    index.leafRepresentationId(targetLeaf, 1),
  );
  assert.equal(frontCut.selectedSplatCount, policy.maximumSelectedSplats);
  assert.equal(turnedCut.selectedSplatCount, policy.maximumSelectedSplats);
});

test("view contribution allows a viewed leaf to reach L0 as the camera approaches", () => {
  const { index, targetLeaf } = createViewContributionFixture();
  const policy = {
    maximumSelectedSplats: 200,
    maximumCoverageSlots: 2,
    minimumLeafLogicalLevel: 0,
    refineErrorPixels: 16,
    coarsenErrorPixels: 12,
  };
  const root = createSegmentedActiveCut(index, policy);
  const far = perspectiveBudgetView([0, 0, 25]);
  const near = perspectiveBudgetView([0, 0, 0]);
  const farCut = planSegmentedConvergedActiveCut(
    index,
    root,
    far,
    policy,
  ).finalCut;
  const nearCut = planSegmentedConvergedActiveCut(
    index,
    farCut,
    near,
    policy,
  ).finalCut;
  assert.equal(
    selectedLeafRepresentation(farCut, index, targetLeaf),
    index.leafRepresentationId(targetLeaf, 1),
  );
  assert.equal(
    selectedLeafRepresentation(nearCut, index, targetLeaf),
    index.leafRepresentationId(targetLeaf, 0),
  );
  assert.ok(nearCut.selectedSplatCount <= policy.maximumSelectedSplats);
  assert.equal(nearCut.metrics.coverageHoleCount, 0);
  assert.equal(nearCut.metrics.coverageOverlapCount, 0);
});

test("ownership ranking redirects budget from camera-containing empty bounds to the viewed leaf", () => {
  const contentBounds = [
    [-1, -2, -14, 9.6, 2, 1],
    [-1, -2, -8, 9.6, 2, 1],
    [-1, -2, -14, 1, 2, -12],
  ];
  const cellBounds = [
    contentBounds[0],
    [7.9, -2, -8, 9.6, 2, -6],
    contentBounds[2],
  ];
  const { index, sideLeaf, targetLeaf } = createViewContributionFixture({
    contentBounds,
    cellBounds,
  });
  const policy = {
    maximumSelectedSplats: 150,
    maximumCoverageSlots: 2,
    minimumLeafLogicalLevel: 0,
    refineErrorPixels: 16,
    coarsenErrorPixels: 12,
  };
  const plan = planSegmentedConvergedActiveCut(
    index,
    createSegmentedActiveCut(index, policy),
    perspectiveBudgetView(),
    policy,
  );
  assert.equal(
    selectedLeafRepresentation(plan.finalCut, index, targetLeaf),
    index.leafRepresentationId(targetLeaf, 0),
  );
  assert.equal(
    selectedLeafRepresentation(plan.finalCut, index, sideLeaf),
    index.leafRepresentationId(sideLeaf, 1),
  );
  assert.equal(plan.finalCut.selectedSplatCount, 150);
  assert.equal(plan.finalCut.metrics.coverageHoleCount, 0);
  assert.equal(plan.finalCut.metrics.coverageOverlapCount, 0);
  assert.match(
    plan.policyIdentity,
    /active-cut-v5:xy-ownership:content-z:edge-pixel-floor/,
  );
});

test("ownership ranking preserves an offscreen center's visible footprint and conservative refinement eligibility", () => {
  const contentBounds = [
    [0.1, -1, -3, 8, 1, -0.5],
    [1.5, -1, -3, 8, 1, -2],
    [0.1, -0.1, -1, 0.3, 0.1, -0.5],
  ];
  // x=8 touches the content bound: the intersection is nonempty even though
  // its projection has zero area. x=8.5 makes that intersection truly empty.
  for (const edgeX of [4, 8, 8.5]) {
    const { index, sideLeaf, targetLeaf } = createViewContributionFixture({
      contentBounds,
      cellBounds: [
        contentBounds[0],
        [edgeX, -1, -3, 9, 1, -2],
        [10, -1, -1, 11, 1, -0.5],
      ],
    });
    const policy = {
      maximumSelectedSplats: 150,
      maximumCoverageSlots: 2,
      minimumLeafLogicalLevel: 0,
      refineErrorPixels: 16,
      coarsenErrorPixels: 12,
    };
    const root = createSegmentedActiveCut(index, policy);
    const constrained = planSegmentedConvergedActiveCut(
      index,
      root,
      perspectiveBudgetView(),
      policy,
    );
    const preferred = edgeX <= 8 ? sideLeaf : targetLeaf;
    assert.equal(
      selectedLeafRepresentation(constrained.finalCut, index, preferred),
      index.leafRepresentationId(preferred, 0),
    );
    assert.equal(constrained.metrics.visibleOverThresholdSlotCount, 1);
    assert.equal(constrained.metrics.qualityCandidateCount, 1);
    assert.equal(constrained.stopReason, STOP_REASON.BUDGET_LIMITED);
    const availablePolicy = { ...policy, maximumSelectedSplats: 200 };
    const available = planSegmentedConvergedActiveCut(
      index,
      createSegmentedActiveCut(index, availablePolicy),
      perspectiveBudgetView(),
      availablePolicy,
    );
    assert.equal(
      selectedLeafRepresentation(available.finalCut, index, sideLeaf),
      index.leafRepresentationId(sideLeaf, 0),
    );
    assert.equal(
      selectedLeafRepresentation(available.finalCut, index, targetLeaf),
      index.leafRepresentationId(targetLeaf, 0),
    );
    assert.equal(available.finalCut.selectedSplatCount, 200);
    assert.equal(available.stopReason, STOP_REASON.SSE_SATISFIED);
  }
});

test("ownership ranking retains content Z and near-to-far LOD behavior", () => {
  const cellBounds = [
    [-1, -2, 100, 9.6, 2, 101],
    [7.9, -2, 100, 9.6, 2, 101],
    [-1, -2, 100, 1, 2, 101],
  ];
  const { index, sideLeaf, targetLeaf } = createViewContributionFixture({
    cellBounds,
  });
  const policy = {
    maximumSelectedSplats: 150,
    maximumCoverageSlots: 2,
    minimumLeafLogicalLevel: 0,
    refineErrorPixels: 16,
    coarsenErrorPixels: 12,
  };
  const root = createSegmentedActiveCut(index, policy);
  for (const [view, preferred] of [
    [perspectiveBudgetView(), targetLeaf],
    [perspectiveBudgetView([0, 0, 0], 0.85), sideLeaf],
  ]) {
    const cut = planSegmentedConvergedActiveCut(
      index,
      root,
      view,
      policy,
    ).finalCut;
    assert.equal(
      selectedLeafRepresentation(cut, index, preferred),
      index.leafRepresentationId(preferred, 0),
    );
    assert.equal(cut.selectedSplatCount, 150);
  }
  const farPolicy = { ...policy, maximumSelectedSplats: 200 };
  const far = planSegmentedConvergedActiveCut(
    index,
    createSegmentedActiveCut(index, farPolicy),
    perspectiveBudgetView([0, 0, 25]),
    farPolicy,
  ).finalCut;
  assert.equal(
    selectedLeafRepresentation(far, index, targetLeaf),
    index.leafRepresentationId(targetLeaf, 1),
  );
});

test("canonical ownership ranking requires cell bounds without changing the incremental index protocol", () => {
  const fixture = createViewContributionFixture();
  const index = { ...fixture.index };
  delete index.readNodeCellBounds;
  const root = createSegmentedActiveCut(index, { maximumSelectedSplats: 150 });
  assert.doesNotThrow(() =>
    planSegmentedActiveCut(index, root, perspectiveBudgetView(), {
      maximumSelectedSplats: 150,
    }),
  );
  assert.throws(
    () =>
      planSegmentedConvergedActiveCut(index, root, perspectiveBudgetView(), {
        maximumSelectedSplats: 150,
      }),
    /readNodeCellBounds/,
  );
});

test("root bootstrap and resource-neutral split preserve exact providers", async () => {
  await withIndex((index) => {
    const cut = createSegmentedActiveCut(index, {
      maximumSelectedSplats: 6,
    });
    assert.deepEqual([...cut.coverageNodeIndices], [0]);
    assert.equal(cut.selectedSplatCount, 5);
    assert.throws(
      () => createSegmentedActiveCut(index, { maximumSelectedSplats: 4 }),
      /Root proxy exceeds/,
    );

    const before = projectSegmentedActiveCutProviders(index, cut);
    const plan = planSegmentedActiveCut(index, cut, visibleView(), {
      maximumSelectedSplats: 6,
    });
    assert.equal(plan.metrics.splitCount, 1);
    assert.equal(plan.projectedCut.activeSlotCount, 4);
    assert.equal(plan.projectedCut.selectedSplatCount, cut.selectedSplatCount);
    assert.deepEqual(
      projectionWords(
        projectSegmentedActiveCutProviders(index, plan.projectedCut),
      ),
      projectionWords(before),
    );
    const neutralDiff = diffSegmentedActiveCutProviders(
      index,
      cut,
      plan.projectedCut,
    );
    assert.equal(neutralDiff.addedIntervalCount, 0);
    assert.equal(neutralDiff.removedIntervalCount, 0);
  });
});

test("current-budget admission and partial readiness replace only child 2", async () => {
  await withIndex((index) => {
    const cut = createSegmentedActiveCut(index, {
      maximumSelectedSplats: 6,
    });
    const plan = planSegmentedActiveCut(index, cut, visibleView(), {
      maximumSelectedSplats: 6,
    });
    assert.ok(plan.metrics.candidateCount >= 2);
    assert.equal(plan.metrics.admittedUpgradeCount, 1);
    assert.equal(plan.replacementCount, 1);
    assert.deepEqual([...plan.replacementKinds], [TRANSITION.INTERNAL_UPGRADE]);
    assert.deepEqual([...plan.replacementCoverageNodeIndices], [2]);

    const zero = commitSegmentedActiveCutPlan(
      index,
      cut,
      plan,
      new Uint8Array(plan.replacementCount),
    );
    assert.deepEqual(
      projectionWords(projectSegmentedActiveCutProviders(index, zero.cut)),
      projectionWords(projectSegmentedActiveCutProviders(index, cut)),
    );
    assert.equal(zero.cut.selectedSplatCount, 5);

    const partial = commitSegmentedActiveCutPlan(
      index,
      cut,
      plan,
      Uint8Array.of(1),
    );
    assert.equal(partial.cut.activeSlotCount, 4);
    assert.equal(partial.cut.selectedSplatCount, 6);
    assert.deepEqual([...partial.cut.coverageNodeIndices], [1, 2, 3, 4]);
    const providerIds = partial.cut.providerRepresentationIds;
    assert.equal(providerIds[0], providerIds[2]);
    assert.equal(providerIds[0], providerIds[3]);
    assert.notEqual(providerIds[1], providerIds[0]);
    assert.deepEqual([...partial.diff.removedRangeStarts], [2]);
    assert.deepEqual([...partial.diff.removedRangeCounts], [1]);
    assert.deepEqual([...partial.diff.addedRangeStarts], [0]);
    assert.deepEqual([...partial.diff.addedRangeCounts], [2]);
    assert.equal(partial.metrics.readyCommittedCount, 1);
    assert.equal(partial.metrics.coverageHoleCount, 0);
    assert.equal(partial.metrics.coverageOverlapCount, 0);
  });
});

test("plan/commit binding, readiness, view, budget, and determinism fail closed", async () => {
  await withIndex((index) => {
    const cut = createSegmentedActiveCut(index, {
      maximumSelectedSplats: 6,
    });
    const first = planSegmentedActiveCut(index, cut, visibleView("repeat"), {
      maximumSelectedSplats: 6,
    });
    const second = planSegmentedActiveCut(index, cut, visibleView("repeat"), {
      maximumSelectedSplats: 6,
    });
    assert.deepEqual([...first.replacementKinds], [...second.replacementKinds]);
    assert.deepEqual(
      [...first.newRepresentationIds],
      [...second.newRepresentationIds],
    );
    assert.deepEqual([...first.deltas], [...second.deltas]);
    const committed = commitSegmentedActiveCutPlan(
      index,
      cut,
      first,
      Uint8Array.of(1),
    );
    assert.throws(
      () =>
        commitSegmentedActiveCutPlan(
          index,
          committed.cut,
          first,
          Uint8Array.of(1),
        ),
      /stale or rebound/,
    );
    assert.throws(
      () => commitSegmentedActiveCutPlan(index, cut, first, new Uint8Array(0)),
      /exactly match/,
    );
    assert.throws(
      () => commitSegmentedActiveCutPlan(index, cut, first, Uint8Array.of(2)),
      /zero or one/,
    );
    assert.throws(
      () =>
        planSegmentedActiveCut(index, cut, visibleView(), {
          maximumSelectedSplats: 5,
        }),
      /budget must equal/,
    );
    assert.throws(
      () =>
        planSegmentedActiveCut(
          index,
          cut,
          { ...visibleView() },
          {
            maximumSelectedSplats: 6,
          },
        ),
      /projected frozen view/,
    );
    assert.throws(
      () => projectSegmentedActiveCutProviders(index, {}),
      /canonical segmented active cut/,
    );
  });
});

test("full clip-row norms are rotation-invariant for both projection kinds", async () => {
  await withIndex((index) => {
    const cut = createSegmentedActiveCut(index, {
      maximumSelectedSplats: 1000,
    });
    const options = {
      maximumSelectedSplats: 1000,
      refineErrorPixels: 0.0001,
      coarsenErrorPixels: 0,
    };
    function replacementWords(plan) {
      return {
        kinds: [...plan.replacementKinds],
        nodes: [...plan.replacementCoverageNodeIndices],
        oldIds: [...plan.oldRepresentationIds],
        newIds: [...plan.newRepresentationIds],
        deltas: [...plan.deltas],
      };
    }
    for (const projectionKind of ["perspective", "orthographic"]) {
      const identity = planSegmentedActiveCut(
        index,
        cut,
        rotatedView(0, projectionKind, `${projectionKind}-identity`),
        options,
      );
      const quarterTurn = planSegmentedActiveCut(
        index,
        cut,
        rotatedView(
          Math.PI / 2,
          projectionKind,
          `${projectionKind}-quarter-turn`,
        ),
        options,
      );
      const oblique = planSegmentedActiveCut(
        index,
        cut,
        rotatedView(Math.PI / 5, projectionKind, `${projectionKind}-oblique`),
        options,
      );
      assert.ok(identity.replacementCount > 0);
      assert.deepEqual(
        replacementWords(quarterTurn),
        replacementWords(identity),
      );
      assert.deepEqual(replacementWords(oblique), replacementWords(identity));
    }
    assert.throws(
      () =>
        planSegmentedActiveCut(
          index,
          cut,
          Object.freeze({
            ...rotatedView(0, "orthographic", "degenerate"),
            sceneToClipMatrix: Array(16).fill(0),
          }),
          options,
        ),
      /projection inputs are invalid/,
    );
  });
});

function createProceduralOracle(
  dormantLeafCount,
  candidateCount = 0,
  zeroDeltaFirst = false,
  rootMask = (1 << (candidateCount === 0 ? 4 : candidateCount)) - 1,
  rootError = 0,
) {
  const identity = Uint32Array.from({ length: 17 }, (_, index) => index + 1);
  const exposedChildCount = candidateCount === 0 ? 4 : candidateCount;
  const rootCount = candidateCount === 0 ? 10 : candidateCount;
  function childInterval(ordinal) {
    const quotient = Math.floor(dormantLeafCount / exposedChildCount);
    const remainder = dormantLeafCount % exposedChildCount;
    return {
      firstLeaf: ordinal * quotient + Math.min(ordinal, remainder),
      leafCount: quotient + Number(ordinal < remainder),
    };
  }
  return Object.freeze({
    artifactIdentityHex: "procedural-million",
    rootNodeIndex: 0,
    nodeCount: dormantLeafCount * 2 + 5,
    leafCount: dormantLeafCount,
    representationCount: dormantLeafCount + 5,
    segmentCount: Math.max(4, dormantLeafCount - 1),
    writeArtifactIdentity(scratch) {
      scratch.set(identity);
      return scratch;
    },
    readNodeTopology(nodeIndex, scratch) {
      if (nodeIndex === 0) {
        scratch.set([0xffffffff, 1, rootMask, 0, 0, 0, 0, dormantLeafCount]);
        return scratch;
      }
      if (candidateCount === 0 || nodeIndex > candidateCount) {
        throw new Error("dormant procedural Node was visited");
      }
      const interval = childInterval(nodeIndex - 1);
      scratch.set([
        0,
        1 + exposedChildCount + nodeIndex,
        1,
        1,
        nodeIndex - 1,
        0,
        interval.firstLeaf,
        interval.leafCount,
      ]);
      return scratch;
    },
    readNodeContentBounds(nodeIndex, scratch) {
      if (nodeIndex > candidateCount) {
        throw new Error("dormant procedural bounds were visited");
      }
      scratch.set([0, 0, 0, 1, 1, 1]);
      return scratch;
    },
    readNodeCellBounds(nodeIndex, scratch) {
      return this.readNodeContentBounds(nodeIndex, scratch);
    },
    readNodeProxy(nodeIndex, scratch) {
      if (nodeIndex === 0) {
        scratch.set([0, dormantLeafCount, candidateCount === 0 ? 0 : 10, 10]);
        return scratch;
      }
      if (nodeIndex > candidateCount) {
        throw new Error("dormant procedural proxy was visited");
      }
      scratch.set([nodeIndex, childInterval(nodeIndex - 1).leafCount, 1, 1]);
      return scratch;
    },
    readRepresentation(representationId, scratch) {
      if (representationId > candidateCount) {
        throw new Error("dormant procedural Representation was visited");
      }
      scratch.fill(0);
      scratch[0] = representationId;
      scratch[1] = 0xffffffff;
      scratch[2] = 0;
      scratch[3] = representationId === 0 ? exposedChildCount : 1;
      scratch[6] =
        representationId === 0
          ? rootCount
          : zeroDeltaFirst && representationId === 1
            ? 1
            : 2;
      scratch[7] = 2;
      scratch[8] = dormantLeafCount;
      scratch[9] =
        representationId === 0
          ? candidateCount === 0
            ? rootError
            : 10
          : representationId === 1 && zeroDeltaFirst
            ? 0.5
            : 1;
      scratch[10] = 1;
      return scratch;
    },
    readRepresentationConservativeError(representationId) {
      return this.readRepresentation(representationId, new Float64Array(12))[9];
    },
    readRepresentationVisualError(representationId) {
      return this.readRepresentationConservativeError(representationId);
    },
    readSegment(segmentId, scratch) {
      if (candidateCount === 0 || segmentId >= candidateCount) {
        throw new Error("dormant procedural Segment was visited");
      }
      const child = segmentId + 1;
      scratch.set([
        0,
        child,
        segmentId,
        1,
        childInterval(segmentId).leafCount,
        10,
        1,
      ]);
      return scratch;
    },
    readSegmentConservativeError(segmentId) {
      return this.readSegment(segmentId, new Float64Array(8))[5];
    },
    readSegmentVisualError(segmentId) {
      return this.readSegmentConservativeError(segmentId);
    },
    leafRepresentationId() {
      if (rootMask === 0) {
        return 0;
      }
      throw new Error("dormant procedural leaf was visited");
    },
  });
}

test("near-first admission skips an unfit nearer edge and admits a later fit", () => {
  const base = createProceduralOracle(2, 2);
  const index = Object.freeze({
    ...base,
    readNodeContentBounds(nodeIndex, scratch) {
      if (nodeIndex > 2) {
        throw new Error("dormant procedural bounds were visited");
      }
      const distance = nodeIndex;
      scratch.set([44 + distance, 5, 25, 44.1 + distance, 5.1, 25.1]);
      return scratch;
    },
    readRepresentation(representationId, scratch) {
      base.readRepresentation(representationId, scratch);
      if (representationId === 0) {
        scratch[6] = 10;
      } else if (representationId === 1) {
        scratch[6] = 11;
        scratch[9] = 0;
      } else if (representationId === 2) {
        scratch[6] = 9;
        scratch[9] = 0;
      }
      return scratch;
    },
    readSegment(segmentId, scratch) {
      base.readSegment(segmentId, scratch);
      scratch[2] = segmentId * 5;
      scratch[3] = 5;
      return scratch;
    },
    readRepresentationConservativeError(representationId) {
      return representationId === 0 ? 10 : 0;
    },
    readRepresentationVisualError(representationId) {
      return representationId === 0 ? 10 : 0;
    },
    readSegmentConservativeError() {
      return 10;
    },
    readSegmentVisualError() {
      return 10;
    },
  });
  const options = {
    maximumSelectedSplats: 14,
    refineErrorPixels: 16,
    coarsenErrorPixels: 12,
  };
  const root = createSegmentedActiveCut(index, options);
  const result = planSegmentedConvergedActiveCut(
    index,
    root,
    visibleView("skip-unfit-near"),
    options,
  );
  assert.equal(result.finalCut.selectedSplatCount, 14);
  assert.ok(result.metrics.skippedBudgetCandidateCount > 0);
  assert.deepEqual([...result.finalCut.coverageNodeIndices], [1, 2]);
  assert.deepEqual([...result.finalCut.providerRepresentationIds], [0, 2]);
  assert.deepEqual([...result.finalCut.providerRangeCounts], [5, 9]);
});

test("octree coverage keeps all eight dense children and non-contiguous octants", () => {
  for (const [childCount, mask] of [
    [8, 0xff],
    [4, 0b10101010],
    [2, 0b10000001],
  ]) {
    const index = createProceduralOracle(childCount, childCount, false, mask);
    const cut = createSegmentedActiveCut(index, {
      maximumSelectedSplats: childCount * 2,
    });
    const plan = planSegmentedActiveCut(
      index,
      cut,
      visibleView(`octree-${childCount}`),
      { maximumSelectedSplats: childCount * 2 },
    );
    assert.equal(plan.projectedCut.activeSlotCount, childCount);
    assert.deepEqual(
      [...plan.projectedCut.coverageNodeIndices],
      Array.from({ length: childCount }, (_, ordinal) => ordinal + 1),
    );
    assert.equal(plan.projectedCut.metrics.coverageHoleCount, 0);
    assert.equal(plan.projectedCut.metrics.coverageOverlapCount, 0);
    assert.equal(plan.metrics.admittedUpgradeCount, 1);
  }
});

test("converged plans distinguish SSE, budget, and exhausted detail", () => {
  const sseIndex = createProceduralOracle(4, 0, false, 0, 0);
  const sseCut = createSegmentedActiveCut(sseIndex, {
    maximumSelectedSplats: 10,
  });
  const sse = planSegmentedConvergedActiveCut(
    sseIndex,
    sseCut,
    visibleView("sse-stop"),
    { maximumSelectedSplats: 10 },
  );
  assert.equal(sse.stopReason, STOP_REASON.SSE_SATISFIED);
  assert.equal(sse.metrics.visibleOverThresholdSlotCount, 0);
  assert.equal(sse.metrics.visibleNeedsRefinementSlotCount, 0);
  assert.equal(sse.metrics.detailExhaustedSlotCount, 0);

  const budgetIndex = createProceduralOracle(4, 4);
  const budgetCut = createSegmentedActiveCut(budgetIndex, {
    maximumSelectedSplats: 4,
  });
  const budget = planSegmentedConvergedActiveCut(
    budgetIndex,
    budgetCut,
    visibleView("budget-stop"),
    { maximumSelectedSplats: 4 },
  );
  assert.equal(budget.stopReason, STOP_REASON.BUDGET_LIMITED);
  assert.ok(budget.metrics.visibleOverThresholdSlotCount > 0);
  assert.ok(budget.metrics.qualityCandidateCount > 0);
  assert.equal(budget.metrics.budgetAdmissibleCandidateCount, 0);

  const exhaustedIndex = createProceduralOracle(4, 0, false, 0, 10);
  const exhaustedCut = createSegmentedActiveCut(exhaustedIndex, {
    maximumSelectedSplats: 10,
  });
  const exhausted = planSegmentedConvergedActiveCut(
    exhaustedIndex,
    exhaustedCut,
    visibleView("detail-stop"),
    { maximumSelectedSplats: 10 },
  );
  assert.equal(exhausted.stopReason, STOP_REASON.DETAIL_EXHAUSTED);
  assert.ok(exhausted.metrics.visibleOverThresholdSlotCount > 0);
  assert.equal(exhausted.metrics.qualityCandidateCount, 0);
  assert.equal(exhausted.metrics.detailExhaustedSlotCount, 1);
  assert.equal(exhausted.metrics.visibleNeedsRefinementSlotCount, 1);
  assert.equal(exhausted.metrics.plateauBlockedCandidateCount, 0);
});

function createTerminalStatusOracle({
  segmentErrors = [10, 10],
  targetErrors = [10, 10],
  coverage = 1,
  targetCount = 2,
} = {}) {
  const base = createProceduralOracle(2, 2);
  return Object.freeze({
    ...base,
    readNodeContentBounds(_node, scratch) {
      scratch.set([54, 5, 25, 55, 6, 26]);
      return scratch;
    },
    readRepresentation(id, scratch) {
      base.readRepresentation(id, scratch);
      scratch[9] = id === 0 ? 10 : targetErrors[id - 1];
      scratch[10] = id === 0 ? coverage * 2 : coverage;
      if (id !== 0) {
        scratch[6] = targetCount;
      }
      return scratch;
    },
    readSegment(id, scratch) {
      base.readSegment(id, scratch);
      scratch[5] = segmentErrors[id];
      scratch[6] = coverage;
      return scratch;
    },
  });
}

function terminalStatusPlan(index, options = {}, view = visibleView()) {
  const policy = {
    maximumSelectedSplats: 10,
    refineErrorPixels: 16,
    coarsenErrorPixels: 12,
    ...options,
  };
  return planSegmentedConvergedActiveCut(
    index,
    createSegmentedActiveCut(index, policy),
    view,
    policy,
  );
}

test("ready intermediate cut keeps sibling fallback and rebases the exact frozen final target", () => {
  const index = createTerminalStatusOracle({ targetErrors: [0, 0] });
  const policy = { maximumSelectedSplats: 4, maximumCoverageSlots: 2 };
  const current = createSegmentedActiveCut(index, policy);
  const view = visibleView();
  const final = planSegmentedConvergedActiveCut(index, current, view, policy);
  assert.deepEqual([...final.finalCut.providerRepresentationIds], [1, 2]);
  const mixed = planSegmentedReadyActiveCut(
    index,
    current,
    final,
    view,
    Uint8Array.of(1, 0),
  );
  assert.deepEqual([...mixed.finalCut.coverageNodeIndices], [1, 2]);
  assert.deepEqual([...mixed.finalCut.providerRepresentationIds], [1, 0]);
  assert.equal(mixed.finalCut.selectedSplatCount, 3);
  assert.equal(mixed.isIntermediate, true);
  assert.equal(mixed.metrics.readyUpgradeCount, 1);
  assert.equal(
    commitSegmentedConvergedActiveCutPlan(index, current, mixed, view)
      .exactFinalTarget,
    false,
  );
  const rebased = rebaseSegmentedConvergedActiveCutPlan(
    index,
    mixed.finalCut,
    final,
    view,
  );
  assert.equal(rebased.finalCut, final.finalCut);
  assert.equal(
    commitSegmentedConvergedActiveCutPlan(index, mixed.finalCut, rebased, view)
      .cut,
    final.finalCut,
  );
  assert.throws(
    () =>
      rebaseSegmentedConvergedActiveCutPlan(
        index,
        mixed.finalCut,
        final,
        visibleView("stale"),
      ),
    /stale/,
  );
  assert.throws(
    () =>
      planSegmentedReadyActiveCut(
        index,
        current,
        final,
        view,
        Uint8Array.of(1),
      ),
    /flags/,
  );
  const none = planSegmentedReadyActiveCut(
    index,
    current,
    final,
    view,
    Uint8Array.of(0, 0),
  );
  assert.equal(none.finalCut, current);
  assert.equal(none.stepCount, 0);
});

test("ready intermediate cut does not spend a coarsening that is not ready", () => {
  const base = createTerminalStatusOracle({ targetErrors: [0, 0] });
  const index = Object.freeze({
    ...base,
    readNodeContentBounds(node, scratch) {
      const x = node === 2 ? 64 : 54;
      scratch.set([x, 5, 25, x + 1, 6, 26]);
      return scratch;
    },
  });
  const policy = { maximumSelectedSplats: 3, maximumCoverageSlots: 2 };
  const root = createSegmentedActiveCut(index, policy);
  const current = planSegmentedConvergedActiveCut(
    index,
    root,
    visibleView(),
    policy,
  ).finalCut;
  const otherView = Object.freeze({
    ...visibleView("other"),
    cameraPositionScene: [80, 5, 25],
  });
  const final = planSegmentedConvergedActiveCut(
    index,
    current,
    otherView,
    policy,
  );
  assert.deepEqual([...current.providerRepresentationIds], [1, 0]);
  assert.deepEqual([...final.finalCut.providerRepresentationIds], [0, 2]);
  const blocked = planSegmentedReadyActiveCut(
    index,
    current,
    final,
    otherView,
    Uint8Array.of(0, 1),
  );
  assert.equal(blocked.finalCut, current);
  assert.equal(blocked.stepCount, 0);
  const ready = planSegmentedReadyActiveCut(
    index,
    current,
    final,
    otherView,
    Uint8Array.of(1, 1),
  );
  assert.equal(ready.finalCut, final.finalCut);
  assert.equal(ready.finalCut.selectedSplatCount, 3);
});

function createReadyBridgeOracle() {
  const base = createProceduralOracle(4, 2);
  const rows = [
    [0xffffffff, 1, 3, 0, 0, 0, 0, 4],
    [0, 3, 3, 1, 0, 0, 0, 2],
    [0, 5, 3, 1, 1, 0, 2, 2],
    [1, 0, 0, 2, 0, 0, 0, 1],
    [1, 0, 0, 2, 1, 0, 1, 1],
    [2, 0, 0, 2, 2, 0, 2, 1],
    [2, 0, 0, 2, 3, 0, 3, 1],
  ];
  const index = Object.freeze({
    ...base,
    nodeCount: 7,
    representationCount: 7,
    segmentCount: 6,
    readNodeTopology(node, scratch) {
      scratch.set(rows[node]);
      return scratch;
    },
    readNodeContentBounds(_node, scratch) {
      scratch.set([54, 5, 25, 55, 6, 26]);
      return scratch;
    },
    readNodeProxy(node, scratch) {
      scratch.set([
        node,
        rows[node][7],
        node === 0 ? 100 : node < 3 ? 10 : 0,
        1,
      ]);
      return scratch;
    },
    readRepresentation(id, scratch) {
      scratch.fill(0);
      scratch[0] = id;
      scratch[1] = id < 3 ? 0xffffffff : 0;
      scratch[2] = id * 2;
      scratch[3] = id < 3 ? 2 : 0;
      scratch[6] = 4;
      scratch[9] = id === 0 ? 100 : id < 3 ? 10 : 0;
      scratch[10] = 1;
      return scratch;
    },
    readSegment(id, scratch) {
      const parent = Math.floor(id / 2);
      const node = id + 1;
      scratch.set([
        parent,
        node,
        (id % 2) * 2,
        2,
        rows[node][7],
        parent === 0 ? 100 : 10,
        1,
      ]);
      return scratch;
    },
    leafRepresentationId(leaf) {
      return leaf + 3;
    },
  });
  return index;
}

test("ready intermediate cut requires a complete descendant group beneath a parent Segment", () => {
  const index = createReadyBridgeOracle();
  const policy = { maximumSelectedSplats: 16, maximumCoverageSlots: 4 };
  const current = createSegmentedActiveCut(index, policy);
  const view = visibleView();
  const final = planSegmentedConvergedActiveCut(index, current, view, policy);
  assert.deepEqual([...final.finalCut.coverageNodeIndices], [3, 4, 5, 6]);
  const single = planSegmentedReadyActiveCut(
    index,
    current,
    final,
    view,
    Uint8Array.of(1, 0, 0, 0),
  );
  assert.equal(single.finalCut, current);
  const group = planSegmentedReadyActiveCut(
    index,
    current,
    final,
    view,
    Uint8Array.of(1, 1, 0, 0),
  );
  assert.deepEqual([...group.finalCut.coverageNodeIndices], [3, 4, 2]);
  assert.deepEqual([...group.finalCut.providerRepresentationIds], [3, 4, 0]);
  assert.equal(group.finalCut.selectedSplatCount, 10);
  assert.equal(group.finalCut.metrics.coverageHoleCount, 0);
  assert.equal(group.finalCut.metrics.coverageOverlapCount, 0);
  const boundedIndex = Object.freeze({
    ...index,
    readNodeContentBounds(node, scratch) {
      const x = node === 2 || node >= 5 ? 64 : 54;
      scratch.set([x, 5, 25, x + 1, 6, 26]);
      return scratch;
    },
  });
  const boundedPolicy = { ...policy, maximumCoverageSlots: 3 };
  const left = planSegmentedConvergedActiveCut(
    boundedIndex,
    current,
    view,
    boundedPolicy,
  ).finalCut;
  const rightView = Object.freeze({
    ...visibleView("right"),
    cameraPositionScene: [80, 5, 25],
  });
  const right = planSegmentedConvergedActiveCut(
    boundedIndex,
    left,
    rightView,
    boundedPolicy,
  );
  assert.deepEqual([...left.coverageNodeIndices], [3, 4, 2]);
  assert.deepEqual([...right.finalCut.coverageNodeIndices], [1, 5, 6]);
  const coverageBlocked = planSegmentedReadyActiveCut(
    boundedIndex,
    left,
    right,
    rightView,
    Uint8Array.of(0, 1, 1),
  );
  assert.equal(coverageBlocked.finalCut, left);
  assert.equal(coverageBlocked.stepCount, 0);
});

test("ready intermediate cut uses one bounded bridge to expose individual ready leaves", () => {
  const index = createReadyBridgeOracle();
  const policy = { maximumSelectedSplats: 16, maximumCoverageSlots: 4 };
  const current = createSegmentedActiveCut(index, policy);
  const view = visibleView();
  const final = planSegmentedConvergedActiveCut(index, current, view, policy);
  assert.equal(
    planSegmentedProgressiveBridgeCut(index, current, final, view, () => false),
    undefined,
  );
  const bridge = planSegmentedProgressiveBridgeCut(
    index,
    current,
    final,
    view,
    () => true,
  );
  assert.deepEqual(bridge.pathNodeIds, [1]);
  assert.deepEqual([...bridge.bridgeCut.coverageNodeIndices], [1, 2]);
  assert.deepEqual([...bridge.bridgeCut.providerRepresentationIds], [1, 0]);
  assert.equal(bridge.bridgeCut.selectedSplatCount, 6);
  const noDetail = planSegmentedReadyActiveCut(
    index,
    current,
    final,
    view,
    new Uint8Array(4),
    bridge.bridgeCut,
  );
  assert.equal(noDetail.finalCut, current, "bridge alone spends no checkpoint");
  const readyLeaf = planSegmentedReadyActiveCut(
    index,
    current,
    final,
    view,
    Uint8Array.of(1, 0, 0, 0),
    bridge.bridgeCut,
  );
  assert.deepEqual([...readyLeaf.finalCut.coverageNodeIndices], [3, 4, 2]);
  assert.deepEqual(
    [...readyLeaf.finalCut.providerRepresentationIds],
    [3, 1, 0],
  );
  assert.equal(readyLeaf.finalCut.selectedSplatCount, 8);
  assert.equal(readyLeaf.metrics.bridgeFallbackUsed, true);
  assert.equal(readyLeaf.canonicalFinalCut, final.finalCut);
  assert.equal(
    commitSegmentedConvergedActiveCutPlan(index, current, readyLeaf, view, 1)
      .cut,
    readyLeaf.finalCut,
  );
  const allReady = planSegmentedReadyActiveCut(
    index,
    current,
    final,
    view,
    new Uint8Array(4).fill(1),
    bridge.bridgeCut,
  );
  assert.equal(allReady.finalCut, final.finalCut);
  const tightPolicy = { ...policy, maximumSelectedSplats: 4 };
  const tightCurrent = createSegmentedActiveCut(index, tightPolicy);
  const tightFinal = planSegmentedConvergedActiveCut(
    index,
    tightCurrent,
    view,
    tightPolicy,
  );
  assert.equal(
    planSegmentedProgressiveBridgeCut(
      index,
      tightCurrent,
      tightFinal,
      view,
      () => true,
    ),
    undefined,
  );
});

test("terminal status reports visible immediate-edge plateaus without changing providers", () => {
  const plan = terminalStatusPlan(createTerminalStatusOracle());
  assert.equal(plan.stopReason, STOP_REASON.QUALITY_PLATEAU);
  assert.equal(plan.metrics.visibleOverThresholdSlotCount, 2);
  assert.equal(plan.metrics.visibleNeedsRefinementSlotCount, 2);
  assert.equal(plan.metrics.qualityCandidateCount, 0);
  assert.equal(plan.metrics.plateauBlockedCandidateCount, 2);
  assert.equal(plan.metrics.plateauBlockedInternalCount, 2);
  assert.equal(plan.metrics.detailExhaustedSlotCount, 0);
  assert.deepEqual([...plan.finalCut.coverageNodeIndices], [1, 2]);
  assert.deepEqual([...plan.finalCut.providerRepresentationIds], [0, 0]);
  assert.deepEqual([...plan.finalCut.providerRangeCounts], [1, 1]);
});

test("terminal status counts the union of quality and coverage needs under the hard budget", () => {
  const index = createTerminalStatusOracle({
    segmentErrors: [10, 0],
    targetErrors: [0, 0],
    coverage: 64,
  });
  const plan = terminalStatusPlan(index, { maximumSelectedSplats: 2 });
  assert.equal(plan.stopReason, STOP_REASON.BUDGET_LIMITED);
  assert.equal(plan.metrics.visibleOverThresholdSlotCount, 1);
  assert.equal(plan.metrics.visibleAncestorCoverageOverThresholdCount, 2);
  assert.equal(plan.metrics.visibleNeedsRefinementSlotCount, 2);
  assert.equal(plan.metrics.qualityCandidateCount, 1);
  assert.equal(plan.metrics.coverageCandidateCount, 2);
  assert.equal(plan.metrics.budgetBlockedSlotCount, 2);
  assert.equal(plan.metrics.budgetAdmissibleCandidateCount, 0);
  assert.equal(plan.finalCut.selectedSplatCount, 2);
});

test("terminal status reports satisfied quality when the final cut exactly fills the budget", () => {
  const plan = terminalStatusPlan(
    createTerminalStatusOracle({ targetErrors: [0, 0] }),
    { maximumSelectedSplats: 4 },
  );
  assert.equal(plan.finalCut.selectedSplatCount, 4);
  assert.equal(plan.stopReason, STOP_REASON.SSE_SATISFIED);
  assert.equal(plan.metrics.visibleNeedsRefinementSlotCount, 0);
  assert.equal(plan.metrics.budgetBlockedSlotCount, 0);
});

test("terminal status reports coverage-only plateaus even when P99 SSE is satisfied", () => {
  const plan = terminalStatusPlan(
    createTerminalStatusOracle({
      segmentErrors: [0, 0],
      targetErrors: [0, 0],
      coverage: 64,
      targetCount: 1,
    }),
  );
  assert.equal(plan.stopReason, STOP_REASON.QUALITY_PLATEAU);
  assert.equal(plan.metrics.visibleOverThresholdSlotCount, 0);
  assert.equal(plan.metrics.visibleAncestorCoverageOverThresholdCount, 2);
  assert.equal(plan.metrics.visibleNeedsRefinementSlotCount, 2);
  assert.equal(plan.metrics.coverageCandidateCount, 0);
  assert.equal(plan.metrics.plateauBlockedCandidateCount, 2);
});

test("terminal status excludes non-visible quality and coverage pressure", () => {
  const plan = terminalStatusPlan(
    createTerminalStatusOracle({ coverage: 64 }),
    {},
    hiddenView(),
  );
  assert.equal(plan.stopReason, STOP_REASON.SSE_SATISFIED);
  assert.equal(plan.metrics.visibleOverThresholdSlotCount, 0);
  assert.equal(plan.metrics.visibleAncestorCoverageOverThresholdCount, 0);
  assert.equal(plan.metrics.visibleNeedsRefinementSlotCount, 0);
  assert.equal(plan.metrics.plateauBlockedCandidateCount, 0);
  assert.equal(plan.metrics.detailExhaustedSlotCount, 0);
});

test("terminal status distinguishes a finer allowed leaf plateau from detail exhaustion", () => {
  const base = createProceduralOracle(1, 0, false, 0, 10);
  const index = Object.freeze({
    ...base,
    readNodeContentBounds(_node, scratch) {
      scratch.set([54, 5, 25, 55, 6, 26]);
      return scratch;
    },
    readRepresentation(id, scratch) {
      base.readRepresentation(0, scratch);
      scratch[0] = 0;
      scratch[6] = id === 0 ? 1 : 2;
      return scratch;
    },
    leafRepresentationId(_ordinal, level) {
      return level >= 2 ? 0 : 1;
    },
  });
  const plan = terminalStatusPlan(index, { minimumLeafLogicalLevel: 1 });
  assert.equal(plan.stopReason, STOP_REASON.QUALITY_PLATEAU);
  assert.equal(plan.metrics.visibleNeedsRefinementSlotCount, 1);
  assert.equal(plan.metrics.plateauBlockedCandidateCount, 1);
  assert.equal(plan.metrics.detailExhaustedSlotCount, 0);
  assert.deepEqual([...plan.finalCut.providerRepresentationIds], [0]);
});

test("terminal status distinguishes the coverage frontier cap from splat budget", () => {
  const plan = terminalStatusPlan(createTerminalStatusOracle(), {
    maximumCoverageSlots: 1,
  });
  assert.equal(plan.stopReason, STOP_REASON.FRONTIER_LIMITED);
  assert.equal(plan.metrics.visibleNeedsRefinementSlotCount, 1);
  assert.equal(plan.metrics.frontierBlockedSlotCount, 1);
  assert.equal(plan.metrics.budgetBlockedSlotCount, 0);
  assert.equal(plan.finalCut.selectedSplatCount, 2);
});

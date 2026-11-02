import assert from "node:assert/strict";
import test from "node:test";
import { createRealA4RuntimeFixture } from "../../Tools/GaussianSplatTiler/test/runtime/segmentedHierarchyFixture.js";
import { decodeSegmentedHierarchyRuntimeIndex } from "../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedHierarchyRuntimeIndex.js";
import { createSegmentedActiveCut, planSegmentedConvergedActiveCut, commitSegmentedConvergedActiveCutPlan } from "../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedActiveCut.js";
import { validateFrozenView } from "../../packages/engine/Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianViewMath.js";

const view = (hidden = false, width = 100) => Object.freeze({
  viewIdentity: `${hidden}:${width}`,
  cameraPositionScene: [44, 5, 25],
  frustumPlanesScene: [[1,0,0,hidden ? -1e12 : 1e9],[-1,0,0,1e12],[0,1,0,1e9],[0,-1,0,1e9],[0,0,1,1e9],[0,0,-1,1e9]],
  sceneToClipMatrix: [1,0,0,0,0,0.1,0,0,0,0,1,0,0,0,0,1],
  drawingBufferWidth: width, drawingBufferHeight: width, projectionKind: "perspective",
});

test("Gaussian additional views reject nested / unbounded requests", () => {
  assert.throws(() => validateFrozenView({ ...view(), additionalViews: Array(5).fill(view()) }));
  assert.throws(() => validateFrozenView({ ...view(), additionalViews: [{...view(), additionalViews: []}] }));
});

test("projector-only visible content refines in the one shared budget and proofs include its view", async () => {
  const fixture = await createRealA4RuntimeFixture();
  try {
    const index = decodeSegmentedHierarchyRuntimeIndex(fixture.bytes);
    const policy = {maximumSelectedSplats: 100000, maximumCoverageSlots: 1000, minimumLeafLogicalLevel: 0, refineErrorPixels: 1, coarsenErrorPixels: 0.5};
    const root = createSegmentedActiveCut(index, policy);
    const projector = view(false, 512);
    const union = Object.freeze({...view(true), additionalViews: Object.freeze([projector])});
    const hidden = planSegmentedConvergedActiveCut(index, root, view(true), policy);
    const plan = planSegmentedConvergedActiveCut(index, root, union, policy);
    const direct = planSegmentedConvergedActiveCut(index, root, projector, policy);
    assert.equal(hidden.stepCount, 0);
    assert.ok(plan.stepCount > 0);
    assert.deepEqual(plan.finalCut.providerRepresentationIds, direct.finalCut.providerRepresentationIds);
    assert.ok(plan.finalCut.selectedSplatCount <= policy.maximumSelectedSplats);
    assert.ok(plan.finalCut.activeSlotCount <= policy.maximumCoverageSlots);
    assert.doesNotThrow(() => commitSegmentedConvergedActiveCutPlan(index, root, plan, union));
    assert.throws(() => commitSegmentedConvergedActiveCutPlan(index, root, plan, Object.freeze({...union, additionalViews: [view(false, 64)]})));
    const both = Object.freeze({...view(false, 32), additionalViews: [projector]});
    const maximum = planSegmentedConvergedActiveCut(index, root, both, policy);
    assert.deepEqual(maximum.finalCut.providerRepresentationIds, direct.finalCut.providerRepresentationIds);
  } finally {
    await fixture.cleanup();
  }
});

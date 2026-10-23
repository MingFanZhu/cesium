import { buildGaussianSegmentedMapping } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianMappingTask.js";

describe("SceneGIS/Scene/SceneGISGaussianSegmentedMappingWorker", function () {
  function parameters() {
    return {
      artifactIdentity: "artifact",
      contentIdentity: "content-1",
      contentGeneration: 1,
      mappingGeneration: 1,
      selectedSplatCount: 3,
      mappingElementCount: 16384,
      fragmentCount: 2,
      slotCount: 2,
      fragmentCorePageIds: new Uint32Array([0, 1]),
      fragmentShPageIds: new Uint32Array([2, 0xffffffff]),
      fragmentPageLocalStarts: new Uint32Array([1, 0]),
      fragmentCounts: new Uint32Array([2, 1]),
      fragmentPresentationStarts: new Uint32Array([0, 2]),
      fragmentSlotIds: new Uint32Array([0, 1]),
      fragmentShDenseStarts: new Uint32Array([0, 0xffffffff]),
      fragmentCorePackedAddresses: new Uint32Array([256, 512]),
      fragmentCorePageSplatCounts: new Uint32Array([4, 1]),
      fragmentShPackedAddresses: new Uint32Array([768, 0xffffffff]),
      fragmentShPageSplatCounts: new Uint32Array([4, 0]),
      slotCoverageNodeIds: new Uint32Array([7, 8]),
    };
  }

  it("builds one exact transferable Mapping with canonical padding", function () {
    const transfer = [];
    const result = buildGaussianSegmentedMapping(parameters(), transfer);
    expect([...result.mapping.subarray(0, 12)]).toEqual([
      257, 769, 0, 7, 258, 770, 0, 7, 512, 0xffffffff, 1, 8,
    ]);
    expect(result.mapping[12]).toBe(0xffffffff);
    expect(result.writtenCount).toBe(3);
    expect(transfer).toEqual([result.mapping.buffer]);
  });

  it("fails closed on destination, Page range, slot, and SH authority", function () {
    for (const mutate of [
      (value) => (value.fragmentPresentationStarts[1] = 1),
      (value) => (value.fragmentCounts[0] = 4),
      (value) => (value.fragmentSlotIds[1] = 2),
      (value) => (value.fragmentShPageIds[0] = 0xffffffff),
    ]) {
      const value = parameters();
      mutate(value);
      expect(function () {
        buildGaussianSegmentedMapping(value);
      }).toThrowDeveloperError();
    }
  });
});

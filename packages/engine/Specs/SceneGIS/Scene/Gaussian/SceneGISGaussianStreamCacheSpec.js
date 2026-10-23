import _SceneGISGaussianStreamCache from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianStreamCache.js";

function corePage(index, storedBytes = 32) {
  return {
    index,
    semantic: 1,
    splatCount: storedBytes / 32,
    storedBytes,
  };
}

describe("SceneGIS/Scene/SceneGISGaussianStreamCache", function () {
  it("keeps leased Core Pages resident and shares missing capacity", function () {
    const cache = new _SceneGISGaussianStreamCache({
      maximumBytes: 96,
      maximumCoreBytes: 96,
    });
    const page0 = corePage(0, 24);
    const page1 = corePage(1, 24);
    const page2 = corePage(2, 24);
    const page3 = corePage(3, 24);
    const leaseA = cache.commitCoreLease(
      cache.planCoreLease({
        ownerToken: "work-a",
        requiredPages: [page0, page1],
      }),
    );
    expect(cache.bytesIncludingLeases).toBe(48);
    expect(cache.put(page0, new Uint8Array(24))).toBeDefined();
    expect(cache.put(page1, new Uint8Array(24))).toBeDefined();
    expect(cache.bytesIncludingLeases).toBe(48);
    expect(cache.remove(0)).toBe(true);
    expect(cache.bytes).toBe(24);
    expect(cache.bytesIncludingLeases).toBe(48);
    expect(cache.statistics.coreLeaseReservedBytes).toBe(24);
    const leaseB = cache.commitCoreLease(
      cache.planCoreLease({
        ownerToken: "work-b",
        requiredPages: [page2, page3],
      }),
    );
    expect(cache.bytesIncludingLeases).toBe(96);
    expect(cache.put(page2, new Uint8Array(24))).toBeDefined();
    expect(cache.put(page3, new Uint8Array(24))).toBeDefined();
    expect(cache.bytesIncludingLeases).toBe(96);
    expect(cache.put(page0, new Uint8Array(24))).toBeDefined();
    expect(cache.bytes).toBe(96);
    expect(cache.bytesIncludingLeases).toBe(96);
    expect(cache.statistics.coreLeaseReservedBytes).toBe(0);
    expect(cache.trimToBytes(0)).toBe(false);
    expect(cache.releaseCoreLease(leaseA, "work-a")).toBe(true);
    expect(cache.trimToBytes(0)).toBe(false);
    expect(cache.releaseCoreLease(leaseB, "work-b")).toBe(true);
    expect(cache.trimToBytes(0)).toBe(true);
  });

  it("rejects stale CoreLease plans before mutation", function () {
    const cache = new _SceneGISGaussianStreamCache({
      maximumBytes: 64,
      maximumCoreBytes: 64,
    });
    const plan = cache.planCoreLease({
      ownerToken: "work",
      requiredPages: [corePage(0)],
    });
    cache.put(corePage(9), new Uint8Array(32));
    expect(cache.commitCoreLease(plan)).toBeUndefined();
    expect(cache.statistics.coreLeaseActiveCount).toBe(0);
    expect(cache.bytes).toBe(32);
  });

  it("preserves structured priority and tier eviction", function () {
    const cache = new _SceneGISGaussianStreamCache({
      maximumBytes: 64,
      maximumCoreBytes: 64,
      maximumShBytes: 64,
    });
    cache.put(corePage(0), new Uint8Array(32), { tier: "visible" });
    cache.put(
      { index: 1, semantic: 2, splatCount: 2, storedBytes: 32 },
      new Uint8Array(32),
      { tier: "history" },
    );
    cache.put(corePage(2), new Uint8Array(32), { tier: "visible" });
    expect(cache.has(0)).toBe(true);
    expect(cache.has(1)).toBe(false);
    expect(cache.has(2)).toBe(true);
  });

  it("freezes every held artifact Page in a one-shot physical snapshot", function () {
    const cache = new _SceneGISGaussianStreamCache({
      maximumBytes: 128,
      maximumCoreBytes: 128,
      maximumShBytes: 128,
      snapshotLeaseIdentity: "adapter-lease",
    });
    const page = (index, artifactIdentity, semantic = 1) => ({
      index,
      artifactIdentity,
      semantic,
      kind: semantic === 1 ? 1 : 2,
      packIndex: semantic === 1 ? 0 : 1,
      offset: 256 + index * 32,
      storedBytes: 32,
      rawBytes: 32,
      checksum: index + 10,
      splatCount: 1,
    });
    const page3 = page(3, "artifact-a", 2);
    const page1 = page(1, "artifact-a");
    cache.put(page3, new Uint8Array(32));
    cache.put(page1, new Uint8Array(32));
    cache.put(page(2, "artifact-b"), new Uint8Array(32));
    const owner = {};
    const hold = cache.captureHeldPageSnapshot(owner, "artifact-a");
    expect([...hold.pageIds]).toEqual([1, 3]);
    expect([...hold.pageStoredBytes]).toEqual([32, 32]);
    expect(hold.resourceGeneration).toBe(cache.resourceGeneration);
    expect(hold.leaseIdentity).toBe("adapter-lease");

    cache.put(page(4, "artifact-a"), new Uint8Array(32));
    expect([...hold.pageIds]).toEqual([1, 3]);
    expect(function () {
      cache.remove(1);
    }).toThrowDeveloperError();
    expect(cache.trimToBytes(32)).toBe(false);
    expect(function () {
      cache.releaseHeldPageSnapshot(hold, {});
    }).toThrowDeveloperError();
    expect(cache.releaseHeldPageSnapshot(hold, owner)).toBe(true);
    expect(function () {
      cache.releaseHeldPageSnapshot(hold, owner);
    }).toThrowDeveloperError();
    expect(cache.remove(1)).toBe(true);
  });
});

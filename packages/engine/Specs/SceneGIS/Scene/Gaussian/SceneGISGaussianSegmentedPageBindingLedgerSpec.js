import _SceneGISGaussianSegmentedPageBindingLedger from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedPageBindingLedger.js";

function page(index, splatCount = 1) {
  const rawBytes = splatCount * 32;
  return Object.freeze({
    index,
    artifactIdentity: "artifact-a",
    kind: 1,
    semantic: 1,
    splatCount,
    layoutId: 1,
    packId: 0,
    packIndex: 0,
    offset: 256 + index * 256,
    storedBytes: rawBytes,
    rawBytes,
    checksum: index + 100,
  });
}

function createHarness(maximumBytes = 4 * 8192, retainUnownedPages = false) {
  const receiptPages = new WeakMap();
  const released = [];
  const failures = new Set();
  const ledger = new _SceneGISGaussianSegmentedPageBindingLedger({
    artifactIdentity: "artifact-a",
    leaseIdentity: "adapter-lease",
    maximumBytes,
    retainUnownedPages,
    maxShDegree: 1,
    validateBindingReceipt(receipt, descriptor) {
      const expected = receiptPages.get(receipt);
      if (
        expected !== descriptor.index ||
        receipt.rawBytes !== descriptor.rawBytes
      ) {
        throw new Error("fake GPU receipt mismatch");
      }
      return receipt;
    },
    releaseBinding(receipt, descriptor) {
      if (failures.delete(descriptor.index)) {
        throw new Error("injected fake GPU release failure");
      }
      released.push(receipt);
    },
  });
  return {
    ledger,
    released,
    failReleaseOnce(pageId) {
      failures.add(pageId);
    },
    receipt(descriptor) {
      const value = Object.freeze({
        fakeGpuReceipt: true,
        rawBytes: descriptor.rawBytes,
      });
      receiptPages.set(value, descriptor.index);
      return value;
    },
  };
}

describe("SceneGIS/Scene/SceneGISGaussianSegmentedPageBindingLedger", function () {
  function bind(harness, descriptor, owner = {}, receipt) {
    const reservation = harness.ledger.reserveOwnerPages(owner, [descriptor]);
    receipt ??= harness.receipt(descriptor);
    harness.ledger.acceptBoundPage(reservation, descriptor.index, receipt);
    return { owner, receipt };
  }

  it("deduplicates reservations and bindings until the last owner retires", function () {
    const harness = createHarness();
    const ownerA = {};
    const ownerB = {};
    const descriptor = page(2);
    const reservationA = harness.ledger.reserveOwnerPages(ownerA, [descriptor]);
    const reservationB = harness.ledger.reserveOwnerPages(ownerB, [descriptor]);
    expect(harness.ledger.reservedBytes).toBe(8192);
    expect(harness.ledger.boundBytes).toBe(0);
    const receipt = harness.receipt(descriptor);
    harness.ledger.acceptBoundPage(reservationA, 2, receipt);
    harness.ledger.acceptBoundPage(reservationB, 2, receipt);
    expect(harness.ledger.reservedBytes).toBe(0);
    expect(harness.ledger.boundBytes).toBe(8192);
    expect(harness.ledger.statistics.gpuBoundPages).toBe(1);
    harness.ledger.releaseOwner(ownerA);
    expect(harness.released.length).toBe(0);
    expect(harness.ledger.boundBytes).toBe(8192);
    harness.ledger.releaseOwner(ownerB);
    expect(harness.released).toEqual([receipt]);
    expect(harness.ledger.boundBytes).toBe(0);
  });

  it("freezes the complete held set and rejects foreign or stale authority", function () {
    const harness = createHarness();
    const owner = {};
    const descriptor1 = page(1);
    const descriptor3 = page(3);
    const reservation = harness.ledger.reserveOwnerPages(owner, [
      descriptor3,
      descriptor1,
    ]);
    const receipt1 = harness.receipt(descriptor1);
    harness.ledger.acceptBoundPage(reservation, 1, receipt1);
    const hold = harness.ledger.captureBoundPageSnapshot([owner], "artifact-a");
    expect([...hold.pageIds]).toEqual([1]);
    expect(hold.leaseIdentity).toBe("adapter-lease");
    const receipt3 = harness.receipt(descriptor3);
    harness.ledger.acceptBoundPage(reservation, 3, receipt3);
    expect([...hold.pageIds]).toEqual([1]);
    harness.ledger.releaseOwner(owner);
    expect(harness.released).toEqual([receipt3]);
    expect(harness.ledger.releaseBoundPageSnapshot(hold)).toEqual([]);
    expect(harness.released).toEqual([receipt3, receipt1]);
    expect(function () {
      harness.ledger.releaseBoundPageSnapshot(hold);
    }).toThrowDeveloperError();
    expect(function () {
      harness.ledger.captureBoundPageSnapshot([{}], "artifact-a");
    }).toThrowDeveloperError();
    expect(function () {
      harness.ledger.captureBoundPageSnapshot([], "artifact-b");
    }).toThrowDeveloperError();
  });

  it("fails closed on receipt and capacity mismatches", function () {
    const harness = createHarness(8192);
    const owner = {};
    const descriptor = page(0);
    const reservation = harness.ledger.reserveOwnerPages(owner, [descriptor]);
    expect(function () {
      harness.ledger.acceptBoundPage(
        reservation,
        0,
        Object.freeze({ fakeGpuReceipt: true, rawBytes: 64 }),
      );
    }).toThrowError(/fake GPU receipt mismatch/);
    expect(function () {
      harness.ledger.reserveOwnerPages({}, [page(1, 1)]);
    }).toThrowDeveloperError();
    harness.ledger.acceptBoundPage(reservation, 0, harness.receipt(descriptor));
    expect(function () {
      harness.ledger.acceptBoundPage(
        reservation,
        0,
        harness.receipt(descriptor),
      );
    }).toThrowDeveloperError();
  });

  it("accounts failed fake backend release as one-shot cleanup debt", function () {
    const harness = createHarness(8192);
    const owner = {};
    const descriptor = page(0);
    const reservation = harness.ledger.reserveOwnerPages(owner, [descriptor]);
    harness.ledger.acceptBoundPage(reservation, 0, harness.receipt(descriptor));
    harness.failReleaseOnce(0);
    const debts = harness.ledger.releaseOwner(owner);
    expect(debts.length).toBe(1);
    expect(harness.ledger.boundBytes).toBe(0);
    expect(harness.ledger.cleanupDebtBytes).toBe(8192);
    expect(function () {
      harness.ledger.reserveOwnerPages({}, [page(1, 1)]);
    }).toThrowDeveloperError();
    expect(harness.ledger.settleCleanupDebt(debts[0])).toBe(true);
    expect(harness.ledger.cleanupDebtBytes).toBe(0);
    expect(function () {
      harness.ledger.settleCleanupDebt(debts[0]);
    }).toThrowDeveloperError();
  });

  it("retains warm bindings without exposing them through protected snapshots", function () {
    const harness = createHarness(2 * 8192, true);
    const descriptor = page(0);
    const first = bind(harness, descriptor);
    const active = bind(harness, page(1));
    expect(harness.ledger.releaseOwner(first.owner)).toEqual([]);
    expect(harness.released).toEqual([]);
    expect(harness.ledger.boundBytes).toBe(2 * 8192);
    expect(harness.ledger.warmBytes).toBe(8192);
    const hold = harness.ledger.captureBoundPageSnapshot(
      [active.owner],
      "artifact-a",
    );
    expect([...hold.pageIds]).toEqual([1]);
    expect(hold.rawBytes).toBe(8192);
    expect(harness.ledger.incrementalReservationBytes([descriptor])).toBe(0);
    const reused = bind(harness, descriptor, {}, first.receipt);
    expect(harness.ledger.warmBytes).toBe(0);
    expect(harness.ledger.statistics.bindings).toBe(2);
    expect(harness.ledger.statistics.warmReservations).toBe(1);
    harness.ledger.releaseBoundPageSnapshot(hold);
    harness.ledger.releaseOwner(active.owner);
    harness.ledger.releaseOwner(reused.owner);
    const result = harness.ledger.evictWarm();
    expect(result.ready).toBe(true);
    expect(result.debts).toEqual([]);
    expect(result.releasedBytes).toBe(2 * 8192);
    expect(harness.ledger.boundBytes).toBe(0);
    expect(harness.ledger.warmBytes).toBe(0);
    expect(harness.released).toEqual([active.receipt, first.receipt]);
  });

  it("evicts the least recently released warm binding after exact reuse", function () {
    const harness = createHarness(2 * 8192, true);
    const first = bind(harness, page(0));
    harness.ledger.releaseOwner(first.owner);
    const second = bind(harness, page(1));
    harness.ledger.releaseOwner(second.owner);
    const reused = bind(harness, page(0), {}, first.receipt);
    harness.ledger.releaseOwner(reused.owner);
    expect([...harness.ledger.warmPageIds]).toEqual([1, 0]);
    const result = harness.ledger.pruneWarmForReservation([page(2)]);
    expect(result.ready).toBe(true);
    expect(result.releasedBytes).toBe(8192);
    expect(result.debts).toEqual([]);
    expect(harness.released).toEqual([second.receipt]);
    expect([...harness.ledger.warmPageIds]).toEqual([0]);
    const next = bind(harness, page(2));
    expect(harness.ledger.boundBytes + harness.ledger.reservedBytes).toBe(
      2 * 8192,
    );
    harness.ledger.releaseOwner(next.owner);
    harness.ledger.evictWarm();
  });

  it("preserves requested warm Pages and snapshot-held Pages under pressure", function () {
    const harness = createHarness(3 * 8192, true);
    const held = bind(harness, page(0));
    const snapshot = harness.ledger.captureBoundPageSnapshot(
      [held.owner],
      "artifact-a",
    );
    harness.ledger.releaseOwner(held.owner);
    const requested = bind(harness, page(1));
    harness.ledger.releaseOwner(requested.owner);
    const expendable = bind(harness, page(2));
    harness.ledger.releaseOwner(expendable.owner);
    const result = harness.ledger.pruneWarmForReservation([page(1), page(3)]);
    expect(result.ready).toBe(true);
    expect(harness.released).toEqual([expendable.receipt]);
    expect([...harness.ledger.warmPageIds]).toEqual([1]);
    expect([...snapshot.pageIds]).toEqual([0]);
    expect(harness.ledger.boundBytes).toBe(2 * 8192);
    harness.ledger.releaseBoundPageSnapshot(snapshot);
    expect([...harness.ledger.warmPageIds]).toEqual([1, 0]);
    harness.ledger.evictWarm();
  });

  it("protects a reserved warm Page before acceptance and restores it on abort", function () {
    const harness = createHarness(2 * 8192, true);
    const first = bind(harness, page(0));
    harness.ledger.releaseOwner(first.owner);
    const second = bind(harness, page(1));
    harness.ledger.releaseOwner(second.owner);
    const nextOwner = {};
    harness.ledger.reserveOwnerPages(nextOwner, [page(0)]);
    expect(harness.ledger.warmBytes).toBe(8192);
    expect(harness.ledger.reservedBytes).toBe(0);
    const result = harness.ledger.evictWarm();
    expect(result.ready).toBe(true);
    expect(harness.released).toEqual([second.receipt]);
    expect(harness.ledger.boundBytes).toBe(8192);
    harness.ledger.releaseOwner(nextOwner);
    expect([...harness.ledger.warmPageIds]).toEqual([0]);
    harness.ledger.evictWarm();
    expect(harness.released).toEqual([second.receipt, first.receipt]);
  });

  it("keeps failed warm eviction charged as cleanup debt until exact settlement", function () {
    const harness = createHarness(8192, true);
    const first = bind(harness, page(0));
    harness.ledger.releaseOwner(first.owner);
    harness.failReleaseOnce(0);
    const result = harness.ledger.pruneWarmForReservation([page(1)]);
    expect(result.ready).toBe(false);
    expect(result.releasedBytes).toBe(0);
    expect(result.debts.length).toBe(1);
    expect(harness.ledger.warmBytes).toBe(0);
    expect(harness.ledger.boundBytes).toBe(0);
    expect(harness.ledger.cleanupDebtBytes).toBe(8192);
    expect(harness.ledger.statistics.gpuHeldBytes).toBe(8192);
    expect(harness.ledger.evictWarm().debts).toEqual([]);
    expect(function () {
      harness.ledger.reserveOwnerPages({}, [page(1)]);
    }).toThrowDeveloperError();
    expect(harness.ledger.settleCleanupDebt(result.debts[0])).toBe(true);
    expect(harness.ledger.pruneWarmForReservation([page(1)]).ready).toBe(true);
    expect(harness.released).toEqual([first.receipt]);
    expect(harness.ledger.statistics.gpuHeldBytes).toBe(0);
    expect(function () {
      harness.ledger.settleCleanupDebt(result.debts[0]);
    }).toThrowDeveloperError();
  });

  it("validates warm reservation projections before eviction and retains hard limits", function () {
    const harness = createHarness(8192, true);
    const first = bind(harness, page(0));
    harness.ledger.releaseOwner(first.owner);
    expect(function () {
      harness.ledger.pruneWarmForReservation([
        page(1),
        { ...page(0), checksum: 999 },
      ]);
    }).toThrowDeveloperError();
    expect(function () {
      harness.ledger.pruneWarmForReservation([page(1)], 2 * 8192);
    }).toThrowDeveloperError();
    expect(function () {
      harness.ledger.reserveOwnerPages({}, [page(1)]);
    }).toThrowDeveloperError();
    const ids = harness.ledger.warmPageIds;
    ids[0] = 99;
    expect([...harness.ledger.warmPageIds]).toEqual([0]);
    expect(harness.released).toEqual([]);
    const result = harness.ledger.pruneWarmForReservation([page(0), page(1)]);
    expect(result.ready).toBe(false);
    expect(result.releasedBytes).toBe(0);
    expect(harness.ledger.warmBytes).toBe(8192);
    harness.ledger.evictWarm();
  });
});

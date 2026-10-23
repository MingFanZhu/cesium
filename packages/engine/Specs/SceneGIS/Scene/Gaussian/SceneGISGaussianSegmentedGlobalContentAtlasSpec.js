import { computeSegmentedAtlasPageFootprint } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSegmentedAssetPageOwnership.js";
import { prepareGaussianSegmentedCore } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianSortTask.js";
import { createSegmentedPreparedCoreReceipt } from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedCorePreparation.js";
import _SceneGISGaussianSegmentedGlobalContentAtlas from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedGlobalContentAtlas.js";
import _SceneGISGaussianSegmentedPageBindingLedger from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedPageBindingLedger.js";

function corePage(index, splatCount, assetId = 0) {
  const payload = new Uint8Array(splatCount * 32);
  const view = new DataView(payload.buffer);
  for (let splat = 0; splat < splatCount; splat++) {
    view.setFloat32(splat * 32, splat + 0.25, true);
    view.setFloat32(splat * 32 + 4, splat + 0.5, true);
    view.setFloat32(splat * 32 + 8, splat + 0.75, true);
  }
  return {
    descriptor: {
      artifactIdentity: "atlas-artifact",
      index,
      assetId,
      assetLocalStart: 0,
      splatCount,
      kind: 1,
      semantic: 1,
      layoutId: 1,
      packId: 0,
      packIndex: 0,
      offset: 256 + index * 256,
      storedBytes: payload.byteLength,
      rawBytes: payload.byteLength,
      checksum: index + 1,
    },
    payload,
  };
}

function prepare(page) {
  const d = page.descriptor;
  const identity = {
    ...d,
    pageIndex: d.index,
    pageSplatCount: d.splatCount,
    expectedCoreBytes: d.rawBytes,
    positionBytes: d.splatCount * 12,
    representationId: d.assetId,
    positionOriginX: 10 + d.assetId,
    positionOriginY: 20,
    positionOriginZ: 30,
    uploadBytes: computeSegmentedAtlasPageFootprint(d.splatCount, 1, 0)
      .uploadBytes,
  };
  const core = new Uint8Array(identity.uploadBytes);
  core.set(page.payload);
  prepareGaussianSegmentedCore({ ...identity, core });
  page.preparedBacking = core.buffer;
  return createSegmentedPreparedCoreReceipt(identity, core);
}

function createAtlas(options = {}) {
  const textures = [];
  const atlas = new _SceneGISGaussianSegmentedGlobalContentAtlas({
    artifactIdentity: "atlas-artifact",
    maxShDegree: 0,
    maximumBytes: 8 * 1024 * 1024,
    maximumTextureSize: 1024,
    maximumTextureArrayLayers: 8,
    createArrayTexture(textureOptions) {
      const texture = {
        ...textureOptions,
        uploads: [],
        destroyed: false,
        copyFrom(upload) {
          this.uploads.push(upload);
        },
        destroy() {
          this.destroyed = true;
        },
      };
      textures.push(texture);
      return texture;
    },
    ...options,
  });
  return { atlas, textures };
}

describe("SceneGIS/Scene/SceneGISGaussianSegmentedGlobalContentAtlas", function () {
  it("warm residency: reuses the same backing and packed address without another upload", function () {
    const value = createAtlas({ maximumBytes: 2 * 8192 });
    const ledger = new _SceneGISGaussianSegmentedPageBindingLedger({
      artifactIdentity: "atlas-artifact",
      leaseIdentity: "atlas-lease",
      maximumBytes: 2 * 8192,
      maxShDegree: 0,
      retainUnownedPages: true,
      validateBindingReceipt: (receipt, descriptor, owner) =>
        value.atlas.validateBindingReceipt(receipt, descriptor, owner),
      releaseBinding: (receipt, descriptor) =>
        value.atlas.releaseBinding(receipt, descriptor),
    });
    const page = corePage(0, 256);
    const firstOwner = {};
    const firstReservation = ledger.reserveOwnerPages(firstOwner, [
      page.descriptor,
    ]);
    const receipt = value.atlas.createBindingReceipt(
      page.descriptor,
      prepare(page),
    );
    ledger.acceptBoundPage(firstReservation, 0, receipt);
    const address = value.atlas.pageAddress(page.descriptor);
    ledger.releaseOwner(firstOwner);
    expect(ledger.warmBytes).toBe(8192);
    expect(value.atlas.statistics.backingCount).toBe(1);

    const secondOwner = {};
    const secondReservation = ledger.reserveOwnerPages(secondOwner, [
      page.descriptor,
    ]);
    expect(ledger.reservedBytes).toBe(0);
    const retained = value.atlas.retainedBindingReceipt(page.descriptor);
    expect(retained).toBe(receipt);
    ledger.acceptBoundPage(secondReservation, 0, retained);
    expect(value.atlas.pageAddress(page.descriptor)).toEqual(address);
    expect(value.atlas.statistics.pageAtlasUploadedCoreBytes).toBe(8192);
    expect(value.textures[0].uploads.length).toBe(1);
    ledger.releaseOwner(secondOwner);
    expect(ledger.evictWarm().releasedBytes).toBe(8192);
    expect(value.atlas.statistics.backingCount).toBe(0);
    expect(value.atlas.retainedBindingReceipt(page.descriptor)).toBeUndefined();
    expect(value.atlas.destroy()).toBe(true);
  });

  it("warm residency: detects fragmented capacity without consuming the prepared receipt", function () {
    const value = createAtlas({ maximumBytes: 4 * 8192 });
    const pages = Array.from({ length: 4 }, (_, index) => corePage(index, 256));
    const receipts = pages.map((page) =>
      value.atlas.createBindingReceipt(page.descriptor, prepare(page)),
    );
    value.atlas.releaseBinding(receipts[0], pages[0].descriptor);
    value.atlas.releaseBinding(receipts[2], pages[2].descriptor);
    const next = corePage(4, 512);
    const prepared = prepare(next);
    expect(value.atlas.canAllocatePage(next.descriptor)).toBe(false);
    expect(value.atlas.canAllocatePage(next.descriptor)).toBe(false);
    expect(value.atlas.statistics.backingCount).toBe(2);
    expect(value.textures[0].uploads.length).toBe(4);

    value.atlas.releaseBinding(receipts[1], pages[1].descriptor);
    expect(value.atlas.canAllocatePage(next.descriptor)).toBe(true);
    const nextReceipt = value.atlas.createBindingReceipt(
      next.descriptor,
      prepared,
    );
    expect(value.atlas.pageAddress(next.descriptor).packedAddress).toBe(0);
    expect(value.textures[0].uploads.length).toBe(5);
    expect(value.textures[0].uploads[4].source.arrayBufferView.buffer).toBe(
      next.preparedBacking,
    );
    value.atlas.releaseBinding(nextReceipt, next.descriptor);
    value.atlas.releaseBinding(receipts[3], pages[3].descriptor);
    expect(value.atlas.destroy()).toBe(true);
  });

  it("warm residency: preflights Core and SH capacity independently", function () {
    const value = createAtlas({
      maxShDegree: 1,
      maximumBytes: (32 + 16) * 256,
    });
    const core = corePage(0, 256);
    const sh = {
      ...core.descriptor,
      index: 1,
      kind: 2,
      semantic: 2,
      layoutId: 2,
      packId: 1,
      packIndex: 1,
      storedBytes: 256 * 16,
      rawBytes: 256 * 16,
    };
    const coreReceipt = value.atlas.createBindingReceipt(
      core.descriptor,
      prepare(core),
    );
    expect(value.atlas.canAllocatePage(corePage(2, 1).descriptor)).toBe(false);
    expect(value.atlas.canAllocatePage(sh)).toBe(true);
    const shReceipt = value.atlas.createBindingReceipt(
      sh,
      new Uint8Array(sh.rawBytes),
    );
    expect(value.atlas.canAllocatePage({ ...sh, index: 3 })).toBe(false);
    value.atlas.releaseBinding(coreReceipt, core.descriptor);
    expect(value.atlas.canAllocatePage(corePage(2, 1).descriptor)).toBe(true);
    expect(value.atlas.canAllocatePage({ ...sh, index: 3 })).toBe(false);
    value.atlas.releaseBinding(shReceipt, sh);
    expect(value.atlas.destroy()).toBe(true);
  });

  it("uploads the prepared backing directly and preserves retained packed address", function () {
    const value = createAtlas();
    const first = corePage(0, 256);
    const tail = corePage(1, 9, 1);
    const ledger = new _SceneGISGaussianSegmentedPageBindingLedger({
      artifactIdentity: "atlas-artifact",
      leaseIdentity: "atlas-lease",
      maximumBytes: 8 * 1024 * 1024,
      maxShDegree: 1,
      validateBindingReceipt: (receipt, descriptor, owner) =>
        value.atlas.validateBindingReceipt(receipt, descriptor, owner),
      releaseBinding: (receipt, descriptor) =>
        value.atlas.releaseBinding(receipt, descriptor),
    });
    const current = {};
    const work = {};
    const currentReservation = ledger.reserveOwnerPages(current, [
      first.descriptor,
    ]);
    const firstReceipt = value.atlas.createBindingReceipt(
      first.descriptor,
      prepare(first),
    );
    ledger.acceptBoundPage(
      currentReservation,
      first.descriptor.index,
      firstReceipt,
    );
    const firstAddress = value.atlas.pageAddress(first.descriptor);
    const workReservation = ledger.reserveOwnerPages(work, [
      first.descriptor,
      tail.descriptor,
    ]);
    const retainedReceipt = value.atlas.retainedBindingReceipt(
      first.descriptor,
    );
    expect(retainedReceipt).toBe(firstReceipt);
    ledger.acceptBoundPage(
      workReservation,
      first.descriptor.index,
      retainedReceipt,
    );
    const tailReceipt = value.atlas.createBindingReceipt(
      tail.descriptor,
      prepare(tail),
    );
    ledger.acceptBoundPage(workReservation, tail.descriptor.index, tailReceipt);
    expect(value.atlas.pageAddress(first.descriptor)).toEqual(firstAddress);
    expect(value.atlas.statistics.pageAtlasCanonicalizedCoreSplats).toBe(0);
    expect(value.atlas.statistics.pageAtlasUploadedCoreBytes).toBe(
      first.preparedBacking.byteLength + tail.preparedBacking.byteLength,
    );
    expect(value.atlas.statistics.pageAtlasRetainedHitCount).toBe(0);
    const core = value.textures.find((texture) => texture.role === "core");
    expect(core.uploads.length).toBe(2);
    expect(core.uploads[0].source.arrayBufferView.buffer).toBe(
      first.preparedBacking,
    );
    expect(() =>
      value.atlas.createBindingReceipt(first.descriptor, first.payload),
    ).toThrowDeveloperError();
    const canonical = new DataView(
      core.uploads[0].source.arrayBufferView.buffer,
      core.uploads[0].source.arrayBufferView.byteOffset,
    );
    expect(canonical.getFloat32(0, true)).toBe(10.25);
    expect(canonical.getFloat32(4, true)).toBe(20.5);
    expect(canonical.getFloat32(8, true)).toBe(30.75);

    expect(ledger.releaseOwner(current)).toEqual([]);
    expect(value.atlas.statistics.backingCount).toBe(2);
    expect(ledger.releaseOwner(work)).toEqual([]);
    expect(value.atlas.statistics.backingCount).toBe(0);
    expect(value.atlas.destroy()).toBe(true);
    expect(core.destroyed).toBe(true);
  });

  it("retains exact release authority across repeated cleanup failure", function () {
    let failures = 2;
    const value = createAtlas({
      beforeRelease() {
        if (failures-- > 0) {
          throw new Error("injected atlas release failure");
        }
      },
    });
    const page = corePage(0, 1);
    const receipt = value.atlas.createBindingReceipt(
      page.descriptor,
      prepare(page),
    );
    for (let attempt = 0; attempt < 2; attempt++) {
      expect(function () {
        value.atlas.releaseBinding(receipt, page.descriptor);
      }).toThrowError("injected atlas release failure");
      expect(value.atlas.statistics.backingCount).toBe(1);
      expect(value.atlas.statistics.cleanupDebtCount).toBe(1);
    }
    expect(value.atlas.releaseBinding(receipt, page.descriptor)).toBe(true);
    expect(value.atlas.statistics.backingCount).toBe(0);
    expect(value.atlas.statistics.cleanupDebtCount).toBe(0);
    expect(value.atlas.destroy()).toBe(true);
  });
});

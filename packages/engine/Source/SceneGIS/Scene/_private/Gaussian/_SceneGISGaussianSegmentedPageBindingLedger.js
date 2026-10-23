/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import DeveloperError from "../../../../Core/DeveloperError.js";
import { computeSegmentedAtlasPageFootprint } from "../../../Core/_private/Gaussian/_SceneGISGaussianSegmentedProtocol.js";

const reservationStates = new WeakMap();
const snapshotStates = new WeakMap();
const debtStates = new WeakMap();

function exactAdd(left, right, label) {
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${label} exceeds the safe integer range`);
  }
  return value;
}

function exactSubtract(left, right, label) {
  const value = left - right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${label} became negative or unsafe`);
  }
  return value;
}

function requireOwner(ownerToken) {
  if (
    (typeof ownerToken !== "object" && typeof ownerToken !== "function") ||
    ownerToken === null
  ) {
    throw new DeveloperError("GPU Page owner token is invalid");
  }
}

function samePage(left, right) {
  return (
    left.artifactIdentity === right.artifactIdentity &&
    left.index === right.index &&
    left.kind === right.kind &&
    left.semantic === right.semantic &&
    left.layoutId === right.layoutId &&
    left.packId === right.packId &&
    left.offset === right.offset &&
    left.storedBytes === right.storedBytes &&
    left.rawBytes === right.rawBytes &&
    left.checksum === right.checksum
  );
}

function validatePage(page, artifactIdentity, maxShDegree) {
  if (
    !page ||
    page.artifactIdentity !== artifactIdentity ||
    !Number.isSafeInteger(page.index) ||
    page.index < 0 ||
    !Number.isSafeInteger(page.rawBytes) ||
    page.rawBytes < 1 ||
    !Number.isSafeInteger(page.storedBytes) ||
    page.storedBytes < 1 ||
    !Number.isSafeInteger(page.splatCount) ||
    page.splatCount < 1
  ) {
    throw new DeveloperError("GPU Page descriptor is invalid");
  }
  const footprint = computeSegmentedAtlasPageFootprint(
    page.splatCount,
    page.semantic,
    maxShDegree,
  );
  if (page.rawBytes !== page.splatCount * footprint.semanticBytesPerSplat) {
    throw new DeveloperError("GPU Page physical footprint is invalid");
  }
  return footprint.uploadBytes;
}

class GaussianSegmentedGpuSnapshot {
  constructor(state) {
    this.artifactIdentity = state.artifactIdentity;
    this.resourceGeneration = state.resourceGeneration;
    this.leaseIdentity = state.leaseIdentity;
    this.pageCount = state.pageIds.length;
    this.rawBytes = state.rawBytesTotal;
    snapshotStates.set(this, state);
    Object.freeze(this);
  }
  get pageIds() {
    return snapshotStates.get(this).pageIds.slice();
  }
  get pageRawBytes() {
    return snapshotStates.get(this).pageRawBytes.slice();
  }
  get pageProvenance() {
    return snapshotStates.get(this).pageProvenance.slice();
  }
}

/**
 * Resource-fact ledger for future GPU Page bindings. Creates no WebGL objects.
 *
 * @alias _SceneGISGaussianSegmentedPageBindingLedger
 * @constructor
 * @private
 */
function _SceneGISGaussianSegmentedPageBindingLedger(options) {
  options = options ?? {};
  if (
    typeof options.artifactIdentity !== "string" ||
    options.artifactIdentity.length === 0 ||
    typeof options.leaseIdentity !== "string" ||
    options.leaseIdentity.length === 0 ||
    typeof options.validateBindingReceipt !== "function" ||
    typeof options.releaseBinding !== "function"
  ) {
    throw new DeveloperError("GPU Page binding ledger options are invalid");
  }
  this.artifactIdentity = options.artifactIdentity;
  this.leaseIdentity = options.leaseIdentity;
  this.maximumBytes = options.maximumBytes;
  this.maxShDegree = options.maxShDegree;
  if (
    !Number.isSafeInteger(this.maximumBytes) ||
    this.maximumBytes < 1 ||
    !Number.isSafeInteger(this.maxShDegree) ||
    this.maxShDegree < 0 ||
    this.maxShDegree > 3
  ) {
    throw new DeveloperError("GPU Page maximumBytes is invalid");
  }
  this._validateBindingReceipt = options.validateBindingReceipt;
  this._releaseBinding = options.releaseBinding;
  this._retainUnownedPages = options.retainUnownedPages === true;
  this._reservations = new Map();
  this._reservationPages = new Map();
  this._pages = new Map();
  this._warmPages = new Map();
  this._snapshotHolds = new Set();
  this._resourceGeneration = 0;
  this._reservedBytes = 0;
  this._boundBytes = 0;
  this._warmBytes = 0;
  this._cleanupDebtBytes = 0;
  this._statistics = {
    reservations: 0,
    bindings: 0,
    snapshotCaptures: 0,
    releases: 0,
    cleanupSettlements: 0,
    warmRetentions: 0,
    warmReservations: 0,
    warmEvictions: 0,
  };
}

Object.defineProperties(_SceneGISGaussianSegmentedPageBindingLedger.prototype, {
  resourceGeneration: {
    get: function () {
      return this._resourceGeneration;
    },
  },
  reservedBytes: {
    get: function () {
      return this._reservedBytes;
    },
  },
  boundBytes: {
    get: function () {
      return this._boundBytes;
    },
  },
  warmBytes: {
    get: function () {
      return this._warmBytes;
    },
  },
  warmPageIds: {
    get: function () {
      return Uint32Array.from(this._warmPages.keys());
    },
  },
  cleanupDebtBytes: {
    get: function () {
      return this._cleanupDebtBytes;
    },
  },
  statistics: {
    get: function () {
      return Object.freeze({
        ...this._statistics,
        gpuReservedPages: this._reservationPages.size,
        gpuBoundPages: [...this._pages.values()].filter((page) => !page.debt)
          .length,
        cleanupDebtPages: [...this._pages.values()].filter((page) => page.debt)
          .length,
        gpuHeldBytes: this._boundBytes + this._cleanupDebtBytes,
        gpuWarmBytes: this._warmBytes,
        gpuWarmPages: this._warmPages.size,
        gpuGeneration: this._resourceGeneration,
      });
    },
  },
});

_SceneGISGaussianSegmentedPageBindingLedger.prototype.pagePhysicalBytes =
  function (descriptor) {
    return validatePage(descriptor, this.artifactIdentity, this.maxShDegree);
  };

_SceneGISGaussianSegmentedPageBindingLedger.prototype._removeWarmPage =
  function (page) {
    if (!this._warmPages.delete(page.descriptor.index)) {
      return false;
    }
    this._warmBytes = exactSubtract(
      this._warmBytes,
      this.pagePhysicalBytes(page.descriptor),
      "GPU warm bytes",
    );
    return true;
  };

_SceneGISGaussianSegmentedPageBindingLedger.prototype._releaseUnprotectedPage =
  function (page) {
    if (!this._retainUnownedPages) {
      return this._retirePage(page);
    }
    // A reserved warm Page is protected even before its next binding is accepted.
    if (this._reservationPages.has(page.descriptor.index)) {
      return undefined;
    }
    if (!this._warmPages.has(page.descriptor.index)) {
      this._warmPages.set(page.descriptor.index, page);
      this._warmBytes = exactAdd(
        this._warmBytes,
        this.pagePhysicalBytes(page.descriptor),
        "GPU warm bytes",
      );
      this._statistics.warmRetentions++;
    }
    return undefined;
  };

/** Evicts oldest unprotected Pages, preserving backend failures as debt. */
_SceneGISGaussianSegmentedPageBindingLedger.prototype.evictWarm = function (
  bytes = this._warmBytes,
  protectedPageIds = [],
) {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new DeveloperError("GPU warm eviction bytes are invalid");
  }
  const protectedIds = new Set(protectedPageIds);
  for (const pageId of protectedIds) {
    if (!Number.isSafeInteger(pageId) || pageId < 0) {
      throw new DeveloperError("GPU warm protected Page id is invalid");
    }
  }
  let releasedBytes = 0;
  const debts = [];
  for (const [pageId, page] of this._warmPages) {
    if (releasedBytes >= bytes) {
      break;
    }
    if (protectedIds.has(pageId)) {
      continue;
    }
    const physicalBytes = this.pagePhysicalBytes(page.descriptor);
    const debt = this._retirePage(page);
    if (debt) {
      debts.push(debt);
    } else {
      releasedBytes = exactAdd(
        releasedBytes,
        physicalBytes,
        "GPU warm released bytes",
      );
      this._statistics.warmEvictions++;
    }
  }
  return Object.freeze({
    releasedBytes,
    debts: Object.freeze(debts),
    ready: releasedBytes >= bytes && debts.length === 0,
  });
};

/** Run before D2 reservation projection; never evicts the requested Pages. */
_SceneGISGaussianSegmentedPageBindingLedger.prototype.pruneWarmForReservation =
  function (pageDescriptors, maximumHeldBytes = this.maximumBytes) {
    if (
      !Number.isSafeInteger(maximumHeldBytes) ||
      maximumHeldBytes < 0 ||
      maximumHeldBytes > this.maximumBytes
    ) {
      throw new DeveloperError("GPU warm reservation limit is invalid");
    }
    const pages = [...pageDescriptors];
    const incrementalBytes = this.incrementalReservationBytes(pages);
    const projectedBytes = exactAdd(
      exactAdd(this._boundBytes, this._reservedBytes, "GPU live bytes"),
      exactAdd(this._cleanupDebtBytes, incrementalBytes, "GPU projected bytes"),
      "GPU projected capacity",
    );
    const result = this.evictWarm(
      Math.max(0, projectedBytes - maximumHeldBytes),
      pages.map((page) => page.index),
    );
    return Object.freeze({
      releasedBytes: result.releasedBytes,
      debts: result.debts,
      ready:
        result.debts.length === 0 &&
        projectedBytes - result.releasedBytes <= maximumHeldBytes,
    });
  };

_SceneGISGaussianSegmentedPageBindingLedger.prototype.incrementalReservationBytes =
  function (pageDescriptors) {
    let incrementalBytes = 0;
    const seen = new Set();
    for (const page of pageDescriptors) {
      const uploadBytes = validatePage(
        page,
        this.artifactIdentity,
        this.maxShDegree,
      );
      if (seen.has(page.index)) {
        throw new DeveloperError(
          "GPU Page reservation projection contains duplicate ids",
        );
      }
      seen.add(page.index);
      const existing =
        this._pages.get(page.index)?.descriptor ??
        this._reservationPages.get(page.index)?.descriptor;
      if (this._pages.get(page.index)?.debt) {
        throw new DeveloperError("GPU Page is blocked by cleanup debt");
      }
      if (existing && !samePage(existing, page)) {
        throw new DeveloperError("GPU Page reservation projection conflicts");
      }
      if (!existing) {
        incrementalBytes = exactAdd(
          incrementalBytes,
          uploadBytes,
          "GPU reservation projection bytes",
        );
      }
    }
    return incrementalBytes;
  };

_SceneGISGaussianSegmentedPageBindingLedger.prototype.reserveOwnerPages =
  function (ownerToken, pageDescriptors) {
    requireOwner(ownerToken);
    if (this._reservations.has(ownerToken)) {
      throw new DeveloperError("GPU Page owner already has a reservation");
    }
    const pages = [...pageDescriptors].sort(
      (left, right) => left.index - right.index,
    );
    for (let index = 0; index < pages.length; index++) {
      validatePage(pages[index], this.artifactIdentity, this.maxShDegree);
      if (index > 0 && pages[index - 1].index === pages[index].index) {
        throw new DeveloperError("GPU Page reservation contains duplicate ids");
      }
      const existing =
        this._pages.get(pages[index].index)?.descriptor ??
        this._reservationPages.get(pages[index].index)?.descriptor;
      if (this._pages.get(pages[index].index)?.debt) {
        throw new DeveloperError(
          "GPU Page reservation is blocked by cleanup debt",
        );
      }
      if (existing && !samePage(existing, pages[index])) {
        throw new DeveloperError("GPU Page reservation identity conflicts");
      }
    }
    let incrementalBytes = 0;
    for (const page of pages) {
      const uploadBytes = computeSegmentedAtlasPageFootprint(
        page.splatCount,
        page.semantic,
        this.maxShDegree,
      ).uploadBytes;
      if (
        !this._pages.has(page.index) &&
        !this._reservationPages.has(page.index)
      ) {
        incrementalBytes = exactAdd(
          incrementalBytes,
          uploadBytes,
          "GPU reservation bytes",
        );
      }
    }
    if (
      this._reservedBytes +
        this._boundBytes +
        this._cleanupDebtBytes +
        incrementalBytes >
      this.maximumBytes
    ) {
      throw new DeveloperError("GPU Page reservation exceeds hard capacity");
    }
    const reservation = Object.freeze({ ownerToken, pageCount: pages.length });
    reservationStates.set(reservation, {
      ledger: this,
      ownerToken,
      pages,
      boundIds: new Set(),
      released: false,
    });
    this._reservations.set(ownerToken, reservation);
    for (const page of pages) {
      const boundPage = this._pages.get(page.index);
      if (boundPage && this._removeWarmPage(boundPage)) {
        this._statistics.warmReservations++;
      }
      const uploadBytes = computeSegmentedAtlasPageFootprint(
        page.splatCount,
        page.semantic,
        this.maxShDegree,
      ).uploadBytes;
      let record = this._reservationPages.get(page.index);
      if (!record) {
        record = { descriptor: page, owners: new Set() };
        this._reservationPages.set(page.index, record);
        if (!this._pages.has(page.index)) {
          this._reservedBytes = exactAdd(
            this._reservedBytes,
            uploadBytes,
            "GPU reserved bytes",
          );
        }
      }
      record.owners.add(ownerToken);
    }
    this._statistics.reservations++;
    return reservation;
  };

_SceneGISGaussianSegmentedPageBindingLedger.prototype.acceptBoundPage =
  function (reservation, pageId, bindingReceipt) {
    const state = reservationStates.get(reservation);
    if (
      !state ||
      state.ledger !== this ||
      state.released ||
      this._reservations.get(state.ownerToken) !== reservation
    ) {
      throw new DeveloperError("GPU Page reservation is stale or foreign");
    }
    const descriptor = state.pages.find((page) => page.index === pageId);
    if (!descriptor || state.boundIds.has(pageId)) {
      throw new DeveloperError("GPU Page binding completion is invalid");
    }
    const validated = this._validateBindingReceipt(
      bindingReceipt,
      descriptor,
      state.ownerToken,
    );
    if (validated !== bindingReceipt) {
      throw new DeveloperError("GPU Page binding receipt identity changed");
    }
    let page = this._pages.get(pageId);
    if (!page) {
      const reservationPage = this._reservationPages.get(pageId);
      if (
        !reservationPage ||
        !samePage(reservationPage.descriptor, descriptor)
      ) {
        throw new DeveloperError("GPU Page reservation backing is stale");
      }
      this._reservedBytes = exactSubtract(
        this._reservedBytes,
        computeSegmentedAtlasPageFootprint(
          descriptor.splatCount,
          descriptor.semantic,
          this.maxShDegree,
        ).uploadBytes,
        "GPU reserved bytes",
      );
      this._boundBytes = exactAdd(
        this._boundBytes,
        computeSegmentedAtlasPageFootprint(
          descriptor.splatCount,
          descriptor.semantic,
          this.maxShDegree,
        ).uploadBytes,
        "GPU bound bytes",
      );
      page = {
        descriptor,
        receipt: bindingReceipt,
        owners: new Set(),
        holdCount: 0,
        debt: undefined,
      };
      this._pages.set(pageId, page);
      this._resourceGeneration++;
      this._statistics.bindings++;
    } else if (
      page.debt ||
      !samePage(page.descriptor, descriptor) ||
      page.receipt !== bindingReceipt
    ) {
      throw new DeveloperError(
        "GPU Page binding conflicts with physical state",
      );
    }
    page.owners.add(state.ownerToken);
    state.boundIds.add(pageId);
    return reservation;
  };

_SceneGISGaussianSegmentedPageBindingLedger.prototype.captureBoundPageSnapshot =
  function (ownerTokens, artifactIdentity) {
    if (artifactIdentity !== this.artifactIdentity) {
      throw new DeveloperError("GPU snapshot artifact identity mismatch");
    }
    const owners = new Set(ownerTokens);
    for (const owner of owners) {
      requireOwner(owner);
    }
    for (const owner of owners) {
      if (!this._reservations.has(owner)) {
        throw new DeveloperError("GPU snapshot owner is stale or foreign");
      }
    }
    const pages = [...this._pages.values()]
      .filter((page) => !this._warmPages.has(page.descriptor.index))
      .sort((left, right) => left.descriptor.index - right.descriptor.index);
    const pageIds = new Uint32Array(pages.length);
    const pageRawBytes = new Float64Array(pages.length);
    const pageProvenance = new Float64Array(pages.length * 7);
    let rawBytesTotal = 0;
    for (let position = 0; position < pages.length; position++) {
      const page = pages[position];
      const descriptor = page.descriptor;
      pageIds[position] = descriptor.index;
      const uploadBytes = computeSegmentedAtlasPageFootprint(
        descriptor.splatCount,
        descriptor.semantic,
        this.maxShDegree,
      ).uploadBytes;
      pageRawBytes[position] = uploadBytes;
      pageProvenance.set(
        [
          descriptor.packIndex,
          descriptor.offset,
          descriptor.storedBytes,
          descriptor.rawBytes,
          descriptor.checksum,
          descriptor.kind,
          descriptor.semantic,
        ],
        position * 7,
      );
      rawBytesTotal = exactAdd(
        rawBytesTotal,
        uploadBytes,
        "GPU snapshot bytes",
      );
      page.holdCount++;
    }
    const hold = new GaussianSegmentedGpuSnapshot({
      ledger: this,
      owners,
      artifactIdentity,
      resourceGeneration: this._resourceGeneration,
      leaseIdentity: this.leaseIdentity,
      pageIds,
      pageRawBytes,
      pageProvenance,
      rawBytesTotal,
      released: false,
    });
    this._snapshotHolds.add(hold);
    this._statistics.snapshotCaptures++;
    return hold;
  };

_SceneGISGaussianSegmentedPageBindingLedger.prototype._retirePage = function (
  page,
) {
  const descriptor = page.descriptor;
  this._removeWarmPage(page);
  try {
    this._releaseBinding(page.receipt, descriptor);
    this._boundBytes = exactSubtract(
      this._boundBytes,
      computeSegmentedAtlasPageFootprint(
        descriptor.splatCount,
        descriptor.semantic,
        this.maxShDegree,
      ).uploadBytes,
      "GPU bound bytes",
    );
    this._pages.delete(descriptor.index);
    if (this._reservationPages.has(descriptor.index)) {
      this._reservedBytes = exactAdd(
        this._reservedBytes,
        computeSegmentedAtlasPageFootprint(
          descriptor.splatCount,
          descriptor.semantic,
          this.maxShDegree,
        ).uploadBytes,
        "GPU reserved bytes",
      );
    }
    this._resourceGeneration++;
    this._statistics.releases++;
    return undefined;
  } catch (error) {
    this._boundBytes = exactSubtract(
      this._boundBytes,
      computeSegmentedAtlasPageFootprint(
        descriptor.splatCount,
        descriptor.semantic,
        this.maxShDegree,
      ).uploadBytes,
      "GPU bound bytes",
    );
    this._cleanupDebtBytes = exactAdd(
      this._cleanupDebtBytes,
      computeSegmentedAtlasPageFootprint(
        descriptor.splatCount,
        descriptor.semantic,
        this.maxShDegree,
      ).uploadBytes,
      "GPU cleanup debt bytes",
    );
    const token = Object.freeze({});
    page.debt = token;
    debtStates.set(token, { ledger: this, page, error, settled: false });
    return token;
  }
};

_SceneGISGaussianSegmentedPageBindingLedger.prototype.releaseBoundPageSnapshot =
  function (hold) {
    const state = snapshotStates.get(hold);
    if (
      !state ||
      state.ledger !== this ||
      state.released ||
      !this._snapshotHolds.has(hold) ||
      this._resourceGeneration < state.resourceGeneration
    ) {
      throw new DeveloperError("GPU snapshot hold is stale or foreign");
    }
    const debts = [];
    for (const pageId of state.pageIds) {
      const page = this._pages.get(pageId);
      if (!page || page.holdCount < 1) {
        throw new DeveloperError("GPU snapshot Page hold is stale");
      }
      page.holdCount--;
      if (page.holdCount === 0 && page.owners.size === 0 && !page.debt) {
        const debt = this._releaseUnprotectedPage(page);
        if (debt) {
          debts.push(debt);
        }
      }
    }
    state.released = true;
    this._snapshotHolds.delete(hold);
    return Object.freeze(debts);
  };

_SceneGISGaussianSegmentedPageBindingLedger.prototype.releaseOwner = function (
  ownerToken,
) {
  requireOwner(ownerToken);
  const reservation = this._reservations.get(ownerToken);
  if (!reservation) {
    throw new DeveloperError("GPU Page owner is stale");
  }
  const state = reservationStates.get(reservation);
  const debts = [];
  for (const descriptor of state.pages) {
    const reservationPage = this._reservationPages.get(descriptor.index);
    reservationPage?.owners.delete(ownerToken);
    if (reservationPage?.owners.size === 0) {
      this._reservationPages.delete(descriptor.index);
      if (!this._pages.has(descriptor.index)) {
        this._reservedBytes = exactSubtract(
          this._reservedBytes,
          computeSegmentedAtlasPageFootprint(
            descriptor.splatCount,
            descriptor.semantic,
            this.maxShDegree,
          ).uploadBytes,
          "GPU reserved bytes",
        );
      }
    }
    const page = this._pages.get(descriptor.index);
    page?.owners.delete(ownerToken);
    if (page && page.owners.size === 0 && page.holdCount === 0 && !page.debt) {
      const debt = this._releaseUnprotectedPage(page);
      if (debt) {
        debts.push(debt);
      }
    }
  }
  state.released = true;
  this._reservations.delete(ownerToken);
  return Object.freeze(debts);
};

_SceneGISGaussianSegmentedPageBindingLedger.prototype.settleCleanupDebt =
  function (token) {
    const state = debtStates.get(token);
    if (!state || state.ledger !== this || state.settled) {
      throw new DeveloperError("GPU cleanup debt token is stale or foreign");
    }
    this._releaseBinding(state.page.receipt, state.page.descriptor);
    state.settled = true;
    this._cleanupDebtBytes = exactSubtract(
      this._cleanupDebtBytes,
      computeSegmentedAtlasPageFootprint(
        state.page.descriptor.splatCount,
        state.page.descriptor.semantic,
        this.maxShDegree,
      ).uploadBytes,
      "GPU cleanup debt bytes",
    );
    this._pages.delete(state.page.descriptor.index);
    if (this._reservationPages.has(state.page.descriptor.index)) {
      this._reservedBytes = exactAdd(
        this._reservedBytes,
        computeSegmentedAtlasPageFootprint(
          state.page.descriptor.splatCount,
          state.page.descriptor.semantic,
          this.maxShDegree,
        ).uploadBytes,
        "GPU reserved bytes",
      );
    }
    this._resourceGeneration++;
    this._statistics.cleanupSettlements++;
    return true;
  };

_SceneGISGaussianSegmentedPageBindingLedger.prototype.hasOwner = function (
  ownerToken,
) {
  return this._reservations.has(ownerToken);
};

export default _SceneGISGaussianSegmentedPageBindingLedger;

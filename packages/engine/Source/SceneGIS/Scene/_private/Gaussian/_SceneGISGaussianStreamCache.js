/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import defined from "../../../../Core/defined.js";
import DeveloperError from "../../../../Core/DeveloperError.js";
import { validateGaussianStreamWorkPriority } from "./_SceneGISGaussianStreamWorkPriority.js";

const TIER = Object.freeze({
  history: 0,
  predicted: 1,
  visible: 2,
});

const coreLeasePlanBrand = Symbol("GaussianStreamCacheCoreLeasePlan");
const snapshotHoldStates = new WeakMap();

class GaussianStreamCacheSnapshotHold {
  constructor(state) {
    this.artifactIdentity = state.artifactIdentity;
    this.resourceGeneration = state.resourceGeneration;
    this.leaseIdentity = state.leaseIdentity;
    this.pageCount = state.pageIds.length;
    this.storedBytes = state.storedBytesTotal;
    snapshotHoldStates.set(this, state);
    Object.freeze(this);
  }
  get pageIds() {
    return snapshotHoldStates.get(this).pageIds.slice();
  }
  get pageStoredBytes() {
    return snapshotHoldStates.get(this).pageStoredBytes.slice();
  }
  get pageRawBytes() {
    return snapshotHoldStates.get(this).pageRawBytes.slice();
  }
  get pageProvenance() {
    return snapshotHoldStates.get(this).pageProvenance.slice();
  }
}

function asUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw new DeveloperError("payload must be an ArrayBuffer or typed array");
}

function isCore(page) {
  return page.semantic === 1;
}

function validateBudget(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${name} must be a non-negative safe integer`);
  }
}

function isEarlierEvictionCandidate(entry, candidate) {
  if (entry.tier !== candidate.tier) {
    return entry.tier < candidate.tier;
  }
  if (entry.core !== candidate.core) {
    return !entry.core;
  }
  return entry.lastUsed < candidate.lastUsed;
}

/**
 * Capacity-bounded CPU cache for raw Gaussian Stream page payloads.
 *
 * @alias _SceneGISGaussianStreamCache
 * @constructor
 * @private
 */
function _SceneGISGaussianStreamCache(options) {
  options = options ?? {};
  this.maximumBytes = options.maximumBytes ?? 256 * 1024 * 1024;
  this.maximumCoreBytes = options.maximumCoreBytes ?? this.maximumBytes;
  this.maximumShBytes = options.maximumShBytes ?? this.maximumBytes;
  validateBudget(this.maximumBytes, "maximumBytes");
  validateBudget(this.maximumCoreBytes, "maximumCoreBytes");
  validateBudget(this.maximumShBytes, "maximumShBytes");
  this._entries = new Map();
  this._clock = 0;
  this._bytes = 0;
  this._coreBytes = 0;
  this._shBytes = 0;
  this._resourceGeneration = 0;
  this._snapshotLeaseIdentity = options.snapshotLeaseIdentity;
  if (
    defined(this._snapshotLeaseIdentity) &&
    (typeof this._snapshotLeaseIdentity !== "string" ||
      this._snapshotLeaseIdentity.length === 0)
  ) {
    throw new DeveloperError("snapshotLeaseIdentity must be a nonempty string");
  }
  this._snapshotHolds = new Set();
  this._snapshotHoldPages = new Map();
  this._coreLeases = new Map();
  this._coreLeasePages = new Map();
  this._coreLeaseGeneration = 0;
  this._reservedCoreLeaseBytes = 0;
  this._onEvict = options.onEvict;
  this._statistics = {
    hits: 0,
    misses: 0,
    insertions: 0,
    evictions: 0,
    rejectedInsertions: 0,
    coreLeaseCount: 0,
    coreLeaseReleaseCount: 0,
    coreLeaseConsumeCount: 0,
    coreLeaseReclaimedBytes: 0,
    coreLeaseBytesHighWater: 0,
    structuredCandidateInsertions: 0,
    structuredLookaheadInsertions: 0,
    structuredShInsertions: 0,
    structuredMaintenanceInsertions: 0,
  };
}

Object.defineProperties(_SceneGISGaussianStreamCache.prototype, {
  bytes: {
    get: function () {
      return this._bytes;
    },
  },
  bytesIncludingLeases: {
    get: function () {
      return this._bytes + this._reservedCoreLeaseBytes;
    },
  },
  coreBytes: {
    get: function () {
      return this._coreBytes;
    },
  },
  shBytes: {
    get: function () {
      return this._shBytes;
    },
  },
  size: {
    get: function () {
      return this._entries.size;
    },
  },
  resourceGeneration: {
    get: function () {
      return this._resourceGeneration;
    },
  },
  statistics: {
    get: function () {
      return {
        ...this._statistics,
        coreLeaseActiveCount: this._coreLeases.size,
        coreLeaseReservedBytes: this._reservedCoreLeaseBytes,
      };
    },
  },
});

_SceneGISGaussianStreamCache.prototype.has = function (pageIndex) {
  return this._entries.has(pageIndex);
};

_SceneGISGaussianStreamCache.prototype.peek = function (pageIndex) {
  return this._entries.get(pageIndex);
};

_SceneGISGaussianStreamCache.prototype.get = function (pageIndex) {
  const entry = this._entries.get(pageIndex);
  if (!defined(entry)) {
    this._statistics.misses++;
    return undefined;
  }
  entry.lastUsed = ++this._clock;
  this._statistics.hits++;
  return entry;
};

_SceneGISGaussianStreamCache.prototype._removeEntry = function (entry, reason) {
  if ((this._snapshotHoldPages.get(entry.page.index) ?? 0) > 0) {
    throw new DeveloperError(
      `Cache Page ${entry.page.index} is held by a physical snapshot`,
    );
  }
  const leasePage = entry.core
    ? this._coreLeasePages.get(entry.page.index)
    : undefined;
  if (defined(leasePage)) {
    this._reservedCoreLeaseBytes += leasePage.page.storedBytes;
  }
  this._entries.delete(entry.page.index);
  this._resourceGeneration++;
  this._bytes -= entry.byteLength;
  if (entry.core) {
    this._coreBytes -= entry.byteLength;
  } else {
    this._shBytes -= entry.byteLength;
  }
  if (reason === "evict") {
    this._statistics.evictions++;
  }
  if (defined(this._onEvict)) {
    this._onEvict(entry, reason);
  }
};

_SceneGISGaussianStreamCache.prototype.remove = function (pageIndex) {
  const entry = this._entries.get(pageIndex);
  if (!defined(entry)) {
    return false;
  }
  this._removeEntry(entry, "remove");
  return true;
};

_SceneGISGaussianStreamCache.prototype._overBudget = function (
  core,
  addedBytes,
) {
  const reservedBytes = this._reservedCoreLeaseBytes;
  return (
    this._bytes + addedBytes + reservedBytes > this.maximumBytes ||
    (core
      ? this._coreBytes + addedBytes + reservedBytes > this.maximumCoreBytes
      : this._shBytes + addedBytes > this.maximumShBytes)
  );
};

_SceneGISGaussianStreamCache.prototype._evictionCandidate = function (
  coreOnly,
  protectedPageIndices,
) {
  let candidate;
  for (const entry of this._entries.values()) {
    if (
      entry.pinned ||
      this._coreLeasePages.has(entry.page.index) ||
      (this._snapshotHoldPages.get(entry.page.index) ?? 0) > 0 ||
      protectedPageIndices?.has(entry.page.index)
    ) {
      continue;
    }
    if (coreOnly === true && !entry.core) {
      continue;
    }
    if (coreOnly === false && entry.core) {
      continue;
    }
    if (!defined(candidate) || isEarlierEvictionCandidate(entry, candidate)) {
      candidate = entry;
    }
  }
  return candidate;
};

_SceneGISGaussianStreamCache.prototype._makeRoom = function (core, addedBytes) {
  while (this._overBudget(core, addedBytes)) {
    let candidate;
    if (!core && this._shBytes + addedBytes > this.maximumShBytes) {
      candidate = this._evictionCandidate(false, undefined);
    } else if (core && this._coreBytes + addedBytes > this.maximumCoreBytes) {
      candidate = this._evictionCandidate(true, undefined);
    }
    candidate = candidate ?? this._evictionCandidate(undefined, undefined);
    if (!defined(candidate)) {
      return false;
    }
    this._removeEntry(candidate, "evict");
  }
  return true;
};

_SceneGISGaussianStreamCache.prototype.put = function (page, payload, options) {
  options = options ?? {};
  const workPriority = defined(options.workPriority)
    ? validateGaussianStreamWorkPriority(options.workPriority)
    : undefined;
  const existing = this._entries.get(page.index);
  if (defined(existing)) {
    existing.lastUsed = ++this._clock;
    return existing;
  }
  const bytes = asUint8Array(payload);
  const core = isCore(page);
  const tierName = options.tier ?? "history";
  const tier = TIER[tierName];
  if (!defined(tier)) {
    throw new DeveloperError(
      `Unknown Gaussian Stream cache tier '${tierName}'`,
    );
  }
  const leasePage = this._coreLeasePages.get(page.index);
  const consumesLease =
    !defined(this._entries.get(page.index)) &&
    defined(leasePage) &&
    (!defined(options.coreLeaseOwner) ||
      leasePage.owners.has(options.coreLeaseOwner));
  if (
    consumesLease &&
    (page.semantic !== 1 ||
      page.storedBytes !== leasePage.page.storedBytes ||
      bytes.byteLength !== leasePage.page.storedBytes)
  ) {
    throw new DeveloperError(`Cache CoreLease for Page ${page.index} is stale`);
  }
  if (defined(leasePage) && !consumesLease) {
    this._statistics.rejectedInsertions++;
    return undefined;
  }
  if (consumesLease) {
    if (this._reservedCoreLeaseBytes < leasePage.page.storedBytes) {
      throw new DeveloperError("Cache CoreLease reserved bytes are stale");
    }
    this._reservedCoreLeaseBytes -= leasePage.page.storedBytes;
  }
  if (!this._makeRoom(core, bytes.byteLength)) {
    if (consumesLease) {
      this._reservedCoreLeaseBytes += leasePage.page.storedBytes;
    }
    this._statistics.rejectedInsertions++;
    return undefined;
  }
  const entry = {
    page,
    payload: bytes,
    byteLength: bytes.byteLength,
    core,
    tier,
    pinned: options.pinned === true,
    lastUsed: ++this._clock,
    etag: options.etag,
    lastModified: options.lastModified,
  };
  this._entries.set(page.index, entry);
  this._resourceGeneration++;
  this._bytes += entry.byteLength;
  if (core) {
    this._coreBytes += entry.byteLength;
  } else {
    this._shBytes += entry.byteLength;
  }
  this._statistics.insertions++;
  if (defined(workPriority)) {
    const names = [
      "structuredCandidateInsertions",
      "structuredLookaheadInsertions",
      "structuredShInsertions",
      "structuredMaintenanceInsertions",
    ];
    this._statistics[names[workPriority.workClass]]++;
  }
  if (consumesLease) {
    this._statistics.coreLeaseConsumeCount++;
  }
  return entry;
};

_SceneGISGaussianStreamCache.prototype.planCoreLease = function (options = {}) {
  const ownerToken = options.ownerToken;
  const requiredPages = [...(options.requiredPages ?? [])]
    .filter(defined)
    .sort((left, right) => left.index - right.index);
  if (typeof ownerToken !== "string" || ownerToken.length === 0) {
    throw new DeveloperError("Cache CoreLease owner is invalid");
  }
  if (this._coreLeases.has(ownerToken)) {
    throw new DeveloperError("Cache CoreLease owner already exists");
  }
  const required = new Map();
  for (const page of requiredPages) {
    if (
      page.semantic !== 1 ||
      !Number.isSafeInteger(page.index) ||
      page.index < 0 ||
      !Number.isSafeInteger(page.storedBytes) ||
      page.storedBytes < 1
    ) {
      throw new DeveloperError("WorkSet Cache reservation Page is invalid");
    }
    const prior = required.get(page.index);
    if (defined(prior) && prior.storedBytes !== page.storedBytes) {
      throw new DeveloperError(
        "WorkSet Cache reservation Page identity conflicts",
      );
    }
    required.set(page.index, page);
    const entry = this._entries.get(page.index);
    if (defined(entry)) {
      if (!entry.core || entry.byteLength !== page.storedBytes) {
        throw new DeveloperError(
          "WorkSet Cache resident Page identity conflicts",
        );
      }
    }
  }
  const ceiling = this.maximumBytes;
  let incrementalMissingBytes = 0;
  for (const page of required.values()) {
    if (
      !this._entries.has(page.index) &&
      !this._coreLeasePages.has(page.index)
    ) {
      incrementalMissingBytes += page.storedBytes;
    }
  }
  let bytesAfter = this._bytes;
  let coreBytesAfter = this._coreBytes;
  const victimPageIndices = [];
  let reclaimedBytes = 0;
  const pressure =
    bytesAfter + this._reservedCoreLeaseBytes + incrementalMissingBytes >
      ceiling ||
    coreBytesAfter + this._reservedCoreLeaseBytes + incrementalMissingBytes >
      this.maximumCoreBytes;
  const candidates = pressure
    ? [...this._entries.values()]
        .filter(
          (entry) =>
            !entry.pinned &&
            !this._coreLeasePages.has(entry.page.index) &&
            !required.has(entry.page.index),
        )
        .sort((left, right) =>
          isEarlierEvictionCandidate(left, right)
            ? -1
            : isEarlierEvictionCandidate(right, left)
              ? 1
              : left.page.index - right.page.index,
        )
    : [];
  while (
    bytesAfter + this._reservedCoreLeaseBytes + incrementalMissingBytes >
      ceiling ||
    coreBytesAfter + this._reservedCoreLeaseBytes + incrementalMissingBytes >
      this.maximumCoreBytes
  ) {
    const victim = candidates.shift();
    if (!defined(victim)) {
      return Object.freeze({
        admitted: false,
        blocker: "cpu-cache-hard-capacity",
        ownerToken,
        resourceGeneration: this._resourceGeneration,
        leaseGeneration: this._coreLeaseGeneration,
        maximumBytes: ceiling,
        reservedBytes: incrementalMissingBytes,
        reclaimedBytes,
        victimPageIndices: Object.freeze(victimPageIndices),
        requiredPages: Object.freeze(
          [...required.values()].map((page) =>
            Object.freeze({
              pageIndex: page.index,
              storedBytes: page.storedBytes,
            }),
          ),
        ),
      });
    }
    victimPageIndices.push(victim.page.index);
    bytesAfter -= victim.byteLength;
    if (victim.core) {
      coreBytesAfter -= victim.byteLength;
    }
    reclaimedBytes += victim.byteLength;
    if (!Number.isSafeInteger(reclaimedBytes)) {
      throw new DeveloperError(
        "Transition Cache reclaimed bytes exceed safe range",
      );
    }
  }
  return Object.freeze({
    admitted: true,
    blocker: undefined,
    [coreLeasePlanBrand]: true,
    ownerToken,
    resourceGeneration: this._resourceGeneration,
    leaseGeneration: this._coreLeaseGeneration,
    maximumBytes: ceiling,
    reservedBytes: incrementalMissingBytes,
    reclaimedBytes,
    bytesAfterLease:
      bytesAfter + this._reservedCoreLeaseBytes + incrementalMissingBytes,
    victimPageIndices: Object.freeze(victimPageIndices),
    requiredPages: Object.freeze(
      [...required.values()].map((page) =>
        Object.freeze({ pageIndex: page.index, storedBytes: page.storedBytes }),
      ),
    ),
  });
};

_SceneGISGaussianStreamCache.prototype.commitCoreLease = function (plan) {
  if (
    plan?.[coreLeasePlanBrand] !== true ||
    plan?.admitted !== true ||
    typeof plan.ownerToken !== "string" ||
    this._coreLeases.has(plan.ownerToken)
  ) {
    throw new DeveloperError("Cache CoreLease plan is unavailable");
  }
  if (
    plan.resourceGeneration !== this._resourceGeneration ||
    plan.leaseGeneration !== this._coreLeaseGeneration
  ) {
    return undefined;
  }
  for (const pageIndex of plan.victimPageIndices) {
    this._removeEntry(this._entries.get(pageIndex), "evict");
  }
  for (const page of plan.requiredPages) {
    let record = this._coreLeasePages.get(page.pageIndex);
    if (!defined(record)) {
      record = { page, owners: new Set() };
      this._coreLeasePages.set(page.pageIndex, record);
      if (!this._entries.has(page.pageIndex)) {
        this._reservedCoreLeaseBytes += page.storedBytes;
      }
    }
    record.owners.add(plan.ownerToken);
  }
  const lease = Object.freeze({
    ownerToken: plan.ownerToken,
    leaseGeneration: this._coreLeaseGeneration + 1,
    requiredPages: Object.freeze(
      plan.requiredPages.map((page) => Object.freeze({ ...page })),
    ),
  });
  this._coreLeaseGeneration++;
  this._coreLeases.set(plan.ownerToken, lease);
  this._statistics.coreLeaseCount++;
  this._statistics.coreLeaseReclaimedBytes += plan.reclaimedBytes;
  this._statistics.coreLeaseBytesHighWater = Math.max(
    this._statistics.coreLeaseBytesHighWater,
    this._reservedCoreLeaseBytes,
  );
  return lease;
};

_SceneGISGaussianStreamCache.prototype.releaseCoreLease = function (
  lease,
  ownerToken,
) {
  if (!defined(lease)) {
    return false;
  }
  const current = this._coreLeases.get(ownerToken);
  if (current !== lease || lease.ownerToken !== ownerToken) {
    throw new DeveloperError("Cache CoreLease owner is stale");
  }
  this._coreLeases.delete(ownerToken);
  for (const page of lease.requiredPages) {
    const record = this._coreLeasePages.get(page.pageIndex);
    record?.owners.delete(ownerToken);
    if (record?.owners.size === 0) {
      this._coreLeasePages.delete(page.pageIndex);
      if (!this._entries.has(page.pageIndex)) {
        this._reservedCoreLeaseBytes -= page.storedBytes;
      }
    }
  }
  this._coreLeaseGeneration++;
  this._statistics.coreLeaseReleaseCount++;
  return true;
};

_SceneGISGaussianStreamCache.prototype.hasCoreLease = function (
  lease,
  ownerToken,
) {
  return this._coreLeases.get(ownerToken) === lease;
};

_SceneGISGaussianStreamCache.prototype.captureHeldPageSnapshot = function (
  ownerToken,
  artifactIdentity,
) {
  if (
    !defined(ownerToken) ||
    typeof artifactIdentity !== "string" ||
    artifactIdentity.length === 0 ||
    !defined(this._snapshotLeaseIdentity)
  ) {
    throw new DeveloperError("Cache snapshot hold authority is invalid");
  }
  const entries = [...this._entries.values()]
    .filter((entry) => entry.page.artifactIdentity === artifactIdentity)
    .sort((left, right) => left.page.index - right.page.index);
  const pageIds = new Uint32Array(entries.length);
  const pageStoredBytes = new Float64Array(entries.length);
  const pageRawBytes = new Float64Array(entries.length);
  const pageProvenance = new Float64Array(entries.length * 7);
  let storedBytesTotal = 0;
  for (let position = 0; position < entries.length; position++) {
    const entry = entries[position];
    const page = entry.page;
    if (
      !Number.isSafeInteger(page.rawBytes) ||
      page.rawBytes < 0 ||
      entry.byteLength !== page.storedBytes
    ) {
      throw new DeveloperError("Cache snapshot Page identity is invalid");
    }
    pageIds[position] = page.index;
    pageStoredBytes[position] = page.storedBytes;
    pageRawBytes[position] = page.rawBytes;
    pageProvenance.set(
      [
        page.packIndex,
        page.offset,
        page.storedBytes,
        page.rawBytes,
        page.checksum,
        page.kind,
        page.semantic,
      ],
      position * 7,
    );
    storedBytesTotal += page.storedBytes;
    if (!Number.isSafeInteger(storedBytesTotal)) {
      throw new DeveloperError("Cache snapshot bytes exceed safe range");
    }
  }
  for (const pageId of pageIds) {
    this._snapshotHoldPages.set(
      pageId,
      (this._snapshotHoldPages.get(pageId) ?? 0) + 1,
    );
  }
  const hold = new GaussianStreamCacheSnapshotHold({
    cache: this,
    ownerToken,
    artifactIdentity,
    resourceGeneration: this._resourceGeneration,
    leaseIdentity: this._snapshotLeaseIdentity,
    pageIds,
    pageStoredBytes,
    pageRawBytes,
    pageProvenance,
    storedBytesTotal,
    released: false,
  });
  this._snapshotHolds.add(hold);
  return hold;
};

_SceneGISGaussianStreamCache.prototype.releaseHeldPageSnapshot = function (
  hold,
  ownerToken,
) {
  const state = snapshotHoldStates.get(hold);
  if (
    !state ||
    state.cache !== this ||
    state.ownerToken !== ownerToken ||
    state.released ||
    !this._snapshotHolds.has(hold) ||
    this._resourceGeneration < state.resourceGeneration
  ) {
    throw new DeveloperError("Cache snapshot hold is stale or foreign");
  }
  for (const pageId of state.pageIds) {
    const count = this._snapshotHoldPages.get(pageId);
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new DeveloperError("Cache snapshot hold count is stale");
    }
    if (count === 1) {
      this._snapshotHoldPages.delete(pageId);
    } else {
      this._snapshotHoldPages.set(pageId, count - 1);
    }
  }
  state.released = true;
  this._snapshotHolds.delete(hold);
  return true;
};

_SceneGISGaussianStreamCache.prototype.updateTiers = function (sets) {
  sets = sets ?? {};
  const visible = sets.visible ?? new Set();
  const predicted = sets.predicted ?? new Set();
  const protectedPages = sets.protected ?? new Set();
  for (const entry of this._entries.values()) {
    const pageIndex = entry.page.index;
    if (visible.has(pageIndex)) {
      entry.tier = TIER.visible;
      entry.pinned = protectedPages.has(pageIndex);
    } else if (predicted.has(pageIndex)) {
      entry.tier = TIER.predicted;
      entry.pinned = protectedPages.has(pageIndex);
    } else {
      entry.tier = TIER.history;
      entry.pinned = protectedPages.has(pageIndex);
    }
  }
};

_SceneGISGaussianStreamCache.prototype.trim = function () {
  while (this._overBudget(true, 0) || this._overBudget(false, 0)) {
    const candidate = this._evictionCandidate();
    if (!defined(candidate)) {
      return false;
    }
    this._removeEntry(candidate, "evict");
  }
  return true;
};

_SceneGISGaussianStreamCache.prototype.trimToBytes = function (
  maximumBytes,
  protectedPageIndices,
) {
  validateBudget(maximumBytes, "maximumBytes");
  protectedPageIndices = protectedPageIndices ?? new Set();
  if (!(protectedPageIndices instanceof Set)) {
    throw new DeveloperError("protectedPageIndices must be a Set");
  }
  while (this._bytes > maximumBytes) {
    const candidate = this._evictionCandidate(undefined, protectedPageIndices);
    if (!defined(candidate)) {
      return false;
    }
    this._removeEntry(candidate, "evict");
  }
  return true;
};

_SceneGISGaussianStreamCache.prototype.clear = function () {
  if (this._snapshotHolds.size > 0) {
    throw new DeveloperError("Cannot clear Cache with active snapshot holds");
  }
  this._coreLeases.clear();
  this._coreLeasePages.clear();
  this._reservedCoreLeaseBytes = 0;
  for (const entry of [...this._entries.values()]) {
    this._removeEntry(entry, "clear");
  }
};

_SceneGISGaussianStreamCache.Tier = TIER;

export default _SceneGISGaussianStreamCache;

/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import defined from "../../../../Core/defined.js";
import DeveloperError from "../../../../Core/DeveloperError.js";
import { validatePagePayload } from "./_SceneGISGaussianStreamPackFormat.js";
import {
  compareGaussianStreamWorkPriority,
  normalizeGaussianStreamWorkPriority,
  validateGaussianStreamWorkPriority,
} from "./_SceneGISGaussianStreamWorkPriority.js";

const DATABASE_NAME = "CesiumGaussianStreamCache";
const DATABASE_VERSION = 1;
const SCHEMA = "t3b-eg4a-v1";
const DEFAULT_MAXIMUM_BYTES = 4 * 1024 * 1024 * 1024;
const DEFAULT_STAGING_BYTES = 64 * 1024 * 1024;
const FALLBACK_EFFECTIVE_BYTES = 512 * 1024 * 1024;
const MAXIMUM_TOUCHES = 256;
const MAXIMUM_TOUCH_MUTATION_PAGES = 32;
const MAXIMUM_CORRUPT_DELETES = 256;
const TOUCH_FLUSH_DELAY_MS = 50;
const DEFAULT_LOOKUP_TIMEOUT_MS = 250;
const DEFAULT_MAINTENANCE_TIMEOUT_MS = 2000;
const DEFAULT_QUOTA_SHARE_FRACTION = 0.25;

const sharedOwners = new Map();

function positiveSafeInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DeveloperError(`${name} must be a positive safe integer`);
  }
  return value;
}

function quotaShareFraction(value) {
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new DeveloperError(
      "quotaShareFraction must be finite and greater than zero and at most one",
    );
  }
  return value;
}

function sanitizedReason(error) {
  const name = typeof error?.name === "string" ? error.name : "Error";
  return name.slice(0, 64);
}

function validateMutationResult(result) {
  if (
    !defined(result) ||
    !Number.isSafeInteger(result.totalBytes) ||
    result.totalBytes < 0 ||
    !Number.isSafeInteger(result.evictedPages) ||
    result.evictedPages < 0 ||
    !Number.isSafeInteger(result.evictedBytes) ||
    result.evictedBytes < 0
  ) {
    throw new Error("PersistentCacheMutationResultInvalid");
  }
  return result;
}

function requestPromise(request) {
  return new Promise(function (resolve, reject) {
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error);
    };
  });
}

function transactionPromise(transaction) {
  return new Promise(function (resolve, reject) {
    transaction.oncomplete = resolve;
    transaction.onerror = function () {
      reject(transaction.error);
    };
    transaction.onabort = function () {
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    };
  });
}

function deadline(promise, timeout, onTimeout) {
  let timer;
  return Promise.race([
    promise,
    new Promise(function (_resolve, reject) {
      timer = setTimeout(function () {
        onTimeout?.();
        const error = new Error("Persistent cache operation timed out");
        error.name = "TimeoutError";
        reject(error);
      }, timeout);
    }),
  ]).finally(function () {
    clearTimeout(timer);
  });
}

function abortError() {
  const error = new Error("Persistent cache lookup aborted");
  error.name = "AbortError";
  return error;
}

function waitForSignal(promise, signal) {
  if (!defined(signal)) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(abortError());
  }
  let abort;
  const aborted = new Promise(function (_resolve, reject) {
    abort = function () {
      reject(signal.reason instanceof Error ? signal.reason : abortError());
    };
    signal.addEventListener("abort", abort, { once: true });
  });
  return Promise.race([promise, aborted]).finally(function () {
    signal.removeEventListener("abort", abort);
  });
}

function lookupResults(results, disposition) {
  Object.defineProperty(results, "persistentDisposition", {
    value: disposition,
    enumerable: false,
  });
  return results;
}

function immutableLookupContext(context, authority) {
  return Object.freeze({
    ...context,
    persistentWriteAuthority: authority,
  });
}

function nextEpoch(accounting) {
  return Math.max((accounting.highWaterEpoch ?? 0) + 1, Date.now());
}

class IndexedDbAdapter {
  constructor(indexedDB, databaseName) {
    this._indexedDB = indexedDB;
    this._databaseName = databaseName;
    this._database = undefined;
    this.transactionCreates = 0;
    this.transactionAbortRequests = 0;
    this.transactionAborts = 0;
    this.transactionCompletes = 0;
  }

  async _readwrite(storeNames, signal, run) {
    const transaction = this._database.transaction(storeNames, "readwrite");
    this.transactionCreates++;
    let settled = false;
    const settlement = new Promise((resolve, reject) => {
      transaction.oncomplete = () => {
        settled = true;
        this.transactionCompletes++;
        resolve();
      };
      transaction.onabort = () => {
        if (!settled) {
          settled = true;
          this.transactionAborts++;
        }
        reject(transaction.error ?? abortError());
      };
    });
    const abort = () => {
      this.transactionAbortRequests++;
      try {
        this.onAbortTransaction?.(transaction);
        transaction.abort();
      } catch (_error) {
        // Completion won the race. Settlement still remains authoritative.
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
    try {
      await this.onReadwriteTransaction?.(transaction, signal);
      const result = await run(transaction);
      await settlement;
      return result;
    } catch (error) {
      abort();
      try {
        await settlement;
      } catch (_settlementError) {
        // Preserve the operation or deadline reason after exact settlement.
      }
      throw signal?.aborted && signal.reason instanceof Error
        ? signal.reason
        : error;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  async open() {
    if (!defined(this._indexedDB)) {
      throw new Error("IndexedDBUnavailable");
    }
    const request = this._indexedDB.open(this._databaseName, DATABASE_VERSION);
    request.onupgradeneeded = function () {
      const database = request.result;
      if (!database.objectStoreNames.contains("scenes")) {
        const scenes = database.createObjectStore("scenes", {
          keyPath: "sceneOwner",
          autoIncrement: true,
        });
        scenes.createIndex("runtimeIndexIdentity", "runtimeIndexIdentity", {
          unique: true,
        });
      }
      if (!database.objectStoreNames.contains("pages")) {
        const pages = database.createObjectStore("pages", {
          keyPath: ["sceneOwner", "pageIndex"],
        });
        pages.createIndex("lastAccessEpoch", "lastAccessEpoch");
      }
      if (!database.objectStoreNames.contains("metadata")) {
        database.createObjectStore("metadata", { keyPath: "key" });
      }
    };
    const database = await new Promise(function (resolve, reject) {
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
      request.onblocked = function () {
        const error = new Error("IndexedDB open blocked");
        error.name = "BlockedError";
        reject(error);
      };
    });
    this._database = database;
    database.onversionchange = function () {
      database.close();
      this.onVersionChange?.();
    }.bind(this);
    return database;
  }

  async ensureScene(runtimeIndexIdentity, signal) {
    return this._readwrite("scenes", signal, async (transaction) => {
      const store = transaction.objectStore("scenes");
      const index = store.index("runtimeIndexIdentity");
      const prior = await requestPromise(index.get(runtimeIndexIdentity));
      if (!defined(prior)) {
        return requestPromise(
          store.add({
            runtimeIndexIdentity,
            schema: SCHEMA,
          }),
        );
      } else if (prior.schema !== SCHEMA) {
        throw new Error("PersistentCacheSchemaMismatch");
      }
      return prior.sceneOwner;
    });
  }

  async getAccounting() {
    const transaction = this._database.transaction("metadata", "readonly");
    const record = await requestPromise(
      transaction.objectStore("metadata").get("accounting"),
    );
    await transactionPromise(transaction);
    return record;
  }

  async getPages(sceneOwner, pageIndices, signal) {
    const transaction = this._database.transaction("pages", "readonly");
    const abort = function () {
      try {
        transaction.abort();
      } catch (_error) {
        // A completed transaction no longer needs cancellation.
      }
    };
    signal?.addEventListener("abort", abort, { once: true });
    const store = transaction.objectStore("pages");
    try {
      const records = await Promise.all(
        pageIndices.map((pageIndex) =>
          requestPromise(store.get([sceneOwner, pageIndex])),
        ),
      );
      await transactionPromise(transaction);
      return records;
    } finally {
      signal?.removeEventListener("abort", abort);
    }
  }

  async deletePage(sceneOwner, pageIndex, signal) {
    return this._readwrite(
      ["pages", "metadata"],
      signal,
      async (transaction) => {
        const pages = transaction.objectStore("pages");
        const metadata = transaction.objectStore("metadata");
        const record = await requestPromise(pages.get([sceneOwner, pageIndex]));
        const accounting = (await requestPromise(
          metadata.get("accounting"),
        )) ?? {
          key: "accounting",
          schema: SCHEMA,
          totalBytes: 0,
          highWaterEpoch: 0,
        };
        if (defined(record)) {
          pages.delete([sceneOwner, pageIndex]);
          accounting.totalBytes = Math.max(
            0,
            accounting.totalBytes - record.storedBytes,
          );
          metadata.put(accounting);
        }
        return defined(record) ? record.storedBytes : 0;
      },
    );
  }

  async writePage(record, maximumBytes, signal) {
    return this._readwrite(
      ["pages", "metadata"],
      signal,
      async (transaction) => {
        const pages = transaction.objectStore("pages");
        const metadata = transaction.objectStore("metadata");
        const key = [record.sceneOwner, record.pageIndex];
        const prior = await requestPromise(pages.get(key));
        const accounting = (await requestPromise(
          metadata.get("accounting"),
        )) ?? {
          key: "accounting",
          schema: SCHEMA,
          totalBytes: 0,
          highWaterEpoch: 0,
        };
        if (accounting.schema !== SCHEMA) {
          transaction.abort();
          throw new Error("PersistentCacheAccountingSchemaMismatch");
        }
        if (
          !Number.isSafeInteger(accounting.totalBytes) ||
          accounting.totalBytes < 0 ||
          (defined(prior) && accounting.totalBytes < prior.storedBytes)
        ) {
          transaction.abort();
          const error = new Error("PersistentCacheAccountingContradiction");
          error.name = "AccountingError";
          throw error;
        }
        let totalBytes =
          accounting.totalBytes -
          (prior?.storedBytes ?? 0) +
          record.storedBytes;
        let evictedPages = 0;
        let evictedBytes = 0;
        if (totalBytes > maximumBytes) {
          const index = pages.index("lastAccessEpoch");
          await new Promise(function (resolve, reject) {
            const cursorRequest = index.openCursor();
            cursorRequest.onerror = function () {
              reject(cursorRequest.error);
            };
            cursorRequest.onsuccess = function () {
              const cursor = cursorRequest.result;
              if (!defined(cursor) || totalBytes <= maximumBytes) {
                resolve();
                return;
              }
              const value = cursor.value;
              if (
                value.sceneOwner === record.sceneOwner &&
                value.pageIndex === record.pageIndex
              ) {
                cursor.continue();
                return;
              }
              totalBytes -= value.storedBytes;
              evictedPages++;
              evictedBytes += value.storedBytes;
              cursor.delete();
              cursor.continue();
            };
          });
        }
        if (totalBytes > maximumBytes) {
          transaction.abort();
          const error = new Error("PersistentCacheQuotaExceeded");
          error.name = "QuotaExceededError";
          throw error;
        }
        const epoch = nextEpoch(accounting);
        if (defined(prior)) {
          record.createdEpoch = prior.createdEpoch;
        } else {
          record.createdEpoch = epoch;
        }
        record.lastAccessEpoch = epoch;
        pages.put(record);
        accounting.totalBytes = totalBytes;
        accounting.highWaterEpoch = epoch;
        metadata.put(accounting);
        return { totalBytes, evictedPages, evictedBytes };
      },
    );
  }

  async evictOldest(sceneOwner, pageIndex, signal) {
    return this._readwrite(
      ["pages", "metadata"],
      signal,
      async (transaction) => {
        const pages = transaction.objectStore("pages");
        const metadata = transaction.objectStore("metadata");
        const accounting = (await requestPromise(
          metadata.get("accounting"),
        )) ?? {
          key: "accounting",
          schema: SCHEMA,
          totalBytes: 0,
          highWaterEpoch: 0,
        };
        let evictedBytes = 0;
        await new Promise(function (resolve, reject) {
          const request = pages.index("lastAccessEpoch").openCursor();
          request.onerror = function () {
            reject(request.error);
          };
          request.onsuccess = function () {
            const cursor = request.result;
            if (!defined(cursor)) {
              resolve();
              return;
            }
            const value = cursor.value;
            if (
              value.sceneOwner === sceneOwner &&
              value.pageIndex === pageIndex
            ) {
              cursor.continue();
              return;
            }
            evictedBytes = value.storedBytes;
            cursor.delete();
            resolve();
          };
        });
        if (evictedBytes > 0) {
          accounting.totalBytes = Math.max(
            0,
            accounting.totalBytes - evictedBytes,
          );
          metadata.put(accounting);
        }
        return {
          totalBytes: accounting.totalBytes,
          evictedPages: evictedBytes > 0 ? 1 : 0,
          evictedBytes,
        };
      },
    );
  }

  async touchPages(keys, signal) {
    return this._readwrite(
      ["pages", "metadata"],
      signal,
      async (transaction) => {
        const store = transaction.objectStore("pages");
        const metadata = transaction.objectStore("metadata");
        const accounting = (await requestPromise(
          metadata.get("accounting"),
        )) ?? {
          key: "accounting",
          schema: SCHEMA,
          totalBytes: 0,
          highWaterEpoch: 0,
        };
        const epoch = nextEpoch(accounting);
        for (const key of keys) {
          const record = await requestPromise(store.get(key));
          if (defined(record)) {
            record.lastAccessEpoch = epoch;
            store.put(record);
          }
        }
        accounting.highWaterEpoch = epoch;
        metadata.put(accounting);
        return epoch;
      },
    );
  }

  async repairAccounting(signal) {
    return this._readwrite(
      ["pages", "metadata"],
      signal,
      async (transaction) => {
        const pages = transaction.objectStore("pages");
        const metadata = transaction.objectStore("metadata");
        let totalBytes = 0;
        let highWaterEpoch = 0;
        await new Promise(function (resolve, reject) {
          const request = pages.openCursor();
          request.onerror = function () {
            reject(request.error);
          };
          request.onsuccess = function () {
            const cursor = request.result;
            if (!defined(cursor)) {
              resolve();
              return;
            }
            totalBytes += cursor.value.storedBytes;
            highWaterEpoch = Math.max(
              highWaterEpoch,
              cursor.value.createdEpoch ?? 0,
              cursor.value.lastAccessEpoch ?? 0,
            );
            cursor.continue();
          };
        });
        metadata.put({
          key: "accounting",
          schema: SCHEMA,
          totalBytes,
          highWaterEpoch,
        });
        return { totalBytes, highWaterEpoch };
      },
    );
  }

  async clear(signal) {
    return this._readwrite(
      ["scenes", "pages", "metadata"],
      signal,
      async (transaction) => {
        transaction.objectStore("scenes").clear();
        transaction.objectStore("pages").clear();
        transaction.objectStore("metadata").clear();
      },
    );
  }

  close() {
    this._database?.close();
    this._database = undefined;
  }
}

function createLegacyDescriptorProvider(index) {
  return Object.freeze({
    artifactIdentity: undefined,
    runtimeIndexIdentity: index.runtimeIndexIdentity,
    readPageRequest: function (pageIndex) {
      return index.pages[pageIndex];
    },
    readPackRequest: function (packIndex) {
      return index.packs[packIndex];
    },
  });
}

function pageMetadata(provider, page, createdEpoch, lastAccessEpoch) {
  const pack = provider.readPackRequest(page.packIndex);
  if (!defined(pack)) {
    throw new DeveloperError(`Page ${page.index} has no canonical Pack`);
  }
  const segmentedMetadata = defined(provider.artifactIdentity)
    ? {
        artifactIdentity: provider.artifactIdentity,
        runtimeIndexIdentity: provider.runtimeIndexIdentity,
        assetId: page.assetId,
        assetLocalStart: page.assetLocalStart,
        packId: page.packId,
        kind: page.kind,
        layoutId: page.layoutId,
        rawBytes: page.rawBytes,
        packFileName: pack.fileName,
      }
    : {};
  return Object.freeze({
    pageIndex: page.index,
    payloadIndex: page.payloadIndex,
    packIndex: page.packIndex,
    layout: page.layoutIndex,
    semantic: page.semantic,
    byteOffset: page.offset,
    storedBytes: page.storedBytes,
    splatCount: page.splatCount,
    checksum: page.checksum,
    packFileBytes: pack.fileBytes,
    packChecksum: pack.checksum,
    ...segmentedMetadata,
    createdEpoch,
    lastAccessEpoch,
  });
}

function sameMetadata(actual, expected) {
  return (
    defined(actual) &&
    actual.pageIndex === expected.pageIndex &&
    actual.payloadIndex === expected.payloadIndex &&
    actual.packIndex === expected.packIndex &&
    actual.layout === expected.layout &&
    actual.semantic === expected.semantic &&
    actual.byteOffset === expected.byteOffset &&
    actual.storedBytes === expected.storedBytes &&
    actual.rawBytes === expected.rawBytes &&
    actual.splatCount === expected.splatCount &&
    actual.checksum === expected.checksum &&
    actual.packFileBytes === expected.packFileBytes &&
    actual.packChecksum === expected.packChecksum &&
    actual.artifactIdentity === expected.artifactIdentity &&
    actual.runtimeIndexIdentity === expected.runtimeIndexIdentity &&
    actual.assetId === expected.assetId &&
    actual.assetLocalStart === expected.assetLocalStart &&
    actual.packId === expected.packId &&
    actual.kind === expected.kind &&
    actual.layoutId === expected.layoutId &&
    actual.packFileName === expected.packFileName
  );
}

function createCounters() {
  const counters = {
    lookupHitPages: 0,
    lookupHitBytes: 0,
    lookupMissPages: 0,
    lookupCorruptPages: 0,
    lookupErrorPages: 0,
    lookupTimeoutPages: 0,
    lookupCancelledPages: 0,
    foregroundReadHighWater: 0,
    deferredWriteStarts: 0,
    deferredTouchFlushes: 0,
    localStagingBackpressurePages: 0,
    corruptDeleteQueuedPages: 0,
    corruptDeleteCommittedPages: 0,
    corruptDeleteFailedPages: 0,
    touchMutationCount: 0,
    touchMutationMaximumPages: 0,
    writeSuppressedPages: 0,
    writeSuppressedBytes: 0,
    writeQueuedPages: 0,
    writeQueuedBytes: 0,
    writeCommittedPages: 0,
    writeCommittedBytes: 0,
    writeDroppedPages: 0,
    writeDroppedBytes: 0,
    writeFailedPages: 0,
    writeFailedBytes: 0,
    evictionPages: 0,
    evictionBytes: 0,
    quotaRetries: 0,
    repairCount: 0,
  };
  for (const prefix of ["work", "sh", "maintenance"]) {
    for (const outcome of [
      "LookupPages",
      "HitPages",
      "MissPages",
      "CorruptPages",
      "TimeoutPages",
      "BackpressurePages",
      "WriteQueuedPages",
      "WriteDroppedPages",
      "WriteSuppressedPages",
      "WriteCommittedPages",
      "WriteFailedPages",
    ]) {
      counters[`${prefix}${outcome}`] = 0;
    }
  }
  return counters;
}

function workClassPrefix(workPriority) {
  return ["work", undefined, "sh", "maintenance"][workPriority?.workClass ?? 3];
}

function incrementClassCounter(owner, workPriority, outcome, count = 1) {
  owner.counters[`${workClassPrefix(workPriority)}${outcome}`] += count;
}

function comparePendingWrites(left, right) {
  return (
    compareGaussianStreamWorkPriority(left.workPriority, right.workPriority) ||
    left.pendingSequence - right.pendingSequence
  );
}

function worstPendingWriteIndex(pendingWrites) {
  let index = -1;
  for (let i = 0; i < pendingWrites.length; i++) {
    if (
      index === -1 ||
      comparePendingWrites(pendingWrites[i], pendingWrites[index]) > 0
    ) {
      index = i;
    }
  }
  return index;
}

class SharedPersistentOwner {
  constructor(options) {
    this.adapter = options.adapter;
    this.lifetimeToken = Object.freeze({});
    this.storage = options.storage;
    this.clients = new Map();
    this.configuredMaximumBytes = options.maximumBytes;
    this.maximumStagingBytes = options.maximumStagingBytes;
    this.sharedQuotaShareFraction = options.quotaShareFraction;
    this.quotaMaximumBytes = FALLBACK_EFFECTIVE_BYTES;
    this.quotaEstimateStatus =
      typeof this.storage?.estimate === "function" ? "pending" : "unsupported";
    this.originQuotaBytes = undefined;
    this.originUsageBytes = undefined;
    this.originAvailableBytes = undefined;
    this.originQuotaShareBytes = undefined;
    this.originReclaimableMaximumBytes = undefined;
    this.quotaLimitFactor = "estimate-fallback";
    this.limitingFactor = "estimate-fallback";
    this.requestPersistentStorage = options.requestPersistentStorage;
    this.persistentStorageStatus = !this.requestPersistentStorage
      ? "not-requested"
      : typeof this.storage?.persist === "function"
        ? "pending"
        : "unsupported";
    this.references = 0;
    this.operational = false;
    this.disabledReason = undefined;
    this.effectiveMaximumBytes = FALLBACK_EFFECTIVE_BYTES;
    this.ownedBytes = 0;
    this.stagingBytes = 0;
    this.stagingBytesHighWater = 0;
    this.activeReadBatches = 0;
    this.foregroundReadEpoch = 0;
    this.activeWriteTransactions = 0;
    this.activeMutationTransactions = 0;
    this.activeMaintenanceOperations = 0;
    this.activeMaintenanceTimers = 0;
    this.activeMaintenanceControllers = new Set();
    this.pendingWrites = [];
    this.pendingWriteBytes = 0;
    this.pendingWriteSequence = 0;
    this.touches = new Map();
    this.corruptDeletes = new Map();
    this.corruptDeleteActive = false;
    this.corruptDeleteDeferred = false;
    this.touchFlushTimer = undefined;
    this.touchFlushDeferred = false;
    this.writePumpDeferred = false;
    this.mutationTail = Promise.resolve();
    this.mutationTailIdle = true;
    this.sceneOwners = new Map();
    this.storageGeneration = 0;
    this.settlementGeneration = 0;
    this.accountingValid = false;
    this.repairPromise = undefined;
    this.closeTimer = undefined;
    this.maintenanceTimeoutMs = options.maintenanceTimeoutMs;
    this.touchFlushDelayMs = options.touchFlushDelayMs;
    this.counters = createCounters();
    this.lastReason = undefined;
    this.writesDisabled = false;
    this.repairAttempted = false;
    this.lifecycleGeneration = 0;
    this.closed = false;
    this.adapter.onVersionChange = () => {
      const error = new Error("Persistent cache version changed");
      error.name = "AbortError";
      for (const controller of this.activeMaintenanceControllers) {
        controller.abort(error);
      }
      this.lifecycleGeneration++;
      this.storageGeneration++;
      this.settlementGeneration++;
      this.cancelTouchFlush();
      this.touches.clear();
      this.corruptDeletes.clear();
      this.corruptDeleteDeferred = false;
      this.sceneOwners.clear();
      this.accountingValid = false;
      this.operational = false;
      this.disabledReason = "VersionChange";
      this.lastReason = this.disabledReason;
    };
    this.ready = this.initialize();
  }

  async initialize() {
    const lifecycleGeneration = this.lifecycleGeneration;
    try {
      await this.maintenance(this.adapter.open());
      const accounting = await this.maintenance(this.adapter.getAccounting?.());
      if (this.closed || lifecycleGeneration !== this.lifecycleGeneration) {
        return;
      }
      if (defined(accounting) && accounting.schema !== SCHEMA) {
        throw new Error("PersistentCacheSchemaMismatch");
      }
      if (
        defined(accounting) &&
        accounting.schema === SCHEMA &&
        Number.isSafeInteger(accounting.totalBytes) &&
        accounting.totalBytes >= 0 &&
        Number.isSafeInteger(accounting.highWaterEpoch ?? 0) &&
        (accounting.highWaterEpoch ?? 0) >= 0
      ) {
        this.ownedBytes = accounting.totalBytes;
        this.accountingValid = true;
      }
      if (typeof this.storage?.estimate === "function") {
        try {
          const estimate = await this.maintenance(
            Promise.resolve(this.storage.estimate()),
          );
          if (
            Number.isFinite(estimate?.quota) &&
            Number.isFinite(estimate?.usage)
          ) {
            const available = Math.max(0, estimate.quota - estimate.usage);
            const reclaimableMaximum = Math.floor(
              (available + this.ownedBytes) * 0.8,
            );
            this.quotaEstimateStatus = "available";
            this.originQuotaBytes = estimate.quota;
            this.originUsageBytes = estimate.usage;
            this.originAvailableBytes = available;
            this.originReclaimableMaximumBytes = reclaimableMaximum;
          } else {
            this.quotaEstimateStatus = "invalid";
          }
        } catch (_error) {
          this.quotaEstimateStatus = "error";
        }
      }
      this.recomputeLimits();
      if (
        this.requestPersistentStorage &&
        typeof this.storage?.persist === "function"
      ) {
        Promise.resolve(this.storage.persist()).then(
          (granted) => {
            if (
              !this.closed &&
              lifecycleGeneration === this.lifecycleGeneration
            ) {
              this.persistentStorageStatus =
                granted === true ? "granted" : "denied";
            }
          },
          () => {
            if (
              !this.closed &&
              lifecycleGeneration === this.lifecycleGeneration
            ) {
              this.persistentStorageStatus = "error";
            }
          },
        );
      }
      if (!this.closed && lifecycleGeneration === this.lifecycleGeneration) {
        this.operational = true;
      }
    } catch (error) {
      this.operational = false;
      this.disabledReason = sanitizedReason(error);
      this.lastReason = this.disabledReason;
    }
  }

  charge(bytes) {
    if (this.stagingBytes + bytes > this.maximumStagingBytes) {
      return false;
    }
    this.stagingBytes += bytes;
    this.stagingBytesHighWater = Math.max(
      this.stagingBytesHighWater,
      this.stagingBytes,
    );
    return true;
  }

  uncharge(bytes) {
    this.stagingBytes = Math.max(0, this.stagingBytes - bytes);
    this.maybeClose();
  }

  chargeForeground(bytes) {
    while (
      this.stagingBytes + bytes > this.maximumStagingBytes &&
      this.pendingWrites.length > 0
    ) {
      const leastIndex = worstPendingWriteIndex(this.pendingWrites);
      const [dropped] = this.pendingWrites.splice(leastIndex, 1);
      this.pendingWriteBytes -= dropped.payload.byteLength;
      this.stagingBytes = Math.max(
        0,
        this.stagingBytes - dropped.payload.byteLength,
      );
      this.counters.writeDroppedPages++;
      this.counters.writeDroppedBytes += dropped.payload.byteLength;
      incrementClassCounter(this, dropped.workPriority, "WriteDroppedPages");
    }
    return this.charge(bytes);
  }

  beginForegroundRead() {
    clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.activeReadBatches++;
    this.foregroundReadEpoch++;
    this.counters.foregroundReadHighWater = Math.max(
      this.counters.foregroundReadHighWater,
      this.activeReadBatches,
    );
  }

  endForegroundRead() {
    this.activeReadBatches = Math.max(0, this.activeReadBatches - 1);
    if (this.activeReadBatches === 0) {
      if (this.touchFlushDeferred || this.touches.size > 0) {
        this.touchFlushDeferred = false;
        this.scheduleTouchFlush();
      }
      if (this.corruptDeleteDeferred || this.corruptDeletes.size > 0) {
        this.corruptDeleteDeferred = false;
        this.pumpCorruptDeletes();
      }
      if (this.writePumpDeferred || this.pendingWrites.length > 0) {
        this.writePumpDeferred = false;
        this.pumpWrites();
      }
    }
    this.maybeClose();
  }

  cancelTouchFlush() {
    if (defined(this.touchFlushTimer)) {
      clearTimeout(this.touchFlushTimer);
      this.touchFlushTimer = undefined;
    }
    this.touchFlushDeferred = false;
  }

  disableWrites(error) {
    this.writesDisabled = true;
    this.lastReason = sanitizedReason(error);
  }

  maintenance(promise, onTimeout) {
    this.activeMaintenanceOperations++;
    this.activeMaintenanceTimers++;
    return deadline(promise, this.maintenanceTimeoutMs, onTimeout).finally(
      () => {
        this.activeMaintenanceOperations--;
        this.activeMaintenanceTimers--;
        this.maybeClose();
      },
    );
  }

  maintenanceTransaction(run) {
    const controller = new AbortController();
    const timeoutError = new Error("Persistent cache operation timed out");
    timeoutError.name = "TimeoutError";
    let timedOut = false;
    this.activeMaintenanceOperations++;
    this.activeMaintenanceTimers++;
    this.activeMaintenanceControllers.add(controller);
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(timeoutError);
    }, this.maintenanceTimeoutMs);
    return Promise.resolve()
      .then(() => run(controller.signal))
      .then(
        (result) => result,
        (error) => {
          if (timedOut) {
            throw timeoutError;
          }
          throw error;
        },
      )
      .finally(() => {
        clearTimeout(timer);
        this.activeMaintenanceControllers.delete(controller);
        this.activeMaintenanceOperations--;
        this.activeMaintenanceTimers--;
        this.maybeClose();
      });
  }

  enqueueMutation(run) {
    clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    const lifecycleGeneration = this.lifecycleGeneration;
    this.activeMutationTransactions++;
    this.mutationTailIdle = false;
    let recordedFailure = false;
    const recordFailure = (error) => {
      if (!recordedFailure) {
        recordedFailure = true;
        this.lastReason = sanitizedReason(error);
      }
    };
    const start = () => Promise.resolve().then(() => run(lifecycleGeneration));
    const operation = this.mutationTail.then(start, start);
    this.mutationTail = operation
      .then(
        () => undefined,
        (error) => {
          recordFailure(error);
        },
      )
      .finally(() => {
        this.activeMutationTransactions--;
        this.mutationTailIdle = this.activeMutationTransactions === 0;
        this.maybeClose();
      });
    return operation;
  }

  acquireClient(token, maximumBytes, maximumStagingBytes, quotaShareFraction) {
    clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    this.clients.set(token, {
      maximumBytes,
      maximumStagingBytes,
      quotaShareFraction,
    });
    this.references = this.clients.size;
    this.recomputeLimits();
  }

  releaseClient(token) {
    this.clients.delete(token);
    this.references = this.clients.size;
    this.recomputeLimits();
    if (this.references === 0) {
      this.maybeClose();
    }
  }

  recomputeLimits() {
    const clients = [...this.clients.values()];
    this.configuredMaximumBytes =
      clients.length > 0
        ? Math.min(...clients.map((client) => client.maximumBytes))
        : this.configuredMaximumBytes;
    this.maximumStagingBytes =
      clients.length > 0
        ? Math.min(...clients.map((client) => client.maximumStagingBytes))
        : this.maximumStagingBytes;
    this.sharedQuotaShareFraction =
      clients.length > 0
        ? Math.min(...clients.map((client) => client.quotaShareFraction))
        : this.sharedQuotaShareFraction;
    if (
      Number.isFinite(this.originQuotaBytes) &&
      Number.isFinite(this.originReclaimableMaximumBytes)
    ) {
      this.originQuotaShareBytes = Math.floor(
        this.originQuotaBytes * this.sharedQuotaShareFraction,
      );
      this.quotaMaximumBytes = Math.min(
        this.originQuotaShareBytes,
        this.originReclaimableMaximumBytes,
      );
      this.quotaLimitFactor =
        this.originQuotaShareBytes <= this.originReclaimableMaximumBytes
          ? "origin-quota-share"
          : "origin-reclaimable";
    } else {
      this.originQuotaShareBytes = undefined;
      this.quotaMaximumBytes = FALLBACK_EFFECTIVE_BYTES;
      this.quotaLimitFactor = "estimate-fallback";
    }
    this.effectiveMaximumBytes = Math.max(
      1,
      Math.min(this.configuredMaximumBytes, this.quotaMaximumBytes),
    );
    this.limitingFactor =
      this.configuredMaximumBytes <= this.quotaMaximumBytes
        ? "configured"
        : this.quotaLimitFactor;
  }

  resolveScene(sceneIdentity) {
    let scene = this.sceneOwners.get(sceneIdentity);
    if (!defined(scene)) {
      const generation = this.storageGeneration;
      scene = this.maintenanceTransaction((signal) =>
        this.ready.then(() => {
          if (!this.operational || generation !== this.storageGeneration) {
            return undefined;
          }
          return this.adapter.ensureScene(sceneIdentity, signal);
        }),
      );
      this.sceneOwners.set(sceneIdentity, scene);
      scene.catch(() => this.sceneOwners.delete(sceneIdentity));
    }
    return scene;
  }

  scheduleRepair(alreadyMutating = false) {
    if (defined(this.repairPromise)) {
      return this.repairPromise;
    }
    if (this.repairAttempted) {
      return Promise.resolve();
    }
    this.repairAttempted = true;
    const run = async (lifecycleGeneration) => {
      try {
        const result = await this.maintenanceTransaction((signal) =>
          this.adapter.repairAccounting(signal),
        );
        const totalBytes =
          typeof result === "number" ? result : result?.totalBytes;
        if (!Number.isSafeInteger(totalBytes) || totalBytes < 0) {
          throw new Error("PersistentCacheAccountingContradiction");
        }
        if (this.closed || lifecycleGeneration !== this.lifecycleGeneration) {
          return;
        }
        this.ownedBytes = totalBytes;
        this.accountingValid = true;
        this.counters.repairCount++;
      } catch (error) {
        this.lastReason = sanitizedReason(error);
      }
    };
    const operation = alreadyMutating
      ? run(this.lifecycleGeneration)
      : this.enqueueMutation(run);
    this.repairPromise = operation.finally(() => {
      this.repairPromise = undefined;
      this.maybeClose();
    });
    return this.repairPromise;
  }

  enqueueWrite(pending) {
    this.pendingWrites.push(pending);
    this.pendingWriteBytes += pending.payload.byteLength;
    this.pumpWrites();
  }

  pumpWrites() {
    if (this.activeWriteTransactions > 0 || this.pendingWrites.length === 0) {
      return;
    }
    if (this.activeReadBatches > 0) {
      if (!this.writePumpDeferred) {
        this.writePumpDeferred = true;
        this.counters.deferredWriteStarts++;
      }
      return;
    }
    let nextIndex = 0;
    for (let i = 1; i < this.pendingWrites.length; i++) {
      if (
        comparePendingWrites(
          this.pendingWrites[i],
          this.pendingWrites[nextIndex],
        ) < 0
      ) {
        nextIndex = i;
      }
    }
    const [pending] = this.pendingWrites.splice(nextIndex, 1);
    if (!defined(pending)) {
      this.maybeClose();
      return;
    }
    this.pendingWriteBytes -= pending.payload.byteLength;
    this.activeWriteTransactions = 1;
    this.enqueueMutation(async (lifecycleGeneration) => {
      let deferred = false;
      try {
        if (this.activeReadBatches > 0) {
          this.pendingWrites.unshift(pending);
          this.pendingWriteBytes += pending.payload.byteLength;
          this.writePumpDeferred = true;
          this.counters.deferredWriteStarts++;
          deferred = true;
          return;
        }
        await this.ready;
        if (!this.accountingValid) {
          await this.scheduleRepair(true);
        }
        const sceneOwner = await this.resolveScene(pending.sceneIdentity);
        if (
          !defined(sceneOwner) ||
          pending.storageGeneration !== this.storageGeneration ||
          lifecycleGeneration !== this.lifecycleGeneration ||
          this.closed ||
          !this.accountingValid
        ) {
          this.counters.writeDroppedPages++;
          this.counters.writeDroppedBytes += pending.payload.byteLength;
          incrementClassCounter(
            this,
            pending.workPriority,
            "WriteDroppedPages",
          );
          return;
        }
        const record = {
          sceneOwner,
          ...pending.metadata,
          payload: pending.payload.buffer,
        };
        let retried = false;
        for (;;) {
          try {
            const result = validateMutationResult(
              await this.maintenanceTransaction((signal) =>
                this.adapter.writePage(
                  record,
                  this.effectiveMaximumBytes,
                  signal,
                ),
              ),
            );
            if (
              pending.storageGeneration !== this.storageGeneration ||
              lifecycleGeneration !== this.lifecycleGeneration ||
              this.closed
            ) {
              return;
            }
            this.ownedBytes = result.totalBytes;
            this.counters.evictionPages += result.evictedPages;
            this.counters.evictionBytes += result.evictedBytes;
            this.counters.writeCommittedPages++;
            this.counters.writeCommittedBytes += pending.payload.byteLength;
            incrementClassCounter(
              this,
              pending.workPriority,
              "WriteCommittedPages",
            );
            return;
          } catch (error) {
            if (
              (error?.name === "QuotaExceededError" ||
                error?.name === "AccountingError") &&
              !retried
            ) {
              retried = true;
              if (error?.name === "QuotaExceededError") {
                this.counters.quotaRetries++;
              }
              await this.scheduleRepair(true);
              if (error?.name === "QuotaExceededError") {
                try {
                  const eviction = await this.maintenanceTransaction((signal) =>
                    this.adapter.evictOldest?.(
                      sceneOwner,
                      pending.pageIndex,
                      signal,
                    ),
                  );
                  if (defined(eviction)) {
                    validateMutationResult(eviction);
                    if (
                      lifecycleGeneration === this.lifecycleGeneration &&
                      !this.closed
                    ) {
                      this.ownedBytes = eviction.totalBytes;
                      this.counters.evictionPages += eviction.evictedPages;
                      this.counters.evictionBytes += eviction.evictedBytes;
                    }
                  }
                } catch (_evictionError) {
                  // The single retry remains bounded and fail-open.
                }
              }
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        this.counters.writeFailedPages++;
        this.counters.writeFailedBytes += pending.payload.byteLength;
        incrementClassCounter(this, pending.workPriority, "WriteFailedPages");
        this.disableWrites(error);
      } finally {
        if (!deferred) {
          this.uncharge(pending.payload.byteLength);
        }
        this.activeWriteTransactions = 0;
        this.pumpWrites();
      }
    });
  }

  scheduleTouchFlush() {
    if (this.touches.size === 0 || defined(this.touchFlushTimer)) {
      return;
    }
    if (this.activeReadBatches > 0) {
      if (!this.touchFlushDeferred) {
        this.touchFlushDeferred = true;
        this.counters.deferredTouchFlushes++;
      }
      return;
    }
    this.touchFlushTimer = setTimeout(() => {
      this.touchFlushTimer = undefined;
      this.flushTouches();
    }, this.touchFlushDelayMs);
  }

  flushTouches() {
    if (this.touches.size === 0) {
      this.maybeClose();
      return;
    }
    if (this.activeReadBatches > 0) {
      if (!this.touchFlushDeferred) {
        this.touchFlushDeferred = true;
        this.counters.deferredTouchFlushes++;
      }
      return;
    }
    const touches = [];
    for (const [key, touch] of this.touches) {
      if (touch.storageGeneration !== this.storageGeneration) {
        this.touches.delete(key);
        continue;
      }
      if (touches.length < MAXIMUM_TOUCH_MUTATION_PAGES) {
        touches.push(touch);
        this.touches.delete(key);
      }
    }
    if (touches.length === 0 || !this.operational) {
      this.maybeClose();
      return;
    }
    this.enqueueMutation(async (lifecycleGeneration) => {
      if (this.activeReadBatches > 0) {
        for (const touch of touches) {
          this.touches.set(`${touch.sceneIdentity}:${touch.pageIndex}`, touch);
        }
        this.touchFlushDeferred = true;
        this.counters.deferredTouchFlushes++;
        return;
      }
      const keys = [];
      for (const touch of touches) {
        if (
          this.closed ||
          lifecycleGeneration !== this.lifecycleGeneration ||
          touch.storageGeneration !== this.storageGeneration
        ) {
          return;
        }
        const sceneOwner = await this.resolveScene(touch.sceneIdentity);
        if (defined(sceneOwner)) {
          keys.push([sceneOwner, touch.pageIndex]);
        }
      }
      if (keys.length > 0) {
        this.counters.touchMutationCount++;
        this.counters.touchMutationMaximumPages = Math.max(
          this.counters.touchMutationMaximumPages,
          keys.length,
        );
        await this.maintenanceTransaction((signal) =>
          this.adapter.touchPages(keys, signal),
        );
      }
    })
      .catch(function () {
        // The owner mutation tail already records one bounded sanitized error.
      })
      .finally(() => {
        if (this.touches.size > 0) {
          this.scheduleTouchFlush();
        }
      });
  }

  enqueueCorruptDelete(sceneIdentity, pageIndex, storageGeneration) {
    const key = `${sceneIdentity}:${pageIndex}`;
    this.corruptDeletes.set(key, {
      key,
      sceneIdentity,
      pageIndex,
      storageGeneration,
      settlementGeneration: this.settlementGeneration,
    });
    while (this.corruptDeletes.size > MAXIMUM_CORRUPT_DELETES) {
      this.corruptDeletes.delete(this.corruptDeletes.keys().next().value);
    }
    this.counters.corruptDeleteQueuedPages++;
    this.pumpCorruptDeletes();
  }

  pumpCorruptDeletes() {
    if (this.corruptDeleteActive || this.corruptDeletes.size === 0) {
      return;
    }
    if (this.activeReadBatches > 0) {
      this.corruptDeleteDeferred = true;
      return;
    }
    const pending = this.corruptDeletes.values().next().value;
    this.corruptDeletes.delete(pending.key);
    this.corruptDeleteActive = true;
    this.enqueueMutation(async (lifecycleGeneration) => {
      let deferred = false;
      try {
        if (this.activeReadBatches > 0) {
          this.corruptDeletes.set(pending.key, pending);
          this.corruptDeleteDeferred = true;
          deferred = true;
          return;
        }
        if (
          this.closed ||
          lifecycleGeneration !== this.lifecycleGeneration ||
          pending.storageGeneration !== this.storageGeneration ||
          pending.settlementGeneration !== this.settlementGeneration
        ) {
          return;
        }
        const sceneOwner = await this.resolveScene(pending.sceneIdentity);
        if (
          !defined(sceneOwner) ||
          this.closed ||
          lifecycleGeneration !== this.lifecycleGeneration ||
          pending.storageGeneration !== this.storageGeneration ||
          pending.settlementGeneration !== this.settlementGeneration
        ) {
          return;
        }
        const deletedBytes = await this.maintenanceTransaction((signal) =>
          this.adapter.deletePage(sceneOwner, pending.pageIndex, signal),
        );
        if (!Number.isSafeInteger(deletedBytes) || deletedBytes < 0) {
          throw new Error("PersistentCacheDeleteResultInvalid");
        }
        if (
          this.closed ||
          lifecycleGeneration !== this.lifecycleGeneration ||
          pending.storageGeneration !== this.storageGeneration ||
          pending.settlementGeneration !== this.settlementGeneration
        ) {
          return;
        }
        this.ownedBytes = Math.max(0, this.ownedBytes - deletedBytes);
        this.counters.corruptDeleteCommittedPages++;
      } catch (error) {
        this.counters.corruptDeleteFailedPages++;
        this.lastReason = sanitizedReason(error);
      } finally {
        this.corruptDeleteActive = false;
        if (!deferred) {
          this.pumpCorruptDeletes();
        }
        this.maybeClose();
      }
    }).catch(function () {
      // The bounded mutation records and sanitizes its own failure.
    });
  }

  async clear() {
    this.settlementGeneration++;
    this.cancelTouchFlush();
    this.touches.clear();
    this.corruptDeletes.clear();
    this.corruptDeleteDeferred = false;
    for (const pending of this.pendingWrites) {
      this.uncharge(pending.payload.byteLength);
      this.counters.writeDroppedPages++;
      this.counters.writeDroppedBytes += pending.payload.byteLength;
      incrementClassCounter(this, pending.workPriority, "WriteDroppedPages");
    }
    this.pendingWrites = [];
    this.pendingWriteBytes = 0;
    await this.enqueueMutation(async (lifecycleGeneration) => {
      await this.ready;
      if (this.closed || lifecycleGeneration !== this.lifecycleGeneration) {
        throw new Error("PersistentCacheMutationStale");
      }
      await this.maintenanceTransaction((signal) => this.adapter.clear(signal));
      if (this.closed || lifecycleGeneration !== this.lifecycleGeneration) {
        return;
      }
      this.storageGeneration++;
      this.sceneOwners.clear();
      this.ownedBytes = 0;
      this.accountingValid = true;
    });
  }

  maybeClose() {
    if (
      this.references !== 0 ||
      this.activeReadBatches !== 0 ||
      this.activeWriteTransactions !== 0 ||
      this.activeMutationTransactions !== 0 ||
      !this.mutationTailIdle ||
      this.activeMaintenanceOperations !== 0 ||
      this.activeMaintenanceTimers !== 0 ||
      this.pendingWrites.length !== 0 ||
      this.pendingWriteBytes !== 0 ||
      this.touches.size !== 0 ||
      this.corruptDeletes.size !== 0 ||
      this.corruptDeleteActive ||
      this.corruptDeleteDeferred ||
      defined(this.touchFlushTimer) ||
      this.touchFlushDeferred ||
      this.stagingBytes !== 0 ||
      defined(this.closeTimer)
    ) {
      return;
    }
    this.closeTimer = setTimeout(() => this.close(), this.maintenanceTimeoutMs);
  }

  close() {
    clearTimeout(this.closeTimer);
    this.closeTimer = undefined;
    if (
      this.references !== 0 ||
      this.activeReadBatches !== 0 ||
      this.activeWriteTransactions !== 0 ||
      this.activeMutationTransactions !== 0 ||
      !this.mutationTailIdle ||
      this.activeMaintenanceOperations !== 0 ||
      this.activeMaintenanceTimers !== 0 ||
      this.pendingWrites.length !== 0 ||
      this.pendingWriteBytes !== 0 ||
      this.touches.size !== 0 ||
      this.corruptDeletes.size !== 0 ||
      this.corruptDeleteActive ||
      this.corruptDeleteDeferred ||
      defined(this.touchFlushTimer) ||
      this.touchFlushDeferred ||
      this.stagingBytes !== 0
    ) {
      this.maybeClose();
      return;
    }
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.lifecycleGeneration++;
    for (const pending of this.pendingWrites) {
      this.uncharge(pending.payload.byteLength);
    }
    this.pendingWrites.length = 0;
    this.pendingWriteBytes = 0;
    this.cancelTouchFlush();
    this.touches.clear();
    this.corruptDeletes.clear();
    this.corruptDeleteDeferred = false;
    this.sceneOwners.clear();
    this.storageGeneration++;
    this.settlementGeneration++;
    this.accountingValid = false;
    this.operational = false;
    try {
      this.adapter.close();
    } catch (error) {
      this.lastReason = sanitizedReason(error);
    } finally {
      if (defined(this.shareKey) && sharedOwners.get(this.shareKey) === this) {
        sharedOwners.delete(this.shareKey);
      }
    }
  }
}

/**
 * Private persistent cache for already validated Gaussian Stream Page payloads.
 *
 * @alias _SceneGISGaussianStreamPersistentCache
 * @constructor
 * @private
 */
function _SceneGISGaussianStreamPersistentCache(options) {
  options = options ?? {};
  if (
    !defined(options.descriptorProvider) &&
    !defined(options.index?.runtimeIndexIdentity)
  ) {
    throw new DeveloperError("options.index.runtimeIndexIdentity is required");
  }
  this._descriptorProvider =
    options.descriptorProvider ?? createLegacyDescriptorProvider(options.index);
  if (
    typeof this._descriptorProvider.readPageRequest !== "function" ||
    typeof this._descriptorProvider.readPackRequest !== "function"
  ) {
    throw new DeveloperError("Persistent descriptor provider is invalid");
  }
  this._sceneIdentity =
    this._descriptorProvider.runtimeIndexIdentity ??
    options.index?.runtimeIndexIdentity;
  if (
    typeof this._sceneIdentity !== "string" ||
    this._sceneIdentity.length === 0
  ) {
    throw new DeveloperError(
      "descriptorProvider.runtimeIndexIdentity is required",
    );
  }
  this._index = options.index;
  this._maximumBytes = positiveSafeInteger(
    options.maximumBytes ?? DEFAULT_MAXIMUM_BYTES,
    "maximumBytes",
  );
  this._maximumStagingBytes = positiveSafeInteger(
    options.maximumStagingBytes ?? DEFAULT_STAGING_BYTES,
    "maximumStagingBytes",
  );
  this._quotaShareFraction = quotaShareFraction(
    options.quotaShareFraction ?? DEFAULT_QUOTA_SHARE_FRACTION,
  );
  this._enabled = options.enabled !== false;
  this._databaseName = options.databaseName ?? DATABASE_NAME;
  this._destroyed = false;
  this._generation = 0;
  this._instanceIdentity = Object.freeze({});
  this._clientToken = Object.freeze({});
  this._lookupTimeoutMs = positiveSafeInteger(
    options.lookupTimeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS,
    "lookupTimeoutMs",
  );
  this._maintenanceTimeoutMs = positiveSafeInteger(
    options.maintenanceTimeoutMs ?? DEFAULT_MAINTENANCE_TIMEOUT_MS,
    "maintenanceTimeoutMs",
  );
  if (!this._enabled) {
    this._owner = undefined;
    return;
  }
  const databaseName = this._databaseName;
  const customAdapter = options.adapter;
  const shareKey = defined(customAdapter)
    ? options.sharedKey
    : `indexeddb:${databaseName}`;
  let owner = defined(shareKey) ? sharedOwners.get(shareKey) : undefined;
  if (!defined(owner)) {
    owner = new SharedPersistentOwner({
      adapter:
        customAdapter ??
        new IndexedDbAdapter(
          options.indexedDB ?? globalThis.indexedDB,
          databaseName,
        ),
      storage: options.storage ?? globalThis.navigator?.storage,
      maximumBytes: this._maximumBytes,
      maximumStagingBytes: this._maximumStagingBytes,
      quotaShareFraction: this._quotaShareFraction,
      requestPersistentStorage: options.requestPersistentStorage !== false,
      maintenanceTimeoutMs: this._maintenanceTimeoutMs,
      touchFlushDelayMs: options._touchFlushDelayMs ?? TOUCH_FLUSH_DELAY_MS,
    });
    if (defined(shareKey)) {
      owner.shareKey = shareKey;
      sharedOwners.set(shareKey, owner);
    }
  }
  owner.acquireClient(
    this._clientToken,
    this._maximumBytes,
    this._maximumStagingBytes,
    this._quotaShareFraction,
  );
  this._owner = owner;
  this._shareKey = shareKey;
}

Object.defineProperties(_SceneGISGaussianStreamPersistentCache.prototype, {
  enabled: {
    get: function () {
      return this._enabled;
    },
  },
  maximumStagingBytes: {
    get: function () {
      return this._owner?.maximumStagingBytes ?? this._maximumStagingBytes;
    },
  },
  pageWorkStorageIdentity: {
    get: function () {
      const owner = this._owner;
      if (!defined(owner) || this._destroyed) {
        return undefined;
      }
      return Object.freeze({
        ownerLifetime: owner.lifetimeToken,
        ownerLifecycleGeneration: owner.lifecycleGeneration,
        storageGeneration: owner.storageGeneration,
        sceneIdentity: this._sceneIdentity,
        databaseName: this._databaseName,
        schema: SCHEMA,
      });
    },
  },
  statistics: {
    get: function () {
      const owner = this._owner;
      return Object.freeze({
        enabled: this._enabled,
        operational: owner?.operational === true,
        disabledReason: owner?.disabledReason,
        configuredBytes: this._maximumBytes,
        sharedConfiguredBytes:
          owner?.configuredMaximumBytes ?? this._maximumBytes,
        quotaShareFraction: this._quotaShareFraction,
        sharedQuotaShareFraction:
          owner?.sharedQuotaShareFraction ?? this._quotaShareFraction,
        effectiveBytes: owner?.effectiveMaximumBytes ?? 0,
        ownedBytes: owner?.ownedBytes ?? 0,
        quotaEstimateStatus:
          owner?.quotaEstimateStatus ??
          (this._enabled ? "not-started" : "not-requested"),
        originQuotaBytes: owner?.originQuotaBytes,
        originUsageBytes: owner?.originUsageBytes,
        originAvailableBytes: owner?.originAvailableBytes,
        originQuotaShareBytes: owner?.originQuotaShareBytes,
        originReclaimableMaximumBytes: owner?.originReclaimableMaximumBytes,
        quotaMaximumBytes: owner?.quotaMaximumBytes ?? 0,
        limitingFactor:
          owner?.limitingFactor ??
          (this._enabled ? "not-started" : "not-requested"),
        persistentStorageStatus:
          owner?.persistentStorageStatus ??
          (this._enabled ? "not-started" : "not-requested"),
        stagingBytes: owner?.stagingBytes ?? 0,
        stagingBytesHighWater: owner?.stagingBytesHighWater ?? 0,
        activeReadBatches: owner?.activeReadBatches ?? 0,
        foregroundReadEpoch: owner?.foregroundReadEpoch ?? 0,
        activeWriteTransactions: owner?.activeWriteTransactions ?? 0,
        activeMutationTransactions: owner?.activeMutationTransactions ?? 0,
        mutationTailIdle: owner?.mutationTailIdle ?? true,
        activeMaintenanceOperations: owner?.activeMaintenanceOperations ?? 0,
        activeMaintenanceTimers: owner?.activeMaintenanceTimers ?? 0,
        nativeTransactionCreates: owner?.adapter.transactionCreates ?? 0,
        nativeTransactionAbortRequests:
          owner?.adapter.transactionAbortRequests ?? 0,
        nativeTransactionAborts: owner?.adapter.transactionAborts ?? 0,
        nativeTransactionCompletes: owner?.adapter.transactionCompletes ?? 0,
        closeTimerActive: defined(owner?.closeTimer),
        pendingWritePages: owner?.pendingWrites.length ?? 0,
        pendingWriteBytes: owner?.pendingWriteBytes ?? 0,
        pendingTouches: owner?.touches.size ?? 0,
        pendingCorruptDeletes: owner?.corruptDeletes.size ?? 0,
        corruptDeleteActive: owner?.corruptDeleteActive === true,
        corruptDeleteDeferred: owner?.corruptDeleteDeferred === true,
        touchFlushTimerActive: defined(owner?.touchFlushTimer),
        touchFlushDeferred: owner?.touchFlushDeferred === true,
        writePumpDeferred: owner?.writePumpDeferred === true,
        writesDisabled: owner?.writesDisabled === true,
        lastReason: owner?.lastReason,
        ...(owner?.counters ?? createCounters()),
      });
    },
  },
});

_SceneGISGaussianStreamPersistentCache.prototype.createLookupContext =
  function (pageEntries, context) {
    const owner = this._owner;
    if (!defined(owner) || this._destroyed) {
      return immutableLookupContext(context, undefined);
    }
    const authority = Object.freeze({
      cacheInstance: this._instanceIdentity,
      cacheGeneration: this._generation,
      owner,
      ownerLifecycleGeneration: owner.lifecycleGeneration,
      storageGeneration: owner.storageGeneration,
      settlementGeneration: owner.settlementGeneration,
      sceneIdentity: this._sceneIdentity,
      pages: Object.freeze(
        pageEntries.map((entry) => {
          const page = entry.page ?? entry;
          return Object.freeze({
            metadata: pageMetadata(this._descriptorProvider, page, 0, 0),
            pageWorkKey: entry.pageWorkKey,
            recordGeneration: entry.recordGeneration,
            storageIdentity: entry.storageIdentity,
            workPriority: defined(entry.workPriority)
              ? validateGaussianStreamWorkPriority(entry.workPriority)
              : undefined,
          });
        }),
      ),
    });
    return immutableLookupContext(context, authority);
  };

_SceneGISGaussianStreamPersistentCache.prototype._isLiveWriteSuppression =
  function (authority, page) {
    const owner = this._owner;
    if (
      !defined(authority) ||
      !defined(owner) ||
      this._destroyed ||
      authority.cacheInstance !== this._instanceIdentity ||
      authority.cacheGeneration !== this._generation ||
      authority.owner !== owner ||
      authority.ownerLifecycleGeneration !== owner.lifecycleGeneration ||
      authority.storageGeneration !== owner.storageGeneration ||
      authority.settlementGeneration !== owner.settlementGeneration ||
      authority.sceneIdentity !== this._sceneIdentity
    ) {
      return false;
    }
    const expected = pageMetadata(this._descriptorProvider, page, 0, 0);
    return authority.pages.some((entry) =>
      sameMetadata(entry.metadata, expected),
    );
  };

_SceneGISGaussianStreamPersistentCache.prototype.lookupPages = async function (
  pages,
  lookupContext,
) {
  const owner = this._owner;
  const generation = this._generation;
  const storageGeneration = owner?.storageGeneration;
  const settlementGeneration = owner?.settlementGeneration;
  if (!defined(owner) || this._destroyed) {
    return lookupResults([], "cancelled-stale");
  }
  const priorityByPageIndex = new Map(
    (lookupContext?.persistentWriteAuthority?.pages ?? []).map((entry) => [
      entry.metadata.pageIndex,
      entry.workPriority,
    ]),
  );
  for (const page of pages) {
    incrementClassCounter(
      owner,
      priorityByPageIndex.get(page.index),
      "LookupPages",
    );
  }
  const ownsDeadline = !defined(lookupContext);
  const controller = ownsDeadline ? new AbortController() : undefined;
  const signal = lookupContext?.signal ?? controller.signal;
  const absoluteDeadline =
    lookupContext?.deadline ?? performance.now() + this._lookupTimeoutMs;
  let lookupTimer;
  if (ownsDeadline) {
    lookupTimer = setTimeout(
      () => {
        const error = new Error("Persistent cache lookup timed out");
        error.name = "TimeoutError";
        controller.abort(error);
      },
      Math.max(0, absoluteDeadline - performance.now()),
    );
  }
  owner.beginForegroundRead();
  let sceneOwner;
  let chargedBytes = 0;
  let retainedBytes = 0;
  try {
    await waitForSignal(owner.ready, signal);
    if (!owner.operational) {
      throw new Error(owner.disabledReason ?? "PersistentCacheUnavailable");
    }
    if (!owner.accountingValid) {
      owner.counters.lookupMissPages += pages.length;
      return lookupResults([], "definite-miss-or-corrupt");
    }
    sceneOwner = await waitForSignal(
      owner.resolveScene(this._sceneIdentity),
      signal,
    );
    if (!defined(sceneOwner)) {
      throw new Error("PersistentCacheSceneUnavailable");
    }
    if (
      this._destroyed ||
      generation !== this._generation ||
      storageGeneration !== owner.storageGeneration ||
      settlementGeneration !== owner.settlementGeneration
    ) {
      owner.counters.lookupCancelledPages += pages.length;
      return lookupResults([], "cancelled-stale");
    }
    const lookupBytes = pages.reduce((sum, page) => sum + page.storedBytes, 0);
    if (!owner.chargeForeground(lookupBytes)) {
      owner.counters.localStagingBackpressurePages += pages.length;
      for (const page of pages) {
        incrementClassCounter(
          owner,
          priorityByPageIndex.get(page.index),
          "BackpressurePages",
        );
      }
      return lookupResults([], "local-staging-backpressure");
    }
    chargedBytes = lookupBytes;
    const records = await waitForSignal(
      owner.adapter.getPages(
        sceneOwner,
        pages.map((page) => page.index),
        signal,
      ),
      signal,
    );
    if (
      this._destroyed ||
      generation !== this._generation ||
      storageGeneration !== owner.storageGeneration ||
      settlementGeneration !== owner.settlementGeneration
    ) {
      owner.counters.lookupCancelledPages += pages.length;
      return lookupResults([], "cancelled-stale");
    }
    const results = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const record = records[i];
      if (!defined(record)) {
        owner.counters.lookupMissPages++;
        incrementClassCounter(
          owner,
          priorityByPageIndex.get(page.index),
          "MissPages",
        );
        continue;
      }
      const expected = pageMetadata(this._descriptorProvider, page, 0, 0);
      const payload = new Uint8Array(record.payload);
      try {
        if (!sameMetadata(record, expected)) {
          throw new Error("PersistentCacheIdentityMismatch");
        }
        validatePagePayload(page, payload);
      } catch (_error) {
        owner.counters.lookupCorruptPages++;
        incrementClassCounter(
          owner,
          priorityByPageIndex.get(page.index),
          "CorruptPages",
        );
        owner.enqueueCorruptDelete(
          this._sceneIdentity,
          page.index,
          storageGeneration,
        );
        continue;
      }
      owner.counters.lookupHitPages++;
      incrementClassCounter(
        owner,
        priorityByPageIndex.get(page.index),
        "HitPages",
      );
      owner.counters.lookupHitBytes += payload.byteLength;
      owner.touches.set(`${this._sceneIdentity}:${page.index}`, {
        sceneIdentity: this._sceneIdentity,
        pageIndex: page.index,
        storageGeneration: owner.storageGeneration,
      });
      while (owner.touches.size > MAXIMUM_TOUCHES) {
        owner.touches.delete(owner.touches.keys().next().value);
      }
      let released = false;
      retainedBytes += payload.byteLength;
      results.push(
        Object.freeze({
          pageIndex: page.index,
          payload,
          release: function () {
            if (!released) {
              released = true;
              owner.uncharge(payload.byteLength);
            }
          },
        }),
      );
    }
    owner.scheduleTouchFlush();
    return lookupResults(
      results,
      results.length === pages.length ? "hit" : "definite-miss-or-corrupt",
    );
  } catch (error) {
    const reason = signal?.reason;
    const timedOut =
      error?.name === "TimeoutError" || reason?.name === "TimeoutError";
    const cancelled =
      !timedOut &&
      (this._destroyed ||
        generation !== this._generation ||
        storageGeneration !== owner.storageGeneration ||
        settlementGeneration !== owner.settlementGeneration);
    if (timedOut) {
      owner.counters.lookupTimeoutPages += pages.length;
      for (const page of pages) {
        incrementClassCounter(
          owner,
          priorityByPageIndex.get(page.index),
          "TimeoutPages",
        );
      }
    } else if (cancelled) {
      owner.counters.lookupCancelledPages += pages.length;
    } else {
      owner.counters.lookupErrorPages += pages.length;
    }
    owner.lastReason = sanitizedReason(error);
    return lookupResults(
      [],
      cancelled ? "cancelled-stale" : "timeout-or-transient-read-error",
    );
  } finally {
    clearTimeout(lookupTimer);
    owner.uncharge(chargedBytes - retainedBytes);
    owner.endForegroundRead();
  }
};

_SceneGISGaussianStreamPersistentCache.prototype.enqueueWriteWithOutcome =
  function (page, payload, options = {}) {
    const owner = this._owner;
    if (!defined(owner) || this._destroyed || owner.writesDisabled) {
      return "rejected";
    }
    if (
      options.persistentWriteDisposition === "suppress" &&
      this._isLiveWriteSuppression(options.persistentWriteAuthority, page)
    ) {
      const canonicalPage = this._descriptorProvider.readPageRequest(
        page.index,
      );
      if (
        defined(canonicalPage) &&
        sameMetadata(
          pageMetadata(this._descriptorProvider, page, 0, 0),
          pageMetadata(this._descriptorProvider, canonicalPage, 0, 0),
        )
      ) {
        owner.counters.writeSuppressedPages++;
        owner.counters.writeSuppressedBytes += page.storedBytes;
        incrementClassCounter(
          owner,
          options.workPriority,
          "WriteSuppressedPages",
        );
        return "suppressed";
      }
    }
    const source = ArrayBuffer.isView(payload)
      ? new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength)
      : new Uint8Array(payload);
    const workPriority = normalizeGaussianStreamWorkPriority(
      options.workPriority ?? options.priorityClass ?? "history",
      owner.pendingWriteSequence,
    );
    if (!owner.charge(source.byteLength)) {
      const leastIndex = worstPendingWriteIndex(owner.pendingWrites);
      if (
        leastIndex === -1 ||
        compareGaussianStreamWorkPriority(
          owner.pendingWrites[leastIndex].workPriority,
          workPriority,
        ) <= 0
      ) {
        owner.counters.writeDroppedPages++;
        owner.counters.writeDroppedBytes += source.byteLength;
        incrementClassCounter(owner, workPriority, "WriteDroppedPages");
        return "rejected";
      }
      const [dropped] = owner.pendingWrites.splice(leastIndex, 1);
      owner.pendingWriteBytes -= dropped.payload.byteLength;
      owner.uncharge(dropped.payload.byteLength);
      owner.counters.writeDroppedPages++;
      owner.counters.writeDroppedBytes += dropped.payload.byteLength;
      incrementClassCounter(owner, dropped.workPriority, "WriteDroppedPages");
      if (!owner.charge(source.byteLength)) {
        owner.counters.writeDroppedPages++;
        owner.counters.writeDroppedBytes += source.byteLength;
        incrementClassCounter(owner, workPriority, "WriteDroppedPages");
        return "rejected";
      }
    }
    let bytes;
    try {
      bytes = source.slice();
    } catch (error) {
      owner.uncharge(source.byteLength);
      owner.counters.writeDroppedPages++;
      owner.counters.writeDroppedBytes += source.byteLength;
      incrementClassCounter(owner, workPriority, "WriteDroppedPages");
      owner.lastReason = sanitizedReason(error);
      return "rejected";
    }
    const metadata = pageMetadata(this._descriptorProvider, page, 0, 0);
    const pending = {
      pageIndex: page.index,
      payload: bytes,
      metadata,
      sceneIdentity: this._sceneIdentity,
      clientToken: this._clientToken,
      storageGeneration: owner.storageGeneration,
      priorityClass: options.priorityClass ?? "history",
      workPriority,
      pendingSequence: owner.pendingWriteSequence++,
    };
    owner.counters.writeQueuedPages++;
    owner.counters.writeQueuedBytes += bytes.byteLength;
    incrementClassCounter(owner, workPriority, "WriteQueuedPages");
    owner.enqueueWrite(pending);
    return "queued";
  };

_SceneGISGaussianStreamPersistentCache.prototype.enqueueWrite = function (
  page,
  payload,
  options = {},
) {
  return this.enqueueWriteWithOutcome(page, payload, options) === "queued";
};

_SceneGISGaussianStreamPersistentCache.prototype.clear = async function () {
  const owner = this._owner;
  if (!defined(owner)) {
    return;
  }
  await owner.clear();
};

_SceneGISGaussianStreamPersistentCache.prototype.destroy = function () {
  if (this._destroyed) {
    return undefined;
  }
  this._destroyed = true;
  this._generation++;
  const owner = this._owner;
  this._owner = undefined;
  if (defined(owner)) {
    owner.releaseClient(this._clientToken);
  }
  return undefined;
};

_SceneGISGaussianStreamPersistentCache.Schema = SCHEMA;
_SceneGISGaussianStreamPersistentCache.DatabaseName = DATABASE_NAME;

export default _SceneGISGaussianStreamPersistentCache;

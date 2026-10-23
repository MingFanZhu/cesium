import _SceneGISGaussianStreamPersistentCache from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianStreamPersistentCache.js";
import _SceneGISGaussianSegmentedStreamDescriptorProvider from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianSegmentedStreamDescriptorProvider.js";
import {
  GaussianStreamScheduleClass,
  GaussianStreamWorkClass,
} from "../../../../Source/SceneGIS/Scene/_private/Gaussian/_SceneGISGaussianStreamWorkPriority.js";
import { PAGE_SEMANTIC } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsConstants.js";
import { encodePack } from "../../../../Source/SceneGIS/Core/_private/Gaussian/_SceneGISGaussianFormatsGsp.js";

class MemoryAdapter {
  constructor() {
    this.scenes = new Map();
    this.pages = new Map();
    this.totalBytes = 0;
    this.highWaterEpoch = 0;
    this.openCalls = 0;
    this.closeCalls = 0;
    this.clearCalls = 0;
    this.writeFailures = [];
    this.ensureSceneFailures = [];
    this.touchFailures = [];
    this.clearFailures = [];
    this.holdClears = false;
    this.clearResolvers = [];
    this.holdWrites = false;
    this.writeResolvers = [];
    this.holdTouches = false;
    this.touchResolvers = [];
    this.repairCalls = 0;
    this.holdReads = false;
    this.readResolvers = [];
    this.holdDeletes = false;
    this.deleteResolvers = [];
    this.touchBatches = [];
    this.activeTransactions = 0;
    this.transactionStarts = 0;
    this.transactionSettlements = 0;
    this.transactionAborts = 0;
    this.events = [];
  }

  async open() {
    this.openCalls++;
  }

  async ensureScene(runtimeIndexIdentity) {
    this.beginTransaction();
    try {
      const failure = this.ensureSceneFailures.shift();
      if (failure) {
        throw failure;
      }
      if (!this.scenes.has(runtimeIndexIdentity)) {
        this.scenes.set(runtimeIndexIdentity, {
          runtimeIndexIdentity,
          sceneOwner: this.scenes.size + 1,
          schema: _SceneGISGaussianStreamPersistentCache.Schema,
        });
      }
      return this.scenes.get(runtimeIndexIdentity).sceneOwner;
    } finally {
      this.endTransaction();
    }
  }

  beginTransaction() {
    this.activeTransactions++;
    this.transactionStarts++;
  }

  endTransaction() {
    this.activeTransactions--;
    this.transactionSettlements++;
  }

  waitHeld(resolvers, signal) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        if (settled) {
          return;
        }
        settled = true;
        this.transactionAborts++;
        reject(
          signal.reason ??
            Object.assign(new Error("aborted"), { name: "AbortError" }),
        );
      };
      signal?.addEventListener("abort", abort, { once: true });
      resolvers.push(finish);
    });
  }

  async getAccounting() {
    return {
      key: "accounting",
      schema: _SceneGISGaussianStreamPersistentCache.Schema,
      totalBytes: this.totalBytes,
      highWaterEpoch: this.highWaterEpoch,
    };
  }

  key(sceneOwner, pageIndex) {
    return `${sceneOwner}:${pageIndex}`;
  }

  async getPages(sceneOwner, pageIndices, signal) {
    this.events.push("read-start");
    if (this.holdReads) {
      await new Promise((resolve, reject) => {
        const abort = () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        signal?.addEventListener("abort", abort, { once: true });
        this.readResolvers.push(() => {
          signal?.removeEventListener("abort", abort);
          resolve();
        });
      });
    }
    this.events.push("read-end");
    return pageIndices.map((pageIndex) => {
      const record = this.pages.get(this.key(sceneOwner, pageIndex));
      if (!record) {
        return undefined;
      }
      return { ...record, payload: record.payload.slice(0) };
    });
  }

  async deletePage(sceneOwner, pageIndex, signal) {
    this.beginTransaction();
    this.events.push(`delete-start-${pageIndex}`);
    try {
      if (this.holdDeletes) {
        await this.waitHeld(this.deleteResolvers, signal);
      }
      const key = this.key(sceneOwner, pageIndex);
      const record = this.pages.get(key);
      if (!record) {
        return 0;
      }
      this.pages.delete(key);
      this.totalBytes -= record.storedBytes;
      return record.storedBytes;
    } finally {
      this.events.push(`delete-end-${pageIndex}`);
      this.endTransaction();
    }
  }

  async writePage(record, maximumBytes, signal) {
    this.beginTransaction();
    this.events.push(`write-start-${record.pageIndex}`);
    try {
      if (this.holdWrites) {
        await this.waitHeld(this.writeResolvers, signal);
      }
      const failure = this.writeFailures.shift();
      if (failure) {
        throw failure;
      }
      const key = this.key(record.sceneOwner, record.pageIndex);
      const prior = this.pages.get(key);
      let totalBytes =
        this.totalBytes - (prior?.storedBytes ?? 0) + record.storedBytes;
      let evictedPages = 0;
      let evictedBytes = 0;
      const candidates = [...this.pages.entries()]
        .filter(([candidateKey]) => candidateKey !== key)
        .sort(
          (left, right) => left[1].lastAccessEpoch - right[1].lastAccessEpoch,
        );
      while (totalBytes > maximumBytes && candidates.length > 0) {
        const [candidateKey, candidate] = candidates.shift();
        this.pages.delete(candidateKey);
        totalBytes -= candidate.storedBytes;
        evictedPages++;
        evictedBytes += candidate.storedBytes;
      }
      if (totalBytes > maximumBytes) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        throw error;
      }
      const stored = {
        ...record,
        payload: record.payload.slice(0),
        createdEpoch:
          prior?.createdEpoch ?? Math.max(this.highWaterEpoch + 1, Date.now()),
        lastAccessEpoch: Math.max(this.highWaterEpoch + 1, Date.now()),
      };
      this.highWaterEpoch = stored.lastAccessEpoch;
      this.pages.set(key, stored);
      this.totalBytes = totalBytes;
      return { totalBytes, evictedPages, evictedBytes };
    } finally {
      this.events.push(`write-end-${record.pageIndex}`);
      this.endTransaction();
    }
  }

  async evictOldest(sceneOwner, pageIndex) {
    const candidate = [...this.pages.entries()]
      .filter(
        ([, record]) =>
          record.sceneOwner !== sceneOwner || record.pageIndex !== pageIndex,
      )
      .sort(
        (left, right) => left[1].lastAccessEpoch - right[1].lastAccessEpoch,
      )[0];
    if (!candidate) {
      return { totalBytes: this.totalBytes, evictedPages: 0, evictedBytes: 0 };
    }
    this.pages.delete(candidate[0]);
    this.totalBytes -= candidate[1].storedBytes;
    return {
      totalBytes: this.totalBytes,
      evictedPages: 1,
      evictedBytes: candidate[1].storedBytes,
    };
  }

  async touchPages(keys, signal) {
    this.beginTransaction();
    this.events.push("touch-start");
    this.touchBatches.push(keys.slice());
    try {
      if (this.holdTouches) {
        await this.waitHeld(this.touchResolvers, signal);
      }
      const failure = this.touchFailures.shift();
      if (failure) {
        throw failure;
      }
      const epoch = Math.max(this.highWaterEpoch + 1, Date.now());
      this.highWaterEpoch = epoch;
      for (const [sceneOwner, pageIndex] of keys) {
        const record = this.pages.get(this.key(sceneOwner, pageIndex));
        if (record) {
          record.lastAccessEpoch = epoch;
        }
      }
    } finally {
      this.events.push("touch-end");
      this.endTransaction();
    }
  }

  async repairAccounting() {
    this.repairCalls++;
    this.totalBytes = [...this.pages.values()].reduce(
      (sum, record) => sum + record.storedBytes,
      0,
    );
    this.highWaterEpoch = [...this.pages.values()].reduce(
      (maximum, record) =>
        Math.max(
          maximum,
          record.createdEpoch ?? 0,
          record.lastAccessEpoch ?? 0,
        ),
      0,
    );
    return {
      totalBytes: this.totalBytes,
      highWaterEpoch: this.highWaterEpoch,
    };
  }

  async clear(signal) {
    this.beginTransaction();
    try {
      this.clearCalls++;
      if (this.holdClears) {
        await this.waitHeld(this.clearResolvers, signal);
      }
      const failure = this.clearFailures.shift();
      if (failure) {
        throw failure;
      }
      this.scenes.clear();
      this.pages.clear();
      this.totalBytes = 0;
      this.highWaterEpoch = 0;
    } finally {
      this.endTransaction();
    }
  }

  close() {
    this.closeCalls++;
  }
}

function deleteDatabase(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`delete blocked: ${name}`));
  });
}

function createVector(pageCount = 3, runtimeIndexIdentity = "scene-a") {
  const payloads = Array.from({ length: pageCount }, (_, pageIndex) =>
    Uint8Array.from(
      { length: 32 },
      (_value, byteIndex) => (pageIndex * 43 + byteIndex * 7) & 0xff,
    ),
  );
  const encoded = encodePack({
    packId: 0,
    kind: 1,
    layoutId: 1,
    splatCount: pageCount,
    pages: payloads,
  });
  const pages = encoded.pages.map((page, pageIndex) => ({
    index: pageIndex,
    payloadIndex: pageIndex,
    packIndex: 0,
    layoutIndex: 1,
    semantic: PAGE_SEMANTIC.CORE,
    offset: Number(page.offset),
    storedBytes: Number(page.storedBytes),
    rawBytes: Number(page.rawBytes),
    splatFirst: pageIndex,
    splatCount: 1,
    checksum: page.checksum,
  }));
  return {
    index: {
      runtimeIndexIdentity,
      pages,
      packs: [
        {
          index: 0,
          fileBytes: encoded.bytes.byteLength,
          checksum: encoded.checksum,
        },
      ],
    },
    payloads,
  };
}

function createCache(vector, adapter, options = {}) {
  return new _SceneGISGaussianStreamPersistentCache({
    index: vector.index,
    adapter,
    maximumBytes: options.maximumBytes ?? 1024,
    maximumStagingBytes: options.maximumStagingBytes ?? 1024,
    storage: options.storage ?? {
      estimate: () => Promise.resolve({ quota: 1024 * 1024, usage: 0 }),
      persist: () => Promise.resolve(true),
    },
    requestPersistentStorage: options.requestPersistentStorage,
    descriptorProvider: options.descriptorProvider,
    quotaShareFraction: options.quotaShareFraction,
    sharedKey: options.sharedKey,
    lookupTimeoutMs: options.lookupTimeoutMs,
    maintenanceTimeoutMs: options.maintenanceTimeoutMs,
    _touchFlushDelayMs: options.touchFlushDelayMs ?? 0,
  });
}

function createNativeCache(vector, databaseName, options = {}) {
  return new _SceneGISGaussianStreamPersistentCache({
    index: vector.index,
    indexedDB,
    databaseName,
    maximumBytes: options.maximumBytes ?? 1024 * 1024,
    maximumStagingBytes: options.maximumStagingBytes ?? 1024 * 1024,
    storage: {
      estimate: () => Promise.resolve({ quota: 1024 * 1024 * 1024, usage: 0 }),
    },
    requestPersistentStorage: false,
    quotaShareFraction: options.quotaShareFraction,
    lookupTimeoutMs: options.lookupTimeoutMs ?? 250,
    maintenanceTimeoutMs: options.maintenanceTimeoutMs ?? 2000,
    _touchFlushDelayMs: options.touchFlushDelayMs ?? 0,
  });
}

async function settleWrites(cache, expected = 1) {
  for (let attempt = 0; attempt < 500; attempt++) {
    const statistics = cache.statistics;
    if (
      statistics.writeCommittedPages + statistics.writeFailedPages >=
      expected
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(JSON.stringify(cache.statistics));
}

async function settleOwner(cache) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const statistics = cache.statistics;
    if (
      statistics.activeMutationTransactions === 0 &&
      statistics.mutationTailIdle &&
      statistics.activeWriteTransactions === 0 &&
      statistics.activeMaintenanceOperations === 0 &&
      statistics.activeMaintenanceTimers === 0 &&
      statistics.activeReadBatches === 0 &&
      statistics.pendingWritePages === 0 &&
      statistics.pendingTouches === 0 &&
      statistics.pendingCorruptDeletes === 0 &&
      !statistics.corruptDeleteActive &&
      !statistics.corruptDeleteDeferred &&
      !statistics.touchFlushTimerActive &&
      !statistics.touchFlushDeferred &&
      !statistics.writePumpDeferred &&
      statistics.stagingBytes === 0
    ) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(JSON.stringify(cache.statistics));
}

async function waitFor(predicate, timeout = 1000) {
  const expires = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() >= expires) {
      throw new Error("Timed out waiting for persistent cache authority");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function holdNativeMutation(transaction, signal) {
  let abort;
  return new Promise((_resolve, reject) => {
    const store = transaction.objectStore("metadata");
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    const keepAlive = () => {
      if (signal.aborted) {
        return;
      }
      const request = store.get("accounting");
      request.onsuccess = keepAlive;
      request.onerror = () => reject(request.error);
    };
    keepAlive();
  }).finally(() => signal.removeEventListener("abort", abort));
}

function completeNativeMutationAfterDeadline(transaction, signal) {
  return new Promise((resolve, reject) => {
    const store = transaction.objectStore("metadata");
    let cancellationRequested = signal.aborted;
    const cancelled = () => {
      cancellationRequested = true;
    };
    signal.addEventListener("abort", cancelled, { once: true });
    const keepAlive = () => {
      const request = store.get("accounting");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (cancellationRequested) {
          signal.removeEventListener("abort", cancelled);
          resolve();
          return;
        }
        keepAlive();
      };
    };
    keepAlive();
  });
}

function forceCompletedAbortDisposition() {
  throw new DOMException("transaction already completed", "InvalidStateError");
}

describe("SceneGIS/Scene/SceneGISGaussianStreamPersistentCache", function () {
  it("segmented persistence: recreates a descriptor-only cache with exact bytes and its own storage identity", async function () {
    const vector = createVector(1);
    const sourcePage = vector.index.pages[0];
    const sourcePack = vector.index.packs[0];
    const runtimeIndex = Object.freeze({
      artifactIdentityHex: "segmented-persistent-artifact",
      mciChecksum: 1234,
      byteLength: 1024,
      pageCount: 1,
      packCount: 1,
      readPage(pageId, scratch) {
        scratch.set([
          7,
          0,
          1,
          1,
          PAGE_SEMANTIC.CORE,
          1,
          0,
          sourcePage.offset,
          sourcePage.storedBytes,
          sourcePage.rawBytes,
          sourcePage.checksum,
        ]);
        return scratch;
      },
      readPack(packId, scratch) {
        scratch.set([1, 1, 0, 1, 1, sourcePack.fileBytes, sourcePack.checksum]);
        return scratch;
      },
    });
    const provider = new _SceneGISGaussianSegmentedStreamDescriptorProvider({
      runtimeIndex,
      validateRuntimeIndex(value) {
        if (value !== runtimeIndex) {
          throw new Error("foreign compact index");
        }
        return value;
      },
      packFileName: () => "packs/scene.core.000.gsp",
    });
    const adapter = new MemoryAdapter();
    const databaseName = "CesiumGaussianSegmentedStreamCache";
    const options = {
      descriptorProvider: provider,
      adapter,
      databaseName,
      maximumBytes: 1024,
      maximumStagingBytes: 1024,
      requestPersistentStorage: false,
      maintenanceTimeoutMs: 10,
      storage: {
        estimate: () => Promise.resolve({ quota: 1024 * 1024, usage: 0 }),
      },
      _touchFlushDelayMs: 0,
    };
    const page = provider.readPageRequest(0);
    const first = new _SceneGISGaussianStreamPersistentCache(options);
    const firstIdentity = first.pageWorkStorageIdentity;
    expect(firstIdentity.databaseName).toBe(databaseName);
    expect(firstIdentity.sceneIdentity).toBe(provider.runtimeIndexIdentity);
    expect(first.enqueueWrite(page, vector.payloads[0])).toBe(true);
    await settleWrites(first);
    await settleOwner(first);
    const record = adapter.pages.values().next().value;
    expect(record.artifactIdentity).toBe(provider.artifactIdentity);
    expect(record.packFileName).toBe(provider.readPackRequest(0).fileName);
    expect(record.checksum).toBe(page.checksum);
    expect(record.assetId).toBe(7);
    first.destroy();
    expect(first.pageWorkStorageIdentity).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(adapter.closeCalls).toBe(1);

    const second = new _SceneGISGaussianStreamPersistentCache(options);
    expect(second.pageWorkStorageIdentity.databaseName).toBe(databaseName);
    expect(second.pageWorkStorageIdentity.ownerLifetime).not.toBe(
      firstIdentity.ownerLifetime,
    );
    const hits = await second.lookupPages([provider.readPageRequest(0)]);
    expect(hits.length).toBe(1);
    expect(hits[0].payload).toEqual(vector.payloads[0]);
    expect(second.statistics.lookupHitPages).toBe(1);
    hits[0].release();
    await settleOwner(second);
    expect(second.statistics.stagingBytes).toBe(0);
    second.destroy();

    const legacy = createCache(vector, new MemoryAdapter());
    expect(legacy.pageWorkStorageIdentity.databaseName).toBe(
      _SceneGISGaussianStreamPersistentCache.DatabaseName,
    );
    legacy.destroy();
  });

  it("binds A4 metadata and hits to exact artifact and Pack file identity", async function () {
    const vector = createVector(1, "same-runtime-index");
    vector.index.pages[0] = {
      ...vector.index.pages[0],
      assetId: 7,
      assetLocalStart: 3,
      kind: 1,
      layoutId: 1,
      packId: 0,
      artifactIdentity: "artifact-a",
    };
    const provider = (artifactIdentity) => ({
      artifactIdentity,
      runtimeIndexIdentity: vector.index.runtimeIndexIdentity,
      readPageRequest(pageIndex) {
        return {
          ...vector.index.pages[pageIndex],
          artifactIdentity,
        };
      },
      readPackRequest() {
        return {
          ...vector.index.packs[0],
          fileName: "packs/scene.core.000.gsp",
          artifactIdentity,
        };
      },
    });
    const adapter = new MemoryAdapter();
    const first = createCache(vector, adapter, {
      descriptorProvider: provider("artifact-a"),
      sharedKey: "a4-provider",
    });
    expect(first.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      true,
    );
    await settleWrites(first);
    const record = adapter.pages.values().next().value;
    expect(record.artifactIdentity).toBe("artifact-a");
    expect(record.packFileName).toBe("packs/scene.core.000.gsp");
    expect(record.assetId).toBe(7);
    expect(record.assetLocalStart).toBe(3);
    expect(record.runtimeIndexIdentity).toBe("same-runtime-index");
    const hit = await first.lookupPages([vector.index.pages[0]]);
    expect(hit.length).toBe(1);
    hit[0].release();
    record.rawBytes++;
    expect(await first.lookupPages([vector.index.pages[0]])).toEqual([]);
    await settleOwner(first);
    expect(adapter.pages.size).toBe(0);
    expect(first.statistics.lookupCorruptPages).toBe(1);
    expect(first.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      true,
    );
    await settleWrites(first, 2);
    first.destroy();

    const second = createCache(vector, adapter, {
      descriptorProvider: provider("artifact-b"),
      sharedKey: "a4-provider",
    });
    expect(
      await second.lookupPages([provider("artifact-b").readPageRequest(0)]),
    ).toEqual([]);
    await settleOwner(second);
    expect(adapter.pages.size).toBe(0);
    second.destroy();
  });

  it("stores scene identity once and returns an immutable validated hit", async function () {
    const vector = createVector();
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter);

    expect(cache.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      true,
    );
    await settleWrites(cache);
    const results = await cache.lookupPages([vector.index.pages[0]]);

    expect(results.length).toBe(1);
    expect(results[0].payload).toEqual(vector.payloads[0]);
    expect(Object.isFrozen(results[0])).toBe(true);
    expect(Object.isFrozen(cache.statistics)).toBe(true);
    expect(adapter.scenes.size).toBe(1);
    expect(
      adapter.pages.values().next().value.runtimeIndexIdentity,
    ).toBeUndefined();
    results[0].release();
    expect(cache.statistics.stagingBytes).toBe(0);
    cache.destroy();
  });

  it("suppresses timeout-fallback rewrites before staging or cloning canonical pages", function () {
    const vector = createVector(1, "write-suppression");
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter);
    const lookupContext = cache.createLookupContext(
      vector.index.pages,
      Object.freeze({ generation: 1 }),
    );
    expect(
      cache.enqueueWrite(vector.index.pages[0], vector.payloads[0], {
        persistentWriteDisposition: "suppress",
        persistentWriteAuthority: lookupContext.persistentWriteAuthority,
      }),
    ).toBe(false);
    expect(cache.statistics.writeSuppressedPages).toBe(1);
    expect(cache.statistics.writeSuppressedBytes).toBe(
      vector.index.pages[0].storedBytes,
    );
    expect(cache.statistics.writeQueuedPages).toBe(0);
    expect(cache.statistics.pendingWritePages).toBe(0);
    expect(cache.statistics.stagingBytes).toBe(0);
    expect(adapter.events).toEqual([]);
    cache.destroy();
  });

  it("revokes timeout write suppression on clear, versionchange, destroy, and cross-scene use", async function () {
    const firstVector = createVector(1, "suppression-scene-a");
    const secondVector = createVector(1, "suppression-scene-b");
    const adapter = new MemoryAdapter();
    const first = createCache(firstVector, adapter, {
      sharedKey: "suppression",
    });
    const second = createCache(secondVector, adapter, {
      sharedKey: "suppression",
    });
    const firstContext = first.createLookupContext(
      firstVector.index.pages,
      Object.freeze({ generation: 1 }),
    );
    const authority = firstContext.persistentWriteAuthority;

    expect(
      second.enqueueWrite(
        secondVector.index.pages[0],
        secondVector.payloads[0],
        {
          persistentWriteDisposition: "suppress",
          persistentWriteAuthority: authority,
        },
      ),
    ).toBe(true);
    await settleWrites(second);
    await first.clear();
    expect(
      first.enqueueWrite(firstVector.index.pages[0], firstVector.payloads[0], {
        persistentWriteDisposition: "suppress",
        persistentWriteAuthority: authority,
      }),
    ).toBe(true);
    await settleWrites(first, 2);

    const afterClear = first.createLookupContext(
      firstVector.index.pages,
      Object.freeze({ generation: 2 }),
    ).persistentWriteAuthority;
    adapter.onVersionChange();
    expect(
      first.enqueueWrite(firstVector.index.pages[0], firstVector.payloads[0], {
        persistentWriteDisposition: "suppress",
        persistentWriteAuthority: afterClear,
      }),
    ).toBe(true);
    await settleOwner(first);
    expect(first.statistics.stagingBytes).toBe(0);
    expect(first.statistics.activeMutationTransactions).toBe(0);
    expect(first.statistics.activeMaintenanceTimers).toBe(0);
    first.destroy();
    second.destroy();
  });

  it("treats every canonical Page or Pack identity mismatch as corrupt", async function () {
    const fields = [
      "payloadIndex",
      "packIndex",
      "layout",
      "semantic",
      "byteOffset",
      "storedBytes",
      "splatCount",
      "checksum",
      "packFileBytes",
      "packChecksum",
    ];
    for (const field of fields) {
      const vector = createVector(1, `scene-${field}`);
      const adapter = new MemoryAdapter();
      const cache = createCache(vector, adapter);
      cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
      await settleWrites(cache);
      const record = adapter.pages.values().next().value;
      record[field]++;

      expect(await cache.lookupPages([vector.index.pages[0]])).toEqual([]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(adapter.pages.size).toBe(0);
      expect(cache.statistics.lookupCorruptPages).toBe(1);
      cache.destroy();
    }
  });

  it("isolates runtime identities with the same Page index", async function () {
    const first = createVector(1, "scene-first");
    const second = createVector(1, "scene-second");
    const adapter = new MemoryAdapter();
    const firstCache = createCache(first, adapter);
    firstCache.enqueueWrite(first.index.pages[0], first.payloads[0]);
    await settleWrites(firstCache);
    firstCache.destroy();

    const secondCache = createCache(second, adapter);
    expect(await secondCache.lookupPages([second.index.pages[0]])).toEqual([]);
    expect(secondCache.statistics.lookupMissPages).toBe(1);
    secondCache.destroy();
  });

  it("deletes wrong-length and checksum-corrupt payloads", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter);
    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(cache);
    const record = adapter.pages.values().next().value;
    record.payload = record.payload.slice(0, 31);

    expect(await cache.lookupPages([vector.index.pages[0]])).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(adapter.pages.size).toBe(0);
    cache.destroy();
  });

  it("enforces the exact staging ceiling and drops one byte below", async function () {
    const vector = createVector(1);
    const exactAdapter = new MemoryAdapter();
    const exact = createCache(vector, exactAdapter, {
      maximumStagingBytes: 32,
    });
    const exactSlice = spyOn(Uint8Array.prototype, "slice").and.callThrough();
    expect(exact.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      true,
    );
    expect(exactSlice).toHaveBeenCalledTimes(1);
    await settleWrites(exact);
    exact.destroy();

    const belowAdapter = new MemoryAdapter();
    const below = createCache(vector, belowAdapter, {
      maximumStagingBytes: 31,
    });
    exactSlice.calls.reset();
    expect(below.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      false,
    );
    expect(exactSlice).not.toHaveBeenCalled();
    expect(below.statistics.writeDroppedPages).toBe(1);
    expect(belowAdapter.pages.size).toBe(0);
    below.destroy();
  });

  it("evicts by byte LRU at the exact persistent ceiling", async function () {
    const vector = createVector(3);
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter, { maximumBytes: 64 });
    for (let i = 0; i < 3; i++) {
      cache.enqueueWrite(vector.index.pages[i], vector.payloads[i]);
    }
    await settleWrites(cache, 3);

    expect(adapter.totalBytes).toBe(64);
    expect(adapter.pages.size).toBe(2);
    expect(cache.statistics.evictionPages).toBe(1);
    expect(cache.statistics.ownedBytes).toBe(64);
    cache.destroy();
  });

  it("clamps capacity to quota and available bytes after crediting owned records", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    adapter.pages.set("prior:0", { storedBytes: 32 });
    adapter.totalBytes = 32;
    const persist = jasmine.createSpy("persist").and.resolveTo(false);
    const cache = createCache(vector, adapter, {
      maximumBytes: 1024,
      storage: {
        estimate: () => Promise.resolve({ quota: 800, usage: 632 }),
        persist,
      },
    });
    await cache.lookupPages([]);
    await waitFor(() => cache.statistics.persistentStorageStatus === "denied");

    expect(cache.statistics).toEqual(
      jasmine.objectContaining({
        sharedConfiguredBytes: 1024,
        quotaShareFraction: 0.25,
        sharedQuotaShareFraction: 0.25,
        effectiveBytes: 160,
        quotaEstimateStatus: "available",
        originQuotaBytes: 800,
        originUsageBytes: 632,
        originAvailableBytes: 168,
        originQuotaShareBytes: 200,
        originReclaimableMaximumBytes: 160,
        quotaMaximumBytes: 160,
        limitingFactor: "origin-reclaimable",
        persistentStorageStatus: "denied",
      }),
    );
    expect(persist).toHaveBeenCalledTimes(1);
    cache.destroy();
  });

  it("reports quota-share/configured limits and persistence settlements without extra estimates", async function () {
    const vector = createVector(1);

    const shareEstimate = jasmine
      .createSpy("shareEstimate")
      .and.resolveTo({ quota: 800, usage: 0 });
    const granted = createCache(vector, new MemoryAdapter(), {
      maximumBytes: 1024,
      storage: {
        estimate: shareEstimate,
        persist: () => Promise.resolve(true),
      },
    });
    await granted.lookupPages([]);
    await waitFor(
      () => granted.statistics.persistentStorageStatus === "granted",
    );
    expect(granted.statistics).toEqual(
      jasmine.objectContaining({
        effectiveBytes: 200,
        quotaShareFraction: 0.25,
        sharedQuotaShareFraction: 0.25,
        quotaEstimateStatus: "available",
        originQuotaBytes: 800,
        originUsageBytes: 0,
        originAvailableBytes: 800,
        originQuotaShareBytes: 200,
        originReclaimableMaximumBytes: 640,
        quotaMaximumBytes: 200,
        limitingFactor: "origin-quota-share",
        persistentStorageStatus: "granted",
      }),
    );
    expect(shareEstimate).toHaveBeenCalledTimes(1);
    granted.destroy();

    const persist = jasmine.createSpy("persist");
    const configured = createCache(vector, new MemoryAdapter(), {
      maximumBytes: 64,
      requestPersistentStorage: false,
      storage: {
        estimate: () => Promise.resolve({ quota: 800, usage: 0 }),
        persist,
      },
    });
    await configured.lookupPages([]);
    expect(configured.statistics).toEqual(
      jasmine.objectContaining({
        sharedConfiguredBytes: 64,
        effectiveBytes: 64,
        quotaMaximumBytes: 200,
        limitingFactor: "configured",
        persistentStorageStatus: "not-requested",
      }),
    );
    expect(persist).not.toHaveBeenCalled();
    configured.destroy();

    const unsupported = createCache(vector, new MemoryAdapter(), {
      maximumBytes: 1024,
      storage: {
        estimate: () => Promise.resolve({ quota: 800, usage: 0 }),
      },
    });
    await unsupported.lookupPages([]);
    expect(unsupported.statistics.persistentStorageStatus).toBe("unsupported");
    unsupported.destroy();
  });

  it("applies a custom quota share without changing the reclaimable or configured clamps", async function () {
    const vector = createVector(1);
    const quotaLimited = createCache(vector, new MemoryAdapter(), {
      maximumBytes: 1024,
      quotaShareFraction: 0.5,
      storage: {
        estimate: () => Promise.resolve({ quota: 800, usage: 0 }),
      },
    });
    await quotaLimited.lookupPages([]);
    expect(quotaLimited.statistics).toEqual(
      jasmine.objectContaining({
        quotaShareFraction: 0.5,
        sharedQuotaShareFraction: 0.5,
        originQuotaShareBytes: 400,
        originReclaimableMaximumBytes: 640,
        quotaMaximumBytes: 400,
        effectiveBytes: 400,
        limitingFactor: "origin-quota-share",
      }),
    );
    quotaLimited.destroy();

    const reclaimableLimited = createCache(vector, new MemoryAdapter(), {
      maximumBytes: 1024,
      quotaShareFraction: 0.5,
      storage: {
        estimate: () => Promise.resolve({ quota: 800, usage: 632 }),
      },
    });
    await reclaimableLimited.lookupPages([]);
    expect(reclaimableLimited.statistics).toEqual(
      jasmine.objectContaining({
        originQuotaShareBytes: 400,
        originReclaimableMaximumBytes: 134,
        quotaMaximumBytes: 134,
        effectiveBytes: 134,
        limitingFactor: "origin-reclaimable",
      }),
    );
    reclaimableLimited.destroy();

    const configuredLimited = createCache(vector, new MemoryAdapter(), {
      maximumBytes: 64,
      quotaShareFraction: 0.5,
      storage: {
        estimate: () => Promise.resolve({ quota: 800, usage: 0 }),
      },
    });
    await configuredLimited.lookupPages([]);
    expect(configuredLimited.statistics).toEqual(
      jasmine.objectContaining({
        originQuotaShareBytes: 400,
        quotaMaximumBytes: 400,
        effectiveBytes: 64,
        limitingFactor: "configured",
      }),
    );
    configuredLimited.destroy();

    const zeroReclaimable = createCache(vector, new MemoryAdapter(), {
      maximumBytes: 1024,
      quotaShareFraction: 0.5,
      storage: {
        estimate: () => Promise.resolve({ quota: 800, usage: 800 }),
      },
    });
    await zeroReclaimable.lookupPages([]);
    expect(zeroReclaimable.statistics).toEqual(
      jasmine.objectContaining({
        originQuotaShareBytes: 400,
        originReclaimableMaximumBytes: 0,
        quotaMaximumBytes: 0,
        effectiveBytes: 1,
        limitingFactor: "origin-reclaimable",
      }),
    );
    zeroReclaimable.destroy();
  });

  it("rejects invalid quota shares before opening an owner", function () {
    const vector = createVector(1);
    for (const value of [0, -0.1, NaN, Infinity, 1.0001]) {
      const adapter = new MemoryAdapter();
      expect(() =>
        createCache(vector, adapter, {
          quotaShareFraction: value,
          sharedKey: `invalid-share-${String(value)}`,
        }),
      ).toThrowDeveloperError();
      expect(adapter.openCalls).toBe(0);
    }
  });

  it("uses the minimum live-client share and restores a wider share without another estimate", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    const estimate = jasmine
      .createSpy("estimate")
      .and.resolveTo({ quota: 1000, usage: 0 });
    const storage = { estimate };
    const sharedKey = `quota-share-${crypto.randomUUID()}`;
    const wide = createCache(vector, adapter, {
      sharedKey,
      maximumBytes: 1000,
      quotaShareFraction: 0.5,
      storage,
    });
    const narrow = createCache(vector, adapter, {
      sharedKey,
      maximumBytes: 1000,
      quotaShareFraction: 0.25,
      storage,
    });
    await wide.lookupPages([]);
    expect(wide.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      true,
    );
    await settleWrites(wide);
    const owner = wide._owner;
    const storageGeneration = owner.storageGeneration;
    const ownedBytes = owner.ownedBytes;
    const persistedRecord = adapter.pages.values().next().value;
    const persistedEpoch = persistedRecord.lastAccessEpoch;
    expect(wide.statistics).toEqual(
      jasmine.objectContaining({
        quotaShareFraction: 0.5,
        sharedQuotaShareFraction: 0.25,
        originQuotaShareBytes: 250,
        quotaMaximumBytes: 250,
        effectiveBytes: 250,
      }),
    );
    expect(narrow._owner).toBe(owner);

    const laterWider = createCache(vector, adapter, {
      sharedKey,
      maximumBytes: 1000,
      quotaShareFraction: 0.75,
      storage,
    });
    expect(laterWider._owner).toBe(owner);
    expect(wide.statistics.sharedQuotaShareFraction).toBe(0.25);
    expect(wide.statistics.effectiveBytes).toBe(250);
    expect(owner.storageGeneration).toBe(storageGeneration);
    expect(owner.ownedBytes).toBe(ownedBytes);
    expect(adapter.pages.values().next().value).toBe(persistedRecord);
    expect(persistedRecord.lastAccessEpoch).toBe(persistedEpoch);

    narrow.destroy();
    expect(wide.statistics).toEqual(
      jasmine.objectContaining({
        sharedQuotaShareFraction: 0.5,
        originQuotaShareBytes: 500,
        quotaMaximumBytes: 500,
        effectiveBytes: 500,
      }),
    );
    expect(estimate).toHaveBeenCalledTimes(1);
    expect(owner.storageGeneration).toBe(storageGeneration);
    expect(owner.ownedBytes).toBe(ownedBytes);
    expect(adapter.pages.values().next().value).toBe(persistedRecord);
    expect(persistedRecord.lastAccessEpoch).toBe(persistedEpoch);
    laterWider.destroy();
    wide.destroy();
  });

  it("uses the conservative capacity when estimate is denied", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter, {
      maximumBytes: 1024 * 1024 * 1024,
      storage: {
        estimate: () => Promise.reject(new Error("denied")),
      },
    });
    await cache.lookupPages([]);
    expect(cache.statistics).toEqual(
      jasmine.objectContaining({
        effectiveBytes: 512 * 1024 * 1024,
        quotaEstimateStatus: "error",
        originQuotaBytes: undefined,
        originUsageBytes: undefined,
        originAvailableBytes: undefined,
        originQuotaShareBytes: undefined,
        quotaShareFraction: 0.25,
        sharedQuotaShareFraction: 0.25,
        originReclaimableMaximumBytes: undefined,
        quotaMaximumBytes: 512 * 1024 * 1024,
        limitingFactor: "estimate-fallback",
        persistentStorageStatus: "unsupported",
      }),
    );
    cache.destroy();
  });

  it("drops a pending history write for a visible write without blocking delivery", async function () {
    const vector = createVector(3);
    const adapter = new MemoryAdapter();
    adapter.holdWrites = true;
    const cache = createCache(vector, adapter, { maximumStagingBytes: 64 });
    expect(
      cache.enqueueWrite(vector.index.pages[0], vector.payloads[0], {
        priorityClass: "visible-core",
      }),
    ).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(
      cache.enqueueWrite(vector.index.pages[1], vector.payloads[1], {
        priorityClass: "history",
      }),
    ).toBe(true);
    expect(
      cache.enqueueWrite(vector.index.pages[2], vector.payloads[2], {
        priorityClass: "coming-core",
      }),
    ).toBe(true);
    expect(cache.statistics.writeDroppedPages).toBe(1);
    expect(cache.statistics.pendingWritePages).toBe(1);
    adapter.holdWrites = false;
    while (adapter.writeResolvers.length > 0) {
      adapter.writeResolvers.shift()();
    }
    await settleWrites(cache, 2);
    expect(adapter.pages.has(adapter.key(1, 1))).toBe(false);
    expect(adapter.pages.has(adapter.key(1, 2))).toBe(true);
    cache.destroy();
  });

  it("pumps structured Work SH and maintenance writes in stable class order", async function () {
    const vector = createVector(5, "structured-write-order");
    const adapter = new MemoryAdapter();
    adapter.holdWrites = true;
    const cache = createCache(vector, adapter, { maximumStagingBytes: 1024 });
    const workPriority = (workClass, sequence) =>
      Object.freeze({
        workClass,
        scheduleClass: GaussianStreamScheduleClass.MAINTENANCE,
        distanceSquared: 0,
        logicalXyExtentSquared: 1,
        selectedSplats: 1,
        tileY: 0,
        tileX: sequence,
        canonicalIdentity: `write-${sequence}`,
        sequence,
      });
    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0], {
      workPriority: workPriority(GaussianStreamWorkClass.VISIBLE_WORK_CORE, 0),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (const [pageIndex, workClass] of [
      [4, GaussianStreamWorkClass.HISTORY_MAINTENANCE],
      [3, GaussianStreamWorkClass.ACTIVE_OPTIONAL_SH],
      [1, GaussianStreamWorkClass.VISIBLE_WORK_CORE],
    ]) {
      cache.enqueueWrite(
        vector.index.pages[pageIndex],
        vector.payloads[pageIndex],
        {
          workPriority: workPriority(workClass, pageIndex),
        },
      );
    }
    adapter.holdWrites = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      while (adapter.writeResolvers.length > 0) {
        adapter.writeResolvers.shift()();
      }
      if (cache.statistics.writeCommittedPages === 4) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await settleWrites(cache, 4);
    expect(
      adapter.events
        .filter((event) => event.startsWith("write-start-"))
        .map((event) => Number(event.slice("write-start-".length))),
    ).toEqual([0, 1, 3, 4]);
    expect(cache.statistics.workWriteQueuedPages).toBe(2);
    expect(cache.statistics.shWriteQueuedPages).toBe(1);
    expect(cache.statistics.maintenanceWriteQueuedPages).toBe(1);
    expect(cache.statistics.workWriteCommittedPages).toBe(2);
    expect(cache.statistics.shWriteCommittedPages).toBe(1);
    expect(cache.statistics.maintenanceWriteCommittedPages).toBe(1);
    cache.destroy();
  });

  it("reports exact bounded per-class lookup hit miss and write counters", async function () {
    const vector = createVector(5, "structured-class-counters");
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter, { maximumStagingBytes: 1024 });
    const workPriority = (workClass, sequence) =>
      Object.freeze({
        workClass,
        scheduleClass: GaussianStreamScheduleClass.MAINTENANCE,
        distanceSquared: 0,
        logicalXyExtentSquared: 1,
        selectedSplats: 1,
        tileY: 0,
        tileX: sequence,
        canonicalIdentity: `counter-${sequence}`,
        sequence,
      });
    const classes = [
      GaussianStreamWorkClass.VISIBLE_WORK_CORE,
      GaussianStreamWorkClass.ACTIVE_OPTIONAL_SH,
      GaussianStreamWorkClass.HISTORY_MAINTENANCE,
    ];
    for (let i = 0; i < classes.length; i++) {
      cache.enqueueWrite(vector.index.pages[i], vector.payloads[i], {
        workPriority: workPriority(classes[i], i),
      });
    }
    await settleWrites(cache, 3);
    const pages = vector.index.pages.slice(0, 4);
    const entries = pages.map((page, index) => ({
      page,
      workPriority: workPriority(classes[Math.min(index, 2)], index),
    }));
    const context = cache.createLookupContext(entries, {
      deadline: performance.now() + 1000,
      signal: new AbortController().signal,
    });
    const results = await cache.lookupPages(pages, context);
    expect(results.length).toBe(3);
    results.forEach((result) => result.release());
    const statistics = cache.statistics;
    expect(statistics.workLookupPages).toBe(1);
    expect(statistics.shLookupPages).toBe(1);
    expect(statistics.maintenanceLookupPages).toBe(2);
    expect(statistics.workHitPages).toBe(1);
    expect(statistics.shHitPages).toBe(1);
    expect(statistics.maintenanceHitPages).toBe(1);
    expect(statistics.maintenanceMissPages).toBe(1);
    expect(statistics.workWriteCommittedPages).toBe(1);
    expect(statistics.shWriteCommittedPages).toBe(1);
    expect(statistics.maintenanceWriteCommittedPages).toBe(1);
    cache.destroy();
  });

  it("retries quota once and then disables writes without disabling reads", async function () {
    const vector = createVector(2);
    const adapter = new MemoryAdapter();
    const quota = new Error("quota");
    quota.name = "QuotaExceededError";
    adapter.writeFailures.push(quota);
    const cache = createCache(vector, adapter);
    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(cache);
    expect(cache.statistics.quotaRetries).toBe(1);
    expect(cache.statistics.writesDisabled).toBe(false);

    adapter.writeFailures.push(quota, quota);
    cache.enqueueWrite(vector.index.pages[1], vector.payloads[1]);
    await settleWrites(cache, 2);
    expect(cache.statistics.writesDisabled).toBe(true);
    const results = await cache.lookupPages([vector.index.pages[0]]);
    expect(results).toEqual([]);
    expect(cache.statistics.lookupMissPages).toBe(1);
    expect(cache.statistics.operational).toBe(true);
    cache.destroy();
  });

  it("shares one serialized owner and closes it after the last reference", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    const first = createCache(vector, adapter, {
      sharedKey: "shared-test",
      maintenanceTimeoutMs: 1,
    });
    const second = createCache(vector, adapter, {
      sharedKey: "shared-test",
      maintenanceTimeoutMs: 1,
    });
    first.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(first);
    const results = await second.lookupPages([vector.index.pages[0]]);
    expect(results.length).toBe(1);
    results[0].release();
    first.destroy();
    expect(adapter.closeCalls).toBe(0);
    second.destroy();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(adapter.closeCalls).toBe(1);
  });

  it("fails open when the database cannot open", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    adapter.open = function () {
      return Promise.reject(
        Object.assign(new Error("private"), { name: "SecurityError" }),
      );
    };
    const cache = createCache(vector, adapter);
    expect(await cache.lookupPages([vector.index.pages[0]])).toEqual([]);
    expect(cache.statistics.operational).toBe(false);
    expect(cache.statistics.disabledReason).toBe("SecurityError");
    expect(cache.statistics.lookupErrorPages).toBe(1);
    cache.destroy();
  });

  it("disables an unknown schema without deleting its records", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    adapter.pages.set("future:0", { storedBytes: 32 });
    adapter.getAccounting = function () {
      return Promise.resolve({
        key: "accounting",
        schema: "t3b-eg4a-v2",
        totalBytes: 32,
      });
    };
    const cache = createCache(vector, adapter);
    expect(await cache.lookupPages(vector.index.pages)).toEqual([]);
    expect(cache.statistics.operational).toBe(false);
    expect(cache.statistics.disabledReason).toBe("Error");
    expect(adapter.pages.size).toBe(1);
    expect(adapter.clearCalls).toBe(0);
    cache.destroy();
  });

  it("performs no adapter or persistence operation when disabled", function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    const cache = new _SceneGISGaussianStreamPersistentCache({
      index: vector.index,
      adapter,
      enabled: false,
      maximumBytes: 1024,
      maximumStagingBytes: 1024,
    });
    expect(cache.enabled).toBe(false);
    expect(adapter.openCalls).toBe(0);
    expect(cache.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      false,
    );
    cache.destroy();
  });

  it("bounds touch ownership and clears only explicitly", async function () {
    const vector = createVector(3);
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter);
    for (let i = 0; i < 3; i++) {
      cache.enqueueWrite(vector.index.pages[i], vector.payloads[i]);
    }
    await settleWrites(cache, 3);
    const results = await cache.lookupPages(vector.index.pages);
    results.forEach((result) => result.release());
    await cache.clear();
    expect(adapter.clearCalls).toBe(1);
    expect(adapter.pages.size).toBe(0);
    expect(cache.statistics.pendingTouches).toBe(0);
    cache.destroy();
  });

  it("validates positive byte ceilings", function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    expect(
      () =>
        new _SceneGISGaussianStreamPersistentCache({
          index: vector.index,
          adapter,
          maximumBytes: 0,
        }),
    ).toThrowDeveloperError();
    expect(
      () =>
        new _SceneGISGaussianStreamPersistentCache({
          index: vector.index,
          adapter,
          maximumStagingBytes: Number.MAX_SAFE_INTEGER + 1,
        }),
    ).toThrowDeveloperError();
  });

  it("uses healthy transactional accounting without a startup repair scan", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter);
    await cache.lookupPages([]);
    expect(adapter.repairCalls).toBe(0);
    expect(cache.statistics.repairCount).toBe(0);
    cache.destroy();
  });

  it("bounds a suspended read and aborts it fail-open without leaking staging", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    adapter.holdReads = true;
    const cache = createCache(vector, adapter, { lookupTimeoutMs: 5 });
    const result = await cache.lookupPages([vector.index.pages[0]]);
    expect(result).toEqual([]);
    expect(cache.statistics.lookupTimeoutPages).toBe(1);
    expect(cache.statistics.activeReadBatches).toBe(0);
    expect(cache.statistics.stagingBytes).toBe(0);
    cache.destroy();
  });

  it("lets an active mutation finish but gates the next write and coalesced touch behind foreground reads", async function () {
    const vector = createVector(3, "foreground-read-gate");
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter, { touchFlushDelayMs: 0 });
    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(cache);
    adapter.events.length = 0;

    adapter.holdWrites = true;
    cache.enqueueWrite(vector.index.pages[1], vector.payloads[1]);
    for (
      let attempt = 0;
      attempt < 20 && adapter.writeResolvers.length === 0;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(adapter.writeResolvers.length).toBe(1);

    adapter.holdReads = true;
    const lookup = cache.lookupPages([vector.index.pages[0]]);
    for (
      let attempt = 0;
      attempt < 20 && adapter.readResolvers.length === 0;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(adapter.readResolvers.length).toBe(1);
    cache.enqueueWrite(vector.index.pages[2], vector.payloads[2]);

    adapter.holdWrites = false;
    adapter.writeResolvers.shift()();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(adapter.events).toContain("write-end-1");
    expect(adapter.events).not.toContain("write-start-2");
    expect(cache.statistics.writePumpDeferred).toBe(true);

    adapter.holdReads = false;
    adapter.readResolvers.shift()();
    const results = await lookup;
    expect(results.persistentDisposition).toBe("hit");
    results[0].release();
    await settleWrites(cache, 3);
    await settleOwner(cache);

    const readEnd = adapter.events.indexOf("read-end");
    const secondWriteStart = adapter.events.indexOf("write-start-2");
    expect(readEnd).toBeGreaterThan(-1);
    expect(secondWriteStart).toBeGreaterThan(readEnd);
    expect(
      adapter.events.filter((event) => event === "touch-start").length,
    ).toBe(1);
    expect(cache.statistics.foregroundReadHighWater).toBe(1);
    expect(cache.statistics.deferredWriteStarts).toBeGreaterThan(0);
    expect(cache.statistics.activeReadBatches).toBe(0);
    cache.destroy();
  });

  it("chunks touches to 32 and lets a queued read run before the second chunk", async function () {
    const vector = createVector(65, "chunked-touches");
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter, {
      maximumBytes: 4096,
      maximumStagingBytes: 4096,
      touchFlushDelayMs: 0,
    });
    vector.index.pages.forEach((page, index) =>
      cache.enqueueWrite(page, vector.payloads[index]),
    );
    await settleWrites(cache, 65);

    adapter.holdTouches = true;
    const warm = await cache.lookupPages(vector.index.pages);
    warm.forEach((result) => result.release());
    for (
      let attempt = 0;
      attempt < 20 && adapter.touchResolvers.length === 0;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(adapter.touchBatches.length).toBe(1);
    expect(adapter.touchBatches[0].length).toBe(32);

    adapter.holdReads = true;
    const heldRead = cache.lookupPages([vector.index.pages[0]]);
    for (
      let attempt = 0;
      attempt < 20 && adapter.readResolvers.length === 0;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    adapter.touchResolvers.shift()();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(adapter.touchBatches.length).toBe(1);

    adapter.holdReads = false;
    adapter.holdTouches = false;
    adapter.readResolvers.shift()();
    const heldResults = await heldRead;
    heldResults[0].release();
    await settleOwner(cache);
    expect(adapter.touchBatches.length).toBe(3);
    expect(adapter.touchBatches.every((batch) => batch.length <= 32)).toBe(
      true,
    );
    expect(cache.statistics.touchMutationMaximumPages).toBe(32);
    cache.destroy();
  });

  it("owner-gates corrupt deletion and keeps close/accounting owned until settlement", async function () {
    const vector = createVector(1, "owned-corrupt-delete");
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter, {
      sharedKey: `delete-${crypto.randomUUID()}`,
      maintenanceTimeoutMs: 20,
    });
    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(cache);
    new Uint8Array(adapter.pages.values().next().value.payload)[0] ^= 0xff;
    adapter.holdDeletes = true;
    expect(await cache.lookupPages(vector.index.pages)).toEqual([]);
    for (
      let attempt = 0;
      attempt < 20 && adapter.deleteResolvers.length === 0;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const owner = cache._owner;
    cache.destroy();
    expect(adapter.deleteResolvers.length).toBe(1);
    expect(owner.corruptDeleteActive).toBe(true);
    expect(adapter.closeCalls).toBe(0);
    adapter.holdDeletes = false;
    adapter.deleteResolvers.shift()();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(owner.ownedBytes).toBe(0);
    expect(owner.counters.corruptDeleteCommittedPages).toBe(1);
    expect(owner.activeMutationTransactions).toBe(0);
    expect(adapter.transactionSettlements).toBe(adapter.transactionStarts);
    expect(adapter.closeCalls).toBe(1);
  });

  it("drops only queued writes to admit foreground reads and exposes the shared live ceiling", async function () {
    const vector = createVector(3, "shared-staging-pressure");
    const adapter = new MemoryAdapter();
    const first = createCache(vector, adapter, {
      sharedKey: "shared-staging-pressure",
      maximumBytes: 4096,
      maximumStagingBytes: 64,
    });
    const second = createCache(vector, adapter, {
      sharedKey: "shared-staging-pressure",
      maximumBytes: 4096,
      maximumStagingBytes: 32,
    });
    expect(first.maximumStagingBytes).toBe(32);
    expect(second.maximumStagingBytes).toBe(32);
    second.destroy();
    expect(first.maximumStagingBytes).toBe(64);

    first.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(first);
    adapter.holdWrites = true;
    first.enqueueWrite(vector.index.pages[1], vector.payloads[1]);
    first.enqueueWrite(vector.index.pages[2], vector.payloads[2]);
    for (
      let attempt = 0;
      attempt < 20 && adapter.writeResolvers.length === 0;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const hit = await first.lookupPages([vector.index.pages[0]]);
    expect(hit.length).toBe(1);
    expect(first.statistics.writeDroppedPages).toBe(1);
    expect(first.statistics.pendingWritePages).toBe(0);
    hit[0].release();
    adapter.holdWrites = false;
    adapter.writeResolvers.shift()();
    await settleWrites(first, 2);
    await settleOwner(first);
    expect(first.statistics.stagingBytes).toBe(0);
    first.destroy();
  });

  it("makes a pre-clear read settlement harmless across storage generation", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter);
    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(cache);
    adapter.holdReads = true;
    const lookup = cache.lookupPages([vector.index.pages[0]]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const clear = cache.clear();
    adapter.holdReads = false;
    adapter.readResolvers.shift()();
    expect(await lookup).toEqual([]);
    await clear;
    expect(cache.statistics.lookupCancelledPages).toBe(1);
    expect(cache.statistics.stagingBytes).toBe(0);
    cache.destroy();
  });

  it("bounds a hung owner open and clears maintenance timer ownership", async function () {
    const vector = createVector(1);
    const adapter = new MemoryAdapter();
    adapter.open = () => new Promise(function () {});
    const cache = createCache(vector, adapter, {
      lookupTimeoutMs: 5,
      maintenanceTimeoutMs: 5,
    });
    expect(await cache.lookupPages(vector.index.pages)).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(cache.statistics.operational).toBe(false);
    expect(cache.statistics.disabledReason).toBe("TimeoutError");
    expect(cache.statistics.activeMaintenanceOperations).toBe(0);
    expect(cache.statistics.activeMaintenanceTimers).toBe(0);
    cache.destroy();
  });

  it("binds shared writes to their source scene after another client is destroyed", async function () {
    const firstVector = createVector(1, "shared-scene-a");
    const secondVector = createVector(1, "shared-scene-b");
    const adapter = new MemoryAdapter();
    adapter.holdWrites = true;
    const first = createCache(firstVector, adapter, {
      sharedKey: "scene-owner",
    });
    const second = createCache(secondVector, adapter, {
      sharedKey: "scene-owner",
    });
    first.enqueueWrite(firstVector.index.pages[0], firstVector.payloads[0]);
    second.enqueueWrite(secondVector.index.pages[0], secondVector.payloads[0]);
    first.destroy();
    adapter.holdWrites = false;
    while (adapter.writeResolvers.length > 0) {
      adapter.writeResolvers.shift()();
    }
    await settleWrites(second, 2);
    expect(adapter.pages.has(adapter.key(1, 0))).toBe(true);
    expect(adapter.pages.has(adapter.key(2, 0))).toBe(true);
    second.destroy();
  });

  it("drains the bounded validated queue after the last client releases", async function () {
    const vector = createVector(1, "last-client-drain");
    const adapter = new MemoryAdapter();
    adapter.holdWrites = true;
    const cache = createCache(vector, adapter, {
      sharedKey: `drain-${crypto.randomUUID()}`,
      maintenanceTimeoutMs: 5,
    });
    expect(cache.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      true,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    cache.destroy();
    adapter.holdWrites = false;
    adapter.writeResolvers.shift()();
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(adapter.pages.size).toBe(1);
    expect(adapter.closeCalls).toBe(1);
  });

  it("recomputes shared client ceilings and allocates monotonic persisted epochs", async function () {
    const vector = createVector(2);
    const adapter = new MemoryAdapter();
    const priorEpoch = Date.now() + 10000;
    adapter.highWaterEpoch = priorEpoch;
    const sharedKey = `ceilings-${crypto.randomUUID()}`;
    const wide = createCache(vector, adapter, {
      sharedKey,
      maximumBytes: 1024,
      maximumStagingBytes: 1024,
    });
    const narrow = createCache(vector, adapter, {
      sharedKey,
      maximumBytes: 64,
      maximumStagingBytes: 64,
    });
    wide.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(wide);
    expect(wide.statistics).toEqual(
      jasmine.objectContaining({
        sharedConfiguredBytes: 64,
        effectiveBytes: 64,
        originQuotaBytes: 1024 * 1024,
        originUsageBytes: 0,
        quotaMaximumBytes: 256 * 1024,
        limitingFactor: "configured",
      }),
    );
    expect(adapter.pages.values().next().value.lastAccessEpoch).toBeGreaterThan(
      priorEpoch,
    );
    narrow.destroy();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(wide.statistics).toEqual(
      jasmine.objectContaining({
        sharedConfiguredBytes: 1024,
        effectiveBytes: 1024,
        originQuotaBytes: 1024 * 1024,
        originUsageBytes: 0,
        quotaMaximumBytes: 256 * 1024,
        limitingFactor: "configured",
      }),
    );
    wide.destroy();
  });

  it("continues queued mutations after an initial scene-owner rejection", async function () {
    const vector = createVector(2, "scene-retry");
    const adapter = new MemoryAdapter();
    adapter.ensureSceneFailures.push(new Error("first scene failure"));
    const cache = createCache(vector, adapter);
    const owner = cache._owner;

    expect(cache.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      true,
    );
    expect(cache.enqueueWrite(vector.index.pages[1], vector.payloads[1])).toBe(
      true,
    );
    await settleWrites(cache, 2);
    await settleOwner(cache);

    expect(cache.statistics.writeFailedPages).toBe(1);
    expect(cache.statistics.writeCommittedPages).toBe(1);
    expect(adapter.pages.has(adapter.key(1, 1))).toBe(true);
    expect(adapter.activeTransactions).toBe(0);
    expect(adapter.transactionSettlements).toBe(adapter.transactionStarts);
    await expectAsync(owner.mutationTail).toBeResolved();
    cache.destroy();
  });

  it("runs clear after a rejected write without leaving a rejected tail", async function () {
    const vector = createVector(1, "write-failure-clear");
    const adapter = new MemoryAdapter();
    adapter.writeFailures.push(new Error("write failed"));
    const cache = createCache(vector, adapter);
    const owner = cache._owner;

    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(cache);
    await cache.clear();
    await settleOwner(cache);

    expect(cache.statistics.writeFailedPages).toBe(1);
    expect(adapter.clearCalls).toBe(1);
    expect(cache.statistics.ownedBytes).toBe(0);
    expect(adapter.activeTransactions).toBe(0);
    expect(adapter.transactionSettlements).toBe(adapter.transactionStarts);
    await expectAsync(owner.mutationTail).toBeResolved();
    cache.destroy();
  });

  it("runs a later write after a failed touch mutation", async function () {
    const vector = createVector(2, "touch-failure-write");
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter);
    const owner = cache._owner;
    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(cache);

    adapter.touchFailures.push(new Error("touch failed"));
    const results = await cache.lookupPages([vector.index.pages[0]]);
    results[0].release();
    await settleOwner(cache);
    expect(cache.enqueueWrite(vector.index.pages[1], vector.payloads[1])).toBe(
      true,
    );
    await settleWrites(cache, 2);
    await settleOwner(cache);

    expect(cache.statistics.writeCommittedPages).toBe(2);
    expect(adapter.pages.has(adapter.key(1, 1))).toBe(true);
    expect(adapter.activeTransactions).toBe(0);
    await expectAsync(owner.mutationTail).toBeResolved();
    cache.destroy();
  });

  it("keeps the shared owner open while the last-client touch is held", async function () {
    const vector = createVector(1, "held-touch-close");
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter, {
      sharedKey: `touch-close-${crypto.randomUUID()}`,
      maintenanceTimeoutMs: 20,
    });
    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(cache);
    adapter.holdTouches = true;
    const results = await cache.lookupPages([vector.index.pages[0]]);
    results[0].release();
    for (
      let attempt = 0;
      attempt < 10 && adapter.touchResolvers.length === 0;
      attempt++
    ) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const owner = cache._owner;
    cache.destroy();

    expect(adapter.touchResolvers.length).toBe(1);
    expect(owner.activeMutationTransactions).toBe(1);
    expect(adapter.activeTransactions).toBe(1);
    expect(adapter.closeCalls).toBe(0);
    adapter.holdTouches = false;
    adapter.touchResolvers.shift()();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(owner.activeMutationTransactions).toBe(0);
    expect(owner.mutationTailIdle).toBe(true);
    expect(adapter.activeTransactions).toBe(0);
    expect(adapter.transactionSettlements).toBe(adapter.transactionStarts);
    expect(adapter.closeCalls).toBe(1);
  });

  it("keeps failed clear state bounded and closes after destroy", async function () {
    const vector = createVector(1, "clear-failure-close");
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter, {
      sharedKey: `clear-close-${crypto.randomUUID()}`,
      maintenanceTimeoutMs: 5,
    });
    cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]);
    await settleWrites(cache);
    const owner = cache._owner;
    const storageGeneration = owner.storageGeneration;
    adapter.clearFailures.push(new Error("clear failed"));

    await expectAsync(cache.clear()).toBeRejected();
    await settleOwner(cache);
    expect(owner.storageGeneration).toBe(storageGeneration);
    expect(owner.accountingValid).toBe(true);
    expect(adapter.pages.size).toBe(1);
    expect(adapter.activeTransactions).toBe(0);
    expect(adapter.transactionSettlements).toBe(adapter.transactionStarts);
    await expectAsync(owner.mutationTail).toBeResolved();
    cache.destroy();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(adapter.closeCalls).toBe(1);
  });

  it("aborts held touch, corrupt-delete and clear mutations before releasing owner accounting", async function () {
    const vector = createVector(1, "deadline-mutations");
    const adapter = new MemoryAdapter();
    const cache = createCache(vector, adapter, {
      sharedKey: `deadline-mutations-${crypto.randomUUID()}`,
      maintenanceTimeoutMs: 10,
    });
    expect(cache.enqueueWrite(vector.index.pages[0], vector.payloads[0])).toBe(
      true,
    );
    await settleWrites(cache);
    const owner = cache._owner;
    const ownedBytes = cache.statistics.ownedBytes;

    adapter.holdTouches = true;
    let results = await cache.lookupPages([vector.index.pages[0]]);
    results[0].release();
    await waitFor(() => adapter.touchResolvers.length === 1);
    await waitFor(() => adapter.transactionAborts === 1);
    expect(owner.activeMutationTransactions).toBe(0);
    expect(adapter.activeTransactions).toBe(0);
    expect(cache.statistics.ownedBytes).toBe(ownedBytes);
    adapter.holdTouches = false;

    new Uint8Array(adapter.pages.get(adapter.key(1, 0)).payload)[0] ^= 0xff;
    adapter.holdDeletes = true;
    results = await cache.lookupPages([vector.index.pages[0]]);
    expect(results.persistentDisposition).toBe("definite-miss-or-corrupt");
    await waitFor(() => adapter.deleteResolvers.length === 1);
    await waitFor(() => adapter.transactionAborts === 2);
    expect(adapter.pages.has(adapter.key(1, 0))).toBe(true);
    expect(cache.statistics.ownedBytes).toBe(ownedBytes);
    adapter.holdDeletes = false;

    adapter.holdClears = true;
    await expectAsync(cache.clear()).toBeRejectedWithError(
      Error,
      "Persistent cache operation timed out",
    );
    expect(adapter.transactionAborts).toBe(3);
    expect(adapter.pages.has(adapter.key(1, 0))).toBe(true);
    expect(cache.statistics.ownedBytes).toBe(ownedBytes);
    expect(adapter.transactionSettlements).toBe(adapter.transactionStarts);
    expect(cache.statistics.activeMutationTransactions).toBe(0);
    expect(cache.statistics.activeMaintenanceOperations).toBe(0);
    expect(cache.statistics.activeMaintenanceTimers).toBe(0);
    adapter.holdClears = false;
    cache.destroy();
  });

  it("aborts exact native touch, corrupt-delete and clear transactions at the maintenance deadline", async function () {
    const databaseName = `CesiumGaussianStreamCacheDeadlineSpec-${crypto.randomUUID()}`;
    const vector = createVector(2, "native-deadline-mutations");
    try {
      const cache = createNativeCache(vector, databaseName, {
        maintenanceTimeoutMs: 2000,
        lookupTimeoutMs: 500,
      });
      await cache._owner.ready;
      expect(
        cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]),
      ).toBe(true);
      expect(
        cache.enqueueWrite(vector.index.pages[1], vector.payloads[1]),
      ).toBe(true);
      await settleWrites(cache, 2);
      cache._owner.maintenanceTimeoutMs = 20;
      const adapter = cache._owner.adapter;
      const ownedBytes = cache.statistics.ownedBytes;
      const completedSetupTransactions =
        cache.statistics.nativeTransactionCompletes;
      expect(completedSetupTransactions).toBe(4);

      adapter.onReadwriteTransaction = holdNativeMutation;
      let results = await cache.lookupPages([vector.index.pages[1]]);
      results[0].release();
      await waitFor(
        () =>
          cache.statistics.nativeTransactionCreates ===
            completedSetupTransactions + 1 &&
          cache.statistics.activeMaintenanceOperations === 1,
      );
      cache._owner.touchFlushDelayMs = 1000;
      const readBehindTouch = cache.lookupPages([vector.index.pages[1]]);
      await waitFor(
        () =>
          cache.statistics.nativeTransactionAborts === 1 &&
          cache.statistics.activeMaintenanceOperations === 0 &&
          cache.statistics.activeMutationTransactions === 0,
      );
      expect(cache.statistics.ownedBytes).toBe(ownedBytes);

      adapter.onReadwriteTransaction = undefined;
      results = await readBehindTouch;
      expect(results.persistentDisposition).toBe("hit");
      results[0].release();
      cache._owner.cancelTouchFlush();
      cache._owner.touches.clear();
      const sceneOwner = await cache._owner.resolveScene(
        vector.index.runtimeIndexIdentity,
      );
      const corruptTransaction = adapter._database.transaction(
        "pages",
        "readwrite",
      );
      const corruptStore = corruptTransaction.objectStore("pages");
      const corruptRequest = corruptStore.get([sceneOwner, 0]);
      const record = await new Promise((resolve, reject) => {
        corruptRequest.onsuccess = () => resolve(corruptRequest.result);
        corruptRequest.onerror = () => reject(corruptRequest.error);
      });
      new Uint8Array(record.payload)[0] ^= 0xff;
      corruptStore.put(record);
      await new Promise((resolve, reject) => {
        corruptTransaction.oncomplete = resolve;
        corruptTransaction.onabort = () => reject(corruptTransaction.error);
      });

      const createsBeforeDelete = cache.statistics.nativeTransactionCreates;
      adapter.onReadwriteTransaction = holdNativeMutation;
      results = await cache.lookupPages([vector.index.pages[0]]);
      expect(results.persistentDisposition).toBe("definite-miss-or-corrupt");
      await waitFor(
        () =>
          cache.statistics.nativeTransactionCreates ===
            createsBeforeDelete + 1 &&
          cache.statistics.activeMaintenanceOperations === 1,
      );
      const readBehindDelete = cache.lookupPages([vector.index.pages[1]]);
      await waitFor(
        () =>
          cache.statistics.nativeTransactionAborts === 2 &&
          cache.statistics.activeMaintenanceOperations === 0 &&
          cache.statistics.activeMutationTransactions === 0,
      );
      expect(cache.statistics.ownedBytes).toBe(ownedBytes);

      adapter.onReadwriteTransaction = undefined;
      results = await readBehindDelete;
      expect(results.persistentDisposition).toBe("hit");
      results[0].release();
      cache._owner.cancelTouchFlush();
      cache._owner.touches.clear();

      const createsBeforeClear = cache.statistics.nativeTransactionCreates;
      adapter.onReadwriteTransaction = holdNativeMutation;
      const clear = cache.clear();
      await waitFor(
        () =>
          cache.statistics.nativeTransactionCreates ===
            createsBeforeClear + 1 &&
          cache.statistics.activeMaintenanceOperations === 1,
      );
      const readBehindClear = cache.lookupPages([vector.index.pages[1]]);
      await expectAsync(clear).toBeRejectedWithError(
        Error,
        "Persistent cache operation timed out",
      );
      expect(cache.statistics.nativeTransactionCreates).toBe(
        createsBeforeClear + 1,
      );
      expect(cache.statistics.nativeTransactionAborts).toBe(3);
      expect(cache.statistics.nativeTransactionCreates).toBe(
        cache.statistics.nativeTransactionAborts +
          cache.statistics.nativeTransactionCompletes,
      );
      expect(cache.statistics.nativeTransactionAborts).toBe(3);
      expect(cache.statistics.nativeTransactionCreates).toBe(7);
      expect(cache.statistics.nativeTransactionCompletes).toBe(4);
      expect(cache.statistics.ownedBytes).toBe(ownedBytes);
      expect(cache.statistics.activeMutationTransactions).toBe(0);
      expect(cache.statistics.activeMaintenanceOperations).toBe(0);
      expect(cache.statistics.activeMaintenanceTimers).toBe(0);
      adapter.onReadwriteTransaction = undefined;
      results = await readBehindClear;
      expect(results.persistentDisposition).toBe("hit");
      results[0].release();
      expect(cache.statistics.activeReadBatches).toBe(0);
      cache._owner.cancelTouchFlush();
      cache._owner.touches.clear();
      cache.destroy();
      await new Promise((resolve) => setTimeout(resolve, 25));
    } finally {
      await deleteDatabase(databaseName);
    }
  });

  it("commits exact native write and clear results when completion wins the deadline cancellation race", async function () {
    const databaseName = `CesiumGaussianStreamCacheCompletionWinsSpec-${crypto.randomUUID()}`;
    const vector = createVector(1, "native-completion-wins");
    try {
      const cache = createNativeCache(vector, databaseName, {
        maintenanceTimeoutMs: 2000,
      });
      await cache._owner.ready;
      await cache._owner.resolveScene(vector.index.runtimeIndexIdentity);
      await cache._owner.scheduleRepair();
      const adapter = cache._owner.adapter;
      const createsBefore = cache.statistics.nativeTransactionCreates;
      const completesBefore = cache.statistics.nativeTransactionCompletes;
      const abortsBefore = cache.statistics.nativeTransactionAborts;
      const requestsBefore = cache.statistics.nativeTransactionAbortRequests;
      cache._owner.maintenanceTimeoutMs = 20;
      adapter.onReadwriteTransaction = completeNativeMutationAfterDeadline;
      adapter.onAbortTransaction = forceCompletedAbortDisposition;

      expect(
        cache.enqueueWrite(vector.index.pages[0], vector.payloads[0]),
      ).toBe(true);
      await settleWrites(cache);
      expect(cache.statistics.writeCommittedPages).toBe(1);
      expect(cache.statistics.ownedBytes).toBe(
        vector.index.pages[0].storedBytes,
      );
      expect(cache.statistics.nativeTransactionAbortRequests).toBe(
        requestsBefore + 1,
      );
      expect(cache.statistics.nativeTransactionAborts).toBe(abortsBefore);
      expect(cache.statistics.nativeTransactionCompletes).toBe(
        completesBefore + 1,
      );

      await expectAsync(cache.clear()).toBeResolved();
      expect(cache.statistics.ownedBytes).toBe(0);
      expect(cache.statistics.nativeTransactionAbortRequests).toBe(
        requestsBefore + 2,
      );
      expect(cache.statistics.nativeTransactionCreates).toBe(createsBefore + 2);
      expect(cache.statistics.nativeTransactionAborts).toBe(abortsBefore);
      expect(cache.statistics.nativeTransactionCompletes).toBe(
        completesBefore + 2,
      );
      expect(cache.statistics.nativeTransactionCreates).toBe(
        cache.statistics.nativeTransactionAborts +
          cache.statistics.nativeTransactionCompletes,
      );
      expect(cache.statistics.activeMutationTransactions).toBe(0);
      expect(cache.statistics.activeMaintenanceOperations).toBe(0);
      expect(cache.statistics.activeMaintenanceTimers).toBe(0);
      expect(cache.statistics.stagingBytes).toBe(0);
      adapter.onReadwriteTransaction = undefined;
      adapter.onAbortTransaction = undefined;
      cache.destroy();
      await new Promise((resolve) => setTimeout(resolve, 25));
    } finally {
      await deleteDatabase(databaseName);
    }
  });

  it("uses native IndexedDB for cold write, recreated warm bytes, scene isolation and clear", async function () {
    const databaseName = `CesiumGaussianStreamCacheSpec-${crypto.randomUUID()}`;
    const firstVector = createVector(1, "native-scene-a");
    const secondVector = createVector(1, "native-scene-b");
    try {
      const first = createNativeCache(firstVector, databaseName);
      expect(
        first.enqueueWrite(firstVector.index.pages[0], firstVector.payloads[0]),
      ).toBe(true);
      await settleWrites(first);
      first.destroy();
      await new Promise((resolve) => setTimeout(resolve, 2050));

      const warm = createNativeCache(firstVector, databaseName);
      const isolated = createNativeCache(secondVector, databaseName);
      const warmResults = await warm.lookupPages([firstVector.index.pages[0]]);
      expect(warmResults.length).toBe(1);
      expect(warmResults[0].payload).toEqual(firstVector.payloads[0]);
      expect(warm.statistics.repairCount).toBe(0);
      warmResults[0].release();
      const nativeSceneOwner = await warm._owner.resolveScene(
        firstVector.index.runtimeIndexIdentity,
      );
      const controller = new AbortController();
      const abortedRead = warm._owner.adapter.getPages(
        nativeSceneOwner,
        [firstVector.index.pages[0].index],
        controller.signal,
      );
      controller.abort();
      await expectAsync(abortedRead).toBeRejected();
      expect(await isolated.lookupPages([secondVector.index.pages[0]])).toEqual(
        [],
      );

      await warm.clear();
      expect(
        warm.enqueueWrite(firstVector.index.pages[0], firstVector.payloads[0]),
      ).toBe(true);
      await settleWrites(warm);
      const postClearSceneOwner = await warm._owner.resolveScene(
        firstVector.index.runtimeIndexIdentity,
      );
      expect(postClearSceneOwner).not.toBe(nativeSceneOwner);
      const afterClear = await warm.lookupPages([firstVector.index.pages[0]]);
      expect(afterClear.length).toBe(1);
      afterClear[0].release();
      await settleOwner(warm);
      expect(warm.statistics.stagingBytes).toBe(0);
      expect(warm.statistics.activeReadBatches).toBe(0);
      expect(warm.statistics.activeWriteTransactions).toBe(0);
      expect(warm.statistics.activeMaintenanceOperations).toBe(0);
      expect(warm.statistics.activeMaintenanceTimers).toBe(0);
      expect(warm.statistics.pendingTouches).toBe(0);
      warm.destroy();
      isolated.destroy();
      await new Promise((resolve) => setTimeout(resolve, 2050));
    } finally {
      await deleteDatabase(databaseName);
    }
  });

  it("serves four concurrent native IndexedDB read batches from a several-hundred-page warm set", async function () {
    const databaseName = `CesiumGaussianStreamCachePrioritySpec-${crypto.randomUUID()}`;
    const vector = createVector(256, "native-read-priority");
    try {
      const cold = createNativeCache(vector, databaseName, {
        lookupTimeoutMs: 2000,
        maintenanceTimeoutMs: 50,
      });
      for (let i = 0; i < vector.index.pages.length; i++) {
        expect(
          cold.enqueueWrite(vector.index.pages[i], vector.payloads[i]),
        ).toBe(true);
      }
      await settleWrites(cold, vector.index.pages.length);
      cold.destroy();
      await new Promise((resolve) => setTimeout(resolve, 75));

      const warm = createNativeCache(vector, databaseName, {
        lookupTimeoutMs: 2000,
        maintenanceTimeoutMs: 50,
        touchFlushDelayMs: 25,
      });
      const batches = Array.from({ length: 4 }, (_, batchIndex) =>
        warm.lookupPages(
          vector.index.pages.slice(batchIndex * 32, (batchIndex + 1) * 32),
        ),
      );
      expect(
        warm.enqueueWrite(vector.index.pages[200], vector.payloads[200]),
      ).toBe(true);
      const results = await Promise.all(batches);
      for (const batch of results) {
        expect(batch.length).toBe(32);
        expect(batch.persistentDisposition).toBe("hit");
        batch.forEach((result) => result.release());
      }
      expect(warm.statistics.lookupHitPages).toBe(128);
      expect(warm.statistics.lookupTimeoutPages).toBe(0);
      expect(warm.statistics.foregroundReadHighWater).toBe(4);
      expect(warm.statistics.deferredWriteStarts).toBeGreaterThan(0);
      await settleWrites(warm, 1);
      await settleOwner(warm);
      expect(warm.statistics.touchMutationMaximumPages).toBeLessThanOrEqual(32);
      expect(warm.statistics.touchMutationCount).toBeGreaterThanOrEqual(4);
      expect(warm.statistics.activeReadBatches).toBe(0);
      expect(warm.statistics.pendingTouches).toBe(0);
      expect(warm.statistics.stagingBytes).toBe(0);
      warm.destroy();
      await new Promise((resolve) => setTimeout(resolve, 75));
    } finally {
      await deleteDatabase(databaseName);
    }
  });
});

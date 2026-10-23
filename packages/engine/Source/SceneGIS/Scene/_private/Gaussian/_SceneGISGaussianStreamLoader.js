/**
 * Private segmented Gaussian runtime. Source provenance: ADR-0188.
 * @private
 */
import defined from "../../../../Core/defined.js";
import destroyObject from "../../../../Core/destroyObject.js";
import DeveloperError from "../../../../Core/DeveloperError.js";
import Request from "../../../../Core/Request.js";
import RequestScheduler from "../../../../Core/RequestScheduler.js";
import RequestType from "../../../../Core/RequestType.js";
import Resource from "../../../../Core/Resource.js";
import RuntimeError from "../../../../Core/RuntimeError.js";
import {
  GSP_HEADER_BYTES,
  parsePackHeader,
  validatePagePayload,
} from "./_SceneGISGaussianStreamPackFormat.js";
import {
  compareGaussianStreamWorkPriority,
  GaussianStreamWorkClass,
  gaussianStreamRequestPriority,
  validateGaussianStreamWorkPriority,
} from "./_SceneGISGaussianStreamWorkPriority.js";

const STATE = Object.freeze({
  UNLOADED: "UNLOADED",
  INDEX_LOADING: "INDEX_LOADING",
  STREAMING: "STREAMING",
  FAILED: "FAILED",
  DESTROYED: "DESTROYED",
});

function headerValue(headers, name) {
  if (!defined(headers)) {
    return undefined;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  const lowerName = name.toLowerCase();
  const key = Object.keys(headers).find(function (candidate) {
    return candidate.toLowerCase() === lowerName;
  });
  return defined(key) ? headers[key] : undefined;
}

async function defaultFetchFunction(options) {
  const response = await fetch(options.url, {
    method: "GET",
    headers: options.headers,
    signal: options.signal,
  });
  return {
    status: response.status,
    headers: response.headers,
    arrayBuffer: await response.arrayBuffer(),
  };
}

function responseBytes(response) {
  if (response.arrayBuffer instanceof ArrayBuffer) {
    return new Uint8Array(response.arrayBuffer);
  }
  if (ArrayBuffer.isView(response.arrayBuffer)) {
    return new Uint8Array(
      response.arrayBuffer.buffer,
      response.arrayBuffer.byteOffset,
      response.arrayBuffer.byteLength,
    );
  }
  throw new RuntimeError(
    "Gaussian Stream response has no ArrayBuffer payload.",
  );
}

function validateRangeResponse(response, start, end, fileBytes) {
  const bytes = responseBytes(response);
  const expectedLength = end - start + 1;
  if (response.status !== 206 || bytes.byteLength !== expectedLength) {
    throw new RuntimeError(
      `Gaussian Stream Range expected HTTP 206 and ${expectedLength} bytes; received ${response.status} and ${bytes.byteLength}.`,
    );
  }
  const contentRange = headerValue(response.headers, "content-range");
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(contentRange ?? "");
  if (
    !match ||
    Number(match[1]) !== start ||
    Number(match[2]) !== end ||
    (match[3] !== "*" && Number(match[3]) !== fileBytes)
  ) {
    throw new RuntimeError(
      "Gaussian Stream response has an invalid Content-Range header.",
    );
  }
  const contentLength = headerValue(response.headers, "content-length");
  if (defined(contentLength) && Number(contentLength) !== expectedLength) {
    throw new RuntimeError(
      "Gaussian Stream response has an invalid Content-Length header.",
    );
  }
  return bytes;
}

function createStatistics() {
  const statistics = {
    indexRequests: 0,
    packHeaderRequests: 0,
    pageRangeRequests: 0,
    pageRangeRequestedBytes: 0,
    mergedPageRequests: 0,
    requestedBytes: 0,
    receivedBytes: 0,
    cancelledRequests: 0,
    cancelledBytes: 0,
    wastedBytes: 0,
    retries: 0,
    failures: 0,
    staleResponses: 0,
    completedPages: 0,
    persistentLookupTimeouts: 0,
    persistentWriteSuppressions: 0,
    rawPageDepth: 0,
    deliveredPagesHighWater: 0,
    completionFrames: 0,
    maximumDeliveryWorkMilliseconds: 0,
  };
  for (const prefix of ["work", "sh", "maintenance"]) {
    statistics[`${prefix}HttpFallbackPages`] = 0;
    statistics[`${prefix}HttpRangePages`] = 0;
    statistics[`${prefix}PersistentTimeoutPages`] = 0;
    statistics[`${prefix}PersistentBackpressurePages`] = 0;
    statistics[`${prefix}WriteSuppressions`] = 0;
  }
  return statistics;
}

function validateDescriptorProvider(provider) {
  if (
    !defined(provider) ||
    typeof provider.readPageRequest !== "function" ||
    typeof provider.readPackRequest !== "function" ||
    typeof provider.packFileName !== "function" ||
    typeof provider.artifactIdentity !== "string" ||
    provider.artifactIdentity.length === 0 ||
    typeof provider.runtimeIndexIdentity !== "string" ||
    provider.runtimeIndexIdentity.length === 0 ||
    !Number.isSafeInteger(provider.pageCount) ||
    provider.pageCount < 0 ||
    !Number.isSafeInteger(provider.packCount) ||
    provider.packCount < 0
  ) {
    throw new DeveloperError("Gaussian Stream descriptor provider is invalid");
  }
  return provider;
}

function descriptorProvider(loader) {
  if (!defined(loader._descriptorProvider) && defined(loader._index)) {
    loader._descriptorProvider = validateDescriptorProvider(
      loader._descriptorProviderFactory(loader._index),
    );
  }
  return loader._descriptorProvider;
}

function workClassPrefix(task) {
  return ["work", undefined, "sh", "maintenance"][
    task.workPriority?.workClass ?? 3
  ];
}

function compareTasks(left, right) {
  if (defined(left.workPriority) && defined(right.workPriority)) {
    return compareGaussianStreamWorkPriority(
      left.workPriority,
      right.workPriority,
    );
  }
  if (left.priority !== right.priority) {
    return left.priority - right.priority;
  }
  return left.sequence - right.sequence;
}

function captureRequestProvenance(task, requestGeneration) {
  const pages =
    task.type === "pageGroup"
      ? task.pageTasks
          .filter((pageTask) => pageTask.cancelled !== true)
          .map((pageTask) =>
            Object.freeze({
              pageIndex: pageTask.page.index,
              priorityClass: pageTask.priorityClass,
              requestGeneration: pageTask.generation,
              operationOwnerIdentity: pageTask.operationOwnerIdentity,
              ownerAmbiguous: pageTask.ownerAmbiguous === true,
            }),
          )
      : [];
  return Object.freeze({
    taskType: task.type,
    requestGeneration,
    pages: Object.freeze(pages),
  });
}

function terminalFailureProvenance(requestProvenance, task, error) {
  const livePageTasks =
    task.type === "pageGroup"
      ? new Map(
          task.pageTasks
            .filter((pageTask) => pageTask.cancelled !== true)
            .map((pageTask) => [pageTask.page.index, pageTask]),
        )
      : undefined;
  const pages = defined(livePageTasks)
    ? requestProvenance.pages
        .filter((page) => livePageTasks.has(page.pageIndex))
        .map((page) =>
          Object.freeze({
            ...page,
            ownerAmbiguous:
              page.ownerAmbiguous === true ||
              livePageTasks.get(page.pageIndex).ownerAmbiguous === true,
          }),
        )
    : requestProvenance.pages;
  return Object.freeze({
    ...requestProvenance,
    pages: Object.freeze(pages),
    error,
    reason: error?.message ?? String(error),
  });
}

function structuredTerminalSettlement(loader, task, error) {
  if (
    (task.type !== "pageGroup" && task.type !== "header") ||
    task.structuredPageWork !== true
  ) {
    return false;
  }
  const requestRecords = task.pageWorkRequestRecords ?? [];
  if (requestRecords.length === 0) {
    return true;
  }
  const operationIdentity = JSON.stringify(
    requestRecords.map((record) => [
      record.pageWorkKey,
      record.recordGeneration,
      record.storageIdentity?.serial,
      record.storageIdentity?.ownerLifecycleGeneration,
      record.storageIdentity?.storageGeneration,
    ]),
  );
  if (task.type === "header") {
    task.structuredTerminalOperationIdentity = operationIdentity;
  }
  const pageTasks = requestRecords
    .map((record) => loader._pageTasks.get(record.pageIndex))
    .filter(
      (pageTask, index) =>
        defined(pageTask) &&
        pageTask.cancelled !== true &&
        pageTask.state !== "complete" &&
        pageTask.pageWorkKey === requestRecords[index].pageWorkKey &&
        pageTask.pageWorkRecordGeneration ===
          requestRecords[index].recordGeneration &&
        pageTask.pageWorkStorageIdentity ===
          requestRecords[index].storageIdentity,
    );
  const records = [];
  const keys = new Set();
  for (const pageTask of pageTasks) {
    if (keys.has(pageTask.pageWorkKey)) {
      continue;
    }
    keys.add(pageTask.pageWorkKey);
    pageTask.state = "failed";
    records.push(
      Object.freeze({
        pageWorkKey: pageTask.pageWorkKey,
        pageIndex: pageTask.page.index,
        recordGeneration: pageTask.pageWorkRecordGeneration,
        storageIdentity: pageTask.pageWorkStorageIdentity,
        contributors: Object.freeze([...(pageTask.contributors ?? [])]),
      }),
    );
  }
  if (records.length === 0) {
    return true;
  }
  loader._pageWorkTerminalSettlements.push(
    Object.freeze({
      taskType: task.type,
      operationIdentity: JSON.stringify([
        task.type,
        task.packIndex ?? task.pageTasks?.[0]?.page.packIndex,
        task.generation,
        operationIdentity,
      ]),
      records: Object.freeze(records),
      error,
      reason: error?.message ?? String(error),
    }),
  );
  return true;
}

/**
 * Strict index and HTTP Range loader for Gaussian Stream scenes.
 *
 * @alias _SceneGISGaussianStreamLoader
 * @constructor
 * @private
 */
function _SceneGISGaussianStreamLoader(options) {
  options = options ?? {};
  if (!defined(options.url)) {
    throw new DeveloperError("options.url is required");
  }
  this._resource = Resource.createIfNeeded(options.url);
  this._requestScheduler = options.requestScheduler ?? RequestScheduler;
  this._fetchFunction = options.fetchFunction ?? defaultFetchFunction;
  if (typeof options.parseIndex !== "function") {
    throw new DeveloperError(
      "options.parseIndex is required and must be a function",
    );
  }
  if (typeof options.packFileName !== "function") {
    throw new DeveloperError(
      "options.packFileName is required and must be a function",
    );
  }
  this._parseIndex = options.parseIndex;
  this._parseIndexManifest = options.parseIndexManifest;
  this._packFileName = options.packFileName;
  this._descriptorProviderFactory = options.descriptorProviderFactory;
  if (typeof this._descriptorProviderFactory !== "function") {
    throw new DeveloperError("descriptorProviderFactory must be a function");
  }
  this._maximumRequests = options.maximumRequests ?? 16;
  this._maximumRequestBytes = options.maximumRequestBytes ?? 64 * 1024 * 1024;
  this._mergeGapBytes = options.mergeGapBytes ?? 4096;
  this._maximumMergedRangeBytes =
    options.maximumMergedRangeBytes ?? 8 * 1024 * 1024;
  this._maximumRetries = options.maximumRetries ?? 2;
  this._retryDelay = options.retryDelay ?? 100;
  this._maximumRawCompletionPagesPerUpdate =
    options._maximumRawCompletionPagesPerUpdate ?? 5;
  if (
    !Number.isSafeInteger(this._maximumRawCompletionPagesPerUpdate) ||
    this._maximumRawCompletionPagesPerUpdate <= 0
  ) {
    throw new DeveloperError(
      "_maximumRawCompletionPagesPerUpdate must be a positive safe integer",
    );
  }
  this._maximumRawCompletionWorkMilliseconds =
    options._maximumRawCompletionWorkMilliseconds;
  if (
    defined(this._maximumRawCompletionWorkMilliseconds) &&
    (!Number.isFinite(this._maximumRawCompletionWorkMilliseconds) ||
      this._maximumRawCompletionWorkMilliseconds < 0)
  ) {
    throw new DeveloperError(
      "_maximumRawCompletionWorkMilliseconds must be finite and nonnegative",
    );
  }
  this._persistentCache = options.persistentCache;
  this._maximumPersistentLookupBatches = 4;
  this._maximumPersistentLookupPages = 32;
  this._maximumPersistentLookupBytes =
    options._maximumPersistentLookupBytes ?? Number.MAX_SAFE_INTEGER;
  if (
    !Number.isSafeInteger(this._maximumPersistentLookupBytes) ||
    this._maximumPersistentLookupBytes <= 0
  ) {
    throw new DeveloperError(
      "_maximumPersistentLookupBytes must be a positive safe integer",
    );
  }
  this._persistentLookupTimeoutMs = options._persistentLookupTimeoutMs ?? 250;
  this._activePersistentLookups = new Set();
  this._activePersistentLookupBytes = 0;
  this._persistentLookupGeneration = 0;
  this._state = STATE.UNLOADED;
  this._index = undefined;
  this._descriptorProvider = undefined;
  this._indexManifest = undefined;
  this._error = undefined;
  this._terminalFailure = undefined;
  this._indexTask = undefined;
  this._packHeaders = new Map();
  this._headerTasks = new Map();
  this._pageTasks = new Map();
  this._structuredPageTasksByPack = new Map();
  this._activeTasks = new Set();
  this._activeBytes = 0;
  this._completed = [];
  this._rawCompletionBatches = [];
  this._rawCompletionPageCount = 0;
  this._pageWorkGeneration = 0;
  this._pageWorkRecordSerial = 0;
  this._pageWorkStorageIdentity = undefined;
  this._pageWorkRecords = new Map();
  this._pageWorkKeyByPage = new Map();
  this._pageWorkTerminalSettlements = [];
  this._sequence = 0;
  this._generation = 0;
  this._statistics = createStatistics();
  this._isDestroyed = false;
}

Object.defineProperties(_SceneGISGaussianStreamLoader.prototype, {
  state: {
    get: function () {
      return this._state;
    },
  },
  index: {
    get: function () {
      return this._index;
    },
  },
  error: {
    get: function () {
      return this._error;
    },
  },
  terminalFailure: {
    get: function () {
      return this._terminalFailure;
    },
  },
  statistics: {
    get: function () {
      return { ...this._statistics };
    },
  },
  activeRequestCount: {
    get: function () {
      return this._activeTasks.size;
    },
  },
  queuedPageCount: {
    get: function () {
      let count = 0;
      for (const task of this._pageTasks.values()) {
        if (task.state === "queued" || task.state === "persistent-queued") {
          count++;
        }
      }
      return count;
    },
  },
  pageDemandGeneration: {
    get: function () {
      return this._pageWorkGeneration;
    },
  },
});

_SceneGISGaussianStreamLoader.prototype.getPageRequestState = function (
  pageIndex,
) {
  const task = this._pageTasks.get(pageIndex);
  if (!defined(task)) {
    return undefined;
  }
  return {
    state: task.state,
    generation: task.generation,
    cancelled: task.cancelled === true,
    priorityClass: task.priorityClass,
  };
};

_SceneGISGaussianStreamLoader.prototype.setPersistentCache = function (
  persistentCache,
) {
  if (this._isDestroyed) {
    return;
  }
  this._persistentCache = persistentCache;
};

function freezePageWorkRecord(loader, record) {
  const canonicalPage = descriptorProvider(loader)?.readPageRequest(
    record?.pageIndex,
  );
  if (
    !defined(record) ||
    typeof record.key !== "string" ||
    record.key.length === 0 ||
    !Number.isSafeInteger(record.pageIndex) ||
    record.pageIndex < 0 ||
    !defined(canonicalPage) ||
    !Array.isArray(record.contributors) ||
    record.contributors.length === 0
  ) {
    throw new DeveloperError("Structured PageWork record is invalid");
  }
  const tokens = new Set();
  let previousContributor;
  for (const contributor of record.contributors) {
    if (
      !defined(contributor) ||
      typeof contributor.token !== "string" ||
      contributor.token.length === 0 ||
      !["acquisition-core", "active-sh"].includes(contributor.kind) ||
      !Number.isSafeInteger(contributor.desiredEntryGeneration) ||
      contributor.desiredEntryGeneration < 1 ||
      tokens.has(contributor.token)
    ) {
      throw new DeveloperError("Structured PageWork contributor is invalid");
    }
    if (
      (contributor.kind === "acquisition-core" &&
        (typeof contributor.tileKey !== "string" ||
          typeof contributor.workIntentIdentity !== "string" ||
          !Number.isSafeInteger(contributor.retryOrdinal) ||
          contributor.retryOrdinal < 0 ||
          contributor.token !==
            `acquisition:${contributor.workIntentIdentity}:${contributor.retryOrdinal}`)) ||
      (contributor.kind === "active-sh" &&
        (!Number.isSafeInteger(contributor.activeStateGeneration) ||
          contributor.activeStateGeneration < 1 ||
          typeof contributor.activeTileKey !== "string" ||
          typeof contributor.mappingPhysicalIdentity !== "string" ||
          contributor.token !==
            `active-sh:${contributor.mappingPhysicalIdentity}:${record.pageIndex}`))
    ) {
      throw new DeveloperError("Structured PageWork contributor is stale");
    }
    validateGaussianStreamWorkPriority(contributor.priority);
    if (
      defined(previousContributor) &&
      (compareGaussianStreamWorkPriority(
        previousContributor.priority,
        contributor.priority,
      ) > 0 ||
        (compareGaussianStreamWorkPriority(
          previousContributor.priority,
          contributor.priority,
        ) === 0 &&
          previousContributor.token.localeCompare(contributor.token) > 0))
    ) {
      throw new DeveloperError("Structured PageWork batch is not canonical");
    }
    tokens.add(contributor.token);
    previousContributor = contributor;
  }
  const page = canonicalPage;
  if (
    defined(record.page) &&
    (record.page.index !== page.index ||
      record.page.packIndex !== page.packIndex ||
      record.page.offset !== page.offset ||
      record.page.storedBytes !== page.storedBytes)
  ) {
    throw new DeveloperError("Structured PageWork Page identity is stale");
  }
  if (
    record.priority !== record.contributors[0].priority ||
    !Object.isFrozen(record) ||
    !Object.isFrozen(record.contributors)
  ) {
    throw new DeveloperError("Structured PageWork batch is not canonical");
  }
  return record;
}

function sameContributorIdentity(left, right) {
  if (left.contributors.length !== right.contributors.length) {
    return false;
  }
  return left.contributors.every(
    (contributor, index) =>
      contributor.token === right.contributors[index].token,
  );
}

function structuredRequestRecord(task) {
  return Object.freeze({
    pageIndex: task.page.index,
    pageWorkKey: task.pageWorkKey,
    recordGeneration: task.pageWorkRecordGeneration,
    storageIdentity: task.pageWorkStorageIdentity,
  });
}

function indexStructuredPageTask(loader, task) {
  if (!defined(task?.pageWorkKey)) {
    return;
  }
  let tasks = loader._structuredPageTasksByPack.get(task.page.packIndex);
  if (!defined(tasks)) {
    tasks = new Set();
    loader._structuredPageTasksByPack.set(task.page.packIndex, tasks);
  }
  tasks.add(task);
}

function unindexStructuredPageTask(loader, task) {
  if (!defined(task?.pageWorkKey)) {
    return;
  }
  const tasks = loader._structuredPageTasksByPack.get(task.page.packIndex);
  tasks?.delete(task);
  if (tasks?.size === 0) {
    loader._structuredPageTasksByPack.delete(task.page.packIndex);
  }
}

function structuredHeaderOperationIdentity(loader, packIndex) {
  return JSON.stringify(
    [...(loader._structuredPageTasksByPack.get(packIndex) ?? [])]
      .filter((task) => task.cancelled !== true && defined(task.pageWorkKey))
      .map(structuredRequestRecord)
      .sort((left, right) => left.pageIndex - right.pageIndex)
      .map((record) => [
        record.pageWorkKey,
        record.recordGeneration,
        record.storageIdentity?.serial,
        record.storageIdentity?.ownerLifecycleGeneration,
        record.storageIdentity?.storageGeneration,
      ]),
  );
}

function updateStructuredTaskPriorities(
  loader,
  affectedPackIndices,
  affectedGroups,
) {
  for (const packIndex of affectedPackIndices) {
    const headerTask = loader._headerTasks.get(packIndex);
    if (!defined(headerTask)) {
      continue;
    }
    const pageTasks = [
      ...(loader._structuredPageTasksByPack.get(packIndex) ?? []),
    ].filter((task) => task.cancelled !== true && defined(task.workPriority));
    if (pageTasks.length === 0) {
      continue;
    }
    pageTasks.sort((left, right) =>
      compareGaussianStreamWorkPriority(left.workPriority, right.workPriority),
    );
    headerTask.workPriority = pageTasks[0].workPriority;
    headerTask.priority = gaussianStreamRequestPriority(
      headerTask.workPriority,
    );
    headerTask.structuredPageWork = true;
  }
  for (const groupTask of affectedGroups) {
    const pageTasks = groupTask.pageTasks
      .filter((task) => task.cancelled !== true && defined(task.workPriority))
      .sort((left, right) =>
        compareGaussianStreamWorkPriority(
          left.workPriority,
          right.workPriority,
        ),
      );
    if (pageTasks.length > 0) {
      groupTask.workPriority = pageTasks[0].workPriority;
      groupTask.priority = gaussianStreamRequestPriority(
        groupTask.workPriority,
      );
    }
  }
}

_SceneGISGaussianStreamLoader.prototype.applyPageDemandDelta = function (
  options,
) {
  const { generation, storageIdentity, deltas } = options;
  if (!defined(this._index)) {
    throw new DeveloperError("Cannot apply PageWork before index load");
  }
  if (
    !Number.isSafeInteger(generation) ||
    generation <= this._pageWorkGeneration ||
    !defined(storageIdentity) ||
    !Array.isArray(deltas)
  ) {
    throw new DeveloperError("Structured PageDemand delta is invalid");
  }
  const deltaByPage = new Map();
  for (const delta of deltas) {
    if (
      !defined(delta) ||
      !Number.isSafeInteger(delta.pageIndex) ||
      delta.pageIndex < 0 ||
      deltaByPage.has(delta.pageIndex)
    ) {
      throw new DeveloperError("Structured PageDemand delta is duplicated");
    }
    const record = defined(delta.record)
      ? freezePageWorkRecord(this, delta.record)
      : undefined;
    if (defined(record) && record.pageIndex !== delta.pageIndex) {
      throw new DeveloperError("Structured PageDemand Page is stale");
    }
    const task = this._pageTasks.get(delta.pageIndex);
    if (defined(record) && defined(task) && !defined(task.pageWorkKey)) {
      throw new DeveloperError("Structured PageWork Page is already owned");
    }
    deltaByPage.set(delta.pageIndex, record);
  }
  const storageChanged = this._pageWorkStorageIdentity !== storageIdentity;
  const affectedPackIndices = new Set();
  const affectedGroups = new Set();
  if (storageChanged) {
    for (const prior of this._pageWorkRecords.values()) {
      if (!deltaByPage.has(prior.pageIndex)) {
        deltaByPage.set(prior.pageIndex, undefined);
      }
    }
  }
  const replacementTasks = new Map();
  for (const [pageIndex, record] of deltaByPage) {
    const priorKey = this._pageWorkKeyByPage.get(pageIndex);
    const prior = this._pageWorkRecords.get(priorKey);
    const key = record?.key;
    const task = this._pageTasks.get(pageIndex);
    affectedPackIndices.add((record ?? prior)?.page.packIndex);
    if (defined(task?.groupTask)) {
      affectedGroups.add(task.groupTask);
    }
    if (!defined(record)) {
      continue;
    }
    const replacing =
      defined(task) &&
      (task.pageWorkKey !== key ||
        task.pageWorkStorageIdentity !== storageIdentity);
    const rearm =
      task?.state === "failed" &&
      defined(prior) &&
      !sameContributorIdentity(prior, record);
    if (!defined(task) || replacing || (task.state === "failed" && rearm)) {
      const persistentLookup = this._persistentCache?.enabled === true;
      const nextTask = {
        type: "page",
        page: record.page,
        priority: gaussianStreamRequestPriority(record.priority),
        workPriority: record.priority,
        priorityClass: "structured-page-work",
        pageWorkKey: key,
        pageWorkRecordGeneration: ++this._pageWorkRecordSerial,
        pageWorkStorageIdentity: storageIdentity,
        contributors: record.contributors,
        sequence: this._sequence++,
        state: persistentLookup ? "persistent-queued" : "queued",
        attempts: 0,
        generation: this._generation,
        readyAt: 0,
        cancelled: false,
      };
      replacementTasks.set(pageIndex, nextTask);
    } else if (task.state !== "failed") {
      task.cancelled = false;
      task.workPriority = record.priority;
      task.priority = gaussianStreamRequestPriority(record.priority);
      task.contributors = record.contributors;
      task.pageWorkStorageIdentity = storageIdentity;
    }
  }
  for (const [pageIndex, nextRecord] of deltaByPage) {
    const priorKey = this._pageWorkKeyByPage.get(pageIndex);
    const prior = this._pageWorkRecords.get(priorKey);
    if (!defined(prior)) {
      continue;
    }
    const key = prior.key;
    if (defined(nextRecord) && nextRecord.key === key) {
      continue;
    }
    const task = this._pageTasks.get(prior.pageIndex);
    if (task?.pageWorkKey !== key) {
      continue;
    }
    task.cancelled = true;
    if (
      task.state === "queued" ||
      task.state === "persistent-queued" ||
      task.state === "failed"
    ) {
      if (!replacementTasks.has(prior.pageIndex)) {
        unindexStructuredPageTask(this, task);
        this._pageTasks.delete(prior.pageIndex);
      }
    } else if (
      defined(task.groupTask) &&
      task.groupTask.pageTasks.every((pageTask) => pageTask.cancelled)
    ) {
      task.groupTask.cancelled = true;
      task.groupTask.request?.cancel();
      this._statistics.cancelledRequests++;
      this._statistics.cancelledBytes += task.groupTask.byteLength;
    }
  }
  for (const [pageIndex, replacement] of replacementTasks) {
    const priorTask = this._pageTasks.get(pageIndex);
    if (defined(priorTask) && priorTask !== replacement) {
      priorTask.cancelled = true;
      priorTask.request?.cancel();
      unindexStructuredPageTask(this, priorTask);
    }
  }
  for (const [pageIndex, task] of replacementTasks) {
    this._pageTasks.set(pageIndex, task);
    indexStructuredPageTask(this, task);
    if (defined(task.groupTask)) {
      affectedGroups.add(task.groupTask);
    }
  }
  for (const packIndex of affectedPackIndices) {
    let bestTask;
    for (const task of this._structuredPageTasksByPack.get(packIndex) ?? []) {
      if (
        task.cancelled === true ||
        !defined(task.pageWorkKey) ||
        task.state === "persistent-queued"
      ) {
        continue;
      }
      if (
        !defined(bestTask) ||
        compareGaussianStreamWorkPriority(
          task.workPriority,
          bestTask.workPriority,
        ) < 0
      ) {
        bestTask = task;
      }
    }
    if (defined(bestTask)) {
      this._ensurePackHeader(
        packIndex,
        bestTask.priority,
        bestTask.workPriority,
      );
    }
  }
  for (const [pageIndex, record] of deltaByPage) {
    const priorKey = this._pageWorkKeyByPage.get(pageIndex);
    if (defined(priorKey)) {
      this._pageWorkRecords.delete(priorKey);
      this._pageWorkKeyByPage.delete(pageIndex);
    }
    if (!defined(record)) {
      continue;
    }
    const key = record.key;
    const task = this._pageTasks.get(record.pageIndex);
    if (
      !defined(task) ||
      task.pageWorkKey !== key ||
      task.pageWorkStorageIdentity !== storageIdentity
    ) {
      throw new DeveloperError("Structured PageWork application is incomplete");
    }
    this._pageWorkRecords.set(
      key,
      Object.freeze({
        ...record,
        recordGeneration: task.pageWorkRecordGeneration,
        storageIdentity,
      }),
    );
    this._pageWorkKeyByPage.set(pageIndex, key);
  }
  this._pageWorkStorageIdentity = storageIdentity;
  this._pageWorkGeneration = generation;
  updateStructuredTaskPriorities(this, affectedPackIndices, affectedGroups);
  return Object.freeze({ generation, storageIdentity });
};

_SceneGISGaussianStreamLoader.prototype.drainPageWorkSettlements = function () {
  const settlements = this._pageWorkTerminalSettlements;
  this._pageWorkTerminalSettlements = [];
  return settlements;
};

_SceneGISGaussianStreamLoader.prototype._derivedResource = function (fileName) {
  return this._resource.getDerivedResource({ url: fileName });
};

_SceneGISGaussianStreamLoader.prototype._createRequest = function (
  task,
  resource,
  start,
  end,
) {
  const loader = this;
  const request = new Request({
    url: resource.url,
    priority: task.priority,
    priorityFunction: function () {
      return task.priority;
    },
    throttle: true,
    throttleByServer: true,
    type: RequestType.OTHER,
  });
  request.requestFunction = function () {
    const controller = new AbortController();
    request.cancelFunction = function () {
      controller.abort();
    };
    const headers = { ...resource.headers };
    if (defined(start)) {
      headers.Range = `bytes=${start}-${end}`;
    }
    return loader._fetchFunction({
      url: resource.url,
      headers,
      signal: controller.signal,
      start,
      end,
      task,
    });
  };
  return request;
};

_SceneGISGaussianStreamLoader.prototype._startTask = function (
  task,
  resource,
  start,
  end,
  handler,
) {
  const request = this._createRequest(task, resource, start, end);
  const promise = this._requestScheduler.request(request);
  if (!defined(promise)) {
    return false;
  }
  task.state = "active";
  task.request = request;
  task.attempts++;
  task.byteLength = defined(start) ? end - start + 1 : 0;
  this._activeTasks.add(task);
  this._activeBytes += task.byteLength;
  const generation = task.generation;
  const requestProvenance = captureRequestProvenance(task, generation);
  Promise.resolve(promise)
    .then(
      function (response) {
        if (
          task.cancelled ||
          generation !== task.generation ||
          this._isDestroyed
        ) {
          task.state = "cancelled";
          this._statistics.staleResponses++;
          this._statistics.wastedBytes += responseBytes(response).byteLength;
          return;
        }
        handler.call(this, task, response);
        task.state = "complete";
      }.bind(this),
    )
    .catch(
      function (error) {
        if (
          task.cancelled ||
          this._isDestroyed ||
          error?.name === "AbortError"
        ) {
          task.state = "cancelled";
          return;
        }
        if (task.attempts <= this._maximumRetries) {
          task.state = "queued";
          task.readyAt = performance.now() + this._retryDelay * task.attempts;
          this._statistics.retries++;
          return;
        }
        task.state = "failed";
        this._statistics.failures++;
        if (structuredTerminalSettlement(this, task, error)) {
          return;
        }
        if (!defined(this._error)) {
          this._error = error;
          this._terminalFailure = terminalFailureProvenance(
            requestProvenance,
            task,
            error,
          );
        }
      }.bind(this),
    )
    .finally(
      function () {
        this._activeTasks.delete(task);
        this._activeBytes -= task.byteLength;
        task.request = undefined;
      }.bind(this),
    );
  return true;
};

_SceneGISGaussianStreamLoader.prototype.loadIndex = function () {
  if (this._state !== STATE.UNLOADED) {
    return;
  }
  const task = {
    type: "index",
    priority: -Number.MAX_VALUE,
    sequence: this._sequence++,
    state: "queued",
    attempts: 0,
    generation: this._generation,
    readyAt: 0,
  };
  this._indexTask = task;
  this._state = STATE.INDEX_LOADING;
  this._statistics.indexRequests++;
};

_SceneGISGaussianStreamLoader.prototype._startIndex = function (now) {
  const task = this._indexTask;
  if (!defined(task) || task.state !== "queued" || task.readyAt > now) {
    return;
  }
  this._startTask(
    task,
    task.resource ?? this._resource,
    undefined,
    undefined,
    function (_task, response) {
      const bytes = responseBytes(response);
      if (response.status < 200 || response.status >= 300) {
        throw new RuntimeError(
          `Runtime index request failed with HTTP ${response.status}.`,
        );
      }
      this._statistics.receivedBytes += bytes.byteLength;
      this._statistics.requestedBytes += bytes.byteLength;
      if (
        typeof this._parseIndexManifest === "function" &&
        !defined(this._indexManifest)
      ) {
        this._indexManifest = this._parseIndexManifest(bytes);
        this._indexTask = {
          type: "index",
          priority: -Number.MAX_VALUE,
          sequence: this._sequence++,
          state: "queued",
          attempts: 0,
          generation: this._generation,
          readyAt: 0,
          resource: this._resource.getDerivedResource({
            url: this._indexManifest.index.url,
          }),
        };
        this._statistics.indexRequests++;
        return;
      }
      this._index = this._parseIndex(bytes, this._indexManifest?.index);
      descriptorProvider(this);
      this._state = STATE.STREAMING;
    },
  );
};

_SceneGISGaussianStreamLoader.prototype._ensurePackHeader = function (
  packIndex,
  priority,
  workPriority,
) {
  if (this._packHeaders.has(packIndex)) {
    return;
  }
  const existing = this._headerTasks.get(packIndex);
  if (defined(existing)) {
    if (defined(workPriority)) {
      existing.workPriority = defined(existing.workPriority)
        ? compareGaussianStreamWorkPriority(
            workPriority,
            existing.workPriority,
          ) < 0
          ? workPriority
          : existing.workPriority
        : workPriority;
      existing.structuredPageWork = true;
      existing.priority = gaussianStreamRequestPriority(existing.workPriority);
    } else {
      existing.priority = Math.min(existing.priority, priority);
    }
    if (existing.state === "failed" && existing.structuredPageWork === true) {
      const desiredIdentity = structuredHeaderOperationIdentity(
        this,
        packIndex,
      );
      if (desiredIdentity !== existing.structuredTerminalOperationIdentity) {
        existing.state = "queued";
        existing.attempts = 0;
        existing.readyAt = 0;
        existing.generation = this._generation;
      }
    }
    return;
  }
  this._headerTasks.set(packIndex, {
    type: "header",
    packIndex,
    priority: defined(workPriority)
      ? gaussianStreamRequestPriority(workPriority)
      : priority,
    sequence: this._sequence++,
    state: "queued",
    attempts: 0,
    generation: this._generation,
    readyAt: 0,
    workPriority,
    structuredPageWork: defined(workPriority),
  });
};

_SceneGISGaussianStreamLoader.prototype.enqueuePages = function (
  pages,
  options,
) {
  if (!defined(this._index)) {
    throw new DeveloperError(
      "Cannot enqueue pages before the runtime index is loaded",
    );
  }
  options = options ?? {};
  const generation = options.generation ?? this._generation;
  const priority = options.priority ?? 0;
  const priorityClass = options.priorityClass ?? "visible-core";
  const operationOwnerIdentity = options.operationOwnerIdentity;
  if (
    defined(operationOwnerIdentity) &&
    (typeof operationOwnerIdentity !== "string" ||
      operationOwnerIdentity.length === 0)
  ) {
    throw new DeveloperError(
      "operationOwnerIdentity must be a nonempty string",
    );
  }
  for (const pageOrIndex of pages) {
    const page =
      typeof pageOrIndex === "number"
        ? descriptorProvider(this).readPageRequest(pageOrIndex)
        : pageOrIndex;
    if (!defined(page)) {
      throw new DeveloperError("enqueuePages contains an unknown page");
    }
    const existing = this._pageTasks.get(page.index);
    if (defined(existing) && existing.state !== "failed") {
      existing.priority = Math.min(existing.priority, priority);
      existing.generation = Math.max(existing.generation, generation);
      existing.cancelled = false;
      if (existing.operationOwnerIdentity !== operationOwnerIdentity) {
        existing.operationOwnerIdentity = undefined;
        existing.ownerAmbiguous = true;
      }
      continue;
    }
    const persistentLookup = this._persistentCache?.enabled === true;
    this._pageTasks.set(page.index, {
      type: "page",
      page,
      priority,
      priorityClass,
      operationOwnerIdentity,
      ownerAmbiguous: false,
      sequence: this._sequence++,
      state: persistentLookup ? "persistent-queued" : "queued",
      attempts: 0,
      generation,
      readyAt: 0,
      cancelled: false,
    });
    if (!persistentLookup) {
      this._ensurePackHeader(page.packIndex, priority - 0.5);
    }
  }
};

_SceneGISGaussianStreamLoader.prototype.cancelUndesired = function (
  desiredPageIndices,
  generation,
) {
  this._generation = Math.max(
    this._generation,
    generation ?? this._generation + 1,
  );
  const affectedGroups = new Set();
  for (const [pageIndex, task] of this._pageTasks) {
    if (desiredPageIndices.has(pageIndex) || task.state === "complete") {
      continue;
    }
    task.cancelled = true;
    task.generation = this._generation;
    if (defined(task.groupTask)) {
      affectedGroups.add(task.groupTask);
    }
    if (task.state === "queued" || task.state === "persistent-queued") {
      unindexStructuredPageTask(this, task);
      this._pageTasks.delete(pageIndex);
    }
  }
  for (const group of affectedGroups) {
    if (group.pageTasks.every((task) => task.cancelled)) {
      group.cancelled = true;
      group.request?.cancel();
      this._statistics.cancelledRequests++;
      this._statistics.cancelledBytes += group.byteLength;
    }
  }
};

_SceneGISGaussianStreamLoader.prototype._startPersistentLookups = function () {
  const persistentCache = this._persistentCache;
  if (!defined(persistentCache) || persistentCache.enabled !== true) {
    return;
  }
  if (
    this._activePersistentLookups.size >= this._maximumPersistentLookupBatches
  ) {
    return;
  }
  let maximumBytes = Math.max(
    0,
    persistentCache.maximumStagingBytes - this._activePersistentLookupBytes,
  );
  if (maximumBytes === 0) {
    return;
  }
  const queued = [...this._pageTasks.values()]
    .filter((task) => task.state === "persistent-queued" && !task.cancelled)
    .sort(compareTasks);
  let head = 0;
  while (
    this._activePersistentLookups.size < this._maximumPersistentLookupBatches
  ) {
    const pageTasks = [];
    let byteLength = 0;
    while (head < queued.length) {
      const task = queued[head];
      if (task.state !== "persistent-queued" || task.cancelled) {
        head++;
        continue;
      }
      if (task.page.storedBytes > persistentCache.maximumStagingBytes) {
        head++;
        task.state = "queued";
        this._ensurePackHeader(
          task.page.packIndex,
          task.priority,
          task.workPriority,
        );
        continue;
      }
      if (task.page.storedBytes > maximumBytes) {
        break;
      }
      if (
        pageTasks.length >= this._maximumPersistentLookupPages ||
        byteLength + task.page.storedBytes > maximumBytes ||
        // A Page larger than the batch target may progress alone, provided
        // it still fits the shared staging capacity checked above.
        (pageTasks.length > 0 &&
          byteLength + task.page.storedBytes >
            this._maximumPersistentLookupBytes)
      ) {
        break;
      }
      head++;
      pageTasks.push(task);
      byteLength += task.page.storedBytes;
    }
    if (pageTasks.length === 0) {
      return;
    }
    const lookup = {
      generation: this._persistentLookupGeneration,
      pageTasks,
      requests: pageTasks.map((task) =>
        Object.freeze({
          task,
          generation: task.generation,
          operationOwnerIdentity: task.operationOwnerIdentity,
          ownerAmbiguous: task.ownerAmbiguous === true,
          pageWorkKey: task.pageWorkKey,
          pageWorkRecordGeneration: task.pageWorkRecordGeneration,
          pageWorkStorageIdentity: task.pageWorkStorageIdentity,
        }),
      ),
      state: "active",
    };
    const abortController = new AbortController();
    const absoluteDeadline =
      performance.now() + this._persistentLookupTimeoutMs;
    lookup.abortController = abortController;
    for (const task of pageTasks) {
      task.state = "persistent-active";
      task.persistentLookup = lookup;
    }
    this._activePersistentLookups.add(lookup);
    this._activePersistentLookupBytes += byteLength;
    let settled = false;
    const finish = (
      results,
      useResults,
      disposition = "timeout-or-transient-read-error",
      timedOut = false,
    ) => {
      if (settled) {
        const lateResults = results ?? [];
        if (this._isDestroyed) {
          for (const result of lateResults) {
            result.release?.();
          }
          return;
        }
        this._rawCompletionBatches.push({
          kind: "release",
          lookup: { requests: [] },
          results: lateResults,
          releaseOnly: true,
          usedResults: new Set(),
          cursor: 0,
          releaseCursor: 0,
        });
        this._rawCompletionPageCount += lateResults.length;
        this._statistics.rawPageDepth = this._rawCompletionPageCount;
        return;
      }
      settled = true;
      if (timedOut) {
        this._statistics.persistentLookupTimeouts++;
      }
      clearTimeout(lookup.timeout);
      const retainedResults = results ?? [];
      lookup.state = "raw-complete";
      this._activePersistentLookups.delete(lookup);
      this._activePersistentLookupBytes = Math.max(
        0,
        this._activePersistentLookupBytes - byteLength,
      );
      this._rawCompletionBatches.push({
        kind: "persistent",
        lookup,
        results: retainedResults,
        useResults,
        disposition,
        timedOut,
        usedResults: new Set(),
        cursor: 0,
        releaseCursor: 0,
      });
      this._rawCompletionPageCount += lookup.requests.length;
      this._statistics.rawPageDepth = this._rawCompletionPageCount;
    };
    lookup.timeout = setTimeout(() => {
      const error = new Error("Persistent lookup timed out");
      error.name = "TimeoutError";
      abortController.abort(error);
      finish(undefined, false, "timeout-or-transient-read-error", true);
    }, this._persistentLookupTimeoutMs);
    const baseContext = Object.freeze({
      generation: lookup.generation,
      startedAt: absoluteDeadline - this._persistentLookupTimeoutMs,
      deadline: absoluteDeadline,
      signal: abortController.signal,
    });
    lookup.context =
      persistentCache.createLookupContext?.(
        pageTasks.map((task) =>
          Object.freeze({
            page: task.page,
            pageWorkKey: task.pageWorkKey,
            recordGeneration: task.pageWorkRecordGeneration,
            storageIdentity: task.pageWorkStorageIdentity,
            workPriority: task.workPriority,
          }),
        ),
        baseContext,
      ) ?? baseContext;
    Promise.resolve(
      persistentCache.lookupPages(
        pageTasks.map((task) => task.page),
        lookup.context,
      ),
    ).then(
      (results) =>
        finish(
          results,
          true,
          results?.persistentDisposition ?? "definite-miss-or-corrupt",
        ),
      () => finish(undefined, false, "timeout-or-transient-read-error"),
    );
    maximumBytes = Math.max(
      0,
      persistentCache.maximumStagingBytes - this._activePersistentLookupBytes,
    );
    if (maximumBytes === 0) {
      return;
    }
  }
};

_SceneGISGaussianStreamLoader.prototype._startHeaders = function (now) {
  if (this._activeTasks.size >= this._maximumRequests) {
    return;
  }
  const tasks = [...this._headerTasks.values()]
    .filter(function (task) {
      return task.state === "queued" && task.readyAt <= now;
    })
    .sort(compareTasks);
  for (const task of tasks) {
    if (this._activeTasks.size >= this._maximumRequests) {
      return;
    }
    const provider = descriptorProvider(this);
    const pack = provider.readPackRequest(task.packIndex);
    const resource = this._derivedResource(
      defined(pack.fileName)
        ? pack.fileName
        : provider.packFileName(task.packIndex),
    );
    if (task.structuredPageWork === true) {
      task.pageWorkRequestRecords = Object.freeze(
        [...this._pageTasks.values()]
          .filter(
            (pageTask) =>
              pageTask.cancelled !== true &&
              defined(pageTask.pageWorkKey) &&
              pageTask.page.packIndex === task.packIndex,
          )
          .sort((left, right) => left.page.index - right.page.index)
          .map(structuredRequestRecord),
      );
    }
    const started = this._startTask(
      task,
      resource,
      0,
      GSP_HEADER_BYTES - 1,
      function (_task, response) {
        const bytes = validateRangeResponse(
          response,
          0,
          GSP_HEADER_BYTES - 1,
          pack.fileBytes,
        );
        this._statistics.receivedBytes += bytes.byteLength;
        const header = parsePackHeader(
          bytes,
          pack,
          pack.strictA4 === true ? 0 : provider.gsiChecksum,
        );
        this._packHeaders.set(pack.index, header);
      },
    );
    if (started) {
      this._statistics.packHeaderRequests++;
      this._statistics.requestedBytes += GSP_HEADER_BYTES;
    }
  }
};

_SceneGISGaussianStreamLoader.prototype._pageGroups = function (
  now,
  scheduling,
) {
  const byGroup = new Map();
  let visibleWorkPending = false;
  for (const task of this._pageTasks.values()) {
    if (
      task.cancelled !== true &&
      task.state !== "complete" &&
      task.workPriority?.workClass === GaussianStreamWorkClass.VISIBLE_WORK_CORE
    ) {
      visibleWorkPending = true;
    }
    if (
      task.state !== "queued" ||
      task.cancelled ||
      task.readyAt > now ||
      !this._packHeaders.has(task.page.packIndex)
    ) {
      continue;
    }
    const structuredClass = defined(task.workPriority)
      ? `structured:${task.workPriority.workClass}`
      : task.priorityClass;
    const key = `${task.page.packIndex}:${structuredClass}`;
    let tasks = byGroup.get(key);
    if (!defined(tasks)) {
      tasks = [];
      byGroup.set(key, tasks);
    }
    tasks.push(task);
  }
  if (defined(scheduling)) {
    scheduling.visibleWorkPending = visibleWorkPending;
  }
  const groups = [];
  for (const tasks of byGroup.values()) {
    tasks.sort(function (left, right) {
      return left.page.offset - right.page.offset;
    });
    let group;
    for (const task of tasks) {
      const pageEnd = task.page.offset + task.page.storedBytes - 1;
      if (
        !defined(group) ||
        task.page.offset - group.end - 1 > this._mergeGapBytes ||
        pageEnd - group.start + 1 > this._maximumMergedRangeBytes
      ) {
        group = {
          tasks: [],
          packIndex: task.page.packIndex,
          start: task.page.offset,
          end: pageEnd,
          priority: task.priority,
          sequence: task.sequence,
          workPriority: task.workPriority,
        };
        groups.push(group);
      }
      group.tasks.push(task);
      group.end = pageEnd;
      group.priority = Math.min(group.priority, task.priority);
      if (
        defined(task.workPriority) &&
        (!defined(group.workPriority) ||
          compareGaussianStreamWorkPriority(
            task.workPriority,
            group.workPriority,
          ) < 0)
      ) {
        group.workPriority = task.workPriority;
      }
      group.sequence = Math.min(group.sequence, task.sequence);
    }
  }
  groups.sort(compareTasks);
  return groups;
};

_SceneGISGaussianStreamLoader.prototype._startPageGroups = function (now) {
  if (
    this._activeTasks.size >= this._maximumRequests ||
    this._packHeaders.size === 0
  ) {
    return;
  }
  const scheduling = {};
  const groups = this._pageGroups(now, scheduling);
  for (const group of groups) {
    const background =
      group.workPriority?.workClass ===
      GaussianStreamWorkClass.PREFETCH_COARSE_CORE;
    if (
      background &&
      (scheduling.visibleWorkPending || this._activeTasks.size > 0)
    ) {
      break;
    }
    const byteLength = group.end - group.start + 1;
    if (
      this._activeTasks.size >= this._maximumRequests ||
      (this._activeTasks.size > 0 &&
        this._activeBytes + byteLength > this._maximumRequestBytes)
    ) {
      return;
    }
    const provider = descriptorProvider(this);
    const pack = provider.readPackRequest(group.packIndex);
    const resource = this._derivedResource(
      defined(pack.fileName)
        ? pack.fileName
        : provider.packFileName(group.packIndex),
    );
    const task = {
      type: "pageGroup",
      priority: group.priority,
      sequence: group.sequence,
      state: "queued",
      attempts: Math.max(...group.tasks.map((item) => item.attempts)),
      generation: Math.max(...group.tasks.map((item) => item.generation)),
      readyAt: 0,
      cancelled: false,
      pageTasks: group.tasks,
      workPriority: group.workPriority,
      pageWorkRequestRecords: Object.freeze(
        group.tasks
          .filter((item) => defined(item.pageWorkKey))
          .map(structuredRequestRecord),
      ),
      structuredPageWork: group.tasks.every((item) =>
        defined(item.pageWorkKey),
      ),
    };
    const started = this._startTask(
      task,
      resource,
      group.start,
      group.end,
      function (_task, response) {
        const bytes = validateRangeResponse(
          response,
          group.start,
          group.end,
          pack.fileBytes,
        );
        this._statistics.receivedBytes += bytes.byteLength;
        task.rawCompletionPending = true;
        this._rawCompletionBatches.push({
          kind: "http",
          task,
          group,
          bytes,
          etag: headerValue(response.headers, "etag"),
          lastModified: headerValue(response.headers, "last-modified"),
          cursor: 0,
        });
        this._rawCompletionPageCount += group.tasks.length;
        this._statistics.rawPageDepth = this._rawCompletionPageCount;
      },
    );
    if (!started) {
      continue;
    }
    for (const pageTask of group.tasks) {
      pageTask.state = "active";
      pageTask.request = task.request;
      pageTask.groupTask = task;
      pageTask.attempts = task.attempts;
      this._statistics[`${workClassPrefix(pageTask)}HttpRangePages`]++;
    }
    this._statistics.pageRangeRequests++;
    this._statistics.pageRangeRequestedBytes += byteLength;
    if (group.tasks.length > 1) {
      this._statistics.mergedPageRequests++;
    }
    this._statistics.requestedBytes += byteLength;
    task._groupFinally = function () {
      if (task.rawCompletionPending || task.finalized) {
        return;
      }
      task.finalized = true;
      for (const pageTask of group.tasks) {
        pageTask.request = undefined;
        pageTask.groupTask = undefined;
        if (pageTask.cancelled) {
          if (this._pageTasks.get(pageTask.page.index) === pageTask) {
            unindexStructuredPageTask(this, pageTask);
            this._pageTasks.delete(pageTask.page.index);
          }
          continue;
        }
        if (pageTask.state === "active") {
          pageTask.state = task.state === "failed" ? "failed" : "queued";
          pageTask.readyAt = task.readyAt;
          pageTask.attempts = task.attempts;
        }
      }
    };
    const loader = this;
    Promise.resolve().then(function pollGroup() {
      if (task.state === "active") {
        setTimeout(pollGroup, 0);
        return;
      }
      task._groupFinally.call(loader);
    });
  }
};

_SceneGISGaussianStreamLoader.prototype._completeHttpPage = function (
  batch,
  pageTask,
) {
  if (pageTask.cancelled) {
    this._statistics.wastedBytes += pageTask.page.storedBytes;
    return 0;
  }
  const start = pageTask.page.offset - batch.group.start;
  const payload = batch.bytes.slice(start, start + pageTask.page.storedBytes);
  validatePagePayload(pageTask.page, payload);
  pageTask.state = "complete";
  this._completed.push({
    page: pageTask.page,
    payload,
    generation: pageTask.generation,
    etag: batch.etag,
    lastModified: batch.lastModified,
    priorityClass: pageTask.priorityClass,
    workPriority: pageTask.workPriority,
    pageWorkKey: pageTask.pageWorkKey,
    operationOwnerIdentity: pageTask.operationOwnerIdentity,
  });
  this._statistics.completedPages++;
  const disposition = pageTask.persistentWriteDisposition;
  const suppress =
    disposition?.disposition === "suppress" &&
    defined(disposition.cacheAuthority) &&
    disposition.pageIndex === pageTask.page.index &&
    disposition.generation === pageTask.generation &&
    disposition.operationOwnerIdentity === pageTask.operationOwnerIdentity &&
    disposition.ownerAmbiguous === (pageTask.ownerAmbiguous === true);
  const writeOptions = {
    priorityClass: pageTask.priorityClass,
    workPriority: pageTask.workPriority,
    persistentWriteDisposition: suppress ? "suppress" : "write",
    persistentWriteAuthority: disposition?.cacheAuthority,
  };
  const persistentCache = this._persistentCache;
  let writeOutcome;
  if (typeof persistentCache?.enqueueWriteWithOutcome === "function") {
    writeOutcome = persistentCache.enqueueWriteWithOutcome(
      pageTask.page,
      payload,
      writeOptions,
    );
  } else if (typeof persistentCache?.enqueueWrite === "function") {
    const suppressedBefore = persistentCache.statistics?.writeSuppressedPages;
    const writeAccepted = persistentCache.enqueueWrite(
      pageTask.page,
      payload,
      writeOptions,
    );
    const suppressedAfter = persistentCache.statistics?.writeSuppressedPages;
    writeOutcome =
      Number.isSafeInteger(suppressedBefore) &&
      suppressedAfter === suppressedBefore + 1
        ? "suppressed"
        : writeAccepted === true
          ? "queued"
          : "rejected";
  }
  if (suppress && writeOutcome === "suppressed") {
    this._statistics.persistentWriteSuppressions++;
    this._statistics[`${workClassPrefix(pageTask)}WriteSuppressions`]++;
  }
  pageTask.persistentWriteDisposition = undefined;
  return payload.byteLength;
};

_SceneGISGaussianStreamLoader.prototype._completePersistentPage = function (
  batch,
  request,
) {
  const pageTask = request.task;
  pageTask.persistentLookup = undefined;
  const result = batch.useResults
    ? (batch.results ?? []).find(
        (candidate) => candidate.pageIndex === pageTask.page.index,
      )
    : undefined;
  if (defined(result)) {
    batch.usedResults.add(result);
  }
  const live =
    !this._isDestroyed &&
    batch.lookup.generation === this._persistentLookupGeneration;
  if (!live || pageTask.cancelled) {
    if (
      pageTask.cancelled &&
      this._pageTasks.get(pageTask.page.index) === pageTask
    ) {
      unindexStructuredPageTask(this, pageTask);
      this._pageTasks.delete(pageTask.page.index);
    }
    result?.release?.();
    return 0;
  }
  const structuredRequest = defined(request.pageWorkKey);
  const requestIsStale = structuredRequest
    ? pageTask.pageWorkKey !== request.pageWorkKey ||
      pageTask.pageWorkRecordGeneration !== request.pageWorkRecordGeneration ||
      pageTask.pageWorkStorageIdentity !== request.pageWorkStorageIdentity
    : pageTask.generation !== request.generation ||
      pageTask.operationOwnerIdentity !== request.operationOwnerIdentity ||
      (pageTask.ownerAmbiguous === true) !== request.ownerAmbiguous;
  if (requestIsStale) {
    pageTask.persistentWriteDisposition = undefined;
    pageTask.state = "persistent-queued";
    result?.release?.();
    return 0;
  }
  if (defined(result)) {
    try {
      const payload = validatePagePayload(pageTask.page, result.payload);
      pageTask.state = "complete";
      pageTask.persistentWriteDisposition = undefined;
      this._completed.push({
        page: pageTask.page,
        payload,
        generation: pageTask.generation,
        priorityClass: pageTask.priorityClass,
        workPriority: pageTask.workPriority,
        pageWorkKey: pageTask.pageWorkKey,
        operationOwnerIdentity: pageTask.operationOwnerIdentity,
        persistent: true,
        release: result.release,
      });
      this._statistics.completedPages++;
      return payload.byteLength;
    } catch (_error) {
      result.release?.();
    }
  }
  if (batch.disposition === "local-staging-backpressure") {
    this._statistics[
      `${workClassPrefix(pageTask)}PersistentBackpressurePages`
    ]++;
    pageTask.persistentWriteDisposition = undefined;
    pageTask.state = "persistent-queued";
    return 0;
  }
  pageTask.persistentWriteDisposition = Object.freeze({
    disposition:
      batch.disposition === "timeout-or-transient-read-error"
        ? "suppress"
        : "write",
    pageIndex: pageTask.page.index,
    generation: pageTask.generation,
    operationOwnerIdentity: pageTask.operationOwnerIdentity,
    ownerAmbiguous: pageTask.ownerAmbiguous === true,
    cacheAuthority: batch.lookup.context?.persistentWriteAuthority,
  });
  pageTask.state = "queued";
  this._statistics[`${workClassPrefix(pageTask)}HttpFallbackPages`]++;
  if (batch.timedOut) {
    this._statistics[`${workClassPrefix(pageTask)}PersistentTimeoutPages`]++;
  }
  this._ensurePackHeader(
    pageTask.page.packIndex,
    pageTask.priority,
    pageTask.workPriority,
  );
  return 0;
};

_SceneGISGaussianStreamLoader.prototype._expandRawCompletions = function (
  maximumPages,
  maximumBytes,
) {
  let expandedPages = 0;
  let processedCompletions = 0;
  let deliveredBytes = 0;
  const workTimeEnabled = defined(this._maximumRawCompletionWorkMilliseconds);
  // Observe delivery work independently of the optional scheduling time limit.
  const workStarted =
    maximumPages > 0 && this._rawCompletionBatches.length > 0
      ? performance.now()
      : 0;
  const workTimeExhausted = () =>
    workTimeEnabled &&
    processedCompletions > 0 &&
    performance.now() - workStarted >=
      this._maximumRawCompletionWorkMilliseconds;
  let timeLimited = false;
  while (
    expandedPages < maximumPages &&
    this._rawCompletionBatches.length > 0
  ) {
    if (workTimeExhausted()) {
      break;
    }
    const batch = this._rawCompletionBatches[0];
    if (batch.kind === "http") {
      const pageTask = batch.group.tasks[batch.cursor];
      if (
        expandedPages > 0 &&
        deliveredBytes + pageTask.page.storedBytes > maximumBytes
      ) {
        break;
      }
      batch.cursor++;
      expandedPages++;
      processedCompletions++;
      this._rawCompletionPageCount--;
      deliveredBytes += this._completeHttpPage(batch, pageTask);
      if (batch.cursor === batch.group.tasks.length) {
        batch.task.rawCompletionPending = false;
        this._rawCompletionBatches.shift();
        batch.task._groupFinally.call(this);
      }
      continue;
    }
    if (batch.cursor < batch.lookup.requests.length) {
      const request = batch.lookup.requests[batch.cursor];
      if (
        expandedPages > 0 &&
        deliveredBytes + request.task.page.storedBytes > maximumBytes
      ) {
        break;
      }
      batch.cursor++;
      expandedPages++;
      processedCompletions++;
      this._rawCompletionPageCount--;
      deliveredBytes += this._completePersistentPage(batch, request);
      continue;
    }
    while (
      batch.releaseCursor < (batch.results?.length ?? 0) &&
      batch.usedResults.has(batch.results[batch.releaseCursor])
    ) {
      if (workTimeExhausted()) {
        timeLimited = true;
        break;
      }
      batch.releaseCursor++;
      processedCompletions++;
      if (batch.releaseOnly) {
        this._rawCompletionPageCount--;
      }
    }
    if (timeLimited) {
      break;
    }
    if (batch.releaseCursor < (batch.results?.length ?? 0)) {
      batch.results[batch.releaseCursor++].release?.();
      expandedPages++;
      processedCompletions++;
      if (batch.releaseOnly) {
        this._rawCompletionPageCount--;
      }
      continue;
    }
    this._rawCompletionBatches.shift();
  }
  this._statistics.rawPageDepth = this._rawCompletionPageCount;
  this._statistics.deliveredPagesHighWater = Math.max(
    this._statistics.deliveredPagesHighWater,
    expandedPages,
  );
  if (processedCompletions > 0) {
    this._statistics.completionFrames++;
    this._statistics.maximumDeliveryWorkMilliseconds = Math.max(
      this._statistics.maximumDeliveryWorkMilliseconds,
      performance.now() - workStarted,
    );
  }
  return expandedPages;
};

_SceneGISGaussianStreamLoader.prototype.update = function (
  now,
  maximumDeliveryBytes,
) {
  if (this._isDestroyed || this._state === STATE.FAILED) {
    return;
  }
  now = now ?? performance.now();
  if (this._state === STATE.UNLOADED) {
    this.loadIndex();
  }
  if (this._state === STATE.INDEX_LOADING) {
    this._startIndex(now);
    return;
  }
  if (!defined(this._index)) {
    return;
  }
  const expandedPages = this._expandRawCompletions(
    this._maximumRawCompletionPagesPerUpdate,
    maximumDeliveryBytes ?? Number.MAX_SAFE_INTEGER,
  );
  if (expandedPages === 0) {
    this._startPersistentLookups();
  }
  this._startHeaders(now);
  this._startPageGroups(now);
  if (defined(this._error)) {
    this._state = STATE.FAILED;
  }
};

_SceneGISGaussianStreamLoader.prototype.drainCompleted = function () {
  const completed = this._completed.sort(function (left, right) {
    if (defined(left.workPriority) && defined(right.workPriority)) {
      return compareGaussianStreamWorkPriority(
        left.workPriority,
        right.workPriority,
      );
    }
    return 0;
  });
  this._completed = [];
  for (const result of completed) {
    const pageIndex = result.page.index;
    const task = this._pageTasks.get(pageIndex);
    unindexStructuredPageTask(this, task);
    this._pageTasks.delete(pageIndex);
    const pageWorkKey = this._pageWorkKeyByPage.get(pageIndex);
    if (defined(pageWorkKey) && task?.pageWorkKey === pageWorkKey) {
      this._pageWorkRecords.delete(pageWorkKey);
      this._pageWorkKeyByPage.delete(pageIndex);
    }
  }
  return completed;
};

_SceneGISGaussianStreamLoader.prototype.isDestroyed = function () {
  return this._isDestroyed;
};

_SceneGISGaussianStreamLoader.prototype.destroy = function () {
  this._persistentLookupGeneration++;
  for (const task of this._activeTasks) {
    task.cancelled = true;
    task.request?.cancel();
  }
  for (const task of this._pageTasks.values()) {
    task.cancelled = true;
    task.request?.cancel();
  }
  this._activeTasks.clear();
  for (const lookup of this._activePersistentLookups) {
    clearTimeout(lookup.timeout);
    lookup.abortController?.abort();
  }
  this._activePersistentLookups.clear();
  this._activePersistentLookupBytes = 0;
  this._pageTasks.clear();
  this._headerTasks.clear();
  for (const result of this._completed) {
    result.release?.();
  }
  this._completed.length = 0;
  for (const batch of this._rawCompletionBatches) {
    for (const result of batch.results ?? []) {
      if (!batch.usedResults?.has(result)) {
        result.release?.();
      }
    }
  }
  this._rawCompletionBatches.length = 0;
  this._rawCompletionPageCount = 0;
  this._pageWorkRecords.clear();
  this._structuredPageTasksByPack.clear();
  this._pageWorkKeyByPage.clear();
  this._pageWorkTerminalSettlements.length = 0;
  this._pageWorkStorageIdentity = undefined;
  this._error = undefined;
  this._terminalFailure = undefined;
  this._persistentCache = undefined;
  this._state = STATE.DESTROYED;
  this._isDestroyed = true;
  return destroyObject(this);
};

_SceneGISGaussianStreamLoader.State = STATE;

export default _SceneGISGaussianStreamLoader;

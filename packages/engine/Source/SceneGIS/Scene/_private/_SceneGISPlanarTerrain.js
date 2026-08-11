import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import Credit from "../../../Core/Credit.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Event from "../../../Core/Event.js";
import IndexDatatype from "../../../Core/IndexDatatype.js";
import Request from "../../../Core/Request.js";
import RequestType from "../../../Core/RequestType.js";
import TileProviderError from "../../../Core/TileProviderError.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import upsampleSceneGISPlanarTerrain from "../../Core/_private/_SceneGISPlanarTerrainUpsampler.js";
import terrainWorkerScheduler from "../../Core/_private/_SceneGISPlanarTerrainWorkerScheduler.js";
import {
  createSceneGISPlanarTerrainMeshTask,
  finalizeSceneGISPlanarTerrainMesh,
} from "../../Renderer/_private/_SceneGISPlanarTerrainMesh.js";

const State = Object.freeze({
  UNLOADED: 0,
  AVAILABILITY_LOADING: 1,
  LOADING: 2,
  RECEIVED: 3,
  READY: 4,
  UNAVAILABLE: 5,
  FAILED: 6,
});

const FallbackState = Object.freeze({
  NONE: 0,
  QUEUED: 1,
  READY: 2,
  FAILED: 3,
});

const MeshState = Object.freeze({
  NONE: 0,
  LOADING: 1,
  RECEIVED: 2,
  FAILED: 3,
});

const Source = Object.freeze({
  DIRECT: "DIRECT",
  UPSAMPLED: "UPSAMPLED",
  FLAT: "FLAT",
});

function reportProviderError(
  previousError,
  provider,
  event,
  message,
  entry,
  details,
) {
  if (event instanceof Event) {
    return TileProviderError.reportError(
      previousError,
      provider,
      event,
      message,
      entry.x,
      entry.y,
      entry.level,
      details,
    );
  }
  let error = previousError;
  if (!defined(error)) {
    error = new TileProviderError(
      provider,
      message,
      entry.x,
      entry.y,
      entry.level,
      0,
      details,
    );
  } else {
    error.provider = provider;
    error.message = message;
    error.x = entry.x;
    error.y = entry.y;
    error.level = entry.level;
    error.retry = false;
    error.error = details;
    ++error.timesRetried;
  }
  event.raiseEvent(error);
  return error;
}

function validateEvent(errorEvent) {
  return (
    errorEvent instanceof Event ||
    (errorEvent &&
      typeof errorEvent.addEventListener === "function" &&
      typeof errorEvent.raiseEvent === "function")
  );
}

export function validateTerrainProvider(provider, tilingScheme, maximumLevel) {
  if (!provider || provider.tilingScheme !== tilingScheme) {
    throw new DeveloperError(
      "terrainProvider.tilingScheme must be the world's canonical tilingScheme.",
    );
  }
  if (
    !Number.isFinite(provider.minimumHeight) ||
    !Number.isFinite(provider.maximumHeight) ||
    provider.maximumHeight < provider.minimumHeight
  ) {
    throw new DeveloperError(
      "terrainProvider heights must be finite and ordered.",
    );
  }
  const referenceHeight =
    provider.minimumHeight * 0.5 + provider.maximumHeight * 0.5;
  if (
    !Number.isFinite(referenceHeight) ||
    !Number.isFinite(Math.fround(provider.minimumHeight - referenceHeight)) ||
    !Number.isFinite(Math.fround(provider.maximumHeight - referenceHeight))
  ) {
    throw new DeveloperError(
      "terrainProvider relative heights must be representable in Float32.",
    );
  }
  if (
    !Number.isInteger(provider.maximumLevel) ||
    provider.maximumLevel < 0 ||
    provider.maximumLevel > tilingScheme.maximumSafeLevel
  ) {
    throw new DeveloperError(
      "terrainProvider.maximumLevel must be a supported non-negative integer.",
    );
  }
  if (!validateEvent(provider.errorEvent)) {
    throw new DeveloperError(
      "terrainProvider.errorEvent must provide addEventListener and raiseEvent.",
    );
  }
  if (provider.credit !== undefined && !(provider.credit instanceof Credit)) {
    throw new DeveloperError(
      "terrainProvider.credit must be undefined or a Credit.",
    );
  }
  for (const method of [
    "getLevelMaximumGeometricError",
    "requestTileGeometry",
    "getTileDataAvailable",
    "loadTileDataAvailability",
  ]) {
    if (typeof provider[method] !== "function") {
      throw new DeveloperError(`terrainProvider.${method} must be a function.`);
    }
  }

  const geometricErrors = new Array(maximumLevel + 1);
  let previous = Number.POSITIVE_INFINITY;
  let providerError;
  const width = tilingScheme.coordinateSystem.extent.width;
  for (let level = 0; level <= maximumLevel; ++level) {
    if (level <= provider.maximumLevel) {
      providerError = provider.getLevelMaximumGeometricError(level);
      if (
        !Number.isFinite(providerError) ||
        providerError < 0.0 ||
        providerError > previous
      ) {
        throw new DeveloperError(
          "terrainProvider geometric errors must be finite, non-negative, and non-increasing.",
        );
      }
      previous = providerError;
    }
    geometricErrors[level] = Math.max(
      width / (256.0 * 2 ** level),
      providerError,
    );
  }
  return geometricErrors;
}

function createFlatContent(revision) {
  return {
    source: Source.FLAT,
    revision,
    terrainData: undefined,
    mesh: undefined,
    vertexArray: undefined,
  };
}

function createEntry(runtime, tile) {
  const entry = {
    x: tile.x,
    y: tile.y,
    level: tile.level,
    generation: runtime._generation,
    attempt: 0,
    lastAttemptFrame: -1,
    state: State.UNLOADED,
    request: undefined,
    terrainData: undefined,
    mesh: undefined,
    vertexArray: undefined,
    directData: undefined,
    directMeshState: MeshState.NONE,
    directMeshResult: undefined,
    directMeshError: undefined,
    directMeshToken: 0,
    directContent: undefined,
    availabilityAttempted: false,
    availabilityPromise: undefined,
    knownUnavailable: false,
    fallbackState: FallbackState.NONE,
    fallbackContent: undefined,
    fallbackData: undefined,
    fallbackMeshState: MeshState.NONE,
    fallbackMeshResult: undefined,
    fallbackMeshError: undefined,
    fallbackMeshToken: 0,
    fallbackCandidateSourceRevision: -1,
    fallbackSourceRevision: -1,
    fallbackSourceTile: undefined,
    activeContent: undefined,
    activeSource: undefined,
    revision: 0,
  };
  if (tile.level === 0) {
    entry.fallbackState = FallbackState.READY;
    entry.fallbackContent = createFlatContent(++runtime._contentRevision);
    entry.activeContent = entry.fallbackContent;
    entry.activeSource = Source.FLAT;
    entry.revision = entry.activeContent.revision;
  }
  tile.terrainEntry = entry;
  tile._terrainRelease = runtime._releaseTile;
  ++runtime._debug.createdEntries;
  return entry;
}

function isTerminal(entry) {
  return entry.state === State.UNAVAILABLE || entry.state === State.FAILED;
}

function syncLegacyAliases(entry) {
  const content = entry.activeContent;
  entry.terrainData = content?.terrainData;
  entry.mesh = content?.mesh;
  entry.vertexArray = content?.vertexArray;
}

/**
 * Owns planar terrain direct/fallback requests, promotions, and GPU lifecycle.
 *
 * @alias SceneGISPlanarTerrain
 * @constructor
 * @private
 */
function SceneGISPlanarTerrain(forEachTile, getTile, workerScheduler) {
  this._forEachTile = forEachTile;
  this._getTile = getTile;
  this._workerScheduler = workerScheduler ?? terrainWorkerScheduler;
  this._provider = undefined;
  this._geometricErrors = undefined;
  this._generation = 0;
  this._contentRevision = 0;
  this._indexBuffers = new Map();
  this._error = undefined;
  this._tilesLoaded = true;
  this._destroyed = false;
  this._releaseTile = this.releaseTile.bind(this);
  this.State = State;
  this.FallbackState = FallbackState;
  this.MeshState = MeshState;
  this.Source = Source;
  this._debug = {
    createdEntries: 0,
    createdRequests: 0,
    cancelledRequests: 0,
    availabilityAttempts: 0,
    createdUpsampledData: 0,
    createdMeshes: 0,
    createdVertexBuffers: 0,
    destroyedVertexBuffers: 0,
    createdIndexBuffers: 0,
    acquiredIndexReferences: 0,
    releasedIndexReferences: 0,
    createdVertexArrays: 0,
    destroyedVertexArrays: 0,
    destroyedIndexBuffers: 0,
    promotions: 0,
    startedMeshTasks: 0,
    completedMeshTasks: 0,
    staleMeshResults: 0,
  };
}

Object.defineProperties(SceneGISPlanarTerrain.prototype, {
  provider: {
    get: function () {
      return this._provider;
    },
  },
  geometricErrors: {
    get: function () {
      return this._geometricErrors;
    },
  },
  tilesLoaded: {
    get: function () {
      return this._tilesLoaded;
    },
  },
});

SceneGISPlanarTerrain.prototype._releaseIndex = function (key) {
  const shared = this._indexBuffers.get(key);
  if (!shared) {
    return;
  }
  --shared.references;
  ++this._debug.releasedIndexReferences;
  if (shared.references === 0) {
    if (!shared.buffer.isDestroyed()) {
      shared.buffer.destroy();
      ++this._debug.destroyedIndexBuffers;
    }
    this._indexBuffers.delete(key);
  }
};

SceneGISPlanarTerrain.prototype._destroyContent = function (content) {
  if (!content || content.source === Source.FLAT || content.destroyed) {
    return;
  }
  content.destroyed = true;
  if (content.vertexArray && !content.vertexArray.isDestroyed()) {
    content.vertexArray.destroy();
    ++this._debug.destroyedVertexArrays;
    ++this._debug.destroyedVertexBuffers;
  }
  this._releaseIndex(content.indexKey);
  content.vertexArray = undefined;
  content.mesh = undefined;
  content.terrainData = undefined;
};

SceneGISPlanarTerrain.prototype._destroyRemainingIndexBuffers = function () {
  for (const shared of this._indexBuffers.values()) {
    if (!shared.buffer.isDestroyed()) {
      shared.buffer.destroy();
      ++this._debug.destroyedIndexBuffers;
    }
  }
  this._indexBuffers.clear();
};

SceneGISPlanarTerrain.prototype.setProvider = function (
  provider,
  geometricErrors,
) {
  if (provider === this._provider) {
    return;
  }
  ++this._generation;
  this._forEachTile((tile) => this.releaseTile(tile));
  this._destroyRemainingIndexBuffers();
  this._provider = provider;
  this._geometricErrors = geometricErrors;
  this._error = undefined;
  this._tilesLoaded = !defined(provider);
};

SceneGISPlanarTerrain.prototype.releaseTile = function (tile) {
  const entry = tile.terrainEntry;
  if (!entry) {
    return;
  }
  ++entry.attempt;
  ++entry.directMeshToken;
  ++entry.fallbackMeshToken;
  if (entry.request) {
    entry.request.cancel();
    entry.request = undefined;
    ++this._debug.cancelledRequests;
  }
  this._destroyContent(entry.directContent);
  if (entry.fallbackContent !== entry.directContent) {
    this._destroyContent(entry.fallbackContent);
  }
  entry.directContent = undefined;
  entry.directData = undefined;
  entry.directMeshResult = undefined;
  entry.directMeshError = undefined;
  entry.fallbackContent = undefined;
  entry.fallbackData = undefined;
  entry.fallbackMeshResult = undefined;
  entry.fallbackMeshError = undefined;
  entry.activeContent = undefined;
  tile.terrainEntry = undefined;
  tile._terrainRelease = undefined;
  tile.updateHeightRange(0.0, 0.0);
  tile.updateCommandHeightRange(0.0, 0.0);
  tile.updateModelMatrix(0.0);
};

SceneGISPlanarTerrain.prototype._fail = function (entry, attempt, details) {
  if (
    this._destroyed ||
    entry.attempt !== attempt ||
    entry.generation !== this._generation ||
    entry.request?.cancelled
  ) {
    return;
  }
  entry.request = undefined;
  entry.directData = undefined;
  entry.directMeshState = MeshState.NONE;
  entry.directMeshResult = undefined;
  entry.directMeshError = undefined;
  ++entry.directMeshToken;
  entry.state = State.FAILED;
  const provider = this._provider;
  this._error = reportProviderError(
    this._error,
    provider,
    provider.errorEvent,
    `Failed to obtain planar terrain tile X: ${entry.x} Y: ${entry.y} Level: ${entry.level}.`,
    entry,
    details,
  );
  if (this._error.retry) {
    entry.state = State.UNLOADED;
  }
};

SceneGISPlanarTerrain.prototype._markUnavailable = function (entry, rootError) {
  entry.knownUnavailable = true;
  entry.state = State.UNAVAILABLE;
  if (rootError) {
    const provider = this._provider;
    this._error = reportProviderError(
      this._error,
      provider,
      provider.errorEvent,
      "The planar terrain provider must make its Level 0 root available.",
      entry,
      new DeveloperError("Level 0 terrain is unavailable."),
    );
  }
};

SceneGISPlanarTerrain.prototype._request = function (entry) {
  const provider = this._provider;
  const request = new Request({
    throttle: false,
    throttleByServer: true,
    type: RequestType.TERRAIN,
  });
  entry.request = request;
  entry.state = State.LOADING;
  const attempt = ++entry.attempt;
  let promise;
  try {
    promise = provider.requestTileGeometry(
      entry.x,
      entry.y,
      entry.level,
      request,
    );
  } catch (error) {
    this._fail(entry, attempt, error);
    return;
  }
  if (!defined(promise)) {
    entry.request = undefined;
    entry.state = State.UNLOADED;
    return;
  }
  if (typeof promise.then !== "function") {
    this._fail(
      entry,
      attempt,
      new DeveloperError("requestTileGeometry must return a Promise."),
    );
    return;
  }
  ++this._debug.createdRequests;
  Promise.resolve(promise).then(
    (terrainData) => {
      if (
        this._destroyed ||
        entry.attempt !== attempt ||
        entry.generation !== this._generation
      ) {
        return;
      }
      entry.request = undefined;
      entry.directData = terrainData;
      entry.directMeshState = MeshState.NONE;
      entry.directMeshResult = undefined;
      entry.directMeshError = undefined;
      entry.state = State.RECEIVED;
      TileProviderError.reportSuccess(this._error);
    },
    (error) => this._fail(entry, attempt, error),
  );
};

SceneGISPlanarTerrain.prototype._advanceDirect = function (entry, frameNumber) {
  if (
    entry.state !== State.UNLOADED ||
    entry.lastAttemptFrame === frameNumber
  ) {
    return;
  }
  entry.lastAttemptFrame = frameNumber;
  const provider = this._provider;
  if (entry.level > provider.maximumLevel) {
    this._markUnavailable(entry, false);
    return;
  }
  let available;
  try {
    available = provider.getTileDataAvailable(entry.x, entry.y, entry.level);
  } catch (error) {
    this._fail(entry, entry.attempt, error);
    return;
  }
  if (available === false) {
    this._markUnavailable(entry, entry.level === 0);
    return;
  }
  if (available === undefined && entry.level > 0) {
    const parent = this._getTile(
      Math.floor(entry.x / 2),
      Math.floor(entry.y / 2),
      entry.level - 1,
    );
    const parentData = parent.terrainEntry?.directData;
    if (defined(parentData) && !parentData.wasCreatedByUpsampling) {
      try {
        if (
          !parentData.isChildAvailable(parent.x, parent.y, entry.x, entry.y)
        ) {
          this._markUnavailable(entry, false);
          return;
        }
        available = true;
      } catch (error) {
        this._fail(entry, entry.attempt, error);
        return;
      }
    }
  }
  if (available === undefined && !entry.availabilityAttempted) {
    entry.availabilityAttempted = true;
    ++this._debug.availabilityAttempts;
    let availabilityPromise;
    try {
      availabilityPromise = provider.loadTileDataAvailability(
        entry.x,
        entry.y,
        entry.level,
      );
    } catch (error) {
      this._fail(entry, entry.attempt, error);
      return;
    }
    if (defined(availabilityPromise)) {
      if (typeof availabilityPromise.then !== "function") {
        this._fail(
          entry,
          entry.attempt,
          new DeveloperError("loadTileDataAvailability must return a Promise."),
        );
        return;
      }
      const attempt = entry.attempt;
      entry.state = State.AVAILABILITY_LOADING;
      entry.availabilityPromise = availabilityPromise;
      Promise.resolve(availabilityPromise).then(
        () => {
          if (
            this._destroyed ||
            entry.generation !== this._generation ||
            entry.attempt !== attempt
          ) {
            return;
          }
          entry.availabilityPromise = undefined;
          entry.state = State.UNLOADED;
          entry.lastAttemptFrame = -1;
        },
        (error) => this._fail(entry, attempt, error),
      );
      return;
    }
  }
  this._request(entry);
};

SceneGISPlanarTerrain.prototype._startMeshTask = function (
  tile,
  entry,
  terrainData,
  fallback,
  sourceRevision,
) {
  const stateName = fallback ? "fallbackMeshState" : "directMeshState";
  if (entry[stateName] !== MeshState.NONE) {
    return false;
  }
  let task;
  try {
    task = createSceneGISPlanarTerrainMeshTask(
      terrainData,
      tile.extent,
      this._geometricErrors[tile.level],
      this._provider.minimumHeight,
    );
  } catch (error) {
    entry[fallback ? "fallbackMeshError" : "directMeshError"] = error;
    entry[stateName] = MeshState.FAILED;
    return false;
  }
  let promise;
  try {
    promise = this._workerScheduler.scheduleCreateHeightmapMesh(
      task.parameters,
      task.transferableObjects,
    );
  } catch (error) {
    entry[fallback ? "fallbackMeshError" : "directMeshError"] = error;
    entry[stateName] = MeshState.FAILED;
    return false;
  }
  if (!defined(promise)) {
    return false;
  }
  if (typeof promise.then !== "function") {
    entry[fallback ? "fallbackMeshError" : "directMeshError"] =
      new DeveloperError("The planar terrain mesh task must return a Promise.");
    entry[stateName] = MeshState.FAILED;
    return false;
  }

  const tokenName = fallback ? "fallbackMeshToken" : "directMeshToken";
  const resultName = fallback ? "fallbackMeshResult" : "directMeshResult";
  const errorName = fallback ? "fallbackMeshError" : "directMeshError";
  const token = ++entry[tokenName];
  const generation = this._generation;
  entry[stateName] = MeshState.LOADING;
  ++this._debug.startedMeshTasks;
  Promise.resolve(promise).then(
    (result) => {
      const currentData = fallback ? entry.fallbackData : entry.directData;
      const stale =
        this._destroyed ||
        tile.terrainEntry !== entry ||
        entry.generation !== generation ||
        entry[tokenName] !== token ||
        currentData !== terrainData ||
        (fallback && entry.fallbackCandidateSourceRevision !== sourceRevision);
      if (stale) {
        ++this._debug.staleMeshResults;
        return;
      }
      entry[resultName] = result;
      entry[errorName] = undefined;
      entry[stateName] = MeshState.RECEIVED;
      ++this._debug.completedMeshTasks;
    },
    (error) => {
      if (
        this._destroyed ||
        tile.terrainEntry !== entry ||
        entry.generation !== generation ||
        entry[tokenName] !== token
      ) {
        ++this._debug.staleMeshResults;
        return;
      }
      entry[resultName] = undefined;
      entry[errorName] = error;
      entry[stateName] = MeshState.FAILED;
    },
  );
  return true;
};

SceneGISPlanarTerrain.prototype._startDirectMeshTask = function (tile, entry) {
  if (
    entry.state !== State.RECEIVED ||
    entry.directMeshState !== MeshState.NONE
  ) {
    return false;
  }
  return this._startMeshTask(tile, entry, entry.directData, false, -1);
};

SceneGISPlanarTerrain.prototype._startFallbackMeshTask = function (
  tile,
  entry,
) {
  if (
    entry.state === State.READY ||
    entry.state === State.RECEIVED ||
    entry.fallbackState !== FallbackState.QUEUED
  ) {
    return false;
  }
  const sourceTile = entry.fallbackSourceTile;
  const sourceEntry = sourceTile?.terrainEntry;
  const sourceContent = sourceEntry?.activeContent;
  if (!sourceContent?.terrainData) {
    entry.fallbackState = FallbackState.NONE;
    entry.fallbackSourceTile = undefined;
    return false;
  }
  const sourceRevision = sourceEntry.revision;
  if (entry.fallbackCandidateSourceRevision !== sourceRevision) {
    ++entry.fallbackMeshToken;
    entry.fallbackData = undefined;
    entry.fallbackMeshResult = undefined;
    entry.fallbackMeshError = undefined;
    entry.fallbackMeshState = MeshState.NONE;
    entry.fallbackCandidateSourceRevision = sourceRevision;
  }
  if (!defined(entry.fallbackData)) {
    try {
      entry.fallbackData = upsampleSceneGISPlanarTerrain(
        sourceContent.terrainData,
        sourceTile.extent,
        sourceTile,
        tile.extent,
        tile,
      );
      ++this._debug.createdUpsampledData;
    } catch (error) {
      entry.fallbackMeshError = error;
      entry.fallbackMeshState = MeshState.FAILED;
      return false;
    }
  }
  return this._startMeshTask(
    tile,
    entry,
    entry.fallbackData,
    true,
    sourceRevision,
  );
};

SceneGISPlanarTerrain.prototype._consumeMeshFailure = function (entry) {
  if (entry.directMeshState === MeshState.FAILED) {
    const error = entry.directMeshError;
    entry.directMeshState = MeshState.NONE;
    entry.directMeshError = undefined;
    this._fail(entry, entry.attempt, error);
  }
  if (entry.fallbackMeshState === MeshState.FAILED) {
    const error = entry.fallbackMeshError;
    entry.fallbackMeshState = MeshState.NONE;
    entry.fallbackMeshError = undefined;
    entry.fallbackData = undefined;
    entry.fallbackMeshResult = undefined;
    entry.fallbackState = FallbackState.FAILED;
    entry.fallbackSourceRevision = entry.fallbackCandidateSourceRevision;
    entry.fallbackSourceTile = undefined;
    if (!defined(entry.activeContent)) {
      this._fail(entry, entry.attempt, error);
    }
  }
};

SceneGISPlanarTerrain.prototype._acquireIndex = function (context, mesh) {
  const key = mesh.topologyKey;
  let shared = this._indexBuffers.get(key);
  if (!shared) {
    const buffer = Buffer.createIndexBuffer({
      context,
      typedArray: mesh.indices,
      usage: BufferUsage.STATIC_DRAW,
      indexDatatype: IndexDatatype.fromSizeInBytes(
        mesh.indices.BYTES_PER_ELEMENT,
      ),
    });
    buffer.vertexArrayDestroyable = false;
    shared = { buffer, references: 0 };
    this._indexBuffers.set(key, shared);
    ++this._debug.createdIndexBuffers;
  }
  ++shared.references;
  ++this._debug.acquiredIndexReferences;
  return shared;
};

SceneGISPlanarTerrain.prototype._createContent = function (
  context,
  tile,
  terrainData,
  source,
  meshResult,
) {
  const provider = this._provider;
  if (
    !terrainData ||
    typeof terrainData._getSample !== "function" ||
    terrainData.minimumHeight < provider.minimumHeight ||
    terrainData.maximumHeight > provider.maximumHeight
  ) {
    throw new DeveloperError(
      "Terrain data must be a supported Heightmap within the provider height range.",
    );
  }
  const mesh = finalizeSceneGISPlanarTerrainMesh(terrainData, meshResult);
  ++this._debug.createdMeshes;
  const vertexBuffer = Buffer.createVertexBuffer({
    context,
    typedArray: mesh.positions,
    usage: BufferUsage.STATIC_DRAW,
  });
  ++this._debug.createdVertexBuffers;
  const shared = this._acquireIndex(context, mesh);
  let vertexArray;
  try {
    vertexArray = new VertexArray({
      context,
      attributes: [
        {
          index: 0,
          vertexBuffer,
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
        },
      ],
      indexBuffer: shared.buffer,
    });
  } catch (error) {
    this._releaseIndex(mesh.topologyKey);
    if (!vertexBuffer.isDestroyed()) {
      vertexBuffer.destroy();
      ++this._debug.destroyedVertexBuffers;
    }
    throw error;
  }
  ++this._debug.createdVertexArrays;
  return {
    source,
    revision: ++this._contentRevision,
    terrainData,
    mesh,
    vertexArray,
    indexKey: mesh.topologyKey,
    destroyed: false,
  };
};

SceneGISPlanarTerrain.prototype._activate = function (tile, entry, content) {
  if (entry.activeContent === content) {
    return;
  }
  entry.activeContent = content;
  entry.activeSource = content.source;
  entry.revision = content.revision;
  syncLegacyAliases(entry);
  const mesh = content.mesh;
  if (mesh) {
    tile.updateHeightRange(mesh.minimumHeight, mesh.maximumHeight);
    tile.updateCommandHeightRange(mesh.skirtMinimumHeight, mesh.maximumHeight);
    tile.updateModelMatrix(mesh.referenceHeight);
  } else {
    tile.updateHeightRange(0.0, 0.0);
    tile.updateCommandHeightRange(0.0, 0.0);
    tile.updateModelMatrix(0.0);
  }
};

SceneGISPlanarTerrain.prototype._promoteDirect = function (
  context,
  tile,
  entry,
) {
  if (
    entry.state !== State.RECEIVED ||
    entry.directMeshState !== MeshState.RECEIVED
  ) {
    return false;
  }
  try {
    const content = this._createContent(
      context,
      tile,
      entry.directData,
      Source.DIRECT,
      entry.directMeshResult,
    );
    entry.directContent = content;
    entry.state = State.READY;
    entry.directMeshState = MeshState.NONE;
    entry.directMeshResult = undefined;
    ++entry.fallbackMeshToken;
    entry.fallbackData = undefined;
    entry.fallbackMeshState = MeshState.NONE;
    entry.fallbackMeshResult = undefined;
    entry.fallbackMeshError = undefined;
    entry.fallbackCandidateSourceRevision = -1;
    const fallbackContent = entry.fallbackContent;
    entry.fallbackContent = undefined;
    entry.fallbackState = FallbackState.NONE;
    entry.fallbackSourceRevision = -1;
    entry.fallbackSourceTile = undefined;
    this._activate(tile, entry, content);
    this._destroyContent(fallbackContent);
    ++this._debug.promotions;
  } catch (error) {
    this._fail(entry, entry.attempt, error);
  }
  return true;
};

SceneGISPlanarTerrain.prototype._queueFallback = function (tile, entry) {
  if (entry.state === State.READY) {
    return;
  }
  if (entry.level === 0) {
    if (isTerminal(entry) && entry.activeSource !== Source.FLAT) {
      const flat = createFlatContent(++this._contentRevision);
      entry.fallbackContent = flat;
      entry.fallbackState = FallbackState.READY;
      this._activate(tile, entry, flat);
    }
    return;
  }
  const parent = this._getTile(
    Math.floor(entry.x / 2),
    Math.floor(entry.y / 2),
    entry.level - 1,
  );
  const parentEntry = parent.terrainEntry;
  const parentContent = parentEntry?.activeContent;
  if (parentContent?.terrainData) {
    if (
      entry.fallbackSourceRevision !== parentEntry.revision &&
      entry.fallbackState !== FallbackState.QUEUED
    ) {
      entry.fallbackState = FallbackState.QUEUED;
      entry.fallbackSourceTile = parent;
    }
  } else if (isTerminal(entry) && isTerminal(parentEntry ?? {})) {
    if (entry.activeSource !== Source.FLAT) {
      const flat = createFlatContent(++this._contentRevision);
      const old = entry.fallbackContent;
      entry.fallbackContent = flat;
      entry.fallbackState = FallbackState.READY;
      this._activate(tile, entry, flat);
      this._destroyContent(old);
    }
  }
};

SceneGISPlanarTerrain.prototype._promoteFallback = function (
  context,
  tile,
  entry,
) {
  if (
    entry.state === State.READY ||
    entry.fallbackState !== FallbackState.QUEUED ||
    entry.fallbackMeshState !== MeshState.RECEIVED
  ) {
    return false;
  }
  const sourceTile = entry.fallbackSourceTile;
  const sourceEntry = sourceTile?.terrainEntry;
  if (
    !sourceEntry?.activeContent?.terrainData ||
    sourceEntry.revision !== entry.fallbackCandidateSourceRevision
  ) {
    ++entry.fallbackMeshToken;
    entry.fallbackData = undefined;
    entry.fallbackMeshState = MeshState.NONE;
    entry.fallbackMeshResult = undefined;
    entry.fallbackState = FallbackState.NONE;
    entry.fallbackSourceTile = undefined;
    return false;
  }
  try {
    const data = entry.fallbackData;
    const content = this._createContent(
      context,
      tile,
      data,
      Source.UPSAMPLED,
      entry.fallbackMeshResult,
    );
    const old = entry.fallbackContent;
    entry.fallbackContent = content;
    entry.fallbackState = FallbackState.READY;
    entry.fallbackSourceRevision = sourceEntry.revision;
    entry.fallbackSourceTile = undefined;
    entry.fallbackData = undefined;
    entry.fallbackMeshState = MeshState.NONE;
    entry.fallbackMeshResult = undefined;
    entry.fallbackMeshError = undefined;
    entry.fallbackCandidateSourceRevision = -1;
    this._activate(tile, entry, content);
    this._destroyContent(old);
    ++this._debug.promotions;
  } catch (error) {
    entry.fallbackState = FallbackState.FAILED;
    entry.fallbackSourceRevision = sourceEntry.revision;
    entry.fallbackSourceTile = undefined;
    entry.fallbackData = undefined;
    entry.fallbackMeshState = MeshState.NONE;
    entry.fallbackMeshResult = undefined;
    entry.fallbackMeshError = undefined;
    entry.fallbackCandidateSourceRevision = -1;
    if (!defined(entry.activeContent)) {
      this._fail(entry, entry.attempt, error);
    }
  }
  return true;
};

SceneGISPlanarTerrain.prototype._updateBounds = function (tile, entry) {
  const activeMesh = entry.activeContent?.mesh;
  if (entry.state === State.READY || isTerminal(entry)) {
    const minimum = activeMesh?.minimumHeight ?? 0.0;
    const maximum = activeMesh?.maximumHeight ?? 0.0;
    tile.updateHeightRange(minimum, maximum);
  } else {
    tile.updateHeightRange(
      Math.min(this._provider.minimumHeight, activeMesh?.minimumHeight ?? 0.0),
      Math.max(this._provider.maximumHeight, activeMesh?.maximumHeight ?? 0.0),
    );
  }
  if (activeMesh) {
    tile.updateCommandHeightRange(
      activeMesh.skirtMinimumHeight,
      activeMesh.maximumHeight,
    );
  } else {
    tile.updateCommandHeightRange(0.0, 0.0);
  }
};

SceneGISPlanarTerrain.prototype.prepare = function (
  context,
  loadTiles,
  desiredTilesOrFrameNumber,
  frameNumber,
) {
  let desiredTiles;
  if (typeof desiredTilesOrFrameNumber === "number") {
    frameNumber = desiredTilesOrFrameNumber;
    desiredTiles = loadTiles;
  } else {
    desiredTiles = desiredTilesOrFrameNumber;
  }
  this._tilesLoaded = true;
  if (!this._provider) {
    return;
  }
  const directKeys = new Set();
  for (const desiredTile of desiredTiles) {
    let x = desiredTile.x;
    let y = desiredTile.y;
    for (let level = desiredTile.level; level >= 0; --level) {
      directKeys.add(`${level}/${x}/${y}`);
      x = Math.floor(x / 2);
      y = Math.floor(y / 2);
    }
  }
  for (const tile of loadTiles) {
    const entry = tile.terrainEntry ?? createEntry(this, tile);
    if (directKeys.has(tile.key)) {
      this._advanceDirect(entry, frameNumber);
    }
    if (
      entry.state === State.RECEIVED &&
      (!entry.directData ||
        typeof entry.directData._createMeshTaskPayload !== "function" ||
        entry.directData.minimumHeight < this._provider.minimumHeight ||
        entry.directData.maximumHeight > this._provider.maximumHeight)
    ) {
      this._fail(
        entry,
        entry.attempt,
        new DeveloperError(
          "Terrain data must be a supported Heightmap within the provider height range.",
        ),
      );
    }
    this._consumeMeshFailure(entry);
  }
  for (const tile of loadTiles) {
    this._queueFallback(tile, tile.terrainEntry);
  }

  if (defined(context)) {
    const blockingFallbackTaskQueue = [];
    const refreshFallbackTaskQueue = [];
    const bridgeRefreshFallbackTaskQueue = [];
    const directTaskQueue = [];
    for (const tile of loadTiles) {
      const entry = tile.terrainEntry;
      if (
        entry.fallbackState === FallbackState.QUEUED &&
        entry.fallbackMeshState === MeshState.NONE
      ) {
        const currentView = directKeys.has(tile.key);
        const queue = defined(entry.activeContent)
          ? currentView
            ? refreshFallbackTaskQueue
            : bridgeRefreshFallbackTaskQueue
          : blockingFallbackTaskQueue;
        queue.push(tile);
      }
      if (
        directKeys.has(tile.key) &&
        entry.state === State.RECEIVED &&
        entry.directMeshState === MeshState.NONE
      ) {
        directTaskQueue.push(tile);
      }
    }
    const compare = (left, right) =>
      left.level - right.level || left.key.localeCompare(right.key);
    blockingFallbackTaskQueue.sort(compare);
    directTaskQueue.sort(compare);
    refreshFallbackTaskQueue.sort(compare);
    bridgeRefreshFallbackTaskQueue.sort(compare);
    let taskStarts = 0;
    const startTasks = (queue, callback) => {
      for (const tile of queue) {
        if (taskStarts === 2) {
          break;
        }
        if (callback.call(this, tile, tile.terrainEntry)) {
          ++taskStarts;
        }
      }
    };
    startTasks(blockingFallbackTaskQueue, this._startFallbackMeshTask);
    startTasks(directTaskQueue, this._startDirectMeshTask);
    startTasks(refreshFallbackTaskQueue, this._startFallbackMeshTask);
    startTasks(bridgeRefreshFallbackTaskQueue, this._startFallbackMeshTask);

    const blockingFallbackQueue = [];
    const refreshFallbackQueue = [];
    const bridgeRefreshFallbackQueue = [];
    const directQueue = [];
    for (const tile of loadTiles) {
      const entry = tile.terrainEntry;
      if (entry.fallbackState === FallbackState.QUEUED) {
        const currentView = directKeys.has(tile.key);
        const queue = defined(entry.activeContent)
          ? currentView
            ? refreshFallbackQueue
            : bridgeRefreshFallbackQueue
          : blockingFallbackQueue;
        queue.push(tile);
      }
      if (
        directKeys.has(tile.key) &&
        entry.state === State.RECEIVED &&
        entry.directMeshState === MeshState.RECEIVED
      ) {
        directQueue.push(tile);
      }
    }
    blockingFallbackQueue.sort(compare);
    directQueue.sort(compare);
    refreshFallbackQueue.sort(compare);
    bridgeRefreshFallbackQueue.sort(compare);
    let promotions = 0;
    const promote = (queue, callback) => {
      for (const tile of queue) {
        if (promotions === 2) {
          break;
        }
        if (callback.call(this, context, tile, tile.terrainEntry)) {
          ++promotions;
        }
      }
    };
    promote(blockingFallbackQueue, this._promoteFallback);
    promote(directQueue, this._promoteDirect);
    promote(refreshFallbackQueue, this._promoteFallback);
    promote(bridgeRefreshFallbackQueue, this._promoteFallback);
  }

  for (const tile of loadTiles) {
    this._queueFallback(tile, tile.terrainEntry);
    this._updateBounds(tile, tile.terrainEntry);
  }
  for (const tile of loadTiles) {
    const entry = tile.terrainEntry;
    this._tilesLoaded &&=
      defined(entry.activeContent) ||
      entry.fallbackState !== FallbackState.QUEUED;
    if (directKeys.has(tile.key)) {
      this._tilesLoaded &&=
        entry.state === State.READY ||
        (isTerminal(entry) && entry.fallbackState !== FallbackState.QUEUED);
    }
  }
};

SceneGISPlanarTerrain.prototype.isRenderable = function (tile) {
  return defined(tile.terrainEntry?.activeContent);
};

SceneGISPlanarTerrain.prototype.destroy = function () {
  if (this._destroyed) {
    return;
  }
  ++this._generation;
  this._forEachTile((tile) => this.releaseTile(tile));
  this._destroyRemainingIndexBuffers();
  this._provider = undefined;
  this._geometricErrors = undefined;
  this._destroyed = true;
};

export default SceneGISPlanarTerrain;

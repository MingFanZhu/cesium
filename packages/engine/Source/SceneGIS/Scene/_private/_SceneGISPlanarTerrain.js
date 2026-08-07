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
import buildSceneGISPlanarTerrainMesh from "../../Renderer/_private/_SceneGISPlanarTerrainMesh.js";

const State = Object.freeze({
  UNLOADED: 0,
  LOADING: 1,
  RECEIVED: 2,
  READY: 3,
  FAILED: 4,
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
    provider.maximumLevel < maximumLevel ||
    provider.maximumLevel > tilingScheme.maximumSafeLevel
  ) {
    throw new DeveloperError(
      "terrainProvider.maximumLevel must cover the world's maximumLevel.",
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
  const width = tilingScheme.coordinateSystem.extent.width;
  for (let level = 0; level <= maximumLevel; ++level) {
    const providerError = provider.getLevelMaximumGeometricError(level);
    if (
      !Number.isFinite(providerError) ||
      providerError < 0.0 ||
      providerError > previous
    ) {
      throw new DeveloperError(
        "terrainProvider geometric errors must be finite, non-negative, and non-increasing.",
      );
    }
    geometricErrors[level] = Math.max(
      width / (256.0 * 2 ** level),
      providerError,
    );
    previous = providerError;
  }
  return geometricErrors;
}

function createEntry(runtime, tile) {
  const entry = {
    x: tile.x,
    y: tile.y,
    level: tile.level,
    state: State.UNLOADED,
    generation: runtime._generation,
    attempt: 0,
    lastAttemptFrame: -1,
    request: undefined,
    terrainData: undefined,
    mesh: undefined,
    vertexArray: undefined,
    knownUnavailable: false,
  };
  tile.terrainEntry = entry;
  tile._terrainRelease = runtime._releaseTile;
  ++runtime._debug.createdEntries;
  return entry;
}

/**
 * Owns the minimal planar terrain request, CPU mesh, and GPU lifecycle.
 *
 * @alias SceneGISPlanarTerrain
 * @constructor
 * @private
 */
function SceneGISPlanarTerrain(forEachTile) {
  this._forEachTile = forEachTile;
  this._provider = undefined;
  this._geometricErrors = undefined;
  this._generation = 0;
  this._indexBuffers = new Map();
  this._error = undefined;
  this._tilesLoaded = true;
  this._destroyed = false;
  this._releaseTile = this.releaseTile.bind(this);
  this.State = State;
  this._debug = {
    createdEntries: 0,
    createdRequests: 0,
    cancelledRequests: 0,
    createdMeshes: 0,
    createdVertexBuffers: 0,
    createdIndexBuffers: 0,
    createdVertexArrays: 0,
    destroyedVertexArrays: 0,
    destroyedIndexBuffers: 0,
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

SceneGISPlanarTerrain.prototype._destroyIndexBuffers = function () {
  for (const buffer of this._indexBuffers.values()) {
    if (!buffer.isDestroyed()) {
      buffer.destroy();
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
  this._destroyIndexBuffers();
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
  if (entry.request) {
    entry.request.cancel();
    entry.request = undefined;
    ++this._debug.cancelledRequests;
  }
  if (entry.vertexArray && !entry.vertexArray.isDestroyed()) {
    entry.vertexArray.destroy();
    ++this._debug.destroyedVertexArrays;
  }
  entry.vertexArray = undefined;
  entry.mesh = undefined;
  entry.terrainData = undefined;
  tile.terrainEntry = undefined;
  tile._terrainRelease = undefined;
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
  entry.terrainData = undefined;
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

SceneGISPlanarTerrain.prototype._request = function (entry) {
  const provider = this._provider;
  let available;
  try {
    available = provider.getTileDataAvailable(entry.x, entry.y, entry.level);
  } catch (error) {
    this._fail(entry, entry.attempt, error);
    return;
  }
  if (available === false) {
    entry.knownUnavailable = true;
    entry.state = State.FAILED;
    return;
  }

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
      entry.terrainData = terrainData;
      entry.state = State.RECEIVED;
      TileProviderError.reportSuccess(this._error);
    },
    (error) => this._fail(entry, attempt, error),
  );
};

SceneGISPlanarTerrain.prototype._getIndexBuffer = function (context, mesh) {
  const key = `${mesh.width}/${mesh.height}`;
  let indexBuffer = this._indexBuffers.get(key);
  if (!indexBuffer) {
    indexBuffer = Buffer.createIndexBuffer({
      context,
      typedArray: mesh.indices,
      usage: BufferUsage.STATIC_DRAW,
      indexDatatype: IndexDatatype.fromSizeInBytes(
        mesh.indices.BYTES_PER_ELEMENT,
      ),
    });
    indexBuffer.vertexArrayDestroyable = false;
    this._indexBuffers.set(key, indexBuffer);
    ++this._debug.createdIndexBuffers;
  }
  return indexBuffer;
};

SceneGISPlanarTerrain.prototype._advanceReceived = function (
  context,
  tile,
  entry,
) {
  const data = entry.terrainData;
  const provider = this._provider;
  if (
    !data ||
    typeof data._getSample !== "function" ||
    data.minimumHeight < provider.minimumHeight ||
    data.maximumHeight > provider.maximumHeight
  ) {
    this._fail(
      entry,
      entry.attempt,
      new DeveloperError(
        "Terrain data must be a supported Heightmap within the provider height range.",
      ),
    );
    return;
  }
  let vertexBuffer;
  try {
    const mesh = buildSceneGISPlanarTerrainMesh(data, tile.extent);
    ++this._debug.createdMeshes;
    vertexBuffer = Buffer.createVertexBuffer({
      context,
      typedArray: mesh.positions,
      usage: BufferUsage.STATIC_DRAW,
    });
    ++this._debug.createdVertexBuffers;
    const indexBuffer = this._getIndexBuffer(context, mesh);
    entry.vertexArray = new VertexArray({
      context,
      attributes: [
        {
          index: 0,
          vertexBuffer,
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
        },
      ],
      indexBuffer,
    });
    ++this._debug.createdVertexArrays;
    entry.mesh = mesh;
    entry.state = State.READY;
    tile.updateHeightRange(mesh.minimumHeight, mesh.maximumHeight);
    tile.updateModelMatrix(mesh.referenceHeight);
  } catch (error) {
    if (vertexBuffer && !entry.vertexArray && !vertexBuffer.isDestroyed()) {
      vertexBuffer.destroy();
    }
    this._fail(entry, entry.attempt, error);
  }
};

SceneGISPlanarTerrain.prototype.prepare = function (
  context,
  tiles,
  frameNumber,
) {
  this._tilesLoaded = true;
  if (!this._provider) {
    return;
  }
  for (const tile of tiles) {
    const entry = tile.terrainEntry ?? createEntry(this, tile);
    if (
      entry.state === State.UNLOADED &&
      entry.lastAttemptFrame !== frameNumber
    ) {
      entry.lastAttemptFrame = frameNumber;
      this._request(entry);
    }
    if (entry.state === State.RECEIVED) {
      this._advanceReceived(context, tile, entry);
    }
    if (entry.state === State.FAILED) {
      tile.updateHeightRange(0.0, 0.0);
      tile.updateModelMatrix(0.0);
    }
    this._tilesLoaded &&=
      entry.state === State.READY || entry.state === State.FAILED;
  }
};

SceneGISPlanarTerrain.prototype.destroy = function () {
  if (this._destroyed) {
    return;
  }
  ++this._generation;
  this._forEachTile((tile) => this.releaseTile(tile));
  this._destroyIndexBuffers();
  this._provider = undefined;
  this._geometricErrors = undefined;
  this._destroyed = true;
};

export default SceneGISPlanarTerrain;

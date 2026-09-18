import Credit from "../../../Core/Credit.js";
import defined from "../../../Core/defined.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Event from "../../../Core/Event.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import Request from "../../../Core/Request.js";
import RequestType from "../../../Core/RequestType.js";
import TileProviderError from "../../../Core/TileProviderError.js";
import Texture from "../../../Renderer/Texture.js";
import SceneGISPlanarTilingScheme from "../../Core/SceneGISPlanarTilingScheme.js";
import SceneGISPlanarTileImagery from "./_SceneGISPlanarTileImagery.js";

const State = Object.freeze({
  UNLOADED: 0,
  LOADING: 1,
  RECEIVED: 2,
  READY: 3,
  FAILED: 4,
});

function key(address) {
  return `${address.level}/${address.x}/${address.y}`;
}

function closeImage(image) {
  if (image && typeof image.close === "function") {
    image.close();
    return true;
  }
  return false;
}

function reportProviderError(
  previousError,
  provider,
  event,
  message,
  x,
  y,
  level,
  errorDetails,
) {
  if (event instanceof Event) {
    return TileProviderError.reportError(
      previousError,
      provider,
      event,
      message,
      x,
      y,
      level,
      errorDetails,
    );
  }

  let error = previousError;
  if (!defined(error)) {
    error = new TileProviderError(
      provider,
      message,
      x,
      y,
      level,
      0,
      errorDetails,
    );
  } else {
    error.provider = provider;
    error.message = message;
    error.x = x;
    error.y = y;
    error.level = level;
    error.retry = false;
    error.error = errorDetails;
    ++error.timesRetried;
  }
  event.raiseEvent(error);
  return error;
}

export function validateImageryProvider(provider) {
  if (
    !provider ||
    !(provider.tilingScheme instanceof SceneGISPlanarTilingScheme)
  ) {
    throw new DeveloperError(
      "imageryProvider.tilingScheme must be a SceneGISPlanarTilingScheme.",
    );
  }
  if (provider.minimumLevel !== 0) {
    throw new DeveloperError("imageryProvider.minimumLevel must be zero.");
  }
  if (
    !Number.isInteger(provider.maximumLevel) ||
    provider.maximumLevel < 0 ||
    provider.maximumLevel > provider.tilingScheme.maximumSafeLevel
  ) {
    throw new DeveloperError("imageryProvider.maximumLevel is invalid.");
  }
  if (
    !Number.isInteger(provider.tileWidth) ||
    provider.tileWidth <= 0 ||
    !Number.isInteger(provider.tileHeight) ||
    provider.tileHeight <= 0
  ) {
    throw new DeveloperError(
      "imageryProvider tile dimensions must be positive integers.",
    );
  }
  if (typeof provider.hasAlphaChannel !== "boolean") {
    throw new DeveloperError(
      "imageryProvider.hasAlphaChannel must be a boolean.",
    );
  }
  if (
    !(provider.errorEvent instanceof Event) &&
    (!provider.errorEvent ||
      typeof provider.errorEvent.addEventListener !== "function" ||
      typeof provider.errorEvent.raiseEvent !== "function")
  ) {
    throw new DeveloperError(
      "imageryProvider.errorEvent must provide addEventListener and raiseEvent.",
    );
  }
  if (typeof provider.requestImage !== "function") {
    throw new DeveloperError(
      "imageryProvider.requestImage must be a function.",
    );
  }
  if (provider.credit !== undefined && !(provider.credit instanceof Credit)) {
    throw new DeveloperError(
      "imageryProvider.credit must be undefined or a Credit.",
    );
  }
}

/**
 * Owns per-layer imagery caches and surface-tile dependencies.
 *
 * @alias SceneGISPlanarImagery
 * @constructor
 * @private
 */
function SceneGISPlanarImagery(collection, forEachTile) {
  this._collection = collection;
  this._forEachTile = forEachTile;
  this._runtimes = new Map();
  this._releaseTile = this.releaseTile.bind(this);
  this._generation = 0;
  this._tilesLoaded = true;
  this._destroyed = false;
  this.State = State;
  this._debug = {
    createdBindings: 0,
    createdRequests: 0,
    createdTextures: 0,
    destroyedTextures: 0,
    cancelledRequests: 0,
    closedImages: 0,
  };
}

Object.defineProperties(SceneGISPlanarImagery.prototype, {
  tilesLoaded: {
    get: function () {
      return this._tilesLoaded;
    },
  },
});

SceneGISPlanarImagery.prototype._getRuntime = function (layer) {
  let runtime = this._runtimes.get(layer);
  if (!runtime) {
    runtime = { layer, entries: new Map(), error: undefined };
    runtime.removeReloadListener =
      layer.imageryProvider._reloadEvent?.addEventListener(() => {
        runtime.dirty = true;
        this._tilesLoaded = false;
      });
    this._runtimes.set(layer, runtime);
  }
  return runtime;
};

SceneGISPlanarImagery.prototype.find = function (runtime, address) {
  return runtime.entries.get(key(address));
};

SceneGISPlanarImagery.prototype.acquire = function (runtime, addressOrEntry) {
  let entry = addressOrEntry;
  if (!defined(entry.state)) {
    const entryKey = key(entry);
    entry = runtime.entries.get(entryKey);
    if (!entry) {
      entry = {
        key: entryKey,
        x: addressOrEntry.x,
        y: addressOrEntry.y,
        level: addressOrEntry.level,
        state: State.UNLOADED,
        references: 0,
        generation: 0,
        lastAttemptFrame: -1,
        request: undefined,
        image: undefined,
        texture: undefined,
      };
      runtime.entries.set(entryKey, entry);
    }
  }
  ++entry.references;
  return entry;
};

SceneGISPlanarImagery.prototype.release = function (runtime, entry) {
  --entry.references;
  if (entry.references > 0) {
    return;
  }
  runtime.entries.delete(entry.key);
  ++entry.generation;
  if (entry.request) {
    entry.request.cancel();
    entry.request = undefined;
    ++this._debug.cancelledRequests;
  }
  if (entry.image) {
    if (closeImage(entry.image)) {
      ++this._debug.closedImages;
    }
    entry.image = undefined;
  }
  if (entry.texture && !entry.texture.isDestroyed()) {
    entry.texture.destroy();
    entry.texture = undefined;
    ++this._debug.destroyedTextures;
  }
};

SceneGISPlanarImagery.prototype._request = function (runtime, entry) {
  const provider = runtime.layer.imageryProvider;
  const request = new Request({
    throttle: false,
    throttleByServer: true,
    type: RequestType.IMAGERY,
  });
  entry.request = request;
  entry.state = State.LOADING;
  const generation = entry.generation;
  let promise;
  try {
    promise = provider.requestImage(entry.x, entry.y, entry.level, request);
  } catch (error) {
    this._fail(runtime, entry, generation, error);
    return;
  }
  if (!defined(promise)) {
    entry.request = undefined;
    entry.state = State.UNLOADED;
    return;
  }
  ++this._debug.createdRequests;
  Promise.resolve(promise).then(
    (image) => {
      if (
        this._destroyed ||
        entry.generation !== generation ||
        !runtime.entries.has(entry.key)
      ) {
        if (closeImage(image)) {
          ++this._debug.closedImages;
        }
        return;
      }
      entry.request = undefined;
      entry.image = image;
      entry.state = State.RECEIVED;
      TileProviderError.reportSuccess(runtime.error);
    },
    (error) => this._fail(runtime, entry, generation, error),
  );
};

SceneGISPlanarImagery.prototype._fail = function (
  runtime,
  entry,
  generation,
  error,
) {
  if (
    this._destroyed ||
    entry.generation !== generation ||
    !runtime.entries.has(entry.key) ||
    entry.request?.cancelled
  ) {
    return;
  }
  entry.request = undefined;
  entry.state = State.FAILED;
  const provider = runtime.layer.imageryProvider;
  runtime.error = reportProviderError(
    runtime.error,
    provider,
    provider.errorEvent,
    `Failed to obtain planar image tile X: ${entry.x} Y: ${entry.y} Level: ${entry.level}.`,
    entry.x,
    entry.y,
    entry.level,
    error,
  );
  if (runtime.error.retry) {
    entry.state = State.UNLOADED;
  }
};

SceneGISPlanarImagery.prototype._advance = function (
  context,
  runtime,
  entry,
  frameNumber,
) {
  if (
    entry.state === State.UNLOADED &&
    entry.lastAttemptFrame !== frameNumber
  ) {
    entry.lastAttemptFrame = frameNumber;
    this._request(runtime, entry);
  }
  if (entry.state !== State.RECEIVED) {
    return;
  }
  const provider = runtime.layer.imageryProvider;
  const image = entry.image;
  if (
    !image ||
    image.width !== provider.tileWidth ||
    image.height !== provider.tileHeight ||
    !Number.isInteger(image.width) ||
    !Number.isInteger(image.height)
  ) {
    if (closeImage(image)) {
      ++this._debug.closedImages;
    }
    entry.image = undefined;
    this._fail(
      runtime,
      entry,
      entry.generation,
      new DeveloperError(
        "The imagery tile dimensions do not match the provider declaration.",
      ),
    );
    return;
  }
  try {
    entry.texture = new Texture({
      context,
      source: image,
      pixelFormat: provider.hasAlphaChannel
        ? PixelFormat.RGBA
        : PixelFormat.RGB,
    });
    ++this._debug.createdTextures;
    entry.state = State.READY;
  } catch (error) {
    this._fail(runtime, entry, entry.generation, error);
  } finally {
    if (closeImage(image)) {
      ++this._debug.closedImages;
    }
    entry.image = undefined;
  }
};

SceneGISPlanarImagery.prototype.prepare = function (
  context,
  tiles,
  layers,
  frameNumber,
) {
  this._tilesLoaded = true;
  for (const layer of layers) {
    if (this._runtimes.get(layer)?.dirty) {
      this.releaseLayer(layer);
    }
  }
  for (const tile of tiles) {
    for (const layer of layers) {
      if (!tile.imageryBindings) {
        tile.imageryBindings = new Map();
        tile._imageryRelease = this._releaseTile;
      }
      const runtime = this._getRuntime(layer);
      let binding = tile.imageryBindings.get(layer);
      if (!binding) {
        binding = new SceneGISPlanarTileImagery(this, tile, runtime);
        tile.imageryBindings.set(layer, binding);
        ++this._debug.createdBindings;
      }
      this._advance(context, runtime, binding.desired, frameNumber);
      if (binding.fallback) {
        this._advance(context, runtime, binding.fallback, frameNumber);
      }
      binding.select();
      if (binding.fallback) {
        this._advance(context, runtime, binding.fallback, frameNumber);
        binding.select();
      }
      this._tilesLoaded &&= binding.isSettled();
    }
  }
};

SceneGISPlanarImagery.prototype.releaseLayer = function (layer) {
  this._forEachTile((tile) => {
    const binding = tile.imageryBindings?.get(layer);
    if (binding) {
      binding.destroy();
      tile.imageryBindings.delete(layer);
    }
  });
  const runtime = this._runtimes.get(layer);
  if (runtime) {
    runtime.removeReloadListener?.();
    for (const entry of Array.from(runtime.entries.values())) {
      entry.references = 1;
      this.release(runtime, entry);
    }
    this._runtimes.delete(layer);
  }
  this._tilesLoaded = false;
};

SceneGISPlanarImagery.prototype.releaseTile = function (tile) {
  if (!tile.imageryBindings) {
    return;
  }
  for (const binding of tile.imageryBindings.values()) {
    binding.destroy();
  }
  tile.imageryBindings.clear();
  tile.imageryBindings = undefined;
  tile._imageryRelease = undefined;
};

SceneGISPlanarImagery.prototype.destroy = function () {
  if (this._destroyed) {
    return;
  }
  this._forEachTile((tile) => this.releaseTile(tile));
  for (const layer of Array.from(this._runtimes.keys())) {
    this.releaseLayer(layer);
  }
  this._runtimes.clear();
  this._destroyed = true;
};

export default SceneGISPlanarImagery;

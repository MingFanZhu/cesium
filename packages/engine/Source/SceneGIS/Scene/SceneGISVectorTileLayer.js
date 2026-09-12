import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Request from "../../Core/Request.js";
import RequestType from "../../Core/RequestType.js";
import destroyObject from "../../Core/destroyObject.js";
import Scene from "../../Scene/Scene.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";
import SceneGISVectorTileCoordinates from "../Core/SceneGISVectorTileCoordinates.js";
import SceneGISVectorTileSource from "../Core/SceneGISVectorTileSource.js";
import SceneGISVectorTileStyle from "../Core/SceneGISVectorTileStyle.js";
import geometry from "../Core/_private/_SceneGISVectorTileGeometry.js";
import VectorBatch from "./_private/_SceneGISVectorTileBatch.js";
import cover from "./_private/_SceneGISVectorTileCover.js";

function integerOption(options, name, fallback) {
  const value = options[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DeveloperError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function checkDefault(definition, scope, name, value) {
  const input = definition[scope];
  if (
    input !== undefined &&
    Object.hasOwn(input, name) &&
    input[name] !== value
  ) {
    throw new DeveloperError(
      `Layer ${definition.id}.${scope}.${name} is outside scenegis-vector-flat-v2.`,
    );
  }
}

function hasZoom(expression) {
  return (
    Array.isArray(expression) &&
    (expression[0] === "zoom" || expression.some(hasZoom))
  );
}

function layerRecord(style, id) {
  const definition = style.getLayerDefinition(id);
  if (definition.type === "line") {
    for (const [name, value] of Object.entries({
      "line-cap": "butt",
      "line-join": "miter",
      "line-miter-limit": 2,
      "line-round-limit": 1.05,
    })) {
      checkDefault(definition, "layout", name, value);
    }
    for (const name of ["line-gap-width", "line-offset", "line-blur"]) {
      checkDefault(definition, "paint", name, 0);
    }
    checkDefault(definition, "paint", "line-dasharray", undefined);
  } else if (definition.type === "circle") {
    checkDefault(definition, "paint", "circle-blur", 0);
  } else if (definition.type === "fill") {
    checkDefault(definition, "paint", "fill-antialias", true);
  }
  const zoomProperty = (scope) =>
    Object.keys(definition[scope] ?? {}).some((name) => {
      const kind = style.getPropertyKind(id, scope, name);
      return kind === "camera" || kind === "composite";
    });
  return {
    definition,
    paintZoom: zoomProperty("paint"),
    layoutZoom: zoomProperty("layout") || hasZoom(definition.filter),
  };
}

function signature(records, zoom) {
  return records
    .map(({ definition, paintZoom, layoutZoom }) =>
      [
        zoom >= (definition.minzoom ?? 0) && zoom < (definition.maxzoom ?? 24),
        paintZoom ? zoom : "",
        layoutZoom ? Math.floor(zoom) : "",
      ].join(":"),
    )
    .join("|");
}

function prepareSources(world, style, overrides) {
  const result = new Map();
  for (const id of Object.keys(overrides)) {
    if (!Object.hasOwn(style.sources, id)) {
      throw new DeveloperError(`Unknown source override: ${id}`);
    }
  }
  for (const [id, definition] of Object.entries(style.sources)) {
    let source = overrides[id];
    if (source === undefined) {
      if (definition.tiles?.length !== 1) {
        throw new DeveloperError(
          `Source ${id} must contain exactly one tile URL.`,
        );
      }
      source = new SceneGISVectorTileSource({
        url: definition.tiles[0],
        tilingScheme: world.tilingScheme,
        minimumLevel: definition.minzoom,
        maximumLevel: definition.maxzoom,
        scheme: definition.scheme,
        credit: definition.attribution,
      });
    }
    if (
      !(source instanceof SceneGISVectorTileSource) ||
      source.tilingScheme !== world.tilingScheme
    ) {
      throw new DeveloperError(
        `Source ${id} must use the world's canonical tilingScheme.`,
      );
    }
    result.set(id, { source, entries: new Map(), visible: [], records: [] });
  }
  return result;
}

function cancel(layer, entry) {
  if (entry.request === undefined) {
    return;
  }
  entry.request.cancel();
  entry.request = undefined;
  entry.state = "idle";
  layer._pendingRequests--;
}

function release(layer, entry) {
  cancel(layer, entry);
  for (const batches of entry.batches.values()) {
    for (const batch of batches) {
      batch.destroy();
    }
  }
  entry.batches.clear();
  entry.data = undefined;
}

function fail(entry, error) {
  entry.state = "failed";
  entry.error = error;
  entry.notified = false;
}

function requestTile(layer, state, entry) {
  const request = new Request({
    throttle: true,
    throttleByServer: true,
    type: RequestType.OTHER,
  });
  let promise;
  try {
    promise = state.source.requestTile(entry.x, entry.y, entry.level, request);
  } catch (error) {
    fail(entry, error);
    return;
  }
  if (promise === undefined) {
    return;
  }
  entry.request = request;
  entry.state = "pending";
  layer._pendingRequests++;
  const settled = (data, failed, error) => {
    if (layer.isDestroyed() || entry.request !== request) {
      return;
    }
    entry.request = undefined;
    layer._pendingRequests--;
    if (failed) {
      fail(entry, error);
    } else {
      entry.data = data;
      entry.state = "decoded";
    }
    layer._scene.requestRender();
  };
  Promise.resolve(promise).then(
    (data) => settled(data, false),
    (error) => settled(undefined, true, error),
  );
}

function createBatches(layer, state, entry, zoom) {
  const batches = new Map();
  try {
    for (const { definition } of state.records) {
      const sourceLayer = entry.data.layers.find(
        (candidate) => candidate.name === definition["source-layer"],
      );
      if (sourceLayer === undefined) {
        continue;
      }
      const coordinates = new SceneGISVectorTileCoordinates({
        tilingScheme: state.source.tilingScheme,
        x: entry.x,
        y: entry.y,
        level: entry.level,
        extent: sourceLayer.extent,
      });
      const prepared = geometry.build(
        sourceLayer,
        definition,
        layer._style,
        coordinates,
        zoom,
        entry,
      );
      const group = [];
      batches.set(definition.id, group);
      for (const item of prepared) {
        const batch = new VectorBatch(layer, entry, item, layer._allowPicking);
        group.push(batch);
        batch.update(layer._scene.frameState);
      }
    }
  } catch (error) {
    for (const group of batches.values()) {
      for (const batch of group) {
        batch.destroy();
      }
    }
    throw error;
  }
  for (const group of entry.batches.values()) {
    for (const batch of group) {
      batch.destroy();
    }
  }
  entry.batches = batches;
  entry.state = "ready";
  entry.signature = state.signature;
  layer._uploads++;
}

function updateBackgrounds(layer, zoom, frameState) {
  for (const record of layer._backgrounds) {
    const desired = signature([record], zoom);
    if (record.signature !== desired) {
      const evaluated = layer._style.evaluateLayer(
        record.definition.id,
        undefined,
        zoom,
      );
      let candidate;
      if (evaluated.show && evaluated.paint["background-opacity"] > 0) {
        const bounds = layer._world.coordinateSystem.extent;
        const instance = geometry.background(
          bounds.width,
          bounds.height,
          evaluated,
        );
        candidate = new VectorBatch(
          layer,
          { bounds },
          { kind: "fill", instances: [instance] },
          false,
        );
        try {
          candidate.update(frameState);
        } catch (error) {
          candidate.destroy();
          throw error;
        }
      }
      record.batch?.destroy();
      record.batch = candidate;
      record.signature = desired;
    } else {
      record.batch?.update(frameState);
    }
  }
}

function updateSources(layer, zoom, frameState) {
  for (const state of layer._sources.values()) {
    state.signature = signature(state.records, zoom);
    const desired =
      state.records.length === 0
        ? []
        : cover.select(
            frameState,
            state.source,
            zoom,
            layer._maximumVisibleTiles,
          );
    const protectedKeys = new Set();
    state.visible.length = 0;
    for (const tile of desired) {
      protectedKeys.add(tile.key);
      let entry = state.entries.get(tile.key);
      if (entry === undefined) {
        entry = {
          ...tile,
          state: "idle",
          request: undefined,
          data: undefined,
          batches: new Map(),
          signature: undefined,
        };
        state.entries.set(tile.key, entry);
      }
      entry.lastUsed = frameState.frameNumber;
      state.visible.push(entry);
    }
    const candidates = [];
    for (const entry of state.entries.values()) {
      if (!protectedKeys.has(entry.key)) {
        cancel(layer, entry);
        candidates.push(entry);
      }
    }
    candidates.sort((a, b) => a.lastUsed - b.lastUsed);
    for (const entry of candidates) {
      if (state.entries.size <= layer._tileCacheSize) {
        break;
      }
      release(layer, entry);
      state.entries.delete(entry.key);
    }
    if (desired.length > 0 && state.source.credit !== undefined) {
      frameState.creditDisplay.addCreditToNextFrame(state.source.credit);
    }
    for (const entry of state.visible) {
      if (
        entry.state === "idle" &&
        layer._pendingRequests < layer._maximumRequests
      ) {
        requestTile(layer, state, entry);
      }
    }
  }
  let uploads = 0;
  for (const [id, state] of layer._sources) {
    for (const entry of state.visible) {
      const needsUpload =
        entry.state === "decoded" ||
        (entry.state === "ready" && entry.signature !== state.signature);
      if (needsUpload && uploads < layer._maximumUploadsPerFrame) {
        try {
          createBatches(layer, state, entry, zoom);
        } catch (error) {
          fail(entry, error);
        }
        uploads++;
      } else {
        for (const group of entry.batches.values()) {
          for (const batch of group) {
            batch.update(frameState);
          }
        }
      }
      if (entry.state === "failed" && !entry.notified) {
        entry.notified = true;
        layer._errorEvent.raiseEvent({
          layer,
          source: id,
          tile: { x: entry.x, y: entry.y, level: entry.level },
          error: entry.error,
        });
      }
    }
  }
}

function publishOrder(layer) {
  layer._drawOrder.length = 0;
  for (const record of layer._records) {
    if (record.definition.type === "background") {
      if (record.batch !== undefined) {
        layer._drawOrder.push(record.batch);
      }
      continue;
    }
    const state = layer._sources.get(record.definition.source);
    for (const entry of state.visible) {
      for (const batch of entry.batches.get(record.definition.id) ?? []) {
        layer._drawOrder.push(batch);
      }
    }
  }
  layer._tilesLoaded = true;
  for (const state of layer._sources.values()) {
    for (const entry of state.visible) {
      if (
        entry.state !== "failed" &&
        (entry.state !== "ready" || entry.signature !== state.signature)
      ) {
        layer._tilesLoaded = false;
      }
    }
  }
}

/**
 * Renders independently decoded vector tiles on a SceneGIS Z=0 planar world.
 * Add this object to scene.primitives. The collection then owns its lifetime.
 * Construction does not request data or allocate GPU resources. Scene, World,
 * style, and source overrides are borrowed. Style/source configuration is fixed.
 * This V2 renderer requires a world without a terrainProvider.
 * @alias SceneGISVectorTileLayer
 * @constructor
 * @experimental This API is experimental and subject to change.
 * @param {object} options Layer configuration.
 * @param {Scene} options.scene The live planar Scene.
 * @param {SceneGISVectorTileStyle|object} options.style A V1 style within the flat V2 rendered profile.
 * @param {Object.<string, SceneGISVectorTileSource>} [options.sources] Source overrides using the world's scheme.
 * @param {number} [options.tileCacheSize=64] Maximum resident tiles per source, including visible tiles.
 * @param {number} [options.maximumVisibleTiles=32] Maximum desired tiles per source; coarsen LOD within availability to fit.
 * @param {number} [options.maximumRequests=8] Maximum in-flight requests for this layer.
 * @param {number} [options.maximumUploadsPerFrame=2] Maximum tile batch publications per normal frame.
 * @param {boolean} [options.show=true] Whether the layer is shown.
 * @param {boolean} [options.allowPicking=true] Whether feature pick resources are created.
 * @exception {DeveloperError} Scene, style, sources, or budget configuration is invalid.
 */
function SceneGISVectorTileLayer(options) {
  options = options ?? {};
  const scene = options.scene;
  if (
    !(scene instanceof Scene) ||
    scene.isDestroyed() ||
    !(scene.world instanceof SceneGISPlanarWorld) ||
    scene.world.isDestroyed()
  ) {
    throw new DeveloperError("scene must have a live SceneGISPlanarWorld.");
  }
  if (scene.world.terrainProvider !== undefined) {
    throw new DeveloperError(
      "The flat V2 vector renderer does not support a terrainProvider.",
    );
  }
  const style =
    options.style instanceof SceneGISVectorTileStyle
      ? options.style
      : new SceneGISVectorTileStyle(options.style);
  this._tileCacheSize = integerOption(options, "tileCacheSize", 64);
  this._maximumVisibleTiles = integerOption(options, "maximumVisibleTiles", 32);
  this._maximumRequests = integerOption(options, "maximumRequests", 8);
  this._maximumUploadsPerFrame = integerOption(
    options,
    "maximumUploadsPerFrame",
    2,
  );
  if (this._tileCacheSize < this._maximumVisibleTiles) {
    throw new DeveloperError(
      "tileCacheSize must be at least maximumVisibleTiles.",
    );
  }
  if (
    typeof (options.show ?? true) !== "boolean" ||
    typeof (options.allowPicking ?? true) !== "boolean"
  ) {
    throw new DeveloperError("show and allowPicking must be booleans.");
  }
  this._records = style.layerIds.map((id) => layerRecord(style, id));
  if (
    options.sources !== undefined &&
    (options.sources === null ||
      typeof options.sources !== "object" ||
      Array.isArray(options.sources))
  ) {
    throw new DeveloperError("sources must be an object of source overrides.");
  }
  this._sources = prepareSources(scene.world, style, options.sources ?? {});
  this._backgrounds = [];
  for (const record of this._records) {
    if (record.definition.type === "background") {
      this._backgrounds.push(record);
    } else {
      this._sources.get(record.definition.source).records.push(record);
    }
  }
  this._scene = scene;
  this._world = scene.world;
  this._style = style;
  this._show = options.show ?? true;
  this._allowPicking = options.allowPicking ?? true;
  this._errorEvent = new Event();
  this._ready = false;
  this._tilesLoaded = false;
  this._pendingRequests = 0;
  this._drawOrder = [];
  this._uploads = 0;
  this._zoom = undefined;
}

Object.defineProperties(SceneGISVectorTileLayer.prototype, {
  /**
   * Gets or sets visibility. Hidden layers retain data and cancel requests on normal update.
   * @memberof SceneGISVectorTileLayer.prototype
   * @type {boolean}
   * @default true
   */
  show: {
    get: function () {
      return this._show;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("show must be a boolean.");
      }
      if (this._show !== value) {
        this._show = value;
        this._scene.requestRender();
      }
    },
  },
  /**
   * The borrowed Scene.
   * @memberof SceneGISVectorTileLayer.prototype
   * @type {Scene}
   * @readonly
   */
  scene: {
    get: function () {
      return this._scene;
    },
  },
  /**
   * The immutable style frontend.
   * @memberof SceneGISVectorTileLayer.prototype
   * @type {SceneGISVectorTileStyle}
   * @readonly
   */
  style: {
    get: function () {
      return this._style;
    },
  },
  /**
   * Whether a successful normal update has occurred.
   * @memberof SceneGISVectorTileLayer.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
  /**
   * Whether the current view has no pending work; terminal failures are reported through errorEvent.
   * @memberof SceneGISVectorTileLayer.prototype
   * @type {boolean}
   * @readonly
   */
  tilesLoaded: {
    get: function () {
      return this._tilesLoaded;
    },
  },
  /**
   * Reports a failed tile as {layer, source, tile, error}, once per attempt, during normal update.
   * @memberof SceneGISVectorTileLayer.prototype
   * @type {Event}
   * @readonly
   */
  errorEvent: {
    get: function () {
      return this._errorEvent;
    },
  },
  /**
   * Returns a fresh diagnostic snapshot; tile counts are not byte budgets.
   * @memberof SceneGISVectorTileLayer.prototype
   * @type {object}
   * @readonly
   */
  statistics: {
    get: function () {
      let residentTiles = 0;
      let visibleTiles = 0;
      let failedTiles = 0;
      for (const state of this._sources.values()) {
        residentTiles += state.entries.size;
        visibleTiles += state.visible.length;
        failedTiles += state.visible.filter(
          (entry) => entry.state === "failed",
        ).length;
      }
      return {
        residentTiles,
        visibleTiles,
        failedTiles,
        pendingRequests: this._pendingRequests,
        drawCommands: this._drawOrder.reduce(
          (count, batch) => count + batch.commands.length,
          0,
        ),
        uploads: this._uploads,
        zoom: this._zoom,
      };
    },
  },
});

/** @private */
SceneGISVectorTileLayer.prototype.update = function (frameState) {
  if (
    frameState !== this._scene.frameState ||
    this._scene.world !== this._world ||
    this._world.isDestroyed() ||
    frameState.scene3DOnly !== true
  ) {
    throw new DeveloperError(
      "The vector layer must update in its original planar Scene.",
    );
  }
  if (this._world.terrainProvider !== undefined) {
    throw new DeveloperError(
      "The flat V2 vector renderer does not support a terrainProvider.",
    );
  }
  if (!this._show || !this._world.show) {
    if (frameState.passes.render) {
      for (const state of this._sources.values()) {
        for (const entry of state.entries.values()) {
          cancel(this, entry);
        }
        state.visible.length = 0;
      }
      this._drawOrder.length = 0;
      this._tilesLoaded = true;
    }
    return;
  }
  if (frameState.passes.render) {
    const zoom = cover.computeZoom(
      frameState,
      this._world.coordinateSystem.extent.width,
    );
    this._zoom = zoom;
    if (zoom === undefined) {
      this._drawOrder.length = 0;
      this._tilesLoaded = true;
      return;
    }
    updateBackgrounds(this, zoom, frameState);
    updateSources(this, zoom, frameState);
    publishOrder(this);
    this._ready = true;
    if (!this._tilesLoaded) {
      this._scene.requestRender();
    }
  }
  for (const batch of this._drawOrder) {
    batch.queue(frameState);
  }
};

/**
 * Tests whether this layer has been destroyed.
 * @returns {boolean} Whether destroyed.
 */
SceneGISVectorTileLayer.prototype.isDestroyed = function () {
  return false;
};

/**
 * Cancels requests and destroys all owned batches. Borrowed Scene, World, style, and sources remain live.
 * After destruction only isDestroyed may be called.
 * @returns {undefined}
 */
SceneGISVectorTileLayer.prototype.destroy = function () {
  for (const record of this._backgrounds) {
    record.batch?.destroy();
  }
  for (const state of this._sources.values()) {
    for (const entry of state.entries.values()) {
      release(this, entry);
    }
    state.entries.clear();
    state.visible.length = 0;
  }
  this._drawOrder.length = 0;
  return destroyObject(this);
};

export default SceneGISVectorTileLayer;

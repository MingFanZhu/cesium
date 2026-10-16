import DeveloperError from "../../Core/DeveloperError.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import WorkerPool from "../Core/_private/_SceneGISVectorWorkerPool.js";
import Event from "../../Core/Event.js";
import Request from "../../Core/Request.js";
import RequestType from "../../Core/RequestType.js";
import destroyObject from "../../Core/destroyObject.js";
import Scene from "../../Scene/Scene.js";
import Globe from "../../Scene/Globe.js";
import SceneMode from "../../Scene/SceneMode.js";
import Ellipsoid from "../../Core/Ellipsoid.js";
import EllipsoidTerrainProvider from "../../Core/EllipsoidTerrainProvider.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";
import SceneGISVectorTileSource from "../Core/SceneGISVectorTileSource.js";
import SceneGISVectorTileStyle from "../Core/SceneGISVectorTileStyle.js";
import geometry from "../Core/_private/_SceneGISVectorTileGeometry.js";
import VectorBatch from "./_private/_SceneGISVectorTileBatch.js";
import Symbols from "./_private/_SceneGISVectorSymbols.js";
import cover from "./_private/_SceneGISVectorTileCover.js";
import renderCover from "../Core/_private/_SceneGISVectorTileRenderCover.js";
import updateTerrain from "./_private/_SceneGISVectorTerrain.js";
import GlobeCoordinates from "../Core/_private/_SceneGISVectorGlobeCoordinates.js";
import GlobeCover from "./_private/_SceneGISVectorGlobeCover.js";
import GlobeTerrain from "./_private/_SceneGISVectorGlobeTerrain.js";
import extrusionAnchoring from "./_private/_SceneGISVectorExtrusionAnchoring.js";
import GlobeBackground from "./_private/_SceneGISVectorGlobeBackground.js";
import Patterns from "./_private/_SceneGISVectorPatterns.js";
import State from "../Core/_private/_SceneGISVectorState.js";
import StateStore from "./_private/_SceneGISVectorStateStore.js";

function integerOption(options, name, fallback) {
  const value = options[name] ?? fallback;
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DeveloperError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function hasZoom(expression) {
  return (
    Array.isArray(expression) &&
    (expression[0] === "zoom" || expression.some(hasZoom))
  );
}

function layerRecord(style, id) {
  const definition = style.getLayerDefinition(id);
  const dependencies = { feature: new Set(), global: new Set() };
  for (const value of Object.values(definition.paint ?? {})) {
    State.dependencies(value, dependencies);
  }
  return {
    definition,
    style,
    stateDependencies: dependencies,
    filterZoom: hasZoom(definition.filter),
  };
}

function recordSignature(record, zoom) {
  if (record.keyZoom !== zoom || record.keyState !== record.stateRevision) {
    const definition = record.definition;
    record.key = [
      zoom >= (definition.minzoom ?? 0) && zoom < (definition.maxzoom ?? 24),
      record.style._getGeometryKey(definition.id, zoom, record.context),
      record.filterZoom ? Math.floor(zoom) : "",
      record.stateRevision ?? 0,
    ].join(":");
    record.keyZoom = zoom;
    record.keyState = record.stateRevision;
    record.uniformPaint = record.style._getUniformPaint(
      definition.id,
      zoom,
      record.context,
    );
  }
  return record.key;
}

function signature(records, zoom) {
  return records
    .filter(({ definition }) => definition.type !== "symbol")
    .map((record) => recordSignature(record, zoom))
    .join("|");
}

function entrySignature(state, entry) {
  return `${state.signature}/${state.styleRevision ?? 0}/${entry.stateRevision ?? 0}`;
}

function prepareSources(tilingScheme, style, overrides) {
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
        tilingScheme,
        minimumLevel: definition.minzoom,
        maximumLevel: definition.maxzoom,
        scheme: definition.scheme,
        credit: definition.attribution,
      });
    }
    if (
      !(source instanceof SceneGISVectorTileSource) ||
      source.tilingScheme !== tilingScheme
    ) {
      throw new DeveloperError(
        `Source ${id} must use the layer's canonical tilingScheme.`,
      );
    }
    result.set(id, {
      source,
      entries: new Map(),
      visible: [],
      records: [],
      render: new Map(),
    });
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

function clearView(layer) {
  for (const state of layer._sources.values()) {
    for (const entry of state.entries.values()) {
      cancel(layer, entry);
      discardPreparation(entry);
    }
    state.visible.length = 0;
    state.render.clear();
  }
  layer._drawOrder.length = 0;
  layer._symbols?.clear();
  layer._tilesLoaded = true;
}

function release(layer, entry) {
  cancel(layer, entry);
  discardPreparation(entry);
  entry.symbols = undefined;
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
    promise = state.source.requestTile(
      entry.x,
      entry.y,
      entry.level,
      request,
      false,
    );
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
      entry.state = "received";
    }
    layer._scene.requestRender();
  };
  Promise.resolve(promise).then(
    (data) => settled(data, false),
    (error) => settled(undefined, true, error),
  );
}

function discardPreparation(entry) {
  const work = entry.work;
  if (!work) {
    return;
  }
  for (const [id, batches] of work.batches) {
    if (batches !== entry.batches.get(id)) {
      for (const batch of batches) {
        batch.destroy();
      }
    }
  }
  entry.work = undefined;
}

function validatePreparedTile(result, records, allowPicking) {
  if (
    result.kind !== "tile" ||
    !Array.isArray(result.layers) ||
    !Array.isArray(result.symbols) ||
    !Array.isArray(result.errors) ||
    !Number.isSafeInteger(result.features) ||
    !Number.isSafeInteger(result.byteLength) ||
    result.byteLength < 0
  ) {
    throw new DeveloperError("Invalid vector Worker tile result.");
  }
  let bytes = 0;
  for (const group of result.layers) {
    if (
      !records.some(
        (record) =>
          record.id === group.id && record.signature === group.signature,
      ) ||
      !Array.isArray(group.batches)
    ) {
      throw new DeveloperError("Invalid vector Worker style batch.");
    }
    for (const item of group.batches) {
      if (
        (!item.geometries?.length && !item.ground) ||
        !["fill", "line", "circle", "fill-extrusion"].includes(item.kind) ||
        !Array.isArray(item.identities)
      ) {
        throw new DeveloperError("Invalid vector Worker geometry.");
      }
      let itemBytes = 0;
      if (item.ground) {
        const { vertices, triangles, stride, frames } = item.ground;
        if (
          !(vertices instanceof Float32Array) ||
          !(triangles instanceof Float32Array) ||
          stride !== (item.kind === "line" ? 7 : 3) + (item.pattern ? 2 : 0) ||
          vertices.length % (stride * 4) ||
          triangles.length % 4
        ) {
          throw new DeveloperError("Invalid vector Worker ground tables.");
        }
        itemBytes = vertices.byteLength + triangles.byteLength;
        if (frames !== undefined) {
          if (
            !(frames instanceof Float32Array) ||
            frames.length !== triangles.length * 4
          ) {
            throw new DeveloperError("Invalid vector Worker Globe frames.");
          }
          itemBytes += frames.byteLength;
        }
      }
      for (const geometry of item.geometries ?? []) {
        const high = geometry.attributes?.position3DHigh?.values;
        const low = geometry.attributes?.position3DLow?.values;
        if (
          !(high instanceof Float32Array) ||
          !(low instanceof Float32Array) ||
          high.length !== low.length ||
          high.length % 3 ||
          !(geometry.indices instanceof Uint16Array) ||
          geometry.indices.length % 3
        ) {
          throw new DeveloperError(
            "Invalid vector Worker position/index buffers.",
          );
        }
        const count = high.length / 3;
        if (
          item.kind === "fill-extrusion" &&
          (!Number.isFinite(item.minimumHeight) ||
            !Number.isFinite(item.maximumHeight) ||
            item.minimumHeight > item.maximumHeight ||
            !(
              geometry.attributes.extrusionData?.values instanceof Float32Array
            ) ||
            geometry.attributes.extrusionData.componentsPerAttribute !== 4 ||
            !(
              geometry.attributes.vectorAnchor?.values instanceof Float32Array
            ) ||
            geometry.attributes.vectorAnchor.componentsPerAttribute !== 2 ||
            !(geometry.attributes.normal?.values instanceof Float32Array) ||
            geometry.attributes.normal.componentsPerAttribute !== 3)
        ) {
          throw new DeveloperError("Invalid vector Worker extrusion buffers.");
        }
        for (const attribute of Object.values(geometry.attributes)) {
          if (
            !ArrayBuffer.isView(attribute.values) ||
            attribute.values.length !== count * attribute.componentsPerAttribute
          ) {
            throw new DeveloperError("Invalid vector Worker vertex attribute.");
          }
          itemBytes += attribute.values.byteLength;
        }
        if (
          allowPicking &&
          !(geometry.attributes.pickColor?.values instanceof Uint8Array)
        ) {
          throw new DeveloperError("Invalid vector Worker pick buffer.");
        }
        itemBytes += geometry.indices.byteLength;
      }
      if (itemBytes !== item.byteLength) {
        throw new DeveloperError("Invalid vector Worker byte count.");
      }
      bytes += itemBytes;
    }
  }
  if (bytes !== result.byteLength) {
    throw new DeveloperError("Invalid vector Worker tile byte count.");
  }
}

function prepareEntry(layer, state, entry, zoom) {
  if (layer._patterns && !layer._patterns.loaded) {
    return;
  }
  if (entry.work || layer._preparing >= 2 || !layer._workers.available) {
    return;
  }
  let retained = 0;
  for (const source of layer._sources.values()) {
    for (const tile of source.entries.values()) {
      retained += Number(!!tile.work?.result);
    }
  }
  if (retained + layer._preparing >= 2) {
    return;
  }
  const records = [],
    signatures = new Map(),
    batches = new Map(),
    symbolSignatures = new Map(),
    symbolOrders = [];
  const symbolZoom = Math.floor(zoom);
  for (const record of state.records) {
    const definition = record.definition;
    if (definition.type === "symbol") {
      const key = `${symbolZoom}/${record.styleRevision ?? 0}`;
      symbolSignatures.set(definition.id, key);
      if (entry.symbolSignatures?.get(definition.id) !== key) {
        const order = layer._records.indexOf(record);
        symbolOrders.push(order);
        records.push({
          id: definition.id,
          order,
        });
      }
      continue;
    }
    const key = `${signature([record], zoom)}/${entry.stateVersions?.get(definition.id) ?? 0}`;
    signatures.set(definition.id, key);
    if (entry.layerSignatures?.get(definition.id) === key) {
      if (entry.batches.has(definition.id)) {
        batches.set(definition.id, entry.batches.get(definition.id));
      }
    } else {
      records.push({ id: definition.id, signature: key });
    }
  }
  const parameters = {
    kind: "tile",
    ground: layer._ground,
    globe: layer._globe,
    records,
    zoom,
    maximumLevel: state.source.maximumLevel,
    allowPicking: layer._allowPicking,
    tile: { x: entry.x, y: entry.y, level: entry.level },
    featureStates: layer._states.sources.get(
      state.records[0]?.definition.source,
    ),
    globalState: layer._states.global,
  };
  const transfers = [];
  if (entry.data instanceof ArrayBuffer || ArrayBuffer.isView(entry.data)) {
    const data = entry.data;
    parameters.buffer =
      data instanceof ArrayBuffer
        ? data.slice(0)
        : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    transfers.push(parameters.buffer);
  } else {
    parameters.data = entry.data;
  }
  const promise = layer._workers.schedule(parameters, transfers);
  if (!promise) {
    return;
  }
  const work = {
    signature: entrySignature(state, entry),
    styleRevision: state.styleRevision ?? 0,
    style: layer._style,
    symbolZoom,
    symbolSignatures,
    symbolOrders,
    signatures,
    batches,
    cursor: 0,
  };
  entry.work = work;
  layer._preparing++;
  promise.then(
    (result) => {
      if (layer.isDestroyed()) {
        return;
      }
      layer._preparing--;
      if (entry.work !== work) {
        return;
      }
      if (work.styleRevision !== (state.styleRevision ?? 0)) {
        layer._scene.requestRender();
        return;
      }
      try {
        validatePreparedTile(result, records, layer._allowPicking);
      } catch (error) {
        discardPreparation(entry);
        fail(entry, error);
        layer._scene.requestRender();
        return;
      }
      {
        work.result = result;
        if (result.featureIds) {
          entry.featureIds = new Map(
            result.featureIds.map(([name, ids]) => [name, new Set(ids)]),
          );
        }
        work.items = result.layers.flatMap((group) => {
          batches.set(group.id, []);
          return group.batches.map((item) => ({ id: group.id, item }));
        });
        if (!entry.counted) {
          layer._decodedFeatures += result.features;
          entry.counted = true;
        }
        layer._decodeMs += result.decodeMs;
      }
      layer._scene.requestRender();
    },
    (error) => {
      if (layer.isDestroyed()) {
        return;
      }
      layer._preparing--;
      if (entry.work !== work) {
        return;
      }
      if (work.styleRevision !== (state.styleRevision ?? 0)) {
        layer._scene.requestRender();
        return;
      }
      discardPreparation(entry);
      fail(entry, error);
      layer._scene.requestRender();
    },
  );
}

function createBatches(layer, state, entry, frameState, budget) {
  const work = entry.work;
  if (!work?.result) {
    return false;
  }
  while (work.cursor < work.items.length) {
    const { id, item } = work.items[work.cursor];
    if (
      budget.bytes > 0 &&
      (performance.now() >= budget.deadline ||
        budget.bytes + item.byteLength > layer._maximumUploadBytesPerFrame)
    ) {
      return false;
    }
    const record = state.records.find((record) => record.definition.id === id);
    const batch = new VectorBatch(
      layer,
      entry,
      item,
      layer._allowPicking,
      record,
    );
    work.batches.get(id).push(batch);
    batch.update(frameState);
    budget.bytes += item.byteLength;
    work.cursor++;
  }
  for (const [id, batches] of entry.batches) {
    if (batches !== work.batches.get(id)) {
      for (const batch of batches) {
        batch.destroy();
      }
    }
  }
  entry.batches = work.batches;
  entry.layerSignatures = work.signatures;
  if (work.symbolOrders.length > 0) {
    const symbols = new Map(entry.symbols);
    for (const order of work.symbolOrders) {
      symbols.delete(order);
    }
    for (const [order, group] of work.result.symbols) {
      symbols.set(order, { ...group, style: work.style });
    }
    entry.symbols = symbols;
    entry.symbolZoom = work.symbolZoom;
    for (const error of work.result.errors) {
      layer._symbols?.report(error.key, new DeveloperError(error.message));
    }
  }
  entry.symbolSignatures = work.symbolSignatures;
  entry.state = "ready";
  entry.signature = work.signature;
  entry.work = undefined;
  layer._uploads++;
  return true;
}

function updateBackgrounds(layer, zoom, frameState) {
  for (const record of layer._backgrounds) {
    const pattern =
      record.definition.paint?.["background-pattern"] !== undefined;
    if (pattern && !layer._patterns.ready) {
      continue;
    }
    const desired = signature([record], zoom);
    if (record.signature !== desired) {
      const evaluated = layer._style.evaluateLayer(
        record.definition.id,
        undefined,
        zoom,
        { globalState: layer._states.global },
      );
      let candidate;
      if (evaluated.show && evaluated.paint["background-opacity"] > 0) {
        const bounds = layer._extent;
        const instance = geometry.background(
          bounds.width,
          bounds.height,
          evaluated,
          layer._patterns?.metadata,
        );
        candidate = layer._globe
          ? new GlobeBackground(layer, evaluated)
          : new VectorBatch(
              layer,
              { bounds },
              { kind: "fill", instances: [instance], pattern },
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
    record.batch?.setRegions([layer._extent]);
  }
}

function selectRender(state) {
  state.render.clear();
  const regions = renderCover.select(
    state.visible,
    Array.from(state.entries.values()),
  );
  for (const { entry, region } of regions) {
    let bounds = state.render.get(entry);
    if (bounds === undefined) {
      bounds = [];
      state.render.set(entry, bounds);
    }
    bounds.push(region.bounds);
  }
}

function updateEntry(
  layer,
  id,
  state,
  entry,
  zoom,
  frameState,
  uploads,
  budget,
) {
  const desiredSignature = entrySignature(state, entry);
  if (entry.work && entry.work.signature !== desiredSignature) {
    discardPreparation(entry);
  }
  const needsUpload =
    entry.state === "received" ||
    (entry.state === "ready" && entry.signature !== desiredSignature);
  if (needsUpload) {
    try {
      prepareEntry(layer, state, entry, zoom);
      if (
        uploads < layer._maximumUploadsPerFrame &&
        createBatches(layer, state, entry, frameState, budget)
      ) {
        uploads++;
      }
    } catch (error) {
      discardPreparation(entry);
      fail(entry, error);
    }
  }
  for (const group of entry.batches.values()) {
    for (const batch of group) {
      batch.update(frameState);
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
  return uploads;
}

function updateSources(layer, zoom, frameState) {
  for (const state of layer._sources.values()) {
    state.signature =
      signature(state.records, zoom) +
      (layer._symbols ? `/symbols/${Math.floor(zoom)}` : "");
    const desired =
      state.records.length === 0
        ? []
        : layer._globe
          ? GlobeCover.select(layer, frameState, state.source)
          : cover.select(
              frameState,
              state.source,
              layer._maximumVisibleTiles,
              layer._world.maximumTiltedTileDistance,
              layer._ground ? layer._groundHeights : undefined,
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
    selectRender(state);
    let spareSlots = layer._tileCacheSize - state.visible.length;
    for (const entry of state.render.keys()) {
      if (!protectedKeys.has(entry.key) && spareSlots > 0) {
        protectedKeys.add(entry.key);
        spareSlots--;
      }
    }
    const desiredEntries = new Set(state.visible);
    const candidates = [];
    for (const entry of state.entries.values()) {
      if (!desiredEntries.has(entry)) {
        cancel(layer, entry);
        if (!state.render.has(entry)) {
          discardPreparation(entry);
        }
      }
      if (!protectedKeys.has(entry.key)) {
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
    selectRender(state);
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
  const budget = (layer._uploadBudget = {
    deadline: performance.now() + layer._maximumUploadTimePerFrame,
    bytes: 0,
  });
  for (const [id, state] of layer._sources) {
    for (const entry of state.visible) {
      uploads = updateEntry(
        layer,
        id,
        state,
        entry,
        zoom,
        frameState,
        uploads,
        budget,
      );
    }
    selectRender(state);
    for (const entry of state.render.keys()) {
      if (!state.visible.includes(entry)) {
        uploads = updateEntry(
          layer,
          id,
          state,
          entry,
          zoom,
          frameState,
          uploads,
          budget,
        );
        entry.lastUsed = frameState.frameNumber;
      }
    }
  }
}

function publishOrder(layer) {
  layer._drawOrder.length = 0;
  for (const record of layer._records) {
    if (record.definition.type === "symbol") {
      layer._drawOrder.push(
        ...(layer._symbols.batches.get(record.definition.id) ?? []),
      );
      continue;
    }
    if (record.definition.type === "background") {
      if (record.batch !== undefined) {
        layer._drawOrder.push(record.batch);
      }
      continue;
    }
    const state = layer._sources.get(record.definition.source);
    for (const [entry, regions] of state.render) {
      for (const batch of entry.batches.get(record.definition.id) ?? []) {
        batch.setRegions(regions);
        layer._drawOrder.push(batch);
      }
    }
  }
  layer._tilesLoaded = true;
  for (const state of layer._sources.values()) {
    for (const entry of state.visible) {
      if (
        entry.state !== "failed" &&
        (entry.state !== "ready" ||
          entry.signature !== entrySignature(state, entry))
      ) {
        layer._tilesLoaded = false;
      }
    }
    for (const entry of state.render.keys()) {
      if (
        entry.state !== "failed" &&
        entry.signature !== entrySignature(state, entry)
      ) {
        layer._tilesLoaded = false;
      }
    }
  }
}

/**
 * Renders independently decoded vector tiles on a SceneGIS planar world or WGS84 Globe.
 * Add this object to scene.primitives. The collection then owns its lifetime.
 * Construction does not request data or allocate GPU resources. Scene, World,
 * style, and source overrides are borrowed. Rule setters derive a layer-owned immutable style;
 * source configuration remains fixed. GPU refresh is asynchronous and preserves source caches.
 * Uses a flat fast path without a terrainProvider, and direct ground rendering
 * with a provider. Ground rendering requires WebGL2, float and depth textures.
 * Published resident ancestors or descendants cover pending desired tiles
 * within the cache budget. A cache without spare slots may evict that coverage.
 * @alias SceneGISVectorTileLayer
 * @constructor
 * @experimental This API is experimental and subject to change.
 * @param {object} options Layer configuration.
 * @param {Scene} options.scene The live SCENE3D Scene with a planar world or WGS84 Globe.
 * @param {SceneGISPlanarTilingScheme} [options.tilingScheme] Vector source matrix. Planar uses the World identity; Globe defaults to the EPSG:3857 single-root matrix.
 * @param {SceneGISVectorTileStyle|object} options.style A V1 style within the flat V3B1 rendered profile.
 * @param {Object.<string, SceneGISVectorTileSource>} [options.sources] Source overrides using the world's scheme.
 * @param {number} [options.tileCacheSize=64] Maximum resident tiles per source, including visible tiles.
 * @param {number} [options.maximumVisibleTiles=32] Maximum desired tiles per source; coarsen LOD within availability to fit.
 * @param {number} [options.maximumRequests=8] Maximum in-flight requests for this layer.
 * @param {number} [options.maximumUploadsPerFrame=2] Maximum tile batch publications per normal frame.
 * @param {number} [options.maximumUploadTimePerFrame=4] Soft CPU milliseconds for tile GPU publication per normal frame.
 * @param {number} [options.maximumUploadBytesPerFrame=4194304] Soft tile buffer upload byte budget per normal frame. One indivisible batch may exceed it.
 * @param {number} [options.maximumSymbolCandidates=2048] Maximum point-symbol candidates per view, selected by style priority.
 * @param {number} [options.maximumGlyphRanges=64] Maximum cached 256-code-point glyph pages; active pages cannot be evicted.
 * @param {number} [options.maximumSymbolRequests=4] Maximum concurrent glyph/sprite resource jobs.
 * @param {number} [options.opacity=1] Per-feature opacity multiplier in [0, 1]; not composited group opacity.
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
    (!(scene.world instanceof SceneGISPlanarWorld) &&
      !(scene.world instanceof Globe)) ||
    scene.world.isDestroyed()
  ) {
    throw new DeveloperError(
      "scene must have a live SceneGISPlanarWorld or Globe.",
    );
  }
  const globe = scene.world instanceof Globe;
  if (
    globe &&
    (!scene.world.ellipsoid.equals(Ellipsoid.WGS84) ||
      scene.mode !== SceneMode.SCENE3D)
  ) {
    throw new DeveloperError(
      "Globe vector rendering requires WGS84 in SCENE3D.",
    );
  }
  const tilingScheme = globe
    ? GlobeCoordinates.scheme(options.tilingScheme)
    : scene.world.tilingScheme;
  if (
    !globe &&
    options.tilingScheme !== undefined &&
    options.tilingScheme !== tilingScheme
  ) {
    throw new DeveloperError(
      "Planar vector sources must use the World's canonical tilingScheme.",
    );
  }
  const style =
    options.style instanceof SceneGISVectorTileStyle
      ? options.style
      : new SceneGISVectorTileStyle(options.style);
  this._tileCacheSize = integerOption(options, "tileCacheSize", 64);
  this._maximumUploadTimePerFrame = options.maximumUploadTimePerFrame ?? 4;
  if (
    !Number.isFinite(this._maximumUploadTimePerFrame) ||
    this._maximumUploadTimePerFrame <= 0
  ) {
    throw new DeveloperError(
      "maximumUploadTimePerFrame must be finite and positive.",
    );
  }
  this._maximumUploadBytesPerFrame = integerOption(
    options,
    "maximumUploadBytesPerFrame",
    4194304,
  );
  this._preparing = 0;
  this._decodedFeatures = 0;
  this._decodeMs = 0;
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
  const opacity = options.opacity ?? 1;
  validateOpacity(opacity);
  this._opacity = opacity;
  this._records = style.layerIds.map((id) => layerRecord(style, id));
  if (
    options.sources !== undefined &&
    (options.sources === null ||
      typeof options.sources !== "object" ||
      Array.isArray(options.sources))
  ) {
    throw new DeveloperError("sources must be an object of source overrides.");
  }
  this._sources = prepareSources(tilingScheme, style, options.sources ?? {});
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
  this._globe = globe;
  this._tilingScheme = tilingScheme;
  this._extent = tilingScheme.coordinateSystem.extent;
  this._ground = scene.world.terrainProvider !== undefined;
  this._groundHeights = new Cartesian2();
  this._groundGeometry = new Map();
  this._style = style;
  this._states = new StateStore(this);
  this._show = options.show ?? true;
  this._allowPicking = options.allowPicking ?? true;
  this._errorEvent = new Event();
  this._ready = false;
  this._tilesLoaded = false;
  this._pendingRequests = 0;
  this._drawOrder = [];
  this._uploads = 0;
  this._zoom = undefined;
  const maximumSymbolCandidates = integerOption(
    options,
    "maximumSymbolCandidates",
    2048,
  );
  const maximumGlyphRanges = integerOption(options, "maximumGlyphRanges", 64);
  const maximumSymbolRequests = integerOption(
    options,
    "maximumSymbolRequests",
    4,
  );
  const extent = this._extent;
  this._workers = new WorkerPool({
    extent: {
      minimumX: extent.minimumX,
      minimumY: extent.minimumY,
      maximumX: extent.maximumX,
      maximumY: extent.maximumY,
    },
    style: style._snapshot,
  });
  this._maximumGlyphRanges = maximumGlyphRanges;
  this._maximumSymbolRequests = maximumSymbolRequests;
  this._symbols = this._records.some(
    (record) => record.definition.type === "symbol",
  )
    ? new Symbols(
        this,
        maximumSymbolCandidates,
        maximumGlyphRanges,
        maximumSymbolRequests,
      )
    : undefined;
  this._patterns = this._records.some(
    ({ definition }) =>
      definition.paint?.[`${definition.type}-pattern`] !== undefined,
  )
    ? new Patterns(this, maximumGlyphRanges, maximumSymbolRequests)
    : undefined;
}

function validateOpacity(value) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new DeveloperError("opacity must be a finite number in [0, 1].");
  }
}

Object.defineProperties(SceneGISVectorTileLayer.prototype, {
  /**
   * Multiplies each feature's style opacity, including backgrounds and symbols.
   * This is not composited group opacity. Zero skips drawing and picking while retaining data.
   * @memberof SceneGISVectorTileLayer.prototype
   * @type {number}
   * @default 1
   */
  opacity: {
    get: function () {
      return this._opacity;
    },
    set: function (value) {
      validateOpacity(value);
      if (value !== this._opacity) {
        this._opacity = value;
        this._scene.requestRender();
      }
    },
  },
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
   * The current immutable style frontend. Successful rule setters replace this reference;
   * previously returned or caller-supplied styles remain unchanged.
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
      return (
        this._tilesLoaded &&
        (this._patterns?.loaded ?? true) &&
        (this._symbols?.loaded ?? true) &&
        (!this._globe ||
          (!GlobeTerrain.pending(this) &&
            !this._drawOrder.some(extrusionAnchoring.pending)))
      );
    },
  },
  /**
   * Reports failures during normal update. Tile errors contain source/tile; symbol errors contain resource instead.
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
      let renderedTiles = 0;
      let fallbackTiles = 0;
      let renderRegions = 0;
      for (const state of this._sources.values()) {
        residentTiles += state.entries.size;
        visibleTiles += state.visible.length;
        failedTiles += state.visible.filter(
          (entry) => entry.state === "failed",
        ).length;
        renderedTiles += state.render.size;
        for (const [entry, regions] of state.render) {
          renderRegions += regions.length;
          if (!state.visible.includes(entry)) {
            fallbackTiles++;
          }
        }
      }
      return {
        decodedFeatures: this._decodedFeatures,
        decodeMs: this._decodeMs,
        preparationTasks: this._preparing,
        workerTasks: this._workers.statistics.completed,
        workerMs: this._workers.statistics.workerMs,
        residentTiles,
        visibleTiles,
        failedTiles,
        renderedTiles,
        fallbackTiles,
        renderRegions,
        pendingRequests: this._pendingRequests,
        drawCommands: this._drawOrder.reduce(
          (count, batch) => count + batch.renderCommands.length,
          0,
        ),
        uploads: this._uploads,
        zoom: this._zoom,
        ...(this._symbols
          ? {
              symbolCandidates: this._symbols.statistics.candidates,
              placedSymbols: this._symbols.statistics.placed,
              truncatedSymbols: this._symbols.statistics.truncated,
              duplicateSymbols: this._symbols.statistics.duplicates,
              pendingSymbolRequests: this._symbols.assets.pending,
              symbolFailures: this._symbols._reported.size,
              missingSymbolImages: [...this._symbols._missingImages],
              glyphRanges: this._symbols.assets.pages.size,
              glyphCpuBytes: [...this._symbols.assets.pages.values()].reduce(
                (sum, page) => sum + (page.cpuBytes ?? 0),
                0,
              ),
              symbolTextureBytes: [
                ...this._symbols.assets.pages.values(),
                this._symbols.assets.sprite,
              ].reduce(
                (sum, page) => sum + (page?.texture?.sizeInBytes ?? 0),
                0,
              ),
            }
          : {}),
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
    frameState.mode !== SceneMode.SCENE3D
  ) {
    throw new DeveloperError(
      "The vector layer must update in its original SCENE3D World.",
    );
  }
  if (this._globe && !this._surfaceRegistered) {
    const state = this._scene._globeTranslucencyState;
    (state._sceneGISSurfaceOverlays ??= new Set()).add(this);
    this._surfaceRegistered = true;
  }
  if (!this._show || !this._world.show) {
    if (frameState.passes.render) {
      clearView(this);
    }
    return;
  }
  if (frameState.passes.render) {
    const provider = this._world.terrainProvider;
    const ground = provider !== undefined;
    if (ground !== this._ground) {
      this._ground = ground;
      this._symbols?.clear();
      this._drawOrder.length = 0;
      for (const record of this._backgrounds) {
        record.batch?.destroy();
        record.batch = undefined;
        record.signature = undefined;
      }
      for (const state of this._sources.values()) {
        state.render.clear();
        for (const entry of state.entries.values()) {
          discardPreparation(entry);
          for (const batches of entry.batches.values()) {
            for (const batch of batches) {
              batch.destroy();
            }
          }
          entry.batches.clear();
          entry.layerSignatures = undefined;
          entry.signature = undefined;
          if (entry.data) {
            entry.state = "received";
          }
        }
      }
    }
    if (ground) {
      // The volume envelope includes the pending zero-height surface. The one
      // metre guard encloses boundary samples; it never offsets map geometry.
      if (this._globe) {
        GlobeTerrain.heights(this, undefined, this._groundHeights);
        this._globeSelectionHeights = Cartesian2.clone(
          this._groundHeights,
          this._globeSelectionHeights,
        );
        if (!(provider instanceof EllipsoidTerrainProvider)) {
          this._groundHeights.x = Math.min(-100000, this._groundHeights.x);
          this._groundHeights.y = Math.max(10000, this._groundHeights.y);
        }
      } else {
        this._groundHeights.x = Math.min(0, provider.minimumHeight) - 1;
        this._groundHeights.y = Math.max(0, provider.maximumHeight) + 1;
      }
    }
    if (this._globe) {
      GlobeTerrain.update(this);
    } else {
      updateTerrain(this);
    }
    const zoom = this._globe
      ? GlobeCover.computeZoom(this, frameState)
      : cover.computeZoom(frameState, this._extent.width);
    this._zoom = zoom;
    if (zoom === undefined) {
      clearView(this);
      return;
    }
    this._metersPerPixel = this._extent.width / (512 * 2 ** zoom);
    this._patterns?.update(frameState.context);
    updateBackgrounds(this, zoom, frameState);
    updateSources(this, zoom, frameState);
    if (this._symbols) {
      try {
        this._symbols.update(frameState, zoom);
      } catch (error) {
        this._symbols.report("symbol-runtime", error);
        this._symbols.loaded = true;
      }
    }
    publishOrder(this);
    if (this._globe) {
      GlobeTerrain.schedule(this);
    }
    this._ready = true;
    if (!this.tilesLoaded) {
      this._scene.requestRender();
    }
  }
  if (this._opacity === 0) {
    return;
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

function setRule(layer, layerId, scope, name, value) {
  const style = layer._style._withRule(layerId, scope, name, value);
  if (style === layer._style) {
    return;
  }
  const index = layer._records.findIndex(
    (record) => record.definition.id === layerId,
  );
  const previous = layer._records[index];
  const record = layerRecord(style, layerId);
  record.stateRevision = (previous.stateRevision ?? 0) + 1;
  record.styleRevision = (previous.styleRevision ?? 0) + 1;
  record.context = { globalState: layer._states.global };
  if (
    !layer._patterns &&
    record.definition.paint?.[`${record.definition.type}-pattern`] !== undefined
  ) {
    layer._patterns = new Patterns(
      layer,
      layer._maximumGlyphRanges,
      layer._maximumSymbolRequests,
    );
  }
  layer._style = style;
  layer._records[index] = record;
  layer._workers.configuration = {
    ...layer._workers.configuration,
    style: style._snapshot,
  };
  if (record.definition.type === "background") {
    record.batch = previous.batch;
    layer._backgrounds[layer._backgrounds.indexOf(previous)] = record;
  } else {
    const source = layer._sources.get(record.definition.source);
    source.records[source.records.indexOf(previous)] = record;
    source.styleRevision = (source.styleRevision ?? 0) + 1;
    // A new valid rule can repair a failed preparation without re-fetching MVT.
    for (const entry of source.entries.values()) {
      if (entry.state === "failed" && entry.data !== undefined) {
        entry.state = entry.signature === undefined ? "received" : "ready";
      }
    }
  }
  layer._tilesLoaded = false;
  layer._scene.requestRender();
}

/**
 * Changes one existing style layer's paint rule. Input is copied and validated synchronously.
 * Null removes the explicit rule and restores the profile default; undefined is invalid.
 * Getters reflect a successful change immediately. Normal renders asynchronously prepare affected
 * batches or symbol candidates using cached MVT; old content remains until replacement is ready.
 * Hidden layers retain edits until shown. Sources, opacity and feature/global state are preserved.
 * No GPU work occurs in this method. Asynchronous failures use errorEvent; tilesLoaded describes
 * current-view pending work, not success. Unchanged rules do not schedule work.
 * @param {string} styleLayerId ID inside the Style document, not a resource-tree ID.
 * @param {string} name Supported paint property for this style layer's type.
 * @param {*} value A finite JSON literal/expression, or null to remove the rule.
 * @exception {DeveloperError} The layer, property or value is invalid, or this object was destroyed.
 */
SceneGISVectorTileLayer.prototype.setPaintProperty = function (
  styleLayerId,
  name,
  value,
) {
  setRule(this, styleLayerId, "paint", name, value);
};

/**
 * Gets an independent copy of the explicit, unevaluated paint rule.
 * @param {string} styleLayerId ID inside the Style document.
 * @param {string} name Supported paint property.
 * @returns {*} JSON rule, or undefined when not explicitly set (including after removal).
 * @exception {DeveloperError} The layer/property is invalid or this object was destroyed.
 */
SceneGISVectorTileLayer.prototype.getPaintProperty = function (
  styleLayerId,
  name,
) {
  return this._style._getRule(styleLayerId, "paint", name);
};

/**
 * Changes an existing style layer's layout rule, including visibility.
 * Uses the validation, null-removal, immediate getter and asynchronous refresh semantics of setPaintProperty.
 * Symbol edits re-prepare affected candidates and placement, retaining reusable glyph/sprite/shaping resources.
 * @param {string} styleLayerId ID inside the Style document.
 * @param {string} name Supported layout property for this style layer's type.
 * @param {*} value A finite JSON literal/expression, or null to restore the default.
 * @exception {DeveloperError} The layer, property or value is invalid, or this object was destroyed.
 */
SceneGISVectorTileLayer.prototype.setLayoutProperty = function (
  styleLayerId,
  name,
  value,
) {
  setRule(this, styleLayerId, "layout", name, value);
};

/**
 * Gets an independent copy of the explicit, unevaluated layout rule.
 * @param {string} styleLayerId ID inside the Style document.
 * @param {string} name Supported layout property.
 * @returns {*} JSON rule, or undefined when not explicitly set.
 * @exception {DeveloperError} The layer/property is invalid or this object was destroyed.
 */
SceneGISVectorTileLayer.prototype.getLayoutProperty = function (
  styleLayerId,
  name,
) {
  return this._style._getRule(styleLayerId, "layout", name);
};

/**
 * Changes a non-background style layer's filter. Null removes filtering; undefined is invalid.
 * Validates synchronously, then refreshes affected batches/candidates asynchronously from cached MVT.
 * Getters reflect the accepted filter immediately; in-flight older results cannot overwrite it.
 * @param {string} styleLayerId ID inside the Style document.
 * @param {Array|null} filter A supported expression/legacy filter, or null to remove it.
 * @exception {DeveloperError} The layer/filter is invalid or this object was destroyed.
 */
SceneGISVectorTileLayer.prototype.setFilter = function (styleLayerId, filter) {
  setRule(this, styleLayerId, "filter", undefined, filter);
};

/**
 * Gets an independent copy of the explicit filter.
 * @param {string} styleLayerId Non-background ID inside the Style document.
 * @returns {Array|undefined} The filter, or undefined when not set.
 * @exception {DeveloperError} The layer is invalid or this object was destroyed.
 */
SceneGISVectorTileLayer.prototype.getFilter = function (styleLayerId) {
  return this._style._getRule(styleLayerId, "filter");
};

/**
 * Returns an independent complete Style v8 JSON snapshot of all accepted rules, including pending edits.
 * Does not wait for GPU refresh. Includes original name/metadata/source/resource definitions and omits
 * temporary feature/global state, Layer show/opacity, and source override objects.
 * @returns {object} A mutable JSON snapshot; modifying it does not change this Layer.
 * @exception {DeveloperError} This object was destroyed.
 */
SceneGISVectorTileLayer.prototype.getStyle = function () {
  return this._style._getSnapshot();
};

/**
 * Identifies an MVT feature across tile and level boundaries.
 * @typedef {object} SceneGISVectorTileLayer.FeatureIdentifier
 * @property {string} source Style source ID.
 * @property {string} sourceLayer MVT source-layer name.
 * @property {string|number} id Feature ID; numeric IDs must be safe integers.
 */

/**
 * Merges JSON properties into a feature's paint state. Applies on subsequent normal renders without requesting MVT again.
 * State persists across tile eviction until removed or the layer is destroyed. Features sharing source/sourceLayer/id share state.
 * @param {SceneGISVectorTileLayer.FeatureIdentifier} target Feature identity.
 * @param {object} state Finite JSON properties; input is copied.
 * @exception {DeveloperError} The identity or JSON data is invalid.
 */
SceneGISVectorTileLayer.prototype.setFeatureState = function (target, state) {
  this._states.set(target, state, false);
};

/**
 * Returns a copy of a feature's state, or an empty object.
 * @param {SceneGISVectorTileLayer.FeatureIdentifier} target Feature identity.
 * @returns {object} Independent JSON snapshot.
 * @exception {DeveloperError} The identity is invalid.
 */
SceneGISVectorTileLayer.prototype.getFeatureState = function (target) {
  return State.copy(this._states.get(target));
};

/**
 * Deletes one state property, or all state for the specified feature.
 * @param {SceneGISVectorTileLayer.FeatureIdentifier} target Feature identity.
 * @param {string} [key] Property to remove; omit to remove the feature state.
 * @exception {DeveloperError} The identity or key is invalid.
 */
SceneGISVectorTileLayer.prototype.removeFeatureState = function (target, key) {
  this._states.set(target, undefined, true, key);
};

/**
 * Sets a layer-scoped global paint property. Null deletes the property; expressions should supply their own defaults.
 * @param {string} key Property name.
 * @param {*} value Finite JSON value, or null to remove the property.
 * @exception {DeveloperError} The key or JSON value is invalid.
 */
SceneGISVectorTileLayer.prototype.setGlobalStateProperty = function (
  key,
  value,
) {
  this._states.setGlobal(key, value);
};

/**
 * Returns a copy of all layer-scoped global paint state.
 * @returns {object} Independent JSON snapshot.
 */
SceneGISVectorTileLayer.prototype.getGlobalState = function () {
  return State.copy(this._states.global);
};

/**
 * Cancels requests and destroys all owned batches. Borrowed Scene, World, style, and sources remain live.
 * After destruction only isDestroyed may be called.
 * @returns {undefined}
 */
SceneGISVectorTileLayer.prototype.destroy = function () {
  if (this._surfaceRegistered) {
    const state = this._scene._globeTranslucencyState;
    state._sceneGISSurfaceOverlays.delete(this);
    if (state._sceneGISSurfaceOverlays.size === 0) {
      state._sceneGISSurfaceOverlays = undefined;
    }
  }
  this._workers.destroy();
  this._symbols?.destroy();
  this._patterns?.destroy();
  for (const record of this._backgrounds) {
    record.batch?.destroy();
  }
  for (const state of this._sources.values()) {
    for (const entry of state.entries.values()) {
      release(this, entry);
    }
    state.entries.clear();
    state.visible.length = 0;
    state.render.clear();
  }
  this._drawOrder.length = 0;
  this._terrain = undefined;
  this._groundRanges = undefined;
  this._globeCoverCache = undefined;
  this._globeTerrainCache = undefined;
  this._globeTerrainEntries = undefined;
  this._states.sources.clear();
  this._states.global = State.empty;
  return destroyObject(this);
};

export default SceneGISVectorTileLayer;

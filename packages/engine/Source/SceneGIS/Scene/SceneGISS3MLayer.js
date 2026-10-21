import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import createGuid from "../../Core/createGuid.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Intersect from "../../Core/Intersect.js";
import Matrix4 from "../../Core/Matrix4.js";
import Request from "../../Core/Request.js";
import RequestType from "../../Core/RequestType.js";
import Resource from "../../Core/Resource.js";
import RuntimeError from "../../Core/RuntimeError.js";
import TaskProcessor from "../../Core/TaskProcessor.js";
import Transforms from "../../Core/Transforms.js";
import Axis from "../../Scene/Axis.js";
import Globe from "../../Scene/Globe.js";
import Model from "../../Scene/Model/Model.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";

function validatePlacement(options) {
  const world = options.world;
  if (
    world !== undefined &&
    (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed())
  ) {
    throw new DeveloperError("world must be a live SceneGISPlanarWorld.");
  }
  const matrix = options.modelMatrix;
  if (world && matrix === undefined) {
    throw new DeveloperError(
      "Planar S3M requires an explicit local-to-World modelMatrix.",
    );
  }
  if (matrix !== undefined) {
    validateMatrix(matrix);
  }
}

function validateMatrix(matrix) {
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(matrix?.[i])) {
      throw new DeveloperError("modelMatrix must be finite and affine.");
    }
  }
  if (
    matrix[3] !== 0 ||
    matrix[7] !== 0 ||
    matrix[11] !== 0 ||
    matrix[15] !== 1 ||
    Matrix4.getMaximumScale(matrix) === 0
  ) {
    throw new DeveloperError(
      "modelMatrix must be finite and affine with nonzero scale.",
    );
  }
}

function positive(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DeveloperError(`${name} must be positive and finite.`);
  }
  return value;
}

function integer(value, name, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new DeveloperError(`${name} must be an integer >= ${minimum}.`);
  }
  return value;
}

function readConfig(config, options) {
  const type = config.extensions?.["s3m:FileType"];
  if (
    Number(config.version) !== 1 ||
    !["OSGBCacheFile", "OSGBFile"].includes(type) ||
    config.lodType !== "Replace" ||
    !Array.isArray(config.tiles) ||
    config.tiles.length === 0
  ) {
    throw new RuntimeError(
      "Expected a S3M 1.0 JSON SCP with Replace LOD and OSGBCacheFile/OSGBFile content.",
    );
  }
  let matrix = options.modelMatrix;
  if (matrix === undefined) {
    const p = config.position;
    if (
      p?.units !== "Degree" ||
      ![p.x, p.y, p.z].every(Number.isFinite) ||
      Math.abs(p.y) > 90
    ) {
      throw new RuntimeError(
        "S3M placement requires a Degree position or an explicit modelMatrix.",
      );
    }
    matrix = Transforms.eastNorthUpToFixedFrame(
      Cartesian3.fromDegrees(p.x, p.y, p.z),
    );
  }
  matrix = Matrix4.clone(matrix);
  const roots = config.tiles.map((tile) => {
    const { min, max } = tile.boundingbox ?? {};
    if (
      typeof tile.url !== "string" ||
      tile.url.length === 0 ||
      !min ||
      !max ||
      ![min.x, min.y, min.z, max.x, max.y, max.z].every(Number.isFinite) ||
      min.x > max.x ||
      min.y > max.y ||
      min.z > max.z
    ) {
      throw new RuntimeError("Invalid S3M root URL or bounding box.");
    }
    return {
      url: tile.url,
      localSphere: BoundingSphere.fromCornerPoints(min, max),
    };
  });
  return { matrix, roots };
}

function newTile(resource, localSphere, matrix, depth) {
  return {
    resource,
    localSphere: BoundingSphere.clone(localSphere),
    sphere: BoundingSphere.transform(localSphere, matrix),
    depth,
    state: "unloaded",
    generation: 0,
    lastUsed: 0,
    pages: [],
    request: undefined,
    buffer: undefined,
    decoded: undefined,
    pending: undefined,
    failure: undefined,
    counted: false,
  };
}

function isReady(tile) {
  return tile?.state === "ready";
}

function placePage(layer, page) {
  if (page.model) {
    page.model.modelMatrix = Matrix4.clone(
      layer._appliedMatrix,
      page.model.modelMatrix,
    );
  }
  if (!page.child && page.model?.ready) {
    // Legacy leaf metadata may contain placeholder bounds. Native Model computes
    // its actual world bounds from the new matrix without requiring a draw.
    BoundingSphere.clone(page.model.boundingSphere, page.sphere);
  } else {
    BoundingSphere.transform(
      page.localSphere,
      layer._appliedMatrix,
      page.sphere,
    );
  }
  page.range =
    page.localRange * (page.rangeMode === 1 ? 1 : layer._matrixScale);
}

function updatePlacement(layer) {
  if (Matrix4.equals(layer._matrix, layer._appliedMatrix)) {
    return;
  }
  validateMatrix(layer._matrix);
  Matrix4.clone(layer._matrix, layer._appliedMatrix);
  layer._matrixScale = Matrix4.getMaximumScale(layer._appliedMatrix);
  for (const tile of layer._tiles.values()) {
    BoundingSphere.transform(
      tile.localSphere,
      layer._appliedMatrix,
      tile.sphere,
    );
    for (const page of tile.pages) {
      placePage(layer, page);
    }
    for (const page of tile.pending ?? []) {
      placePage(layer, page);
    }
  }
}

const pixelScratch = new Cartesian2();

function refinePage(layer, page, frameState) {
  const distance = Math.max(
    0.001,
    Cartesian3.distance(frameState.camera.positionWC, page.sphere.center) -
      page.sphere.radius,
  );
  if (page.rangeMode === 0) {
    return distance * layer._lodRangeScale < page.range;
  }
  frameState.camera.frustum.getPixelDimensions(
    frameState._sceneGISObserverViewport ??
      frameState.context.drawingBufferWidth,
    frameState._sceneGISObserverViewport ??
      frameState.context.drawingBufferHeight,
    distance,
    page.rangeMode === 1 ? 1 : (frameState.pixelRatio ?? 1),
    pixelScratch,
  );
  const metersPerPixel = pixelScratch.y;
  if (page.rangeMode === 1) {
    return (
      page.sphere.radius / metersPerPixel > page.range * layer._lodRangeScale
    );
  }
  return (
    page.range / metersPerPixel >
    layer._maximumScreenSpaceError * layer._lodRangeScale
  );
}

/**
 * A S3M 1.0 mesh layer using native Model rendering, metadata picking and GPU
 * instancing. Create with {@link SceneGISS3MLayer.fromUrl}, then add to
 * scene.primitives. Supports SCENE3D only.
 *
 * Planar coordinates are local metres transformed by an explicit modelMatrix;
 * no CRS projection is performed. The layer owns its Models, Worker and requests,
 * but does not own the World. Use camera.flyToBoundingSphere(layer.boundingSphere)
 * to frame it. Picked ModelFeature objects expose s3mId, idKind and geometry;
 * their primitive.id is this layer. Missing authored IDs use idKind="geometry".
 *
 * @alias SceneGISS3MLayer
 * @constructor
 * @param {object} options Internal factory options.
 */
function SceneGISS3MLayer(options) {
  if (!options?._config || !options._resource) {
    throw new DeveloperError("Use SceneGISS3MLayer.fromUrl to create a layer.");
  }
  validatePlacement(options);
  const { matrix, roots } = readConfig(options._config, options);
  this._world = options.world;
  this._matrix = matrix;
  this._appliedMatrix = Matrix4.clone(matrix);
  this._matrixScale = Matrix4.getMaximumScale(matrix);
  this._resource = options._resource;
  this._guid = createGuid();
  this._scene = undefined;
  this._context = undefined;
  this._destroyed = false;
  this._worker = undefined;
  this._tiles = new Map();
  this._selected = [];
  this._protected = new Set();
  this._pendingCount = 0;
  this._frame = 0;
  this._requestCount = 0;
  this._failureCount = 0;
  this._tilesLoaded = false;
  this._tileFailed = new Event();
  this._maximumRequests = integer(
    options.maximumRequests ?? 6,
    "maximumRequests",
    1,
  );
  this._maximumCachedTiles = integer(
    options.maximumCachedTiles ?? 64,
    "maximumCachedTiles",
    1,
  );
  this._maximumCachedBytes = positive(
    options.maximumCachedBytes ?? 256 * 1024 * 1024,
    "maximumCachedBytes",
  );
  this._maximumDepth = options.maximumDepth ?? Infinity;
  if (this._maximumDepth !== Infinity) {
    integer(this._maximumDepth, "maximumDepth", 0);
  }
  this._lodRangeScale = positive(options.lodRangeScale ?? 1, "lodRangeScale");
  this._maximumScreenSpaceError = positive(
    options.maximumScreenSpaceError ?? 16,
    "maximumScreenSpaceError",
  );
  /**
   * Whether the layer renders and requests new content. Existing cached content
   * remains owned until eviction or destroy. Request a frame after changing it
   * when using Scene.requestRenderMode.
   * @type {boolean}
   * @default true
   */
  this.show = options.show ?? true;
  this._credit = options.credit;
  this._statistics = {
    requests: 0,
    failedTiles: 0,
    cachedTiles: 0,
    pendingTiles: 0,
    selectedPages: 0,
    selectedDepth: 0,
    geometryByteLength: 0,
    texturesByteLength: 0,
  };
  // iServer layer configs resolve content through data/path, unlike direct SCPs.
  const path = this._resource.url.split("?")[0];
  const isServer = /\/rest\/realspace\/datas\/[^/]+\/config\/?$/i.test(path);
  this._roots = roots.map((root) => {
    const relative = !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(root.url);
    const prefix =
      isServer && relative
        ? `${path.endsWith("/") ? "../" : ""}data/path/`
        : "";
    const resource = this._resource.getDerivedResource({
      url: `${prefix}${root.url.replace(/^\.\//, "")}`,
    });
    const tile = newTile(resource, root.localSphere, matrix, 0);
    this._tiles.set(resource.url, tile);
    return tile;
  });
  this._boundingSphere = BoundingSphere.fromBoundingSpheres(
    this._roots.map((r) => r.sphere),
  );
}

/**
 * Loads a S3M 1.0 JSON SCP or iServer layer config. Resolution means config ready;
 * content is requested after the layer is added to a matching Scene.
 *
 * @param {string|Resource} url Configuration URL, preserving Resource headers and query parameters.
 * @param {object} [options] Object with the following properties:
 * @param {SceneGISPlanarWorld} [options.world] Explicit live planar World; omit for a Globe.
 * @param {Matrix4} [options.modelMatrix] Local metre coordinates to world coordinates. Required for planar.
 * @param {boolean} [options.show=true] Whether to render and request content.
 * @param {number} [options.lodRangeScale=1] Multiplier for authored distance and pixel LOD ranges.
 * @param {number} [options.maximumScreenSpaceError=16] Threshold for geometric-error range mode.
 * @param {number} [options.maximumDepth=Infinity] Explicit subtree depth cap, with root depth zero.
 * @param {number} [options.maximumRequests=6] Maximum in-flight content pipelines, including decode and GPU preparation.
 * @param {number} [options.maximumCachedTiles=64] Soft content-cache limit; visible coverage and its ancestors are retained.
 * @param {number} [options.maximumCachedBytes=268435456] Soft GPU buffer/texture budget; visible coverage may exceed it.
 * @param {Credit} [options.credit] Optional attribution displayed while rendering.
 * @returns {Promise<SceneGISS3MLayer>} A config-ready layer.
 */
SceneGISS3MLayer.fromUrl = async function (url, options = {}) {
  validatePlacement(options);
  if (url === undefined) {
    throw new DeveloperError("url is required.");
  }
  const resource = Resource.createIfNeeded(url).clone();
  const config = await resource.fetchJson();
  // Revalidate live World state after the asynchronous configuration fetch.
  return new SceneGISS3MLayer({
    ...options,
    _config: config,
    _resource: resource,
  });
};

Object.defineProperties(SceneGISS3MLayer.prototype, {
  /**
   * Complete local-metre-to-World placement matrix, including the SCP ENU frame
   * when the Globe placement was inferred. Assigning replaces that placement;
   * it is not an extra transform multiplied by the SCP frame.
   * Assignment clones the input and requests a frame. The getter returns a live
   * matrix, like Cesium3DTileset.modelMatrix; after editing it in place, request
   * a frame when using Scene.requestRenderMode.
   * Normal rendering applies changes to cached and subsequently loaded content,
   * culling and LOD without decoding again. Pick-only passes retain the last
   * normal-render placement. boundingSphere reflects edits immediately.
   * @memberof SceneGISS3MLayer.prototype
   * @type {Matrix4}
   * @exception {DeveloperError} The matrix must be finite and affine with nonzero scale.
   */
  modelMatrix: {
    get: function () {
      return this._matrix;
    },
    set: function (value) {
      validateMatrix(value);
      Matrix4.clone(value, this._matrix);
      this._wake();
    },
  },
  /** @memberof SceneGISS3MLayer.prototype
   * @type {SceneGISPlanarWorld|undefined}
   * @readonly
   */
  world: {
    get: function () {
      return this._world;
    },
  },
  /** World-space bounds, available as soon as fromUrl resolves.
   * @memberof SceneGISS3MLayer.prototype
   * @type {BoundingSphere}
   * @readonly
   */
  boundingSphere: {
    get: function () {
      validateMatrix(this._matrix);
      BoundingSphere.fromBoundingSpheres(
        this._roots.map((root) =>
          BoundingSphere.transform(root.localSphere, this._matrix),
        ),
        this._boundingSphere,
      );
      return BoundingSphere.clone(this._boundingSphere);
    },
  },
  /** True when the last normal render view has no pending content. Failed
   * replacements retain parent coverage and are reported by tileFailed.
   * @memberof SceneGISS3MLayer.prototype
   * @type {boolean}
   * @readonly
   */
  tilesLoaded: {
    get: function () {
      return (
        this._tilesLoaded && Matrix4.equals(this._matrix, this._appliedMatrix)
      );
    },
  },
  /** Receives (error, contentUrl) once per failed content load; no automatic retry.
   * @memberof SceneGISS3MLayer.prototype
   * @type {Event}
   * @readonly
   */
  tileFailed: {
    get: function () {
      return this._tileFailed;
    },
  },
  /** Snapshot of requests, failedTiles, cachedTiles, selectedPages, selectedDepth,
   * pendingTiles, geometryByteLength and texturesByteLength.
   * @memberof SceneGISS3MLayer.prototype
   * @type {SceneGISS3MLayer.Statistics}
   * @readonly
   */
  statistics: {
    get: function () {
      return { ...this._statistics };
    },
  },
  /** @memberof SceneGISS3MLayer.prototype
   * @type {number}
   */
  lodRangeScale: {
    get: function () {
      return this._lodRangeScale;
    },
    set: function (value) {
      this._lodRangeScale = positive(value, "lodRangeScale");
      this._wake();
    },
  },
  /** @memberof SceneGISS3MLayer.prototype
   * @type {number}
   */
  maximumScreenSpaceError: {
    get: function () {
      return this._maximumScreenSpaceError;
    },
    set: function (value) {
      this._maximumScreenSpaceError = positive(
        value,
        "maximumScreenSpaceError",
      );
      this._wake();
    },
  },
});

/**
 * @typedef {object} SceneGISS3MLayer.Statistics
 * @property {number} requests Cumulative started tile requests.
 * @property {number} failedTiles Cumulative failed tile loads.
 * @property {number} cachedTiles Resident or loading tiles.
 * @property {number} pendingTiles In-flight content pipelines.
 * @property {number} selectedPages Selected native Models.
 * @property {number} selectedDepth Deepest selected tile depth.
 * @property {number} geometryByteLength Resident GPU geometry bytes.
 * @property {number} texturesByteLength Resident GPU texture bytes.
 */

SceneGISS3MLayer.prototype._wake = function () {
  if (!this._destroyed && this._scene && !this._scene.isDestroyed()) {
    this._scene.requestRender();
  }
};

function validCompletion(layer, tile, generation) {
  return !layer._destroyed && tile.generation === generation;
}

SceneGISS3MLayer.prototype._finish = function (tile) {
  if (tile.counted) {
    this._pendingCount--;
    tile.counted = false;
  }
};

SceneGISS3MLayer.prototype._release = function (tile) {
  tile.generation++;
  tile.request?.cancel();
  for (const page of [...tile.pages, ...(tile.pending ?? [])]) {
    if (page.model && !page.model.isDestroyed()) {
      page.model.destroy();
    }
  }
  tile.pages = [];
  tile.pending = undefined;
  tile.buffer = undefined;
  tile.decoded = undefined;
  tile.failure = undefined;
  tile.request = undefined;
  tile.state = "unloaded";
  this._finish(tile);
};

SceneGISS3MLayer.prototype._request = function (tile) {
  if (
    tile.state !== "unloaded" ||
    this._pendingCount >= this._maximumRequests
  ) {
    return;
  }
  const request = new Request({
    throttle: true,
    throttleByServer: true,
    type: RequestType.TILES3D,
    priorityFunction: () => tile.depth,
  });
  const resource = tile.resource.clone();
  resource.request = request;
  const promise = resource.fetchArrayBuffer();
  if (!promise) {
    return;
  }
  tile.request = request;
  tile.state = "loading";
  tile.counted = true;
  this._pendingCount++;
  this._requestCount++;
  const generation = tile.generation;
  promise
    .then((buffer) => {
      if (validCompletion(this, tile, generation)) {
        tile.buffer = buffer;
        tile.state = "buffered";
        this._wake();
      }
    })
    .catch((error) => {
      if (validCompletion(this, tile, generation)) {
        tile.failure = error;
        this._wake();
      }
    });
};

SceneGISS3MLayer.prototype._prepareModels = function (tile) {
  const generation = tile.generation;
  const records = tile.decoded.pages;
  tile.decoded = undefined;
  tile.state = "models";
  const jobs = records.map(async (record, index) => {
    let model;
    if (record.glb) {
      const identity = tile.resource.getDerivedResource({
        queryParameters: {
          scenegisS3mPage: `${this._guid}:${index}:${generation}`,
        },
      });
      model = await Model.fromGltfAsync({
        gltf: record.glb,
        basePath: identity,
        modelMatrix: this._appliedMatrix,
        upAxis: Axis.Z,
        forwardAxis: Axis.X,
        id: this,
        featureIdLabel: "s3m",
        instanceFeatureIdLabel: "s3m",
        incrementallyLoadTextures: false,
        releaseGltfJson: true,
        environmentMapOptions: { enabled: false },
        enableVerticalExaggeration: false,
        show: false,
      });
      if (!validCompletion(this, tile, generation)) {
        model.destroy();
        return undefined;
      }
    }
    const localSphere = new BoundingSphere(
      Cartesian3.fromArray(record.center),
      record.radius,
    );
    return {
      model,
      localSphere,
      sphere: BoundingSphere.transform(localSphere, this._appliedMatrix),
      localRange: record.range,
      rangeMode: record.rangeMode,
      child: record.child
        ? tile.resource.getDerivedResource({ url: record.child })
        : undefined,
    };
  });
  return Promise.allSettled(jobs).then((results) => {
    const pages = results
      .filter((r) => r.status === "fulfilled" && r.value)
      .map((r) => r.value);
    const failure = results.find((r) => r.status === "rejected");
    if (!validCompletion(this, tile, generation) || failure) {
      for (const page of pages) {
        if (page.model && !page.model.isDestroyed()) {
          page.model.destroy();
        }
      }
      if (failure && validCompletion(this, tile, generation)) {
        tile.failure = failure.reason;
        this._wake();
      }
      return;
    }
    tile.pending = pages;
    this._wake();
  });
};

SceneGISS3MLayer.prototype._advance = function (tile, frameState) {
  if (tile.pending) {
    tile.pages = tile.pending;
    tile.pending = undefined;
    tile.state = "processing";
    const generation = tile.generation;
    for (const page of tile.pages) {
      // A Model promise may finish after any number of placement edits.
      placePage(this, page);
      const model = page.model;
      model?.errorEvent.addEventListener((error) => {
        if (validCompletion(this, tile, generation)) {
          tile.failure = error;
          this._wake();
        }
      });
    }
  }
  if (tile.state === "buffered" && !tile.failure) {
    this._worker ??= new TaskProcessor("SceneGISS3mWorker", 2);
    const promise = this._worker.scheduleTask({ buffer: tile.buffer }, [
      tile.buffer,
    ]);
    if (promise) {
      const generation = tile.generation;
      tile.buffer = undefined;
      tile.state = "decoding";
      promise
        .then((decoded) => {
          if (validCompletion(this, tile, generation)) {
            tile.decoded = decoded;
            tile.state = "decoded";
            this._wake();
          }
        })
        .catch((error) => {
          if (validCompletion(this, tile, generation)) {
            tile.failure = error;
            this._wake();
          }
        });
    }
  }
  if (tile.state === "decoded" && !tile.failure) {
    this._prepareModels(tile);
  }
  if (tile.state === "processing" && !tile.failure) {
    for (const page of tile.pages) {
      if (page.model && !page.model.ready) {
        page.model.show = false;
        page.model.update(frameState);
      }
    }
    if (tile.pages.every((p) => !p.model || p.model.ready)) {
      for (const page of tile.pages) {
        if (!page.child && page.model) {
          page.sphere = BoundingSphere.clone(page.model.boundingSphere);
        }
      }
      tile.state = "ready";
      this._finish(tile);
    }
  }
  if (tile.failure) {
    const error = tile.failure;
    this._release(tile);
    tile.state = "failed";
    this._failureCount++;
    this._tileFailed.raiseEvent(error, tile.resource.url);
  }
};

SceneGISS3MLayer.prototype._select = function (tile, frameState, observer) {
  this._protected.add(tile);
  tile.lastUsed = this._frame;
  if (!isReady(tile)) {
    if (observer) {
      observer.ready = false;
      if (tile.state === "failed") {
        observer.error = new RuntimeError(
          `S3M observer content failed: ${tile.resource.url}`,
        );
      }
    }
    if (tile.state !== "failed") {
      this._tilesLoaded = false;
      this._request(tile);
    }
    return;
  }
  for (const page of tile.pages) {
    if (
      frameState.cullingVolume.computeVisibility(page.sphere) ===
      Intersect.OUTSIDE
    ) {
      continue;
    }
    if (
      page.child &&
      tile.depth < this._maximumDepth &&
      refinePage(this, page, frameState)
    ) {
      let child = this._tiles.get(page.child.url);
      if (!child) {
        child = newTile(
          page.child,
          page.localSphere,
          this._appliedMatrix,
          tile.depth + 1,
        );
        this._tiles.set(page.child.url, child);
      }
      this._select(child, frameState, observer);
      if (isReady(child)) {
        continue;
      }
    }
    if (page.model) {
      (observer?.selected ?? this._selected).push({
        model: page.model,
        depth: tile.depth,
      });
    }
  }
};

SceneGISS3MLayer.prototype._cache = function () {
  let geometry = 0;
  let textures = 0;
  let count = 0;
  const candidates = [];
  for (const tile of this._tiles.values()) {
    if (tile.state === "unloaded" || tile.state === "failed") {
      continue;
    }
    count++;
    tile.bytes = { geometry: 0, textures: 0 };
    for (const { model } of tile.pages) {
      if (model?.ready) {
        tile.bytes.geometry += model.statistics.geometryByteLength;
        tile.bytes.textures += model.statistics.texturesByteLength;
      }
    }
    geometry += tile.bytes.geometry;
    textures += tile.bytes.textures;
    if (!this._protected.has(tile)) {
      candidates.push(tile);
    }
  }
  candidates.sort((a, b) => a.lastUsed - b.lastUsed);
  for (const tile of candidates) {
    if (
      count <= this._maximumCachedTiles &&
      geometry + textures <= this._maximumCachedBytes
    ) {
      break;
    }
    count--;
    geometry -= tile.bytes.geometry;
    textures -= tile.bytes.textures;
    this._release(tile);
    if (tile.depth !== 0) {
      this._tiles.delete(tile.resource.url);
    }
  }
  this._statistics = {
    requests: this._requestCount,
    failedTiles: this._failureCount,
    cachedTiles: count,
    pendingTiles: this._pendingCount,
    selectedPages: this._selected.length,
    selectedDepth: this._selected.reduce((n, p) => Math.max(n, p.depth), 0),
    geometryByteLength: geometry,
    texturesByteLength: textures,
  };
};

/** @private */
SceneGISS3MLayer.prototype.update = function (frameState) {
  const scene = frameState.camera._scene;
  if (
    !scene ||
    scene.isDestroyed() ||
    frameState.mode !== SceneMode.SCENE3D ||
    (this._world
      ? this._world.isDestroyed() || scene.world !== this._world
      : !(scene.world instanceof Globe)) ||
    (this._scene && this._scene !== scene) ||
    (this._context && this._context !== frameState.context)
  ) {
    throw new DeveloperError(
      "S3M requires its bound live SCENE3D World, Scene and Context.",
    );
  }
  if (!this.show) {
    return;
  }
  const normal =
    frameState.passes.render &&
    !frameState.passes.pick &&
    !frameState.passes.pickVoxel;
  if (normal) {
    this._scene = scene;
    this._context = frameState.context;
    updatePlacement(this);
    this._frame++;
    for (const tile of this._tiles.values()) {
      this._advance(tile, frameState);
    }
    this._selected.length = 0;
    this._protected.clear();
    this._tilesLoaded = true;
    for (const root of this._roots) {
      if (
        frameState.cullingVolume.computeVisibility(root.sphere) !==
        Intersect.OUTSIDE
      ) {
        this._select(root, frameState);
      }
    }
    const mainTilesLoaded = this._tilesLoaded;
    for (const observer of frameState._sceneGISViewsheds ?? []) {
      if (!observer.sources.includes(this)) {
        continue;
      }
      let selection = observer.sourceStates.get(this);
      if (!selection) {
        selection = { selected: [], ready: false, error: undefined };
        observer.sourceStates.set(this, selection);
      }
      selection.selected.length = 0;
      selection.ready = true;
      selection.error = undefined;
      const observerFrame = {
        ...frameState,
        camera: observer.camera,
        cullingVolume: observer.cullingVolume,
        pixelRatio: 1,
        _sceneGISObserverViewport: observer.resolution,
      };
      for (const root of this._roots) {
        if (
          observer.cullingVolume.computeVisibility(root.sphere) !==
          Intersect.OUTSIDE
        ) {
          this._select(root, observerFrame, selection);
        }
      }
    }
    this._tilesLoaded = mainTilesLoaded;
    this._cache();
    if (!this._tilesLoaded) {
      frameState.afterRender.push(
        () => !this._destroyed && this.show && !this._tilesLoaded,
      );
    }
  }
  for (const { model } of this._selected) {
    model.show = true;
    model.update(frameState);
  }
  if (this._credit && this._selected.length) {
    frameState.creditDisplay.addCreditToNextFrame(this._credit);
  }
};

/**
 * @returns {boolean} Whether this layer has been destroyed.
 */
SceneGISS3MLayer.prototype.isDestroyed = function () {
  return false;
};

/**
 * Releases this layer's requests, Worker and native Models. Never destroys its World.
 * @returns {undefined}
 */
SceneGISS3MLayer.prototype.destroy = function () {
  this._destroyed = true;
  for (const tile of this._tiles.values()) {
    this._release(tile);
  }
  this._tiles.clear();
  this._selected.length = 0;
  this._worker?.destroy();
  this._worker = undefined;
  return destroyObject(this);
};

export default SceneGISS3MLayer;

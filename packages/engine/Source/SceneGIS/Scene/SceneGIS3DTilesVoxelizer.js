import Cartesian3 from "../../Core/Cartesian3.js";
import Cartesian4 from "../../Core/Cartesian4.js";
import CullingVolume from "../../Core/CullingVolume.js";
import DeveloperError from "../../Core/DeveloperError.js";
import destroyObject from "../../Core/destroyObject.js";
import Intersect from "../../Core/Intersect.js";
import Matrix4 from "../../Core/Matrix4.js";
import RuntimeError from "../../Core/RuntimeError.js";
import Cesium3DTileRefine from "../../Scene/Cesium3DTileRefine.js";
import Cesium3DTilesetTraversal from "../../Scene/Cesium3DTilesetTraversal.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISVoxelizer from "../Core/SceneGISVoxelizer.js";

function integer(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DeveloperError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function regionVolume(grid) {
  const lower = Matrix4.multiplyByPoint(
    grid.modelMatrix,
    grid.minimum,
    new Cartesian3(),
  );
  const upper = Cartesian3.multiplyByScalar(
    grid.dimensions,
    grid.cellSize,
    new Cartesian3(),
  );
  Cartesian3.add(upper, grid.minimum, upper);
  Matrix4.multiplyByPoint(grid.modelMatrix, upper, upper);
  const planes = [];
  for (let axis = 0; axis < 3; axis++) {
    const m = grid.modelMatrix;
    const normal = new Cartesian3(
      m[4 * axis],
      m[4 * axis + 1],
      m[4 * axis + 2],
    );
    planes.push(
      new Cartesian4(
        normal.x,
        normal.y,
        normal.z,
        -Cartesian3.dot(normal, lower),
      ),
    );
    planes.push(
      new Cartesian4(
        -normal.x,
        -normal.y,
        -normal.z,
        Cartesian3.dot(normal, upper),
      ),
    );
  }
  return new CullingVolume(planes);
}

function selectRegion(job, frameState) {
  const tileset = job._tileset;
  const selected = [];
  const stack = [tileset.root];
  let visited = 0;
  let waiting = 0;
  let desired = 0;
  function requireContent(tile) {
    if (tile.contentFailed) {
      throw new RuntimeError(
        "A required 3D tile failed to load; no complete voxel result can be produced.",
      );
    }
    if (tile.contentExpired || tile.contentUnloaded) {
      tileset._requestSceneGISGeometryTile(tile);
    }
    if (!tile.contentReady) {
      waiting++;
      return false;
    }
    return true;
  }
  while (stack.length > 0) {
    const tile = stack.pop();
    if (++visited > job._maximumVisitedTiles) {
      throw new RuntimeError("The region exceeds maximumVisitedTiles.");
    }
    tile.updateTransform(
      tile.parent?.computedTransform ?? tileset.modelMatrix,
      frameState,
    );
    if (
      job._volume.computeVisibility(tile.boundingVolume) === Intersect.OUTSIDE
    ) {
      continue;
    }
    Cesium3DTilesetTraversal.touchTile(tile, frameState);
    if (tile.contentExpired) {
      requireContent(tile);
      continue;
    }
    const container =
      tile.hasEmptyContent || tile.hasTilesetContent || tile.hasImplicitContent;
    const refine =
      container ||
      (tile.children.length > 0 &&
        tile.geometricError > job._maximumGeometricError);
    if (container) {
      if (!tile.hasEmptyContent && !requireContent(tile)) {
        continue;
      }
    } else if (!refine || tile.refine === Cesium3DTileRefine.ADD) {
      if (++desired > job._maximumTiles) {
        throw new RuntimeError("The region exceeds maximumTiles.");
      }
      if (requireContent(tile)) {
        // A newly loaded URI can resolve to an external tileset or implicit subtree.
        if (tile.hasRenderableContent) {
          if (!refine && tile.geometricError > job._maximumGeometricError) {
            throw new RuntimeError(
              "A terminal tile cannot meet maximumGeometricError; choose an explicit coarser source tolerance.",
            );
          }
          selected.push(tile);
        }
      }
    }
    if (refine) {
      for (let i = tile.children.length - 1; i >= 0; i--) {
        stack.push(tile.children[i]);
      }
    }
  }
  job._visitedTiles = visited;
  job._waitingTiles = waiting;
  job._selectedTileCount = selected.length;
  return waiting === 0 ? selected : undefined;
}

function visitContent(content, visitor) {
  const children = content.innerContents;
  if (children?.length > 0) {
    for (const child of children) {
      visitContent(child, visitor);
    }
  } else if (typeof content._sceneGISVisitStaticTriangles === "function") {
    content._sceneGISVisitStaticTriangles(visitor);
  } else {
    throw new RuntimeError(
      "Selected content does not support static triangle snapshots (point, vector or Gaussian content is not a solid mesh).",
    );
  }
}

function active(job) {
  return (
    job._status === "loading" ||
    job._status === "snapshot" ||
    job._status === "voxelizing"
  );
}

function finish(job, status, value) {
  if (!active(job)) {
    return;
  }
  job._status = status;
  clearTimeout(job._timeout);
  job._timeout = undefined;
  job._selection = [];
  job._meshes = [];
  job._voxelizer.cancel();
  if (status === "complete") {
    job._resolve(value);
  } else {
    job._reject(value);
  }
  job._resolve = undefined;
  job._reject = undefined;
  if (!job._scene.isDestroyed()) {
    job._scene.requestRender();
  }
}

/**
 * A one-shot, camera-independent 3D Tiles geometry-to-voxel job. Mount it in Scene.primitives
 * after the source tileset and await resultPromise. The source must remain directly mounted
 * in the same Scene, with static geometry and transforms, until the snapshot completes.
 *
 * Actively loads the grid region through the native tile request/cache/decoder pipeline.
 * Includes all source triangles regardless of style, visibility, transparency or clipping.
 * Supports static Model-backed glTF/GLB, b3dm and i3dm TRIANGLES, including native instancing
 * and decoding. Rejects point clouds, non-triangle modes, animations, skins, morph targets,
 * custom shaders and vertical exaggeration. It does not reconstruct physical building interiors.
 *
 * The job owns its Worker and borrows the tileset. Removing/destroying the job never destroys
 * the source. Results are caller-owned and remain valid after both job and source are destroyed.
 * Geometry may be read from GPU buffers once during capture; an individual large read can stall
 * the main thread. No per-frame geometry readback takes place after completion.
 * @alias SceneGIS3DTilesVoxelizer
 * @constructor
 * @param {SceneGIS3DTilesVoxelizer.Options} options Source, region and budgets.
 * @throws {DeveloperError} Invalid configuration or unmounted source.
 * @experimental This API is subject to change.
 * @example
 * const job = scene.primitives.add(new Cesium.SceneGIS3DTilesVoxelizer({
 *   scene, tileset, maximumGeometricError: 1,
 *   grid: { minimum: new Cesium.Cartesian3(-128, -128, 0),
 *     dimensions: new Cesium.Cartesian3(128, 128, 32), cellSize: 2,
 *     modelMatrix: localToWorld, fillMode: "surface" }
 * }));
 * try {
 *   const result = await job.resultPromise;
 *   const solidMask = Cesium.SceneGISVoxelizer.createSolidMask(result);
 * } finally {
 *   scene.primitives.remove(job);
 * }
 */
function SceneGIS3DTilesVoxelizer(options = {}) {
  const { scene, tileset } = options;
  if (
    !scene ||
    !tileset ||
    tileset.isDestroyed() ||
    !scene.primitives.contains(tileset) ||
    typeof tileset._requestSceneGISGeometryTile !== "function"
  ) {
    throw new DeveloperError(
      "tileset must be a live Cesium3DTileset directly mounted in scene.primitives.",
    );
  }
  const error = options.maximumGeometricError;
  if (!Number.isFinite(error) || error < 0) {
    throw new DeveloperError(
      "maximumGeometricError must be an explicit finite nonnegative source tolerance in world meters.",
    );
  }
  this._maximumTiles = integer("maximumTiles", options.maximumTiles ?? 4096);
  this._maximumVisitedTiles = integer(
    "maximumVisitedTiles",
    options.maximumVisitedTiles ?? 100000,
  );
  this._maximumSnapshotTilesPerFrame = integer(
    "maximumSnapshotTilesPerFrame",
    options.maximumSnapshotTilesPerFrame ?? 1,
  );
  this._timeoutMilliseconds = integer(
    "timeoutMilliseconds",
    options.timeoutMilliseconds ?? 120000,
  );
  this._maximumInputBytes = options.grid?.maximumInputBytes ?? 268435456;
  this._maximumTriangles = options.grid?.maximumTriangles ?? 2000000;
  this._voxelizer = new SceneGISVoxelizer(options.grid);
  this._scene = scene;
  this._tileset = tileset;
  this._modelMatrix = Matrix4.clone(tileset.modelMatrix);
  this._maximumGeometricError = error;
  this._volume = regionVolume(this._voxelizer.grid);
  this._status = "loading";
  this._selection = [];
  this._meshes = [];
  this._snapshotIndex = 0;
  this._visitedTiles = 0;
  this._waitingTiles = 0;
  this._selectedTileCount = 0;
  this._reservedBytes = 0;
  this._triangles = 0;
  this._started = undefined;
  this._snapshotMilliseconds = 0;
  this._loadMilliseconds = 0;
  this._frame = undefined;
  this._timeout = undefined;
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
  scene.requestRender();
}

/**
 * @typedef {object} SceneGIS3DTilesVoxelizer.Options
 * @property {Scene} scene Owning Scene, in SCENE3D with WebGL2.
 * @property {Cesium3DTileset} tileset Explicit static source, directly mounted in this Scene.
 * @property {SceneGISVoxelizer.Options} grid Grid region and geometry/computation budgets.
 * @property {number} maximumGeometricError Source LOD tolerance in world meters, independent of cell size.
 * Terminal tiles exceeding it fail; ADD ancestors remain included as required by the source hierarchy.
 * @property {number} [maximumTiles=4096] Selected content candidate budget, including pending contents.
 * @property {number} [maximumVisitedTiles=100000] Tested hierarchy-node budget per walk, including culled nodes.
 * @property {number} [maximumSnapshotTilesPerFrame=1] Maximum content tiles captured per normal render frame.
 * @property {number} [timeoutMilliseconds=120000] Wall-time limit from first update through completion.
 */

/**
 * @typedef {object} SceneGIS3DTilesVoxelizer.Source
 * @property {boolean} complete Always true on successful publication; incomplete jobs reject.
 * Completeness is relative to the supplied tileset hierarchy and selected LOD, not a watertightness claim.
 * @property {number} maximumGeometricError Requested source error, independent of grid width.
 * @property {SceneGIS3DTilesVoxelizer.Tile[]} tiles Selected content records. ADD ancestors may exceed the target error.
 * @property {number} loadMilliseconds Time until all required content is ready, including frame scheduling.
 * @property {number} snapshotMilliseconds CPU time spent updating/copying selected geometry.
 * @property {number} totalMilliseconds Total wall time including loading, frame scheduling and Worker transfer/computation.
 */

/**
 * @typedef {object} SceneGIS3DTilesVoxelizer.Tile
 * @property {string} url Selected content URL.
 * @property {number} geometricError Source geometric error after tile transform scaling, in world meters.
 */

/**
 * @typedef {object} SceneGIS3DTilesVoxelizer.Progress
 * @property {number} visitedTiles Hierarchy nodes tested in the latest selection walk.
 * @property {number} waitingTiles Required contents awaiting readiness.
 * @property {number} selectedTiles Ready selected contents.
 * @property {number} capturedTiles Completed content snapshots.
 * @property {number} triangles Triangle count including instances captured so far.
 */

/**
 * @typedef {object} SceneGIS3DTilesVoxelizer.Result
 * @property {number} version Layout version, currently 1.
 * @property {SceneGISVoxelizer.Grid} grid Grid coordinates and fill rule.
 * @property {Uint8Array} data Caller-owned occupancy, x-fastest, 0 empty / 1 surface / 2 grid-enclosed interior.
 * @property {SceneGISVoxelizer.Statistics} statistics Worker computation statistics.
 * @property {SceneGIS3DTilesVoxelizer.Source} source Source selection and timing metadata.
 */

Object.defineProperties(SceneGIS3DTilesVoxelizer.prototype, {
  /**
   * Resolves once to a complete independent snapshot; rejects on failure, cancellation or destruction.
   * @memberof SceneGIS3DTilesVoxelizer.prototype
   * @type {Promise<SceneGIS3DTilesVoxelizer.Result>}
   * @readonly
   */
  resultPromise: {
    get: function () {
      return this._promise;
    },
  },
  /**
   * loading, snapshot, voxelizing, complete, failed or cancelled.
   * @memberof SceneGIS3DTilesVoxelizer.prototype
   * @type {string}
   * @readonly
   */
  status: {
    get: function () {
      return this._status;
    },
  },
  /**
   * A progress snapshot: visitedTiles, waitingTiles, selectedTiles, capturedTiles and triangles.
   * @memberof SceneGIS3DTilesVoxelizer.prototype
   * @type {SceneGIS3DTilesVoxelizer.Progress}
   * @readonly
   */
  progress: {
    get: function () {
      return {
        visitedTiles: this._visitedTiles,
        waitingTiles: this._waitingTiles,
        selectedTiles: this._selectedTileCount,
        capturedTiles: this._snapshotIndex,
        triangles: this._triangles,
      };
    },
  },
});

/** @private */
SceneGIS3DTilesVoxelizer.prototype.update = function (frameState) {
  if (
    !active(this) ||
    this._status === "voxelizing" ||
    !frameState.passes.render ||
    frameState.passes.pick ||
    this._frame === frameState.frameNumber
  ) {
    return;
  }
  this._frame = frameState.frameNumber;
  try {
    if (
      frameState.context !== this._scene.context ||
      !frameState.context.webgl2 ||
      frameState.mode !== SceneMode.SCENE3D
    ) {
      throw new RuntimeError(
        "3D Tiles voxelization requires the source Scene in SCENE3D with WebGL2.",
      );
    }
    if (
      this._tileset.isDestroyed() ||
      !this._scene.primitives.contains(this._tileset)
    ) {
      throw new RuntimeError(
        "The source tileset was removed or destroyed during voxelization.",
      );
    }
    if (
      !Matrix4.equals(this._tileset.modelMatrix, this._modelMatrix) ||
      this._tileset.customShader ||
      frameState.verticalExaggeration !== 1
    ) {
      throw new RuntimeError(
        "Voxelization requires unchanged source placement, no custom shader and verticalExaggeration=1.",
      );
    }
    if (this._started === undefined) {
      this._started = performance.now();
      this._timeout = setTimeout(
        () =>
          finish(
            this,
            "failed",
            new RuntimeError(
              "Voxelization timed out; check source availability, tileset cache budget and region size.",
            ),
          ),
        this._timeoutMilliseconds,
      );
    }
    if (this._status === "loading") {
      const tiles = selectRegion(this, frameState);
      if (tiles !== undefined) {
        this._selection = tiles.map((tile) => ({
          tile,
          content: tile.content,
        }));
        this._loadMilliseconds = performance.now() - this._started;
        this._status = "snapshot";
      }
    }
    if (this._status === "snapshot") {
      for (const { tile, content } of this._selection) {
        if (
          tile.isDestroyed() ||
          tile.content !== content ||
          !tile.contentReady ||
          tile.contentExpired
        ) {
          throw new RuntimeError(
            "Selected content changed during the static geometry snapshot.",
          );
        }
        Cesium3DTilesetTraversal.touchTile(tile, frameState);
      }
      const started = performance.now();
      const end = Math.min(
        this._selection.length,
        this._snapshotIndex + this._maximumSnapshotTilesPerFrame,
      );
      const visitor = {
        reserve: (positionBytes, indexBytes, triangles, instances) => {
          this._reservedBytes += (positionBytes + indexBytes) * instances;
          this._triangles += triangles * instances;
          if (
            this._reservedBytes > this._maximumInputBytes ||
            this._triangles > this._maximumTriangles
          ) {
            throw new RuntimeError(
              "Selected geometry exceeds maximumInputBytes (conservative decoded size) or maximumTriangles.",
            );
          }
        },
        mesh: (mesh) => this._meshes.push(mesh),
      };
      const commands = frameState.commandList;
      frameState.commandList = [];
      try {
        for (; this._snapshotIndex < end; this._snapshotIndex++) {
          const { content } = this._selection[this._snapshotIndex];
          content.update(this._tileset, frameState);
          visitContent(content, visitor);
          frameState.commandList.length = 0;
        }
      } finally {
        frameState.commandList = commands;
      }
      this._snapshotMilliseconds += performance.now() - started;
      if (this._snapshotIndex === this._selection.length) {
        const source = {
          complete: true,
          maximumGeometricError: this._maximumGeometricError,
          tiles: this._selection.map(({ tile, content }) =>
            Object.freeze({
              url: content.url,
              geometricError: tile.geometricError,
            }),
          ),
          loadMilliseconds: this._loadMilliseconds,
          snapshotMilliseconds: this._snapshotMilliseconds,
        };
        Object.freeze(source.tiles);
        this._status = "voxelizing";
        this._voxelizer.voxelize(this._meshes).then(
          (result) => {
            source.totalMilliseconds = performance.now() - this._started;
            finish(
              this,
              "complete",
              Object.freeze({ ...result, source: Object.freeze(source) }),
            );
          },
          (error) => finish(this, "failed", error),
        );
        this._meshes = [];
        this._selection = [];
      }
    }
    if (this._status === "loading" || this._status === "snapshot") {
      frameState.afterRender.push(() => true);
    }
  } catch (error) {
    finish(this, "failed", error);
  }
};

/** Cancels owned work. Borrowed requests and cached tiles retain their native ownership. */
SceneGIS3DTilesVoxelizer.prototype.cancel = function () {
  finish(
    this,
    "cancelled",
    new RuntimeError("3D Tiles voxelization cancelled."),
  );
};

/** @returns {boolean} Whether this job has been destroyed. */
SceneGIS3DTilesVoxelizer.prototype.isDestroyed = function () {
  return false;
};

/** Cancels outstanding work and releases the owned Worker/timer; never destroys the borrowed tileset. */
SceneGIS3DTilesVoxelizer.prototype.destroy = function () {
  this.cancel();
  this._voxelizer.destroy();
  return destroyObject(this);
};

export default SceneGIS3DTilesVoxelizer;

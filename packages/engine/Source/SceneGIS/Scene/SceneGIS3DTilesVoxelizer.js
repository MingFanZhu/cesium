import Cartesian3 from "../../Core/Cartesian3.js";
import Cartesian4 from "../../Core/Cartesian4.js";
import CullingVolume from "../../Core/CullingVolume.js";
import DeveloperError from "../../Core/DeveloperError.js";
import destroyObject from "../../Core/destroyObject.js";
import Intersect from "../../Core/Intersect.js";
import Matrix4 from "../../Core/Matrix4.js";
import RuntimeError from "../../Core/RuntimeError.js";
import Cesium3DTileRefine from "../../Scene/Cesium3DTileRefine.js";
import Cesium3DTileset from "../../Scene/Cesium3DTileset.js";
import Cesium3DTilesetTraversal from "../../Scene/Cesium3DTilesetTraversal.js";
import PrimitiveCollection from "../../Scene/PrimitiveCollection.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISVoxelizer from "../Core/SceneGISVoxelizer.js";

function integer(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DeveloperError(`${name} must be a positive safe integer.`);
  }
  return value;
}

function belongsToScene(scene, tileset) {
  const pending = [scene.primitives];
  const visited = new Set();
  while (pending.length > 0) {
    const collection = pending.pop();
    if (visited.has(collection)) {
      continue;
    }
    visited.add(collection);
    if (collection.contains(tileset)) {
      return true;
    }
    for (let i = 0; i < collection.length; i++) {
      const child = collection.get(i);
      if (child instanceof PrimitiveCollection) {
        pending.push(child);
      }
    }
  }
  return false;
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
 * 一次性、独立于显示相机的 3D Tiles 几何体素化任务。在源瓦片集之后将任务挂载到 Scene.primitives，并等待 resultPromise。快照完成前，源必须始终可通过同一 Scene 的原生 PrimitiveCollection 树访问，且几何与变换保持静态。任务只借用源，不改变其父集合，也不重复挂载。
 *
 * 通过原生瓦片请求、缓存和解码管线主动加载格网区域。包含全部源三角形，不受样式、显隐、透明度或裁剪影响。支持由静态 Model 承载的 glTF/GLB、b3dm 和 i3dm TRIANGLES，以及原生实例化与解码。拒绝点云、非三角形模式、动画、蒙皮、变形目标、自定义着色器和垂直夸张；不重建真实建筑内部结构。
 *
 * 任务拥有自己的 Worker，借用瓦片集。移除或销毁任务不会销毁源。结果归调用方所有，任务和源都销毁后仍然有效。捕获期间可能一次性读取 GPU 几何缓冲，单次大规模读取可能阻塞主线程；完成后不逐帧回读几何。
 * @alias SceneGIS3DTilesVoxelizer
 * @constructor
 * @param {SceneGIS3DTilesVoxelizer.Options} options 源、区域与预算。
 * @throws {DeveloperError} 配置无效或源未挂载。
 * @experimental 此 API 可能发生变化。
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
    scene.isDestroyed() ||
    !(tileset instanceof Cesium3DTileset) ||
    tileset.isDestroyed() ||
    !belongsToScene(scene, tileset)
  ) {
    throw new DeveloperError(
      "tileset must be a live native Cesium3DTileset belonging to this Scene's PrimitiveCollection hierarchy.",
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
 * @property {Scene} scene 所属 Scene，要求 SCENE3D 和 WebGL2。
 * @property {Cesium3DTileset} tileset 借用的静态源，位于此 Scene 任意深度的原生 PrimitiveCollection 树中。
 * @property {SceneGISVoxelizer.Options} grid 格网区域及几何与计算预算。
 * @property {number} maximumGeometricError 以世界米为单位的源 LOD 容差，独立于格宽。末级瓦片仍超出容差时任务失败；按源层级要求保留 ADD 祖先。
 * @property {number} [maximumTiles=4096] 选中内容候选的预算，包含等待中的内容。
 * @property {number} [maximumVisitedTiles=100000] 每次遍历最多测试的层级节点数，包含被剔除节点。
 * @property {number} [maximumSnapshotTilesPerFrame=1] 每个正常渲染帧最多捕获的内容瓦片数。
 * @property {number} [timeoutMilliseconds=120000] 从首次更新到完成的实际时间上限。
 */

/**
 * @typedef {object} SceneGIS3DTilesVoxelizer.Source
 * @property {boolean} complete 成功发布时始终为 true，不完整任务会拒绝。完整性相对于输入瓦片层级及选定 LOD，不表示网格水密。
 * @property {number} maximumGeometricError 请求的源误差，独立于格宽。
 * @property {SceneGIS3DTilesVoxelizer.Tile[]} tiles 选中的内容记录，ADD 祖先的误差可能超过目标值。
 * @property {number} loadMilliseconds 全部必需内容就绪所用时间，包含帧调度。
 * @property {number} snapshotMilliseconds 更新与复制选中几何的 CPU 时间。
 * @property {number} totalMilliseconds 总实际时间，包含加载、帧调度及 Worker 传输和计算。
 */

/**
 * @typedef {object} SceneGIS3DTilesVoxelizer.Tile
 * @property {string} url 选中的内容 URL。
 * @property {number} geometricError 经瓦片变换缩放后的源几何误差，单位为世界米。
 */

/**
 * @typedef {object} SceneGIS3DTilesVoxelizer.Progress
 * @property {number} visitedTiles 最近一次选择遍历测试的层级节点数。
 * @property {number} waitingTiles 等待就绪的必需内容数。
 * @property {number} selectedTiles 已就绪的选中内容数。
 * @property {number} capturedTiles 已完成的内容快照数。
 * @property {number} triangles 目前捕获的三角形数，包含实例。
 */

/**
 * @typedef {object} SceneGIS3DTilesVoxelizer.Result
 * @property {number} version 布局版本，当前为 1。
 * @property {SceneGISVoxelizer.Grid} grid 格网坐标与填充规则。
 * @property {Uint8Array} data 调用方所有的占据数组，X 变化最快；0 为空，1 为表面，2 为格网封闭内部。
 * @property {SceneGISVoxelizer.Statistics} statistics Worker 计算统计。
 * @property {SceneGIS3DTilesVoxelizer.Source} source 源选择及计时元数据。
 */

Object.defineProperties(SceneGIS3DTilesVoxelizer.prototype, {
  /**
   * 一次性完成并返回完整独立快照；失败、取消或销毁时拒绝。
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
   * 状态为 loading、snapshot、voxelizing、complete、failed 或 cancelled。
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
   * 进度快照：visitedTiles、waitingTiles、selectedTiles、capturedTiles 和 triangles。
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
      !belongsToScene(this._scene, this._tileset)
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

/**
 *  取消自有工作。借用请求与缓存瓦片保留原生所有权。
 */
SceneGIS3DTilesVoxelizer.prototype.cancel = function () {
  finish(
    this,
    "cancelled",
    new RuntimeError("3D Tiles voxelization cancelled."),
  );
};

/**
 *  @returns {boolean} 此任务是否已销毁。
 */
SceneGIS3DTilesVoxelizer.prototype.isDestroyed = function () {
  return false;
};

/**
 *  取消未完成工作并释放自有 Worker 和计时器；不销毁借用的瓦片集。
 */
SceneGIS3DTilesVoxelizer.prototype.destroy = function () {
  this.cancel();
  this._voxelizer.destroy();
  return destroyObject(this);
};

export default SceneGIS3DTilesVoxelizer;

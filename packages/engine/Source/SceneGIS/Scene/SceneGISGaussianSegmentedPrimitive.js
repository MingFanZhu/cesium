import Cartesian3 from "../../Core/Cartesian3.js";
import BoundingSphere from "../../Core/BoundingSphere.js";
import Color from "../../Core/Color.js";
import GaussianVideo from "./_private/Gaussian/_SceneGISGaussianVideo.js";
import defined from "../../Core/defined.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Matrix4 from "../../Core/Matrix4.js";
import Quaternion from "../../Core/Quaternion.js";
import { validateMacroChunkRigidTransform } from "../Core/_private/Gaussian/_SceneGISGaussianManifest.js";
import _SceneGISGaussianSegmentedRuntimeController from "./_private/Gaussian/_SceneGISGaussianSegmentedRuntimeController.js";

const PRODUCTION_MAPPING_ENTRIES_PER_FRAME = 32768;
const PRODUCTION_SORT_POSITION_EXTRACTIONS_PER_FRAME = 32768;

function scheduleDestroyCleanup(primitive) {
  if (primitive._controller.destroyed) {
    if (primitive._destroyCleanupTimer !== undefined) {
      clearTimeout(primitive._destroyCleanupTimer);
      primitive._destroyCleanupTimer = undefined;
    }
    return;
  }
  if (primitive._destroyCleanupTimer !== undefined) {
    return;
  }
  // A collection removes this Primitive before asynchronous Worker acknowledgments
  // arrive. Continue only the existing destroy transaction without scene updates.
  primitive._destroyCleanupTimer = setTimeout(function () {
    primitive._destroyCleanupTimer = undefined;
    try {
      primitive.destroy();
    } catch (error) {
      // The synchronous destroy call still throws. A background retry keeps the
      // first failure observable while retaining its cleanup authority.
      primitive._destroyCleanupError ??= error;
    }
  }, 16);
}

function positiveSafe(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new DeveloperError(`${name} must be a positive safe integer`);
  }
  return value;
}

function positiveFinite(value, name) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new DeveloperError(`${name} must be finite and positive`);
  }
  return value;
}

function nonnegativeSafe(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new DeveloperError(`${name} must be a nonnegative safe integer`);
  }
  return value;
}

function nonnegativeFinite(value, name) {
  if (!Number.isFinite(value) || value < 0) {
    throw new DeveloperError(`${name} must be finite and nonnegative`);
  }
  return value;
}

function minimumLeafLogicalLevel(value) {
  if (value !== 0 && value !== 1) {
    throw new DeveloperError("minimumLeafLogicalLevel must be 0 or 1");
  }
  return value;
}

function rigidMatrix(value, name) {
  try {
    validateMacroChunkRigidTransform(Array.from(value), name);
  } catch (error) {
    throw new DeveloperError(error.message);
  }
  return value;
}

function validateOptions(options) {
  if (!defined(options.url)) {
    throw new DeveloperError("options.url is required");
  }
  const normalized = {
    url: options.url,
    maximumSelectedSplats: positiveSafe(
      options.maximumSelectedSplats,
      "maximumSelectedSplats",
    ),
    maximumCoverageSlots: positiveSafe(
      options.maximumCoverageSlots,
      "maximumCoverageSlots",
    ),
    maximumCpuBytes: positiveSafe(options.maximumCpuBytes, "maximumCpuBytes"),
    maximumGpuBytes: positiveSafe(options.maximumGpuBytes, "maximumGpuBytes"),
    maximumCpuPageBytes: positiveSafe(
      options.maximumCpuPageBytes,
      "maximumCpuPageBytes",
    ),
    replacementCpuEscrowBytes: positiveSafe(
      options.replacementCpuEscrowBytes,
      "replacementCpuEscrowBytes",
    ),
    maximumGpuPageBytes: positiveSafe(
      options.maximumGpuPageBytes,
      "maximumGpuPageBytes",
    ),
    replacementGpuEscrowBytes: positiveSafe(
      options.replacementGpuEscrowBytes,
      "replacementGpuEscrowBytes",
    ),
    maximumSortWorkingSetBytes: positiveSafe(
      options.maximumSortWorkingSetBytes,
      "maximumSortWorkingSetBytes",
    ),
    refineErrorPixels: positiveFinite(
      options.refineErrorPixels ?? 16,
      "refineErrorPixels",
    ),
    coarsenErrorPixels: nonnegativeFinite(
      options.coarsenErrorPixels ?? 12,
      "coarsenErrorPixels",
    ),
    minimumLeafLogicalLevel: minimumLeafLogicalLevel(
      options.minimumLeafLogicalLevel ?? 1,
    ),
    usePersistentCache: options.usePersistentCache !== false,
    maximumPersistentCacheBytes: positiveSafe(
      options.maximumPersistentCacheBytes ?? 4 * 1024 ** 3,
      "maximumPersistentCacheBytes",
    ),
    maximumPersistentCacheStagingBytes: positiveSafe(
      options.maximumPersistentCacheStagingBytes ?? 64 * 1024 ** 2,
      "maximumPersistentCacheStagingBytes",
    ),
    requestPersistentStorage: options.requestPersistentStorage !== false,
  };
  if (
    normalized.replacementCpuEscrowBytes > normalized.maximumCpuPageBytes ||
    normalized.replacementGpuEscrowBytes > normalized.maximumGpuPageBytes ||
    normalized.maximumCpuPageBytes + normalized.maximumSortWorkingSetBytes >=
      normalized.maximumCpuBytes ||
    normalized.maximumGpuPageBytes >= normalized.maximumGpuBytes ||
    normalized.coarsenErrorPixels >= normalized.refineErrorPixels
  ) {
    throw new DeveloperError(
      "Segmented Page, replacement, sort, or hysteresis partition is impossible",
    );
  }
  return normalized;
}

/**
 * 流式加载 MCI4 分段 Gaussian 产品，提供有预算的 CPU/GPU 驻留管理与逐实例异步排序。要求 WebGL2 和 HTTP Range 支持。源坐标单位为米，有效变换为 modelMatrix 乘以产品的 localToFixed，两者都必须是保向刚体变换。球面使用 ENU 矩阵，平面使用笛卡尔矩阵。
 * 图元拥有请求、Worker、显示资源和 GPU 页。按采集外观绘制，不进行 PBR 重新受光或逐高斯点拾取。验证后的页默认使用独立 IndexedDB 缓存；usePersistentCache=false 可关闭，maximumPersistentCacheBytes 和 maximumPersistentCacheStagingBytes 分别限制持久存储与 CPU 暂存。
 *
 * @alias SceneGISGaussianSegmentedPrimitive
 * @constructor
 * @param {object} options 初始化选项，内存预算单位为字节。
 * @param {string|Resource} options.url scene.mcl.json 的 URL。
 * @param {number} options.maximumSelectedSplats 最大可见高斯点数。
 * @param {number} options.maximumCoverageSlots 最大活动覆盖槽位数。
 * @param {number} options.maximumCpuBytes CPU 总驻留预算。
 * @param {number} options.maximumGpuBytes GPU 总驻留预算。
 * @param {number} options.maximumCpuPageBytes 总预算中的 CPU 页预算。
 * @param {number} options.replacementCpuEscrowBytes CPU 页替换预留量。
 * @param {number} options.maximumGpuPageBytes 总预算中的 GPU 页预算。
 * @param {number} options.replacementGpuEscrowBytes GPU 页替换预留量。
 * @param {number} options.maximumSortWorkingSetBytes Worker 排序内存预算。
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] 放置变换。
 * @param {boolean} [options.show=true] 是否绘制当前内容。
 * @param {Color} [options.color=Color.WHITE] 颜色倍率。
 * @param {number} [options.falloff=1] 为正的 Gaussian alpha 衰减倍率。
 * @param {number} [options.refineErrorPixels=16] 细化误差阈值。
 * @param {number} [options.coarsenErrorPixels=12] 降低精度的下阈值。
 * @param {number} [options.minimumLeafLogicalLevel=1] 允许的最精细叶级 LOD，取值 0 或 1。
 * @param {boolean} [options.usePersistentCache=true] 是否在 IndexedDB 缓存已验证页。
 * @param {number} [options.maximumPersistentCacheBytes=4294967296] 磁盘缓存预算。
 * @param {number} [options.maximumPersistentCacheStagingBytes=67108864] 缓存暂存预算。
 * @param {boolean} [options.requestPersistentStorage=true] 请求浏览器持久存储。
 * @exception {DeveloperError} 必需预算或变换无效。
 * @see SceneGISGaussianSegmentedPrimitive#destroy
 */
function SceneGISGaussianSegmentedPrimitive(options = {}) {
  const normalized = validateOptions(options);
  this._modelMatrix = Matrix4.clone(
    rigidMatrix(options.modelMatrix ?? Matrix4.IDENTITY, "modelMatrix"),
  );
  this._effectiveModelMatrix = Matrix4.clone(this._modelMatrix);
  this._show = options.show ?? true;
  this._color = Color.clone(options.color ?? Color.WHITE);
  this._falloff = positiveFinite(options.falloff ?? 1, "falloff");
  this._maxShDegree = 0;
  this._viewOriginLocal = new Cartesian3();
  this._sourceRenderToViewPosition = new Cartesian3();
  this._sourceRenderToViewQuaternion = new Quaternion();
  this._renderTuning0 = { x: 2, y: 0.1, z: 1024, w: 1 / 255 };
  this._renderTuning1 = { x: 0.3, y: 0.3, z: 1.2, w: 1 };
  this._controller = new _SceneGISGaussianSegmentedRuntimeController({
    primitive: this,
    ...normalized,
    maximumGpuFeedOperationsPerFrame: nonnegativeSafe(
      options._maximumGpuPageFeedOperationsPerFrame ?? Number.MAX_SAFE_INTEGER,
      "_maximumGpuPageFeedOperationsPerFrame",
    ),
    maximumGpuFeedBytesPerFrame: nonnegativeSafe(
      options._maximumGpuPageFeedBytesPerFrame ?? 8 * 1024 * 1024,
      "_maximumGpuPageFeedBytesPerFrame",
    ),
    maximumMappingEntriesPerFrame: nonnegativeSafe(
      options._maximumMappingEntriesPerFrame ??
        PRODUCTION_MAPPING_ENTRIES_PER_FRAME,
      "_maximumMappingEntriesPerFrame",
    ),
    maximumTextureUploadsPerFrame: 16,
    maximumSortPositionExtractionsPerFrame: nonnegativeSafe(
      options._maximumSortPositionExtractionsPerFrame ??
        PRODUCTION_SORT_POSITION_EXTRACTIONS_PER_FRAME,
      "_maximumSortPositionExtractionsPerFrame",
    ),
    maximumLoaderDeliveryBytes: 8 * 1024 * 1024,
    requestScheduler: options._requestScheduler,
    fetchFunction: options._fetchFunction,
    persistentCacheFactory: options._persistentCacheFactory,
    taskProcessor: options._taskProcessor,
    captureFootprintDiagnostics: options._captureFootprintDiagnostics === true,
  });
}

/** @private */
SceneGISGaussianSegmentedPrimitive.prototype.update = function (frameState) {
  if (this.isDestroyed()) {
    throw new DeveloperError(
      "SceneGISGaussianSegmentedPrimitive was destroyed",
    );
  }
  this._controller.update(frameState);
  GaussianVideo.update(this, frameState);
};

/**
 * 报告资源清理是否完成，包含等待中的 Worker 确认。
 * @returns {boolean} 清理是否已完成。
 */
SceneGISGaussianSegmentedPrimitive.prototype.isDestroyed = function () {
  return this._controller.destroyed;
};

/**
 * 请求销毁，操作幂等。移出集合后，自有计时器继续完成待处理 Worker 清理，无需继续渲染。
 * @returns {undefined}
 */
SceneGISGaussianSegmentedPrimitive.prototype.destroy = function () {
  try {
    this._controller.requestDestroy();
  } catch (error) {
    this._destroyCleanupError ??= error;
    throw error;
  } finally {
    scheduleDestroyCleanup(this);
  }
  return undefined;
};

Object.defineProperties(SceneGISGaussianSegmentedPrimitive.prototype, {
  /**
   * 世界空间包围体，索引加载后可用，不得修改。
   * @memberof SceneGISGaussianSegmentedPrimitive.prototype
   * @type {BoundingSphere|undefined}
   * @readonly
   */
  boundingSphere: {
    get: function () {
      const source = this._controller._sourceBoundingSphere;
      if (!defined(source)) {
        return undefined;
      }
      this._boundingSphere = BoundingSphere.transform(
        source,
        this._effectiveModelMatrix,
        this._boundingSphere,
      );
      return this._boundingSphere;
    },
  },
  /** @memberof SceneGISGaussianSegmentedPrimitive.prototype
   * @type {string}
   * @readonly
   */
  state: {
    get: function () {
      return this._controller.state;
    },
  },
  /**
   *  当前显示结果是否就绪，相机移动可能触发更多工作。
   * @memberof SceneGISGaussianSegmentedPrimitive.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._controller.ready;
    },
  },
  /**
   *  最近的终止或清理错误，没有时为空。
   * @memberof SceneGISGaussianSegmentedPrimitive.prototype
   * @type {Error|undefined}
   * @readonly
   */
  error: {
    get: function () {
      return this._controller.error ?? this._destroyCleanupError;
    },
  },
  /**
   *  资源、流式加载与排序诊断快照，创建快照具有 CPU 成本。
   * @memberof SceneGISGaussianSegmentedPrimitive.prototype
   * @type {object}
   * @readonly
   */
  statistics: {
    get: function () {
      return this._controller.statistics;
    },
  },
  /**
   *  绘制显隐，隐藏不会释放驻留缓存。
   * @memberof SceneGISGaussianSegmentedPrimitive.prototype
   * @type {boolean}
   */
  show: {
    get: function () {
      return this._show;
    },
    set: function (value) {
      this._show = !!value;
    },
  },
  /**
   *  放置变换。通过赋值矩阵通知流式加载和排序控制器，不要原地修改返回的矩阵。
   * @memberof SceneGISGaussianSegmentedPrimitive.prototype
   * @type {Matrix4}
   */
  modelMatrix: {
    get: function () {
      return this._modelMatrix;
    },
    set: function (value) {
      rigidMatrix(value, "modelMatrix");
      Matrix4.clone(value, this._modelMatrix);
      const index = this._controller._index;
      if (index) {
        Matrix4.multiply(
          this._modelMatrix,
          Matrix4.fromArray(index.localToFixed),
          this._effectiveModelMatrix,
        );
      } else {
        Matrix4.clone(this._modelMatrix, this._effectiveModelMatrix);
      }
      this._controller.transformChanged();
    },
  },
  /** @memberof SceneGISGaussianSegmentedPrimitive.prototype
   * @type {Color}
   */
  color: {
    get: function () {
      return this._color;
    },
    set: function (value) {
      if (!defined(value)) {
        throw new DeveloperError("color is required");
      }
      Color.clone(value, this._color);
    },
  },
  /** @memberof SceneGISGaussianSegmentedPrimitive.prototype
   * @type {number}
   */
  falloff: {
    get: function () {
      return this._falloff;
    },
    set: function (value) {
      this._falloff = positiveFinite(value, "falloff");
    },
  },
});

export default SceneGISGaussianSegmentedPrimitive;

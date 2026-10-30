import Cartesian3 from "../../Core/Cartesian3.js";
import DeveloperError from "../../Core/DeveloperError.js";
import destroyObject from "../../Core/destroyObject.js";
import Matrix4 from "../../Core/Matrix4.js";
import RuntimeError from "../../Core/RuntimeError.js";
import TaskProcessor from "../../Core/TaskProcessor.js";

function finiteVector(name, value) {
  if (!value || ![value.x, value.y, value.z].every(Number.isFinite)) {
    throw new DeveloperError(`${name} must be a finite Cartesian3.`);
  }
}

function affine(matrix, rigid) {
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(matrix?.[i])) {
      throw new DeveloperError("modelMatrix must contain 16 finite values.");
    }
  }
  if (
    matrix[3] !== 0 ||
    matrix[7] !== 0 ||
    matrix[11] !== 0 ||
    matrix[15] !== 1
  ) {
    throw new DeveloperError("modelMatrix must be affine.");
  }
  if (rigid) {
    for (let a = 0; a < 3; a++) {
      for (let b = a; b < 3; b++) {
        let dot = 0;
        for (let k = 0; k < 3; k++) {
          dot += matrix[a * 4 + k] * matrix[b * 4 + k];
        }
        if (Math.abs(dot - (a === b ? 1 : 0)) > 1e-10) {
          throw new DeveloperError(
            "The grid modelMatrix must be rigid, without scale or shear.",
          );
        }
      }
    }
    const determinant =
      matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6]) -
      matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2]) +
      matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]);
    if (determinant < 0) {
      throw new DeveloperError(
        "The grid modelMatrix must preserve orientation.",
      );
    }
  }
}

function positiveInteger(name, value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new DeveloperError(`${name} must be a positive safe integer.`);
  }
  return value;
}

/**
 * 在局部米制格网中进行异步、显式静态三角网格体素化。不要求 Scene 或图形上下文。每实例拥有一个延迟创建的 Worker，同一时刻仅运行一个任务。输入数组会复制，取消不会分离调用方缓冲。实例销毁后结果仍有效。
 * @alias SceneGISVoxelizer
 * @constructor
 * @param {SceneGISVoxelizer.Options} options 不可变格网与工作预算。
 * @throws {DeveloperError} 格网、变换、填充模式或预算无效。
 * @experimental 此 API 可能发生变化。
 */
function SceneGISVoxelizer(options = {}) {
  const dimensions = options.dimensions;
  const minimum = options.minimum ?? Cartesian3.ZERO;
  const matrix = options.modelMatrix ?? Matrix4.IDENTITY;
  finiteVector("dimensions", dimensions);
  finiteVector("minimum", minimum);
  affine(matrix, true);
  for (const value of [dimensions.x, dimensions.y, dimensions.z]) {
    positiveInteger("dimensions component", value);
  }
  const cellSize = options.cellSize;
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new DeveloperError(
      "cellSize must be finite and positive, in meters.",
    );
  }
  const fillMode = options.fillMode ?? "surface";
  if (fillMode !== "surface" && fillMode !== "enclosed") {
    throw new DeveloperError('fillMode must be "surface" or "enclosed".');
  }
  const limits = {
    maximumCells: options.maximumCells ?? 16777216,
    maximumInputBytes: options.maximumInputBytes ?? 268435456,
    maximumTriangles: options.maximumTriangles ?? 2000000,
    maximumCandidateTests: options.maximumCandidateTests ?? 50000000,
  };
  for (const [name, value] of Object.entries(limits)) {
    positiveInteger(name, value);
  }
  const count = dimensions.x * dimensions.y * dimensions.z;
  if (
    !Number.isSafeInteger(count) ||
    count > limits.maximumCells ||
    count > 0xffffffff
  ) {
    throw new DeveloperError(
      "Grid exceeds maximumCells or Uint32 indexing capacity.",
    );
  }
  for (const axis of ["x", "y", "z"]) {
    const maximum = minimum[axis] + dimensions[axis] * cellSize;
    if (!Number.isFinite(maximum) || maximum <= minimum[axis]) {
      throw new DeveloperError("Grid extent must be finite and representable.");
    }
  }
  this._grid = Object.freeze({
    dimensions: Object.freeze(Cartesian3.clone(dimensions)),
    minimum: Object.freeze(Cartesian3.clone(minimum)),
    cellSize,
    modelMatrix: Object.freeze(Matrix4.clone(matrix)),
    fillMode,
  });
  this._limits = limits;
  this._processor = undefined;
  this._pending = undefined;
}

/**
 * @typedef {object} SceneGISVoxelizer.Options
 * @property {Cartesian3} dimensions 正整数单元数量。
 * @property {number} cellSize 立方格宽，单位为米。
 * @property {Cartesian3} [minimum=Cartesian3.ZERO] 格网局部最小角点，单位为米。
 * @property {Matrix4} [modelMatrix=Matrix4.IDENTITY] 格网局部到世界的刚体变换，可为 ENU 或平面。
 * @property {string} [fillMode="surface"] 取值 "surface" 或 "enclosed"。enclosed 填充从域边界不可达的格网空腔，不保证等于真实物理内部。粗单元可能封闭孔洞，开放或裁剪网格可能泄漏。
 * @property {number} [maximumCells=16777216] 输出单元预算，enclosed 填充额外使用与格网大小相同的 Uint32 队列。
 * @property {number} [maximumInputBytes=268435456] 复制的网格位置和索引字节预算。
 * @property {number} [maximumTriangles=2000000] 三角形预算。
 * @property {number} [maximumCandidateTests=50000000] 三角形与候选单元测试预算，超出会拒绝任务。
 */

/**
 * @typedef {object} SceneGISVoxelizer.Mesh
 * @property {Float32Array|Float64Array} positions 网格局部坐标中打包的 XYZ 位置。
 * @property {Uint8Array|Uint16Array|Uint32Array} [indices] 三角形索引，缺失表示无索引三角形。
 * @property {Matrix4} [modelMatrix=Matrix4.IDENTITY] 网格局部到格网所在世界的仿射变换。
 */

/**
 * @typedef {object} SceneGISVoxelizer.Grid
 * @property {Cartesian3} dimensions 单元数量。
 * @property {number} cellSize 立方格宽，单位为米。
 * @property {Cartesian3} minimum 局部最小角点。
 * @property {Matrix4} modelMatrix 格网局部到世界的变换。
 * @property {string} fillMode 表面或格网封闭填充。
 */

/**
 * 独立快照。单元索引为 x+nx*(y+ny*z)，局部格心为 minimum+(ijk+0.5)*cellSize。元数据不可变，数据归调用方所有且可修改，不转移 GPU 或源所有权。
 * @typedef {object} SceneGISVoxelizer.Result
 * @property {number} version 布局版本，当前为 1。
 * @property {SceneGISVoxelizer.Grid} grid 格网坐标与填充规则。
 * @property {Uint8Array} data 0 为空，1 为保守表面，2 为格网封闭内部。
 * @property {SceneGISVoxelizer.Statistics} statistics 发布时的计算统计。
 */

/**
 * @typedef {object} SceneGISVoxelizer.Statistics
 * @property {number} triangles 输入三角形数。
 * @property {number} candidateTests 占据单元快捷跳过之前的候选单元数。
 * @property {number} surfaceCells 表面单元数。
 * @property {number} interiorCells 格网封闭单元数。
 * @property {number} inputBytes 复制的位置与索引字节数。
 * @property {number} outputBytes 占据数组字节数。
 * @property {number} computeMilliseconds Worker 计算时间，不含加载、复制和消息传输。
 */

Object.defineProperties(SceneGISVoxelizer.prototype, {
  /**
   * 不可变构造快照。
   * @memberof SceneGISVoxelizer.prototype
   * @type {SceneGISVoxelizer.Grid}
   * @readonly
   */
  grid: {
    get: function () {
      return this._grid;
    },
  },
  /**
   * 是否有待处理任务。
   * @memberof SceneGISVoxelizer.prototype
   * @type {boolean}
   * @readonly
   */
  busy: {
    get: function () {
      return this._pending !== undefined;
    },
  },
});

/**
 * 体素化显式三角形，接触单元即计为表面占据。退化三角形、非有限位置或无效索引会拒绝任务。不修复孔洞或推断材质。
 * @param {SceneGISVoxelizer.Mesh[]} meshes 静态三角网格，空数组生成空格网。
 * @returns {Promise<SceneGISVoxelizer.Result>} 独立结果；取消、几何无效或预算耗尽时拒绝。
 * @throws {DeveloperError} 已有待处理任务，或网格描述超出配置限制。
 */
SceneGISVoxelizer.prototype.voxelize = function (meshes) {
  if (this.busy) {
    throw new DeveloperError("Only one voxelization job may run per instance.");
  }
  if (!Array.isArray(meshes)) {
    throw new DeveloperError("meshes must be an array.");
  }
  let inputBytes = 0;
  let triangles = 0;
  for (const mesh of meshes) {
    const positions = mesh.positions;
    const indices = mesh.indices;
    if (
      !(
        positions instanceof Float32Array || positions instanceof Float64Array
      ) ||
      positions.length % 3 !== 0 ||
      (indices !== undefined &&
        !(
          indices instanceof Uint8Array ||
          indices instanceof Uint16Array ||
          indices instanceof Uint32Array
        ))
    ) {
      throw new DeveloperError(
        "Meshes require packed float XYZ and optional unsigned triangle indices.",
      );
    }
    const count = indices?.length ?? positions.length / 3;
    if (count % 3 !== 0) {
      throw new DeveloperError(
        "Mesh index/vertex count must be divisible by three.",
      );
    }
    affine(mesh.modelMatrix ?? Matrix4.IDENTITY, false);
    triangles += count / 3;
    inputBytes += positions.byteLength + (indices?.byteLength ?? 0);
    if (
      triangles > this._limits.maximumTriangles ||
      inputBytes > this._limits.maximumInputBytes
    ) {
      throw new DeveloperError(
        "Meshes exceed maximumTriangles or maximumInputBytes.",
      );
    }
  }
  const transfer = [];
  const snapshots = meshes.map((mesh) => {
    const positions = mesh.positions.slice();
    const indices = mesh.indices?.slice();
    transfer.push(positions.buffer);
    if (indices) {
      transfer.push(indices.buffer);
    }
    return {
      positions,
      indices,
      modelMatrix: Matrix4.clone(mesh.modelMatrix ?? Matrix4.IDENTITY),
    };
  });
  this._processor ??= new TaskProcessor("SceneGISVoxelizeWorker", 1);
  let resolveJob;
  let rejectJob;
  const promise = new Promise((resolve, reject) => {
    resolveJob = resolve;
    rejectJob = reject;
  });
  const pending = { reject: rejectJob };
  this._pending = pending;
  const finish = (error, result) => {
    if (this._pending !== pending) {
      return;
    }
    this._pending = undefined;
    if (error) {
      rejectJob(error);
      return;
    }
    resolveJob(
      Object.freeze({
        version: 1,
        grid: this._grid,
        data: result.data,
        statistics: Object.freeze({
          ...result.statistics,
          inputBytes,
          outputBytes: result.data.byteLength,
        }),
      }),
    );
  };
  try {
    this._processor
      .scheduleTask(
        {
          grid: this._grid,
          meshes: snapshots,
          limits: this._limits,
          triangles,
        },
        transfer,
      )
      .then(
        (result) => finish(undefined, result),
        (error) => finish(error),
      );
  } catch (error) {
    finish(error);
  }
  return promise;
};

/**
 * 将占据数据复制为二进制固体掩码，可供相同格网的 SceneGISWindSimulation 使用。此转换不验证物理实体性或源完整性。
 * @param {SceneGISVoxelizer.Result} result 体素快照。
 * @returns {Uint8Array} 调用方所有的新数组，0 为空，1 为占据。
 */
SceneGISVoxelizer.createSolidMask = function (result) {
  if (!(result?.data instanceof Uint8Array)) {
    throw new DeveloperError("result.data must be Uint8Array occupancy.");
  }
  return result.data.map((value) => {
    if (value > 2) {
      throw new DeveloperError("Occupancy values must be 0, 1 or 2.");
    }
    return value === 0 ? 0 : 1;
  });
};

/**
 *  取消待处理任务并终止此实例的 Worker，实例仍可复用。
 */
SceneGISVoxelizer.prototype.cancel = function () {
  const pending = this._pending;
  this._pending = undefined;
  this._processor = this._processor && this._processor.destroy();
  pending?.reject(new RuntimeError("Voxelization cancelled."));
};

/**
 *  @returns {boolean} 此实例是否已销毁。
 */
SceneGISVoxelizer.prototype.isDestroyed = function () {
  return false;
};

/**
 *  取消任务并释放自有 Worker，已返回数据仍有效。
 */
SceneGISVoxelizer.prototype.destroy = function () {
  this.cancel();
  return destroyObject(this);
};

export default SceneGISVoxelizer;

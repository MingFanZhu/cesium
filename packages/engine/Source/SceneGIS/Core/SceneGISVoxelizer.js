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
 * Asynchronous, explicit static triangle-mesh voxelization in a local metric grid.
 * No Scene or graphics context is required. Each instance owns one lazy Worker and allows
 * one job at a time. Input arrays are copied; cancellation never detaches caller buffers.
 * Results remain valid after this instance is destroyed.
 * @alias SceneGISVoxelizer
 * @constructor
 * @param {SceneGISVoxelizer.Options} options Immutable grid and work budgets.
 * @throws {DeveloperError} Invalid grid, transform, fill mode or budget.
 * @experimental This API is subject to change.
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
 * @property {Cartesian3} dimensions Positive integer cell counts.
 * @property {number} cellSize Cubic cell width in meters.
 * @property {Cartesian3} [minimum=Cartesian3.ZERO] Grid-local minimum corner in meters.
 * @property {Matrix4} [modelMatrix=Matrix4.IDENTITY] Rigid grid-local to world transform (ENU or planar).
 * @property {string} [fillMode="surface"] "surface" or "enclosed". Enclosed fills grid cavities unreachable
 * from the domain boundary, not guaranteed physical interiors. Coarse cells can seal holes; open or clipped meshes can leak.
 * @property {number} [maximumCells=16777216] Output cell budget. Enclosed fill additionally uses a Uint32 queue of this grid's size.
 * @property {number} [maximumInputBytes=268435456] Copied mesh position/index byte budget.
 * @property {number} [maximumTriangles=2000000] Triangle budget.
 * @property {number} [maximumCandidateTests=50000000] Triangle/candidate-cell test budget. Exceeding it rejects the job.
 */

/**
 * @typedef {object} SceneGISVoxelizer.Mesh
 * @property {Float32Array|Float64Array} positions Packed XYZ positions in mesh-local coordinates.
 * @property {Uint8Array|Uint16Array|Uint32Array} [indices] Triangle indices; absent means unindexed triangles.
 * @property {Matrix4} [modelMatrix=Matrix4.IDENTITY] Affine mesh-local to the same world as the grid.
 */

/**
 * @typedef {object} SceneGISVoxelizer.Grid
 * @property {Cartesian3} dimensions Cell counts.
 * @property {number} cellSize Cubic cell width in meters.
 * @property {Cartesian3} minimum Local minimum corner.
 * @property {Matrix4} modelMatrix Grid-local to world transform.
 * @property {string} fillMode Surface or grid-enclosed fill.
 */

/**
 * A detached snapshot. Cell index is x+nx*(y+ny*z); local center is minimum+(ijk+0.5)*cellSize.
 * Metadata is immutable. Data is caller-owned and mutable; no GPU or source ownership is transferred.
 * @typedef {object} SceneGISVoxelizer.Result
 * @property {number} version Layout version, currently 1.
 * @property {SceneGISVoxelizer.Grid} grid Grid coordinates and fill rule.
 * @property {Uint8Array} data 0 empty, 1 conservative surface, 2 grid-enclosed interior.
 * @property {SceneGISVoxelizer.Statistics} statistics Computation statistics at publication time.
 */

/**
 * @typedef {object} SceneGISVoxelizer.Statistics
 * @property {number} triangles Input triangle count.
 * @property {number} candidateTests Candidate-cell count before occupied-cell shortcuts.
 * @property {number} surfaceCells Number of surface cells.
 * @property {number} interiorCells Number of grid-enclosed cells.
 * @property {number} inputBytes Copied position/index bytes.
 * @property {number} outputBytes Occupancy array bytes.
 * @property {number} computeMilliseconds Worker computation time, excluding loading, copies and message transfer.
 */

Object.defineProperties(SceneGISVoxelizer.prototype, {
  /**
   * Immutable construction snapshot.
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
   * Whether a job is pending.
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
 * Voxelizes explicit triangles. Touching a cell counts as surface occupancy. Degenerate triangles,
 * nonfinite positions and invalid indices reject the job. Does not repair holes or infer materials.
 * @param {SceneGISVoxelizer.Mesh[]} meshes Static triangle meshes. An empty array produces an empty grid.
 * @returns {Promise<SceneGISVoxelizer.Result>} Independent result; rejects on cancellation, invalid geometry or budget exhaustion.
 * @throws {DeveloperError} Another job is pending or mesh descriptors exceed the configured limits.
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
 * Copies occupancy into a binary solid mask, suitable for SceneGISWindSimulation on the same grid.
 * This conversion does not validate physical solidity or source completeness.
 * @param {SceneGISVoxelizer.Result} result Voxel snapshot.
 * @returns {Uint8Array} New caller-owned array, 0 empty / 1 occupied.
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

/** Cancels the pending job and terminates this instance's Worker. The instance remains reusable. */
SceneGISVoxelizer.prototype.cancel = function () {
  const pending = this._pending;
  this._pending = undefined;
  this._processor = this._processor && this._processor.destroy();
  pending?.reject(new RuntimeError("Voxelization cancelled."));
};

/** @returns {boolean} Whether this instance has been destroyed. */
SceneGISVoxelizer.prototype.isDestroyed = function () {
  return false;
};

/** Cancels the job and releases the owned Worker. Previously returned data remains valid. */
SceneGISVoxelizer.prototype.destroy = function () {
  this.cancel();
  return destroyObject(this);
};

export default SceneGISVoxelizer;

import Cartesian3 from "../../Core/Cartesian3.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import JulianDate from "../../Core/JulianDate.js";
import Matrix4 from "../../Core/Matrix4.js";
import RuntimeError from "../../Core/RuntimeError.js";
import SceneMode from "../../Scene/SceneMode.js";
import model from "../Core/_private/_SceneGISWindModel.js";
import Solver from "./_private/_SceneGISWindSolver.js";

function validateControls(simulation) {
  if (
    typeof simulation.paused !== "boolean" ||
    !Number.isInteger(simulation.maximumStepsPerFrame) ||
    simulation.maximumStepsPerFrame < 1 ||
    simulation.maximumStepsPerFrame > 64
  ) {
    throw new DeveloperError(
      "paused must be boolean and maximumStepsPerFrame an integer in [1, 64].",
    );
  }
  model.rigid(simulation.modelMatrix);
}

/**
 * A borrowed, live view of a wind simulation's completed GPU field. Never destroy or modify
 * the textures. Resolve getters when binding uniforms, after the producer update; do not cache
 * texture identities across versions or resets. All samples are cell-centered. The atlas pixel
 * for cell (i,j,k) is (i+(k%atlasColumns)*nx, j+floor(k/atlasColumns)*ny).
 * Local sample position is minimum+(cell+0.5)*cellSize. Solids have zero velocity.
 * @typedef {object} SceneGISWindSimulation.GpuField
 * @property {SceneGISWindSimulation.GpuTexture} velocityTexture RGBA32F: local velocity xyz in m/s and dimensionless density ratio w.
 * @property {SceneGISWindSimulation.GpuTexture} solidTexture RGBA8: red equals one for solid, zero for fluid.
 * @property {Cartesian3} dimensions Read-only cell counts.
 * @property {Cartesian3} minimum Read-only local domain minimum in meters.
 * @property {number} cellSize Cubic cell width in meters.
 * @property {number} atlasColumns Number of Z slices per atlas row.
 * @property {Matrix4} modelMatrix Current rigid local-to-world transform, borrowed read-only.
 * @property {number} version Monotonically increasing completed-state version, including reset.
 * @property {number} generation Reset generation.
 * @property {number} simulationTime Completed physical seconds since reset.
 */

/**
 * Opaque borrowed native texture handle accepted by engine sampler uniform callbacks.
 * Do not construct, mutate or destroy it. This interface does not expose Renderer internals.
 * @typedef {object} SceneGISWindSimulation.GpuTexture
 * @property {number} width Atlas width in pixels.
 * @property {number} height Atlas height in pixels.
 */

/**
 * GPU-resident local isothermal air flow using D3Q19 MRT and optional Smagorinsky LES.
 * Mount once in Scene.primitives before GPU field consumers. No display is created by this
 * object. The collection normally owns destruction. Globe and Planar use the same local-meter
 * solver; modelMatrix must be rigid. This experimental version has periodic domain faces and
 * explicit voxel bounce-back solids. It is not a certified engineering CFD solver.
 *
 * Layout and physical options are construction snapshots. Recreate to change them. Fixed dt
 * converts uL=u*dt/dx and tau=0.5+3*nu*dt/dx^2. Require input Mach<=0.1 and
 * 0.5000001<tau<=2. Runtime acceleration may exceed the low-Mach regime; no hidden velocity clamp,
 * viscosity change or instability reset is applied. Unresolved walls and constant-coefficient LES
 * require independent domain/grid validation. State uses FP32 deviation populations (f-w).
 *
 * Normal Scene-time increments accumulate work; maximumStepsPerFrame limits execution, without
 * changing dt or discarding debt. Pause stops accrual; queued single steps still execute. Picking
 * and repeated updates with the same frame number never advance state. Time rewind resets.
 * Request-render applications must request frames explicitly. Destroy consumers before producer.
 *
 * @alias SceneGISWindSimulation
 * @constructor
 * @param {object} [options] Configuration.
 * @param {Cartesian3} [options.dimensions=new Cartesian3(128,128,32)] Integer cell counts >=4; product <=2097152.
 * @param {Cartesian3} [options.minimum=Cartesian3.ZERO] Local domain minimum in meters.
 * @param {number} [options.cellSize=2] Cubic cell width in meters.
 * @param {number} [options.timeStep=0.02] Fixed physical seconds per step.
 * @param {number} [options.kinematicViscosity=0.000015] Molecular kinematic viscosity in m^2/s.
 * @param {number} [options.smagorinskyConstant=0.12] Constant in [0,0.2]; zero disables LES.
 * @param {Cartesian3} [options.initialVelocity=new Cartesian3(5,0,0)] Initial fluid velocity in local m/s.
 * @param {Uint8Array} [options.solidMask] Copied x-fastest 0/1 cells, index x+nx*(y+ny*z).
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] Rigid local-to-world placement, copied.
 * @param {boolean} [options.paused=false] Initially pause physical time accumulation.
 * @param {number} [options.maximumStepsPerFrame=4] Maximum fixed steps per normal frame, integer 1..64.
 * @throws {DeveloperError} Invalid grid, units, controls or rigid transform.
 * @throws {RuntimeError} First update lacks SCENE3D/WebGL2/four float attachments or atlas capacity.
 * @experimental This API is subject to change while urban-flow qualification is in progress.
 * @example
 * const wind = scene.primitives.add(new Cesium.SceneGISWindSimulation({
 *   modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(origin),
 *   solidMask, paused: true
 * }));
 * wind.step(); // One physical step on the next normal render.
 * scene.requestRender();
 */
function SceneGISWindSimulation(options = {}) {
  this._config = model.configure(options);
  /**
   * Rigid placement. Moving it does not alter the local solution.
   * @type {Matrix4}
   */
  this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  /**
   * Pause Scene-time accumulation; explicit steps remain possible.
   * @type {boolean}
   */
  this.paused = options.paused ?? false;
  /**
   * Fixed-step work budget, integer 1..64.
   * @type {number}
   */
  this.maximumStepsPerFrame = options.maximumStepsPerFrame ?? 4;
  this._solver = undefined;
  this._lastFrame = undefined;
  this._lastTime = undefined;
  this._debt = 0;
  this._queued = 0;
  this._steps = 0;
  this._lastSteps = 0;
  this._version = 0;
  this._generation = 0;
  this._reset = false;
  this._field = undefined;
  validateControls(this);
}

Object.defineProperties(SceneGISWindSimulation.prototype, {
  /**
   * Whether GPU state is allocated.
   * @memberof SceneGISWindSimulation.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get() {
      return !!this._solver;
    },
  },
  /**
   * Completed physical seconds since reset.
   * @memberof SceneGISWindSimulation.prototype
   * @type {number}
   * @readonly
   */
  simulationTime: {
    get() {
      return this._steps * this._config.timeStep;
    },
  },
  /**
   * Fixed physical seconds per step.
   * @memberof SceneGISWindSimulation.prototype
   * @type {number}
   * @readonly
   */
  timeStep: {
    get() {
      return this._config.timeStep;
    },
  },
  /**
   * Pending Scene-time seconds plus queued manual work.
   * @memberof SceneGISWindSimulation.prototype
   * @type {number}
   * @readonly
   */
  pendingTime: {
    get() {
      return this._debt + this._queued * this.timeStep;
    },
  },
  /**
   * Completed steps in the latest normal frame.
   * @memberof SceneGISWindSimulation.prototype
   * @type {number}
   * @readonly
   */
  stepsLastFrame: {
    get() {
      return this._lastSteps;
    },
  },
  /**
   * Owned texture bytes, excluding shared renderer resources.
   * @memberof SceneGISWindSimulation.prototype
   * @type {number}
   * @readonly
   */
  textureByteLength: {
    get() {
      return this._solver?.byteLength ?? 0;
    },
  },
});

/**
 * Queue fixed steps, including while paused; the per-frame budget still applies.
 * @param {number} [count=1] Integer 1..1000000.
 */
SceneGISWindSimulation.prototype.step = function (count = 1) {
  if (
    !Number.isInteger(count) ||
    count < 1 ||
    count > 1000000 ||
    this._queued + count > 1000000
  ) {
    throw new DeveloperError(
      "Queued step count must be an integer in [1,1000000].",
    );
  }
  this._queued += count;
};
/** Restore initial fields/time on the next normal render, even paused, and cancel queued work. */
SceneGISWindSimulation.prototype.reset = function () {
  this._reset = true;
  this._queued = 0;
};
/**
 * Get the live borrowed GPU descriptor; does not initialize or step the solver.
 * @returns {SceneGISWindSimulation.GpuField|undefined} Undefined before first normal render.
 */
SceneGISWindSimulation.prototype.getGpuField = function () {
  return this._field;
};

function createField(simulation) {
  const c = simulation._config;
  return Object.freeze({
    get velocityTexture() {
      return simulation._solver.velocity;
    },
    get solidTexture() {
      return simulation._solver.solid;
    },
    dimensions: Object.freeze(Cartesian3.clone(c.dimensions)),
    minimum: Object.freeze(Cartesian3.clone(c.minimum)),
    cellSize: c.cellSize,
    get atlasColumns() {
      return simulation._solver.columns;
    },
    get modelMatrix() {
      return simulation.modelMatrix;
    },
    get version() {
      return simulation._version;
    },
    get generation() {
      return simulation._generation;
    },
    get simulationTime() {
      return simulation.simulationTime;
    },
  });
}

/** @private */
SceneGISWindSimulation.prototype.update = function (frameState) {
  if (!frameState.passes.render || this._lastFrame === frameState.frameNumber) {
    return;
  }
  validateControls(this);
  if (frameState.mode !== SceneMode.SCENE3D) {
    throw new RuntimeError("Wind supports SCENE3D only.");
  }
  if (this._solver && this._solver.context !== frameState.context) {
    throw new DeveloperError("A wind simulation belongs to one Context.");
  }
  let elapsed = this._lastTime
    ? JulianDate.secondsDifference(frameState.time, this._lastTime)
    : 0;
  if (!this._solver) {
    this._solver = new Solver(frameState.context, this._config);
    this._field = createField(this);
    this._version++;
    elapsed = 0;
  }
  this._lastFrame = frameState.frameNumber;
  this._lastTime = JulianDate.clone(frameState.time, this._lastTime);
  this._lastSteps = 0;
  if (this._reset || elapsed < 0) {
    this._solver.reset();
    this._debt = this._steps = this._queued = 0;
    this._generation++;
    this._version++;
    this._reset = false;
    elapsed = 0;
  }
  if (!this.paused) {
    this._debt += elapsed;
  }
  const dt = this.timeStep;
  const automatic = this.paused ? 0 : Math.floor((this._debt + dt * 1e-9) / dt);
  const count = Math.min(this.maximumStepsPerFrame, automatic + this._queued);
  const manual = Math.min(this._queued, count);
  for (let i = 0; i < count; i++) {
    this._solver.step();
    this._steps++;
    this._version++;
    this._lastSteps++;
  }
  this._queued -= manual;
  this._debt = Math.max(0, this._debt - (count - manual) * dt);
};
/**
 * @returns {boolean} Whether this simulation has been destroyed.
 */
SceneGISWindSimulation.prototype.isDestroyed = function () {
  return false;
};
/**
 * Release all owned GPU resources. Borrowed descriptors become invalid.
 * @returns {undefined}
 */
SceneGISWindSimulation.prototype.destroy = function () {
  this._solver = this._solver?.destroy();
  this._field = undefined;
  return destroyObject(this);
};
export default SceneGISWindSimulation;

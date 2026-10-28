import Cartesian3 from "../../Core/Cartesian3.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import JulianDate from "../../Core/JulianDate.js";
import Matrix4 from "../../Core/Matrix4.js";
import RuntimeError from "../../Core/RuntimeError.js";
import SceneMode from "../../Scene/SceneMode.js";
import model from "../Core/_private/_SceneGISWindModel.js";
import Solver from "./_private/_SceneGISWindSolver.js";
import Tracer from "./_private/_SceneGISWindTracer.js";
import sample from "./_private/_SceneGISWindQuery.js";

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
 * @property {SceneGISWindSimulation.GpuTexture} concentrationTexture RGBA32F: r dimensionless tracer, g local outgoing transport CFL; b/a reserved zero.
 * @property {Cartesian3} dimensions Read-only cell counts.
 * @property {Cartesian3} minimum Read-only local domain minimum in meters.
 * @property {number} cellSize Cubic cell width in meters.
 * @property {number} atlasColumns Number of Z slices per atlas row.
 * @property {Matrix4} modelMatrix Current rigid local-to-world transform, borrowed read-only.
 * @property {number} version Monotonically increasing completed-state version, including reset.
 * @property {number} generation Reset generation.
 * @property {string} contextId Renderer context identity; consumers must use the same context.
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
 * solver; modelMatrix must be rigid. Static solids and no-slip faces use halfway bounce-back.
 * Open faces lie at the outer cell centers; wall/slip faces lie at domain faces. Inlets use
 * non-equilibrium extrapolation; outlets use first-order convection at prescribed normal wind.
 * Keep recirculation away from outlets and verify downstream buffer sensitivity.
 * It is not a certified engineering CFD solver.
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
 * @param {number} [options.windSpeed=5] Prescribed horizontal speed in m/s.
 * @param {number} [options.windDirection=0] Flow-towards angle, radians counterclockwise from local +X.
 * @param {Cartesian3} [options.initialVelocity] Initial fluid m/s; defaults to the prescribed wind.
 * @param {Cartesian3} [options.acceleration=Cartesian3.ZERO] Constant physical body acceleration in m/s^2 (MRT Guo forcing).
 * @param {SceneGISWindSimulation.BoundaryConditions} [options.boundaryConditions] Six domain faces.
 * @param {Uint8Array} [options.solidMask] Copied x-fastest 0/1 cells, index x+nx*(y+ny*z).
 * @param {number} [options.tracerDiffusivity=0] Explicit scalar diffusivity in m^2/s; 6*D*dt/dx^2 <= 0.5. First-order upwind also has numerical diffusion.
 * @param {SceneGISWindSimulation.TracerSource[]} [options.tracerSources=[]] Up to 16 passive source spheres.
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
  this._diffusivity = options.tracerDiffusivity ?? 0;
  Tracer.validateDiffusivity(this._diffusivity, this._config);
  this._sources = Tracer.sources(options.tracerSources ?? []);
  this._tracer = undefined;
  this._queries = new Set();
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

/**
 * A spherical, dimensionless passive source. Injection is uniform per fluid cell whose center
 * lies in the sphere. Solids receive none; a source can overlap domain limits. Rate is not mass/s.
 * @typedef {object} SceneGISWindSimulation.TracerSource
 * @property {Cartesian3} position Simulation-local meters.
 * @property {number} radius Positive radius in meters.
 * @property {number} rate Nonnegative tracer units per second per fluid cell.
 * @property {boolean} [enabled=true] Whether to inject.
 */

/**
 * Face modes: "wind" classifies inward/outward/tangent prescribed wind as inlet/outlet/slip;
 * "inlet" and "outlet" require the corresponding nonzero normal wind component.
 * "wall" is no-slip; "slip" is specular free-slip; "periodic" must be paired on an axis.
 * Oblique wind can have two inlets and two outlets. At mixed open corners inlet takes priority;
 * multiple outlets use the sum of their one-sided convective fluxes.
 * @typedef {object} SceneGISWindSimulation.BoundaryConditions
 * @property {string} [xMin="wind"] Minimum X face.
 * @property {string} [xMax="wind"] Maximum X face.
 * @property {string} [yMin="wind"] Minimum Y face.
 * @property {string} [yMax="wind"] Maximum Y face.
 * @property {string} [zMin="wall"] Ground face.
 * @property {string} [zMax="slip"] Top face.
 */

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
      return (this._solver?.byteLength ?? 0) + (this._tracer?.byteLength ?? 0);
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

/**
 * Replace source configuration atomically without clearing concentration or resetting velocity.
 * New injection takes effect on the next physical step. Inputs are copied.
 * @param {SceneGISWindSimulation.TracerSource[]} sources At most 16 spheres.
 */
SceneGISWindSimulation.prototype.setTracerSources = function (sources) {
  this._sources = Tracer.sources(sources);
  this._tracer?.setSources(this._sources);
};

/**
 * Snapshot one nearest cell without blocking on a full field readback. The returned Promise uses
 * native PBO/fence polling; at most 16 requests can be outstanding. Destruction rejects them.
 * Call after ready. Position must be inside the half-open local domain.
 * @param {Cartesian3} position Local meters.
 * @returns {Promise<SceneGISWindSimulation.Sample>} Completed snapshot with its version/time.
 */
SceneGISWindSimulation.prototype.sampleAsync = function (position) {
  model.finiteVector("sample position", position);
  if (!this.ready || this._queries.size >= 16) {
    throw new DeveloperError(
      "sampleAsync requires ready state and fewer than 16 outstanding requests.",
    );
  }
  const c = this._config,
    cell = new Cartesian3();
  for (const a of ["x", "y", "z"]) {
    cell[a] = Math.floor((position[a] - c.minimum[a]) / c.cellSize);
    if (cell[a] < 0 || cell[a] >= c.dimensions[a]) {
      throw new DeveloperError(
        "sample position must be inside the local domain.",
      );
    }
  }
  return sample(this, cell);
};

/**
 * @typedef {object} SceneGISWindSimulation.Sample
 * @property {Cartesian3} velocity Local m/s.
 * @property {number} density Dimensionless density ratio.
 * @property {number} concentration Dimensionless tracer amount.
 * @property {number} tracerCfl Outgoing scalar CFL; values >1 violate positivity stability.
 * @property {boolean} solid Whether the sampled cell is solid.
 * @property {Cartesian3} cell Integer cell index.
 * @property {number} version Snapshot version.
 * @property {number} simulationTime Snapshot physical seconds.
 */

function createField(simulation) {
  const c = simulation._config;
  return Object.freeze({
    get velocityTexture() {
      return simulation._solver.velocity;
    },
    get solidTexture() {
      return simulation._solver.solid;
    },
    get concentrationTexture() {
      return simulation._tracer.texture;
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
    get contextId() {
      return simulation._solver.context.id;
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
    try {
      this._tracer = new Tracer(this._solver, this._diffusivity, this._sources);
    } catch (error) {
      this._solver = this._solver.destroy();
      throw error;
    }
    this._field = createField(this);
    this._version++;
    elapsed = 0;
  }
  this._lastFrame = frameState.frameNumber;
  this._lastTime = JulianDate.clone(frameState.time, this._lastTime);
  this._lastSteps = 0;
  if (this._reset || elapsed < 0) {
    this._solver.reset();
    this._tracer.reset();
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
    this._tracer.step();
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
  for (const query of this._queries) {
    query.cancel();
  }
  this._tracer = this._tracer?.destroy();
  this._solver = this._solver?.destroy();
  this._field = undefined;
  return destroyObject(this);
};
export default SceneGISWindSimulation;

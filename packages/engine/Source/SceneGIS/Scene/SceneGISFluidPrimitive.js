import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import JulianDate from "../../Core/JulianDate.js";
import Matrix3 from "../../Core/Matrix3.js";
import Matrix4 from "../../Core/Matrix4.js";
import Quaternion from "../../Core/Quaternion.js";
import RuntimeError from "../../Core/RuntimeError.js";
import SceneMode from "../../Scene/SceneMode.js";
import Solver from "./_private/_SceneGISFluidSolver.js";
import Surface from "./_private/_SceneGISFluidSurface.js";
import WaterFrame from "./_private/_SceneGISWaterFrame.js";

function number(value, name, minimum, maximum = Infinity) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DeveloperError(
      `${name} must be finite in [${minimum}, ${maximum}].`,
    );
  }
}
function vector(value, name, minimum = -Infinity) {
  for (const axis of ["x", "y", "z"]) {
    number(value?.[axis], name, minimum);
  }
}
const rotation = new Matrix3();
const transpose = new Matrix3();
const orthogonal = new Matrix3();
function validate(primitive) {
  for (const name of ["show", "paused", "emitting", "reflections"]) {
    if (typeof primitive[name] !== "boolean") {
      throw new DeveloperError(`${name} must be boolean.`);
    }
  }
  number(primitive.emissionRate, "emissionRate", 0, 100000);
  number(primitive.emitterRadius, "emitterRadius", 0);
  number(primitive.particleLifetime, "particleLifetime", 0.01, 3600);
  number(primitive.restitution, "restitution", 0, 1);
  number(primitive.damping, "damping", 0, 100);
  number(primitive.roughness, "roughness", 0.02, 1);
  number(primitive.surfaceAnisotropy, "surfaceAnisotropy", 0, 1);
  number(primitive.sprayIntensity, "sprayIntensity", 0, 4);
  number(
    primitive.sprayParticleRadius,
    "sprayParticleRadius",
    primitive._config.particleSpacing * 0.04,
    primitive._config.particleSpacing * 0.25,
  );
  number(primitive.refractionStrength, "refractionStrength", 0, 1);
  for (const name of ["gravity", "emitterPosition", "emitterVelocity"]) {
    vector(primitive[name], name);
  }
  for (const name of ["waterColor", "absorption", "reflectionColor"]) {
    vector(primitive[name], name, 0);
  }
  const m = primitive.modelMatrix;
  for (let i = 0; i < 16; i++) {
    number(m?.[i], "modelMatrix", -Infinity);
  }
  Matrix4.getMatrix3(m, rotation);
  Matrix3.multiply(
    Matrix3.transpose(rotation, transpose),
    rotation,
    orthogonal,
  );
  if (
    !Matrix3.equalsEpsilon(orthogonal, Matrix3.IDENTITY, 1e-7) ||
    Math.abs(Matrix3.determinant(rotation) - 1) > 1e-7 ||
    m[3] !== 0 ||
    m[7] !== 0 ||
    m[11] !== 0 ||
    m[15] !== 1
  ) {
    throw new DeveloperError(
      "modelMatrix must be a rigid transform without scale or reflection.",
    );
  }
  const config = primitive._config;
  const orientation = primitive.emitterOrientation;
  for (const component of ["x", "y", "z", "w"]) {
    number(orientation?.[component], "emitterOrientation", -Infinity);
  }
  if (Math.abs(Quaternion.magnitudeSquared(orientation) - 1) > 1e-6) {
    throw new DeveloperError("emitterOrientation must be a unit quaternion.");
  }
  Matrix3.fromQuaternion(orientation, rotation);
  const axes = ["x", "y", "z"];
  for (let i = 0; i < 3; i++) {
    const axis = axes[i];
    const margin =
      config.particleRadius +
      primitive.emitterRadius * Math.hypot(rotation[i], rotation[i + 3]);
    if (
      primitive.emitterPosition[axis] < config.minimum[axis] + margin ||
      primitive.emitterPosition[axis] > config.maximum[axis] - margin
    ) {
      throw new DeveloperError(
        "The emitter disk must lie inside the local container.",
      );
    }
  }
}

/**
 * Native local GPU fluid with PBF density constraints and a reconstructed liquid surface.
 * Add to Scene.primitives. Requires WebGL2 floating MRT, HDR and SCENE3D. The camera must
 * remain outside the liquid. Scene opaque depth controls visibility, not physical collisions.
 * A closed local axis-aligned box provides collisions. No runtime CPU particle readback.
 *
 * All distances are local meters. Use an ENU modelMatrix on Globe or a rigid meter transform
 * on PlanarWorld. Changing modelMatrix moves existing particles and the container together.
 * Layout options are immutable; mutable controls are documented as instance properties.
 *
 * @alias SceneGISFluidPrimitive
 * @constructor
 * @param {object} [options] Initial configuration.
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] Rigid local-to-world transform.
 * @param {number} [options.maximumParticles=4096] Power-of-two capacity from 16 to 16384.
 * @param {Cartesian3} [options.minimum] Container minimum, default (-1,-1,0).
 * @param {Cartesian3} [options.maximum] Container maximum, default (1,1,3).
 * @param {number} [options.particleSpacing=0.065] Rest spacing; determines rest particle volume.
 * @param {number} [options.smoothingRadius] Neighbor kernel radius, default 2.5 times spacing.
 * @param {number} [options.particleRadius] Collision radius, default 0.4 times spacing.
 * @param {number} [options.renderRadius] Mutable reconstruction radius in meters, default 0.8 times spacing.
 * @param {number} [options.surfaceAnisotropy=1] Neighborhood-shaped reconstruction, from 0 (spheres) to 1 (ellipsoids).
 * @param {number} [options.sprayIntensity=0] Passive GPU spray generation strength, 0 to 4. Zero hides spray and stops new spray births.
 * @param {number} [options.sprayParticleRadius] Spray radius in meters, default 0.12 times spacing; range 0.04 to 0.25 times spacing.
 * @param {number} [options.solverIterations=2] Immutable density iterations, integer 1 to 8.
 * @param {number} [options.timeStep=0.016666666666666666] Fixed simulated seconds per step, from 1/240 to 1/30.
 * @param {number} [options.maximumSubSteps=2] Maximum catch-up steps per frame, integer 1 to 4; excess elapsed time is discarded.
 * @param {number} [options.resolutionScale=0.75] Screen-space reconstruction scale, 0.25 to 1.
 * @param {number} [options.initialParticles=0] Initial/reset lattice count, at most capacity.
 * @param {Cartesian3} [options.initialMinimum] Lattice origin, default container minimum plus collision radius.
 * @param {Cartesian3} [options.initialDimensions] Positive integer lattice dimensions, default (1,1,1).
 * @param {Cartesian3} [options.gravity] Local acceleration, default (0,0,-9.81).
 * @param {Cartesian3} [options.emitterPosition] Disk center in simulation coordinates, default (0,0,0.15).
 * @param {Quaternion} [options.emitterOrientation=Quaternion.IDENTITY] Unit rotation from emitter to simulation coordinates.
 * @param {Cartesian3} [options.emitterVelocity] Birth velocity in emitter coordinates, default (0,0,4).
 * @param {number} [options.emitterRadius=0.05] Disk radius in emitter XY.
 * @param {number} [options.emissionRate=120] Births per simulated second.
 * @param {number} [options.particleLifetime=8] Lifetime in simulated seconds; expired slots are inactive.
 * @param {number} [options.restitution=0.05] Box collision restitution, 0 to 1.
 * @param {number} [options.damping=0.1] Velocity damping per second, 0 to 100.
 * @param {Cartesian3} [options.waterColor] Linear RGB scattering color, default (0.025,0.22,0.3).
 * @param {Cartesian3} [options.absorption] RGB absorption per meter, default (3,0.8,0.4).
 * @param {Cartesian3} [options.reflectionColor] Linear RGB when no sky probe, default (0.25,0.4,0.55).
 * @param {number} [options.roughness=0.14] Dielectric roughness, 0.02 to 1.
 * @param {number} [options.refractionStrength=0.15] Bounded screen-space refraction scale, 0 to 1.
 * @param {boolean} [options.reflections=true] Trace opaque screen-space reflections; sky reflection remains active.
 * @param {boolean} [options.show=true] Display and simulate this primitive.
 * @param {boolean} [options.paused=false] Freeze simulation while keeping the liquid visible.
 * @param {boolean} [options.emitting=true] Enable births; existing fluid keeps simulating when false.
 * @exception {DeveloperError} Invalid layout, controls, non-rigid transform or cross-context use.
 * @exception {RuntimeError} Rendering requires HDR, SCENE3D and supported WebGL2 floating targets.
 * @example
 * scene.highDynamicRange = true;
 * const fluid = scene.primitives.add(new Cesium.SceneGISFluidPrimitive({
 *   modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(origin),
 *   emissionRate: 120,
 * }));
 * fluid.emitting = false; // Existing liquid continues to move.
 * fluid.paused = true;
 * fluid.reset();
 * scene.primitives.remove(fluid); // The collection destroys owned GPU resources.
 */
function SceneGISFluidPrimitive(options = {}) {
  const spacing = options.particleSpacing ?? 0.065;
  number(spacing, "particleSpacing", 0.001, 10);
  const config = (this._config = {
    maximumParticles: options.maximumParticles ?? 4096,
    minimum: Cartesian3.clone(options.minimum ?? new Cartesian3(-1, -1, 0)),
    maximum: Cartesian3.clone(options.maximum ?? new Cartesian3(1, 1, 3)),
    particleSpacing: spacing,
    smoothingRadius: options.smoothingRadius ?? spacing * 2.5,
    particleRadius: options.particleRadius ?? spacing * 0.4,
    solverIterations: options.solverIterations ?? 2,
    initialParticles: options.initialParticles ?? 0,
    initialDimensions: Cartesian3.clone(
      options.initialDimensions ?? Cartesian3.ONE,
    ),
  });
  number(config.maximumParticles, "maximumParticles", 16, 16384);
  if (
    !Number.isInteger(config.maximumParticles) ||
    (config.maximumParticles & (config.maximumParticles - 1)) !== 0
  ) {
    throw new DeveloperError("maximumParticles must be a power of two.");
  }
  number(config.smoothingRadius, "smoothingRadius", spacing, spacing * 4);
  number(config.particleRadius, "particleRadius", spacing * 0.1, spacing * 0.5);
  number(config.solverIterations, "solverIterations", 1, 8);
  number(
    config.initialParticles,
    "initialParticles",
    0,
    config.maximumParticles,
  );
  vector(config.minimum, "minimum");
  vector(config.maximum, "maximum");
  vector(config.initialDimensions, "initialDimensions", 1);
  config.initialMinimum = Cartesian3.clone(
    options.initialMinimum ??
      Cartesian3.add(
        config.minimum,
        new Cartesian3(
          config.particleRadius,
          config.particleRadius,
          config.particleRadius,
        ),
        new Cartesian3(),
      ),
  );
  vector(config.initialMinimum, "initialMinimum");
  let slots = 1;
  for (const axis of ["x", "y", "z"]) {
    if (
      !Number.isInteger(config.initialDimensions[axis]) ||
      config.initialDimensions[axis] > config.maximumParticles
    ) {
      throw new DeveloperError(
        "initialDimensions must contain integers no greater than capacity.",
      );
    }
    slots *= config.initialDimensions[axis];
    if (
      config.maximum[axis] - config.minimum[axis] <=
      2 * config.particleRadius
    ) {
      throw new DeveloperError(
        "Container dimensions must exceed the particle diameter.",
      );
    }
    if (
      config.initialParticles > 0 &&
      (config.initialMinimum[axis] <
        config.minimum[axis] + config.particleRadius - 1e-9 ||
        config.initialMinimum[axis] +
          (config.initialDimensions[axis] - 1) * spacing >
          config.maximum[axis] - config.particleRadius)
    ) {
      throw new DeveloperError(
        "The initial lattice must fit inside the container.",
      );
    }
  }
  if (
    !Number.isInteger(config.initialParticles) ||
    config.initialParticles > slots ||
    !Number.isInteger(config.solverIterations)
  ) {
    throw new DeveloperError(
      "Initial count and solver iterations must be integers; the lattice must contain the initial count.",
    );
  }
  this._timeStep = options.timeStep ?? 1 / 60;
  this._maximumSubSteps = options.maximumSubSteps ?? 2;
  this._resolutionScale = options.resolutionScale ?? 0.75;
  this._renderRadius = options.renderRadius ?? spacing * 0.8;
  number(this._timeStep, "timeStep", 1 / 240, 1 / 30);
  number(this._maximumSubSteps, "maximumSubSteps", 1, 4);
  number(this._resolutionScale, "resolutionScale", 0.25, 1);
  number(this._renderRadius, "renderRadius", spacing * 0.5, spacing * 1.5);
  if (!Number.isInteger(this._maximumSubSteps)) {
    throw new DeveloperError("maximumSubSteps must be an integer.");
  }
  /**
   * Rigid placement; moves all existing fluid.
   * @type {Matrix4}
   */
  this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  /**
   * Hide and freeze; hidden elapsed time is discarded.
   * @type {boolean}
   */
  this.show = options.show ?? true;
  /**
   * Freeze simulation; paused elapsed time is discarded.
   * @type {boolean}
   */
  this.paused = options.paused ?? false;
  /**
   * Control births independently of existing fluid.
   * @type {boolean}
   */
  this.emitting = options.emitting ?? true;
  /**
   * Births per simulated second; saturation replaces oldest circular slots.
   * @type {number}
   */
  this.emissionRate = options.emissionRate ?? 120;
  /**
   * Emitter disk center in simulation coordinates.
   * @type {Cartesian3}
   */
  this.emitterPosition = Cartesian3.clone(
    options.emitterPosition ?? new Cartesian3(0, 0, 0.15),
  );
  /**
   * Unit rotation from emitter coordinates to simulation coordinates. Rotates the
   * emission disk and birth velocity only. Changes affect new particles on the next
   * simulation step; existing particles, gravity and the container are unchanged.
   * Defaults to Quaternion.IDENTITY. Zero and non-unit quaternions are invalid.
   * @type {Quaternion}
   */
  this.emitterOrientation = Quaternion.clone(
    options.emitterOrientation ?? Quaternion.IDENTITY,
  );
  /**
   * Birth velocity in emitter coordinates, rotated by emitterOrientation.
   * @type {Cartesian3}
   */
  this.emitterVelocity = Cartesian3.clone(
    options.emitterVelocity ?? new Cartesian3(0, 0, 4),
  );
  /**
   * Disk radius in emitter XY before applying emitterOrientation.
   * @type {number}
   */
  this.emitterRadius = options.emitterRadius ?? 0.05;
  /**
   * Lifetime of new particles in simulated seconds.
   * @type {number}
   */
  this.particleLifetime = options.particleLifetime ?? 8;
  /**
   * Local acceleration in meters per second squared.
   * @type {Cartesian3}
   */
  this.gravity = Cartesian3.clone(
    options.gravity ?? new Cartesian3(0, 0, -9.81),
  );
  /**
   * Collision restitution, 0 to 1.
   * @type {number}
   */
  this.restitution = options.restitution ?? 0.05;
  /**
   * Exponential velocity damping per simulated second.
   * @type {number}
   */
  this.damping = options.damping ?? 0.1;
  /**
   * Linear RGB scattering color.
   * @type {Cartesian3}
   */
  this.waterColor = Cartesian3.clone(
    options.waterColor ?? new Cartesian3(0.025, 0.22, 0.3),
  );
  /**
   * RGB absorption per meter.
   * @type {Cartesian3}
   */
  this.absorption = Cartesian3.clone(
    options.absorption ?? new Cartesian3(3, 0.8, 0.4),
  );
  /**
   * Linear RGB reflection when no sky probe exists.
   * @type {Cartesian3}
   */
  this.reflectionColor = Cartesian3.clone(
    options.reflectionColor ?? new Cartesian3(0.25, 0.4, 0.55),
  );
  /**
   * Dielectric roughness, 0.02 to 1.
   * @type {number}
   */
  this.roughness = options.roughness ?? 0.14;
  /**
   * Screen-space refraction scale, 0 to 1.
   * @type {number}
   */
  this.refractionStrength = options.refractionStrength ?? 0.15;
  /**
   * Enable opaque screen-space reflection rays.
   * @type {boolean}
   */
  this.reflections = options.reflections ?? true;
  /**
   * Volume-preserving neighborhood shape strength, from 0 (spheres) to 1.
   * Only changes rendering, including while paused. Maximum semi-axis is less
   * than 1.6 times renderRadius. Shape resources are created lazily when nonzero,
   * retained until destruction, and recomputed only after simulation or reset.
   * @type {number}
   */
  this.surfaceAnisotropy = options.surfaceAnisotropy ?? 1;
  /**
   * Passive spray strength, from 0 to 4. Default 0. Fast surface flow and box
   * impacts generate secondary droplets, without changing the main fluid mass.
   * Zero hides spray and stops its births; allocated droplets keep aging on
   * simulation steps. Pausing or hiding freezes both pools. Reset clears spray.
   * The pool has maximumParticles slots, allocated on the first enabled step,
   * with 64 bytes per slot retained until destruction. No CPU particle readback.
   * @type {number}
   */
  this.sprayIntensity = options.sprayIntensity ?? 0;
  /**
   * Visual spray radius in meters, from 0.04 to 0.25 times particleSpacing.
   * Default 0.12 times spacing. Takes effect while paused without reallocation.
   * Droplets have size variation and bounded motion streaks. Spray is transparent
   * visual detail, with gravity, drag, finite lifetime and box/liquid reabsorption;
   * it does not contribute to fluid thickness, picking depth or density constraints.
   * @type {number}
   */
  this.sprayParticleRadius = options.sprayParticleRadius ?? spacing * 0.12;
  this._sceneGISWater = true;
  // Suspended fluid transmits visible background as well as opaque geometry.
  this._sceneGISWaterBackground = true;
  this._solver = undefined;
  this._surface = undefined;
  this._lastTime = undefined;
  this._accumulator = 0;
  this._birthRemainder = 0;
  this._reset = false;
  this._localBounds = BoundingSphere.fromCornerPoints(
    config.minimum,
    config.maximum,
  );
  this._localBounds.radius += this._renderRadius * 1.6;
  validate(this);
}

Object.defineProperties(SceneGISFluidPrimitive.prototype, {
  /**
   * Volume-equivalent reconstruction radius in meters, from 0.5 to 1.5 times the immutable
   * particleSpacing. Takes effect on the next render, including while paused.
   * Changes visible size and smoothing without resetting particles or allocating
   * GPU resources. Rest volume, neighbor spacing and collision radius are unchanged.
   *
   * @memberof SceneGISFluidPrimitive.prototype
   * @type {number}
   * @exception {DeveloperError} The radius is non-finite or outside the supported range.
   */
  renderRadius: {
    get() {
      return this._renderRadius;
    },
    set(value) {
      const config = this._config;
      number(
        value,
        "renderRadius",
        config.particleSpacing * 0.5,
        config.particleSpacing * 1.5,
      );
      this._renderRadius = value;
      BoundingSphere.fromCornerPoints(
        config.minimum,
        config.maximum,
        this._localBounds,
      );
      this._localBounds.radius += value * 1.6;
    },
  },
  /**
   * Immutable particle slot capacity.
   * @memberof SceneGISFluidPrimitive.prototype
   * @type {number}
   * @readonly
   */
  maximumParticles: {
    get() {
      return this._config.maximumParticles;
    },
  },
  /**
   * Fixed seconds per simulation step.
   * @memberof SceneGISFluidPrimitive.prototype
   * @type {number}
   * @readonly
   */
  timeStep: {
    get() {
      return this._timeStep;
    },
  },
  /**
   * Whether owned GPU resources exist.
   * @memberof SceneGISFluidPrimitive.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get() {
      return !!this._solver;
    },
  },
  /**
   * Owned texture and depth-buffer bytes, excluding shared scene captures.
   * @memberof SceneGISFluidPrimitive.prototype
   * @type {number}
   * @readonly
   */
  textureMemoryInBytes: {
    get() {
      return (this._solver?.byteLength ?? 0) + (this._surface?.byteLength ?? 0);
    },
  },
});

/**
 * Reset the initial lattice and emission sequence on the next visible render, even when paused.
 */
SceneGISFluidPrimitive.prototype.reset = function () {
  this._reset = true;
};

/**
 * @private
 */
SceneGISFluidPrimitive.prototype.update = function (frameState) {
  if (!frameState.passes.render) {
    return;
  }
  validate(this);
  let elapsed = this._lastTime
    ? JulianDate.secondsDifference(frameState.time, this._lastTime)
    : 0;
  this._lastTime = JulianDate.clone(frameState.time, this._lastTime);
  if (!this.show) {
    this._accumulator = 0;
    return;
  }
  const context = frameState.context;
  const water = WaterFrame.get(frameState);
  if (
    frameState.mode !== SceneMode.SCENE3D ||
    !water.hdr ||
    !context.webgl2 ||
    !context.depthTexture ||
    !context.colorBufferFloat ||
    !context.colorBufferHalfFloat ||
    !context.textureHalfFloatLinear
  ) {
    throw new RuntimeError(
      "SceneGISFluidPrimitive requires SCENE3D, HDR and WebGL2 floating-point color/depth textures.",
    );
  }
  if (this._solver && this._solver.context !== context) {
    throw new DeveloperError("A fluid primitive belongs to one Scene context.");
  }
  if (!this._solver) {
    this._solver = new Solver(context, {
      ...this._config,
      gravity: this.gravity,
      emitterPosition: this.emitterPosition,
      emitterOrientation: this.emitterOrientation,
      emitterVelocity: this.emitterVelocity,
      emitterRadius: this.emitterRadius,
      particleLifetime: this.particleLifetime,
      restitution: this.restitution,
      damping: this.damping,
    });
    try {
      this._surface = new Surface(this, frameState);
    } catch (error) {
      this._solver = this._solver.destroy();
      throw error;
    }
    elapsed = 0;
  }
  if (this._reset || elapsed < 0) {
    this._solver.parameters = this;
    this._solver.reset();
    this._accumulator = this._birthRemainder = 0;
    this._reset = false;
    elapsed = 0;
  }
  if (this.paused) {
    this._accumulator = 0;
  } else {
    this._accumulator = Math.min(
      this._accumulator + elapsed,
      this._timeStep * this._maximumSubSteps,
    );
    const count = Math.floor((this._accumulator + 1e-10) / this._timeStep);
    for (let i = 0; i < count; i++) {
      const births =
        this._birthRemainder +
        (this.emitting ? this.emissionRate * this._timeStep : 0);
      this._solver.step(this._timeStep, Math.floor(births), this);
      this._birthRemainder = births - Math.floor(births);
    }
    this._accumulator = Math.max(0, this._accumulator - count * this._timeStep);
  }
  this._surface.update(frameState);
  const command = this._surface.command;
  command.modelMatrix = this.modelMatrix;
  command.boundingVolume = BoundingSphere.transform(
    this._localBounds,
    this.modelMatrix,
    command.boundingVolume,
  );
  water.surfaces.push(this);
  frameState.commandList.push(command);
  if (this.sprayIntensity > 0 && this._solver.spray) {
    const spray = this._surface.sprayCommand;
    spray.modelMatrix = this.modelMatrix;
    spray.boundingVolume = command.boundingVolume;
    frameState.commandList.push(spray);
  }
};
/**
 * @private
 */
SceneGISFluidPrimitive.prototype._prepareWaterSurface = function (scene) {
  this._surface.prepare(scene);
};
/**
 * @returns {boolean} Whether this primitive has been destroyed.
 */
SceneGISFluidPrimitive.prototype.isDestroyed = function () {
  return false;
};
/**
 * Release all owned GPU state and screen targets. Scene capture textures remain Scene-owned.
 * @returns {undefined}
 */
SceneGISFluidPrimitive.prototype.destroy = function () {
  this._surface?.destroy();
  this._solver?.destroy();
  return destroyObject(this);
};
export default SceneGISFluidPrimitive;

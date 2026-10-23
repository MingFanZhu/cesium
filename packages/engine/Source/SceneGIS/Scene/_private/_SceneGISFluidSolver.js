import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Cartesian4 from "../../../Core/Cartesian4.js";
import destroyObject from "../../../Core/destroyObject.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import Matrix3 from "../../../Core/Matrix3.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import Quaternion from "../../../Core/Quaternion.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import common from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidCommon.js";
import predict from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidPredict.js";
import sort from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidSort.js";
import ranges from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidRanges.js";
import constraint from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidConstraint.js";
import finish from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidFinish.js";
import shape from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidShape.js";
import spray from "../../../Shaders/SceneGIS/Fluid/SceneGISFluidSpray.js";

function target(solver, width, height, count = 1) {
  const textures = [];
  try {
    for (let i = 0; i < count; i++) {
      textures.push(
        new Texture({
          context: solver.context,
          width,
          height,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
          sampler: Sampler.NEAREST,
          flipY: false,
        }),
      );
    }
    const result = new Framebuffer({
      context: solver.context,
      colorTextures: textures,
    });
    solver.targets.push(result);
    solver.byteLength += width * height * count * 16;
    return result;
  } catch (error) {
    textures.forEach((texture) => texture.destroy());
    throw error;
  }
}

function command(solver, source, defines = []) {
  const result = solver.context.createViewportQuadCommand(
    new ShaderSource({ defines, sources: [common, source] }),
    { owner: solver, uniformMap: solver.uniforms },
  );
  solver.commands.push(result);
  void result.shaderProgram.allUniforms;
  return result;
}

function draw(solver, cmd, framebuffer, range = false) {
  cmd.framebuffer = framebuffer;
  cmd.renderState = range
    ? solver.rangeRenderState
    : solver.particleRenderState;
  cmd.execute(solver.context);
  solver.drawCount++;
}

function release(solver) {
  solver.commands.forEach((cmd) => cmd.shaderProgram.destroy());
  solver.targets.forEach((framebuffer) => framebuffer.destroy());
}

/**
 * Fixed-capacity GPU PBF state and exact sorted-grid neighborhoods.
 * Internal local-meter solver; no frame scheduling or CPU readback.
 * @private
 */
function SceneGISFluidSolver(context, options) {
  if (
    !context.webgl2 ||
    !context.colorBufferFloat ||
    ContextLimits.maximumColorAttachments < 2 ||
    ContextLimits.maximumDrawBuffers < 2
  ) {
    throw new RuntimeError(
      "Fluid simulation requires WebGL2 and two floating-point color attachments.",
    );
  }
  const capacity = options.maximumParticles;
  if (
    !Number.isInteger(capacity) ||
    capacity < 16 ||
    capacity > 16384 ||
    (capacity & (capacity - 1)) !== 0
  ) {
    throw new DeveloperError(
      "maximumParticles must be a power of two from 16 to 16384.",
    );
  }
  this.context = context;
  this.capacity = capacity;
  this.width = 2 ** Math.ceil(Math.log2(capacity) / 2);
  this.height = capacity / this.width;
  this.minimum = Cartesian3.clone(options.minimum);
  this.maximum = Cartesian3.clone(options.maximum);
  this.radius = options.smoothingRadius;
  this.spacing = options.particleSpacing;
  this.particleRadius = options.particleRadius;
  this.iterations = options.solverIterations;
  this.maximumCorrection = this.radius * 0.1;
  this.cellSize = this.radius + 2 * this.iterations * this.maximumCorrection;
  this.cells = new Cartesian3();
  for (const axis of ["x", "y", "z"]) {
    const size = this.maximum[axis] - this.minimum[axis];
    if (!(
      Number.isFinite(size) &&
      size > 2 * this.particleRadius &&
      this.radius > 0
    )) {
      throw new DeveloperError(
        "Fluid bounds and smoothing radius must define a finite positive volume.",
      );
    }
    this.cells[axis] = Math.ceil(size / this.cellSize);
  }
  const cellCount = this.cells.x * this.cells.y * this.cells.z;
  if (cellCount > 262144) {
    throw new DeveloperError(
      "Fluid bounds exceed the 262144-cell spatial grid budget.",
    );
  }
  this.rangeWidth = Math.ceil(Math.sqrt(cellCount));
  this.rangeHeight = Math.ceil(cellCount / this.rangeWidth);
  this.targets = [];
  this.commands = [];
  this.byteLength = 0;
  this.drawCount = 0;
  this.index = 0;
  this.sortIndex = 0;
  this.sortStage = new Cartesian2();
  this.spawn = new Cartesian4();
  this.cursor = 0;
  this.serial = 0;
  this.sprayIndex = 0;
  this.sprayStep = 0;
  this.dt = 0;
  this.resetting = false;
  this.buildKeys = false;
  this.initialCount = options.initialParticles ?? 0;
  this.initialMinimum = Cartesian3.clone(
    options.initialMinimum ?? this.minimum,
  );
  this.initialDimensions = Cartesian3.clone(
    options.initialDimensions ?? Cartesian3.ONE,
  );
  this.parameters = options;
  this.emitterRotation = new Matrix3();
  this.uniforms = {
    u_position: () => this.inputPosition,
    u_velocity: () => this.inputVelocity,
    u_sorted: () => this.keys[this.sortIndex].getColorTexture(0),
    u_ranges: () => this.ranges.getColorTexture(0),
    u_lambda: () => this.lambda.getColorTexture(0),
    u_neighborPosition: () => this.neighborPosition,
    u_predicted: () => this.predicted.getColorTexture(0),
    u_minimum: () => this.minimum,
    u_maximum: () => this.maximum,
    u_cells: () => this.cells,
    u_radius: () => this.radius,
    u_spacing: () => this.spacing,
    u_particleRadius: () => this.particleRadius,
    u_cellSize: () => this.cellSize,
    u_maximumCorrection: () => this.maximumCorrection,
    u_capacity: () => this.capacity,
    u_reset: () => this.resetting,
    u_dt: () => this.dt,
    u_gravity: () => this.parameters.gravity,
    u_emitterPosition: () => this.parameters.emitterPosition,
    u_emitterRotation: () =>
      Matrix3.fromQuaternion(
        this.parameters.emitterOrientation ?? Quaternion.IDENTITY,
        this.emitterRotation,
      ),
    u_emitterVelocity: () => this.parameters.emitterVelocity,
    u_emitterRadius: () => this.parameters.emitterRadius,
    u_lifetime: () => this.parameters.particleLifetime,
    u_spawn: () => this.spawn,
    u_initialCount: () => this.initialCount,
    u_initialMinimum: () => this.initialMinimum,
    u_initialDimensions: () => this.initialDimensions,
    u_buildKeys: () => this.buildKeys,
    u_sort: () => this.sortStage,
    u_rangeWidth: () => this.rangeWidth,
    u_restitution: () => this.parameters.restitution,
    u_damping: () => this.parameters.damping,
    u_sprayPosition: () => this.spray[this.sprayIndex].getColorTexture(0),
    u_sprayVelocity: () => this.spray[this.sprayIndex].getColorTexture(1),
    u_sprayIntensity: () => this.parameters.sprayIntensity ?? 0,
    u_sprayStep: () => this.sprayStep,
    u_sprayReset: () => this.sprayReset,
    u_beforeVelocity: () => this.predicted.getColorTexture(1),
  };
  this.particleRenderState = RenderState.fromCache({
    viewport: new BoundingRectangle(0, 0, this.width, this.height),
  });
  this.rangeRenderState = RenderState.fromCache({
    viewport: new BoundingRectangle(0, 0, this.rangeWidth, this.rangeHeight),
  });
  try {
    this.buffers = [
      target(this, this.width, this.height, 2),
      target(this, this.width, this.height, 2),
    ];
    this.predicted = target(this, this.width, this.height, 2);
    this.projected = [
      target(this, this.width, this.height),
      target(this, this.width, this.height),
    ];
    this.lambda = target(this, this.width, this.height);
    this.keys = [
      target(this, this.width, this.height),
      target(this, this.width, this.height),
    ];
    this.ranges = target(this, this.rangeWidth, this.rangeHeight);
    this.predictCommand = command(this, predict);
    this.sortCommand = command(this, sort);
    this.rangeCommand = command(this, ranges);
    this.lambdaCommand = command(this, constraint);
    this.projectCommand = command(this, constraint, ["FLUID_PROJECT"]);
    this.finishCommand = command(this, finish);
    this.reset();
  } catch (error) {
    release(this);
    throw error;
  }
}

Object.defineProperties(SceneGISFluidSolver.prototype, {
  position: {
    get() {
      return this.buffers[this.index].getColorTexture(0);
    },
  },
  velocity: {
    get() {
      return this.buffers[this.index].getColorTexture(1);
    },
  },
});

SceneGISFluidSolver.prototype.reset = function () {
  this.surfaceDirty = true;
  this.neighborhoodValid = false;
  this.cursor = this.initialCount % this.capacity;
  this.serial = this.initialCount;
  this.resetting = true;
  this.dt = 0;
  this.drawCount = 0;
  this.inputPosition = this.position;
  this.inputVelocity = this.velocity;
  draw(this, this.predictCommand, this.predicted);
  this.inputPosition = this.predicted.getColorTexture(0);
  this.inputVelocity = this.predicted.getColorTexture(1);
  draw(this, this.finishCommand, this.buffers[1 - this.index]);
  this.index = 1 - this.index;
  this.resetting = false;
  this.sprayStep = 0;
  if (this.spray) {
    this.sprayReset = true;
    draw(this, this.sprayCommand, this.spray[1 - this.sprayIndex]);
    this.sprayIndex = 1 - this.sprayIndex;
    this.sprayReset = false;
  }
};

SceneGISFluidSolver.prototype.buildNeighborhood = function (position) {
  this.neighborhoodValid = true;
  this.inputPosition = position;
  this.neighborPosition = position;
  this.buildKeys = true;
  draw(this, this.sortCommand, this.keys[1 - this.sortIndex]);
  this.sortIndex = 1 - this.sortIndex;
  this.buildKeys = false;
  for (let k = 2; k <= this.capacity; k *= 2) {
    for (let j = k / 2; j >= 1; j /= 2) {
      this.sortStage.x = j;
      this.sortStage.y = k;
      draw(this, this.sortCommand, this.keys[1 - this.sortIndex]);
      this.sortIndex = 1 - this.sortIndex;
    }
  }
  draw(this, this.rangeCommand, this.ranges, true);
};

SceneGISFluidSolver.prototype.step = function (dt, births, parameters) {
  this.surfaceDirty = true;
  this.parameters = parameters;
  this.dt = dt;
  this.drawCount = 0;
  const count = Math.min(births, this.capacity);
  this.spawn.x = (this.cursor + births - count) % this.capacity;
  this.spawn.y = count;
  this.spawn.z = (this.serial + births - count) % 16777216;
  this.inputPosition = this.position;
  this.inputVelocity = this.velocity;
  draw(this, this.predictCommand, this.predicted);
  this.inputPosition = this.predicted.getColorTexture(0);
  this.buildNeighborhood(this.inputPosition);
  for (let i = 0; i < this.iterations; i++) {
    draw(this, this.lambdaCommand, this.lambda);
    draw(this, this.projectCommand, this.projected[i % 2]);
    this.inputPosition = this.projected[i % 2].getColorTexture(0);
  }
  this.inputVelocity = this.predicted.getColorTexture(1);
  draw(this, this.finishCommand, this.buffers[1 - this.index]);
  this.index = 1 - this.index;
  this.cursor = (this.cursor + births) % this.capacity;
  this.serial = (this.serial + births) % 16777216;
  if (parameters.sprayIntensity > 0 || this.spray) {
    this.initializeSpray();
    this.inputPosition = this.position;
    this.inputVelocity = this.velocity;
    draw(this, this.sprayCommand, this.spray[1 - this.sprayIndex]);
    this.sprayIndex = 1 - this.sprayIndex;
    this.sprayStep = (this.sprayStep + 1) % 16777216;
  }
};

SceneGISFluidSolver.prototype.initializeSpray = function () {
  if (this.spray) {
    return;
  }
  this.spray = [
    target(this, this.width, this.height, 2),
    target(this, this.width, this.height, 2),
  ];
  this.sprayCommand = command(this, spray);
  this.sprayReset = true;
  draw(this, this.sprayCommand, this.spray[1 - this.sprayIndex]);
  this.sprayIndex = 1 - this.sprayIndex;
  this.sprayReset = false;
};

SceneGISFluidSolver.prototype.updateSurface = function () {
  if (!this.shape) {
    if (
      ContextLimits.maximumColorAttachments < 3 ||
      ContextLimits.maximumDrawBuffers < 3
    ) {
      throw new RuntimeError(
        "Anisotropic fluid surfaces require three floating-point color attachments.",
      );
    }
    this.shape = target(this, this.width, this.height, 3);
    this.shapeCommand = command(this, shape);
  }
  if (!this.surfaceDirty) {
    return;
  }
  if (!this.neighborhoodValid) {
    this.buildNeighborhood(this.position);
  }
  this.inputPosition = this.position;
  draw(this, this.shapeCommand, this.shape);
  this.surfaceDirty = false;
};

SceneGISFluidSolver.prototype.isDestroyed = function () {
  return false;
};
SceneGISFluidSolver.prototype.destroy = function () {
  release(this);
  return destroyObject(this);
};
export default SceneGISFluidSolver;

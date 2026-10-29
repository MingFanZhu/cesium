import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import destroyObject from "../../../Core/destroyObject.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import moments from "../../../Shaders/SceneGIS/Wind/SceneGISWindMoments.js";
import lattice from "../../../Shaders/SceneGIS/Wind/SceneGISWindLattice.js";
import collision from "../../../Shaders/SceneGIS/Wind/SceneGISWindCollision.js";
import macro from "../../../Shaders/SceneGIS/Wind/SceneGISWindMacro.js";

function target(solver, count) {
  const textures = [];
  try {
    for (let i = 0; i < count; i++) {
      textures.push(
        new Texture({
          context: solver.context,
          width: solver.width,
          height: solver.height,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
          sampler: Sampler.NEAREST,
          flipY: false,
        }),
      );
    }
    const framebuffer = new Framebuffer({
      context: solver.context,
      colorTextures: textures,
    });
    solver.targets.push(framebuffer);
    solver.byteLength += solver.width * solver.height * 16 * count;
    return framebuffer;
  } catch (error) {
    textures.forEach((texture) => texture.destroy());
    throw error;
  }
}
function command(solver, source, defines = []) {
  const result = solver.context.createViewportQuadCommand(
    new ShaderSource({
      defines,
      sources: [solver.modelShader, lattice, source],
    }),
    {
      owner: solver,
      uniformMap: solver.uniforms,
      renderState: solver.renderState,
    },
  );
  solver.commands.push(result);
  void result.shaderProgram.allUniforms;
  return result;
}
function draw(solver, command, framebuffer) {
  command.framebuffer = framebuffer;
  command.execute(solver.context);
  solver.drawCount++;
}
function release(solver) {
  solver.commands.forEach((c) => c.shaderProgram.destroy());
  solver.targets.forEach((t) => t.destroy());
  solver.solid?.destroy();
}

/**
 * GPU-resident D3Q19 MRT, independent of Scene scheduling.
 * @private
 */
function SceneGISWindSolver(context, config) {
  if (
    !context.webgl2 ||
    !context.colorBufferFloat ||
    ContextLimits.maximumColorAttachments < 4 ||
    ContextLimits.maximumDrawBuffers < 4
  ) {
    throw new RuntimeError(
      "Wind simulation requires WebGL2 and four RGBA32F color attachments.",
    );
  }
  const n = config.dimensions;
  this.columns = Math.min(n.z, Math.ceil(Math.sqrt((n.y * n.z) / n.x)));
  this.width = this.columns * n.x;
  this.height = Math.ceil(n.z / this.columns) * n.y;
  if (Math.max(this.width, this.height) > ContextLimits.maximumTextureSize) {
    throw new RuntimeError(
      "Wind atlas exceeds the context texture dimension limit.",
    );
  }
  this.context = context;
  this.config = config;
  this.targets = [];
  this.commands = [];
  this.buffers = [];
  this.index = 0;
  this.resetting = false;
  this.byteLength = 0;
  this.drawCount = 0;
  this.modelShader = moments;
  this.renderState = RenderState.fromCache({
    viewport: new BoundingRectangle(0, 0, this.width, this.height),
  });
  this.uniforms = {
    u_f0: () => this.buffers[this.index][0].getColorTexture(0),
    u_f1: () => this.buffers[this.index][0].getColorTexture(1),
    u_f2: () => this.buffers[this.index][0].getColorTexture(2),
    u_f3: () => this.buffers[this.index][0].getColorTexture(3),
    u_f4: () => this.buffers[this.index][1].getColorTexture(0),
    u_solid: () => this.solid,
    u_dimensions: () => config.dimensions,
    u_columns: () => this.columns,
    u_initial: () => config.latticeVelocity,
    u_wind: () => config.latticeWind,
    u_acceleration: () => config.latticeAcceleration,
    u_boundaryMin: () => config.boundaryMin,
    u_boundaryMax: () => config.boundaryMax,
    u_velocity: () => this.velocity,
    u_tau: () => config.tau,
    u_cs: () => config.smagorinsky,
    u_reset: () => this.resetting,
    u_velocityScale: () => config.cellSize / config.timeStep,
  };
  try {
    for (let i = 0; i < 2; i++) {
      this.buffers.push([target(this, 4), target(this, 1)]);
    }
    this.macros = target(this, 1);
    this.velocity = this.macros.getColorTexture(0);
    const mask = new Uint8Array(this.width * this.height * 4);
    for (let z = 0; z < n.z; z++) {
      for (let y = 0; y < n.y; y++) {
        for (let x = 0; x < n.x; x++) {
          const pixel =
            x +
            (z % this.columns) * n.x +
            this.width * (y + Math.floor(z / this.columns) * n.y);
          mask[pixel * 4] = config.solidMask[x + n.x * (y + n.y * z)] * 255;
        }
      }
    }
    this.solid = new Texture({
      context,
      width: this.width,
      height: this.height,
      pixelFormat: PixelFormat.RGBA,
      pixelDatatype: PixelDatatype.UNSIGNED_BYTE,
      sampler: Sampler.NEAREST,
      flipY: false,
      source: { width: this.width, height: this.height, arrayBufferView: mask },
    });
    this.byteLength += mask.byteLength;
    this.collide = command(this, collision);
    this.collideLast = command(this, collision, ["WIND_LAST"]);
    this.publish = command(this, macro);
    this.reset();
  } catch (error) {
    release(this);
    throw error;
  }
}
SceneGISWindSolver.prototype.step = function () {
  const output = this.buffers[1 - this.index];
  draw(this, this.collide, output[0]);
  draw(this, this.collideLast, output[1]);
  this.index = 1 - this.index;
  draw(this, this.publish, this.macros);
};
SceneGISWindSolver.prototype.reset = function () {
  this.resetting = true;
  this.step();
  this.resetting = false;
};
SceneGISWindSolver.prototype.isDestroyed = function () {
  return false;
};
SceneGISWindSolver.prototype.destroy = function () {
  release(this);
  return destroyObject(this);
};
export default SceneGISWindSolver;

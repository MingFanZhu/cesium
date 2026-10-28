import Cartesian4 from "../../../Core/Cartesian4.js";
import destroyObject from "../../../Core/destroyObject.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import Sampler from "../../../Renderer/Sampler.js";
import Texture from "../../../Renderer/Texture.js";
import tracerShader from "../../../Shaders/SceneGIS/Wind/SceneGISWindTracer.js";
import model from "../../Core/_private/_SceneGISWindModel.js";

function sources(values) {
  if (!Array.isArray(values) || values.length > 16) {
    throw new DeveloperError("tracerSources must contain at most 16 spheres.");
  }
  return values.map((s) => {
    model.finiteVector("tracer source position", s.position);
    if (
      !Number.isFinite(s.radius) ||
      s.radius <= 0 ||
      !Number.isFinite(s.rate) ||
      s.rate < 0 ||
      (s.enabled !== undefined && typeof s.enabled !== "boolean")
    ) {
      throw new DeveloperError(
        "Tracer radius must be positive, rate nonnegative and enabled boolean.",
      );
    }
    return {
      sphere: new Cartesian4(
        s.position.x,
        s.position.y,
        s.position.z,
        s.radius,
      ),
      rate: s.enabled === false ? 0 : s.rate,
    };
  });
}
function release(t) {
  t.command?.shaderProgram.destroy();
  t.buffers.forEach((b) => b.destroy());
}
/**
 * Separate conservative passive-scalar transport, scheduled by the wind producer.
 * @private
 */
function SceneGISWindTracer(solver, diffusivity, sourceValues) {
  this.solver = solver;
  this.buffers = [];
  this.index = 0;
  this.resetting = false;
  this.setSources(sourceValues);
  const c = solver.config;
  try {
    for (let i = 0; i < 2; i++) {
      const texture = new Texture({
        context: solver.context,
        width: solver.width,
        height: solver.height,
        pixelFormat: PixelFormat.RGBA,
        pixelDatatype: PixelDatatype.FLOAT,
        sampler: Sampler.NEAREST,
        flipY: false,
      });
      try {
        this.buffers.push(
          new Framebuffer({
            context: solver.context,
            colorTextures: [texture],
          }),
        );
      } catch (error) {
        texture.destroy();
        throw error;
      }
    }
    this.command = solver.context.createViewportQuadCommand(tracerShader, {
      owner: this,
      renderState: solver.renderState,
      uniformMap: {
        u_concentration: () => this.texture,
        u_velocity: () => solver.velocity,
        u_solid: () => solver.solid,
        u_dimensions: () => c.dimensions,
        u_columns: () => solver.columns,
        u_minimum: () => c.minimum,
        u_dx: () => c.cellSize,
        u_dt: () => c.timeStep,
        u_diffusivity: () => diffusivity,
        u_boundaryMin: () => c.boundaryMin,
        u_boundaryMax: () => c.boundaryMax,
        u_reset: () => this.resetting,
        u_sourceCount: () => this.sources.length,
        u_sources: () => this.spheres,
        u_rates: () => this.rates,
      },
    });
    void this.command.shaderProgram.allUniforms;
    this.reset();
  } catch (error) {
    release(this);
    throw error;
  }
}
Object.defineProperties(SceneGISWindTracer.prototype, {
  texture: {
    get() {
      return this.buffers[this.index].getColorTexture(0);
    },
  },
  byteLength: {
    get() {
      return this.solver.width * this.solver.height * 32;
    },
  },
});
SceneGISWindTracer.sources = sources;
SceneGISWindTracer.prototype.setSources = function (values) {
  this.sources = values;
  this.spheres = Array.from(
    { length: 16 },
    (_, i) => values[i]?.sphere ?? Cartesian4.ZERO,
  );
  this.rates = Array.from({ length: 16 }, (_, i) => values[i]?.rate ?? 0);
};
SceneGISWindTracer.validateDiffusivity = function (value, config) {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (6 * value * config.timeStep) / config.cellSize ** 2 > 0.5
  ) {
    throw new DeveloperError(
      "tracerDiffusivity must be nonnegative and satisfy 6*D*dt/dx^2 <= 0.5.",
    );
  }
};
SceneGISWindTracer.prototype.step = function () {
  this.command.framebuffer = this.buffers[1 - this.index];
  this.command.execute(this.solver.context);
  this.index = 1 - this.index;
};
SceneGISWindTracer.prototype.reset = function () {
  this.resetting = true;
  this.step();
  this.resetting = false;
};
SceneGISWindTracer.prototype.isDestroyed = function () {
  return false;
};
SceneGISWindTracer.prototype.destroy = function () {
  release(this);
  return destroyObject(this);
};
export default SceneGISWindTracer;

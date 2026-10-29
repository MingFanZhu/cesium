import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";
import destroyObject from "../../../Core/destroyObject.js";
import PixelFormat from "../../../Core/PixelFormat.js";
import RuntimeError from "../../../Core/RuntimeError.js";
import BlendingState from "../../../Scene/BlendingState.js";
import Buffer from "../../../Renderer/Buffer.js";
import BufferUsage from "../../../Renderer/BufferUsage.js";
import ContextLimits from "../../../Renderer/ContextLimits.js";
import DrawCommand from "../../../Renderer/DrawCommand.js";
import Framebuffer from "../../../Renderer/Framebuffer.js";
import Pass from "../../../Renderer/Pass.js";
import PixelDatatype from "../../../Renderer/PixelDatatype.js";
import RenderState from "../../../Renderer/RenderState.js";
import Sampler from "../../../Renderer/Sampler.js";
import ShaderProgram from "../../../Renderer/ShaderProgram.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import Texture from "../../../Renderer/Texture.js";
import VertexArray from "../../../Renderer/VertexArray.js";
import sampling from "../SceneGISWindFieldSampling.js";
import display from "../../../Shaders/SceneGIS/Wind/SceneGISWindDisplay.js";
import particleState from "../../../Shaders/SceneGIS/Particles/SceneGISParticleState.js";
import update from "../../../Shaders/SceneGIS/Wind/SceneGISWindParticleUpdate.js";
import advance from "../../../Shaders/SceneGIS/Wind/SceneGISWindParticleAdvance.js";
import copy from "../../../Shaders/SceneGIS/Wind/SceneGISWindParticleCopy.js";
import draw from "../../../Shaders/SceneGIS/Wind/SceneGISWindParticleDraw.js";
import vertex from "../../../Shaders/SceneGIS/Wind/SceneGISWindParticleVS.js";
import trail from "../../../Shaders/SceneGIS/Wind/SceneGISWindTrailVS.js";
import fragment from "../../../Shaders/SceneGIS/Wind/SceneGISWindParticleFS.js";

function target(p, width, height, count) {
  const textures = [];
  try {
    for (let i = 0; i < count; i++) {
      textures.push(
        new Texture({
          context: p.context,
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
      context: p.context,
      colorTextures: textures,
    });
    p.targets.push(result);
    p.textureMemoryInBytes += width * height * count * 16;
    return result;
  } catch (error) {
    textures.forEach((t) => t.destroy());
    throw error;
  }
}
function compute(p, source) {
  const command = p.context.createViewportQuadCommand(
    new ShaderSource({
      sources: [particleState, sampling.shaderSource, update, source],
    }),
    { owner: p, uniformMap: p.uniforms, renderState: p.viewport },
  );
  p.commands.push(command);
  void command.shaderProgram.allUniforms;
  return command;
}
function capture(p, time) {
  const index = (p.head + 1) % p.capacity;
  p.tile.x = (index % p.columns) * p.width;
  p.tile.y = Math.floor(index / p.columns) * p.height;
  p.copy.renderState = p.historyViewports[index];
  p.copy.execute(p.context);
  p.head = index;
  p.count = Math.min(p.count + 1, p.capacity);
  p.times[index] = time;
}
function integrate(p, dt, reset = false) {
  p.deltaTime = dt;
  p.resetting = reset;
  p.advance.framebuffer = p.buffers[1 - p.index];
  p.advance.execute(p.context);
  p.index = 1 - p.index;
}
function history(p) {
  const width = p.width * p.columns,
    height = p.height * Math.ceil(p.capacity / p.columns);
  if (Math.max(width, height) > ContextLimits.maximumTextureSize) {
    throw new RuntimeError(
      "Wind trajectory atlas exceeds this context's texture size limit.",
    );
  }
  p.history = target(p, width, height, 1);
  p.historyByteLength = width * height * 16;
  p.copy = compute(p, copy);
  p.copy.framebuffer = p.history;
  p.historyViewports = Array.from({ length: p.capacity }, (_, i) =>
    RenderState.fromCache({
      viewport: new BoundingRectangle(
        (i % p.columns) * p.width,
        Math.floor(i / p.columns) * p.height,
        p.width,
        p.height,
      ),
    }),
  );
}
function drawCommand(p, source, trails) {
  const command = new DrawCommand({
    owner: p,
    vertexArray: p.array,
    count: 6,
    instanceCount: p.view.particleCount * (trails ? p.capacity : 1),
    pass: Pass.TRANSLUCENT,
    boundingVolume: new BoundingSphere(),
    shaderProgram: ShaderProgram.fromCache({
      context: p.context,
      vertexShaderSource: new ShaderSource({
        sources: [
          particleState,
          sampling.shaderSource,
          display,
          update,
          draw,
          source,
        ],
        defines: [`WIND_HISTORY_CAPACITY ${p.capacity}`],
      }),
      fragmentShaderSource: new ShaderSource({
        sources: [fragment],
        defines: trails ? ["WIND_TRAIL"] : [],
      }),
      attributeLocations: { a_corner: 0 },
    }),
    uniformMap: p.uniforms,
    renderState: RenderState.fromCache({
      depthTest: { enabled: true },
      depthMask: false,
      blending: BlendingState.ALPHA_BLEND,
    }),
  });
  p.commands.push(command);
  void command.shaderProgram.allUniforms;
  return command;
}
function enqueue(p, command, frameState, extent) {
  command.modelMatrix = p.field.modelMatrix;
  BoundingSphere.transform(
    p.bounds,
    p.field.modelMatrix,
    command.boundingVolume,
  );
  command.boundingVolume.radius += extent;
  frameState.commandList.push(command);
}
/** Wind-owned GPU integration and sampled three-dimensional history. @private */
function SceneGISWindParticles(view, field, bounds, context) {
  this.view = view;
  this.field = field;
  this.context = context;
  this.bounds = BoundingSphere.clone(bounds);
  this.width = Math.ceil(Math.sqrt(view.particleCount));
  this.height = Math.ceil(view.particleCount / this.width);
  this.capacity = view.trailSegments + 1;
  this.columns = Math.ceil(Math.sqrt(this.capacity));
  this.index = 0;
  this.head = -1;
  this.count = 0;
  this.times = new Float64Array(this.capacity);
  this.ages = Array(this.capacity).fill(0);
  this.tile = new Cartesian2();
  this.targets = [];
  this.commands = [];
  this.buffers = [];
  this.textureMemoryInBytes = this.historyByteLength = 0;
  this.viewport = RenderState.fromCache({
    viewport: new BoundingRectangle(0, 0, this.width, this.height),
  });
  this.resetting = true;
  this.duration = view.trailDuration;
  this.uniforms = {
    ...sampling.createUniformMap(field),
    u_position: () => this.buffers[this.index].getColorTexture(0),
    u_style: () => this.buffers[this.index].getColorTexture(1),
    u_history: () => this.history?.getColorTexture(0) ?? context.defaultTexture,
    u_historyColumns: () => this.columns,
    u_historyHead: () => this.head,
    u_historyCount: () => this.count,
    u_historyAges: () => this.ages,
    u_trailDuration: () => view.trailDuration,
    u_trailFade: () => view.trailFade,
    u_particleCount: () => view.particleCount,
    u_tile: () => this.tile,
    u_reset: () => this.resetting,
    u_dt: () => this.deltaTime,
    u_windTimeStep: () => view._simulation.timeStep,
    u_width: () => view.particleWidth,
    u_widthPixels: () => view.particleWidthUnits === "pixels",
    u_length: () => view.particleLength,
    u_opacity: () => view.particleOpacity,
    u_colorMaximum: () => view.colorMaximum,
    u_colorConcentration: () => view.colorBy === "concentration",
  };
  try {
    this.buffers.push(target(this, this.width, this.height, 2));
    this.buffers.push(target(this, this.width, this.height, 2));
    this.advance = compute(this, advance);
    this.array = new VertexArray({
      context,
      attributes: [
        {
          index: 0,
          componentsPerAttribute: 2,
          componentDatatype: ComponentDatatype.FLOAT,
          vertexBuffer: Buffer.createVertexBuffer({
            context,
            usage: BufferUsage.STATIC_DRAW,
            typedArray: new Float32Array([
              -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5,
            ]),
          }),
        },
      ],
    });
    this.draw = drawCommand(this, vertex, false);
    this.trails = drawCommand(this, trail, true);
  } catch (error) {
    this.destroy();
    throw error;
  }
}
SceneGISWindParticles.prototype.reset = function () {
  this.resetting = true;
};
SceneGISWindParticles.prototype.update = function (frameState) {
  const time = this.field.simulationTime;
  if (this.frame !== frameState.frameNumber) {
    const missed =
      this.frame !== undefined && frameState.frameNumber !== this.frame + 1;
    this.frame = frameState.frameNumber;
    const v = this.view,
      visible = v.show && v.showParticles;
    if (this.time !== undefined && time < this.time) {
      this.resetting = true;
    }
    if (
      !visible ||
      missed ||
      this.duration !== v.trailDuration ||
      !v.showTrails ||
      !this.wasVisible
    ) {
      this.count = 0;
      this.head = -1;
    }
    this.duration = v.trailDuration;
    if (visible) {
      if (this.resetting) {
        integrate(this, 0, true);
        this.resetting = false;
        this.count = 0;
        this.head = -1;
        this.time = time;
      }
      const start = missed || !this.wasVisible ? time : this.time;
      let cursor = start;
      if (v.showTrails) {
        if (!this.history) {
          history(this);
        }
        if (this.count === 0) {
          capture(this, start);
        }
        const interval = v.trailDuration / v.trailSegments;
        // Older motion is integrated without retaining discarded samples.
        let tick = Math.max(
          Math.floor(start / interval + 1e-9) + 1,
          Math.ceil((time - v.trailDuration) / interval - 1e-9),
        );
        for (
          let sample = tick * interval;
          sample <= time + interval * 1e-9;
          sample = ++tick * interval
        ) {
          integrate(this, Math.max(0, sample - cursor));
          capture(this, sample);
          cursor = sample;
        }
      }
      if (time > cursor + 1e-10) {
        integrate(this, time - cursor);
      }
      for (let i = 0; i < this.capacity; i++) {
        this.ages[i] = Math.max(0, time - this.times[i]);
      }
    }
    this.wasVisible = visible;
    this.time = time;
  }
  if (!this.view.show || !this.view.showParticles) {
    return;
  }
  const extent = Math.max(
    this.view.particleLength,
    this.view.particleWidthUnits === "meters" ? this.view.particleWidth : 0,
  );
  enqueue(this, this.draw, frameState, extent);
  if (this.view.showTrails && this.count > 0) {
    this.trails.instanceCount = this.view.particleCount * this.count;
    enqueue(this, this.trails, frameState, extent);
  }
};
SceneGISWindParticles.prototype.destroy = function () {
  this.commands.forEach((c) => c.shaderProgram.destroy());
  this.array?.destroy();
  this.targets.forEach((t) => t.destroy());
  return destroyObject(this);
};
SceneGISWindParticles.prototype.isDestroyed = function () {
  return false;
};
/** @private */
function createWindParticles(view, field, bounds, context) {
  return new SceneGISWindParticles(view, field, bounds, context);
}
export default createWindParticles;

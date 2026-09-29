import BoundingRectangle from "../../Core/BoundingRectangle.js";
import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian4 from "../../Core/Cartesian4.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import JulianDate from "../../Core/JulianDate.js";
import Matrix3 from "../../Core/Matrix3.js";
import Matrix4 from "../../Core/Matrix4.js";
import PixelFormat from "../../Core/PixelFormat.js";
import RuntimeError from "../../Core/RuntimeError.js";
import BlendingState from "../../Scene/BlendingState.js";
import SceneMode from "../../Scene/SceneMode.js";
import Buffer from "../../Renderer/Buffer.js";
import BufferUsage from "../../Renderer/BufferUsage.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import DrawCommand from "../../Renderer/DrawCommand.js";
import Framebuffer from "../../Renderer/Framebuffer.js";
import Pass from "../../Renderer/Pass.js";
import PixelDatatype from "../../Renderer/PixelDatatype.js";
import RenderState from "../../Renderer/RenderState.js";
import Sampler from "../../Renderer/Sampler.js";
import ShaderProgram from "../../Renderer/ShaderProgram.js";
import ShaderSource from "../../Renderer/ShaderSource.js";
import Texture from "../../Renderer/Texture.js";
import VertexArray from "../../Renderer/VertexArray.js";
import particleState from "../../Shaders/SceneGIS/Particles/SceneGISParticleState.js";
import particleUpdate from "../../Shaders/SceneGIS/Particles/SceneGISParticleUpdate.js";
import particleVertex from "../../Shaders/SceneGIS/Particles/SceneGISParticleVS.js";
import particleFragment from "../../Shaders/SceneGIS/Particles/SceneGISParticleFS.js";

const rotation = new Matrix3();
const transpose = new Matrix3();
const orthogonal = new Matrix3();
const seedPeriod = 16777216;

function validate(system) {
  if (typeof system.show !== "boolean" || typeof system.paused !== "boolean") {
    throw new DeveloperError("show and paused must be boolean.");
  }
  if (!Number.isFinite(system.emissionRate) || system.emissionRate < 0) {
    throw new DeveloperError("emissionRate must be finite and nonnegative.");
  }
  const sphere = system.boundingSphere;
  if (
    !sphere ||
    !Number.isFinite(sphere.radius) ||
    sphere.radius < 0 ||
    !Number.isFinite(sphere.center?.x) ||
    !Number.isFinite(sphere.center?.y) ||
    !Number.isFinite(sphere.center?.z)
  ) {
    throw new DeveloperError(
      "boundingSphere must be a finite local bounding sphere.",
    );
  }
  const m = system.modelMatrix;
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
    m[15] !== 1 ||
    !Number.isFinite(m[12]) ||
    !Number.isFinite(m[13]) ||
    !Number.isFinite(m[14])
  ) {
    throw new DeveloperError("modelMatrix must be a finite rigid transform.");
  }
}

function createTarget(context, width, height) {
  const textures = [];
  try {
    for (let i = 0; i < 4; ++i) {
      textures.push(
        new Texture({
          context,
          width,
          height,
          pixelFormat: PixelFormat.RGBA,
          pixelDatatype: PixelDatatype.FLOAT,
          sampler: Sampler.NEAREST,
        }),
      );
    }
    return new Framebuffer({ context, colorTextures: textures });
  } catch (error) {
    for (const texture of textures) {
      texture.destroy();
    }
    throw error;
  }
}

function release(state) {
  if (!state) {
    return;
  }
  state.updateCommand?.shaderProgram.destroy();
  state.drawCommand?.shaderProgram.destroy();
  state.vertexArray?.destroy();
  state.image?.destroy();
  state.pickId?.destroy();
  for (const buffer of state.buffers) {
    buffer.destroy();
  }
}

function createResources(system, context) {
  if (
    !context.webgl2 ||
    !context.colorBufferFloat ||
    ContextLimits.maximumColorAttachments < 4 ||
    ContextLimits.maximumDrawBuffers < 4
  ) {
    throw new RuntimeError(
      "GPU particles require WebGL2 and four floating-point color attachments.",
    );
  }
  const width = Math.ceil(Math.sqrt(system.maximumParticles));
  const height = Math.ceil(system.maximumParticles / width);
  if (Math.max(width, height) > ContextLimits.maximumTextureSize) {
    throw new RuntimeError(
      "Particle capacity exceeds this context's texture size limit.",
    );
  }
  const state = {
    context,
    buffers: [],
    index: 0,
    deltaTime: 0,
    reset: true,
    spawn: new Cartesian4(),
    serial: 0,
    bytes: width * height * 128,
  };
  try {
    state.buffers.push(createTarget(context, width, height));
    state.buffers.push(createTarget(context, width, height));
    const inputs = {
      u_sgPosition: () => state.buffers[state.index].getColorTexture(0),
      u_sgVelocity: () => state.buffers[state.index].getColorTexture(1),
      u_sgColor: () => state.buffers[state.index].getColorTexture(2),
      u_sgStyle: () => state.buffers[state.index].getColorTexture(3),
    };
    state.updateCommand = context.createViewportQuadCommand(
      new ShaderSource({
        sources: [particleState, system.simulationShader, particleUpdate],
      }),
      {
        owner: system,
        uniformMap: {
          ...system.uniformMap,
          ...inputs,
          u_sgCapacity: () => system.maximumParticles,
          u_sgDeltaTime: () => state.deltaTime,
          u_sgReset: () => state.reset,
          u_sgSpawn: () => state.spawn,
          u_sgSerial: () => state.serial,
          u_sgSeed: () => system.seed,
        },
        renderState: RenderState.fromCache({
          viewport: new BoundingRectangle(0, 0, width, height),
        }),
      },
    );
    // Compile during candidate construction so invalid user shaders release all resources.
    void state.updateCommand.shaderProgram.allUniforms;
    state.vertexArray = new VertexArray({
      context,
      attributes: [
        {
          index: 0,
          componentsPerAttribute: 2,
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
    if (system._image) {
      state.image = new Texture({ context, source: system._image });
    }
    state.pickId = context.createPickId({ primitive: system, id: system.id });
    state.drawCommand = new DrawCommand({
      owner: system,
      vertexArray: state.vertexArray,
      count: 6,
      instanceCount: system.maximumParticles,
      pass: Pass.TRANSLUCENT,
      pickId: "u_sgPickColor",
      boundingVolume: new BoundingSphere(),
      shaderProgram: ShaderProgram.fromCache({
        context,
        vertexShaderSource: new ShaderSource({
          sources: [particleState, particleVertex],
        }),
        fragmentShaderSource: particleFragment,
        attributeLocations: { a_corner: 0 },
      }),
      uniformMap: {
        ...inputs,
        u_sgHasImage: () => !!state.image,
        u_sgImage: () => state.image ?? context.defaultTexture,
        u_sgPickColor: () => state.pickId.color,
      },
      renderState: RenderState.fromCache({
        depthTest: { enabled: true },
        depthMask: false,
        blending: BlendingState.ALPHA_BLEND,
      }),
    });
    void state.drawCommand.shaderProgram.allUniforms;
    return state;
  } catch (error) {
    release(state);
    throw error;
  }
}

/**
 * A programmable GPU particle primitive for WebGL2 SCENE3D, including Globe and Planar.
 * Add to {@link Scene#primitives}; the collection normally owns its destruction.
 * CPU work schedules births only. State updates run in one four-target GPU pass and
 * sprites render as instanced camera-facing quads through native translucency/OIT.
 *
 * The simulationShader must define both GLSL functions:
 * <code>void initializeParticle(inout SceneGISParticle particle)</code> and
 * <code>void updateParticle(inout SceneGISParticle particle, float deltaTime)</code>.
 * SceneGISParticle contains position/velocity (vec3, local meters and meters/second),
 * color (vec4, straight-alpha Cesium-style color), size (vec2, full sprite size in meters),
 * rotation (float, radians counterclockwise on screen), life (float, seconds), age
 * (float, seconds) and seed (float, integer in [0, 16777215]). Age and seed are read-only
 * shader inputs. Other fields are persistent and controlled entirely by the shader;
 * the engine does not integrate velocity or apply any force. Initialization defaults
 * are zero position/velocity/rotation, white color, unit size and five-second life.
 * The update sees the advanced age; setting life to zero kills the particle.
 * <code>sceneGISParticleRandom(seed, stream)</code> returns a deterministic value in [0, 1).
 * Use distinct nonnegative integer streams for independent samples.
 *
 * Local state moves with modelMatrix. The caller must keep all positions and sprite
 * extents inside boundingSphere and write finite attributes, nonnegative sizes/colors
 * and alpha in [0, 1]. No CPU readback, per-particle picking, lighting, shadows,
 * collision, automatic bounds or JavaScript updateCallback is provided. Without native
 * OIT, instances are not individually sorted. TAA has no particle motion vectors.
 *
 * Births use circular slots; capacity saturation replaces older slots. A forward clock
 * jump passes its actual deltaTime to the shader and retains the newest capacity births.
 * No hidden time clamping/substeps occur. Shader sources, uniform-map keys, capacity,
 * seed and image are immutable. Uniform values can change through the supplied callbacks.
 *
 * @alias SceneGISGpuParticleSystem
 * @constructor
 * @param {object} options Configuration.
 * @param {string} options.simulationShader Initialization/update function definitions and custom uniform declarations.
 * @param {BoundingSphere} options.boundingSphere Conservative local bounds including maximum sprite extent.
 * @param {object} [options.uniformMap] Callbacks for shader uniforms; evaluated per update draw, never per particle. Names beginning with u_sg or czm_ are reserved. Borrowed uniform resources remain caller-owned.
 * @param {number} [options.maximumParticles=65536] Immutable slot capacity, integer in [1, 1048576].
 * @param {number} [options.seed=0] Immutable seed offset, integer in [0, 16777215].
 * @param {number} [options.emissionRate=1000] Births per second; finite and nonnegative.
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] Rigid local-to-world transform; use ENU for Globe.
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} [options.image] Decoded sprite image. Uploaded GPU copy is owned by this primitive; the input is borrowed. Undefined uses a soft disc.
 * @param {boolean} [options.show=true] Show and simulate the system.
 * @param {boolean} [options.paused=false] Freeze simulation while keeping current particles visible.
 * @param {*} [options.id] Object returned by system-level picking.
 * @throws {DeveloperError} Required shader/bounds are missing or options violate their documented ranges.
 * @throws {RuntimeError} On first update, the context lacks WebGL2 or four float color attachments.
 * @example
 * const acceleration = new Cesium.Cartesian3(0, 0, -2);
 * const particles = scene.primitives.add(new Cesium.SceneGISGpuParticleSystem({
 *   modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(origin),
 *   boundingSphere: new Cesium.BoundingSphere(Cesium.Cartesian3.ZERO, 100.0),
 *   simulationShader: `
 *     uniform vec3 u_acceleration;
 *     void initializeParticle(inout SceneGISParticle p) {
 *       float a = sceneGISParticleRandom(p.seed, 0.0) * 6.2831853;
 *       p.velocity = vec3(cos(a), sin(a), 4.0);
 *       p.life = 4.0;
 *     }
 *     void updateParticle(inout SceneGISParticle p, float dt) {
 *       p.position += p.velocity * dt + 0.5 * u_acceleration * dt * dt;
 *       p.velocity += u_acceleration * dt;
 *     }`,
 *   uniformMap: { u_acceleration: () => acceleration }
 * }));
 */
function SceneGISGpuParticleSystem(options = {}) {
  if (
    typeof options.simulationShader !== "string" ||
    !options.simulationShader.trim()
  ) {
    throw new DeveloperError("simulationShader is required.");
  }
  this._maximumParticles = options.maximumParticles ?? 65536;
  this._seed = options.seed ?? 0;
  if (
    !Number.isInteger(this._maximumParticles) ||
    this._maximumParticles < 1 ||
    this._maximumParticles > 1048576 ||
    !Number.isInteger(this._seed) ||
    this._seed < 0 ||
    this._seed >= seedPeriod
  ) {
    throw new DeveloperError("Invalid maximumParticles or seed.");
  }
  this._simulationShader = options.simulationShader;
  this._uniformMap = Object.freeze({ ...options.uniformMap });
  for (const [name, callback] of Object.entries(this._uniformMap)) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      /^(u_sg|czm_)/.test(name) ||
      typeof callback !== "function"
    ) {
      throw new DeveloperError(
        "uniformMap requires valid non-reserved names and function values.",
      );
    }
  }
  this._image = options.image;
  /**
   * Show and simulate; observed hidden frames pause the simulation clock.
   * @type {boolean}
   */
  this.show = options.show ?? true;
  /**
   * Freeze simulation while continuing to display the current particles.
   * @type {boolean}
   */
  this.paused = options.paused ?? false;
  /**
   * Births per second. Zero stops emission while living particles continue.
   * @type {number}
   */
  this.emissionRate = options.emissionRate ?? 1000;
  /**
   * Rigid local-to-world transform; changes also move existing particles.
   * @type {Matrix4}
   */
  this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  /**
   * Caller-maintained local bounds including sprite extent.
   * @type {BoundingSphere}
   */
  this.boundingSphere = BoundingSphere.clone(options.boundingSphere);
  /**
   * User value returned by picking this system.
   * @type {*}
   */
  this.id = options.id;
  this._state = undefined;
  this._lastTime = undefined;
  this._nextSlot = 0;
  this._serial = 0;
  this._remainder = 0;
  this._reset = true;
  validate(this);
}

Object.defineProperties(SceneGISGpuParticleSystem.prototype, {
  /**
   * Immutable slot capacity.
   * @memberof SceneGISGpuParticleSystem.prototype
   * @type {number}
   * @readonly
   */
  maximumParticles: {
    get() {
      return this._maximumParticles;
    },
  },
  /**
   * Immutable shader source.
   * @memberof SceneGISGpuParticleSystem.prototype
   * @type {string}
   * @readonly
   */
  simulationShader: {
    get() {
      return this._simulationShader;
    },
  },
  /**
   * Immutable uniform callback map; callbacks may return changing values.
   * @memberof SceneGISGpuParticleSystem.prototype
   * @type {object}
   * @readonly
   */
  uniformMap: {
    get() {
      return this._uniformMap;
    },
  },
  /**
   * Immutable deterministic seed offset.
   * @memberof SceneGISGpuParticleSystem.prototype
   * @type {number}
   * @readonly
   */
  seed: {
    get() {
      return this._seed;
    },
  },
  /**
   * Whether an initial GPU state has been published.
   * @memberof SceneGISGpuParticleSystem.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get() {
      return !!this._state && !this._reset;
    },
  },
  /**
   * Allocated simulation textures, excluding the optional sprite image.
   * @memberof SceneGISGpuParticleSystem.prototype
   * @type {number}
   * @readonly
   */
  textureMemoryInBytes: {
    get() {
      return this._state?.bytes ?? 0;
    },
  },
});

/**
 * Clear all particles and restart the deterministic emission sequence on the next
 * visible, unpaused normal frame. Reuses allocated resources; pick does not consume reset.
 */
SceneGISGpuParticleSystem.prototype.reset = function () {
  this._reset = true;
};

/** @private */
SceneGISGpuParticleSystem.prototype.update = function (frameState) {
  const normal = frameState.passes.render;
  if (!this.show || (normal && this.paused)) {
    if (normal) {
      this._lastTime = JulianDate.clone(frameState.time, this._lastTime);
    }
    if (!this.show) {
      return;
    }
  }
  validate(this);
  if (frameState.mode !== SceneMode.SCENE3D) {
    throw new RuntimeError("GPU particles support SCENE3D only.");
  }
  let state = this._state;
  if (state && state.context !== frameState.context) {
    throw new DeveloperError("GPU particles belong to one rendering context.");
  }
  if (normal && !this.paused) {
    state = this._state ??= createResources(this, frameState.context);
    let dt = this._lastTime
      ? JulianDate.secondsDifference(frameState.time, this._lastTime)
      : 0;
    if (dt < 0) {
      this._reset = true;
    }
    if (this._reset || dt > 0) {
      state.reset = this._reset;
      if (this._reset) {
        dt = 0;
        this._nextSlot = this._serial = this._remainder = 0;
      }
      const births = this._remainder + dt * this.emissionRate;
      const emitted = Math.floor(births);
      const count = Math.min(emitted, this.maximumParticles);
      this._remainder = births - emitted;
      state.spawn.x =
        (this._nextSlot + emitted - count) % this.maximumParticles;
      state.spawn.y = count;
      state.spawn.z = count
        ? (this._remainder + count - 1) / this.emissionRate
        : 0;
      state.spawn.w = count ? 1 / this.emissionRate : 0;
      state.serial = (this._serial + emitted - count) % seedPeriod;
      state.deltaTime = dt;
      state.updateCommand.framebuffer = state.buffers[1 - state.index];
      state.updateCommand.execute(frameState.context);
      state.index = 1 - state.index;
      this._nextSlot = (this._nextSlot + emitted) % this.maximumParticles;
      this._serial = (this._serial + emitted) % seedPeriod;
      this._reset = false;
    }
    this._lastTime = JulianDate.clone(frameState.time, this._lastTime);
  }
  if (!state) {
    return;
  }
  const command = state.drawCommand;
  command.modelMatrix = this.modelMatrix;
  BoundingSphere.transform(
    this.boundingSphere,
    this.modelMatrix,
    command.boundingVolume,
  );
  state.pickId.object.id = this.id;
  frameState.commandList.push(command);
};

/**
 * @returns {boolean} Whether this primitive has been destroyed.
 */
SceneGISGpuParticleSystem.prototype.isDestroyed = function () {
  return false;
};

/**
 * Release all owned targets, programs, quad, uploaded image and pick ID.
 * Borrowed uniform resources and source images remain caller-owned.
 * @returns {undefined}
 */
SceneGISGpuParticleSystem.prototype.destroy = function () {
  release(this._state);
  return destroyObject(this);
};

export default SceneGISGpuParticleSystem;

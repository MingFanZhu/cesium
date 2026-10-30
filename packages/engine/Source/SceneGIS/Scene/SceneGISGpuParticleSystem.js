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

function currentTime(system, frameState) {
  if (!system._timeSource) {
    return frameState.time;
  }
  const seconds = system._timeSource();
  if (!Number.isFinite(seconds)) {
    throw new DeveloperError("timeSource must return finite seconds.");
  }
  return seconds;
}

function rememberTime(system, time) {
  system._lastTime = system._timeSource
    ? time
    : JulianDate.clone(time, system._lastTime);
}

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
          sources: [particleState, system.renderShader, particleVertex],
        }),
        fragmentShaderSource: particleFragment,
        attributeLocations: { a_corner: 0 },
      }),
      uniformMap: {
        ...system.uniformMap,
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
 * 用于 WebGL2 SCENE3D 的可编程 GPU 粒子图元，支持球面和平面。加入 {@link Scene#primitives}，集合通常负责销毁。CPU 仅调度粒子出生；状态更新由一次四目标 GPU 通道完成，精灵以面向相机的实例化四边形接入原生透明/OIT。
 *
 * simulationShader 必须定义两个 GLSL 函数：<code>void initializeParticle(inout SceneGISParticle particle)</code> 和 <code>void updateParticle(inout SceneGISParticle particle, float deltaTime)</code>。
 * SceneGISParticle 包含 position/velocity（vec3，局部米和米/秒）、color（vec4，Cesium 风格的非预乘 alpha 颜色）、size（vec2，精灵全尺寸，米）、rotation（float，屏幕逆时针弧度）、life（float，秒）、age（float，秒）和 seed（float，[0,16777215] 内的整数）。age 与 seed 是只读着色器输入，其余字段持久保存并完全由着色器控制；引擎不积分速度或施加力。初始化默认位置、速度和旋转为零，颜色为白，尺寸为一，寿命为五秒。更新时 age 已推进，设置 life=0 可杀死粒子。
 * <code>sceneGISParticleRandom(seed, stream)</code> 返回 [0,1) 内的确定性数值，不同非负整数 stream 提供独立样本。
 * 可选 renderShader 定义 <code>void styleParticle(inout SceneGISParticle p)</code>，修改仅用于本次绘制的副本，不改变已保存的模拟状态，在冻结时间和拾取时也如此。它共享 uniformMap 与原生顶点内置变量；调用方提供的包围体必须包含它可能造成的最大位置和尺寸变化。
 *
 * 局部状态随 modelMatrix 移动。调用方须保证全部粒子位置与精灵范围位于 boundingSphere 内，属性有限，尺寸和颜色非负，alpha 在 [0,1]。不提供 CPU 回读、逐粒子拾取、光照、阴影、碰撞、自动包围体或 JavaScript updateCallback。无原生 OIT 时不逐实例排序；TAA 没有粒子运动向量。
 *
 * 出生使用循环槽位，容量满时覆盖旧粒子。时钟向前跳变时，着色器接收实际 deltaTime，仅保留最新 capacity 次出生；没有隐式时间截断或子步。着色器源码、uniform-map 键、容量、seed 和 image 均不可变，uniform 值可通过所提供的回调更新。
 *
 * @alias SceneGISGpuParticleSystem
 * @constructor
 * @param {object} options 配置。
 * @param {string} options.simulationShader 初始化和更新函数定义，以及自定义 uniform 声明。
 * @param {string} [options.renderShader] 仅绘制使用的 styleParticle 定义及自定义 uniform 声明，默认保持粒子不变。
 * @param {BoundingSphere} options.boundingSphere 包含精灵最大范围的保守局部包围体。
 * @param {object} [options.uniformMap] 模拟和绘制 uniform 回调，按绘制求值，不逐粒子调用。u_sg 或 czm_ 前缀保留。借用的 uniform 资源仍归调用方所有。
 * @param {number} [options.maximumParticles=65536] 不可变槽位容量，整数，范围 [1,1048576]。
 * @param {number} [options.initialParticles=0] 不可变的初始和重置填充量，整数，范围为零到 maximumParticles；这些粒子在常规发射前以零年龄初始化。
 * @param {number} [options.seed=0] 不可变种子偏移，整数，范围 [0,16777215]。
 * @param {number} [options.emissionRate=1000] 每秒出生数，须有限且非负。
 * @param {Function} [options.timeSource] 返回绝对模拟秒数的不可变回调，默认使用 Scene 时间。相同数值冻结，减小则重置；隐藏或暂停时的正常更新会消费时间，不补算。仅在正常渲染时调用。
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] 局部到世界的刚体变换，Globe 使用 ENU。
 * @param {HTMLImageElement|HTMLCanvasElement|ImageBitmap} [options.image] 已解码精灵图像。图元拥有上传后的 GPU 副本，输入仅借用；未定义时使用柔和圆盘。
 * @param {boolean} [options.show=true] 显示并模拟系统。
 * @param {boolean} [options.paused=false] 冻结模拟并保留当前粒子显示。
 * @param {*} [options.id] 系统级拾取返回的对象。
 * @throws {DeveloperError} 缺少必需着色器或包围体，或选项超出文档范围。
 * @throws {RuntimeError} 首次更新时 Context 不支持 WebGL2 或四个浮点颜色附件。
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
  this._initialParticles = options.initialParticles ?? 0;
  this._seed = options.seed ?? 0;
  if (
    !Number.isInteger(this._maximumParticles) ||
    this._maximumParticles < 1 ||
    this._maximumParticles > 1048576 ||
    !Number.isInteger(this._initialParticles) ||
    this._initialParticles < 0 ||
    this._initialParticles > this._maximumParticles ||
    !Number.isInteger(this._seed) ||
    this._seed < 0 ||
    this._seed >= seedPeriod
  ) {
    throw new DeveloperError(
      "Invalid maximumParticles, initialParticles or seed.",
    );
  }
  this._simulationShader = options.simulationShader;
  this._renderShader =
    options.renderShader ?? "void styleParticle(inout SceneGISParticle p) {}";
  if (typeof this._renderShader !== "string" || !this._renderShader.trim()) {
    throw new DeveloperError("renderShader must be a nonempty string.");
  }
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
  if (
    options.timeSource !== undefined &&
    typeof options.timeSource !== "function"
  ) {
    throw new DeveloperError("timeSource must be a function.");
  }
  this._timeSource = options.timeSource;
  /**
   * 显示并模拟；观测到的隐藏帧会暂停模拟时钟。
   * @type {boolean}
   */
  this.show = options.show ?? true;
  /**
   * 冻结模拟，同时继续显示当前粒子。
   * @type {boolean}
   */
  this.paused = options.paused ?? false;
  /**
   * 每秒出生数；0 停止发射，存活粒子继续运行。
   * @type {number}
   */
  this.emissionRate = options.emissionRate ?? 1000;
  /**
   * 局部到世界的刚体变换，修改也会移动已有粒子。
   * @type {Matrix4}
   */
  this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  /**
   * 调用方维护、包含精灵范围的局部包围体。
   * @type {BoundingSphere}
   */
  this.boundingSphere = BoundingSphere.clone(options.boundingSphere);
  /**
   * 拾取此系统返回的用户值。
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
   * 不可变的初始和重置填充数量。
   * @memberof SceneGISGpuParticleSystem.prototype
   * @type {number}
   * @readonly
   */
  initialParticles: {
    get() {
      return this._initialParticles;
    },
  },
  /**
   * 不可变、仅用于绘制的样式函数源码。
   * @memberof SceneGISGpuParticleSystem.prototype
   * @type {string}
   * @readonly
   */
  renderShader: {
    get() {
      return this._renderShader;
    },
  },
  /**
   * 不可变槽位容量。
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
   * 不可变着色器源码。
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
   * 不可变 uniform 回调表，回调可以返回变化的数值。
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
   * 不可变的确定性种子偏移。
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
   * 是否已发布初始 GPU 状态。
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
   * 已分配的模拟纹理，不含可选精灵图像。
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
 * 在下一次可见且未暂停的正常帧重新填充 initialParticles，并重启确定性发射序列。复用已分配资源，拾取不消费重置请求。
 */
SceneGISGpuParticleSystem.prototype.reset = function () {
  this._reset = true;
};

/** @private */
SceneGISGpuParticleSystem.prototype.update = function (frameState) {
  const normal = frameState.passes.render;
  const time = normal ? currentTime(this, frameState) : undefined;
  if (!this.show || (normal && this.paused)) {
    if (normal) {
      rememberTime(this, time);
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
    let dt =
      this._lastTime !== undefined
        ? this._timeSource
          ? time - this._lastTime
          : JulianDate.secondsDifference(time, this._lastTime)
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
      const births = state.reset
        ? this.initialParticles
        : this._remainder + dt * this.emissionRate;
      const emitted = Math.floor(births);
      const count = Math.min(emitted, this.maximumParticles);
      this._remainder = births - emitted;
      state.spawn.x =
        (this._nextSlot + emitted - count) % this.maximumParticles;
      state.spawn.y = count;
      state.spawn.z =
        count && !state.reset
          ? (this._remainder + count - 1) / this.emissionRate
          : 0;
      state.spawn.w = count && !state.reset ? 1 / this.emissionRate : 0;
      state.serial = (this._serial + emitted - count) % seedPeriod;
      state.deltaTime = dt;
      state.updateCommand.framebuffer = state.buffers[1 - state.index];
      state.updateCommand.execute(frameState.context);
      state.index = 1 - state.index;
      this._nextSlot = (this._nextSlot + emitted) % this.maximumParticles;
      this._serial = (this._serial + emitted) % seedPeriod;
      this._reset = false;
    }
    rememberTime(this, time);
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
 * @returns {boolean} 此图元是否已销毁。
 */
SceneGISGpuParticleSystem.prototype.isDestroyed = function () {
  return false;
};

/**
 * 释放全部自有目标、程序、四边形、已上传图像和拾取 ID；借用的 uniform 资源与源图像仍归调用方所有。
 * @returns {undefined}
 */
SceneGISGpuParticleSystem.prototype.destroy = function () {
  release(this._state);
  return destroyObject(this);
};

export default SceneGISGpuParticleSystem;

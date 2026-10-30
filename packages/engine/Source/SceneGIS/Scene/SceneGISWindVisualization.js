import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Matrix4 from "../../Core/Matrix4.js";
import PrimitiveType from "../../Core/PrimitiveType.js";
import BlendingState from "../../Scene/BlendingState.js";
import PostProcessStage from "../../Scene/PostProcessStage.js";
import Buffer from "../../Renderer/Buffer.js";
import BufferUsage from "../../Renderer/BufferUsage.js";
import DrawCommand from "../../Renderer/DrawCommand.js";
import Pass from "../../Renderer/Pass.js";
import RenderState from "../../Renderer/RenderState.js";
import ShaderProgram from "../../Renderer/ShaderProgram.js";
import ShaderSource from "../../Renderer/ShaderSource.js";
import VertexArray from "../../Renderer/VertexArray.js";
import sampling from "./SceneGISWindFieldSampling.js";
import model from "../Core/_private/_SceneGISWindModel.js";
import display from "../../Shaders/SceneGIS/Wind/SceneGISWindDisplay.js";
import volume from "../../Shaders/SceneGIS/Wind/SceneGISWindVolume.js";
import vertex from "../../Shaders/SceneGIS/Wind/SceneGISWindStreamlineVS.js";
import fragment from "../../Shaders/SceneGIS/Wind/SceneGISWindStreamlineFS.js";
import createWindParticles from "./_private/_SceneGISWindParticles.js";

function validate(v) {
  if (
    typeof v.show !== "boolean" ||
    typeof v.showStreamlines !== "boolean" ||
    typeof v.showParticles !== "boolean" ||
    typeof v.showTrails !== "boolean" ||
    !["meters", "pixels"].includes(v.particleWidthUnits) ||
    !Number.isFinite(v.particleWidth) ||
    v.particleWidth <= 0 ||
    v.particleWidth > 64 ||
    !Number.isFinite(v.particleLength) ||
    v.particleLength <= 0 ||
    v.particleLength > 256 ||
    !Number.isFinite(v.trailDuration) ||
    v.trailDuration <= 0 ||
    v.trailDuration > 120 ||
    !Number.isFinite(v.trailFade) ||
    v.trailFade < 0 ||
    v.trailFade > 8 ||
    !Number.isFinite(v.particleOpacity) ||
    v.particleOpacity < 0 ||
    v.particleOpacity > 1 ||
    !["volume", "slice", "none"].includes(v.mode) ||
    !["speed", "concentration"].includes(v.colorBy) ||
    !Number.isFinite(v.colorMaximum) ||
    v.colorMaximum <= 0 ||
    !Number.isFinite(v.extinction) ||
    v.extinction < 0 ||
    !Number.isFinite(v.sliceHeight)
  ) {
    throw new DeveloperError("Invalid wind display controls.");
  }
}
function release(v) {
  v._particles = v._particles?.destroy();
  v._removePreUpdate?.();
  v._removePreUpdate = undefined;
  if (v._stage && !v._scene.isDestroyed()) {
    v._scene.postProcessStages.remove(v._stage);
  } else if (v._stage && !v._stage.isDestroyed()) {
    v._stage.destroy();
  }
  v._stage = undefined;
  v._command?.shaderProgram.destroy();
  v._array?.destroy();
  v._command = v._array = undefined;
}
function create(v, context, field) {
  const n = field.dimensions,
    dx = field.cellSize,
    min = field.minimum;
  const uniforms = {
    ...sampling.createUniformMap(field),
    u_colorMaximum: () => v.colorMaximum,
    u_colorConcentration: () => v.colorBy === "concentration",
    u_eyeToLocal: () => v._eyeToLocal,
    u_extinction: () => v.extinction,
    u_slice: () => v.mode === "slice",
    u_sliceHeight: () => v.sliceHeight,
    u_lineStep: () => dx * 0.5,
  };
  const seedList =
    v._seeds ??
    Array.from(
      { length: 32 },
      (_, i) =>
        new Cartesian3(
          min.x + dx * 1.5,
          min.y + (((i % 8) + 0.5) * n.y * dx) / 8,
          min.z + ((Math.floor(i / 8) + 0.5) * n.z * dx) / 4,
        ),
    );
  const seedData = new Float32Array(seedList.length * 3);
  seedList.forEach((p, i) => Cartesian3.pack(p, seedData, i * 3));
  const steps = new Float32Array(v._segments * 2);
  for (let i = 0; i < v._segments; i++) {
    steps[2 * i] = i;
    steps[2 * i + 1] = i + 1;
  }
  const buffers = [];
  try {
    buffers.push(
      Buffer.createVertexBuffer({
        context,
        typedArray: steps,
        usage: BufferUsage.STATIC_DRAW,
      }),
    );
    buffers.push(
      Buffer.createVertexBuffer({
        context,
        typedArray: seedData,
        usage: BufferUsage.STATIC_DRAW,
      }),
    );
    v._array = new VertexArray({
      context,
      attributes: [
        {
          index: 0,
          vertexBuffer: buffers[0],
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 1,
        },
        {
          index: 1,
          vertexBuffer: buffers[1],
          componentDatatype: ComponentDatatype.FLOAT,
          componentsPerAttribute: 3,
          instanceDivisor: 1,
        },
      ],
    });
    v._command = new DrawCommand({
      owner: v,
      vertexArray: v._array,
      count: steps.length,
      instanceCount: seedList.length,
      primitiveType: PrimitiveType.LINES,
      pass: Pass.TRANSLUCENT,
      shaderProgram: ShaderProgram.fromCache({
        context,
        vertexShaderSource: new ShaderSource({
          sources: [sampling.shaderSource, display, vertex],
        }),
        fragmentShaderSource: fragment,
        attributeLocations: { a_step: 0, a_seed: 1 },
      }),
      uniformMap: uniforms,
      modelMatrix: field.modelMatrix,
      boundingVolume: new BoundingSphere(),
      renderState: RenderState.fromCache({
        depthTest: { enabled: true },
        depthMask: false,
        blending: BlendingState.ALPHA_BLEND,
      }),
    });
    void v._command.shaderProgram.allUniforms;
    v._stage = v._scene.postProcessStages.add(
      new PostProcessStage({
        fragmentShader: [sampling.shaderSource, display, volume].join("\n"),
        uniforms,
      }),
    );
    // Scene configures the post-process chain before primitive updates. Publish enable changes
    // at preUpdate, so allocation, execution and output selection use the same stage set.
    v._stage.enabled = false;
    v._removePreUpdate = v._scene.preUpdate.addEventListener(() => {
      validate(v);
      v._stage.enabled = v.show && v.mode !== "none";
    });
    const size = Cartesian3.multiplyByScalar(n, dx, new Cartesian3());
    v._bounds = new BoundingSphere(
      Cartesian3.add(
        min,
        Cartesian3.multiplyByScalar(size, 0.5, new Cartesian3()),
        new Cartesian3(),
      ),
      Cartesian3.magnitude(size) * 0.5,
    );
  } catch (error) {
    if (!v._array) {
      buffers.forEach((b) => b.destroy());
    }
    release(v);
    throw error;
  }
}

/**
 * GPU 风场体渲染、水平示踪切片和瞬时流线显示。在模拟之后加入 Scene.primitives。它拥有绘制命令、粒子状态/历史及一个后处理阶段，不拥有模拟。标记/线带尺寸与不透明度可实时调整。
 * 拖尾按已完成模拟时间的等间隔采样真实 RK2 位置，使用每个渲染批次最终速度快照；粒子重生断尾。隐藏期间丢弃历史且不补算，重置/回退清空历史，暂停保留位置和历史。体渲染/切片 alpha 仅来自计算得到的无量纲示踪量，颜色可表示风速或示踪量。不透明建筑和地形截断体积射线，透明表面不遮挡此后处理阶段。
 * 流线在当前场中以半格弧长进行中点积分，在固体或域边界终止；流线不是粒子历史轨迹，也不是额外湍流。此组件不按墙钟时间动画，不推进风场。应先于生产者销毁此消费者。
 * @alias SceneGISWindVisualization
 * @constructor
 * @param {object} options 配置。
 * @param {Scene} options.scene 拥有后处理集合的 Scene。
 * @param {SceneGISWindSimulation} options.simulation 已就绪或等待就绪的场生产者。
 * @param {boolean} [options.show=true] 是否启用显示。
 * @param {string} [options.mode="volume"] 显示模式："volume" 体渲染、"slice" 切片或 "none"。
 * @param {boolean} [options.showStreamlines=false] 显示瞬时流线。
 * @param {boolean} [options.showParticles=true] 显示按已完成模拟时间驱动的 GPU 流动标记。每个渲染批次采样最新已完成速度场，不是守恒浓度输运。
 * @param {number} [options.particleCount=4096] 不可变粒子容量，整数 1..65536。
 * @param {number} [options.particleWidth=1.4] 独立标记/线带宽度，范围 (0,64]，单位由 particleWidthUnits 决定。
 * @param {string} [options.particleWidthUnits="pixels"] 宽度单位为绘制缓冲区 "pixels" 或 "meters"。像素宽度在近距离仍保持细窄。
 * @param {number} [options.particleLength=2.5] 独立标记长度，单位为米，范围 (0,256]。
 * @param {number} [options.particleOpacity=0.75] 标记不透明度，范围 [0,1]，独立于示踪浓度。
 * @param {boolean} [options.showTrails=false] 绘制采样的三维粒子轨迹，不使用屏幕残影。
 * @param {number} [options.trailDuration=4] 保留已完成模拟历史的秒数，范围 (0,120]；修改仅重启历史。
 * @param {number} [options.trailSegments=32] 不可变历史容量，整数 1..128。包含填充后的粒子和历史纹理合计不得超过 64 MiB。
 * @param {number} [options.trailFade=1] 尾部不透明度指数，范围 [0,8]；零关闭按年龄淡出。particleOpacity 同时缩放标记与线带。
 * @param {string} [options.colorBy="speed"] 颜色依据："speed" 风速或 "concentration" 示踪浓度。
 * @param {number} [options.colorMaximum=10] 色标上限，单位为 m/s 或示踪量。
 * @param {number} [options.extinction=0.15] 每米、每单位示踪量对应的可视化不透明度系数。
 * @param {number} [options.sliceHeight=4] 模拟局部水平切片的 Z 高度，单位为米。
 * @param {Cartesian3[]} [options.streamlineSeeds] 1..256 个局部米制种子，会复制；默认在最小 X 侧设置 32 个。
 * @param {number} [options.streamlineSegments=64] 1..64 个半格段，在构造时快照保存。
 * @experimental 城市流动验证期间此 API 可能发生变化。
 */
function SceneGISWindVisualization(options) {
  if (!options?.scene || !options.simulation) {
    throw new DeveloperError("scene and simulation are required.");
  }
  this._scene = options.scene;
  this._simulation = options.simulation;
  /** @type {boolean} */ this.show = options.show ?? true;
  /** @type {string} */ this.mode = options.mode ?? "volume";
  /** @type {boolean} */ this.showStreamlines =
    options.showStreamlines ?? false;
  /** @type {boolean} */ this.showParticles = options.showParticles ?? true;
  /** @type {number} */ this.particleWidth = options.particleWidth ?? 1.4;
  /** @type {number} */ this.particleLength = options.particleLength ?? 2.5;
  /** @type {string} */ this.particleWidthUnits =
    options.particleWidthUnits ?? "pixels";
  /** @type {number} */ this.particleOpacity = options.particleOpacity ?? 0.75;
  /** @type {boolean} */ this.showTrails = options.showTrails ?? false;
  /** @type {number} */ this.trailDuration = options.trailDuration ?? 4;
  /** @type {number} */ this.trailFade = options.trailFade ?? 1;
  this._trailSegments = options.trailSegments ?? 32;
  if (
    !Number.isInteger(this._trailSegments) ||
    this._trailSegments < 1 ||
    this._trailSegments > 128
  ) {
    throw new DeveloperError("trailSegments must be an integer 1..128.");
  }
  this._particleCount = options.particleCount ?? 4096;
  if (
    !Number.isInteger(this._particleCount) ||
    this._particleCount < 1 ||
    this._particleCount > 65536
  ) {
    throw new DeveloperError("particleCount must be an integer 1..65536.");
  }
  const width = Math.ceil(Math.sqrt(this._particleCount));
  const slots = width * Math.ceil(this._particleCount / width);
  const columns = Math.ceil(Math.sqrt(this._trailSegments + 1));
  const rows = Math.ceil((this._trailSegments + 1) / columns);
  if (slots * (64 + 16 * columns * rows) > 64 * 1048576) {
    throw new DeveloperError(
      "Padded particle and trail textures exceed the 64 MiB capacity limit.",
    );
  }
  this._particles = undefined;
  this._particleGeneration = undefined;
  /** @type {string} */ this.colorBy = options.colorBy ?? "speed";
  /** @type {number} */ this.colorMaximum = options.colorMaximum ?? 10;
  /** @type {number} */ this.extinction = options.extinction ?? 0.15;
  /** @type {number} */ this.sliceHeight = options.sliceHeight ?? 4;
  this._segments = options.streamlineSegments ?? 64;
  if (
    !Number.isInteger(this._segments) ||
    this._segments < 1 ||
    this._segments > 64
  ) {
    throw new DeveloperError("streamlineSegments must be an integer 1..64.");
  }
  if (options.streamlineSeeds !== undefined) {
    if (
      !Array.isArray(options.streamlineSeeds) ||
      options.streamlineSeeds.length < 1 ||
      options.streamlineSeeds.length > 256
    ) {
      throw new DeveloperError(
        "streamlineSeeds must contain 1..256 positions.",
      );
    }
    this._seeds = options.streamlineSeeds.map((p) => {
      model.finiteVector("streamline seed", p);
      return Cartesian3.clone(p);
    });
  }
  this._eyeToLocal = new Matrix4();
  this._inverseModel = new Matrix4();
  this._stage = this._command = this._array = undefined;
  validate(this);
}
Object.defineProperties(SceneGISWindVisualization.prototype, {
  /**
   * 不可变 GPU 标记容量。
   * @memberof SceneGISWindVisualization.prototype
   * @type {number}
   * @readonly
   */
  particleCount: {
    get() {
      return this._particleCount;
    },
  },
  /**
   * 已分配粒子和历史纹理字节数，不含借用风场与场景目标。
   * @memberof SceneGISWindVisualization.prototype
   * @type {number}
   * @readonly
   */
  particleTextureByteLength: {
    get() {
      return this._particles?.textureMemoryInBytes ?? 0;
    },
  },
  /**
   * 不可变历史段容量，额外保留一个采样位置。
   * @memberof SceneGISWindVisualization.prototype
   * @type {number}
   * @readonly
   */
  trailSegments: {
    get() {
      return this._trailSegments;
    },
  },
  /**
   * 已分配历史纹理字节数，是 particleTextureByteLength 的子集，首次启用前为零。
   * @memberof SceneGISWindVisualization.prototype
   * @type {number}
   * @readonly
   */
  trailTextureByteLength: {
    get() {
      return this._particles?.historyByteLength ?? 0;
    },
  },
});
/** @private */
SceneGISWindVisualization.prototype.update = function (frameState) {
  if (!frameState.passes.render || frameState.passes.pick) {
    return;
  }
  validate(this);
  const field = this._simulation.getGpuField();
  if (!field) {
    return;
  }
  if (
    frameState.context !== this._scene.context ||
    field.contextId !== frameState.context.id
  ) {
    throw new DeveloperError(
      "Wind producer and visualization must belong to the same Scene context.",
    );
  }
  if (!this._command) {
    create(this, frameState.context, field);
  }
  Matrix4.inverseTransformation(field.modelMatrix, this._inverseModel);
  Matrix4.multiply(
    this._inverseModel,
    this._scene.camera.inverseViewMatrix,
    this._eyeToLocal,
  );
  if (this.show && this.showParticles && !this._particles) {
    this._particles = createWindParticles(
      this,
      field,
      this._bounds,
      frameState.context,
    );
  }
  if (this._particles) {
    if (this._particleGeneration !== field.generation) {
      this._particles.reset();
      this._particleGeneration = field.generation;
    }
    this._particles.update(frameState);
  }
  if (this.show && this.showStreamlines) {
    this._command.modelMatrix = field.modelMatrix;
    BoundingSphere.transform(
      this._bounds,
      field.modelMatrix,
      this._command.boundingVolume,
    );
    frameState.commandList.push(this._command);
  }
};
/**
 *  @returns {boolean} 是否已销毁。
 */
SceneGISWindVisualization.prototype.isDestroyed = function () {
  return false;
};
/**
 *  @returns {undefined} 仅释放自有显示资源。
 */
SceneGISWindVisualization.prototype.destroy = function () {
  release(this);
  return destroyObject(this);
};
export default SceneGISWindVisualization;

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
import GpuTimer from "./_private/_SceneGISWindGpuTimer.js";

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
 * 借用的实时风场已完成 GPU 数据视图。不得销毁或修改纹理。生产者更新后绑定 uniform 时解析 getter，不要跨版本或重置缓存纹理身份。全部采样位于格心，单元 (i,j,k) 的图集像素为 (i+(k%atlasColumns)*nx, j+floor(k/atlasColumns)*ny)，局部位置为 minimum+(cell+0.5)*cellSize。固体速度为零。
 * @typedef {object} SceneGISWindSimulation.GpuField
 * @property {SceneGISWindSimulation.GpuTexture} velocityTexture RGBA32F：局部速度 xyz 单位为 m/s，w 为无量纲密度比。
 * @property {SceneGISWindSimulation.GpuTexture} solidTexture RGBA8：红通道为 1 表示固体，0 表示流体。
 * @property {SceneGISWindSimulation.GpuTexture} concentrationTexture RGBA32F：r 为无量纲示踪量，g 为局部流出输运 CFL，b/a 保留为零。
 * @property {Cartesian3} dimensions 只读单元数量。
 * @property {Cartesian3} minimum 只读局部域最小点，单位为米。
 * @property {number} cellSize 立方格宽，单位为米。
 * @property {number} atlasColumns 每图集行的 Z 切片数。
 * @property {Matrix4} modelMatrix 当前局部到世界刚体变换，仅只读借用。
 * @property {number} version 单调递增的已完成状态版本，包含重置。
 * @property {number} generation 重置代际。
 * @property {string} contextId 渲染 Context 身份，消费者必须使用同一 Context。
 * @property {number} simulationTime 自重置起已完成的物理秒数。
 */

/**
 * 可供引擎采样器 uniform 回调使用的不透明借用原生纹理句柄。不得构造、修改或销毁，不公开 Renderer 内部实现。
 * @typedef {object} SceneGISWindSimulation.GpuTexture
 * @property {number} width 图集宽度，单位为像素。
 * @property {number} height 图集高度，单位为像素。
 */

/**
 * 常驻 GPU 的局部等温空气流动求解器，使用 D3Q19 MRT 和可选 Smagorinsky LES。在 GPU 场消费者之前挂载一次到 Scene.primitives。此对象不创建显示，集合通常负责销毁。球面和平面共用局部米制求解器，modelMatrix 必须为刚体。静态固体与无滑移面采用半格反弹；开放面位于最外层格心，墙面/滑移面位于域边界。入口采用非平衡外推，出口按指定法向风速进行一阶对流。应让回流远离出口，并验证下游缓冲区敏感性。这不是经过工程认证的 CFD 求解器。
 *
 * 布局与物理选项在构造时快照保存，修改须重建。固定 dt 的换算为 uL=u*dt/dx，tau=0.5+3*nu*dt/dx^2。要求输入 Mach<=0.1 且 0.5000001<tau<=2。运行时加速可能超出低马赫数范围；不会隐式截断速度、修改黏度或遇到不稳定时自动重置。未解析的壁面与常系数 LES 须独立进行域和网格验证。状态使用 FP32 偏差分布（f-w）。
 *
 * 正常 Scene 时间增量积累工作，maximumStepsPerFrame 只限制执行步数，不改变 dt 或丢弃欠账。暂停停止累计，已排队单步仍执行。拾取及同帧号重复更新不推进状态；时间回退会重置。按需渲染应用须显式请求帧。销毁顺序为先消费者、后生产者。
 *
 * @alias SceneGISWindSimulation
 * @constructor
 * @param {object} [options] 配置。
 * @param {Cartesian3} [options.dimensions=new Cartesian3(128,128,32)] 整数单元数须 >=4，总乘积 <=2097152。
 * @param {Cartesian3} [options.minimum=Cartesian3.ZERO] 局部域最小点，单位为米。
 * @param {number} [options.cellSize=2] 立方格宽，单位为米。
 * @param {number} [options.timeStep=0.02] 每步固定物理秒数。
 * @param {number} [options.kinematicViscosity=0.000015] 分子运动黏度，单位为 m^2/s。
 * @param {number} [options.smagorinskyConstant=0.12] [0,0.2] 内的常数，0 禁用 LES。
 * @param {number} [options.windSpeed=5] 指定水平风速，单位为 m/s。
 * @param {number} [options.windDirection=0] 风吹向的角度，从局部 +X 逆时针计，单位为弧度。
 * @param {Cartesian3} [options.initialVelocity] 初始流体速度，单位为 m/s，默认指定来流风速。
 * @param {Cartesian3} [options.acceleration=Cartesian3.ZERO] 恒定物理体加速度，单位为 m/s^2，采用 MRT Guo 力项。
 * @param {SceneGISWindSimulation.BoundaryConditions} [options.boundaryConditions] 计算域六个面。
 * @param {Uint8Array} [options.solidMask] 会复制的 X 最快 0/1 单元数组，索引为 x+nx*(y+ny*z)。
 * @param {number} [options.tracerDiffusivity=0] 显式标量扩散率，单位为 m^2/s，须满足 6*D*dt/dx^2 <= 0.5。一阶迎风格式也具有数值扩散。
 * @param {SceneGISWindSimulation.TracerSource[]} [options.tracerSources=[]] 最多 16 个被动球形源。
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] 局部到世界刚体放置变换，会复制。
 * @param {boolean} [options.paused=false] 初始是否暂停物理时间累计。
 * @param {number} [options.maximumStepsPerFrame=4] 每正常帧最多固定步数，整数 1..64。
 * @param {boolean} [options.enableGpuTiming=false] WebGL 扩展可用时收集异步 GPU 批次计时。
 * @throws {DeveloperError} 格网、单位、控制项或刚体变换无效。
 * @throws {RuntimeError} 首次更新缺少 SCENE3D、WebGL2、四个浮点附件或足够图集容量。
 * @experimental 城市流动验证期间此 API 可能发生变化。
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
  this._enableGpuTiming = options.enableGpuTiming ?? false;
  if (typeof this._enableGpuTiming !== "boolean") {
    throw new DeveloperError("enableGpuTiming must be boolean.");
  }
  this._timer = undefined;
  this._diffusivity = options.tracerDiffusivity ?? 0;
  Tracer.validateDiffusivity(this._diffusivity, this._config);
  this._sources = Tracer.sources(options.tracerSources ?? []);
  this._tracer = undefined;
  this._queries = new Set();
  /**
   * 刚体放置，移动不改变局部解。
   * @type {Matrix4}
   */
  this.modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  /**
   * 暂停 Scene 时间累计，仍可显式单步。
   * @type {boolean}
   */
  this.paused = options.paused ?? false;
  /**
   * 固定步长工作预算，整数 1..64。
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
 * 球形无量纲被动源。球内每个流体格心单元均匀注入，固体不接收，源可与域边界重叠。rate 不是质量/秒。
 * @typedef {object} SceneGISWindSimulation.TracerSource
 * @property {Cartesian3} position 模拟局部米制坐标。
 * @property {number} radius 正半径，单位为米。
 * @property {number} rate 每流体单元每秒的非负示踪单位数。
 * @property {boolean} [enabled=true] 是否注入。
 */

/**
 * 面模式："wind" 将指定风的向内、向外或切向分量分类为入口、出口或滑移；"inlet" 和 "outlet" 要求对应非零法向风分量。"wall" 为无滑移，"slip" 为镜面自由滑移，"periodic" 须在同轴成对。斜向风可有两个入口和两个出口。混合开放角点入口优先，多出口使用各自单侧对流通量之和。
 * @typedef {object} SceneGISWindSimulation.BoundaryConditions
 * @property {string} [xMin="wind"] 最小 X 面。
 * @property {string} [xMax="wind"] 最大 X 面。
 * @property {string} [yMin="wind"] 最小 Y 面。
 * @property {string} [yMax="wind"] 最大 Y 面。
 * @property {string} [zMin="wall"] 地面。
 * @property {string} [zMax="slip"] 顶面。
 */

Object.defineProperties(SceneGISWindSimulation.prototype, {
  /**
   * 初始化后是否支持所请求的 GPU 计时。
   * @memberof SceneGISWindSimulation.prototype
   * @type {boolean}
   * @readonly
   */
  gpuTimingSupported: {
    get() {
      return this._timer?.supported ?? false;
    },
  },
  /**
   * 最新无失效区间的已完成批次测量，不含绘制与初始分配。正常渲染期间轮询；完成前、禁用或不支持时为 undefined。
   * @memberof SceneGISWindSimulation.prototype
   * @type {SceneGISWindSimulation.GpuTiming|undefined}
   * @readonly
   */
  gpuTiming: {
    get() {
      return this._timer?.result;
    },
  },
  /**
   * 是否已分配 GPU 状态。
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
   * 自重置起已完成的物理秒数。
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
   * 每步固定物理秒数。
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
   * 待处理 Scene 时间秒数，加上排队的手动工作。
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
   * 最近正常帧完成的步数。
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
   * 自有纹理字节数，不含共享渲染资源。
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
 * @typedef {object} SceneGISWindSimulation.GpuTiming
 * @property {number} millisecondsPerStep GPU 批次耗时毫秒数除以完成步数，包含速度与示踪求解。
 * @property {number} steps 测量批次中的物理步数。
 * @property {number} version 批次结束时的已完成场版本。
 */

/**
 * 排队固定步数，暂停时也允许，仍受每帧预算限制。
 * @param {number} [count=1] 整数 1..1000000。
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
/**
 *  下一正常渲染恢复初始场与时间，并取消已排队工作。此调用后排队的步数在重置后执行，暂停时也执行。
 */
SceneGISWindSimulation.prototype.reset = function () {
  this._reset = true;
  this._queued = 0;
};
/**
 * 获取实时借用 GPU 描述对象，不初始化或推进求解器。
 * @returns {SceneGISWindSimulation.GpuField|undefined} 首次正常渲染之前为 undefined。
 */
SceneGISWindSimulation.prototype.getGpuField = function () {
  return this._field;
};

/**
 * 原子替换源配置，不清空浓度或重置速度。新注入在下一物理步生效，输入会复制。
 * @param {SceneGISWindSimulation.TracerSource[]} sources 最多 16 个球。
 */
SceneGISWindSimulation.prototype.setTracerSources = function (sources) {
  this._sources = Tracer.sources(sources);
  this._tracer?.setSources(this._sources);
};

/**
 * 快照最近单元，不阻塞等待完整场回读。返回 Promise 使用原生 PBO/fence 轮询，最多同时有 16 个请求；销毁会拒绝请求。须在 ready 后调用，位置必须在半开局部域内。
 * @param {Cartesian3} position 局部米制坐标。
 * @returns {Promise<SceneGISWindSimulation.Sample>} 包含版本和时间的已完成快照。
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
 * @property {Cartesian3} velocity 局部速度，单位为 m/s。
 * @property {number} density 无量纲密度比。
 * @property {number} concentration 无量纲示踪量。
 * @property {number} tracerCfl 流出标量 CFL，大于 1 时违反正性稳定条件。
 * @property {boolean} solid 采样单元是否为固体。
 * @property {Cartesian3} cell 整数单元索引。
 * @property {number} version 快照版本。
 * @property {number} simulationTime 快照物理秒数。
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
    if (this._enableGpuTiming) {
      this._timer = new GpuTimer(frameState.context);
    }
    this._version++;
    elapsed = 0;
  }
  this._lastFrame = frameState.frameNumber;
  this._lastTime = JulianDate.clone(frameState.time, this._lastTime);
  this._lastSteps = 0;
  this._timer?.poll();
  if (this._reset || elapsed < 0) {
    this._solver.reset();
    this._tracer.reset();
    this._timer?.clear();
    this._debt = this._steps = 0;
    if (!this._reset) {
      this._queued = 0;
    }
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
  if (count > 0) {
    this._timer?.begin();
  }
  try {
    for (let i = 0; i < count; i++) {
      this._solver.step();
      this._tracer.step();
      this._steps++;
      this._version++;
      this._lastSteps++;
    }
  } finally {
    this._timer?.end(this._lastSteps, this._version);
  }
  this._queued -= manual;
  this._debt = Math.max(0, this._debt - (count - manual) * dt);
};
/**
 * @returns {boolean} 此模拟是否已销毁。
 */
SceneGISWindSimulation.prototype.isDestroyed = function () {
  return false;
};
/**
 * 释放全部自有 GPU 资源，借用描述对象随即失效。
 * @returns {undefined}
 */
SceneGISWindSimulation.prototype.destroy = function () {
  this._timer = this._timer?.destroy();
  for (const query of this._queries) {
    query.cancel();
  }
  this._tracer = this._tracer?.destroy();
  this._solver = this._solver?.destroy();
  this._field = undefined;
  return destroyObject(this);
};
export default SceneGISWindSimulation;

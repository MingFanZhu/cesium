import BoundingSphere from "../../Core/BoundingSphere.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Globe from "../../Scene/Globe.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";
import SceneGISWaterSurface from "./SceneGISWaterSurface.js";
import SceneGISWindWaves from "./SceneGISWindWaves.js";
import riverSpectrum from "./_private/_SceneGISRiverSpectrum.js";
import RiverGeometry from "./_private/_SceneGISRiverGeometry.js";
import WaterMesh from "./_private/_SceneGISEllipsoidWaterMesh.js";
import WaterFrame from "./_private/_SceneGISWaterFrame.js";

function validate(river) {
  for (const [name, minimum, maximum] of [
    ["currentSpeedScale", 0, Infinity],
    ["currentRippleAmplitude", 0, Infinity],
    ["currentRippleLength", 0.01, Infinity],
  ]) {
    const value = river[name];
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new DeveloperError(
        `${name} must be finite in [${minimum}, ${maximum}].`,
      );
    }
  }
}

/**
 * 具有指定水位与水流的单条有向河流，加入 Scene.primitives。World 绑定精确且不可变。球面位置使用 ECEF 和椭球高，平面位置使用所绑定 World 的米制 XYZ，不自动投影。有序横断面插值位置高度、宽度和速度；正速度沿输入位置顺序，零速度停止水流平移。水位不等于地形高度。可选 polygonHierarchy 裁剪含孔洞的宽度包络，不决定水位。几何输入在构造时复制，修改剖面或边界须重建。
 *
 * 球面河流使用区域水面图表与网格 LOD，远离原点存在投影畸变。相邻断面采用斜接，折叠或自接触河道会被拒绝。此能力是可视化水流平移，不提供水力学、分汊、瀑布或全球海洋。内部拥有沿河局部定向的两个随机 FFT 频带。流速独立搬运波浪，不改变自身演化；零流速不会冻结波浪。可选的调用方所有 windWaves 提供独立风浪，不受河流速度改写。要求 SCENE3D、HDR 和 WebGL2 浮点目标。共享 SceneGISWaterSurface 的不透明深度/颜色光学与可选有限水下观察，水域不得重叠。
 *
 * @alias SceneGISRiverSurface
 * @constructor
 * @param {object} options 包含以下属性的对象。
 * @param {Globe|SceneGISPlanarWorld} options.world 接收河流的精确 World。
 * @param {Cartesian3[]} options.positions 有序中心线位置，包含水位高度。
 * @param {number|number[]} options.widths 全宽，单位为米，可以为常数或逐位置数值。
 * @param {number|number[]} [options.speeds=1] 水平流速，单位为米/秒，可以为常数或逐位置数值。
 * @param {PolygonHierarchy} [options.polygonHierarchy] 可选世界坐标岸线裁剪掩码，忽略高度。
 * @param {SceneGISWindWaves} [options.windWaves] 借用的可选风浪模拟，构造时固定。
 * @param {number} [options.meshSpacing=1] 构造时固定的最精细网格间距，单位为米，范围 [0.25,4]。
 * @param {number} [options.maximumScreenSpaceError=2] 曲率误差目标，单位为像素。
 * @param {number} [options.maximumTileCount=512] 四叉树叶节点预算，整数，范围 [4,4096]。
 * @param {number} [options.currentSpeedScale=1] 设定水流速度的非负倍率。
 * @param {number} [options.currentRippleAmplitude=0.12] 水流波浪的最大竖直位移，单位为米，同时控制波浪法线。
 * @param {number} [options.currentRippleLength=12] 水流波浪的主波长，单位为米，至少 0.01。
 * @param {boolean} [options.show=true] 是否显示河流。
 * @param {*} [options.id] 拾取标识。
 * @param {Color} [options.waterColor] 场景线性深水散射色，默认 (0.015,0.12,0.14)。
 * @param {Cartesian3} [options.absorption] 每米 RGB 吸收，默认 (0.45,0.12,0.06)。
 * @param {Cartesian3} [options.scattering] 可选的非负每米 RGB 散射系数，启用后以系数光学替代 waterColor。
 * @param {number} [options.scatteringAnisotropy=0] 散射平均余弦，范围 [-0.9,0.9]，正值偏向光线向前传播。
 * @param {Color} [options.reflectionColor] 无物理天空时的场景线性环境辐亮度，默认 (0.2,0.3,0.4)。
 * @param {number} [options.roughness=0.12] 感知粗糙度，范围 [0.02,1]。
 * @param {number} [options.foamWidth=0.3] 浅水接触白沫深度范围，单位为米。
 * @param {number} [options.foamIntensity=0.5] 接触白沫强度，范围 [0,1]。
 * @param {number} [options.underwaterDepth=0] 插值河流剖面下的有限竖直深度，单位为米；0 关闭水下观察。原始岸线具有索引，剖面单独保留 1024 三角形预算。曲面光学使用局部球近似。
 * @param {number} [options.maximumUnderwaterBoundaryBytes=8388608] 不可变岸线索引纹理预算，包含填充，字节整数范围 [1,67108864]；不会简化几何来适应预算。
 * @param {number} [options.causticsIntensity=0] 可见接收面的近似焦散强度，范围 [0,2]，使用场景深度与真实波浪。
 * @param {number} [options.refractionStrength=0.2] 屏幕空间折射扭曲强度，范围 [0,1]。
 * @param {boolean} [options.reflections=true] 是否追踪场景反射。
 * @param {number} [options.maximumReflectionDistance=100] 反射射线最大长度，单位为米。
 * @param {number} [options.reflectionThickness=0.5] 反射命中的深度容差，单位为米。
 * @param {number} [options.reflectionSteps=64] 整数反射遍历预算，范围 [16,256]。
 * @example
 * const river = viewer.scene.primitives.add(new Cesium.SceneGISRiverSurface({
 *   world: viewer.scene.world,
 *   positions: Cesium.Cartesian3.fromDegreesArrayHeights([
 *     118.70, 32.10, 25, 118.72, 32.11, 22, 118.75, 32.10, 20,
 *   ]),
 *   widths: [120, 180, 140], speeds: [0.6, 1.2, 0.8],
 * }));
 */
function SceneGISRiverSurface(options = {}) {
  const world = options.world;
  if (
    !(world instanceof Globe || world instanceof SceneGISPlanarWorld) ||
    world.isDestroyed()
  ) {
    throw new DeveloperError(
      "world must be a live Globe or SceneGISPlanarWorld.",
    );
  }
  this._world = world;
  /**
   * 设定水流速度的非负倍率，0 冻结水流平移。
   * @type {number}
   */
  this.currentSpeedScale = options.currentSpeedScale ?? 1;
  /**
   * 水流波浪的最大竖直位移，单位为米，同时控制波浪法线。
   * @type {number}
   */
  this.currentRippleAmplitude = options.currentRippleAmplitude ?? 0.12;
  /**
   * 水流波浪的主波长，单位为米，至少 0.01。
   * @type {number}
   */
  this.currentRippleLength = options.currentRippleLength ?? 12;
  validate(this);
  const ellipsoid = world instanceof Globe ? world.ellipsoid : undefined;
  const domain = new RiverGeometry(options, ellipsoid);
  const spacing = options.meshSpacing ?? 1;
  if (!Number.isFinite(spacing) || spacing < 0.25 || spacing > 4) {
    throw new DeveloperError("meshSpacing must be finite in [0.25, 4].");
  }
  this._mesh = new WaterMesh(undefined, ellipsoid, 0, true, spacing, domain);
  this._surface = new SceneGISWaterSurface({
    ...options,
    geometryMode: "local",
    modelMatrix: undefined,
    _riverMesh: this._mesh,
    _river: this,
  });
  this._waves = new SceneGISWindWaves({
    resolution: 128,
    choppiness: 0,
    whitecapIntensity: 0,
    _spectrum: riverSpectrum,
  });
}

Object.defineProperties(SceneGISRiverSurface.prototype, {
  /**
   * 不可变岸线索引预算，单位为字节。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   * @readonly
   */
  maximumUnderwaterBoundaryBytes: {
    get() {
      return this._surface.maximumUnderwaterBoundaryBytes;
    },
  },
  /**
   * 已分配岸线索引纹理字节数，首次活动水下绘制前为零。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   * @readonly
   */
  underwaterBoundaryByteLength: {
    get() {
      return this._surface.underwaterBoundaryByteLength;
    },
  },
  /**
   * 可见接收面的近似焦散强度，范围 [0,2]，使用场景深度与真实波浪。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  causticsIntensity: {
    get() {
      return this._surface.causticsIntensity;
    },
    set(value) {
      this._surface.causticsIntensity = value;
    },
  },
  /**
   * 插值平均河流剖面下的有限竖直深度，单位为米；0 关闭水下观察。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  underwaterDepth: {
    get() {
      return this._surface.underwaterDepth;
    },
    set(value) {
      this._surface.underwaterDepth = value;
    },
  },
  /**
   * 是否显示河流。
   * @memberof SceneGISRiverSurface.prototype
   * @type {boolean}
   */
  show: {
    get() {
      return this._surface.show;
    },
    set(value) {
      this._surface.show = value;
    },
  },
  /**
   * 拾取标识。
   * @memberof SceneGISRiverSurface.prototype
   * @type {*}
   */
  id: {
    get() {
      return this._surface.id;
    },
    set(value) {
      this._surface.id = value;
    },
  },
  /**
   * 传统场景线性深水散射色，定义 scattering 时忽略。
   * @memberof SceneGISRiverSurface.prototype
   * @type {Color}
   */
  waterColor: {
    get() {
      return this._surface.waterColor;
    },
    set(value) {
      this._surface.waterColor = value;
    },
  },
  /**
   * 每米 RGB 吸收系数。
   * @memberof SceneGISRiverSurface.prototype
   * @type {Cartesian3}
   */
  absorption: {
    get() {
      return this._surface.absorption;
    },
    set(value) {
      this._surface.absorption = value;
    },
  },
  /**
   * 可选非负每米 RGB 散射系数，undefined 恢复传统光学。
   * @memberof SceneGISRiverSurface.prototype
   * @type {Cartesian3|undefined}
   */
  scattering: {
    get() {
      return this._surface.scattering;
    },
    set(value) {
      this._surface.scattering = value;
    },
  },
  /**
   * Henyey-Greenstein 平均余弦，范围 [-0.9,0.9]，正值偏向光线向前传播。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  scatteringAnisotropy: {
    get() {
      return this._surface.scatteringAnisotropy;
    },
    set(value) {
      this._surface.scatteringAnisotropy = value;
    },
  },
  /**
   * 无物理天空时的环境辐亮度。
   * @memberof SceneGISRiverSurface.prototype
   * @type {Color}
   */
  reflectionColor: {
    get() {
      return this._surface.reflectionColor;
    },
    set(value) {
      this._surface.reflectionColor = value;
    },
  },
  /**
   * 感知粗糙度，范围 [0.02,1]。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  roughness: {
    get() {
      return this._surface.roughness;
    },
    set(value) {
      this._surface.roughness = value;
    },
  },
  /**
   * 非负接触白沫深度范围，单位为米。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  foamWidth: {
    get() {
      return this._surface.foamWidth;
    },
    set(value) {
      this._surface.foamWidth = value;
    },
  },
  /**
   * 接触白沫强度，范围 [0,1]。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  foamIntensity: {
    get() {
      return this._surface.foamIntensity;
    },
    set(value) {
      this._surface.foamIntensity = value;
    },
  },
  /**
   * 屏幕空间折射扭曲强度，范围 [0,1]。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  refractionStrength: {
    get() {
      return this._surface.refractionStrength;
    },
    set(value) {
      this._surface.refractionStrength = value;
    },
  },
  /**
   * 是否追踪场景反射。
   * @memberof SceneGISRiverSurface.prototype
   * @type {boolean}
   */
  reflections: {
    get() {
      return this._surface.reflections;
    },
    set(value) {
      this._surface.reflections = value;
    },
  },
  /**
   * 正的反射射线最大长度，单位为米。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  maximumReflectionDistance: {
    get() {
      return this._surface.maximumReflectionDistance;
    },
    set(value) {
      this._surface.maximumReflectionDistance = value;
    },
  },
  /**
   * 正的反射命中深度容差，单位为米。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  reflectionThickness: {
    get() {
      return this._surface.reflectionThickness;
    },
    set(value) {
      this._surface.reflectionThickness = value;
    },
  },
  /**
   * 整数反射遍历预算，范围 [16,256]。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  reflectionSteps: {
    get() {
      return this._surface.reflectionSteps;
    },
    set(value) {
      this._surface.reflectionSteps = value;
    },
  },
  /**
   * 曲率误差目标，单位为像素，至少 0.1。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  maximumScreenSpaceError: {
    get() {
      return this._surface.maximumScreenSpaceError;
    },
    set(value) {
      this._surface.maximumScreenSpaceError = value;
    },
  },
  /**
   * 四叉树叶节点预算，整数，范围 [4,4096]。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   */
  maximumTileCount: {
    get() {
      return this._surface.maximumTileCount;
    },
    set(value) {
      this._surface.maximumTileCount = value;
    },
  },
  /**
   * 精确 World 绑定。
   * @memberof SceneGISRiverSurface.prototype
   * @type {Globe|SceneGISPlanarWorld}
   * @readonly
   */
  world: {
    get() {
      return this._world;
    },
  },
  /**
   * 是否已创建渲染资源。
   * @memberof SceneGISRiverSurface.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get() {
      return this._surface.ready;
    },
  },
  /**
   * 共享水面 LOD 与缓存统计的快照。
   * @memberof SceneGISRiverSurface.prototype
   * @type {SceneGISWaterSurface.MeshStatistics}
   * @readonly
   */
  statistics: {
    get() {
      return this._surface.statistics;
    },
  },
  /**
   * 借用的风浪模拟，不随河流销毁。
   * @memberof SceneGISRiverSurface.prototype
   * @type {SceneGISWindWaves|undefined}
   * @readonly
   */
  windWaves: {
    get() {
      return this._surface.windWaves;
    },
  },
  /**
   * 最精细格网间距，单位为米。
   * @memberof SceneGISRiverSurface.prototype
   * @type {number}
   * @readonly
   */
  meshSpacing: {
    get() {
      return this._surface.meshSpacing;
    },
  },
});

/**
 * 获取保守世界空间包围体，包含水流及可选风浪位移。
 * @param {BoundingSphere} [result] 接收包围体的对象。
 * @returns {BoundingSphere} 包围体。
 */
SceneGISRiverSurface.prototype.getBoundingSphere = function (result) {
  result = BoundingSphere.clone(this._mesh.root.bounds, result);
  result.radius += this.windWaves?._maximumDisplacement ?? 0;
  result.radius += this.currentRippleAmplitude;
  return result;
};

/**
 * Updates the primitive. Called by PrimitiveCollection; do not call directly.
 * @param {FrameState} frameState The frame state.
 * @private
 */
SceneGISRiverSurface.prototype.update = function (frameState) {
  if (
    this._world.isDestroyed() ||
    WaterFrame.get(frameState).world !== this._world
  ) {
    throw new DeveloperError(
      "The river must be rendered in its exact, live World.",
    );
  }
  validate(this);
  this._surface.update(frameState);
};

/**
 * @returns {boolean} 此河流是否已销毁。
 */
SceneGISRiverSurface.prototype.isDestroyed = function () {
  return false;
};

/**
 * 释放自有几何、河流 FFT、着色器及拾取资源；World 与可选风浪模拟仅借用。
 * @returns {undefined}
 */
SceneGISRiverSurface.prototype.destroy = function () {
  this._surface.destroy();
  this._waves.destroy();
  return destroyObject(this);
};

export default SceneGISRiverSurface;

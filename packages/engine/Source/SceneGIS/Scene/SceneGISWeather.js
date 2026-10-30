import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian2 from "../../Core/Cartesian2.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import Cartographic from "../../Core/Cartographic.js";
import Color from "../../Core/Color.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import JulianDate from "../../Core/JulianDate.js";
import Matrix4 from "../../Core/Matrix4.js";
import Transforms from "../../Core/Transforms.js";
import SceneGISGpuParticleSystem from "./SceneGISGpuParticleSystem.js";
import SceneGISWeatherEffects from "./_private/_SceneGISWeatherEffects.js";
import weatherCommon from "../../Shaders/SceneGIS/Particles/SceneGISWeatherCommon.js";
import weatherSimulation from "../../Shaders/SceneGIS/Particles/SceneGISWeatherSimulation.js";
import weatherStyle from "../../Shaders/SceneGIS/Particles/SceneGISWeatherStyle.js";

const budgets = Object.freeze({ low: 16384, medium: 32768, high: 65536 });
const simulationShader = `${weatherCommon}\n${weatherSimulation}`;
const renderShader = `${weatherCommon}\n${weatherStyle}`;

function range(name, value, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new DeveloperError(
      `${name} must be finite and in [${minimum}, ${maximum}].`,
    );
  }
}
function validate(weather) {
  if (weather.type !== "rain" && weather.type !== "snow") {
    throw new DeveloperError('type must be "rain" or "snow".');
  }
  if (!Object.hasOwn(budgets, weather.quality)) {
    throw new DeveloperError('quality must be "low", "medium" or "high".');
  }
  if (
    typeof weather.show !== "boolean" ||
    typeof weather.paused !== "boolean"
  ) {
    throw new DeveloperError("show and paused must be boolean.");
  }
  range("intensity", weather.intensity, 0, 1);
  range("radius", weather.radius, 100, 5000);
  range("ceilingHeight", weather.ceilingHeight, -10000, 100000);
  range("transitionDuration", weather.transitionDuration, 0, 60);
  range("particleSize", weather.particleSize, 0.25, 4);
  range("windVelocity.x", weather.windVelocity?.x, -100, 100);
  range("windVelocity.y", weather.windVelocity?.y, -100, 100);
  range("color.red", weather.color?.red, 0, 1);
  range("color.green", weather.color?.green, 0, 1);
  range("color.blue", weather.color?.blue, 0, 1);
  range("color.alpha", weather.color?.alpha, 0, 1);
}
function releasePools(weather) {
  if (weather._layers) {
    for (const layer of weather._layers) {
      layer.destroy();
    }
    weather._layers = undefined;
  }
}
function createPools(weather) {
  const count = budgets[weather.quality] / 2;
  // Keep enough precipitation in front of nearby opaque city geometry.
  const nearRadius = Math.min(60, weather.radius * 0.18);
  const layers = [];
  try {
    for (let i = 0; i < 2; ++i) {
      const radius = i === 0 ? nearRadius : weather.radius;
      layers.push(
        new SceneGISGpuParticleSystem({
          maximumParticles: count,
          initialParticles: count,
          emissionRate: 0,
          seed: i * 100000,
          simulationShader,
          renderShader,
          boundingSphere: new BoundingSphere(Cartesian3.ZERO, radius * 2 + 60),
          uniformMap: {
            u_updateTransform: () => weather._updateTransform,
            u_renderTransform: () => weather._renderTransform,
            u_radius: () => radius,
            u_innerRadius: () => (i === 0 ? 0 : nearRadius * 0.75),
            u_wind: () => weather._currentWind,
            u_snow: () => weather._snow,
            u_intensity: () => weather._currentIntensity,
            u_particleSize: () => weather.particleSize,
            u_cameraHeight: () => weather._cameraHeight,
            u_ceilingHeight: () => weather.ceilingHeight,
            u_color: () => weather.color,
          },
        }),
      );
    }
    weather._allocatedQuality = weather.quality;
    weather._allocatedRadius = weather.radius;
    return layers;
  } catch (error) {
    for (const layer of layers) {
      layer.destroy();
    }
    throw error;
  }
}
function approach(value, target, step) {
  return (
    value + Math.sign(target - value) * Math.min(Math.abs(target - value), step)
  );
}

function advanceWeather(weather, time) {
  validate(weather);
  const dt = weather._lastTime
    ? JulianDate.secondsDifference(time, weather._lastTime)
    : 0;
  weather._lastTime = JulianDate.clone(time, weather._lastTime);
  weather._deltaTime = Math.max(0, dt);
  if (!weather.show || weather.paused) {
    return;
  }
  const step =
    weather.transitionDuration === 0
      ? 1
      : weather._deltaTime / weather.transitionDuration;
  weather._currentIntensity = approach(
    weather._currentIntensity,
    weather.intensity,
    step,
  );
  weather._snow = approach(
    weather._snow,
    weather.type === "snow" ? 1 : 0,
    step,
  );
  const fraction =
    weather.transitionDuration === 0
      ? 1
      : 1 - Math.exp((-3 * weather._deltaTime) / weather.transitionDuration);
  Cartesian2.lerp(
    weather._currentWind,
    weather.windVelocity,
    fraction,
    weather._currentWind,
  );
}

/**
 * 用于 WebGL2 SCENE3D 鸟瞰 GIS 场景的相机局部雨雪。加入 {@link Scene#primitives}，集合通常负责销毁。两个有界 GPU 粒子池围绕观察者循环并淡出，相机移动时保留重叠粒子的世界运动，冻结时间时也如此。提供 scene 后还协调雾、地表湿润/薄雪及镜头雨滴/霜冻。雾借用调用方注册的 environmentEffects，不启用控制器或修改光照、曝光、云与时钟；未提供 scene 时只提供独立降水。
 *
 * 雾、地表和镜头各组默认自动控制，雾须有绑定。在外部修改共享效果前，将对应组 automatic=false。手动组不接收天气写入，包括清除和隐藏；自动效果淡出时保留设定强度。绑定合成先于 Scene 消费者执行，应将图元加入所提供的 Scene，不再使用时销毁或移除。每 Scene 仅允许一个绑定天气系统。
 *
 * intensity 是艺术化密度，不是降雨测量值。不透明深度测试隐藏被几何挡住的粒子，不提供屋顶遮雨或碰撞。精灵不受光，没有物理积累或运动向量。球面高度与竖直方向使用区域相机局部切平面近似。quality/radius 改变会重置两个池，type/intensity/wind 过渡复用池。show=false 立即隐藏并暂停观测时间，intensity=0 淡出到晴天。向前时间步按原样使用，回退重置粒子序列。requestRenderMode 下不请求额外帧。
 *
 * @alias SceneGISWeather
 * @constructor
 * @param {object} options 配置。
 * @param {string} options.mode "globe" 使用 ENU，"planar" 使用固定世界 XYZ 米；须匹配 Scene 世界。
 * @param {Scene} [options.scene] 将完整天气合成绑定到此存活 SCENE3D Scene。
 * @param {SceneGISEnvironmentEffects} [options.environmentEffects] 借用已有雾控制器，由调用方注册和启用；省略表示不绑定雾。
 * @param {SceneGISSurfaceWeather} [options.surfaceWeather] 借用地表设置，否则复用 Scene 设置或创建一个。
 * @param {SceneGISRainLensStage} [options.rainLens] 借用此 Scene 集合中已有的阶段，否则创建并拥有它。
 * @param {SceneGISSnowLensStage} [options.snowLens] 借用此 Scene 集合中已有的阶段，否则创建并拥有它。
 * @param {SceneGISWeather.FogOptions} [options.fog] 雾控制，要求 scene。
 * @param {SceneGISWeather.SurfaceOptions} [options.surface] 地表控制，要求 scene。
 * @param {SceneGISWeather.LensOptions} [options.lens] 镜头控制，要求 scene。
 * @param {string} [options.type="rain"] 取值 "rain" 或 "snow"。
 * @param {number} [options.intensity=0.6] 目标显示密度，范围 [0,1]。
 * @param {Cartesian2} [options.windVelocity] 水平速度，单位为 m/s，平面为 XY，Globe 为东/北，默认 (3,0)。
 * @param {string} [options.quality="medium"] 总槽位预算：low=16K、medium=32K、high=64K。
 * @param {number} [options.radius=1500] 远处体积半径，单位为米，范围 [100,5000]。
 * @param {number} [options.ceilingHeight=4500] 降水上限高度，单位为米；平面为 World Z，Globe 为椭球高。
 * @param {number} [options.particleSize=1] 艺术化精灵尺寸倍率，范围 [0.25,4]。
 * @param {Color} [options.color=Color.WHITE] 不受光精灵的色调与不透明度，各分量范围 [0,1]。
 * @param {number} [options.transitionDuration=3] 完整强度和类型过渡，以及约 95% 风速收敛的秒数，范围 [0,60]；0 立即应用。
 * @param {boolean} [options.show=true] 显示系统。
 * @param {boolean} [options.paused=false] 冻结模拟与过渡，但保持相机覆盖。
 * @throws {DeveloperError} 模式或公开值违反文档契约。
 * @example
 * const weather = scene.primitives.add(new Cesium.SceneGISWeather({
 *   scene, environmentEffects: effects,
 *   mode: "planar", type: "rain", intensity: 0.7,
 *   windVelocity: new Cesium.Cartesian2(4, 1), quality: "medium"
 * }));
 * weather.intensity = 0; // Smoothly clear the precipitation.
 * weather.fog.automatic = false; // Let the external environment panel own fog.
 * effects.heightFogDensity = 0.0001;
 */
function SceneGISWeather(options = {}) {
  if (options.mode !== "globe" && options.mode !== "planar") {
    throw new DeveloperError('mode must be "globe" or "planar".');
  }
  this._mode = options.mode;
  /**
   * 目标降水类型。
   * @type {string}
   */
  this.type = options.type ?? "rain";
  /**
   * 目标显示密度，范围 [0,1]。
   * @type {number}
   */
  this.intensity = options.intensity ?? 0.6;
  /**
   * 局部 XY 或 ENU 水平速度，单位为米/秒。
   * @type {Cartesian2}
   */
  this.windVelocity = Cartesian2.clone(
    options.windVelocity ?? new Cartesian2(3, 0),
  );
  /**
   * 显式 low/medium/high 粒子预算，修改会重置粒子池。
   * @type {string}
   */
  this.quality = options.quality ?? "medium";
  /**
   * 远处体积半径，单位为米，修改会重置粒子池。
   * @type {number}
   */
  this.radius = options.radius ?? 1500;
  /**
   * 世界或椭球米制的降水上限高度。
   * @type {number}
   */
  this.ceilingHeight = options.ceilingHeight ?? 4500;
  /**
   * 艺术化精灵尺寸倍率。
   * @type {number}
   */
  this.particleSize = options.particleSize ?? 1;
  /**
   * 不受光精灵的色调与不透明度。
   * @type {Color}
   */
  this.color = Color.clone(options.color ?? Color.WHITE);
  /**
   * 过渡时长，单位为秒，0 立即应用。
   * @type {number}
   */
  this.transitionDuration = options.transitionDuration ?? 3;
  /**
   * 显示天气；隐藏更新暂停观测时间。
   * @type {boolean}
   */
  this.show = options.show ?? true;
  /**
   * 冻结模拟与过渡。
   * @type {boolean}
   */
  this.paused = options.paused ?? false;
  validate(this);
  this._currentIntensity = 0;
  this._snow = this.type === "snow" ? 1 : 0;
  this._currentWind = Cartesian2.clone(this.windVelocity);
  this._lastTime = undefined;
  this._layers = undefined;
  this._allocatedQuality = undefined;
  this._allocatedRadius = undefined;
  this._matrix = new Matrix4();
  this._stateMatrix = new Matrix4();
  this._inverse = new Matrix4();
  this._updateTransform = Matrix4.clone(Matrix4.IDENTITY);
  this._renderTransform = Matrix4.clone(Matrix4.IDENTITY);
  this._cartographic = new Cartographic();
  this._cameraHeight = 0;
  this._deltaTime = 0;
  this._lastParticleTime = undefined;
  this._effects = undefined;
  this._removePreUpdate = undefined;
  if (options.scene !== undefined) {
    this._effects = new SceneGISWeatherEffects(this, options);
    const now = new JulianDate();
    this._removePreUpdate = options.scene.preUpdate.addEventListener(
      (scene, time) => {
        advanceWeather(this, time ?? JulianDate.now(now));
        this._effects.update(this);
      },
    );
  } else if (
    options.environmentEffects ||
    options.surfaceWeather ||
    options.rainLens ||
    options.snowLens ||
    options.fog ||
    options.surface ||
    options.lens
  ) {
    throw new DeveloperError("Weather composition options require scene.");
  }
}

Object.defineProperties(SceneGISWeather.prototype, {
  /**
   *  共享雾控制器，归调用方所有，不隐式启用。
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISEnvironmentEffects|undefined}
   * @readonly
   */
  environmentEffects: {
    get() {
      return this._effects?.environmentEffects;
    },
  },
  /**
   *  共享地表设置，Scene 没有时自动创建。
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISSurfaceWeather|undefined}
   * @readonly
   */
  surfaceWeather: {
    get() {
      return this._effects?.surfaceWeather;
    },
  },
  /**
   *  共享原生雨滴阶段，设 lens.automatic=false 可直接手动控制。
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISRainLensStage|undefined}
   * @readonly
   */
  rainLens: {
    get() {
      return this._effects?.rainLens;
    },
  },
  /**
   *  共享原生霜冻阶段，几何与外观控制仍在该阶段上。
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISSnowLensStage|undefined}
   * @readonly
   */
  snowLens: {
    get() {
      return this._effects?.snowLens;
    },
  },
  /**
   *  可修改的雾自动控制与满强度密度，未提供 scene 时为 undefined。
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISWeather.FogOptions|undefined}
   * @readonly
   */
  fog: {
    get() {
      return this._effects?.fog;
    },
  },
  /**
   *  可修改的满强度地表数值，清除和隐藏时保留。
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISWeather.SurfaceOptions|undefined}
   * @readonly
   */
  surface: {
    get() {
      return this._effects?.surface;
    },
  },
  /**
   *  可修改的雨滴/霜冻自动控制及满强度数值。
   * @memberof SceneGISWeather.prototype
   * @type {SceneGISWeather.LensOptions|undefined}
   * @readonly
   */
  lens: {
    get() {
      return this._effects?.lens;
    },
  },
  /**
   * 不可变世界模式。
   * @memberof SceneGISWeather.prototype
   * @type {string}
   * @readonly
   */
  mode: {
    get() {
      return this._mode;
    },
  },
  /**
   * 当前过渡后的显示强度。
   * @memberof SceneGISWeather.prototype
   * @type {number}
   * @readonly
   */
  actualIntensity: {
    get() {
      return this._currentIntensity;
    },
  },
  /**
   * 已分配的模拟字节数，包含纹理填充。
   * @memberof SceneGISWeather.prototype
   * @type {number}
   * @readonly
   */
  textureMemoryInBytes: {
    get() {
      return (
        this._layers?.reduce((sum, p) => sum + p.textureMemoryInBytes, 0) ?? 0
      );
    },
  },
});

/** @private */
SceneGISWeather.prototype.update = function (frameState) {
  // Weather must never obscure scene-object picking or advance in auxiliary passes.
  if (!frameState.passes.render || frameState.passes.pick) {
    return;
  }
  if (this._effects) {
    if (frameState !== this._effects.scene.frameState) {
      throw new DeveloperError("Weather must be added to its supplied Scene.");
    }
  } else {
    advanceWeather(this, frameState.time);
  }
  // Scene preUpdate can run without a rendered frame in requestRenderMode.
  // Particle rebasing follows actual primitive updates, not composition ticks.
  const dt = this._lastParticleTime
    ? JulianDate.secondsDifference(frameState.time, this._lastParticleTime)
    : 0;
  this._lastParticleTime = JulianDate.clone(
    frameState.time,
    this._lastParticleTime,
  );
  const rewind = dt < 0;
  if (!this.show) {
    if (this._layers) {
      for (const layer of this._layers) {
        layer.show = false;
        layer.update(frameState);
      }
    }
    return;
  }
  const camera = frameState.camera;
  if (this.mode === "globe") {
    const ellipsoid = frameState.mapProjection.ellipsoid;
    Transforms.eastNorthUpToFixedFrame(
      camera.positionWC,
      ellipsoid,
      this._matrix,
    );
    this._cameraHeight = ellipsoid.cartesianToCartographic(
      camera.positionWC,
      this._cartographic,
    ).height;
  } else {
    Matrix4.fromTranslation(camera.positionWC, this._matrix);
    this._cameraHeight = camera.positionWC.z;
  }
  const visible =
    this._currentIntensity > 0 &&
    this._cameraHeight < this.ceilingHeight + this.radius;
  if (
    this._layers &&
    (this._allocatedQuality !== this.quality ||
      this._allocatedRadius !== this.radius)
  ) {
    releasePools(this);
  }
  if (!this._layers && visible && !this.paused) {
    this._layers = createPools(this);
  }
  if (!this._layers) {
    return;
  }
  const initialize = !this._layers[0].ready || rewind;
  if (initialize) {
    Matrix4.clone(this._matrix, this._stateMatrix);
    for (const layer of this._layers) {
      layer.reset();
    }
  }
  Matrix4.inverseTransformation(this._matrix, this._inverse);
  Matrix4.multiply(this._inverse, this._stateMatrix, this._updateTransform);
  Matrix4.clone(this._updateTransform, this._renderTransform);
  const advance = visible && !this.paused && (initialize || dt > 0);
  try {
    for (const layer of this._layers) {
      Matrix4.clone(this._matrix, layer.modelMatrix);
      layer.show = visible;
      layer.paused = this.paused;
      layer.update(frameState);
    }
  } catch (error) {
    releasePools(this);
    throw error;
  }
  if (advance) {
    Matrix4.clone(this._matrix, this._stateMatrix);
    Matrix4.clone(Matrix4.IDENTITY, this._renderTransform);
  }
};

/**
 * @returns {boolean} 此图元是否已销毁。
 */
SceneGISWeather.prototype.isDestroyed = function () {
  return false;
};

/**
 * 释放自有粒子池、地表/镜头组件与 Scene 监听。借用资源保留；天气写入字段仅在之后未被编辑时恢复。
 * @returns {undefined}
 */
SceneGISWeather.prototype.destroy = function () {
  this._removePreUpdate?.();
  this._removePreUpdate = undefined;
  this._effects?.destroy();
  this._effects = undefined;
  releasePools(this);
  return destroyObject(this);
};

/**
 * 自动雾只写入 density/showHeightFog，其他雾参数仍共享。automatic=false 时可以直接控制环境参数。
 * @typedef {object} SceneGISWeather.FogOptions
 * @property {boolean} [automatic=true] 随天气变化；没有 environmentEffects 时默认 false。
 * @property {boolean} [enabled=true] 自动模式下应用雾，false 清除天气雾。
 * @property {number} [density=0.0003] 满强度时的每米消光系数，范围 [0,0.001]。
 */

/**
 * 自动雨驱动湿润和涟漪，雪驱动覆盖。当前值可从 surfaceWeather 读取，设 automatic=false 可独立编辑。
 * @typedef {object} SceneGISWeather.SurfaceOptions
 * @property {boolean} [automatic=true] 随天气变化，false 停止全部地表写入。
 * @property {boolean} [enabled=true] 应用自动覆盖，false 禁用。
 * @property {number} [wetness=0.8] 全雨状态湿润度，范围 [0,1]。
 * @property {number} [snowCoverage=0.95] 全雪状态覆盖度，范围 [0,1]。
 * @property {number} [rippleIntensity=1] 全雨状态涟漪强度，范围 [0,1]。
 */

/**
 * 自动镜头强度随雨雪混合变化。形状控制仍可直接通过 rainLens 和 snowLens 修改，手动模式停止全部镜头写入。
 * @typedef {object} SceneGISWeather.LensOptions
 * @property {boolean} [automatic=true] 随天气变化，false 停止全部镜头写入。
 * @property {boolean} [enabled=true] 应用自动镜头效果。
 * @property {boolean} [rainEnabled=true] 启用自动雨珠。
 * @property {boolean} [snowEnabled=true] 启用自动霜冻。
 * @property {number} [rainIntensity=0.7] 全雨状态强度，范围 [0,1]。
 * @property {number} [snowIntensity=0.7] 全雪状态强度，范围 [0,1]。
 */

export default SceneGISWeather;

import Color from "../../Core/Color.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import SceneMode from "../../Scene/SceneMode.js";

function unit(value, name) {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new DeveloperError(`${name} must be in [0, 1].`);
  }
}

/**
 * 为不透明 PBR 模型/3D Tiles、受光 Phong 图元及球面/平面地形提供近似湿润和薄雪。使用已有法线与材质，不增加资源属性、纹理或几何通道。覆盖固定于世界，球面使用大地向上方向，平面使用固定 Z。地形保留漫反射光照，并增加近似湿润方向高光。unlit 模型、透明内容、分类和水面保持不变。
 *
 * 湿润和雪量独立于粒子天气及场景时间。可选雨滴涟漪按 Scene 时间扰动湿润法线，不模拟遮雨、排水、水洼深度、雪厚或融化。影像没有地物语义，照片中的植被和水面也可能被覆盖。设置归 Scene 所有，提前 destroy 可解绑；ShaderCache 拥有派生程序。不分配纹理、帧缓冲或额外绘制。
 *
 * @alias SceneGISSurfaceWeather
 * @constructor
 * @param {object} options 初始化选项。
 * @param {Scene} options.scene 存活的 SCENE3D Scene，仅允许一个设置。
 * @param {boolean} [options.enabled=false] 是否应用覆盖效果。
 * @param {number} [options.wetness=0] 可视化湿润度，范围 [0,1]。
 * @param {number} [options.snowCoverage=0] 可视化雪覆盖，范围 [0,1]。
 * @param {number} [options.patchScale=40] 正世界空间斑块尺寸，单位为米。
 * @param {number} [options.rippleIntensity=0] 可视化雨环密度与强度，范围 [0,1]，独立于降水粒子。
 * @param {number} [options.rippleScale=0.8] 正雨环单元尺寸，单位为米，亚像素雨环会淡出。
 * @param {Color} [options.snowColor] 雪反照率，默认 (0.85,0.9,0.95)。
 * @exception {DeveloperError} Scene 与选项须满足文档契约。
 * @example
 * const surfaceWeather = new Cesium.SceneGISSurfaceWeather({
 *   scene: viewer.scene, enabled: true, wetness: 0.7, snowCoverage: 0.0
 * });
 * // Snow remains visible independently of precipitation particles.
 * surfaceWeather.snowCoverage = 0.8;
 */
function SceneGISSurfaceWeather(options) {
  const scene = options?.scene;
  if (
    !scene ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed() ||
    scene.mode !== SceneMode.SCENE3D ||
    scene._sceneGISSurfaceWeather
  ) {
    throw new DeveloperError(
      "A live SCENE3D Scene without surface weather is required.",
    );
  }
  this._scene = scene;
  this._state = undefined;
  this.enabled = options.enabled ?? false;
  this.wetness = options.wetness ?? 0;
  this.snowCoverage = options.snowCoverage ?? 0;
  this.patchScale = options.patchScale ?? 40;
  this.rippleIntensity = options.rippleIntensity ?? 0;
  this.rippleScale = options.rippleScale ?? 0.8;
  this.snowColor = options.snowColor ?? new Color(0.85, 0.9, 0.95);
  scene._sceneGISSurfaceWeather = this;
}

Object.defineProperties(SceneGISSurfaceWeather.prototype, {
  /**
   *  朝上湿表面的雨环密度与强度，范围 [0,1]，0 禁用雨环。使用 Scene 时间但不请求动画帧；积雪抑制涟漪。
   * @memberof SceneGISSurfaceWeather.prototype
   * @type {number}
   * @default 0
   */
  rippleIntensity: {
    get() {
      return this._rippleIntensity;
    },
    set(value) {
      unit(value, "rippleIntensity");
      this._rippleIntensity = value;
      this._scene.requestRender();
    },
  },
  /**
   *  正程序涟漪单元尺寸，单位为世界米，不产生几何位移。
   * @memberof SceneGISSurfaceWeather.prototype
   * @type {number}
   * @default 0.8
   */
  rippleScale: {
    get() {
      return this._rippleScale;
    },
    set(value) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new DeveloperError("rippleScale must be positive and finite.");
      }
      this._rippleScale = value;
      this._scene.requestRender();
    },
  },
  /**
   *  是否应用覆盖，修改设置会请求一帧。
   * @memberof SceneGISSurfaceWeather.prototype
   * @type {boolean}
   * @default false
   */
  enabled: {
    get() {
      return this._enabled;
    },
    set(value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("enabled must be boolean.");
      }
      this._enabled = value;
      this._scene.requestRender();
    },
  },
  /**
   *  可视化湿润度，范围 [0,1]，不表示存在积水。
   * @memberof SceneGISSurfaceWeather.prototype
   * @type {number}
   * @default 0
   */
  wetness: {
    get() {
      return this._wetness;
    },
    set(value) {
      unit(value, "wetness");
      this._wetness = value;
      this._scene.requestRender();
    },
  },
  /**
   *  薄雪覆盖，范围 [0,1]，偏向朝上的几何。
   * @memberof SceneGISSurfaceWeather.prototype
   * @type {number}
   * @default 0
   */
  snowCoverage: {
    get() {
      return this._snowCoverage;
    },
    set(value) {
      unit(value, "snowCoverage");
      this._snowCoverage = value;
      this._scene.requestRender();
    },
  },
  /**
   *  正程序斑块尺寸，单位为世界米。
   * @memberof SceneGISSurfaceWeather.prototype
   * @type {number}
   * @default 40
   */
  patchScale: {
    get() {
      return this._patchScale;
    },
    set(value) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new DeveloperError("patchScale must be positive and finite.");
      }
      this._patchScale = value;
      this._scene.requestRender();
    },
  },
  /**
   *  线性 RGB [0,1] 的雪反照率。赋值颜色会复制，忽略 alpha。原地修改返回的 Color 后须请求渲染。
   * @memberof SceneGISSurfaceWeather.prototype
   * @type {Color}
   */
  snowColor: {
    get() {
      return this._snowColor;
    },
    set(value) {
      unit(value?.red, "snowColor.red");
      unit(value?.green, "snowColor.green");
      unit(value?.blue, "snowColor.blue");
      this._snowColor = Color.clone(value, this._snowColor);
      this._scene.requestRender();
    },
  },
});

/**
 *  @returns {boolean} 此设置是否已销毁。
 */
SceneGISSurfaceWeather.prototype.isDestroyed = function () {
  return false;
};
/**
 *  解绑覆盖效果并恢复原始材质。
 * @returns {undefined}
 */
SceneGISSurfaceWeather.prototype.destroy = function () {
  this._scene._sceneGISSurfaceWeather = undefined;
  this._scene.requestRender();
  this._scene = this._state = undefined;
  return destroyObject(this);
};
export default SceneGISSurfaceWeather;

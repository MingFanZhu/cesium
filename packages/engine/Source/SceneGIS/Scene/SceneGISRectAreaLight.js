import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import Frozen from "../../Core/Frozen.js";
import Validation from "./_private/_SceneGISLightValidation.js";

/**
 * 用于 {@link SceneGISLightCollection} 的均匀发光矩形面光源。位置为球面 ECEF 或平面米制笛卡尔坐标中的矩形中心；direction 为出光法线，up 正交化后定义高度轴，宽度方向为 cross(direction, up)。输入会复制，属性仍可修改；按需渲染模式修改后调用 Scene.requestRender。
 *
 * intensity 为发射的线性 HDR 辐亮度：固定强度时增大面积会增加总出光量，不同于点光/聚光的一米处辐照度尺度。积分后按距中心距离进行平滑 range 衰减。漫反射使用多边形积分，镜面使用各向同性 GGX LTC 拟合，包含清漆层；Phong 镜面近似为匹配粗糙度的 GGX，各向异性材质也使用各向同性面光高光。不创建阴影、参与介质照明或可见几何。此借用的 CPU 描述对象可由集合共享，无需销毁。
 *
 * @alias SceneGISRectAreaLight
 * @constructor
 * @param {object} options 包含以下属性的对象。
 * @param {Cartesian3} options.position 世界空间中心。
 * @param {Cartesian3} options.direction 非零世界空间出光方向。
 * @param {Cartesian3} options.up 非零世界空间高度方向，须与 direction 独立。
 * @param {number} [options.width=1] 正矩形宽度，单位为米。
 * @param {number} [options.height=1] 正矩形高度，单位为米。
 * @param {Color} [options.color=Color.WHITE] 线性 RGB 颜色，忽略 alpha。
 * @param {number} [options.intensity=1] 非负发射 HDR 辐亮度倍率。
 * @param {number} [options.range=100] 正的中心距离影响范围，单位为米。
 * @param {boolean} [options.twoSided=false] 是否双面发光。
 * @param {boolean} [options.show=true] 光源是否参与受光。
 * @exception {DeveloperError} 各值须有限且满足文档范围。
 * @example
 * const panel = lights.add(new Cesium.SceneGISRectAreaLight({
 *   position: new Cesium.Cartesian3(0, 0, 6),
 *   direction: new Cesium.Cartesian3(0, 0, -1),
 *   up: Cesium.Cartesian3.UNIT_Y,
 *   width: 4, height: 2, intensity: 8, range: 30
 * }));
 */
function SceneGISRectAreaLight(options = Frozen.EMPTY_OBJECT) {
  /**
   *  世界空间中心。
   * @type {Cartesian3}
   */
  this.position = Cartesian3.clone(options.position);
  /**
   *  世界空间出光法线，在渲染时归一化。
   * @type {Cartesian3}
   */
  this.direction = Cartesian3.clone(options.direction);
  /**
   *  世界空间高度方向，在渲染时正交化。
   * @type {Cartesian3}
   */
  this.up = Cartesian3.clone(options.up);
  /**
   *  正宽度，单位为米。
   * @type {number}
   * @default 1
   */
  this.width = options.width ?? 1;
  /**
   *  正高度，单位为米。
   * @type {number}
   * @default 1
   */
  this.height = options.height ?? 1;
  /**
   *  线性 RGB 颜色，忽略 alpha。
   * @type {Color}
   * @default Color.WHITE
   */
  this.color = Color.clone(options.color ?? Color.WHITE);
  /**
   *  非负发射 HDR 辐亮度倍率。
   * @type {number}
   * @default 1
   */
  this.intensity = options.intensity ?? 1;
  /**
   *  正的中心距离影响范围，单位为米。
   * @type {number}
   * @default 100
   */
  this.range = options.range ?? 100;
  /**
   *  是否双面发光。
   * @type {boolean}
   * @default false
   */
  this.twoSided = options.twoSided ?? false;
  /**
   *  光源是否参与受光。
   * @type {boolean}
   * @default true
   */
  this.show = options.show ?? true;
  Validation.rectangle(this);
}

export default SceneGISRectAreaLight;

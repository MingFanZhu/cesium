import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import Frozen from "../../Core/Frozen.js";
import Validation from "./_private/_SceneGISLightValidation.js";

/**
 * 用于 {@link SceneGISLightCollection} 的全向局部光源。球面位置使用 ECEF，平面使用世界笛卡尔坐标，距离单位为米。使用平滑有限范围的平方反比衰减，在光源半径内限制最大值。不产生阴影或可见几何。属性可修改；按需渲染模式修改后调用 Scene.requestRender。此 CPU 描述对象可由集合共享，无需销毁。
 *
 * @alias SceneGISPointLight
 * @constructor
 * @param {object} options 包含以下属性的对象。
 * @param {Cartesian3} options.position 世界空间光源位置。
 * @param {Color} [options.color=Color.WHITE] 线性 RGB 光色，忽略 alpha。
 * @param {number} [options.intensity=1] 距离衰减之前，一米处的非负 HDR 辐照度尺度。
 * @param {number} [options.range=100] 超出后光源无影响的正距离。
 * @param {number} [options.radius=0.1] 限制近场强度的正光源半径。
 * @param {boolean} [options.show=true] 光源是否参与受光。
 * @exception {DeveloperError} 各值须有限且满足文档范围。
 */
function SceneGISPointLight(options = Frozen.EMPTY_OBJECT) {
  /**
   *  世界空间位置；Globe 为 ECEF，平面为笛卡尔轴。
   * @type {Cartesian3}
   */
  this.position = Cartesian3.clone(options.position);
  /**
   *  线性 RGB 光色，忽略 alpha。
   * @type {Color}
   * @default Color.WHITE
   */
  this.color = Color.clone(options.color ?? Color.WHITE);
  /**
   *  范围衰减之前，一米处的非负 HDR 辐照度尺度。
   * @type {number}
   * @default 1
   */
  this.intensity = options.intensity ?? 1;
  /**
   *  正影响距离，单位为米，并平滑衰减至零。
   * @type {number}
   * @default 100
   */
  this.range = options.range ?? 100;
  /**
   *  正光源半径，单位为米，用于限制平方反比强度。
   * @type {number}
   * @default 0.1
   */
  this.radius = options.radius ?? 0.1;
  /**
   *  光源是否参与受光。
   * @type {boolean}
   * @default true
   */
  this.show = options.show ?? true;
  Validation.point(this);
}

export default SceneGISPointLight;

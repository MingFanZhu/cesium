import Cartesian3 from "../../Core/Cartesian3.js";
import Frozen from "../../Core/Frozen.js";
import SceneGISPointLight from "./SceneGISPointLight.js";
import Validation from "./_private/_SceneGISLightValidation.js";

/**
 * 用于 {@link SceneGISLightCollection} 的平滑锥形局部光源。位置、颜色、强度、范围、半径、显隐和生命周期遵循 {@link SceneGISPointLight}。锥角为以弧度计的半角。
 *
 * @alias SceneGISSpotLight
 * @extends SceneGISPointLight
 * @param {object} options 包含以下属性的对象。
 * @param {Cartesian3} options.position 世界空间光源位置。
 * @param {Cartesian3} options.direction 光线发出的非零世界空间方向。
 * @param {Color} [options.color=Color.WHITE] 线性 RGB 光色，忽略 alpha。
 * @param {number} [options.intensity=1] 一米处的非负 HDR 辐照度尺度。
 * @param {number} [options.range=100] 正影响范围，单位为米。
 * @param {number} [options.radius=0.1] 正光源半径，单位为米。
 * @param {boolean} [options.show=true] 光源是否参与受光。
 * @param {number} [options.innerConeAngle=0.39269908169872414] 完全受光区域的锥半角，>= 0。
 * @param {number} [options.outerConeAngle=0.7853981633974483] 零光照区域的半角，> inner 且 <= PI/2。
 * @exception {DeveloperError} 各值须有限且满足文档范围。
 */
class SceneGISSpotLight extends SceneGISPointLight {
  constructor(options = Frozen.EMPTY_OBJECT) {
    super(options);
    /**
     *  非零世界空间出光方向，在渲染时归一化。
     * @type {Cartesian3}
     */
    this.direction = Cartesian3.clone(options.direction);
    /**
     *  完全受光锥半角，单位为弧度，>= 0 且 < outerConeAngle。
     * @type {number}
     * @default Math.PI / 8
     */
    this.innerConeAngle = options.innerConeAngle ?? Math.PI / 8;
    /**
     *  零光照锥半角，单位为弧度，> innerConeAngle 且 <= PI/2。
     * @type {number}
     * @default Math.PI / 4
     */
    this.outerConeAngle = options.outerConeAngle ?? Math.PI / 4;
    Validation.spot(this);
  }
}

export default SceneGISSpotLight;

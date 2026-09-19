import Cartesian3 from "../../Core/Cartesian3.js";
import Frozen from "../../Core/Frozen.js";
import SceneGISPointLight from "./SceneGISPointLight.js";
import Validation from "./_private/_SceneGISLightValidation.js";

/**
 * A local light with a smooth cone, for {@link SceneGISLightCollection}.
 * Shares the position, color, intensity, range, radius, show and lifetime conventions
 * of {@link SceneGISPointLight}. Cone angles are half angles measured in radians.
 *
 * @alias SceneGISSpotLight
 * @extends SceneGISPointLight
 * @param {object} options Object with the following properties.
 * @param {Cartesian3} options.position The world-space light position.
 * @param {Cartesian3} options.direction Nonzero world-space direction in which light is emitted.
 * @param {Color} [options.color=Color.WHITE] Linear RGB light color; alpha is ignored.
 * @param {number} [options.intensity=1] Nonnegative HDR irradiance scale at one meter.
 * @param {number} [options.range=100] Positive influence range in meters.
 * @param {number} [options.radius=0.1] Positive source radius in meters.
 * @param {boolean} [options.show=true] Whether the light contributes.
 * @param {number} [options.innerConeAngle=0.39269908169872414] Fully lit cone half angle, >= 0.
 * @param {number} [options.outerConeAngle=0.7853981633974483] Zero-light half angle, > inner and <= PI/2.
 * @exception {DeveloperError} Values must be finite and satisfy their documented bounds.
 */
class SceneGISSpotLight extends SceneGISPointLight {
  constructor(options = Frozen.EMPTY_OBJECT) {
    super(options);
    /** Nonzero world-space direction of emitted light; normalized during rendering.
     * @type {Cartesian3}
     */
    this.direction = Cartesian3.clone(options.direction);
    /** Fully lit cone half angle in radians, >= 0 and < outerConeAngle.
     * @type {number}
     * @default Math.PI / 8
     */
    this.innerConeAngle = options.innerConeAngle ?? Math.PI / 8;
    /** Zero-light cone half angle in radians, > innerConeAngle and <= PI/2.
     * @type {number}
     * @default Math.PI / 4
     */
    this.outerConeAngle = options.outerConeAngle ?? Math.PI / 4;
    Validation.spot(this);
  }
}

export default SceneGISSpotLight;

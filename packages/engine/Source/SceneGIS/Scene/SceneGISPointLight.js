import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import Frozen from "../../Core/Frozen.js";
import Validation from "./_private/_SceneGISLightValidation.js";

/**
 * An omnidirectional local light for {@link SceneGISLightCollection}.
 * Positions use ECEF in Globe and Cartesian world coordinates in Planar. Distances
 * are in meters. The light uses smooth finite-range inverse-square attenuation,
 * capped inside its source radius. It does not cast shadows or create visible geometry.
 * Properties are mutable; call Scene.requestRender after edits in request-render mode.
 * This CPU descriptor may be shared by collections and needs no destruction.
 *
 * @alias SceneGISPointLight
 * @constructor
 * @param {object} options Object with the following properties.
 * @param {Cartesian3} options.position The world-space light position.
 * @param {Color} [options.color=Color.WHITE] Linear RGB light color; alpha is ignored.
 * @param {number} [options.intensity=1] Nonnegative HDR irradiance scale at one meter, before range attenuation.
 * @param {number} [options.range=100] Positive distance beyond which the light has no effect.
 * @param {number} [options.radius=0.1] Positive source radius limiting near-field intensity.
 * @param {boolean} [options.show=true] Whether the light contributes.
 * @exception {DeveloperError} Values must be finite and satisfy their documented bounds.
 */
function SceneGISPointLight(options = Frozen.EMPTY_OBJECT) {
  /** The world-space position; ECEF for Globe, Cartesian axes for Planar.
   * @type {Cartesian3}
   */
  this.position = Cartesian3.clone(options.position);
  /** Linear RGB light color; alpha is ignored.
   * @type {Color}
   * @default Color.WHITE
   */
  this.color = Color.clone(options.color ?? Color.WHITE);
  /** Nonnegative HDR irradiance scale at one meter before range attenuation.
   * @type {number}
   * @default 1
   */
  this.intensity = options.intensity ?? 1;
  /** Positive influence distance in meters, with a smooth fade to zero.
   * @type {number}
   * @default 100
   */
  this.range = options.range ?? 100;
  /** Positive source radius in meters, limiting inverse-square intensity.
   * @type {number}
   * @default 0.1
   */
  this.radius = options.radius ?? 0.1;
  /** Whether the light contributes.
   * @type {boolean}
   * @default true
   */
  this.show = options.show ?? true;
  Validation.point(this);
}

export default SceneGISPointLight;

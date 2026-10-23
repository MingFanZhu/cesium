import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import Frozen from "../../Core/Frozen.js";
import Validation from "./_private/_SceneGISLightValidation.js";

/**
 * A uniformly emitting rectangular area light for {@link SceneGISLightCollection}.
 * Position is the rectangle center in ECEF (Globe) or Cartesian meters (Planar).
 * Direction is the emission normal; up sets the height axis after orthogonalization.
 * Width points along cross(direction, up). Inputs are cloned and remain mutable.
 * Call Scene.requestRender after edits in request-render mode.
 *
 * Intensity is emitted linear HDR radiance: increasing area at fixed intensity
 * increases total output. It differs from the irradiance-at-one-meter scale of
 * point/spot lights. Range applies a smooth center-distance fade after integration.
 * Diffuse uses polygon integration; specular uses an isotropic GGX LTC fit,
 * including clearcoat. Phong specular is approximated by a matched GGX roughness.
 * Anisotropic materials use isotropic area-light specular.
 * No shadows, participating media or visible geometry are created. This borrowed
 * CPU descriptor may be shared by collections and needs no destruction.
 *
 * @alias SceneGISRectAreaLight
 * @constructor
 * @param {object} options Object with the following properties.
 * @param {Cartesian3} options.position World-space center.
 * @param {Cartesian3} options.direction Nonzero world-space emission direction.
 * @param {Cartesian3} options.up Nonzero world-space height direction, independent of direction.
 * @param {number} [options.width=1] Positive rectangle width in meters.
 * @param {number} [options.height=1] Positive rectangle height in meters.
 * @param {Color} [options.color=Color.WHITE] Linear RGB color; alpha is ignored.
 * @param {number} [options.intensity=1] Nonnegative emitted HDR radiance scale.
 * @param {number} [options.range=100] Positive center-distance influence range in meters.
 * @param {boolean} [options.twoSided=false] Whether both faces emit.
 * @param {boolean} [options.show=true] Whether the light contributes.
 * @exception {DeveloperError} Values must be finite and satisfy their documented bounds.
 * @example
 * const panel = lights.add(new Cesium.SceneGISRectAreaLight({
 *   position: new Cesium.Cartesian3(0, 0, 6),
 *   direction: new Cesium.Cartesian3(0, 0, -1),
 *   up: Cesium.Cartesian3.UNIT_Y,
 *   width: 4, height: 2, intensity: 8, range: 30
 * }));
 */
function SceneGISRectAreaLight(options = Frozen.EMPTY_OBJECT) {
  /** World-space center.
   * @type {Cartesian3}
   */
  this.position = Cartesian3.clone(options.position);
  /** World-space emission normal, normalized during rendering.
   * @type {Cartesian3}
   */
  this.direction = Cartesian3.clone(options.direction);
  /** World-space height direction, orthogonalized during rendering.
   * @type {Cartesian3}
   */
  this.up = Cartesian3.clone(options.up);
  /** Positive width in meters.
   * @type {number}
   * @default 1
   */
  this.width = options.width ?? 1;
  /** Positive height in meters.
   * @type {number}
   * @default 1
   */
  this.height = options.height ?? 1;
  /** Linear RGB color; alpha is ignored.
   * @type {Color}
   * @default Color.WHITE
   */
  this.color = Color.clone(options.color ?? Color.WHITE);
  /** Nonnegative emitted HDR radiance scale.
   * @type {number}
   * @default 1
   */
  this.intensity = options.intensity ?? 1;
  /** Positive center-distance influence range in meters.
   * @type {number}
   * @default 100
   */
  this.range = options.range ?? 100;
  /** Whether both faces emit.
   * @type {boolean}
   * @default false
   */
  this.twoSided = options.twoSided ?? false;
  /** Whether the light contributes.
   * @type {boolean}
   * @default true
   */
  this.show = options.show ?? true;
  Validation.rectangle(this);
}

export default SceneGISRectAreaLight;

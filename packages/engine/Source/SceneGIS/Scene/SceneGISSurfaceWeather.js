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
 * Approximate wetness and thin snow on opaque PBR models/3D Tiles, lit Phong
 * primitives and Globe/Planar terrain. Uses existing normals and materials;
 * no additional asset attributes, textures or geometry passes are required.
 * Coverage is world-fixed, with geodetic up in Globe and fixed Z in Planar.
 * Terrain retains diffuse lighting with an approximate wet directional highlight.
 * Unlit models, translucent content, classification and water are unchanged.
 *
 * Amounts are independent of particle weather and scene time. This does not
 * simulate shelter, drainage, puddle depth, snow thickness or melting. Imagery
 * has no land-cover semantics, so photographed vegetation/water may be covered.
 * The Scene owns this setting; explicit destroy detaches it early. ShaderCache
 * owns derived programs. No textures, framebuffers or extra draws are allocated.
 *
 * @alias SceneGISSurfaceWeather
 * @constructor
 * @param {object} options Initialization options.
 * @param {Scene} options.scene The live SCENE3D Scene; only one setting is allowed.
 * @param {boolean} [options.enabled=false] Whether coverage is applied.
 * @param {number} [options.wetness=0] Visual wetness in [0, 1].
 * @param {number} [options.snowCoverage=0] Visual snow coverage in [0, 1].
 * @param {number} [options.patchScale=40] Positive world-space patch size in meters.
 * @param {Color} [options.snowColor] Snow reflectance, default (0.85, 0.9, 0.95).
 * @exception {DeveloperError} Scene and option values must meet their documented contracts.
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
  this.snowColor = options.snowColor ?? new Color(0.85, 0.9, 0.95);
  scene._sceneGISSurfaceWeather = this;
}

Object.defineProperties(SceneGISSurfaceWeather.prototype, {
  /** Whether to apply coverage. Changing settings requests a frame.
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
  /** Visual wetness in [0, 1]; does not imply standing water.
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
  /** Thin snow coverage in [0, 1], biased toward upward-facing geometry.
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
  /** Positive procedural patch size in world meters.
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
  /** Snow reflectance in linear RGB [0, 1]. Assigned colors are cloned; alpha is ignored.
   * Request a render after editing the returned Color in place.
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

/** @returns {boolean} Whether this setting has been destroyed. */
SceneGISSurfaceWeather.prototype.isDestroyed = function () {
  return false;
};
/** Detaches coverage and restores original materials.
 * @returns {undefined}
 */
SceneGISSurfaceWeather.prototype.destroy = function () {
  this._scene._sceneGISSurfaceWeather = undefined;
  this._scene.requestRender();
  this._scene = this._state = undefined;
  return destroyObject(this);
};
export default SceneGISSurfaceWeather;

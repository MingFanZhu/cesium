import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import RuntimeError from "../../Core/RuntimeError.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import SceneMode from "../../Scene/SceneMode.js";
import Renderer from "./_private/_SceneGISScreenSpaceIndirectLighting.js";

function numberProperty(name, minimum, maximum, integer = false) {
  return {
    get: function () {
      return this[`_${name}`];
    },
    set: function (value) {
      if (
        !Number.isFinite(value) ||
        value < minimum ||
        value > maximum ||
        (integer && !Number.isInteger(value))
      ) {
        throw new DeveloperError(
          `${name} must be ${integer ? "an integer" : "finite"} in [${minimum}, ${maximum}].`,
        );
      }
      this[`_${name}`] = value;
      this._scene?.requestRender();
    },
  };
}

/**
 * Estimates one local diffuse light bounce between visible opaque PBR models and
 * 3D Tiles. Globe and Planar share the same eye-space algorithm. Offscreen geometry,
 * unlit materials, terrain receivers, transparency and multiple bounces are excluded.
 * HDR and a qualified single-frustum main-pass MRT layout are required. In particular,
 * clearcoat SSR and SSIL together exceed the eight-attachment prototype budget.
 * No extra geometry is drawn. Stable spatial filtering has no independent history;
 * optional temporal antialiasing remains caller-owned.
 *
 * The Scene owns the attached effect. Calling destroy earlier detaches it. Disabled
 * effects retain allocated resources; constructing disabled allocates no GPU resources.
 *
 * @alias SceneGISScreenSpaceIndirectLighting
 * @constructor
 * @experimental This feature is not final and is subject to change without Cesium's standard deprecation policy.
 * @param {object} options Initialization options.
 * @param {Scene} options.scene The live Scene. Only one instance may be attached.
 * @param {boolean} [options.enabled=false] Whether indirect lighting is enabled.
 * @param {number} [options.radius=5.0] Maximum gathering distance in meters, greater than zero.
 * @param {number} [options.thickness=0.5] Assumed surface thickness in meters, greater than zero.
 * @param {number} [options.intensity=1.0] Indirect light multiplier in [0, 4].
 * @param {number} [options.directionCount=4] Hemisphere slice count, an integer in [1, 8].
 * @param {number} [options.stepCount=8] Samples per side of each slice, an integer in [2, 16].
 * @param {number} [options.resolutionScale=0.5] Estimation resolution, either 0.5 or 1.
 * @example
 * viewer.scene.highDynamicRange = true;
 * const indirectLighting = new Cesium.SceneGISScreenSpaceIndirectLighting({
 *   scene: viewer.scene,
 *   enabled: true,
 *   radius: 5.0,
 * });
 */
function SceneGISScreenSpaceIndirectLighting(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  const scene = options.scene;
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (defined(scene._sceneGISScreenSpaceIndirectLighting)) {
    throw new DeveloperError(
      "Only one SceneGISScreenSpaceIndirectLighting may be attached to a Scene.",
    );
  }
  this._ready = false;
  this._state = undefined;
  this.radius = options.radius ?? 5.0;
  this.thickness = options.thickness ?? 0.5;
  this.intensity = options.intensity ?? 1.0;
  this.directionCount = options.directionCount ?? 4;
  this.stepCount = options.stepCount ?? 8;
  this.resolutionScale = options.resolutionScale ?? 0.5;
  this.enabled = options.enabled ?? false;
  this._scene = scene;
  if (this.enabled) {
    this._validate();
  }
  scene._sceneGISScreenSpaceIndirectLighting = this;
  scene.requestRender();
}

/**
 * Tests baseline GPU support; the current Scene layout is checked before rendering.
 * @param {Scene} scene The Scene to test.
 * @returns {boolean} Whether the required formats and draw buffers are supported.
 */
SceneGISScreenSpaceIndirectLighting.isSupported = function (scene) {
  const c = scene.context;
  return (
    c.webgl2 &&
    c.depthTexture &&
    c.colorBufferFloat &&
    c.colorBufferHalfFloat &&
    ContextLimits.maximumDrawBuffers >= 3 &&
    ContextLimits.maximumColorAttachments >= 3
  );
};

Object.defineProperties(SceneGISScreenSpaceIndirectLighting.prototype, {
  /**
   * Whether indirect lighting is enabled.
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {boolean}
   * @default false
   */
  enabled: {
    get: function () {
      return this._enabled;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("enabled must be boolean.");
      }
      if (value && this._scene) {
        this._validate();
      }
      this._enabled = value;
      this._ready = false;
      this._scene?.requestRender();
    },
  },
  /**
   * Whether the current frame has produced an indirect lighting result.
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
  /**
   * Maximum gathering distance in meters.
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 5.0
   */
  radius: numberProperty("radius", Number.EPSILON, Number.MAX_VALUE),
  /**
   * Assumed surface thickness in meters. Single-layer depth cannot recover true thickness.
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 0.5
   */
  thickness: numberProperty("thickness", Number.EPSILON, Number.MAX_VALUE),
  /**
   * Indirect light multiplier in [0, 4].
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 1.0
   */
  intensity: numberProperty("intensity", 0, 4),
  /**
   * Hemisphere slice count in [1, 8].
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 4
   */
  directionCount: numberProperty("directionCount", 1, 8, true),
  /**
   * Samples per side of each slice in [2, 16].
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 8
   */
  stepCount: numberProperty("stepCount", 2, 16, true),
  /**
   * Estimation resolution, either 0.5 or 1.
   * @memberof SceneGISScreenSpaceIndirectLighting.prototype
   * @type {number}
   * @default 0.5
   */
  resolutionScale: {
    get: function () {
      return this._resolutionScale;
    },
    set: function (value) {
      if (value !== 0.5 && value !== 1) {
        throw new DeveloperError("resolutionScale must be 0.5 or 1.");
      }
      this._resolutionScale = value;
      this._scene?.requestRender();
    },
  },
});

/** @private */
SceneGISScreenSpaceIndirectLighting.prototype._validate = function () {
  const scene = this._scene;
  if (
    scene.mode !== SceneMode.SCENE3D ||
    !scene.highDynamicRange ||
    !SceneGISScreenSpaceIndirectLighting.isSupported(scene)
  ) {
    throw new RuntimeError(
      "SSIL requires SCENE3D, HDR, WebGL2, floating-point color/depth targets and three draw buffers.",
    );
  }
};

/** @returns {boolean} Whether this effect has been destroyed. */
SceneGISScreenSpaceIndirectLighting.prototype.isDestroyed = function () {
  return false;
};

/**
 * Releases owned GPU resources and detaches from the Scene.
 * @returns {undefined}
 */
SceneGISScreenSpaceIndirectLighting.prototype.destroy = function () {
  Renderer.destroy(this);
  this._scene._sceneGISScreenSpaceIndirectLighting = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};

export default SceneGISScreenSpaceIndirectLighting;

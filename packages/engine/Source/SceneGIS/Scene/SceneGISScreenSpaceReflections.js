import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import RuntimeError from "../../Core/RuntimeError.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import SceneMode from "../../Scene/SceneMode.js";
import Renderer from "./_private/_SceneGISScreenSpaceReflections.js";

function requestRender(effect) {
  effect._ready = false;
  effect._scene?.requestRender();
}

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
      requestRender(this);
    },
  };
}

/**
 * Adds current-frame screen-space reflections to opaque native PBR models and 3D Tiles.
 * Globe and Planar scenes use the same eye-space tracing. Existing specular IBL supplies
 * missing rays. Transparent objects, classification overlays and offscreen geometry are excluded.
 * HDR must be enabled explicitly. The Scene owns the attached effect and destroys it with the
 * Scene; calling destroy earlier detaches it. Disabled effects retain allocated targets for reuse.
 *
 * @alias SceneGISScreenSpaceReflections
 * @constructor
 * @param {object} options Initialization options.
 * @param {Scene} options.scene The live Scene. Only one effect may be attached.
 * @param {boolean} [options.enabled=false] Whether reflections are enabled.
 * @param {number} [options.maximumDistance=100.0] Maximum ray length in meters, greater than zero.
 * @param {number} [options.thickness=0.5] Eye-depth intersection tolerance in meters, greater than zero.
 * @param {number} [options.maximumRoughness=0.6] Perceptual roughness cutoff in (0, 1].
 * @param {number} [options.stepCount=96] Maximum traversal steps per lobe, an integer in [16, 256].
 * @example
 * viewer.scene.highDynamicRange = true;
 * const reflections = new Cesium.SceneGISScreenSpaceReflections({
 *   scene: viewer.scene,
 *   enabled: true,
 * });
 */
function SceneGISScreenSpaceReflections(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  const scene = options.scene;
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (defined(scene._sceneGISScreenSpaceReflections)) {
    throw new DeveloperError(
      "Only one SceneGISScreenSpaceReflections may be attached to a Scene.",
    );
  }
  this._ready = false;
  this._state = undefined;
  this.maximumDistance = options.maximumDistance ?? 100.0;
  this.thickness = options.thickness ?? 0.5;
  this.maximumRoughness = options.maximumRoughness ?? 0.6;
  this.stepCount = options.stepCount ?? 96;
  this.enabled = options.enabled ?? false;
  this._scene = scene;
  if (this.enabled) {
    this._validate();
  }
  scene._sceneGISScreenSpaceReflections = this;
  scene.requestRender();
}

/**
 * Tests GPU support, independently of the current Scene mode or HDR setting.
 * @param {Scene} scene The Scene to test.
 * @returns {boolean} Whether the required texture and framebuffer formats are supported.
 */
SceneGISScreenSpaceReflections.isSupported = function (scene) {
  const c = scene.context;
  return (
    c.webgl2 &&
    c.depthTexture &&
    c.colorBufferFloat &&
    c.colorBufferHalfFloat &&
    c.textureHalfFloatLinear &&
    ContextLimits.maximumDrawBuffers >= 3
  );
};

Object.defineProperties(SceneGISScreenSpaceReflections.prototype, {
  /**
   * Whether the effect is enabled.
   * @memberof SceneGISScreenSpaceReflections.prototype
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
      if (value && defined(this._scene)) {
        this._validate();
      }
      this._enabled = value;
      requestRender(this);
    },
  },
  /**
   * Whether a complete current render has produced reflection data.
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
  /**
   * Maximum ray length in meters.
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {number}
   * @default 100.0
   */
  maximumDistance: numberProperty(
    "maximumDistance",
    Number.EPSILON,
    Number.MAX_VALUE,
  ),
  /**
   * Eye-depth intersection tolerance in meters.
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {number}
   * @default 0.5
   */
  thickness: numberProperty("thickness", Number.EPSILON, Number.MAX_VALUE),
  /**
   * Perceptual roughness cutoff; rougher surfaces retain IBL.
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {number}
   * @default 0.6
   */
  maximumRoughness: numberProperty("maximumRoughness", Number.EPSILON, 1),
  /**
   * Maximum traversal steps per lobe in [16, 256].
   * @memberof SceneGISScreenSpaceReflections.prototype
   * @type {number}
   * @default 96
   */
  stepCount: numberProperty("stepCount", 16, 256, true),
});

/** @private */
SceneGISScreenSpaceReflections.prototype._validate = function () {
  const scene = this._scene;
  if (
    scene.mode !== SceneMode.SCENE3D ||
    !scene.highDynamicRange ||
    !SceneGISScreenSpaceReflections.isSupported(scene)
  ) {
    throw new RuntimeError(
      "Screen-space reflections require SCENE3D, HDR, WebGL2, floating-point color/depth targets and three draw buffers.",
    );
  }
};

/** @returns {boolean} Whether this effect has been destroyed. */
SceneGISScreenSpaceReflections.prototype.isDestroyed = function () {
  return false;
};

/**
 * Releases all owned GPU resources and detaches from the Scene.
 * @returns {undefined}
 */
SceneGISScreenSpaceReflections.prototype.destroy = function () {
  Renderer.destroy(this);
  this._scene._sceneGISScreenSpaceReflections = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};

export default SceneGISScreenSpaceReflections;

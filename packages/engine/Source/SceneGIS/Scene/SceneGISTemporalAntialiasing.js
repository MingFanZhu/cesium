import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import RuntimeError from "../../Core/RuntimeError.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import SceneMode from "../../Scene/SceneMode.js";
import Renderer from "./_private/_SceneGISTemporalAntialiasing.js";

/**
 * Temporally antialiases HDR Globe and Planar scenes using render-only subpixel samples.
 * Static geometry is reprojected using camera motion, with depth rejection and color clipping.
 * Object motion vectors are not available: animated objects, translucent content and labels
 * can soften or retain trails. Background pixels use current color. Native overlays remain sharp.
 * The Scene owns the attached effect. Disabling releases history; enabling starts fresh.
 * Request-render scenes accumulate only on requested renders. MSAA and FXAA remain caller-owned.
 *
 * @alias SceneGISTemporalAntialiasing
 * @constructor
 * @param {object} options Initialization options.
 * @param {Scene} options.scene The live Scene; only one effect may be attached.
 * @param {boolean} [options.enabled=false] Whether temporal antialiasing is enabled.
 * @param {number} [options.historyWeight=0.9] Base history contribution in [0, 0.95]; zero disables history blending.
 * @exception {RuntimeError} Enabled TAA requires HDR, SCENE3D and supported WebGL2 targets; stereo is excluded.
 * @example
 * scene.highDynamicRange = true;
 * scene.msaaSamples = 1;
 * scene.postProcessStages.fxaa.enabled = false;
 * const taa = new Cesium.SceneGISTemporalAntialiasing({ scene, enabled: true });
 */
function SceneGISTemporalAntialiasing(options) {
  const scene = options?.scene;
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (defined(scene._sceneGISTemporalAntialiasing)) {
    throw new DeveloperError(
      "Only one SceneGISTemporalAntialiasing may be attached to a Scene.",
    );
  }
  this._scene = scene;
  this._state = undefined;
  this._ready = false;
  this.historyWeight = options.historyWeight ?? 0.9;
  this.enabled = options.enabled ?? false;
  scene._sceneGISTemporalAntialiasing = this;
  scene.requestRender();
}

/**
 * Tests GPU support independently of Scene configuration.
 * @param {Scene} scene The Scene to test.
 * @returns {boolean} Whether the required framebuffer formats are supported.
 */
SceneGISTemporalAntialiasing.isSupported = function (scene) {
  const c = scene.context;
  return (
    c.webgl2 &&
    c.depthTexture &&
    c.colorBufferFloat &&
    c.colorBufferHalfFloat &&
    c.textureHalfFloatLinear &&
    ContextLimits.maximumDrawBuffers >= 2
  );
};

Object.defineProperties(SceneGISTemporalAntialiasing.prototype, {
  /**
   * Whether TAA is enabled. Disabling releases all GPU history.
   * @memberof SceneGISTemporalAntialiasing.prototype
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
      if (value) {
        this._validate();
      }
      if (value === this._enabled) {
        return;
      }
      this._enabled = value;
      if (!value) {
        Renderer.destroy(this);
      }
      this.reset();
    },
  },
  /**
   * Base history contribution; lower values respond faster to changing content.
   * After depth rejection and color clipping, luminance differences can increase
   * history retention to suppress subpixel flicker. Zero disables history blending.
   * @memberof SceneGISTemporalAntialiasing.prototype
   * @type {number}
   * @default 0.9
   */
  historyWeight: {
    get: function () {
      return this._historyWeight;
    },
    set: function (value) {
      if (!Number.isFinite(value) || value < 0 || value > 0.95) {
        throw new DeveloperError("historyWeight must be in [0, 0.95].");
      }
      this._historyWeight = value;
      this.reset();
    },
  },
  /**
   * Whether the last render successfully produced a temporal result.
   * @memberof SceneGISTemporalAntialiasing.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
});

/**
 * Discards history, for example after an application camera cut or scene replacement.
 * The next rendered frame publishes current color immediately.
 */
SceneGISTemporalAntialiasing.prototype.reset = function () {
  this._ready = false;
  if (this._state) {
    this._state.valid = false;
    this._state.sample = 0;
  }
  this._scene.requestRender();
};

/** @private */
SceneGISTemporalAntialiasing.prototype._validate = function () {
  const scene = this._scene;
  if (
    scene.mode !== SceneMode.SCENE3D ||
    !scene.highDynamicRange ||
    scene.useWebVR ||
    !SceneGISTemporalAntialiasing.isSupported(scene)
  ) {
    throw new RuntimeError(
      "Temporal antialiasing requires HDR, SCENE3D, a single viewport and WebGL2 floating-point color/depth targets.",
    );
  }
};

/** @returns {boolean} Whether this effect has been destroyed. */
SceneGISTemporalAntialiasing.prototype.isDestroyed = function () {
  return false;
};

/**
 * Releases owned resources and detaches from the Scene.
 * @returns {undefined}
 */
SceneGISTemporalAntialiasing.prototype.destroy = function () {
  Renderer.destroy(this);
  this._scene._sceneGISTemporalAntialiasing = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};

export default SceneGISTemporalAntialiasing;

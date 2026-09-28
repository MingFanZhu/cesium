import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import RuntimeError from "../../Core/RuntimeError.js";
import Renderer from "./_private/_SceneGISAutoExposure.js";

function numberProperty(name, minimum, maximum) {
  return {
    get: function () {
      return this[`_${name}`];
    },
    set: function (value) {
      if (!Number.isFinite(value) || value < minimum || value > maximum) {
        throw new DeveloperError(
          `${name} must be finite in [${minimum}, ${maximum}].`,
        );
      }
      if (
        (name === "minimumExposure" && value > this._maximumExposure) ||
        (name === "maximumExposure" && value < this._minimumExposure) ||
        (name === "lowPercent" && this._highPercent - value < 0.0001) ||
        (name === "highPercent" && value - this._lowPercent < 0.0001)
      ) {
        throw new DeveloperError(
          "Exposure limits must be ordered and highPercent - lowPercent must be at least 0.0001.",
        );
      }
      this[`_${name}`] = value;
      this._scene?.requestRender();
    },
  };
}

/**
 * Global histogram eye adaptation for HDR Globe and Planar scenes. Uses bounded
 * GPU metering before native bloom and tone mapping, without geometry replay.
 * Relative luminance maps to middle gray (0.18); this is not calibrated EV100.
 * Native postProcessStages.exposure remains an additional positive multiplier.
 *
 * The Scene owns this controller. Disable releases its GPU resources and restores
 * native manual exposure on the next rendered frame. No automatic settling frames
 * are requested: request-render applications own the animation cadence. Adaptation
 * uses elapsed wall time between rendered frames, not the simulation clock.
 * Call reset after camera cuts or content replacement to meter immediately.
 *
 * @alias SceneGISAutoExposure
 * @constructor
 * @experimental This feature is not final and is subject to change without Cesium's standard deprecation policy.
 * @param {object} options Initialization options.
 * @param {Scene} options.scene The live Scene. Only one controller may be attached.
 * @param {boolean} [options.enabled=false] Enable automatic exposure; requires HDR and WebGL2 float targets.
 * @param {boolean} [options.locked=false] Freeze adapted gain after the first metered frame.
 * @param {number} [options.exposureCompensation=0] Exposure compensation in stops, applied after adaptation. Range [-10, 10].
 * @param {number} [options.minimumExposure=0.015625] Minimum automatic linear gain, before compensation and native exposure. Range [0.0000152587890625, 65536].
 * @param {number} [options.maximumExposure=64] Maximum automatic linear gain, before compensation and native exposure. Range [0.0000152587890625, 65536].
 * @param {number} [options.speedUp=3] Adaptation speed toward brighter surroundings, in stops per second. Range [0.01, 100].
 * @param {number} [options.speedDown=1] Adaptation speed toward darker surroundings, in stops per second. Range [0.01, 100].
 * @param {number} [options.lowPercent=0.05] Lower retained histogram percentile as a fraction, at least 0.0001 below highPercent. Range [0, 0.99].
 * @param {number} [options.highPercent=0.95] Upper retained histogram percentile as a fraction, at least 0.0001 above lowPercent. Range [0.01, 1].
 * @param {number} [options.centerWeight=0.75] Blend from uniform metering (0) to Gaussian center weighting (1). Range [0, 1].
 * @example
 * viewer.scene.highDynamicRange = true;
 * const exposure = new Cesium.SceneGISAutoExposure({ scene: viewer.scene, enabled: true });
 * exposure.exposureCompensation = 0.5;
 */
function SceneGISAutoExposure(options) {
  const scene = options?.scene;
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (scene.postProcessStages._sceneGISAutoExposure) {
    throw new DeveloperError(
      "Only one SceneGISAutoExposure may be attached to a Scene.",
    );
  }
  this._ready = false;
  this._state = undefined;
  this.exposureCompensation = options.exposureCompensation ?? 0;
  this.minimumExposure = options.minimumExposure ?? 0.015625;
  this.maximumExposure = options.maximumExposure ?? 64;
  this.speedUp = options.speedUp ?? 3;
  this.speedDown = options.speedDown ?? 1;
  this.lowPercent = options.lowPercent ?? 0.05;
  this.highPercent = options.highPercent ?? 0.95;
  this.centerWeight = options.centerWeight ?? 0.75;
  this.locked = options.locked ?? false;
  this.enabled = options.enabled ?? false;
  this._scene = scene;
  if (this.enabled) {
    this._validate();
  }
  scene.postProcessStages._sceneGISAutoExposure = this;
  scene.requestRender();
}

/**
 * Tests the GPU formats required by the controller. HDR must also be enabled.
 * @param {Scene} scene The Scene to test.
 * @returns {boolean} Whether WebGL2 float color targets are supported.
 */
SceneGISAutoExposure.isSupported = function (scene) {
  return scene.context.webgl2 && scene.context.colorBufferFloat;
};

Object.defineProperties(SceneGISAutoExposure.prototype, {
  /**
   * Whether automatic exposure is enabled. Disabling releases GPU resources.
   * @memberof SceneGISAutoExposure.prototype
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
      if (!value) {
        Renderer.destroy(this);
      }
      this._enabled = value;
      this._scene?.requestRender();
    },
  },
  /**
   * Freeze metered gain. Compensation and native exposure remain adjustable.
   * @memberof SceneGISAutoExposure.prototype
   * @type {boolean}
   * @default false
   */
  locked: {
    get: function () {
      return this._locked;
    },
    set: function (value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError("locked must be boolean.");
      }
      this._locked = value;
      this._scene?.requestRender();
    },
  },
  /**
   * Whether a metered result is available.
   * @memberof SceneGISAutoExposure.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._ready;
    },
  },
  /**
   * Exposure compensation in stops, applied after adaptation. Range [-10, 10].
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0
   */
  exposureCompensation: numberProperty("exposureCompensation", -10, 10),
  /**
   * Minimum automatic linear gain, before compensation and native exposure. Range [0.0000152587890625, 65536].
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0.015625
   */
  minimumExposure: numberProperty("minimumExposure", 0.0000152587890625, 65536),
  /**
   * Maximum automatic linear gain, before compensation and native exposure. Range [0.0000152587890625, 65536].
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 64
   */
  maximumExposure: numberProperty("maximumExposure", 0.0000152587890625, 65536),
  /**
   * Adaptation speed toward brighter surroundings, in stops per second. Range [0.01, 100].
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 3
   */
  speedUp: numberProperty("speedUp", 0.01, 100),
  /**
   * Adaptation speed toward darker surroundings, in stops per second. Range [0.01, 100].
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 1
   */
  speedDown: numberProperty("speedDown", 0.01, 100),
  /**
   * Lower retained histogram percentile as a fraction. Range [0, 0.99].
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0.05
   */
  lowPercent: numberProperty("lowPercent", 0, 0.99),
  /**
   * Upper retained histogram percentile as a fraction. Range [0.01, 1].
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0.95
   */
  highPercent: numberProperty("highPercent", 0.01, 1),
  /**
   * Blend from uniform metering (0) to Gaussian center weighting (1). Range [0, 1].
   * @memberof SceneGISAutoExposure.prototype
   * @type {number}
   * @default 0.75
   */
  centerWeight: numberProperty("centerWeight", 0, 1),
});

/** @private */
SceneGISAutoExposure.prototype._validate = function () {
  if (
    !this._scene.highDynamicRange ||
    !SceneGISAutoExposure.isSupported(this._scene)
  ) {
    throw new RuntimeError(
      "Auto exposure requires HDR, WebGL2 and floating-point color targets.",
    );
  }
  const exposure = this._scene.postProcessStages.exposure;
  if (!Number.isFinite(exposure) || exposure <= 0) {
    throw new RuntimeError(
      "Native exposure must be finite and positive while auto exposure is enabled.",
    );
  }
};

/** Discard adaptation history and meter immediately on the next rendered frame. */
SceneGISAutoExposure.prototype.reset = function () {
  this._ready = false;
  this._scene.requestRender();
};

/** @returns {boolean} Whether this controller has been destroyed. */
SceneGISAutoExposure.prototype.isDestroyed = function () {
  return false;
};

/**
 * Release GPU resources and detach from the Scene.
 * @returns {undefined}
 */
SceneGISAutoExposure.prototype.destroy = function () {
  Renderer.destroy(this);
  this._scene.postProcessStages._sceneGISAutoExposure = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};
export default SceneGISAutoExposure;

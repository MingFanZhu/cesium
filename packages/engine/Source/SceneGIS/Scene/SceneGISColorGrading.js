import Cartesian3 from "../../Core/Cartesian3.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Matrix3 from "../../Core/Matrix3.js";
import RuntimeError from "../../Core/RuntimeError.js";
import shader from "../../Shaders/SceneGIS/SceneGISColorGradingStage.js";

const rgbToXyz = new Matrix3(
  0.4124564,
  0.3575761,
  0.1804375,
  0.2126729,
  0.7151522,
  0.072175,
  0.0193339,
  0.119192,
  0.9503041,
);
const xyzToRgb = Matrix3.inverse(rgbToXyz, new Matrix3());
const bradford = new Matrix3(
  0.8951,
  0.2664,
  -0.1614,
  -0.7502,
  1.7135,
  0.0367,
  0.0389,
  -0.0685,
  1.0296,
);
const rgbToLms = Matrix3.multiply(bradford, rgbToXyz, new Matrix3());
const lmsToRgb = Matrix3.multiply(
  xyzToRgb,
  Matrix3.inverse(bradford, new Matrix3()),
  new Matrix3(),
);

// CIE D-series daylight locus, valid from 4000 to 25000 K. See ADR-0154.
function daylightWhite(temperature, tint, result) {
  const t = 1000 / temperature;
  const x =
    temperature <= 7000
      ? ((-4.607 * t + 2.9678) * t + 0.09911) * t + 0.244063
      : ((-2.0064 * t + 1.9018) * t + 0.24748) * t + 0.23704;
  const y = -3 * x * x + 2.87 * x - 0.275 + tint * 0.02;
  result.x = x / y;
  result.y = 1;
  result.z = (1 - x - y) / y;
  return Matrix3.multiplyByVector(bradford, result, result);
}
const neutralWhite = daylightWhite(6500, 0, new Cartesian3());

function whiteBalance(effect) {
  if (effect._whiteBalanceDirty) {
    const white = daylightWhite(effect.temperature, effect.tint, effect._white);
    Cartesian3.divideComponents(neutralWhite, white, white);
    Matrix3.fromScale(white, effect._whiteBalance);
    Matrix3.multiply(effect._whiteBalance, rgbToLms, effect._whiteBalance);
    Matrix3.multiply(lmsToRgb, effect._whiteBalance, effect._whiteBalance);
    effect._whiteBalanceDirty = false;
  }
  return effect._whiteBalance;
}

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
      if (this[`_${name}`] !== value) {
        this[`_${name}`] = value;
        if (name === "temperature" || name === "tint") {
          this._whiteBalanceDirty = true;
        }
        this._scene?.requestRender();
      }
    },
  };
}

/**
 * Optional linear HDR white balance and color grading in native tone mapping.
 * The Scene owns this controller; it adds no texture, framebuffer or render pass.
 * Grading follows exposure and precedes the native tone curve and output gamma.
 * Automatic metering, bloom generation, TAA history and scene lighting are unchanged.
 * Global white balance cannot correct multiple illuminants independently.
 *
 * @alias SceneGISColorGrading
 * @constructor
 * @param {object} options Initialization options.
 * @param {Scene} options.scene A live Scene; only one controller may be attached.
 * @param {boolean} [options.enabled=false] Enable grading. Requires HDR.
 * @param {number} [options.temperature=6500] Daylight camera white temperature in kelvin, [4000, 25000]. Higher values warm the image; 6500 is neutral.
 * @param {number} [options.tint=0] Green (-1) to magenta (1) correction; 0 is neutral.
 * @param {number} [options.contrast=1] Luminance contrast about exposed linear middle gray 0.18, [0.5, 2].
 * @param {number} [options.saturation=1] Luminance-preserving saturation, [0, 2]; 0 is grayscale.
 * @throws {DeveloperError} Invalid options or another controller is attached.
 * @throws {RuntimeError} Grading is enabled without HDR.
 * @example
 * viewer.scene.highDynamicRange = true;
 * const grading = new Cesium.SceneGISColorGrading({
 *   scene: viewer.scene, enabled: true, temperature: 7500, contrast: 1.1,
 * });
 */
function SceneGISColorGrading(options) {
  const scene = options?.scene;
  if (
    !scene ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (scene.postProcessStages._sceneGISColorGrading) {
    throw new DeveloperError(
      "Only one SceneGISColorGrading may be attached to a Scene.",
    );
  }
  this._white = new Cartesian3();
  this._whiteBalance = new Matrix3();
  this.temperature = options.temperature ?? 6500;
  this.tint = options.tint ?? 0;
  this.contrast = options.contrast ?? 1;
  this.saturation = options.saturation ?? 1;
  this._scene = scene;
  this.enabled = options.enabled ?? false;
  scene.postProcessStages._sceneGISColorGrading = this;
}

Object.defineProperties(SceneGISColorGrading.prototype, {
  /**
   * Whether grading is enabled. Requires HDR; disabling restores native rendering.
   * @memberof SceneGISColorGrading.prototype
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
      if (value && !this._scene.highDynamicRange) {
        throw new RuntimeError("Color grading requires HDR.");
      }
      this._enabled = value;
      this._scene.requestRender();
    },
  },
  /**
   * Daylight camera white temperature in kelvin, [4000, 25000]. Higher warms.
   * @memberof SceneGISColorGrading.prototype
   * @type {number}
   * @default 6500
   */
  temperature: numberProperty("temperature", 4000, 25000),
  /**
   * Green (-1) to magenta (1) correction. Dimensionless, not calibrated camera tint.
   * @memberof SceneGISColorGrading.prototype
   * @type {number}
   * @default 0
   */
  tint: numberProperty("tint", -1, 1),
  /**
   * Luminance contrast about exposed linear middle gray 0.18, [0.5, 2].
   * @memberof SceneGISColorGrading.prototype
   * @type {number}
   * @default 1
   */
  contrast: numberProperty("contrast", 0.5, 2),
  /**
   * Luminance-preserving saturation, [0, 2]; zero produces grayscale.
   * @memberof SceneGISColorGrading.prototype
   * @type {number}
   * @default 1
   */
  saturation: numberProperty("saturation", 0, 2),
});

/** @returns {boolean} Whether the controller has been destroyed. */
SceneGISColorGrading.prototype.isDestroyed = function () {
  return false;
};

/**
 * Detach the controller. The next rendered frame restores the native tone shader.
 * @returns {undefined}
 */
SceneGISColorGrading.prototype.destroy = function () {
  this._scene.postProcessStages._sceneGISColorGrading = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};

/** @private */
SceneGISColorGrading._update = function (collection, useHdr) {
  const active = collection._sceneGISColorGrading?.enabled === true;
  if (active && !useHdr) {
    throw new RuntimeError("Color grading requires HDR.");
  }
  const bound = active ? collection._sceneGISColorGrading : undefined;
  const changed = bound !== collection._sceneGISColorGradingBound;
  collection._sceneGISColorGradingBound = bound;
  collection._sceneGISColorGradingActive = active;
  return changed;
};

/** @private */
SceneGISColorGrading._configureStage = function (collection, stage) {
  if (!collection._sceneGISColorGradingActive) {
    return;
  }
  const effect = collection._sceneGISColorGrading;
  // The collection calls this exactly once, before the fresh native stage's update.
  stage._fragmentShader = `#define SCENEGIS_COLOR_GRADING\n${shader}\n${stage.fragmentShader}`;
  stage.uniforms.u_sceneGISWhiteBalance = () => whiteBalance(effect);
  stage.uniforms.u_sceneGISWhiteBalanceEnabled = () =>
    effect.temperature !== 6500 || effect.tint !== 0;
  stage.uniforms.u_sceneGISContrast = () => effect.contrast;
  stage.uniforms.u_sceneGISSaturation = () => effect.saturation;
};

export default SceneGISColorGrading;

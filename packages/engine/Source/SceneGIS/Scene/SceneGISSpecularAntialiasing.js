import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import ShaderDestination from "../../Renderer/ShaderDestination.js";
import LightingModel from "../../Scene/Model/LightingModel.js";
import shader from "../../Shaders/SceneGIS/Antialiasing/SceneGISSpecularAntialiasing.js";

/**
 * Reduces geometry-driven specular aliasing in PBR Models and 3D Tiles.
 * Screen-space derivatives of the unperturbed geometry normal broaden base and
 * clearcoat highlights. Flat mirrors keep their authored roughness. This does
 * not filter normal-map variance, silhouettes, alpha coverage or unlit content.
 * Globe and Planar use the same implementation, independently of MSAA/FXAA/TAA.
 * No additional draw, texture or framebuffer is allocated. The Scene owns the
 * attached setting; explicit destruction detaches it.
 *
 * @alias SceneGISSpecularAntialiasing
 * @constructor
 * @param {object} options Initialization options.
 * @param {Scene} options.scene The live Scene; only one instance may be attached.
 * @param {boolean} [options.enabled=false] Whether geometric filtering is enabled.
 * @exception {DeveloperError} The Scene must be live and have no attached setting; enabled must be boolean.
 * @example
 * const specularAA = new Cesium.SceneGISSpecularAntialiasing({
 *   scene: viewer.scene,
 *   enabled: true,
 * });
 */
function SceneGISSpecularAntialiasing(options) {
  const scene = options?.scene;
  if (
    !defined(scene) ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed()
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (defined(scene._sceneGISSpecularAntialiasing)) {
    throw new DeveloperError(
      "Only one SceneGISSpecularAntialiasing may be attached to a Scene.",
    );
  }
  this._scene = scene;
  this.enabled = options.enabled ?? false;
  scene._sceneGISSpecularAntialiasing = this;
}

Object.defineProperties(SceneGISSpecularAntialiasing.prototype, {
  /**
   * Whether geometric specular filtering is enabled. Changes request a render
   * without rebuilding model commands. Applications using temporal effects can
   * reset their histories for an immediate comparison after material changes.
   * @memberof SceneGISSpecularAntialiasing.prototype
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
      if (value !== this._enabled) {
        this._enabled = value;
        this._scene.requestRender();
      }
    },
  },
});

/** @returns {boolean} Whether the setting has been destroyed. */
SceneGISSpecularAntialiasing.prototype.isDestroyed = function () {
  return false;
};

/**
 * Detaches the setting and restores authored material roughness.
 * @returns {undefined}
 */
SceneGISSpecularAntialiasing.prototype.destroy = function () {
  this._scene._sceneGISSpecularAntialiasing = undefined;
  this._scene.requestRender();
  this._scene = undefined;
  return destroyObject(this);
};

/** @private */
SceneGISSpecularAntialiasing._process = function (renderResources, frameState) {
  if (renderResources.lightingOptions.lightingModel !== LightingModel.PBR) {
    return;
  }
  const { shaderBuilder, uniformMap } = renderResources;
  shaderBuilder.addUniform(
    "bool",
    "u_sceneGISSpecularAntialiasing",
    ShaderDestination.FRAGMENT,
  );
  shaderBuilder.addFragmentLines(shader);
  uniformMap.u_sceneGISSpecularAntialiasing = () =>
    frameState._sceneGISSpecularAntialiasingEnabled === true;
};

export default SceneGISSpecularAntialiasing;

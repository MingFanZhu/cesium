import defined from "../../Core/defined.js";
import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import ShaderDestination from "../../Renderer/ShaderDestination.js";
import LightingModel from "../../Scene/Model/LightingModel.js";
import shader from "../../Shaders/SceneGIS/Antialiasing/SceneGISSpecularAntialiasing.js";

/**
 * 减少 PBR 模型和 3D Tiles 由几何引起的镜面锯齿。通过未扰动几何法线的屏幕导数展宽基础层与清漆高光，平面镜保持设定粗糙度。不处理法线贴图方差、轮廓、alpha 覆盖或 unlit 内容。球面和平面共用实现，独立于 MSAA/FXAA/TAA。不增加绘制、纹理或帧缓冲。附加设置归 Scene 所有，显式销毁可解绑。
 *
 * @alias SceneGISSpecularAntialiasing
 * @constructor
 * @param {object} options 初始化选项。
 * @param {Scene} options.scene 存活的 Scene，仅可附加一个实例。
 * @param {boolean} [options.enabled=false] 是否启用几何过滤。
 * @exception {DeveloperError} Scene 须存活且没有附加设置，enabled 须为布尔值。
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
   * 是否启用几何镜面过滤。修改会请求渲染，不重建模型命令。使用时域效果的应用可在材质变化后重置历史，以便立即对比。
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

/**
 *  @returns {boolean} 设置是否已销毁。
 */
SceneGISSpecularAntialiasing.prototype.isDestroyed = function () {
  return false;
};

/**
 * 解绑设置并恢复设定材质粗糙度。
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

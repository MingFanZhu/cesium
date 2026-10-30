import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SceneMode from "../../Scene/SceneMode.js";
import LightTiles from "./_private/_SceneGISLightTiles.js";
import SceneGISPointLight from "./SceneGISPointLight.js";
import SceneGISRectAreaLight from "./SceneGISRectAreaLight.js";

/**
 * 绑定到单个 WebGL2 Scene 的分块局部光源集合，可在 Scene.light 之外添加最多 256 个局部光，不替换日月光源或其阴影。SCENE3D 下的受光 PBR 模型/3D Tiles、Phong 图元和球面/平面受光地形可接收；不改变 unlit 材质或自定义光照着色器。局部光不投影、不照亮参与介质，也不提供 GI；原生自发光材质与泛光独立。
 *
 * 集合归 Scene 所有，在 Context 前销毁；显式提前 destroy 会解除绑定。光源描述对象仅借用，不会被销毁。集合拥有共享 GPU 光源表，不增加几何绘制通道。
 *
 * @alias SceneGISLightCollection
 * @constructor
 * @param {object} options 包含以下属性的对象。
 * @param {Scene} options.scene 要附加的 Scene，仅允许一个存活集合。
 * @param {boolean} [options.show=true] 局部光是否参与受光。
 * @exception {DeveloperError} 要求存活的 SCENE3D Scene，且未附加其他光源集合。
 * @example
 * const lights = new Cesium.SceneGISLightCollection({ scene: viewer.scene });
 * lights.add(new Cesium.SceneGISPointLight({
 *   position: Cesium.Cartesian3.fromDegrees(-75.6, 40.0, 10),
 *   color: new Cesium.Color(1.0, 0.65, 0.3), intensity: 500, range: 40
 * }));
 */
function SceneGISLightCollection(options = Frozen.EMPTY_OBJECT) {
  const scene = options.scene;
  if (
    !scene ||
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed() ||
    scene.mode !== SceneMode.SCENE3D ||
    scene._sceneGISLights
  ) {
    throw new DeveloperError(
      "A live SCENE3D Scene with no light collection is required.",
    );
  }
  this._scene = scene;
  this._lights = [];
  this._state = undefined;
  // Private street diagnostic: compare candidates with the complete GPU light table.
  this._tiled = true;
  /**
   * 局部光是否参与受光；按需渲染模式修改后须请求一帧。
   * @type {boolean}
   * @default true
   */
  this.show = options.show ?? true;
  if (typeof this.show !== "boolean") {
    throw new DeveloperError("show must be a boolean.");
  }
  scene._sceneGISLights = this;
  scene.requestRender();
}

/**
 *  集合中最多的描述对象数，包含隐藏光源。
 * @type {number}
 * @readonly
 */
SceneGISLightCollection.MAXIMUM_LIGHTS = LightTiles.maximumLights;

Object.defineProperties(SceneGISLightCollection.prototype, {
  /**
   * 借用的光源描述对象数量。
   * @memberof SceneGISLightCollection.prototype
   * @type {number}
   * @readonly
   */
  length: {
    get() {
      return this._lights.length;
    },
  },
});

/**
 * 添加描述对象；重复添加同一实例时直接返回，不重复保存。
 * @param {SceneGISPointLight|SceneGISSpotLight|SceneGISRectAreaLight} light 要借用的光源。
 * @returns {SceneGISPointLight|SceneGISSpotLight|SceneGISRectAreaLight} 传入的光源。
 * @exception {DeveloperError} 必须支持此光源类型，且未超过容量。
 */
SceneGISLightCollection.prototype.add = function (light) {
  if (
    !(light instanceof SceneGISPointLight) &&
    !(light instanceof SceneGISRectAreaLight)
  ) {
    throw new DeveloperError(
      "light must be a SceneGISPointLight, SceneGISSpotLight or SceneGISRectAreaLight.",
    );
  }
  if (this.contains(light)) {
    return light;
  }
  if (this.length === SceneGISLightCollection.MAXIMUM_LIGHTS) {
    throw new DeveloperError("A collection supports at most 256 local lights.");
  }
  this._lights.push(light);
  this._scene.requestRender();
  return light;
};

/**
 *  @param {SceneGISPointLight|SceneGISSpotLight|SceneGISRectAreaLight} light 要移除的光源。
 * @returns {boolean} 是否已移除。
 */
SceneGISLightCollection.prototype.remove = function (light) {
  const index = this._lights.indexOf(light);
  if (index === -1) {
    return false;
  }
  this._lights.splice(index, 1);
  this._scene.requestRender();
  return true;
};
/**
 *  移除全部借用光源，不销毁它们。
 */
SceneGISLightCollection.prototype.removeAll = function () {
  this._lights.length = 0;
  this._scene.requestRender();
};
/**
 *  @param {SceneGISPointLight|SceneGISSpotLight|SceneGISRectAreaLight} light 要查找的光源。
 * @returns {boolean} 集合是否包含此光源。
 */
SceneGISLightCollection.prototype.contains = function (light) {
  return this._lights.includes(light);
};
/**
 *  @param {number} index [0,length) 内的整数。
 * @returns {SceneGISPointLight|SceneGISSpotLight|SceneGISRectAreaLight} 指定索引处的光源。
 */
SceneGISLightCollection.prototype.get = function (index) {
  if (!Number.isInteger(index) || index < 0 || index >= this.length) {
    throw new DeveloperError("index must be an integer in [0, length).");
  }
  return this._lights[index];
};
/**
 *  @returns {boolean} 集合是否已销毁。
 */
SceneGISLightCollection.prototype.isDestroyed = function () {
  return false;
};
/**
 *  解绑集合并释放 CPU 引用与 GPU 表，光源描述对象仍可使用。
 * @returns {undefined}
 */
SceneGISLightCollection.prototype.destroy = function () {
  this._state?.tiles?.destroy();
  this.removeAll();
  this._scene._sceneGISLights = undefined;
  this._scene = this._state = undefined;
  return destroyObject(this);
};

export default SceneGISLightCollection;

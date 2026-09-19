import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISPointLight from "./SceneGISPointLight.js";

/**
 * A bounded forward-light collection attached to one Scene. Adds up to 16 local
 * lights alongside Scene.light, without replacing the Sun/Moon or its shadows.
 * Receivers are lit PBR models/3D Tiles, Phong primitives and lit Globe/Planar
 * terrain in SCENE3D. Unlit materials and custom lighting shaders are unchanged.
 * Local lights do not cast shadows, illuminate participating media, or provide GI.
 * Native emissive materials and bloom remain independent of these light sources.
 *
 * The Scene owns this collection and destroys it before its Context. Explicit
 * destroy detaches it early. Light descriptors are borrowed, never destroyed.
 * No textures, framebuffers or extra geometry passes are allocated.
 *
 * @alias SceneGISLightCollection
 * @constructor
 * @param {object} options Object with the following properties.
 * @param {Scene} options.scene The Scene to attach to; only one live collection is allowed.
 * @param {boolean} [options.show=true] Whether local lights contribute.
 * @exception {DeveloperError} A live SCENE3D Scene without another light collection is required.
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
  /**
   * Whether local lighting contributes. Request a frame after editing in request-render mode.
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

/** Maximum number of descriptors in a collection, including hidden lights.
 * @type {number}
 * @readonly
 */
SceneGISLightCollection.MAXIMUM_LIGHTS = 16;

Object.defineProperties(SceneGISLightCollection.prototype, {
  /**
   * The number of borrowed light descriptors.
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
 * Adds a descriptor; adding the same instance again returns it without duplication.
 * @param {SceneGISPointLight|SceneGISSpotLight} light The light to borrow.
 * @returns {SceneGISPointLight|SceneGISSpotLight} The supplied light.
 * @exception {DeveloperError} The light type must be supported and capacity must not be exceeded.
 */
SceneGISLightCollection.prototype.add = function (light) {
  if (!(light instanceof SceneGISPointLight)) {
    throw new DeveloperError(
      "light must be a SceneGISPointLight or SceneGISSpotLight.",
    );
  }
  if (this.contains(light)) {
    return light;
  }
  if (this.length === 16) {
    throw new DeveloperError("A collection supports at most 16 local lights.");
  }
  this._lights.push(light);
  this._scene.requestRender();
  return light;
};

/** @param {SceneGISPointLight|SceneGISSpotLight} light The light to remove.
 * @returns {boolean} Whether it was removed. */
SceneGISLightCollection.prototype.remove = function (light) {
  const index = this._lights.indexOf(light);
  if (index === -1) {
    return false;
  }
  this._lights.splice(index, 1);
  this._scene.requestRender();
  return true;
};
/** Removes all borrowed lights without destroying them. */
SceneGISLightCollection.prototype.removeAll = function () {
  this._lights.length = 0;
  this._scene.requestRender();
};
/** @param {SceneGISPointLight|SceneGISSpotLight} light The light to find.
 * @returns {boolean} Whether the collection contains the light. */
SceneGISLightCollection.prototype.contains = function (light) {
  return this._lights.includes(light);
};
/** @param {number} index An integer in [0, length).
 * @returns {SceneGISPointLight|SceneGISSpotLight} The light at the index. */
SceneGISLightCollection.prototype.get = function (index) {
  if (!Number.isInteger(index) || index < 0 || index >= this.length) {
    throw new DeveloperError("index must be an integer in [0, length).");
  }
  return this._lights[index];
};
/** @returns {boolean} Whether the collection has been destroyed. */
SceneGISLightCollection.prototype.isDestroyed = function () {
  return false;
};
/** Detaches the collection and releases its CPU references. Light descriptors remain usable.
 * @returns {undefined} */
SceneGISLightCollection.prototype.destroy = function () {
  this.removeAll();
  this._scene._sceneGISLights = undefined;
  this._scene = this._state = undefined;
  return destroyObject(this);
};

export default SceneGISLightCollection;

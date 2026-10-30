import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Frozen from "../../Core/Frozen.js";
import SceneGISPlanarTilingScheme from "../Core/SceneGISPlanarTilingScheme.js";
import SceneGISPlanarImageryLayer from "./SceneGISPlanarImageryLayer.js";
import { validateImageryProvider } from "./_private/_SceneGISPlanarImagery.js";

function validateIndex(index, maximum, name) {
  if (!Number.isInteger(index) || index < 0 || index > maximum) {
    throw new DeveloperError(`${name} is out of range.`);
  }
}

/**
 * 从下到上排序的平面影像图层集合。集合拥有已挂载图层，不拥有图层的影像提供者。
 *
 * @alias SceneGISPlanarImageryLayerCollection
 * @constructor
 *
 * @param {object} options 包含以下属性的对象：
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme 全部提供者必须使用的同一切片方案。
 * @exception {DeveloperError} 切片方案无效。
 */
function SceneGISPlanarImageryLayerCollection(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  if (!(options.tilingScheme instanceof SceneGISPlanarTilingScheme)) {
    throw new DeveloperError(
      "options.tilingScheme must be a SceneGISPlanarTilingScheme.",
    );
  }
  this._tilingScheme = options.tilingScheme;
  this._layers = [];
  this._changeListener = undefined;
  this._owner = undefined;
}

Object.defineProperties(SceneGISPlanarImageryLayerCollection.prototype, {
  /**
   * 获取每个图层提供者必须使用的同一切片方案。
   * @memberof SceneGISPlanarImageryLayerCollection.prototype
   * @type {SceneGISPlanarTilingScheme}
   * @readonly
   */
  tilingScheme: {
    get: function () {
      return this._tilingScheme;
    },
  },
  /**
   * 获取图层数量。
   * @memberof SceneGISPlanarImageryLayerCollection.prototype
   * @type {number}
   * @readonly
   */
  length: {
    get: function () {
      return this._layers.length;
    },
  },
});

SceneGISPlanarImageryLayerCollection.prototype._notify = function (
  type,
  layer,
  property,
) {
  this._changeListener?.(type, layer, property);
};

/**
 * 获取指定索引处的图层。
 * @param {number} index 已有图层索引。
 * @returns {SceneGISPlanarImageryLayer} 图层。
 * @exception {DeveloperError} 索引无效。
 */
SceneGISPlanarImageryLayerCollection.prototype.get = function (index) {
  validateIndex(index, this._layers.length - 1, "index");
  return this._layers[index];
};

/**
 * 判断集合是否包含图层。
 * @param {SceneGISPlanarImageryLayer} layer 要测试的图层。
 * @returns {boolean} 图层存在时为 True。
 */
SceneGISPlanarImageryLayerCollection.prototype.contains = function (layer) {
  return this._layers.includes(layer);
};

/**
 * 在可选的自下而上索引处添加已脱离集合的图层。
 * @param {SceneGISPlanarImageryLayer} layer 存活且已脱离集合的图层。
 * @param {number} [index=this.length] 插入索引。
 * @returns {SceneGISPlanarImageryLayer} 已添加的图层。
 * @exception {DeveloperError} 图层、提供者、切片方案或索引无效。
 */
SceneGISPlanarImageryLayerCollection.prototype.add = function (layer, index) {
  if (!(layer instanceof SceneGISPlanarImageryLayer) || layer.isDestroyed()) {
    throw new DeveloperError(
      "layer must be a live SceneGISPlanarImageryLayer.",
    );
  }
  validateImageryProvider(layer.imageryProvider);
  if (layer._collection !== undefined) {
    throw new DeveloperError("layer is already attached to a collection.");
  }
  if (layer.imageryProvider.tilingScheme !== this._tilingScheme) {
    throw new DeveloperError(
      "layer.imageryProvider.tilingScheme must be this collection's tilingScheme.",
    );
  }
  index = index ?? this._layers.length;
  validateIndex(index, this._layers.length, "index");
  this._layers.splice(index, 0, layer);
  layer._collection = this;
  layer._changeListener = (changedLayer, property) =>
    this._notify("changed", changedLayer, property);
  this._notify("added", layer);
  return layer;
};

/**
 * 为满足结构契约的提供者创建并添加图层。
 * @param {SceneGISPlanarImageryProvider} provider 影像提供者。
 * @param {number} [index=this.length] 插入索引。
 * @returns {SceneGISPlanarImageryLayer} 已添加的图层。
 * @exception {DeveloperError} 提供者、插入索引或标准切片方案对象身份无效。
 */
SceneGISPlanarImageryLayerCollection.prototype.addImageryProvider = function (
  provider,
  index,
) {
  return this.add(new SceneGISPlanarImageryLayer(provider), index);
};

/**
 * 移除图层并可选地销毁，始终不销毁提供者。
 * @param {SceneGISPlanarImageryLayer} layer 要移除的图层。
 * @param {boolean} [destroy=true] 是否销毁脱离集合后的图层。
 * @returns {boolean} 图层被移除时为 True。
 * @exception {DeveloperError} <code>destroy</code> 不是布尔值。
 */
SceneGISPlanarImageryLayerCollection.prototype.remove = function (
  layer,
  destroy,
) {
  destroy = destroy ?? true;
  if (typeof destroy !== "boolean") {
    throw new DeveloperError("destroy must be a boolean.");
  }
  const index = this._layers.indexOf(layer);
  if (index === -1) {
    return false;
  }
  this._layers.splice(index, 1);
  layer._collection = undefined;
  layer._changeListener = undefined;
  this._notify("removed", layer);
  if (destroy && !layer.isDestroyed()) {
    layer.destroy();
  }
  return true;
};

/**
 * 移除全部图层，并可选地销毁它们。
 * @param {boolean} [destroy=true] 是否销毁脱离集合后的各图层。
 * @returns {void}
 * @exception {DeveloperError} <code>destroy</code> 不是布尔值。
 */
SceneGISPlanarImageryLayerCollection.prototype.removeAll = function (destroy) {
  destroy = destroy ?? true;
  if (typeof destroy !== "boolean") {
    throw new DeveloperError("destroy must be a boolean.");
  }
  const layers = this._layers.slice();
  for (const layer of layers) {
    this.remove(layer, destroy);
  }
};

function reorder(collection, layer, target) {
  const index = collection._layers.indexOf(layer);
  if (index === -1) {
    throw new DeveloperError("layer is not in this collection.");
  }
  target = Math.max(0, Math.min(collection._layers.length - 1, target));
  if (target !== index) {
    collection._layers.splice(index, 1);
    collection._layers.splice(target, 0, layer);
    collection._notify("reordered", layer);
  }
}

/**
 * 将图层向顶部移动一位。
 * @param {SceneGISPlanarImageryLayer} layer 集合内的图层。
 * @returns {void}
 * @exception {DeveloperError} 集合中不包含此图层。
 */
SceneGISPlanarImageryLayerCollection.prototype.raise = function (layer) {
  reorder(this, layer, this._layers.indexOf(layer) + 1);
};
/**
 * 将图层向底部移动一位。
 * @param {SceneGISPlanarImageryLayer} layer 集合内的图层。
 * @returns {void}
 * @exception {DeveloperError} 集合中不包含此图层。
 */
SceneGISPlanarImageryLayerCollection.prototype.lower = function (layer) {
  reorder(this, layer, this._layers.indexOf(layer) - 1);
};
/**
 * 将图层移到顶部。
 * @param {SceneGISPlanarImageryLayer} layer 集合内的图层。
 * @returns {void}
 * @exception {DeveloperError} 集合中不包含此图层。
 */
SceneGISPlanarImageryLayerCollection.prototype.raiseToTop = function (layer) {
  reorder(this, layer, this._layers.length - 1);
};
/**
 * 将图层移到底部。
 * @param {SceneGISPlanarImageryLayer} layer 集合内的图层。
 * @returns {void}
 * @exception {DeveloperError} 集合中不包含此图层。
 */
SceneGISPlanarImageryLayerCollection.prototype.lowerToBottom = function (
  layer,
) {
  reorder(this, layer, 0);
};

/**
 * 此对象已销毁时返回 true，否则返回 false。
 * @returns {boolean} 已销毁时为 True。
 */
SceneGISPlanarImageryLayerCollection.prototype.isDestroyed = function () {
  return false;
};

/**
 * 销毁集合及其图层，不销毁提供者。
 *
 * @returns {void}
 * @exception {DeveloperError} 集合由存活的世界拥有。
 */
SceneGISPlanarImageryLayerCollection.prototype.destroy = function () {
  if (this._owner !== undefined) {
    throw new DeveloperError(
      "A world-owned imagery collection is destroyed with its world.",
    );
  }
  this.removeAll(true);
  this._changeListener = undefined;
  return destroyObject(this);
};

export default SceneGISPlanarImageryLayerCollection;

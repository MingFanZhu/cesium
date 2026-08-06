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
 * An ordered bottom-to-top collection of planar imagery layers. The
 * collection owns attached layers but never owns their imagery providers.
 *
 * @alias SceneGISPlanarImageryLayerCollection
 * @constructor
 *
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarTilingScheme} options.tilingScheme The exact tiling scheme required by every provider.
 * @exception {DeveloperError} The tiling scheme is invalid.
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
   * Gets the exact tiling scheme required by every layer provider.
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
   * Gets the number of layers.
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
) {
  this._changeListener?.(type, layer);
};

/**
 * Gets the layer at an index.
 * @param {number} index The existing layer index.
 * @returns {SceneGISPlanarImageryLayer} The layer.
 * @exception {DeveloperError} The index is invalid.
 */
SceneGISPlanarImageryLayerCollection.prototype.get = function (index) {
  validateIndex(index, this._layers.length - 1, "index");
  return this._layers[index];
};

/**
 * Determines whether this collection contains a layer.
 * @param {SceneGISPlanarImageryLayer} layer The layer to test.
 * @returns {boolean} True when the layer is present.
 */
SceneGISPlanarImageryLayerCollection.prototype.contains = function (layer) {
  return this._layers.includes(layer);
};

/**
 * Adds a detached layer at an optional bottom-to-top index.
 * @param {SceneGISPlanarImageryLayer} layer The live detached layer.
 * @param {number} [index=this.length] The insertion index.
 * @returns {SceneGISPlanarImageryLayer} The added layer.
 * @exception {DeveloperError} The layer, provider, tiling scheme, or index is invalid.
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
  layer._changeListener = () => this._notify("changed", layer);
  this._notify("added", layer);
  return layer;
};

/**
 * Creates and adds a layer for a structural provider.
 * @param {SceneGISPlanarImageryProvider} provider The imagery provider.
 * @param {number} [index=this.length] The insertion index.
 * @returns {SceneGISPlanarImageryLayer} The added layer.
 * @exception {DeveloperError} The provider, insertion index, or canonical tiling-scheme identity is invalid.
 */
SceneGISPlanarImageryLayerCollection.prototype.addImageryProvider = function (
  provider,
  index,
) {
  return this.add(new SceneGISPlanarImageryLayer(provider), index);
};

/**
 * Removes a layer and optionally destroys it. Providers are never destroyed.
 * @param {SceneGISPlanarImageryLayer} layer The layer to remove.
 * @param {boolean} [destroy=true] Whether to destroy the detached layer.
 * @returns {boolean} True when the layer was removed.
 * @exception {DeveloperError} <code>destroy</code> is not a boolean.
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
 * Removes all layers and optionally destroys them.
 * @param {boolean} [destroy=true] Whether to destroy detached layers.
 * @returns {void}
 * @exception {DeveloperError} <code>destroy</code> is not a boolean.
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
 * Moves a layer one position toward the top.
 * @param {SceneGISPlanarImageryLayer} layer The contained layer.
 * @returns {void}
 * @exception {DeveloperError} The layer is not contained.
 */
SceneGISPlanarImageryLayerCollection.prototype.raise = function (layer) {
  reorder(this, layer, this._layers.indexOf(layer) + 1);
};
/**
 * Moves a layer one position toward the bottom.
 * @param {SceneGISPlanarImageryLayer} layer The contained layer.
 * @returns {void}
 * @exception {DeveloperError} The layer is not contained.
 */
SceneGISPlanarImageryLayerCollection.prototype.lower = function (layer) {
  reorder(this, layer, this._layers.indexOf(layer) - 1);
};
/**
 * Moves a layer to the top.
 * @param {SceneGISPlanarImageryLayer} layer The contained layer.
 * @returns {void}
 * @exception {DeveloperError} The layer is not contained.
 */
SceneGISPlanarImageryLayerCollection.prototype.raiseToTop = function (layer) {
  reorder(this, layer, this._layers.length - 1);
};
/**
 * Moves a layer to the bottom.
 * @param {SceneGISPlanarImageryLayer} layer The contained layer.
 * @returns {void}
 * @exception {DeveloperError} The layer is not contained.
 */
SceneGISPlanarImageryLayerCollection.prototype.lowerToBottom = function (
  layer,
) {
  reorder(this, layer, 0);
};

/**
 * Returns true if this object was destroyed; otherwise, false.
 * @returns {boolean} True if destroyed.
 */
SceneGISPlanarImageryLayerCollection.prototype.isDestroyed = function () {
  return false;
};

/**
 * Destroys the collection and its layers without destroying providers.
 *
 * @returns {void}
 * @exception {DeveloperError} The collection is owned by a live world.
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

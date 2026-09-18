import DeveloperError from "../../../Core/DeveloperError.js";

function removeAndDestroy(collection, primitive) {
  let cleanupError;
  let contained = false;
  try {
    contained = collection.contains(primitive);
  } catch (error) {
    cleanupError = error;
  }

  if (contained) {
    try {
      collection.remove(primitive);
    } catch (error) {
      cleanupError = cleanupError ?? error;
    }
  }

  let remains = false;
  try {
    remains = collection.contains(primitive);
  } catch (error) {
    cleanupError = cleanupError ?? error;
  }

  if (!remains && !primitive.isDestroyed()) {
    try {
      primitive.destroy();
    } catch (error) {
      cleanupError = cleanupError ?? error;
    }
  }

  return cleanupError;
}

/**
 * Owns public planar primitives for one Entity visualizer candidate.
 *
 * @alias SceneGISPlanarPrimitiveOwner
 * @constructor
 * @private
 */
function SceneGISPlanarPrimitiveOwner(primitiveCollection) {
  if (
    primitiveCollection === undefined ||
    typeof primitiveCollection.add !== "function" ||
    typeof primitiveCollection.remove !== "function" ||
    typeof primitiveCollection.contains !== "function"
  ) {
    throw new DeveloperError("primitiveCollection must own primitives.");
  }
  this.primitiveCollection = primitiveCollection;
  this.primitives = [];
  this.collections = this.primitives;
  this.destroyed = false;
}

SceneGISPlanarPrimitiveOwner.prototype.add = function (primitive) {
  if (this.destroyed) {
    throw new DeveloperError("This owner was destroyed.");
  }
  this.primitives.push(primitive);
  return primitive;
};

SceneGISPlanarPrimitiveOwner.prototype.insert = function () {
  try {
    for (let i = 0; i < this.primitives.length; i++) {
      this.primitiveCollection.add(this.primitives[i]);
    }
  } catch (error) {
    try {
      this.destroy();
    } catch {
      // Preserve the original post-insertion failure.
    }
    throw error;
  }
};

SceneGISPlanarPrimitiveOwner.prototype.setShow = function (show) {
  for (let i = 0; i < this.primitives.length; i++) {
    this.primitives[i].show = show;
  }
};

SceneGISPlanarPrimitiveOwner.prototype.setShadows = function (shadows) {
  for (const primitive of this.primitives) {
    // Depth-draped classification primitives do not cast geometric shadows.
    if ("shadows" in primitive) {
      primitive.shadows = shadows;
    }
  }
};

SceneGISPlanarPrimitiveOwner.prototype.destroy = function () {
  if (this.destroyed) {
    return;
  }
  this.destroyed = true;
  let cleanupError;
  for (let i = this.primitives.length - 1; i >= 0; i--) {
    const primitiveError = removeAndDestroy(
      this.primitiveCollection,
      this.primitives[i],
    );
    cleanupError = cleanupError ?? primitiveError;
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
};

export default SceneGISPlanarPrimitiveOwner;

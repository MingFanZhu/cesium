import BufferPolygonCollection from "../../../Scene/BufferPolygonCollection.js";
import BufferPolylineCollection from "../../../Scene/BufferPolylineCollection.js";
import ComponentDatatype from "../../../Core/ComponentDatatype.js";

function destroyCollection(collection) {
  collection.destroy();
}

function removeAndDestroyCollection(primitives, collection) {
  let cleanupError;
  let contained = false;
  try {
    contained = primitives.contains(collection);
  } catch (error) {
    cleanupError = error;
  }
  if (contained) {
    try {
      primitives.remove(collection);
    } catch (error) {
      cleanupError = cleanupError ?? error;
    }
  }
  let remainsInScene = false;
  try {
    remainsInScene = primitives.contains(collection);
  } catch (error) {
    cleanupError = cleanupError ?? error;
  }
  const destroyedByRemoval =
    contained && !remainsInScene && primitives.destroyPrimitives;
  if (!destroyedByRemoval) {
    try {
      destroyCollection(collection);
    } catch (error) {
      cleanupError = cleanupError ?? error;
    }
  }
  return cleanupError;
}

/**
 * Owns the experimental buffer collections for one planar Entity graphic.
 *
 * @alias SceneGISPlanarBufferOwner
 * @constructor
 * @private
 */
function SceneGISPlanarBufferOwner(scene, entity) {
  this.scene = scene;
  this.entity = entity;
  this.collections = [];
  this.destroyed = false;
}

SceneGISPlanarBufferOwner.prototype.addPolylineCollection = function (options) {
  const collection = new BufferPolylineCollection({
    primitiveCountMax: options.primitives.length,
    vertexCountMax: options.vertexCount,
    positionDatatype: ComponentDatatype.DOUBLE,
    modelMatrix: options.modelMatrix,
    boundingVolume: options.boundingVolume,
    allowPicking: true,
    blendOption: options.blendOption,
  });
  const primitives = new Array(options.primitives.length);
  for (let i = 0; i < options.primitives.length; i++) {
    const primitiveOptions = options.primitives[i];
    primitives[i] = collection.add({
      positions: primitiveOptions.positions,
      material: primitiveOptions.material,
      pickObject: { id: this.entity, primitive: this },
    });
  }
  this.collections.push(collection);
  return { collection, primitives };
};

SceneGISPlanarBufferOwner.prototype.addPolygonCollection = function (options) {
  const collection = new BufferPolygonCollection({
    primitiveCountMax: 1,
    vertexCountMax: options.positions.length / 3,
    holeCountMax: options.holes.length,
    triangleCountMax: options.triangles.length / 3,
    positionDatatype: ComponentDatatype.DOUBLE,
    modelMatrix: options.modelMatrix,
    boundingVolume: options.boundingVolume,
    allowPicking: true,
    blendOption: options.blendOption,
  });
  const primitive = collection.add({
    positions: options.positions,
    holes: options.holes,
    triangles: options.triangles,
    material: options.material,
    pickObject: { id: this.entity, primitive: this },
  });
  this.collections.push(collection);
  return { collection, primitive };
};

SceneGISPlanarBufferOwner.prototype.insert = function () {
  try {
    for (let i = 0; i < this.collections.length; i++) {
      this.scene.primitives.add(this.collections[i]);
    }
  } catch (error) {
    try {
      this.destroy();
    } catch {
      // Preserve the original insertion failure after best-effort cleanup.
    }
    throw error;
  }
};

SceneGISPlanarBufferOwner.prototype.setShow = function (show) {
  for (let i = 0; i < this.collections.length; i++) {
    if (this.collections[i].show !== show) {
      this.collections[i].show = show;
    }
  }
};

SceneGISPlanarBufferOwner.prototype.destroy = function () {
  if (this.destroyed) {
    return;
  }
  this.destroyed = true;
  let cleanupError;
  for (let i = this.collections.length - 1; i >= 0; i--) {
    const collectionError = removeAndDestroyCollection(
      this.scene.primitives,
      this.collections[i],
    );
    cleanupError = cleanupError ?? collectionError;
  }
  if (cleanupError !== undefined) {
    throw cleanupError;
  }
};

export default SceneGISPlanarBufferOwner;

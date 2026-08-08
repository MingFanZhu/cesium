import ArcType from "../../../Core/ArcType.js";
import AssociativeArray from "../../../Core/AssociativeArray.js";
import BlendOption from "../../../Scene/BlendOption.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import BufferPolylineMaterial from "../../../Scene/BufferPolylineMaterial.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import ColorMaterialProperty from "../../../DataSources/ColorMaterialProperty.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import HeightReference from "../../../Scene/HeightReference.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Property from "../../../DataSources/Property.js";
import ShadowMode from "../../../Scene/ShadowMode.js";
import destroyObject from "../../../Core/destroyObject.js";
import SceneGISPlanarBufferOwner from "./_SceneGISPlanarBufferOwner.js";
import SceneGISPlanarPositionResolver from "./_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

const scratchColor = new Color();
const scratchResolved = new Cartesian3();

function value(property, time, defaultValue, result) {
  return Property.getValueOrDefault(property, time, defaultValue, result);
}

function optional(property, time, result) {
  return Property.getValueOrUndefined(property, time, result);
}

function validateUnsupported(graphic, time) {
  if (optional(graphic._granularity, time) !== undefined) {
    throw new DeveloperError("granularity is not supported.");
  }
  if (optional(graphic._depthFailMaterial, time) !== undefined) {
    throw new DeveloperError("depthFailMaterial is not supported.");
  }
  const arcType = optional(graphic._arcType, time);
  if (arcType !== undefined && arcType !== ArcType.NONE) {
    throw new DeveloperError("arcType must be ArcType.NONE when defined.");
  }
  const shadows = optional(graphic._shadows, time);
  if (shadows !== undefined && shadows !== ShadowMode.DISABLED) {
    throw new DeveloperError("shadows must be ShadowMode.DISABLED.");
  }
  const unsupportedProperties = [
    ["distanceDisplayCondition", graphic._distanceDisplayCondition],
    ["classificationType", graphic._classificationType],
    ["zIndex", graphic._zIndex],
  ];
  for (let i = 0; i < unsupportedProperties.length; i++) {
    const [name, property] = unsupportedProperties[i];
    if (optional(property, time) !== undefined) {
      throw new DeveloperError(`${name} is not supported.`);
    }
  }
}

function getColor(graphic, time) {
  const material = graphic._material;
  if (material === undefined) {
    return Color.clone(Color.WHITE);
  }
  if (!(material instanceof ColorMaterialProperty)) {
    throw new DeveloperError("material must be a ColorMaterialProperty.");
  }
  const color = Color.clone(
    value(material.color, time, Color.WHITE, scratchColor),
  );
  if (
    !Number.isFinite(color.red) ||
    !Number.isFinite(color.green) ||
    !Number.isFinite(color.blue) ||
    !Number.isFinite(color.alpha)
  ) {
    throw new DeveloperError("material color components must be finite.");
  }
  return color;
}

function computeState(visualizer, item, time) {
  const entity = item.entity;
  const graphic = entity._polyline;
  validateUnsupported(graphic, time);
  const width = value(graphic._width, time, 1.0);
  if (!Number.isInteger(width) || width < 0 || width > 255) {
    throw new DeveloperError("width must be an integer between 0 and 255.");
  }
  const color = getColor(graphic, time);
  const positions = optional(graphic._positions, time);
  if (positions === undefined) {
    return { missing: true };
  }
  if (!Array.isArray(positions) || positions.length < 2) {
    throw new DeveloperError("positions must contain at least two positions.");
  }
  const clampToGround = value(graphic._clampToGround, time, false);
  if (typeof clampToGround !== "boolean") {
    throw new DeveloperError("clampToGround must be boolean.");
  }
  const resolved = new Array(positions.length);
  let outside = false;
  for (let i = 0; i < positions.length; i++) {
    const result = SceneGISPlanarPositionResolver.resolve(
      visualizer._world,
      positions[i],
      clampToGround ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE,
      scratchResolved,
    );
    if (result === undefined) {
      outside = true;
    } else {
      resolved[i] = Cartesian3.clone(result);
    }
  }
  const shown =
    entity.isShowing &&
    entity.isAvailable(time) &&
    value(graphic._show, time, true) &&
    width > 0.0 &&
    !outside;
  if (!shown) {
    return { shown: false };
  }

  const origin = new Cartesian3(resolved[0].x, resolved[0].y, 0.0);
  const localPositions = new Float64Array(resolved.length * 3);
  for (let i = 0; i < resolved.length; i++) {
    const position = resolved[i];
    localPositions[i * 3] = position.x - origin.x;
    localPositions[i * 3 + 1] = position.y - origin.y;
    localPositions[i * 3 + 2] = position.z;
  }
  const boundingSphere = BoundingSphere.fromPoints(resolved);
  if (
    !Number.isFinite(boundingSphere.center.x) ||
    !Number.isFinite(boundingSphere.center.y) ||
    !Number.isFinite(boundingSphere.center.z) ||
    !Number.isFinite(boundingSphere.radius)
  ) {
    throw new DeveloperError("The derived bounding sphere must be finite.");
  }
  const blendOption =
    color.alpha === 1.0 ? BlendOption.OPAQUE : BlendOption.TRANSLUCENT;
  return {
    shown: true,
    origin,
    modelMatrix: Matrix4.fromTranslation(origin),
    localPositions,
    boundingSphere,
    material: new BufferPolylineMaterial({ color, width }),
    blendOption,
    signature: `${resolved.length}|${blendOption}|${origin.x}|${origin.y}`,
  };
}

function createOwner(visualizer, item, state) {
  const owner = new SceneGISPlanarBufferOwner(
    visualizer._scene,
    item.entity,
    visualizer._primitives,
  );
  try {
    const render = owner.addPolylineCollection({
      primitives: [
        { positions: state.localPositions, material: state.material },
      ],
      vertexCount: state.localPositions.length / 3,
      modelMatrix: state.modelMatrix,
      boundingVolume: state.boundingSphere,
      blendOption: state.blendOption,
    });
    owner.collection = render.collection;
    owner.primitive = render.primitives[0];
    owner.signature = state.signature;
    owner.appliedPositions = state.localPositions.slice();
    owner.appliedMaterialKey = `${state.material.color.toRgba()}|${state.material.width}`;
    owner.boundingSphere = BoundingSphere.clone(state.boundingSphere);
    owner.shown = true;
    return owner;
  } catch (error) {
    owner.destroy();
    throw error;
  }
}

function arrayEquals(left, right) {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function boundingSphereEquals(left, right) {
  return (
    Cartesian3.equals(left.center, right.center) && left.radius === right.radius
  );
}

function applyState(owner, state) {
  if (!arrayEquals(owner.appliedPositions, state.localPositions)) {
    owner.primitive.setPositions(state.localPositions);
    owner.appliedPositions = state.localPositions.slice();
  }
  const materialKey = `${state.material.color.toRgba()}|${state.material.width}`;
  if (owner.appliedMaterialKey !== materialKey) {
    owner.primitive.setMaterial(state.material);
    owner.appliedMaterialKey = materialKey;
  }
  if (!boundingSphereEquals(owner.boundingSphere, state.boundingSphere)) {
    BoundingSphere.clone(
      state.boundingSphere,
      owner.collection._boundingVolume,
    );
    BoundingSphere.clone(state.boundingSphere, owner.boundingSphere);
  }
  if (!owner.primitive.show) {
    owner.primitive.show = true;
  }
  owner.setShow(true);
  owner.shown = true;
}

function releaseOwner(item) {
  if (item.owner !== undefined) {
    item.owner.destroy();
    item.owner = undefined;
  }
}

/**
 * Visualizes planar straight PolylineGraphics with experimental buffer storage.
 *
 * @alias SceneGISPlanarPolylineVisualizer
 * @constructor
 * @private
 */
function SceneGISPlanarPolylineVisualizer(
  world,
  scene,
  entityCollection,
  primitiveCollection,
) {
  if (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed()) {
    throw new DeveloperError("world must be a live SceneGISPlanarWorld.");
  }
  if (scene === undefined || scene.isDestroyed?.() === true) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (!(entityCollection instanceof EntityCollection)) {
    throw new DeveloperError("entityCollection is required.");
  }
  this._world = world;
  this._scene = scene;
  this._primitives = primitiveCollection ?? scene.primitives;
  if (
    typeof this._primitives.add !== "function" ||
    typeof this._primitives.remove !== "function" ||
    typeof this._primitives.contains !== "function"
  ) {
    throw new DeveloperError("primitiveCollection must own primitives.");
  }
  this._entityCollection = entityCollection;
  this._items = new AssociativeArray();
  entityCollection.collectionChanged.addEventListener(
    SceneGISPlanarPolylineVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(entityCollection, entityCollection.values, [], []);
}

SceneGISPlanarPolylineVisualizer.prototype.update = function (time) {
  if (time === undefined) {
    throw new DeveloperError("time is required.");
  }
  const items = this._items.values;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const state = computeState(this, item, time);
    if (state.missing) {
      releaseOwner(item);
      continue;
    }
    if (!state.shown) {
      item.owner?.setShow(false);
      if (item.owner !== undefined) {
        item.owner.shown = false;
      }
      continue;
    }
    if (item.owner !== undefined && item.owner.signature === state.signature) {
      applyState(item.owner, state);
      continue;
    }
    const candidate = createOwner(this, item, state);
    candidate.insert();
    releaseOwner(item);
    item.owner = candidate;
  }
  return true;
};

SceneGISPlanarPolylineVisualizer.prototype.getBoundingSphere = function (
  entity,
  result,
) {
  if (entity === undefined || result === undefined) {
    throw new DeveloperError("entity and result are required.");
  }
  const owner = this._items.get(entity.id)?.owner;
  if (owner === undefined || !owner.shown) {
    return BoundingSphereState.FAILED;
  }
  BoundingSphere.clone(owner.boundingSphere, result);
  return BoundingSphereState.DONE;
};

SceneGISPlanarPolylineVisualizer.prototype.isDestroyed = function () {
  return false;
};

SceneGISPlanarPolylineVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    SceneGISPlanarPolylineVisualizer.prototype._onCollectionChanged,
    this,
  );
  const items = this._items.values;
  for (let i = items.length - 1; i >= 0; i--) {
    releaseOwner(items[i]);
  }
  this._items.removeAll();
  return destroyObject(this);
};

SceneGISPlanarPolylineVisualizer.prototype._onCollectionChanged = function (
  entityCollection,
  added,
  removed,
  changed,
) {
  const add = (entity) => {
    if (entity._polyline !== undefined && !this._items.contains(entity.id)) {
      this._items.set(entity.id, { entity, owner: undefined });
    }
  };
  const remove = (entity) => {
    const item = this._items.get(entity.id);
    if (item !== undefined) {
      releaseOwner(item);
      this._items.remove(entity.id);
    }
  };
  for (let i = added.length - 1; i >= 0; i--) {
    add(added[i]);
  }
  for (let i = changed.length - 1; i >= 0; i--) {
    if (changed[i]._polyline !== undefined) {
      add(changed[i]);
    } else {
      remove(changed[i]);
    }
  }
  for (let i = removed.length - 1; i >= 0; i--) {
    remove(removed[i]);
  }
};

export default SceneGISPlanarPolylineVisualizer;

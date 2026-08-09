import AssociativeArray from "../../../Core/AssociativeArray.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import DistanceDisplayConditionGeometryInstanceAttribute from "../../../Core/DistanceDisplayConditionGeometryInstanceAttribute.js";
import JulianDate from "../../../Core/JulianDate.js";
import destroyObject from "../../../Core/destroyObject.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import ColorMaterialProperty from "../../../DataSources/ColorMaterialProperty.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import PathMode from "../../../DataSources/PathMode.js";
import Property from "../../../DataSources/Property.js";
import Material from "../../../Scene/Material.js";
import PolylineMaterialAppearance from "../../../Scene/PolylineMaterialAppearance.js";
import SceneGISPlanarPolylineGeometry from "../../Core/SceneGISPlanarPolylineGeometry.js";
import SceneGISPlanarPrimitive from "../../Scene/SceneGISPlanarPrimitive.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";
import SceneGISPlanarPathSampler from "./_SceneGISPlanarPathSampler.js";
import SceneGISPlanarPositionResolver from "./_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarPrimitiveOwner from "./_SceneGISPlanarPrimitiveOwner.js";
import HeightReference from "../../../Scene/HeightReference.js";

const scratchColor = new Color();
const scratchPosition = new Cartesian3();

function value(property, time, defaultValue, result) {
  return Property.getValueOrDefault(property, time, defaultValue, result);
}
function optional(property, time, result) {
  return Property.getValueOrUndefined(property, time, result);
}
function computeInterval(entity, graphic, time) {
  const lead = optional(graphic._leadTime, time);
  const trail = optional(graphic._trailTime, time);
  if (
    (lead !== undefined && (!Number.isFinite(lead) || lead < 0.0)) ||
    (trail !== undefined && (!Number.isFinite(trail) || trail < 0.0))
  ) {
    throw new DeveloperError(
      "leadTime and trailTime must be finite and nonnegative.",
    );
  }
  const availability = entity.availability;
  if (
    availability === undefined &&
    (lead === undefined || trail === undefined)
  ) {
    throw new DeveloperError(
      "A path without availability requires leadTime and trailTime.",
    );
  }
  let start = availability?.start;
  let stop = availability?.stop;
  if (trail !== undefined) {
    const candidate = JulianDate.addSeconds(time, -trail, new JulianDate());
    if (start === undefined || JulianDate.compare(candidate, start) > 0) {
      start = candidate;
    }
  }
  if (lead !== undefined) {
    const candidate = JulianDate.addSeconds(time, lead, new JulianDate());
    if (stop === undefined || JulianDate.compare(candidate, stop) < 0) {
      stop = candidate;
    }
  }
  return start !== undefined &&
    stop !== undefined &&
    JulianDate.compare(start, stop) < 0
    ? { start: JulianDate.clone(start), stop: JulianDate.clone(stop) }
    : undefined;
}
function computeState(visualizer, item, time) {
  const entity = item.entity;
  const graphic = entity._path;
  if (graphic === undefined || entity._position === undefined) {
    return { missing: true };
  }
  const relativeTo = optional(graphic._relativeTo, time);
  if (relativeTo !== undefined && relativeTo !== "FIXED") {
    throw new DeveloperError("relativeTo must be FIXED when defined.");
  }
  const materialMode = optional(graphic._materialMode, time);
  if (materialMode !== undefined && materialMode !== PathMode.WHOLE) {
    throw new DeveloperError(
      "materialMode must be PathMode.WHOLE when defined.",
    );
  }
  const width = value(graphic._width, time, 1.0);
  const resolution = value(graphic._resolution, time, 60.0);
  if (!Number.isFinite(width) || width < 0.0) {
    throw new DeveloperError("width must be finite and nonnegative.");
  }
  const interval = computeInterval(entity, graphic, time);
  if (interval === undefined) {
    return { shown: false };
  }
  const sampled = SceneGISPlanarPathSampler.sample(
    entity._position,
    interval.start,
    interval.stop,
    time,
    resolution,
    item.sampled,
  );
  const positions = [];
  for (let i = 0; i < sampled.length; i++) {
    const resolved = SceneGISPlanarPositionResolver.resolve(
      visualizer._world,
      sampled[i],
      HeightReference.NONE,
      scratchPosition,
    );
    if (resolved === undefined) {
      return { shown: false };
    }
    if (
      positions.length === 0 ||
      !Cartesian3.equals(positions[positions.length - 1], resolved)
    ) {
      positions.push(Cartesian3.clone(resolved));
    }
  }
  let color;
  if (graphic._material === undefined) {
    color = Color.clone(Color.WHITE);
  } else {
    if (!(graphic._material instanceof ColorMaterialProperty)) {
      throw new DeveloperError("material must be a ColorMaterialProperty.");
    }
    color = Color.clone(
      value(graphic._material._color, time, Color.WHITE, scratchColor),
    );
  }
  if (
    !Number.isFinite(color.red) ||
    !Number.isFinite(color.green) ||
    !Number.isFinite(color.blue) ||
    !Number.isFinite(color.alpha)
  ) {
    throw new DeveloperError("material color must be finite.");
  }
  const condition = optional(graphic._distanceDisplayCondition, time);
  if (
    condition !== undefined &&
    (!Number.isFinite(condition.near) ||
      !Number.isFinite(condition.far) ||
      condition.near < 0.0 ||
      condition.far <= condition.near)
  ) {
    throw new DeveloperError(
      "distanceDisplayCondition must have ordered finite bounds.",
    );
  }
  const shown =
    entity.isShowing &&
    entity.isAvailable(time) &&
    value(graphic._show, time, true) &&
    width > 0.0 &&
    color.alpha > 0.0 &&
    positions.length >= 2;
  if (!shown) {
    return { shown: false };
  }
  return {
    shown: true,
    positions,
    width,
    color,
    condition:
      condition === undefined
        ? undefined
        : { near: condition.near, far: condition.far },
    signature: `${positions.map((position) => `${position.x},${position.y},${position.z}`).join(";")}|${width}|${color.alpha < 1.0}|${condition !== undefined}`,
  };
}
function createOwner(visualizer, item, state) {
  const attributes = {};
  if (state.condition !== undefined) {
    attributes.distanceDisplayCondition =
      DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(
        state.condition,
      );
  }
  const primitive = new SceneGISPlanarPrimitive({
    geometry: new SceneGISPlanarPolylineGeometry({
      positions: state.positions,
      width: state.width,
    }),
    appearance: new PolylineMaterialAppearance({
      material: Material.fromType(Material.ColorType, {
        color: Color.clone(state.color),
      }),
      translucent: state.color.alpha < 1.0,
    }),
    attributes,
    id: item.entity,
  });
  const owner = new SceneGISPlanarPrimitiveOwner(visualizer._primitives);
  owner.add(primitive);
  owner.primitive = primitive;
  owner.signature = state.signature;
  owner.color = Color.clone(state.color);
  owner.condition = state.condition;
  owner.boundingSphere = BoundingSphere.fromPoints(state.positions);
  owner.shown = true;
  return owner;
}
function sameCondition(a, b) {
  return (
    a === b ||
    (a !== undefined && b !== undefined && a.near === b.near && a.far === b.far)
  );
}
function applyState(owner, state) {
  const changed =
    !Color.equals(owner.color, state.color) ||
    !sameCondition(owner.condition, state.condition);
  if (changed && !owner.primitive.ready) {
    return false;
  }
  if (changed) {
    Color.clone(
      state.color,
      owner.primitive.appearance.material.uniforms.color,
    );
    if (state.condition !== undefined) {
      const attributes = owner.primitive.getGeometryInstanceAttributes();
      attributes.distanceDisplayCondition =
        DistanceDisplayConditionGeometryInstanceAttribute.toValue(
          state.condition,
          attributes.distanceDisplayCondition,
        );
    }
    Color.clone(state.color, owner.color);
    owner.condition = state.condition;
  }
  owner.setShow(true);
  owner.shown = true;
  return true;
}
function release(item) {
  item.owner?.destroy();
  item.owner = undefined;
}

/** @private */
function SceneGISPlanarPathVisualizer(
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
    SceneGISPlanarPathVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(entityCollection, entityCollection.values, [], []);
}
SceneGISPlanarPathVisualizer.prototype.update = function (time) {
  if (time === undefined) {
    throw new DeveloperError("time is required.");
  }
  const evaluated = this._items.values.map((item) => ({
    item,
    state: computeState(this, item, time),
  }));
  for (const { item, state } of evaluated) {
    if (state.missing) {
      release(item);
    } else if (!state.shown) {
      item.owner?.setShow(false);
      if (item.owner) {
        item.owner.shown = false;
      }
    } else if (
      item.owner?.signature === state.signature &&
      applyState(item.owner, state)
    ) {
      // Reused current owner.
    } else {
      const candidate = createOwner(this, item, state);
      candidate.insert();
      release(item);
      item.owner = candidate;
    }
  }
  return true;
};
SceneGISPlanarPathVisualizer.prototype.getBoundingSphere = function (
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
SceneGISPlanarPathVisualizer.prototype.isDestroyed = function () {
  return false;
};
SceneGISPlanarPathVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    SceneGISPlanarPathVisualizer.prototype._onCollectionChanged,
    this,
  );
  for (const item of this._items.values) {
    release(item);
  }
  this._items.removeAll();
  return destroyObject(this);
};
SceneGISPlanarPathVisualizer.prototype._onCollectionChanged = function (
  collection,
  added,
  removed,
  changed,
) {
  const add = (entity) => {
    if (entity._path !== undefined && !this._items.contains(entity.id)) {
      this._items.set(entity.id, { entity, owner: undefined, sampled: [] });
    }
  };
  const remove = (entity) => {
    const item = this._items.get(entity.id);
    if (item !== undefined) {
      release(item);
      this._items.remove(entity.id);
    }
  };
  added.forEach(add);
  changed.forEach((entity) =>
    entity._path !== undefined ? add(entity) : remove(entity),
  );
  removed.forEach(remove);
};

export default SceneGISPlanarPathVisualizer;

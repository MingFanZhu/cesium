import validatePlanarShadowMode from "../../Scene/_private/_SceneGISPlanarShadowMode.js";
import AssociativeArray from "../../../Core/AssociativeArray.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import ColorGeometryInstanceAttribute from "../../../Core/ColorGeometryInstanceAttribute.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import DistanceDisplayConditionGeometryInstanceAttribute from "../../../Core/DistanceDisplayConditionGeometryInstanceAttribute.js";
import CesiumMath from "../../../Core/Math.js";
import Matrix4 from "../../../Core/Matrix4.js";
import ColorMaterialProperty from "../../../DataSources/ColorMaterialProperty.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import Property from "../../../DataSources/Property.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import HeightReference from "../../../Scene/HeightReference.js";
import PerInstanceColorAppearance from "../../../Scene/PerInstanceColorAppearance.js";
import ShadowMode from "../../../Scene/ShadowMode.js";
import destroyObject from "../../../Core/destroyObject.js";
import SceneGISPlanarBoxGeometry from "../../Core/SceneGISPlanarBoxGeometry.js";
import SceneGISPlanarCylinderGeometry from "../../Core/SceneGISPlanarCylinderGeometry.js";
import SceneGISPlanarEllipsoidGeometry from "../../Core/SceneGISPlanarEllipsoidGeometry.js";
import SceneGISPlanarPolylineGeometry from "../../Core/SceneGISPlanarPolylineGeometry.js";
import SceneGISPlanarPrimitive from "../../Scene/SceneGISPlanarPrimitive.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";
import SceneGISPlanarEntityTransform from "./_SceneGISPlanarEntityTransform.js";
import SceneGISPlanarPositionResolver from "./_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarPrimitiveOwner from "./_SceneGISPlanarPrimitiveOwner.js";
import Material from "../../../Scene/Material.js";
import PolylineMaterialAppearance from "../../../Scene/PolylineMaterialAppearance.js";

const scratchPosition = new Cartesian3();
const scratchResolved = new Cartesian3();
const scratchColor = new Color();
const scratchMatrix = new Matrix4();
const scratchSphere = new BoundingSphere();

function value(property, time, defaultValue, result) {
  return Property.getValueOrDefault(property, time, defaultValue, result);
}
function optional(property, time, result) {
  return Property.getValueOrUndefined(property, time, result);
}
function matrixKey(matrix) {
  const values = new Array(16);
  for (let i = 0; i < 16; i++) {
    values[i] = matrix[i];
  }
  return values.join(",");
}
function finitePositiveCartesian3(v, name) {
  if (
    !(v instanceof Cartesian3) ||
    !Number.isFinite(v.x) ||
    !Number.isFinite(v.y) ||
    !Number.isFinite(v.z) ||
    v.x <= 0 ||
    v.y <= 0 ||
    v.z <= 0
  ) {
    throw new DeveloperError(`${name} must be a positive finite Cartesian3.`);
  }
  return Cartesian3.clone(v);
}
function finiteColor(color, name) {
  if (
    !(color instanceof Color) ||
    !Number.isFinite(color.red) ||
    !Number.isFinite(color.green) ||
    !Number.isFinite(color.blue) ||
    !Number.isFinite(color.alpha)
  ) {
    throw new DeveloperError(`${name} must be finite.`);
  }
  return Color.clone(color);
}
function getFillColor(graphic, time) {
  const material = graphic._material;
  if (material !== undefined && !(material instanceof ColorMaterialProperty)) {
    throw new DeveloperError("material must be a ColorMaterialProperty.");
  }
  return finiteColor(
    value(material?._color, time, Color.WHITE, scratchColor),
    "material color",
  );
}
function validateCommon(graphic, time) {
  const width = value(graphic._outlineWidth, time, 1.0);
  if (!Number.isFinite(width) || width < 0.0) {
    throw new DeveloperError("outlineWidth must be finite and nonnegative.");
  }
  const condition = optional(graphic._distanceDisplayCondition, time);
  if (
    condition !== undefined &&
    (!Number.isFinite(condition.near) ||
      !Number.isFinite(condition.far) ||
      condition.near < 0 ||
      condition.far <= condition.near)
  ) {
    throw new DeveloperError(
      "distanceDisplayCondition must have ordered finite bounds.",
    );
  }
  return { width, condition };
}
function resolveCenter(visualizer, entity, graphic, support, time) {
  const input = optional(entity._position, time, scratchPosition);
  if (input === undefined) {
    return undefined;
  }
  const reference = value(graphic._heightReference, time, HeightReference.NONE);
  const center = SceneGISPlanarPositionResolver.resolve(
    visualizer._world,
    input,
    reference,
    scratchResolved,
  );
  if (center === undefined) {
    return undefined;
  }
  const result = Cartesian3.clone(center);
  if (reference !== HeightReference.NONE) {
    result.z += support;
    if (!Number.isFinite(result.z)) {
      throw new DeveloperError("The supported center height must be finite.");
    }
  }
  return result;
}
function circle(center, rx, ry, z, slices) {
  const positions = new Array(slices + 1);
  for (let i = 0; i <= slices; i++) {
    const angle = (i / slices) * CesiumMath.TWO_PI;
    positions[i] = new Cartesian3(
      center.x + rx * Math.cos(angle),
      center.y + ry * Math.sin(angle),
      center.z + z,
    );
  }
  return positions;
}
function boxOutlines(center, dimensions) {
  const x = dimensions.x * 0.5;
  const y = dimensions.y * 0.5;
  const z = dimensions.z * 0.5;
  const ring = (height) => [
    new Cartesian3(center.x - x, center.y - y, center.z + height),
    new Cartesian3(center.x + x, center.y - y, center.z + height),
    new Cartesian3(center.x + x, center.y + y, center.z + height),
    new Cartesian3(center.x - x, center.y + y, center.z + height),
    new Cartesian3(center.x - x, center.y - y, center.z + height),
  ];
  const bottom = ring(-z);
  const top = ring(z);
  const result = [bottom, top];
  for (let i = 0; i < 4; i++) {
    result.push([bottom[i], top[i]]);
  }
  return result;
}
function cylinderOutlines(center, state) {
  const result = [];
  if (state.bottomRadius > 0.0) {
    result.push(
      circle(
        center,
        state.bottomRadius,
        state.bottomRadius,
        -state.length / 2,
        state.slices,
      ),
    );
  }
  if (state.topRadius > 0.0) {
    result.push(
      circle(
        center,
        state.topRadius,
        state.topRadius,
        state.length / 2,
        state.slices,
      ),
    );
  }
  const vertical = Math.min(state.numberOfVerticalLines, state.slices);
  for (let i = 0; i < vertical; i++) {
    const angle = (i / vertical) * CesiumMath.TWO_PI;
    result.push([
      new Cartesian3(
        center.x + state.bottomRadius * Math.cos(angle),
        center.y + state.bottomRadius * Math.sin(angle),
        center.z - state.length / 2,
      ),
      new Cartesian3(
        center.x + state.topRadius * Math.cos(angle),
        center.y + state.topRadius * Math.sin(angle),
        center.z + state.length / 2,
      ),
    ]);
  }
  return result;
}
function ellipsoidOutlines(center, state) {
  const result = [];
  const count = state.subdivisions;
  result.push(circle(center, state.radii.x, state.radii.y, 0, count));
  const yz = [];
  const xz = [];
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * CesiumMath.TWO_PI;
    yz.push(
      new Cartesian3(
        center.x,
        center.y + state.radii.y * Math.cos(a),
        center.z + state.radii.z * Math.sin(a),
      ),
    );
    xz.push(
      new Cartesian3(
        center.x + state.radii.x * Math.cos(a),
        center.y,
        center.z + state.radii.z * Math.sin(a),
      ),
    );
  }
  result.push(yz, xz);
  return result;
}
function validateFullEllipsoid(graphic, time) {
  if (optional(graphic._innerRadii, time) !== undefined) {
    throw new DeveloperError("innerRadii is not supported.");
  }
  const checks = [
    [graphic._minimumClock, 0.0],
    [graphic._maximumClock, CesiumMath.TWO_PI],
    [graphic._minimumCone, 0.0],
    [graphic._maximumCone, CesiumMath.PI],
  ];
  for (const [property, expected] of checks) {
    const actual = optional(property, time);
    if (actual !== undefined && actual !== expected) {
      throw new DeveloperError("Only a full ellipsoid is supported.");
    }
  }
}
function computeGraphicState(visualizer, item, name, time) {
  const entity = item.entity;
  const graphic = entity[`_${name}`];
  if (graphic === undefined) {
    return { missing: true };
  }
  const common = validateCommon(graphic, time);
  let geometry;
  let outlines;
  let center;
  if (name === "box") {
    const dimensions = finitePositiveCartesian3(
      optional(graphic._dimensions, time),
      "dimensions",
    );
    center = resolveCenter(visualizer, entity, graphic, dimensions.z / 2, time);
    if (center !== undefined) {
      geometry = new SceneGISPlanarBoxGeometry({ center, dimensions });
      outlines = boxOutlines(center, dimensions);
    }
  } else if (name === "cylinder") {
    const length = optional(graphic._length, time);
    const topRadius = optional(graphic._topRadius, time);
    const bottomRadius = optional(graphic._bottomRadius, time);
    const slices = value(graphic._slices, time, 128);
    const numberOfVerticalLines = value(
      graphic._numberOfVerticalLines,
      time,
      16,
    );
    if (
      !Number.isSafeInteger(numberOfVerticalLines) ||
      numberOfVerticalLines < 0
    ) {
      throw new DeveloperError(
        "numberOfVerticalLines must be a nonnegative safe integer.",
      );
    }
    center = resolveCenter(visualizer, entity, graphic, length / 2, time);
    if (center !== undefined) {
      geometry = new SceneGISPlanarCylinderGeometry({
        center,
        length,
        topRadius,
        bottomRadius,
        slices,
      });
      outlines = cylinderOutlines(center, {
        length,
        topRadius,
        bottomRadius,
        slices,
        numberOfVerticalLines,
      });
    }
  } else {
    validateFullEllipsoid(graphic, time);
    const radii = finitePositiveCartesian3(
      optional(graphic._radii, time),
      "radii",
    );
    const stackPartitions = value(graphic._stackPartitions, time, 64);
    const slicePartitions = value(graphic._slicePartitions, time, 64);
    const subdivisions = value(graphic._subdivisions, time, 128);
    if (!Number.isSafeInteger(subdivisions) || subdivisions < 3) {
      throw new DeveloperError(
        "subdivisions must be a safe integer of at least 3.",
      );
    }
    center = resolveCenter(visualizer, entity, graphic, radii.z, time);
    if (center !== undefined) {
      geometry = new SceneGISPlanarEllipsoidGeometry({
        center,
        radii,
        stackPartitions,
        slicePartitions,
      });
      outlines = ellipsoidOutlines(center, { radii, subdivisions });
    }
  }
  const fill = value(graphic._fill, time, true);
  const outline = value(graphic._outline, time, false);
  if (typeof fill !== "boolean" || typeof outline !== "boolean") {
    throw new DeveloperError("fill and outline must be boolean.");
  }
  const fillColor = getFillColor(graphic, time);
  const outlineColor = finiteColor(
    value(graphic._outlineColor, time, Color.BLACK, scratchColor),
    "outlineColor",
  );
  const orientation = optional(entity._orientation, time);
  const modelMatrix = Matrix4.clone(
    SceneGISPlanarEntityTransform.computeRotation(orientation, scratchMatrix),
  );
  const shown =
    center !== undefined &&
    entity.isShowing &&
    entity.isAvailable(time) &&
    value(graphic._show, time, true) &&
    ((fill && fillColor.alpha > 0) ||
      (outline && common.width > 0 && outlineColor.alpha > 0));
  if (!shown) {
    return { shown: false };
  }
  const effectiveFill = fill && fillColor.alpha > 0;
  const effectiveOutline =
    outline && common.width > 0 && outlineColor.alpha > 0;
  return {
    shown: true,
    shadows: validatePlanarShadowMode(
      value(graphic._shadows, time, ShadowMode.DISABLED),
    ),
    geometry,
    outlines,
    fill: effectiveFill,
    fillColor,
    outline: effectiveOutline,
    outlineColor,
    outlineWidth: common.width,
    condition: common.condition,
    origin: center,
    modelMatrix,
    signature: [
      name,
      JSON.stringify(geometry),
      matrixKey(modelMatrix),
      effectiveFill,
      fillColor.alpha < 1,
      effectiveOutline,
      outlineColor.alpha < 1,
      common.width,
      common.condition !== undefined,
      outlines.map((positions) => positions.length).join(","),
    ].join("|"),
  };
}
function createAttributes(state, color) {
  const attributes = {
    color: ColorGeometryInstanceAttribute.fromColor(color),
  };
  if (state.condition !== undefined) {
    attributes.distanceDisplayCondition =
      DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(
        state.condition,
      );
  }
  return attributes;
}
function createOutlineAttributes(state) {
  if (state.condition === undefined) {
    return undefined;
  }
  return {
    distanceDisplayCondition:
      DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(
        state.condition,
      ),
  };
}
function createOwner(visualizer, item, state) {
  const owner = new SceneGISPlanarPrimitiveOwner(visualizer._primitives);
  if (state.fill) {
    const primitive = new SceneGISPlanarPrimitive({
      geometry: state.geometry,
      appearance: new PerInstanceColorAppearance({
        flat: false,
        closed: true,
        translucent: state.fillColor.alpha < 1,
      }),
      attributes: createAttributes(state, state.fillColor),
      modelMatrix: state.modelMatrix,
      id: item.entity,
    });
    owner.add(primitive);
    owner.fillPrimitive = primitive;
  }
  if (state.outline) {
    for (const positions of state.outlines) {
      const primitive = new SceneGISPlanarPrimitive({
        geometry: new SceneGISPlanarPolylineGeometry({
          positions,
          width: state.outlineWidth,
          origin: state.origin,
        }),
        appearance: new PolylineMaterialAppearance({
          material: Material.fromType(Material.ColorType, {
            color: Color.clone(state.outlineColor),
          }),
          translucent: state.outlineColor.alpha < 1,
        }),
        attributes: createOutlineAttributes(state),
        modelMatrix: state.modelMatrix,
        id: item.entity,
      });
      owner.add(primitive);
      (owner.outlinePrimitives ??= []).push(primitive);
    }
  }
  owner.signature = state.signature;
  owner.fillColor = Color.clone(state.fillColor);
  owner.outlineColor = Color.clone(state.outlineColor);
  owner.condition = cloneCondition(state.condition);
  owner.setShadows(state.shadows);
  owner.shown = true;
  owner.boundingSphere = new BoundingSphere();
  let hasSphere = false;
  for (const primitive of owner.primitives) {
    const sphere = primitive.getBoundingSphere(scratchSphere);
    if (!hasSphere) {
      BoundingSphere.clone(sphere, owner.boundingSphere);
    } else {
      BoundingSphere.union(owner.boundingSphere, sphere, owner.boundingSphere);
    }
    hasSphere = true;
  }
  return owner;
}
function sameCondition(left, right) {
  return (
    left === right ||
    (left !== undefined &&
      right !== undefined &&
      left.near === right.near &&
      left.far === right.far)
  );
}
function cloneCondition(condition) {
  return condition === undefined
    ? undefined
    : { near: condition.near, far: condition.far };
}
function applyState(owner, state) {
  const styleChanged =
    !Color.equals(owner.fillColor, state.fillColor) ||
    !Color.equals(owner.outlineColor, state.outlineColor) ||
    !sameCondition(owner.condition, state.condition);
  if (styleChanged && owner.primitives.some((primitive) => !primitive.ready)) {
    return false;
  }
  if (styleChanged) {
    if (owner.fillPrimitive !== undefined) {
      const values = owner.fillPrimitive.getGeometryInstanceAttributes();
      values.color = ColorGeometryInstanceAttribute.toValue(
        state.fillColor,
        values.color,
      );
      if (state.condition !== undefined) {
        values.distanceDisplayCondition =
          DistanceDisplayConditionGeometryInstanceAttribute.toValue(
            state.condition,
            values.distanceDisplayCondition,
          );
      }
    }
    for (const primitive of owner.outlinePrimitives ?? []) {
      primitive.appearance.material.uniforms.color = Color.clone(
        state.outlineColor,
        primitive.appearance.material.uniforms.color,
      );
      if (state.condition !== undefined) {
        const values = primitive.getGeometryInstanceAttributes();
        values.distanceDisplayCondition =
          DistanceDisplayConditionGeometryInstanceAttribute.toValue(
            state.condition,
            values.distanceDisplayCondition,
          );
      }
    }
    Color.clone(state.fillColor, owner.fillColor);
    Color.clone(state.outlineColor, owner.outlineColor);
    owner.condition = cloneCondition(state.condition);
  }
  owner.setShow(true);
  owner.setShadows(state.shadows);
  owner.shown = true;
  return true;
}
function releaseOwner(item, name) {
  const owner = item.owners[name];
  if (owner !== undefined) {
    owner.destroy();
    item.owners[name] = undefined;
  }
}

/**
 * Visualizes planar Box, Cylinder, and Ellipsoid graphics.
 *
 * @alias SceneGISPlanarSolidVisualizer
 * @constructor
 * @private
 */
function SceneGISPlanarSolidVisualizer(
  world,
  scene,
  entityCollection,
  primitiveCollection,
) {
  if (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed()) {
    throw new DeveloperError("world must be a live SceneGISPlanarWorld.");
  }
  if (!(entityCollection instanceof EntityCollection)) {
    throw new DeveloperError("entityCollection is required.");
  }
  this._world = world;
  this._scene = scene;
  this._primitives = primitiveCollection ?? scene.primitives;
  this._entityCollection = entityCollection;
  this._items = new AssociativeArray();
  entityCollection.collectionChanged.addEventListener(
    SceneGISPlanarSolidVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(entityCollection, entityCollection.values, [], []);
}

SceneGISPlanarSolidVisualizer.prototype.update = function (time) {
  if (time === undefined) {
    throw new DeveloperError("time is required.");
  }
  const names = ["box", "cylinder", "ellipsoid"];
  const evaluated = this._items.values.map((item) => ({
    item,
    states: names.map((name) => computeGraphicState(this, item, name, time)),
  }));
  for (const entry of evaluated) {
    for (let i = 0; i < names.length; i++) {
      const item = entry.item;
      const name = names[i];
      const state = entry.states[i];
      if (state.missing) {
        releaseOwner(item, name);
      } else if (!state.shown) {
        item.owners[name]?.setShow(false);
        if (item.owners[name]) {
          item.owners[name].shown = false;
        }
      } else if (
        item.owners[name]?.signature === state.signature &&
        applyState(item.owners[name], state)
      ) {
        // Reused current owner.
      } else {
        const candidate = createOwner(this, item, state);
        candidate.insert();
        releaseOwner(item, name);
        item.owners[name] = candidate;
      }
    }
  }
  return true;
};
SceneGISPlanarSolidVisualizer.prototype.getBoundingSphere = function (
  entity,
  result,
) {
  if (entity === undefined || result === undefined) {
    throw new DeveloperError("entity and result are required.");
  }
  const item = this._items.get(entity.id);
  let found = false;
  for (const owner of Object.values(item?.owners ?? {})) {
    if (owner?.shown) {
      if (!found) {
        BoundingSphere.clone(owner.boundingSphere, result);
      } else {
        BoundingSphere.union(result, owner.boundingSphere, result);
      }
      found = true;
    }
  }
  return found ? BoundingSphereState.DONE : BoundingSphereState.FAILED;
};
SceneGISPlanarSolidVisualizer.prototype.isDestroyed = function () {
  return false;
};
SceneGISPlanarSolidVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    SceneGISPlanarSolidVisualizer.prototype._onCollectionChanged,
    this,
  );
  for (const item of this._items.values) {
    for (const name of ["box", "cylinder", "ellipsoid"]) {
      releaseOwner(item, name);
    }
  }
  this._items.removeAll();
  return destroyObject(this);
};
SceneGISPlanarSolidVisualizer.prototype._onCollectionChanged = function (
  collection,
  added,
  removed,
  changed,
) {
  const hasGraphic = (entity) =>
    entity._box !== undefined ||
    entity._cylinder !== undefined ||
    entity._ellipsoid !== undefined;
  const add = (entity) => {
    if (hasGraphic(entity) && !this._items.contains(entity.id)) {
      this._items.set(entity.id, { entity, owners: {} });
    }
  };
  const remove = (entity) => {
    const item = this._items.get(entity.id);
    if (item !== undefined) {
      for (const name of ["box", "cylinder", "ellipsoid"]) {
        releaseOwner(item, name);
      }
      this._items.remove(entity.id);
    }
  };
  added.forEach(add);
  changed.forEach((entity) =>
    hasGraphic(entity) ? add(entity) : remove(entity),
  );
  removed.forEach(remove);
};

export default SceneGISPlanarSolidVisualizer;

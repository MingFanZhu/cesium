import AssociativeArray from "../../../Core/AssociativeArray.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import ColorGeometryInstanceAttribute from "../../../Core/ColorGeometryInstanceAttribute.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import DistanceDisplayConditionGeometryInstanceAttribute from "../../../Core/DistanceDisplayConditionGeometryInstanceAttribute.js";
import CesiumMath from "../../../Core/Math.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Plane from "../../../Core/Plane.js";
import Rectangle from "../../../Core/Rectangle.js";
import destroyObject from "../../../Core/destroyObject.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import ColorMaterialProperty from "../../../DataSources/ColorMaterialProperty.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import Property from "../../../DataSources/Property.js";
import HeightReference from "../../../Scene/HeightReference.js";
import Material from "../../../Scene/Material.js";
import PerInstanceColorAppearance from "../../../Scene/PerInstanceColorAppearance.js";
import PolylineMaterialAppearance from "../../../Scene/PolylineMaterialAppearance.js";
import ShadowMode from "../../../Scene/ShadowMode.js";
import SceneGISPlanarPolygonGeometry from "../../Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolylineGeometry from "../../Core/SceneGISPlanarPolylineGeometry.js";
import SceneGISPlanarPrimitive from "../../Scene/SceneGISPlanarPrimitive.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";
import SceneGISPlanarEntityTransform from "./_SceneGISPlanarEntityTransform.js";
import SceneGISPlanarPositionResolver from "./_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarPrimitiveOwner from "./_SceneGISPlanarPrimitiveOwner.js";

const scratchPosition = new Cartesian3();
const scratchResolved = new Cartesian3();
const scratchColor = new Color();
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
function fillColor(graphic, time) {
  if (
    graphic._material !== undefined &&
    !(graphic._material instanceof ColorMaterialProperty)
  ) {
    throw new DeveloperError("material must be a ColorMaterialProperty.");
  }
  return finiteColor(
    value(graphic._material?._color, time, Color.WHITE, scratchColor),
    "material color",
  );
}
function validateCommon(graphic, time) {
  const shadows = optional(graphic._shadows, time);
  if (shadows !== undefined && shadows !== ShadowMode.DISABLED) {
    throw new DeveloperError("shadows must be ShadowMode.DISABLED.");
  }
  if (optional(graphic._stRotation, time) !== undefined) {
    throw new DeveloperError("stRotation is not supported.");
  }
  if (optional(graphic._classificationType, time) !== undefined) {
    throw new DeveloperError("classificationType is not supported.");
  }
  if (optional(graphic._zIndex, time) !== undefined) {
    throw new DeveloperError("zIndex is not supported.");
  }
  const outlineWidth = value(graphic._outlineWidth, time, 1.0);
  if (!Number.isFinite(outlineWidth) || outlineWidth < 0) {
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
  return { outlineWidth, condition };
}
function resolveVertices(world, source, heightReference) {
  if (heightReference === HeightReference.NONE) {
    return source.map((position) => Cartesian3.clone(position));
  }
  const result = new Array(source.length);
  for (let i = 0; i < source.length; i++) {
    const resolved = SceneGISPlanarPositionResolver.resolve(
      world,
      source[i],
      heightReference,
      scratchResolved,
    );
    if (resolved === undefined) {
      return undefined;
    }
    result[i] = Cartesian3.clone(resolved);
  }
  return result;
}
function planeGeometryState(position, plane, dimensions, orientation) {
  if (
    !(plane instanceof Plane) ||
    !Number.isFinite(plane.normal.x) ||
    !Number.isFinite(plane.normal.y) ||
    !Number.isFinite(plane.normal.z) ||
    Cartesian3.magnitudeSquared(plane.normal) === 0 ||
    !Number.isFinite(plane.distance)
  ) {
    throw new DeveloperError("plane must be finite with a nonzero normal.");
  }
  if (
    !(dimensions instanceof Cartesian2) ||
    !Number.isFinite(dimensions.x) ||
    !Number.isFinite(dimensions.y) ||
    dimensions.x <= 0 ||
    dimensions.y <= 0
  ) {
    throw new DeveloperError("dimensions must be a positive Cartesian2.");
  }
  const normal = Cartesian3.normalize(plane.normal, new Cartesian3());
  const point = Cartesian3.multiplyByScalar(
    normal,
    -plane.distance / Cartesian3.magnitude(plane.normal),
    new Cartesian3(),
  );
  const reference =
    Math.abs(normal.z) < 0.9 ? Cartesian3.UNIT_Z : Cartesian3.UNIT_X;
  const u = Cartesian3.normalize(
    Cartesian3.cross(reference, normal, new Cartesian3()),
    new Cartesian3(),
  );
  const v = Cartesian3.cross(normal, u, new Cartesian3());
  const positions = [];
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    positions.push(
      new Cartesian3(
        position.x + (sx * dimensions.x) / 2,
        position.y + (sy * dimensions.y) / 2,
        position.z,
      ),
    );
  }
  const planeTransform = new Matrix4(
    u.x,
    v.x,
    normal.x,
    point.x,
    u.y,
    v.y,
    normal.y,
    point.y,
    u.z,
    v.z,
    normal.z,
    point.z,
    0.0,
    0.0,
    0.0,
    1.0,
  );
  const entityRotation = SceneGISPlanarEntityTransform.computeRotation(
    orientation,
    new Matrix4(),
  );
  return {
    positions,
    origin: Cartesian3.clone(position),
    modelMatrix: Matrix4.multiply(
      entityRotation,
      planeTransform,
      new Matrix4(),
    ),
  };
}
function rotateXY(x, y, rotation, clockwise) {
  const angle = clockwise ? -rotation : rotation;
  return new Cartesian2(
    x * Math.cos(angle) - y * Math.sin(angle),
    x * Math.sin(angle) + y * Math.cos(angle),
  );
}
function ellipseVertices(center, major, minor, rotation, granularity) {
  if (
    !Number.isFinite(major) ||
    !Number.isFinite(minor) ||
    major <= 0 ||
    minor <= 0 ||
    minor > major
  ) {
    throw new DeveloperError(
      "semiMajorAxis and semiMinorAxis must be ordered positive values.",
    );
  }
  if (!Number.isFinite(rotation)) {
    throw new DeveloperError("rotation must be finite.");
  }
  if (!Number.isFinite(granularity) || granularity <= 0) {
    throw new DeveloperError("granularity must be finite and positive.");
  }
  const segments = Math.max(3, Math.ceil(CesiumMath.TWO_PI / granularity));
  if (!Number.isSafeInteger(segments)) {
    throw new DeveloperError("granularity produces too many vertices.");
  }
  const result = new Array(segments);
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * CesiumMath.TWO_PI;
    const rotated = rotateXY(
      -minor * Math.sin(angle),
      major * Math.cos(angle),
      rotation,
      false,
    );
    result[i] = new Cartesian3(
      center.x + rotated.x,
      center.y + rotated.y,
      center.z,
    );
  }
  return result;
}
function rectangleVertices(rectangle, height, rotation) {
  if (
    !(rectangle instanceof Rectangle) ||
    !Number.isFinite(rectangle.west) ||
    !Number.isFinite(rectangle.south) ||
    !Number.isFinite(rectangle.east) ||
    !Number.isFinite(rectangle.north) ||
    rectangle.west >= rectangle.east ||
    rectangle.south >= rectangle.north ||
    !Number.isFinite(height) ||
    !Number.isFinite(rotation)
  ) {
    throw new DeveloperError(
      "coordinates, height, and rotation must define a finite ordered rectangle.",
    );
  }
  const cx = rectangle.west + (rectangle.east - rectangle.west) / 2;
  const cy = rectangle.south + (rectangle.north - rectangle.south) / 2;
  const hx = (rectangle.east - rectangle.west) / 2;
  const hy = (rectangle.north - rectangle.south) / 2;
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
  ].map(([x, y]) => {
    const rotated = rotateXY(x, y, rotation, true);
    return new Cartesian3(cx + rotated.x, cy + rotated.y, height);
  });
}
function computeState(visualizer, item, name, time) {
  const entity = item.entity;
  const graphic = entity[`_${name}`];
  if (graphic === undefined) {
    return { missing: true };
  }
  const common = validateCommon(graphic, time);
  let topSource;
  let modelMatrix = Matrix4.clone(Matrix4.IDENTITY);
  let origin;
  let heightReference = HeightReference.NONE;
  let bottomSource;
  let numberOfVerticalLines;
  if (name === "plane") {
    const position = optional(entity._position, time, scratchPosition);
    if (position === undefined) {
      return { shown: false };
    }
    const resolved = SceneGISPlanarPositionResolver.resolve(
      visualizer._world,
      position,
      HeightReference.NONE,
      scratchResolved,
    );
    if (resolved === undefined) {
      return { shown: false };
    }
    const planeState = planeGeometryState(
      resolved,
      optional(graphic._plane, time),
      optional(graphic._dimensions, time),
      optional(entity._orientation, time),
    );
    origin = planeState.origin;
    topSource = planeState.positions;
    modelMatrix = planeState.modelMatrix;
  } else if (name === "ellipse") {
    const position = optional(entity._position, time, scratchPosition);
    const height = value(graphic._height, time, 0.0);
    if (position === undefined || !Number.isFinite(height)) {
      return { shown: false };
    }
    heightReference = value(
      graphic._heightReference,
      time,
      HeightReference.NONE,
    );
    const anchor = SceneGISPlanarPositionResolver.resolve(
      visualizer._world,
      new Cartesian3(position.x, position.y, 0),
      HeightReference.NONE,
      scratchResolved,
    );
    if (anchor === undefined) {
      return { shown: false };
    }
    topSource = ellipseVertices(
      new Cartesian3(position.x, position.y, height),
      optional(graphic._semiMajorAxis, time),
      optional(graphic._semiMinorAxis, time),
      value(graphic._rotation, time, 0),
      value(graphic._granularity, time, CesiumMath.RADIANS_PER_DEGREE),
    );
    const extruded = optional(graphic._extrudedHeight, time);
    if (extruded !== undefined) {
      if (!Number.isFinite(extruded)) {
        throw new DeveloperError("extrudedHeight must be finite.");
      }
      bottomSource = topSource.map((p) => new Cartesian3(p.x, p.y, extruded));
    }
    numberOfVerticalLines = value(graphic._numberOfVerticalLines, time, 16);
    if (
      !Number.isSafeInteger(numberOfVerticalLines) ||
      numberOfVerticalLines < 0
    ) {
      throw new DeveloperError(
        "numberOfVerticalLines must be a nonnegative safe integer.",
      );
    }
  } else {
    if (optional(graphic._granularity, time) !== undefined) {
      throw new DeveloperError("rectangle granularity is not supported.");
    }
    const height = value(graphic._height, time, 0);
    heightReference = value(
      graphic._heightReference,
      time,
      HeightReference.NONE,
    );
    topSource = rectangleVertices(
      optional(graphic._coordinates, time),
      height,
      value(graphic._rotation, time, 0),
    );
    const rectangleCenter = new Cartesian3(
      (topSource[0].x + topSource[2].x) / 2,
      (topSource[0].y + topSource[2].y) / 2,
      0,
    );
    if (
      SceneGISPlanarPositionResolver.resolve(
        visualizer._world,
        rectangleCenter,
        HeightReference.NONE,
        scratchResolved,
      ) === undefined
    ) {
      return { shown: false };
    }
    const extruded = optional(graphic._extrudedHeight, time);
    if (extruded !== undefined) {
      if (!Number.isFinite(extruded)) {
        throw new DeveloperError("extrudedHeight must be finite.");
      }
      bottomSource = topSource.map((p) => new Cartesian3(p.x, p.y, extruded));
    }
  }
  const top = resolveVertices(visualizer._world, topSource, heightReference);
  const bottom =
    bottomSource === undefined
      ? undefined
      : resolveVertices(
          visualizer._world,
          bottomSource,
          value(graphic._extrudedHeightReference, time, HeightReference.NONE),
        );
  if (
    top === undefined ||
    (bottomSource !== undefined && bottom === undefined)
  ) {
    return { shown: false };
  }
  origin = origin ?? Cartesian3.clone(top[0]);
  if (bottom !== undefined && bottom.some((p, i) => p.z > top[i].z)) {
    throw new DeveloperError("extrudedHeight must not exceed top height.");
  }
  const fill = value(graphic._fill, time, true);
  const outline = value(graphic._outline, time, false);
  if (typeof fill !== "boolean" || typeof outline !== "boolean") {
    throw new DeveloperError("fill and outline must be boolean.");
  }
  const color = fillColor(graphic, time);
  const outlineColor = finiteColor(
    value(graphic._outlineColor, time, Color.BLACK, scratchColor),
    "outlineColor",
  );
  const shown =
    entity.isShowing &&
    entity.isAvailable(time) &&
    value(graphic._show, time, true) &&
    ((fill && color.alpha > 0) ||
      (outline && common.outlineWidth > 0 && outlineColor.alpha > 0));
  if (!shown) {
    return { shown: false };
  }
  const outlinePositions = [];
  if (outline && common.outlineWidth > 0 && outlineColor.alpha > 0) {
    outlinePositions.push([...top, top[0]]);
    if (bottom !== undefined) {
      outlinePositions.push([...bottom, bottom[0]]);
      const verticalCount =
        name === "ellipse"
          ? Math.min(numberOfVerticalLines, top.length)
          : top.length;
      for (let i = 0; i < verticalCount; i++) {
        const index = Math.floor((i * top.length) / verticalCount);
        outlinePositions.push([top[index], bottom[index]]);
      }
    }
  }
  const effectiveFill = fill && color.alpha > 0;
  const effectiveOutline =
    outline && common.outlineWidth > 0 && outlineColor.alpha > 0;
  return {
    shown: true,
    top,
    bottom,
    modelMatrix,
    origin,
    fill: effectiveFill,
    color,
    outlinePositions,
    outlineColor,
    outlineWidth: common.outlineWidth,
    condition: common.condition,
    signature: [
      name,
      top.map((p) => `${p.x},${p.y},${p.z}`).join(";"),
      bottom?.map((p) => `${p.x},${p.y},${p.z}`).join(";"),
      matrixKey(modelMatrix),
      effectiveFill,
      color.alpha < 1,
      effectiveOutline,
      outlineColor.alpha < 1,
      common.outlineWidth,
      common.condition !== undefined,
      outlinePositions.map((positions) => positions.length).join(","),
    ].join("|"),
  };
}
function attributes(state) {
  const result = {
    color: ColorGeometryInstanceAttribute.fromColor(state.color),
  };
  if (state.condition !== undefined) {
    result.distanceDisplayCondition =
      DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(
        state.condition,
      );
  }
  return result;
}
function outlineAttributes(state) {
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
      geometry: new SceneGISPlanarPolygonGeometry({
        positions: state.top,
        bottomPositions: state.bottom,
        origin: state.origin,
      }),
      appearance: new PerInstanceColorAppearance({
        flat: true,
        translucent: state.color.alpha < 1,
      }),
      attributes: attributes(state),
      modelMatrix: state.modelMatrix,
      id: item.entity,
    });
    owner.add(primitive);
    owner.fillPrimitive = primitive;
  }
  for (const positions of state.outlinePositions) {
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
      attributes: outlineAttributes(state),
      modelMatrix: state.modelMatrix,
      id: item.entity,
    });
    owner.add(primitive);
    (owner.outlinePrimitives ??= []).push(primitive);
  }
  owner.signature = state.signature;
  owner.fillColor = Color.clone(state.color);
  owner.outlineColor = Color.clone(state.outlineColor);
  owner.condition = cloneCondition(state.condition);
  owner.shown = true;
  owner.boundingSphere = new BoundingSphere();
  let found = false;
  for (const primitive of owner.primitives) {
    primitive.getBoundingSphere(scratchSphere);
    if (!found) {
      BoundingSphere.clone(scratchSphere, owner.boundingSphere);
    } else {
      BoundingSphere.union(
        owner.boundingSphere,
        scratchSphere,
        owner.boundingSphere,
      );
    }
    found = true;
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
  const changed =
    !Color.equals(owner.fillColor, state.color) ||
    !Color.equals(owner.outlineColor, state.outlineColor) ||
    !sameCondition(owner.condition, state.condition);
  if (changed && owner.primitives.some((primitive) => !primitive.ready)) {
    return false;
  }
  if (changed) {
    if (owner.fillPrimitive !== undefined) {
      const values = owner.fillPrimitive.getGeometryInstanceAttributes();
      values.color = ColorGeometryInstanceAttribute.toValue(
        state.color,
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
    Color.clone(state.color, owner.fillColor);
    Color.clone(state.outlineColor, owner.outlineColor);
    owner.condition = cloneCondition(state.condition);
  }
  owner.setShow(true);
  owner.shown = true;
  return true;
}
function releaseOwner(item, name) {
  if (item.owners[name] !== undefined) {
    item.owners[name].destroy();
    item.owners[name] = undefined;
  }
}

/**
 * Visualizes planar Plane, Ellipse, and Rectangle graphics.
 *
 * @alias SceneGISPlanarAreaVisualizer
 * @constructor
 * @private
 */
function SceneGISPlanarAreaVisualizer(
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
    SceneGISPlanarAreaVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(entityCollection, entityCollection.values, [], []);
}
SceneGISPlanarAreaVisualizer.prototype.update = function (time) {
  if (time === undefined) {
    throw new DeveloperError("time is required.");
  }
  const names = ["plane", "ellipse", "rectangle"];
  const evaluated = this._items.values.map((item) => ({
    item,
    states: names.map((name) => computeState(this, item, name, time)),
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
SceneGISPlanarAreaVisualizer.prototype.getBoundingSphere = function (
  entity,
  result,
) {
  if (entity === undefined || result === undefined) {
    throw new DeveloperError("entity and result are required.");
  }
  let found = false;
  for (const owner of Object.values(this._items.get(entity.id)?.owners ?? {})) {
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
SceneGISPlanarAreaVisualizer.prototype.isDestroyed = function () {
  return false;
};
SceneGISPlanarAreaVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    SceneGISPlanarAreaVisualizer.prototype._onCollectionChanged,
    this,
  );
  for (const item of this._items.values) {
    for (const name of ["plane", "ellipse", "rectangle"]) {
      releaseOwner(item, name);
    }
  }
  this._items.removeAll();
  return destroyObject(this);
};
SceneGISPlanarAreaVisualizer.prototype._onCollectionChanged = function (
  collection,
  added,
  removed,
  changed,
) {
  const hasGraphic = (entity) =>
    entity._plane !== undefined ||
    entity._ellipse !== undefined ||
    entity._rectangle !== undefined;
  const add = (entity) => {
    if (hasGraphic(entity) && !this._items.contains(entity.id)) {
      this._items.set(entity.id, { entity, owners: {} });
    }
  };
  const remove = (entity) => {
    const item = this._items.get(entity.id);
    if (item !== undefined) {
      for (const name of ["plane", "ellipse", "rectangle"]) {
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

export default SceneGISPlanarAreaVisualizer;

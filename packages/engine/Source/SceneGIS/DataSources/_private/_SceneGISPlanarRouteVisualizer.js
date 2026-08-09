import AssociativeArray from "../../../Core/AssociativeArray.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import ColorGeometryInstanceAttribute from "../../../Core/ColorGeometryInstanceAttribute.js";
import CornerType from "../../../Core/CornerType.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import DistanceDisplayConditionGeometryInstanceAttribute from "../../../Core/DistanceDisplayConditionGeometryInstanceAttribute.js";
import CesiumMath from "../../../Core/Math.js";
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
import SceneGISPlanarPolylineVolumeGeometry from "../../Core/SceneGISPlanarPolylineVolumeGeometry.js";
import SceneGISPlanarWallGeometry from "../../Core/SceneGISPlanarWallGeometry.js";
import SceneGISPlanarPrimitive from "../../Scene/SceneGISPlanarPrimitive.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";
import SceneGISPlanarPositionResolver from "./_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarPrimitiveOwner from "./_SceneGISPlanarPrimitiveOwner.js";

const names = ["corridor", "wall", "polylineVolume"];
const scratchColor = new Color();
const scratchResolved = new Cartesian3();
const scratchSphere = new BoundingSphere();

function value(property, time, defaultValue, result) {
  return Property.getValueOrDefault(property, time, defaultValue, result);
}
function optional(property, time, result) {
  return Property.getValueOrUndefined(property, time, result);
}
function colorValue(property, time, defaultValue, name) {
  const color = Color.clone(value(property, time, defaultValue, scratchColor));
  if (
    !(color instanceof Color) ||
    !Number.isFinite(color.red) ||
    !Number.isFinite(color.green) ||
    !Number.isFinite(color.blue) ||
    !Number.isFinite(color.alpha)
  ) {
    throw new DeveloperError(`${name} must be finite.`);
  }
  return color;
}
function materialColor(graphic, time) {
  if (
    graphic._material !== undefined &&
    !(graphic._material instanceof ColorMaterialProperty)
  ) {
    throw new DeveloperError("material must be a ColorMaterialProperty.");
  }
  return colorValue(
    graphic._material?._color,
    time,
    Color.WHITE,
    "material color",
  );
}
function commonState(graphic, time) {
  const shadows = optional(graphic._shadows, time);
  if (shadows !== undefined && shadows !== ShadowMode.DISABLED) {
    throw new DeveloperError("shadows must be ShadowMode.DISABLED.");
  }
  for (const [name, property] of [
    ["classificationType", graphic._classificationType],
    ["zIndex", graphic._zIndex],
  ]) {
    if (optional(property, time) !== undefined) {
      throw new DeveloperError(`${name} is not supported.`);
    }
  }
  const fill = value(graphic._fill, time, true);
  const outline = value(graphic._outline, time, false);
  const outlineWidth = value(graphic._outlineWidth, time, 1.0);
  if (typeof fill !== "boolean" || typeof outline !== "boolean") {
    throw new DeveloperError("fill and outline must be boolean.");
  }
  if (!Number.isFinite(outlineWidth) || outlineWidth < 0.0) {
    throw new DeveloperError("outlineWidth must be finite and nonnegative.");
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
  return {
    fill,
    outline,
    outlineWidth,
    color: materialColor(graphic, time),
    outlineColor: colorValue(
      graphic._outlineColor,
      time,
      Color.BLACK,
      "outlineColor",
    ),
    condition:
      condition === undefined
        ? undefined
        : { near: condition.near, far: condition.far },
  };
}
function routePositions(world, source, useZ) {
  if (!Array.isArray(source) || source.length < 2) {
    throw new DeveloperError("positions must contain at least two positions.");
  }
  const result = new Array(source.length);
  for (let i = 0; i < source.length; i++) {
    const position = source[i];
    const anchor = SceneGISPlanarPositionResolver.resolve(
      world,
      new Cartesian3(position?.x, position?.y, 0.0),
      HeightReference.NONE,
      scratchResolved,
    );
    if (anchor === undefined) {
      return undefined;
    }
    if (!(position instanceof Cartesian3) || !Number.isFinite(position.z)) {
      throw new DeveloperError(
        "positions must contain finite Cartesian3 values.",
      );
    }
    result[i] = new Cartesian3(position.x, position.y, useZ ? position.z : 0.0);
  }
  return result;
}
function cornerTypeValue(graphic, time) {
  const cornerType = value(graphic._cornerType, time, CornerType.ROUNDED);
  if (
    cornerType !== CornerType.ROUNDED &&
    cornerType !== CornerType.MITERED &&
    cornerType !== CornerType.BEVELED
  ) {
    throw new DeveloperError("cornerType is invalid.");
  }
  return cornerType;
}
function granularityValue(graphic, time) {
  const granularity = value(
    graphic._granularity,
    time,
    CesiumMath.RADIANS_PER_DEGREE,
  );
  if (!Number.isFinite(granularity) || granularity <= 0.0) {
    throw new DeveloperError("granularity must be finite and positive.");
  }
  return granularity;
}
function direction(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length === 0.0) {
    throw new DeveloperError("Adjacent route positions must differ in XY.");
  }
  return new Cartesian2(dx / length, dy / length);
}
function leftOf(tangent) {
  return new Cartesian2(-tangent.y, tangent.x);
}
function offsetIntersection(position, incoming, outgoing, side, halfWidth) {
  const inLeft = leftOf(incoming);
  const outLeft = leftOf(outgoing);
  const sum = Cartesian2.add(inLeft, outLeft, new Cartesian2());
  const magnitude = Cartesian2.magnitude(sum);
  if (!Number.isFinite(magnitude) || magnitude === 0.0) {
    throw new DeveloperError("Corridor route must not reverse 180 degrees.");
  }
  Cartesian2.divideByScalar(sum, magnitude, sum);
  const divisor = Cartesian2.dot(sum, outLeft);
  if (!Number.isFinite(divisor) || divisor <= 0.0) {
    throw new DeveloperError("The derived corridor miter must be finite.");
  }
  const scale = (side * halfWidth) / divisor;
  return new Cartesian3(
    position.x + sum.x * scale,
    position.y + sum.y * scale,
    position.z,
  );
}
function appendArc(result, center, startNormal, sweep, halfWidth, granularity) {
  const steps = Math.max(1, Math.ceil(Math.abs(sweep) / granularity));
  if (!Number.isSafeInteger(steps)) {
    throw new DeveloperError(
      "granularity produces too many corridor vertices.",
    );
  }
  const start = Math.atan2(startNormal.y, startNormal.x);
  for (let i = 0; i <= steps; i++) {
    const angle = start + (sweep * i) / steps;
    result.push(
      new Cartesian3(
        center.x + Math.cos(angle) * halfWidth,
        center.y + Math.sin(angle) * halfWidth,
        center.z,
      ),
    );
  }
}
function corridorRing(route, width, cornerType, granularity) {
  const halfWidth = width * 0.5;
  const tangents = new Array(route.length - 1);
  for (let i = 0; i < tangents.length; i++) {
    tangents[i] = direction(route[i], route[i + 1]);
  }
  const sides = [[], []];
  for (let sideIndex = 0; sideIndex < 2; sideIndex++) {
    const side = sideIndex === 0 ? 1.0 : -1.0;
    const firstLeft = leftOf(tangents[0]);
    const firstExtension = cornerType === CornerType.ROUNDED ? 0.0 : -halfWidth;
    sides[sideIndex].push(
      new Cartesian3(
        route[0].x +
          firstLeft.x * side * halfWidth +
          tangents[0].x * firstExtension,
        route[0].y +
          firstLeft.y * side * halfWidth +
          tangents[0].y * firstExtension,
        0.0,
      ),
    );
    for (let i = 1; i < route.length - 1; i++) {
      const incoming = tangents[i - 1];
      const outgoing = tangents[i];
      const turn = incoming.x * outgoing.y - incoming.y * outgoing.x;
      const outer = side * turn < 0.0;
      if (cornerType === CornerType.MITERED || !outer) {
        sides[sideIndex].push(
          offsetIntersection(route[i], incoming, outgoing, side, halfWidth),
        );
      } else if (cornerType === CornerType.BEVELED) {
        for (const tangent of [incoming, outgoing]) {
          const normal = leftOf(tangent);
          sides[sideIndex].push(
            new Cartesian3(
              route[i].x + normal.x * side * halfWidth,
              route[i].y + normal.y * side * halfWidth,
              0.0,
            ),
          );
        }
      } else {
        const from = Cartesian2.multiplyByScalar(
          leftOf(incoming),
          side,
          new Cartesian2(),
        );
        const to = Cartesian2.multiplyByScalar(
          leftOf(outgoing),
          side,
          new Cartesian2(),
        );
        const sweep = Math.atan2(
          from.x * to.y - from.y * to.x,
          Cartesian2.dot(from, to),
        );
        appendArc(
          sides[sideIndex],
          route[i],
          from,
          sweep,
          halfWidth,
          granularity,
        );
      }
    }
    const last = route.length - 1;
    const lastLeft = leftOf(tangents[tangents.length - 1]);
    const lastExtension = cornerType === CornerType.ROUNDED ? 0.0 : halfWidth;
    sides[sideIndex].push(
      new Cartesian3(
        route[last].x +
          lastLeft.x * side * halfWidth +
          tangents[tangents.length - 1].x * lastExtension,
        route[last].y +
          lastLeft.y * side * halfWidth +
          tangents[tangents.length - 1].y * lastExtension,
        0.0,
      ),
    );
  }
  const ring = [...sides[0]];
  if (cornerType === CornerType.ROUNDED) {
    appendArc(
      ring,
      route[route.length - 1],
      leftOf(tangents[tangents.length - 1]),
      -Math.PI,
      halfWidth,
      granularity,
    );
  }
  ring.push(...sides[1].slice().reverse());
  if (cornerType === CornerType.ROUNDED) {
    appendArc(
      ring,
      route[0],
      Cartesian2.negate(leftOf(tangents[0]), new Cartesian2()),
      -Math.PI,
      halfWidth,
      granularity,
    );
  }
  const normalized = ring.filter(
    (position, index) =>
      index === 0 || !Cartesian3.equals(position, ring[index - 1]),
  );
  if (
    normalized.length > 3 &&
    Cartesian3.equals(normalized[0], normalized[normalized.length - 1])
  ) {
    normalized.pop();
  }
  return normalized;
}
function resolveRing(world, source, height, heightReference) {
  if (heightReference === HeightReference.NONE) {
    return source.map(
      (position) => new Cartesian3(position.x, position.y, height),
    );
  }
  const result = new Array(source.length);
  for (let i = 0; i < source.length; i++) {
    const resolved = SceneGISPlanarPositionResolver.resolve(
      world,
      new Cartesian3(source[i].x, source[i].y, height),
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
function createState(visualizer, item, name, time) {
  const entity = item.entity;
  const graphic = entity[`_${name}`];
  if (graphic === undefined) {
    return { missing: true };
  }
  const common = commonState(graphic, time);
  const positions = routePositions(
    visualizer._world,
    optional(graphic._positions, time),
    name !== "corridor",
  );
  if (positions === undefined) {
    return { shown: false };
  }
  let geometry;
  let outlines;
  if (name === "corridor") {
    const width = optional(graphic._width, time);
    if (!Number.isFinite(width) || width <= 0.0) {
      throw new DeveloperError("width must be finite and positive.");
    }
    const cornerType = cornerTypeValue(graphic, time);
    const granularity = granularityValue(graphic, time);
    const sourceRing = corridorRing(positions, width, cornerType, granularity);
    const height = value(graphic._height, time, 0.0);
    const extrudedHeight = optional(graphic._extrudedHeight, time);
    if (
      !Number.isFinite(height) ||
      (extrudedHeight !== undefined && !Number.isFinite(extrudedHeight))
    ) {
      throw new DeveloperError("height and extrudedHeight must be finite.");
    }
    const top = resolveRing(
      visualizer._world,
      sourceRing,
      height,
      value(graphic._heightReference, time, HeightReference.NONE),
    );
    const bottom =
      extrudedHeight === undefined
        ? undefined
        : resolveRing(
            visualizer._world,
            sourceRing,
            extrudedHeight,
            value(graphic._extrudedHeightReference, time, HeightReference.NONE),
          );
    if (
      top === undefined ||
      (extrudedHeight !== undefined && bottom === undefined)
    ) {
      return { shown: false };
    }
    if (bottom?.some((position, i) => position.z > top[i].z)) {
      throw new DeveloperError("extrudedHeight must not exceed top height.");
    }
    geometry = new SceneGISPlanarPolygonGeometry({
      positions: top,
      bottomPositions: bottom,
    });
    outlines = [[...top, top[0]]];
    if (bottom !== undefined) {
      outlines.push([...bottom, bottom[0]]);
      for (let i = 0; i < top.length; i++) {
        outlines.push([top[i], bottom[i]]);
      }
    }
  } else if (name === "wall") {
    if (optional(graphic._granularity, time) !== undefined) {
      throw new DeveloperError("wall granularity is not supported.");
    }
    geometry = new SceneGISPlanarWallGeometry({
      positions,
      minimumHeights: optional(graphic._minimumHeights, time),
      maximumHeights: optional(graphic._maximumHeights, time),
    });
    outlines = geometry._getOutlinePositions();
  } else {
    geometry = new SceneGISPlanarPolylineVolumeGeometry({
      polylinePositions: positions,
      shapePositions: optional(graphic._shape, time),
      cornerType: cornerTypeValue(graphic, time),
      cornerGranularity: granularityValue(graphic, time),
    });
    outlines = geometry._getOutlinePositions();
  }
  const fill = common.fill && common.color.alpha > 0.0;
  const outline =
    common.outline &&
    common.outlineWidth > 0.0 &&
    common.outlineColor.alpha > 0.0;
  const shown =
    entity.isShowing &&
    entity.isAvailable(time) &&
    value(graphic._show, time, true) &&
    (fill || outline);
  if (!shown) {
    return { shown: false };
  }
  return {
    shown: true,
    name,
    geometry,
    outlines: outline ? outlines : [],
    fill,
    color: common.color,
    outlineColor: common.outlineColor,
    outlineWidth: common.outlineWidth,
    condition: common.condition,
    signature: [
      name,
      `${geometry._origin.x},${geometry._origin.y},${geometry._origin.z}`,
      JSON.stringify(geometry._localPositions),
      fill,
      common.color.alpha < 1.0,
      outline,
      common.outlineColor.alpha < 1.0,
      common.outlineWidth,
      common.condition !== undefined,
      outlines.map((line) => line.length).join(","),
    ].join("|"),
  };
}
function instanceAttributes(color, condition) {
  const attributes = { color: ColorGeometryInstanceAttribute.fromColor(color) };
  if (condition !== undefined) {
    attributes.distanceDisplayCondition =
      DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(
        condition,
      );
  }
  return attributes;
}
function createOwner(visualizer, item, state) {
  const owner = new SceneGISPlanarPrimitiveOwner(visualizer._primitives);
  if (state.fill) {
    const wall = state.name === "wall";
    const polygon = state.name === "corridor";
    const primitive = new SceneGISPlanarPrimitive({
      geometry: state.geometry,
      appearance: new PerInstanceColorAppearance({
        flat: polygon,
        closed: !polygon && !wall,
        translucent: state.color.alpha < 1.0,
      }),
      attributes: instanceAttributes(state.color, state.condition),
      id: item.entity,
    });
    owner.add(primitive);
    owner.fillPrimitive = primitive;
  }
  for (const positions of state.outlines) {
    const primitive = new SceneGISPlanarPrimitive({
      geometry: new SceneGISPlanarPolylineGeometry({
        positions,
        width: state.outlineWidth,
      }),
      appearance: new PolylineMaterialAppearance({
        material: Material.fromType(Material.ColorType, {
          color: Color.clone(state.outlineColor),
        }),
        translucent: state.outlineColor.alpha < 1.0,
      }),
      attributes:
        state.condition === undefined
          ? undefined
          : {
              distanceDisplayCondition:
                DistanceDisplayConditionGeometryInstanceAttribute.fromDistanceDisplayCondition(
                  state.condition,
                ),
            },
      id: item.entity,
    });
    owner.add(primitive);
    (owner.outlinePrimitives ??= []).push(primitive);
  }
  owner.signature = state.signature;
  owner.color = Color.clone(state.color);
  owner.outlineColor = Color.clone(state.outlineColor);
  owner.condition = state.condition;
  owner.shown = true;
  owner.boundingSphere = new BoundingSphere();
  for (let i = 0; i < owner.primitives.length; i++) {
    owner.primitives[i].getBoundingSphere(scratchSphere);
    if (i === 0) {
      BoundingSphere.clone(scratchSphere, owner.boundingSphere);
    } else {
      BoundingSphere.union(
        owner.boundingSphere,
        scratchSphere,
        owner.boundingSphere,
      );
    }
  }
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
    !Color.equals(owner.outlineColor, state.outlineColor) ||
    !sameCondition(owner.condition, state.condition);
  if (changed && owner.primitives.some((primitive) => !primitive.ready)) {
    return false;
  }
  if (changed) {
    if (owner.fillPrimitive !== undefined) {
      const attributes = owner.fillPrimitive.getGeometryInstanceAttributes();
      attributes.color = ColorGeometryInstanceAttribute.toValue(
        state.color,
        attributes.color,
      );
      if (state.condition !== undefined) {
        attributes.distanceDisplayCondition =
          DistanceDisplayConditionGeometryInstanceAttribute.toValue(
            state.condition,
            attributes.distanceDisplayCondition,
          );
      }
    }
    for (const primitive of owner.outlinePrimitives ?? []) {
      Color.clone(
        state.outlineColor,
        primitive.appearance.material.uniforms.color,
      );
      if (state.condition !== undefined) {
        const attributes = primitive.getGeometryInstanceAttributes();
        attributes.distanceDisplayCondition =
          DistanceDisplayConditionGeometryInstanceAttribute.toValue(
            state.condition,
            attributes.distanceDisplayCondition,
          );
      }
    }
    Color.clone(state.color, owner.color);
    Color.clone(state.outlineColor, owner.outlineColor);
    owner.condition = state.condition;
  }
  owner.setShow(true);
  owner.shown = true;
  return true;
}
function release(item, name) {
  item.owners[name]?.destroy();
  item.owners[name] = undefined;
}

/** @private */
function SceneGISPlanarRouteVisualizer(
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
    SceneGISPlanarRouteVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(entityCollection, entityCollection.values, [], []);
}
SceneGISPlanarRouteVisualizer.prototype.update = function (time) {
  if (time === undefined) {
    throw new DeveloperError("time is required.");
  }
  const evaluated = this._items.values.map((item) => ({
    item,
    states: names.map((name) => createState(this, item, name, time)),
  }));
  for (const entry of evaluated) {
    for (let i = 0; i < names.length; i++) {
      const item = entry.item;
      const name = names[i];
      const state = entry.states[i];
      if (state.missing) {
        release(item, name);
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
        release(item, name);
        item.owners[name] = candidate;
      }
    }
  }
  return true;
};
SceneGISPlanarRouteVisualizer.prototype.getBoundingSphere = function (
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
SceneGISPlanarRouteVisualizer.prototype.isDestroyed = function () {
  return false;
};
SceneGISPlanarRouteVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    SceneGISPlanarRouteVisualizer.prototype._onCollectionChanged,
    this,
  );
  for (const item of this._items.values) {
    for (const name of names) {
      release(item, name);
    }
  }
  this._items.removeAll();
  return destroyObject(this);
};
SceneGISPlanarRouteVisualizer.prototype._onCollectionChanged = function (
  collection,
  added,
  removed,
  changed,
) {
  const hasGraphic = (entity) =>
    names.some((name) => entity[`_${name}`] !== undefined);
  const add = (entity) => {
    if (hasGraphic(entity) && !this._items.contains(entity.id)) {
      this._items.set(entity.id, { entity, owners: {} });
    }
  };
  const remove = (entity) => {
    const item = this._items.get(entity.id);
    if (item !== undefined) {
      for (const name of names) {
        release(item, name);
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

export default SceneGISPlanarRouteVisualizer;

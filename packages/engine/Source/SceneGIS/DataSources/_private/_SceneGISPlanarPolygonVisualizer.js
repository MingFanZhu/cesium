import ArcType from "../../../Core/ArcType.js";
import AssociativeArray from "../../../Core/AssociativeArray.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import ColorGeometryInstanceAttribute from "../../../Core/ColorGeometryInstanceAttribute.js";
import ColorMaterialProperty from "../../../DataSources/ColorMaterialProperty.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import DistanceDisplayCondition from "../../../Core/DistanceDisplayCondition.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import HeightReference from "../../../Scene/HeightReference.js";
import Material from "../../../Scene/Material.js";
import PerInstanceColorAppearance from "../../../Scene/PerInstanceColorAppearance.js";
import PolylineMaterialAppearance from "../../../Scene/PolylineMaterialAppearance.js";
import Property from "../../../DataSources/Property.js";
import ShadowMode from "../../../Scene/ShadowMode.js";
import destroyObject from "../../../Core/destroyObject.js";
import SceneGISPlanarPolygonGeometry from "../../Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolylineGeometry from "../../Core/SceneGISPlanarPolylineGeometry.js";
import SceneGISPlanarPrimitive from "../../Scene/SceneGISPlanarPrimitive.js";
import SceneGISPlanarGroundPrimitive from "../../Scene/SceneGISPlanarGroundPrimitive.js";
import getSceneGISPlanarGroundBounds from "./_SceneGISPlanarGroundBounds.js";
import SceneGISPlanarDistanceDisplayCondition from "./_SceneGISPlanarDistanceDisplayCondition.js";
import SceneGISPlanarPositionResolver from "./_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarPrimitiveOwner from "./_SceneGISPlanarPrimitiveOwner.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

const scratchColor = new Color();
const scratchResolved = new Cartesian3();

function value(property, time, defaultValue, result) {
  return Property.getValueOrDefault(property, time, defaultValue, result);
}

function optional(property, time, result) {
  return Property.getValueOrUndefined(property, time, result);
}

function validateFiniteColor(name, color) {
  if (
    !Number.isFinite(color.red) ||
    !Number.isFinite(color.green) ||
    !Number.isFinite(color.blue) ||
    !Number.isFinite(color.alpha)
  ) {
    throw new DeveloperError(`${name} components must be finite.`);
  }
}

function getFillColor(graphic, time) {
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
  validateFiniteColor("material color", color);
  return color;
}

function validateUnsupported(graphic, time) {
  const arcType = optional(graphic._arcType, time);
  if (arcType !== undefined && arcType !== ArcType.NONE) {
    throw new DeveloperError("arcType must be ArcType.NONE when defined.");
  }
  const shadows = optional(graphic._shadows, time);
  if (shadows !== undefined && shadows !== ShadowMode.DISABLED) {
    throw new DeveloperError("shadows must be ShadowMode.DISABLED.");
  }
  const unsupportedProperties = [
    ["stRotation", graphic._stRotation],
    ["granularity", graphic._granularity],
    ["textureCoordinates", graphic._textureCoordinates],
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

function sameXY(left, right) {
  return left.x === right.x && left.y === right.y;
}

function cross(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(a, b, point) {
  return (
    cross(a, b, point) === 0.0 &&
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  );
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > 0.0 && abD < 0.0) || (abC < 0.0 && abD > 0.0)) &&
    ((cdA > 0.0 && cdB < 0.0) || (cdA < 0.0 && cdB > 0.0))
  ) {
    return true;
  }
  return (
    onSegment(a, b, c) ||
    onSegment(a, b, d) ||
    onSegment(c, d, a) ||
    onSegment(c, d, b)
  );
}

function normalizeRing(positions) {
  if (!Array.isArray(positions) || positions.length < 3) {
    throw new DeveloperError("Each polygon ring must contain three positions.");
  }
  const ring = positions.slice();
  for (let i = 0; i < ring.length; i++) {
    const position = ring[i];
    if (
      !(position instanceof Cartesian3) ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y) ||
      !Number.isFinite(position.z)
    ) {
      throw new DeveloperError(
        "Polygon positions must be finite Cartesian3 values.",
      );
    }
  }
  if (ring.length > 3 && sameXY(ring[0], ring[ring.length - 1])) {
    ring.pop();
  }
  if (ring.length < 3) {
    throw new DeveloperError("Each normalized ring must have three vertices.");
  }
  const distinct = new Set();
  let signedArea = 0.0;
  for (let i = 0; i < ring.length; i++) {
    const current = ring[i];
    const next = ring[(i + 1) % ring.length];
    distinct.add(`${current.x}\n${current.y}`);
    signedArea += current.x * next.y - next.x * current.y;
  }
  if (distinct.size < 3 || !Number.isFinite(signedArea) || signedArea === 0.0) {
    throw new DeveloperError("Polygon rings must have nonzero finite area.");
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    for (let j = i + 1; j < ring.length; j++) {
      const nextJ = (j + 1) % ring.length;
      if (j === i || nextJ === i || j === (i + 1) % ring.length) {
        continue;
      }
      if (segmentsIntersect(a, b, ring[j], ring[nextJ])) {
        throw new DeveloperError("Polygon rings must be simple.");
      }
    }
  }
  return ring;
}

function ringsIntersect(left, right) {
  for (let i = 0; i < left.length; i++) {
    const a = left[i];
    const b = left[(i + 1) % left.length];
    for (let j = 0; j < right.length; j++) {
      if (segmentsIntersect(a, b, right[j], right[(j + 1) % right.length])) {
        return true;
      }
    }
  }
  return false;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    if (onSegment(a, b, point)) {
      return false;
    }
    if (
      a.y !== b.y &&
      point.y < Math.max(a.y, b.y) &&
      point.y >= Math.min(a.y, b.y) &&
      point.x < ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y) + a.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function getRings(hierarchy) {
  if (
    hierarchy === undefined ||
    hierarchy === null ||
    !Array.isArray(hierarchy.positions)
  ) {
    throw new DeveloperError("hierarchy must define an outer ring.");
  }
  const outer = normalizeRing(hierarchy.positions);
  const sourceHoles = hierarchy.holes ?? [];
  if (!Array.isArray(sourceHoles)) {
    throw new DeveloperError("hierarchy holes must be an array.");
  }
  const holes = new Array(sourceHoles.length);
  for (let i = 0; i < sourceHoles.length; i++) {
    const sourceHole = sourceHoles[i];
    if ((sourceHole.holes?.length ?? 0) !== 0) {
      throw new DeveloperError("Nested polygon holes are not supported.");
    }
    const hole = normalizeRing(sourceHole.positions);
    if (ringsIntersect(outer, hole) || !pointInRing(hole[0], outer)) {
      throw new DeveloperError(
        "Polygon holes must lie strictly inside the outer ring.",
      );
    }
    holes[i] = hole;
  }
  for (let i = 0; i < holes.length; i++) {
    for (let j = i + 1; j < holes.length; j++) {
      if (
        ringsIntersect(holes[i], holes[j]) ||
        pointInRing(holes[i][0], holes[j]) ||
        pointInRing(holes[j][0], holes[i])
      ) {
        throw new DeveloperError(
          "Polygon holes must not overlap or contain each other.",
        );
      }
    }
  }
  return [outer, ...holes];
}

function resolveHeights(visualizer, rings, options) {
  const top = [];
  const bottom = options.extruded ? [] : undefined;
  let outside = false;
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex];
    for (let i = 0; i < ring.length; i++) {
      const source = ring[i];
      const topInput = options.perPositionHeight
        ? source
        : new Cartesian3(source.x, source.y, options.height);
      const topPosition = SceneGISPlanarPositionResolver.resolve(
        visualizer._world,
        topInput,
        options.ground ? HeightReference.NONE : options.heightReference,
        scratchResolved,
      );
      if (topPosition === undefined) {
        outside = true;
        top.push(undefined);
      } else {
        top.push(Cartesian3.clone(topPosition));
      }
      if (bottom !== undefined) {
        const bottomPosition = SceneGISPlanarPositionResolver.resolve(
          visualizer._world,
          new Cartesian3(source.x, source.y, options.extrudedHeight),
          options.ground
            ? HeightReference.NONE
            : options.extrudedHeightReference,
          scratchResolved,
        );
        if (bottomPosition === undefined) {
          outside = true;
          bottom.push(undefined);
        } else {
          bottom.push(Cartesian3.clone(bottomPosition));
        }
      }
    }
  }
  if (!outside && bottom !== undefined) {
    for (let i = 0; i < top.length; i++) {
      if (bottom[i].z > top[i].z) {
        throw new DeveloperError(
          "extrudedHeight must not exceed the top height.",
        );
      }
    }
  }
  return { top, bottom, outside };
}

function computeState(visualizer, item, time) {
  const entity = item.entity;
  const graphic = entity._polygon;
  validateUnsupported(graphic, time);
  const distanceDisplayCondition =
    SceneGISPlanarDistanceDisplayCondition.getValue(
      graphic._distanceDisplayCondition,
      time,
    );
  const hierarchy = optional(graphic._hierarchy, time);
  if (hierarchy === undefined) {
    return { missing: true };
  }
  const rings = getRings(hierarchy);
  const perPositionHeight = value(graphic._perPositionHeight, time, false);
  const height = value(graphic._height, time, 0.0);
  const heightReference = value(
    graphic._heightReference,
    time,
    HeightReference.NONE,
  );
  if (typeof perPositionHeight !== "boolean" || !Number.isFinite(height)) {
    throw new DeveloperError("perPositionHeight and height must be valid.");
  }
  if (perPositionHeight && heightReference !== HeightReference.NONE) {
    throw new DeveloperError(
      "heightReference must be NONE with perPositionHeight.",
    );
  }
  const extrudedHeight = optional(graphic._extrudedHeight, time);
  if (extrudedHeight !== undefined && !Number.isFinite(extrudedHeight)) {
    throw new DeveloperError("extrudedHeight must be finite when defined.");
  }
  const extrudedHeightReference = value(
    graphic._extrudedHeightReference,
    time,
    HeightReference.NONE,
  );
  const usesGround =
    heightReference !== HeightReference.NONE ||
    (extrudedHeight !== undefined &&
      extrudedHeightReference !== HeightReference.NONE);
  if (
    usesGround &&
    (heightReference !== HeightReference.CLAMP_TO_GROUND ||
      extrudedHeight !== undefined)
  ) {
    throw new DeveloperError(
      "Planar ground polygons require a non-extruded CLAMP_TO_GROUND surface.",
    );
  }
  const fill = value(graphic._fill, time, true);
  const outline = value(graphic._outline, time, false);
  const closeTop = value(graphic._closeTop, time, true);
  const closeBottom = value(graphic._closeBottom, time, true);
  if (
    typeof fill !== "boolean" ||
    typeof outline !== "boolean" ||
    typeof closeTop !== "boolean" ||
    typeof closeBottom !== "boolean"
  ) {
    throw new DeveloperError(
      "Polygon visibility and cap flags must be boolean.",
    );
  }
  const fillColor = getFillColor(graphic, time);
  const outlineColor = Color.clone(
    value(graphic._outlineColor, time, Color.BLACK, scratchColor),
  );
  validateFiniteColor("outlineColor", outlineColor);
  const outlineWidth = value(graphic._outlineWidth, time, 1.0);
  if (!Number.isFinite(outlineWidth) || outlineWidth < 0) {
    throw new DeveloperError(
      "outlineWidth must be a finite nonnegative number.",
    );
  }
  const resolved = resolveHeights(visualizer, rings, {
    perPositionHeight,
    height,
    heightReference,
    extruded: extrudedHeight !== undefined,
    extrudedHeight,
    extrudedHeightReference,
    ground: usesGround,
  });
  const shown =
    entity.isShowing &&
    entity.isAvailable(time) &&
    value(graphic._show, time, true) &&
    !resolved.outside &&
    ((fill && fillColor.alpha > 0.0) ||
      (outline && outlineWidth > 0.0 && outlineColor.alpha > 0.0));
  if (!shown) {
    return { shown: false };
  }
  const allWorldPositions =
    resolved.bottom === undefined
      ? resolved.top
      : [...resolved.top, ...resolved.bottom];
  const boundingSphere = BoundingSphere.fromPoints(allWorldPositions);
  if (
    !Number.isFinite(boundingSphere.center.x) ||
    !Number.isFinite(boundingSphere.center.y) ||
    !Number.isFinite(boundingSphere.center.z) ||
    !Number.isFinite(boundingSphere.radius)
  ) {
    throw new DeveloperError("The derived bounding sphere must be finite.");
  }
  const topRings = [];
  let offset = 0;
  for (let i = 0; i < rings.length; i++) {
    topRings.push(resolved.top.slice(offset, offset + rings[i].length));
    offset += rings[i].length;
  }
  const outlinePositions = [];
  const outlineReferences = [];
  if (outline && outlineWidth > 0.0) {
    offset = 0;
    for (let i = 0; i < rings.length; i++) {
      const length = rings[i].length;
      const topRing = resolved.top.slice(offset, offset + length);
      outlinePositions.push([...topRing, topRing[0]]);
      outlineReferences.push(heightReference);
      if (resolved.bottom !== undefined) {
        const bottomRing = resolved.bottom.slice(offset, offset + length);
        outlinePositions.push([...bottomRing, bottomRing[0]]);
        outlineReferences.push(extrudedHeightReference);
        for (let j = 0; j < length; j++) {
          if (!Cartesian3.equals(topRing[j], bottomRing[j])) {
            outlinePositions.push([topRing[j], bottomRing[j]]);
            outlineReferences.push([heightReference, extrudedHeightReference]);
          }
        }
      }
      offset += length;
    }
  }
  const geometryKey = allWorldPositions
    .map((p) => `${p.x},${p.y},${p.z}`)
    .join(";");
  return {
    shown: true,
    boundingSphere,
    fill: fill && fillColor.alpha > 0.0,
    fillColor,
    distanceDisplayCondition,
    ground:
      heightReference !== HeightReference.NONE ||
      (extrudedHeight !== undefined &&
        extrudedHeightReference !== HeightReference.NONE),
    heightReference,
    extrudedHeightReference,
    topRings,
    bottomPositions: resolved.bottom,
    closeTop,
    closeBottom,
    outlinePositions,
    outlineReferences,
    outlineColor,
    outlineWidth,
    signature: [
      distanceDisplayCondition !== undefined,
      geometryKey,
      fill,
      fillColor.toRgba(),
      outline,
      outlineColor.toRgba(),
      outlineWidth,
      closeTop,
      closeBottom,
      heightReference,
      extrudedHeightReference,
    ].join("|"),
  };
}

function createOwner(visualizer, item, state) {
  const owner = new SceneGISPlanarPrimitiveOwner(visualizer._primitives);
  const distanceAttributes =
    state.distanceDisplayCondition === undefined
      ? {}
      : {
          distanceDisplayCondition:
            SceneGISPlanarDistanceDisplayCondition.createAttribute(
              state.distanceDisplayCondition,
            ),
        };
  let fillPrimitive;
  if (state.fill) {
    const PrimitiveType = state.ground
      ? SceneGISPlanarGroundPrimitive
      : SceneGISPlanarPrimitive;
    fillPrimitive = new PrimitiveType({
      ...(state.ground
        ? {
            world: visualizer._world,
          }
        : {}),
      geometry: new SceneGISPlanarPolygonGeometry({
        positions: state.topRings[0],
        holes: state.topRings.slice(1),
        bottomPositions: state.bottomPositions,
        closeTop: state.closeTop,
        closeBottom: state.closeBottom,
      }),
      appearance: new PerInstanceColorAppearance({
        flat: true,
        translucent: state.fillColor.alpha < 1.0,
        closed: false,
      }),
      attributes: {
        ...distanceAttributes,
        color: ColorGeometryInstanceAttribute.fromColor(state.fillColor),
      },
      id: item.entity,
    });
    owner.add(fillPrimitive);
  }
  const outlinePrimitives = [];
  for (let i = 0; i < state.outlinePositions.length; i++) {
    const material = Material.fromType(Material.ColorType, {
      color: Color.clone(state.outlineColor),
    });
    const groundReference = state.outlineReferences[i];
    const endpointReferences = Array.isArray(groundReference)
      ? groundReference
      : undefined;
    const usesGround = endpointReferences
      ? endpointReferences.some(
          (reference) => reference !== HeightReference.NONE,
        )
      : groundReference !== HeightReference.NONE;
    const PrimitiveType = usesGround
      ? SceneGISPlanarGroundPrimitive
      : SceneGISPlanarPrimitive;
    const primitive = new PrimitiveType({
      ...(usesGround
        ? {
            world: visualizer._world,
          }
        : {}),
      geometry: new SceneGISPlanarPolylineGeometry({
        positions: state.outlinePositions[i],
        width: state.outlineWidth,
      }),
      appearance: new PolylineMaterialAppearance({
        material,
        translucent: state.outlineColor.alpha < 1.0,
      }),
      attributes: distanceAttributes,
      id: item.entity,
    });
    owner.add(primitive);
    outlinePrimitives.push(primitive);
  }
  owner.fillPrimitive = fillPrimitive;
  owner.outlinePrimitives = outlinePrimitives;
  owner.signature = state.signature;
  owner.distanceDisplayCondition = DistanceDisplayCondition.clone(
    state.distanceDisplayCondition,
  );
  owner.boundingSphere = BoundingSphere.clone(state.boundingSphere);
  owner.shown = true;
  return owner;
}

function boundingSphereEquals(left, right) {
  return (
    Cartesian3.equals(left.center, right.center) && left.radius === right.radius
  );
}

function applyState(owner, state) {
  if (
    !SceneGISPlanarDistanceDisplayCondition.update(
      owner,
      state.distanceDisplayCondition,
    )
  ) {
    return false;
  }
  if (!boundingSphereEquals(owner.boundingSphere, state.boundingSphere)) {
    BoundingSphere.clone(state.boundingSphere, owner.boundingSphere);
  }
  owner.setShow(true);
  owner.shown = true;
  return true;
}

function releaseOwner(item) {
  if (item.owner !== undefined) {
    item.owner.destroy();
    item.owner = undefined;
  }
}

/**
 * Visualizes simple planar PolygonGraphics with public planar primitives.
 *
 * @alias SceneGISPlanarPolygonVisualizer
 * @constructor
 * @private
 */
function SceneGISPlanarPolygonVisualizer(
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
    SceneGISPlanarPolygonVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(entityCollection, entityCollection.values, [], []);
}

SceneGISPlanarPolygonVisualizer.prototype.update = function (time) {
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
    if (
      item.owner !== undefined &&
      item.owner.signature === state.signature &&
      applyState(item.owner, state)
    ) {
      continue;
    }
    const candidate = createOwner(this, item, state);
    candidate.insert();
    releaseOwner(item);
    item.owner = candidate;
  }
  return true;
};

SceneGISPlanarPolygonVisualizer.prototype.getBoundingSphere = function (
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
  return getSceneGISPlanarGroundBounds(owner, result);
};

SceneGISPlanarPolygonVisualizer.prototype.isDestroyed = function () {
  return false;
};

SceneGISPlanarPolygonVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    SceneGISPlanarPolygonVisualizer.prototype._onCollectionChanged,
    this,
  );
  const items = this._items.values;
  for (let i = items.length - 1; i >= 0; i--) {
    releaseOwner(items[i]);
  }
  this._items.removeAll();
  return destroyObject(this);
};

SceneGISPlanarPolygonVisualizer.prototype._onCollectionChanged = function (
  entityCollection,
  added,
  removed,
  changed,
) {
  const add = (entity) => {
    if (entity._polygon !== undefined && !this._items.contains(entity.id)) {
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
    if (changed[i]._polygon !== undefined) {
      add(changed[i]);
    } else {
      remove(changed[i]);
    }
  }
  for (let i = removed.length - 1; i >= 0; i--) {
    remove(removed[i]);
  }
};

export default SceneGISPlanarPolygonVisualizer;

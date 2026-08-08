import AssociativeArray from "../../../Core/AssociativeArray.js";
import BoundingRectangle from "../../../Core/BoundingRectangle.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import EntityCluster from "../../../DataSources/EntityCluster.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import HeightReference from "../../../Scene/HeightReference.js";
import HorizontalOrigin from "../../../Scene/HorizontalOrigin.js";
import LabelStyle from "../../../Scene/LabelStyle.js";
import Property from "../../../DataSources/Property.js";
import SplitDirection from "../../../Scene/SplitDirection.js";
import VerticalOrigin from "../../../Scene/VerticalOrigin.js";
import destroyObject from "../../../Core/destroyObject.js";
import SceneGISPlanarPositionResolver from "./_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

const defaultBackgroundColor = new Color(0.165, 0.165, 0.165, 0.8);
const defaultBackgroundPadding = new Cartesian2(7.0, 5.0);
const defaultCartesian2 = Cartesian2.ZERO;
const defaultCartesian3 = Cartesian3.ZERO;
const scratchPosition = new Cartesian3();
const scratchResolved = new Cartesian3();
const scratchSubRegion = new BoundingRectangle();
const scratchBoundingPositions = [];

function value(property, time, defaultValue, result) {
  return Property.getValueOrDefault(property, time, defaultValue, result);
}

function optional(property, time, result) {
  return Property.getValueOrUndefined(property, time, result);
}

function validateMappedValues(properties) {
  const entries = Object.entries(properties);
  for (let i = 0; i < entries.length; i++) {
    const [name, mapped] = entries[i];
    if (typeof mapped === "number") {
      const allowsInfinity =
        name === "disableDepthTestDistance" &&
        mapped === Number.POSITIVE_INFINITY;
      if (
        (!Number.isFinite(mapped) && !allowsInfinity) ||
        (name === "disableDepthTestDistance" && mapped < 0.0)
      ) {
        throw new DeveloperError(`${name} must be a valid number.`);
      }
      continue;
    }
    if (mapped === undefined || mapped === null || typeof mapped !== "object") {
      continue;
    }

    if (
      name === "scaleByDistance" ||
      name === "translucencyByDistance" ||
      name === "pixelOffsetScaleByDistance"
    ) {
      if (
        !Number.isFinite(mapped.near) ||
        !Number.isFinite(mapped.nearValue) ||
        !Number.isFinite(mapped.far) ||
        !Number.isFinite(mapped.farValue) ||
        mapped.far <= mapped.near
      ) {
        throw new DeveloperError(`${name} must have valid ordered bounds.`);
      }
      continue;
    }
    if (name === "distanceDisplayCondition") {
      if (
        !Number.isFinite(mapped.near) ||
        !Number.isFinite(mapped.far) ||
        mapped.near < 0.0 ||
        mapped.far <= mapped.near
      ) {
        throw new DeveloperError(
          "distanceDisplayCondition must have valid ordered bounds.",
        );
      }
      continue;
    }
    const componentNames = [
      "x",
      "y",
      "z",
      "red",
      "green",
      "blue",
      "alpha",
      "near",
      "nearValue",
      "far",
      "farValue",
    ];
    for (let j = 0; j < componentNames.length; j++) {
      const component = mapped[componentNames[j]];
      if (component !== undefined && !Number.isFinite(component)) {
        throw new DeveloperError("Mapped graphic components must be finite.");
      }
    }
  }
}

function validateImageSubRegion(subRegion) {
  if (subRegion === undefined) {
    return;
  }
  if (
    !(subRegion instanceof BoundingRectangle) ||
    !Number.isFinite(subRegion.x) ||
    !Number.isFinite(subRegion.y) ||
    !Number.isFinite(subRegion.width) ||
    !Number.isFinite(subRegion.height) ||
    subRegion.x < 0.0 ||
    subRegion.y < 0.0 ||
    subRegion.width <= 0.0 ||
    subRegion.height <= 0.0
  ) {
    throw new DeveloperError("imageSubRegion must be a valid rectangle.");
  }
}

function hide(slot) {
  if (slot !== undefined) {
    slot.show = false;
  }
}

function releaseGraphic(item, entity, cluster, name) {
  if (item[name] === undefined) {
    return;
  }
  cluster[`remove${name[0].toUpperCase()}${name.slice(1)}`](entity);
  item[name] = undefined;
  if (name === "billboard") {
    item.billboardImage = undefined;
  }
}

function releaseItem(item, cluster) {
  releaseGraphic(item, item.entity, cluster, "point");
  releaseGraphic(item, item.entity, cluster, "billboard");
  releaseGraphic(item, item.entity, cluster, "label");
}

function hasAnchorGraphic(entity) {
  return (
    entity._position !== undefined &&
    (entity._point !== undefined ||
      entity._billboard !== undefined ||
      entity._label !== undefined)
  );
}

function resolvePosition(visualizer, entity, graphic, time) {
  const position = optional(entity._position, time, scratchPosition);
  if (position === undefined) {
    return undefined;
  }
  const heightReference = value(
    graphic._heightReference,
    time,
    HeightReference.NONE,
  );
  return SceneGISPlanarPositionResolver.resolve(
    visualizer._world,
    position,
    heightReference,
    scratchResolved,
  );
}

function updatePoint(visualizer, item, time, commonShow) {
  const entity = item.entity;
  const graphic = entity._point;
  if (graphic === undefined) {
    releaseGraphic(item, entity, visualizer._cluster, "point");
    return;
  }
  const show = commonShow && value(graphic._show, time, true);
  const position = show
    ? resolvePosition(visualizer, entity, graphic, time)
    : undefined;
  if (!show || position === undefined) {
    hide(item.point);
    return;
  }

  const properties = {
    scaleByDistance: optional(graphic._scaleByDistance, time),
    translucencyByDistance: optional(graphic._translucencyByDistance, time),
    color: value(graphic._color, time, Color.WHITE),
    outlineColor: value(graphic._outlineColor, time, Color.BLACK),
    outlineWidth: value(graphic._outlineWidth, time, 0.0),
    pixelSize: value(graphic._pixelSize, time, 1.0),
    distanceDisplayCondition: optional(graphic._distanceDisplayCondition, time),
    disableDepthTestDistance: value(
      graphic._disableDepthTestDistance,
      time,
      0.0,
    ),
    splitDirection: value(graphic._splitDirection, time, SplitDirection.NONE),
  };
  validateMappedValues(properties);

  const isNew = item.point === undefined;
  const point = item.point ?? visualizer._cluster.getPoint(entity);
  try {
    point.id = entity;
    point.position = position;
    Object.assign(point, properties);
    point.show = true;
    item.point = point;
  } catch (error) {
    if (isNew) {
      visualizer._cluster.removePoint(entity);
    }
    throw error;
  }
}

function updateBillboard(visualizer, item, time, commonShow) {
  const entity = item.entity;
  const graphic = entity._billboard;
  if (graphic === undefined) {
    releaseGraphic(item, entity, visualizer._cluster, "billboard");
    return;
  }
  const image = optional(graphic._image, time);
  const show = commonShow && value(graphic._show, time, true);
  const position = show
    ? resolvePosition(visualizer, entity, graphic, time)
    : undefined;
  if (!show || position === undefined || image === undefined) {
    hide(item.billboard);
    return;
  }

  const properties = {
    color: value(graphic._color, time, Color.WHITE),
    eyeOffset: value(graphic._eyeOffset, time, defaultCartesian3),
    pixelOffset: value(graphic._pixelOffset, time, defaultCartesian2),
    scale: value(graphic._scale, time, 1.0),
    rotation: value(graphic._rotation, time, 0.0),
    alignedAxis: value(graphic._alignedAxis, time, defaultCartesian3),
    horizontalOrigin: value(
      graphic._horizontalOrigin,
      time,
      HorizontalOrigin.CENTER,
    ),
    verticalOrigin: value(graphic._verticalOrigin, time, VerticalOrigin.CENTER),
    width: optional(graphic._width, time),
    height: optional(graphic._height, time),
    scaleByDistance: optional(graphic._scaleByDistance, time),
    translucencyByDistance: optional(graphic._translucencyByDistance, time),
    pixelOffsetScaleByDistance: optional(
      graphic._pixelOffsetScaleByDistance,
      time,
    ),
    sizeInMeters: value(graphic._sizeInMeters, time, false),
    distanceDisplayCondition: optional(graphic._distanceDisplayCondition, time),
    disableDepthTestDistance: optional(graphic._disableDepthTestDistance, time),
    splitDirection: value(graphic._splitDirection, time, SplitDirection.NONE),
  };
  validateMappedValues(properties);
  const subRegion = optional(graphic._imageSubRegion, time, scratchSubRegion);
  validateImageSubRegion(subRegion);

  const isNew = item.billboard === undefined;
  const billboard = item.billboard ?? visualizer._cluster.getBillboard(entity);
  try {
    billboard.id = entity;
    billboard.position = position;
    billboard.heightReference = HeightReference.NONE;
    Object.assign(billboard, properties);
    if (item.billboardImage !== image) {
      billboard.image = image;
      item.billboardImage = image;
    }
    if (subRegion !== undefined) {
      billboard.setImageSubRegion(image, subRegion);
    }
    billboard.show = true;
    item.billboard = billboard;
  } catch (error) {
    if (isNew) {
      visualizer._cluster.removeBillboard(entity);
      item.billboardImage = undefined;
    }
    throw error;
  }
}

function updateLabel(visualizer, item, time, commonShow) {
  const entity = item.entity;
  const graphic = entity._label;
  if (graphic === undefined) {
    releaseGraphic(item, entity, visualizer._cluster, "label");
    return;
  }
  const text = optional(graphic._text, time);
  const show = commonShow && value(graphic._show, time, true);
  const position = show
    ? resolvePosition(visualizer, entity, graphic, time)
    : undefined;
  if (!show || position === undefined || text === undefined) {
    hide(item.label);
    return;
  }

  const properties = {
    text,
    scale: value(graphic._scale, time, 1.0),
    font: value(graphic._font, time, "30px sans-serif"),
    style: value(graphic._style, time, LabelStyle.FILL),
    fillColor: value(graphic._fillColor, time, Color.WHITE),
    outlineColor: value(graphic._outlineColor, time, Color.BLACK),
    outlineWidth: value(graphic._outlineWidth, time, 1.0),
    showBackground: value(graphic._showBackground, time, false),
    backgroundColor: value(
      graphic._backgroundColor,
      time,
      defaultBackgroundColor,
    ),
    backgroundPadding: value(
      graphic._backgroundPadding,
      time,
      defaultBackgroundPadding,
    ),
    pixelOffset: value(graphic._pixelOffset, time, defaultCartesian2),
    eyeOffset: value(graphic._eyeOffset, time, defaultCartesian3),
    horizontalOrigin: value(
      graphic._horizontalOrigin,
      time,
      HorizontalOrigin.CENTER,
    ),
    verticalOrigin: value(graphic._verticalOrigin, time, VerticalOrigin.CENTER),
    translucencyByDistance: optional(graphic._translucencyByDistance, time),
    pixelOffsetScaleByDistance: optional(
      graphic._pixelOffsetScaleByDistance,
      time,
    ),
    scaleByDistance: optional(graphic._scaleByDistance, time),
    distanceDisplayCondition: optional(graphic._distanceDisplayCondition, time),
    disableDepthTestDistance: optional(graphic._disableDepthTestDistance, time),
  };
  validateMappedValues(properties);

  const isNew = item.label === undefined;
  const label = item.label ?? visualizer._cluster.getLabel(entity);
  try {
    label.id = entity;
    label.position = position;
    label.heightReference = HeightReference.NONE;
    Object.assign(label, properties);
    label.show = true;
    item.label = label;
  } catch (error) {
    if (isNew) {
      visualizer._cluster.removeLabel(entity);
    }
    throw error;
  }
}

/**
 * Visualizes planar Point, Billboard, and Label graphics using a caller-owned
 * disabled EntityCluster as a primitive pool.
 *
 * @alias SceneGISPlanarAnchorVisualizer
 * @constructor
 * @private
 */
function SceneGISPlanarAnchorVisualizer(
  world,
  scene,
  entityCluster,
  entityCollection,
) {
  if (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed()) {
    throw new DeveloperError("world must be a live SceneGISPlanarWorld.");
  }
  if (scene === undefined || scene.isDestroyed?.() === true) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  if (
    !(entityCluster instanceof EntityCluster) ||
    entityCluster.enabled !== false
  ) {
    throw new DeveloperError("entityCluster must be disabled.");
  }
  if (!(entityCollection instanceof EntityCollection)) {
    throw new DeveloperError("entityCollection is required.");
  }
  if (entityCluster._scene !== undefined && entityCluster._scene !== scene) {
    throw new DeveloperError("entityCluster must belong to scene.");
  }

  if (entityCluster._scene === undefined) {
    entityCluster._initialize(scene);
  }
  this._world = world;
  this._scene = scene;
  this._cluster = entityCluster;
  this._entityCollection = entityCollection;
  this._items = new AssociativeArray();
  entityCollection.collectionChanged.addEventListener(
    SceneGISPlanarAnchorVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(entityCollection, entityCollection.values, [], []);
}

SceneGISPlanarAnchorVisualizer.prototype.update = function (time) {
  if (time === undefined) {
    throw new DeveloperError("time is required.");
  }
  if (this._cluster.enabled !== false) {
    throw new DeveloperError("entityCluster must remain disabled.");
  }
  const items = this._items.values;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const entity = item.entity;
    const commonShow = entity.isShowing && entity.isAvailable(time);
    updatePoint(this, item, time, commonShow);
    updateBillboard(this, item, time, commonShow);
    updateLabel(this, item, time, commonShow);
  }
  return true;
};

SceneGISPlanarAnchorVisualizer.prototype.getBoundingSphere = function (
  entity,
  result,
) {
  if (entity === undefined || result === undefined) {
    throw new DeveloperError("entity and result are required.");
  }
  const item = this._items.get(entity.id);
  if (item === undefined) {
    return BoundingSphereState.FAILED;
  }
  scratchBoundingPositions.length = 0;
  const slots = [item.point, item.billboard, item.label];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (slot !== undefined && slot.show) {
      scratchBoundingPositions.push(slot.position);
    }
  }
  if (scratchBoundingPositions.length === 0) {
    return BoundingSphereState.FAILED;
  }
  BoundingSphere.fromPoints(scratchBoundingPositions, result);
  return BoundingSphereState.DONE;
};

SceneGISPlanarAnchorVisualizer.prototype.isDestroyed = function () {
  return false;
};

SceneGISPlanarAnchorVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    SceneGISPlanarAnchorVisualizer.prototype._onCollectionChanged,
    this,
  );
  const items = this._items.values;
  for (let i = items.length - 1; i >= 0; i--) {
    releaseItem(items[i], this._cluster);
  }
  this._items.removeAll();
  return destroyObject(this);
};

SceneGISPlanarAnchorVisualizer.prototype._onCollectionChanged = function (
  entityCollection,
  added,
  removed,
  changed,
) {
  for (let i = added.length - 1; i >= 0; i--) {
    const entity = added[i];
    if (hasAnchorGraphic(entity)) {
      this._items.set(entity.id, { entity });
    }
  }
  for (let i = changed.length - 1; i >= 0; i--) {
    const entity = changed[i];
    const old = this._items.get(entity.id);
    if (hasAnchorGraphic(entity)) {
      this._items.set(entity.id, old ?? { entity });
      if (old !== undefined) {
        old.entity = entity;
        if (entity._point === undefined) {
          releaseGraphic(old, entity, this._cluster, "point");
        }
        if (entity._billboard === undefined) {
          releaseGraphic(old, entity, this._cluster, "billboard");
        }
        if (entity._label === undefined) {
          releaseGraphic(old, entity, this._cluster, "label");
        }
      }
    } else if (old !== undefined) {
      releaseItem(old, this._cluster);
      this._items.remove(entity.id);
    }
  }
  for (let i = removed.length - 1; i >= 0; i--) {
    const entity = removed[i];
    const item = this._items.get(entity.id);
    if (item !== undefined) {
      releaseItem(item, this._cluster);
      this._items.remove(entity.id);
    }
  }
};

export default SceneGISPlanarAnchorVisualizer;

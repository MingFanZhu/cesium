import validatePlanarShadowMode from "../../Scene/_private/_SceneGISPlanarShadowMode.js";
import AssociativeArray from "../../../Core/AssociativeArray.js";
import BoundingSphere from "../../../Core/BoundingSphere.js";
import BoundingSphereState from "../../../DataSources/BoundingSphereState.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import Cartesian3 from "../../../Core/Cartesian3.js";
import Color from "../../../Core/Color.js";
import ColorBlendMode from "../../../Scene/ColorBlendMode.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import EntityCollection from "../../../DataSources/EntityCollection.js";
import HeightReference from "../../../Scene/HeightReference.js";
import Matrix4 from "../../../Core/Matrix4.js";
import Model from "../../../Scene/Model/Model.js";
import ModelAnimationLoop from "../../../Scene/ModelAnimationLoop.js";
import Property from "../../../DataSources/Property.js";
import Resource from "../../../Core/Resource.js";
import ShadowMode from "../../../Scene/ShadowMode.js";
import destroyObject from "../../../Core/destroyObject.js";
import SceneGISPlanarPositionResolver from "./_SceneGISPlanarPositionResolver.js";
import SceneGISPlanarEntityTransform from "./_SceneGISPlanarEntityTransform.js";
import SceneGISPlanarWorld from "../../Scene/SceneGISPlanarWorld.js";

const scratchPosition = new Cartesian3();
const scratchResolved = new Cartesian3();
const scratchMatrix = new Matrix4();
const scratchColor = new Color();
const scratchLightColor = new Cartesian3();
const scratchColorArray = new Array(4);
const scratchNodeMatrix = new Matrix4();
const defaultImageBasedLightingFactor = new Cartesian2(1.0, 1.0);
const disabledEnvironmentMapOptions = Object.freeze({ enabled: false });

function value(property, time, defaultValue, result) {
  return Property.getValueOrDefault(property, time, defaultValue, result);
}

function optional(property, time, result) {
  return Property.getValueOrUndefined(property, time, result);
}

function validateFiniteNumber(name, number, minimum) {
  if (!Number.isFinite(number) || (minimum !== undefined && number < minimum)) {
    throw new DeveloperError(`${name} must be a finite valid number.`);
  }
}

function validateFiniteComponents(name, object, components, minimum) {
  if (object === undefined) {
    return;
  }
  if (object === null || typeof object !== "object") {
    throw new DeveloperError(`${name} must be an object.`);
  }
  for (let i = 0; i < components.length; i++) {
    const component = object[components[i]];
    if (
      !Number.isFinite(component) ||
      (minimum !== undefined && component < minimum)
    ) {
      throw new DeveloperError(`${name} must have finite valid components.`);
    }
  }
}

function validateDistanceDisplayCondition(condition) {
  if (condition === undefined) {
    return;
  }
  if (
    !Number.isFinite(condition.near) ||
    !Number.isFinite(condition.far) ||
    condition.near < 0.0 ||
    condition.far <= condition.near
  ) {
    throw new DeveloperError(
      "distanceDisplayCondition must have valid ordered bounds.",
    );
  }
}

function validateNodeTransformations(transformations) {
  if (transformations === undefined) {
    return;
  }
  const names = Object.keys(transformations);
  for (let i = 0; i < names.length; i++) {
    const transformation = transformations[names[i]];
    if (transformation === undefined) {
      continue;
    }
    validateFiniteComponents("node translation", transformation.translation, [
      "x",
      "y",
      "z",
    ]);
    validateFiniteComponents("node rotation", transformation.rotation, [
      "x",
      "y",
      "z",
      "w",
    ]);
    validateFiniteComponents("node scale", transformation.scale, [
      "x",
      "y",
      "z",
    ]);
  }
}

function validateArticulations(articulations) {
  if (articulations === undefined) {
    return;
  }
  const names = Object.keys(articulations);
  for (let i = 0; i < names.length; i++) {
    const articulation = articulations[names[i]];
    if (articulation !== undefined && !Number.isFinite(articulation)) {
      throw new DeveloperError("articulation values must be finite.");
    }
  }
}

function destroyCandidate(candidate) {
  if (candidate !== undefined && candidate.isDestroyed?.() !== true) {
    candidate.destroy();
  }
}

function removeActive(visualizer, item) {
  if (item.model !== undefined) {
    visualizer._primitives.removeAndDestroy(item.model);
    item.model = undefined;
  }
}

function rollbackCandidate(visualizer, candidate) {
  let contained = false;
  try {
    contained =
      typeof visualizer._primitives.contains === "function" &&
      visualizer._primitives.contains(candidate);
  } catch {
    // Preserve the original insertion or property-application failure.
  }
  if (contained) {
    try {
      visualizer._primitives.remove(candidate);
    } catch {
      // Preserve the original insertion or property-application failure.
    }
  }
  try {
    const remains =
      typeof visualizer._primitives.contains === "function" &&
      visualizer._primitives.contains(candidate);
    if (!remains) {
      destroyCandidate(candidate);
    }
  } catch {
    // Preserve the original insertion or property-application failure.
  }
}

function invalidateGeneration(visualizer, item) {
  item.generation++;
  removeActive(visualizer, item);
  destroyCandidate(item.candidate);
  item.candidate = undefined;
  item.promise = undefined;
  item.failed = false;
  item.modelUpdated = false;
  item.animationsRunning = undefined;
}

function releaseItem(visualizer, item) {
  item.live = false;
  invalidateGeneration(visualizer, item);
}

function validateUnsupported(graphics, time) {
  if (value(graphics._enableVerticalExaggeration, time, false) === true) {
    throw new DeveloperError(
      "enableVerticalExaggeration must be false for planar models.",
    );
  }
  if (optional(graphics._environmentMapOptions, time) !== undefined) {
    throw new DeveloperError("environmentMapOptions is not supported.");
  }
  if (optional(graphics._clippingPlanes, time) !== undefined) {
    throw new DeveloperError("clippingPlanes is not supported.");
  }
  if (optional(graphics._customShader, time) !== undefined) {
    throw new DeveloperError("customShader is not supported.");
  }
}

function evaluateState(visualizer, item, time) {
  const entity = item.entity;
  const graphics = entity._model;
  validateUnsupported(graphics, time);

  const uriValue = optional(graphics._uri, time);
  const resource =
    uriValue === undefined ? undefined : Resource.createIfNeeded(uriValue);
  const incrementallyLoadTextures = value(
    graphics._incrementallyLoadTextures,
    time,
    true,
  );
  if (typeof incrementallyLoadTextures !== "boolean") {
    throw new DeveloperError("incrementallyLoadTextures must be boolean.");
  }

  const show =
    entity.isShowing &&
    entity.isAvailable(time) &&
    value(graphics._show, time, true);
  const inputPosition = optional(entity._position, time, scratchPosition);
  let position;
  if (inputPosition !== undefined) {
    position = SceneGISPlanarPositionResolver.resolve(
      visualizer._world,
      inputPosition,
      value(graphics._heightReference, time, HeightReference.NONE),
      scratchResolved,
    );
  }
  const orientation = optional(entity._orientation, time);
  const modelMatrix =
    position === undefined
      ? undefined
      : Matrix4.clone(
          SceneGISPlanarEntityTransform.computeMatrix(
            position,
            orientation,
            scratchMatrix,
          ),
          new Matrix4(),
        );

  const scale = value(graphics._scale, time, 1.0);
  const minimumPixelSize = value(graphics._minimumPixelSize, time, 0.0);
  const maximumScale = optional(graphics._maximumScale, time);
  const silhouetteSize = value(graphics._silhouetteSize, time, 0.0);
  const colorBlendAmount = value(graphics._colorBlendAmount, time, 0.5);
  validateFiniteNumber("scale", scale, 0.0);
  validateFiniteNumber("minimumPixelSize", minimumPixelSize, 0.0);
  if (maximumScale !== undefined) {
    validateFiniteNumber("maximumScale", maximumScale, 0.0);
  }
  validateFiniteNumber("silhouetteSize", silhouetteSize, 0.0);
  validateFiniteNumber("colorBlendAmount", colorBlendAmount, 0.0);
  if (colorBlendAmount > 1.0) {
    throw new DeveloperError("colorBlendAmount must not exceed 1.0.");
  }

  const distanceDisplayCondition = optional(
    graphics._distanceDisplayCondition,
    time,
  );
  validateDistanceDisplayCondition(distanceDisplayCondition);
  const silhouetteColor = Color.clone(
    value(graphics._silhouetteColor, time, Color.RED, scratchColor),
  );
  validateFiniteComponents("silhouetteColor", silhouetteColor, [
    "red",
    "green",
    "blue",
    "alpha",
  ]);
  const color = Color.clone(
    value(graphics._color, time, Color.WHITE, scratchColor),
  );
  validateFiniteComponents("color", color, ["red", "green", "blue", "alpha"]);
  const imageBasedLightingFactor = value(
    graphics._imageBasedLightingFactor,
    time,
    defaultImageBasedLightingFactor,
  );
  validateFiniteComponents(
    "imageBasedLightingFactor",
    imageBasedLightingFactor,
    ["x", "y"],
    0.0,
  );
  const runAnimations = value(graphics._runAnimations, time, true);
  const clampAnimations = value(graphics._clampAnimations, time, true);
  if (
    typeof runAnimations !== "boolean" ||
    typeof clampAnimations !== "boolean"
  ) {
    throw new DeveloperError("animation flags must be boolean.");
  }
  const nodeTransformations = optional(
    graphics._nodeTransformations,
    time,
    item.nodeTransformationsScratch,
  );
  validateNodeTransformations(nodeTransformations);
  const articulations = optional(
    graphics._articulations,
    time,
    item.articulationsScratch,
  );
  validateArticulations(articulations);

  let lightColor = optional(graphics._lightColor, time, scratchColor);
  if (lightColor !== undefined) {
    validateFiniteComponents("lightColor", lightColor, [
      "red",
      "green",
      "blue",
      "alpha",
    ]);
    Color.pack(lightColor, scratchColorArray, 0);
    lightColor = Cartesian3.clone(
      Cartesian3.unpack(scratchColorArray, 0, scratchLightColor),
      new Cartesian3(),
    );
  }

  return {
    shadows: validatePlanarShadowMode(
      value(graphics._shadows, time, ShadowMode.ENABLED),
    ),
    show,
    position,
    resource,
    generationKey:
      resource === undefined
        ? undefined
        : `${resource.url}\n${incrementallyLoadTextures}`,
    incrementallyLoadTextures,
    modelMatrix,
    scale,
    minimumPixelSize,
    maximumScale,
    distanceDisplayCondition,
    silhouetteColor,
    silhouetteSize,
    color,
    colorBlendMode: value(
      graphics._colorBlendMode,
      time,
      ColorBlendMode.HIGHLIGHT,
    ),
    colorBlendAmount,
    clampAnimations,
    imageBasedLightingFactor: Cartesian2.clone(imageBasedLightingFactor),
    lightColor,
    runAnimations,
    nodeTransformations,
    articulations,
  };
}

function startLoad(visualizer, item, state) {
  const generation = item.generation;
  const promise = Model.fromGltfAsync({
    url: state.resource,
    incrementallyLoadTextures: state.incrementallyLoadTextures,
    heightReference: HeightReference.NONE,
    enableVerticalExaggeration: false,
    shadows: state.shadows,
    environmentMapOptions: disabledEnvironmentMapOptions,
    allowPicking: true,
    enablePick: true,
  });
  item.promise = promise;
  Promise.resolve(promise).then(
    (candidate) => {
      if (
        visualizer.isDestroyed() ||
        !item.live ||
        item.generation !== generation
      ) {
        destroyCandidate(candidate);
        return;
      }
      item.promise = undefined;
      item.candidate = candidate;
      visualizer._scene.requestRender();
    },
    () => {
      if (
        visualizer.isDestroyed() ||
        !item.live ||
        item.generation !== generation
      ) {
        return;
      }
      item.promise = undefined;
      item.failed = true;
      visualizer._scene.requestRender();
    },
  );
}

function applyReadyProperties(item, model, state) {
  if (!model.ready) {
    return;
  }
  if (item.animationsRunning !== state.runAnimations) {
    if (state.runAnimations) {
      model.activeAnimations.addAll({ loop: ModelAnimationLoop.REPEAT });
    } else {
      model.activeAnimations.removeAll();
    }
    item.animationsRunning = state.runAnimations;
  }
  if (state.nodeTransformations !== undefined) {
    const names = Object.keys(state.nodeTransformations);
    for (let i = 0; i < names.length; i++) {
      const transformation = state.nodeTransformations[names[i]];
      const node = model.getNode(names[i]);
      if (transformation === undefined || node === undefined) {
        continue;
      }
      Matrix4.fromTranslationRotationScale(transformation, scratchNodeMatrix);
      node.matrix = Matrix4.multiply(
        node.originalMatrix,
        scratchNodeMatrix,
        scratchNodeMatrix,
      );
    }
  }
  let articulationChanged = false;
  if (state.articulations !== undefined) {
    const names = Object.keys(state.articulations);
    for (let i = 0; i < names.length; i++) {
      const articulationValue = state.articulations[names[i]];
      if (articulationValue !== undefined) {
        model.setArticulationStage(names[i], articulationValue);
        articulationChanged = true;
      }
    }
  }
  if (articulationChanged) {
    model.applyArticulations();
  }
}

function applyModel(item, model, state) {
  model.id = item.entity;
  model.show = state.show && state.position !== undefined;
  model.modelMatrix = Matrix4.clone(state.modelMatrix, model.modelMatrix);
  model.scale = state.scale;
  model.minimumPixelSize = state.minimumPixelSize;
  model.maximumScale = state.maximumScale;
  model.heightReference = HeightReference.NONE;
  model.enableVerticalExaggeration = false;
  model.shadows = state.shadows;
  model.distanceDisplayCondition = state.distanceDisplayCondition;
  model.silhouetteColor = state.silhouetteColor;
  model.silhouetteSize = state.silhouetteSize;
  model.color = state.color;
  model.colorBlendMode = state.colorBlendMode;
  model.colorBlendAmount = state.colorBlendAmount;
  model.clampAnimations = state.clampAnimations;
  model.imageBasedLighting.imageBasedLightingFactor =
    state.imageBasedLightingFactor;
  model.lightColor = state.lightColor;
  applyReadyProperties(item, model, state);
  item.modelUpdated = true;
}

function hasModelGraphic(entity) {
  return entity._model !== undefined && entity._position !== undefined;
}

/**
 * Visualizes planar ModelGraphics without ECEF or ellipsoid transforms.
 *
 * @alias SceneGISPlanarModelVisualizer
 * @constructor
 * @private
 */
function SceneGISPlanarModelVisualizer(
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
    typeof this._primitives.removeAndDestroy !== "function" ||
    (primitiveCollection !== undefined &&
      (typeof this._primitives.remove !== "function" ||
        typeof this._primitives.contains !== "function"))
  ) {
    throw new DeveloperError("primitiveCollection must own primitives.");
  }
  this._entityCollection = entityCollection;
  this._items = new AssociativeArray();
  entityCollection.collectionChanged.addEventListener(
    SceneGISPlanarModelVisualizer.prototype._onCollectionChanged,
    this,
  );
  this._onCollectionChanged(entityCollection, entityCollection.values, [], []);
}

SceneGISPlanarModelVisualizer.prototype.update = function (time) {
  if (time === undefined) {
    throw new DeveloperError("time is required.");
  }
  const items = this._items.values;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const state = evaluateState(this, item, time);
    if (state.generationKey !== item.generationKey) {
      invalidateGeneration(this, item);
      item.generationKey = state.generationKey;
    }
    if (state.generationKey === undefined) {
      continue;
    }
    const renderable = state.show && state.position !== undefined;
    if (
      renderable &&
      item.model === undefined &&
      item.candidate === undefined &&
      item.promise === undefined &&
      !item.failed
    ) {
      startLoad(this, item, state);
    }
    if (item.candidate !== undefined && renderable) {
      const candidate = item.candidate;
      try {
        applyModel(item, candidate, state);
        this._primitives.add(candidate);
      } catch (error) {
        rollbackCandidate(this, candidate);
        item.candidate = undefined;
        item.failed = true;
        throw error;
      }
      item.candidate = undefined;
      item.model = candidate;
    } else if (item.model !== undefined) {
      if (state.modelMatrix !== undefined) {
        applyModel(item, item.model, state);
      } else {
        item.model.show = false;
      }
    }
  }
  return true;
};

SceneGISPlanarModelVisualizer.prototype.getBoundingSphere = function (
  entity,
  result,
) {
  if (entity === undefined || result === undefined) {
    throw new DeveloperError("entity and result are required.");
  }
  const item = this._items.get(entity.id);
  if (item === undefined || item.failed) {
    return BoundingSphereState.FAILED;
  }
  const model = item.model;
  if (model === undefined) {
    return item.promise !== undefined || item.candidate !== undefined
      ? BoundingSphereState.PENDING
      : BoundingSphereState.FAILED;
  }
  if (!model.ready || !item.modelUpdated) {
    return BoundingSphereState.PENDING;
  }
  BoundingSphere.clone(model.boundingSphere, result);
  return BoundingSphereState.DONE;
};

SceneGISPlanarModelVisualizer.prototype.isDestroyed = function () {
  return false;
};

SceneGISPlanarModelVisualizer.prototype.destroy = function () {
  this._entityCollection.collectionChanged.removeEventListener(
    SceneGISPlanarModelVisualizer.prototype._onCollectionChanged,
    this,
  );
  const items = this._items.values;
  for (let i = items.length - 1; i >= 0; i--) {
    releaseItem(this, items[i]);
  }
  this._items.removeAll();
  return destroyObject(this);
};

SceneGISPlanarModelVisualizer.prototype._onCollectionChanged = function (
  entityCollection,
  added,
  removed,
  changed,
) {
  const add = (entity) => {
    const previous = this._items.get(entity.id);
    if (previous !== undefined && previous.entity !== entity) {
      remove(entity);
    }
    if (!hasModelGraphic(entity) || this._items.contains(entity.id)) {
      return;
    }
    this._items.set(entity.id, {
      entity,
      generation: 0,
      generationKey: undefined,
      promise: undefined,
      candidate: undefined,
      model: undefined,
      failed: false,
      live: true,
      modelUpdated: false,
      animationsRunning: undefined,
      nodeTransformationsScratch: {},
      articulationsScratch: {},
    });
  };
  const remove = (entity) => {
    const item = this._items.get(entity.id);
    if (item !== undefined) {
      releaseItem(this, item);
      this._items.remove(entity.id);
    }
  };
  for (let i = added.length - 1; i >= 0; i--) {
    add(added[i]);
  }
  for (let i = changed.length - 1; i >= 0; i--) {
    const entity = changed[i];
    if (hasModelGraphic(entity)) {
      add(entity);
    } else {
      remove(entity);
    }
  }
  for (let i = removed.length - 1; i >= 0; i--) {
    remove(removed[i]);
  }
};

export default SceneGISPlanarModelVisualizer;

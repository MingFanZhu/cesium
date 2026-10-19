import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import ColorGeometryInstanceAttribute from "../../Core/ColorGeometryInstanceAttribute.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import DeveloperError from "../../Core/DeveloperError.js";
import GeometryInstance from "../../Core/GeometryInstance.js";
import destroyObject from "../../Core/destroyObject.js";
import Appearance from "../../Scene/Appearance.js";
import Material from "../../Scene/Material.js";
import PerInstanceColorAppearance from "../../Scene/PerInstanceColorAppearance.js";
import PolylineMaterialAppearance from "../../Scene/PolylineMaterialAppearance.js";
import PolylineColorAppearance from "../../Scene/PolylineColorAppearance.js";
import Primitive from "../../Scene/Primitive.js";
import SceneGISPlanarPolygonGeometry from "../Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolylineGeometry from "../Core/SceneGISPlanarPolylineGeometry.js";
import createSceneGISPlanarGroundCommands from "./_private/_SceneGISPlanarGroundCommands.js";
import SceneGISPlanarGroundLineShader from "./_private/_SceneGISPlanarGroundLineShader.js";
import SceneGISPlanarGroundVolume from "./_private/_SceneGISPlanarGroundVolume.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";

function ensureAlive(primitive) {
  if (primitive.isDestroyed()) {
    throw new DeveloperError(
      "This SceneGISPlanarGroundPrimitive was destroyed.",
    );
  }
}

function kind(geometry) {
  if (geometry instanceof SceneGISPlanarPolylineGeometry) {
    return "polyline";
  }
  if (geometry instanceof SceneGISPlanarPolygonGeometry) {
    return "polygon";
  }
  throw new DeveloperError(
    "geometry must be a planar polyline or polygon geometry.",
  );
}

function isEffectivelyShown(primitive) {
  return (
    primitive._show &&
    primitive._world.show &&
    !(
      primitive._geometryKind === "polyline" &&
      primitive._currentGeometry?.width === 0
    )
  );
}

function validateAttribute(attribute) {
  if (
    attribute === undefined ||
    attribute === null ||
    typeof attribute !== "object" ||
    !ComponentDatatype.validate(attribute.componentDatatype) ||
    !Number.isInteger(attribute.componentsPerAttribute) ||
    attribute.componentsPerAttribute < 1 ||
    attribute.componentsPerAttribute > 4 ||
    typeof (attribute.normalize ?? false) !== "boolean"
  ) {
    throw new DeveloperError(
      "attributes must contain valid GeometryInstanceAttribute values.",
    );
  }
  const value = attribute.value;
  const typedArray = ArrayBuffer.isView(value) && !(value instanceof DataView);
  if (
    (!Array.isArray(value) && !typedArray) ||
    value.length !== attribute.componentsPerAttribute
  ) {
    throw new DeveloperError(
      "Each attribute value must contain one complete instance value.",
    );
  }
  const converted = ComponentDatatype.createTypedArray(
    attribute.componentDatatype,
    value,
  );
  const integerDatatype =
    attribute.componentDatatype === ComponentDatatype.BYTE ||
    attribute.componentDatatype === ComponentDatatype.UNSIGNED_BYTE ||
    attribute.componentDatatype === ComponentDatatype.SHORT ||
    attribute.componentDatatype === ComponentDatatype.UNSIGNED_SHORT ||
    attribute.componentDatatype === ComponentDatatype.INT ||
    attribute.componentDatatype === ComponentDatatype.UNSIGNED_INT;
  for (let i = 0; i < value.length; ++i) {
    if (
      typeof value[i] !== "number" ||
      !Number.isFinite(value[i]) ||
      (integerDatatype &&
        (!Number.isInteger(value[i]) || converted[i] !== value[i])) ||
      !Number.isFinite(converted[i]) ||
      (attribute.componentDatatype !== ComponentDatatype.UNSIGNED_BYTE &&
        !Number.isFinite(Math.fround(converted[i])))
    ) {
      throw new DeveloperError(
        "Attribute values must be representable by componentDatatype.",
      );
    }
  }
}

function cloneAttributes(source = {}) {
  const result = {};
  for (const name of Object.keys(source)) {
    const attribute = source[name];
    validateAttribute(attribute);
    result[name] = Object.assign(
      Object.create(Object.getPrototypeOf(attribute)),
      attribute,
      { value: attribute.value.slice() },
    );
  }
  return result;
}

function validateAppearance(geometryKind, appearance, attributes) {
  if (geometryKind === "polyline") {
    if (appearance instanceof PolylineColorAppearance) {
      if (attributes.color?.value?.length !== 4) {
        throw new DeveloperError(
          "PolylineColorAppearance requires a color instance attribute.",
        );
      }
      return;
    }
    if (
      !(appearance instanceof PolylineMaterialAppearance) ||
      appearance.material?.type !== Material.ColorType
    ) {
      throw new DeveloperError(
        "Polyline geometry requires PolylineColorAppearance or a Color PolylineMaterialAppearance.",
      );
    }
    return;
  }
  if (
    !(appearance instanceof PerInstanceColorAppearance) ||
    appearance.flat !== true
  ) {
    throw new DeveloperError(
      "Polygon geometry requires a flat PerInstanceColorAppearance.",
    );
  }
  if (attributes.color?.value?.length !== 4) {
    throw new DeveloperError(
      "Polygon geometry requires a color instance attribute.",
    );
  }
}

function validateOptions(options) {
  if (
    !(options.world instanceof SceneGISPlanarWorld) ||
    options.world.isDestroyed()
  ) {
    throw new DeveloperError("world must be a live SceneGISPlanarWorld.");
  }
  const geometryKind = kind(options.geometry);
  if (
    geometryKind === "polygon" &&
    options.geometry._bottomPositions !== undefined
  ) {
    throw new DeveloperError("Ground polygons must not be extruded.");
  }
  if (
    options.heightReference !== undefined ||
    options.extrudedHeightReference !== undefined ||
    options._heightReferences !== undefined
  ) {
    throw new DeveloperError(
      "Ground primitives implicitly clamp to the planar surface and do not accept height references.",
    );
  }
  if (options.id === undefined || options.id === null) {
    throw new DeveloperError("id is required.");
  }
  const attributes = cloneAttributes(options.attributes);
  validateAppearance(geometryKind, options.appearance, attributes);
  const show = options.show ?? true;
  const allowPicking = options.allowPicking ?? true;
  if (typeof show !== "boolean" || typeof allowPicking !== "boolean") {
    throw new DeveloperError("show and allowPicking must be boolean.");
  }
  return { geometryKind, attributes, show, allowPicking };
}

function snapshotBatch(options) {
  const input = options.geometryInstances;
  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    options.geometry !== undefined ||
    options.id !== undefined ||
    options.attributes !== undefined ||
    options.modelMatrix !== undefined
  ) {
    throw new DeveloperError(
      "geometryInstances must be a non-empty array and cannot be combined with geometry, id, attributes, or modelMatrix.",
    );
  }
  const ids = new Set();
  const boundsById = new Map();
  let bounds;
  let first;
  const instances = input.map(function (source) {
    if (source?.modelMatrix !== undefined) {
      throw new DeveloperError("Ground instances do not support modelMatrix.");
    }
    const validated = validateOptions({
      ...options,
      geometry: source?.geometry,
      id: source?.id,
      attributes: source?.attributes,
    });
    if (ids.has(source.id)) {
      throw new DeveloperError("Each ground instance must have a unique id.");
    }
    ids.add(source.id);
    if (first !== undefined && first.geometryKind !== validated.geometryKind) {
      throw new DeveloperError(
        "A ground batch must contain only polygons or only polylines.",
      );
    }
    const attributes = validated.attributes;
    if (first !== undefined) {
      const names = Object.keys(first.attributes);
      if (
        Object.keys(attributes).length !== names.length ||
        names.some(
          (name) =>
            attributes[name]?.componentDatatype !==
              first.attributes[name].componentDatatype ||
            attributes[name]?.componentsPerAttribute !==
              first.attributes[name].componentsPerAttribute ||
            (attributes[name]?.normalize ?? false) !==
              (first.attributes[name].normalize ?? false),
        )
      ) {
        throw new DeveloperError(
          "Ground instances must use the same attribute schema.",
        );
      }
    }
    first ??= validated;
    const presentation = SceneGISPlanarGroundVolume.createPresentationBounds(
      source.geometry,
    );
    boundsById.set(source.id, presentation);
    const sphere = new BoundingSphere(
      presentation.center,
      presentation.horizontalRadius,
    );
    bounds =
      bounds === undefined
        ? sphere
        : BoundingSphere.union(bounds, sphere, bounds);
    return { geometry: source.geometry, id: source.id, attributes };
  });
  return {
    instances,
    validated: first,
    boundsById,
    presentationBounds: {
      center: bounds.center,
      horizontalRadius: bounds.radius,
    },
  };
}

function createCandidate(primitive, frameState) {
  const entries = primitive._batch?.instances ?? [
    {
      geometry: primitive._geometry,
      id: primitive._id,
      attributes: primitive._attributes,
    },
  ];
  const origin =
    primitive._batch === undefined ? undefined : entries[0].geometry.origin;
  let volume;
  let bounds;
  let vertexCount = 0;
  const instances = entries.map(function (entry) {
    const created = SceneGISPlanarGroundVolume.create(
      primitive._world,
      entry.geometry,
      origin,
    );
    volume ??= created;
    bounds =
      bounds === undefined
        ? BoundingSphere.clone(created.geometry.boundingSphere)
        : BoundingSphere.union(bounds, created.geometry.boundingSphere, bounds);
    vertexCount += created.geometry.attributes.position.values.length / 3;
    const attributes = cloneAttributes(entry.attributes);
    if (primitive._appearance instanceof PolylineMaterialAppearance) {
      attributes.color = ColorGeometryInstanceAttribute.fromColor(
        primitive._appearance.material.uniforms.color,
      );
    }
    return new GeometryInstance({
      geometry: created.geometry,
      id: entry.id,
      pickPrimitive: primitive,
      attributes,
    });
  });
  if (
    primitive._batch !== undefined &&
    primitive._geometryKind === "polygon" &&
    vertexCount > 65535 &&
    !frameState.context.elementIndexUint
  ) {
    throw new DeveloperError(
      "Ground batches above 65535 vertices require uint element indices.",
    );
  }
  const internalAppearance =
    primitive._geometryKind === "polyline"
      ? new Appearance({
          vertexShaderSource: SceneGISPlanarGroundLineShader.vertexShaderSource,
          fragmentShaderSource:
            SceneGISPlanarGroundLineShader.fragmentShaderSource,
          renderState: Appearance.getDefaultRenderState(false, true),
          closed: true,
          translucent: false,
        })
      : new Appearance({
          vertexShaderSource:
            SceneGISPlanarGroundLineShader.areaVertexShaderSource,
          fragmentShaderSource:
            SceneGISPlanarGroundLineShader.areaFragmentShaderSource,
          renderState: Appearance.getDefaultRenderState(false, true),
          closed: true,
          translucent: false,
        });
  const commands = createSceneGISPlanarGroundCommands(primitive);
  const candidate = new Primitive({
    geometryInstances:
      primitive._batch === undefined ? instances[0] : instances,
    appearance: internalAppearance,
    asynchronous: false,
    releaseGeometryInstances: primitive._batch !== undefined,
    allowPicking: primitive._allowPicking,
    cull: false,
    modelMatrix: volume.modelMatrix,
    _createPickOffsets:
      primitive._batch !== undefined && primitive._geometryKind === "polygon",
    _updateAndQueueCommandsFunction: commands.updateAndQueue,
  });
  candidate.show =
    primitive._show &&
    primitive._world.show &&
    !(
      primitive._geometryKind === "polyline" && primitive._geometry?.width === 0
    );
  const commandList = frameState.commandList;
  const candidateCommands = [];
  frameState.commandList = candidateCommands;
  try {
    candidate.update(frameState);
  } catch (error) {
    try {
      candidate.destroy();
    } catch {
      // Preserve the original initialization error.
    }
    throw error;
  } finally {
    frameState.commandList = commandList;
  }
  return {
    candidate,
    commands,
    candidateCommands,
    volume: {
      ...volume,
      geometry: { boundingSphere: bounds },
      presentationBounds:
        primitive._batch?.presentationBounds ?? volume.presentationBounds,
    },
  };
}

function syncCurrentPolylineColor(primitive) {
  if (
    !(primitive._appearance instanceof PolylineMaterialAppearance) ||
    !primitive._current?.ready
  ) {
    return;
  }
  const desired = ColorGeometryInstanceAttribute.toValue(
    primitive._appearance.material.uniforms.color,
    primitive._colorScratch,
  );
  const current = primitive._currentColor;
  if (
    current !== undefined &&
    current[0] === desired[0] &&
    current[1] === desired[1] &&
    current[2] === desired[2] &&
    current[3] === desired[3]
  ) {
    return;
  }
  if (primitive._batch === undefined) {
    primitive._current.getGeometryInstanceAttributes(primitive._id).color =
      desired;
  } else {
    for (const instance of primitive._batch.instances) {
      primitive._current.getGeometryInstanceAttributes(instance.id).color =
        desired;
    }
  }
  primitive._currentColor ??= new Uint8Array(4);
  primitive._currentColor.set(desired);
}

function preserveCurrentAttributes(primitive) {
  if (primitive._current?.ready !== true) {
    return;
  }
  const entries = primitive._batch?.instances ?? [
    { id: primitive._id, attributes: primitive._attributes },
  ];
  for (const entry of entries) {
    const current = primitive._current.getGeometryInstanceAttributes(entry.id);
    for (const name of Object.keys(entry.attributes)) {
      const value = current[name];
      if (value !== undefined) {
        entry.attributes[name].value = value.slice();
      }
    }
  }
}

/**
 * Renders planar polylines or non-extruded polygons clamped to the current planar surface.
 * A static batch shares one native Primitive and its vertex buffers. Lines use one command per
 * vertex array with fragment clipping against surface depth. Area stencil/color ranges remain
 * isolated for picking, different colors, and translucent objects. Compatible opaque area ranges
 * are coalesced within the stencil counter capacity.
 *
 * @alias SceneGISPlanarGroundPrimitive
 * @constructor
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarWorld} options.world The live caller-owned planar world.
 * @param {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry} [options.geometry] The source footprint, required unless geometryInstances is supplied. Source Z values are ignored.
 * @param {SceneGISPlanarGroundPrimitive.GeometryInstanceOptions[]} [options.geometryInstances] A non-empty static batch of only polylines or only polygons. Mutually exclusive with geometry, id, and attributes. Topology changes require a new batch.
 * @param {PolylineMaterialAppearance|PolylineColorAppearance|PerInstanceColorAppearance} options.appearance The compatible caller-owned Color appearance.
 * @param {*} [options.id] The required non-null identifier for a single geometry.
 * @param {Object.<string, SceneGISPlanarPrimitive.InstanceAttribute>} [options.attributes] Instance attributes.
 * @param {boolean} [options.show=true] Whether the primitive is shown.
 * @param {boolean} [options.allowPicking=true] Whether picking resources are created.
 * @exception {DeveloperError} The world, geometry, appearance, id, attributes, or boolean options are invalid.
 */
function SceneGISPlanarGroundPrimitive(options) {
  options = options ?? {};
  const batch =
    options.geometryInstances === undefined
      ? undefined
      : snapshotBatch(options);
  const validated = batch?.validated ?? validateOptions(options);
  this._batch = batch;
  this._world = options.world;
  this._geometry = options.geometry;
  this._geometryKind = validated.geometryKind;
  this._appearance = options.appearance;
  this._attributes = validated.attributes;
  this._show = validated.show;
  this._allowPicking = validated.allowPicking;
  this._id = options.id;
  this._desiredPresentationBounds =
    batch?.presentationBounds ??
    SceneGISPlanarGroundVolume.createPresentationBounds(options.geometry);
  this._current = undefined;
  this._currentCommands = undefined;
  this._currentGeometry = undefined;
  this._currentBoundingSphere = undefined;
  this._currentLocalBoundingSphere = undefined;
  this._currentOrigin = undefined;
  this._currentEnvelope = undefined;
  this._currentPresentationBounds = undefined;
  this._candidateRequired = true;
  this._context = undefined;
  this._colorScratch = new Uint8Array(4);
  this._currentColor = undefined;
}

/**
 * A static ground footprint instance. Inputs are copied; geometry and id remain caller-owned.
 *
 * @typedef {object} SceneGISPlanarGroundPrimitive.GeometryInstanceOptions
 * @property {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry} geometry The source footprint. Only non-extruded polygons are accepted. Source Z is ignored.
 * @property {*} id A unique, non-null business identifier within the batch.
 * @property {Object.<string, SceneGISPlanarPrimitive.InstanceAttribute>} [attributes] Native per-instance attributes with an identical schema across the batch.
 */

Object.defineProperties(SceneGISPlanarGroundPrimitive.prototype, {
  geometry: {
    get: function () {
      ensureAlive(this);
      return this._geometry;
    },
    set: function (value) {
      ensureAlive(this);
      if (this._batch !== undefined) {
        throw new DeveloperError(
          "Create a new primitive to replace batched ground geometry.",
        );
      }
      if (kind(value) !== this._geometryKind) {
        throw new DeveloperError(
          "geometry replacement must preserve the construction-time geometry kind.",
        );
      }
      validateOptions({
        world: this._world,
        geometry: value,
        appearance: this._appearance,
        id: this._id,
        attributes: this._attributes,
        show: this._show,
        allowPicking: this._allowPicking,
      });
      if (value !== this._geometry) {
        this._geometry = value;
        this._desiredPresentationBounds =
          SceneGISPlanarGroundVolume.createPresentationBounds(value);
        this._candidateRequired = true;
      }
    },
  },
  appearance: {
    get: function () {
      ensureAlive(this);
      return this._appearance;
    },
    set: function (value) {
      ensureAlive(this);
      if (this._batch === undefined) {
        validateAppearance(this._geometryKind, value, this._attributes);
      } else {
        for (const instance of this._batch.instances) {
          validateAppearance(this._geometryKind, value, instance.attributes);
        }
      }
      if (value !== this._appearance) {
        this._appearance = value;
        this._candidateRequired = true;
      }
    },
  },
  show: {
    get: function () {
      ensureAlive(this);
      return this._show;
    },
    set: function (value) {
      ensureAlive(this);
      if (typeof value !== "boolean") {
        throw new DeveloperError("show must be boolean.");
      }
      this._show = value;
      if (this._current !== undefined) {
        this._current.show = isEffectivelyShown(this);
      }
    },
  },
  id: {
    get: function () {
      return this._id;
    },
  },
  allowPicking: {
    get: function () {
      return this._allowPicking;
    },
  },
  ready: {
    get: function () {
      return this._current?.ready === true;
    },
  },
});

/**
 * Returns whether the scene provides the stencil buffer and depth textures required
 * to support both planar ground polygons and polylines.
 *
 * @param {Scene} scene The scene to test.
 * @returns {boolean} Whether planar ground rendering is supported.
 */
SceneGISPlanarGroundPrimitive.isSupported = function (scene) {
  return (
    scene?.context?.stencilBuffer === true &&
    scene.context.depthTexture === true
  );
};

SceneGISPlanarGroundPrimitive.prototype.update = function (frameState) {
  ensureAlive(this);
  if (this._context !== undefined && this._context !== frameState.context) {
    throw new DeveloperError(
      "A SceneGISPlanarGroundPrimitive can only be used with one Context.",
    );
  }
  if (this._world._frameState !== frameState) {
    throw new DeveloperError(
      "SceneGISPlanarGroundPrimitive must render with its world's frameState.",
    );
  }
  if (frameState.scene3DOnly !== true) {
    throw new DeveloperError(
      "SceneGISPlanarGroundPrimitive requires a scene3DOnly frame state.",
    );
  }
  if (!frameState.context.stencilBuffer) {
    throw new DeveloperError(
      "SceneGISPlanarGroundPrimitive requires a stencil buffer.",
    );
  }
  if (this._geometryKind === "polyline" && !frameState.context.depthTexture) {
    throw new DeveloperError("Planar ground polylines require depth textures.");
  }
  if (!frameState.passes.render && this._current === undefined) {
    return;
  }
  if (frameState.passes.render && this._candidateRequired) {
    preserveCurrentAttributes(this);
    const created = createCandidate(this, frameState);
    const previous = this._current;
    this._current = created.candidate;
    this._currentCommands = created.commands;
    this._currentGeometry = this._geometry;
    this._currentOrigin = Cartesian3.clone(created.volume.origin);
    this._currentEnvelope = created.volume.envelope;
    this._currentPresentationBounds = created.volume.presentationBounds;
    if (this._appearance instanceof PolylineMaterialAppearance) {
      this._currentColor = ColorGeometryInstanceAttribute.toValue(
        this._appearance.material.uniforms.color,
        this._currentColor,
      );
    }
    this._currentBoundingSphere = BoundingSphere.transform(
      created.volume.geometry.boundingSphere,
      created.volume.modelMatrix,
      new BoundingSphere(),
    );
    this._currentLocalBoundingSphere = BoundingSphere.clone(
      created.volume.geometry.boundingSphere,
    );
    this._candidateRequired = false;
    this._context = frameState.context;
    for (const command of created.candidateCommands) {
      frameState.commandList.push(command);
    }
    previous?.destroy();
    return;
  }
  if (this._current === undefined) {
    return;
  }
  this._current.show = isEffectivelyShown(this);
  if (frameState.passes.render) {
    syncCurrentPolylineColor(this);
    const modelMatrix = this._current.modelMatrix;
    const envelope = SceneGISPlanarGroundVolume.updateEnvelope(
      this._world,
      this._currentOrigin,
      modelMatrix,
    );
    if (
      envelope.minimum !== this._currentEnvelope.minimum ||
      envelope.maximum !== this._currentEnvelope.maximum
    ) {
      this._currentEnvelope = envelope;
      this._currentBoundingSphere = BoundingSphere.transform(
        this._currentLocalBoundingSphere,
        modelMatrix,
        this._currentBoundingSphere,
      );
    }
  }
  if (this._current._batchTable?._batchValuesDirty) {
    this._currentCommands.invalidate();
  }
  this._current.update(frameState);
};

/**
 * Gets mutable native instance attributes. Assign a property such as color or show to update the batch.
 *
 * @param {*} [id] Required for a batch; defaults to this.id for a single geometry.
 * @returns {object|undefined} The attributes, or undefined when the id is not found.
 * @exception {DeveloperError} The primitive is destroyed, not ready, or a batch id is missing.
 */
SceneGISPlanarGroundPrimitive.prototype.getGeometryInstanceAttributes =
  function (id) {
    ensureAlive(this);
    if (!this.ready) {
      throw new DeveloperError("The primitive must be ready.");
    }
    if (id === undefined && this._batch !== undefined) {
      throw new DeveloperError("id is required for a ground batch.");
    }
    return this._current.getGeometryInstanceAttributes(id ?? this._id);
  };

/**
 * Gets the presentation bounding sphere for selection and UI placement. Its
 * center uses the last successful footprint and the resident terrain height,
 * or zero when no resident height is available. Command culling continues to
 * use the private shadow-volume bounds.
 *
 * @param {BoundingSphere} result The object onto which to store the result.
 * @param {*} [id] An optional batch instance id. Omit to bound the entire primitive.
 * @returns {BoundingSphere} The modified result parameter.
 * @exception {DeveloperError} The result is missing, the id is unknown, or the primitive is destroyed.
 */
SceneGISPlanarGroundPrimitive.prototype.getBoundingSphere = function (
  result,
  id,
) {
  ensureAlive(this);
  if (!(result instanceof BoundingSphere)) {
    throw new DeveloperError("result is required.");
  }
  const presentationBounds =
    id === undefined
      ? (this._currentPresentationBounds ?? this._desiredPresentationBounds)
      : (this._batch?.boundsById.get(id) ??
        (id === this._id
          ? (this._currentPresentationBounds ?? this._desiredPresentationBounds)
          : undefined));
  if (presentationBounds === undefined) {
    throw new DeveloperError("The geometry instance id was not found.");
  }
  return SceneGISPlanarGroundVolume.updatePresentationBoundingSphere(
    this._world,
    presentationBounds,
    result,
  );
};

SceneGISPlanarGroundPrimitive.prototype.isDestroyed = function () {
  return false;
};

SceneGISPlanarGroundPrimitive.prototype.destroy = function () {
  this._current?.destroy();
  this._current = undefined;
  this._currentCommands = undefined;
  this._desiredPresentationBounds = undefined;
  this._currentPresentationBounds = undefined;
  this._batch = undefined;
  return destroyObject(this);
};

export default SceneGISPlanarGroundPrimitive;

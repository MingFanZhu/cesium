import BoundingSphere from "../../Core/BoundingSphere.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import DeveloperError from "../../Core/DeveloperError.js";
import GeometryInstance from "../../Core/GeometryInstance.js";
import GeometryPipeline from "../../Core/GeometryPipeline.js";
import Matrix4 from "../../Core/Matrix4.js";
import destroyObject from "../../Core/destroyObject.js";
import Material from "../../Scene/Material.js";
import PerInstanceColorAppearance from "../../Scene/PerInstanceColorAppearance.js";
import PolylineMaterialAppearance from "../../Scene/PolylineMaterialAppearance.js";
import PolylineColorAppearance from "../../Scene/PolylineColorAppearance.js";
import Primitive from "../../Scene/Primitive.js";
import ShadowMode from "../../Scene/ShadowMode.js";
import validatePlanarShadowMode from "./_private/_SceneGISPlanarShadowMode.js";
import SceneGISPlanarBoxGeometry from "../Core/SceneGISPlanarBoxGeometry.js";
import SceneGISPlanarCylinderGeometry from "../Core/SceneGISPlanarCylinderGeometry.js";
import SceneGISPlanarEllipsoidGeometry from "../Core/SceneGISPlanarEllipsoidGeometry.js";
import SceneGISPlanarPolygonGeometry from "../Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolylineGeometry from "../Core/SceneGISPlanarPolylineGeometry.js";
import SceneGISPlanarPolylineVolumeGeometry from "../Core/SceneGISPlanarPolylineVolumeGeometry.js";
import SceneGISPlanarWallGeometry from "../Core/SceneGISPlanarWallGeometry.js";

const scratchTranslation = new Matrix4();
const scratchWorldMatrix = new Matrix4();
const scratchSphere = new BoundingSphere();

function validateMatrix(matrix) {
  if (!(matrix instanceof Matrix4)) {
    throw new DeveloperError("modelMatrix must be a Matrix4.");
  }
  for (let i = 0; i < 16; i++) {
    if (!Number.isFinite(matrix[i])) {
      throw new DeveloperError("modelMatrix components must be finite.");
    }
  }
  if (
    matrix[3] !== 0.0 ||
    matrix[7] !== 0.0 ||
    matrix[11] !== 0.0 ||
    matrix[15] !== 1.0
  ) {
    throw new DeveloperError("modelMatrix must be affine.");
  }
}

function validateGeometry(geometry) {
  if (
    !(geometry instanceof SceneGISPlanarPolylineGeometry) &&
    !(geometry instanceof SceneGISPlanarPolygonGeometry) &&
    !(geometry instanceof SceneGISPlanarBoxGeometry) &&
    !(geometry instanceof SceneGISPlanarCylinderGeometry) &&
    !(geometry instanceof SceneGISPlanarEllipsoidGeometry) &&
    !(geometry instanceof SceneGISPlanarWallGeometry) &&
    !(geometry instanceof SceneGISPlanarPolylineVolumeGeometry)
  ) {
    throw new DeveloperError(
      "geometry must be a supported SceneGIS planar geometry.",
    );
  }
}

function getGeometryKind(geometry) {
  if (geometry instanceof SceneGISPlanarPolylineGeometry) {
    return "polyline";
  }
  if (geometry instanceof SceneGISPlanarPolygonGeometry) {
    return "polygon";
  }
  if (geometry instanceof SceneGISPlanarBoxGeometry) {
    return "box";
  }
  if (geometry instanceof SceneGISPlanarCylinderGeometry) {
    return "cylinder";
  }
  if (geometry instanceof SceneGISPlanarEllipsoidGeometry) {
    return "ellipsoid";
  }
  if (geometry instanceof SceneGISPlanarWallGeometry) {
    return "wall";
  }
  return "polylineVolume";
}

function validateAppearance(kind, appearance, attributes) {
  if (kind === "polyline") {
    if (appearance instanceof PolylineColorAppearance) {
      if (attributes?.color?.value?.length !== 4) {
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
  const polygon = kind === "polygon";
  const wall = kind === "wall";
  const volume = !polygon && !wall;
  if (
    !(appearance instanceof PerInstanceColorAppearance) ||
    (polygon && appearance.flat !== true) ||
    (wall && (appearance.flat !== false || appearance.closed !== false)) ||
    (volume && (appearance.flat !== false || appearance.closed !== true))
  ) {
    throw new DeveloperError(
      wall
        ? "Wall geometry requires an open non-flat PerInstanceColorAppearance."
        : volume
          ? "Volume geometry requires a closed non-flat PerInstanceColorAppearance."
          : "Polygon geometry requires a flat PerInstanceColorAppearance.",
    );
  }
  const color = attributes?.color?.value;
  if (color === undefined || color.length !== 4) {
    throw new DeveloperError(
      "Polygon geometry requires a color instance attribute.",
    );
  }
  for (let i = 0; i < color.length; i++) {
    if (!Number.isFinite(color[i])) {
      throw new DeveloperError("The color instance attribute must be finite.");
    }
  }
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
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== "number" || !Number.isFinite(value[i])) {
      throw new DeveloperError("Attribute values must be finite numbers.");
    }
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
  for (let i = 0; i < converted.length; i++) {
    if (
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

function cloneAttributes(attributes) {
  const source = attributes ?? {};
  const result = {};
  for (const name of Object.keys(source)) {
    const attribute = source[name];
    validateAttribute(attribute);
    result[name] = Object.assign(
      Object.create(Object.getPrototypeOf(attribute)),
      attribute,
      {
        value: attribute.value.slice(),
      },
    );
  }
  return result;
}

function prepareCandidateAttributes(wrapper, source, id) {
  const attributes = cloneAttributes(source);
  if (wrapper._current?.ready !== true) {
    return attributes;
  }
  const current = wrapper._current.getGeometryInstanceAttributes(id);
  for (const name of Object.keys(attributes)) {
    const value = current[name];
    if (value === undefined || typeof value.slice !== "function") {
      throw new DeveloperError(
        `The current ${name} attribute cannot be preserved during replacement.`,
      );
    }
    attributes[name].value = value.slice();
    validateAttribute(attributes[name]);
  }
  return attributes;
}

function computeWorldMatrix(geometry, modelMatrix, result) {
  Matrix4.fromTranslation(geometry._origin, scratchTranslation);
  return Matrix4.multiply(scratchTranslation, modelMatrix, result);
}

function snapshotInstances(options) {
  if (
    options.geometry !== undefined ||
    options.id !== undefined ||
    options.attributes !== undefined
  ) {
    throw new DeveloperError(
      "geometryInstances cannot be combined with geometry, id, or attributes.",
    );
  }
  const input = options.geometryInstances;
  if (!Array.isArray(input) || input.length === 0) {
    throw new DeveloperError("geometryInstances must be a non-empty array.");
  }
  const ids = new Set();
  const boundsById = new Map();
  let bounds;
  const instances = input.map(function (source) {
    validateGeometry(source?.geometry);
    if (source.id === undefined || source.id === null || ids.has(source.id)) {
      throw new DeveloperError(
        "Each geometry instance must have a unique, non-null id.",
      );
    }
    ids.add(source.id);
    const attributes = cloneAttributes(source.attributes);
    const geometryKind = getGeometryKind(source.geometry);
    validateAppearance(geometryKind, options.appearance, attributes);
    const modelMatrix = source.modelMatrix ?? Matrix4.IDENTITY;
    validateMatrix(modelMatrix);
    const instance = {
      geometry: source.geometry,
      id: source.id,
      attributes,
      modelMatrix: Matrix4.clone(modelMatrix),
    };
    source.geometry._getLocalBoundingSphere(scratchSphere);
    computeWorldMatrix(source.geometry, modelMatrix, scratchWorldMatrix);
    const sphere = BoundingSphere.transform(
      scratchSphere,
      scratchWorldMatrix,
      new BoundingSphere(),
    );
    boundsById.set(source.id, sphere);
    bounds =
      bounds === undefined
        ? BoundingSphere.clone(sphere)
        : BoundingSphere.union(bounds, sphere, bounds);
    return instance;
  });
  const first = instances[0].attributes;
  const names = Object.keys(first);
  for (let i = 1; i < instances.length; i++) {
    const attributes = instances[i].attributes;
    if (
      Object.keys(attributes).length !== names.length ||
      names.some(function (name) {
        const attribute = attributes[name];
        return (
          attribute === undefined ||
          attribute.componentDatatype !== first[name].componentDatatype ||
          attribute.componentsPerAttribute !==
            first[name].componentsPerAttribute ||
          (attribute.normalize ?? false) !== (first[name].normalize ?? false)
        );
      })
    ) {
      throw new DeveloperError(
        "Batched geometry instances must use the same attribute schema.",
      );
    }
  }
  return { instances, bounds, boundsById };
}

function ensureAlive(primitive) {
  if (primitive.isDestroyed()) {
    throw new DeveloperError("This SceneGISPlanarPrimitive was destroyed.");
  }
}

function createInternal(wrapper, attributes) {
  const batch = wrapper._batch;
  const instance =
    batch === undefined
      ? new GeometryInstance({
          geometry: wrapper._geometry._createGeometry(),
          id: wrapper._id,
          pickPrimitive: wrapper,
          attributes: cloneAttributes(attributes),
        })
      : batch.instances.map(function (source, index) {
          const instance = new GeometryInstance({
            geometry: source.geometry._createGeometry(),
            modelMatrix: computeWorldMatrix(
              source.geometry,
              source.modelMatrix,
              new Matrix4(),
            ),
            id: source.id,
            pickPrimitive: wrapper,
            attributes: cloneAttributes(attributes[index]),
          });
          // Bake in DOUBLE precision before the native combine/high-low encoding path.
          // Identity instance matrices also keep subsequent batch modelMatrix updates exact.
          return GeometryPipeline.transformToWorldCoordinates(instance);
        });
  const primitive = new Primitive({
    geometryInstances: instance,
    appearance: wrapper._appearance,
    modelMatrix:
      batch === undefined
        ? computeWorldMatrix(
            wrapper._geometry,
            wrapper._modelMatrix,
            new Matrix4(),
          )
        : wrapper._modelMatrix,
    show: wrapper._show,
    shadows: wrapper._shadows,
    allowPicking: wrapper._allowPicking,
    asynchronous: false,
    releaseGeometryInstances: batch !== undefined,
  });
  return primitive;
}

/**
 * Renders a planar geometry or a static batch through Cesium's synchronous standard Primitive path.
 * Batch topology and instance transforms are construction snapshots; create a new primitive to change them.
 * Group instances spatially and by compatible appearance to bound synchronous construction and culling costs.
 *
 * @alias SceneGISPlanarPrimitive
 * @constructor
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry|SceneGISPlanarBoxGeometry|SceneGISPlanarCylinderGeometry|SceneGISPlanarEllipsoidGeometry|SceneGISPlanarWallGeometry|SceneGISPlanarPolylineVolumeGeometry} [options.geometry] The planar geometry snapshot. Required unless geometryInstances is supplied.
 * @param {SceneGISPlanarPrimitive.GeometryInstanceOptions[]} [options.geometryInstances] A non-empty static batch. Mutually exclusive with geometry, id, and attributes. Instances must share a compatible appearance and identical attribute schemas.
 * @param {PolylineMaterialAppearance|PolylineColorAppearance|PerInstanceColorAppearance} options.appearance The compatible caller-owned appearance.
 * @param {*} [options.id] The required non-null pick identifier for the single-geometry form.
 * @param {Object.<string, SceneGISPlanarPrimitive.InstanceAttribute>} [options.attributes] Geometry instance attributes with valid component datatype, one to four components, boolean normalization, and one complete finite value.
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] A finite affine transform. Applied around the geometry origin for a single geometry, or to world coordinates for a batch.
 * @param {boolean} [options.show=true] Whether the primitive is shown.
 * @param {ShadowMode} [options.shadows=ShadowMode.DISABLED] Whether the primitive casts or receives geometry shadows.
 * @param {boolean} [options.allowPicking=true] Whether picking resources are created.
 * @exception {DeveloperError} The id is missing or the geometry, appearance, attributes, matrix, or boolean options are invalid.
 */
function SceneGISPlanarPrimitive(options) {
  options = options ?? {};
  const batch =
    options.geometryInstances === undefined
      ? undefined
      : snapshotInstances(options);
  let geometryKind;
  let attributes;
  if (batch === undefined) {
    validateGeometry(options.geometry);
    geometryKind = getGeometryKind(options.geometry);
    if (options.id === undefined || options.id === null) {
      throw new DeveloperError("id is required.");
    }
    attributes = cloneAttributes(options.attributes);
    validateAppearance(geometryKind, options.appearance, attributes);
  }
  const modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  validateMatrix(modelMatrix);
  const show = options.show ?? true;
  const allowPicking = options.allowPicking ?? true;
  if (typeof show !== "boolean" || typeof allowPicking !== "boolean") {
    throw new DeveloperError("show and allowPicking must be boolean.");
  }
  this._geometry = options.geometry;
  this._batch = batch;
  this._geometryKind = geometryKind;
  this._appearance = options.appearance;
  this._attributes = attributes;
  this._modelMatrix = modelMatrix;
  this._show = show;
  this._shadows = validatePlanarShadowMode(
    options.shadows ?? ShadowMode.DISABLED,
  );
  this._allowPicking = allowPicking;
  this._id = options.id;
  this._current = undefined;
  this._currentGeometry = undefined;
  this._candidateRequired = true;
  this._context = undefined;
}

/**
 * A construction-time planar geometry instance, using the native GeometryInstance option shape.
 * The geometry and id remain caller-owned; attributes and modelMatrix are copied.
 *
 * @typedef {object} SceneGISPlanarPrimitive.GeometryInstanceOptions
 * @property {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry|SceneGISPlanarBoxGeometry|SceneGISPlanarCylinderGeometry|SceneGISPlanarEllipsoidGeometry|SceneGISPlanarWallGeometry|SceneGISPlanarPolylineVolumeGeometry} geometry The immutable planar geometry.
 * @property {*} id A unique, non-null pick identifier within this batch.
 * @property {Object.<string, SceneGISPlanarPrimitive.InstanceAttribute>} [attributes] Native per-instance attributes, such as color and show. Every instance must use the same schema.
 * @property {Matrix4} [modelMatrix=Matrix4.IDENTITY] A finite affine transform around this geometry's origin. The world transform is batch.modelMatrix * translation(geometry.origin) * instance.modelMatrix.
 */

/**
 * The structural attribute contract, including native color, show, distance, and custom attributes.
 *
 * @typedef {object} SceneGISPlanarPrimitive.InstanceAttribute
 * @property {ComponentDatatype} componentDatatype The component datatype.
 * @property {number} componentsPerAttribute The number of components, from one to four.
 * @property {boolean} [normalize=false] Whether integer components are normalized.
 * @property {number[]|Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array} value One complete instance value.
 */

Object.defineProperties(SceneGISPlanarPrimitive.prototype, {
  /**
   * Gets or sets the native geometry shadow mode without rebuilding geometry.
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {ShadowMode}
   * @default ShadowMode.DISABLED
   */
  shadows: {
    get: function () {
      return this._shadows;
    },
    set: function (value) {
      ensureAlive(this);
      this._shadows = validatePlanarShadowMode(value);
      if (this._current !== undefined) {
        this._current.shadows = value;
      }
    },
  },
  /**
   * Gets or sets a planar geometry of the kind fixed at construction. Replacement is promoted on a normal render pass.
   * Undefined for a batch; batch topology cannot be changed through this property.
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry|SceneGISPlanarBoxGeometry|SceneGISPlanarCylinderGeometry|SceneGISPlanarEllipsoidGeometry|SceneGISPlanarWallGeometry|SceneGISPlanarPolylineVolumeGeometry|undefined}
   * @exception {DeveloperError} The value is not the construction-time geometry kind.
   */
  geometry: {
    get: function () {
      ensureAlive(this);
      return this._geometry;
    },
    set: function (value) {
      ensureAlive(this);
      if (this._batch !== undefined) {
        throw new DeveloperError(
          "Create a new primitive to replace batched geometry.",
        );
      }
      validateGeometry(value);
      if (getGeometryKind(value) !== this._geometryKind) {
        throw new DeveloperError(
          "geometry replacement must preserve the construction-time geometry kind.",
        );
      }
      validateAppearance(
        this._geometryKind,
        this._appearance,
        this._attributes,
      );
      if (value !== this._geometry) {
        this._geometry = value;
        this._candidateRequired = true;
      }
    },
  },
  /**
   * Gets or sets a caller-owned appearance compatible with the construction-time geometry kind.
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {PolylineMaterialAppearance|PolylineColorAppearance|PerInstanceColorAppearance}
   * @exception {DeveloperError} The value is incompatible with the construction-time geometry kind or attributes.
   */
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
          validateAppearance(
            getGeometryKind(instance.geometry),
            value,
            instance.attributes,
          );
        }
      }
      if (value !== this._appearance) {
        this._appearance = value;
        this._candidateRequired = true;
      }
    },
  },
  /**
   * Gets or sets a finite affine transform applied around the single geometry origin,
   * or to the world coordinates of a batch. Does not rebuild geometry.
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {Matrix4}
   */
  modelMatrix: {
    get: function () {
      ensureAlive(this);
      return Matrix4.clone(this._modelMatrix);
    },
    set: function (value) {
      ensureAlive(this);
      validateMatrix(value);
      Matrix4.clone(value, this._modelMatrix);
      if (this._current !== undefined) {
        if (this._batch !== undefined) {
          Matrix4.clone(value, this._current.modelMatrix);
        } else {
          computeWorldMatrix(
            this._currentGeometry,
            this._modelMatrix,
            this._current.modelMatrix,
          );
        }
      }
    },
  },
  /**
   * Gets or sets whether this primitive is shown.
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {boolean}
   */
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
        this._current.show = value;
      }
    },
  },
  /**
   * Gets the caller-owned pick identifier for a single geometry. Undefined for a batch.
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {*}
   * @readonly
   */
  id: {
    get: function () {
      return this._id;
    },
  },
  /**
   * Gets whether picking resources are enabled.
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {boolean}
   * @readonly
   */
  allowPicking: {
    get: function () {
      return this._allowPicking;
    },
  },
  /**
   * Gets whether the current standard Primitive is ready.
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._current?.ready === true;
    },
  },
});

/** @private */
SceneGISPlanarPrimitive.prototype.update = function (frameState) {
  ensureAlive(this);
  if (this._context !== undefined && this._context !== frameState.context) {
    throw new DeveloperError(
      "A SceneGISPlanarPrimitive can only be used with one Context.",
    );
  }
  const normalRender = frameState.passes.render === true;
  if (normalRender && this._candidateRequired) {
    if (frameState.scene3DOnly !== true) {
      throw new DeveloperError(
        "SceneGISPlanarPrimitive requires a scene3DOnly frame state.",
      );
    }
    const candidateAttributes =
      this._batch === undefined
        ? prepareCandidateAttributes(this, this._attributes, this._id)
        : this._batch.instances.map((instance) =>
            prepareCandidateAttributes(this, instance.attributes, instance.id),
          );
    const candidate = createInternal(this, candidateAttributes);
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
    this._context = frameState.context;
    const old = this._current;
    this._current = candidate;
    this._currentGeometry = this._geometry;
    if (this._batch === undefined) {
      this._attributes = candidateAttributes;
    } else {
      for (let i = 0; i < this._batch.instances.length; i++) {
        this._batch.instances[i].attributes = candidateAttributes[i];
      }
    }
    this._candidateRequired = false;
    for (let i = 0; i < candidateCommands.length; i++) {
      commandList.push(candidateCommands[i]);
    }
    old?.destroy();
    return;
  }
  if (this._current !== undefined) {
    this._current.update(frameState);
  }
};

/**
 * Gets native mutable attributes for an instance. Assign values to the returned attribute properties
 * to update the GPU without rebuilding geometry. Values survive compatible appearance replacement.
 *
 * @param {*} [id] The instance identifier. Required for a batch; defaults to this.id for a single geometry.
 * @returns {object|undefined} The current geometry instance attributes, or undefined when the id is not found.
 * @exception {DeveloperError} The primitive is destroyed or is not ready.
 */
SceneGISPlanarPrimitive.prototype.getGeometryInstanceAttributes = function (
  id,
) {
  ensureAlive(this);
  if (!this.ready) {
    throw new DeveloperError("The primitive must be ready.");
  }
  if (id === undefined && this._batch !== undefined) {
    throw new DeveloperError("id is required for a batch.");
  }
  return this._current.getGeometryInstanceAttributes(id ?? this._id);
};

/**
 * Computes the current world-space bounding sphere.
 *
 * @param {BoundingSphere} result The object onto which to store the result.
 * @param {*} [id] An optional batch instance identifier. Omit to get the entire primitive's sphere.
 * @returns {BoundingSphere} The modified result.
 * @exception {DeveloperError} The primitive is destroyed, result is invalid, or the id is not found.
 */
SceneGISPlanarPrimitive.prototype.getBoundingSphere = function (result, id) {
  ensureAlive(this);
  if (!(result instanceof BoundingSphere)) {
    throw new DeveloperError("result is required.");
  }
  if (this._batch !== undefined) {
    const bounds =
      id === undefined ? this._batch.bounds : this._batch.boundsById.get(id);
    if (bounds === undefined) {
      throw new DeveloperError("The geometry instance id was not found.");
    }
    return BoundingSphere.transform(bounds, this._modelMatrix, result);
  }
  if (id !== undefined && id !== this._id) {
    throw new DeveloperError("The geometry instance id was not found.");
  }
  const geometry = this._currentGeometry ?? this._geometry;
  geometry._getLocalBoundingSphere(scratchSphere);
  const matrix = computeWorldMatrix(
    geometry,
    this._modelMatrix,
    scratchWorldMatrix,
  );
  return BoundingSphere.transform(scratchSphere, matrix, result);
};

/**
 * Returns whether this primitive was destroyed.
 *
 * @returns {boolean} True if destroyed; otherwise, false.
 */
SceneGISPlanarPrimitive.prototype.isDestroyed = function () {
  return false;
};
/**
 * Destroys the owned standard Primitive and GPU resources.
 *
 * @returns {undefined}
 */
SceneGISPlanarPrimitive.prototype.destroy = function () {
  this._current?.destroy();
  this._current = undefined;
  this._currentGeometry = undefined;
  this._batch = undefined;
  return destroyObject(this);
};

export default SceneGISPlanarPrimitive;

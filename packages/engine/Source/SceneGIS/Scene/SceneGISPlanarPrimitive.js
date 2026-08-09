import BoundingSphere from "../../Core/BoundingSphere.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import DeveloperError from "../../Core/DeveloperError.js";
import GeometryInstance from "../../Core/GeometryInstance.js";
import Matrix4 from "../../Core/Matrix4.js";
import destroyObject from "../../Core/destroyObject.js";
import Material from "../../Scene/Material.js";
import PerInstanceColorAppearance from "../../Scene/PerInstanceColorAppearance.js";
import PolylineMaterialAppearance from "../../Scene/PolylineMaterialAppearance.js";
import Primitive from "../../Scene/Primitive.js";
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
    if (
      !(appearance instanceof PolylineMaterialAppearance) ||
      appearance.material?.type !== Material.ColorType
    ) {
      throw new DeveloperError(
        "Polyline geometry requires a Color PolylineMaterialAppearance.",
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

function prepareCandidateAttributes(wrapper) {
  const attributes = cloneAttributes(wrapper._attributes);
  if (wrapper._current?.ready !== true) {
    return attributes;
  }
  const current = wrapper._current.getGeometryInstanceAttributes(wrapper._id);
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

function ensureAlive(primitive) {
  if (primitive.isDestroyed()) {
    throw new DeveloperError("This SceneGISPlanarPrimitive was destroyed.");
  }
}

function createInternal(wrapper, attributes) {
  const instance = new GeometryInstance({
    geometry: wrapper._geometry._createGeometry(),
    id: wrapper._id,
    pickPrimitive: wrapper,
    attributes: cloneAttributes(attributes),
  });
  const primitive = new Primitive({
    geometryInstances: instance,
    appearance: wrapper._appearance,
    modelMatrix: computeWorldMatrix(
      wrapper._geometry,
      wrapper._modelMatrix,
      new Matrix4(),
    ),
    show: wrapper._show,
    allowPicking: wrapper._allowPicking,
    asynchronous: false,
    releaseGeometryInstances: false,
  });
  return primitive;
}

/**
 * Renders one supported planar geometry through Cesium's synchronous standard Primitive path.
 *
 * @alias SceneGISPlanarPrimitive
 * @constructor
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry|SceneGISPlanarBoxGeometry|SceneGISPlanarCylinderGeometry|SceneGISPlanarEllipsoidGeometry|SceneGISPlanarWallGeometry|SceneGISPlanarPolylineVolumeGeometry} options.geometry The planar geometry snapshot.
 * @param {PolylineMaterialAppearance|PerInstanceColorAppearance} options.appearance The compatible caller-owned appearance.
 * @param {*} options.id The non-null caller-owned pick identifier.
 * @param {Object.<string, GeometryInstanceAttribute>} [options.attributes] Geometry instance attributes with valid component datatype, one to four components, boolean normalization, and one complete finite value.
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] A finite affine local transform.
 * @param {boolean} [options.show=true] Whether the primitive is shown.
 * @param {boolean} [options.allowPicking=true] Whether picking resources are created.
 * @exception {DeveloperError} The id is missing or the geometry, appearance, attributes, matrix, or boolean options are invalid.
 */
function SceneGISPlanarPrimitive(options) {
  options = options ?? {};
  validateGeometry(options.geometry);
  const geometryKind = getGeometryKind(options.geometry);
  if (options.id === undefined || options.id === null) {
    throw new DeveloperError("id is required.");
  }
  const attributes = cloneAttributes(options.attributes);
  validateAppearance(geometryKind, options.appearance, attributes);
  const modelMatrix = Matrix4.clone(options.modelMatrix ?? Matrix4.IDENTITY);
  validateMatrix(modelMatrix);
  const show = options.show ?? true;
  const allowPicking = options.allowPicking ?? true;
  if (typeof show !== "boolean" || typeof allowPicking !== "boolean") {
    throw new DeveloperError("show and allowPicking must be boolean.");
  }
  this._geometry = options.geometry;
  this._geometryKind = geometryKind;
  this._appearance = options.appearance;
  this._attributes = attributes;
  this._modelMatrix = modelMatrix;
  this._show = show;
  this._allowPicking = allowPicking;
  this._id = options.id;
  this._current = undefined;
  this._currentGeometry = undefined;
  this._candidateRequired = true;
  this._context = undefined;
}

Object.defineProperties(SceneGISPlanarPrimitive.prototype, {
  /**
   * Gets or sets a planar geometry of the kind fixed at construction. Replacement is promoted on a normal render pass.
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry|SceneGISPlanarBoxGeometry|SceneGISPlanarCylinderGeometry|SceneGISPlanarEllipsoidGeometry|SceneGISPlanarWallGeometry|SceneGISPlanarPolylineVolumeGeometry}
   * @exception {DeveloperError} The value is not the construction-time geometry kind.
   */
  geometry: {
    get: function () {
      ensureAlive(this);
      return this._geometry;
    },
    set: function (value) {
      ensureAlive(this);
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
   * @type {PolylineMaterialAppearance|PerInstanceColorAppearance}
   * @exception {DeveloperError} The value is incompatible with the construction-time geometry kind or attributes.
   */
  appearance: {
    get: function () {
      ensureAlive(this);
      return this._appearance;
    },
    set: function (value) {
      ensureAlive(this);
      validateAppearance(this._geometryKind, value, this._attributes);
      if (value !== this._appearance) {
        this._appearance = value;
        this._candidateRequired = true;
      }
    },
  },
  /**
   * Gets or sets a finite affine transform applied around the geometry origin.
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
        computeWorldMatrix(
          this._currentGeometry,
          this._modelMatrix,
          this._current.modelMatrix,
        );
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
   * Gets the caller-owned pick identifier.
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
    const candidateAttributes = prepareCandidateAttributes(this);
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
    this._attributes = candidateAttributes;
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
 * Gets the mutable attributes for the current geometry instance. Assigned supported values are preserved across same-kind replacement.
 *
 * @returns {object} The current geometry instance attributes.
 * @exception {DeveloperError} The primitive is destroyed or is not ready.
 */
SceneGISPlanarPrimitive.prototype.getGeometryInstanceAttributes = function () {
  ensureAlive(this);
  if (!this.ready) {
    throw new DeveloperError("The primitive must be ready.");
  }
  return this._current.getGeometryInstanceAttributes(this._id);
};

/**
 * Computes the current world-space bounding sphere.
 *
 * @param {BoundingSphere} result The object onto which to store the result.
 * @returns {BoundingSphere} The modified result.
 * @exception {DeveloperError} The primitive is destroyed or result is invalid.
 */
SceneGISPlanarPrimitive.prototype.getBoundingSphere = function (result) {
  ensureAlive(this);
  if (!(result instanceof BoundingSphere)) {
    throw new DeveloperError("result is required.");
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
  return destroyObject(this);
};

export default SceneGISPlanarPrimitive;

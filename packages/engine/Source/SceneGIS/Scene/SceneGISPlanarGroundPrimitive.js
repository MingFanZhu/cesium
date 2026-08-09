import BoundingSphere from "../../Core/BoundingSphere.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import DeveloperError from "../../Core/DeveloperError.js";
import GeometryInstance from "../../Core/GeometryInstance.js";
import Matrix4 from "../../Core/Matrix4.js";
import destroyObject from "../../Core/destroyObject.js";
import DepthFunction from "../../Scene/DepthFunction.js";
import HeightReference from "../../Scene/HeightReference.js";
import Material from "../../Scene/Material.js";
import PerInstanceColorAppearance from "../../Scene/PerInstanceColorAppearance.js";
import PolylineMaterialAppearance from "../../Scene/PolylineMaterialAppearance.js";
import Primitive from "../../Scene/Primitive.js";
import SceneGISPlanarPolygonGeometry from "../Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolylineGeometry from "../Core/SceneGISPlanarPolylineGeometry.js";
import SceneGISPlanarGroundDraper from "./_private/_SceneGISPlanarGroundDraper.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";

const scratchSphere = new BoundingSphere();

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

function validateReference(reference, name) {
  if (
    reference !== HeightReference.NONE &&
    reference !== HeightReference.CLAMP_TO_GROUND &&
    reference !== HeightReference.RELATIVE_TO_GROUND
  ) {
    throw new DeveloperError(
      `${name} must be NONE, CLAMP_TO_GROUND, or RELATIVE_TO_GROUND.`,
    );
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
  for (let i = 0; i < value.length; ++i) {
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
  for (let i = 0; i < converted.length; ++i) {
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

function cloneAttributes(source = {}) {
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

function validatePolygonFootprint(geometry) {
  const source = geometry._getDrapeSource();
  if (source.bottom === undefined) {
    return;
  }
  for (let i = 0; i < source.top.length; ++i) {
    if (
      source.top[i].x !== source.bottom[i].x ||
      source.top[i].y !== source.bottom[i].y
    ) {
      throw new DeveloperError(
        "Ground polygon bottom positions must share the top XY footprint.",
      );
    }
  }
}

function validateAppearance(geometryKind, appearance, attributes) {
  if (geometryKind === "polyline") {
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

function deriveAppearance(geometryKind, appearance) {
  const renderState = {
    depthTest: { enabled: true, func: DepthFunction.LESS_OR_EQUAL },
    depthMask: true,
  };
  if (geometryKind === "polyline") {
    return new PolylineMaterialAppearance({
      material: appearance.material,
      translucent: appearance.translucent,
      renderState,
    });
  }
  return new PerInstanceColorAppearance({
    flat: true,
    closed: false,
    translucent: appearance.translucent,
    renderState,
  });
}

function validateOptions(options) {
  if (
    !(options.world instanceof SceneGISPlanarWorld) ||
    options.world.isDestroyed()
  ) {
    throw new DeveloperError("world must be a live SceneGISPlanarWorld.");
  }
  const geometryKind = kind(options.geometry);
  if (options.id === undefined || options.id === null) {
    throw new DeveloperError("id is required.");
  }
  const attributes = cloneAttributes(options.attributes);
  validateAppearance(geometryKind, options.appearance, attributes);
  validateReference(options.heightReference, "heightReference");
  const extruded =
    geometryKind === "polygon" &&
    options.geometry._bottomPositions !== undefined;
  if (geometryKind === "polygon") {
    validatePolygonFootprint(options.geometry);
  }
  if (extruded) {
    validateReference(
      options.extrudedHeightReference,
      "extrudedHeightReference",
    );
  } else if (options.extrudedHeightReference !== undefined) {
    throw new DeveloperError(
      "extrudedHeightReference is only valid for an extruded polygon.",
    );
  }
  const show = options.show ?? true;
  const allowPicking = options.allowPicking ?? true;
  if (typeof show !== "boolean" || typeof allowPicking !== "boolean") {
    throw new DeveloperError("show and allowPicking must be boolean.");
  }
  let heightReferences;
  if (options._heightReferences !== undefined) {
    const positions = options.geometry._getDrapeSource().positions;
    if (
      geometryKind !== "polyline" ||
      !Array.isArray(options._heightReferences) ||
      options._heightReferences.length !== positions.length
    ) {
      throw new DeveloperError(
        "Private height references must match the polyline.",
      );
    }
    heightReferences = options._heightReferences.slice();
    for (let i = 0; i < heightReferences.length; ++i) {
      validateReference(heightReferences[i], `_heightReferences[${i}]`);
    }
  }
  if (
    (heightReferences === undefined ||
      !heightReferences.some(
        (reference) => reference !== HeightReference.NONE,
      )) &&
    options.heightReference === HeightReference.NONE &&
    (!extruded || options.extrudedHeightReference === HeightReference.NONE)
  ) {
    throw new DeveloperError(
      "At least one height reference must be ground-relative.",
    );
  }
  return {
    geometryKind,
    attributes,
    show,
    allowPicking,
    extruded,
    heightReferences,
  };
}

/**
 * Renders one planar polyline or polygon continuously draped over the current planar surface.
 *
 * @alias SceneGISPlanarGroundPrimitive
 * @constructor
 * @param {object} options Object with the following properties:
 * @param {SceneGISPlanarWorld} options.world The live caller-owned planar world.
 * @param {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry} options.geometry The source geometry snapshot. An extruded ground polygon requires every bottom position to share the corresponding top position's XY coordinates.
 * @param {PolylineMaterialAppearance|PerInstanceColorAppearance} options.appearance The compatible caller-owned Color appearance.
 * @param {*} options.id The non-null caller-owned pick identifier.
 * @param {Object.<string, GeometryInstanceAttribute>} [options.attributes] Instance attributes.
 * @param {HeightReference} options.heightReference The top or line height reference.
 * @param {HeightReference} [options.extrudedHeightReference] The required bottom reference for an extruded polygon.
 * @param {boolean} [options.show=true] Whether the primitive is shown.
 * @param {boolean} [options.allowPicking=true] Whether picking resources are created.
 * @exception {DeveloperError} The world, geometry, appearance, id, attributes, references, or boolean options are invalid.
 */
function SceneGISPlanarGroundPrimitive(options) {
  options = options ?? {};
  const validated = validateOptions(options);
  this._world = options.world;
  this._geometry = options.geometry;
  this._geometryKind = validated.geometryKind;
  this._appearance = options.appearance;
  this._attributes = validated.attributes;
  this._heightReference = options.heightReference;
  this._extrudedHeightReference = options.extrudedHeightReference;
  this._show = validated.show;
  this._allowPicking = validated.allowPicking;
  this._heightReferences = validated.heightReferences;
  this._id = options.id;
  this._current = undefined;
  this._currentValid = false;
  this._currentSignature = undefined;
  this._currentGeometry = undefined;
  this._currentBoundingSphere = undefined;
  this._candidateRequired = true;
  this._context = undefined;
}

Object.defineProperties(SceneGISPlanarGroundPrimitive.prototype, {
  /**
   * Gets or sets the same-kind source geometry snapshot. Replacement is promoted on a normal render pass.
   *
   * @memberof SceneGISPlanarGroundPrimitive.prototype
   * @type {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry}
   * @exception {DeveloperError} The replacement does not preserve the construction-time geometry kind or ground-reference contract.
   */
  geometry: {
    get: function () {
      ensureAlive(this);
      return this._geometry;
    },
    set: function (value) {
      ensureAlive(this);
      if (kind(value) !== this._geometryKind) {
        throw new DeveloperError(
          "geometry replacement must preserve the construction-time geometry kind.",
        );
      }
      const options = {
        world: this._world,
        geometry: value,
        appearance: this._appearance,
        id: this._id,
        attributes: this._attributes,
        heightReference: this._heightReference,
        extrudedHeightReference: this._extrudedHeightReference,
        show: this._show,
        allowPicking: this._allowPicking,
        _heightReferences: this._heightReferences,
      };
      validateOptions(options);
      if (value !== this._geometry) {
        this._geometry = value;
        this._candidateRequired = true;
      }
    },
  },
  /**
   * Gets or sets the compatible caller-owned Color appearance.
   *
   * @memberof SceneGISPlanarGroundPrimitive.prototype
   * @type {PolylineMaterialAppearance|PerInstanceColorAppearance}
   * @exception {DeveloperError} The appearance is incompatible with the geometry kind.
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
   * Gets or sets whether the primitive is shown.
   *
   * @memberof SceneGISPlanarGroundPrimitive.prototype
   * @type {boolean}
   * @exception {DeveloperError} The value is not boolean.
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
   * @memberof SceneGISPlanarGroundPrimitive.prototype
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
   * @memberof SceneGISPlanarGroundPrimitive.prototype
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
   * @memberof SceneGISPlanarGroundPrimitive.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return this._currentValid && this._current?.ready === true;
    },
  },
});

SceneGISPlanarGroundPrimitive.prototype.update = function (frameState) {
  ensureAlive(this);
  if (this._context !== undefined && this._context !== frameState.context) {
    throw new DeveloperError(
      "A SceneGISPlanarGroundPrimitive can only be used with one Context.",
    );
  }
  if (frameState.scene3DOnly !== true) {
    throw new DeveloperError(
      "SceneGISPlanarGroundPrimitive requires a scene3DOnly frame state.",
    );
  }
  this._world._registerGroundPrimitive(this, frameState);
};

SceneGISPlanarGroundPrimitive.prototype._updateGround = function (
  frameState,
  snapshot,
  count,
  surfaceSignature,
) {
  if (this._context !== undefined && this._context !== frameState.context) {
    throw new DeveloperError(
      "A SceneGISPlanarGroundPrimitive can only be used with one Context.",
    );
  }
  const signatureGeometry = frameState.passes.render
    ? this._geometry
    : this._currentGeometry;
  const coverageSignature =
    signatureGeometry === undefined
      ? ""
      : SceneGISPlanarGroundDraper.getCoverageSignature(
          signatureGeometry,
          snapshot,
          count,
          surfaceSignature,
        );
  const signature = `${coverageSignature}:${this._geometryKind}`;
  if (!frameState.passes.render) {
    if (
      this._current !== undefined &&
      coverageSignature !== "" &&
      signature === this._currentSignature
    ) {
      this._current.update(frameState);
    }
    return;
  }
  const currentCoverageSignature =
    this._currentGeometry === undefined
      ? ""
      : SceneGISPlanarGroundDraper.getCoverageSignature(
          this._currentGeometry,
          snapshot,
          count,
          surfaceSignature,
        );
  this._currentValid =
    currentCoverageSignature !== "" &&
    `${currentCoverageSignature}:${this._geometryKind}` ===
      this._currentSignature;
  if (!this._candidateRequired && signature === this._currentSignature) {
    this._current?.update(frameState);
    return;
  }
  const draped = SceneGISPlanarGroundDraper.drape(
    this._geometry,
    this._heightReference,
    this._extrudedHeightReference,
    snapshot,
    count,
    undefined,
    this._heightReferences,
  );
  if (draped === undefined) {
    return;
  }
  const attributes = cloneAttributes(this._attributes);
  if (this._current?.ready === true) {
    const current = this._current.getGeometryInstanceAttributes(this._id);
    for (const name of Object.keys(attributes)) {
      attributes[name].value = current[name].slice();
    }
  }
  const instance = new GeometryInstance({
    geometry: draped.geometry,
    id: this._id,
    pickPrimitive: this,
    attributes,
  });
  const candidate = new Primitive({
    geometryInstances: instance,
    appearance: deriveAppearance(this._geometryKind, this._appearance),
    modelMatrix: Matrix4.fromTranslation(draped.origin, new Matrix4()),
    show: this._show,
    allowPicking: this._allowPicking,
    asynchronous: false,
    releaseGeometryInstances: false,
  });
  const commands = [];
  const commandList = frameState.commandList;
  frameState.commandList = commands;
  try {
    candidate.update(frameState);
  } catch (error) {
    try {
      candidate.destroy();
    } catch {
      // Preserve the original candidate initialization error.
    }
    throw error;
  } finally {
    frameState.commandList = commandList;
  }
  const old = this._current;
  this._current = candidate;
  this._currentValid = true;
  this._context = frameState.context;
  this._currentSignature = signature;
  this._currentGeometry = this._geometry;
  this._currentBoundingSphere = BoundingSphere.transform(
    draped.geometry.boundingSphere,
    candidate.modelMatrix,
    new BoundingSphere(),
  );
  this._attributes = attributes;
  this._candidateRequired = false;
  for (const command of commands) {
    commandList.push(command);
  }
  old?.destroy();
};

/**
 * Gets the mutable attributes for the current logical geometry instance.
 *
 * @returns {object} The current instance attributes.
 * @exception {DeveloperError} The primitive is destroyed or is not ready.
 */
SceneGISPlanarGroundPrimitive.prototype.getGeometryInstanceAttributes =
  function () {
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
SceneGISPlanarGroundPrimitive.prototype.getBoundingSphere = function (result) {
  ensureAlive(this);
  if (!(result instanceof BoundingSphere)) {
    throw new DeveloperError("result is required.");
  }
  if (this._currentBoundingSphere === undefined) {
    this._geometry._getLocalBoundingSphere(scratchSphere);
    return BoundingSphere.transform(
      scratchSphere,
      Matrix4.fromTranslation(this._geometry._origin, new Matrix4()),
      result,
    );
  }
  return BoundingSphere.clone(this._currentBoundingSphere, result);
};

/**
 * Returns whether this primitive was destroyed.
 *
 * @returns {boolean} True if destroyed; otherwise, false.
 */
SceneGISPlanarGroundPrimitive.prototype.isDestroyed = function () {
  return false;
};
/**
 * Destroys the owned standard Primitive and GPU resources.
 *
 * @returns {undefined}
 */
SceneGISPlanarGroundPrimitive.prototype.destroy = function () {
  this._current?.destroy();
  this._current = undefined;
  this._currentValid = false;
  return destroyObject(this);
};

export default SceneGISPlanarGroundPrimitive;

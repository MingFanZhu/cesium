import BoundingSphere from "../../Core/BoundingSphere.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import DeveloperError from "../../Core/DeveloperError.js";
import GeometryInstance from "../../Core/GeometryInstance.js";
import GeometryPipeline from "../../Core/GeometryPipeline.js";
import Matrix4 from "../../Core/Matrix4.js";
import destroyObject from "../../Core/destroyObject.js";
import Material from "../../Scene/Material.js";
import MaterialAppearance from "../../Scene/MaterialAppearance.js";
import BlendingState from "../../Scene/BlendingState.js";
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
      !(appearance.material instanceof Material)
    ) {
      throw new DeveloperError(
        "Polyline geometry requires PolylineColorAppearance or a PolylineMaterialAppearance with a Material.",
      );
    }
    return;
  }
  const polygon = kind === "polygon";
  const wall = kind === "wall";
  const volume = !polygon && !wall;
  if (appearance instanceof MaterialAppearance) {
    if (!(appearance.material instanceof Material)) {
      throw new DeveloperError("MaterialAppearance requires a Material.");
    }
    return;
  }
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
  const appearance = wrapper._appearance;
  // Native getRenderState enables blending for translucent material alpha, but
  // does not remove blending inherited from a translucent constructor default.
  // Keep that base state opaque without mutating the caller-owned appearance.
  const internalAppearance =
    appearance instanceof MaterialAppearance
      ? new MaterialAppearance({
          material: appearance.material,
          materialSupport: appearance.materialSupport,
          flat: appearance.flat,
          faceForward: appearance.faceForward,
          closed: appearance.closed,
          translucent: false,
          vertexShaderSource: appearance.vertexShaderSource,
          fragmentShaderSource: appearance.fragmentShaderSource,
          renderState: {
            ...appearance.renderState,
            blending: BlendingState.DISABLED,
          },
        })
      : appearance instanceof PolylineMaterialAppearance
        ? new PolylineMaterialAppearance({
            material: appearance.material,
            translucent: false,
            // The native getter adds a material-dependent POLYLINE_DASH define.
            // Retain the raw source so later material swaps can remove that define.
            vertexShaderSource: appearance._vertexShaderSource,
            fragmentShaderSource: appearance.fragmentShaderSource,
            renderState: {
              ...appearance.renderState,
              blending: BlendingState.DISABLED,
            },
          })
        : appearance;
  const batch = wrapper._batch;
  const instance =
    batch === undefined
      ? new GeometryInstance({
          geometry: wrapper._geometry._createGeometry(
            wrapper._appearance instanceof MaterialAppearance
              ? wrapper._appearance.vertexFormat
              : undefined,
          ),
          id: wrapper._id,
          pickPrimitive: wrapper,
          attributes: cloneAttributes(attributes),
        })
      : batch.instances.map(function (source, index) {
          const instance = new GeometryInstance({
            geometry: source.geometry._createGeometry(
              wrapper._appearance instanceof MaterialAppearance
                ? wrapper._appearance.vertexFormat
                : undefined,
            ),
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
    appearance: internalAppearance,
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
 * 通过 Cesium 同步标准 Primitive 路径绘制平面几何或静态批次。批次拓扑与实例变换在构造时快照保存，修改须创建新图元。按空间及兼容外观分组，以限制同步构建和剔除成本。
 * 线支持 PolylineMaterialAppearance 与原生 Fabric（包括 Arrow/Dash）。非线几何支持 MaterialAppearance 和调用方所有的 Fabric 材质。每批共享一个材质，实例颜色属性仅由颜色外观读取。原生实体使用原生 UV；多边形、墙和扫掠表面使用归一化主轴面投影，主轴变化处存在接缝。材质和外观始终归调用方所有。
 *
 * @alias SceneGISPlanarPrimitive
 * @constructor
 * @param {object} options 包含以下属性的对象：
 * @param {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry|SceneGISPlanarBoxGeometry|SceneGISPlanarCylinderGeometry|SceneGISPlanarEllipsoidGeometry|SceneGISPlanarWallGeometry|SceneGISPlanarPolylineVolumeGeometry} [options.geometry] 平面几何快照；未提供 geometryInstances 时必需。
 * @param {SceneGISPlanarPrimitive.GeometryInstanceOptions[]} [options.geometryInstances] 非空静态批次，与 geometry、id、attributes 互斥。实例须共享兼容外观与相同属性结构。
 * @param {PolylineMaterialAppearance|PolylineColorAppearance|PerInstanceColorAppearance|MaterialAppearance} options.appearance 调用方所有的兼容外观。
 * @param {*} [options.id] 单几何形式必需的非空拾取标识。
 * @param {Object.<string, SceneGISPlanarPrimitive.InstanceAttribute>} [options.attributes] 几何实例属性，须有有效分量类型、一到四个分量、布尔归一化标志及一个完整有限值。
 * @param {Matrix4} [options.modelMatrix=Matrix4.IDENTITY] 有限仿射变换；单几何围绕几何原点应用，批次则应用于世界坐标。
 * @param {boolean} [options.show=true] 是否显示图元。
 * @param {ShadowMode} [options.shadows=ShadowMode.DISABLED] 图元是否投射或接收几何阴影。
 * @param {boolean} [options.allowPicking=true] 是否创建拾取资源。
 * @exception {DeveloperError} 缺少 id，或几何、外观、属性、矩阵、布尔选项无效。
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
 * 构造时的平面几何实例，使用原生 GeometryInstance 选项结构。geometry 与 id 归调用方所有，attributes 和 modelMatrix 会复制。
 *
 * @typedef {object} SceneGISPlanarPrimitive.GeometryInstanceOptions
 * @property {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry|SceneGISPlanarBoxGeometry|SceneGISPlanarCylinderGeometry|SceneGISPlanarEllipsoidGeometry|SceneGISPlanarWallGeometry|SceneGISPlanarPolylineVolumeGeometry} geometry 不可变平面几何。
 * @property {*} id 批次内唯一且非空的拾取标识。
 * @property {Object.<string, SceneGISPlanarPrimitive.InstanceAttribute>} [attributes] 原生逐实例属性，如 color 和 show；各实例必须使用相同结构。
 * @property {Matrix4} [modelMatrix=Matrix4.IDENTITY] 围绕此几何原点的有限仿射变换，世界变换为 batch.modelMatrix * translation(geometry.origin) * instance.modelMatrix。
 */

/**
 * 属性结构契约，包含原生颜色、显隐、距离及自定义属性。
 *
 * @typedef {object} SceneGISPlanarPrimitive.InstanceAttribute
 * @property {ComponentDatatype} componentDatatype 分量数据类型。
 * @property {number} componentsPerAttribute 分量数量，范围一到四。
 * @property {boolean} [normalize=false] 整数分量是否归一化。
 * @property {number[]|Int8Array|Uint8Array|Uint8ClampedArray|Int16Array|Uint16Array|Int32Array|Uint32Array|Float32Array|Float64Array} value 一个完整的实例值。
 */

Object.defineProperties(SceneGISPlanarPrimitive.prototype, {
  /**
   * 获取或设置原生几何阴影模式，不重建几何。
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
   * 获取或设置构造时固定种类的平面几何，替换在正常渲染通道中发布。批次返回 undefined，不能通过此属性改变批次拓扑。
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry|SceneGISPlanarBoxGeometry|SceneGISPlanarCylinderGeometry|SceneGISPlanarEllipsoidGeometry|SceneGISPlanarWallGeometry|SceneGISPlanarPolylineVolumeGeometry|undefined}
   * @exception {DeveloperError} 数值不是构造时的几何种类。
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
   * 获取或设置调用方所有、与构造时几何种类兼容的外观。
   *
   * @memberof SceneGISPlanarPrimitive.prototype
   * @type {PolylineMaterialAppearance|PolylineColorAppearance|PerInstanceColorAppearance|MaterialAppearance}
   * @exception {DeveloperError} 数值与构造时几何种类或属性不兼容。
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
   * 获取或设置有限仿射变换，作用于单几何原点周围或批次世界坐标，不重建几何。
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
   * 获取或设置是否显示此图元。
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
   * 获取单几何的调用方所有拾取标识，批次返回 undefined。
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
   * 获取是否启用拾取资源。
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
   * 获取当前标准 Primitive 是否就绪。
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
    this._currentAppearance = this._appearance;
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
    if (
      this._currentAppearance instanceof MaterialAppearance ||
      this._currentAppearance instanceof PolylineMaterialAppearance
    ) {
      this._current.appearance.material = this._currentAppearance.material;
    }
    this._current.update(frameState);
  }
};

/**
 * 获取实例可修改的原生属性。给返回对象的属性赋值即可更新 GPU，无需重建几何；兼容外观替换后属性值保留。
 *
 * @param {*} [id] 实例标识；批次必需，单几何默认 this.id。
 * @returns {object|undefined} 当前几何实例属性；未找到 id 时返回 undefined。
 * @exception {DeveloperError} 图元已销毁或尚未就绪。
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
 * 计算当前世界空间包围球。
 *
 * @param {BoundingSphere} result 用于存储结果的对象。
 * @param {*} [id] 可选批次实例标识，省略则获取整个图元的包围球。
 * @returns {BoundingSphere} 已写入的结果。
 * @exception {DeveloperError} 图元已销毁、result 无效或未找到 id。
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
 * 返回此图元是否已销毁。
 *
 * @returns {boolean} 已销毁时为 True，否则为 false。
 */
SceneGISPlanarPrimitive.prototype.isDestroyed = function () {
  return false;
};
/**
 * 销毁自有标准 Primitive 与 GPU 资源。
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

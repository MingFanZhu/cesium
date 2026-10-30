import BoundingSphere from "../../Core/BoundingSphere.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import ComponentDatatype from "../../Core/ComponentDatatype.js";
import DeveloperError from "../../Core/DeveloperError.js";
import GeometryInstance from "../../Core/GeometryInstance.js";
import destroyObject from "../../Core/destroyObject.js";
import Appearance from "../../Scene/Appearance.js";
import MaterialAppearance from "../../Scene/MaterialAppearance.js";
import Material from "../../Scene/Material.js";
import PerInstanceColorAppearance from "../../Scene/PerInstanceColorAppearance.js";
import PolylineMaterialAppearance from "../../Scene/PolylineMaterialAppearance.js";
import PolylineColorAppearance from "../../Scene/PolylineColorAppearance.js";
import Primitive from "../../Scene/Primitive.js";
import SceneGISPlanarPolygonGeometry from "../Core/SceneGISPlanarPolygonGeometry.js";
import SceneGISPlanarPolylineGeometry from "../Core/SceneGISPlanarPolylineGeometry.js";
import createSceneGISPlanarGroundCommands from "./_private/_SceneGISPlanarGroundCommands.js";
import planSceneGISPlanarGroundAreas from "./_private/_SceneGISPlanarGroundAreaBatch.js";
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

function validateGroundMaterial(material) {
  if (!(material instanceof Material)) {
    throw new DeveloperError("MaterialAppearance requires a Material.");
  }
  const source = material.shaderSource.replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    "",
  );
  if (/\bdiscard\s*;/.test(source)) {
    throw new DeveloperError(
      "Ground Fabric must use material.alpha instead of discard.",
    );
  }
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
      !(appearance.material instanceof Material)
    ) {
      throw new DeveloperError(
        "Polyline geometry requires PolylineColorAppearance or a PolylineMaterialAppearance with a Material.",
      );
    }
    return;
  }
  if (appearance instanceof MaterialAppearance) {
    validateGroundMaterial(appearance.material);
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
  const materialAppearance =
    primitive._appearance instanceof MaterialAppearance ||
    primitive._appearance instanceof PolylineMaterialAppearance;
  let volume;
  let bounds;
  let vertexCount = 0;
  const extents = [];
  let lastConflicts;
  let instances = entries.map(function (entry) {
    const created = SceneGISPlanarGroundVolume.create(
      primitive._world,
      entry.geometry,
      origin,
      materialAppearance,
    );
    volume ??= created;
    extents.push(created.extent);
    bounds =
      bounds === undefined
        ? BoundingSphere.clone(created.geometry.boundingSphere)
        : BoundingSphere.union(bounds, created.geometry.boundingSphere, bounds);
    vertexCount += created.geometry.attributes.position.values.length / 3;
    const attributes = cloneAttributes(entry.attributes);
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
  if (primitive._batch !== undefined && primitive._geometryKind === "polygon") {
    // Native combine creates contiguous indices and matching batch IDs / pick
    // offsets in this order; keep the public snapshot in its original order.
    const plan = planSceneGISPlanarGroundAreas(
      entries.map((entry) => entry.geometry),
      extents,
    );
    const order = plan.order;
    lastConflicts = plan.lastConflicts;
    instances = order.map((index) => instances[index]);
  }
  const defines = materialAppearance
    ? "#define SCENEGIS_GROUND_MATERIAL\n"
    : "";
  const internalAppearance =
    primitive._geometryKind === "polyline"
      ? new Appearance({
          vertexShaderSource:
            defines + SceneGISPlanarGroundLineShader.vertexShaderSource,
          fragmentShaderSource:
            defines + SceneGISPlanarGroundLineShader.fragmentShaderSource,
          renderState: Appearance.getDefaultRenderState(false, true),
          closed: !materialAppearance,
          translucent: false,
        })
      : new Appearance({
          vertexShaderSource:
            defines + SceneGISPlanarGroundLineShader.areaVertexShaderSource,
          fragmentShaderSource:
            defines + SceneGISPlanarGroundLineShader.areaFragmentShaderSource,
          renderState: Appearance.getDefaultRenderState(false, true),
          // The queue hook owns volume state; generate one source command per VA.
          closed: !materialAppearance,
          translucent: false,
        });
  if (materialAppearance) {
    internalAppearance.material = primitive._appearance.material;
    internalAppearance.flat = primitive._appearance.flat;
    internalAppearance.faceForward = primitive._appearance.faceForward;
  }
  const commands = createSceneGISPlanarGroundCommands(
    primitive,
    instances.map((instance) => instance.id),
    lastConflicts,
    materialAppearance,
  );
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
 * 绘制贴合当前平面地表的折线或非挤出多边形。静态批次共享一个原生 Primitive 及其顶点缓冲。线每个顶点数组使用一条命令，并根据地表深度裁剪片元；XY 范围不相交的面共用一对模板/颜色命令，拾取也如此。重叠面保留输入顺序；在模板计数容量内，兼容的不透明颜色范围也可合并。
 * 材质批次共享一个 Fabric 材质，仅合并空间兼容范围。面拾取按足迹判断，包括 alpha 为零的像素；面 Fabric 须用 alpha 而非 discard，以便清理模板。线拾取遵循材质的 alpha/discard 覆盖。线 Fabric 的 st.s 为累计 XY 距离，st.t 为像素宽度坐标，支持原生 Arrow 和 Dash。
 *
 * @alias SceneGISPlanarGroundPrimitive
 * @constructor
 * @param {object} options 包含以下属性的对象：
 * @param {SceneGISPlanarWorld} options.world 调用方所有、存活的平面世界。
 * @param {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry} [options.geometry] 源足迹；未提供 geometryInstances 时必需。忽略源 Z 值。
 * @param {SceneGISPlanarGroundPrimitive.GeometryInstanceOptions[]} [options.geometryInstances] 仅包含折线或仅包含多边形的非空静态批次，与 geometry、id、attributes 互斥；拓扑变化须创建新批次。
 * @param {PolylineMaterialAppearance|PolylineColorAppearance|PerInstanceColorAppearance|MaterialAppearance} options.appearance 调用方所有的兼容外观。面 Fabric 使用深度重建的 XY 坐标，并按 geometry.stRotation 旋转；材质归调用方所有。不使用自定义外层着色器。
 * @param {*} [options.id] 单几何必需的非空标识。
 * @param {Object.<string, SceneGISPlanarPrimitive.InstanceAttribute>} [options.attributes] 实例属性。
 * @param {boolean} [options.show=true] 是否显示图元。
 * @param {boolean} [options.allowPicking=true] 是否创建拾取资源。
 * @exception {DeveloperError} World、几何、外观、id、属性或布尔选项无效。
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
}

/**
 * 静态贴地足迹实例。输入会复制，geometry 和 id 仍归调用方所有。
 *
 * @typedef {object} SceneGISPlanarGroundPrimitive.GeometryInstanceOptions
 * @property {SceneGISPlanarPolylineGeometry|SceneGISPlanarPolygonGeometry} geometry 源足迹，仅接受非挤出多边形，忽略源 Z。
 * @property {*} id 批次内唯一且非空的业务标识。
 * @property {Object.<string, SceneGISPlanarPrimitive.InstanceAttribute>} [attributes] 原生逐实例属性，批次内须具有相同结构。
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
 * 检查场景是否提供同时支持平面贴地多边形和折线所需的模板缓冲与深度纹理。
 *
 * @param {Scene} scene 要测试的场景。
 * @returns {boolean} 是否支持平面贴地渲染。
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
  if (!frameState.context.depthTexture) {
    throw new DeveloperError(
      "Planar ground primitives require depth textures.",
    );
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
    this._currentAppearance = this._appearance;
    this._currentOrigin = Cartesian3.clone(created.volume.origin);
    this._currentEnvelope = created.volume.envelope;
    this._currentPresentationBounds = created.volume.presentationBounds;
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
    if (
      this._currentAppearance instanceof MaterialAppearance ||
      this._currentAppearance instanceof PolylineMaterialAppearance
    ) {
      if (
        this._current.appearance.material !== this._currentAppearance.material
      ) {
        validateAppearance(
          this._geometryKind,
          this._currentAppearance,
          this._attributes,
        );
      }
      this._current.appearance.material = this._currentAppearance.material;
    }
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
 * 获取可修改的原生实例属性。为 color、show 等属性赋值可更新批次。
 *
 * @param {*} [id] 批次必需；单几何默认使用 this.id。
 * @returns {object|undefined} 实例属性；未找到 id 时返回 undefined。
 * @exception {DeveloperError} 图元已销毁、未就绪，或缺少批次 id。
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
 * 获取用于选择和 UI 放置的显示包围球。中心使用最近成功足迹及驻留地形高度；无驻留高度时为零。命令剔除仍使用私有阴影体包围体。
 *
 * @param {BoundingSphere} result 用于存储结果的对象。
 * @param {*} [id] 可选批次实例 id，省略时获取整个图元的包围体。
 * @returns {BoundingSphere} 已写入结果的 result 参数。
 * @exception {DeveloperError} 缺少 result、id 未知或图元已销毁。
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

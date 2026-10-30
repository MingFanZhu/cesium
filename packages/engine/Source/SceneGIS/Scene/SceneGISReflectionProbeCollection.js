import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import RuntimeError from "../../Core/RuntimeError.js";
import Model from "../../Scene/Model/Model.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISReflectionProbe from "./SceneGISReflectionProbe.js";
import Renderer from "./_private/_SceneGISReflectionProbes.js";

/**
 * 由 Scene 所有的局部反射探针集合，供球面和平面中使用原生物理天空的 PBR 模型消费。显式模型/场景 IBL 贴图优先。捕获包含不透明与 alpha 掩码的独立 glTF 模型、材质受光及可选原生方向光阴影，不包含透明表面、流式瓦片、地形、云或递归反射。默认天空漫反射按粗略方向可见度衰减，不增加漫反射反弹。SSR 对有效屏幕命中保持优先，干净探针不重绘几何。
 *
 * Scene 在 Context 前销毁集合。移除探针释放其贴图；源模型和探针描述对象仅借用。内容或光照修改后须再次调用 capture。
 *
 * @alias SceneGISReflectionProbeCollection
 * @constructor
 * @param {object} options 初始化选项。
 * @param {Scene} options.scene 存活的单视图 SCENE3D Scene，须启用 HDR。
 * @param {number} [options.resolution=128] 立方体面尺寸，可取 32、64、128 或 256。
 * @example
 * const probes = new Cesium.SceneGISReflectionProbeCollection({ scene });
 * probes.add(new Cesium.SceneGISReflectionProbe({
 *   modelMatrix: Cesium.Matrix4.fromTranslation(new Cesium.Cartesian3(0, 0, 3)),
 *   halfSize: new Cesium.Cartesian3(8, 8, 4),
 * }));
 * // Use incrementallyLoadTextures: false and wait for model.ready first.
 * await probes.capture([model]);
 */
function SceneGISReflectionProbeCollection(options = {}) {
  const scene = options.scene;
  if (
    !scene ||
    scene.isDestroyed() ||
    scene._sceneGISReflectionProbes ||
    scene.mode !== SceneMode.SCENE3D ||
    !scene.highDynamicRange
  ) {
    throw new DeveloperError(
      "A live HDR SCENE3D Scene without a probe collection is required.",
    );
  }
  const resolution = options.resolution ?? 128;
  if (![32, 64, 128, 256].includes(resolution)) {
    throw new DeveloperError("resolution must be 32, 64, 128 or 256.");
  }
  const c = scene.context;
  if (
    !c.webgl2 ||
    !c.depthTexture ||
    !c.colorBufferHalfFloat ||
    !c.textureHalfFloatLinear
  ) {
    throw new RuntimeError(
      "Probes require WebGL2 and renderable/filterable half-float textures.",
    );
  }
  this._scene = scene;
  this._resolution = resolution;
  this._probes = [];
  this._pending = undefined;
  this._state = undefined;
  this._capturing = false;
  this._show = this._reflections = this._occlusion = true;
  scene._sceneGISReflectionProbes = this;
  scene.requestRender();
}

function flag(name) {
  return {
    get() {
      return this[`_${name}`];
    },
    set(value) {
      if (typeof value !== "boolean") {
        throw new DeveloperError(`${name} must be boolean.`);
      }
      this[`_${name}`] = value;
      this._scene.requestRender();
    },
  };
}

Object.defineProperties(SceneGISReflectionProbeCollection.prototype, {
  /**
   * 探针是否参与计算，保留已缓存捕获。
   * @memberof SceneGISReflectionProbeCollection.prototype
   * @type {boolean}
   * @default true
   */
  show: flag("show"),
  /**
   * 捕获几何是否贡献镜面辐亮度。
   * @memberof SceneGISReflectionProbeCollection.prototype
   * @type {boolean}
   * @default true
   */
  reflections: flag("reflections"),
  /**
   * 捕获的可见性是否衰减默认环境光。
   * @memberof SceneGISReflectionProbeCollection.prototype
   * @type {boolean}
   * @default true
   */
  occlusion: flag("occlusion"),
  /**
   * @memberof SceneGISReflectionProbeCollection.prototype
   * @type {number}
   * @readonly
   */
  length: {
    get() {
      return this._probes.length;
    },
  },
  /**
   * @memberof SceneGISReflectionProbeCollection.prototype
   * @type {number}
   * @readonly
   */
  resolution: {
    get() {
      return this._resolution;
    },
  },
});

/**
 *  添加描述对象，最多绑定两个探针，包含尚未捕获的探针。
 * @param {SceneGISReflectionProbe} probe 尚未归属其他所有者的描述对象。
 * @returns {SceneGISReflectionProbe} 已添加的描述对象。
 */
SceneGISReflectionProbeCollection.prototype.add = function (probe) {
  if (this._pending) {
    throw new DeveloperError("Wait for capture before editing the collection.");
  }
  if (
    !(probe instanceof SceneGISReflectionProbe) ||
    (probe._owner && probe._owner !== this)
  ) {
    throw new DeveloperError(
      "probe must be an unowned SceneGISReflectionProbe.",
    );
  }
  if (probe._owner === this) {
    return probe;
  }
  if (this.length === 2) {
    throw new DeveloperError("At most two local probes are supported.");
  }
  probe._owner = this;
  this._probes.push(probe);
  this._scene.requestRender();
  return probe;
};

/**
 * 释放探针贴图，保留描述对象。
 * @param {SceneGISReflectionProbe} probe 探针。
 * @returns {boolean} 是否已移除。
 */
SceneGISReflectionProbeCollection.prototype.remove = function (probe) {
  if (this._pending) {
    throw new DeveloperError("Wait for capture before editing the collection.");
  }
  const index = this._probes.indexOf(probe);
  if (index < 0) {
    return false;
  }
  probe._maps = probe._maps?.destroy();
  probe._owner = undefined;
  this._probes.splice(index, 1);
  this._scene.requestRender();
  return true;
};

/**
 * @param {number} index 探针索引。
 * @returns {SceneGISReflectionProbe} 描述对象。
 */
SceneGISReflectionProbeCollection.prototype.get = function (index) {
  if (!Number.isInteger(index) || index < 0 || index >= this.length) {
    throw new DeveloperError("Invalid probe index.");
  }
  return this._probes[index];
};

/**
 * 下一次渲染时捕获完整已加载模型，独立于观察者方向。每个源须为直接位于 scene.primitives 的已就绪、纹理完整的独立 Model。捕获可能阻塞此帧，拒绝并发请求；失败保留旧贴图。全部请求探针发布后 Promise 完成，捕获失败或销毁时拒绝。
 *
 * @param {Model[]} sources 本次请求借用的已加载模型。
 * @returns {Promise<void>} 此显式捕获的完成 Promise。
 */
SceneGISReflectionProbeCollection.prototype.capture = function (sources) {
  if (this._scene.useWebVR) {
    throw new DeveloperError("Probe capture requires a single-view Scene.");
  }
  if (this._pending || this.length === 0) {
    throw new DeveloperError("Capture requires probes and no pending request.");
  }
  if (
    !Array.isArray(sources) ||
    sources.length === 0 ||
    new Set(sources).size !== sources.length
  ) {
    throw new DeveloperError(
      "sources must be a nonempty array of distinct Models.",
    );
  }
  for (const source of sources) {
    if (
      !(source instanceof Model) ||
      source.isDestroyed() ||
      !source.ready ||
      !source._loader.texturesLoaded ||
      !this._scene.primitives.contains(source) ||
      source._content
    ) {
      throw new DeveloperError(
        "Sources must be ready, fully textured standalone Models directly in scene.primitives.",
      );
    }
  }
  const promise = new Promise((resolve, reject) => {
    this._pending = { sources: sources.slice(), resolve, reject };
  });
  this._scene.requestRender();
  return promise;
};

/**
 * @returns {boolean} 是否已销毁。
 */
SceneGISReflectionProbeCollection.prototype.isDestroyed = function () {
  return false;
};
/**
 * 释放自有资源并解绑，借用模型和描述对象仍可使用。
 * @returns {undefined}
 */
SceneGISReflectionProbeCollection.prototype.destroy = function () {
  this._pending?.reject(
    new RuntimeError("Probe collection destroyed before capture."),
  );
  this._pending = undefined;
  for (const probe of this._probes.slice()) {
    this.remove(probe);
  }
  Renderer.destroy(this);
  this._scene._sceneGISReflectionProbes = undefined;
  this._scene = undefined;
  return destroyObject(this);
};

export default SceneGISReflectionProbeCollection;

import destroyObject from "../../Core/destroyObject.js";
import DeveloperError from "../../Core/DeveloperError.js";
import RuntimeError from "../../Core/RuntimeError.js";
import Model from "../../Scene/Model/Model.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISReflectionProbe from "./SceneGISReflectionProbe.js";
import Renderer from "./_private/_SceneGISReflectionProbes.js";

/**
 * Scene-owned local reflection probes for native physical-sky PBR models in Globe and Planar.
 * Explicit model/scene IBL maps take precedence. Capture includes opaque and alpha-masked
 * standalone glTF models, their material lighting and optional native directional shadows.
 * It excludes transparent surfaces, tiled streaming, terrain, clouds and recursive reflection.
 * Default sky diffuse is attenuated by coarse directional visibility; no diffuse bounce is added.
 * SSR keeps priority for valid screen hits. No geometry is rendered for clean probes.
 *
 * The Scene destroys the collection before its Context. Removing a probe releases its maps;
 * source models and probe descriptors are borrowed. Call capture again after content/light edits.
 *
 * @alias SceneGISReflectionProbeCollection
 * @constructor
 * @param {object} options Initialization options.
 * @param {Scene} options.scene A live single-view SCENE3D Scene with HDR enabled.
 * @param {number} [options.resolution=128] Cube face size, one of 32, 64, 128 or 256.
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
   * Whether probes contribute. Cached captures are retained.
   * @memberof SceneGISReflectionProbeCollection.prototype
   * @type {boolean}
   * @default true
   */
  show: flag("show"),
  /**
   * Whether captured geometry contributes specular radiance.
   * @memberof SceneGISReflectionProbeCollection.prototype
   * @type {boolean}
   * @default true
   */
  reflections: flag("reflections"),
  /**
   * Whether captured visibility attenuates default environment lighting.
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

/** Adds a descriptor. At most two probes may be bound, including uncaptured probes.
 * @param {SceneGISReflectionProbe} probe An unowned descriptor.
 * @returns {SceneGISReflectionProbe} The added descriptor.
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
 * Releases a probe's maps, retaining its descriptor.
 * @param {SceneGISReflectionProbe} probe The probe.
 * @returns {boolean} Whether removed.
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
 * @param {number} index Probe index.
 * @returns {SceneGISReflectionProbe} The descriptor.
 */
SceneGISReflectionProbeCollection.prototype.get = function (index) {
  if (!Number.isInteger(index) || index < 0 || index >= this.length) {
    throw new DeveloperError("Invalid probe index.");
  }
  return this._probes[index];
};

/**
 * Captures complete loaded models in the next render, independent of the viewer direction.
 * Each source must be a ready, fully textured standalone Model directly in scene.primitives.
 * Capturing can stall that frame. Concurrent requests are rejected; failures retain old maps.
 * The promise resolves after all requested probes publish, or rejects on capture failure/destroy.
 *
 * @param {Model[]} sources Loaded models to borrow for this request.
 * @returns {Promise<void>} Completion of this explicit capture.
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
 * @returns {boolean} Whether destroyed.
 */
SceneGISReflectionProbeCollection.prototype.isDestroyed = function () {
  return false;
};
/**
 * Releases owned resources and detaches. Borrowed models/descriptors remain usable.
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

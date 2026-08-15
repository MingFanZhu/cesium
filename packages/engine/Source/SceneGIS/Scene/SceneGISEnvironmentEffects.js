import buildModuleUrl from "../../Core/buildModuleUrl.js";
import Check from "../../Core/Check.js";
import defined from "../../Core/defined.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Frozen from "../../Core/Frozen.js";
import Resource from "../../Core/Resource.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import SceneMode from "../../Scene/SceneMode.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";
import SceneGISEnvironmentEffectsRenderer from "./_private/_SceneGISEnvironmentEffectsRenderer.js";

const globeMode = "globe";
const planarMode = "planar";
const assetRoots = Object.freeze({
  globe: "Assets/SceneGIS/Environment/BrunetonEarth/",
  planar: "Assets/SceneGIS/Environment/PlanarEarth/",
});
const assetNames = Object.freeze([
  "transmittance.bin",
  "scattering.bin",
  "irradiance.bin",
]);

function validateLiveScene(scene) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.object("scene", scene);
  if (
    typeof scene.isDestroyed !== "function" ||
    scene.isDestroyed() ||
    !defined(scene.context)
  ) {
    throw new DeveloperError("scene must be a live Scene.");
  }
  //>>includeEnd('debug');
}

function isSupported(scene) {
  validateLiveScene(scene);
  const context = scene.context;
  return (
    context.webgl2 === true &&
    ContextLimits.maximum3DTextureSize >= 256 &&
    context.halfFloatingPointTexture === true &&
    context.textureHalfFloatLinear === true &&
    context.depthTexture === true &&
    context.colorBufferHalfFloat === true &&
    scene.highDynamicRangeSupported === true
  );
}

function isHidden(value) {
  return !defined(value) || value.show === false;
}

function validateGlobeConflict(controller, scene) {
  if (
    scene.mode !== SceneMode.SCENE3D ||
    !defined(scene.globe) ||
    scene.world !== scene.globe ||
    (typeof scene.globe.isDestroyed === "function" && scene.globe.isDestroyed())
  ) {
    throw new DeveloperError(
      'mode "globe" requires the Scene\'s live SCENE3D Globe.',
    );
  }
  if (
    !isHidden(scene.skyAtmosphere) ||
    !isHidden(scene.skyBox) ||
    !isHidden(scene.sun) ||
    !isHidden(scene.moon) ||
    scene.sunBloom !== false ||
    scene.fog.enabled !== false ||
    scene.globe.showGroundAtmosphere !== false
  ) {
    throw new DeveloperError(
      "Advanced Globe environment requires native sky, bodies, bloom, Fog, and ground atmosphere to be disabled.",
    );
  }
  if (defined(controller._world)) {
    throw new DeveloperError('mode "globe" must not use a planar world.');
  }
}

function validatePlanarConflict(controller, scene) {
  const world = controller._world;
  if (
    scene.mode !== SceneMode.SCENE3D ||
    scene.world !== world ||
    defined(scene.globe) ||
    world.isDestroyed()
  ) {
    throw new DeveloperError(
      'mode "planar" requires the Scene\'s exact live SCENE3D SceneGISPlanarWorld.',
    );
  }
  const environment = world.environment;
  if (
    !defined(environment) ||
    environment._enabled !== true ||
    environment._hasAuthority !== true
  ) {
    throw new DeveloperError(
      "Advanced planar environment requires the registered enabled SceneGISPlanarEnvironment to own light authority.",
    );
  }
  if (
    environment._showAtmosphere ||
    defined(environment._skyBox) ||
    environment._showSun ||
    environment._showMoon
  ) {
    throw new DeveloperError(
      "Advanced planar environment conflicts with lightweight planar sky, atmosphere, Sun, or Moon output.",
    );
  }
  if (
    !isHidden(scene.skyAtmosphere) ||
    !isHidden(scene.skyBox) ||
    !isHidden(scene.sun) ||
    !isHidden(scene.moon)
  ) {
    throw new DeveloperError(
      "Advanced planar environment requires native Scene sky, Sun, and Moon output to be disabled.",
    );
  }
}

function validateActive(controller, scene) {
  validateLiveScene(scene);
  if (!isSupported(scene)) {
    throw new DeveloperError(
      "The Scene does not support the required WebGL2 RGBA16F advanced-environment profile.",
    );
  }
  if (scene.highDynamicRange !== true) {
    throw new DeveloperError(
      "scene.highDynamicRange must be true before enabling advanced environment effects.",
    );
  }
  if (controller._mode === globeMode) {
    validateGlobeConflict(controller, scene);
  } else {
    validatePlanarConflict(controller, scene);
  }
}

function setPipelineEnabled(controller, enabled) {
  const pipeline = controller._pipeline;
  if (!defined(pipeline) || pipeline.isDestroyed()) {
    return;
  }
  pipeline.enabled = enabled;
  if (!enabled) {
    pipeline.detach();
  }
}

function invalidateGeneration(controller) {
  controller._generation++;
  controller._pendingBuffers = undefined;
  controller._generationStarted = false;
}

function requestRender(controller) {
  if (defined(controller._scene) && !controller._scene.isDestroyed()) {
    controller._scene.requestRender();
  }
}

function validateCalibrationScale(name, value) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0.0 ||
    value > 64.0
  ) {
    throw new DeveloperError(`${name} must be a finite number from 0 to 64.`);
  }
}

function raiseGenerationError(controller, generation, error) {
  if (
    generation !== controller._generation ||
    controller._errorGeneration === generation
  ) {
    return false;
  }
  controller._errorGeneration = generation;
  controller._ready = false;
  setPipelineEnabled(controller, false);
  controller._errorEvent.raiseEvent(controller, error);
  return true;
}

function isCurrentGeneration(controller, generation) {
  return (
    generation === controller._generation &&
    controller._enabled &&
    defined(controller._scene) &&
    !controller._scene.isDestroyed() &&
    controller._errorGeneration !== generation
  );
}

async function fetchEnvironmentAssets(controller, generation) {
  const assetRoot = assetRoots[controller._mode];
  try {
    const buffers = await Promise.all(
      assetNames.map((name) =>
        Resource.fetchArrayBuffer(buildModuleUrl(`${assetRoot}${name}`)),
      ),
    );
    if (!isCurrentGeneration(controller, generation)) {
      return;
    }
    controller._pendingBuffers = {
      transmittance: buffers[0],
      scattering: buffers[1],
      irradiance: buffers[2],
    };
    requestRender(controller);
  } catch (error) {
    if (
      isCurrentGeneration(controller, generation) &&
      raiseGenerationError(controller, generation, error)
    ) {
      requestRender(controller);
    }
  }
}

function ensurePipeline(controller, scene) {
  let pipeline = controller._pipeline;
  if (!defined(pipeline) || pipeline.isDestroyed()) {
    pipeline = new SceneGISEnvironmentEffectsRenderer({
      mode: controller._mode,
      world: controller._world,
      owner: controller,
    });
    controller._pipeline = pipeline;
  }
  if (!defined(pipeline._scene)) {
    pipeline.attach(scene);
  }
  pipeline.setShow(
    controller._showAtmosphere,
    controller._showAerialPerspective,
  );
  pipeline.enabled = true;
  return pipeline;
}

function beginGeneration(controller, scene) {
  if (controller._generationStarted) {
    return;
  }
  controller._generationStarted = true;
  const generation = controller._generation;
  void fetchEnvironmentAssets(controller, generation);
}

function publishPendingResources(controller, scene) {
  if (!defined(controller._pendingBuffers)) {
    return;
  }
  const buffers = controller._pendingBuffers;
  controller._pendingBuffers = undefined;
  try {
    controller._pipeline.publishResources(scene.context, buffers);
    controller._ready = true;
  } catch (error) {
    raiseGenerationError(controller, controller._generation, error);
  }
}

function activate(controller, scene) {
  validateActive(controller, scene);
  if (defined(controller._scene) && controller._scene !== scene) {
    throw new DeveloperError(
      "A SceneGISEnvironmentEffects instance cannot control two Scenes at once.",
    );
  }
  controller._scene = scene;
  ensurePipeline(controller, scene);
  if (!controller._showAtmosphere && !controller._showAerialPerspective) {
    return;
  }
  if (controller._pipeline.hasResources()) {
    controller._ready = true;
    return;
  }
  beginGeneration(controller, scene);
  publishPendingResources(controller, scene);
}

/**
 * Controls the SceneGIS advanced physical atmosphere and aerial-perspective
 * pipeline for either a native Globe or a SceneGIS planar world.
 *
 * The controller is caller-owned. Register it with a Scene controller host and
 * remove it before destroying the host. It is disabled by default and performs
 * no resource request or Scene mutation until its first enabled update.
 *
 * @alias SceneGISEnvironmentEffects
 * @constructor
 *
 * @param {SceneGISEnvironmentEffects.ConstructorOptions} options Configuration options.
 *
 * @exception {DeveloperError} options.mode must be exactly "globe" or "planar".
 * @exception {DeveloperError} Planar mode requires a live SceneGISPlanarWorld and Globe mode forbids world.
 */
function SceneGISEnvironmentEffects(options) {
  options = options ?? Frozen.EMPTY_OBJECT;
  const mode = options.mode;
  if (mode !== globeMode && mode !== planarMode) {
    throw new DeveloperError(
      'options.mode must be exactly "globe" or "planar".',
    );
  }
  const world = options.world;
  if (mode === globeMode && defined(world)) {
    throw new DeveloperError(
      'options.world must be undefined for mode "globe".',
    );
  }
  if (
    mode === planarMode &&
    (!(world instanceof SceneGISPlanarWorld) || world.isDestroyed())
  ) {
    throw new DeveloperError(
      'options.world must be a live SceneGISPlanarWorld for mode "planar".',
    );
  }
  const enabled = options.enabled ?? false;
  const showAtmosphere = options.showAtmosphere ?? true;
  const showAerialPerspective = options.showAerialPerspective ?? true;
  const backgroundRadianceScale = options.backgroundRadianceScale ?? 10.0;
  const aerialRadianceScale = options.aerialRadianceScale ?? 1.0;
  validateCalibrationScale(
    "options.backgroundRadianceScale",
    backgroundRadianceScale,
  );
  validateCalibrationScale("options.aerialRadianceScale", aerialRadianceScale);
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.bool("options.enabled", enabled);
  Check.typeOf.bool("options.showAtmosphere", showAtmosphere);
  Check.typeOf.bool("options.showAerialPerspective", showAerialPerspective);
  //>>includeEnd('debug');

  this._mode = mode;
  this._world = world;
  this._enabled = enabled;
  this._showAtmosphere = showAtmosphere;
  this._showAerialPerspective = showAerialPerspective;
  this._backgroundRadianceScale = backgroundRadianceScale;
  this._aerialRadianceScale = aerialRadianceScale;
  this._ready = false;
  this._errorEvent = new Event();
  this._element = undefined;
  this._scene = undefined;
  this._pipeline = undefined;
  this._generation = 0;
  this._generationStarted = false;
  this._pendingBuffers = undefined;
  this._errorGeneration = -1;
}

/**
 * Tests whether a live Scene exposes the complete A2 WebGL2 RGBA16F profile.
 * This method is read-only and never attaches a pipeline or allocates resources.
 *
 * @function
 * @param {Scene} scene The Scene to test.
 * @returns {boolean} Whether the complete advanced-environment profile is supported.
 * @exception {DeveloperError} scene must be a live Scene.
 */
SceneGISEnvironmentEffects.isSupported = isSupported;

Object.defineProperties(SceneGISEnvironmentEffects.prototype, {
  /** @memberof SceneGISEnvironmentEffects.prototype @type {string} @readonly */
  mode: {
    get: function () {
      return this._mode;
    },
  },
  /** @memberof SceneGISEnvironmentEffects.prototype @type {SceneGISPlanarWorld|undefined} @readonly */
  world: {
    get: function () {
      return this._world;
    },
  },
  /** @memberof SceneGISEnvironmentEffects.prototype @type {boolean} @readonly */
  ready: {
    get: function () {
      return this._ready;
    },
  },
  /** @memberof SceneGISEnvironmentEffects.prototype @type {Event} @readonly */
  errorEvent: {
    get: function () {
      return this._errorEvent;
    },
  },
  /** @memberof SceneGISEnvironmentEffects.prototype @type {boolean} */
  enabled: {
    get: function () {
      return this._enabled;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      Check.typeOf.bool("value", value);
      //>>includeEnd('debug');
      if (this._enabled === value) {
        return;
      }
      this._enabled = value;
      invalidateGeneration(this);
      this._errorGeneration = -1;
      if (!value) {
        setPipelineEnabled(this, false);
      }
      requestRender(this);
    },
  },
  /** @memberof SceneGISEnvironmentEffects.prototype @type {boolean} */
  showAtmosphere: {
    get: function () {
      return this._showAtmosphere;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      Check.typeOf.bool("value", value);
      //>>includeEnd('debug');
      if (this._showAtmosphere === value) {
        return;
      }
      this._showAtmosphere = value;
      if (defined(this._pipeline) && !this._pipeline.isDestroyed()) {
        this._pipeline.setShow(value, this._showAerialPerspective);
      }
      if (this._enabled && defined(this._scene)) {
        requestRender(this);
      }
    },
  },
  /** @memberof SceneGISEnvironmentEffects.prototype @type {boolean} */
  showAerialPerspective: {
    get: function () {
      return this._showAerialPerspective;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      Check.typeOf.bool("value", value);
      //>>includeEnd('debug');
      if (this._showAerialPerspective === value) {
        return;
      }
      this._showAerialPerspective = value;
      if (defined(this._pipeline) && !this._pipeline.isDestroyed()) {
        this._pipeline.setShow(this._showAtmosphere, value);
      }
      if (this._enabled && defined(this._scene)) {
        requestRender(this);
      }
    },
  },
  /**
   * Gets or sets the scene-linear scale applied to physical background radiance.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  backgroundRadianceScale: {
    get: function () {
      return this._backgroundRadianceScale;
    },
    set: function (value) {
      validateCalibrationScale("value", value);
      if (this._backgroundRadianceScale === value) {
        return;
      }
      this._backgroundRadianceScale = value;
      requestRender(this);
    },
  },
  /**
   * Gets or sets the scene-linear scale applied to physical aerial radiance.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  aerialRadianceScale: {
    get: function () {
      return this._aerialRadianceScale;
    },
    set: function (value) {
      validateCalibrationScale("value", value);
      if (this._aerialRadianceScale === value) {
        return;
      }
      this._aerialRadianceScale = value;
      requestRender(this);
    },
  },
});

SceneGISEnvironmentEffects.prototype.connectedCallback = function (element) {
  if (!defined(element)) {
    throw new DeveloperError("element is required.");
  }
  if (defined(this._element)) {
    throw new DeveloperError(
      "A SceneGISEnvironmentEffects instance must not be registered twice.",
    );
  }
  this._element = element;
};

SceneGISEnvironmentEffects.prototype.disconnectedCallback = function (element) {
  if (!defined(this._element) || element !== this._element) {
    throw new DeveloperError(
      "element must match the connected SceneGISEnvironmentEffects host.",
    );
  }
  const scene = this._scene;
  invalidateGeneration(this);
  if (defined(this._pipeline) && !this._pipeline.isDestroyed()) {
    this._pipeline.destroy();
  }
  this._pipeline = undefined;
  this._scene = undefined;
  this._element = undefined;
  this._ready = false;
  this._errorGeneration = -1;
  if (defined(scene) && !scene.isDestroyed()) {
    scene.requestRender();
  }
};

SceneGISEnvironmentEffects.prototype.firstUpdate = function (scene, time) {
  void time;
  if (!defined(this._element)) {
    throw new DeveloperError(
      "SceneGISEnvironmentEffects must be connected before firstUpdate.",
    );
  }
  activate(this, scene);
};

SceneGISEnvironmentEffects.prototype.update = function (scene, time) {
  void time;
  if (!defined(this._element)) {
    throw new DeveloperError(
      "SceneGISEnvironmentEffects must be connected before update.",
    );
  }
  if (this._errorGeneration === this._generation) {
    return;
  }
  if (!defined(this._scene) || !defined(this._pipeline?._scene)) {
    activate(this, scene);
    return;
  }
  try {
    validateActive(this, scene);
  } catch (error) {
    raiseGenerationError(this, this._generation, error);
    return;
  }
  ensurePipeline(this, scene);
  if (
    !this._pipeline.hasResources() &&
    (this._showAtmosphere || this._showAerialPerspective)
  ) {
    beginGeneration(this, scene);
  }
  publishPendingResources(this, scene);
};

SceneGISEnvironmentEffects.prototype._validateRenderFrame = function () {
  try {
    validateActive(this, this._scene);
    return true;
  } catch (error) {
    raiseGenerationError(this, this._generation, error);
    return false;
  }
};

/**
 * Initialization options for SceneGISEnvironmentEffects.
 *
 * @typedef {object} SceneGISEnvironmentEffects.ConstructorOptions
 * @property {string} mode Exact "globe" or "planar" geometry mode.
 * @property {SceneGISPlanarWorld} [world] Required only for planar mode.
 * @property {boolean} [enabled=false] Whether advanced effects are active.
 * @property {boolean} [showAtmosphere=true] Whether to render atmosphere and Sun background.
 * @property {boolean} [showAerialPerspective=true] Whether to composite opaque geometry aerial perspective.
 * @property {number} [backgroundRadianceScale=10.0] Scene-linear scale applied to physical background radiance, in the inclusive range 0–64.
 * @property {number} [aerialRadianceScale=1.0] Scene-linear scale applied to physical aerial radiance, in the inclusive range 0–64.
 */

export default SceneGISEnvironmentEffects;

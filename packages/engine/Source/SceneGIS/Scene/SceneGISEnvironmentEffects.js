import buildModuleUrl from "../../Core/buildModuleUrl.js";
import Check from "../../Core/Check.js";
import Cartesian3 from "../../Core/Cartesian3.js";
import Color from "../../Core/Color.js";
import defined from "../../Core/defined.js";
import DeveloperError from "../../Core/DeveloperError.js";
import Event from "../../Core/Event.js";
import Frozen from "../../Core/Frozen.js";
import Resource from "../../Core/Resource.js";
import ContextLimits from "../../Renderer/ContextLimits.js";
import DirectionalLight from "../../Scene/DirectionalLight.js";
import SceneMode from "../../Scene/SceneMode.js";
import SunLight from "../../Scene/SunLight.js";
import SceneGISPlanarWorld from "./SceneGISPlanarWorld.js";
import SceneGISEnvironmentEffectsRenderer from "./_private/_SceneGISEnvironmentEffectsRenderer.js";

const globeMode = "globe";
const planarMode = "planar";
const assetRoots = Object.freeze({
  globe: "Assets/SceneGIS/Environment/BrunetonEarth/",
  planar: "Assets/SceneGIS/Environment/PlanarEarth/",
});
const cloudAssetRoot = "Assets/SceneGIS/Environment/CloudCore/";
const worldAssetFiles = Object.freeze([
  { key: "transmittance", root: "world", name: "transmittance.bin" },
  { key: "scattering", root: "world", name: "scattering.bin" },
  { key: "irradiance", root: "world", name: "irradiance.bin" },
]);
const sharedCloudAssetFiles = Object.freeze([
  { key: "cloudTurbulence", root: "cloud", name: "turbulence.bin" },
  { key: "cloudStbn", root: "cloud", name: "stbn.bin" },
]);
const cloudAssetFiles = Object.freeze({
  globe: Object.freeze([
    { key: "cloudShape", root: "cloud", name: "globe-shape.bin" },
    { key: "cloudDetail", root: "cloud", name: "globe-detail.bin" },
    { key: "cloudWeather", root: "cloud", name: "globe-weather.bin" },
    {
      key: "cloudTurbulence",
      root: "cloud",
      name: "globe-turbulence.bin",
    },
    { key: "cloudStbn", root: "cloud", name: "globe-stbn.bin" },
  ]),
  planar: Object.freeze([
    { key: "cloudShape", root: "cloud", name: "shape.bin" },
    { key: "cloudDetail", root: "cloud", name: "detail.bin" },
    { key: "cloudWeather", root: "cloud", name: "weather.bin" },
    ...sharedCloudAssetFiles,
  ]),
});
const cloudQualities = Object.freeze(["low", "medium", "high"]);
const cloudPresets = Object.freeze(["cumulus", "stratus", "cirrus", "mixed"]);
const moonTextureAsset = "Assets/SceneGIS/Environment/Moon/color_large.webp";

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
    ContextLimits.maximumDrawBuffers >= 2 &&
    ContextLimits.maximumColorAttachments >= 2 &&
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
    scene.sunBloom !== false ||
    (controller._showBloom &&
      scene.postProcessStages.bloom.enabled !== false) ||
    scene.fog.enabled !== false ||
    scene.globe.showGroundAtmosphere !== false ||
    scene.globe.enableLighting !== false
  ) {
    throw new DeveloperError(
      "Advanced Globe environment requires native sky, Sun, Sun bloom, enabled post-process bloom, Fog, ground atmosphere, and Globe lighting to be disabled.",
    );
  }
  if (defined(controller._world)) {
    throw new DeveloperError('mode "globe" must not use a planar world.');
  }
  if (
    !controller._ownsGlobeCelestialLifecycle &&
    defined(scene.light) &&
    !(scene.light instanceof SunLight)
  ) {
    throw new DeveloperError(
      "Advanced Globe Moonlight requires the initial scene.light to be undefined or a SunLight.",
    );
  }
  if (controller._ownsGlobeCelestialLifecycle) {
    if (scene.moon !== controller._celestialMoon) {
      throw new DeveloperError(
        "scene.moon must remain the captured Moon while advanced Globe Moonlight is active.",
      );
    }
    if (scene.light !== controller._directionalLight) {
      throw new DeveloperError(
        "scene.light must remain the controller-owned DirectionalLight while advanced Globe Moonlight is active.",
      );
    }
    if (
      controller._changedMoonTextureUrl &&
      (!defined(scene.moon) ||
        scene.moon.textureUrl !== controller._celestialMoonTextureUrl)
    ) {
      throw new DeveloperError(
        "scene.moon.textureUrl must remain controller-owned while advanced Globe Moonlight is active.",
      );
    }
  }
  if (
    controller._ownsGlobeDepthTestLifecycle &&
    scene.globe.depthTestAgainstTerrain !== true
  ) {
    throw new DeveloperError(
      "scene.globe.depthTestAgainstTerrain must remain true while advanced Globe environment effects are active.",
    );
  }
}

function acquireGlobeCelestialLifecycle(controller, scene) {
  if (
    controller._mode !== globeMode ||
    controller._ownsGlobeCelestialLifecycle
  ) {
    return;
  }
  controller._celestialPreviousLight = scene.light;
  controller._celestialSunColor = Color.clone(
    scene.light?.color ?? Color.WHITE,
    controller._celestialSunColor,
  );
  controller._celestialSunIntensity = scene.light?.intensity ?? 2.0;
  controller._celestialMoon = scene.moon;
  controller._celestialPreviousMoonTextureUrl = defined(scene.moon)
    ? scene.moon.textureUrl
    : undefined;
  controller._celestialMoonTextureUrl = buildModuleUrl(moonTextureAsset);
  controller._changedMoonTextureUrl =
    defined(scene.moon) &&
    scene.moon.textureUrl !== controller._celestialMoonTextureUrl;
  controller._ownsGlobeCelestialLifecycle = true;
  scene.light = controller._directionalLight;
  if (controller._changedMoonTextureUrl) {
    scene.moon.textureUrl = controller._celestialMoonTextureUrl;
  }
}

function updateGlobeCelestialLifecycle(controller) {
  if (!controller._ownsGlobeCelestialLifecycle) {
    return;
  }
  const state = controller._pipeline.getPrimaryLightState();
  if (!defined(state)) {
    return;
  }
  Cartesian3.negate(state.direction, controller._directionalLight.direction);
  Color.clone(state.nativeColor, controller._directionalLight.color);
  controller._directionalLight.intensity = state.nativeIntensity;
}

function releaseGlobeCelestialLifecycle(controller) {
  if (!controller._ownsGlobeCelestialLifecycle) {
    return;
  }
  const scene = controller._scene;
  if (defined(scene) && !scene.isDestroyed()) {
    if (scene.light === controller._directionalLight) {
      scene.light = controller._celestialPreviousLight;
    }
    if (
      controller._changedMoonTextureUrl &&
      defined(controller._celestialMoon) &&
      controller._celestialMoon.textureUrl ===
        controller._celestialMoonTextureUrl
    ) {
      controller._celestialMoon.textureUrl =
        controller._celestialPreviousMoonTextureUrl;
    }
  }
  controller._ownsGlobeCelestialLifecycle = false;
  controller._changedMoonTextureUrl = false;
  controller._celestialPreviousLight = undefined;
  controller._celestialMoon = undefined;
  controller._celestialPreviousMoonTextureUrl = undefined;
  controller._celestialMoonTextureUrl = undefined;
}

function acquireGlobeDepthTestLifecycle(controller, scene) {
  if (
    controller._mode !== globeMode ||
    controller._ownsGlobeDepthTestLifecycle
  ) {
    return;
  }
  const previousValue = scene.globe.depthTestAgainstTerrain;
  controller._globeDepthTestAgainstTerrainPrevious = previousValue;
  controller._changedGlobeDepthTestAgainstTerrain = previousValue !== true;
  controller._ownsGlobeDepthTestLifecycle = true;
  if (controller._changedGlobeDepthTestAgainstTerrain) {
    scene.globe.depthTestAgainstTerrain = true;
  }
}

function releaseGlobeDepthTestLifecycle(controller) {
  if (!controller._ownsGlobeDepthTestLifecycle) {
    return;
  }
  const scene = controller._scene;
  if (
    controller._changedGlobeDepthTestAgainstTerrain &&
    defined(scene) &&
    !scene.isDestroyed() &&
    defined(scene.globe)
  ) {
    scene.globe.depthTestAgainstTerrain =
      controller._globeDepthTestAgainstTerrainPrevious;
  }
  controller._ownsGlobeDepthTestLifecycle = false;
  controller._changedGlobeDepthTestAgainstTerrain = false;
  controller._globeDepthTestAgainstTerrainPrevious = undefined;
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
  if (
    controller._showBloom &&
    scene.postProcessStages.bloom.enabled !== false
  ) {
    throw new DeveloperError(
      "Advanced planar HDR bloom requires native post-process bloom to be disabled.",
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
    !isHidden(scene.moon) ||
    scene.fog.enabled !== false
  ) {
    throw new DeveloperError(
      "Advanced planar environment requires native Scene sky, Sun, Moon, and Fog output to be disabled.",
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
  pipeline.invalidateCloudHistory(enabled ? "enable" : "disable");
  pipeline.enabled = enabled;
  if (!enabled) {
    pipeline.releaseGlobeLighting();
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

function validateRange(name, value, minimum, maximum) {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new DeveloperError(
      `${name} must be a finite number from ${minimum} to ${maximum}.`,
    );
  }
}

function requestRenderIfActive(controller) {
  if (
    controller._enabled &&
    defined(controller._element) &&
    defined(controller._scene)
  ) {
    requestRender(controller);
  }
}

function setWarmNumber(controller, property, value, minimum, maximum) {
  validateRange("value", value, minimum, maximum);
  if (controller[property] === value) {
    return;
  }
  controller[property] = value;
  requestRenderIfActive(controller);
}

function setWarmBoolean(controller, property, value, historyReason) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.bool("value", value);
  //>>includeEnd('debug');
  if (controller[property] === value) {
    return;
  }
  controller[property] = value;
  if (defined(controller._pipeline) && !controller._pipeline.isDestroyed()) {
    controller._pipeline.invalidateCloudHistory(historyReason);
  }
  requestRenderIfActive(controller);
}

function setRenderBoolean(controller, property, value) {
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.bool("value", value);
  //>>includeEnd('debug');
  if (controller[property] === value) {
    return;
  }
  controller[property] = value;
  requestRenderIfActive(controller);
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
  const assetFiles = [...worldAssetFiles, ...cloudAssetFiles[controller._mode]];
  try {
    const buffers = await Promise.all(
      assetFiles.map((file) =>
        Resource.fetchArrayBuffer(
          buildModuleUrl(
            `${file.root === "world" ? assetRoot : cloudAssetRoot}${file.name}`,
          ),
        ),
      ),
    );
    if (!isCurrentGeneration(controller, generation)) {
      return;
    }
    controller._pendingBuffers = Object.fromEntries(
      assetFiles.map((file, index) => [file.key, buffers[index]]),
    );
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
    controller._showHeightFog,
    controller._showClouds,
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

function activate(controller, scene, time) {
  validateActive(controller, scene);
  if (defined(controller._scene) && controller._scene !== scene) {
    throw new DeveloperError(
      "A SceneGISEnvironmentEffects instance cannot control two Scenes at once.",
    );
  }
  controller._scene = scene;
  acquireGlobeDepthTestLifecycle(controller, scene);
  acquireGlobeCelestialLifecycle(controller, scene);
  ensurePipeline(controller, scene);
  if (controller._pipeline.hasResources()) {
    controller._ready = true;
    controller._pipeline.prepareGlobeLighting(scene.frameState, time);
    updateGlobeCelestialLifecycle(controller);
    return;
  }
  if (controller._mode === globeMode) {
    controller._pipeline.prepareGlobeLighting(scene.frameState, time);
    updateGlobeCelestialLifecycle(controller);
  }
  beginGeneration(controller, scene);
  publishPendingResources(controller, scene);
  if (controller._ready) {
    controller._pipeline.prepareGlobeLighting(scene.frameState, time);
    updateGlobeCelestialLifecycle(controller);
  }
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
  const showHeightFog = options.showHeightFog ?? true;
  const showClouds = options.showClouds ?? true;
  const showCloudShadows = options.showCloudShadows ?? true;
  const showCrepuscularRays = options.showCrepuscularRays ?? true;
  const showBloom = options.showBloom ?? true;
  const showLensFlare = options.showLensFlare ?? true;
  const showMoonlight = options.showMoonlight ?? true;
  const cloudQuality =
    options.cloudQuality ?? (mode === globeMode ? "high" : "medium");
  const cloudPreset = options.cloudPreset ?? "cumulus";
  const cloudCoverage =
    options.cloudCoverage ?? (mode === globeMode ? 0.3 : 0.45);
  const cloudDensity =
    options.cloudDensity ?? (mode === globeMode ? 1.0 : 0.001);
  const cloudBaseHeight =
    options.cloudBaseHeight ?? (mode === globeMode ? 750.0 : 1500.0);
  const cloudThickness = options.cloudThickness ?? 4500.0;
  const cloudWindDirection = options.cloudWindDirection ?? 0.785398;
  const cloudWindSpeed = options.cloudWindSpeed ?? 20.0;
  const cloudTime = options.cloudTime ?? 0.0;
  const cloudRadianceScale =
    options.cloudRadianceScale ?? (mode === globeMode ? 1.0 : 48.0);
  const backgroundRadianceScale =
    options.backgroundRadianceScale ?? (mode === globeMode ? 4.0 : 10.0);
  const aerialRadianceScale = options.aerialRadianceScale ?? 1.0;
  const surfaceRadianceScale = options.surfaceRadianceScale ?? 10.0;
  const bloomThreshold = options.bloomThreshold ?? 10.0;
  const bloomIntensity = options.bloomIntensity ?? 0.05;
  const lensFlareIntensity = options.lensFlareIntensity ?? 5.0;
  const moonlightIntensity = options.moonlightIntensity ?? 1.0;
  const heightFogDensity = options.heightFogDensity ?? 0.000008;
  const heightFogHeightFalloff = options.heightFogHeightFalloff ?? 0.0002;
  const heightFogBaseHeight = options.heightFogBaseHeight ?? 0.0;
  const heightFogStartDistance = options.heightFogStartDistance ?? 250.0;
  const heightFogMaximumOpacity = options.heightFogMaximumOpacity ?? 0.7;
  const heightFogInscatteringScale = options.heightFogInscatteringScale ?? 0.35;
  const heightFogDirectionalInscatteringScale =
    options.heightFogDirectionalInscatteringScale ?? 0.15;
  const heightFogDirectionalInscatteringExponent =
    options.heightFogDirectionalInscatteringExponent ?? 8.0;
  validateCalibrationScale(
    "options.backgroundRadianceScale",
    backgroundRadianceScale,
  );
  validateCalibrationScale("options.aerialRadianceScale", aerialRadianceScale);
  validateCalibrationScale(
    "options.surfaceRadianceScale",
    surfaceRadianceScale,
  );
  validateRange("options.bloomThreshold", bloomThreshold, 0.0, 65504.0);
  validateCalibrationScale("options.bloomIntensity", bloomIntensity);
  validateCalibrationScale("options.lensFlareIntensity", lensFlareIntensity);
  validateCalibrationScale("options.moonlightIntensity", moonlightIntensity);
  validateRange("options.heightFogDensity", heightFogDensity, 0.0, 0.001);
  validateRange(
    "options.heightFogHeightFalloff",
    heightFogHeightFalloff,
    0.0,
    0.001,
  );
  if (!cloudQualities.includes(cloudQuality)) {
    throw new DeveloperError(
      'options.cloudQuality must be exactly "low", "medium", or "high".',
    );
  }
  if (!cloudPresets.includes(cloudPreset)) {
    throw new DeveloperError(
      'options.cloudPreset must be exactly "cumulus", "stratus", "cirrus", or "mixed".',
    );
  }
  validateRange("options.cloudCoverage", cloudCoverage, 0.0, 1.0);
  validateRange(
    "options.cloudDensity",
    cloudDensity,
    0.0,
    mode === globeMode ? 64.0 : 0.01,
  );
  validateRange("options.cloudBaseHeight", cloudBaseHeight, -500.0, 20000.0);
  validateRange("options.cloudThickness", cloudThickness, 0.0, 20000.0);
  validateRange(
    "options.cloudWindDirection",
    cloudWindDirection,
    -Math.PI,
    Math.PI,
  );
  validateRange("options.cloudWindSpeed", cloudWindSpeed, 0.0, 200.0);
  validateRange("options.cloudTime", cloudTime, -1000000000.0, 1000000000.0);
  validateCalibrationScale("options.cloudRadianceScale", cloudRadianceScale);
  validateRange(
    "options.heightFogBaseHeight",
    heightFogBaseHeight,
    -60000.0,
    60000.0,
  );
  validateRange(
    "options.heightFogStartDistance",
    heightFogStartDistance,
    0.0,
    300000.0,
  );
  validateRange(
    "options.heightFogMaximumOpacity",
    heightFogMaximumOpacity,
    0.0,
    1.0,
  );
  validateCalibrationScale(
    "options.heightFogInscatteringScale",
    heightFogInscatteringScale,
  );
  validateCalibrationScale(
    "options.heightFogDirectionalInscatteringScale",
    heightFogDirectionalInscatteringScale,
  );
  validateRange(
    "options.heightFogDirectionalInscatteringExponent",
    heightFogDirectionalInscatteringExponent,
    1.0,
    128.0,
  );
  //>>includeStart('debug', pragmas.debug);
  Check.typeOf.bool("options.enabled", enabled);
  Check.typeOf.bool("options.showAtmosphere", showAtmosphere);
  Check.typeOf.bool("options.showAerialPerspective", showAerialPerspective);
  Check.typeOf.bool("options.showHeightFog", showHeightFog);
  Check.typeOf.bool("options.showClouds", showClouds);
  Check.typeOf.bool("options.showCloudShadows", showCloudShadows);
  Check.typeOf.bool("options.showCrepuscularRays", showCrepuscularRays);
  Check.typeOf.bool("options.showBloom", showBloom);
  Check.typeOf.bool("options.showLensFlare", showLensFlare);
  Check.typeOf.bool("options.showMoonlight", showMoonlight);
  //>>includeEnd('debug');

  this._mode = mode;
  this._world = world;
  this._enabled = enabled;
  this._showAtmosphere = showAtmosphere;
  this._showAerialPerspective = showAerialPerspective;
  this._showHeightFog = showHeightFog;
  this._showClouds = showClouds;
  this._showCloudShadows = showCloudShadows;
  this._showCrepuscularRays = showCrepuscularRays;
  this._showBloom = showBloom;
  this._showLensFlare = showLensFlare;
  this._showMoonlight = showMoonlight;
  this._cloudQuality = cloudQuality;
  this._cloudPreset = cloudPreset;
  this._cloudCoverage = cloudCoverage;
  this._cloudDensity = cloudDensity;
  this._cloudBaseHeight = cloudBaseHeight;
  this._cloudThickness = cloudThickness;
  this._cloudWindDirection = cloudWindDirection;
  this._cloudWindSpeed = cloudWindSpeed;
  this._cloudTime = cloudTime;
  this._cloudRadianceScale = cloudRadianceScale;
  this._backgroundRadianceScale = backgroundRadianceScale;
  this._aerialRadianceScale = aerialRadianceScale;
  this._surfaceRadianceScale = surfaceRadianceScale;
  this._bloomThreshold = bloomThreshold;
  this._bloomIntensity = bloomIntensity;
  this._lensFlareIntensity = lensFlareIntensity;
  this._moonlightIntensity = moonlightIntensity;
  this._heightFogDensity = heightFogDensity;
  this._heightFogHeightFalloff = heightFogHeightFalloff;
  this._heightFogBaseHeight = heightFogBaseHeight;
  this._heightFogStartDistance = heightFogStartDistance;
  this._heightFogMaximumOpacity = heightFogMaximumOpacity;
  this._heightFogInscatteringScale = heightFogInscatteringScale;
  this._heightFogDirectionalInscatteringScale =
    heightFogDirectionalInscatteringScale;
  this._heightFogDirectionalInscatteringExponent =
    heightFogDirectionalInscatteringExponent;
  this._ready = false;
  this._errorEvent = new Event();
  this._element = undefined;
  this._scene = undefined;
  this._pipeline = undefined;
  this._ownsGlobeDepthTestLifecycle = false;
  this._changedGlobeDepthTestAgainstTerrain = false;
  this._globeDepthTestAgainstTerrainPrevious = undefined;
  this._directionalLight =
    mode === globeMode
      ? new DirectionalLight({ direction: Cartesian3.UNIT_X })
      : undefined;
  this._celestialSunColor = new Color();
  this._celestialSunIntensity = 2.0;
  this._ownsGlobeCelestialLifecycle = false;
  this._celestialPreviousLight = undefined;
  this._celestialMoon = undefined;
  this._celestialPreviousMoonTextureUrl = undefined;
  this._celestialMoonTextureUrl = undefined;
  this._changedMoonTextureUrl = false;
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
  /**
   * Gets or sets whether advanced environment effects are active.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
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
        releaseGlobeCelestialLifecycle(this);
        releaseGlobeDepthTestLifecycle(this);
      }
      requestRender(this);
    },
  },
  /**
   * Gets or sets whether the physical atmosphere and Sun background are shown.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
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
        this._pipeline.setShow(
          value,
          this._showAerialPerspective,
          this._showHeightFog,
          this._showClouds,
        );
      }
      if (this._enabled && defined(this._scene)) {
        requestRender(this);
      }
    },
  },
  /**
   * Gets or sets whether opaque geometry receives aerial perspective.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
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
        this._pipeline.setShow(
          this._showAtmosphere,
          value,
          this._showHeightFog,
          this._showClouds,
        );
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
   * Gets or sets the aerial radiance scale, relative to
   * {@link SceneGISEnvironmentEffects#backgroundRadianceScale} on both worlds.
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
  /**
   * Gets or sets the Globe, Planar surface and physical model direct and diffuse sky radiance scale.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  surfaceRadianceScale: {
    get: function () {
      return this._surfaceRadianceScale;
    },
    set: function (value) {
      setWarmNumber(this, "_surfaceRadianceScale", value, 0.0, 64.0);
    },
  },
  /**
   * Gets or sets whether exponential height fog is shown.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
  showHeightFog: {
    get: function () {
      return this._showHeightFog;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      Check.typeOf.bool("value", value);
      //>>includeEnd('debug');
      if (this._showHeightFog === value) {
        return;
      }
      this._showHeightFog = value;
      if (defined(this._pipeline) && !this._pipeline.isDestroyed()) {
        this._pipeline.setShow(
          this._showAtmosphere,
          this._showAerialPerspective,
          value,
          this._showClouds,
        );
      }
      requestRenderIfActive(this);
    },
  },
  /**
   * Gets or sets the base-height extinction coefficient per meter.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  heightFogDensity: {
    get: function () {
      return this._heightFogDensity;
    },
    set: function (value) {
      setWarmNumber(this, "_heightFogDensity", value, 0.0, 0.001);
    },
  },
  /**
   * Gets or sets the exponential height falloff per meter.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  heightFogHeightFalloff: {
    get: function () {
      return this._heightFogHeightFalloff;
    },
    set: function (value) {
      setWarmNumber(this, "_heightFogHeightFalloff", value, 0.0, 0.001);
    },
  },
  /**
   * Gets or sets the density reference height in meters.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  heightFogBaseHeight: {
    get: function () {
      return this._heightFogBaseHeight;
    },
    set: function (value) {
      setWarmNumber(this, "_heightFogBaseHeight", value, -60000.0, 60000.0);
    },
  },
  /**
   * Gets or sets the distance in meters before fog starts along each ray.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  heightFogStartDistance: {
    get: function () {
      return this._heightFogStartDistance;
    },
    set: function (value) {
      setWarmNumber(this, "_heightFogStartDistance", value, 0.0, 300000.0);
    },
  },
  /**
   * Gets or sets the maximum fog opacity.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  heightFogMaximumOpacity: {
    get: function () {
      return this._heightFogMaximumOpacity;
    },
    set: function (value) {
      setWarmNumber(this, "_heightFogMaximumOpacity", value, 0.0, 1.0);
    },
  },
  /**
   * Gets or sets the scene-linear ambient fog inscattering scale.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  heightFogInscatteringScale: {
    get: function () {
      return this._heightFogInscatteringScale;
    },
    set: function (value) {
      setWarmNumber(this, "_heightFogInscatteringScale", value, 0.0, 64.0);
    },
  },
  /**
   * Gets or sets the scene-linear directional fog inscattering scale.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  heightFogDirectionalInscatteringScale: {
    get: function () {
      return this._heightFogDirectionalInscatteringScale;
    },
    set: function (value) {
      setWarmNumber(
        this,
        "_heightFogDirectionalInscatteringScale",
        value,
        0.0,
        64.0,
      );
    },
  },
  /**
   * Gets or sets the directional fog lobe exponent.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  heightFogDirectionalInscatteringExponent: {
    get: function () {
      return this._heightFogDirectionalInscatteringExponent;
    },
    set: function (value) {
      setWarmNumber(
        this,
        "_heightFogDirectionalInscatteringExponent",
        value,
        1.0,
        128.0,
      );
    },
  },
  /**
   * Gets or sets whether the single-deck volumetric cloud core is shown.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
  showClouds: {
    get: function () {
      return this._showClouds;
    },
    set: function (value) {
      //>>includeStart('debug', pragmas.debug);
      Check.typeOf.bool("value", value);
      //>>includeEnd('debug');
      if (this._showClouds === value) {
        return;
      }
      this._showClouds = value;
      if (defined(this._pipeline) && !this._pipeline.isDestroyed()) {
        this._pipeline.setShow(
          this._showAtmosphere,
          this._showAerialPerspective,
          this._showHeightFog,
          value,
        );
      }
      requestRenderIfActive(this);
    },
  },
  /**
   * Gets or sets whether volumetric clouds attenuate direct light on supported surfaces and models.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
  showCloudShadows: {
    get: function () {
      return this._showCloudShadows;
    },
    set: function (value) {
      setWarmBoolean(this, "_showCloudShadows", value, "cloud-shadows");
    },
  },
  /**
   * Gets or sets whether cloud shadow length modulates atmosphere and fog Sun inscatter.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
  showCrepuscularRays: {
    get: function () {
      return this._showCrepuscularRays;
    },
    set: function (value) {
      setWarmBoolean(this, "_showCrepuscularRays", value, "crepuscular-rays");
    },
  },
  /**
   * Gets or sets whether scene-wide HDR bloom is shown.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
  showBloom: {
    get: function () {
      return this._showBloom;
    },
    set: function (value) {
      setRenderBoolean(this, "_showBloom", value);
    },
  },
  /**
   * Gets or sets whether Sun-gated lens artifacts are shown.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
  showLensFlare: {
    get: function () {
      return this._showLensFlare;
    },
    set: function (value) {
      setRenderBoolean(this, "_showLensFlare", value);
    },
  },
  /** @memberof SceneGISEnvironmentEffects.prototype @type {number} */
  bloomThreshold: {
    get: function () {
      return this._bloomThreshold;
    },
    set: function (value) {
      setWarmNumber(this, "_bloomThreshold", value, 0.0, 65504.0);
    },
  },
  /** @memberof SceneGISEnvironmentEffects.prototype @type {number} */
  bloomIntensity: {
    get: function () {
      return this._bloomIntensity;
    },
    set: function (value) {
      setWarmNumber(this, "_bloomIntensity", value, 0.0, 64.0);
    },
  },
  /** @memberof SceneGISEnvironmentEffects.prototype @type {number} */
  lensFlareIntensity: {
    get: function () {
      return this._lensFlareIntensity;
    },
    set: function (value) {
      setWarmNumber(this, "_lensFlareIntensity", value, 0.0, 64.0);
    },
  },
  /**
   * Gets or sets the exact low, medium, or high cloud budget.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {string}
   */
  cloudQuality: {
    get: function () {
      return this._cloudQuality;
    },
    set: function (value) {
      if (!cloudQualities.includes(value)) {
        throw new DeveloperError(
          'value must be exactly "low", "medium", or "high".',
        );
      }
      if (this._cloudQuality === value) {
        return;
      }
      this._cloudQuality = value;
      requestRenderIfActive(this);
    },
  },
  /**
   * Gets or sets the immutable cloud morphology preset.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {string}
   */
  cloudPreset: {
    get() {
      return this._cloudPreset;
    },
    set(value) {
      if (!cloudPresets.includes(value)) {
        throw new DeveloperError(
          'cloudPreset must be exactly "cumulus", "stratus", "cirrus", or "mixed".',
        );
      }
      if (this._cloudPreset === value) {
        return;
      }
      this._cloudPreset = value;
      requestRenderIfActive(this);
    },
  },
  /**
   * Gets or sets the global cloud coverage bias.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  cloudCoverage: {
    get: function () {
      return this._cloudCoverage;
    },
    set: function (value) {
      setWarmNumber(this, "_cloudCoverage", value, 0.0, 1.0);
    },
  },
  /**
   * Gets or sets the Globe reference-material density multiplier or Planar
   * cloud extinction per meter.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  cloudDensity: {
    get: function () {
      return this._cloudDensity;
    },
    set: function (value) {
      setWarmNumber(
        this,
        "_cloudDensity",
        value,
        0.0,
        this._mode === globeMode ? 64.0 : 0.01,
      );
    },
  },
  /**
   * Gets or sets cloud base height in meters above the world reference ground.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  cloudBaseHeight: {
    get: function () {
      return this._cloudBaseHeight;
    },
    set: function (value) {
      setWarmNumber(this, "_cloudBaseHeight", value, -500.0, 20000.0);
    },
  },
  /**
   * Gets or sets cloud deck thickness in meters.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  cloudThickness: {
    get: function () {
      return this._cloudThickness;
    },
    set: function (value) {
      setWarmNumber(this, "_cloudThickness", value, 0.0, 20000.0);
    },
  },
  /**
   * Gets or sets clockwise wind direction from local North in radians.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  cloudWindDirection: {
    get: function () {
      return this._cloudWindDirection;
    },
    set: function (value) {
      setWarmNumber(this, "_cloudWindDirection", value, -Math.PI, Math.PI);
    },
  },
  /**
   * Gets or sets cloud advection speed in meters per second.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  cloudWindSpeed: {
    get: function () {
      return this._cloudWindSpeed;
    },
    set: function (value) {
      setWarmNumber(this, "_cloudWindSpeed", value, 0.0, 200.0);
    },
  },
  /**
   * Gets or sets caller-owned cloud simulation time in seconds.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  cloudTime: {
    get: function () {
      return this._cloudTime;
    },
    set: function (value) {
      setWarmNumber(this, "_cloudTime", value, -1000000000.0, 1000000000.0);
    },
  },
  /**
   * Gets or sets cloud radiance calibration. Globe mode applies it relative
   * to backgroundRadianceScale; Planar mode keeps the absolute scene-linear
   * calibration.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  cloudRadianceScale: {
    get: function () {
      return this._cloudRadianceScale;
    },
    set: function (value) {
      setWarmNumber(this, "_cloudRadianceScale", value, 0.0, 64.0);
    },
  },
  /**
   * Gets or sets whether readable Globe Moonlight participates in the primary light.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   */
  showMoonlight: {
    get: function () {
      return this._showMoonlight;
    },
    set: function (value) {
      setRenderBoolean(this, "_showMoonlight", value);
    },
  },
  /**
   * Gets or sets the readable full-phase Globe Moonlight scale.
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  moonlightIntensity: {
    get: function () {
      return this._moonlightIntensity;
    },
    set: function (value) {
      setWarmNumber(this, "_moonlightIntensity", value, 0.0, 64.0);
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
  releaseGlobeCelestialLifecycle(this);
  releaseGlobeDepthTestLifecycle(this);
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
  if (!defined(this._element)) {
    throw new DeveloperError(
      "SceneGISEnvironmentEffects must be connected before firstUpdate.",
    );
  }
  activate(this, scene, time);
};

SceneGISEnvironmentEffects.prototype.update = function (scene, time) {
  if (!defined(this._element)) {
    throw new DeveloperError(
      "SceneGISEnvironmentEffects must be connected before update.",
    );
  }
  if (this._errorGeneration === this._generation) {
    return;
  }
  if (!defined(this._scene) || !defined(this._pipeline?._scene)) {
    activate(this, scene, time);
    return;
  }
  try {
    validateActive(this, scene);
  } catch (error) {
    raiseGenerationError(this, this._generation, error);
    return;
  }
  ensurePipeline(this, scene);
  if (this._mode === globeMode && !this._ready) {
    this._pipeline.prepareGlobeLighting(scene.frameState, time);
    updateGlobeCelestialLifecycle(this);
  }
  if (!this._pipeline.hasResources()) {
    beginGeneration(this, scene);
  }
  publishPendingResources(this, scene);
  if (this._ready) {
    this._pipeline.prepareGlobeLighting(scene.frameState, time);
    updateGlobeCelestialLifecycle(this);
  }
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
 * @property {boolean} [showHeightFog=true] Whether to apply single-layer exponential height fog.
 * @property {boolean} [showClouds=true] Whether to render the single-deck volumetric cloud core.
 * @property {boolean} [showCloudShadows=true] Whether volumetric clouds attenuate direct light on supported surfaces and models.
 * @property {boolean} [showCrepuscularRays=true] Whether cloud shadow length modulates atmosphere and fog Sun inscatter.
 * @property {boolean} [showBloom=true] Whether scene-wide HDR bloom is shown.
 * @property {boolean} [showLensFlare=true] Whether Sun-gated lens artifacts are shown.
 * @property {boolean} [showMoonlight=true] Whether readable Globe Moonlight participates in the primary directional light.
 * @property {string} [cloudQuality] Exact "low", "medium", or "high" cloud budget. Defaults to "high" on Globe and "medium" on Planar.
 * @property {string} [cloudPreset="cumulus"] Exact "cumulus", "stratus", "cirrus", or "mixed" immutable morphology preset.
 * @property {number} [cloudCoverage] Global cloud coverage bias in the inclusive range 0–1. Defaults to 0.3 on Globe and 0.45 on Planar.
 * @property {number} [cloudDensity] Globe reference-material density multiplier in the inclusive range 0–64, or Planar cloud extinction per meter in the inclusive range 0–0.01. Defaults to 1.0 on Globe and 0.001 on Planar.
 * @property {number} [cloudBaseHeight] Cloud base height in meters in the inclusive range -500–20000. Defaults to 750.0 on Globe and 1500.0 on Planar.
 * @property {number} [cloudThickness=4500.0] Cloud deck thickness in meters in the inclusive range 0–20000.
 * @property {number} [cloudWindDirection=0.785398] Clockwise wind direction from local North in radians, in the inclusive range -pi–pi.
 * @property {number} [cloudWindSpeed=20.0] Cloud advection speed in meters per second in the inclusive range 0–200.
 * @property {number} [cloudTime=0.0] Caller-owned simulation seconds in the inclusive range -1000000000–1000000000.
 * @property {number} [cloudRadianceScale] Cloud radiance calibration in the inclusive range 0–64. On Globe, this is relative to backgroundRadianceScale and defaults to 1.0; on Planar, it remains the absolute scene-linear scale and defaults to 48.0.
 * @property {number} [backgroundRadianceScale] Scene-linear scale applied to physical background radiance, in the inclusive range 0–64. Defaults to 4.0 on Globe and 10.0 on Planar.
 * @property {number} [aerialRadianceScale=1.0] Aerial radiance scale in the inclusive range 0–64, relative to backgroundRadianceScale on both worlds.
 * @property {number} [surfaceRadianceScale=10.0] Globe, Planar surface and physical model direct/diffuse sky radiance scale, in the inclusive range 0–64.
 * @property {number} [bloomThreshold=10.0] HDR bloom threshold in the inclusive RGBA16F range 0–65504.
 * @property {number} [bloomIntensity=0.05] Scene-wide bloom intensity in the inclusive range 0–64.
 * @property {number} [lensFlareIntensity=5.0] Sun-gated lens artifact intensity in the inclusive range 0–64.
 * @property {number} [moonlightIntensity=1.0] Readable full-phase Globe Moonlight scale in the inclusive range 0–64.
 * @property {number} [heightFogDensity=0.000008] Base-height extinction coefficient per meter, in the inclusive range 0–0.001.
 * @property {number} [heightFogHeightFalloff=0.0002] Exponential height falloff per meter, in the inclusive range 0–0.001.
 * @property {number} [heightFogBaseHeight=0.0] Density reference height in meters, in the inclusive range -60000–60000.
 * @property {number} [heightFogStartDistance=250.0] Fog-free ray distance in meters, in the inclusive range 0–300000.
 * @property {number} [heightFogMaximumOpacity=0.7] Maximum fog opacity, in the inclusive range 0–1.
 * @property {number} [heightFogInscatteringScale=0.35] Ambient fog source scale, in the inclusive range 0–64.
 * @property {number} [heightFogDirectionalInscatteringScale=0.15] Directional fog source scale, in the inclusive range 0–64.
 * @property {number} [heightFogDirectionalInscatteringExponent=8.0] Directional lobe exponent, in the inclusive range 1–128.
 */

export default SceneGISEnvironmentEffects;

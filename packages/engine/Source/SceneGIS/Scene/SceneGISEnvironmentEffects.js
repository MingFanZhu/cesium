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
const cloudAssetFiles = Object.freeze([
  { key: "cloudShape", root: "cloud", name: "globe-shape.bin" },
  { key: "cloudDetail", root: "cloud", name: "globe-detail.bin" },
  { key: "cloudWeather", root: "cloud", name: "globe-weather.bin" },
  { key: "cloudTurbulence", root: "cloud", name: "globe-turbulence.bin" },
  { key: "cloudStbn", root: "cloud", name: "globe-stbn.bin" },
]);
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
    (!defined(scene._sceneGISDeferred) &&
      (!isHidden(scene.skyAtmosphere) ||
        !isHidden(scene.skyBox) ||
        !isHidden(scene.sun) ||
        scene.sunBloom !== false ||
        scene.fog.enabled !== false ||
        scene.globe.showGroundAtmosphere !== false ||
        scene.globe.enableLighting !== false)) ||
    (controller._showBloom && scene.postProcessStages.bloom.enabled !== false)
  ) {
    throw new DeveloperError(
      "Advanced Globe environment requires native sky, Sun, Sun bloom, enabled post-process bloom, Fog, ground atmosphere, and Globe lighting to be disabled.",
    );
  }
  if (defined(controller._world)) {
    throw new DeveloperError('mode "globe" must not use a planar world.');
  }
  if (
    defined(scene.light) &&
    !(scene.light instanceof SunLight) &&
    !(scene.light instanceof DirectionalLight)
  ) {
    throw new DeveloperError(
      "Advanced Globe lighting requires a SunLight or DirectionalLight.",
    );
  }
  if (controller._ownsGlobeCelestialLifecycle) {
    if (scene.moon !== controller._celestialMoon) {
      throw new DeveloperError(
        "scene.moon must remain the captured Moon while advanced Globe Moonlight is active.",
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

function selectGlobeLight(controller, scene) {
  if (
    scene.light === controller._directionalLight ||
    scene.light instanceof DirectionalLight
  ) {
    return;
  }
  controller._celestialPreviousLight = scene.light;
  Color.clone(scene.light?.color ?? Color.WHITE, controller._celestialSunColor);
  controller._celestialSunIntensity = scene.light?.intensity ?? 2.0;
  scene.light = controller._directionalLight;
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
  selectGlobeLight(controller, scene);
  if (controller._changedMoonTextureUrl) {
    scene.moon.textureUrl = controller._celestialMoonTextureUrl;
  }
}

function updateGlobeCelestialLifecycle(controller) {
  if (
    !controller._ownsGlobeCelestialLifecycle ||
    controller._scene.light !== controller._directionalLight
  ) {
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
    !defined(scene._sceneGISDeferred) &&
    (environment._showAtmosphere ||
      defined(environment._skyBox) ||
      environment._showSun ||
      environment._showMoon)
  ) {
    throw new DeveloperError(
      "Advanced planar environment conflicts with lightweight planar sky, atmosphere, Sun, or Moon output.",
    );
  }
  if (
    !isHidden(scene.moon) ||
    (!defined(scene._sceneGISDeferred) &&
      (!isHidden(scene.skyAtmosphere) ||
        !isHidden(scene.skyBox) ||
        !isHidden(scene.sun) ||
        scene.fog.enabled !== false))
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
  if (scene.highDynamicRange !== true && !defined(scene._sceneGISDeferred)) {
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
    pipeline.cancelCloudPreparation();
    pipeline.releaseGlobeLighting();
    pipeline.detach();
  }
}

function invalidateGeneration(controller) {
  controller._generation++;
  controller._pendingBuffers = undefined;
  controller._generationStarted = false;
  controller._cloudGenerationStarted = false;
  controller._pendingCloudBuffers = undefined;
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

async function fetchEnvironmentAssets(
  controller,
  generation,
  cloudsOnly = false,
) {
  const assetRoot = assetRoots[controller._mode];
  const includeClouds = cloudsOnly || controller._showClouds;
  const assetFiles = cloudsOnly
    ? cloudAssetFiles
    : [...worldAssetFiles, ...(includeClouds ? cloudAssetFiles : [])];
  controller._cloudGenerationStarted ||= includeClouds;
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
    const pending = Object.fromEntries(
      assetFiles.map((file, index) => [file.key, buffers[index]]),
    );
    if (cloudsOnly) {
      controller._pendingCloudBuffers = pending;
    } else {
      controller._pendingBuffers = pending;
    }
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
  const pipeline = controller._pipeline;
  try {
    if (defined(controller._pendingBuffers)) {
      const buffers = controller._pendingBuffers;
      controller._pendingBuffers = undefined;
      // Publish the atmosphere while cloud programs compile independently.
      pipeline.publishResources(scene.context, {
        transmittance: buffers.transmittance,
        scattering: buffers.scattering,
        irradiance: buffers.irradiance,
      });
      if (defined(buffers.cloudShape)) {
        controller._pendingCloudBuffers = buffers;
      }
      controller._ready = true;
    }
    if (!controller._showClouds) {
      pipeline.cancelCloudPreparation();
    } else if (
      controller._ready &&
      (defined(controller._pendingCloudBuffers) || pipeline.hasCloudTextures())
    ) {
      if (
        pipeline.prepareCloudResources(
          scene.context,
          controller._pendingCloudBuffers,
        )
      ) {
        controller._pendingCloudBuffers = undefined;
      }
    }
    if (
      controller._ready &&
      controller._showClouds &&
      !pipeline.hasCloudTextures() &&
      !controller._cloudGenerationStarted
    ) {
      void fetchEnvironmentAssets(controller, controller._generation, true);
    }
  } catch (error) {
    raiseGenerationError(controller, controller._generation, error);
  }
}

function prepareLighting(controller, scene, time) {
  try {
    controller._pipeline.prepareGlobeLighting(scene.frameState, time);
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
    publishPendingResources(controller, scene);
    prepareLighting(controller, scene, time);
    updateGlobeCelestialLifecycle(controller);
    return;
  }
  if (controller._mode === globeMode) {
    prepareLighting(controller, scene, time);
    updateGlobeCelestialLifecycle(controller);
  }
  beginGeneration(controller, scene);
  publishPendingResources(controller, scene);
  if (controller._ready) {
    prepareLighting(controller, scene, time);
    updateGlobeCelestialLifecycle(controller);
  }
}

function validateAerialPerspectiveDistanceScale(mode, name, value) {
  validateRange(name, value, 0.0, 8.0);
  if (mode === planarMode && value !== 1.0) {
    throw new DeveloperError(
      `${name} must be 1.0 in Planar mode; distance scaling currently supports Globe only.`,
    );
  }
}

/**
 * 控制原生 Globe 或 SceneGIS 平面世界的高级物理大气与空气透视管线。调用方安装的 scene.light DirectionalLight 驱动地表、模型和云的受光，不改变天空天体方向；安装 SunLight 可恢复自动日月光照。此控制器不拥有也不改写调用方的光源。
 *
 * 显式构造的控制器归调用方所有。应注册到 Scene 控制器宿主，并在销毁宿主前移除。默认禁用，首次启用更新之前不请求资源或修改 Scene。Scene.environmentEffects 也可能返回 Scene 所有的轻量默认实例；直接修改其属性即可，无需注册或移除。显式注册的控制器优先。
 *
 * <p>原生环境边界：当前 WebGL 延迟渲染路径由高级环境统一提供天空、太阳、可视雾和物理受光。原生 SkyAtmosphere、SkyBox、Sun / sunBloom、Fog 可视雾、Globe.showGroundAtmosphere 和 Globe.enableLighting 的旧视觉分支不会执行；修改它们的显隐或调色参数不会恢复原生效果。设置 enabled=false 或关闭各显示项也不会回退到旧路径。绕过内部渲染门控强行启用旧路径不属于维护和验证范围。</p>
 * <p>Fog 的瓦片裁剪与 LOD 调度、球面 Moon 与星历、scene.light 及几何阴影控制仍有各自用途。平面的 SceneGISPlanarEnvironment 仍可提供方向与光源，但其轻量天空、天空盒及天体绘制同样被跳过。</p>
 *
 * @alias SceneGISEnvironmentEffects
 * @constructor
 *
 * @param {SceneGISEnvironmentEffects.ConstructorOptions} options 配置选项。
 *
 * @exception {DeveloperError} options.mode 必须精确为 "globe" 或 "planar"。
 * @exception {DeveloperError} 平面模式要求存活的 SceneGISPlanarWorld，球面模式禁止传入 world。
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
  const whiteBalance = options.whiteBalance ?? true;
  const showAerialPerspective = options.showAerialPerspective ?? true;
  const showHeightFog = options.showHeightFog ?? true;
  const showClouds = options.showClouds ?? true;
  const showCloudShadows = options.showCloudShadows ?? true;
  const showCrepuscularRays = options.showCrepuscularRays ?? true;
  const showBloom = options.showBloom ?? true;
  const showLensFlare = options.showLensFlare ?? true;
  const showMoonlight = options.showMoonlight ?? true;
  const showStars = options.showStars ?? true;
  const starIntensity = options.starIntensity ?? 1.0;
  const cloudQuality =
    options.cloudQuality ?? (mode === globeMode ? "high" : "medium");
  const cloudPreset = options.cloudPreset ?? "cumulus";
  const cloudCoverage =
    options.cloudCoverage ?? (mode === globeMode ? 0.3 : 0.45);
  const cloudDensity = options.cloudDensity ?? 1.0;
  const cloudBaseHeight =
    options.cloudBaseHeight ?? (mode === globeMode ? 750.0 : 1500.0);
  const cloudThickness = options.cloudThickness ?? 4500.0;
  const cloudWindDirection = options.cloudWindDirection ?? 0.785398;
  const cloudWindSpeed = options.cloudWindSpeed ?? 20.0;
  const cloudTime = options.cloudTime ?? 0.0;
  const cloudRadianceScale = options.cloudRadianceScale ?? 1.0;
  // Apply the accepted appearance defaults independently of display exposure
  // and the shared physical radiance units. Explicit caller values take priority.
  const backgroundRadianceScale = options.backgroundRadianceScale ?? 2.5;
  const aerialRadianceScale = options.aerialRadianceScale ?? 1.0;
  const aerialPerspectiveDistanceScale =
    options.aerialPerspectiveDistanceScale ?? (mode === globeMode ? 0.5 : 1.0);
  const surfaceRadianceScale = options.surfaceRadianceScale ?? 1.2;
  const nightAmbientIntensity = options.nightAmbientIntensity ?? 1.0;
  const bloomThreshold = options.bloomThreshold ?? 10.0;
  const bloomIntensity = options.bloomIntensity ?? 0.005;
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
  validateAerialPerspectiveDistanceScale(
    mode,
    "options.aerialPerspectiveDistanceScale",
    aerialPerspectiveDistanceScale,
  );
  validateRange(
    "options.nightAmbientIntensity",
    nightAmbientIntensity,
    0.0,
    8.0,
  );
  validateCalibrationScale(
    "options.surfaceRadianceScale",
    surfaceRadianceScale,
  );
  validateRange("options.bloomThreshold", bloomThreshold, 0.0, 65504.0);
  validateCalibrationScale("options.bloomIntensity", bloomIntensity);
  validateCalibrationScale("options.lensFlareIntensity", lensFlareIntensity);
  validateCalibrationScale("options.moonlightIntensity", moonlightIntensity);
  validateCalibrationScale("options.starIntensity", starIntensity);
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
  validateRange("options.cloudDensity", cloudDensity, 0.0, 64.0);
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
  Check.typeOf.bool("options.whiteBalance", whiteBalance);
  Check.typeOf.bool("options.showAerialPerspective", showAerialPerspective);
  Check.typeOf.bool("options.showHeightFog", showHeightFog);
  Check.typeOf.bool("options.showClouds", showClouds);
  Check.typeOf.bool("options.showCloudShadows", showCloudShadows);
  Check.typeOf.bool("options.showCrepuscularRays", showCrepuscularRays);
  Check.typeOf.bool("options.showBloom", showBloom);
  Check.typeOf.bool("options.showLensFlare", showLensFlare);
  Check.typeOf.bool("options.showMoonlight", showMoonlight);
  Check.typeOf.bool("options.showStars", showStars);
  //>>includeEnd('debug');

  this._mode = mode;
  this._world = world;
  this._enabled = enabled;
  this._showAtmosphere = showAtmosphere;
  this._whiteBalance = whiteBalance;
  this._showAerialPerspective = showAerialPerspective;
  this._showHeightFog = showHeightFog;
  this._showClouds = showClouds;
  this._showCloudShadows = showCloudShadows;
  this._showCrepuscularRays = showCrepuscularRays;
  this._showBloom = showBloom;
  this._showLensFlare = showLensFlare;
  this._showMoonlight = showMoonlight;
  this._showStars = showStars;
  this._starIntensity = starIntensity;
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
  this._aerialPerspectiveDistanceScale = aerialPerspectiveDistanceScale;
  this._surfaceRadianceScale = surfaceRadianceScale;
  this._nightAmbientIntensity = nightAmbientIntensity;
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
  this._cloudGenerationStarted = false;
  this._pendingCloudBuffers = undefined;
  this._pendingBuffers = undefined;
  this._errorGeneration = -1;
}

/**
 * 检查存活 Scene 是否具备完整 A2 WebGL2 RGBA16F 能力。此方法只读，不挂载管线或分配资源。
 *
 * @function
 * @param {Scene} scene 需要测试的 Scene。
 * @returns {boolean} 是否支持完整高级环境能力。
 * @exception {DeveloperError} scene 必须是存活的 Scene。
 */
SceneGISEnvironmentEffects.isSupported = isSupported;

Object.defineProperties(SceneGISEnvironmentEffects.prototype, {
  /**
   * 最终 HDR/LDR 显示是否使用固定地球太阳光谱白点。在场景合成后全局应用，保留大气颜色变化，不估计当前光源，也不改动光照、曝光或影像。
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   * @default true
   */
  whiteBalance: {
    get: function () {
      return this._whiteBalance;
    },
    set: function (value) {
      setRenderBoolean(this, "_whiteBalance", value);
    },
  },
  /**
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {string}
   * @readonly
   */
  mode: {
    get: function () {
      return this._mode;
    },
  },
  /**
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {SceneGISPlanarWorld|undefined}
   * @readonly
   */
  world: {
    get: function () {
      return this._world;
    },
  },
  /**
   * 大气和已启用云是否适配当前深度模式并已就绪。
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   * @readonly
   */
  ready: {
    get: function () {
      return (
        this._ready &&
        (!this._enabled || !this._showClouds || this._pipeline.cloudsReady())
      );
    },
  },
  /**
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {Event}
   * @readonly
   */
  errorEvent: {
    get: function () {
      return this._errorEvent;
    },
  },
  /**
   * 获取或设置高级环境效果是否启用。当前 WebGL 延迟渲染路径中，禁用不会恢复原生 Cesium 环境或平面轻量环境的视觉分支。
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
   * 获取或设置是否显示物理大气、太阳和星空背景。
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
   * 获取或设置不透明几何是否接收空气透视。
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
   * 获取或设置物理背景辐亮度的场景线性倍率，同时标定空气透视、云和高度雾源辐亮度。两世界默认外观倍率均为 2.5，独立于显示 HDR 和曝光。
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   * @default 2.5
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
   * 获取或设置空气透视辐亮度倍率，两世界均相对于 {@link SceneGISEnvironmentEffects#backgroundRadianceScale}。
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
   * 获取或设置有限接收点的大气查询距离倍率。小于 1 同时减少空气散射和衰减；0 移除二者，1 保留物理查询距离，不包含初始真空段。天空背景、光照、云密度、高度雾及真实几何/深度不变。这是艺术化端点映射。球面支持 [0,8] 内有限值，默认 0.5；平面仅允许 1.0，默认 1.0。更新复用已有 GPU 资源并请求渲染。
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   * @default 0.5 (Globe), 1.0 (Planar)
   * @exception {DeveloperError} 数值超出支持范围，或平面模式下不为 1。
   */
  aerialPerspectiveDistanceScale: {
    get: function () {
      return this._aerialPerspectiveDistanceScale;
    },
    set: function (value) {
      validateAerialPerspectiveDistanceScale(this._mode, "value", value);
      setWarmNumber(this, "_aerialPerspectiveDistanceScale", value, 0.0, 8.0);
    },
  },
  /**
   * 获取或设置球面、平面地表与物理模型的直射和天空漫反射辐亮度倍率。两世界默认外观倍率均为 1.2，此艺术调整独立于显示 HDR 与曝光。
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   * @default 1.2
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
   * 获取或设置艺术化夜间环境辐照度下限倍率。随日光增强，物理天空辐照度平滑替代蓝灰半球补光。0 关闭补光，1 保留参考深夜亮度；材质、法线和环境遮蔽仍生效。不改变天空背景、月光或曝光。球面和平面支持 [0,8] 内有限值，更新复用已有 GPU 资源并请求渲染。
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   * @default 1.0
   * @exception {DeveloperError} 数值超出支持范围。
   */
  nightAmbientIntensity: {
    get: function () {
      return this._nightAmbientIntensity;
    },
    set: function (value) {
      validateRange("value", value, 0.0, 8.0);
      setWarmNumber(this, "_nightAmbientIntensity", value, 0.0, 8.0);
    },
  },
  /**
   * 获取或设置是否显示指数高度雾。
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
   * 获取或设置基准高度的每米消光系数。
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
   * 获取或设置每米指数高度衰减系数。
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
   * 获取或设置密度参考高度，单位为米。
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
   * 获取或设置每条射线上雾开始前的距离，单位为米。
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
   * 获取或设置雾的最大不透明度。
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
   * 获取或设置场景线性的环境雾入散射倍率。
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
   * 获取或设置场景线性的方向性雾入散射倍率。
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
   * 获取或设置雾的方向性瓣指数。
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
   * 获取或设置是否显示单云层体积云主体。
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
   * 获取或设置体积云是否衰减支持表面和模型的直射光，并提供远处云自阴影；禁用时局部云自阴影仍生效。
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
   * 获取或设置是否使用云影长度调制大气和雾的方向性入散射。
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
   * 获取或设置是否显示全场景 HDR 泛光。
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
   * 获取或设置是否显示受太阳可见性控制的镜头光学效果。
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
  /**
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  bloomThreshold: {
    get: function () {
      return this._bloomThreshold;
    },
    set: function (value) {
      setWarmNumber(this, "_bloomThreshold", value, 0.0, 65504.0);
    },
  },
  /**
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  bloomIntensity: {
    get: function () {
      return this._bloomIntensity;
    },
    set: function (value) {
      setWarmNumber(this, "_bloomIntensity", value, 0.0, 64.0);
    },
  },
  /**
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  lensFlareIntensity: {
    get: function () {
      return this._lensFlareIntensity;
    },
    set: function (value) {
      setWarmNumber(this, "_lensFlareIntensity", value, 0.0, 64.0);
    },
  },
  /**
   * 获取或设置精确取值 low、medium 或 high 的云预算。
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
   * 获取或设置不可变云形态预设。
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
   * 获取或设置全局云覆盖偏置。
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
   * 获取或设置设定材质密度的无量纲倍率，两世界材质均提供以每米计的消光系数。
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   */
  cloudDensity: {
    get: function () {
      return this._cloudDensity;
    },
    set: function (value) {
      setWarmNumber(this, "_cloudDensity", value, 0.0, 64.0);
    },
  },
  /**
   * 获取或设置相对世界参考地面的云底高度，单位为米。
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
   * 获取或设置云层厚度，单位为米。
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
   * 获取或设置从局部北向顺时针计算的风向，单位为弧度。
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
   * 获取或设置云平流速度，单位为米/秒。
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
   * 获取或设置调用方控制的云模拟时间，单位为秒。
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
   * 获取或设置两世界中相对 backgroundRadianceScale 的云辐亮度标定。
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
   * 获取或设置球面或平面的可读月光是否参与主光源。
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
   * 是否在透视大气背景中显示经大气、雾和云衰减的程序星空。星光在暮光时渐显。球面和星历平面世界使用模拟时间，手动平面光照使用固定世界轴。星位是合成位置，不是星表。要求 showAtmosphere，不下载星空图像。热切换复用确定性星光缓冲，正交视图没有角度星空。
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {boolean}
   * @default true
   */
  showStars: {
    get: function () {
      return this._showStars;
    },
    set: function (value) {
      setRenderBoolean(this, "_showStars", value);
    },
  },
  /**
   * 场景线性星光亮度，闭区间 0–64，独立于 backgroundRadianceScale；仅改变可见背景，不改变光照。
   *
   * @memberof SceneGISEnvironmentEffects.prototype
   * @type {number}
   * @default 1.0
   */
  starIntensity: {
    get: function () {
      return this._starIntensity;
    },
    set: function (value) {
      setWarmNumber(this, "_starIntensity", value, 0.0, 64.0);
    },
  },
  /**
   * 获取或设置球面或平面满月可读月光倍率。
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
  if (this._mode === globeMode) {
    selectGlobeLight(this, scene);
  }
  if (this._mode === globeMode && !this._ready) {
    prepareLighting(this, scene, time);
    updateGlobeCelestialLifecycle(this);
  }
  if (!this._pipeline.hasResources()) {
    beginGeneration(this, scene);
  }
  publishPendingResources(this, scene);
  if (this._ready) {
    prepareLighting(this, scene, time);
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
 * SceneGISEnvironmentEffects 的初始化选项。
 *
 * @typedef {object} SceneGISEnvironmentEffects.ConstructorOptions
 * @property {string} mode 几何模式，精确取值为 "globe" 或 "planar"。
 * @property {SceneGISPlanarWorld} [world] 仅平面模式需要。
 * @property {boolean} [enabled=false] 高级效果是否启用。
 * @property {boolean} [showAtmosphere=true] 是否绘制大气和太阳背景。
 * @property {boolean} [whiteBalance=true] 最终 HDR/LDR 显示是否使用固定的地球太阳光谱白点。
 * @property {boolean} [showAerialPerspective=true] 是否为不透明几何合成空气透视。
 * @property {boolean} [showHeightFog=true] 是否应用单层指数高度雾。
 * @property {boolean} [showClouds=true] 是否绘制单云层体积云主体。
 * @property {boolean} [showCloudShadows=true] 体积云是否衰减支持表面和模型的直射光，并提供远处云自阴影。
 * @property {boolean} [showCrepuscularRays=true] 是否使用云影长度调制大气与雾的方向性入散射。
 * @property {boolean} [showBloom=true] 是否显示全场景 HDR 泛光。
 * @property {boolean} [showLensFlare=true] 是否显示受太阳可见性控制的镜头光学效果。
 * @property {boolean} [showMoonlight=true] 球面或平面的可读月光是否参与主方向光。
 * @property {boolean} [showStars=true] 物理大气背景是否包含经大气、雾和云衰减的星空。
 * @property {number} [starIntensity=1.0] 场景线性星光亮度，闭区间 0–64，独立于 backgroundRadianceScale。
 * @property {string} [cloudQuality] 云计算预算，精确取值为 "low"、"medium" 或 "high"；球面默认 "high"，平面默认 "medium"。
 * @property {string} [cloudPreset="cumulus"] 不可变云形态预设，精确取值为 "cumulus"、"stratus"、"cirrus" 或 "mixed"。
 * @property {number} [cloudCoverage] 全局云覆盖偏置，闭区间 0–1；球面默认 0.3，平面默认 0.45。
 * @property {number} [cloudDensity] 设定材质密度的无量纲倍率，闭区间 0–64，两世界默认均为 1.0。
 * @property {number} [cloudBaseHeight] 云底高度，单位为米，闭区间 -500–20000；球面默认 750.0，平面默认 1500.0。
 * @property {number} [cloudThickness=4500.0] 云层厚度，单位为米，闭区间 0–20000。
 * @property {number} [cloudWindDirection=0.785398] 从局部北向顺时针计算的风向，单位为弧度，闭区间 -pi–pi。
 * @property {number} [cloudWindSpeed=20.0] 云平流速度，单位为米/秒，闭区间 0–200。
 * @property {number} [cloudTime=0.0] 调用方控制的模拟秒数，闭区间 -1000000000–1000000000。
 * @property {number} [cloudRadianceScale] 相对 backgroundRadianceScale 的云辐亮度标定，闭区间 0–64，两世界默认均为 1.0。
 * @property {number} [backgroundRadianceScale=2.5] 作用于背景、空气透视、云和高度雾源辐亮度的场景线性倍率，闭区间 0–64；两世界使用相同默认外观倍率。
 * @property {number} [aerialRadianceScale=1.0] 相对 backgroundRadianceScale 的空气透视辐亮度倍率，两世界范围均为闭区间 0–64。
 * @property {number} [aerialPerspectiveDistanceScale] 有限接收点的大气查询距离倍率，范围 [0,8]。球面默认 0.5，平面默认且仅允许 1.0。同步缩放散射与衰减，不包含初始真空段，不改变背景天空、光照或几何。
 * @property {number} [surfaceRadianceScale=1.2] 球面、平面地表和物理模型的直射及天空漫反射辐亮度倍率，闭区间 0–64，独立于显示 HDR 与曝光。
 * @property {number} [nightAmbientIntensity=1.0] 艺术化蓝灰夜间环境光下限倍率，范围 [0,8]，0 关闭。按物理天空辐照度混合，位于材质和环境遮蔽之前，支持球面和平面，独立于月光及曝光。
 * @property {number} [bloomThreshold=10.0] HDR 泛光阈值，范围为 RGBA16F 闭区间 0–65504。
 * @property {number} [bloomIntensity=0.005] 全场景泛光强度，闭区间 0–64。
 * @property {number} [lensFlareIntensity=5.0] 受太阳可见性控制的镜头光学效果强度，闭区间 0–64。
 * @property {number} [moonlightIntensity=1.0] 球面或平面满月可读月光的倍率，闭区间 0–64。
 * @property {number} [heightFogDensity=0.000008] 基准高度的消光系数，单位为每米，闭区间 0–0.001。
 * @property {number} [heightFogHeightFalloff=0.0002] 指数高度衰减系数，单位为每米，闭区间 0–0.001。
 * @property {number} [heightFogBaseHeight=0.0] 密度参考高度，单位为米，闭区间 -60000–60000。
 * @property {number} [heightFogStartDistance=250.0] 射线的无雾起始距离，单位为米，闭区间 0–300000。
 * @property {number} [heightFogMaximumOpacity=0.7] 雾的最大不透明度，闭区间 0–1。
 * @property {number} [heightFogInscatteringScale=0.35] 环境雾源倍率，闭区间 0–64。
 * @property {number} [heightFogDirectionalInscatteringScale=0.15] 方向性雾源倍率，闭区间 0–64。
 * @property {number} [heightFogDirectionalInscatteringExponent=8.0] 方向性瓣指数，闭区间 1–128。
 */

export default SceneGISEnvironmentEffects;

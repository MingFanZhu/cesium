import defined from "../../../Core/defined.js";
import Cartesian2 from "../../../Core/Cartesian2.js";
import ShaderDestination from "../../../Renderer/ShaderDestination.js";
import ShaderSource from "../../../Renderer/ShaderSource.js";
import LightingModel from "../../../Scene/Model/LightingModel.js";
import SceneMode from "../../../Scene/SceneMode.js";
import definitions from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonDefinitions.js";
import common from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonCommon.js";
import runtime from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonRuntime.js";
import atmosphere from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import shadows from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadows.js";
import lighting from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISModelEnvironmentLighting.js";
import planarLighting from "./_SceneGISPlanarEnvironmentLighting.js";
import localProbes from "./_SceneGISReflectionProbes.js";

const uniforms = {
  u_sceneGISCloudShadowAtlas: "atlasTexture",
  u_sceneGISTransmittanceTexture: "transmittanceTexture",
  u_sceneGISIrradianceTexture: "irradianceTexture",
  u_sceneGISCloudShadowMatrices: "matrices",
  u_sceneGISCloudShadowIntervals: "intervals",
  u_sceneGISCloudShadowCascadeCount: "cascadeCount",
  u_sceneGISShowCloudShadows: "showCloudShadows",
  u_sceneGISShadowSunDirection: "primaryLightDirection",
  u_sceneGISShadowCloudTop: "cloudTop",
  u_sceneGISActualSunDirection: "sunDirection",
  u_sceneGISPrimaryLightDirection: "primaryLightDirection",
  u_sceneGISPrimaryLightScale: "primaryLightScale",
  u_surfaceRadianceScale: "surfaceRadianceScale",
};

const globeDefines = {
  SCENEGIS_GLOBE: undefined,
  COMBINED_SCATTERING_TEXTURES: undefined,
  TRANSMITTANCE_TEXTURE_WIDTH: 256,
  TRANSMITTANCE_TEXTURE_HEIGHT: 64,
  SCATTERING_TEXTURE_R_SIZE: 32,
  SCATTERING_TEXTURE_MU_SIZE: 128,
  SCATTERING_TEXTURE_MU_S_SIZE: 32,
  SCATTERING_TEXTURE_NU_SIZE: 8,
  IRRADIANCE_TEXTURE_WIDTH: 64,
  IRRADIANCE_TEXTURE_HEIGHT: 16,
};

/**
 * Borrows the active world lighting record for native model PBR.
 * @private
 */
const SceneGISModelEnvironmentLighting = {
  // Owned non-model surfaces borrow the same physical light source libraries.
  surfaceSource(planar) {
    return new ShaderSource({
      defines: planar
        ? []
        : Object.entries(globeDefines).map(([key, value]) =>
            value === undefined ? key : `${key} ${value}`,
          ),
      sources: planar
        ? [planarLighting.source, lighting]
        : [definitions, common, runtime, atmosphere, shadows, lighting],
    });
  },
  surfaceUniforms(frameState, planar) {
    if (planar) {
      return planarLighting.createUniformMap(
        () => frameState._sceneGISPlanarLighting,
      );
    }
    const result = {};
    for (const [uniform, field] of Object.entries(uniforms)) {
      result[uniform] = () => frameState._sceneGISGlobeLighting[field];
    }
    return result;
  },
  skipProceduralEnvironment(manager, frameState) {
    const active =
      frameState.mode === SceneMode.SCENE3D &&
      (frameState._sceneGISPlanarLighting?.active === true ||
        frameState._sceneGISGlobeLighting?.active === true);
    if (active !== (manager._sceneGISPhysicalLighting === true)) {
      manager.reset();
      manager._sceneGISPhysicalLighting = active;
    }
    if (active) {
      manager._shouldRegenerateShaders = false;
    }
    return active;
  },

  update(model, frameState) {
    const probes = frameState._sceneGISReflectionProbes;
    if (model._sceneGISReflectionProbes !== probes) {
      model._sceneGISReflectionProbes = probes;
      model.resetDrawCommands();
    }
    const planar = frameState._sceneGISPlanarLighting?.active === true;
    const active =
      frameState.mode === SceneMode.SCENE3D &&
      (frameState._sceneGISGlobeLighting?.active === true || planar) &&
      !defined(model.classificationType);
    const record = planar
      ? frameState._sceneGISPlanarLighting
      : frameState._sceneGISGlobeLighting;
    const sky =
      active &&
      model.environmentMapManager.enabled &&
      model.imageBasedLighting.imageBasedLightingFactor.y > 0 &&
      !defined(model.imageBasedLighting.specularEnvironmentMaps) &&
      !defined(frameState.specularEnvironmentMaps)
        ? record.skyReflections
        : undefined;
    if (sky && frameState.passes.render) {
      sky.update(frameState);
    }
    const readySky = sky?.texture ? sky : undefined;
    if (model._sceneGISSkyReflections !== readySky) {
      model._sceneGISSkyReflections = readySky;
      model.resetDrawCommands();
    }
    if (
      active !== (model._sceneGISEnvironmentLighting === true) ||
      (active && planar !== (model._sceneGISPlanarEnvironmentLighting === true))
    ) {
      model._sceneGISEnvironmentLighting = active;
      model._sceneGISPlanarEnvironmentLighting = active && planar;
      model.resetDrawCommands();
    }
  },

  processSpecular(renderResources, frameState) {
    const { model, shaderBuilder, uniformMap } = renderResources;
    const sky = model._sceneGISSkyReflections;
    if (!sky) {
      return;
    }
    const fragment = ShaderDestination.FRAGMENT;
    shaderBuilder.addDefine("SCENEGIS_SKY_REFLECTIONS", undefined, fragment);
    shaderBuilder.addUniform("mat3", "u_sceneGISSkyWorldToLocal", fragment);
    shaderBuilder.addUniform("float", "u_sceneGISSkyRadianceScale", fragment);
    uniformMap.u_sceneGISSkyWorldToLocal = () => sky.worldToLocal;
    uniformMap.u_sceneGISSkyRadianceScale = () =>
      (frameState._sceneGISPlanarLighting ?? frameState._sceneGISGlobeLighting)
        .surfaceRadianceScale;
    uniformMap.model_specularEnvironmentMaps = () => sky.texture;
    uniformMap.model_specularEnvironmentMapsMaximumLOD = () =>
      sky.maximumMipmapLevel;
    const factor = new Cartesian2();
    uniformMap.model_iblFactor = () =>
      Cartesian2.clone(
        model.imageBasedLighting.imageBasedLightingFactor,
        factor,
      );
  },

  process(renderResources, frameState) {
    const { model, lightingOptions, shaderBuilder, uniformMap } =
      renderResources;
    if (
      model._sceneGISEnvironmentLighting !== true ||
      lightingOptions.lightingModel !== LightingModel.PBR
    ) {
      return;
    }
    const fragment = ShaderDestination.FRAGMENT;
    shaderBuilder.addDefine("SCENEGIS_MODEL_LIGHTING", undefined, fragment);
    const ibl = model.imageBasedLighting;
    if (
      model.environmentMapManager.enabled &&
      !defined(ibl.specularEnvironmentMaps) &&
      !defined(frameState.specularEnvironmentMaps)
    ) {
      localProbes.process(renderResources, frameState);
    }
    if (
      ibl.enabled &&
      !defined(ibl.sphericalHarmonicCoefficients) &&
      !defined(frameState.sphericalHarmonicCoefficients)
    ) {
      shaderBuilder.addDefine(
        "SCENEGIS_MODEL_DIFFUSE_SKY",
        undefined,
        fragment,
      );
      shaderBuilder.addDefine("DIFFUSE_IBL", undefined, fragment);
    }
    if (model._sceneGISPlanarEnvironmentLighting === true) {
      shaderBuilder.addFragmentLines([planarLighting.source, lighting]);
      Object.assign(
        uniformMap,
        planarLighting.createUniformMap(
          () => frameState._sceneGISPlanarLighting,
        ),
      );
      return;
    }
    for (const [name, value] of Object.entries(globeDefines)) {
      shaderBuilder.addDefine(name, value, fragment);
    }
    shaderBuilder.addFragmentLines([
      definitions,
      common,
      runtime,
      atmosphere,
      shadows,
      lighting,
    ]);
    for (const [uniform, field] of Object.entries(uniforms)) {
      uniformMap[uniform] = () => frameState._sceneGISGlobeLighting[field];
    }
  },
};

export default SceneGISModelEnvironmentLighting;

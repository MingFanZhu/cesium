import defined from "../../../Core/defined.js";
import ShaderDestination from "../../../Renderer/ShaderDestination.js";
import LightingModel from "../../../Scene/Model/LightingModel.js";
import SceneMode from "../../../Scene/SceneMode.js";
import definitions from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonDefinitions.js";
import common from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonCommon.js";
import runtime from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonRuntime.js";
import atmosphere from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import shadows from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadows.js";
import lighting from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISModelEnvironmentLighting.js";

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

/**
 * Borrows the active Globe lighting record for native model PBR.
 * @private
 */
const SceneGISModelEnvironmentLighting = {
  update(model, frameState) {
    const active =
      frameState.mode === SceneMode.SCENE3D &&
      frameState._sceneGISGlobeLighting?.active === true &&
      !defined(model.classificationType);
    if (active !== (model._sceneGISEnvironmentLighting === true)) {
      model._sceneGISEnvironmentLighting = active;
      model.resetDrawCommands();
    }
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
    if (ibl.enabled && !defined(ibl.sphericalHarmonicCoefficients)) {
      shaderBuilder.addDefine(
        "SCENEGIS_MODEL_DIFFUSE_SKY",
        undefined,
        fragment,
      );
      shaderBuilder.addDefine("DIFFUSE_IBL", undefined, fragment);
    }
    for (const [name, value] of Object.entries({
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
    })) {
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

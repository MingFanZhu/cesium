import atmosphere from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISBrunetonAtmosphere.js";
import shadows from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISCloudShadows.js";
import lighting from "../../../Shaders/SceneGIS/EnvironmentEffects/SceneGISPlanarEnvironmentLighting.js";

const fields = {
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
  u_sceneGISPrimaryLightScale: "primaryLightScale",
  u_sceneGISCameraRelativePosition: "cameraRelativePosition",
  u_surfaceRadianceScale: "surfaceRadianceScale",
  u_nightAmbientIntensity: "nightAmbientIntensity",
};

/** Borrows frame-local Planar lighting for material source consumers. @private */
const SceneGISPlanarEnvironmentLighting = {
  source: [atmosphere, shadows, lighting].join("\n"),
  createUniformMap(getRecord) {
    const result = {};
    for (const [uniform, field] of Object.entries(fields)) {
      result[uniform] = () => getRecord()[field];
    }
    return result;
  },
};

export default SceneGISPlanarEnvironmentLighting;

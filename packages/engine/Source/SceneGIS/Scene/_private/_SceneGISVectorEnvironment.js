import Cartesian4 from "../../../Core/Cartesian4.js";
import DeveloperError from "../../../Core/DeveloperError.js";
import ShadowMode from "../../../Scene/ShadowMode.js";
import planar from "./_SceneGISPlanarEnvironmentLighting.js";

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
  u_sceneGISPrimaryLightDirection: "primaryLightDirection",
  u_sceneGISPrimaryLightScale: "primaryLightScale",
  u_surfaceRadianceScale: "surfaceRadianceScale",
  u_nightAmbientIntensity: "nightAmbientIntensity",
};

function record(owner) {
  const frame = owner._scene.frameState;
  return owner._globe
    ? frame._sceneGISGlobeLighting
    : frame._sceneGISPlanarLighting;
}

/** Binds the current World lighting and native surface-shadow receiver. @private */
const VectorEnvironment = {
  active(owner) {
    return record(owner)?.active === true;
  },
  shadowMap(owner) {
    const map = owner._scene.shadowMap;
    if (
      !owner._globe ||
      !map?.enabled ||
      !ShadowMode.receiveShadows(owner._world.shadows)
    ) {
      return undefined;
    }
    if (map._isPointLight || map._isSpotLight) {
      throw new DeveloperError(
        "Vector ground supports the Scene directional shadow map only.",
      );
    }
    return map;
  },
  createUniformMap(owner) {
    const getRecord = () => record(owner);
    const result = owner._globe ? {} : planar.createUniformMap(getRecord);
    if (owner._globe) {
      for (const [uniform, field] of Object.entries(fields)) {
        result[uniform] = () => getRecord()[field];
      }
      // See ADR-0071 for the native terrain-bias/cascade source and upgrade boundary.
      const map = () => owner._scene.shadowMap;
      const texelBias = new Cartesian4(),
        offsetDistance = new Cartesian4();
      Object.assign(result, {
        u_vectorShadowEnabled: () =>
          map().enabled &&
          ShadowMode.receiveShadows(owner._world.shadows) &&
          owner._scene.frameState.shadowState.lightShadowsEnabled &&
          map()._shadowMapTexture !== undefined &&
          !map()._outOfView,
        shadowMap_texture: () =>
          map()._shadowMapTexture ?? owner._scene.context.defaultTexture,
        shadowMap_matrix: () => map()._shadowMapMatrix,
        shadowMap_cascadeSplits: () => map()._cascadeSplits,
        shadowMap_cascadeMatrices: () => map()._cascadeMatrices,
        shadowMap_lightDirectionEC: () => map()._lightDirectionEC,
        u_vectorShadowTexelBias: () =>
          Cartesian4.fromElements(
            1 / map()._textureSize.x,
            1 / map()._textureSize.y,
            map()._terrainBias.depthBias,
            map()._terrainBias.normalShadingSmooth,
            texelBias,
          ),
        u_vectorShadowOffsetDistance: () =>
          Cartesian4.fromElements(
            map()._terrainBias.normalOffset
              ? map()._terrainBias.normalOffsetScale
              : 0,
            map().maximumDistance,
            map()._darkness,
            0,
            offsetDistance,
          ),
      });
    }
    return result;
  },
};
export default VectorEnvironment;

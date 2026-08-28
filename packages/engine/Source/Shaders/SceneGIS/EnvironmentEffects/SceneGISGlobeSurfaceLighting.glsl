uniform sampler2D u_sceneGISTransmittanceTexture;
uniform sampler2D u_sceneGISIrradianceTexture;
uniform float u_surfaceRadianceScale;

vec3 sceneGISGlobeGeodeticSurfaceNormal(vec3 positionMC)
{
    vec3 inverseRadii = 1.0 / czm_ellipsoidRadii;
    return czm_geodeticSurfaceNormal(
        positionMC,
        vec3(0.0),
        inverseRadii * inverseRadii);
}

vec3 sceneGISGlobeSurfaceLighting(
    vec3 albedo,
    vec3 positionWC,
    vec3 surfaceNormalWC)
{
    vec3 localPosition = sceneGISCloudShadowLocalPosition(positionWC);
    vec3 localNormal = normalize(vec3(
        dot(surfaceNormalWC, u_sceneGISShadowEast),
        dot(surfaceNormalWC, u_sceneGISShadowNorth),
        dot(surfaceNormalWC, u_sceneGISShadowVertical)));
    vec3 localSun = normalize(u_sceneGISShadowSunDirection);
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 virtualPoint = vec3(
        localPosition.xy * 0.001,
        atmosphere.bottom_radius + localPosition.z * 0.001);
    vec3 skyIrradiance;
    vec3 sunIrradiance = GetSunAndSkyIrradiance(
        atmosphere,
        u_sceneGISTransmittanceTexture,
        u_sceneGISIrradianceTexture,
        virtualPoint,
        localNormal,
        localSun,
        skyIrradiance);
    float cloudTransmittance = 1.0;
    if (u_sceneGISShowCloudShadows) {
        float viewDistance = length(positionWC - u_sceneGISShadowCameraPosition);
        cloudTransmittance = exp(-sceneGISCloudShadowOpticalDepth(
            localPosition,
            viewDistance));
    }
    return max(albedo, vec3(0.0)) * (1.0 / czm_pi) *
        (sunIrradiance * cloudTransmittance + max(skyIrradiance, vec3(0.0))) *
        u_surfaceRadianceScale;
}

uniform sampler2D u_sceneGISTransmittanceTexture;
uniform sampler2D u_sceneGISIrradianceTexture;
uniform float u_surfaceRadianceScale;
uniform vec3 u_sceneGISActualSunDirection;
uniform vec3 u_sceneGISPrimaryLightDirection;
uniform vec3 u_sceneGISPrimaryLightScale;

vec3 sceneGISModelGlobePosition(vec3 positionEC)
{
    vec3 positionWC = (czm_inverseView * vec4(positionEC, 1.0)).xyz;
    vec3 radiiSquared = czm_ellipsoidRadii * czm_ellipsoidRadii;
    vec3 up = normalize(positionWC / radiiSquared);
    vec3 surface = radiiSquared * up *
        inversesqrt(dot(radiiSquared, up * up));
    float height = dot(positionWC - surface, up);
    return up * (SCENEGIS_BOTTOM_RADIUS + height);
}

vec3 sceneGISModelDirectSource(vec3 positionEC, vec3 nativeSource)
{
    vec3 globePosition = sceneGISModelGlobePosition(positionEC);
    #ifdef USE_CUSTOM_LIGHT_COLOR
        vec3 source = nativeSource;
    #else
        vec3 lightDirection = normalize(u_sceneGISPrimaryLightDirection);
        vec3 unusedSky;
        // The native PBR BRDF already includes NdotL. Sample beam irradiance.
        vec3 source = GetSunAndSkyIrradiance(
            sceneGISAtmosphereParameters(),
            u_sceneGISTransmittanceTexture,
            u_sceneGISIrradianceTexture,
            globePosition * 0.001,
            lightDirection,
            lightDirection,
            unusedSky) * max(u_sceneGISPrimaryLightScale, vec3(0.0)) *
            u_surfaceRadianceScale;
    #endif
    if (u_sceneGISShowCloudShadows) {
        source *= exp(-sceneGISCloudShadowOpticalDepth(
            globePosition, max(-positionEC.z, 0.0)));
    }
    return source;
}

vec3 sceneGISModelSkyIrradiance(vec3 positionEC, vec3 normalEC)
{
    vec3 globePosition = sceneGISModelGlobePosition(positionEC);
    vec3 up = normalize(globePosition);
    vec3 normalWC = normalize(czm_inverseViewRotation * normalEC);
    vec3 sun = normalize(u_sceneGISActualSunDirection);
    vec3 sky;
    vec3 unusedDirect = GetSunAndSkyIrradiance(
        sceneGISAtmosphereParameters(),
        u_sceneGISTransmittanceTexture,
        u_sceneGISIrradianceTexture,
        globePosition * 0.001,
        normalWC,
        sun,
        sky);
    sky += sceneGISReadableNightSkyIrradiance(up, sun) *
        (0.5 * (1.0 + dot(normalWC, up)));
    // Native diffuse IBL expects irradiance/pi before its material weighting.
    return max(sky, vec3(0.0)) * (u_surfaceRadianceScale / czm_pi);
}

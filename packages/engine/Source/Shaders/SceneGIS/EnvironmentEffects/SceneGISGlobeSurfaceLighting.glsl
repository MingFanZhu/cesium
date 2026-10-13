uniform sampler2D u_sceneGISTransmittanceTexture;
uniform sampler2D u_sceneGISIrradianceTexture;
uniform float u_surfaceRadianceScale;
uniform vec3 u_sceneGISActualSunDirection;
uniform vec3 u_sceneGISPrimaryLightDirection;
uniform vec3 u_sceneGISPrimaryLightScale;

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
    vec3 surfaceNormalWC,
    vec3 geometryNormalEC,
    float wetness)
{
    vec3 radiiSquared = czm_ellipsoidRadii * czm_ellipsoidRadii;
    vec3 geodeticNormal = normalize(positionWC / radiiSquared);
    float surfaceScale = inversesqrt(dot(
        radiiSquared,
        geodeticNormal * geodeticNormal));
    vec3 ellipsoidSurface =
        radiiSquared * geodeticNormal * surfaceScale;
    float height = dot(
        positionWC - ellipsoidSurface,
        geodeticNormal);
    vec3 globePosition = geodeticNormal *
        (SCENEGIS_BOTTOM_RADIUS + height);
    vec3 globeNormal = normalize(surfaceNormalWC);
    vec3 globeSun = normalize(u_sceneGISActualSunDirection);
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 virtualPoint = globePosition * 0.001;
    vec3 skyIrradiance;
    vec3 unusedSunIrradiance = GetSunAndSkyIrradiance(
        atmosphere,
        u_sceneGISTransmittanceTexture,
        u_sceneGISIrradianceTexture,
        virtualPoint,
        globeNormal,
        globeSun,
        skyIrradiance);
    vec3 unusedPrimarySkyIrradiance;
    vec3 primaryIrradiance = GetSunAndSkyIrradiance(
        atmosphere,
        u_sceneGISTransmittanceTexture,
        u_sceneGISIrradianceTexture,
        virtualPoint,
        globeNormal,
        normalize(u_sceneGISPrimaryLightDirection),
        unusedPrimarySkyIrradiance) *
        max(u_sceneGISPrimaryLightScale, vec3(0.0));
    float skyHemisphere = 0.5 *
        (1.0 + dot(globeNormal, geodeticNormal));
    skyIrradiance += sceneGISReadableNightSkyIrradiance(
        geodeticNormal,
        globeSun) * skyHemisphere;
    float cloudTransmittance = 1.0;
    if (u_sceneGISShowCloudShadows) {
        float viewDistance = max(
            -(czm_modelView * vec4(positionWC, 1.0)).z,
            0.0);
        cloudTransmittance = exp(-sceneGISCloudShadowOpticalDepth(
            globePosition,
            viewDistance));
    }
    #ifdef SCENEGIS_AMBIENT_OCCLUSION
    skyIrradiance *= sceneGISAmbientOcclusion();
    #endif
    #ifdef SCENEGIS_AO_MAIN
    sceneGISRecordIndirect(max(albedo, vec3(0.0)) * (1.0 / czm_pi) *
        max(skyIrradiance, vec3(0.0)) * u_surfaceRadianceScale);
    #endif
    #ifdef SCENEGIS_GEOMETRY_SHADOW
    primaryIrradiance *= sceneGISGeometryShadow();
    #endif
    vec3 wetHighlight = vec3(0.0);
    #ifdef SCENEGIS_SURFACE_WEATHER
    vec3 weatherPositionEC = (czm_view * vec4(positionWC, 1.0)).xyz;
    vec3 weatherNormalEC = geometryNormalEC;
    wetHighlight = primaryIrradiance * cloudTransmittance * u_surfaceRadianceScale *
        sceneGISWeatherFilm(weatherPositionEC, weatherNormalEC,
            normalize(czm_viewRotation * u_sceneGISPrimaryLightDirection), wetness);
    #endif
    return wetHighlight + max(albedo, vec3(0.0)) * (1.0 / czm_pi) *
        (primaryIrradiance * cloudTransmittance +
            max(skyIrradiance, vec3(0.0))) *
        u_surfaceRadianceScale;
}

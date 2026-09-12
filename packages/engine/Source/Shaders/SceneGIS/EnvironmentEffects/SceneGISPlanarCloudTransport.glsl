// Fixed-Z participating-medium consumers of the packed cloud shadow prefix.
vec4 sceneGISPlanarCloudHaze(
    sampler2D transmittanceTexture, sampler2D irradianceTexture,
    vec3 rayOrigin, vec3 rayDirection, vec3 sunDirection,
    float maximumDistance, float shadowLength, float cloudCoverage)
{
    float start;
    float end;
    if (!sceneGISPlanarCloudShadowSegment(
            rayOrigin, rayDirection, maximumDistance, start, end)) {
        return vec4(0.0);
    }
    float density = 3.0e-5 * sceneGISGlobeCloudRemap(cloudCoverage, 0.2, 0.4);
    float opticalDepth = sceneGISHeightFogPlanarOpticalDepth(
        rayOrigin, rayDirection, start, end, density, 1.0e-3, 0.0);
    float shadowOpticalDepth = sceneGISHeightFogPlanarOpticalDepth(
        rayOrigin, rayDirection, start, min(start + max(shadowLength, 0.0), end),
        density, 1.0e-3, 0.0);
    float opacity = 1.0 - exp(-opticalDepth);
    float directionalOpacity = 1.0 - exp(-max(opticalDepth - shadowOpticalDepth, 0.0));
    vec3 sunIrradiance;
    vec3 skyIrradiance;
    sceneGISCloudIncidentIrradiance(
        transmittanceTexture, irradianceTexture,
        rayOrigin + rayDirection * start, vec3(0.0), sunDirection,
        normalize(u_sceneGISShadowSunDirection), u_sceneGISPrimaryLightScale,
        sunIrradiance, skyIrradiance);
    vec3 inscatter = sunIrradiance *
        sceneGISCloudDualPhase(dot(normalize(u_sceneGISShadowSunDirection), rayDirection), 1.0) * directionalOpacity;
    inscatter += skyIrradiance * (1.0 / (4.0 * czm_pi)) * opacity;
    return vec4(max(inscatter * (0.9 / 1.4), vec3(0.0)), opacity);
}

vec3 sceneGISPlanarCloudShadowRadiance(
    sampler2D transmittanceTexture, sampler3D scatteringTexture,
    sampler2D irradianceTexture, vec3 origin, vec3 direction,
    vec3 sunDirection, float maximumDistance, float shadowLength)
{
    float start;
    float end;
    if (shadowLength <= 0.0 || !sceneGISPlanarCloudShadowSegment(
            origin, direction, maximumDistance, start, end)) {
        return vec3(0.0);
    }
    // Remove only the equivalent shadow prefix, including above-cloud entry.
    // Whole-path extinction and the endpoint's ground irradiance stay intact.
    float atmosphereStart;
    float atmosphereEnd;
    if (!sceneGISPlanarSlabSegment(origin, direction, maximumDistance,
            atmosphereStart, atmosphereEnd)) {
        return vec3(0.0);
    }
    vec3 entryTransmittance = sceneGISPlanarSegmentTransmittance(
        origin.z + direction.z * atmosphereStart, direction.z,
        max(start - atmosphereStart, 0.0));
    bool intersects;
    vec3 prefixTransmittance;
    return entryTransmittance * sceneGISPlanarRadianceToPoint(
        transmittanceTexture, scatteringTexture, irradianceTexture,
        origin + direction * start, direction, sunDirection,
        min(shadowLength, end - start), false, intersects, prefixTransmittance);
}

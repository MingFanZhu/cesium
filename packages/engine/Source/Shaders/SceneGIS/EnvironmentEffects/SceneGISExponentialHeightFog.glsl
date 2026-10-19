const float SCENEGIS_HEIGHT_FOG_SUPPORT_TOP = 60000.0;
const int SCENEGIS_HEIGHT_FOG_GLOBE_SAMPLE_COUNT = 16;
const float SCENEGIS_HEIGHT_FOG_TAIL_OPTICAL_DEPTH = 1.0e-7;

float sceneGISHeightFogDensityAtHeight(
    float height,
    float density,
    float heightFalloff,
    float baseHeight)
{
    float exponent = clamp(
        -heightFalloff * (height - baseHeight), -80.0, 80.0);
    return density * exp(exponent);
}

bool sceneGISHeightFogPlanarSegment(
    vec3 rayOrigin,
    vec3 viewDirection,
    float maximumDistance,
    float startDistance,
    out float segmentStart,
    out float segmentEnd)
{
    float distanceLimit = max(maximumDistance, 0.0);
    if (abs(viewDirection.z) < 1.0e-7) {
        if (rayOrigin.z < 0.0 || rayOrigin.z > SCENEGIS_HEIGHT_FOG_SUPPORT_TOP) {
            return false;
        }
        segmentStart = max(startDistance, 0.0);
        segmentEnd = distanceLimit;
    } else {
        float first = -rayOrigin.z / viewDirection.z;
        float second =
            (SCENEGIS_HEIGHT_FOG_SUPPORT_TOP - rayOrigin.z) / viewDirection.z;
        segmentStart = max(max(min(first, second), 0.0), startDistance);
        segmentEnd = min(max(first, second), distanceLimit);
    }
    return segmentEnd > segmentStart;
}

bool sceneGISHeightFogSphereInterval(
    vec3 rayOrigin,
    vec3 viewDirection,
    float radius,
    out float nearDistance,
    out float farDistance)
{
    float projected = dot(rayOrigin, viewDirection);
    float discriminant =
        projected * projected - dot(rayOrigin, rayOrigin) + radius * radius;
    if (discriminant < 0.0) {
        return false;
    }
    float root = sqrt(max(discriminant, 0.0));
    nearDistance = -projected - root;
    farDistance = -projected + root;
    return farDistance > 0.0;
}

bool sceneGISHeightFogGlobeSegment(
    vec3 rayOrigin,
    vec3 viewDirection,
    float maximumDistance,
    float startDistance,
    out float segmentStart,
    out float segmentEnd)
{
    vec3 virtualOrigin = vec3(
        rayOrigin.xy, SCENEGIS_BOTTOM_RADIUS + rayOrigin.z);
    float topNear;
    float topFar;
    if (!sceneGISHeightFogSphereInterval(
            virtualOrigin,
            viewDirection,
            SCENEGIS_TOP_RADIUS,
            topNear,
            topFar)) {
        return false;
    }
    segmentStart = max(max(topNear, 0.0), startDistance);
    segmentEnd = min(topFar, max(maximumDistance, 0.0));

    float bottomNear;
    float bottomFar;
    if (sceneGISHeightFogSphereInterval(
            virtualOrigin,
            viewDirection,
            SCENEGIS_BOTTOM_RADIUS,
            bottomNear,
            bottomFar) &&
        bottomNear > segmentStart) {
        segmentEnd = min(segmentEnd, bottomNear);
    }
    return segmentEnd > segmentStart;
}

float sceneGISHeightFogExponentialIntegralRatio(float x)
{
    float absoluteX = abs(x);
    if (absoluteX < 1.0e-2) {
        float xSquared = x * x;
        return 1.0 - 0.5 * x + xSquared / 6.0 - xSquared * x / 24.0;
    }
    if (x > 0.0) {
        return (1.0 - exp(-min(x, 80.0))) / x;
    }
    return (exp(min(-x, 80.0)) - 1.0) / (-x);
}

float sceneGISHeightFogPlanarOpticalDepth(
    vec3 rayOrigin,
    vec3 viewDirection,
    float segmentStart,
    float segmentEnd,
    float density,
    float heightFalloff,
    float baseHeight)
{
    float distance = segmentEnd - segmentStart;
    float startHeight = rayOrigin.z + viewDirection.z * segmentStart;
    if (heightFalloff <= 1.0e-10) {
        return min(
            sceneGISHeightFogDensityAtHeight(
                startHeight, density, heightFalloff, baseHeight) * distance,
            80.0);
    }
    float startDensity = sceneGISHeightFogDensityAtHeight(
        startHeight, density, heightFalloff, baseHeight);
    float x = heightFalloff * viewDirection.z * distance;
    float scaledDistance =
        distance * sceneGISHeightFogExponentialIntegralRatio(x);
    if (startDensity >= 80.0 / max(scaledDistance, 1.0e-30)) {
        return 80.0;
    }
    return startDensity * scaledDistance;
}

float sceneGISHeightFogGlobeOpticalDepth(
    vec3 rayOrigin,
    vec3 viewDirection,
    float segmentStart,
    float segmentEnd,
    float density,
    float heightFalloff,
    float baseHeight)
{
    float segmentLength = segmentEnd - segmentStart;
    if (density <= 0.0 || segmentLength <= 0.0) {
        return 0.0;
    }
    if (heightFalloff <= 1.0e-10) {
        return min(sceneGISHeightFogDensityAtHeight(
            rayOrigin.z, density, heightFalloff, baseHeight) * segmentLength, 80.0);
    }
    vec3 virtualOrigin = vec3(
        rayOrigin.xy, SCENEGIS_BOTTOM_RADIUS + rayOrigin.z);
    // Bound the omitted optical depth by sigma(cutoff) * the FULL visible
    // length. This concentrates the fixed quadrature on contributing heights
    // without discarding a distant ground segment or either limb of a tangent.
    float cutoffHeight = baseHeight + log(
        density * segmentLength / SCENEGIS_HEIGHT_FOG_TAIL_OPTICAL_DEPTH) /
        heightFalloff;
    if (cutoffHeight < 0.0) {
        return 0.0;
    }
    if (cutoffHeight < SCENEGIS_HEIGHT_FOG_SUPPORT_TOP) {
        float nearDistance;
        float farDistance;
        if (!sceneGISHeightFogSphereInterval(virtualOrigin, viewDirection,
                SCENEGIS_BOTTOM_RADIUS + cutoffHeight,
                nearDistance, farDistance)) {
            return 0.0;
        }
        segmentStart = max(segmentStart, nearDistance);
        segmentEnd = min(segmentEnd, farDistance);
        if (segmentEnd <= segmentStart) {
            return 0.0;
        }
    }
    const float nodes[8] = float[8](
        0.0950125098,
        0.2816035508,
        0.4580167777,
        0.6178762444,
        0.7554044083,
        0.8656312024,
        0.9445750231,
        0.9894009349);
    const float weights[8] = float[8](
        0.1894506105,
        0.1826034150,
        0.1691565194,
        0.1495959888,
        0.1246289713,
        0.0951585117,
        0.0622535239,
        0.0271524594);
    float midpoint = 0.5 * (segmentStart + segmentEnd);
    float halfLength = 0.5 * (segmentEnd - segmentStart);
    float integral = 0.0;
    for (int i = 0; i < 8; ++i) {
        float offset = halfLength * nodes[i];
        vec3 firstPoint = virtualOrigin + viewDirection * (midpoint - offset);
        vec3 secondPoint = virtualOrigin + viewDirection * (midpoint + offset);
        float firstHeight = length(firstPoint) - SCENEGIS_BOTTOM_RADIUS;
        float secondHeight = length(secondPoint) - SCENEGIS_BOTTOM_RADIUS;
        integral += weights[i] * (
            sceneGISHeightFogDensityAtHeight(
                firstHeight, density, heightFalloff, baseHeight) +
            sceneGISHeightFogDensityAtHeight(
                secondHeight, density, heightFalloff, baseHeight));
    }
    return min(halfLength * integral, 80.0);
}

vec3 sceneGISHeightFogSunTransmittance(
    sampler2D transmittanceTexture,
    vec3 rayOrigin,
    vec3 viewDirection,
    vec3 sunDirection,
    float representativeDistance)
{
    vec3 point = rayOrigin + viewDirection * representativeDistance;
    #ifdef SCENEGIS_GLOBE
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 virtualPoint = vec3(
        point.xy * 0.001,
        atmosphere.bottom_radius + point.z * 0.001);
    float radius = max(length(virtualPoint), atmosphere.bottom_radius);
    float sunCosine = dot(virtualPoint, sunDirection) / radius;
    return max(GetTransmittanceToSun(
        atmosphere,
        transmittanceTexture,
        radius,
        sunCosine), vec3(0.0));
    #else
    if (sunDirection.z <= 0.0 || point.z < 0.0 ||
        point.z > SCENEGIS_HEIGHT_FOG_SUPPORT_TOP) {
        return vec3(0.0);
    }
    float distanceToTop =
        (SCENEGIS_HEIGHT_FOG_SUPPORT_TOP - point.z) / sunDirection.z;
    return sceneGISPlanarSegmentTransmittance(
        point.z, sunDirection.z, max(distanceToTop, 0.0));
    #endif
}

float sceneGISHeightFogMaxComponent(vec3 value)
{
    return max(value.x, max(value.y, value.z));
}

vec3 sceneGISHeightFogAmbientSource(vec3 sunColor)
{
    vec3 scattering = SCENEGIS_RAYLEIGH + SCENEGIS_MIE_SCATTERING;
    // This empirical tint approximates scattered sunlight. Its source now
    // arrives in scene RGB, so account for the distinct sky/solar conversions.
    vec3 numerator = max(sunColor * scattering *
        (SCENEGIS_SKY_RADIANCE_TO_LUMINANCE / SCENEGIS_SUN_RADIANCE_TO_LUMINANCE), vec3(0.0));
    float denominator = sceneGISHeightFogMaxComponent(
        SCENEGIS_SOLAR_IRRADIANCE * scattering);
    return numerator / max(denominator, 1.0e-8);
}

vec3 sceneGISHeightFogDirectionalSource(vec3 sunColor)
{
    vec3 numerator = max(sunColor, vec3(0.0));
    #ifdef SCENEGIS_GLOBE
    return numerator;
    #else
    float denominator = sceneGISHeightFogMaxComponent(
        SCENEGIS_SOLAR_IRRADIANCE);
    return numerator / max(denominator, 1.0e-8);
    #endif
}

vec3 sceneGISApplyExponentialHeightFog(
    sampler2D transmittanceTexture,
    sampler2D irradianceTexture,
    vec3 sceneColor,
    vec3 rayOrigin,
    vec3 viewDirection,
    vec3 sunDirection,
    float maximumDistance,
    float shadowLength,
    float density,
    float heightFalloff,
    float baseHeight,
    float startDistance,
    float maximumOpacity,
    float sourceRadianceScale,
    float inscatteringScale,
    float directionalInscatteringScale,
    float directionalInscatteringExponent)
{
    float segmentStart;
    float segmentEnd;
    #ifdef SCENEGIS_GLOBE
    bool intersects = sceneGISHeightFogGlobeSegment(
        rayOrigin,
        viewDirection,
        maximumDistance,
        startDistance,
        segmentStart,
        segmentEnd);
    #else
    bool intersects = sceneGISHeightFogPlanarSegment(
        rayOrigin,
        viewDirection,
        maximumDistance,
        startDistance,
        segmentStart,
        segmentEnd);
    #endif
    if (!intersects || density <= 0.0 || maximumOpacity <= 0.0) {
        return sceneColor;
    }

    #ifdef SCENEGIS_GLOBE
    float opticalDepth = sceneGISHeightFogGlobeOpticalDepth(
        rayOrigin,
        viewDirection,
        segmentStart,
        segmentEnd,
        density,
        heightFalloff,
        baseHeight);
    #else
    float opticalDepth = sceneGISHeightFogPlanarOpticalDepth(
        rayOrigin,
        viewDirection,
        segmentStart,
        segmentEnd,
        density,
        heightFalloff,
        baseHeight);
    #endif
    float fogAmount = min(
        1.0 - exp(-clamp(opticalDepth, 0.0, 80.0)),
        maximumOpacity);
    float representativeDistance = 0.5 * (segmentStart + segmentEnd);
    vec3 sunColor = sceneGISSunRadianceToScene(SCENEGIS_SOLAR_IRRADIANCE) *
        sceneGISHeightFogSunTransmittance(
            transmittanceTexture,
            rayOrigin,
            viewDirection,
            sunDirection,
            representativeDistance);
    vec3 ambientIrradiance = sunColor;
    #ifdef SCENEGIS_GLOBE
    vec3 representativePoint =
        rayOrigin + viewDirection * representativeDistance;
    vec3 representativeRadialUp = normalize(vec3(
        representativePoint.xy,
        SCENEGIS_BOTTOM_RADIUS + representativePoint.z));
    vec3 atmospherePoint = vec3(representativePoint.xy,
        SCENEGIS_BOTTOM_RADIUS + representativePoint.z) * 0.001;
    vec3 physicalSky = sceneGISSkyRadianceToScene(
        GetIrradiance(sceneGISAtmosphereParameters(), irradianceTexture,
            length(atmospherePoint), dot(representativeRadialUp, sunDirection)));
    ambientIrradiance += sceneGISNightAmbientIrradiance(physicalSky, 1.0);
    #else
    vec3 physicalSky = sceneGISSkyRadianceToScene(sceneGISPlanarSkyIrradiance(
        irradianceTexture, rayOrigin.z + viewDirection.z * representativeDistance,
        sunDirection.z));
    ambientIrradiance += sceneGISNightAmbientIrradiance(physicalSky, 1.0);
    #endif
    vec3 ambientSource = sceneGISHeightFogAmbientSource(ambientIrradiance);
    vec3 directionalLight = sunDirection;
    #ifndef SCENEGIS_GLOBE
    directionalLight = normalize(u_sceneGISShadowSunDirection);
    sunColor = sceneGISSunRadianceToScene(SCENEGIS_SOLAR_IRRADIANCE) * u_sceneGISPrimaryLightScale *
        sceneGISHeightFogSunTransmittance(transmittanceTexture, rayOrigin,
            viewDirection, directionalLight, representativeDistance);
    #endif
    vec3 directionalSource = sceneGISHeightFogDirectionalSource(sunColor);
    ambientSource *= sourceRadianceScale;
    directionalSource *= sourceRadianceScale;
    #ifdef SCENEGIS_GLOBE
    float directionalShadowFraction = 1.0;
    float segmentLength = segmentEnd - segmentStart;
    float clampedShadowLength = clamp(shadowLength, 0.0, segmentLength);
    if (clampedShadowLength >= segmentLength) {
        directionalShadowFraction = 0.0;
    } else if (clampedShadowLength > 0.0 && opticalDepth > 0.0) {
        float shadowOpticalDepth = sceneGISHeightFogGlobeOpticalDepth(
            rayOrigin,
            viewDirection,
            segmentStart,
            segmentStart + clampedShadowLength,
            density,
            heightFalloff,
            baseHeight);
        directionalShadowFraction = clamp(
            (opticalDepth - shadowOpticalDepth) / opticalDepth,
            0.0,
            1.0);
    }
    directionalSource *= directionalShadowFraction;
    #else
    float shadowStart;
    float shadowEnd;
    if (shadowLength > 0.0 && opticalDepth > 0.0 &&
        sceneGISPlanarCloudShadowSegment(rayOrigin, viewDirection,
            maximumDistance, shadowStart, shadowEnd)) {
        shadowEnd = min(min(shadowEnd, shadowStart + shadowLength), segmentEnd);
        shadowStart = max(shadowStart, segmentStart);
        if (shadowEnd > shadowStart) {
            float shadowOpticalDepth = sceneGISHeightFogPlanarOpticalDepth(
                rayOrigin, viewDirection, shadowStart, shadowEnd,
                density, heightFalloff, baseHeight);
            directionalSource *= clamp(
                (opticalDepth - shadowOpticalDepth) / opticalDepth, 0.0, 1.0);
        }
    }
    #endif
    float directionalLobe = pow(
        max(dot(viewDirection, directionalLight), 0.0),
        directionalInscatteringExponent);
    vec3 fogSource = ambientSource * inscatteringScale +
        directionalSource * directionalLobe * directionalInscatteringScale;
    return sceneColor * (1.0 - fogAmount) + fogAmount * fogSource;
}

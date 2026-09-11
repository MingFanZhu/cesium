precision highp float;
precision highp sampler3D;

in vec2 v_textureCoordinates;

layout(location = 0) out vec4 out_FragData_0;
layout(location = 1) out vec4 out_FragData_1;

uniform int u_sceneGISShadowCascadeIndex;
uniform mat4 u_sceneGISCloudShadowInverseMatrices[3];
uniform mat4 u_sceneGISCloudShadowPreviousMatrices[3];
uniform vec2 u_sceneGISCloudShadowPreviousCloudOffset;
uniform bool u_sceneGISCloudShadowGridLatticeCompatible;
uniform vec3 u_sceneGISShadowRayCenter;
uniform vec3 u_sceneGISShadowRayRight;
uniform vec3 u_sceneGISShadowRayUp;
uniform vec3 u_sceneGISShadowRayDirection;
uniform vec2 u_sceneGISShadowHalfSize;
uniform vec2 u_sceneGISShadowGridCenter;
uniform vec2 u_sceneGISShadowHalfSizes[3];
uniform vec2 u_sceneGISShadowGridCenters[3];
uniform float u_sceneGISCloudShadowResolution;
uniform float u_sceneGISShadowRayOffset;
uniform float u_sceneGISShadowFootprint;
uniform int u_sceneGISShadowSteps;
uniform vec3 u_cameraPosition;
uniform vec3 u_surfacePosition;
uniform vec3 u_east;
uniform vec3 u_north;
uniform vec3 u_vertical;
uniform vec3 u_ellipsoidCenter;
uniform vec3 u_ellipsoidRadii;
uniform vec2 u_cloudOffset;
uniform float u_baseHeight;
uniform float u_cloudBaseHeight;
uniform float u_cloudThickness;
uniform float u_cloudCoverage;
uniform float u_cloudDensity;
uniform int u_cloudPreset;
uniform bool u_cloudUseDetail;
uniform sampler3D u_cloudShapeTexture;
uniform sampler3D u_cloudDetailTexture;
uniform sampler2D u_cloudWeatherTexture;
uniform SCENEGIS_CLOUD_TURBULENCE_SAMPLER u_cloudTurbulenceTexture;
uniform sampler3D u_cloudStbnTexture;
uniform float u_cloudStbnSlice;
#ifndef SCENEGIS_GLOBE
uniform vec3 u_sceneGISShadowOrigin;
uniform vec2 u_planarShadowMaterialOrigin;
uniform vec3 u_sceneGISShadowOriginDelta;
#endif

void sceneGISShadowIcosahedralVertices(
    vec3 direction,
    out vec3 first,
    out vec3 second,
    out vec3 third)
{
    const float a = 0.85065080835204;
    const float b = 0.5257311121191336;
    const float inversePhi = 0.6180339887498948;
    const float inversePhiSquared = 0.38196601125010515;
    vec3 absoluteDirection = abs(direction);
    float selectorFirst = dot(
        absoluteDirection,
        vec3(1.0, inversePhiSquared, -inversePhi));
    float selectorSecond = dot(
        absoluteDirection,
        vec3(-inversePhi, 1.0, inversePhiSquared));
    float selectorThird = dot(
        absoluteDirection,
        vec3(inversePhiSquared, -inversePhi, 1.0));
    first = selectorFirst > 0.0 ? vec3(a, b, 0.0) : vec3(-b, 0.0, a);
    second = selectorSecond > 0.0 ? vec3(0.0, a, b) : vec3(a, -b, 0.0);
    third = selectorThird > 0.0 ? vec3(b, 0.0, a) : vec3(0.0, a, -b);
    vec3 octantSign = sign(direction);
    first *= octantSign;
    second *= octantSign;
    third *= octantSign;
}

void sceneGISShadowSwapIfBigger(inout vec4 first, inout vec4 second)
{
    if (first.w > second.w) {
        vec4 temporary = first;
        first = second;
        second = temporary;
    }
}

void sceneGISShadowSortVertices(
    inout vec3 first,
    inout vec3 second,
    inout vec3 third)
{
    const vec3 base = vec3(0.5, 0.5, 1.0);
    vec4 firstWeight = vec4(first, dot(first, base));
    vec4 secondWeight = vec4(second, dot(second, base));
    vec4 thirdWeight = vec4(third, dot(third, base));
    sceneGISShadowSwapIfBigger(firstWeight, secondWeight);
    sceneGISShadowSwapIfBigger(secondWeight, thirdWeight);
    sceneGISShadowSwapIfBigger(firstWeight, secondWeight);
    first = firstWeight.xyz;
    second = secondWeight.xyz;
    third = thirdWeight.xyz;
}

vec3 sceneGISShadowStructureNormal(vec3 direction, float jitter)
{
    vec3 first;
    vec3 second;
    vec3 third;
    sceneGISShadowIcosahedralVertices(direction, first, second, third);
    sceneGISShadowSortVertices(first, second, third);
    vec3 weights = exp(vec3(
        dot(first, direction),
        dot(second, direction),
        dot(third, direction)) * 40.0);
    weights /= weights.x + weights.y + weights.z;
    return jitter < weights.x
        ? first
        : (jitter < weights.x + weights.y ? second : third);
}

void sceneGISShadowStructuredPlanes(
    vec3 normal,
    vec3 rayOrigin,
    vec3 rayDirection,
    float samplePeriod,
    out float stepOffset,
    out float stepSize)
{
    float normalDotDirection = dot(rayDirection, normal);
    stepSize = samplePeriod / abs(normalDotDirection);
    stepOffset = -mod(dot(rayOrigin, normal), samplePeriod) /
        normalDotDirection;
    if (stepOffset < 0.0) {
        stepOffset += stepSize;
    }
}

vec2 sceneGISCloudShadowGridCoordinate(out int cascadeIndex)
{
    float resolution = u_sceneGISCloudShadowResolution;
    ivec2 tileIndex = ivec2(floor(gl_FragCoord.xy / resolution));
    cascadeIndex = tileIndex.y * 2 + tileIndex.x;
    vec2 tile = vec2(tileIndex);
    vec2 localPixel = floor(gl_FragCoord.xy) - tile * resolution + 0.5;
    return
        u_sceneGISShadowGridCenters[cascadeIndex] +
        localPixel - vec2(resolution * 0.5);
}

vec3 sceneGISCloudShadowRayOrigin(
    float originRadius,
    vec2 gridCoordinate,
    int cascadeIndex)
{
    float resolution = u_sceneGISCloudShadowResolution;
    vec2 halfSize = u_sceneGISShadowHalfSizes[cascadeIndex];
    float footprint = 2.0 * halfSize.x / max(resolution, 1.0);
    vec2 lightPlane = gridCoordinate * footprint;
    vec3 planePosition =
        u_sceneGISShadowRayRight * lightPlane.x +
        u_sceneGISShadowRayUp * lightPlane.y;
    float rayDepth = -sqrt(max(
        originRadius * originRadius - dot(lightPlane, lightPlane),
        0.0));
    return planePosition +
        normalize(u_sceneGISShadowRayDirection) * rayDepth;
}

void main()
{
    int cascadeIndex;
    vec2 gridCoordinate = sceneGISCloudShadowGridCoordinate(cascadeIndex);
    vec3 rayDirection = normalize(u_sceneGISShadowRayDirection);
    float supportBaseHeight;
    float supportThickness;
    #ifdef SCENEGIS_GLOBE
    sceneGISGlobeCloudShadowPresetSupport(
        u_cloudPreset,
        u_baseHeight + u_cloudBaseHeight,
        u_cloudThickness,
        supportBaseHeight,
        supportThickness);
    vec3 rayOrigin = sceneGISCloudShadowRayOrigin(
        SCENEGIS_BOTTOM_RADIUS + supportBaseHeight + supportThickness,
        gridCoordinate,
        cascadeIndex);
    float segmentStart;
    float segmentEnd;
    float topNear;
    float topFar;
    if (!sceneGISCloudSphereInterval(
            rayOrigin,
            rayDirection,
            SCENEGIS_BOTTOM_RADIUS + supportBaseHeight + supportThickness,
            topNear,
            topFar)) {
        out_FragData_0 = vec4(0.0);
        out_FragData_1 = vec4(0.0);
        return;
    }
    segmentStart = max(topNear, 0.0);
    segmentEnd = min(topFar, SCENEGIS_CLOUD_SHADOW_MAX_LENGTH);
    float bottomNear;
    float bottomFar;
    if (sceneGISCloudSphereInterval(
            rayOrigin,
            rayDirection,
            SCENEGIS_BOTTOM_RADIUS + supportBaseHeight,
            bottomNear,
            bottomFar) && bottomNear > segmentStart) {
        segmentEnd = min(segmentEnd, bottomNear);
    }
    #else
    sceneGISCloudPresetSupport(u_cloudPreset, u_cloudBaseHeight, u_cloudThickness,
        supportBaseHeight, supportThickness);
    if (rayDirection.z >= 0.0 || supportThickness <= 0.0) {
        out_FragData_0 = vec4(0.0);
        out_FragData_1 = vec4(0.0);
        return;
    }
    vec3 rayOrigin = (u_sceneGISCloudShadowInverseMatrices[cascadeIndex] *
        vec4(v_textureCoordinates * 2.0 - 1.0, 0.0, 1.0)).xyz;
    rayOrigin += rayDirection *
        ((supportBaseHeight + supportThickness - rayOrigin.z) / rayDirection.z);
    float segmentStart = 0.0;
    float segmentEnd = min(supportThickness / -rayDirection.z, SCENEGIS_CLOUD_SHADOW_MAX_LENGTH);
    #endif
    if (segmentEnd <= segmentStart) {
        out_FragData_0 = vec4(0.0);
        out_FragData_1 = vec4(0.0);
        return;
    }
    float segmentLength = segmentEnd - segmentStart;
    float samplePeriod = sceneGISCloudShadowStructuredSamplePeriod(
        segmentLength,
        u_sceneGISShadowSteps);
    vec3 segmentOriginWorld = rayOrigin + rayDirection * segmentStart;
    ivec3 stbnSize = textureSize(u_cloudStbnTexture, 0);
    ivec2 stbnPixel = ivec2(mod(gridCoordinate, vec2(stbnSize.xy)));
    int stbnSlice = clamp(
        int(floor(u_cloudStbnSlice * float(stbnSize.z))),
        0,
        stbnSize.z - 1);
    float jitter = texelFetch(
        u_cloudStbnTexture,
        ivec3(stbnPixel, stbnSlice),
        0).r;
    vec3 structureNormal = sceneGISShadowStructureNormal(
        rayDirection,
        jitter);
    float stepOffset;
    float stepLength;
    sceneGISShadowStructuredPlanes(
        structureNormal,
        #ifdef SCENEGIS_GLOBE
        segmentOriginWorld,
        #else
        segmentOriginWorld + u_sceneGISShadowOrigin,
        #endif
        rayDirection,
        samplePeriod,
        stepOffset,
        stepLength);
    stepOffset = sceneGISCloudShadowTemporalRayDistance(
        stepOffset,
        stepLength,
        jitter);
    float opticalDepth = 0.0;
    float extinctionSum = 0.0;
    float weightedDistance = 0.0;
    float transmittanceSum = 0.0;
    float transmittance = 1.0;
    float sampleCount = 0.0;
    float tail = 0.0;
    float materialMipLevel = cascadeIndex == 0
        ? 0.0
        : (cascadeIndex == 1 ? 0.5 : 1.0);
    for (int step = 0; step < 50; ++step) {
        if (step >= u_sceneGISShadowSteps) {
            break;
        }
        float rayDistance = stepOffset + float(step) * stepLength;
        if (rayDistance > segmentLength) {
            break;
        }
        float distance = segmentStart + rayDistance;
        vec3 globePosition = rayOrigin + rayDirection * distance;
        #ifdef SCENEGIS_GLOBE
        vec3 globeOffset = sceneGISGlobeCloudOffset(
            globePosition,
            u_cloudOffset);
        float unusedHeightGradient;
        float normalizedDensity = sceneGISGlobeCloudShadowDensitySample(
            u_cloudShapeTexture,
            u_cloudDetailTexture,
            u_cloudWeatherTexture,
            u_cloudTurbulenceTexture,
            globePosition,
            globeOffset,
            u_cloudOffset,
            u_baseHeight + u_cloudBaseHeight,
            u_cloudThickness,
            u_cloudCoverage,
            u_cloudPreset,
            u_cloudUseDetail ? 1.0 : 0.0,
            materialMipLevel,
            jitter,
            unusedHeightGradient);
        #else
        float unusedHeightGradient;
        float normalizedDensity = sceneGISCloudDensitySample(
            u_cloudShapeTexture, u_cloudDetailTexture, u_cloudWeatherTexture,
            u_cloudTurbulenceTexture, globePosition, vec3(0.0), vec3(0.0),
            u_planarShadowMaterialOrigin, u_cloudOffset, u_cloudBaseHeight,
            u_cloudThickness, u_cloudCoverage, u_cloudPreset,
            u_cloudUseDetail ? 1.0 : 0.0, u_sceneGISShadowFootprint,
            jitter, unusedHeightGradient);
        #endif
        float extinction = max(normalizedDensity * u_cloudDensity, 0.0);
        if (extinction > 1.0e-5) {
            float stepOpticalDepth = extinction * stepLength;
            opticalDepth += stepOpticalDepth;
            extinctionSum += extinction;
            transmittance *= exp(-min(stepOpticalDepth, 80.0));
            weightedDistance += (distance - segmentStart) * transmittance;
            transmittanceSum += transmittance;
            sampleCount += 1.0;
        }
        if (transmittance <= 1.0e-2) {
            tail = min(
                2.0 * stepLength * exp(1.0 - sampleCount),
                stepLength * 0.5);
            break;
        }
    }
    float frontDepth = transmittanceSum > 1.0e-6
        ? weightedDistance / transmittanceSum
        : segmentEnd - segmentStart;
    float meanExtinction = sampleCount > 0.0
        ? extinctionSum / sampleCount
        : 0.0;
    out_FragData_0 = vec4(
        clamp(frontDepth / SCENEGIS_CLOUD_SHADOW_MAX_LENGTH, 0.0, 1.0),
        meanExtinction,
        min(opticalDepth, 80.0),
        min(tail, 80.0));
    vec3 frontPosition = rayOrigin + rayDirection *
        (segmentStart + frontDepth);
    #ifdef SCENEGIS_GLOBE
    vec3 currentMaterialOffset = sceneGISGlobeCloudOffset(
        frontPosition,
        u_cloudOffset);
    vec3 previousMaterialOffset = sceneGISGlobeCloudOffset(
        frontPosition,
        u_sceneGISCloudShadowPreviousCloudOffset);
    vec3 previousFrontPosition = frontPosition +
        currentMaterialOffset - previousMaterialOffset;
    #else
    vec3 previousFrontPosition = frontPosition + u_sceneGISShadowOriginDelta +
        vec3(u_cloudOffset - u_sceneGISCloudShadowPreviousCloudOffset, 0.0);
    #endif
    vec4 previousClip =
        u_sceneGISCloudShadowPreviousMatrices[
            cascadeIndex] *
        vec4(previousFrontPosition, 1.0);
    vec2 previousUv = previousClip.xy / max(abs(previousClip.w), 1.0e-6) *
        0.5 + 0.5;
    vec2 historyDisplacement =
        (v_textureCoordinates - previousUv) *
        u_sceneGISCloudShadowResolution;
    if (u_sceneGISCloudShadowGridLatticeCompatible && all(equal(
            u_cloudOffset,
            u_sceneGISCloudShadowPreviousCloudOffset))) {
        historyDisplacement = round(historyDisplacement);
    }
    out_FragData_1 = vec4(
        clamp(frontDepth / SCENEGIS_CLOUD_SHADOW_MAX_LENGTH, 0.0, 1.0),
        historyDisplacement,
        1.0);
}

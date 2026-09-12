const float SCENEGIS_CLOUD_SHADOW_MAX_LENGTH = 200000.0;

float sceneGISCloudShadowStructuredSamplePeriod(
    float maximumRayDistance,
    int iterations)
{
    return clamp(
        maximumRayDistance / float(max(iterations, 1)),
        100.0,
        1000.0);
}

float sceneGISCloudShadowTemporalRayDistance(
    float structuredDistance,
    float stepSize,
    float jitter)
{
    return structuredDistance - stepSize * jitter;
}
const float SCENEGIS_CLOUD_SHADOW_CODE_MAX = 1023.0;

uniform sampler2D u_sceneGISCloudShadowAtlas;
uniform mat4 u_sceneGISCloudShadowMatrices[3];
uniform vec2 u_sceneGISCloudShadowIntervals[3];
uniform int u_sceneGISCloudShadowCascadeCount;
uniform bool u_sceneGISShowCloudShadows;
uniform bool u_sceneGISShowCrepuscularRays;
uniform vec3 u_sceneGISShadowSurfacePosition;
uniform vec3 u_sceneGISShadowEast;
uniform vec3 u_sceneGISShadowNorth;
uniform vec3 u_sceneGISShadowVertical;
uniform vec3 u_sceneGISShadowSunDirection;
#ifndef SCENEGIS_GLOBE
uniform vec3 u_sceneGISPrimaryLightScale;
#endif
uniform vec3 u_sceneGISShadowCameraPosition;
uniform vec3 u_sceneGISCloudShadowCameraRelativePosition;
uniform float u_sceneGISShadowCloudTop;

void sceneGISDecodeCloudShadowLength(
    float packed,
    out bool valid,
    out float shadowLength)
{
    valid = packed >= 0.5;
    float code = valid
        ? round(clamp(1.0 - packed, 0.0, 0.5) * 2048.0)
        : round(clamp(packed, 0.0, 0.5) * 2048.0);
    shadowLength = clamp(
        code / SCENEGIS_CLOUD_SHADOW_CODE_MAX,
        0.0,
        1.0) * SCENEGIS_CLOUD_SHADOW_MAX_LENGTH;
}

float sceneGISEncodeCloudShadowLength(bool valid, float shadowLength)
{
    float code = round(clamp(
        shadowLength / SCENEGIS_CLOUD_SHADOW_MAX_LENGTH,
        0.0,
        1.0) * SCENEGIS_CLOUD_SHADOW_CODE_MAX);
    return valid ? 1.0 - code / 2048.0 : code / 2048.0;
}

int sceneGISCloudShadowCascade(float viewDistance)
{
    for (int cascade = 0; cascade < 3; ++cascade) {
        if (cascade >= u_sceneGISCloudShadowCascadeCount) {
            break;
        }
        vec2 interval = u_sceneGISCloudShadowIntervals[cascade];
        if (viewDistance >= interval.x && viewDistance <= interval.y) {
            return cascade;
        }
    }
    return -1;
}

float sceneGISCloudShadowFadeHalfWidth(float splitDistance)
{
    float nearDistance = u_sceneGISCloudShadowIntervals[0].x;
    float farDistance = u_sceneGISCloudShadowIntervals[
        max(u_sceneGISCloudShadowCascadeCount - 1, 0)].y;
    float normalizedSplit = splitDistance / max(farDistance, 1.0);
    return 0.25 * normalizedSplit * normalizedSplit *
        max(farDistance - nearDistance, 1.0);
}

void sceneGISCloudShadowCascadeTransition(
    float viewDistance,
    out int firstCascade,
    out int secondCascade,
    out float secondWeight)
{
    firstCascade = sceneGISCloudShadowCascade(viewDistance);
    secondCascade = -1;
    secondWeight = 0.0;
    for (int cascade = 0; cascade < 2; ++cascade) {
        if (cascade + 1 >= u_sceneGISCloudShadowCascadeCount) {
            break;
        }
        float splitDistance = u_sceneGISCloudShadowIntervals[cascade].y;
        float halfWidth = sceneGISCloudShadowFadeHalfWidth(splitDistance);
        if (viewDistance >= splitDistance - halfWidth &&
            viewDistance <= splitDistance + halfWidth) {
            firstCascade = cascade;
            secondCascade = cascade + 1;
            secondWeight = clamp(
                (viewDistance - (splitDistance - halfWidth)) /
                    max(2.0 * halfWidth, 1.0e-6),
                0.0,
                1.0);
            return;
        }
    }
}

vec2 sceneGISCloudShadowAtlasOffset(int cascade)
{
    return vec2(float(cascade % 2), float(cascade / 2)) * 0.5;
}

float sceneGISCloudShadowDistanceToTop(vec3 globePosition)
{
    vec3 sunDirection = normalize(u_sceneGISShadowSunDirection);
    #ifndef SCENEGIS_GLOBE
    return sunDirection.z > 0.0
        ? max((u_sceneGISShadowCloudTop - globePosition.z) / sunDirection.z, 0.0)
        : 0.0;
    #else
    float projected = dot(globePosition, sunDirection);
    float topRadius = SCENEGIS_BOTTOM_RADIUS + u_sceneGISShadowCloudTop;
    float discriminant = projected * projected -
        dot(globePosition, globePosition) + topRadius * topRadius;
    if (discriminant < 0.0) {
        return 0.0;
    }
    return max(-projected + sqrt(max(discriminant, 0.0)), 0.0);
    #endif
}

float sceneGISCloudShadowCascadeOpticalDepth(
    vec3 globePosition,
    int cascade,
    float minimumDistance)
{
    vec4 clip = u_sceneGISCloudShadowMatrices[cascade] *
        vec4(globePosition, 1.0);
    vec2 uv = clip.xy * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) ||
        any(greaterThan(uv, vec2(1.0)))) {
        return 0.0;
    }
    float distanceToTop = max(
        sceneGISCloudShadowDistanceToTop(globePosition) -
            max(minimumDistance, 0.0),
        0.0);
    vec2 atlasOffset = sceneGISCloudShadowAtlasOffset(cascade);
    vec2 atlasTexel = 1.0 /
        vec2(textureSize(u_sceneGISCloudShadowAtlas, 0));
    vec2 tileMinimum = atlasOffset + atlasTexel * 0.5;
    vec2 tileMaximum = atlasOffset + vec2(0.5) - atlasTexel * 0.5;
    vec2 atlasUv = atlasOffset + uv * 0.5;
    float meanTransmittance = 0.0;
    const int sampleCount = 16;
    const float goldenAngle = 2.399963229728653;
    const float filterRadius = 2.0;
    for (int sampleIndex = 0; sampleIndex < sampleCount; ++sampleIndex) {
        float sampleIndexFloat = float(sampleIndex);
        float sampleRadius = filterRadius * sqrt(
            (sampleIndexFloat + 0.5) / float(sampleCount));
        float sampleAngle = sampleIndexFloat * goldenAngle;
        vec2 sampleOffset = sampleRadius * vec2(
            cos(sampleAngle),
            sin(sampleAngle));
        vec2 tapUv = clamp(
            atlasUv + sampleOffset * atlasTexel,
            tileMinimum,
            tileMaximum);
        vec4 shadow = texture(u_sceneGISCloudShadowAtlas, tapUv);
        float frontDepth = shadow.r *
            SCENEGIS_CLOUD_SHADOW_MAX_LENGTH;
        float opticalDepth = min(
            shadow.b + shadow.a,
            shadow.g * max(distanceToTop - frontDepth, 0.0));
        meanTransmittance += exp(-clamp(opticalDepth, 0.0, 80.0));
    }
    meanTransmittance /= float(sampleCount);
    return -log(clamp(meanTransmittance, exp(-80.0), 1.0));
}

float sceneGISCloudShadowCascadeOpticalDepth(
    vec3 globePosition,
    int cascade)
{
    return sceneGISCloudShadowCascadeOpticalDepth(
        globePosition,
        cascade,
        0.0);
}

float sceneGISCloudShadowCascadeRawOpticalDepth(
    vec3 globePosition,
    int cascade,
    float minimumDistance)
{
    vec4 clip = u_sceneGISCloudShadowMatrices[cascade] *
        vec4(globePosition, 1.0);
    vec2 uv = clip.xy * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) ||
        any(greaterThan(uv, vec2(1.0)))) {
        return 0.0;
    }
    float distanceToTop = max(
        sceneGISCloudShadowDistanceToTop(globePosition) -
            max(minimumDistance, 0.0),
        0.0);
    vec2 atlasOffset = sceneGISCloudShadowAtlasOffset(cascade);
    vec2 atlasTexel = 1.0 /
        vec2(textureSize(u_sceneGISCloudShadowAtlas, 0));
    vec2 atlasUv = clamp(
        atlasOffset + uv * 0.5,
        atlasOffset + atlasTexel * 0.5,
        atlasOffset + vec2(0.5) - atlasTexel * 0.5);
    vec4 shadow = texture(u_sceneGISCloudShadowAtlas, atlasUv);
    float frontDepth = shadow.r * SCENEGIS_CLOUD_SHADOW_MAX_LENGTH;
    return min(
        shadow.b + shadow.a,
        shadow.g * max(distanceToTop - frontDepth, 0.0));
}

float sceneGISCloudShadowCascadeRawOpticalDepth(
    vec3 globePosition,
    int cascade)
{
    return sceneGISCloudShadowCascadeRawOpticalDepth(
        globePosition,
        cascade,
        0.0);
}

float sceneGISCloudShadowOpticalDepth(
    vec3 localPosition,
    float viewDistance)
{
    int firstCascade;
    int secondCascade;
    float secondWeight;
    sceneGISCloudShadowCascadeTransition(
        viewDistance,
        firstCascade,
        secondCascade,
        secondWeight);
    if (firstCascade < 0) {
        return 0.0;
    }
    float firstOpticalDepth = sceneGISCloudShadowCascadeOpticalDepth(
        localPosition,
        firstCascade);
    if (secondCascade < 0) {
        return firstOpticalDepth;
    }
    float secondOpticalDepth = sceneGISCloudShadowCascadeOpticalDepth(
        localPosition,
        secondCascade);
    float transmittance = mix(
        exp(-clamp(firstOpticalDepth, 0.0, 80.0)),
        exp(-clamp(secondOpticalDepth, 0.0, 80.0)),
        secondWeight);
    return -log(clamp(transmittance, exp(-80.0), 1.0));
}

float sceneGISCloudShadowRawOpticalDepth(
    vec3 localPosition,
    float viewDistance)
{
    int firstCascade;
    int secondCascade;
    float secondWeight;
    sceneGISCloudShadowCascadeTransition(
        viewDistance,
        firstCascade,
        secondCascade,
        secondWeight);
    if (firstCascade < 0) {
        return 0.0;
    }
    float firstOpticalDepth = sceneGISCloudShadowCascadeRawOpticalDepth(
        localPosition,
        firstCascade);
    if (secondCascade < 0) {
        return firstOpticalDepth;
    }
    float secondOpticalDepth = sceneGISCloudShadowCascadeRawOpticalDepth(
        localPosition,
        secondCascade);
    float transmittance = mix(
        exp(-clamp(firstOpticalDepth, 0.0, 80.0)),
        exp(-clamp(secondOpticalDepth, 0.0, 80.0)),
        secondWeight);
    return -log(clamp(transmittance, exp(-80.0), 1.0));
}

float sceneGISCloudBodyShadowCascadeOpticalDepth(
    vec3 globePosition,
    int cascade,
    float minimumDistance)
{
    // Match the fixed reference: cloud-body BSM sampling is raw for ordinary
    // Sun elevations and uses the accepted receiver filter only near horizon.
    #ifdef SCENEGIS_GLOBE
    float localSunElevation = dot(
        normalize(globePosition),
        normalize(u_sceneGISShadowSunDirection));
    #else
    float localSunElevation = normalize(u_sceneGISShadowSunDirection).z;
    #endif
    if (localSunElevation >= 0.1) {
        return sceneGISCloudShadowCascadeRawOpticalDepth(
            globePosition,
            cascade,
            minimumDistance);
    }
    return sceneGISCloudShadowCascadeOpticalDepth(
        globePosition,
        cascade,
        minimumDistance);
}

float sceneGISCloudBodyShadowOpticalDepth(
    vec3 localPosition,
    float viewDistance,
    float minimumDistance)
{
    int firstCascade;
    int secondCascade;
    float secondWeight;
    sceneGISCloudShadowCascadeTransition(
        viewDistance,
        firstCascade,
        secondCascade,
        secondWeight);
    if (firstCascade < 0) {
        return 0.0;
    }
    float firstOpticalDepth = sceneGISCloudBodyShadowCascadeOpticalDepth(
        localPosition,
        firstCascade,
        minimumDistance);
    if (secondCascade < 0) {
        return firstOpticalDepth;
    }
    float secondOpticalDepth = sceneGISCloudBodyShadowCascadeOpticalDepth(
        localPosition,
        secondCascade,
        minimumDistance);
    float transmittance = mix(
        exp(-clamp(firstOpticalDepth, 0.0, 80.0)),
        exp(-clamp(secondOpticalDepth, 0.0, 80.0)),
        secondWeight);
    return -log(clamp(transmittance, exp(-80.0), 1.0));
}

#ifndef SCENEGIS_GLOBE
float sceneGISPlanarCloudBodyShadowOpticalDepth(
    vec3 localPosition, float viewDistance, float minimumDistance)
{
    // The CPU origin is horizontal. Cloud-local Z is already absolute height.
    vec3 shadowPosition = vec3(
        localPosition.xy + u_sceneGISCloudShadowCameraRelativePosition.xy,
        localPosition.z);
    return sceneGISCloudBodyShadowOpticalDepth(
        shadowPosition, viewDistance, minimumDistance);
}
#endif

#ifndef SCENEGIS_GLOBE
bool sceneGISPlanarCloudShadowSegment(
    vec3 origin, vec3 direction, float maximumDistance,
    out float segmentStart, out float segmentEnd)
{
    segmentStart = 0.0;
    segmentEnd = max(maximumDistance, 0.0);
    if (abs(direction.z) < 1.0e-7) {
        if (origin.z < 0.0 || origin.z > u_sceneGISShadowCloudTop) {
            return false;
        }
    } else {
        float ground = -origin.z / direction.z;
        float top = (u_sceneGISShadowCloudTop - origin.z) / direction.z;
        segmentStart = max(min(ground, top), 0.0);
        segmentEnd = min(max(ground, top), segmentEnd);
    }
    segmentEnd = min(segmentEnd, segmentStart + SCENEGIS_CLOUD_SHADOW_MAX_LENGTH);
    return segmentEnd > segmentStart;
}

#endif

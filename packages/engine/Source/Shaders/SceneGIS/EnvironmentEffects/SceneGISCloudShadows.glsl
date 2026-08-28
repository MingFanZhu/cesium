const float SCENEGIS_CLOUD_SHADOW_MAX_LENGTH = 200000.0;
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
uniform vec3 u_sceneGISShadowCameraPosition;
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

vec2 sceneGISCloudShadowAtlasOffset(int cascade)
{
    return vec2(float(cascade % 2), float(cascade / 2)) * 0.5;
}

float sceneGISCloudShadowCascadeOpticalDepth(
    vec3 localPosition,
    int cascade)
{
    vec4 clip = u_sceneGISCloudShadowMatrices[cascade] *
        vec4(localPosition, 1.0);
    vec2 uv = clip.xy * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) ||
        any(greaterThan(uv, vec2(1.0)))) {
        return 0.0;
    }
    float sunHeight = max(u_sceneGISShadowSunDirection.z, 1.0e-3);
    float distanceToTop = max(
        (u_sceneGISShadowCloudTop - localPosition.z) / sunHeight,
        0.0);
    vec2 atlasOffset = sceneGISCloudShadowAtlasOffset(cascade);
    vec2 atlasTexel = 1.0 /
        vec2(textureSize(u_sceneGISCloudShadowAtlas, 0));
    vec2 tileMinimum = atlasOffset + atlasTexel * 0.5;
    vec2 tileMaximum = atlasOffset + vec2(0.5) - atlasTexel * 0.5;
    vec2 atlasUv = atlasOffset + uv * 0.5;
    float meanTransmittance = 0.0;
    for (int y = -1; y <= 1; ++y) {
        float weightY = y == 0 ? 2.0 : 1.0;
        for (int x = -1; x <= 1; ++x) {
            float weightX = x == 0 ? 2.0 : 1.0;
            vec2 tapUv = clamp(
                atlasUv + vec2(float(x), float(y)) * atlasTexel,
                tileMinimum,
                tileMaximum);
            vec4 shadow = texture(u_sceneGISCloudShadowAtlas, tapUv);
            float frontDepth = shadow.r *
                SCENEGIS_CLOUD_SHADOW_MAX_LENGTH;
            float opticalDepth = min(
                shadow.b,
                shadow.g * max(distanceToTop - frontDepth, 0.0));
            meanTransmittance += weightX * weightY *
                exp(-clamp(opticalDepth, 0.0, 80.0));
        }
    }
    meanTransmittance *= 1.0 / 16.0;
    return -log(clamp(meanTransmittance, exp(-80.0), 1.0));
}

float sceneGISCloudShadowCascadeRawOpticalDepth(
    vec3 localPosition,
    int cascade)
{
    vec4 clip = u_sceneGISCloudShadowMatrices[cascade] *
        vec4(localPosition, 1.0);
    vec2 uv = clip.xy * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) ||
        any(greaterThan(uv, vec2(1.0)))) {
        return 0.0;
    }
    float sunHeight = max(u_sceneGISShadowSunDirection.z, 1.0e-3);
    float distanceToTop = max(
        (u_sceneGISShadowCloudTop - localPosition.z) / sunHeight,
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
        shadow.b,
        shadow.g * max(distanceToTop - frontDepth, 0.0));
}

float sceneGISCloudShadowOpticalDepth(
    vec3 localPosition,
    float viewDistance)
{
    int cascade = sceneGISCloudShadowCascade(viewDistance);
    if (cascade < 0) {
        return 0.0;
    }
    float opticalDepth = sceneGISCloudShadowCascadeOpticalDepth(
        localPosition,
        cascade);
    int nextCascade = cascade + 1;
    if (nextCascade < u_sceneGISCloudShadowCascadeCount) {
        vec2 interval = u_sceneGISCloudShadowIntervals[cascade];
        float overlap = max((interval.y - interval.x) * 0.05, 1.0);
        float blend = smoothstep(
            interval.y - overlap,
            interval.y,
            viewDistance);
        float nextOpticalDepth = sceneGISCloudShadowCascadeOpticalDepth(
            localPosition,
            nextCascade);
        float transmittance = mix(
            exp(-clamp(opticalDepth, 0.0, 80.0)),
            exp(-clamp(nextOpticalDepth, 0.0, 80.0)),
            blend);
        opticalDepth = -log(clamp(transmittance, exp(-80.0), 1.0));
    }
    return opticalDepth;
}

float sceneGISCloudShadowRawOpticalDepth(
    vec3 localPosition,
    float viewDistance)
{
    int cascade = sceneGISCloudShadowCascade(viewDistance);
    if (cascade < 0) {
        return 0.0;
    }
    float opticalDepth = sceneGISCloudShadowCascadeRawOpticalDepth(
        localPosition,
        cascade);
    int nextCascade = cascade + 1;
    if (nextCascade < u_sceneGISCloudShadowCascadeCount) {
        vec2 interval = u_sceneGISCloudShadowIntervals[cascade];
        float overlap = max((interval.y - interval.x) * 0.05, 1.0);
        float blend = smoothstep(
            interval.y - overlap,
            interval.y,
            viewDistance);
        float nextOpticalDepth = sceneGISCloudShadowCascadeRawOpticalDepth(
            localPosition,
            nextCascade);
        float transmittance = mix(
            exp(-clamp(opticalDepth, 0.0, 80.0)),
            exp(-clamp(nextOpticalDepth, 0.0, 80.0)),
            blend);
        opticalDepth = -log(clamp(transmittance, exp(-80.0), 1.0));
    }
    return opticalDepth;
}

vec3 sceneGISCloudShadowLocalPosition(vec3 worldPosition)
{
    vec3 offset = worldPosition - u_sceneGISShadowSurfacePosition;
    return vec3(
        dot(offset, u_sceneGISShadowEast),
        dot(offset, u_sceneGISShadowNorth),
        dot(offset, u_sceneGISShadowVertical));
}

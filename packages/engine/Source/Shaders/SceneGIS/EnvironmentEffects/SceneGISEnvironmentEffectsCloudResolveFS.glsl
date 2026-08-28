precision highp float;

layout (location = 0) out vec4 out_FragData_0;
layout (location = 1) out vec4 out_FragData_1;

in vec2 v_textureCoordinates;

uniform sampler2D u_depthTexture;
uniform sampler2D u_cloudLowColorTexture;
uniform sampler2D u_cloudLowDistanceTexture;
uniform sampler2D u_cloudHistoryColorTexture;
uniform sampler2D u_cloudHistoryDistanceTexture;
uniform bool u_perspective;
uniform bool u_cloudHistoryValid;
uniform float u_cloudHistoryWeight;

float sceneGISCloudDeterministicExp2Negative(float value)
{
    // (1 + ln(2) * x / 16)^-16 is a bounded rational approximation of 2^-x.
    // It avoids implementation-dependent transcendental rounding in repeated
    // spatial-only RGBA16F publications.
    float inverse = 1.0 / (1.0 + 0.04332169878499658 * max(value, 0.0));
    inverse *= inverse;
    inverse *= inverse;
    inverse *= inverse;
    inverse *= inverse;
    return inverse;
}

void main()
{
    vec2 lowDimensions = vec2(textureSize(u_cloudLowDistanceTexture, 0));
    vec2 fullDimensions = vec2(textureSize(u_depthTexture, 0));
    float spatialSharpness = lowDimensions.x / max(fullDimensions.x, 1.0) > 0.6
        ? 1.75
        : 0.08;
    vec2 lowPosition = v_textureCoordinates * lowDimensions - vec2(0.5);
    ivec2 center = ivec2(floor(lowPosition + vec2(0.5)));
    vec2 fraction = fract(lowPosition);
    float rawDepth = texture(u_depthTexture, v_textureCoordinates).r;
    float resolvedDepth = czm_readDepth(u_depthTexture, v_textureCoordinates);
    bool isClearDepth = sceneGISIsClearResolvedDepth(rawDepth);
    float sceneDistance = 1.0;
    if (!isClearDepth) {
        vec4 eye = czm_windowToEyeCoordinates(
            vec4(gl_FragCoord.xy, resolvedDepth, 1.0));
        eye /= eye.w;
        sceneDistance = clamp(
            (u_perspective ? length(eye.xyz) : max(-eye.z, 0.0)) /
                SCENEGIS_CLOUD_DISTANCE_ENCODING,
            0.0,
            1.0);
    }
    vec4 colorSum = vec4(0.0);
    vec4 distanceSum = vec4(0.0);
    float shadowLengthSum = 0.0;
    float shadowLengthWeightSum = 0.0;
    float weightSum = 0.0;
    float distanceWeightSum = 0.0;
    ivec2 dimensions = textureSize(u_cloudLowDistanceTexture, 0);
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            ivec2 texel = clamp(center + ivec2(x, y), ivec2(0), dimensions - 1);
            vec4 distanceSample = texelFetch(u_cloudLowDistanceTexture, texel, 0);
            vec4 colorSample = texelFetch(u_cloudLowColorTexture, texel, 0);
            vec2 delta = vec2(x, y) - (fraction - vec2(0.5));
            float spatialWeight = sceneGISCloudDeterministicExp2Negative(
                dot(delta, delta) * spatialSharpness);
            float frontWeight = distanceSample.a < 0.5
                ? 0.05
                : sceneGISCloudDeterministicExp2Negative(
                    abs(distanceSample.z - sceneDistance) * 96.0);
            float weight = spatialWeight * frontWeight;
            #ifdef SCENEGIS_GLOBE
            bool sampleValid;
            float sampleShadowLength;
            sceneGISDecodeCloudShadowLength(
                distanceSample.a,
                sampleValid,
                sampleShadowLength);
            float distanceWeight = weight * (sampleValid ? 1.0 : 0.0);
            float shadowLengthWeight = spatialWeight;
            shadowLengthSum += sampleShadowLength * shadowLengthWeight;
            shadowLengthWeightSum += shadowLengthWeight;
            #else
            float distanceWeight = weight * step(0.5, distanceSample.a);
            #endif
            colorSum += colorSample * weight;
            distanceSum += distanceSample * distanceWeight;
            weightSum += weight;
            distanceWeightSum += distanceWeight;
        }
    }
    vec4 spatialColor = colorSum / max(weightSum, 1.0e-6);
    vec4 spatialDistance = distanceSum / max(distanceWeightSum, 1.0e-6);
    #ifdef SCENEGIS_GLOBE
    bool spatialValid = distanceWeightSum > 1.0e-6;
    float spatialShadowLength = shadowLengthSum /
        max(shadowLengthWeightSum, 1.0e-6);
    spatialDistance.a = sceneGISEncodeCloudShadowLength(
        spatialValid,
        spatialShadowLength);
    #else
    spatialDistance.a = step(1.0e-6, distanceWeightSum);
    #endif
    if (!u_cloudHistoryValid || u_cloudHistoryWeight <= 0.0) {
        out_FragData_0 = spatialColor;
        out_FragData_1 = spatialDistance;
        return;
    }
    float historyWeight = u_cloudHistoryWeight;
    vec4 historyColor = texture(
        u_cloudHistoryColorTexture, v_textureCoordinates);
    vec4 historyDistance = texture(u_cloudHistoryDistanceTexture, v_textureCoordinates);
    #ifdef SCENEGIS_GLOBE
    bool currentValid;
    bool previousValid;
    float currentShadowLength;
    float previousShadowLength;
    sceneGISDecodeCloudShadowLength(
        spatialDistance.a,
        currentValid,
        currentShadowLength);
    sceneGISDecodeCloudShadowLength(
        historyDistance.a,
        previousValid,
        previousShadowLength);
    #else
    bool currentValid = spatialDistance.a > 0.5;
    bool previousValid = historyDistance.a > 0.5;
    #endif
    bool distanceCompatible =
        abs(historyDistance.x - spatialDistance.x) <= 8.0e-6 &&
        abs(historyDistance.y - spatialDistance.y) <= 8.0e-6 &&
        abs(historyDistance.z - spatialDistance.z) <= 2.0 / 65535.0
        #ifdef SCENEGIS_GLOBE
        && abs(previousShadowLength - currentShadowLength) <=
            2.0 * SCENEGIS_CLOUD_SHADOW_MAX_LENGTH /
                SCENEGIS_CLOUD_SHADOW_CODE_MAX
        #endif
        ;
    bool transmittanceCompatible =
        abs(historyColor.a - spatialColor.a) <= 0.08;
    bool radianceCompatible = all(lessThanEqual(
        abs(historyColor.rgb - spatialColor.rgb),
        vec3(0.25) + 0.25 * max(historyColor.rgb, spatialColor.rgb)));
    float historyCompatible = currentValid && previousValid &&
            distanceCompatible && transmittanceCompatible && radianceCompatible
        ? 1.0
        : 0.0;
    historyWeight *= historyCompatible;
    #ifdef SCENEGIS_GLOBE
    float shadowHistoryCompatible =
        abs(previousShadowLength - currentShadowLength) <=
            2.0 * SCENEGIS_CLOUD_SHADOW_MAX_LENGTH /
                SCENEGIS_CLOUD_SHADOW_CODE_MAX
        ? 1.0
        : 0.0;
    float shadowHistoryWeight =
        u_cloudHistoryWeight * shadowHistoryCompatible;
    #endif
    out_FragData_0 = mix(
        spatialColor,
        historyColor,
        historyWeight);
    out_FragData_1 = mix(spatialDistance, historyDistance, historyWeight);
    #ifdef SCENEGIS_GLOBE
    float resolvedShadowLength = mix(
        currentShadowLength,
        previousShadowLength,
        shadowHistoryWeight);
    out_FragData_1.a = sceneGISEncodeCloudShadowLength(
        currentValid,
        resolvedShadowLength);
    #endif
}

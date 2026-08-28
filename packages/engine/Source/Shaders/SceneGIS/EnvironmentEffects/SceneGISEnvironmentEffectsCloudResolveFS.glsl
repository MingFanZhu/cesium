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
uniform vec4 u_frustum;
uniform vec3 u_cameraPosition;
uniform vec3 u_cameraDirection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec3 u_east;
uniform vec3 u_north;
uniform vec2 u_cloudOffset;
uniform bool u_cloudHistoryValid;
uniform float u_cloudHistoryWeight;
uniform bool u_cloudHistoryReprojection;
uniform bool u_cloudPreviousPerspective;
uniform vec4 u_cloudPreviousFrustum;
uniform vec3 u_cloudPreviousCameraPosition;
uniform vec3 u_cloudPreviousCameraDirection;
uniform vec3 u_cloudPreviousCameraRight;
uniform vec3 u_cloudPreviousCameraUp;
uniform vec3 u_cloudPreviousEast;
uniform vec3 u_cloudPreviousNorth;
uniform vec2 u_cloudPreviousCloudOffset;

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

void sceneGISCloudResolveRay(
    vec2 textureCoordinates,
    bool perspective,
    vec4 frustum,
    vec3 cameraPosition,
    vec3 cameraDirection,
    vec3 cameraRight,
    vec3 cameraUp,
    out vec3 rayOrigin,
    out vec3 rayDirection)
{
    vec2 plane = mix(frustum.xz, frustum.yw, textureCoordinates);
    vec3 eyeOffset = cameraRight * plane.x + cameraUp * plane.y;
    rayOrigin = cameraPosition + (perspective ? vec3(0.0) : eyeOffset);
    rayDirection = perspective
        ? normalize(cameraDirection + eyeOffset)
        : normalize(cameraDirection);
}

bool sceneGISCloudProjectPrevious(
    vec3 previousRelativePosition,
    out vec2 historyCoordinates)
{
    vec2 plane;
    if (u_cloudPreviousPerspective) {
        float forward = dot(
            previousRelativePosition,
            u_cloudPreviousCameraDirection);
        if (!(forward > 0.0)) {
            return false;
        }
        plane = vec2(
            dot(previousRelativePosition, u_cloudPreviousCameraRight),
            dot(previousRelativePosition, u_cloudPreviousCameraUp)) / forward;
    } else {
        plane = vec2(
            dot(previousRelativePosition, u_cloudPreviousCameraRight),
            dot(previousRelativePosition, u_cloudPreviousCameraUp));
    }
    vec2 span = u_cloudPreviousFrustum.yw -
        u_cloudPreviousFrustum.xz;
    historyCoordinates = (plane - u_cloudPreviousFrustum.xz) / span;
    return all(greaterThanEqual(historyCoordinates, vec2(0.0))) &&
        all(lessThanEqual(historyCoordinates, vec2(1.0)));
}

bool sceneGISCloudProjectPreviousDirection(
    vec3 currentRayOrigin,
    vec3 worldDirection,
    out vec2 historyCoordinates)
{
    if (!u_cloudPreviousPerspective) {
        vec3 relative = currentRayOrigin - u_cloudPreviousCameraPosition;
        vec2 plane = vec2(
            dot(relative, u_cloudPreviousCameraRight),
            dot(relative, u_cloudPreviousCameraUp));
        vec2 span = u_cloudPreviousFrustum.yw -
            u_cloudPreviousFrustum.xz;
        historyCoordinates = (plane - u_cloudPreviousFrustum.xz) / span;
        return all(greaterThanEqual(historyCoordinates, vec2(0.0))) &&
            all(lessThanEqual(historyCoordinates, vec2(1.0)));
    }
    float forward = dot(worldDirection, u_cloudPreviousCameraDirection);
    if (!(forward > 0.0)) {
        return false;
    }
    vec2 plane = vec2(
        dot(worldDirection, u_cloudPreviousCameraRight),
        dot(worldDirection, u_cloudPreviousCameraUp)) / forward;
    vec2 span = u_cloudPreviousFrustum.yw -
        u_cloudPreviousFrustum.xz;
    historyCoordinates = (plane - u_cloudPreviousFrustum.xz) / span;
    return all(greaterThanEqual(historyCoordinates, vec2(0.0))) &&
        all(lessThanEqual(historyCoordinates, vec2(1.0)));
}

bool sceneGISCloudHistoryCoordinates(
    bool cloudValid,
    bool clearDepth,
    vec3 cloudDistances,
    out vec2 historyCoordinates,
    out vec3 currentMeanAnchor,
    out vec3 currentFrontAnchor,
    out vec3 currentSceneAnchor)
{
    historyCoordinates = v_textureCoordinates;
    vec3 currentRayOrigin;
    vec3 currentRayDirection;
    sceneGISCloudResolveRay(
        v_textureCoordinates,
        u_perspective,
        u_frustum,
        u_cameraPosition,
        u_cameraDirection,
        u_cameraRight,
        u_cameraUp,
        currentRayOrigin,
        currentRayDirection);
    vec3 currentRayOriginRelative =
        currentRayOrigin - u_cloudPreviousCameraPosition;
    currentMeanAnchor = currentRayOriginRelative + currentRayDirection *
        (cloudDistances.x * SCENEGIS_CLOUD_DISTANCE_ENCODING);
    currentFrontAnchor = currentRayOriginRelative + currentRayDirection *
        (cloudDistances.y * SCENEGIS_CLOUD_DISTANCE_ENCODING);
    currentSceneAnchor = currentRayOriginRelative + currentRayDirection *
        (cloudDistances.z * SCENEGIS_CLOUD_DISTANCE_ENCODING);
    if (!u_cloudHistoryReprojection) {
        return true;
    }
    if (!cloudValid && clearDepth) {
        return sceneGISCloudProjectPreviousDirection(
            currentRayOrigin,
            currentRayDirection,
            historyCoordinates);
    }
    vec3 cloudAdvection =
        u_east * u_cloudOffset.x +
        u_north * u_cloudOffset.y -
        u_cloudPreviousEast * u_cloudPreviousCloudOffset.x -
        u_cloudPreviousNorth * u_cloudPreviousCloudOffset.y;
    if (cloudValid) {
        currentMeanAnchor += cloudAdvection;
        currentFrontAnchor += cloudAdvection;
        return sceneGISCloudProjectPrevious(
            currentMeanAnchor,
            historyCoordinates);
    }
    return sceneGISCloudProjectPrevious(
        currentSceneAnchor,
        historyCoordinates);
}

float sceneGISCloudHalfFloatUlp(float encodedValue)
{
    float magnitude = abs(encodedValue);
    if (magnitude >= 1.0) { return 0.0009765625; }
    if (magnitude >= 0.5) { return 0.00048828125; }
    if (magnitude >= 0.25) { return 0.000244140625; }
    if (magnitude >= 0.125) { return 0.0001220703125; }
    if (magnitude >= 0.0625) { return 0.00006103515625; }
    if (magnitude >= 0.03125) { return 0.000030517578125; }
    if (magnitude >= 0.015625) { return 0.0000152587890625; }
    if (magnitude >= 0.0078125) { return 0.00000762939453125; }
    if (magnitude >= 0.00390625) { return 0.000003814697265625; }
    if (magnitude >= 0.001953125) { return 0.0000019073486328125; }
    if (magnitude >= 0.0009765625) { return 0.00000095367431640625; }
    if (magnitude >= 0.00048828125) { return 0.000000476837158203125; }
    if (magnitude >= 0.000244140625) { return 0.0000002384185791015625; }
    if (magnitude >= 0.0001220703125) { return 0.00000011920928955078125; }
    return 0.000000059604644775390625;
}

float sceneGISCloudHalfFloatPositionToleranceMeters(
    float encodedHistoryDistance,
    float encodedCurrentDistance)
{
    float binary16Tolerance = 0.5 * SCENEGIS_CLOUD_DISTANCE_ENCODING * (
        sceneGISCloudHalfFloatUlp(encodedHistoryDistance) +
        sceneGISCloudHalfFloatUlp(encodedCurrentDistance));
    return max(binary16Tolerance, 16.0);
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
    float sceneDistanceMeters = SCENEGIS_PLANAR_BACKGROUND_DISTANCE;
    float sceneDistance = 1.0;
    if (!isClearDepth) {
        vec4 eye = czm_windowToEyeCoordinates(
            vec4(gl_FragCoord.xy, resolvedDepth, 1.0));
        eye /= eye.w;
        sceneDistanceMeters = u_perspective
            ? length(eye.xyz)
            : max(-eye.z, 0.0);
        sceneDistance = clamp(
            sceneDistanceMeters / SCENEGIS_CLOUD_DISTANCE_ENCODING,
            0.0,
            1.0);
    }
    vec4 colorSum = vec4(0.0);
    vec4 distanceSum = vec4(0.0);
    float shadowLengthSum = 0.0;
    float shadowLengthWeightSum = 0.0;
    float weightSum = 0.0;
    float distanceWeightSum = 0.0;
    vec4 spatialColorMinimum = vec4(65504.0);
    vec4 spatialColorMaximum = vec4(-65504.0);
    bool spatialColorRangeValid = false;
    ivec2 dimensions = textureSize(u_cloudLowDistanceTexture, 0);
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            ivec2 texel = clamp(center + ivec2(x, y), ivec2(0), dimensions - 1);
            vec4 distanceSample = texelFetch(u_cloudLowDistanceTexture, texel, 0);
            vec4 colorSample = texelFetch(u_cloudLowColorTexture, texel, 0);
            #ifdef SCENEGIS_GLOBE
            bool finiteColorSample = all(equal(colorSample, colorSample)) &&
                all(lessThanEqual(abs(colorSample), vec4(65504.0)));
            if (finiteColorSample) {
                spatialColorMinimum = min(spatialColorMinimum, colorSample);
                spatialColorMaximum = max(spatialColorMaximum, colorSample);
                spatialColorRangeValid = true;
            }
            #endif
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
    if (!spatialValid) {
        spatialDistance.xyz = vec3(0.0, 0.0, sceneDistance);
    }
    #else
    spatialDistance.a = step(1.0e-6, distanceWeightSum);
    #endif
    if (!u_cloudHistoryValid || u_cloudHistoryWeight <= 0.0) {
        out_FragData_0 = spatialColor;
        out_FragData_1 = spatialDistance;
        return;
    }
    float historyWeight = u_cloudHistoryWeight;
    vec2 historyCoordinates = v_textureCoordinates;
    vec3 currentMeanAnchor = vec3(0.0);
    vec3 currentFrontAnchor = vec3(0.0);
    vec3 currentSceneAnchor = vec3(0.0);
    bool reprojectedPositionValid = true;
    #ifdef SCENEGIS_GLOBE
    bool currentValid;
    float currentShadowLength;
    sceneGISDecodeCloudShadowLength(
        spatialDistance.a,
        currentValid,
        currentShadowLength);
    reprojectedPositionValid = sceneGISCloudHistoryCoordinates(
        currentValid,
        isClearDepth,
        spatialDistance.xyz,
        historyCoordinates,
        currentMeanAnchor,
        currentFrontAnchor,
        currentSceneAnchor);
    #endif
    historyWeight *= reprojectedPositionValid ? 1.0 : 0.0;
    vec4 historyColor = texture(
        u_cloudHistoryColorTexture, historyCoordinates);
    vec4 historyDistance = texture(
        u_cloudHistoryDistanceTexture, historyCoordinates);
    #ifdef SCENEGIS_GLOBE
    vec4 clippedHistoryColor = spatialColorRangeValid
        ? clamp(historyColor, spatialColorMinimum, spatialColorMaximum)
        : spatialColor;
    bool previousValid;
    float previousShadowLength;
    sceneGISDecodeCloudShadowLength(
        historyDistance.a,
        previousValid,
        previousShadowLength);
    vec3 previousRayOrigin;
    vec3 previousRayDirection;
    sceneGISCloudResolveRay(
        historyCoordinates,
        u_cloudPreviousPerspective,
        u_cloudPreviousFrustum,
        vec3(0.0),
        u_cloudPreviousCameraDirection,
        u_cloudPreviousCameraRight,
        u_cloudPreviousCameraUp,
        previousRayOrigin,
        previousRayDirection);
    vec3 previousMeanAnchor = previousRayOrigin + previousRayDirection *
        (historyDistance.x * SCENEGIS_CLOUD_DISTANCE_ENCODING);
    vec3 previousFrontAnchor = previousRayOrigin + previousRayDirection *
        (historyDistance.y * SCENEGIS_CLOUD_DISTANCE_ENCODING);
    vec3 previousSceneAnchor = previousRayOrigin + previousRayDirection *
        (historyDistance.z * SCENEGIS_CLOUD_DISTANCE_ENCODING);
    #else
    bool currentValid = spatialDistance.a > 0.5;
    bool previousValid = historyDistance.a > 0.5;
    #endif
    #ifdef SCENEGIS_GLOBE
    bool sceneDistanceCompatible = isClearDepth
        ? historyDistance.z == 1.0
        : distance(previousSceneAnchor, currentSceneAnchor) <=
            sceneGISCloudHalfFloatPositionToleranceMeters(
                historyDistance.z, spatialDistance.z);
    bool distanceCompatible =
        distance(previousMeanAnchor, currentMeanAnchor) <=
            sceneGISCloudHalfFloatPositionToleranceMeters(
                historyDistance.x, spatialDistance.x) &&
        distance(previousFrontAnchor, currentFrontAnchor) <=
            sceneGISCloudHalfFloatPositionToleranceMeters(
                historyDistance.y, spatialDistance.y) &&
        sceneDistanceCompatible;
    #else
    vec4 clippedHistoryColor = historyColor;
    bool distanceCompatible =
        abs(historyDistance.x - spatialDistance.x) <= 8.0e-6 &&
        abs(historyDistance.y - spatialDistance.y) <= 8.0e-6 &&
        abs(historyDistance.z - spatialDistance.z) <= 2.0 / 65535.0;
    #endif
    bool transmittanceCompatible =
        abs(clippedHistoryColor.a - spatialColor.a) <= 0.08;
    bool radianceCompatible = all(lessThanEqual(
        abs(clippedHistoryColor.rgb - spatialColor.rgb),
        vec3(0.25) + 0.25 * max(clippedHistoryColor.rgb, spatialColor.rgb)));
    float historyCompatible = currentValid && previousValid &&
            distanceCompatible && transmittanceCompatible && radianceCompatible
        ? 1.0
        : 0.0;
    historyWeight *= historyCompatible;
    #ifdef SCENEGIS_GLOBE
    float shadowHistoryCompatible =
        abs(previousShadowLength - currentShadowLength) <=
            2.0 * SCENEGIS_CLOUD_SHADOW_MAX_LENGTH /
                SCENEGIS_CLOUD_SHADOW_CODE_MAX &&
        (currentValid ||
            (isClearDepth
                ? (!previousValid && historyDistance.z == 1.0)
                : (!previousValid &&
                    distance(previousSceneAnchor, currentSceneAnchor) <=
                        sceneGISCloudHalfFloatPositionToleranceMeters(
                            historyDistance.z,
                            spatialDistance.z))))
        ? 1.0
        : 0.0;
    float shadowHistoryWeight =
        u_cloudHistoryWeight * shadowHistoryCompatible *
        (reprojectedPositionValid ? 1.0 : 0.0);
    #endif
    out_FragData_0 = mix(
        spatialColor,
        clippedHistoryColor,
        historyWeight);
    out_FragData_1 = spatialDistance;
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

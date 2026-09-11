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
#ifdef SCENEGIS_GLOBE
uniform bool u_hasCurrentGlobeDepth;
#endif
uniform float u_cloudStbnSlice;
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
#ifndef SCENEGIS_GLOBE
uniform vec3 u_cloudCameraDelta;
#endif
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
        #ifdef SCENEGIS_GLOBE
        u_cameraPosition,
        #else
        vec3(0.0),
        #endif
        u_cameraDirection,
        u_cameraRight,
        u_cameraUp,
        currentRayOrigin,
        currentRayDirection);
    #ifdef SCENEGIS_GLOBE
    vec3 currentRayOriginRelative = currentRayOrigin - u_cloudPreviousCameraPosition;
    #else
    vec3 currentRayOriginRelative = currentRayOrigin + u_cloudCameraDelta;
    #endif
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
        #ifndef SCENEGIS_GLOBE
        if (!u_perspective) {
            return sceneGISCloudProjectPrevious(
                currentRayOriginRelative, historyCoordinates);
        }
        #endif
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

float sceneGISCloudHistoryPositionToleranceMeters(float previous, float current)
{
    float tolerance = sceneGISCloudHalfFloatPositionToleranceMeters(previous, current);
    if (u_cloudTracePhased) {
        vec2 span = u_cloudPreviousFrustum.yw - u_cloudPreviousFrustum.xz;
        float radius = 0.5 * length(span /
            vec2(textureSize(u_cloudHistoryDistanceTexture, 0)));
        tolerance += u_cloudPreviousPerspective
            ? radius * max(previous, current) * SCENEGIS_CLOUD_DISTANCE_ENCODING
            : radius;
    }
    return tolerance;
}

// Mean/sigma AABB clipping adapted from three-geospatial
// b012ad06d858fc035d88aacfd73f092f93c994e4,
// packages/clouds/src/shaders/varianceClipping.glsl (MIT).
// Copyright (c) 2024 Shota Matsuda
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
vec4 sceneGISCloudVarianceClip(
    vec4 historyColor,
    vec4 moment1,
    vec4 moment2,
    float sampleCount,
    vec4 minimumColor,
    vec4 maximumColor)
{
    vec4 mean = moment1 / sampleCount;
    vec4 sigma = sqrt(max(moment2 / sampleCount - mean * mean, vec4(0.0)));
    // Clamp both endpoints to preserve an ordered finite interval after rounding.
    vec4 lower = clamp(mean - sigma, minimumColor, maximumColor);
    vec4 upper = clamp(mean + sigma, minimumColor, maximumColor);
    lower.a = clamp(lower.a, 0.0, 1.0);
    upper.a = clamp(upper.a, 0.0, 1.0);
    vec4 center = 0.5 * (lower + upper);
    vec4 extent = 0.5 * (upper - lower);
    vec4 delta = historyColor - center;
    float fraction = 1.0;
    // RGB alone determines the common color trajectory. A quantized alpha
    // discrepancy must not discard otherwise compatible color history.
    for (int channel = 0; channel < 3; ++channel) {
        if (abs(delta[channel]) > extent[channel]) {
            fraction = min(fraction, extent[channel] / abs(delta[channel]));
        }
    }
    return vec4(
        center.rgb + delta.rgb * fraction,
        clamp(historyColor.a, lower.a, upper.a));
}

void main()
{
    vec2 lowDimensions = vec2(textureSize(u_cloudLowDistanceTexture, 0));
    vec2 fullDimensions = vec2(textureSize(u_depthTexture, 0));
    float spatialSharpness = lowDimensions.x / max(fullDimensions.x, 1.0) > 0.6
        ? 1.75
        : 0.08;
    vec2 lowPosition = v_textureCoordinates * lowDimensions - vec2(0.5);
    if (u_cloudTracePhased) {
        lowPosition = (floor(gl_FragCoord.xy) -
            vec2(sceneGISCloudTracePhase(u_cloudStbnSlice))) * 0.5;
    }
    ivec2 center = ivec2(floor(lowPosition + vec2(0.5)));
    vec2 fraction = fract(lowPosition);
    float rawDepth = texture(u_depthTexture, v_textureCoordinates).r;
    float resolvedDepth = czm_readDepth(u_depthTexture, v_textureCoordinates);
    bool isClearDepth = sceneGISIsClearResolvedDepth(rawDepth);
    #ifdef SCENEGIS_GLOBE
    isClearDepth = isClearDepth || !u_hasCurrentGlobeDepth;
    #endif
    float sceneDistanceMeters = SCENEGIS_PLANAR_BACKGROUND_DISTANCE;
    float sceneDistance = 1.0;
    if (!isClearDepth) {
        #ifdef SCENEGIS_GLOBE
        vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, rawDepth);
        #else
        vec4 eye = czm_windowToEyeCoordinates(
            gl_FragCoord.xy, rawDepth);
        #endif
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
    vec4 spatialColorMoment1 = vec4(0.0);
    vec4 spatialColorMoment2 = vec4(0.0);
    float spatialColorSampleCount = 0.0;
    vec2 cloudSupportMinimum = vec2(SCENEGIS_CLOUD_DISTANCE_ENCODING);
    vec2 cloudSupportMaximum = vec2(0.0);
    vec2 cloudAnchorSum = vec2(0.0);
    float cloudAnchorCount = 0.0;
    ivec2 dimensions = textureSize(u_cloudLowDistanceTexture, 0);
    vec3 targetOrigin;
    vec3 targetDirection;
    sceneGISCloudResolveRay(v_textureCoordinates, u_perspective, u_frustum,
        vec3(0.0), u_cameraDirection, u_cameraRight, u_cameraUp,
        targetOrigin, targetDirection);
    vec3 targetScene = targetOrigin + targetDirection * sceneDistanceMeters;
    // Evaluate receiver derivatives uniformly, before any neighbor rejection.
    vec3 receiverNormal = cross(dFdx(targetScene), dFdy(targetScene));
    float receiverNormalMagnitude = length(receiverNormal);
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            ivec2 texel = clamp(center + ivec2(x, y), ivec2(0), dimensions - 1);
            vec4 distanceSample = texelFetch(u_cloudLowDistanceTexture, texel, 0);
            vec4 colorSample = texelFetch(u_cloudLowColorTexture, texel, 0);
            bool finiteColorSample = all(equal(colorSample, colorSample)) &&
                all(lessThanEqual(abs(colorSample), vec4(65504.0)));
            if (u_cloudTracePhased) {
                ivec2 sourcePixel = sceneGISCloudTraceFullPixel(
                    texel, ivec2(fullDimensions), u_cloudStbnSlice);
                vec2 sourceUv = (vec2(sourcePixel) + 0.5) / fullDimensions;
                vec2 tent = max(1.0 - abs(floor(gl_FragCoord.xy) -
                    vec2(sourcePixel)) * 0.5, vec2(0.0));
                float weight = tent.x * tent.y;
                float sourceRawDepth = texelFetch(u_depthTexture, sourcePixel, 0).r;
                bool sourceClear = sceneGISIsClearResolvedDepth(sourceRawDepth);
                #ifdef SCENEGIS_GLOBE
                sourceClear = sourceClear || !u_hasCurrentGlobeDepth;
                #endif
                bool finiteDistance = all(equal(distanceSample, distanceSample)) &&
                    all(lessThanEqual(abs(distanceSample), vec4(65504.0)));
                if (!finiteColorSample || !finiteDistance ||
                    sourceClear != isClearDepth) {
                    continue;
                }
                vec3 sourceOrigin;
                vec3 sourceDirection;
                sceneGISCloudResolveRay(sourceUv, u_perspective, u_frustum,
                    vec3(0.0), u_cameraDirection, u_cameraRight, u_cameraUp,
                    sourceOrigin, sourceDirection);
                if (!isClearDepth) {
                    vec3 sourceScene = sourceOrigin + sourceDirection *
                        (distanceSample.z * SCENEGIS_CLOUD_DISTANCE_ENCODING);
                    if (!(receiverNormalMagnitude > 0.0) ||
                        isinf(receiverNormalMagnitude) || isnan(receiverNormalMagnitude) ||
                        abs(dot(receiverNormal, sourceScene - targetScene)) >
                        receiverNormalMagnitude *
                        sceneGISCloudHalfFloatPositionToleranceMeters(
                            distanceSample.z, sceneDistance)) {
                        continue;
                    }
                }
                bool sampleValid;
                float sampleLength;
                sceneGISDecodeCloudShadowLength(distanceSample.a, sampleValid, sampleLength);
                if (weight > 0.0) {
                    shadowLengthSum += sampleLength * weight;
                    shadowLengthWeightSum += weight;
                }
                vec2 targetDistances = vec2(
                    dot(sourceOrigin - targetOrigin + sourceDirection *
                        (distanceSample.x * SCENEGIS_CLOUD_DISTANCE_ENCODING), targetDirection),
                    dot(sourceOrigin - targetOrigin + sourceDirection *
                        (distanceSample.y * SCENEGIS_CLOUD_DISTANCE_ENCODING), targetDirection));
                if (sampleValid && (!isClearDepth &&
                    (targetDistances.x > sceneDistanceMeters +
                        sceneGISCloudHalfFloatPositionToleranceMeters(distanceSample.x, sceneDistance) ||
                     targetDistances.y > sceneDistanceMeters +
                        sceneGISCloudHalfFloatPositionToleranceMeters(distanceSample.y, sceneDistance)))) {
                    continue;
                }
                if (weight > 0.0) {
                    colorSum += colorSample * weight;
                    weightSum += weight;
                    if (sampleValid) {
                        distanceSum.xy += max(targetDistances, vec2(0.0)) /
                            SCENEGIS_CLOUD_DISTANCE_ENCODING * weight;
                        distanceWeightSum += weight;
                    }
                }
                if (sampleValid) {
                    cloudAnchorSum += max(targetDistances, vec2(0.0));
                    cloudAnchorCount += 1.0;
                    vec2 sourceDistances = distanceSample.xy * SCENEGIS_CLOUD_DISTANCE_ENCODING;
                    vec2 localStep = min(vec2(SCENEGIS_GLOBE_CLOUD_MAX_STEP),
                        vec2(SCENEGIS_GLOBE_CLOUD_MIN_STEP) +
                        (SCENEGIS_GLOBE_CLOUD_STEP_SCALE - 1.0) *
                        max(sourceDistances, vec2(0.0)));
                    vec2 supportRadius = 2.0 * localStep *
                        abs(dot(sourceDirection, targetDirection));
                    cloudSupportMinimum = min(cloudSupportMinimum,
                        max(targetDistances - supportRadius, vec2(0.0)));
                    cloudSupportMaximum = max(cloudSupportMaximum,
                        targetDistances + supportRadius);
                }
                // Statistics use all geometrically qualified neighbors, not
                // just the phase-dependent interpolation support.
                spatialColorMinimum = min(spatialColorMinimum, colorSample);
                spatialColorMaximum = max(spatialColorMaximum, colorSample);
                spatialColorRangeValid = true;
                spatialColorMoment1 += colorSample;
                spatialColorMoment2 += colorSample * colorSample;
                spatialColorSampleCount += 1.0;
                continue;
            }
            #ifdef SCENEGIS_GLOBE
            if (finiteColorSample) {
                spatialColorMinimum = min(spatialColorMinimum, colorSample);
                spatialColorMaximum = max(spatialColorMaximum, colorSample);
                spatialColorRangeValid = true;
                spatialColorMoment1 += colorSample;
                spatialColorMoment2 += colorSample * colorSample;
                spatialColorSampleCount += 1.0;
            }
            #else
            // Qualify the source receiver before it contributes color or history bounds.
            vec2 sourceUv = (vec2(texel) + 0.5) / lowDimensions;
            float sourceRawDepth = texture(u_depthTexture, sourceUv).r;
            if (sceneGISIsClearResolvedDepth(sourceRawDepth) != isClearDepth) {
                continue;
            }
            vec3 sourceOrigin;
            vec3 sourceDirection;
            sceneGISCloudResolveRay(sourceUv, u_perspective, u_frustum,
                vec3(0.0), u_cameraDirection, u_cameraRight, u_cameraUp,
                sourceOrigin, sourceDirection);
            if (!isClearDepth) {
                vec3 sourceScene = sourceOrigin + sourceDirection *
                    (distanceSample.z * SCENEGIS_CLOUD_DISTANCE_ENCODING);
                if (!(receiverNormalMagnitude > 0.0) ||
                    abs(dot(receiverNormal, sourceScene - targetScene)) >
                        receiverNormalMagnitude *
                        sceneGISCloudHalfFloatPositionToleranceMeters(
                            distanceSample.z, sceneDistance)) {
                    continue;
                }
            }
            if (distanceSample.a > 0.5) {
                vec2 targetDistances = vec2(
                    dot(sourceOrigin - targetOrigin + sourceDirection *
                        (distanceSample.x * SCENEGIS_CLOUD_DISTANCE_ENCODING), targetDirection),
                    dot(sourceOrigin - targetOrigin + sourceDirection *
                        (distanceSample.y * SCENEGIS_CLOUD_DISTANCE_ENCODING), targetDirection));
                if (!isClearDepth && any(greaterThan(targetDistances,
                    vec2(sceneDistanceMeters + sceneGISCloudHalfFloatPositionToleranceMeters(
                        distanceSample.x, sceneDistance))))) {
                    continue;
                }
                distanceSample.xy = max(targetDistances, vec2(0.0)) /
                    SCENEGIS_CLOUD_DISTANCE_ENCODING;
                cloudSupportMinimum = min(cloudSupportMinimum, targetDistances);
                cloudSupportMaximum = max(cloudSupportMaximum, targetDistances);
            }
            spatialColorMinimum = min(spatialColorMinimum, colorSample);
            spatialColorMaximum = max(spatialColorMaximum, colorSample);
            spatialColorRangeValid = true;
            spatialColorMoment1 += colorSample;
            spatialColorMoment2 += colorSample * colorSample;
            spatialColorSampleCount += 1.0;
            #endif
            #ifdef SCENEGIS_GLOBE
            vec2 delta = vec2(x, y) - (fraction - vec2(0.5));
            float spatialWeight = sceneGISCloudDeterministicExp2Negative(
                dot(delta, delta) * spatialSharpness);
            float frontWeight = distanceSample.a < 0.5
                ? 0.05
                : sceneGISCloudDeterministicExp2Negative(
                    abs(distanceSample.z - sceneDistance) * 96.0);
            #else
            vec2 tent = max(vec2(1.0) - abs(vec2(texel) - lowPosition), vec2(0.0));
            float spatialWeight = tent.x * tent.y;
            float frontWeight = sceneGISCloudDeterministicExp2Negative(
                abs(distanceSample.z - sceneDistance) * 96.0);
            #endif
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
    bool spatialValid = distanceWeightSum > 1.0e-6;
    if (u_cloudTracePhased && !spatialValid &&
        weightSum > 0.0 && cloudAnchorCount > 0.0) {
        // A transparent tent estimate still belongs to the locally sampled
        // volume. Supply a current anchor for reprojection and composition,
        // without changing its RGBA or carrying forward historical distance.
        spatialDistance.xy = cloudAnchorSum /
            (cloudAnchorCount * SCENEGIS_CLOUD_DISTANCE_ENCODING);
        spatialValid = true;
    }
    float spatialShadowLength = shadowLengthSum /
        max(shadowLengthWeightSum, 1.0e-6);
    spatialDistance.a = sceneGISEncodeCloudShadowLength(
         spatialValid,
         spatialShadowLength);
    if (!spatialValid) {
        spatialDistance.xyz = vec3(0.0, 0.0, sceneDistance);
    }
    if (u_cloudTracePhased) {
        spatialDistance.z = sceneDistance;
        if (weightSum <= 0.0) {
            spatialColor = vec4(0.0, 0.0, 0.0, 1.0);
            spatialDistance = vec4(0.0, 0.0, sceneDistance, 0.0);
        }
    }
    #ifndef SCENEGIS_GLOBE
    spatialDistance.z = sceneDistance;
    if (weightSum <= 0.0) {
        spatialColor = vec4(0.0, 0.0, 0.0, 1.0);
    }
    #endif
    #ifdef SCENEGIS_GLOBE
    if (u_cloudTracePhased && weightSum <= 0.0) {
        out_FragData_0 = spatialColor;
        out_FragData_1 = spatialDistance;
        return;
    }
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
    if (u_cloudTracePhased) {
        if (!reprojectedPositionValid) {
            out_FragData_0 = spatialColor;
            out_FragData_1 = spatialDistance;
            return;
        }
        vec2 historySize = vec2(textureSize(u_cloudHistoryDistanceTexture, 0));
        historyCoordinates = (min(floor(historyCoordinates * historySize),
            historySize - 1.0) + 0.5) / historySize;
    }

    historyWeight *= reprojectedPositionValid ? 1.0 : 0.0;
    vec4 historyColor = texture(
        u_cloudHistoryColorTexture, historyCoordinates);
    vec4 historyDistance = texture(
        u_cloudHistoryDistanceTexture, historyCoordinates);
    vec4 clippedHistoryColor = spatialColorRangeValid
        ? sceneGISCloudVarianceClip(
            historyColor,
            spatialColorMoment1,
            spatialColorMoment2,
            spatialColorSampleCount,
            spatialColorMinimum,
            spatialColorMaximum)
        : spatialColor;
    #ifdef SCENEGIS_GLOBE
    bool previousValid;
    float previousShadowLength;
    sceneGISDecodeCloudShadowLength(
        historyDistance.a,
        previousValid,
        previousShadowLength);
    #else
    bool previousValid = historyDistance.a > 0.5;
    #endif
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
    #ifdef SCENEGIS_GLOBE
    bool sceneDistanceCompatible = isClearDepth
        ? historyDistance.z == 1.0
        : distance(previousSceneAnchor, currentSceneAnchor) <=
            sceneGISCloudHistoryPositionToleranceMeters(
                historyDistance.z, spatialDistance.z);
    bool distanceCompatible =
        distance(previousMeanAnchor, currentMeanAnchor) <=
            sceneGISCloudHistoryPositionToleranceMeters(
                historyDistance.x, spatialDistance.x) &&
        distance(previousFrontAnchor, currentFrontAnchor) <=
            sceneGISCloudHistoryPositionToleranceMeters(
                historyDistance.y, spatialDistance.y) &&
        sceneDistanceCompatible;
    #else
    bool sceneDistanceCompatible = isClearDepth
        ? historyDistance.z == 1.0
        : distance(previousSceneAnchor, currentSceneAnchor) <=
            sceneGISCloudHistoryPositionToleranceMeters(
                historyDistance.z, spatialDistance.z);
    vec2 precisionRadius = vec2(
        sceneGISCloudHistoryPositionToleranceMeters(historyDistance.x, spatialDistance.x),
        sceneGISCloudHistoryPositionToleranceMeters(historyDistance.y, spatialDistance.y));
    vec2 projectedHistory = spatialDistance.xy * SCENEGIS_CLOUD_DISTANCE_ENCODING + vec2(
        dot(previousMeanAnchor - currentMeanAnchor, targetDirection),
        dot(previousFrontAnchor - currentFrontAnchor, targetDirection));
    bool distanceCompatible =
        sceneDistanceCompatible &&
        all(greaterThanEqual(projectedHistory, cloudSupportMinimum - precisionRadius)) &&
        all(lessThanEqual(projectedHistory, cloudSupportMaximum + precisionRadius));
    #endif
    if (u_cloudTracePhased) {
        vec2 precisionRadius = vec2(
            sceneGISCloudHistoryPositionToleranceMeters(historyDistance.x, spatialDistance.x),
            sceneGISCloudHistoryPositionToleranceMeters(historyDistance.y, spatialDistance.y));
        vec2 projectedHistory = spatialDistance.xy * SCENEGIS_CLOUD_DISTANCE_ENCODING + vec2(
            dot(previousMeanAnchor - currentMeanAnchor, targetDirection),
            dot(previousFrontAnchor - currentFrontAnchor, targetDirection));
        vec3 meanFromPreviousOrigin = currentMeanAnchor - previousRayOrigin;
        float meanRayResidual = length(meanFromPreviousOrigin - previousRayDirection *
            dot(meanFromPreviousOrigin, previousRayDirection));
        bool cloudDistanceCompatible =
            all(greaterThanEqual(projectedHistory, vec2(0.0))) &&
            // Identical integration rays need not agree on stochastic cloud
            // depths. Scene occlusion stays independent of this interval test.
            (!u_cloudHistoryReprojection || (
                all(greaterThanEqual(projectedHistory, cloudSupportMinimum - precisionRadius)) &&
                all(lessThanEqual(projectedHistory, cloudSupportMaximum + precisionRadius)))) &&
            (isClearDepth || all(lessThanEqual(projectedHistory,
                vec2(sceneDistanceMeters) + precisionRadius)));
        distanceCompatible = sceneDistanceCompatible &&
            meanRayResidual <= precisionRadius.x &&
            (!previousValid || cloudDistanceCompatible);
    }
    bool transmittanceCompatible =
        abs(clippedHistoryColor.a - spatialColor.a) <= 0.08;
    bool radianceCompatible = all(lessThanEqual(
        abs(clippedHistoryColor.rgb - spatialColor.rgb),
        vec3(0.25) + 0.25 * max(clippedHistoryColor.rgb, spatialColor.rgb)));
    bool cloudPresenceCompatible = currentValid && previousValid;
    if (u_cloudTracePhased) {
        // Available transparent history is a volume estimate, not a history
        // failure. Qualified neighborhood clipping bounds HDR color and
        // coverage without a second magnitude-dependent rejection threshold.
        cloudPresenceCompatible = currentValid;
        transmittanceCompatible = true;
        radianceCompatible = true;
    }
    float historyCompatible = cloudPresenceCompatible &&
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
                        sceneGISCloudHistoryPositionToleranceMeters(
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

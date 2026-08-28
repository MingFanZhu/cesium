// Globe cloud density structure adapted from:
// yuwoniu03/cesium-clouds-atmosphere
// commit 1f38602b84ab5c3f2bc289f9e4464df3db917155,
// src/ThreeGeospatialPipeline.js, and its upstream source:
// takram-design-engineering/three-geospatial
// commit b012ad06d858fc035d88aacfd73f092f93c994e4,
// packages/clouds/src/shaders/{clouds.glsl,clouds.frag}.
//
// Copyright (c) 2024 Shota Matsuda
// Copyright (c) 2026 cesium-clouds-atmosphere contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
// DEALINGS IN THE SOFTWARE.

const float SCENEGIS_GLOBE_CLOUD_WEATHER_SCALE = 240000.0;
const float SCENEGIS_GLOBE_CLOUD_MACRO_SCALE = 0.25;
const float SCENEGIS_GLOBE_CLOUD_LOD_SCALE = 0.5;

bool sceneGISCloudSphereInterval(
    vec3 rayOrigin,
    vec3 rayDirection,
    float radius,
    out float intervalStart,
    out float intervalEnd);

float sceneGISCloudDualPhase(
    float cosineTheta,
    float phaseAttenuation);

float sceneGISGlobeCloudRemap(
    float value,
    float minimum,
    float maximum);

float sceneGISGlobeCloudHazeRayDistance(
    vec3 rayOrigin,
    vec3 rayDirection,
    float maximumDistance)
{
    vec3 virtualOrigin = vec3(
        rayOrigin.xy, SCENEGIS_BOTTOM_RADIUS + rayOrigin.z);
    float topNear;
    float topFar;
    float rayDistance = max(maximumDistance, 0.0);
    if (!sceneGISCloudSphereInterval(
            virtualOrigin,
            rayDirection,
            SCENEGIS_BOTTOM_RADIUS + u_sceneGISShadowCloudTop,
            topNear,
            topFar)) {
        return 0.0;
    }
    rayDistance = min(rayDistance, max(topFar, 0.0));
    float groundNear;
    float groundFar;
    if (sceneGISCloudSphereInterval(
            virtualOrigin,
            rayDirection,
            SCENEGIS_BOTTOM_RADIUS,
            groundNear,
            groundFar) &&
        groundNear > 0.0) {
        rayDistance = min(rayDistance, groundNear);
    }
    return max(rayDistance, 0.0);
}

float sceneGISGlobeCloudHazeClampToCloudFront(
    float rayDistance,
    float cloudFrontDistance,
    float cameraNear,
    float cloudOpacity)
{
    float frontDistance = max(cloudFrontDistance - cameraNear, 0.0);
    return mix(
        rayDistance,
        min(frontDistance, rayDistance),
        clamp(cloudOpacity, 0.0, 1.0));
}

vec4 sceneGISGlobeCloudHaze(
    sampler2D transmittanceTexture,
    sampler2D irradianceTexture,
    vec3 cameraPosition,
    vec3 rayDirection,
    vec3 sunDirection,
    float maximumDistance,
    float shadowLength,
    float cloudCoverage)
{
    const float hazeDensityScale = 3.0e-5;
    const float hazeExponent = 1.0e-3;
    const float hazeSkyScale = 1.0;
    const float hazeScattering = 0.9;
    const float hazeAbsorption = 0.5;
    float modulation = sceneGISGlobeCloudRemap(
        cloudCoverage, 0.2, 0.4);
    vec3 virtualCameraPosition = vec3(
        cameraPosition.xy,
        SCENEGIS_BOTTOM_RADIUS + cameraPosition.z);
    float cameraHeight =
        length(virtualCameraPosition) - SCENEGIS_BOTTOM_RADIUS;
    if (cameraHeight * modulation < 0.0) {
        return vec4(0.0);
    }
    float density = modulation * hazeDensityScale *
        exp(-cameraHeight * hazeExponent);
    if (density < 1.0e-7) {
        return vec4(0.0);
    }

    vec3 normalAtOrigin = normalize(virtualCameraPosition);
    vec3 normalAtHorizon = (
        virtualCameraPosition -
        dot(virtualCameraPosition, rayDirection) * rayDirection) /
        SCENEGIS_BOTTOM_RADIUS;
    float normalBlend = sceneGISGlobeCloudRemap(
        dot(normalAtOrigin, normalAtHorizon), 0.9, 1.0);
    vec3 normal = mix(normalAtOrigin, normalAtHorizon, normalBlend);
    float angle = max(dot(normal, rayDirection), 1.0e-5);
    float exponent = angle * hazeExponent;
    float linearTerm = density / hazeExponent / angle;
    float expTerm = 1.0 - exp(-max(maximumDistance, 0.0) * exponent);
    float shadowExpTerm = 1.0 - exp(
        -min(max(maximumDistance, 0.0), max(shadowLength, 0.0)) *
            exponent);
    float opticalDepth = expTerm * linearTerm;
    float directionalOpticalDepth = max(
        (expTerm - shadowExpTerm) * linearTerm,
        0.0);
    float opacity = clamp(1.0 - exp(-opticalDepth), 0.0, 1.0);
    float directionalOpacity = clamp(
        1.0 - exp(-directionalOpticalDepth),
        0.0,
        1.0);

    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 skyIrradiance;
    vec3 sunIrradiance = GetSunAndSkyScalarIrradiance(
        atmosphere,
        transmittanceTexture,
        irradianceTexture,
        virtualCameraPosition * 0.001,
        sunDirection,
        skyIrradiance);
    float cosineTheta = dot(sunDirection, rayDirection);
    vec3 inscatter = sunIrradiance *
        sceneGISCloudDualPhase(cosineTheta, 1.0) * directionalOpacity;
    inscatter += skyIrradiance * (1.0 / (4.0 * czm_pi)) *
        hazeSkyScale * opacity;
    inscatter *= hazeScattering / (hazeAbsorption + hazeScattering);
    return vec4(max(inscatter, vec3(0.0)), opacity);
}

vec2 sceneGISGlobeCloudCubeSphereUv(vec3 position)
{
    vec3 normal = normalize(position);
    vec3 absoluteNormal = abs(normal);
    vec3 cube = normal / max(
        absoluteNormal.x,
        max(absoluteNormal.y, absoluteNormal.z));
    vec2 face;
    if (absoluteNormal.y >= absoluteNormal.x &&
        absoluteNormal.y >= absoluteNormal.z) {
        face = cube.y > 0.0 ? vec2(-normal.x, normal.z) : normal.xz;
    } else if (absoluteNormal.x >= absoluteNormal.y &&
        absoluteNormal.x >= absoluteNormal.z) {
        face = cube.x > 0.0 ? normal.yz : vec2(-normal.y, normal.z);
    } else {
        face = cube.z > 0.0 ? normal.xy : vec2(normal.x, -normal.y);
    }
    vec2 squared = face * face;
    float q = dot(squared, vec2(-2.0, 2.0)) - 3.0;
    float x = sqrt(max(
        1.5 + squared.x - squared.y -
            0.5 * sqrt(max(-24.0 * squared.x + q * q, 0.0)),
        0.0));
    x *= face.x > 0.0 ? 1.0 : -1.0;
    float y = sqrt(max(6.0 / max(3.0 - x * x, 1.0e-4), 0.0)) *
        face.y;
    return vec2(x, y) * 0.5 + 0.5;
}

vec4 sceneGISGlobeCloudLayerDescriptor(int preset, int layer)
{
    if (preset == 0) {
        return layer == 0 ? vec4(0.0, 1.0, 1.0, 0.0) : vec4(0.0);
    }
    if (preset == 1) {
        return layer == 0 ? vec4(500.0, 0.4, 0.42, 0.12) : vec4(0.0);
    }
    if (preset == 2) {
        return layer == 0 ? vec4(6500.0, 0.32, 0.10, -0.08) : vec4(0.0);
    }
    if (layer == 0) {
        return vec4(0.0, 0.85, 0.72, -0.03);
    }
    if (layer == 1) {
        return vec4(4200.0, 0.34, 0.28, 0.04);
    }
    return layer == 2 ? vec4(7800.0, 0.24, 0.08, -0.10) : vec4(0.0);
}

vec4 sceneGISGlobeCloudLayerSampling(int preset, int layer)
{
    if (preset == 1 || (preset == 3 && layer == 1)) {
        return vec4(0.75, 0.35, 0.60, 0.55);
    }
    if (preset == 2 || (preset == 3 && layer == 2)) {
        return vec4(2.0, 0.35, 0.50, 0.0);
    }
    return vec4(1.0, 0.35, 0.60, preset == 3 ? 0.80 : 1.0);
}

vec3 sceneGISGlobeCloudLayerScales(int preset, int layer)
{
    if (preset == 1 || (preset == 3 && layer == 1)) {
        return vec3(
            22000.0 * SCENEGIS_GLOBE_CLOUD_MACRO_SCALE,
            2800.0,
            0.65);
    }
    if (preset == 2 || (preset == 3 && layer == 2)) {
        return vec3(
            30000.0 * SCENEGIS_GLOBE_CLOUD_MACRO_SCALE,
            900.0,
            0.40);
    }
    return vec3(
        (preset == 3 ? 13000.0 : 10000.0) *
            SCENEGIS_GLOBE_CLOUD_MACRO_SCALE,
        preset == 3 ? 1200.0 : 900.0,
        1.0);
}

float sceneGISGlobeCloudWeatherChannel(vec4 weather, int layer)
{
    return layer == 0 ? weather.r :
        (layer == 1 ? weather.g : (layer == 2 ? weather.b : weather.a));
}

float sceneGISGlobeCloudRemap(float value, float minimum, float maximum)
{
    return clamp(
        (value - minimum) / max(maximum - minimum, 1.0e-4),
        0.0,
        1.0);
}

float sceneGISGlobeCloudShapeAltering(float heightFraction, float bias)
{
    float biased = pow(clamp(heightFraction, 0.0, 1.0), bias);
    float x = clamp(biased * 2.0 - 1.0, -1.0, 1.0);
    return 1.0 - x * x;
}

float sceneGISGlobeCloudDensitySample(
    sampler3D shapeTexture,
    sampler3D detailTexture,
    sampler2D weatherTexture,
    sampler3D turbulenceTexture,
    vec3 globePosition,
    vec3 globeOffset,
    vec2 cloudOffset,
    float cloudBaseHeight,
    float cloudThickness,
    float cloudCoverage,
    int cloudPreset,
    float detailStrength,
    float footprintMeters,
    out float activeLayerHeightGradient)
{
    float height = length(globePosition) - SCENEGIS_BOTTOM_RADIUS;
    vec2 globeUv = sceneGISGlobeCloudCubeSphereUv(globePosition);
    vec2 weatherUv = globeUv * 100.0 +
        cloudOffset / SCENEGIS_GLOBE_CLOUD_WEATHER_SCALE;
    vec4 weather = textureLod(weatherTexture, weatherUv, 0.0);
    float accumulatedDensity = 0.0;
    float accumulatedGradient = 0.0;
    for (int layer = 0; layer < 4; ++layer) {
        vec4 descriptor = sceneGISGlobeCloudLayerDescriptor(
            cloudPreset,
            layer);
        if (descriptor.z <= 0.0) {
            continue;
        }
        float layerBase = cloudBaseHeight + descriptor.x;
        float layerThickness = cloudThickness * descriptor.y;
        float heightFraction = clamp(
            (height - layerBase) / max(layerThickness, 1.0),
            0.0,
            1.0);
        bool insideLayer = height > layerBase &&
            height < layerBase + layerThickness;
        if (!insideLayer) {
            continue;
        }
        vec4 sampling = sceneGISGlobeCloudLayerSampling(
            cloudPreset,
            layer);
        float localWeather = pow(
            max(sceneGISGlobeCloudWeatherChannel(weather, layer), 0.0),
            sampling.x);
        float heightScale = sceneGISGlobeCloudShapeAltering(
            heightFraction,
            sampling.y);
        float coverage = clamp(cloudCoverage + descriptor.w, 0.0, 1.0);
        float factor = 1.0 - coverage * heightScale;
        float weatherDensity = sceneGISGlobeCloudRemap(
            mix(localWeather, 1.0, sampling.z),
            factor,
            factor + sampling.z);
        if (weatherDensity <= 1.0e-5) {
            continue;
        }
        vec3 scales = sceneGISGlobeCloudLayerScales(cloudPreset, layer);
        float bottomWeight = sceneGISGlobeCloudRemap(
            heightFraction,
            0.3,
            0.0);
        float turbulenceLod = clamp(
            log2(max(footprintMeters / 250.0, 1.0)) *
                SCENEGIS_GLOBE_CLOUD_LOD_SCALE,
            0.0,
            6.0);
        vec3 turbulence = (textureLod(
            turbulenceTexture,
            vec3(globeUv * 2000.0, heightFraction),
            turbulenceLod).rgb - vec3(128.0 / 255.0)) *
            (255.0 / 127.0) * 350.0 * weatherDensity * bottomWeight;
        vec3 shapePosition = globePosition + globeOffset + turbulence;
        float shapeTexelMeters = scales.x / 128.0;
        float shapeLod = clamp(
            log2(max(footprintMeters / shapeTexelMeters, 1.0)) *
                SCENEGIS_GLOBE_CLOUD_LOD_SCALE,
            0.0,
            7.0);
        float shape = textureLod(
            shapeTexture,
            shapePosition / scales.x,
            shapeLod).r;
        float density = sceneGISGlobeCloudRemap(
            weatherDensity,
            (1.0 - shape) * scales.z,
            1.0);
        if (density > 1.0e-5 &&
            detailStrength > 0.0 &&
            sampling.w > 0.0) {
            float detailTexelMeters = scales.y / 64.0;
            float detailLod = clamp(
                log2(max(footprintMeters / detailTexelMeters, 1.0)) *
                    SCENEGIS_GLOBE_CLOUD_LOD_SCALE,
                0.0,
                6.0);
            float detail = textureLod(
                detailTexture,
                (globePosition + globeOffset + turbulence) / scales.y,
                detailLod).r;
            float heightBlend = sceneGISGlobeCloudRemap(
                heightFraction,
                0.2,
                0.4);
            float modifier = mix(
                pow(detail, 6.0),
                1.0 - detail,
                heightBlend) * sampling.w * detailStrength;
            density = sceneGISGlobeCloudRemap(
                density * 2.0,
                modifier * 0.5,
                1.0);
        }
        float densityProfile = 0.75 * heightFraction + 0.25;
        float weightedDensity = clamp(
            density * densityProfile * descriptor.z,
            0.0,
            1.0);
        accumulatedDensity += weightedDensity;
        accumulatedGradient += weightedDensity *
            mix(0.5, 1.0, heightFraction);
    }
    activeLayerHeightGradient = accumulatedDensity > 1.0e-6 ?
        accumulatedGradient / accumulatedDensity : 0.5;
    return clamp(accumulatedDensity, 0.0, 1.0);
}

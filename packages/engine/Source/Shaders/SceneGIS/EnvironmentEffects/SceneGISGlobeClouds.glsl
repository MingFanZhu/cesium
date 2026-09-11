// Shared authored cloud material with explicit Globe/Planar coordinates.
// Cloud density structure adapted from:
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
const float SCENEGIS_GLOBE_CLOUD_WEATHER_TEXTURE_SIZE = 512.0;
const float SCENEGIS_GLOBE_CLOUD_SHAPE_SCALE = 10000.0 / 3.0;
const float SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE = 1000.0 / 6.0;
const float SCENEGIS_GLOBE_CLOUD_DETAIL_TEXTURE_SIZE = 32.0;
// The matched Basic reference keeps temporalUpscale enabled. Its quarter-rate
// Cloud MRT therefore maps the full-resolution projected footprint by 0.25.
const float SCENEGIS_GLOBE_CLOUD_TEMPORAL_MIP_SCALE = 0.25;

uniform bool u_sceneGISGlobeCloudTurbulence;

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

#ifdef SCENEGIS_GLOBE
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
    skyIrradiance += sceneGISReadableNightSkyIrradiance(
        normalAtOrigin,
        sunDirection);
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

float sceneGISGlobeCloudEntryTexelsPerPixel(
    vec3 globePosition,
    vec2 currentTargetDimensions,
    vec2 resolvedTargetDimensions,
    float cameraHeight,
    float maximumCloudHeight)
{
    vec2 globeUv = sceneGISGlobeCloudCubeSphereUv(globePosition);
    vec2 referenceCurrentDimensions = max(
        ceil(resolvedTargetDimensions * 0.25),
        vec2(1.0));
    vec2 referenceResolution = referenceCurrentDimensions * 4.0;
    vec2 coordinate = globeUv * 100.0 * referenceResolution;
    vec2 rasterFootprintConversion = currentTargetDimensions /
        referenceCurrentDimensions;
    vec2 derivativeX = dFdx(coordinate) * rasterFootprintConversion.x;
    vec2 derivativeY = dFdy(coordinate) * rasterFootprintConversion.y;
    float maximumDeltaSquared = max(
        dot(derivativeX, derivativeX),
        dot(derivativeY, derivativeY)) * 0.1;
    float mipLevel = max(
        0.0,
        0.5 * log2(max(1.0, maximumDeltaSquared)));
    mipLevel *= SCENEGIS_GLOBE_CLOUD_TEMPORAL_MIP_SCALE;
    mipLevel = mix(
        0.0,
        mipLevel,
        min(1.0, 0.2 * max(cameraHeight, 0.0) /
            max(maximumCloudHeight, 1.0)));
    return exp2(mipLevel);
}

#endif

vec4 sceneGISGlobeCloudLayerDescriptor(int preset, int layer)
{
    const float firstLowThickness = 650.0 / 4500.0;
    const float secondLowThickness = 1200.0 / 4500.0;
    const float highThickness = 500.0 / 4500.0;
    if (preset == 0) {
        if (layer == 0) {
            return vec4(0.0, firstLowThickness, 0.20, 0.0);
        }
        return layer == 1 ?
            vec4(250.0, secondLowThickness, 0.20, 0.0) : vec4(0.0);
    }
    if (preset == 1) {
        return layer == 0 ?
            vec4(250.0, secondLowThickness, 0.20, 0.0) : vec4(0.0);
    }
    if (preset == 2) {
        return layer == 0 ?
            vec4(6750.0, highThickness, 0.003, 0.0) : vec4(0.0);
    }
    if (layer == 0) {
        return vec4(0.0, firstLowThickness, 0.20, 0.0);
    }
    if (layer == 1) {
        return vec4(250.0, secondLowThickness, 0.20, 0.0);
    }
    return layer == 2 ?
        vec4(6750.0, highThickness, 0.003, 0.0) : vec4(0.0);
}

bool sceneGISGlobeCloudLayerCastsShadow(int preset, int layer)
{
    if (preset == 2) {
        return false;
    }
    if (preset == 1) {
        return layer == 0;
    }
    return layer == 0 || layer == 1;
}

void sceneGISGlobeCloudShadowPresetSupport(
    int preset,
    float cloudBaseHeight,
    float cloudThickness,
    out float supportBaseHeight,
    out float supportThickness)
{
    float supportTopHeight = cloudBaseHeight;
    supportBaseHeight = cloudBaseHeight + cloudThickness;
    for (int layer = 0; layer < 4; ++layer) {
        vec4 descriptor = sceneGISGlobeCloudLayerDescriptor(preset, layer);
        if (!sceneGISGlobeCloudLayerCastsShadow(preset, layer) ||
            descriptor.z <= 0.0) {
            continue;
        }
        float layerBaseHeight = cloudBaseHeight + descriptor.x;
        float layerTopHeight = layerBaseHeight + cloudThickness * descriptor.y;
        supportBaseHeight = min(supportBaseHeight, layerBaseHeight);
        supportTopHeight = max(supportTopHeight, layerTopHeight);
    }
    supportThickness = max(supportTopHeight - supportBaseHeight, 0.0);
    if (supportThickness <= 0.0) {
        supportBaseHeight = cloudBaseHeight;
    }
}

vec4 sceneGISGlobeCloudLayerSampling(int preset, int layer)
{
    if (preset == 2 || (preset == 3 && layer == 2)) {
        return vec4(1.0, 0.35, 0.50, 0.0);
    }
    return vec4(1.0, 0.35, 0.60, 1.0);
}

vec3 sceneGISGlobeCloudLayerScales(int preset, int layer)
{
    if (preset == 2 || (preset == 3 && layer == 2)) {
        return vec3(
            SCENEGIS_GLOBE_CLOUD_SHAPE_SCALE,
            SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE,
            0.40);
    }
    return vec3(
        SCENEGIS_GLOBE_CLOUD_SHAPE_SCALE,
        SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE,
        1.0);
}

float sceneGISGlobeCloudWeatherChannel(
    vec4 weather,
    int preset,
    int layer)
{
    if (preset == 1) {
        return weather.g;
    }
    if (preset == 2) {
        return weather.b;
    }
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

float sceneGISGlobeCloudDensitySampleInternal(
    sampler3D shapeTexture,
    sampler3D detailTexture,
    sampler2D weatherTexture,
    sampler2D turbulenceTexture,
    vec3 globePosition,
    vec3 globeOffset,
    vec2 cloudOffset,
    float cloudBaseHeight,
    float cloudThickness,
    float cloudCoverage,
    int cloudPreset,
    float detailStrength,
    float mipLevel,
    float jitter,
    bool shadowLayersOnly,
    out float activeLayerHeightGradient)
{
    #ifdef SCENEGIS_GLOBE
    float height = length(globePosition) - SCENEGIS_BOTTOM_RADIUS;
    vec2 globeUv = sceneGISGlobeCloudCubeSphereUv(globePosition);
    vec2 weatherUv = globeUv * 100.0 +
        cloudOffset / SCENEGIS_GLOBE_CLOUD_WEATHER_SCALE;
    float materialMipLevel = max(mipLevel, 0.0);
    float weatherMipLevel = materialMipLevel;
    float turbulenceMipLevel = materialMipLevel;
    #else
    // The adapter supplies advected metric XY and absolute world Z.
    float height = globePosition.z;
    vec2 globeUv = globePosition.xy /
        (SCENEGIS_GLOBE_CLOUD_WEATHER_SCALE * 100.0);
    vec2 weatherUv = globeUv * 100.0;
    float footprint = max(mipLevel, 0.0);
    float materialMipLevel = log2(max(footprint /
        (SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE / 32.0), 1.0));
    float weatherMipLevel = log2(max(footprint /
        (SCENEGIS_GLOBE_CLOUD_WEATHER_SCALE / 512.0), 1.0));
    float turbulenceMipLevel = log2(max(footprint / (12000.0 / 128.0), 1.0));
    #endif
    vec4 weather = textureLod(weatherTexture, weatherUv, weatherMipLevel);
    vec4 heightFractions = vec4(0.0);
    vec4 weatherDensity = vec4(0.0);
    vec4 densityScales = vec4(0.0);
    vec4 shapeAmounts = vec4(0.0);
    vec4 detailAmounts = vec4(0.0);
    for (int layer = 0; layer < 4; ++layer) {
        vec4 descriptor = sceneGISGlobeCloudLayerDescriptor(
            cloudPreset,
            layer);
        if (descriptor.z <= 0.0 ||
            (shadowLayersOnly &&
                !sceneGISGlobeCloudLayerCastsShadow(cloudPreset, layer))) {
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
        heightFractions[layer] = heightFraction;
        densityScales[layer] = descriptor.z;
        vec4 sampling = sceneGISGlobeCloudLayerSampling(
            cloudPreset,
            layer);
        float localWeather = pow(
            max(sceneGISGlobeCloudWeatherChannel(
                weather,
                cloudPreset,
                layer), 0.0),
            sampling.x);
        float heightScale = sceneGISGlobeCloudShapeAltering(
            heightFraction,
            sampling.y);
        float coverage = clamp(cloudCoverage + descriptor.w, 0.0, 1.0);
        float factor = 1.0 - coverage * heightScale;
        weatherDensity[layer] = sceneGISGlobeCloudRemap(
            mix(localWeather, 1.0, sampling.z),
            factor,
            factor + sampling.z);
        vec3 scales = sceneGISGlobeCloudLayerScales(cloudPreset, layer);
        shapeAmounts[layer] = scales.z;
        detailAmounts[layer] = sampling.w * detailStrength;
    }

    if (all(equal(weatherDensity, vec4(0.0)))) {
        activeLayerHeightGradient = 0.5;
        return 0.0;
    }

    vec4 bottomWeights = vec4(
        sceneGISGlobeCloudRemap(heightFractions.x, 0.3, 0.0),
        sceneGISGlobeCloudRemap(heightFractions.y, 0.3, 0.0),
        sceneGISGlobeCloudRemap(heightFractions.z, 0.3, 0.0),
        sceneGISGlobeCloudRemap(heightFractions.w, 0.3, 0.0));
    vec3 turbulence = vec3(0.0);
    if (u_sceneGISGlobeCloudTurbulence) {
        turbulence = (textureLod(
            turbulenceTexture,
            globeUv * 2000.0,
            turbulenceMipLevel).rgb * 2.0 - 1.0) *
            350.0 * dot(weatherDensity, bottomWeights);
    }
    #ifdef SCENEGIS_GLOBE
    vec3 evolution = -normalize(globePosition) *
        length(cloudOffset / SCENEGIS_GLOBE_CLOUD_WEATHER_SCALE) * 2.0e4;
    vec3 shapePosition = globePosition + evolution + turbulence;
    float shape = texture(
        shapeTexture,
        shapePosition / SCENEGIS_GLOBE_CLOUD_SHAPE_SCALE).r;
    #else
    // Planar wind is a translation shared with cloud/shadow reprojection.
    vec3 shapePosition = globePosition + turbulence;
    float shape = textureLod(shapeTexture,
        shapePosition / SCENEGIS_GLOBE_CLOUD_SHAPE_SCALE,
        log2(max(footprint / (SCENEGIS_GLOBE_CLOUD_SHAPE_SCALE / 128.0), 1.0))).r;
    #endif
    vec4 density = clamp(
        (weatherDensity - (1.0 - shape) * shapeAmounts) /
            max(vec4(1.0) - (1.0 - shape) * shapeAmounts, vec4(1.0e-4)),
        0.0,
        1.0);
    #ifdef SCENEGIS_GLOBE
    bool useDetail = materialMipLevel * 0.5 + (jitter - 0.5) * 0.5 < 0.5;
    #else
    // Fade subpixel erosion continuously; STBN must not toggle detail.
    detailAmounts *= 1.0 - smoothstep(
        SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE * 0.5,
        SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE, footprint);
    bool useDetail = any(greaterThan(detailAmounts, vec4(0.0)));
    #endif
    if (useDetail && any(greaterThan(detailAmounts, vec4(0.0)))) {
        #ifdef SCENEGIS_GLOBE
        float detail = texture(
            detailTexture,
            (globePosition + turbulence) /
                SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE).r;
        #else
        float detail = textureLod(detailTexture,
            (globePosition + turbulence) / SCENEGIS_GLOBE_CLOUD_DETAIL_SCALE,
            materialMipLevel).r;
        #endif
        vec4 heightBlend = clamp(
            (heightFractions - 0.2) / 0.2,
            0.0,
            1.0);
        vec4 modifier = mix(
            vec4(pow(detail, 6.0)),
            vec4(1.0 - detail),
            heightBlend) * detailAmounts;
        density = clamp(
            (density * 2.0 - modifier * 0.5) /
                max(vec4(1.0) - modifier * 0.5, vec4(1.0e-4)),
            0.0,
            1.0);
    }
    density = clamp(
        density * densityScales *
            (heightFractions * 0.75 + 0.25),
        0.0,
        1.0);
    float densitySum = dot(density, vec4(1.0));
    activeLayerHeightGradient = densitySum > 1.0e-6 ?
        dot(density, heightFractions * 0.5 + 0.5) / densitySum : 0.5;
    return max(densitySum, 0.0);
}

float sceneGISGlobeCloudDensitySample(
    sampler3D shapeTexture,
    sampler3D detailTexture,
    sampler2D weatherTexture,
    sampler2D turbulenceTexture,
    vec3 globePosition,
    vec3 globeOffset,
    vec2 cloudOffset,
    float cloudBaseHeight,
    float cloudThickness,
    float cloudCoverage,
    int cloudPreset,
    float detailStrength,
    float mipLevel,
    out float activeLayerHeightGradient)
{
    return sceneGISGlobeCloudDensitySampleInternal(
        shapeTexture,
        detailTexture,
        weatherTexture,
        turbulenceTexture,
        globePosition,
        globeOffset,
        cloudOffset,
        cloudBaseHeight,
        cloudThickness,
        cloudCoverage,
        cloudPreset,
        detailStrength,
        mipLevel,
        0.5,
        false,
        activeLayerHeightGradient);
}

float sceneGISGlobeCloudDensitySample(
    sampler3D shapeTexture,
    sampler3D detailTexture,
    sampler2D weatherTexture,
    sampler2D turbulenceTexture,
    vec3 globePosition,
    vec3 globeOffset,
    vec2 cloudOffset,
    float cloudBaseHeight,
    float cloudThickness,
    float cloudCoverage,
    int cloudPreset,
    float detailStrength,
    float mipLevel,
    float jitter,
    out float activeLayerHeightGradient)
{
    return sceneGISGlobeCloudDensitySampleInternal(
        shapeTexture,
        detailTexture,
        weatherTexture,
        turbulenceTexture,
        globePosition,
        globeOffset,
        cloudOffset,
        cloudBaseHeight,
        cloudThickness,
        cloudCoverage,
        cloudPreset,
        detailStrength,
        mipLevel,
        jitter,
        false,
        activeLayerHeightGradient);
}

float sceneGISGlobeCloudShadowDensitySample(
    sampler3D shapeTexture,
    sampler3D detailTexture,
    sampler2D weatherTexture,
    sampler2D turbulenceTexture,
    vec3 globePosition,
    vec3 globeOffset,
    vec2 cloudOffset,
    float cloudBaseHeight,
    float cloudThickness,
    float cloudCoverage,
    int cloudPreset,
    float detailStrength,
    float mipLevel,
    float jitter,
    out float activeLayerHeightGradient)
{
    return sceneGISGlobeCloudDensitySampleInternal(
        shapeTexture,
        detailTexture,
        weatherTexture,
        turbulenceTexture,
        globePosition,
        globeOffset,
        cloudOffset,
        cloudBaseHeight,
        cloudThickness,
        cloudCoverage,
        cloudPreset,
        detailStrength,
        mipLevel,
        jitter,
        true,
        activeLayerHeightGradient);
}

// Derived from takram-design-engineering/three-geospatial
// commit 9c6dfd0054f077f3ad4695b802e74d4c6a814440,
// packages/atmosphere/src/shaders/bruneton/{definitions,runtime}.glsl.
//
// Copyright (c) 2017 Eric Bruneton
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
// 3. Neither the name of the copyright holders nor the names of its contributors
//    may be used to endorse or promote products derived from this software
//    without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.
//
// Precomputed Atmospheric Scattering
// Copyright (c) 2008 INRIA
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
// 1. Redistributions of source code must retain the above copyright notice,
//    this list of conditions and the following disclaimer.
// 2. Redistributions in binary form must reproduce the above copyright notice,
//    this list of conditions and the following disclaimer in the documentation
//    and/or other materials provided with the distribution.
// 3. Neither the name of the copyright holders nor the names of its contributors
//    may be used to endorse or promote products derived from this software
//    without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
// AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
// IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
// LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
// CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
// SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
// CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
// ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
// POSSIBILITY OF SUCH DAMAGE.

const float SCENEGIS_BOTTOM_RADIUS = 6360000.0;
const float SCENEGIS_TOP_RADIUS = 6420000.0;
const float SCENEGIS_PLANAR_TOP = 60000.0;
const float SCENEGIS_PLANAR_BACKGROUND_DISTANCE = 1000000000.0;
const float SCENEGIS_SUN_ANGULAR_RADIUS = 0.004675;
const vec3 SCENEGIS_RAYLEIGH = vec3(5.802e-6, 1.3558e-5, 3.31e-5);
const vec3 SCENEGIS_MIE_EXTINCTION = vec3(4.44e-6);
const vec3 SCENEGIS_MIE_SCATTERING = vec3(3.996e-6);
const vec3 SCENEGIS_OZONE_EXTINCTION = vec3(6.5e-7, 1.881e-6, 8.5e-8);
const vec3 SCENEGIS_SOLAR_IRRADIANCE = vec3(1.474, 1.8504, 1.91198);
// Three-wavelength spectral-to-linear-sRGB factors from AtmosphereParameters.ts
// (c) 2024 Shota Matsuda, MIT; see Assets/SceneGIS/Environment/BrunetonEarth/LICENSE.txt.
// at the source commit above. Both sources use the SAME relative-luminance unit.
// Keep the CPU primary-light denominator in _SceneGISEnvironmentEffectsRenderer
// synchronized; LUT values and dimensionless transmittance remain spectral.
const vec3 SCENEGIS_SUN_RADIANCE_TO_LUMINANCE =
    vec3(98242.786222, 69954.398112, 66475.012354);
const vec3 SCENEGIS_SKY_RADIANCE_TO_LUMINANCE =
    vec3(114974.916437, 71305.954816, 65310.548555);
// Fixed daylight diffuse-white reference in cd/m^2 (ADR-0044).
// This is a shared unit conversion, independent of exposure and display mode.
const float SCENEGIS_LUMINANCE_UNIT = 40000.0;

vec3 sceneGISSunRadianceToScene(vec3 spectrum)
{
    return spectrum * (SCENEGIS_SUN_RADIANCE_TO_LUMINANCE / SCENEGIS_LUMINANCE_UNIT);
}

vec3 sceneGISSkyRadianceToScene(vec3 spectrum)
{
    return spectrum * (SCENEGIS_SKY_RADIANCE_TO_LUMINANCE / SCENEGIS_LUMINANCE_UNIT);
}

const vec3 SCENEGIS_GROUND_ALBEDO = vec3(0.1);
// Maximum finite binary16 value used by Cesium's RGBA16F HDR targets.
const float SCENEGIS_HDR_MAX = 65504.0;
const vec3 SCENEGIS_READABLE_NIGHT_SKY_IRRADIANCE =
    vec3(0.020, 0.036, 0.060);

float sceneGISReadableNightFactor(
    vec3 radialUp,
    vec3 sunDirection)
{
    return 1.0 - smoothstep(
        -0.2079116908,
        -0.1045284633,
        dot(radialUp, sunDirection));
}

vec3 sceneGISReadableNightSkyIrradiance(
    vec3 radialUp,
    vec3 sunDirection)
{
    return SCENEGIS_READABLE_NIGHT_SKY_IRRADIANCE *
        sceneGISReadableNightFactor(radialUp, sunDirection);
}

vec3 sceneGISGuardHdrStorage(vec3 sceneLinearRadiance)
{
    return clamp(
        sceneLinearRadiance,
        vec3(-SCENEGIS_HDR_MAX),
        vec3(SCENEGIS_HDR_MAX));
}

float sceneGISRayleighPhase(float cosineTheta)
{
    return 0.05968310365 * (1.0 + cosineTheta * cosineTheta);
}

float sceneGISMiePhase(float cosineTheta)
{
    const float g = 0.8;
    float denominator = max(1.0 + g * g - 2.0 * g * cosineTheta, 1.0e-4);
    return 0.1193662073 * (1.0 - g * g) * (1.0 + cosineTheta * cosineTheta) /
           ((2.0 + g * g) * pow(denominator, 1.5));
}

uniform float u_nightAmbientIntensity;

// Artistic irradiance floor, independent of Sun/Moon and display exposure.
// A component-wise C1 smooth maximum prevents colored materials from dipping
// below their deep-night level as the physical twilight spectrum changes.
vec3 sceneGISNightAmbientIrradiance(vec3 physicalSky, float hemisphere)
{
    if (u_nightAmbientIntensity == 0.0 || hemisphere <= 0.0) {
        return vec3(0.0);
    }
    vec3 floorIrradiance = SCENEGIS_READABLE_NIGHT_SKY_IRRADIANCE *
        (u_nightAmbientIntensity * hemisphere);
    vec3 ratio = max(physicalSky, vec3(0.0)) / floorIrradiance;
    vec3 shoulder = max(vec3(0.25) - abs(ratio - vec3(1.0)), vec3(0.0));
    return floorIrradiance * (max(vec3(1.0) - ratio, vec3(0.0)) +
        shoulder * shoulder);
}

#ifdef SCENEGIS_GLOBE
// Match the cold-build atlas in SceneGISGlobeDiffuseIrradianceFS and the renderer.
const float SCENEGIS_DIFFUSE_HEIGHTS = 16.0;
const float SCENEGIS_DIFFUSE_SUNS = 65.0;
const float SCENEGIS_DIFFUSE_NORMALS = 17.0;
const float SCENEGIS_DIFFUSE_AZIMUTHS = 9.0;

vec3 sceneGISGlobeDirectionalSkyIrradiance(
    sampler2D irradianceTexture,
    vec3 point,
    vec3 normal,
    vec3 sunDirection)
{
    float radius = length(point);
    vec3 up = point / radius;
    float sunCosine = clamp(dot(up, sunDirection), -1.0, 1.0);
    float normalCosine = clamp(dot(up, normal), -1.0, 1.0);
    float projectedLength = sqrt(max(
        (1.0 - sunCosine * sunCosine) * (1.0 - normalCosine * normalCosine),
        1.0e-12));
    float azimuthCosine = clamp(
        (dot(normal, sunDirection) - normalCosine * sunCosine) / projectedLength,
        -1.0, 1.0);
    float heightIndex = sqrt(clamp((radius - 6360.0) / 60.0, 0.0, 1.0)) *
        (SCENEGIS_DIFFUSE_HEIGHTS - 1.0);
    float azimuthIndex = acos(azimuthCosine) / czm_pi *
        (SCENEGIS_DIFFUSE_AZIMUTHS - 1.0);
    // The source LUT stops at mu_s = -0.5. Spend half the samples on twilight.
    float sunUnit = sign(sunCosine) *
        sqrt(abs(sunCosine) / (sunCosine < 0.0 ? 0.5 : 1.0));
    float sunIndex = clamp(0.5 + 0.5 * sunUnit, 0.0, 1.0) *
        (SCENEGIS_DIFFUSE_SUNS - 1.0);
    float normalIndex = acos(normalCosine) / czm_pi *
        (SCENEGIS_DIFFUSE_NORMALS - 1.0);
    vec2 base = floor(vec2(azimuthIndex, heightIndex));
    vec2 fraction = fract(vec2(azimuthIndex, heightIndex));
    vec2 dimensions = vec2(textureSize(irradianceTexture, 0));
    vec3 irradiance = vec3(0.0);
    for (int y = 0; y < 2; ++y) {
        for (int x = 0; x < 2; ++x) {
            vec2 corner = vec2(float(x), float(y));
            vec2 tile = min(base + corner, vec2(
                SCENEGIS_DIFFUSE_AZIMUTHS - 1.0, SCENEGIS_DIFFUSE_HEIGHTS - 1.0));
            vec2 weights = mix(vec2(1.0) - fraction, fraction, corner);
            vec2 pixel = vec2(
                64.0 + tile.x * SCENEGIS_DIFFUSE_SUNS + sunIndex,
                tile.y * SCENEGIS_DIFFUSE_NORMALS + normalIndex);
            irradiance += texture(irradianceTexture, (pixel + 0.5) / dimensions).rgb *
                weights.x * weights.y;
        }
    }
    return irradiance;
}

// Convert once, before mixing direct/diffuse light with RGB materials or lights.
vec3 sceneGISGlobeSunAndSkyIrradiance(
    AtmosphereParameters atmosphere,
    sampler2D transmittanceTexture,
    sampler2D irradianceTexture,
    vec3 point,
    vec3 normal,
    vec3 sunDirection,
    out vec3 sky)
{
    vec3 sun = GetSunAndSkyIrradiance(atmosphere, transmittanceTexture,
        irradianceTexture, point, normal, sunDirection, sky);
    sky = sceneGISSkyRadianceToScene(sceneGISGlobeDirectionalSkyIrradiance(
        irradianceTexture, point, normal, sunDirection));
    return sceneGISSunRadianceToScene(sun);
}

vec3 sceneGISGlobeSunAndSkyScalarIrradiance(
    AtmosphereParameters atmosphere,
    sampler2D transmittanceTexture,
    sampler2D irradianceTexture,
    vec3 point,
    vec3 sunDirection,
    out vec3 sky)
{
    vec3 sun = GetSunAndSkyScalarIrradiance(atmosphere, transmittanceTexture,
        irradianceTexture, point, sunDirection, sky);
    sky = sceneGISSkyRadianceToScene(sky);
    return sceneGISSunRadianceToScene(sun);
}

AtmosphereParameters sceneGISAtmosphereParameters()
{
    AtmosphereParameters atmosphere;
    atmosphere.solar_irradiance = SCENEGIS_SOLAR_IRRADIANCE;
    atmosphere.sun_angular_radius = SCENEGIS_SUN_ANGULAR_RADIUS;
    atmosphere.bottom_radius = 6360.0;
    atmosphere.top_radius = 6420.0;
    atmosphere.rayleigh_density.layers[0] = DensityProfileLayer(0.0, 0.0, 0.0, 0.0, 0.0);
    atmosphere.rayleigh_density.layers[1] = DensityProfileLayer(0.0, 1.0, -0.125, 0.0, 0.0);
    atmosphere.rayleigh_scattering = vec3(0.005802, 0.013558, 0.0331);
    atmosphere.mie_density.layers[0] = DensityProfileLayer(0.0, 0.0, 0.0, 0.0, 0.0);
    atmosphere.mie_density.layers[1] = DensityProfileLayer(0.0, 1.0, -0.833333, 0.0, 0.0);
    atmosphere.mie_scattering = vec3(0.003996);
    atmosphere.mie_extinction = vec3(0.00444);
    atmosphere.mie_phase_function_g = 0.8;
    atmosphere.absorption_density.layers[0] =
        DensityProfileLayer(25.0, 0.0, 0.0, 1.0 / 15.0, -2.0 / 3.0);
    atmosphere.absorption_density.layers[1] =
        DensityProfileLayer(0.0, 0.0, 0.0, -1.0 / 15.0, 8.0 / 3.0);
    atmosphere.absorption_extinction = vec3(0.00065, 0.001881, 0.000085);
    atmosphere.ground_albedo = vec3(0.1);
    atmosphere.mu_s_min = -0.5;
    return atmosphere;
}

vec3 sceneGISGlobeGroundIrradiance(
    sampler2D transmittanceTexture,
    sampler2D irradianceTexture,
    vec3 up,
    vec3 sunDirection,
    vec3 primaryDirection,
    vec3 primaryScale,
    float cloudTransmittance)
{
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 ground = up * atmosphere.bottom_radius;
    vec3 sky;
    vec3 unusedSun = sceneGISGlobeSunAndSkyIrradiance(atmosphere,
        transmittanceTexture, irradianceTexture, ground, up, sunDirection, sky);
    vec3 unusedSky;
    vec3 direct = sceneGISGlobeSunAndSkyIrradiance(atmosphere,
        transmittanceTexture, irradianceTexture, ground, up, primaryDirection, unusedSky);
    sky += sceneGISNightAmbientIrradiance(sky, 1.0);
    // A Lambertian lower hemisphere: radiance = albedo * irradiance / pi.
    // The receiver's cosine integral supplies pi; its hemisphere weight is separate.
    return SCENEGIS_GROUND_ALBEDO * (sky + direct *
        max(primaryScale, vec3(0.0)) * cloudTransmittance);
}

float sceneGISGlobeGroundWeight(vec3 position, vec3 normal)
{
    float radius = max(length(position), SCENEGIS_BOTTOM_RADIUS);
    float ratio = SCENEGIS_BOTTOM_RADIUS / radius;
    return clamp(0.5 * (1.0 - dot(normal, normalize(position))), 0.0, 1.0) *
        ratio * ratio;
}

vec3 sceneGISGlobeSkyRadiance(
    sampler2D transmittanceTexture,
    sampler3D scatteringTexture,
    vec3 rayOrigin,
    vec3 viewDirection,
    vec3 sunDirection,
    float shadowLength,
    out vec3 transmittance)
{
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 camera = vec3(
        rayOrigin.xy * 0.001,
        atmosphere.bottom_radius + rayOrigin.z * 0.001);
    return sceneGISSkyRadianceToScene(max(GetSkyRadiance(
        atmosphere,
        transmittanceTexture,
        scatteringTexture,
        scatteringTexture,
        camera,
        viewDirection,
        max(shadowLength, 0.0) * 0.001,
        sunDirection,
        true,
        transmittance), vec3(0.0)));
}

vec3 sceneGISGlobeSkyRadianceToPoint(
    sampler2D transmittanceTexture,
    sampler3D scatteringTexture,
    vec3 rayOrigin,
    vec3 viewDirection,
    vec3 sunDirection,
    float distanceToPoint,
    float shadowLength,
    out vec3 transmittance)
{
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 camera = vec3(
        rayOrigin.xy * 0.001,
        atmosphere.bottom_radius + rayOrigin.z * 0.001);
    // Keep meter-scale height and ray length separate from the planet radius.
    float localHeight = rayOrigin.z * 0.001;
    float height = (dot(camera.xy, camera.xy) + localHeight *
        (2.0 * atmosphere.bottom_radius + localHeight)) /
        (length(camera) + atmosphere.bottom_radius);
    return sceneGISSkyRadianceToScene(max(GetSkyRadianceAlongRay(
        atmosphere,
        transmittanceTexture,
        scatteringTexture,
        scatteringTexture,
        camera,
        height,
        viewDirection,
        max(distanceToPoint, 0.0) * 0.001,
        max(shadowLength, 0.0) * 0.001,
        sunDirection,
        transmittance), vec3(0.0)));
}
#endif

#ifdef SCENEGIS_GLOBE
vec3 sceneGISGlobeAerialRadianceToPoint(
    sampler2D transmittanceTexture,
    sampler3D scatteringTexture,
    vec3 rayOrigin,
    vec3 viewDirection,
    vec3 sunDirection,
    float distanceToPoint,
    float shadowLength,
    float distanceScale,
    out vec3 transmittance)
{
    if (distanceScale == 1.0) {
        return sceneGISGlobeSkyRadianceToPoint(transmittanceTexture,
            scatteringTexture, rayOrigin, viewDirection, sunDirection,
            distanceToPoint, shadowLength, transmittance);
    }
    transmittance = vec3(1.0);
    if (distanceScale == 0.0 || distanceToPoint <= 0.0) {
        return vec3(0.0);
    }
    // Exclude the initial vacuum before shortening the atmospheric segment.
    vec3 camera = vec3(rayOrigin.xy, SCENEGIS_BOTTOM_RADIUS + rayOrigin.z);
    float radius = length(camera);
    float top = sceneGISAtmosphereParameters().top_radius * 1000.0;
    if (radius > top) {
        float rmu = dot(camera, viewDirection);
        float discriminant = rmu * rmu + (top - radius) * (top + radius);
        if (rmu >= 0.0 || discriminant < 0.0) {
            return vec3(0.0);
        }
        float entry = -rmu - sqrt(discriminant);
        if (entry >= distanceToPoint) {
            return vec3(0.0);
        }
        rayOrigin += viewDirection * entry;
        distanceToPoint -= entry;
    }
    return sceneGISGlobeSkyRadianceToPoint(transmittanceTexture,
        scatteringTexture, rayOrigin, viewDirection, sunDirection,
        distanceToPoint * distanceScale,
        min(max(shadowLength, 0.0), distanceToPoint) * distanceScale,
        transmittance);
}
#endif

float sceneGISPlanarSignedSquareCoordinate(float cosineValue)
{
    float value = clamp(cosineValue, -1.0, 1.0);
    return 0.5 + 0.5 * sign(value) * sqrt(abs(value));
}

float sceneGISPlanarHeightCoordinate(float height)
{
    return sqrt(clamp(height / SCENEGIS_PLANAR_TOP, 0.0, 1.0));
}

vec3 sceneGISPlanarTransmittanceToBoundary(
    sampler2D transmittanceTexture,
    float height,
    float viewZenithCosine)
{
    return texture(transmittanceTexture, vec2(
        sceneGISPlanarSignedSquareCoordinate(viewZenithCosine),
        sceneGISPlanarHeightCoordinate(height))).rgb;
}

float sceneGISPlanarDensity(float height, float scaleHeight)
{
    return exp(-max(height, 0.0) / scaleHeight);
}

float sceneGISPlanarOzoneDensity(float height)
{
    return max(1.0 - abs(height - 25000.0) / 15000.0, 0.0);
}

float sceneGISPlanarExponentialIntegral(
    float startHeight,
    float endHeight,
    float viewZenithCosine,
    float distance,
    float scaleHeight)
{
    if (abs(viewZenithCosine) < 1.0e-8) {
        return sceneGISPlanarDensity(startHeight, scaleHeight) * distance;
    }
    return scaleHeight * abs(
        exp(-startHeight / scaleHeight) - exp(-endHeight / scaleHeight)) /
        abs(viewZenithCosine);
}

float sceneGISPlanarOzoneIntegralToTop(float height)
{
    float clampedHeight = clamp(height, 10000.0, 40000.0);
    if (clampedHeight < 25000.0) {
        float offset = clampedHeight - 10000.0;
        return 15000.0 - offset * offset / 30000.0;
    }
    float offset = 40000.0 - clampedHeight;
    return offset * offset / 30000.0;
}

float sceneGISPlanarOzoneIntegral(
    float startHeight,
    float endHeight,
    float viewZenithCosine,
    float distance)
{
    if (abs(viewZenithCosine) < 1.0e-8) {
        return sceneGISPlanarOzoneDensity(startHeight) * distance;
    }
    return abs(
        sceneGISPlanarOzoneIntegralToTop(startHeight) -
        sceneGISPlanarOzoneIntegralToTop(endHeight)) /
        abs(viewZenithCosine);
}

vec3 sceneGISPlanarSegmentTransmittance(
    float startHeight,
    float viewZenithCosine,
    float distance)
{
    float segmentDistance = max(distance, 0.0);
    float endHeight = clamp(
        startHeight + viewZenithCosine * segmentDistance,
        0.0,
        SCENEGIS_PLANAR_TOP);
    float rayleighDepth = sceneGISPlanarExponentialIntegral(
        startHeight, endHeight, viewZenithCosine, segmentDistance, 8000.0);
    float mieDepth = sceneGISPlanarExponentialIntegral(
        startHeight, endHeight, viewZenithCosine, segmentDistance, 1200.0);
    float ozoneDepth = sceneGISPlanarOzoneIntegral(
        startHeight, endHeight, viewZenithCosine, segmentDistance);
    return exp(-(
        SCENEGIS_RAYLEIGH * rayleighDepth +
        SCENEGIS_MIE_EXTINCTION * mieDepth +
        SCENEGIS_OZONE_EXTINCTION * ozoneDepth));
}

vec3 sceneGISPlanarScatteringTexel(
    sampler3D scatteringTexture,
    float sunIndex,
    float scatteringIndex,
    float viewCoordinate,
    float heightCoordinate)
{
    float packedX = (sunIndex * 8.0 + scatteringIndex + 0.5) / 256.0;
    return texture(scatteringTexture, vec3(
        packedX, viewCoordinate, heightCoordinate)).rgb;
}

vec3 sceneGISPlanarScatteringToBoundary(
    sampler3D scatteringTexture,
    float height,
    float viewZenithCosine,
    float sunZenithCosine,
    float scatteringCosine)
{
    float sunPosition = clamp(
        sceneGISPlanarSignedSquareCoordinate(sunZenithCosine) * 32.0 - 0.5,
        0.0,
        31.0);
    float scatteringPosition = clamp(
        (clamp(scatteringCosine, -1.0, 1.0) + 1.0) * 4.0 - 0.5,
        0.0,
        7.0);
    float sun0 = floor(sunPosition);
    float sun1 = min(sun0 + 1.0, 31.0);
    float scattering0 = floor(scatteringPosition);
    float scattering1 = min(scattering0 + 1.0, 7.0);
    float sunMix = sunPosition - sun0;
    float scatteringMix = scatteringPosition - scattering0;
    float viewCoordinate = sceneGISPlanarSignedSquareCoordinate(viewZenithCosine);
    float heightCoordinate = sceneGISPlanarHeightCoordinate(height);
    vec3 lower = mix(
        sceneGISPlanarScatteringTexel(
            scatteringTexture, sun0, scattering0, viewCoordinate, heightCoordinate),
        sceneGISPlanarScatteringTexel(
            scatteringTexture, sun0, scattering1, viewCoordinate, heightCoordinate),
        scatteringMix);
    vec3 upper = mix(
        sceneGISPlanarScatteringTexel(
            scatteringTexture, sun1, scattering0, viewCoordinate, heightCoordinate),
        sceneGISPlanarScatteringTexel(
            scatteringTexture, sun1, scattering1, viewCoordinate, heightCoordinate),
        scatteringMix);
    return mix(lower, upper, sunMix);
}

vec3 sceneGISPlanarIrradiance(
    sampler2D irradianceTexture,
    float height,
    float sunZenithCosine)
{
    return texture(irradianceTexture, vec2(
        sceneGISPlanarSignedSquareCoordinate(sunZenithCosine),
        sceneGISPlanarHeightCoordinate(height))).rgb;
}

// The flat LUT stores total horizontal spectral irradiance, including the Sun.
vec3 sceneGISPlanarSkyIrradianceTexel(sampler2D irradianceTexture, ivec2 texel)
{
    vec2 coordinate = (vec2(texel) + 0.5) / vec2(textureSize(irradianceTexture, 0));
    float height = SCENEGIS_PLANAR_TOP * coordinate.y * coordinate.y;
    float signedSun = 2.0 * coordinate.x - 1.0;
    float sunMu = sign(signedSun) * signedSun * signedSun;
    vec3 direct = vec3(0.0);
    if (sunMu > 0.0) {
        // Match the generator at this texel, not the finer transmittance grid.
        direct = SCENEGIS_SOLAR_IRRADIANCE * sunMu *
            sceneGISPlanarSegmentTransmittance(height, sunMu,
                (SCENEGIS_PLANAR_TOP - height) / sunMu);
    }
    return max(texelFetch(irradianceTexture, texel, 0).rgb - direct, vec3(0.0));
}

vec3 sceneGISPlanarSkyIrradiance(sampler2D irradianceTexture, float height, float sunMu)
{
    vec2 size = vec2(textureSize(irradianceTexture, 0));
    vec2 coordinate = vec2(sceneGISPlanarSignedSquareCoordinate(sunMu),
        sceneGISPlanarHeightCoordinate(height));
    vec2 samplePosition = clamp(coordinate * size - 0.5, vec2(0.0), size - 1.0);
    ivec2 lower = ivec2(floor(samplePosition));
    ivec2 upper = min(lower + 1, ivec2(size) - 1);
    vec2 blend = fract(samplePosition);
    return mix(
        mix(sceneGISPlanarSkyIrradianceTexel(irradianceTexture, lower),
            sceneGISPlanarSkyIrradianceTexel(irradianceTexture, ivec2(upper.x, lower.y)), blend.x),
        mix(sceneGISPlanarSkyIrradianceTexel(irradianceTexture, ivec2(lower.x, upper.y)),
            sceneGISPlanarSkyIrradianceTexel(irradianceTexture, upper), blend.x), blend.y);
}

// Split at the stored sample positions before interpolation and RGB conversion.
vec3 sceneGISPlanarSunAndSkyIrradiance(
    sampler2D transmittanceTexture,
    sampler2D irradianceTexture,
    float height,
    float sunZenithCosine,
    out vec3 sky)
{
    vec3 beam = sunZenithCosine > 0.0 ? SCENEGIS_SOLAR_IRRADIANCE *
        sceneGISPlanarTransmittanceToBoundary(
            transmittanceTexture, height, sunZenithCosine) : vec3(0.0);
    sky = sceneGISSkyRadianceToScene(sceneGISPlanarSkyIrradiance(
        irradianceTexture, height, sunZenithCosine));
    return sceneGISSunRadianceToScene(beam);
}

bool sceneGISPlanarSlabSegment(
    vec3 rayOrigin,
    vec3 viewDirection,
    float maximumDistance,
    out float segmentStart,
    out float segmentEnd)
{
    float distanceLimit = max(maximumDistance, 0.0);
    if (abs(viewDirection.z) < 1.0e-6) {
        segmentStart = 0.0;
        segmentEnd = distanceLimit;
        return rayOrigin.z >= 0.0 && rayOrigin.z <= SCENEGIS_PLANAR_TOP && segmentEnd > 0.0;
    }
    float first = -rayOrigin.z / viewDirection.z;
    float second = (SCENEGIS_PLANAR_TOP - rayOrigin.z) / viewDirection.z;
    segmentStart = max(min(first, second), 0.0);
    segmentEnd = min(max(first, second), distanceLimit);
    if (segmentEnd <= segmentStart) {
        return false;
    }
    // Analytic transport has constant cost; retain the complete dense lower path.
    return segmentEnd > segmentStart;
}

vec3 sceneGISPlanarRadianceToPoint(
    sampler2D transmittanceTexture,
    sampler3D scatteringTexture,
    sampler2D irradianceTexture,
    vec3 rayOrigin,
    vec3 viewDirection,
    vec3 sunDirection,
    float maximumDistance,
    bool includeGround,
    out bool intersectsAtmosphere,
    out vec3 transmittance)
{
    float segmentStart;
    float segmentEnd;
    if (!sceneGISPlanarSlabSegment(
            rayOrigin, viewDirection, maximumDistance, segmentStart, segmentEnd)) {
        intersectsAtmosphere = false;
        transmittance = vec3(1.0);
        return vec3(0.0);
    }
    intersectsAtmosphere = true;
    float segmentStartHeight = rayOrigin.z + viewDirection.z * segmentStart;
    float segmentEndHeight = rayOrigin.z + viewDirection.z * segmentEnd;
    float segmentDistance = segmentEnd - segmentStart;
    if (abs(viewDirection.z) >= 1.0e-6) {
        // Keep clipped boundaries exact instead of subtracting the vacuum path.
        // At orbital distances that cancellation can move the ground by meters.
        segmentStartHeight = clamp(rayOrigin.z, 0.0, SCENEGIS_PLANAR_TOP);
        float exitHeight = viewDirection.z < 0.0 ? 0.0 : SCENEGIS_PLANAR_TOP;
        float exitDistance = (exitHeight - rayOrigin.z) / viewDirection.z;
        if (maximumDistance >= exitDistance) {
            segmentEndHeight = exitHeight;
            segmentDistance = (segmentEndHeight - segmentStartHeight) / viewDirection.z;
        }
    }
    float cosineTheta = dot(viewDirection, sunDirection);
    transmittance = sceneGISPlanarSegmentTransmittance(
        segmentStartHeight, viewDirection.z, segmentDistance);
    vec3 startRadiance = sceneGISPlanarScatteringToBoundary(
        scatteringTexture,
        segmentStartHeight,
        viewDirection.z,
        sunDirection.z,
        cosineTheta);
    vec3 endRadiance = sceneGISPlanarScatteringToBoundary(
        scatteringTexture,
        segmentEndHeight,
        viewDirection.z,
        sunDirection.z,
        cosineTheta);
    vec3 radiance = sceneGISSkyRadianceToScene(
        max(startRadiance - transmittance * endRadiance, vec3(0.0)));
    if (includeGround && viewDirection.z < 0.0 && segmentEndHeight <= 1.0) {
        vec3 sky;
        vec3 beam = sceneGISPlanarSunAndSkyIrradiance(
            transmittanceTexture, irradianceTexture, 0.0, sunDirection.z, sky);
        radiance += transmittance * SCENEGIS_GROUND_ALBEDO *
            (beam * max(sunDirection.z, 0.0) + sky) / czm_pi;
    }
    return max(radiance, vec3(0.0));
}

vec3 sceneGISApplySunDisk(vec3 radiance, vec3 viewDirection, vec3 sunDirection, vec3 transmittance)
{
    float disk = smoothstep(
        cos(SCENEGIS_SUN_ANGULAR_RADIUS * 1.25),
        cos(SCENEGIS_SUN_ANGULAR_RADIUS),
        dot(viewDirection, sunDirection));
    float horizonVisibility = sunDirection.z > 0.0 ? 1.0 : 0.0;
    #ifdef SCENEGIS_GLOBE
    horizonVisibility = 1.0;
    #endif
    vec3 solarRadiance = sceneGISSunRadianceToScene(SCENEGIS_SOLAR_IRRADIANCE) /
        (czm_pi * SCENEGIS_SUN_ANGULAR_RADIUS * SCENEGIS_SUN_ANGULAR_RADIUS);
    return radiance + horizonVisibility * disk * solarRadiance * transmittance;
}

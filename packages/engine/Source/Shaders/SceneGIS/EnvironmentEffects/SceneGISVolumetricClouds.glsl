const float SCENEGIS_CLOUD_MAX_DISTANCE = 300000.0;
const float SCENEGIS_CLOUD_VISIBLE_START = 60000.0;
const float SCENEGIS_CLOUD_VISIBLE_END = 100000.0;
const float SCENEGIS_CLOUD_DISTANCE_ENCODING = 1000000.0;
const float SCENEGIS_CLOUD_SHAPE_SCALE = 12000.0;
const float SCENEGIS_CLOUD_DETAIL_SCALE = 2000.0;
const float SCENEGIS_CLOUD_WEATHER_SCALE = 240000.0;

vec3 sceneGISGlobeCloudSurfaceAnchor(vec3 geodeticSurfaceNormal)
{
    return normalize(geodeticSurfaceNormal) * SCENEGIS_BOTTOM_RADIUS;
}

bool sceneGISIsClearResolvedDepth(float rawDepth)
{
    return rawDepth == 0.0 || rawDepth == 1.0;
}
const int SCENEGIS_CLOUD_PRIMARY_MAX_STEPS = 64;
const int SCENEGIS_CLOUD_FINE_MAX_STEPS = 4;
const int SCENEGIS_CLOUD_SUN_MAX_STEPS = 4;

bool sceneGISCloudSphereInterval(
    vec3 rayOrigin,
    vec3 rayDirection,
    float radius,
    out float nearDistance,
    out float farDistance)
{
    float projected = dot(rayOrigin, rayDirection);
    float discriminant = projected * projected - dot(rayOrigin, rayOrigin) + radius * radius;
    if (discriminant < 0.0) {
        return false;
    }
    float root = sqrt(max(discriminant, 0.0));
    nearDistance = -projected - root;
    farDistance = -projected + root;
    return farDistance > 0.0;
}

bool sceneGISCloudSegment(
    vec3 rayOrigin,
    vec3 rayDirection,
    float maximumDistance,
    float cloudBaseHeight,
    float cloudThickness,
    out float segmentStart,
    out float segmentEnd)
{
    if (cloudThickness <= 0.0 || maximumDistance <= 0.0) {
        return false;
    }
    #ifdef SCENEGIS_GLOBE
    vec3 virtualOrigin = vec3(
        rayOrigin.xy, SCENEGIS_BOTTOM_RADIUS + rayOrigin.z);
    float innerRadius = SCENEGIS_BOTTOM_RADIUS + cloudBaseHeight;
    float outerRadius = innerRadius + cloudThickness;
    float outerNear;
    float outerFar;
    if (!sceneGISCloudSphereInterval(
            virtualOrigin, rayDirection, outerRadius, outerNear, outerFar)) {
        return false;
    }
    segmentStart = max(outerNear, 0.0);
    segmentEnd = min(outerFar, maximumDistance);
    float innerNear;
    float innerFar;
    if (sceneGISCloudSphereInterval(
            virtualOrigin, rayDirection, innerRadius, innerNear, innerFar)) {
        if (length(virtualOrigin) < innerRadius) {
            segmentStart = max(segmentStart, innerFar);
        } else if (innerNear > segmentStart) {
            segmentEnd = min(segmentEnd, innerNear);
        }
    }
    #else
    float bottom = cloudBaseHeight;
    float top = cloudBaseHeight + cloudThickness;
    if (abs(rayDirection.z) < 1.0e-7) {
        if (rayOrigin.z < bottom || rayOrigin.z > top) {
            return false;
        }
        segmentStart = 0.0;
        segmentEnd = maximumDistance;
    } else {
        float first = (bottom - rayOrigin.z) / rayDirection.z;
        float second = (top - rayOrigin.z) / rayDirection.z;
        segmentStart = max(min(first, second), 0.0);
        segmentEnd = min(max(first, second), maximumDistance);
    }
    #endif
    segmentEnd = min(segmentEnd, segmentStart + SCENEGIS_CLOUD_MAX_DISTANCE);
    segmentEnd = min(segmentEnd, segmentStart + SCENEGIS_CLOUD_VISIBLE_END);
    return segmentEnd > segmentStart;
}

vec2 sceneGISCloudMaterialOrigin(
    vec3 worldCameraPosition,
    vec3 worldVertical)
{
    #ifdef SCENEGIS_GLOBE
    vec3 geodeticNormal = normalize(worldVertical);
    float longitude = atan(geodeticNormal.y, geodeticNormal.x);
    float latitude = asin(clamp(geodeticNormal.z, -1.0, 1.0));
    return vec2(
        longitude * SCENEGIS_BOTTOM_RADIUS,
        latitude * SCENEGIS_BOTTOM_RADIUS);
    #else
    return worldCameraPosition.xy;
    #endif
}

float sceneGISCloudHeightFraction(
    vec3 localPosition,
    float cloudBaseHeight,
    float cloudThickness)
{
    #ifdef SCENEGIS_GLOBE
    vec3 virtualPosition = vec3(
        localPosition.xy, SCENEGIS_BOTTOM_RADIUS + localPosition.z);
    float height = length(virtualPosition) - SCENEGIS_BOTTOM_RADIUS;
    #else
    float height = localPosition.z;
    #endif
    return clamp((height - cloudBaseHeight) / max(cloudThickness, 1.0), 0.0, 1.0);
}

vec4 sceneGISCloudLayerDescriptor(int preset, int layer)
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

vec4 sceneGISCloudLayerProfile(int preset, int layer)
{
    if (preset == 1 || (preset == 3 && layer == 1)) {
        return vec4(0.01, 0.06, 0.90, 0.99);
    }
    if (preset == 2 || (preset == 3 && layer == 2)) {
        return vec4(0.02, 0.12, 0.88, 0.99);
    }
    return vec4(0.02, 0.16, 0.62, 0.98);
}

vec4 sceneGISCloudMorphologyParameters(int preset, int layer)
{
    if (preset == 1 || (preset == 3 && layer == 1)) {
        return vec4(22000.0, 2800.0, 0.48, 0.18);
    }
    if (preset == 2 || (preset == 3 && layer == 2)) {
        return vec4(30000.0, 900.0, 0.48, 0.16);
    }
    if (preset == 3) {
        return vec4(13000.0, 1200.0, 0.53, 0.15);
    }
    return vec4(10000.0, 900.0, 0.56, 0.16);
}

vec2 sceneGISCloudMorphologyAnisotropy(int preset, int layer)
{
    if (preset == 1 || (preset == 3 && layer == 1)) {
        return vec2(0.55, 1.25);
    }
    if (preset == 2 || (preset == 3 && layer == 2)) {
        return vec2(0.28, 2.4);
    }
    return preset == 3 ? vec2(0.85, 1.1) : vec2(1.0);
}

float sceneGISCloudDetailErosion(int preset, int layer)
{
    if (preset == 1 || (preset == 3 && layer == 1)) {
        return 0.55;
    }
    if (preset == 2 || (preset == 3 && layer == 2)) {
        return 0.65;
    }
    return preset == 3 ? 0.80 : 0.90;
}

void sceneGISCloudPresetSupport(
    int preset,
    float cloudBaseHeight,
    float cloudThickness,
    out float supportBaseHeight,
    out float supportThickness)
{
    float supportTopHeight = cloudBaseHeight;
    supportBaseHeight = cloudBaseHeight + cloudThickness;
    for (int layer = 0; layer < 4; ++layer) {
        vec4 descriptor = sceneGISCloudLayerDescriptor(preset, layer);
        if (descriptor.z <= 0.0) {
            continue;
        }
        float layerBaseHeight = cloudBaseHeight + descriptor.x;
        float layerTopHeight = layerBaseHeight + cloudThickness * descriptor.y;
        supportBaseHeight = min(supportBaseHeight, layerBaseHeight);
        supportTopHeight = max(supportTopHeight, layerTopHeight);
    }
    supportThickness = max(supportTopHeight - supportBaseHeight, 0.0);
}

vec2 sceneGISCloudWeatherParameters(int preset, int layer)
{
    if (preset == 0) {
        return vec2(2.2, 0.04);
    }
    if (preset == 1) {
        return vec2(0.75, 0.12);
    }
    if (preset == 2) {
        return vec2(2.0, 0.035);
    }
    if (layer == 0) {
        return vec2(1.7, 0.04);
    }
    if (layer == 1) {
        return vec2(0.8, 0.10);
    }
    return vec2(2.2, 0.03);
}

float sceneGISCloudDensitySample(
    sampler3D shapeTexture,
    sampler3D detailTexture,
    sampler2D weatherTexture,
    sampler3D turbulenceTexture,
    vec3 localPosition,
    vec3 globePosition,
    vec3 globeOffset,
    vec2 materialOrigin,
    vec2 cloudOffset,
    float cloudBaseHeight,
    float cloudThickness,
    float cloudCoverage,
    int cloudPreset,
    float detailStrength,
    float footprintMeters,
    out float activeLayerHeightGradient)
{
    #ifdef SCENEGIS_GLOBE
    return sceneGISGlobeCloudDensitySample(
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
        footprintMeters,
        activeLayerHeightGradient);
    #else
    float materialHeight = localPosition.z;
    vec3 texturePosition = vec3(
        materialOrigin + localPosition.xy + cloudOffset,
        materialHeight);
    float turbulenceLod = clamp(
        log2(max(footprintMeters / 250.0, 1.0)), 0.0, 6.0);
    vec3 turbulence = (textureLod(
        turbulenceTexture, texturePosition / 16000.0, turbulenceLod).rgb -
        vec3(128.0 / 255.0)) *
        (255.0 / 127.0);
    texturePosition += turbulence * 700.0;
    // Density sampling runs inside a dynamically bounded march. Use an
    // explicit base level so weather lookup never depends on undefined
    // implicit derivatives from non-uniform control flow.
    vec4 weather = textureLod(
        weatherTexture,
        texturePosition.xy / SCENEGIS_CLOUD_WEATHER_SCALE,
        0.0);
    float accumulated = 0.0;
    float accumulatedHeightGradient = 0.0;
    for (int layer = 0; layer < 4; ++layer) {
        vec4 descriptor = sceneGISCloudLayerDescriptor(cloudPreset, layer);
        if (descriptor.z <= 0.0) {
            continue;
        }
        float layerBase = cloudBaseHeight + descriptor.x;
        float layerThickness = cloudThickness * descriptor.y;
        float heightFraction = sceneGISCloudHeightFraction(
            localPosition, layerBase, layerThickness);
        vec4 profile = sceneGISCloudLayerProfile(cloudPreset, layer);
        float heightProfile = smoothstep(profile.x, profile.y, heightFraction) *
            (1.0 - smoothstep(profile.z, profile.w, heightFraction));
        float weatherValue = layer == 0 ? weather.r :
            (layer == 1 ? weather.g : weather.b);
        float localCoverageValue = clamp(cloudCoverage + descriptor.w, 0.0, 1.0);
        vec2 weatherParameters = sceneGISCloudWeatherParameters(cloudPreset, layer);
        float weatherExponent = weatherParameters.x;
        float coverageThreshold = 1.0 - localCoverageValue;
        float weatherSignal = pow(max(weatherValue, 0.0), weatherExponent);
        float localCoverage = cloudCoverage <= 0.0 ? 0.0 : smoothstep(
            coverageThreshold - weatherParameters.y,
            coverageThreshold + weatherParameters.y,
            weatherSignal);
        vec4 morphology = sceneGISCloudMorphologyParameters(
            cloudPreset, layer);
        vec2 morphologyAnisotropy = sceneGISCloudMorphologyAnisotropy(
            cloudPreset, layer);
        float shapeScale = morphology.x;
        vec3 layerPosition = texturePosition;
        layerPosition.z = heightFraction * layerThickness;
        vec3 shapePosition = layerPosition;
        shapePosition.xy *= morphologyAnisotropy;
        float shapeTexelMeters = shapeScale / 128.0;
        float shapeLod = clamp(
            log2(max(footprintMeters / shapeTexelMeters, 1.0)), 0.0, 7.0);
        vec4 shape = textureLod(
            shapeTexture, shapePosition / shapeScale, shapeLod);
        float fbm = dot(shape.gba, vec3(0.625, 0.25, 0.125));
        float baseShape = clamp(
            (shape.r - (1.0 - fbm) * 0.15) /
            max(0.85 + fbm * 0.15, 1.0e-3), 0.0, 1.0);
        float density = smoothstep(
            morphology.z, morphology.z + morphology.w, baseShape) *
            localCoverage * heightProfile;
        if (density > 1.0e-4 && detailStrength > 0.0) {
            float qualityDetailScale = detailStrength > 0.9 ? 0.5 : 3.0;
            float detailScale = morphology.y * qualityDetailScale;
            float detailTexelMeters = detailScale / 64.0;
            float detailLod = clamp(
                log2(max(footprintMeters / detailTexelMeters, 1.0)),
                0.0,
                6.0);
            vec4 detail = textureLod(
                detailTexture,
                vec3(
                    layerPosition.xy * morphologyAnisotropy.yx,
                    layerPosition.z) / detailScale,
                detailLod);
            float erosion = dot(detail.rgb, vec3(0.5, 0.3, 0.2));
            float erosionAmount = sceneGISCloudDetailErosion(
                cloudPreset, layer) * detailStrength;
            density = clamp(
                (density - (1.0 - erosion) * erosionAmount) /
                    max(1.0 - erosionAmount, 1.0e-3),
                0.0,
                1.0);
        }
        float weightedDensity = density * descriptor.z;
        accumulated += weightedDensity;
        accumulatedHeightGradient += weightedDensity *
            mix(0.5, 1.0, heightFraction);
    }
    activeLayerHeightGradient = accumulated > 1.0e-6 ?
        accumulatedHeightGradient / accumulated : 0.5;
    return clamp(accumulated, 0.0, 1.0);
    #endif
}

float sceneGISCloudMaterialHeight(vec3 localPosition)
{
    #ifdef SCENEGIS_GLOBE
    float radialDelta =
        2.0 * SCENEGIS_BOTTOM_RADIUS * localPosition.z +
        dot(localPosition, localPosition);
    return radialDelta / max(
        length(vec3(
            localPosition.xy,
            SCENEGIS_BOTTOM_RADIUS + localPosition.z)) +
            SCENEGIS_BOTTOM_RADIUS,
        1.0);
    #else
    return localPosition.z;
    #endif
}

float sceneGISCloudOccupancyBound(
    sampler3D occupancyTexture,
    vec3 intervalStartLocal,
    vec3 intervalEndLocal,
    vec2 materialOrigin,
    vec2 cloudOffset,
    float cloudBaseHeight,
    float cloudThickness,
    int cloudPreset,
    float intervalLength,
    float intervalFootprint)
{
    vec3 intervalMiddleLocal =
        (intervalStartLocal + intervalEndLocal) * 0.5;
    float startHeight = sceneGISCloudMaterialHeight(intervalStartLocal);
    float endHeight = sceneGISCloudMaterialHeight(intervalEndLocal);
    float middleHeight = sceneGISCloudMaterialHeight(intervalMiddleLocal);
    float minimumHeight = min(startHeight, min(endHeight, middleHeight));
    float maximumHeight = max(startHeight, max(endHeight, middleHeight));
    vec3 texturePosition = vec3(
        materialOrigin + intervalMiddleLocal.xy + cloudOffset,
        middleHeight);
    float bound = 0.0;
    for (int layer = 0; layer < 4; ++layer) {
        vec4 descriptor = sceneGISCloudLayerDescriptor(cloudPreset, layer);
        if (descriptor.z <= 0.0) {
            continue;
        }
        float layerBase = cloudBaseHeight + descriptor.x;
        float layerThickness = cloudThickness * descriptor.y;
        if (maximumHeight <= layerBase ||
            minimumHeight >= layerBase + layerThickness) {
            continue;
        }
        vec4 morphology = sceneGISCloudMorphologyParameters(
            cloudPreset, layer);
        vec2 morphologyAnisotropy = sceneGISCloudMorphologyAnisotropy(
            cloudPreset, layer);
        float heightFraction = clamp(
            (middleHeight - layerBase) / max(layerThickness, 1.0),
            0.0,
            1.0);
        vec3 shapePosition = texturePosition;
        shapePosition.xy *= morphologyAnisotropy;
        shapePosition.z = heightFraction * layerThickness;
        float shapeTexelMeters = morphology.x / 128.0;
        float maximumAnisotropy = max(
            morphologyAnisotropy.x, morphologyAnisotropy.y);
        // Turbulence displaces the actual material position by at most 700 m.
        // The max hierarchy has a one-cell halo at every level, so a nearest
        // sample at this conservative footprint also covers a mip-cell seam.
        float conservativeFootprint =
            (intervalLength + intervalFootprint + 1400.0) *
            maximumAnisotropy;
        float occupancyLod = clamp(
            ceil(log2(max(
                conservativeFootprint / max(shapeTexelMeters, 1.0),
                1.0))),
            0.0,
            7.0);
        float shapeBound = textureLod(
            occupancyTexture,
            shapePosition / morphology.x,
            occupancyLod).r;
        // The Globe reference remaps weather against the complete shape range,
        // so only an exact-zero max cell is empty. Planar retains its frozen
        // morphology threshold until the later adaptation track.
        #ifdef SCENEGIS_GLOBE
        bound = max(bound, step(0.5 / 255.0, shapeBound));
        #else
        bound = max(bound, step(morphology.z - 0.5 / 255.0, shapeBound));
        #endif
    }
    return bound;
}

float sceneGISCloudMinimumRetainedFeature(
    int cloudPreset,
    bool useDetail)
{
    float minimumFeature = 1.0e9;
    for (int layer = 0; layer < 4; ++layer) {
        vec4 descriptor = sceneGISCloudLayerDescriptor(cloudPreset, layer);
        if (descriptor.z <= 0.0) {
            continue;
        }
        vec4 morphology = sceneGISCloudMorphologyParameters(
            cloudPreset, layer);
        minimumFeature = min(
            minimumFeature,
            useDetail ? morphology.y : morphology.x);
    }
    return max(minimumFeature, 1.0);
}

float sceneGISCloudHenyeyGreenstein(float anisotropy, float cosineTheta)
{
    float anisotropySquared = anisotropy * anisotropy;
    return (1.0 - anisotropySquared) / (4.0 * czm_pi) /
        pow(max(
            1.0 + anisotropySquared -
                2.0 * anisotropy * clamp(cosineTheta, -1.0, 1.0),
            1.0e-4), 1.5);
}

float sceneGISCloudDualPhase(
    float cosineTheta,
    float phaseAttenuation)
{
    return 0.5 * (
        sceneGISCloudHenyeyGreenstein(
            0.7 * phaseAttenuation, cosineTheta) +
        sceneGISCloudHenyeyGreenstein(
            -0.2 * phaseAttenuation, cosineTheta));
}

vec3 sceneGISCloudSolarScattering(
    vec3 atmosphereSun,
    float sunOpticalDepth,
    float cosineTheta)
{
    vec3 radiance = vec3(0.0);
    float scatteringContribution = 1.0;
    float extinctionAttenuation = 1.0;
    float phaseAttenuation = 1.0;
    for (int octave = 0; octave < 8; ++octave) {
        radiance += atmosphereSun *
            scatteringContribution *
            exp(-sunOpticalDepth * extinctionAttenuation) *
            sceneGISCloudDualPhase(cosineTheta, phaseAttenuation);
        scatteringContribution *= 0.5;
        extinctionAttenuation *= 0.5;
        phaseAttenuation *= 0.5;
    }
    return radiance;
}

float sceneGISCloudLocalPowder(float localExtinction)
{
    const float powderBaseline = 0.8;
    const float powderDistanceMeters = 150.0;
    return 1.0 - powderBaseline * exp(
        -max(localExtinction, 0.0) * powderDistanceMeters);
}

vec3 sceneGISCloudSkyIrradiance(
    sampler2D irradianceTexture,
    vec3 localPosition,
    vec3 sunDirection,
    vec3 atmosphereSun)
{
    #ifdef SCENEGIS_GLOBE
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 point = vec3(
        localPosition.xy * 0.001,
        atmosphere.bottom_radius + localPosition.z * 0.001);
    float radius = max(length(point), atmosphere.bottom_radius);
    float sunCosine = dot(point, sunDirection) / radius;
    return max(GetIrradiance(
        atmosphere, irradianceTexture, radius, sunCosine), vec3(0.0)) /
        SCENEGIS_SOLAR_IRRADIANCE;
    #else
    vec3 totalIrradiance = max(sceneGISPlanarIrradiance(
        irradianceTexture, localPosition.z, sunDirection.z), vec3(0.0));
    vec3 directIrradiance = SCENEGIS_SOLAR_IRRADIANCE *
        max(sunDirection.z, 0.0) * max(atmosphereSun, vec3(0.0));
    return max(totalIrradiance - directIrradiance, vec3(0.0)) /
        SCENEGIS_SOLAR_IRRADIANCE;
    #endif
}

vec3 sceneGISCloudSunIncident(
    sampler2D transmittanceTexture,
    vec3 localPosition,
    vec3 sunDirection)
{
    #ifdef SCENEGIS_GLOBE
    AtmosphereParameters atmosphere = sceneGISAtmosphereParameters();
    vec3 point = vec3(
        localPosition.xy * 0.001,
        atmosphere.bottom_radius + localPosition.z * 0.001);
    float radius = max(length(point), atmosphere.bottom_radius);
    float sunCosine = dot(point, sunDirection) / radius;
    return max(GetTransmittanceToSun(
        atmosphere, transmittanceTexture, radius, sunCosine), vec3(0.0));
    #else
    if (sunDirection.z <= 0.0 || localPosition.z < 0.0 ||
        localPosition.z > SCENEGIS_PLANAR_TOP) {
        return vec3(0.0);
    }
    return max(sceneGISPlanarTransmittanceToBoundary(
        transmittanceTexture, localPosition.z, sunDirection.z), vec3(0.0));
    #endif
}

void sceneGISCloudLightingComponents(
    sampler2D irradianceTexture,
    vec3 sampleLocal,
    vec3 localRayDirection,
    vec3 sunDirection,
    vec3 atmosphereSun,
    float sunOpticalDepth,
    float activeLayerHeightGradient,
    float localExtinction,
    out vec3 solarScattering,
    out vec3 skySource,
    out float localPowder,
    out vec3 totalSource)
{
    solarScattering = sceneGISCloudSolarScattering(
        atmosphereSun,
        sunOpticalDepth,
        dot(localRayDirection, sunDirection));
    vec3 skyIrradiance = sceneGISCloudSkyIrradiance(
        irradianceTexture,
        sampleLocal,
        sunDirection,
        atmosphereSun);
    float heightGradient = clamp(
        activeLayerHeightGradient, 0.5, 1.0);
    skySource = skyIrradiance *
        (1.0 / (4.0 * czm_pi)) * heightGradient;
    localPowder = sceneGISCloudLocalPowder(localExtinction);
    totalSource = (solarScattering + skySource) * localPowder;
}

float sceneGISCloudSunOpticalDepth(
    sampler3D shapeTexture,
    sampler3D detailTexture,
    sampler2D weatherTexture,
    sampler3D turbulenceTexture,
    vec3 localPosition,
    vec3 surfacePosition,
    vec3 east,
    vec3 north,
    vec3 vertical,
    vec3 ellipsoidCenter,
    vec2 materialOrigin,
    vec3 sunDirection,
    vec2 cloudOffset,
    float cloudBaseHeight,
    float cloudThickness,
    float cloudCoverage,
    float cloudDensity,
    int cloudPreset,
    int sunSteps,
    float detailStrength)
{
    float supportBaseHeight;
    float supportThickness;
    sceneGISCloudPresetSupport(
        cloudPreset,
        cloudBaseHeight,
        cloudThickness,
        supportBaseHeight,
        supportThickness);
    float segmentStart;
    float segmentEnd;
    if (!sceneGISCloudSegment(
            localPosition,
            sunDirection,
            SCENEGIS_CLOUD_MAX_DISTANCE,
            supportBaseHeight,
            supportThickness,
            segmentStart,
            segmentEnd)) {
        return 0.0;
    }
    float stepLength = (segmentEnd - segmentStart) / float(max(sunSteps, 1));
    float opticalDepth = 0.0;
    for (int step = 0; step < SCENEGIS_CLOUD_SUN_MAX_STEPS; ++step) {
        if (step >= sunSteps) {
            break;
        }
        float distance = segmentStart + (float(step) + 0.5) * stepLength;
        vec3 sampleLocal = localPosition + sunDirection * distance;
        vec3 globeSurfacePosition = sceneGISGlobeCloudSurfaceAnchor(vertical);
        vec3 sampleGlobePosition =
            globeSurfacePosition +
            east * sampleLocal.x +
            north * sampleLocal.y +
            vertical * sampleLocal.z;
        vec3 globeOffset = east * cloudOffset.x + north * cloudOffset.y;
        float visibility = 1.0 - smoothstep(
            SCENEGIS_CLOUD_VISIBLE_START, SCENEGIS_CLOUD_VISIBLE_END, distance);
        float unusedHeightGradient;
        opticalDepth += sceneGISCloudDensitySample(
            shapeTexture,
            detailTexture,
            weatherTexture,
            turbulenceTexture,
            sampleLocal,
            sampleGlobePosition,
            globeOffset,
            materialOrigin,
            cloudOffset,
            cloudBaseHeight,
            cloudThickness,
            cloudCoverage,
            cloudPreset,
            detailStrength,
            stepLength,
            unusedHeightGradient) * visibility * cloudDensity * stepLength;
    }
    return min(opticalDepth, 80.0);
}

void sceneGISMarchClouds(
    sampler2D transmittanceTexture,
    sampler2D irradianceTexture,
    sampler3D shapeTexture,
    sampler3D occupancyTexture,
    sampler3D detailTexture,
    sampler2D weatherTexture,
    sampler3D turbulenceTexture,
    float rayDither,
    vec3 localRayOrigin,
    vec3 localRayDirection,
    vec3 worldCameraPosition,
    vec3 surfacePosition,
    vec3 east,
    vec3 north,
    vec3 worldVertical,
    vec3 sunDirection,
    vec3 ellipsoidCenter,
    vec3 ellipsoidRadii,
    vec2 cloudOffset,
    float maximumDistance,
    float cloudBaseHeight,
    float cloudThickness,
    float cloudCoverage,
    float cloudDensity,
    float cloudRadianceScale,
    int cloudPreset,
    int primarySteps,
    int fineSteps,
    int sunSteps,
    bool useDetail,
    float rayAngularFootprint,
    float rayOriginFootprint,
    out vec4 cloudColor,
    out vec4 cloudDistances,
    out vec4 cloudSamplingDiagnostics)
{
    cloudColor = vec4(0.0, 0.0, 0.0, 1.0);
    cloudDistances = vec4(0.0);
    cloudSamplingDiagnostics = vec4(0.0);
    float supportBaseHeight;
    float supportThickness;
    sceneGISCloudPresetSupport(
        cloudPreset,
        cloudBaseHeight,
        cloudThickness,
        supportBaseHeight,
        supportThickness);
    float segmentStart;
    float segmentEnd;
    if (!sceneGISCloudSegment(
            localRayOrigin,
            localRayDirection,
            maximumDistance,
            supportBaseHeight,
            supportThickness,
            segmentStart,
            segmentEnd)) {
        return;
    }
    vec2 materialOrigin = sceneGISCloudMaterialOrigin(
        worldCameraPosition, worldVertical);
    float coarseStepLength =
        (segmentEnd - segmentStart) / float(max(primarySteps, 1));
    float fineStepLength = coarseStepLength / float(max(fineSteps, 1));
    float minimumRetainedFeature = sceneGISCloudMinimumRetainedFeature(
        cloudPreset, useDetail);
    int intervalFineSteps = min(
        fineSteps,
        max(1, int(ceil(
            coarseStepLength / max(minimumRetainedFeature * 0.5, 1.0)))));
    fineStepLength = coarseStepLength / float(max(intervalFineSteps, 1));
    float accumulatedTransmittance = 1.0;
    vec3 accumulatedRadiance = vec3(0.0);
    float weightedDistance = 0.0;
    float accumulatedWeight = 0.0;
    float frontDistance = 0.0;
    bool hasFront = false;
    float visitedCoarseIntervals = 0.0;
    float visitedFineSamples = 0.0;
    float skippedCoarseIntervals = 0.0;
    float detailStrength = useDetail
        ? (primarySteps >= SCENEGIS_CLOUD_PRIMARY_MAX_STEPS ? 1.0 : 0.15)
        : 0.0;
    for (int step = 0; step < SCENEGIS_CLOUD_PRIMARY_MAX_STEPS; ++step) {
        if (step >= primarySteps || accumulatedTransmittance <= 0.01) {
            break;
        }
        visitedCoarseIntervals += 1.0;
        float coarseStartDistance = min(
            segmentStart + float(step) * coarseStepLength,
            segmentEnd);
        float coarseEndDistance = min(
            coarseStartDistance + coarseStepLength,
            segmentEnd);
        float coarseDistance =
            (coarseStartDistance + coarseEndDistance) * 0.5;
        vec3 coarseStartLocal =
            localRayOrigin + localRayDirection * coarseStartDistance;
        vec3 coarseEndLocal =
            localRayOrigin + localRayDirection * coarseEndDistance;
        float coarseFootprint = max(
            coarseStepLength,
            max(rayOriginFootprint, coarseDistance * rayAngularFootprint));
        float occupancy = sceneGISCloudOccupancyBound(
            occupancyTexture,
            coarseStartLocal,
            coarseEndLocal,
            materialOrigin,
            cloudOffset,
            cloudBaseHeight,
            cloudThickness,
            cloudPreset,
            coarseEndDistance - coarseStartDistance,
            coarseFootprint);
        if (occupancy <= 1.0e-5) {
            skippedCoarseIntervals += 1.0;
            continue;
        }
        for (int fineStep = 0;
             fineStep < SCENEGIS_CLOUD_FINE_MAX_STEPS;
             ++fineStep) {
            if (fineStep >= intervalFineSteps ||
                accumulatedTransmittance <= 0.01) {
                break;
            }
            visitedFineSamples += 1.0;
            float fineOffset =
                (float(fineStep) + clamp(rayDither, 0.0, 1.0)) /
                float(max(intervalFineSteps, 1));
            float distance = min(
                segmentStart + (float(step) + fineOffset) * coarseStepLength,
                segmentEnd);
            vec3 sampleLocal =
                localRayOrigin + localRayDirection * distance;
            vec3 globeSurfacePosition = sceneGISGlobeCloudSurfaceAnchor(
                worldVertical);
            vec3 sampleGlobePosition =
                globeSurfacePosition +
                east * sampleLocal.x +
                north * sampleLocal.y +
                worldVertical * sampleLocal.z;
            vec3 globeOffset = east * cloudOffset.x + north * cloudOffset.y;
            float visibility = 1.0 - smoothstep(
                SCENEGIS_CLOUD_VISIBLE_START,
                SCENEGIS_CLOUD_VISIBLE_END,
                distance);
            float footprint = max(
                fineStepLength,
                max(rayOriginFootprint, distance * rayAngularFootprint));
            float activeLayerHeightGradient;
            float normalizedDensity = sceneGISCloudDensitySample(
                shapeTexture,
                detailTexture,
                weatherTexture,
                turbulenceTexture,
                sampleLocal,
                sampleGlobePosition,
                globeOffset,
                materialOrigin,
                cloudOffset,
                cloudBaseHeight,
                cloudThickness,
                cloudCoverage,
                cloudPreset,
                detailStrength,
                footprint,
                activeLayerHeightGradient) * visibility;
            if (normalizedDensity <= 1.0e-4) {
                continue;
            }
            float extinction = normalizedDensity * cloudDensity;
            float stepTransmittance = exp(
                -min(extinction * fineStepLength, 80.0));
            float opacityContribution =
                accumulatedTransmittance * (1.0 - stepTransmittance);
            if (!hasFront) {
                frontDistance = distance;
                hasFront = true;
            }
            #ifdef SCENEGIS_CLOUD_REPLAY_DENSITY_ONLY
            vec3 sourceRadiance = vec3(0.0);
            #else
            float sunOpticalDepth = sceneGISCloudSunOpticalDepth(
                shapeTexture,
                detailTexture,
                weatherTexture,
                turbulenceTexture,
                sampleLocal,
                surfacePosition,
                east,
                north,
                worldVertical,
                ellipsoidCenter,
                materialOrigin,
                sunDirection,
                cloudOffset,
                cloudBaseHeight,
                cloudThickness,
                cloudCoverage,
                cloudDensity,
                cloudPreset,
                sunSteps,
                detailStrength);
            vec3 atmosphereSun = sceneGISCloudSunIncident(
                transmittanceTexture, sampleLocal, sunDirection);
            vec3 solarScattering;
            vec3 skySource;
            float localPowder;
            vec3 totalSource;
            sceneGISCloudLightingComponents(
                irradianceTexture,
                sampleLocal,
                localRayDirection,
                sunDirection,
                atmosphereSun,
                sunOpticalDepth,
                activeLayerHeightGradient,
                extinction,
                solarScattering,
                skySource,
                localPowder,
                totalSource);
            vec3 sourceRadiance = max(totalSource, vec3(0.0));
            #endif
            accumulatedRadiance += opacityContribution * sourceRadiance;
            accumulatedTransmittance *= stepTransmittance;
            weightedDistance += opacityContribution * distance;
            accumulatedWeight += opacityContribution;
        }
    }
    cloudSamplingDiagnostics = vec4(
        visitedCoarseIntervals,
        visitedFineSamples,
        skippedCoarseIntervals,
        accumulatedTransmittance <= 0.01 ? 1.0 : 0.0);
    if (!hasFront || accumulatedWeight <= 1.0e-6) {
        return;
    }
    float meanDistance = max(
        weightedDistance / accumulatedWeight,
        frontDistance);
    cloudColor = vec4(
        accumulatedRadiance * cloudRadianceScale,
        clamp(accumulatedTransmittance, 0.0, 1.0));
    cloudDistances = vec4(
        clamp(meanDistance / SCENEGIS_CLOUD_DISTANCE_ENCODING, 0.0, 1.0),
        clamp(frontDistance / SCENEGIS_CLOUD_DISTANCE_ENCODING, 0.0, 1.0),
        clamp(maximumDistance / SCENEGIS_CLOUD_DISTANCE_ENCODING, 0.0, 1.0),
        1.0);
}

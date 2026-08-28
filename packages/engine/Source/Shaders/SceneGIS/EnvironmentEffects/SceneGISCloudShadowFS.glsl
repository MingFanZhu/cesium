precision highp float;
precision highp sampler3D;

in vec2 v_textureCoordinates;

uniform int u_sceneGISShadowCascadeIndex;
uniform vec3 u_sceneGISShadowRayCenter;
uniform vec3 u_sceneGISShadowRayRight;
uniform vec3 u_sceneGISShadowRayUp;
uniform vec3 u_sceneGISShadowRayDirection;
uniform vec2 u_sceneGISShadowHalfSize;
uniform float u_sceneGISShadowRayOffset;
uniform float u_sceneGISShadowFootprint;
uniform int u_sceneGISShadowSteps;
uniform vec3 u_cameraPosition;
uniform vec3 u_surfacePosition;
uniform vec3 u_east;
uniform vec3 u_north;
uniform vec3 u_vertical;
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
uniform sampler3D u_cloudTurbulenceTexture;

void main()
{
    vec2 plane = (v_textureCoordinates * 2.0 - 1.0) *
        u_sceneGISShadowHalfSize;
    vec3 rayOrigin = u_sceneGISShadowRayCenter +
        u_sceneGISShadowRayRight * plane.x +
        u_sceneGISShadowRayUp * plane.y -
        u_sceneGISShadowRayDirection * u_sceneGISShadowRayOffset;
    float supportBaseHeight;
    float supportThickness;
    sceneGISCloudPresetSupport(
        u_cloudPreset,
        u_baseHeight + u_cloudBaseHeight,
        u_cloudThickness,
        supportBaseHeight,
        supportThickness);
    float segmentStart;
    float segmentEnd;
    if (!sceneGISCloudSegment(
            rayOrigin,
            u_sceneGISShadowRayDirection,
            SCENEGIS_CLOUD_SHADOW_MAX_LENGTH,
            supportBaseHeight,
            supportThickness,
            segmentStart,
            segmentEnd)) {
        out_FragColor = vec4(0.0);
        return;
    }
    float stepLength = (segmentEnd - segmentStart) /
        float(max(u_sceneGISShadowSteps, 1));
    vec2 materialOrigin = sceneGISCloudMaterialOrigin(
        u_cameraPosition, u_vertical);
    vec3 globeOffset = u_east * u_cloudOffset.x +
        u_north * u_cloudOffset.y;
    float opticalDepth = 0.0;
    float extinctionSum = 0.0;
    float weightedDistance = 0.0;
    float transmittanceSum = 0.0;
    float transmittance = 1.0;
    float sampleCount = 0.0;
    float tail = 0.0;
    for (int step = 0; step < 50; ++step) {
        if (step >= u_sceneGISShadowSteps) {
            break;
        }
        float distance = segmentStart + (float(step) + 0.5) * stepLength;
        vec3 sampleLocal = rayOrigin +
            u_sceneGISShadowRayDirection * distance;
        vec3 globeSurface = sceneGISGlobeCloudSurfaceAnchor(u_vertical);
        vec3 globePosition = globeSurface +
            u_east * sampleLocal.x +
            u_north * sampleLocal.y +
            u_vertical * sampleLocal.z;
        float unusedHeightGradient;
        float normalizedDensity = sceneGISCloudDensitySample(
            u_cloudShapeTexture,
            u_cloudDetailTexture,
            u_cloudWeatherTexture,
            u_cloudTurbulenceTexture,
            sampleLocal,
            globePosition,
            globeOffset,
            materialOrigin,
            u_cloudOffset,
            u_baseHeight + u_cloudBaseHeight,
            u_cloudThickness,
            u_cloudCoverage,
            u_cloudPreset,
            u_cloudUseDetail ? 1.0 : 0.0,
            max(stepLength, u_sceneGISShadowFootprint),
            unusedHeightGradient);
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
    out_FragColor = vec4(
        clamp(frontDepth / SCENEGIS_CLOUD_SHADOW_MAX_LENGTH, 0.0, 1.0),
        meanExtinction,
        min(opticalDepth, 80.0),
        min(tail, 80.0));
}

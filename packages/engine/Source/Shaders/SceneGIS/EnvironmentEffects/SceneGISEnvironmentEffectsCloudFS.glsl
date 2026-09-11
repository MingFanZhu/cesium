precision highp float;
precision highp sampler3D;

layout (location = 0) out vec4 out_FragData_0;
layout (location = 1) out vec4 out_FragData_1;

in vec2 v_textureCoordinates;

uniform sampler2D u_depthTexture;
uniform bool u_perspective;
#ifdef SCENEGIS_GLOBE
uniform bool u_hasCurrentGlobeDepth;
#endif
uniform vec4 u_frustum;
uniform vec3 u_cameraPosition;
uniform vec3 u_surfacePosition;
uniform vec3 u_cameraDirection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec3 u_east;
uniform vec3 u_north;
uniform vec3 u_vertical;
uniform vec3 u_sunDirection;
#ifdef SCENEGIS_GLOBE
uniform vec3 u_primaryLightDirection;
uniform vec3 u_primaryLightScale;
#endif
uniform vec3 u_ellipsoidCenter;
uniform vec3 u_ellipsoidRadii;
uniform float u_altitude;
uniform float u_baseHeight;
uniform float u_cloudCoverage;
uniform float u_cloudDensity;
uniform float u_cloudBaseHeight;
uniform float u_cloudThickness;
uniform vec2 u_cloudOffset;
uniform float u_cloudRadianceScale;
uniform float u_backgroundRadianceScale;
uniform int u_cloudPreset;
uniform float u_cloudStbnSlice;
uniform int u_cloudPrimarySteps;
uniform int u_cloudFineSteps;
uniform int u_cloudSunSteps;
uniform bool u_cloudUseDetail;
uniform vec2 u_cloudBufferDimensions;
uniform sampler2D u_transmittanceTexture;
uniform sampler2D u_irradianceTexture;
uniform sampler3D u_cloudShapeTexture;
uniform sampler3D u_cloudOccupancyTexture;
uniform sampler3D u_cloudDetailTexture;
uniform sampler2D u_cloudWeatherTexture;
#ifdef SCENEGIS_GLOBE
uniform sampler2D u_cloudTurbulenceTexture;
#else
uniform sampler3D u_cloudTurbulenceTexture;
#endif
uniform sampler3D u_cloudStbnTexture;

void main()
{
    vec2 cloudPixel = gl_FragCoord.xy;
    vec2 cloudCoordinates = cloudPixel / u_cloudBufferDimensions;
    #ifdef SCENEGIS_GLOBE
    if (u_cloudTracePhased) {
        cloudCoordinates = (vec2(sceneGISCloudTraceFullPixel(
            ivec2(cloudPixel), textureSize(u_depthTexture, 0),
            u_cloudStbnSlice)) + 0.5) / vec2(textureSize(u_depthTexture, 0));
    }
    #endif
    vec2 fullPixel =
        cloudCoordinates * vec2(textureSize(u_depthTexture, 0));
    float rawDepth = texture(u_depthTexture, cloudCoordinates).r;
    float resolvedDepth = czm_readDepth(u_depthTexture, cloudCoordinates);
    bool isClearDepth = sceneGISIsClearResolvedDepth(rawDepth);
    #ifdef SCENEGIS_GLOBE
    isClearDepth = isClearDepth || !u_hasCurrentGlobeDepth;
    #endif
    // Ray, depth and blue noise share one sample coordinate. Phased medium
    // uses an explicit full-resolution pixel rather than the low-grid center.
    vec2 plane = mix(u_frustum.xz, u_frustum.yw, cloudCoordinates);
    vec3 eyeOffset = u_cameraRight * plane.x + u_cameraUp * plane.y;
    vec3 worldOriginOffset = u_perspective ? vec3(0.0) : eyeOffset;
    vec3 worldRayDirection = u_perspective
        ? normalize(u_cameraDirection + eyeOffset)
        : normalize(u_cameraDirection);
    vec3 localRayOrigin = vec3(
        dot(worldOriginOffset, u_east),
        dot(worldOriginOffset, u_north),
        u_altitude + dot(worldOriginOffset, u_vertical));
    vec3 localRayDirection = normalize(vec3(
        dot(worldRayDirection, u_east),
        dot(worldRayDirection, u_north),
        dot(worldRayDirection, u_vertical)));
    vec3 globeSunDirection = normalize(u_sunDirection);
    vec3 globePrimaryLightDirection = globeSunDirection;
    vec3 primaryLightScale = vec3(1.0);
    #ifdef SCENEGIS_GLOBE
    globePrimaryLightDirection = normalize(u_primaryLightDirection);
    primaryLightScale = max(u_primaryLightScale, vec3(0.0));
    #endif
    vec3 localSunDirection = normalize(vec3(
        dot(globePrimaryLightDirection, u_east),
        dot(globePrimaryLightDirection, u_north),
        dot(globePrimaryLightDirection, u_vertical)));
    float distanceToGeometry = SCENEGIS_PLANAR_BACKGROUND_DISTANCE;
    if (!isClearDepth) {
        // Non-clear depth passes through the Cesium builtin exactly once to
        // clip the explicit A1/frustum ray. Clear sentinels never enter a
        // potentially undefined eye-space reconstruction.
        #ifdef SCENEGIS_GLOBE
        // Preserve log-depth precision for every Globe quality tier.
        vec4 eye = czm_screenToEyeCoordinates(cloudCoordinates, rawDepth);
        #else
        // The native viewport is the low grid, so use its own pixel coordinate.
        vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, rawDepth);
        #endif
        eye /= eye.w;
        distanceToGeometry = u_perspective
            ? length(eye.xyz)
            : max(-eye.z, 0.0);
    }
    float cloudBase = u_cloudBaseHeight;
    #ifdef SCENEGIS_GLOBE
    cloudBase += u_baseHeight;
    #endif
    ivec3 stbnSize = textureSize(u_cloudStbnTexture, 0);
    ivec2 stbnPixel = ivec2(mod(floor(fullPixel), vec2(stbnSize.xy)));
    int stbnSlice = clamp(
        int(floor(u_cloudStbnSlice * float(stbnSize.z))),
        0,
        stbnSize.z - 1);
    float dither = texelFetch(
        u_cloudStbnTexture,
        ivec3(stbnPixel, stbnSlice),
        0).r;
    vec2 frustumSpan = vec2(
        u_frustum.y - u_frustum.x,
        u_frustum.w - u_frustum.z);
    vec2 footprintDimensions = u_cloudBufferDimensions;
    #ifdef SCENEGIS_GLOBE
    if (u_cloudTracePhased) {
        footprintDimensions = vec2(textureSize(u_depthTexture, 0));
    }
    #endif
    vec2 viewportFootprint = frustumSpan / max(footprintDimensions, vec2(1.0));
    float rayAngularFootprint = u_perspective
        ? max(viewportFootprint.x, viewportFootprint.y)
        : 0.0;
    float rayOriginFootprint = u_perspective
        ? 0.0
        : max(viewportFootprint.x, viewportFootprint.y);
    float rayStartTexelsPerPixel = 1.0;
    #ifdef SCENEGIS_GLOBE
    float footprintSupportBase;
    float footprintSupportThickness;
    sceneGISCloudPresetSupport(
        u_cloudPreset,
        cloudBase,
        u_cloudThickness,
        footprintSupportBase,
        footprintSupportThickness);
    float footprintSegmentStart = 0.0;
    float footprintSegmentEnd = 0.0;
    sceneGISCloudSegment(
        localRayOrigin,
        localRayDirection,
        distanceToGeometry,
        footprintSupportBase,
        footprintSupportThickness,
        footprintSegmentStart,
        footprintSegmentEnd);
    vec3 footprintEntryLocal = localRayOrigin +
        localRayDirection * footprintSegmentStart;
    vec3 footprintEntryGlobe = sceneGISGlobeCloudPosition(
        footprintEntryLocal,
        u_surfacePosition,
        u_east,
        u_north,
        u_vertical,
        u_ellipsoidCenter,
        u_ellipsoidRadii);
    rayStartTexelsPerPixel = sceneGISGlobeCloudEntryTexelsPerPixel(
        footprintEntryGlobe,
        u_cloudBufferDimensions,
        vec2(textureSize(u_depthTexture, 0)),
        u_altitude,
        footprintSupportBase + footprintSupportThickness);
    #endif
    float cloudSceneRadianceScale = u_cloudRadianceScale;
    #ifdef SCENEGIS_GLOBE
    cloudSceneRadianceScale *= u_backgroundRadianceScale;
    #endif
    vec4 cloudColor;
    vec4 cloudDistances;
    vec4 cloudSamplingDiagnostics;
    sceneGISMarchClouds(
        u_transmittanceTexture,
        u_irradianceTexture,
        u_cloudShapeTexture,
        u_cloudOccupancyTexture,
        u_cloudDetailTexture,
        u_cloudWeatherTexture,
        u_cloudTurbulenceTexture,
        dither,
        localRayOrigin,
        localRayDirection,
        u_cameraPosition,
        u_cameraDirection,
        u_surfacePosition,
        u_east,
        u_north,
        u_vertical,
        localSunDirection,
        globePrimaryLightDirection,
        globeSunDirection,
        primaryLightScale,
        u_ellipsoidCenter,
        u_ellipsoidRadii,
        u_cloudOffset,
        distanceToGeometry,
        cloudBase,
        u_cloudThickness,
        u_cloudCoverage,
        u_cloudDensity,
        cloudSceneRadianceScale,
        u_cloudPreset,
        u_cloudPrimarySteps,
        u_cloudFineSteps,
        u_cloudSunSteps,
        u_cloudUseDetail,
        rayAngularFootprint,
        rayOriginFootprint,
        rayStartTexelsPerPixel,
        cloudColor,
        cloudDistances,
        cloudSamplingDiagnostics);
    #ifdef SCENEGIS_CLOUD_SAMPLING_DIAGNOSTICS
    out_FragData_0 = cloudSamplingDiagnostics;
    #else
    out_FragData_0 = cloudColor;
    #endif
    #ifdef SCENEGIS_GLOBE
    if (u_cloudTracePhased) {
        cloudDistances.z = isClearDepth ? 1.0 : clamp(
            distanceToGeometry / SCENEGIS_CLOUD_DISTANCE_ENCODING, 0.0, 1.0);
    }
    #endif
    out_FragData_1 = cloudDistances;
}

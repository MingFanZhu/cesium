precision highp float;
precision highp sampler3D;

in vec2 v_textureCoordinates;

uniform sampler2D u_colorTexture;
uniform sampler2D u_depthTexture;
uniform bool u_perspective;
uniform vec4 u_frustum;
#ifdef SCENEGIS_GLOBE
uniform bool u_hasCurrentGlobeDepth;
#endif
uniform vec3 u_cameraDirection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec3 u_east;
uniform vec3 u_north;
uniform vec3 u_vertical;
uniform vec3 u_sunDirection;
uniform float u_altitude;
uniform float u_aerialRadianceScale;
uniform float u_backgroundRadianceScale;
uniform bool u_showAerialPerspective;
uniform bool u_showHeightFog;
uniform bool u_showClouds;
uniform float u_cloudCoverage;
uniform float u_heightFogDensity;
uniform float u_heightFogHeightFalloff;
uniform float u_heightFogBaseHeight;
uniform float u_heightFogStartDistance;
uniform float u_heightFogMaximumOpacity;
uniform float u_heightFogInscatteringScale;
uniform float u_heightFogDirectionalInscatteringScale;
uniform float u_heightFogDirectionalInscatteringExponent;
uniform sampler2D u_transmittanceTexture;
uniform sampler3D u_scatteringTexture;
uniform sampler2D u_irradianceTexture;
uniform sampler2D u_cloudColorTexture;
uniform sampler2D u_cloudDistanceTexture;

bool sceneGISSelectCloudSample(
    vec2 textureCoordinates,
    float sceneDistance,
    bool clearDepth,
    out vec4 cloudColor,
    out float meanDistance,
    out float frontDistance,
    out float shadowLength)
{
    float encodedSceneDistance = clamp(
        sceneDistance / SCENEGIS_CLOUD_DISTANCE_ENCODING, 0.0, 1.0);
    vec4 distances = texture(u_cloudDistanceTexture, textureCoordinates);
    bool cloudValid;
    sceneGISDecodeCloudShadowLength(
        distances.a,
        cloudValid,
        shadowLength);

    float frontDelta = encodedSceneDistance - distances.y;
    float reconstructionFootprint =
        fwidth(frontDelta) + 1.0 / SCENEGIS_CLOUD_DISTANCE_ENCODING;
    if (!cloudValid) {
        cloudColor = vec4(0.0, 0.0, 0.0, 1.0);
        meanDistance = 0.0;
        frontDistance = 0.0;
        return false;
    }
    cloudColor = texture(u_cloudColorTexture, textureCoordinates);
    if (!clearDepth) {
        float visibility = smoothstep(
            -reconstructionFootprint,
            reconstructionFootprint,
            frontDelta);
        cloudColor.rgb *= visibility;
        cloudColor.a = mix(1.0, cloudColor.a, visibility);
    }
    meanDistance = distances.x * SCENEGIS_CLOUD_DISTANCE_ENCODING;
    frontDistance = distances.y * SCENEGIS_CLOUD_DISTANCE_ENCODING;
    return cloudColor.a < 1.0 - 1.0e-6;
}

float sceneGISGlobeAtmosphereRadianceScale()
{
    return u_backgroundRadianceScale * u_aerialRadianceScale;
}

void main()
{
    vec4 inputColor = texture(u_colorTexture, v_textureCoordinates);
    float rawDepth = texture(u_depthTexture, v_textureCoordinates).r;
    bool isClearDepth = sceneGISIsClearResolvedDepth(rawDepth);
    #ifdef SCENEGIS_GLOBE
    isClearDepth = isClearDepth || !u_hasCurrentGlobeDepth;
    #endif
    if (isClearDepth && !u_showClouds
        #ifdef SCENEGIS_GLOBE
        && !u_showHeightFog
        #endif
        ) {
        out_FragColor = inputColor;
        return;
    }
    #ifdef SCENEGIS_GLOBE
    vec2 plane = mix(u_frustum.xz, u_frustum.yw, v_textureCoordinates);
    vec3 eyeOffset = u_cameraRight * plane.x + u_cameraUp * plane.y;
    vec3 worldOriginOffset = u_perspective ? vec3(0.0) : eyeOffset;
    float distanceToPoint = SCENEGIS_PLANAR_BACKGROUND_DISTANCE;
    if (!isClearDepth) {
        // Avoid a lossy log-to-perspective-depth round trip at distant receivers.
        vec4 eye = czm_windowToEyeCoordinates(
            gl_FragCoord.xy, rawDepth);
        eye /= eye.w;
        distanceToPoint = u_perspective
            ? length(eye.xyz)
            : max(-eye.z, 0.0);
    }
    vec3 worldDirection = u_perspective
        ? normalize(u_cameraDirection + eyeOffset)
        : normalize(u_cameraDirection);
    #else
    // Preserve native log-depth precision across large Planar extents.
    vec4 eye = czm_windowToEyeCoordinates(
        gl_FragCoord.xy, rawDepth);
    eye /= eye.w;
    vec3 eyeOffset = u_cameraRight * eye.x + u_cameraUp * eye.y;
    vec3 worldOriginOffset = u_perspective ? vec3(0.0) : eyeOffset;
    float distanceToPoint = isClearDepth
        ? SCENEGIS_PLANAR_BACKGROUND_DISTANCE
        : (u_perspective ? length(eye.xyz) : max(-eye.z, 0.0));
    vec3 worldDirection = u_perspective
        ? normalize(eyeOffset - u_cameraDirection * eye.z)
        : normalize(u_cameraDirection);
    #endif
    vec3 rayOrigin = vec3(
        dot(worldOriginOffset, u_east),
        dot(worldOriginOffset, u_north),
        u_altitude + dot(worldOriginOffset, u_vertical));
    float shadowLength = 0.0;
    if (u_showClouds && u_sceneGISShowCrepuscularRays) {
        bool unusedShadowSampleValid;
        sceneGISDecodeCloudShadowLength(
            texture(u_cloudDistanceTexture, v_textureCoordinates).a,
            unusedShadowSampleValid,
            shadowLength);
    }
    vec3 viewDirection = normalize(vec3(
        dot(worldDirection, u_east),
        dot(worldDirection, u_north),
        dot(worldDirection, u_vertical)));
    float atmosphereDistanceToPoint = distanceToPoint;
    #ifdef SCENEGIS_GLOBE
    if (!isClearDepth) {
        atmosphereDistanceToPoint = sceneGISGlobeStableTerrainDistance(
            rayOrigin,
            viewDirection,
            distanceToPoint);
    }
    #endif
    vec3 sunDirection = normalize(vec3(
        dot(u_sunDirection, u_east),
        dot(u_sunDirection, u_north),
        dot(u_sunDirection, u_vertical)));
    vec3 sceneLinearRadiance = inputColor.rgb;
    #ifdef SCENEGIS_GLOBE
    float globeAtmosphereRadianceScale =
        sceneGISGlobeAtmosphereRadianceScale();
    if (isClearDepth && u_showAerialPerspective && shadowLength > 0.0) {
        vec3 clearTransmittance;
        vec3 unshadowedTransmittance;
        vec3 clearRadiance = sceneGISGlobeSkyRadiance(
            u_transmittanceTexture,
            u_scatteringTexture,
            rayOrigin,
            viewDirection,
            sunDirection,
            shadowLength,
            clearTransmittance);
        vec3 unshadowedRadiance = sceneGISGlobeSkyRadiance(
            u_transmittanceTexture,
            u_scatteringTexture,
            rayOrigin,
            viewDirection,
            sunDirection,
            0.0,
            unshadowedTransmittance);
        sceneLinearRadiance +=
            (clearRadiance - unshadowedRadiance) *
            globeAtmosphereRadianceScale;
    }
    if (isClearDepth && u_showHeightFog) {
        sceneLinearRadiance = sceneGISApplyExponentialHeightFog(
            u_transmittanceTexture,
            sceneLinearRadiance,
            rayOrigin,
            viewDirection,
            sunDirection,
            distanceToPoint,
            shadowLength,
            u_heightFogDensity,
            u_heightFogHeightFalloff,
            u_heightFogBaseHeight,
            u_heightFogStartDistance,
            u_heightFogMaximumOpacity,
            u_backgroundRadianceScale,
            u_heightFogInscatteringScale,
            u_heightFogDirectionalInscatteringScale,
            u_heightFogDirectionalInscatteringExponent);
    }
    #endif
    #ifndef SCENEGIS_GLOBE
    if (isClearDepth && shadowLength > 0.0) {
        vec3 delta = vec3(0.0);
        if (u_showAerialPerspective) {
            delta = -sceneGISPlanarCloudShadowRadiance(
                u_transmittanceTexture, u_scatteringTexture, u_irradianceTexture,
                rayOrigin, viewDirection, sunDirection, distanceToPoint, shadowLength) *
                (u_backgroundRadianceScale * u_aerialRadianceScale);
        }
        if (u_showHeightFog) {
            // Background already contains the lit fog. Its affine difference
            // attenuates the atmosphere correction and changes directional fog once.
            delta = sceneGISApplyExponentialHeightFog(
                u_transmittanceTexture, delta, rayOrigin, viewDirection, sunDirection,
                distanceToPoint, shadowLength, u_heightFogDensity,
                u_heightFogHeightFalloff, u_heightFogBaseHeight, u_heightFogStartDistance,
                u_heightFogMaximumOpacity, 1.0, u_heightFogInscatteringScale,
                u_heightFogDirectionalInscatteringScale, u_heightFogDirectionalInscatteringExponent) -
                sceneGISApplyExponentialHeightFog(
                u_transmittanceTexture, vec3(0.0), rayOrigin, viewDirection, sunDirection,
                distanceToPoint, 0.0, u_heightFogDensity,
                u_heightFogHeightFalloff, u_heightFogBaseHeight, u_heightFogStartDistance,
                u_heightFogMaximumOpacity, 1.0, u_heightFogInscatteringScale,
                u_heightFogDirectionalInscatteringScale, u_heightFogDirectionalInscatteringExponent);
        }
        sceneLinearRadiance += delta;
    }
    #endif
    if (!isClearDepth && u_showAerialPerspective) {
        vec3 transmittance;
        #ifdef SCENEGIS_GLOBE
        vec3 radiance = sceneGISGlobeSkyRadianceToPoint(
                u_transmittanceTexture,
                u_scatteringTexture,
                rayOrigin,
                viewDirection,
                sunDirection,
                atmosphereDistanceToPoint,
                shadowLength,
                transmittance);
        #else
        bool intersectsAtmosphere;
        vec3 radiance = sceneGISPlanarRadianceToPoint(
                u_transmittanceTexture,
                u_scatteringTexture,
                u_irradianceTexture,
                rayOrigin,
                viewDirection,
                sunDirection,
                distanceToPoint,
                false,
                intersectsAtmosphere,
                transmittance);
        radiance = max(radiance - sceneGISPlanarCloudShadowRadiance(
            u_transmittanceTexture, u_scatteringTexture, u_irradianceTexture,
            rayOrigin, viewDirection, sunDirection, distanceToPoint, shadowLength), vec3(0.0));
        #endif
        #ifdef SCENEGIS_GLOBE
        sceneLinearRadiance =
            inputColor.rgb * transmittance +
            radiance * globeAtmosphereRadianceScale;
        #else
        sceneLinearRadiance =
            inputColor.rgb * transmittance +
            radiance * (u_backgroundRadianceScale * u_aerialRadianceScale);
        #endif
    }
    if (!isClearDepth && u_showHeightFog) {
        sceneLinearRadiance = sceneGISApplyExponentialHeightFog(
            u_transmittanceTexture,
            sceneLinearRadiance,
            rayOrigin,
            viewDirection,
            sunDirection,
            atmosphereDistanceToPoint,
            shadowLength,
            u_heightFogDensity,
            u_heightFogHeightFalloff,
            u_heightFogBaseHeight,
            u_heightFogStartDistance,
            u_heightFogMaximumOpacity,
            #ifdef SCENEGIS_GLOBE
            u_backgroundRadianceScale,
            #else
            1.0,
            #endif
            u_heightFogInscatteringScale,
            u_heightFogDirectionalInscatteringScale,
            u_heightFogDirectionalInscatteringExponent);
    }
    float hazeCloudFrontDistance = 0.0;
    float hazeCloudOpacity = 0.0;
    bool hazeHasVisibleCloud = false;
    if (u_showClouds) {
        vec4 cloudColor;
        float cloudMeanDistance;
        float cloudFrontDistance;
        float cloudShadowLength;
        if (sceneGISSelectCloudSample(
                v_textureCoordinates,
                distanceToPoint,
                isClearDepth,
                cloudColor,
                cloudMeanDistance,
                cloudFrontDistance,
                cloudShadowLength)) {
            float cloudOpacity = 1.0 - cloudColor.a;
            hazeCloudFrontDistance = cloudFrontDistance;
            hazeCloudOpacity = cloudOpacity;
            hazeHasVisibleCloud = true;
            vec3 cloudOptical = cloudColor.rgb;
            if (u_showAerialPerspective) {
                vec3 cloudTransmittance;
                #ifdef SCENEGIS_GLOBE
                vec3 cloudAtmosphere = sceneGISGlobeSkyRadianceToPoint(
                    u_transmittanceTexture,
                    u_scatteringTexture,
                    rayOrigin,
                    viewDirection,
                    sunDirection,
                    cloudMeanDistance,
                    cloudShadowLength,
                    cloudTransmittance);
                #else
                bool cloudIntersectsAtmosphere;
                vec3 cloudAtmosphere = sceneGISPlanarRadianceToPoint(
                    u_transmittanceTexture,
                    u_scatteringTexture,
                    u_irradianceTexture,
                    rayOrigin,
                    viewDirection,
                    sunDirection,
                    cloudMeanDistance,
                    false,
                    cloudIntersectsAtmosphere,
                    cloudTransmittance);
                cloudAtmosphere = max(cloudAtmosphere - sceneGISPlanarCloudShadowRadiance(
                    u_transmittanceTexture, u_scatteringTexture, u_irradianceTexture,
                    rayOrigin, viewDirection, sunDirection, cloudMeanDistance, cloudShadowLength), vec3(0.0));
                #endif
                #ifdef SCENEGIS_GLOBE
                cloudOptical = cloudOptical * cloudTransmittance +
                    cloudAtmosphere * globeAtmosphereRadianceScale *
                    cloudOpacity;
                #else
                cloudOptical = cloudOptical * cloudTransmittance +
                    cloudAtmosphere * (u_backgroundRadianceScale * u_aerialRadianceScale) *
                    cloudOpacity;
                #endif
            }
            if (u_showHeightFog && cloudOpacity > 1.0e-6) {
                cloudOptical = sceneGISApplyExponentialHeightFog(
                    u_transmittanceTexture,
                    cloudOptical / cloudOpacity,
                    rayOrigin,
                    viewDirection,
                    sunDirection,
                    cloudMeanDistance,
                    cloudShadowLength,
                    u_heightFogDensity,
                    u_heightFogHeightFalloff,
                    u_heightFogBaseHeight,
                    u_heightFogStartDistance,
                    u_heightFogMaximumOpacity,
                    #ifdef SCENEGIS_GLOBE
                    u_backgroundRadianceScale,
                    #else
                    1.0,
                    #endif
                    u_heightFogInscatteringScale,
                    u_heightFogDirectionalInscatteringScale,
                    u_heightFogDirectionalInscatteringExponent) * cloudOpacity;
            }
            sceneLinearRadiance =
                sceneLinearRadiance * cloudColor.a + cloudOptical;
        }
    }
    if (u_showClouds && (isClearDepth || hazeHasVisibleCloud)) {
        float hazeCameraNear = max(czm_currentFrustum.x, 0.0);
        vec3 hazeRayOrigin = rayOrigin + viewDirection * hazeCameraNear;
        #ifdef SCENEGIS_GLOBE
        float hazeMaximumDistance = sceneGISGlobeCloudHazeRayDistance(
            hazeRayOrigin,
            viewDirection,
            max(distanceToPoint - hazeCameraNear, 0.0));
        #else
        float hazeMaximumDistance = max(distanceToPoint - hazeCameraNear, 0.0);
        #endif
        if (hazeCloudOpacity > 0.0) {
            hazeMaximumDistance = sceneGISGlobeCloudHazeClampToCloudFront(
                hazeMaximumDistance,
                hazeCloudFrontDistance,
                hazeCameraNear,
                hazeCloudOpacity);
        }
        #ifdef SCENEGIS_GLOBE
        vec4 cloudHaze = sceneGISGlobeCloudHaze(
            u_transmittanceTexture,
            u_irradianceTexture,
            rayOrigin,
            viewDirection,
            sunDirection,
            hazeMaximumDistance,
            shadowLength,
            u_cloudCoverage);
        sceneLinearRadiance =
            sceneLinearRadiance * (1.0 - cloudHaze.a) +
            cloudHaze.rgb * globeAtmosphereRadianceScale;
        #else
        float shadowStart;
        float shadowEnd;
        float hazeShadowLength = shadowLength;
        if (sceneGISPlanarCloudShadowSegment(rayOrigin, viewDirection,
                distanceToPoint, shadowStart, shadowEnd)) {
            hazeShadowLength = max(shadowLength - max(hazeCameraNear - shadowStart, 0.0), 0.0);
        }
        vec4 cloudHaze = sceneGISPlanarCloudHaze(
            u_transmittanceTexture, u_irradianceTexture,
            hazeRayOrigin, viewDirection, sunDirection,
            hazeMaximumDistance, hazeShadowLength, u_cloudCoverage);
        sceneLinearRadiance = sceneLinearRadiance * (1.0 - cloudHaze.a) +
            cloudHaze.rgb * (u_backgroundRadianceScale * u_aerialRadianceScale);
        #endif
    }
    out_FragColor = vec4(
        sceneGISGuardHdrStorage(sceneLinearRadiance), inputColor.a);
}

precision highp float;
precision highp sampler3D;

in vec2 v_textureCoordinates;

uniform sampler2D u_colorTexture;
uniform sampler2D u_depthTexture;
uniform bool u_perspective;
uniform vec3 u_cameraDirection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec3 u_east;
uniform vec3 u_north;
uniform vec3 u_vertical;
uniform vec3 u_sunDirection;
uniform float u_altitude;
uniform float u_aerialRadianceScale;
uniform bool u_showAerialPerspective;
uniform bool u_showHeightFog;
uniform bool u_showClouds;
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
    out float meanDistance)
{
    float encodedSceneDistance = clamp(
        sceneDistance / SCENEGIS_CLOUD_DISTANCE_ENCODING, 0.0, 1.0);
    vec4 distances = texture(u_cloudDistanceTexture, textureCoordinates);
    float frontDelta = encodedSceneDistance - distances.y;
    float reconstructionFootprint =
        fwidth(frontDelta) + 1.0 / SCENEGIS_CLOUD_DISTANCE_ENCODING;
    if (distances.a < 0.5) {
        cloudColor = vec4(0.0, 0.0, 0.0, 1.0);
        meanDistance = 0.0;
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
    return cloudColor.a < 1.0 - 1.0e-6;
}

void main()
{
    vec4 inputColor = texture(u_colorTexture, v_textureCoordinates);
    float rawDepth = texture(u_depthTexture, v_textureCoordinates).r;
    float resolvedDepth = czm_readDepth(u_depthTexture, v_textureCoordinates);
    bool isClearDepth = sceneGISIsClearResolvedDepth(rawDepth);
    if (isClearDepth && !u_showClouds) {
        out_FragColor = inputColor;
        return;
    }
    vec4 eye = czm_windowToEyeCoordinates(
        vec4(gl_FragCoord.xy, resolvedDepth, 1.0));
    eye /= eye.w;
    vec3 eyeOffset = u_cameraRight * eye.x + u_cameraUp * eye.y;
    vec3 worldOriginOffset = u_perspective ? vec3(0.0) : eyeOffset;
    vec3 rayOrigin = vec3(
        dot(worldOriginOffset, u_east),
        dot(worldOriginOffset, u_north),
        u_altitude + dot(worldOriginOffset, u_vertical));
    float distanceToPoint = isClearDepth
        ? SCENEGIS_PLANAR_BACKGROUND_DISTANCE
        : (u_perspective ? length(eye.xyz) : max(-eye.z, 0.0));
    vec3 worldDirection = u_perspective
        ? normalize(eyeOffset - u_cameraDirection * eye.z)
        : normalize(u_cameraDirection);
    vec3 viewDirection = normalize(vec3(
        dot(worldDirection, u_east),
        dot(worldDirection, u_north),
        dot(worldDirection, u_vertical)));
    vec3 sunDirection = normalize(vec3(
        dot(u_sunDirection, u_east),
        dot(u_sunDirection, u_north),
        dot(u_sunDirection, u_vertical)));
    vec3 sceneLinearRadiance = inputColor.rgb;
    if (!isClearDepth && u_showAerialPerspective) {
        vec3 transmittance;
        #ifdef SCENEGIS_GLOBE
        vec3 radiance = sceneGISGlobeSkyRadianceToPoint(
                u_transmittanceTexture,
                u_scatteringTexture,
                rayOrigin,
                viewDirection,
                sunDirection,
                distanceToPoint,
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
        #endif
        sceneLinearRadiance =
            inputColor.rgb * transmittance + radiance * u_aerialRadianceScale;
    }
    if (!isClearDepth && u_showHeightFog) {
        sceneLinearRadiance = sceneGISApplyExponentialHeightFog(
            u_transmittanceTexture,
            sceneLinearRadiance,
            rayOrigin,
            viewDirection,
            sunDirection,
            distanceToPoint,
            u_heightFogDensity,
            u_heightFogHeightFalloff,
            u_heightFogBaseHeight,
            u_heightFogStartDistance,
            u_heightFogMaximumOpacity,
            u_heightFogInscatteringScale,
            u_heightFogDirectionalInscatteringScale,
            u_heightFogDirectionalInscatteringExponent);
    }
    if (u_showClouds) {
        vec4 cloudColor;
        float cloudMeanDistance;
        if (sceneGISSelectCloudSample(
                v_textureCoordinates,
                distanceToPoint,
                isClearDepth,
                cloudColor,
                cloudMeanDistance)) {
            float cloudOpacity = 1.0 - cloudColor.a;
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
                #endif
                cloudOptical = cloudOptical * cloudTransmittance +
                    cloudAtmosphere * u_aerialRadianceScale * cloudOpacity;
            }
            if (u_showHeightFog && cloudOpacity > 1.0e-6) {
                cloudOptical = sceneGISApplyExponentialHeightFog(
                    u_transmittanceTexture,
                    cloudOptical / cloudOpacity,
                    rayOrigin,
                    viewDirection,
                    sunDirection,
                    cloudMeanDistance,
                    u_heightFogDensity,
                    u_heightFogHeightFalloff,
                    u_heightFogBaseHeight,
                    u_heightFogStartDistance,
                    u_heightFogMaximumOpacity,
                    u_heightFogInscatteringScale,
                    u_heightFogDirectionalInscatteringScale,
                    u_heightFogDirectionalInscatteringExponent) * cloudOpacity;
            }
            sceneLinearRadiance =
                sceneLinearRadiance * cloudColor.a + cloudOptical;
        }
    }
    out_FragColor = vec4(
        sceneGISGuardHdrStorage(sceneLinearRadiance), inputColor.a);
}

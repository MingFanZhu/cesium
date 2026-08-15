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
uniform sampler2D u_transmittanceTexture;
uniform sampler3D u_scatteringTexture;
uniform sampler2D u_irradianceTexture;

void main()
{
    vec4 inputColor = texture(u_colorTexture, v_textureCoordinates);
    float rawDepth = texture(u_depthTexture, v_textureCoordinates).r;
    float clearDepth = czm_readDepth(u_depthTexture, v_textureCoordinates);
    if (clearDepth >= 1.0 - 1.0e-7) {
        out_FragColor = inputColor;
        return;
    }
    vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, rawDepth);
    eye /= eye.w;
    vec3 eyeOffset = u_cameraRight * eye.x + u_cameraUp * eye.y;
    vec3 worldOriginOffset = u_perspective ? vec3(0.0) : eyeOffset;
    vec3 rayOrigin = vec3(
        dot(worldOriginOffset, u_east),
        dot(worldOriginOffset, u_north),
        u_altitude + dot(worldOriginOffset, u_vertical));
    float distanceToPoint = u_perspective ? length(eye.xyz) : max(-eye.z, 0.0);
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
    vec3 sceneLinearRadiance =
        inputColor.rgb * transmittance + radiance * u_aerialRadianceScale;
    out_FragColor = vec4(
        sceneGISGuardHdrStorage(sceneLinearRadiance), inputColor.a);
}

precision highp float;
precision highp sampler3D;

in vec2 v_textureCoordinates;

uniform bool u_perspective;
uniform vec4 u_frustum;
uniform vec3 u_cameraDirection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec3 u_east;
uniform vec3 u_north;
uniform vec3 u_vertical;
uniform vec3 u_sunDirection;
uniform float u_altitude;
uniform float u_backgroundRadianceScale;
uniform sampler2D u_transmittanceTexture;
uniform sampler3D u_scatteringTexture;
uniform sampler2D u_irradianceTexture;

void main()
{
    vec2 plane = mix(u_frustum.xz, u_frustum.yw, v_textureCoordinates);
    vec3 worldOriginOffset = u_perspective
        ? vec3(0.0)
        : u_cameraRight * plane.x + u_cameraUp * plane.y;
    vec3 rayOrigin = vec3(
        dot(worldOriginOffset, u_east),
        dot(worldOriginOffset, u_north),
        u_altitude + dot(worldOriginOffset, u_vertical));
    vec3 worldDirection = u_perspective
        ? normalize(u_cameraDirection + u_cameraRight * plane.x + u_cameraUp * plane.y)
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
    vec3 radiance = sceneGISGlobeSkyRadiance(
            u_transmittanceTexture,
            u_scatteringTexture,
            rayOrigin,
            viewDirection,
            sunDirection,
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
            SCENEGIS_PLANAR_BACKGROUND_DISTANCE,
            true,
            intersectsAtmosphere,
            transmittance);
    if (!intersectsAtmosphere) {
        discard;
    }
    #endif
    vec3 physicalRadiance = sceneGISApplySunDisk(
        radiance, viewDirection, sunDirection, transmittance);
    vec3 sceneLinearRadiance = physicalRadiance * u_backgroundRadianceScale;
    out_FragColor = vec4(sceneGISGuardHdrStorage(sceneLinearRadiance), 1.0);
}

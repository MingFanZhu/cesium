in vec2 v_textureCoordinates;

uniform vec3 u_cameraDirection;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;
uniform vec4 u_frustumSlopes;
uniform vec3 u_sunDirection;
uniform vec4 u_zenithColor;
uniform vec4 u_horizonColor;
uniform vec4 u_backgroundColor;
uniform float u_cameraHeight;
uniform float u_fadeHeight;
uniform float u_intensity;
uniform bool u_perspective;
uniform bool u_mask;

void main()
{
    if (u_mask)
    {
        out_FragColor = vec4(u_backgroundColor.rgb, 1.0);
        return;
    }

    vec3 rayDirection = u_cameraDirection;
    if (u_perspective)
    {
        float rightSlope = mix(
            u_frustumSlopes.x,
            u_frustumSlopes.y,
            v_textureCoordinates.x
        );
        float upSlope = mix(
            u_frustumSlopes.z,
            u_frustumSlopes.w,
            v_textureCoordinates.y
        );
        rayDirection = normalize(
            rayDirection + u_cameraRight * rightSlope + u_cameraUp * upSlope
        );
    }

    float zenith = smoothstep(0.0, 1.0, max(rayDirection.z, 0.0));
    float horizon = pow(1.0 - abs(rayDirection.z), 2.0);
    float daylight = smoothstep(-0.18, 0.12, u_sunDirection.z);
    float twilight = 1.0 - smoothstep(0.0, 0.35, abs(u_sunDirection.z));
    float sunAlignment = pow(max(dot(rayDirection, u_sunDirection), 0.0), 8.0);
    float illumination = max(daylight, twilight * (0.28 + 0.72 * sunAlignment));
    vec4 atmosphere = mix(u_horizonColor, u_zenithColor, zenith);
    atmosphere.rgb *= 0.08 + 0.92 * illumination;
    atmosphere.rgb += u_horizonColor.rgb * horizon * twilight * 0.2;
    float heightFade = exp(-max(u_cameraHeight, 0.0) / u_fadeHeight);
    atmosphere.a = clamp(
        atmosphere.a * u_intensity * heightFade * (0.08 + 0.92 * illumination),
        0.0,
        1.0
    );
    out_FragColor = atmosphere;
}

uniform sampler2D u_color;
uniform vec2 u_gridSize;
uniform float u_centerWeight;
in vec2 v_textureCoordinates;

float logLuminance(vec2 uv)
{
    vec3 color = max(texture(u_color, uv).rgb, vec3(0.0));
    // Bound the supported radiance range and keep black finite in log space.
    return clamp(log2(max(dot(color, vec3(0.2126, 0.7152, 0.0722)), exp2(-16.0))), -16.0, 16.0);
}

void main()
{
    vec2 uv = v_textureCoordinates;
    vec2 offset = 0.25 / u_gridSize;
    float luminance = 0.25 * (
        logLuminance(uv + offset) + logLuminance(uv - offset) +
        logLuminance(uv + vec2(offset.x, -offset.y)) +
        logLuminance(uv + vec2(-offset.x, offset.y)));
    vec2 center = uv - 0.5;
    float weight = mix(1.0, exp(-12.0 * dot(center, center)), u_centerWeight);
    out_FragColor = vec4(luminance, weight, 0.0, 1.0);
}

uniform sampler2D colorTexture;
uniform sampler2D u_frostTexture;
uniform float u_snowIntensity;
uniform float u_frostCoverage;
in vec2 v_textureCoordinates;

void main() {
    vec2 uv = v_textureCoordinates;
    vec4 source = texture(colorTexture, uv);
    if (u_snowIntensity == 0.0 || u_frostCoverage == 0.0) {
        out_FragColor = source;
        return;
    }
    vec2 edgeDistance = min(uv, 1.0 - uv);
    float distanceToEdge = min(edgeDistance.x, edgeDistance.y);
    float extent = u_frostCoverage * 0.56;
    if (distanceToEdge > extent + 0.065) {
        out_FragColor = source;
        return;
    }
    float crystal = texture(u_frostTexture, uv).r;
    float edgeMask = 1.0 - smoothstep(extent - 0.05, extent + 0.04,
        distanceToEdge + (0.5 - crystal) * 0.05);
    float amount = u_snowIntensity * min(u_frostCoverage * 8.0, 1.0) * edgeMask;
    vec2 dimensions = vec2(textureSize(colorTexture, 0));
    vec2 pixel = 1.0 / dimensions;
    vec2 inset = pixel * 0.5;
    vec2 blur = pixel * (1.5 + 2.0 * crystal) * amount;
    vec3 blurred = source.rgb * 0.5;
    blurred += texture(colorTexture, clamp(uv + blur, inset, 1.0 - inset)).rgb * 0.25;
    blurred += texture(colorTexture, clamp(uv - blur, inset, 1.0 - inset)).rgb * 0.25;
    // Frost scatters visible light; no fixed specular glints or emissive white.
    float light = sqrt(max(czm_luminance(blurred), 0.0));
    vec3 ice = vec3(0.92, 0.96, 1.0) * light;
    float opacity = amount * mix(0.12, 0.95, smoothstep(0.08, 0.85, crystal));
    out_FragColor = vec4(mix(blurred, ice, opacity), source.a);
}

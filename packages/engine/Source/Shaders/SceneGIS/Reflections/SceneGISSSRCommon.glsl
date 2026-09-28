uniform sampler2D u_depth;
uniform sampler2D u_baseRay;
uniform sampler2D u_coatRay;
uniform int u_stride;

vec3 sceneGISSSRPosition(vec2 pixel, float depth)
{
    vec2 uv = pixel / vec2(textureSize(u_depth, 0));
    vec4 a = czm_inverseProjection * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
    vec4 b = czm_inverseProjection * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
    vec3 p = a.xyz / a.w;
    vec3 q = b.xyz / b.w;
    return p + (q - p) * ((-depth - p.z) / (q.z - p.z));
}

vec3 sceneGISSSRNormal(vec3 position, vec3 ray)
{
    // Match the incident vector used by native Model/LightingStageFS in both frusta.
    vec3 view = normalize(position);
    return normalize(ray - view);
}

ivec2 sceneGISSSRSourcePixel(ivec2 pixel, float offset)
{
    int code = int(offset + 0.5);
    return min(pixel * u_stride + ivec2(code % 2, code / 2), textureSize(u_depth, 0) - 1);
}

// Store 12-bit octahedral components in an exactly representable 24-bit float integer.
float sceneGISSSRPackNormal(vec3 n)
{
    n /= abs(n.x) + abs(n.y) + abs(n.z);
    vec2 oct = n.xy;
    if (n.z < 0.0) { oct = (1.0 - abs(oct.yx)) * vec2(oct.x < 0.0 ? -1.0 : 1.0, oct.y < 0.0 ? -1.0 : 1.0); }
    vec2 code = floor((oct * 0.5 + 0.5) * 4095.0 + 0.5);
    return code.x + code.y * 4096.0;
}

vec3 sceneGISSSRUnpackNormal(float code)
{
    vec2 oct = vec2(mod(code, 4096.0), floor(code / 4096.0)) / 4095.0 * 2.0 - 1.0;
    vec3 n = vec3(oct, 1.0 - abs(oct.x) - abs(oct.y));
    float t = max(-n.z, 0.0);
    n.xy += vec2(n.x >= 0.0 ? -t : t, n.y >= 0.0 ? -t : t);
    return normalize(n);
}

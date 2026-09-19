uniform sampler2D u_depth;
uniform sampler2D u_color;
uniform float u_maximumDistance;
uniform float u_thickness;
uniform float u_maximumRoughness;
uniform int u_stepCount;
uniform float u_rayNear;

vec3 sceneGISSSRPosition(vec2 pixel, float depth)
{
    // The native builtin handles off-center and orthographic frusta as well.
    vec4 a = czm_windowToEyeCoordinates(vec4(pixel, 0.0, 1.0));
    vec4 b = czm_windowToEyeCoordinates(vec4(pixel, 0.5, 1.0));
    vec3 p = a.xyz / a.w;
    vec3 q = b.xyz / b.w;
    return p + (q - p) * ((-depth - p.z) / (q.z - p.z));
}

vec4 sceneGISSSRTrace(vec3 position, vec4 ray)
{
    if (dot(ray.xyz, ray.xyz) < 0.5 || ray.w >= u_maximumRoughness) { return vec4(0.0); }
    vec2 size = vec2(textureSize(u_depth, 0));
    vec3 direction = normalize(ray.xyz);
    vec3 normal = normalize(direction - normalize(position));
    float footprint = length(sceneGISSSRPosition(gl_FragCoord.xy + vec2(1.0, 0.0), -position.z) - position);
    float bias = max(0.002, footprint * 0.5);
    vec3 start = position + normal * bias;
    float distanceLimit = u_maximumDistance;
    if (direction.z > 0.0) { distanceLimit = min(distanceLimit, (-u_rayNear - start.z) / direction.z); }
    if (distanceLimit <= bias) { return vec4(0.0); }
    vec3 end = start + direction * distanceLimit;
    vec4 h0 = czm_projection * vec4(start, 1.0);
    vec4 h1 = czm_projection * vec4(end, 1.0);
    vec2 uv0 = h0.xy / h0.w * 0.5 + 0.5;
    vec2 uv1 = h1.xy / h1.w * 0.5 + 0.5;
    vec2 delta = uv1 - uv0;
    float endT = 1.0;
    if (delta.x > 0.0) { endT = min(endT, (1.0 - uv0.x) / delta.x); }
    if (delta.x < 0.0) { endT = min(endT, -uv0.x / delta.x); }
    if (delta.y > 0.0) { endT = min(endT, (1.0 - uv0.y) / delta.y); }
    if (delta.y < 0.0) { endT = min(endT, -uv0.y / delta.y); }
    float pixels = max(abs(delta.x * size.x), abs(delta.y * size.y)) * endT;
    if (pixels < 2.0 || endT <= 0.0) { return vec4(0.0); }
    int steps = min(u_stepCount, int(ceil(pixels)));
    float increment = endT / float(steps);
    float previousDepth = -start.z;
    float previousT = 0.0;
    for (int i = 1; i <= 256; ++i)
    {
        if (i > steps) { break; }
        float t = float(i) * increment;
        vec2 uv = uv0 + delta * t;
        vec3 p = mix(start / h0.w, end / h1.w, t) / mix(1.0 / h0.w, 1.0 / h1.w, t);
        float z = -p.z;
        float surface = texture(u_depth, uv).r;
        float nearZ = min(previousDepth, z);
        float farZ = max(previousDepth, z);
        if (surface > 0.0 && farZ >= surface && nearZ <= surface + u_thickness && float(i) * pixels / float(steps) > 2.0)
        {
            float lo = previousT;
            float hi = t;
            // Refine in projected space while interpolating eye depth perspectively.
            for (int j = 0; j < 5; ++j)
            {
                float mid = (lo + hi) * 0.5;
                vec2 midUV = uv0 + delta * mid;
                float midZ = -mix(start.z / h0.w, end.z / h1.w, mid) / mix(1.0 / h0.w, 1.0 / h1.w, mid);
                float midSurface = texture(u_depth, midUV).r;
                if (midSurface > 0.0 && midZ >= midSurface) { hi = mid; } else { lo = mid; }
            }
            uv = uv0 + delta * hi;
            p = mix(start / h0.w, end / h1.w, hi) / mix(1.0 / h0.w, 1.0 / h1.w, hi);
            surface = texture(u_depth, uv).r;
            float error = -p.z - surface;
            float travel = length(p - position);
            if (surface > 0.0 && error >= 0.0 && error <= u_thickness && travel > 4.0 * bias)
            {
                float edge = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
                float confidence = smoothstep(0.0, 0.06, edge);
                confidence *= 1.0 - smoothstep(0.8 * u_maximumDistance, u_maximumDistance, travel);
                confidence *= 1.0 - smoothstep(0.5 * u_maximumRoughness, u_maximumRoughness, ray.w);
                float projectedWidth = ray.w * ray.w * travel * abs(czm_projection[1][1]) * size.y * 0.5;
                if (czm_projection[3][3] == 0.0) { projectedWidth /= max(surface, 0.001); }
                float lod = log2(max(1.0, projectedWidth));
                vec4 color = textureLod(u_color, uv, lod);
                return vec4(color.rgb / max(color.a, 0.001), confidence * clamp(color.a, 0.0, 1.0));
            }
        }
        previousDepth = z;
        previousT = t;
    }
    return vec4(0.0);
}

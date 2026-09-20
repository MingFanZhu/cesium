uniform sampler2D u_color;
uniform sampler2D u_depth;
uniform sampler2D u_history;
uniform sampler2D u_historyDepth;
uniform mat4 u_inverseProjection;
uniform mat4 u_previousProjection;
uniform mat4 u_previousFromCurrent;
uniform float u_historyWeight;
uniform vec2 u_jitter;
uniform bool u_valid;
in vec2 v_textureCoordinates;
layout(location = 0) out vec4 out_FragColor;
layout(location = 1) out vec4 out_Depth;

vec3 compressColor(vec3 c) { return c / (1.0 + max(max(c.r, c.g), c.b)); }
vec3 expandColor(vec3 c) { return c / max(1.0 - max(max(c.r, c.g), c.b), 0.00001); }

float reconstructionWeight(float x)
{
    x = abs(x);
    // Mitchell-Netravali (B = C = 1/3), reconstructed at the unjittered pixel center.
    return x < 1.0 ? ((7.0 * x - 12.0) * x * x + 16.0 / 3.0) / 6.0
        : (((-7.0 / 3.0 * x + 12.0) * x - 20.0) * x + 32.0 / 3.0) / 6.0;
}

void main()
{
    vec2 uv = v_textureCoordinates;
    vec2 size = vec2(textureSize(u_color, 0));
    vec4 current = texture(u_color, uv);
    float depth = texture(u_depth, uv).r;
    vec3 low = vec3(1.0), high = vec3(0.0), mean = vec3(0.0), square = vec3(0.0);
    vec3 reconstructed = vec3(0.0);
    float totalWeight = 0.0;
    vec2 pixelJitter = u_jitter * size * 0.5;
    // Dilate geometric support by one pixel so silhouette coverage can accumulate even
    // when the current subpixel sample misses. Removed surfaces lose support immediately.
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            vec2 offset = vec2(x, y);
            vec3 c = compressColor(max(texture(u_color, uv + offset / size).rgb, vec3(0.0)));
            low = min(low, c); high = max(high, c); mean += c; square += c * c;
            float weight = reconstructionWeight(offset.x - pixelJitter.x)
                * reconstructionWeight(offset.y - pixelJitter.y);
            reconstructed += c * weight;
            totalWeight += weight;
            float neighbor = texture(u_depth, uv + offset / size).r;
            if (neighbor > 0.0 && (depth <= 0.0 || neighbor < depth)) { depth = neighbor; }
        }
    }
    reconstructed = clamp(reconstructed / totalWeight, low, high);
    current.rgb = expandColor(reconstructed);
    // A sloped surface changes depth across subpixel samples even with a stationary camera.
    // Evaluate derivatives before divergent history rejection; color clipping still bounds edges.
    float depthFootprint = 2.0 * (abs(dFdx(depth)) + abs(dFdy(depth)));
    out_FragColor = current;
    out_Depth = vec4(depth, 0.0, 0.0, 1.0);
    if (!u_valid || depth <= 0.0) { return; }

    // Reconstruct at the unjittered output pixel. Jitter contributes new subpixel samples,
    // not camera velocity, so a stationary pixel accumulates at the same history location.
    vec4 a = u_inverseProjection * vec4(uv * 2.0 - 1.0, -1.0, 1.0);
    vec4 b = u_inverseProjection * vec4(uv * 2.0 - 1.0, 0.0, 1.0);
    vec3 origin = a.xyz / a.w;
    vec3 ray = b.xyz / b.w - origin;
    vec3 eye = origin + ray * ((-depth - origin.z) / ray.z);
    vec4 previousEye = u_previousFromCurrent * vec4(eye, 1.0);
    vec4 clip = u_previousProjection * previousEye;
    if (clip.w <= 0.0) { return; }
    vec2 previousUv = clip.xy / clip.w * 0.5 + 0.5;
    vec2 border = 0.5 / size;
    if (any(lessThan(previousUv, border)) || any(greaterThan(previousUv, 1.0 - border))) { return; }
    float oldDepth = texture(u_historyDepth, previousUv).r;
    float tolerance = max(max(0.01, -previousEye.z * 0.002), depthFootprint);
    if (oldDepth <= 0.0 || abs(oldDepth + previousEye.z) > tolerance) { return; }

    mean /= 9.0;
    vec3 sigma = sqrt(max(square / 9.0 - mean * mean, vec3(0.0)));
    low = max(low, mean - 1.25 * sigma);
    high = min(high, mean + 1.25 * sigma);
    vec3 history = compressColor(max(texture(u_history, previousUv).rgb, vec3(0.0)));
    vec3 clipped = clamp(history, low, high);
    float rejected = length(history - clipped);
    float weight = u_historyWeight * (1.0 - smoothstep(0.02, 0.2, rejected));
    vec3 result = mix(reconstructed, clipped, weight);
    out_FragColor = vec4(expandColor(result), current.a);
}

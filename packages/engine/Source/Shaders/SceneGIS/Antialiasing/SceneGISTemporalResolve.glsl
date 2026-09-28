// Filtering and history clipping adapted from Google Filament taa.mat,
// commit 062360c80946af6ec5ec1f479eb046f72a622b3b, licensed under Apache-2.0.
// Modified for Cesium linear depth, camera-relative reprojection, silhouette
// support, depth rejection and current alpha. See Assets/SceneGIS/Antialiasing/NOTICE.txt.
uniform sampler2D u_color;
uniform sampler2D u_depth;
uniform sampler2D u_history;
uniform sampler2D u_historyDepth;
uniform mat4 u_inverseProjection;
uniform mat4 u_previousProjection;
uniform mat4 u_previousFromCurrent;
uniform float u_historyWeight;
uniform vec2 u_jitter;
uniform vec2 u_previousJitter;
uniform bool u_valid;
in vec2 v_textureCoordinates;
layout(location = 0) out vec4 out_FragColor;
layout(location = 1) out vec4 out_Depth;

float maxComponent(vec3 c) { return max(max(c.r, c.g), c.b); }
vec3 compressColor(vec3 c) { return c / (1.0 + maxComponent(c)); }
vec3 expandColor(vec3 c) { return c / max(1.0 - maxComponent(c), 1.0 / 65504.0); }

// Filament's polynomial approximation of the separable Lanczos-2 kernel.
float lanczos2(float x)
{
    float x2 = x * x;
    float a = x2 - 4.0;
    float b = x2 * a - a;
    return b * a * a / 64.0;
}

// Clip the history-to-current segment instead of clamping RGB independently.
vec3 clipHistory(vec3 low, vec3 high, vec3 current, vec3 history)
{
    if (any(lessThan(history, low)) || any(greaterThan(history, high))) {
        vec3 ray = current - history;
        vec3 inverseRay = 1.0 / (vec3(0.0001) + ray);
        vec3 entry = min((high - history) * inverseRay, (low - history) * inverseRay);
        return history + ray * clamp(maxComponent(entry), 0.0, 1.0);
    }
    return history;
}

// Filament's five-tap Catmull-Rom reconstruction, with corner taps omitted and
// the result normalized and deringed. Linear history filtering combines middle taps.
vec3 sampleHistory(vec2 uv, vec2 size)
{
    vec2 position = uv * size;
    vec2 center = floor(position - 0.5) + 0.5;
    vec2 f = position - center;
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    vec2 w0 = f2 - 0.5 * (f3 + f);
    vec2 w1 = 1.5 * f3 - 2.5 * f2 + 1.0;
    vec2 w3 = 0.5 * (f3 - f2);
    vec2 w2 = 1.0 - w0 - w1 - w3;
    vec2 w12 = w1 + w2;
    vec2 p0 = (center - 1.0) / size;
    vec2 p3 = (center + 2.0) / size;
    vec2 p12 = (center + w2 / w12) / size;
    float k0 = w12.x * w0.y;
    float k1 = w0.x * w12.y;
    float k2 = w12.x * w12.y;
    float k3 = w3.x * w12.y;
    float k4 = w12.x * w3.y;
    vec3 s0 = textureLod(u_history, vec2(p12.x, p0.y), 0.0).rgb;
    vec3 s1 = textureLod(u_history, vec2(p0.x, p12.y), 0.0).rgb;
    vec3 s2 = textureLod(u_history, p12, 0.0).rgb;
    vec3 s3 = textureLod(u_history, vec2(p3.x, p12.y), 0.0).rgb;
    vec3 s4 = textureLod(u_history, vec2(p12.x, p3.y), 0.0).rgb;
    vec3 result = (k0 * s0 + k1 * s1 + k2 * s2 + k3 * s3 + k4 * s4)
        / (k0 + k1 + k2 + k3 + k4);
    return clamp(result, min(min(min(s0, s1), min(s2, s3)), s4),
        max(max(max(s0, s1), max(s2, s3)), s4));
}

void main()
{
    vec2 uv = v_textureCoordinates;
    vec2 size = vec2(textureSize(u_color, 0));
    vec4 current = texture(u_color, uv);
    float depth = texture(u_depth, uv).r;
    float nearestDepth = depth;
    vec2 nearestOffset = vec2(0.0);
    vec4 adjacentDepth = vec4(1.0e30);
    vec3 low9 = vec3(1.0e30), high9 = vec3(0.0);
    vec3 low5 = vec3(1.0e30), high5 = vec3(0.0);
    vec3 mean = vec3(0.0), square = vec3(0.0);
    vec3 reconstructed = vec3(0.0);
    float totalWeight = 0.0;
    vec2 pixelJitter = u_jitter * size * 0.5;
    // Preserve each covered pixel's own surface. Only uncovered silhouette samples
    // borrow neighboring geometric support, together with that sample's coordinates.
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            vec2 offset = vec2(x, y);
            // Reconstruct linear radiance before HDR compression. The sample offset
            // stays within half a pixel, so the closest input sample is uv.
            vec3 c = max(textureLod(u_color, uv + offset / size, 0.0).rgb, vec3(0.0));
            low9 = min(low9, c); high9 = max(high9, c);
            if (x == 0 || y == 0) {
                low5 = min(low5, c); high5 = max(high5, c);
                mean += c; square += c * c;
            }
            float weight = lanczos2(offset.x - pixelJitter.x)
                * lanczos2(offset.y - pixelJitter.y);
            reconstructed += c * weight;
            totalWeight += weight;
            float neighbor = texture(u_depth, uv + offset / size).r;
            if (neighbor > 0.0) {
                if (nearestDepth <= 0.0 || neighbor < nearestDepth) {
                    nearestDepth = neighbor;
                    nearestOffset = offset;
                }
                if (x == -1 && y == 0) { adjacentDepth.x = neighbor; }
                if (x == 1 && y == 0) { adjacentDepth.y = neighbor; }
                if (x == 0 && y == -1) { adjacentDepth.z = neighbor; }
                if (x == 0 && y == 1) { adjacentDepth.w = neighbor; }
            }
        }
    }
    reconstructed = clamp(reconstructed / totalWeight, low9, high9);
    current.rgb = reconstructed;
    // Use the locally continuous side of each axis. A foreground/background jump is
    // not a surface slope and must not make unrelated history depths acceptable.
    vec4 depthDelta = abs(adjacentDepth - depth);
    vec2 slope = vec2(min(depthDelta.x, depthDelta.y), min(depthDelta.z, depthDelta.w));
    slope = mix(slope, vec2(0.0), greaterThan(slope, vec2(1.0e29)));
    float depthFootprint = 2.0 * (slope.x + slope.y);
    float silhouetteFootprint = 2.0 * (abs(dFdx(nearestDepth)) + abs(dFdy(nearestDepth)));
    vec2 sampleOffset = vec2(0.0);
    if (depth <= 0.0) {
        depth = nearestDepth;
        sampleOffset = nearestOffset;
        depthFootprint = silhouetteFootprint;
    }
    out_FragColor = current;
    out_Depth = vec4(depth, 0.0, 0.0, 1.0);
    if (!u_valid || depth <= 0.0) { return; }

    // Recover motion at the location that actually produced this depth. Transfer its
    // unjittered displacement to the output pixel, without treating jitter as motion.
    vec2 sampleUv = uv + (sampleOffset - pixelJitter) / size;
    vec4 a = u_inverseProjection * vec4(sampleUv * 2.0 - 1.0, -1.0, 1.0);
    vec4 b = u_inverseProjection * vec4(sampleUv * 2.0 - 1.0, 0.0, 1.0);
    vec3 origin = a.xyz / a.w;
    vec3 ray = b.xyz / b.w - origin;
    vec3 eye = origin + ray * ((-depth - origin.z) / ray.z);
    vec4 previousEye = u_previousFromCurrent * vec4(eye, 1.0);
    vec4 clip = u_previousProjection * previousEye;
    if (clip.w <= 0.0) { return; }
    vec2 previousUv = uv + (clip.xy / clip.w * 0.5 + 0.5 - sampleUv);
    vec2 border = 0.5 / size;
    if (any(lessThan(previousUv, border)) || any(greaterThan(previousUv, 1.0 - border))) { return; }
    // Color history is reconstructed at pixel centers, but depth history retains
    // the jittered surface samples. Project the actual depth sample into the old
    // jittered grid, rather than reading depth at the unjittered color coordinate.
    vec2 previousDepthUv = clip.xy / clip.w * 0.5 + 0.5 + u_previousJitter * 0.5;
    ivec2 depthBase = ivec2(floor(previousDepthUv * size - 0.5));
    float depthError = 1.0e30;
    // At a subpixel edge, either side may supply the nearest sample in each frame.
    // Accept a matching surface in the reconstruction footprint, without blending
    // foreground/background depths into a fictitious surface or widening tolerance.
    for (int y = 0; y < 2; ++y) {
        for (int x = 0; x < 2; ++x) {
            ivec2 location = clamp(depthBase + ivec2(x, y), ivec2(0), ivec2(size) - 1);
            float oldDepth = texelFetch(u_historyDepth, location, 0).r;
            if (oldDepth > 0.0) {
                depthError = min(depthError, abs(oldDepth + previousEye.z));
            }
        }
    }
    float tolerance = max(max(0.01, -previousEye.z * 0.002), depthFootprint);
    if (depthError > tolerance) { return; }

    mean *= 0.2;
    vec3 sigma = sqrt(abs(square * 0.2 - mean * mean));
    vec3 low = max(mix(low5, low9, 0.5), mean - sigma);
    vec3 high = min(mix(high5, high9, 0.5), mean + sigma);
    vec3 history = clipHistory(low, high, reconstructed, sampleHistory(previousUv, size));
    // Filament/Lottes: attenuate an inconsistent current sample after clipping has
    // rejected stale colors. Thin highlights should not dominate the accumulated
    // coverage merely because this frame's jitter happens to hit them.
    float currentWeight = 1.0 - u_historyWeight;
    if (u_historyWeight > 0.0) {
        float currentLuma = dot(reconstructed, vec3(0.2126, 0.7152, 0.0722));
        float historyLuma = dot(history, vec3(0.2126, 0.7152, 0.0722));
        float confidence = 1.0 - abs(currentLuma - historyLuma)
            / (0.001 + max(currentLuma, historyLuma));
        currentWeight *= confidence * confidence;
    }
    // Keep Filament's ordering: spatial reconstruction and clipping in linear RGB,
    // HDR compression only for temporal blending, then restore linear HDR radiance.
    vec3 result = mix(compressColor(history), compressColor(reconstructed), currentWeight);
    out_FragColor = vec4(expandColor(result), current.a);
}

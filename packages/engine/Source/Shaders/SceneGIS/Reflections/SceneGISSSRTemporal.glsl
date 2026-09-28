// Virtual-image reprojection follows AMD FidelityFX Reflection Denoiser v1.1.4.
// Copyright (C) 2024 Advanced Micro Devices, Inc. MIT; see Assets/SceneGIS/Reflections.
uniform sampler2D u_base;
uniform sampler2D u_coat;
uniform sampler2D u_metadata;
uniform sampler2D u_historyBase;
uniform sampler2D u_historyCoat;
uniform sampler2D u_historyGeometry;
uniform mat4 u_previousProjection;
uniform mat4 u_previousInverseProjection;
uniform mat4 u_previousFromCurrent;
uniform bool u_valid;
layout(location = 1) out vec4 sceneGISSSRCoat;
layout(location = 2) out vec4 sceneGISSSRGeometry;

vec3 sceneGISSSRCompress(vec3 color) { return color / (1.0 + max(color.r, max(color.g, color.b))); }
vec3 sceneGISSSRExpand(vec3 color) { return color / max(0.001, 1.0 - max(color.r, max(color.g, color.b))); }

vec3 sceneGISSSRPreviousPosition(vec2 pixel, float depth)
{
    vec2 ndc = pixel / vec2(textureSize(u_depth, 0)) * 2.0 - 1.0;
    vec4 a = u_previousInverseProjection * vec4(ndc, -1.0, 1.0);
    vec4 b = u_previousInverseProjection * vec4(ndc, 0.0, 1.0);
    vec3 p = a.xyz / a.w;
    vec3 q = b.xyz / b.w;
    return p + (q - p) * ((-depth - p.z) / (q.z - p.z));
}

vec4 sceneGISSSRHistory(sampler2D history, bool coat, vec3 virtualPosition,
    vec3 surface, vec3 normal, float roughness, float tolerance)
{
    vec4 h = u_previousProjection * u_previousFromCurrent * vec4(virtualPosition, 1.0);
    if (h.w <= 0.0) { return vec4(0.0); }
    vec2 uv = h.xy / h.w * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) { return vec4(0.0); }
    vec2 pixel = uv * vec2(textureSize(u_depth, 0)) / float(u_stride) - 0.5;
    ivec2 first = ivec2(floor(pixel));
    vec2 fraction = fract(pixel);
    vec3 sum = vec3(0.0);
    float total = 0.0;
    for (int y = 0; y < 2; ++y) {
        for (int x = 0; x < 2; ++x) {
            ivec2 tap = first + ivec2(x, y);
            if (any(lessThan(tap, ivec2(0))) || any(greaterThanEqual(tap, textureSize(history, 0)))) { continue; }
            vec4 geometry = texelFetch(u_historyGeometry, tap, 0);
            if (geometry.x <= 0.0) { continue; }
            float packedMaterial = mod(geometry.w, 65536.0);
            float oldRoughness = (coat ? floor(packedMaterial / 256.0) : mod(packedMaterial, 256.0)) / 255.0;
            vec3 oldNormal = sceneGISSSRUnpackNormal(coat ? geometry.z : geometry.y);
            if (dot(normal, oldNormal) < 0.96 || abs(oldRoughness - roughness) > 0.04) { continue; }
            ivec2 source = sceneGISSSRSourcePixel(tap, floor(geometry.w / 65536.0));
            vec3 oldPosition = sceneGISSSRPreviousPosition(vec2(source) + 0.5, geometry.x);
            float planeError = abs(dot(oldPosition - surface, normal));
            if (planeError > tolerance) { continue; }
            vec4 old = texelFetch(history, tap, 0);
            vec2 weightXY = mix(1.0 - fraction, fraction, vec2(x, y));
            float weight = weightXY.x * weightXY.y * old.a * (1.0 - smoothstep(tolerance * 0.5, tolerance, planeError));
            sum += sceneGISSSRCompress(old.rgb) * weight;
            total += weight;
        }
    }
    return vec4(sum / max(total, 0.00001), total);
}

vec4 sceneGISSSRTemporal(sampler2D current, sampler2D history, bool coat,
    vec3 position, vec4 ray, float distance)
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 value = texelFetch(current, pixel, 0);
    if (!u_valid || value.a <= 0.0) { return value; }
    vec3 mean = vec3(0.0);
    vec3 moment = vec3(0.0);
    float count = 0.0;
    for (int y = -1; y <= 1; ++y) {
        for (int x = -1; x <= 1; ++x) {
            ivec2 tap = clamp(pixel + ivec2(x, y), ivec2(0), textureSize(current, 0) - 1);
            vec4 neighbor = texelFetch(current, tap, 0);
            if (neighbor.a <= 0.0) { continue; }
            vec3 color = sceneGISSSRCompress(neighbor.rgb);
            mean += color;
            moment += color * color;
            count += 1.0;
        }
    }
    mean /= count;
    vec3 deviation = sqrt(max(moment / count - mean * mean, vec3(0.0)));
    vec3 compressed = sceneGISSSRCompress(value.rgb);
    vec3 lo = min(mean - 1.25 * deviation, compressed);
    vec3 hi = max(mean + 1.25 * deviation, compressed);
    vec3 normal = normalize(mat3(u_previousFromCurrent) * sceneGISSSRNormal(position, ray.xyz));
    vec3 surface = (u_previousFromCurrent * vec4(position, 1.0)).xyz;
    vec4 projected = czm_projection * vec4(position, 1.0);
    vec2 sourcePixel = (projected.xy / projected.w * 0.5 + 0.5) * vec2(textureSize(u_depth, 0));
    float tolerance = max(0.01, length(sceneGISSSRPosition(sourcePixel + vec2(float(u_stride), 0.0), -position.z) - position) * 1.5);
    vec3 view = normalize(position);
    vec4 parallax = sceneGISSSRHistory(history, coat, position + view * distance, surface, normal, ray.w, tolerance);
    vec4 previous = parallax;
    if (parallax.a < 0.1 || ray.w > 0.3) {
        vec4 receiver = sceneGISSSRHistory(history, coat, position, surface, normal, ray.w, tolerance);
        vec3 difference = receiver.rgb - mean;
        if (receiver.a > parallax.a && dot(difference, difference) <= 4.0 * dot(deviation, deviation)) { previous = receiver; }
    }
    vec3 clipped = clamp(previous.rgb, lo, hi);
    float weight = 0.85 * min(value.a, previous.a);
    return vec4(sceneGISSSRExpand(mix(compressed, clipped, weight)), value.a);
}

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 metadata = texelFetch(u_metadata, pixel, 0);
    ivec2 source = sceneGISSSRSourcePixel(pixel, metadata.z);
    float depth = texelFetch(u_depth, source, 0).r;
    out_FragColor = vec4(0.0);
    sceneGISSSRCoat = vec4(0.0);
    sceneGISSSRGeometry = vec4(0.0);
    if (depth <= 0.0) { return; }
    vec3 position = sceneGISSSRPosition(vec2(source) + 0.5, depth);
    vec4 base = texelFetch(u_baseRay, source, 0);
    vec4 coat = texelFetch(u_coatRay, source, 0);
    float baseNormal = dot(base.xyz, base.xyz) > 0.5 ? sceneGISSSRPackNormal(sceneGISSSRNormal(position, base.xyz)) : 0.0;
    float coatNormal = dot(coat.xyz, coat.xyz) > 0.5 ? sceneGISSSRPackNormal(sceneGISSSRNormal(position, coat.xyz)) : 0.0;
    float material = floor(base.w * 255.0 + 0.5) + floor(coat.w * 255.0 + 0.5) * 256.0;
    sceneGISSSRGeometry = vec4(depth, baseNormal, coatNormal, material + metadata.z * 65536.0);
    out_FragColor = sceneGISSSRTemporal(u_base, u_historyBase, false, position, base, metadata.x);
    sceneGISSSRCoat = sceneGISSSRTemporal(u_coat, u_historyCoat, true, position, coat, metadata.y);
}

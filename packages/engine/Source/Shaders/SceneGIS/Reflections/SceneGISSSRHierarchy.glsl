// Cell-boundary traversal adapted from AMD FidelityFX SDK v1.1.4, MIT.
// Copyright (C) 2024 Advanced Micro Devices, Inc. See Assets/SceneGIS/Reflections.
uniform sampler2D u_level1;
uniform sampler2D u_level2;
uniform sampler2D u_level3;
uniform sampler2D u_level4;
uniform sampler2D u_level5;
uniform sampler2D u_level6;
uniform sampler2D u_color;
uniform float u_maximumDistance;
uniform float u_thickness;
uniform float u_maximumRoughness;
uniform int u_stepCount;
uniform float u_rayNear;

float sceneGISSSRDepth(ivec2 pixel, int level)
{
    if (level == 0) { return texelFetch(u_depth, pixel, 0).r; }
    if (level == 1) { return texelFetch(u_level1, pixel, 0).r; }
    if (level == 2) { return texelFetch(u_level2, pixel, 0).r; }
    if (level == 3) { return texelFetch(u_level3, pixel, 0).r; }
    if (level == 4) { return texelFetch(u_level4, pixel, 0).r; }
    if (level == 5) { return texelFetch(u_level5, pixel, 0).r; }
    return texelFetch(u_level6, pixel, 0).r;
}

vec4 sceneGISSSRTrace(vec3 position, vec4 ray, out float hitDistance)
{
    hitDistance = 0.0;
    if (dot(ray.xyz, ray.xyz) < 0.5 || ray.w >= u_maximumRoughness) { return vec4(0.0); }
    vec2 size = vec2(textureSize(u_depth, 0));
    vec3 direction = normalize(ray.xyz);
    vec4 projected = czm_projection * vec4(position, 1.0);
    vec2 sourcePixel = (projected.xy / projected.w * 0.5 + 0.5) * size;
    float bias = max(0.002, 0.5 * length(sceneGISSSRPosition(sourcePixel + vec2(1.0, 0.0), -position.z) - position));
    vec3 start = position + sceneGISSSRNormal(position, direction) * bias;
    float distanceLimit = u_maximumDistance;
    if (direction.z > 0.0) { distanceLimit = min(distanceLimit, (-u_rayNear - start.z) / direction.z); }
    if (distanceLimit <= bias) { return vec4(0.0); }
    vec3 end = start + direction * distanceLimit;
    vec4 h0 = czm_projection * vec4(start, 1.0);
    vec4 h1 = czm_projection * vec4(end, 1.0);
    vec3 origin = h0.xyz / h0.w * 0.5 + 0.5;
    vec3 delta = h1.xyz / h1.w * 0.5 + 0.5 - origin;
    vec3 inverse = vec3(delta.x == 0.0 ? 1.0e30 : 1.0 / delta.x,
                        delta.y == 0.0 ? 1.0e30 : 1.0 / delta.y,
                        delta.z == 0.0 ? 1.0e30 : 1.0 / delta.z);
    vec2 floorOffset = step(vec2(0.0), delta.xy);
    vec2 epsilon = (floorOffset * 2.0 - 1.0) * 0.005 / size;
    vec2 firstBoundary = (floor(origin.xy * size) + floorOffset) / size + epsilon;
    vec2 firstT = (firstBoundary - origin.xy) * inverse.xy;
    float t = min(firstT.x, firstT.y);
    int level = 0;
    for (int i = 0; i < 256; ++i) {
        if (i >= u_stepCount || t > 1.0) { break; }
        vec3 samplePosition = origin + delta * t;
        if (any(lessThan(samplePosition.xy, vec2(0.0))) || any(greaterThanEqual(samplePosition.xy, vec2(1.0)))) { break; }
        float scale = exp2(float(level));
        vec2 cell = floor(samplePosition.xy * size / scale);
        float eyeDepth = sceneGISSSRDepth(ivec2(cell), level);
        vec4 surfaceProjection = czm_projection * vec4(0.0, 0.0, -eyeDepth, 1.0);
        float surface = eyeDepth > 0.0 && eyeDepth < 1.0e29 ? surfaceProjection.z / surfaceProjection.w * 0.5 + 0.5 : 1.0;
        vec2 boundary = (cell + floorOffset) * scale / size + epsilon;
        vec3 boundaryT = (vec3(boundary, surface) - origin) * inverse;
        if (delta.z <= 0.0) { boundaryT.z = 1.0e30; }
        float nextT = min(min(boundaryT.x, boundaryT.y), boundaryT.z);
        bool above = surface > samplePosition.z;
        bool skipped = above && nextT != boundaryT.z;
        if (above) { t = nextT; }
        if (skipped) { level = min(level + 1, 6); continue; }
        if (level > 0) { --level; continue; }
        vec2 uv = origin.xy + delta.xy * t;
        vec3 hit = mix(start / h0.w, end / h1.w, t) / mix(1.0 / h0.w, 1.0 / h1.w, t);
        float surfaceDepth = texture(u_depth, uv).r;
        float error = -hit.z - surfaceDepth;
        float travel = length(hit - position);
        vec2 pixelTravel = abs(uv * size - sourcePixel);
        if (surfaceDepth > 0.0 && error >= -0.001 && error <= u_thickness && travel > 4.0 * bias && max(pixelTravel.x, pixelTravel.y) > 2.0) {
            float edge = min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y));
            float confidence = smoothstep(0.0, 0.06, edge);
            confidence *= 1.0 - smoothstep(0.8 * u_maximumDistance, u_maximumDistance, travel);
            confidence *= 1.0 - smoothstep(0.5 * u_maximumRoughness, u_maximumRoughness, ray.w);
            confidence *= 1.0 - smoothstep(0.5 * u_thickness, u_thickness, max(0.0, error));
            float width = ray.w * ray.w * travel * abs(czm_projection[1][1]) * size.y * 0.5;
            if (czm_projection[3][3] == 0.0) { width /= max(surfaceDepth, 0.001); }
            vec4 color = textureLod(u_color, uv, log2(max(1.0, width)));
            hitDistance = travel;
            return vec4(color.rgb / max(color.a, 0.001), confidence * clamp(color.a, 0.0, 1.0));
        }
        // A foreground discontinuity is not a hit. Continue at the next full-depth cell.
        t = min(boundaryT.x, boundaryT.y);
        level = 0;
    }
    return vec4(0.0);
}

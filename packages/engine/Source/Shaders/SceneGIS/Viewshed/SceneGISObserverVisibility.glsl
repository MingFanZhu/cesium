uniform sampler2D u_surfaceDepth;
uniform sampler2D u_observerDepth;
uniform mat4 u_inverseMainProjection;
uniform mat4 u_viewToObserver;
uniform mat4 u_observerProjection;
uniform vec2 u_depthRange;
uniform float u_distance;
uniform float u_depthBias;
uniform bool u_analysisReady;
uniform bool u_mainPerspective;
uniform vec2 u_mainJitter;

// Returns coverage separately from visibility; missing depth never projects.
bool sceneGIS_observerVisibility(vec2 coordinates, out vec2 uv, out bool visible)
{
    float depth = texture(u_surfaceDepth, coordinates).r;
    if (!u_analysisReady || depth <= 0.0) {
        return false;
    }
    // The depth is a current-frame sample, before temporal reconstruction.
    vec4 ray = u_inverseMainProjection * vec4(coordinates * 2.0 - 1.0 - u_mainJitter, 0.0, 1.0);
    vec3 position = ray.xyz / ray.w;
    if (u_mainPerspective) {
        position *= depth / -position.z;
    } else {
        position.z = -depth;
    }
    vec3 observer = (u_viewToObserver * vec4(position, 1.0)).xyz;
    float forwardDepth = -observer.z;
    if (forwardDepth < u_depthRange.x || forwardDepth > u_depthRange.y ||
        length(observer) > u_distance) {
        return false;
    }
    vec4 clip = u_observerProjection * vec4(observer, 1.0);
    uv = clip.xy / clip.w * 0.5 + 0.5;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThanEqual(uv, vec2(1.0)))) {
        return false;
    }
    float stored = texture(u_observerDepth, uv).r;
    float blockerDepth = exp2(stored * log2(u_depthRange.y - u_depthRange.x + 1.0))
        + u_depthRange.x - 1.0;
    // Compare at the sampled texel center. Reciprocal eye depth is affine
    // across a planar receiver in perspective UV; this avoids shallow-angle
    // self-occlusion without increasing the metric tolerance.
    vec2 dx = dFdx(uv);
    vec2 dy = dFdy(uv);
    float reciprocalDepth = 1.0 / forwardDepth;
    float qx = dFdx(reciprocalDepth);
    float qy = dFdy(reciprocalDepth);
    float determinant = dx.x * dy.y - dx.y * dy.x;
    float comparisonDepth = forwardDepth;
    if (determinant != 0.0) {
        vec2 gradient = vec2(qx * dy.y - qy * dx.y, qy * dx.x - qx * dy.x) / determinant;
        vec2 size = vec2(textureSize(u_observerDepth, 0));
        vec2 center = (floor(uv * size) + 0.5) / size;
        float sampledReciprocalDepth = reciprocalDepth + dot(gradient, center - uv);
        if (sampledReciprocalDepth > 0.0) {
            comparisonDepth = 1.0 / sampledReciprocalDepth;
        }
    }
    visible = comparisonDepth <= blockerDepth + u_depthBias;
    return true;
}

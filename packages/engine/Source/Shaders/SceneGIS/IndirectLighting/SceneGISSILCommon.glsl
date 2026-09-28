uniform sampler2D u_depth;
uniform sampler2D u_source;
uniform sampler2D u_response;
uniform vec2 u_fullSize;
uniform float u_stride;
uniform float u_radius;

vec3 sceneGISSILPosition(vec2 pixel, float depth)
{
    // The fullscreen target may be half-sized; reconstruct in the main viewport.
    vec2 ndc = pixel / u_fullSize * 2.0 - 1.0;
    if (czm_inverseProjection == mat4(0.0)) {
        return vec3(mix(czm_frustumPlanes.z, czm_frustumPlanes.w, pixel.x / u_fullSize.x),
            mix(czm_frustumPlanes.y, czm_frustumPlanes.x, pixel.y / u_fullSize.y), -depth);
    }
    vec4 h = czm_inverseProjection * vec4(ndc, 0.0, 1.0);
    return h.xyz * (-depth / h.z);
}

vec3 sceneGISSILDecodeNormal(vec2 packed)
{
    vec2 oct = vec2(packed.x - 1.0, packed.y) * 2.0 - 1.0;
    vec3 n = vec3(oct, 1.0 - abs(oct.x) - abs(oct.y));
    float t = max(-n.z, 0.0);
    n.xy += vec2(n.x < 0.0 ? t : -t, n.y < 0.0 ? t : -t);
    return normalize(n);
}

ivec2 sceneGISSILPixel(ivec2 lowPixel)
{
    return clamp(ivec2((vec2(lowPixel) + 0.5) * u_stride), ivec2(0), ivec2(u_fullSize) - 1);
}

uniform sampler2D u_currentDepth;
uniform sampler2D u_linearDepth;
uniform float u_frustumTag;
uniform float u_pickNear;

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float depth = texelFetch(u_currentDepth, pixel, 0).r;
    vec2 surface = texelFetch(u_linearDepth, pixel, 0).rg;
    if (surface.x > 0.0 && abs(surface.y) == u_frustumTag) {
        // The opaque surface remains pickable after terrain-test depth clearing.
        #ifdef LOG_DEPTH_READ_ONLY
        float opaqueDepth = log2(max(1.0, surface.x - u_pickNear + 1.0))
            / log2(czm_currentFrustum.y - u_pickNear + 1.0);
        #else
        float far = czm_currentFrustum.y;
        float opaqueDepth = czm_projection[3][3] == 1.0
            ? (surface.x - u_pickNear) / (far - u_pickNear)
            : far * (1.0 - u_pickNear / surface.x) / (far - u_pickNear);
        #endif
        if (opaqueDepth > 0.0 && opaqueDepth < 1.0 && (depth <= 0.0 || opaqueDepth < depth)) {
            depth = opaqueDepth;
        }
    }
    out_FragColor = czm_packDepth(depth);
}

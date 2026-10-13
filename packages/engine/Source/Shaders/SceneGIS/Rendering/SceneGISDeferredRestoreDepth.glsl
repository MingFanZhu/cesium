uniform sampler2D u_linearDepth;
uniform sampler2D u_material;
uniform float u_frustumTag;
uniform bool u_clearGlobeDepth;
void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec2 surface = texelFetch(u_linearDepth, pixel, 0).rg;
    if (surface.x <= 0.0 || surface.y > u_frustumTag) {
        discard;
    }
    if (surface.y < u_frustumTag) {
        // A nearer opaque segment occludes transparency in every farther segment.
        gl_FragDepth = 0.0;
    } else {
        if (u_clearGlobeDepth && texelFetch(u_material, pixel, 0).a == -3.0) {
            discard;
        }
        #ifdef LOG_DEPTH_READ_ONLY
        gl_FragDepth = log2(max(1.0, surface.x - czm_currentFrustum.x + 1.0))
            / czm_log2FarDepthFromNearPlusOne;
        #else
        vec4 clip = czm_projection * vec4(0.0, 0.0, -surface.x, 1.0);
        gl_FragDepth = clamp(0.5 * (clip.z / clip.w + 1.0), 0.0, 1.0);
        #endif
    }
    out_FragColor = vec4(0.0);
}

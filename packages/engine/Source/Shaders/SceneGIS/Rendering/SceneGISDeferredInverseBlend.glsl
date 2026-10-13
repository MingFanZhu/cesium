uniform sampler2D u_color;
uniform sampler2D u_linearDepth;
uniform bool u_logDepth;
void main()
{
    ivec2 p = ivec2(gl_FragCoord.xy);
    vec4 color = texelFetch(u_color, p, 0);
    float depth = texelFetch(u_linearDepth, p, 0).r;
    if (depth < czm_currentFrustum.x || depth > czm_currentFrustum.y) {
        discard;
    }
    #ifndef SCENEGIS_INVERSE_PACK_DEPTH
    if (color.a == 0.0) {
        discard;
    }
    #endif
    float nativeDepth;
    if (u_logDepth) {
        nativeDepth = log2(max(1.0, depth - czm_currentFrustum.x + 1.0))
            / czm_log2FarDepthFromNearPlusOne;
    } else {
        vec4 clip = czm_projection * vec4(0.0, 0.0, -depth, 1.0);
        nativeDepth = clamp(0.5 * (clip.z / clip.w + 1.0), 0.0, 1.0);
    }
    #ifdef SCENEGIS_INVERSE_PACK_DEPTH
    out_FragColor = czm_packDepth(nativeDepth);
    #else
    out_FragColor = color * czm_invertClassificationColor;
    gl_FragDepth = nativeDepth;
    #endif
}

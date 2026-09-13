uniform sampler2D u_symbolAtlas;
uniform vec2 u_symbolDepthRange;
in vec2 v_uv;
in vec4 v_color;
in vec4 v_haloColor;
in vec3 v_parameters;
in vec4 v_pickColor;
in float v_eyeDepth;
#ifdef SCENEGIS_VECTOR_TERRAIN_ANCHOR
in float v_groundVisibility;
#endif
void main()
{
    if (v_eyeDepth <= u_symbolDepthRange.x || v_eyeDepth > u_symbolDepthRange.y) discard;
#ifdef SCENEGIS_VECTOR_TERRAIN_ANCHOR
    if (v_groundVisibility < 0.5) discard;
#endif
    vec4 sampleColor = texture(u_symbolAtlas, v_uv);
    vec4 color = czm_gammaCorrect(v_color);
    color.rgb *= color.a;
    if (v_parameters.x > 0.0) {
        float distance = (sampleColor.r - 0.75) * 8.0 * v_parameters.x;
        float aa = max(0.5 / czm_pixelRatio, fwidth(distance) * 0.5);
        float fill = smoothstep(-aa, aa, distance);
        float halo = smoothstep(-v_parameters.y - aa - v_parameters.z, -v_parameters.y + aa, distance);
        vec4 haloColor = czm_gammaCorrect(v_haloColor);
        haloColor.rgb *= haloColor.a;
        out_FragColor = color * fill + haloColor * max(0.0, halo - fill);
    } else {
        sampleColor = czm_gammaCorrect(sampleColor);
        sampleColor.rgb *= sampleColor.a;
        out_FragColor = sampleColor * color;
    }
    if (out_FragColor.a < 0.01) discard;
}

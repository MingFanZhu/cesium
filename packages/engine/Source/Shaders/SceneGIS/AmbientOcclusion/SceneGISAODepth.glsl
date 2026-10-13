uniform sampler2D u_depth;
#ifdef SCENEGIS_DEFERRED_SURFACE_DEPTH
uniform sampler2D u_sceneGISDeferredMaterial;
uniform bool u_sceneGISDeferredSkipGlobe;
#endif
in vec2 v_textureCoordinates;
void main()
{
    #ifdef SCENEGIS_DEFERRED_SURFACE_DEPTH
    float material = texelFetch(u_sceneGISDeferredMaterial, ivec2(gl_FragCoord.xy), 0).a;
    if (material == 0.0 || (u_sceneGISDeferredSkipGlobe && material == -3.0)) { discard; }
    #endif
    float depth = texture(u_depth, gl_FragCoord.xy / vec2(textureSize(u_depth, 0))).r;
    if (depth >= 1.0) { discard; }
    vec4 eye = czm_windowToEyeCoordinates(gl_FragCoord.xy, depth);
    out_FragColor = vec4(-eye.z / eye.w, 0.0, 0.0, 1.0);
}

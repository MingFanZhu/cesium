#ifdef SCENEGIS_VECTOR_SYMBOL
uniform sampler2D u_sceneGISVectorTerrainDepth;
uniform bool u_sceneGISVectorHasTerrainDepth;
#endif
float sceneGISAnchorVisibility(vec4 clip, float eyeDepth)
{
    if (clip.w <= 0.0 || eyeDepth <= czm_currentFrustum.x || eyeDepth > czm_currentFrustum.y) return 0.0;
    vec2 windowXY = (clip.xy / clip.w * 0.5 + 0.5) * czm_viewport.zw + czm_viewport.xy;
    vec2 base = floor(windowXY - 0.5) + 0.5;
    float farthest = 0.0;
    // A pixel samples one terrain location. Use the four surrounding samples to
    // avoid self-occluding an anchor between pixel centres on a sloping surface.
    for (int y = 0; y < 2; y++) {
        for (int x = 0; x < 2; x++) {
            vec2 pixel = base + vec2(float(x), float(y));
            if (any(lessThan(pixel, czm_viewport.xy)) || any(greaterThanEqual(pixel, czm_viewport.xy + czm_viewport.zw))) continue;
#ifdef SCENEGIS_VECTOR_SYMBOL
            if (u_sceneGISVectorHasTerrainDepth) {
                farthest = max(farthest, texelFetch(u_sceneGISVectorTerrainDepth, ivec2(pixel), 0).r);
                continue;
            }
#endif
#ifdef SCENEGIS_VECTOR_PLANAR_TRANSPARENT
            float depth = texture(u_sceneGISPlanarVectorDepth, pixel / czm_viewport.zw).r;
#else
            float depth = czm_unpackDepth(texture(czm_globeDepthTexture, pixel / czm_viewport.zw));
#endif
            if (depth == 0.0 || depth == 1.0) continue;
#ifdef SCENEGIS_VECTOR_PLANAR_TRANSPARENT
            vec4 eye = sceneGISPlanarVectorEye(pixel, depth);
#else
            vec4 eye = czm_windowToEyeCoordinates(pixel, depth);
#endif
            farthest = max(farthest, -eye.z / eye.w);
        }
    }
    // Account for float reconstruction roundoff, without lifting the geometry.
    return eyeDepth <= farthest * (1.0 + 1.0e-6) ? 1.0 : 0.0;
}

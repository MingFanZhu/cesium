// SCENEGIS_PATCH_BEGIN SGP-0045: Preserve the native unlit silhouette in material capture.
#ifdef SCENEGIS_DEFERRED_CAPTURE
void sceneGISRecordUnlitModelColor(vec3 color);
#endif
// SCENEGIS_PATCH_END SGP-0045
void silhouetteStage(inout vec4 color) {
    if(model_silhouettePass) {
        color = czm_gammaCorrect(model_silhouetteColor);
        // SCENEGIS_PATCH_BEGIN SGP-0045: Keep silhouette color outside surface BRDF evaluation.
        #ifdef SCENEGIS_DEFERRED_CAPTURE
        sceneGISRecordUnlitModelColor(color.rgb);
        #endif
        // SCENEGIS_PATCH_END SGP-0045
    }
}
// SCENEGIS_PATCH_BEGIN SGP-0048: Capture the native post-lighting feature multiplier.
#ifdef SCENEGIS_DEFERRED_CAPTURE
void sceneGISRecordFeatureStyle(vec3 multiplier);
#endif
// SCENEGIS_PATCH_END SGP-0048
void filterByPassType(vec4 featureColor)
{
    bool styleTranslucent = (featureColor.a != 1.0);
    // Only render translucent features in the translucent pass (if the style or the original command has translucency).
    if (czm_pass == czm_passTranslucent && !styleTranslucent && !model_commandTranslucent)
    {   
        // If the model has a translucent silhouette, it needs to render during the silhouette color command,
        // (i.e. the command where model_silhouettePass = true), even if the model isn't translucent.
        #ifdef HAS_SILHOUETTE
        if(!model_silhouettePass) {
            discard;
        }
        #else
        discard;
        #endif
    }
    // If the current pass is not the translucent pass and the style is not translucent, don't render the feature.
    else if (czm_pass != czm_passTranslucent && styleTranslucent)
    {
        discard;
    }
}

void cpuStylingStage(inout czm_modelMaterial material, SelectedFeature feature)
{
    vec4 featureColor = feature.color;
    if (featureColor.a == 0.0)
    {
        discard;
    }

    // If a feature ID vertex attribute is used, the pass type filter is applied in the vertex shader.
    // So, we only apply in in the fragment shader if the feature ID texture is used.
    #if defined(HAS_SELECTED_FEATURE_ID_TEXTURE) && !defined(HAS_CLASSIFICATION)
    filterByPassType(featureColor);
    #endif

    featureColor = czm_gammaCorrect(featureColor);

    // Classification models compute the diffuse differently.
    #ifdef HAS_CLASSIFICATION
    material.diffuse = featureColor.rgb * featureColor.a;
    #else
    float highlight = ceil(model_colorBlend);
    // SCENEGIS_PATCH_BEGIN SGP-0048: Preserve feature color across deferred material and lighting passes.
    #ifdef SCENEGIS_DEFERRED_CAPTURE
    sceneGISRecordFeatureStyle(mix(featureColor.rgb, vec3(1.0), highlight));
    #endif
    // SCENEGIS_PATCH_END SGP-0048
    // SCENEGIS_PATCH_BEGIN SGP-0026: Preserve feature styling in diffuse transport.
    #ifdef SCENEGIS_SSIL_MAIN
    sceneGISSILScale(mix(featureColor.rgb, vec3(1.0), highlight));
    #endif
    // SCENEGIS_PATCH_END SGP-0026
    material.diffuse *= mix(featureColor.rgb, vec3(1.0), highlight);
    // SCENEGIS_PATCH_BEGIN SGP-0016: Style reflection response with the same linear color multiplier.
    #ifdef SCENEGIS_SSR_MAIN
    sceneGISSSRScale(mix(featureColor.rgb, vec3(1.0), highlight));
    #endif
    // SCENEGIS_PATCH_END SGP-0016
    // SCENEGIS_PATCH_BEGIN SGP-0014: Preserve feature styling in the indirect-only correction.
    #ifdef SCENEGIS_AO_MAIN
    sceneGISScaleIndirect(mix(featureColor.rgb, vec3(1.0), highlight));
    #endif
    // SCENEGIS_PATCH_END SGP-0014
    #endif
    
    material.alpha *= featureColor.a;
}

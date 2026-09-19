void modelColorStage(inout czm_modelMaterial material)
{
    material.diffuse = mix(material.diffuse, model_color.rgb, model_colorBlend);
    float highlight = ceil(model_colorBlend);
    material.diffuse *= mix(model_color.rgb, vec3(1.0), highlight);
    // SCENEGIS_PATCH_BEGIN SGP-0016: Carry model color blending into the material reflection response.
    #ifdef SCENEGIS_SSR_MAIN
    sceneGISSSRScale((1.0 - model_colorBlend) * mix(model_color.rgb, vec3(1.0), highlight));
    #endif
    // SCENEGIS_PATCH_END SGP-0016
    // SCENEGIS_PATCH_BEGIN SGP-0014: Apply the same linear color response to captured indirect energy.
    #ifdef SCENEGIS_AO_MAIN
    sceneGISScaleIndirect((1.0 - model_colorBlend) * mix(model_color.rgb, vec3(1.0), highlight));
    #endif
    // SCENEGIS_PATCH_END SGP-0014
    material.alpha *= model_color.a;
}

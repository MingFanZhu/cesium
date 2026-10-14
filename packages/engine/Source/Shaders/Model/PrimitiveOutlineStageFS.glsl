// SCENEGIS_PATCH_BEGIN SGP-0045: Capture outline coverage for post-lighting composition.
#ifdef SCENEGIS_DEFERRED_CAPTURE
void sceneGISRecordModelOutline(float coverage);
#endif
// SCENEGIS_PATCH_END SGP-0045
void primitiveOutlineStage(inout czm_modelMaterial material) {
    if (!model_showOutline) {
        return;
    }

    float outlineX = 
        texture(model_outlineTexture, vec2(v_outlineCoordinates.x, 0.5)).r;
    float outlineY = 
        texture(model_outlineTexture, vec2(v_outlineCoordinates.y, 0.5)).r;
    float outlineZ = 
        texture(model_outlineTexture, vec2(v_outlineCoordinates.z, 0.5)).r;
    float outlineness = max(outlineX, max(outlineY, outlineZ));

    // SCENEGIS_PATCH_BEGIN SGP-0045: Reuse native outline evaluation without another geometry pass.
    #ifdef SCENEGIS_DEFERRED_CAPTURE
    sceneGISRecordModelOutline(outlineness);
    #endif
    // SCENEGIS_PATCH_END SGP-0045
    material.diffuse = mix(material.diffuse, model_outlineColor.rgb, model_outlineColor.a * outlineness);
}

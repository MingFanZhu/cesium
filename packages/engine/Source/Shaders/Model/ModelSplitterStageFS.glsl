void modelSplitterStage()
{
    // Don't split when rendering the shadow map, because it is rendered from
    // the perspective of a totally different camera.
#ifndef SHADOW_MAP
    // SCENEGIS_PATCH_BEGIN SGP-0071: Support both split axes without splitting shadows.
    if (!czm_SceneGISSplitVisible(model_splitDirection)) discard;
    // SCENEGIS_PATCH_END SGP-0071
#endif
}

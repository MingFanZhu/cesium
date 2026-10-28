//
// Fragment shader for Gaussian splats.
// Renders a Gaussian splat within a quad, discarding fragments outside the unit circle.
// Applies an approximate Gaussian falloff based on distance from the center and outputs
// a color modulated by the alpha and Gaussian weight.
//
void main() {
    // SCENEGIS_PATCH_BEGIN SGP-0071: Share native split-axis semantics.
    if (!czm_SceneGISSplitVisible(v_splitDirection)) discard;
    // SCENEGIS_PATCH_END SGP-0071

    float A = -dot(v_vertPos, v_vertPos);
    if (A < -4.) {
        discard;
    }

    float B = exp(A * 4.) * v_splatColor.a ;
    out_FragColor = vec4(v_splatColor.rgb * B , B);
}

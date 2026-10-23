uniform mat4 u_sceneGISClippingInverseView;
out vec3 v_clippingPosition;

void modelClippingPolygonsStage(ProcessedAttributes attributes)
{
    // Use the final position, including node, instance and custom transforms.
    // The inverse-view translation is rebased on the CPU before Float32 upload.
    v_clippingPosition = (u_sceneGISClippingInverseView * vec4(v_positionEC, 1.0)).xyz;
}

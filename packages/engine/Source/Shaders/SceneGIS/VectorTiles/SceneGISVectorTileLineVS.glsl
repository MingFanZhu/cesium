// Compatibility bridge for the accepted flat V2 stroke. See ADR-0061.
// The dedicated MapLibre-style stroke replaces this bridge in V3B1.
in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 prevPosition3DHigh;
in vec3 prevPosition3DLow;
in vec3 nextPosition3DHigh;
in vec3 nextPosition3DLow;
in vec2 expandAndWidth;
in vec4 color;
out vec4 v_color;
#ifdef SCENEGIS_VECTOR_PICKING
in vec4 pickColor;
out vec4 v_pickColor;
#endif

void main()
{
    float unusedAngle;
    gl_Position = czm_viewportOrthographic * getPolylineWindowCoordinates(
        czm_translateRelativeToEye(position3DHigh, position3DLow),
        czm_translateRelativeToEye(prevPosition3DHigh, prevPosition3DLow),
        czm_translateRelativeToEye(nextPosition3DHigh, nextPosition3DLow),
        expandAndWidth.x, abs(expandAndWidth.y) + 0.5,
        expandAndWidth.y < 0.0, unusedAngle);
    v_color = color;
#ifdef SCENEGIS_VECTOR_PICKING
    v_pickColor = pickColor;
#endif
}

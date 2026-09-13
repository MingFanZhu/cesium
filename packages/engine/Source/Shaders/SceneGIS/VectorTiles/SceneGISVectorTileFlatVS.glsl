in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
out vec4 v_color;
#ifdef SCENEGIS_VECTOR_PICKING
in vec4 pickColor;
out vec4 v_pickColor;
#endif

void main()
{
    gl_Position = czm_modelViewProjectionRelativeToEye *
        czm_translateRelativeToEye(position3DHigh, position3DLow);
    v_color = color;
#ifdef SCENEGIS_VECTOR_PICKING
    v_pickColor = pickColor;
#endif
}

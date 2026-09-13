in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
out vec4 v_color;
#ifdef SCENEGIS_VECTOR_FRINGE
in vec3 fringe;
uniform float u_sceneGISVectorMetersPerPixel;
out float v_fringe;
#endif
#ifdef SCENEGIS_VECTOR_PICKING
in vec4 pickColor;
out vec4 v_pickColor;
#endif

void main()
{
    vec4 p = czm_translateRelativeToEye(position3DHigh, position3DLow);
#ifdef SCENEGIS_VECTOR_FRINGE
    p.xy += fringe.xy * u_sceneGISVectorMetersPerPixel / czm_pixelRatio;
    v_fringe = fringe.z;
#endif
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
    gl_Position.z = clamp(gl_Position.z, -gl_Position.w, gl_Position.w);
    v_color = color;
#ifdef SCENEGIS_VECTOR_PICKING
    v_pickColor = pickColor;
#endif
}

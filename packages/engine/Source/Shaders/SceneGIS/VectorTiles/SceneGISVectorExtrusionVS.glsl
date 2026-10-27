in vec3 position3DHigh;
in vec3 position3DLow;
in vec3 normal;
in vec2 vectorAnchor;
in float extrusionGradient;
in vec4 color;
out vec4 v_color;
#ifdef SCENEGIS_VECTOR_PBR
in vec3 materialCoordinate;
out vec3 v_materialCoordinate;
#endif
#ifdef SCENEGIS_VECTOR_PATTERN
in vec4 patternRect;
in vec2 patternSize;
in vec3 patternCoordinate;
out vec4 v_patternRect;
out vec2 v_patternSize;
out vec3 v_patternCoordinate;
#endif
out vec2 v_local;
out vec3 v_positionEC;
out vec3 v_normalEC;
out float v_gradient;
#ifdef SCENEGIS_VECTOR_PICKING
in vec4 pickColor;
out vec4 v_pickColor;
#endif

void main()
{
    vec4 p = czm_translateRelativeToEye(position3DHigh, position3DLow);
    gl_Position = czm_modelViewProjectionRelativeToEye * p;
    v_positionEC = (czm_modelViewRelativeToEye * p).xyz;
    v_normalEC = czm_normal * normal;
    v_local = vectorAnchor;
    v_gradient = extrusionGradient;
    v_color = color;
#ifdef SCENEGIS_VECTOR_PBR
    v_materialCoordinate = materialCoordinate;
#endif
#ifdef SCENEGIS_VECTOR_PATTERN
    v_patternRect = patternRect;
    v_patternSize = patternSize;
    v_patternCoordinate = patternCoordinate;
#endif
#ifdef SCENEGIS_VECTOR_PICKING
    v_pickColor = pickColor;
#endif
}

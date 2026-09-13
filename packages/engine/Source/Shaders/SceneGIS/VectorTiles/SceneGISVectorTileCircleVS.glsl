in vec3 position3DHigh;
in vec3 position3DLow;
in vec4 color;
in vec2 corner;
in vec3 dimensions;
in vec4 strokeColor;
#ifdef SCENEGIS_VECTOR_GLOBE
in vec2 vectorAnchor;
#endif
out vec4 v_color;
out vec2 v_circleCoordinate;
out vec3 v_dimensions;
out vec4 v_strokeColor;
#ifdef SCENEGIS_VECTOR_TERRAIN_ANCHOR
out vec2 v_anchorLocal;
out float v_anchorDepth;
out float v_groundVisibility;
#endif
#ifdef SCENEGIS_VECTOR_PICKING
in vec4 pickColor;
out vec4 v_pickColor;
#endif

void main()
{
    vec4 p = czm_modelViewProjectionRelativeToEye *
        czm_translateRelativeToEye(position3DHigh, position3DLow);
#ifdef SCENEGIS_VECTOR_TERRAIN_ANCHOR
#ifdef SCENEGIS_VECTOR_GLOBE
    v_anchorLocal = vectorAnchor;
#else
    v_anchorLocal = position3DHigh.xy + position3DLow.xy;
#endif
    v_anchorDepth = -(czm_modelViewRelativeToEye * czm_translateRelativeToEye(position3DHigh, position3DLow)).z;
    v_groundVisibility = sceneGISAnchorVisibility(p, v_anchorDepth);
#endif
    float extent = dimensions.x + dimensions.y + 1.0 / czm_pixelRatio;
    p.xy += corner * extent * czm_pixelRatio * 2.0 / czm_viewport.zw * p.w;
    gl_Position = p;
    gl_Position.z = clamp(gl_Position.z, -gl_Position.w, gl_Position.w);
    v_color = color;
    v_circleCoordinate = corner * extent;
    v_dimensions = dimensions;
    v_strokeColor = strokeColor;
#ifdef SCENEGIS_VECTOR_PICKING
    v_pickColor = pickColor;
#endif
}

in vec3 position;
in vec2 normal;
out vec2 v_textureCoordinates;
#ifdef SCENEGIS_CLIPPING
out vec3 v_clippingPosition;
uniform vec3 u_clippingOffset;
uniform vec3 u_clippingScale;
#endif
out vec3 v_normalEC;
#if defined(SHADOW_MAP) || defined(SCENEGIS_MATERIAL) || defined(SCENEGIS_ADVANCED_LIGHTING)
out vec3 v_positionEC;
#endif
#ifdef SCENEGIS_MATERIAL
out vec3 v_positionWC;
out vec3 v_normalWC;
#endif

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
#ifdef SCENEGIS_CLIPPING
    v_clippingPosition = position * u_clippingScale + u_clippingOffset;
#endif
    // Worker oct normals are fixed planar world-axis vectors.
#ifdef SCENEGIS_MATERIAL
    vec3 normalWC = czm_octDecode(normal);
    v_normalEC = czm_viewRotation * normalWC;
    v_positionWC = (czm_model * vec4(position, 1.0)).xyz;
    v_normalWC = normalWC;
#else
    v_normalEC = czm_viewRotation * czm_octDecode(normal);
#endif
#if defined(SHADOW_MAP) || defined(SCENEGIS_MATERIAL) || defined(SCENEGIS_ADVANCED_LIGHTING)
    v_positionEC = (czm_modelView * vec4(position, 1.0)).xyz;
#endif
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}

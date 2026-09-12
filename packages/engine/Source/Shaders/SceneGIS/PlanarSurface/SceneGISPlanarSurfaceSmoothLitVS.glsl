in vec3 position;
in vec2 normal;
out vec2 v_textureCoordinates;
out vec3 v_normalEC;
#ifdef SCENEGIS_MATERIAL
out vec3 v_positionEC;
out vec3 v_positionWC;
out vec3 v_normalWC;
#endif

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
    // Worker oct normals are fixed planar world-axis vectors.
#ifdef SCENEGIS_MATERIAL
    vec3 normalWC = czm_octDecode(normal);
    v_normalEC = czm_viewRotation * normalWC;
    v_positionEC = (czm_modelView * vec4(position, 1.0)).xyz;
    v_positionWC = (czm_model * vec4(position, 1.0)).xyz;
    v_normalWC = normalWC;
#else
    v_normalEC = czm_viewRotation * czm_octDecode(normal);
#endif
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}

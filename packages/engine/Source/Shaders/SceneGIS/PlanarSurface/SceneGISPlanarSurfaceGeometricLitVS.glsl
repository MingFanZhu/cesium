in vec3 position;
out vec2 v_textureCoordinates;
out vec3 v_positionEC;
#ifdef SCENEGIS_MATERIAL
out vec3 v_positionWC;
#endif

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
    v_positionEC = (czm_modelView * vec4(position, 1.0)).xyz;
#ifdef SCENEGIS_MATERIAL
    v_positionWC = (czm_model * vec4(position, 1.0)).xyz;
#endif
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}

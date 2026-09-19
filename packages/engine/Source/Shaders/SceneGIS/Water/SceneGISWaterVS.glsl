in vec3 position;
out vec3 v_positionEC;
out vec2 v_waterPosition;
void main()
{
    vec4 p = czm_modelView * vec4(position, 1.0);
    v_positionEC = p.xyz;
    v_waterPosition = position.xy;
    gl_Position = czm_projection * p;
}

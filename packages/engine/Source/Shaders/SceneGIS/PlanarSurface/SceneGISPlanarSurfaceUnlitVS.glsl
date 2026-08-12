in vec3 position;
out vec2 v_textureCoordinates;

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}

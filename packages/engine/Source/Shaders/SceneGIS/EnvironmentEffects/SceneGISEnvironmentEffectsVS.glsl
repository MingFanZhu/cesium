in vec2 position;

out vec2 v_textureCoordinates;

void main()
{
    v_textureCoordinates = position * 0.5 + 0.5;
    gl_Position = vec4(position, 0.0, 1.0);
}

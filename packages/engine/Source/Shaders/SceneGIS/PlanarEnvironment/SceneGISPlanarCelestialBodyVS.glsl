in vec2 position;

uniform vec2 u_center;
uniform vec2 u_scale;

out vec2 v_discCoordinates;

void main()
{
    v_discCoordinates = position;
    gl_Position = vec4(u_center + position * u_scale, 0.0, 1.0);
}

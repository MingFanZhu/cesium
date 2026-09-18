in vec4 position;
uniform int u_face;
out vec3 v_textureCoordinates;

void main()
{
    vec2 p = position.xy;
    if (u_face == 0) v_textureCoordinates = vec3(1.0, -p.y, -p.x);
    else if (u_face == 1) v_textureCoordinates = vec3(-1.0, -p.y, p.x);
    else if (u_face == 2) v_textureCoordinates = vec3(p.x, 1.0, p.y);
    else if (u_face == 3) v_textureCoordinates = vec3(p.x, -1.0, -p.y);
    else if (u_face == 4) v_textureCoordinates = vec3(p.x, -p.y, 1.0);
    else v_textureCoordinates = vec3(-p.x, -p.y, -1.0);
    gl_Position = position;
}

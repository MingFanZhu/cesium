in vec3 position;
in vec2 normal;
out vec2 v_textureCoordinates;
out vec3 v_normalEC;

void main()
{
    v_textureCoordinates = position.xy + vec2(0.5);
    // Worker oct normals are fixed planar world-axis vectors.
    v_normalEC = czm_viewRotation * czm_octDecode(normal);
    gl_Position = czm_modelViewProjection * vec4(position, 1.0);
}

uniform sampler2D colorTexture;
uniform sampler2D u_occlusion;
uniform bool ambientOcclusionOnly;
in vec2 v_textureCoordinates;
void main()
{
    vec4 color = texture(colorTexture, v_textureCoordinates);
    float ao = texture(u_occlusion, v_textureCoordinates).r;
    out_FragColor = ambientOcclusionOnly ? vec4(vec3(ao), 1.0) : color;
}

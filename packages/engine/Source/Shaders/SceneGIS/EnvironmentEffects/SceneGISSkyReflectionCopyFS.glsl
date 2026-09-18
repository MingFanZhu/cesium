in vec3 v_textureCoordinates;
uniform samplerCube u_radianceTexture;
void main()
{
    out_FragColor = texture(u_radianceTexture, normalize(v_textureCoordinates));
}

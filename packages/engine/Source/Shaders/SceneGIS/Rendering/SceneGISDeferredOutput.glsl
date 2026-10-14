uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;

void main()
{
    vec4 color = texture(colorTexture, v_textureCoordinates);
    color.rgb = pow(clamp(color.rgb, 0.0, 1.0), vec3(1.0 / czm_gamma));
    out_FragColor = color;
}

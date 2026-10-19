uniform sampler2D colorTexture;
in vec2 v_textureCoordinates;

void main()
{
    vec4 color = texture(colorTexture, v_textureCoordinates);
#ifdef SCENEGIS_COLOR_GRADING
    color.rgb = sceneGIS_gradeColor(color.rgb);
#endif
    color.rgb = pow(clamp(color.rgb, 0.0, 1.0), vec3(1.0 / czm_gamma));
    out_FragColor = color;
}

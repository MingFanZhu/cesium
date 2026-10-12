uniform sampler2D colorTexture;

in vec2 v_textureCoordinates;

#ifdef AUTO_EXPOSURE
uniform sampler2D autoExposure;
#else
uniform float exposure;
#endif

void main()
{
    vec4 fragmentColor = texture(colorTexture, v_textureCoordinates);
    vec3 color = fragmentColor.rgb;

#ifdef AUTO_EXPOSURE
    color /= texture(autoExposure, vec2(0.5)).r;
#else
    color *= vec3(exposure);
#endif
    // SCENEGIS_PATCH_BEGIN SGP-0044: Grade exposed HDR before the native tone curve.
#ifdef SCENEGIS_COLOR_GRADING
    color = sceneGIS_gradeColor(color);
#endif
    // SCENEGIS_PATCH_END SGP-0044
    color = czm_acesTonemapping(color);
    color = czm_inverseGamma(color);

    out_FragColor = vec4(color, fragmentColor.a);
}

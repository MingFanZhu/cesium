uniform sampler2D colorTexture;
uniform float contrast;
uniform float brightness;

in vec2 v_textureCoordinates;

void main(void)
{
    vec3 sceneColor = texture(colorTexture, v_textureCoordinates).xyz;
    sceneColor = czm_RGBToHSB(sceneColor);
    sceneColor.z += brightness;
    sceneColor = czm_HSBToRGB(sceneColor);

    float factor = (259.0 * (contrast + 255.0)) / (255.0 * (259.0 - contrast));
    sceneColor = factor * (sceneColor - vec3(0.5)) + vec3(0.5);
    // SCENEGIS_PATCH_BEGIN SGP-0020: Floating-point bloom targets must not carry negative light energy.
    out_FragColor = vec4(max(sceneColor, vec3(0.0)), 1.0);
    // SCENEGIS_PATCH_END SGP-0020
}

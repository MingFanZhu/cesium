in vec4 v_color;

void main()
{
    out_FragColor = czm_gammaCorrect(v_color);
    out_FragColor.rgb *= out_FragColor.a;
    czm_writeDepthClamp();
}

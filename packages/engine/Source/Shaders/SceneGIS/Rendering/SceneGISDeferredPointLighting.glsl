void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    if (texelFetch(u_sceneGISDeferredSpecular, pixel, 0).a != u_sceneGISDeferredGroup) {
        discard;
    }
    vec4 color = texelFetch(u_sceneGISDeferredDiffuse, pixel, 0);
    vec4 normal = texelFetch(u_sceneGISDeferredNormal, pixel, 0);
    if (normal.w == 0.0) {
        float strength = max(czm_getLambertDiffuse(czm_lightDirectionEC, normal.xyz), 0.4);
        color.rgb = czm_gammaCorrect(color.rgb * strength * czm_lightColor);
    }
    color.rgb *= texelFetch(u_sceneGISDeferredEmission, pixel, 0).a;
    out_FragColor = color;
}

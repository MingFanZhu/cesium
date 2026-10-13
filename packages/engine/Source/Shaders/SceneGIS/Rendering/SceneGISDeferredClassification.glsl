uniform sampler2D u_sceneGISClassification;

void main()
{
    sceneGISClassifiedLightingMain();
    vec4 overlay = texelFetch(u_sceneGISClassification, ivec2(gl_FragCoord.xy), 0);
    // Negative alpha marks an unclassified Tiles multiplier, disjoint from overlays.
    vec3 response;
    if (overlay.a < 0.0) {
        response = overlay.rgb;
        out_FragColor.rgb *= response;
    } else {
        response = vec3(1.0 - overlay.a);
        out_FragColor = overlay + out_FragColor * (1.0 - overlay.a);
    }
    #ifdef SCENEGIS_AO_MAIN
    sceneGISScaleIndirect(response);
    #endif
    #ifdef SCENEGIS_SSR_MAIN
    sceneGISSSRScale(response);
    #endif
    #ifdef SCENEGIS_SSIL_MAIN
    sceneGISSILScale(response);
    #endif
}

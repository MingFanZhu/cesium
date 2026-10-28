void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    if (texelFetch(u_sceneGISDeferredSpecular, pixel, 0).a != u_sceneGISDeferredGroup) {
        discard;
    }
    vec3 albedo = texelFetch(u_sceneGISDeferredDiffuse, pixel, 0).rgb;
    vec3 normalEC = normalize(texelFetch(u_sceneGISDeferredNormal, pixel, 0).xyz);
    float depth = texelFetch(u_linearDepth, pixel, 0).r;
    vec3 positionEC = sceneGISAOPosition(gl_FragCoord.xy, depth);
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
    vec3 color = vectorSurfaceRadiance(albedo, positionEC, normalEC);
#else
    vec3 color = albedo * (0.35 + 0.65 * max(dot(normalEC, czm_lightDirectionEC), 0.0) * czm_lightColor);
    #ifdef SCENEGIS_AO_MAIN
    sceneGISRecordIndirect(albedo * 0.35);
    #endif
#endif
    out_FragColor = vec4(color, 1.0);
}

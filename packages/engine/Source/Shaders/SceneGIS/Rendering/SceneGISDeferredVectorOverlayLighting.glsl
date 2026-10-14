uniform sampler2D u_sceneGISVectorAlbedo;
uniform sampler2D u_sceneGISClassification;
void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float group = texelFetch(u_sceneGISDeferredSpecular, pixel, 0).a;
    if ((group != -3.0 && group != -5.0) || texelFetch(u_sceneGISClassification, pixel, 0).a <= 0.0) discard;
    vec3 albedo = texelFetch(u_sceneGISVectorAlbedo, pixel, 0).rgb;
    vec3 normalEC = normalize(texelFetch(u_sceneGISDeferredEmission, pixel, 0).xyz);
    vec3 shadingNormalEC = texelFetch(u_sceneGISDeferredNormal, pixel, 0).xyz;
    if (dot(normalEC, shadingNormalEC) < 0.0) normalEC = -normalEC;
    float depth = texelFetch(u_linearDepth, pixel, 0).r;
    vec3 positionEC = sceneGISAOPosition(gl_FragCoord.xy, depth);
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
    vec3 color = vectorSurfaceRadiance(albedo, positionEC, normalEC);
#else
    vec3 color = albedo * (0.4 + 0.6 * max(dot(normalEC, czm_lightDirectionEC), 0.0));
    #ifdef SCENEGIS_AO_MAIN
    sceneGISRecordIndirect(albedo * 0.4);
    #endif
#endif
    out_FragColor = vec4(color, 0.0);
}

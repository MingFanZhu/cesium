uniform float u_sceneGISVectorOpacity;
uniform vec4 u_sceneGISVectorTileClip;
in vec4 v_color;
in vec2 v_local;
in vec3 v_positionEC;
in vec3 v_normalEC;
in float v_gradient;
#ifdef SCENEGIS_VECTOR_PICKING
in vec4 v_pickColor;
#endif

void main()
{
    if (v_local.x < u_sceneGISVectorTileClip.x || v_local.x >= u_sceneGISVectorTileClip.z ||
        v_local.y > u_sceneGISVectorTileClip.w || v_local.y <= u_sceneGISVectorTileClip.y) discard;
    vec4 fill = czm_gammaCorrect(v_color);
    vec3 normalEC = normalize(v_normalEC);
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
    fill.rgb = vectorSurfaceRadiance(fill.rgb, v_positionEC, normalEC);
#else
    fill.rgb *= 0.35 + 0.65 * max(dot(normalEC, czm_lightDirectionEC), 0.0) * czm_lightColor;
#endif
    fill.rgb *= v_gradient;
    fill.a *= u_sceneGISVectorOpacity;
    if (fill.a == 0.0) discard;
    out_FragColor = fill;
}

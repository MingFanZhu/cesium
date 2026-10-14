#define SCENEGIS_LOCAL_LIGHT_RECEIVER
#define SCENEGIS_SURFACE_WEATHER_TERRAIN

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 parameters = texelFetch(u_sceneGISDeferredSpecular, pixel, 0);
    if (parameters.a != u_sceneGISDeferredGroup) {
        discard;
    }
    vec4 albedo = texelFetch(u_sceneGISDeferredDiffuse, pixel, 0);
    vec3 normalEC = normalize(texelFetch(u_sceneGISDeferredNormal, pixel, 0).xyz);
    float depth = texelFetch(u_linearDepth, pixel, 0).r;
    vec3 positionEC = sceneGISAOPosition(gl_FragCoord.xy, depth);
    vec3 color = albedo.rgb;
    if (parameters.x < 3.5) {
        #ifdef SCENEGIS_SURFACE_WEATHER
        vec3 geometryNormalEC = normalize(texelFetch(u_sceneGISDeferredEmission, pixel, 0).xyz);
        if (dot(geometryNormalEC, sceneGISWeatherUp(positionEC)) < 0.0) {
            geometryNormalEC = -geometryNormalEC;
        }
        vec2 coverage = sceneGISWeatherCoverage(positionEC, geometryNormalEC);
        albedo.rgb = sceneGISWeatherAlbedo(albedo.rgb, coverage);
        color = albedo.rgb;
        #endif
        #ifdef SCENEGIS_ADVANCED_LIGHTING
        if (parameters.x > 1.5) {
            color = sceneGISPlanarSurfaceRadiance(albedo.rgb, positionEC, normalEC);
        } else
        #endif
        if (parameters.x > 0.5) {
            float intensity = clamp(czm_getLambertDiffuse(czm_lightDirectionEC, normalEC) * parameters.y + parameters.z, 0.0, 1.0);
            color *= czm_lightColor * mix(min(parameters.z, intensity), intensity, sceneGISGeometryShadow());
            #ifdef SCENEGIS_AO_MAIN
            sceneGISRecordIndirect(albedo.rgb * czm_lightColor * parameters.z);
            #endif
            #ifdef SCENEGIS_SURFACE_WEATHER
            color += czm_lightColorHdr * sceneGISGeometryShadow() *
                max(dot(geometryNormalEC, czm_lightDirectionEC), 0.0) *
                sceneGISWeatherFilm(positionEC, geometryNormalEC, czm_lightDirectionEC, coverage.x);
            #endif
        }
        #ifdef SCENEGIS_LOCAL_LIGHTS
        if (parameters.x > 0.5) {
            color += sceneGISLocalLambert(positionEC, normalEC, albedo.rgb);
        }
        #endif
    }
    // Unlit Planar colors retain the native generic shadow receiver, including
    // its clipping edge. Lit surfaces already attenuate only their direct term.
    if (parameters.x < 0.5 || parameters.x > 4.5) {
        color *= sceneGISGeometryShadow();
    }
    out_FragColor = vec4(color, 1.0);
}

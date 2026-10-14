#define SCENEGIS_LOCAL_LIGHT_RECEIVER
#define SCENEGIS_SURFACE_WEATHER_TERRAIN

#ifdef HIGHLIGHT_FILL_TILE
uniform vec4 u_fillHighlightColor;
#endif
#ifdef UNDERGROUND_COLOR
uniform vec4 u_undergroundColor;
uniform vec4 u_undergroundColorAlphaByDistance;
#endif

void sceneGISDeferredGlobeDisplay(inout vec4 color, vec3 positionEC, float flags)
{
    #ifdef HIGHLIGHT_FILL_TILE
    if (mod(floor(flags / 512.0), 2.0) > 0.5) {
        color.rgb = mix(color.rgb, u_fillHighlightColor.rgb, u_fillHighlightColor.a);
        #ifdef SCENEGIS_AO_MAIN
        sceneGISScaleIndirect(vec3(1.0 - u_fillHighlightColor.a));
        #endif
    }
    #endif
    #ifdef UNDERGROUND_COLOR
    if (flags >= 1024.0) {
        // Match GlobeFS's distance fade using the reconstructed visible surface.
        float distance = max(length(positionEC) - max(czm_eyeHeight, 0.0), 0.0);
        vec4 range = u_undergroundColorAlphaByDistance;
        float blend = clamp((distance - range.x) / (range.z - range.x), 0.0, 1.0);
        float alpha = u_undergroundColor.a * mix(range.y, range.w, blend);
        color = vec4(u_undergroundColor.rgb * alpha, alpha) + color * (1.0 - alpha);
        #ifdef SCENEGIS_AO_MAIN
        sceneGISScaleIndirect(vec3(1.0 - alpha));
        #endif
    }
    #endif
}

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 parameters = texelFetch(u_sceneGISDeferredSpecular, pixel, 0);
    if (parameters.a != u_sceneGISDeferredGroup) {
        discard;
    }
    vec4 albedo = texelFetch(u_sceneGISDeferredDiffuse, pixel, 0);
    float lightingMode = mod(parameters.x, 4.0);
    vec4 surface = texelFetch(u_sceneGISDeferredNormal, pixel, 0);
    vec3 normalEC = normalize(surface.xyz);
    float depth = texelFetch(u_linearDepth, pixel, 0).r;
    vec3 positionEC = sceneGISAOPosition(gl_FragCoord.xy, depth);
    // Clipping edges replace surface radiance before display overlays.
    if (mod(floor(parameters.x / 16.0), 2.0) > 0.5) {
        sceneGISDeferredGlobeDisplay(albedo, positionEC, parameters.x);
        out_FragColor = albedo;
        return;
    }
    float waterMask = 0.0;
    #ifdef SCENEGIS_DEFERRED_GLOBE_WATER
    if (mod(floor(parameters.x / 32.0), 2.0) > 0.5) {
        vec4 ocean = texelFetch(u_sceneGISDeferredOcean, pixel, 0);
        waterMask = ocean.w;
        if (waterMask > 0.0 && mod(floor(parameters.x / 64.0), 2.0) > 0.5) {
            albedo.rgb = sceneGISDeferredOceanColor(albedo.rgb, ocean, positionEC, parameters.x, surface.w);
        }
    }
    #endif
    #ifdef SCENEGIS_DEFERRED_GLOBE_FABRIC
    if (mod(floor(parameters.x / 256.0), 2.0) > 0.5) {
        vec4 overlay = texelFetch(u_sceneGISDeferredStyle, pixel, 0);
        float remainingAlpha = albedo.a * (1.0 - overlay.a);
        float alpha = overlay.a + remainingAlpha;
        vec3 premultiplied = overlay.rgb * overlay.a + albedo.rgb * remainingAlpha;
        albedo = vec4(alpha > 0.0 ? premultiplied / alpha : vec3(0.0), alpha);
    }
    #endif
    vec3 geometryNormalEC = normalize(texelFetch(u_sceneGISDeferredEmission, pixel, 0).xyz);
    float wetness = 0.0;
    #ifdef SCENEGIS_SURFACE_WEATHER
    if (dot(geometryNormalEC, sceneGISWeatherUp(positionEC)) < 0.0) {
        geometryNormalEC = -geometryNormalEC;
    }
    vec2 coverage = sceneGISWeatherCoverage(positionEC, geometryNormalEC) * (1.0 - waterMask);
    wetness = coverage.x;
    albedo.rgb = sceneGISWeatherAlbedo(albedo.rgb, coverage);
    #endif
    vec3 color = albedo.rgb;
    #ifdef SCENEGIS_GLOBE_SURFACE_LIGHTING
    vec3 positionWC = czm_viewerPositionWC + czm_inverseViewRotation * positionEC;
    color = sceneGISGlobeSurfaceLighting(albedo.rgb, positionWC,
        normalize(czm_inverseViewRotation * normalEC), geometryNormalEC, wetness);
    #endif
    #ifdef SCENEGIS_LOCAL_LIGHTS
    if (lightingMode > 0.5) {
        color += sceneGISLocalLambert(positionEC, normalEC, albedo.rgb);
    }
    #endif
    vec4 finalColor = vec4(color, albedo.a);
    sceneGISDeferredGlobeDisplay(finalColor, positionEC, parameters.x);
    out_FragColor = finalColor;
}

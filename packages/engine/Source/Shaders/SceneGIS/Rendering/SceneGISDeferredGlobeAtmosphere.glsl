uniform vec2 u_nightFadeDistance;
uniform float u_minimumBrightness;
#ifdef COLOR_CORRECT
uniform vec3 u_hsbShift;
#endif

// The HDR GlobeFS atmosphere composition is affine in surface radiance.
// Apply its linear part to the AO response so scattering remains unoccluded.
void sceneGISDeferredGlobeAtmosphere(inout vec3 color, vec3 positionEC, float flags, float fade)
{
    if (flags < 4.0 || (flags >= 8.0 && fade == 0.0)) {
        return;
    }
    vec3 positionWC = czm_viewerPositionWC + czm_inverseViewRotation * positionEC;
    #ifdef DYNAMIC_ATMOSPHERE_LIGHTING_FROM_SUN
    vec3 direction = czm_sunDirectionWC;
    #else
    vec3 direction = czm_lightDirectionWC;
    #endif
    bool dynamicLighting = false;
    #ifdef DYNAMIC_ATMOSPHERE_LIGHTING
    dynamicLighting = mod(flags, 4.0) > 0.5;
    #endif
    vec3 scatteringDirection = dynamicLighting ? direction : normalize(positionWC);
    vec3 rayleigh;
    vec3 mie;
    float opacity;
    computeAtmosphereScattering(positionWC, scatteringDirection, rayleigh, mie, opacity);
    #ifdef COLOR_CORRECT
    rayleigh = czm_applyHSBShift(rayleigh, u_hsbShift, true);
    mie = czm_applyHSBShift(mie, u_hsbShift, true);
    #endif
    vec3 scattering = computeAtmosphereColor(positionWC, scatteringDirection, rayleigh, mie, opacity).rgb;
    if (flags < 8.0) {
        if (dynamicLighting) {
            scattering *= clamp(dot(normalize(czm_viewerPositionWC), direction), u_minimumBrightness, 1.0);
        }
        float transmission = czm_fog(length(positionEC), vec3(1.0), vec3(0.0), czm_fogVisualDensityScalar).r;
        color = mix(scattering, color, transmission);
        #ifdef SCENEGIS_AO_MAIN
        sceneGISScaleIndirect(vec3(transmission));
        #endif
    } else {
        float weight = 1.0;
        if (dynamicLighting) {
            float sunlit = clamp((length(czm_viewerPositionWC) - u_nightFadeDistance.y) /
                (u_nightFadeDistance.x - u_nightFadeDistance.y), 0.05, 1.0);
            weight = mix(clamp(dot(normalize(positionWC), direction), 0.0, 1.0), 1.0, sunlit);
        }
        float transmission = 0.5 + clamp(1.0 - opacity, 0.0, 1.0);
        vec3 combined = color * weight + scattering * (1.0 + (transmission - 1.0) * weight);
        color = mix(color, czm_saturation(combined, 1.6), fade);
        #ifdef SCENEGIS_AO_MAIN
        sceneGISIndirect = mix(sceneGISIndirect, czm_saturation(sceneGISIndirect * weight, 1.6), fade);
        #endif
    }
}

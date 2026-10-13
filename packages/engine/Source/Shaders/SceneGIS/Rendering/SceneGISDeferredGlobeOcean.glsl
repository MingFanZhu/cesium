uniform sampler2D u_sceneGISDeferredOcean;
uniform float u_zoomedOutOceanSpecularIntensity;

// Ocean highlight algebra from GlobeFS.computeWaterColor, Cesium baseline
// 6d5d8b1f0725b6f831b336463f4b11c98023427b. Keep constants and composition in
// sync when that upstream function changes. Wave sampling stays in GlobeFS.
vec3 sceneGISDeferredOceanColor(vec3 imagery, vec4 ocean, vec3 positionEC, float flags, float fade)
{
    vec3 normalEC = normalize(ocean.xyz);
    float distanceToEye = length(positionEC);
    float waveIntensity = pow(1.0 - clamp((distanceToEye - 70000.0) / 930000.0, 0.0, 1.0), 5.0);
    const vec3 highlight = vec3(0.3, 0.45, 0.6);
    float diffuse = czm_getLambertDiffuse(czm_lightDirectionEC, normalEC) * ocean.w;
    vec3 waves = highlight * diffuse * (1.0 - fade);
    if (mod(floor(flags / 128.0), 2.0) > 0.5) {
        vec3 positionWC = czm_viewerPositionWC + czm_inverseViewRotation * positionEC;
        vec3 upEC = czm_viewRotation * normalize(positionWC);
        float perturbation = clamp(dot(normalEC, upEC), -1.0, 1.0);
        waves += mix(highlight * 5.0 * (1.0 - perturbation), vec3(0.0), diffuse);
    }
    float specular = czm_getSpecular(czm_lightDirectionEC, normalize(-positionEC), normalEC, 10.0);
    specular *= mix(u_zoomedOutOceanSpecularIntensity, 0.5, waveIntensity) * ocean.w * 1.4;
    return imagery + 1.7 * (vec3(0.2) + imagery * 3.3) * (waves + specular);
}

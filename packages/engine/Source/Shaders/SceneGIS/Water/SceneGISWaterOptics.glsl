float sceneGISWaterFresnel(float cosine) {
    return 0.02037 + 0.97963 * pow(1.0 - max(cosine, 0.0), 5.0);
}

vec3 sceneGISWaterHighlight(vec3 normal, vec3 view, vec3 beam, float roughness) {
    vec3 light = normalize(czm_lightDirectionEC);
    vec3 halfVector = normalize(light + view);
    float nDotV = max(dot(normal, view), 0.001);
    float nDotL = max(dot(normal, light), 0.0);
    float nDotH = max(dot(normal, halfVector), 0.0);
    float alpha = max(roughness * roughness, 0.0025);
    float a2 = alpha * alpha;
    float denominator = nDotH * nDotH * (a2 - 1.0) + 1.0;
    float distribution = a2 / (czm_pi * denominator * denominator);
    float visibility = 0.5 / max(nDotL * sqrt(nDotV * nDotV * (1.0 - a2) + a2) +
        nDotV * sqrt(nDotL * nDotL * (1.0 - a2) + a2), 0.001);
    return beam * (distribution * visibility * sceneGISWaterFresnel(dot(view, halfVector)) * nDotL);
}

vec3 sceneGISWaterTransmission(vec3 background, vec3 scattering, vec3 absorption, float thickness) {
    vec3 transmission = exp(-absorption * thickness);
    return background * transmission + scattering * (vec3(1.0) - transmission);
}

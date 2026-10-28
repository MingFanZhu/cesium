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

// Cosine between incoming light travel and outgoing travel toward the camera.
float sceneGISWaterPhase(float cosine, float g) {
    float denominator = 1.0 + g * g - 2.0 * g * clamp(cosine, -1.0, 1.0);
    return (1.0 - g * g) / (4.0 * czm_pi * denominator * sqrt(denominator));
}

vec3 sceneGISWaterExtinguished(vec3 opticalDepth) {
    // Preserve the thin-medium limit without cancellation in 1 - exp(-x).
    return mix(vec3(1.0) - exp(-opticalDepth), opticalDepth * (vec3(1.0) - 0.5 * opticalDepth),
        lessThan(opticalDepth, vec3(0.001)));
}

vec3 sceneGISWaterMedium(vec3 background, vec3 absorption, vec3 scattering,
    float distance, bool hasBottom, float viewCosine, float lightCosine,
    vec3 directSource, vec3 skySource) {
    vec3 extinction = absorption + scattering;
    vec3 transmission = hasBottom ? exp(-extinction * distance) : vec3(0.0);
    // At s along the viewing path, incident light travels s * muView / muLight.
    float directScale = 1.0 + viewCosine / lightCosine;
    float skyScale = 1.0 + viewCosine / (2.0 / 3.0);
    vec3 directIntegral = hasBottom ? sceneGISWaterExtinguished(extinction * distance * directScale) : vec3(1.0);
    vec3 skyIntegral = hasBottom ? sceneGISWaterExtinguished(extinction * distance * skyScale) : vec3(1.0);
    vec3 albedo = scattering / max(extinction, vec3(1.0e-20));
    return background * transmission + albedo *
        (directSource * directIntegral / directScale + skySource * skyIntegral / skyScale);
}

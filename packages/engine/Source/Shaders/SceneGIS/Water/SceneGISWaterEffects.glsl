uniform float u_underwaterDepth;
uniform float u_cameraDepth;

// Exact dielectric water-to-air Fresnel; return one beyond the critical angle.
float sceneGISWaterExitFresnel(float cosine)
{
    float sine2 = 1.333 * 1.333 * (1.0 - cosine * cosine);
    if (sine2 >= 1.0) { return 1.0; }
    float transmitted = sqrt(1.0 - sine2);
    float rs = (1.333 * cosine - transmitted) / (1.333 * cosine + transmitted);
    float rp = (cosine - 1.333 * transmitted) / (cosine + 1.333 * transmitted);
    return 0.5 * (rs * rs + rp * rp);
}

vec3 sceneGISWaterSourceIntegral(vec3 extinction, float distance, float startDepth,
    float endDepth, float lightCosine)
{
    float scale = 1.0 + (endDepth - startDepth) / max(distance * lightCosine, 1e-8);
    vec3 a = exp(-extinction * startDepth / lightCosine);
    if (abs(scale) < 1e-4) { return a * distance; }
    // Both exponents stay nonpositive, even for a ray travelling toward the light.
    vec3 b = exp(-extinction * (distance + endDepth / lightCosine));
    vec3 value = (a - b) / (max(extinction, vec3(1e-20)) * scale);
    vec3 x = extinction * (distance * scale);
    vec3 series = a * distance * (vec3(1.0) - x * 0.5 + x * x / 6.0);
    return mix(value, series, lessThan(abs(x), vec3(1e-3)));
}

vec3 sceneGISWaterUnderwater(vec3 background, vec3 absorption, vec3 scattering,
    float distance, float startDepth, float endDepth, vec3 direct, vec3 sky, float lightCosine)
{
    vec3 extinction = absorption + scattering;
    vec3 directIntegral = sceneGISWaterSourceIntegral(extinction, distance, startDepth, endDepth, lightCosine);
    vec3 skyIntegral = sceneGISWaterSourceIntegral(extinction, distance, startDepth, endDepth, 2.0 / 3.0);
    return background * exp(-extinction * distance) + scattering * (direct * directIntegral + sky * skyIntegral);
}

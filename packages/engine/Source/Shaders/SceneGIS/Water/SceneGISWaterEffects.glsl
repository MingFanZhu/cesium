uniform float u_underwaterDepth;
uniform float u_cameraDepth;
uniform float u_causticsIntensity;
uniform bool u_hasWaterField;
uniform vec4 u_fieldRectangle;
uniform sampler2D u_causticsMap;
uniform sampler2D u_shoreFoam;

float sceneGISWaterCaustics(vec2 p, float depth, float footprint, float sunCosine)
{
    if (!u_hasWaterField || u_causticsIntensity == 0.0 || depth <= 0.0) { return 1.0; }
    vec2 uv = (p - u_fieldRectangle.xy) / u_fieldRectangle.zw;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { return 1.0; }
    float focus = textureGrad(u_causticsMap, uv, vec2(footprint / u_fieldRectangle.z, 0.0), vec2(0.0, footprint / u_fieldRectangle.w)).r;
    float visibility = exp(-depth * 0.12) * smoothstep(0.0, 0.3, sunCosine);
    return max(0.0, 1.0 + (clamp(focus, 0.0, 8.0) - 1.0) * u_causticsIntensity * 0.5 * visibility);
}

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

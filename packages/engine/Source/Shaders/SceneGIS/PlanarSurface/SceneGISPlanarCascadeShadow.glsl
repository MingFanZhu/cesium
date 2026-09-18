uniform vec4 shadowMap_cascadeSplits[2];
uniform vec4 sceneGIS_planarCascadeBias;

vec4 sceneGISPlanarCascadeWeights(float depth)
{
    if (depth < shadowMap_cascadeSplits[1].x) { return vec4(1.0, 0.0, 0.0, 0.0); }
    if (depth < shadowMap_cascadeSplits[1].y) { return vec4(0.0, 1.0, 0.0, 0.0); }
    if (depth < shadowMap_cascadeSplits[1].z) { return vec4(0.0, 0.0, 1.0, 0.0); }
    return vec4(0.0, 0.0, 0.0, 1.0);
}

float sceneGISPlanarCascadeSample(sampler2D shadowTexture, czm_shadowParameters parameters, vec4 weights)
{
    vec2 origin = vec2(weights.y + weights.w, weights.z + weights.w) * 0.5;
    // The native PCF kernel extends by one texel; keep its entire footprint
    // inside this cascade, including a half-texel center margin.
    vec2 margin = parameters.texelStepSize * 1.5;
    parameters.texCoords = clamp(parameters.texCoords, origin + margin, origin + 0.5 - margin);
    float cosine = clamp(parameters.nDotL, 0.0, 1.0);
    float slope = sqrt(max(1.0 - cosine * cosine, 0.0)) / max(cosine, 0.1);
#ifdef USE_SOFT_SHADOWS
    float footprint = 2.12132034;
#else
    float footprint = 0.70710678;
#endif
    parameters.depthBias = max(parameters.depthBias,
        dot(sceneGIS_planarCascadeBias, weights) * (0.25 + footprint * slope));
    return czm_shadowVisibility(shadowTexture, parameters);
}

float sceneGISPlanarCascadeVisibility(sampler2D shadowTexture, czm_shadowParameters parameters,
    vec4 positionEC, vec4 weights, float depth)
{
    float visibility = sceneGISPlanarCascadeSample(shadowTexture, parameters, weights);
    float end = dot(shadowMap_cascadeSplits[1], weights);
    float start = dot(shadowMap_cascadeSplits[0], weights);
    float blendStart = mix(start, end, 0.9);
    if (weights.w == 0.0 && depth > blendStart) {
        vec4 nextWeights = vec4(0.0, weights.xyz);
        vec4 nextPosition = czm_cascadeMatrix(nextWeights) * positionEC;
        parameters.texCoords = nextPosition.xy;
        parameters.depth = nextPosition.z;
        float nextVisibility = sceneGISPlanarCascadeSample(shadowTexture, parameters, nextWeights);
        visibility = mix(visibility, nextVisibility, smoothstep(blendStart, end, depth));
    }
    return visibility;
}

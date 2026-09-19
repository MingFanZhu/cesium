uniform vec4 shadowMap_cascadeSplits[2];
uniform vec4 sceneGIS_cascadeBias;

vec4 sceneGISCascadeWeights(float depth)
{
    if (depth < shadowMap_cascadeSplits[1].x) { return vec4(1.0, 0.0, 0.0, 0.0); }
    if (depth < shadowMap_cascadeSplits[1].y) { return vec4(0.0, 1.0, 0.0, 0.0); }
    if (depth < shadowMap_cascadeSplits[1].z) { return vec4(0.0, 0.0, 1.0, 0.0); }
    return vec4(0.0, 0.0, 0.0, 1.0);
}

vec2 sceneGISReceiverPlane(mat4 matrix, vec3 positionDx, vec3 positionDy)
{
    vec3 dx = (matrix * vec4(positionDx, 0.0)).xyz;
    vec3 dy = (matrix * vec4(positionDy, 0.0)).xyz;
    vec3 plane = cross(dx, dy);
    // An edge-on receiver has no invertible shadow-UV plane.
    if (abs(plane.z) < 1.0e-20) { return vec2(0.0); }
    return -plane.xy / plane.z;
}

float sceneGISShadowTap(sampler2D shadowTexture, vec2 uv, vec2 sampleUv,
    float depth, vec2 gradient, vec2 minimumUv, vec2 maximumUv)
{
    sampleUv = clamp(sampleUv, minimumUv, maximumUv);
    float comparisonDepth = depth + dot(gradient, sampleUv - uv);
    return czm_shadowDepthCompare(shadowTexture, sampleUv, comparisonDepth);
}

float sceneGISCascadeSample(sampler2D shadowTexture, czm_shadowParameters parameters,
    vec4 weights, vec3 positionDx, vec3 positionDy)
{
    vec2 origin = vec2(weights.y + weights.w, weights.z + weights.w) * 0.5;
    vec2 texel = parameters.texelStepSize;
    vec2 minimumUv = origin + texel * 0.5;
    vec2 maximumUv = origin + 0.5 - texel * 0.5;
    vec2 uv = parameters.texCoords;
    vec2 gradient = sceneGISReceiverPlane(czm_cascadeMatrix(weights), positionDx, positionDy);
    // Correct slope at each sample instead of translating the whole shadow edge.
    float bias = max(2.0e-7, min(parameters.depthBias, dot(sceneGIS_cascadeBias, weights) * 0.05));
    float depth = parameters.depth - bias;
#ifdef USE_SOFT_SHADOWS
    vec2 coordinate = uv / texel - 0.5;
    vec2 base = floor(coordinate);
    vec2 fraction = fract(coordinate);
    float visibility = 0.0;
    for (int y = -1; y <= 2; ++y) {
        for (int x = -1; x <= 2; ++x) {
            vec2 offset = vec2(float(x), float(y));
            vec2 weight = max(vec2(2.0) - abs(offset - fraction), vec2(0.0));
            vec2 sampleUv = (base + offset + 0.5) * texel;
            visibility += weight.x * weight.y * sceneGISShadowTap(shadowTexture,
                uv, sampleUv, depth, gradient, minimumUv, maximumUv);
        }
    }
    visibility *= 1.0 / 16.0;
#else
    vec2 sampleUv = (floor(uv / texel) + 0.5) * texel;
    float visibility = sceneGISShadowTap(shadowTexture, uv, sampleUv, depth,
        gradient, minimumUv, maximumUv);
#endif
    // Preserve the native shadowVisibility.glsl normal-shading and darkness contract.
#ifdef USE_NORMAL_SHADING
#ifdef USE_NORMAL_SHADING_SMOOTH
    visibility *= clamp(parameters.nDotL / parameters.normalShadingSmooth, 0.0, 1.0);
#else
    visibility *= step(0.0, parameters.nDotL);
#endif
#endif
    return max(visibility, parameters.darkness);
}

float sceneGISCascadeVisibility(sampler2D shadowTexture, czm_shadowParameters parameters,
    vec4 positionEC, vec4 weights, float depth, vec3 positionDx, vec3 positionDy)
{
    float visibility = sceneGISCascadeSample(shadowTexture, parameters, weights, positionDx, positionDy);
    float end = dot(shadowMap_cascadeSplits[1], weights);
    float start = dot(shadowMap_cascadeSplits[0], weights);
    float blendStart = mix(start, end, 0.9);
    if (weights.w == 0.0 && depth > blendStart) {
        vec4 nextWeights = vec4(0.0, weights.xyz);
        vec4 nextPosition = czm_cascadeMatrix(nextWeights) * positionEC;
        parameters.texCoords = nextPosition.xy;
        parameters.depth = nextPosition.z;
        float nextVisibility = sceneGISCascadeSample(shadowTexture, parameters, nextWeights, positionDx, positionDy);
        visibility = mix(visibility, nextVisibility, smoothstep(blendStart, end, depth));
    }
    return visibility;
}

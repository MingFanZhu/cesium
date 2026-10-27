#ifdef SCENEGIS_VECTOR_SHADOWS
uniform bool u_vectorShadowEnabled;
uniform sampler2D u_vectorShadowTexture;
uniform mat4 u_vectorShadowMatrix;
uniform vec3 u_vectorShadowLightDirectionEC;
uniform vec4 u_vectorShadowTexelBias;
uniform vec4 u_vectorShadowOffsetDistance;
#ifdef SCENEGIS_VECTOR_SHADOW_CASCADES
uniform vec4 u_vectorShadowCascadeSplits[2];
#endif

float vectorShadowVisibility(vec3 eye, vec3 normal)
{
    if (!u_vectorShadowEnabled) return 1.0;
    float distance = -eye.z;
    float cosine = clamp(dot(normal, u_vectorShadowLightDirectionEC), 0.0, 1.0);
    vec4 position = vec4(eye + normal * u_vectorShadowOffsetDistance.x * (1.0 - cosine), 1.0);
#ifdef SCENEGIS_VECTOR_SHADOW_CASCADES
    if (distance > u_vectorShadowCascadeSplits[1].w) return 1.0;
    vec4 weights = step(u_vectorShadowCascadeSplits[0], vec4(distance)) *
                   step(vec4(distance), u_vectorShadowCascadeSplits[1]);
    vec4 shadow = czm_cascadeMatrix(weights) * position;
#else
    vec4 shadow = u_vectorShadowMatrix * position;
#endif
    if (any(lessThan(shadow.xyz, vec3(0.0))) || any(greaterThan(shadow.xyz, vec3(1.0)))) return 1.0;
    czm_shadowParameters parameters;
    parameters.texelStepSize = u_vectorShadowTexelBias.xy;
    parameters.depthBias = u_vectorShadowTexelBias.z * max(distance * 0.01, 1.0);
    parameters.normalShadingSmooth = u_vectorShadowTexelBias.w;
    parameters.darkness = u_vectorShadowOffsetDistance.z;
    parameters.texCoords = shadow.xy;
    parameters.depth = shadow.z;
    parameters.nDotL = cosine;
    float visibility = czm_shadowVisibility(u_vectorShadowTexture, parameters);
#ifdef SCENEGIS_VECTOR_SHADOW_CASCADES
    float maximumDistance = u_vectorShadowOffsetDistance.y;
    visibility = mix(visibility, 1.0, clamp((distance - maximumDistance * 0.8) / (maximumDistance * 0.2), 0.0, 1.0));
#endif
    return visibility;
}
#endif

vec3 vectorSurfaceRadiance(vec3 albedo, vec3 eye, vec3 normal)
{
    vec3 normalWC = normalize(czm_inverseViewRotation * normal);
#ifdef SCENEGIS_GLOBE
    vec3 light = normalize(u_sceneGISPrimaryLightDirection);
#else
    vec3 light = normalize(u_sceneGISShadowSunDirection);
#endif
    float cosine = max(dot(normalWC, light), 0.0);
    vec3 direct = sceneGISModelDirectSource(eye, vec3(1.0)) * (cosine / czm_pi);
#ifdef SCENEGIS_VECTOR_SHADOWS
    direct *= vectorShadowVisibility(eye, normal);
#endif
    vec3 indirect = albedo * sceneGISModelSkyIrradiance(eye, normal);
#ifdef SCENEGIS_AO_MAIN
    sceneGISRecordIndirect(indirect);
#endif
    return albedo * direct + indirect;
}

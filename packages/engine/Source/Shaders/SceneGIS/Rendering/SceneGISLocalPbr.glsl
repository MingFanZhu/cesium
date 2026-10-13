#if defined(LIGHTING_PBR) && defined(HAS_NORMALS)
vec3 sceneGISLocalPbr(czm_modelMaterial material, vec3 positionEC)
{
    vec3 color = vec3(0.0);
    vec3 toEye = -normalize(positionEC);
    ivec2 span = sceneGISLocalLightSpan();
    for (int candidate = 0; candidate < span.y; ++candidate) {
        int i = sceneGISLocalLightIndex(span, candidate);
        vec3 direction;
        vec3 irradiance;
        if (sceneGISLocalLight(i, positionEC, direction, irradiance) &&
            dot(material.normalEC, direction) > 0.0) {
            color += irradiance * czm_pbrLighting(toEye, material.normalEC, direction, material);
            #ifdef SCENEGIS_SSIL_MAIN
            sceneGISSILLocal(material, direction, irradiance);
            #endif
        }
    }
    return color;
}

#ifdef USE_CLEARCOAT
vec3 sceneGISLocalClearcoat(czm_modelMaterial material, vec3 positionEC)
{
    vec3 color = vec3(0.0);
    vec3 toEye = -normalize(positionEC);
    vec3 normal = material.clearcoatNormal;
    float NdotV = clamp(dot(normal, toEye), 0.0, 1.0);
    vec3 F = fresnelSchlick2(vec3(0.04), vec3(1.0), NdotV);
    float alpha = material.clearcoatRoughness * material.clearcoatRoughness;
    ivec2 span = sceneGISLocalLightSpan();
    for (int candidate = 0; candidate < span.y; ++candidate) {
        int i = sceneGISLocalLightIndex(span, candidate);
        vec3 direction;
        vec3 irradiance;
        if (sceneGISLocalLight(i, positionEC, direction, irradiance)) {
            float NdotL = max(dot(normal, direction), 0.0);
            if (NdotL > 0.0) {
                float strength = computeDirectSpecularStrength(normal, direction, toEye,
                    normalize(toEye + direction), alpha);
                color += irradiance * F * strength * NdotL;
            }
        }
    }
    return color;
}
#endif
#endif

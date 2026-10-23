#if defined(LIGHTING_PBR) && defined(HAS_NORMALS)
vec3 sceneGISLocalPbr(czm_modelMaterial material, vec3 positionEC)
{
    vec3 color = vec3(0.0);
    vec3 toEye = -normalize(positionEC);
    ivec2 span = sceneGISLocalLightSpan();
    for (int candidate = 0; candidate < span.y; ++candidate) {
        int i = sceneGISLocalLightIndex(span, candidate);
        if (sceneGISLocalParameter(i, 3).x == -2.0) {
            vec3 center, right, up, radiance;
            if (sceneGISRectLight(i, positionEC, center, right, up, radiance)) {
                mat3 basis = sceneGISRectBasis(material.normalEC, toEye);
                float diffuseIntegral = sceneGISRectIntegral(center, right, up, basis);
                vec3 f0 = material.specular;
                vec3 f90 = vec3(clamp(czm_maximumComponent(f0) * 25.0, 0.0, 1.0));
                #ifdef USE_SPECULAR
                f0 *= material.specularWeight;
                f90 *= material.specularWeight;
                #endif
                color += radiance * (material.diffuse * (1.0 - f0) * diffuseIntegral +
                    sceneGISRectSpecular(center, right, up, basis, dot(material.normalEC, toEye),
                        material.roughness, f0, f90));
                #ifdef SCENEGIS_SSIL_MAIN
                sceneGISSILSource += sceneGISSILDiffuse(material) * radiance * diffuseIntegral;
                #endif
            }
            continue;
        }
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
        if (sceneGISLocalParameter(i, 3).x == -2.0) {
            vec3 center, right, up, radiance;
            if (sceneGISRectLight(i, positionEC, center, right, up, radiance)) {
                color += radiance * sceneGISRectSpecular(center, right, up,
                    sceneGISRectBasis(normal, toEye), NdotV, material.clearcoatRoughness,
                    vec3(0.04), vec3(1.0));
            }
            continue;
        }
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

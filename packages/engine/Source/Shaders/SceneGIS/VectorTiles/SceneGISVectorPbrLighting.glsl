#ifdef SCENEGIS_VECTOR_PBR
uniform samplerCube u_vectorMaterialSky;
uniform bool u_vectorMaterialSkyReady;
uniform mat3 u_vectorMaterialSkyFrame;
uniform float u_vectorMaterialSkyLod;
uniform float u_vectorMaterialSkyScale;

vec3 vectorPbrRadiance(vec3 albedo, float metallic, float roughness, vec3 emissive,
                       vec3 eye, vec3 normal, float visibility)
{
    czm_modelMaterial material;
    material.diffuse = albedo * (1.0 - metallic);
    material.specular = mix(vec3(0.04), albedo, metallic);
    material.roughness = roughness;
    material.normalEC = normal;
    material.emissive = emissive;
    material.occlusion = 1.0;
    vec3 view = normalize(-eye);
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
    #ifdef SCENEGIS_GLOBE
    vec3 light = czm_viewRotation * normalize(u_sceneGISPrimaryLightDirection);
    #else
    vec3 light = czm_viewRotation * normalize(u_sceneGISShadowSunDirection);
    #endif
    vec3 beam = sceneGISModelDirectSource(eye, vec3(1.0)) * visibility;
    vec3 sky = sceneGISModelSkyIrradiance(eye, normal);
#else
    vec3 light = czm_lightDirectionEC;
    vec3 beam = czm_lightColor * (0.65 * czm_pi * visibility);
    vec3 sky = vec3(0.35);
#endif
    vec3 direct = max(dot(normal, light), 0.0) > 0.0
        ? czm_pbrLighting(view, normal, light, material) * beam : vec3(0.0);
    float nv = clamp(dot(normal, view), 0.0, 1.0);
    vec3 fresnel = fresnelSchlick2(material.specular, max(vec3(1.0 - roughness), material.specular), nv);
    vec2 brdf = texture(czm_brdfLut, vec2(nv, roughness)).rg;
    // Native split-sum and multiple scattering weights; source/baseline in ADR-0192.
    vec3 weight = fresnel * brdf.x + brdf.y;
    vec3 average = material.specular + (1.0 - material.specular) / 21.0;
    float missing = 1.0 - brdf.x - brdf.y;
    vec3 multiple = weight * average * missing / (1.0 - average * missing);
    vec3 indirect = sky * (multiple + (1.0 - weight - multiple) * material.diffuse);
    vec3 direction = reflect(-view, normal);
    vec3 radiance = vec3(0.0);
    if (u_vectorMaterialSkyReady) {
        vec3 local = u_vectorMaterialSkyFrame * czm_inverseViewRotation * direction;
        radiance = textureLod(u_vectorMaterialSky, local, roughness * u_vectorMaterialSkyLod).rgb * u_vectorMaterialSkyScale;
    }
#ifdef SCENEGIS_SSR_MAIN
    radiance = sceneGISSSR(radiance, direction, roughness, false);
    sceneGISSSRBaseWeight = weight;
#endif
    vec3 specular = radiance * weight;
#ifdef SCENEGIS_AO_MAIN
    sceneGISRecordIndirect(indirect + specular);
#endif
#ifdef SCENEGIS_SSIL_MAIN
    sceneGISSILRecord(material, light, beam);
#endif
    return direct + indirect + specular + emissive;
}
#endif

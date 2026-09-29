void sceneGISWeatherModel(inout czm_modelMaterial material, vec3 positionEC, vec3 geometryNormalEC)
{
    vec2 cover = sceneGISWeatherCoverage(positionEC, geometryNormalEC);
    float metal = clamp((czm_maximumComponent(material.specular) - 0.08) / 0.5, 0.0, 1.0);
    float absorption = (1.0 - metal) * material.roughness;
    material.diffuse *= 1.0 - 0.45 * absorption * cover.x;
    material.diffuse = mix(material.diffuse, u_sceneGISSurfaceSnowColor.rgb, cover.y);
    material.specular = mix(material.specular, vec3(0.04), cover.y);
    material.roughness = mix(material.roughness, min(material.roughness, 0.22), cover.x);
    material.roughness = mix(material.roughness, 0.85, cover.y);
    material.normalEC = normalize(mix(material.normalEC, normalize(geometryNormalEC), 0.65 * cover.y));
    vec3 wetNormal = material.normalEC;
    material.normalEC = sceneGISWeatherRippleNormal(positionEC, wetNormal, geometryNormalEC, cover.x);
    #ifdef USE_CLEARCOAT
    material.clearcoatFactor *= 1.0 - cover.y;
    if (u_sceneGISSurfaceRipples.x > 0.0) {
        material.clearcoatNormal = normalize(material.clearcoatNormal + material.normalEC - wetNormal);
    }
    #endif
    #ifdef USE_ANISOTROPY
    material.anisotropyStrength *= 1.0 - cover.y;
    #endif
    #ifdef USE_SPECULAR
    material.specularWeight = mix(material.specularWeight, 1.0, cover.y);
    #endif
}

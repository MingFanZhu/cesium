// SCENEGIS_PATCH_BEGIN SGP-0045: Expose evaluated native material to the private buffer prototype.
#define SCENEGIS_GBUFFER_MODEL
#ifdef SCENEGIS_GBUFFER_MODEL_CAPTURE
void sceneGISRecordGBuffer(czm_modelMaterial material);
#endif
// SCENEGIS_PATCH_END SGP-0045
// SCENEGIS_PATCH_BEGIN SGP-0018: Model lighting owns shadow composition, including unlit materials.
#ifdef SCENEGIS_GEOMETRY_SHADOW
#define SCENEGIS_DIRECT_SHADOW_RECEIVER
#endif
// SCENEGIS_PATCH_END SGP-0018
// SCENEGIS_PATCH_BEGIN SGP-0019: Declare owned local-light BRDF accumulation.
#define SCENEGIS_LOCAL_LIGHT_RECEIVER
#if defined(SCENEGIS_LOCAL_LIGHTS) && defined(LIGHTING_PBR) && defined(HAS_NORMALS)
vec3 sceneGISLocalPbr(czm_modelMaterial material, vec3 positionEC);
#ifdef USE_CLEARCOAT
vec3 sceneGISLocalClearcoat(czm_modelMaterial material, vec3 positionEC);
#endif
#endif
// SCENEGIS_PATCH_END SGP-0019
// SCENEGIS_PATCH_BEGIN SGP-0025: Owned filtering runs before every PBR roughness consumer.
#if defined(LIGHTING_PBR) && defined(HAS_NORMALS)
void sceneGISFilterSpecular(inout czm_modelMaterial material, vec3 geometryNormal);
#endif
// SCENEGIS_PATCH_END SGP-0025
// SCENEGIS_PATCH_BEGIN SGP-0028: Declare the pre-lighting weather material seam.
#define SCENEGIS_SURFACE_WEATHER_MODEL
#ifdef SCENEGIS_SURFACE_WEATHER
void sceneGISWeatherModel(inout czm_modelMaterial material, vec3 positionEC, vec3 geometryNormalEC);
#endif
// SCENEGIS_PATCH_END SGP-0028
#ifdef USE_IBL_LIGHTING
vec3 computeIBL(vec3 position, vec3 normal, vec3 lightDirection, vec3 lightColorHdr, czm_modelMaterial material)
{
    #if defined(DIFFUSE_IBL) || defined(SPECULAR_IBL)
        // Environment maps were provided, use them for IBL
        vec3 viewDirection = -normalize(position);
        // SCENEGIS_PATCH_BEGIN SGP-0010: Supply receiver position for physical diffuse sky.
        #ifdef SCENEGIS_MODEL_LIGHTING
            vec3 iblColor = textureIBL(viewDirection, normal, material, position);
        #else
            vec3 iblColor = textureIBL(viewDirection, normal, material);
        #endif
        // SCENEGIS_PATCH_END SGP-0010
        return iblColor;
    #endif
    
    return vec3(0.0);
}
#endif

#ifdef USE_CLEARCOAT
vec3 addClearcoatReflection(vec3 baseLayerColor, vec3 position, vec3 lightDirection, vec3 lightColorHdr, czm_modelMaterial material)
{
    vec3 viewDirection = -normalize(position);
    vec3 halfwayDirection = normalize(viewDirection + lightDirection);
    vec3 normal = material.clearcoatNormal;
    float NdotL = clamp(dot(normal, lightDirection), 0.001, 1.0);

    // clearcoatF0 = vec3(pow((ior - 1.0) / (ior + 1.0), 2.0)), but without KHR_materials_ior, ior is a constant 1.5.
    vec3 f0 = vec3(0.04);
    vec3 f90 = vec3(1.0);
    // Note: clearcoat Fresnel computed with dot(n, v) instead of dot(v, h).
    // This is to make it energy conserving with a simple layering function.
    float NdotV = clamp(dot(normal, viewDirection), 0.0, 1.0);
    vec3 F = fresnelSchlick2(f0, f90, NdotV);

    // compute specular reflection from direct lighting
    float roughness = material.clearcoatRoughness;
    float alphaRoughness = roughness * roughness;
    float directStrength = computeDirectSpecularStrength(normal, lightDirection, viewDirection, halfwayDirection, alphaRoughness);
    vec3 directReflection = F * directStrength * NdotL;
    vec3 color = lightColorHdr * directReflection;
    // SCENEGIS_PATCH_BEGIN SGP-0019: Local sources illuminate clearcoat independently of Sun shadows.
    #if defined(SCENEGIS_LOCAL_LIGHTS) && defined(LIGHTING_PBR) && defined(HAS_NORMALS)
    color += sceneGISLocalClearcoat(material, position);
    #endif
    // SCENEGIS_PATCH_END SGP-0019

    #ifdef SPECULAR_IBL
        // Find the direction in which to sample the environment map
        // SCENEGIS_PATCH_BEGIN SGP-0015: Clearcoat samples the same world-fixed environment as the base layer.
        vec3 reflectMC = sceneGISSpecularDirection(reflect(-viewDirection, normal));
        // SCENEGIS_PATCH_END SGP-0015
        // SCENEGIS_PATCH_BEGIN SGP-0016: Keep the clearcoat ray independent of base-layer roughness and normal.
        #if defined(SCENEGIS_SSR_CAPTURE) || defined(SCENEGIS_SSR_RECEIVE)
        sceneGISSSRCoatDirection = reflect(-viewDirection, normal);
        #endif
        // SCENEGIS_PATCH_END SGP-0016
        // SCENEGIS_PATCH_BEGIN SGP-0024: Clearcoat shares the position-aware local reflection source.
        #ifdef SCENEGIS_LOCAL_PROBES
        vec3 iblColor = computeSpecularIBL(reflectMC, NdotV, f0, roughness, position, reflect(-viewDirection, normal));
        #else
        vec3 iblColor = computeSpecularIBL(reflectMC, NdotV, f0, roughness);
        #endif
        // SCENEGIS_PATCH_END SGP-0024
        // SCENEGIS_PATCH_BEGIN SGP-0015: Physical clearcoat uses the same caller specular factor as the base layer.
        #ifdef SCENEGIS_MODEL_LIGHTING
        iblColor *= model_iblFactor.y;
        #endif
        // SCENEGIS_PATCH_END SGP-0015
        // SCENEGIS_PATCH_BEGIN SGP-0014: Apply screen-space visibility only to clearcoat IBL.
        #ifdef SCENEGIS_AMBIENT_OCCLUSION
        iblColor *= sceneGISAmbientOcclusion();
        #endif
        color += iblColor * material.occlusion;
        // SCENEGIS_PATCH_END SGP-0014
    #endif

    float clearcoatFactor = material.clearcoatFactor;
    vec3 clearcoatColor = color * clearcoatFactor;
    // SCENEGIS_PATCH_BEGIN SGP-0026: Preserve clearcoat attenuation in diffuse transport.
    #ifdef SCENEGIS_SSIL_MAIN
    sceneGISSILScale(1.0 - clearcoatFactor * F);
    #endif
    // SCENEGIS_PATCH_END SGP-0026

    // SCENEGIS_PATCH_BEGIN SGP-0014: Capture layered indirect energy for main-pass AO.
    #ifdef SCENEGIS_AO_MAIN
    sceneGISScaleIndirect(1.0 - clearcoatFactor * F);
    #ifdef SPECULAR_IBL
    sceneGISRecordIndirect(iblColor * material.occlusion * clearcoatFactor);
    #endif
    #endif
    // SCENEGIS_PATCH_END SGP-0014

    // SCENEGIS_PATCH_BEGIN SGP-0016: Preserve the full native layered response for MRT replacement.
    #ifdef SCENEGIS_SSR_MAIN
    sceneGISSSRBaseWeight *= 1.0 - clearcoatFactor * F;
    sceneGISSSRCoatWeight *= clearcoatFactor * material.occlusion;
    #ifdef SCENEGIS_MODEL_LIGHTING
    sceneGISSSRCoatWeight *= model_iblFactor.y;
    #endif
    #ifdef SCENEGIS_AMBIENT_OCCLUSION
    sceneGISSSRCoatWeight *= sceneGISAmbientOcclusion();
    #endif
    #endif
    // SCENEGIS_PATCH_END SGP-0016

    // Dim base layer based on transmission loss through clearcoat
    return baseLayerColor * (1.0 - clearcoatFactor * F) + clearcoatColor;
}
#endif

#if defined(LIGHTING_PBR) && defined(HAS_NORMALS)
vec3 computePbrLighting(in czm_modelMaterial material, in vec3 position)
{
    #ifdef USE_CUSTOM_LIGHT_COLOR
        vec3 lightColorHdr = model_lightColorHdr;
    #else
        vec3 lightColorHdr = czm_lightColorHdr;
    #endif

    vec3 viewDirection = -normalize(position);
    vec3 normal = material.normalEC;
    vec3 lightDirection = normalize(czm_lightDirectionEC);

    // SCENEGIS_PATCH_BEGIN SGP-0010: Apply physical irradiance and cloud attenuation before the BRDF.
    #ifdef SCENEGIS_MODEL_LIGHTING
        lightColorHdr = sceneGISModelDirectSource(position, lightColorHdr);
    #endif
    // SCENEGIS_PATCH_END SGP-0010

    // SCENEGIS_PATCH_BEGIN SGP-0018: Attenuate direct base and clearcoat light before tone mapping.
    #ifdef SCENEGIS_GEOMETRY_SHADOW
        lightColorHdr *= sceneGISGeometryShadow();
    #endif
    // SCENEGIS_PATCH_END SGP-0018

    vec3 directLighting = czm_pbrLighting(viewDirection, normal, lightDirection, material);
    vec3 directColor = lightColorHdr * directLighting;
    // SCENEGIS_PATCH_BEGIN SGP-0026: Record diffuse-only source and response before local lights and IBL.
    #ifdef SCENEGIS_SSIL_MAIN
    sceneGISSILRecord(material, lightDirection, lightColorHdr);
    #endif
    // SCENEGIS_PATCH_END SGP-0026
    // SCENEGIS_PATCH_BEGIN SGP-0019: Evaluate local sources through the same native PBR material.
    #ifdef SCENEGIS_LOCAL_LIGHTS
    directColor += sceneGISLocalPbr(material, position);
    #endif
    // SCENEGIS_PATCH_END SGP-0019

    // Accumulate colors from base layer
    vec3 color = directColor + material.emissive;
    #ifdef USE_IBL_LIGHTING
        // SCENEGIS_PATCH_BEGIN SGP-0014: Preserve direct and emissive radiance while occluding IBL.
        vec3 indirectColor = computeIBL(position, normal, lightDirection, lightColorHdr, material);
        #ifdef SCENEGIS_AMBIENT_OCCLUSION
        indirectColor *= sceneGISAmbientOcclusion();
        #endif
        color += indirectColor;
        #ifdef SCENEGIS_AO_MAIN
        sceneGISRecordIndirect(indirectColor);
        #endif
        // SCENEGIS_PATCH_END SGP-0014
        // SCENEGIS_PATCH_BEGIN SGP-0016: Apply the same AO visibility to the captured specular response.
        #if defined(SCENEGIS_SSR_MAIN) && defined(SCENEGIS_AMBIENT_OCCLUSION)
        sceneGISSSRBaseWeight *= sceneGISAmbientOcclusion();
        #endif
        // SCENEGIS_PATCH_END SGP-0016
    #endif

    #ifdef USE_CLEARCOAT
        color = addClearcoatReflection(color, position, lightDirection, lightColorHdr, material);
    #endif

    return color;
}
#endif

/**
 * Compute the material color under the current lighting conditions.
 * All other material properties are passed through so further stages
 * have access to them.
 *
 * @param {czm_modelMaterial} material The material properties from {@MaterialStageFS}
 * @param {ProcessedAttributes} attributes
 */
void lightingStage(inout czm_modelMaterial material, ProcessedAttributes attributes)
{
    #ifdef LIGHTING_PBR
        #ifdef HAS_NORMALS
            // SCENEGIS_PATCH_BEGIN SGP-0028: Evaluate coverage before BRDF filtering, direct light and IBL/MRT.
            #ifdef SCENEGIS_SURFACE_WEATHER
            sceneGISWeatherModel(material, attributes.positionEC, attributes.normalEC);
            #endif
            // SCENEGIS_PATCH_END SGP-0028
            // SCENEGIS_PATCH_BEGIN SGP-0025: Use the unperturbed normalized geometry normal.
            sceneGISFilterSpecular(material, attributes.normalEC);
            // SCENEGIS_PATCH_END SGP-0025
            vec3 color = computePbrLighting(material, attributes.positionEC);
        #else
            vec3 color = material.diffuse * material.occlusion + material.emissive;
        #endif
        // In HDR mode, the frame buffer is in linear color space. The
        // post-processing stages (see PostProcessStageCollection) will handle
        // tonemapping. However, if HDR is not enabled, we must tonemap else large
        // values may be clamped to 1.0
        #ifndef HDR
            color = czm_pbrNeutralTonemapping(color);
        #endif
    #else // unlit
        vec3 color = material.diffuse;
    #endif

    #ifdef HAS_POINT_CLOUD_COLOR_STYLE
        // The colors resulting from point cloud styles are adjusted differently.
        color = czm_gammaCorrect(color);
    #elif !defined(HDR)
        // If HDR is not enabled, the frame buffer stores sRGB colors rather than
        // linear colors so the linear value must be converted.
        color = czm_linearToSrgb(color);
    #endif

    // SCENEGIS_PATCH_BEGIN SGP-0045: Record surface properties before diffuse becomes lit color.
    #ifdef SCENEGIS_GBUFFER_MODEL_CAPTURE
    sceneGISRecordGBuffer(material);
    #endif
    // SCENEGIS_PATCH_END SGP-0045
    material.diffuse = color;
}

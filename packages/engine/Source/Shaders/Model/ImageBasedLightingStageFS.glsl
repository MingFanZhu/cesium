// SCENEGIS_PATCH_BEGIN SGP-0024: Declare owned probe source functions before native IBL evaluation.
#ifdef SCENEGIS_LOCAL_PROBES
vec3 sceneGISProbeRadiance(vec3 sky, vec3 positionEC, vec3 rayEC, float roughness);
float sceneGISProbeVisibility(vec3 positionEC, vec3 normalEC);
#endif
// SCENEGIS_PATCH_END SGP-0024
// SCENEGIS_PATCH_BEGIN SGP-0010: The source library is supplied by the primitive lighting stage.
#ifdef SCENEGIS_MODEL_DIFFUSE_SKY
vec3 sceneGISModelSkyIrradiance(vec3 positionEC, vec3 normalEC);
#endif
// SCENEGIS_PATCH_END SGP-0010
#ifdef DIFFUSE_IBL
vec3 sampleDiffuseEnvironment(vec3 cubeDir)
{
    #ifdef CUSTOM_SPHERICAL_HARMONICS
        return czm_sphericalHarmonics(cubeDir, model_sphericalHarmonicCoefficients); 
    #else
        return czm_sphericalHarmonics(cubeDir, czm_sphericalHarmonicCoefficients); 
    #endif
}
#endif

#ifdef SPECULAR_IBL
// SCENEGIS_PATCH_BEGIN SGP-0015: Keep default physical reflections fixed in the captured world frame.
vec3 sceneGISSpecularDirection(vec3 directionEC)
{
    #ifdef SCENEGIS_SKY_REFLECTIONS
    return normalize(u_sceneGISSkyWorldToLocal * czm_inverseViewRotation * directionEC);
    #else
    return normalize(model_iblReferenceFrameMatrix * directionEC);
    #endif
}
// SCENEGIS_PATCH_END SGP-0015
vec3 sampleSpecularEnvironment(vec3 cubeDir, float roughness)
{
    #ifdef CUSTOM_SPECULAR_IBL
        float lod = roughness * model_specularEnvironmentMapsMaximumLOD;
        // SCENEGIS_PATCH_BEGIN SGP-0015: Calibrate physical HDR radiance without modifying authored maps.
        vec3 radiance = czm_textureCube(model_specularEnvironmentMaps, cubeDir, lod).rgb;
        #ifdef SCENEGIS_SKY_REFLECTIONS
        radiance *= u_sceneGISSkyRadianceScale;
        #endif
        return radiance;
        // SCENEGIS_PATCH_END SGP-0015
    #else
        float lod = roughness * czm_specularEnvironmentMapsMaximumLOD;
        return czm_textureCube(czm_specularEnvironmentMaps, cubeDir, lod).rgb;
    #endif
}
// SCENEGIS_PATCH_BEGIN SGP-0024: Clearcoat local radiance requires the receiver position and ray.
#ifdef SCENEGIS_LOCAL_PROBES
vec3 computeSpecularIBL(vec3 cubeDir, float NdotV, vec3 f0, float roughness, vec3 positionEC, vec3 rayEC)
#else
vec3 computeSpecularIBL(vec3 cubeDir, float NdotV, vec3 f0, float roughness)
#endif
// SCENEGIS_PATCH_END SGP-0024
{
    // see https://bruop.github.io/ibl/ at Single Scattering Results
    // Roughness dependent fresnel, from Fdez-Aguera
    vec3 f90 = max(vec3(1.0 - roughness), f0);
    vec3 F = fresnelSchlick2(f0, f90, NdotV);

    vec2 brdfLut = texture(czm_brdfLut, vec2(NdotV, roughness)).rg;
    vec3 specularSample = sampleSpecularEnvironment(cubeDir, roughness);
    // SCENEGIS_PATCH_BEGIN SGP-0024: Substitute cached local radiance before SSR and material weighting.
    #ifdef SCENEGIS_LOCAL_PROBES
    specularSample = sceneGISProbeRadiance(specularSample, positionEC, rayEC, roughness);
    #endif
    // SCENEGIS_PATCH_END SGP-0024
    // SCENEGIS_PATCH_BEGIN SGP-0014: Occlude only the environment before clearcoat SSR recording.
    #ifdef SCENEGIS_DIRECTIONAL_OCCLUSION
    specularSample *= sceneGISSpecularVisibility(sceneGISOcclusionCoatDirection, roughness);
    #endif
    // SCENEGIS_PATCH_END SGP-0014
    // SCENEGIS_PATCH_BEGIN SGP-0016: Substitute clearcoat radiance before its native BRDF weight.
    #ifdef SCENEGIS_SSR_MAIN
    specularSample = sceneGISSSR(specularSample, sceneGISSSRCoatDirection, roughness, true);
    sceneGISSSRCoatWeight = F * brdfLut.x + brdfLut.y;
    #endif
    // SCENEGIS_PATCH_END SGP-0016

    return specularSample * (F * brdfLut.x + brdfLut.y);
}
#endif

#if defined(DIFFUSE_IBL) || defined(SPECULAR_IBL)
/**
 * Compute the light contributions from environment maps and spherical harmonic coefficients.
 * See Fdez-Aguera, https://www.jcgt.org/published/0008/01/03/paper.pdf, for explanation
 * of the single- and multi-scattering terms.
 *
 * @param {vec3} viewDirectionEC Unit vector pointing from the fragment to the eye position.
 * @param {vec3} normalEC The surface normal in eye coordinates.
 * @param {czm_modelMaterial} The material properties.
 * @return {vec3} The computed HDR color.
 */
// SCENEGIS_PATCH_BEGIN SGP-0010: Retain the native signature outside the physical lighting variant.
#ifdef SCENEGIS_MODEL_LIGHTING
vec3 textureIBL(vec3 viewDirectionEC, vec3 normalEC, czm_modelMaterial material, vec3 positionEC) {
#else
vec3 textureIBL(vec3 viewDirectionEC, vec3 normalEC, czm_modelMaterial material) {
#endif
// SCENEGIS_PATCH_END SGP-0010
    vec3 f0 = material.specular;
    float roughness = material.roughness;
    float specularWeight = 1.0;
    #ifdef USE_SPECULAR
        specularWeight = material.specularWeight;
    #endif
    float NdotV = clamp(dot(normalEC, viewDirectionEC), 0.0, 1.0);

    // see https://bruop.github.io/ibl/ at Single Scattering Results
    // Roughness dependent fresnel, from Fdez-Aguera
    vec3 f90 = max(vec3(1.0 - roughness), f0);
    vec3 singleScatterFresnel = fresnelSchlick2(f0, f90, NdotV);

    vec2 brdfLut = texture(czm_brdfLut, vec2(NdotV, roughness)).rg;
    vec3 FssEss = specularWeight * (singleScatterFresnel * brdfLut.x + brdfLut.y);

    #ifdef DIFFUSE_IBL
        vec3 normalMC = normalize(model_iblReferenceFrameMatrix * normalEC);
        vec3 irradiance = sampleDiffuseEnvironment(normalMC);
        // SCENEGIS_PATCH_BEGIN SGP-0010: Replace only default diffuse irradiance, preserving native material weighting.
        #ifdef SCENEGIS_MODEL_DIFFUSE_SKY
            irradiance = sceneGISModelSkyIrradiance(positionEC, normalEC);
        #endif
        // SCENEGIS_PATCH_END SGP-0010

        // SCENEGIS_PATCH_BEGIN SGP-0024: Occlude only default sky diffuse, retaining authored SH.
        #if defined(SCENEGIS_MODEL_DIFFUSE_SKY) && defined(SCENEGIS_LOCAL_PROBES)
        irradiance *= sceneGISProbeVisibility(positionEC, normalEC);
        #endif
        // SCENEGIS_PATCH_END SGP-0024
        vec3 averageFresnel = f0 + (1.0 - f0) / 21.0;
        float Ems = specularWeight * (1.0 - brdfLut.x - brdfLut.y);
        vec3 FmsEms = FssEss * averageFresnel * Ems / (1.0 - averageFresnel * Ems);
        vec3 dielectricScattering = (1.0 - FssEss - FmsEms) * material.diffuse;
        vec3 diffuseContribution = irradiance * (FmsEms + dielectricScattering) * model_iblFactor.x;
        // SCENEGIS_PATCH_BEGIN SGP-0014: Retain scalar diffuse visibility in directional PBR lighting.
        #ifdef SCENEGIS_DIRECTIONAL_OCCLUSION
        diffuseContribution *= sceneGISDiffuseVisibility();
        #endif
        // SCENEGIS_PATCH_END SGP-0014
    #else
        vec3 diffuseContribution = vec3(0.0);
    #endif

    #ifdef USE_ANISOTROPY
        // Bend normal to account for anisotropic distortion of specular reflection
        vec3 anisotropyDirection = material.anisotropicB;
        vec3 anisotropicTangent = cross(anisotropyDirection, viewDirectionEC);
        vec3 anisotropicNormal = cross(anisotropicTangent, anisotropyDirection);
        float bendFactor = 1.0 - material.anisotropyStrength * (1.0 - roughness);
        float bendFactorPow4 = bendFactor * bendFactor * bendFactor * bendFactor;
        vec3 bentNormal = normalize(mix(anisotropicNormal, normalEC, bendFactorPow4));
        vec3 reflectEC = reflect(-viewDirectionEC, bentNormal);
    #else
        vec3 reflectEC = reflect(-viewDirectionEC, normalEC);
    #endif

    #ifdef SPECULAR_IBL
        // SCENEGIS_PATCH_BEGIN SGP-0015: Preserve anisotropic reflection directions in world space.
        vec3 reflectMC = sceneGISSpecularDirection(reflectEC);
        // SCENEGIS_PATCH_END SGP-0015
        vec3 radiance = sampleSpecularEnvironment(reflectMC, roughness);
        // SCENEGIS_PATCH_BEGIN SGP-0024: Local probes supply screen-external radiance before SSR.
        #ifdef SCENEGIS_LOCAL_PROBES
        radiance = sceneGISProbeRadiance(radiance, positionEC, reflectEC, roughness);
        #endif
        // SCENEGIS_PATCH_END SGP-0024
        // SCENEGIS_PATCH_BEGIN SGP-0014: Keep the native ray and BRDF while occluding environment radiance.
        #ifdef SCENEGIS_DIRECTIONAL_OCCLUSION
        radiance *= sceneGISSpecularVisibility(reflectEC, roughness);
        #endif
        // SCENEGIS_PATCH_END SGP-0014
        // SCENEGIS_PATCH_BEGIN SGP-0016: Record the native anisotropic response for screen-space reflections.
        #ifdef SCENEGIS_SSR_MAIN
        radiance = sceneGISSSR(radiance, reflectEC, roughness, false);
        sceneGISSSRBaseWeight = FssEss * model_iblFactor.y;
        #endif
        // SCENEGIS_PATCH_END SGP-0016
        vec3 specularContribution = radiance * FssEss * model_iblFactor.y;
    #else
        vec3 specularContribution = vec3(0.0);
    #endif

    return diffuseContribution + specularContribution;
}
#endif

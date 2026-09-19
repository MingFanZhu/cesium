// SCENEGIS_PATCH_BEGIN SGP-0014: Builtins precede the receiver shader's AO definition.
#ifdef SCENEGIS_AMBIENT_OCCLUSION
float sceneGISAmbientOcclusion();
#endif
// SCENEGIS_PATCH_END SGP-0014
// SCENEGIS_PATCH_BEGIN SGP-0018: Builtins precede the receiver's private shadow definition.
#ifdef SCENEGIS_GEOMETRY_SHADOW
#define SCENEGIS_DIRECT_SHADOW_RECEIVER
float sceneGISGeometryShadow();
#endif
// SCENEGIS_PATCH_END SGP-0018
// SCENEGIS_PATCH_BEGIN SGP-0019: Builtins precede owned local-light function definitions.
#ifdef SCENEGIS_LOCAL_LIGHTS
vec3 sceneGISLocalPositionEC();
vec3 sceneGISLocalPhong(vec3 positionEC, vec3 normalEC, vec3 toEye, vec3 diffuse, float specular, float shininess);
#endif
// SCENEGIS_PATCH_END SGP-0019
float czm_private_getLambertDiffuseOfMaterial(vec3 lightDirectionEC, czm_material material)
{
    return czm_getLambertDiffuse(lightDirectionEC, material.normal);
}

float czm_private_getSpecularOfMaterial(vec3 lightDirectionEC, vec3 toEyeEC, czm_material material)
{
    return czm_getSpecular(lightDirectionEC, toEyeEC, material.normal, material.shininess);
}

/**
 * Computes a color using the Phong lighting model.
 *
 * @name czm_phong
 * @glslFunction
 *
 * @param {vec3} toEye A normalized vector from the fragment to the eye in eye coordinates.
 * @param {czm_material} material The fragment's material.
 *
 * @returns {vec4} The computed color.
 *
 * @example
 * vec3 positionToEyeEC = // ...
 * czm_material material = // ...
 * vec3 lightDirectionEC = // ...
 * out_FragColor = czm_phong(normalize(positionToEyeEC), material, lightDirectionEC);
 *
 * @see czm_getMaterial
 */
vec4 czm_phong(vec3 toEye, czm_material material, vec3 lightDirectionEC)
{
    // Diffuse from directional light sources at eye (for top-down)
    float diffuse = czm_private_getLambertDiffuseOfMaterial(vec3(0.0, 0.0, 1.0), material);
    if (czm_sceneMode == czm_sceneMode3D) {
        // (and horizon views in 3D)
        diffuse += czm_private_getLambertDiffuseOfMaterial(vec3(0.0, 1.0, 0.0), material);
    }

    float specular = czm_private_getSpecularOfMaterial(lightDirectionEC, toEye, material);

    // Temporary workaround for adding ambient.
    vec3 materialDiffuse = material.diffuse * 0.5;

    // SCENEGIS_PATCH_BEGIN SGP-0014: Occlude ambient light without changing direct light or emission.
    vec3 ambient = materialDiffuse;
    #ifdef SCENEGIS_AMBIENT_OCCLUSION
    ambient *= sceneGISAmbientOcclusion();
    #endif
    // SCENEGIS_PATCH_END SGP-0014
    vec3 color = ambient + material.emission;
    // SCENEGIS_PATCH_BEGIN SGP-0018: Preserve ambient and emission under geometric shadows.
    vec3 directLight = czm_lightColor;
    #ifdef SCENEGIS_GEOMETRY_SHADOW
    directLight *= sceneGISGeometryShadow();
    #endif
    color += materialDiffuse * diffuse * directLight;
    color += material.specular * specular * directLight;
    // SCENEGIS_PATCH_END SGP-0018

    // SCENEGIS_PATCH_BEGIN SGP-0019: Preserve emission and ambient while accumulating local sources.
    #ifdef SCENEGIS_LOCAL_LIGHTS
    color += sceneGISLocalPhong(sceneGISLocalPositionEC(), material.normal, toEye,
        material.diffuse, material.specular, material.shininess);
    #endif
    // SCENEGIS_PATCH_END SGP-0019
    return vec4(color, material.alpha);
}

vec4 czm_private_phong(vec3 toEye, czm_material material, vec3 lightDirectionEC)
{
    float diffuse = czm_private_getLambertDiffuseOfMaterial(lightDirectionEC, material);
    float specular = czm_private_getSpecularOfMaterial(lightDirectionEC, toEye, material);

    vec3 ambient = vec3(0.0);
    vec3 color = ambient + material.emission;
    // SCENEGIS_PATCH_BEGIN SGP-0018: Preserve emission while shadowing direct diffuse and specular.
    vec3 directLight = czm_lightColor;
    #ifdef SCENEGIS_GEOMETRY_SHADOW
    directLight *= sceneGISGeometryShadow();
    #endif
    color += material.diffuse * diffuse * directLight;
    color += material.specular * specular * directLight;
    // SCENEGIS_PATCH_END SGP-0018

    // SCENEGIS_PATCH_BEGIN SGP-0019: Apply the same local-light semantics to private Phong receivers.
    #ifdef SCENEGIS_LOCAL_LIGHTS
    color += sceneGISLocalPhong(sceneGISLocalPositionEC(), material.normal, toEye,
        material.diffuse, material.specular, material.shininess);
    #endif
    // SCENEGIS_PATCH_END SGP-0019
    return vec4(color, material.alpha);
}

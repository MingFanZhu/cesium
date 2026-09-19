// SCENEGIS_PATCH_BEGIN SGP-0019: OIT uses its own Phong builtin with the same local sources.
#ifdef SCENEGIS_GEOMETRY_SHADOW
#define SCENEGIS_DIRECT_SHADOW_RECEIVER
float sceneGISGeometryShadow();
#endif
#ifdef SCENEGIS_LOCAL_LIGHTS
vec3 sceneGISLocalPositionEC();
vec3 sceneGISLocalPhong(vec3 positionEC, vec3 normalEC, vec3 toEye, vec3 diffuse, float specular, float shininess);
#endif
// SCENEGIS_PATCH_END SGP-0019
/**
 * @private
 */
vec4 czm_translucentPhong(vec3 toEye, czm_material material, vec3 lightDirectionEC)
{
    // Diffuse from directional light sources at eye (for top-down and horizon views)
    float diffuse = czm_getLambertDiffuse(vec3(0.0, 0.0, 1.0), material.normal);

    if (czm_sceneMode == czm_sceneMode3D) {
        // (and horizon views in 3D)
        diffuse += czm_getLambertDiffuse(vec3(0.0, 1.0, 0.0), material.normal);
    }

    diffuse = clamp(diffuse, 0.0, 1.0);

    float specular = czm_getSpecular(lightDirectionEC, toEye, material.normal, material.shininess);

    // Temporary workaround for adding ambient.
    vec3 materialDiffuse = material.diffuse * 0.5;

    vec3 ambient = materialDiffuse;
    vec3 color = ambient + material.emission;
    // SCENEGIS_PATCH_BEGIN SGP-0019: Sun shadows must not suppress independent local sources in OIT.
    vec3 directLight = czm_lightColor;
    #ifdef SCENEGIS_GEOMETRY_SHADOW
    directLight *= sceneGISGeometryShadow();
    #endif
    color += materialDiffuse * diffuse * directLight;
    color += material.specular * specular * directLight;
    // SCENEGIS_PATCH_END SGP-0019

    // SCENEGIS_PATCH_BEGIN SGP-0019: Shade local lights before native transparency accumulation.
    #ifdef SCENEGIS_LOCAL_LIGHTS
    color += sceneGISLocalPhong(sceneGISLocalPositionEC(), material.normal, toEye,
        material.diffuse, material.specular, material.shininess);
    #endif
    // SCENEGIS_PATCH_END SGP-0019
    return vec4(color, material.alpha);
}

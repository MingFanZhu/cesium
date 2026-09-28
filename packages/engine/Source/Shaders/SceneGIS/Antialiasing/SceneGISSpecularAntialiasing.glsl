// Geometry roughness adapted from Three.js r180 (MIT).
// See Assets/SceneGIS/Antialiasing/Three-LICENSE.txt and Three-reference.json.
// The PMREM-specific roughness floor is deliberately not used in Cesium.
#if defined(LIGHTING_PBR) && defined(HAS_NORMALS)
void sceneGISFilterSpecular(inout czm_modelMaterial material, vec3 geometryNormal)
{
    if (!u_sceneGISSpecularAntialiasing)
    {
        return;
    }
    vec3 dxy = max(abs(dFdx(geometryNormal)), abs(dFdy(geometryNormal)));
    float geometryRoughness = max(max(dxy.x, dxy.y), dxy.z);
    material.roughness = min(material.roughness + geometryRoughness, 1.0);
    #ifdef USE_CLEARCOAT
    material.clearcoatRoughness = min(material.clearcoatRoughness + geometryRoughness, 1.0);
    #endif
}
#endif

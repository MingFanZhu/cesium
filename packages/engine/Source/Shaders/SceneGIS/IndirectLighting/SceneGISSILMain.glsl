layout(location = SCENEGIS_SSIL_SOURCE_LOCATION) out vec4 sceneGISSILSourceOutput;
layout(location = SCENEGIS_SSIL_RESPONSE_LOCATION) out vec4 sceneGISSILResponseOutput;
vec3 sceneGISSILSource = vec3(0.0);
vec3 sceneGISSILResponse = vec3(0.0);
vec2 sceneGISSILNormal = vec2(0.0);

void sceneGISSILScale(vec3 weight)
{
    sceneGISSILSource *= weight;
    sceneGISSILResponse *= weight;
}

#if defined(LIGHTING_PBR) && defined(HAS_NORMALS)
vec3 sceneGISSILDiffuse(czm_modelMaterial material)
{
    // View-independent diffuse transport; material.diffuse already excludes metals.
    vec3 f0 = material.specular;
    #ifdef USE_SPECULAR
    f0 *= material.specularWeight;
    #endif
    return material.diffuse * (1.0 - f0);
}

void sceneGISSILRecord(czm_modelMaterial material, vec3 direction, vec3 irradiance)
{
    vec3 n = normalize(material.normalEC);
    vec3 oct = n / (abs(n.x) + abs(n.y) + abs(n.z));
    vec2 encoded = oct.xy;
    if (oct.z < 0.0) {
        encoded = (1.0 - abs(encoded.yx)) * vec2(encoded.x < 0.0 ? -1.0 : 1.0, encoded.y < 0.0 ? -1.0 : 1.0);
    }
    // Alpha zero marks unsupported material/background; valid X is in [1, 2].
    sceneGISSILNormal = encoded * 0.5 + 0.5;
    sceneGISSILNormal.x += 1.0;
    vec3 diffuse = sceneGISSILDiffuse(material);
    sceneGISSILResponse = diffuse * material.occlusion;
    sceneGISSILSource = diffuse * irradiance * max(dot(n, direction), 0.0) / czm_pi + material.emissive;
}

void sceneGISSILLocal(czm_modelMaterial material, vec3 direction, vec3 irradiance)
{
    sceneGISSILSource += sceneGISSILDiffuse(material) * irradiance * max(dot(material.normalEC, direction), 0.0) / czm_pi;
}
#endif

void sceneGISSILWrite()
{
    sceneGISSILSourceOutput = vec4(sceneGISSILSource, sceneGISSILNormal.x);
    sceneGISSILResponseOutput = vec4(sceneGISSILResponse, sceneGISSILNormal.y);
}

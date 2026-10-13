uniform float u_sceneGISDeferredGroup;
layout(location = 1) out vec4 sceneGISDeferredNormal;
layout(location = 3) out vec4 sceneGISDeferredEmission;

#ifdef SCENEGIS_GBUFFER_MODEL_CAPTURE
layout(location = 2) out vec4 sceneGISDeferredSpecular;
vec4 sceneGISDeferredDiffuseValue;
vec4 sceneGISDeferredNormalValue;
vec3 sceneGISDeferredSpecularValue;
vec3 sceneGISDeferredEmissionValue;

void sceneGISRecordGBuffer(czm_modelMaterial material)
{
    sceneGISDeferredDiffuseValue = vec4(material.diffuse, material.occlusion);
    sceneGISDeferredNormalValue = vec4(material.normalEC, material.roughness);
    sceneGISDeferredSpecularValue = material.specular;
    sceneGISDeferredEmissionValue = material.emissive;
}
#endif

void sceneGISWriteDeferredMaterial()
{
#ifdef SCENEGIS_GBUFFER_MODEL_CAPTURE
    out_FragColor = sceneGISDeferredDiffuseValue;
    sceneGISDeferredNormal = sceneGISDeferredNormalValue;
    sceneGISDeferredSpecular = vec4(sceneGISDeferredSpecularValue, u_sceneGISDeferredGroup);
    float visibility = 1.0;
    #ifdef SCENEGIS_GEOMETRY_SHADOW
    visibility = sceneGISGeometryShadow();
    #endif
    sceneGISDeferredEmission = vec4(sceneGISDeferredEmissionValue, visibility);
#else
    // Ordinary opaque content retains native color and its indirect-only response.
    sceneGISDeferredNormal = vec4(0.0);
    sceneGISIndirectOutput = vec4(sceneGISIndirect, -1.0);
    sceneGISDeferredEmission = vec4(0.0);
#endif
}

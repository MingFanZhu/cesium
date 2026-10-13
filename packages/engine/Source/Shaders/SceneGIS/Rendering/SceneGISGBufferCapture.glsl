layout(location = 1) out vec4 sceneGISGBufferNormal;
layout(location = 2) out vec4 sceneGISGBufferSpecular;
layout(location = 3) out vec4 sceneGISGBufferEmission;
vec4 sceneGISGBufferDiffuseValue = vec4(0.0);
vec4 sceneGISGBufferNormalValue = vec4(0.0);
vec4 sceneGISGBufferSpecularValue = vec4(0.0);
vec4 sceneGISGBufferEmissionValue = vec4(0.0);

#ifdef SCENEGIS_GBUFFER_MODEL_CAPTURE
void sceneGISRecordGBuffer(czm_modelMaterial material)
{
    float kind = 2.0;
    #ifdef LIGHTING_PBR
        #ifdef HAS_NORMALS
            kind = 1.0;
        #else
            kind = 3.0;
        #endif
    #endif
    sceneGISGBufferDiffuseValue = vec4(material.diffuse, material.occlusion);
    sceneGISGBufferNormalValue = vec4(material.normalEC, material.roughness);
    sceneGISGBufferSpecularValue = vec4(material.specular, kind);
    sceneGISGBufferEmissionValue = vec4(material.emissive, 1.0);
}
#endif

void sceneGISWriteGBuffer()
{
    out_FragColor = sceneGISGBufferDiffuseValue;
    sceneGISGBufferNormal = sceneGISGBufferNormalValue;
    sceneGISGBufferSpecular = sceneGISGBufferSpecularValue;
    sceneGISGBufferEmission = sceneGISGBufferEmissionValue;
}

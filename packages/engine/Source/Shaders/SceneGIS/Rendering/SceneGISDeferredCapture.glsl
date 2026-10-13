uniform float u_sceneGISDeferredGroup;
#ifdef SCENEGIS_DEFERRED_STYLE_TARGET
layout(location = 4) out vec4 sceneGISDeferredStyle;
#endif
layout(location = 1) out vec4 sceneGISDeferredNormal;
layout(location = 3) out vec4 sceneGISDeferredEmission;

#if defined(SCENEGIS_GBUFFER_MODEL_CAPTURE) || defined(SCENEGIS_DEFERRED_PHONG_CAPTURE)
layout(location = 2) out vec4 sceneGISDeferredSpecular;
vec4 sceneGISDeferredDiffuseValue;
vec4 sceneGISDeferredNormalValue;
vec3 sceneGISDeferredSpecularValue;
vec3 sceneGISDeferredEmissionValue;
vec3 sceneGISDeferredStyleValue = vec3(1.0);

void sceneGISRecordFeatureStyle(vec3 multiplier)
{
    sceneGISDeferredStyleValue = multiplier;
}

#ifdef SCENEGIS_DEFERRED_PHONG_CAPTURE
void sceneGISRecordPhong(czm_material material)
{
    sceneGISDeferredDiffuseValue = vec4(material.diffuse, material.alpha);
    sceneGISDeferredNormalValue = vec4(material.normal, material.shininess);
    sceneGISDeferredSpecularValue = vec3(material.specular);
    sceneGISDeferredEmissionValue = material.emission;
}
#else
void sceneGISRecordGBuffer(czm_modelMaterial material)
{
    sceneGISDeferredDiffuseValue = vec4(material.diffuse, material.occlusion);
    sceneGISDeferredNormalValue = vec4(material.normalEC, material.roughness);
    sceneGISDeferredSpecularValue = material.specular;
    sceneGISDeferredEmissionValue = material.emissive;
}
#endif
#endif

void sceneGISWriteDeferredMaterial()
{
#ifdef SCENEGIS_DEFERRED_STYLE_TARGET
    #ifdef SCENEGIS_GBUFFER_MODEL_CAPTURE
    sceneGISDeferredStyle = vec4(sceneGISDeferredStyleValue, 1.0);
    #else
    sceneGISDeferredStyle = vec4(1.0);
    #endif
#endif
#if defined(SCENEGIS_GBUFFER_MODEL_CAPTURE) || defined(SCENEGIS_DEFERRED_PHONG_CAPTURE)
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

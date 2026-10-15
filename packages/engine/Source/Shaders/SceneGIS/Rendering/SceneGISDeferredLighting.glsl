void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec4 specular = texelFetch(u_sceneGISDeferredSpecular, pixel, 0);
    if (specular.a != u_sceneGISDeferredGroup) {
        discard;
    }
    vec4 diffuse = texelFetch(u_sceneGISDeferredDiffuse, pixel, 0);
#ifdef SCENEGIS_DEFERRED_PASSTHROUGH
    out_FragColor = diffuse;
    #ifdef SCENEGIS_AO_MAIN
    sceneGISRecordIndirect(specular.rgb);
    #endif
#else
    vec4 normal = texelFetch(u_sceneGISDeferredNormal, pixel, 0);
    #ifdef SCENEGIS_DEFERRED_POINT_EDL
    if (normal.w < 0.0) {
        out_FragColor = diffuse;
        return;
    }
    #endif
    czm_modelMaterial material;
    material.diffuse = diffuse.rgb;
    material.occlusion = diffuse.a;
    material.specular = specular.rgb;
    material.normalEC = normal.xyz;
    material.roughness = normal.w;
    material.emissive = texelFetch(u_sceneGISDeferredEmission, pixel, 0).rgb;
    material.alpha = 1.0;
    #ifdef SCENEGIS_DEFERRED_EXTENSIONS
    sceneGISRestoreExtensions(material, pixel);
    #endif
    #ifdef LIGHTING_PBR
        #ifdef HAS_NORMALS
        float depth = texelFetch(u_linearDepth, pixel, 0).r;
        vec3 positionEC = sceneGISAOPosition(gl_FragCoord.xy, depth);
        #ifdef PRIMITIVE_TYPE_POINTS
        positionEC = sceneGISAOPosition(gl_FragCoord.xy - sceneGISPointOffset, depth);
        #endif
        vec3 color = computePbrLighting(material, positionEC);
        #else
        vec3 color = material.diffuse * material.occlusion + material.emissive;
        #endif
    #else
    vec3 color = material.diffuse;
    #endif
    #ifdef HAS_POINT_CLOUD_COLOR_STYLE
    color = czm_gammaCorrect(color);
    #endif
    #ifdef SCENEGIS_DEFERRED_FEATURE_STYLE
    vec3 multiplier = texelFetch(u_sceneGISDeferredStyle, pixel, 0).rgb;
    color *= multiplier;
        #ifdef SCENEGIS_AO_MAIN
        sceneGISScaleIndirect(multiplier);
        #endif
        #ifdef SCENEGIS_SSR_MAIN
        sceneGISSSRScale(multiplier);
        #endif
        #ifdef SCENEGIS_SSIL_MAIN
        sceneGISSILScale(multiplier);
        #endif
    #endif
    material.diffuse = color;
    #ifdef HAS_MODEL_COLOR
    modelColorStage(material);
    #endif
    #ifdef HAS_PRIMITIVE_OUTLINE
        #ifdef SCENEGIS_DEFERRED_OUTLINE_STYLE
        float outline = texelFetch(u_sceneGISDeferredStyle, pixel, 0).a;
        #else
        float outline = sceneGISDeferredOutline;
        #endif
    float outlineAlpha = model_outlineColor.a * outline;
    material.diffuse = mix(material.diffuse, model_outlineColor.rgb, outlineAlpha);
        #ifdef SCENEGIS_AO_MAIN
        sceneGISScaleIndirect(vec3(1.0 - outlineAlpha));
        #endif
        #ifdef SCENEGIS_SSR_MAIN
        sceneGISSSRScale(vec3(1.0 - outlineAlpha));
        #endif
        #ifdef SCENEGIS_SSIL_MAIN
        sceneGISSILScale(vec3(1.0 - outlineAlpha));
        #endif
    #endif
    out_FragColor = vec4(material.diffuse, material.alpha);
#endif
}

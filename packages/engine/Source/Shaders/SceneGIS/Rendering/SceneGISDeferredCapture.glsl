uniform float u_sceneGISDeferredGroup;
#ifndef SCENEGIS_DEFERRED_GLOBE_BLEND
#ifdef SCENEGIS_DEFERRED_DEPTH_LOCATION
layout(location = SCENEGIS_DEFERRED_DEPTH_LOCATION) out vec2 sceneGISDeferredDepth;
uniform float u_sceneGISDeferredFrustumTag;
#endif
#ifdef SCENEGIS_DEFERRED_OCEAN_LOCATION
layout(location = SCENEGIS_DEFERRED_OCEAN_LOCATION) out vec4 sceneGISDeferredOcean;
#endif
#ifdef SCENEGIS_DEFERRED_CLASSIFICATION_LOCATION
layout(location = SCENEGIS_DEFERRED_CLASSIFICATION_LOCATION) out vec4 sceneGISClassificationOverlay;
#endif
#ifdef SCENEGIS_DEFERRED_STYLE_TARGET
layout(location = 4) out vec4 sceneGISDeferredStyle;
#endif
layout(location = 1) out vec4 sceneGISDeferredNormal;
layout(location = 3) out vec4 sceneGISDeferredEmission;
#endif

#if defined(SCENEGIS_GBUFFER_MODEL_CAPTURE) || defined(SCENEGIS_DEFERRED_PHONG_CAPTURE) || defined(SCENEGIS_DEFERRED_GLOBE_CAPTURE)
#ifndef SCENEGIS_DEFERRED_GLOBE_BLEND
layout(location = 2) out vec4 sceneGISDeferredSpecular;
#endif
vec4 sceneGISDeferredDiffuseValue;
vec4 sceneGISDeferredNormalValue;
vec3 sceneGISDeferredSpecularValue;
vec3 sceneGISDeferredEmissionValue;
vec3 sceneGISDeferredStyleValue = vec3(1.0);

void sceneGISRecordFeatureStyle(vec3 multiplier)
{
    sceneGISDeferredStyleValue = multiplier;
}

#ifdef SCENEGIS_DEFERRED_GLOBE_CAPTURE
vec4 sceneGISDeferredOceanValue = vec4(0.0);
vec4 sceneGISDeferredGlobeFabricValue = vec4(0.0);

void sceneGISRecordGlobeWater(float mask)
{
    sceneGISDeferredOceanValue.w = mask;
}

void sceneGISRecordGlobeWaves(vec3 normalEC)
{
    sceneGISDeferredOceanValue.xyz = normalEC;
}

void sceneGISRecordGlobeFabric(vec4 color)
{
    sceneGISDeferredGlobeFabricValue = color;
}

vec4 sceneGISComposeGlobeMaterial(vec4 surfaceColor, vec4 materialColor)
{
    float remainingAlpha = surfaceColor.a * (1.0 - materialColor.a);
    float alpha = materialColor.a + remainingAlpha;
    vec3 premultiplied = materialColor.rgb * materialColor.a + surfaceColor.rgb * remainingAlpha;
    return vec4(alpha > 0.0 ? premultiplied / alpha : vec3(0.0), alpha);
}

void sceneGISRecordGlobeEdge(vec3 color)
{
    sceneGISDeferredDiffuseValue = vec4(color, 1.0);
    sceneGISDeferredSpecularValue.x += 16.0;
}

void sceneGISRecordGlobe(vec4 color, vec3 normalEC, vec3 positionEC, float fade, vec3 lightingParameters)
{
    sceneGISDeferredDiffuseValue = color;
    sceneGISDeferredNormalValue = vec4(normalEC, fade);
    sceneGISDeferredSpecularValue = lightingParameters;
    #if defined(HAS_WATER_MASK) && (defined(SHOW_REFLECTIVE_OCEAN) || defined(APPLY_MATERIAL))
    sceneGISDeferredSpecularValue.x += 32.0;
    #endif
    #ifdef SHOW_REFLECTIVE_OCEAN
    sceneGISDeferredSpecularValue.x += 64.0;
        #ifdef SHOW_OCEAN_WAVES
        sceneGISDeferredSpecularValue.x += 128.0;
        #endif
        #ifdef APPLY_MATERIAL
        sceneGISDeferredSpecularValue.x += 256.0;
        #endif
    #endif
    // Bits through 1024 keep the combined flags within exact half-float integers (2047).
    #ifdef HIGHLIGHT_FILL_TILE
    sceneGISDeferredSpecularValue.x += 512.0;
    #endif
    #ifdef UNDERGROUND_COLOR
    if (czm_backFacing()) {
        sceneGISDeferredSpecularValue.x += 1024.0;
    }
    #endif
    // Preserve each tile's atmosphere selection independently of the shared light program.
    if (!czm_backFacing()) {
        #ifdef FOG
        sceneGISDeferredSpecularValue.x += 4.0;
        #elif defined(GROUND_ATMOSPHERE)
        sceneGISDeferredSpecularValue.x += 8.0;
        #endif
    }
    // Globe has no emissive term. Keep its geometric normal for screen-space weather.
    sceneGISDeferredEmissionValue = normalize(cross(dFdx(positionEC), dFdy(positionEC)));
}
#elif defined(SCENEGIS_DEFERRED_PHONG_CAPTURE)
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
#ifdef SCENEGIS_DEFERRED_GLOBE_BLEND
    // Only imagery color is composited; other surface fields remain unchanged.
    out_FragColor = sceneGISDeferredDiffuseValue;
#else
#ifdef SCENEGIS_DEFERRED_DEPTH_LOCATION
    #ifdef LOG_DEPTH
    vec4 sceneGISEye = czm_windowToEyeCoordinates(gl_FragCoord.xy, gl_FragDepth);
    #else
    vec4 sceneGISEye = czm_windowToEyeCoordinates(gl_FragCoord);
    #endif
    sceneGISDeferredDepth = vec2(-sceneGISEye.z / sceneGISEye.w, u_sceneGISDeferredFrustumTag);
#endif
#ifdef SCENEGIS_DEFERRED_CLASSIFICATION_LOCATION
    // A newly visible surface replaces any classification of the previous surface.
    sceneGISClassificationOverlay = vec4(0.0);
    #if defined(SCENEGIS_DEFERRED_GLOBE_CAPTURE) && defined(HAS_VECTOR_LAYER)
    // Native vectors are post-lighting premultiplied overlays, evaluated once per tile.
    sceneGISClassificationOverlay = vectorPolygonRender(v_textureCoordinates.xy, sceneGISClassificationOverlay);
    sceneGISClassificationOverlay = vectorPolylineRender(v_textureCoordinates.xy, sceneGISClassificationOverlay);
    #endif
#endif
#ifdef SCENEGIS_DEFERRED_STYLE_TARGET
    #ifdef SCENEGIS_GBUFFER_MODEL_CAPTURE
    sceneGISDeferredStyle = vec4(sceneGISDeferredStyleValue, 1.0);
    #elif defined(SCENEGIS_DEFERRED_GLOBE_CAPTURE) && defined(SHOW_REFLECTIVE_OCEAN) && defined(APPLY_MATERIAL)
    sceneGISDeferredStyle = sceneGISDeferredGlobeFabricValue;
    #else
    sceneGISDeferredStyle = vec4(1.0);
    #endif
#endif
#ifdef SCENEGIS_DEFERRED_OCEAN_LOCATION
    #ifdef SCENEGIS_DEFERRED_GLOBE_CAPTURE
    sceneGISDeferredOcean = sceneGISDeferredOceanValue;
    #else
    sceneGISDeferredOcean = vec4(0.0);
    #endif
#endif
#if defined(SCENEGIS_GBUFFER_MODEL_CAPTURE) || defined(SCENEGIS_DEFERRED_PHONG_CAPTURE) || defined(SCENEGIS_DEFERRED_GLOBE_CAPTURE)
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
#endif
}

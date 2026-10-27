#define SCENEGIS_DEFERRED_VECTOR_MATERIAL
#ifdef SCENEGIS_VECTOR_PBR
#define SCENEGIS_DIRECT_SHADOW_RECEIVER
#endif
#ifdef SCENEGIS_DEFERRED_VECTOR_CAPTURE
void sceneGISRecordVector(vec4 color, vec3 normalEC);
#ifdef SCENEGIS_VECTOR_PBR
void sceneGISRecordVectorPbr(vec4 color, vec3 normalEC, float roughness, float metallic, vec3 emissive);
#endif
#endif
uniform float u_sceneGISVectorOpacity;
uniform vec4 u_sceneGISVectorTileClip;
in vec4 v_color;
#ifdef SCENEGIS_VECTOR_PATTERN
in vec4 v_patternRect;
in vec2 v_patternSize;
in vec3 v_patternCoordinate;
#endif
in vec2 v_local;
in vec3 v_positionEC;
in vec3 v_normalEC;
in float v_gradient;
#ifdef SCENEGIS_VECTOR_PICKING
in vec4 v_pickColor;
#endif

void main()
{
    if (v_local.x < u_sceneGISVectorTileClip.x || v_local.x >= u_sceneGISVectorTileClip.z ||
        v_local.y > u_sceneGISVectorTileClip.w || v_local.y <= u_sceneGISVectorTileClip.y) discard;
#ifdef SCENEGIS_VECTOR_PBR
    if (v_materialCoordinate.z >= 0.0) {
        vec3 normalEC = normalize(v_normalEC), color, emissive;
        float roughness, metallic;
        vectorMaterial(v_positionEC, normalEC, color, roughness, metallic, emissive);
        color *= v_gradient;
        float alpha = v_color.a * u_sceneGISVectorOpacity;
        if (alpha == 0.0) discard;
#ifdef SCENEGIS_DEFERRED_VECTOR_CAPTURE
        sceneGISRecordVectorPbr(vec4(color, alpha), normalEC, roughness, metallic, emissive);
#else
        float visibility = 1.0;
#ifdef SCENEGIS_GEOMETRY_SHADOW
        visibility = sceneGISGeometryShadow();
#endif
        color = vectorPbrRadiance(color, metallic, roughness, emissive, v_positionEC, normalEC, visibility);
#endif
        out_FragColor = vec4(color, alpha);
        return;
    }
#endif
    vec4 material = v_color;
#ifdef SCENEGIS_VECTOR_PATTERN
    vec2 coordinate = v_patternCoordinate.z > 0.5 ?
        vec2(v_patternCoordinate.x, -v_patternCoordinate.y) / u_sceneGISPatternMetersPerPixel :
        vectorPatternPosition(v_patternCoordinate.xy, v_patternSize);
    material = vectorPatternSample(v_patternRect, v_patternSize, coordinate);
    material.a *= v_color.a;
#endif
    vec4 fill = czm_gammaCorrect(material);
    vec3 normalEC = normalize(v_normalEC);
#ifndef SCENEGIS_DEFERRED_VECTOR_CAPTURE
#ifdef SCENEGIS_VECTOR_ENVIRONMENT
    fill.rgb = vectorSurfaceRadiance(fill.rgb, v_positionEC, normalEC);
#else
    fill.rgb *= 0.35 + 0.65 * max(dot(normalEC, czm_lightDirectionEC), 0.0) * czm_lightColor;
#endif
#endif
    fill.rgb *= v_gradient;
    fill.a *= u_sceneGISVectorOpacity;
    if (fill.a == 0.0) discard;
#ifdef SCENEGIS_DEFERRED_VECTOR_CAPTURE
    sceneGISRecordVector(fill, normalEC);
#endif
    out_FragColor = fill;
}

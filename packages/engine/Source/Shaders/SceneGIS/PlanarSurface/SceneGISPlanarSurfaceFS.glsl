in vec2 v_textureCoordinates;
#define SCENEGIS_DEFERRED_PLANAR_MATERIAL
#ifdef SCENEGIS_DEFERRED_PLANAR_CAPTURE
void sceneGISRecordPlanar(vec4 color, vec3 normalEC, vec3 geometryNormalEC, vec3 parameters);
#endif
#define SCENEGIS_LOCAL_LIGHT_RECEIVER
#define SCENEGIS_SURFACE_WEATHER_TERRAIN
#if defined(SCENEGIS_GEOMETRY_SHADOW) && (defined(SCENEGIS_ADVANCED_LIGHTING) || defined(SCENEGIS_LIGHTING))
#define SCENEGIS_DIRECT_SHADOW_RECEIVER
#endif
uniform vec4 u_color;
#ifdef SCENEGIS_SURFACE_TRANSLUCENCY
uniform float u_surfaceOpacity;
#endif

#ifdef SHADOW_MAP
void sceneGISPlanarApplyShadow(float visibility)
{
    out_FragColor.rgb *= visibility;
}
#endif

#ifdef SCENEGIS_MATERIAL
in vec3 v_positionWC;
    #ifdef SCENEGIS_SMOOTH_NORMALS
in vec3 v_normalWC;
    #endif
#endif

#if defined(SCENEGIS_DEFERRED_PLANAR_CAPTURE) || defined(SCENEGIS_SURFACE_WEATHER) || defined(SCENEGIS_LOCAL_LIGHTS) || defined(SHADOW_MAP) || defined(SCENEGIS_ADVANCED_LIGHTING) || defined(SCENEGIS_MATERIAL) || (defined(SCENEGIS_LIGHTING) && !defined(SCENEGIS_SMOOTH_NORMALS))
in vec3 v_positionEC;
#endif

#if defined(SCENEGIS_SMOOTH_NORMALS) && (defined(SCENEGIS_MATERIAL) || defined(SCENEGIS_LIGHTING))
in vec3 v_normalEC;
#endif

#if defined(SCENEGIS_LIGHTING) && !defined(SCENEGIS_ADVANCED_LIGHTING)
uniform float u_lambertDiffuseMultiplier;
#endif

SCENEGIS_PLANAR_SURFACE_DYNAMIC_LAYERS
SCENEGIS_PLANAR_SURFACE_MATERIAL_SOURCE

#if defined(SCENEGIS_DEFERRED_PLANAR_CAPTURE) || defined(SHADOW_MAP) || defined(SCENEGIS_LIGHTING) || defined(SCENEGIS_MATERIAL)
vec3 sceneGISPlanarNormalEC()
{
    #ifdef SCENEGIS_SMOOTH_NORMALS
    return normalize(v_normalEC);
    #else
    vec3 normalEC = normalize(cross(dFdx(v_positionEC), dFdy(v_positionEC)));
    vec3 planarUpEC = normalize(czm_normal * vec3(0.0, 0.0, 1.0));
    if (dot(normalEC, planarUpEC) < 0.0) {
        normalEC = -normalEC;
    }
    return normalEC;
    #endif
}
#endif

#ifdef SCENEGIS_MATERIAL
vec3 sceneGISPlanarNormalWC(vec3 normalEC)
{
    #ifdef SCENEGIS_SMOOTH_NORMALS
    return normalize(v_normalWC);
    #else
    return normalize(czm_inverseViewRotation * normalEC);
    #endif
}

czm_materialInput sceneGISPlanarMaterialInput(vec3 normalEC)
{
    vec3 normalWC = sceneGISPlanarNormalWC(normalEC);
    vec2 horizontal = normalWC.xy;
    // One 8-bit octahedral quantization bin around +Z is style-flat.
    float octBin = 2.0 / 255.0;
    bool styleFlat = dot(horizontal, horizontal) <= octBin * octBin;
    float slope = styleFlat ? 0.0 : acos(clamp(normalWC.z, 0.0, 1.0));
    vec2 downslope = horizontal;
    float aspect = 0.0;
    if (!styleFlat) {
        aspect = atan(downslope.x, downslope.y);
        if (aspect < 0.0) {
            aspect += czm_twoPi;
        }
    }

    czm_materialInput materialInput;
    materialInput.s = v_textureCoordinates.s;
    materialInput.st = v_textureCoordinates;
    materialInput.str = vec3(v_textureCoordinates, 0.0);
    materialInput.normalEC = normalEC;
    materialInput.tangentToEyeMatrix = czm_viewRotation;
    materialInput.positionToEyeEC = -v_positionEC;
    materialInput.height = v_positionWC.z;
    materialInput.slope = slope;
    materialInput.aspect = aspect;
    materialInput.waterMask = 0.0;
    return materialInput;
}
#endif

void main()
{
#ifdef SCENEGIS_SURFACE_TRANSLUCENCY
    // Invisible terrain must not occlude pick/depth or cast an opaque shadow.
    if (u_surfaceOpacity == 0.0) {
        discard;
    }
#endif
#ifdef SCENEGIS_CLIPPING
    float clippingDistance = sceneGISClipTerrain();
#endif
    vec4 color = sceneGISComposeLayers(u_color, v_textureCoordinates);
#if defined(SCENEGIS_DEFERRED_PLANAR_CAPTURE) || defined(SCENEGIS_LIGHTING) || defined(SCENEGIS_MATERIAL)
    vec3 normalEC = sceneGISPlanarNormalEC();
#endif
#ifdef SCENEGIS_MATERIAL
    czm_material material = czm_getMaterial(
        sceneGISPlanarMaterialInput(normalEC)
    );
    color.rgb = mix(color.rgb, material.diffuse, material.alpha);
#endif
    #ifdef SCENEGIS_DEFERRED_PLANAR_CAPTURE
    vec3 parameters = vec3(0.0);
        #ifdef SCENEGIS_ADVANCED_LIGHTING
        parameters.x = 2.0;
        #elif defined(SCENEGIS_LIGHTING)
        parameters = vec3(1.0, u_lambertDiffuseMultiplier, 0.3);
        #endif
        #ifdef SCENEGIS_CLIPPING
        if (clippingDistance < u_clippingEdgeStyle.w) {
            color.rgb = u_clippingEdgeStyle.rgb;
            parameters.x = 4.0;
            #ifndef SCENEGIS_LIGHTING
            parameters.x = 5.0;
            #endif
        }
        #endif
    color.a = 1.0;
    sceneGISRecordPlanar(color, normalEC,
        normalize(cross(dFdx(v_positionEC), dFdy(v_positionEC))), parameters);
    out_FragColor = vec4(color.rgb, 1.0);
    return;
    #endif
    #ifdef SCENEGIS_SURFACE_WEATHER
    vec3 weatherNormalEC = sceneGISWeatherTerrainNormal(v_positionEC);
    vec2 weatherCoverage = sceneGISWeatherCoverage(v_positionEC, weatherNormalEC);
    color.rgb = sceneGISWeatherAlbedo(color.rgb, weatherCoverage);
    #endif
    vec3 localDiffuse = color.rgb;
#ifdef SCENEGIS_ADVANCED_LIGHTING
    color.rgb = sceneGISPlanarSurfaceRadiance(color.rgb, v_positionEC, normalEC);
#elif defined(SCENEGIS_LIGHTING)
    float diffuse = czm_getLambertDiffuse(czm_lightDirectionEC, normalEC);
    float intensity = clamp(
        diffuse * u_lambertDiffuseMultiplier + 0.3,
        0.0,
        1.0
    );
    #ifdef SCENEGIS_GEOMETRY_SHADOW
    intensity = mix(min(0.3, intensity), intensity, sceneGISGeometryShadow());
    #endif
    #ifdef SCENEGIS_AO_MAIN
    sceneGISRecordIndirect(color.rgb * czm_lightColor * 0.3);
    #endif
    color.rgb *= czm_lightColor * intensity;
#endif
#if defined(SCENEGIS_LOCAL_LIGHTS) && (defined(SCENEGIS_LIGHTING) || defined(SCENEGIS_ADVANCED_LIGHTING))
    color.rgb += sceneGISLocalLambert(v_positionEC, normalEC, localDiffuse);
#endif
    #if defined(SCENEGIS_SURFACE_WEATHER) && defined(SCENEGIS_LIGHTING) && !defined(SCENEGIS_ADVANCED_LIGHTING)
    vec3 weatherLight = czm_lightColorHdr;
    #ifdef SCENEGIS_GEOMETRY_SHADOW
    weatherLight *= sceneGISGeometryShadow();
    #endif
    color.rgb += weatherLight * max(dot(weatherNormalEC, czm_lightDirectionEC), 0.0) *
        sceneGISWeatherFilm(v_positionEC, weatherNormalEC, czm_lightDirectionEC, weatherCoverage.x);
    #endif
    out_FragColor = vec4(color.rgb, 1.0);
#ifdef SCENEGIS_CLIPPING
    if (clippingDistance < u_clippingEdgeStyle.w) {
        out_FragColor.rgb = u_clippingEdgeStyle.rgb;
        #ifdef SCENEGIS_AO_MAIN
        sceneGISScaleIndirect(vec3(0.0));
        #endif
    }
#endif
    #ifdef SCENEGIS_SURFACE_TRANSLUCENCY
        out_FragColor.a = u_surfaceOpacity;
    #endif
}

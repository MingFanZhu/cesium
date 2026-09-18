in vec2 v_textureCoordinates;
uniform vec4 u_color;
#ifdef SCENEGIS_SURFACE_TRANSLUCENCY
uniform float u_surfaceOpacity;
uniform sampler2D u_surfaceBackground;
#ifdef SHADOW_MAP
vec3 sceneGISPlanarUnshadowedBackground;
#endif
#endif

#ifdef SHADOW_MAP
void sceneGISPlanarApplyShadow(float visibility)
{
    out_FragColor.rgb *= visibility;
    #ifdef SCENEGIS_SURFACE_TRANSLUCENCY
    // The captured background is not a receiver of this surface's shadows.
    out_FragColor.rgb += sceneGISPlanarUnshadowedBackground * (1.0 - visibility);
    #endif
}
#endif

#ifdef SCENEGIS_MATERIAL
in vec3 v_positionWC;
    #ifdef SCENEGIS_SMOOTH_NORMALS
in vec3 v_normalWC;
    #endif
#endif

#if defined(SHADOW_MAP) || defined(SCENEGIS_ADVANCED_LIGHTING) || defined(SCENEGIS_MATERIAL) || (defined(SCENEGIS_LIGHTING) && !defined(SCENEGIS_SMOOTH_NORMALS))
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

#if defined(SHADOW_MAP) || defined(SCENEGIS_LIGHTING) || defined(SCENEGIS_MATERIAL)
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
#ifdef SCENEGIS_CLIPPING
    float clippingDistance = sceneGISClipTerrain();
#endif
    vec4 color = sceneGISComposeLayers(u_color, v_textureCoordinates);
#if defined(SCENEGIS_LIGHTING) || defined(SCENEGIS_MATERIAL)
    vec3 normalEC = sceneGISPlanarNormalEC();
#endif
#ifdef SCENEGIS_MATERIAL
    czm_material material = czm_getMaterial(
        sceneGISPlanarMaterialInput(normalEC)
    );
    color.rgb = mix(color.rgb, material.diffuse, material.alpha);
#endif
#ifdef SCENEGIS_ADVANCED_LIGHTING
    color.rgb = sceneGISPlanarSurfaceRadiance(color.rgb, v_positionEC, normalEC);
#elif defined(SCENEGIS_LIGHTING)
    float diffuse = czm_getLambertDiffuse(czm_lightDirectionEC, normalEC);
    float intensity = clamp(
        diffuse * u_lambertDiffuseMultiplier + 0.3,
        0.0,
        1.0
    );
    #ifdef SCENEGIS_AMBIENT_OCCLUSION
    intensity -= 0.3 * (1.0 - sceneGISAmbientOcclusion());
    #endif
    color.rgb *= czm_lightColor * intensity;
#endif
    out_FragColor = vec4(color.rgb, 1.0);
#ifdef SCENEGIS_CLIPPING
    if (clippingDistance < u_clippingEdgeStyle.w) {
        out_FragColor.rgb = u_clippingEdgeStyle.rgb;
    }
#endif
    #ifdef SCENEGIS_SURFACE_TRANSLUCENCY
        vec2 uv = gl_FragCoord.xy / vec2(textureSize(u_surfaceBackground, 0));
        vec4 background = texture(u_surfaceBackground, uv);
        // Depth remains opaque: reveal the scene background, not hidden slopes.
        out_FragColor = mix(background, out_FragColor, u_surfaceOpacity);
        #ifdef SHADOW_MAP
        sceneGISPlanarUnshadowedBackground = background.rgb * (1.0 - u_surfaceOpacity);
        #endif
    #endif
}

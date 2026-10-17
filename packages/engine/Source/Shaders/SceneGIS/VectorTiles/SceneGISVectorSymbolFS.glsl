uniform float u_sceneGISVectorOpacity;
uniform sampler2D u_symbolAtlas;
uniform vec2 u_symbolDepthRange;
uniform float u_symbolInverseExposure;
uniform bool u_symbolAutomaticExposure;
uniform sampler2D u_symbolExposureHistory;
#if defined(OPAQUE) || defined(SCENEGIS_VECTOR_ANNOTATION)
uniform sampler2D u_symbolMaterialDepth;
uniform sampler2D u_symbolMaterial;
uniform sampler2D u_symbolExternalDepth;
uniform bool u_symbolHasExternalDepth;
uniform vec2 u_sceneGISVectorMapRange;
uniform float u_sceneGISVectorStyleOrder;
#endif
in vec2 v_uv;
in vec4 v_color;
in vec4 v_haloColor;
in vec3 v_parameters;
in vec4 v_pickColor;
in float v_eyeDepth;
#ifdef SCENEGIS_VECTOR_TERRAIN_ANCHOR
in float v_groundVisibility;
#endif
void main()
{
    if (v_eyeDepth <= u_symbolDepthRange.x || v_eyeDepth > u_symbolDepthRange.y) discard;
#ifdef SCENEGIS_VECTOR_TERRAIN_ANCHOR
    if (v_groundVisibility < 0.5) discard;
#endif
#if defined(OPAQUE) || defined(SCENEGIS_VECTOR_ANNOTATION)
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float surfaceDepth = texelFetch(u_symbolMaterialDepth, pixel, 0).r;
    vec4 material = texelFetch(u_symbolMaterial, pixel, 0);
    float group = material.a;
    float tag = dot(material.rgb, vec3(1.0, 256.0, 65536.0));
    bool ownBuilding = group == -6.0 && tag > u_sceneGISVectorMapRange.x && tag <= u_sceneGISVectorMapRange.y;
    if (ownBuilding && tag > u_sceneGISVectorMapRange.x + u_sceneGISVectorStyleOrder) discard;
    // Terrain tests the anchor; this map's buildings use style order.
    if (!ownBuilding && surfaceDepth > 0.0 && group != -3.0 && group != -5.0 &&
        surfaceDepth < v_eyeDepth) discard;
    if (u_symbolHasExternalDepth) {
        float externalDepth = texelFetch(u_symbolExternalDepth, pixel, 0).r;
        if (externalDepth > 0.0 && externalDepth < v_eyeDepth) discard;
    }
#endif
    vec4 sampleColor = texture(u_symbolAtlas, v_uv);
    vec4 color = czm_gammaCorrect(v_color);
    color.rgb *= color.a;
    if (v_parameters.x > 0.0) {
        float distance = (sampleColor.r - 0.75) * 8.0 * v_parameters.x;
        float aa = max(0.5 / czm_pixelRatio, fwidth(distance) * 0.5);
        float fill = smoothstep(-aa, aa, distance);
        float halo = smoothstep(-v_parameters.y - aa - v_parameters.z, -v_parameters.y + aa, distance);
        vec4 haloColor = czm_gammaCorrect(v_haloColor);
        haloColor.rgb *= haloColor.a;
        out_FragColor = color * fill + haloColor * max(0.0, halo - fill);
    } else {
        sampleColor = czm_gammaCorrect(sampleColor);
        sampleColor.rgb *= sampleColor.a;
        out_FragColor = sampleColor * color;
    }
    out_FragColor *= u_sceneGISVectorOpacity;
    // Preserve alpha, coverage and depth. Tone mapping still owns display color.
    float inverseExposure = u_symbolInverseExposure;
    if (u_symbolAutomaticExposure) {
        // G is the last completed automatic log gain; R also includes old manual gain.
        inverseExposure *= exp2(-texelFetch(u_symbolExposureHistory, ivec2(0), 0).g);
    }
    out_FragColor.rgb *= inverseExposure;
    if (out_FragColor.a < 0.01) discard;
#ifdef OPAQUE
    if (out_FragColor.a < 0.995) discard;
#endif
    czm_writeLogDepth();
}

uniform sampler2D u_sceneGISDeferredSpecular;
uniform float u_sceneGISDeferredGroup;
uniform sampler2D u_sceneGISPointLitColor;
uniform bool u_sceneGISPointClassified;
uniform sampler2D u_sceneGISClassification;
#ifdef SCENEGIS_DEFERRED_DEBUG_TINT
uniform sampler2D u_sceneGISDebugTint;
#endif
#if defined(SCENEGIS_DEFERRED_FEATURE_STYLE) || defined(SCENEGIS_DEFERRED_OUTLINE_STYLE)
uniform sampler2D u_sceneGISDeferredStyle;
#endif
#ifdef HAS_MODEL_COLOR
uniform vec4 model_color;
uniform float model_colorBlend;
#endif
#ifdef HAS_PRIMITIVE_OUTLINE
uniform vec4 model_outlineColor;
#endif

vec3 sceneGISPointColorCorrection(vec3 correction, ivec2 pixel)
{
    if (texelFetch(u_sceneGISDeferredSpecular, pixel, 0).a != u_sceneGISDeferredGroup) {
        discard;
    }
    // Native post-lighting stages have the affine form A * gamma(color) + C.
    vec3 response = vec3(1.0);
    vec3 constantColor = vec3(0.0);
#ifdef SCENEGIS_DEFERRED_FEATURE_STYLE
    response *= texelFetch(u_sceneGISDeferredStyle, pixel, 0).rgb;
#endif
#ifdef HAS_MODEL_COLOR
    vec3 highlight = mix(model_color.rgb, vec3(1.0), ceil(model_colorBlend));
    response *= (1.0 - model_colorBlend) * highlight;
    constantColor = model_colorBlend * model_color.rgb * highlight;
#endif
#ifdef HAS_PRIMITIVE_OUTLINE
    #ifdef SCENEGIS_DEFERRED_OUTLINE_STYLE
    float outline = texelFetch(u_sceneGISDeferredStyle, pixel, 0).a;
    #else
    czm_modelMaterial material;
    sceneGISRestoreExtensions(material, pixel);
    float outline = sceneGISDeferredOutline;
    #endif
    float alpha = model_outlineColor.a * outline;
    response *= 1.0 - alpha;
    constantColor = mix(constantColor, model_outlineColor.rgb, alpha);
#endif
    #ifdef SCENEGIS_DEFERRED_POINT_EDL
    float pointShade = sceneGISPointShade();
    response *= pointShade;
    constantColor *= pointShade;
    #endif
    #ifdef SCENEGIS_DEFERRED_DEBUG_TINT
    vec3 debugTint = texelFetch(u_sceneGISDebugTint, pixel, 0).rgb;
    response *= debugTint;
    constantColor *= debugTint;
    #endif
    if (u_sceneGISPointClassified) {
        vec4 overlay = texelFetch(u_sceneGISClassification, pixel, 0);
        vec3 factor = overlay.a < 0.0 ? overlay.rgb : vec3(1.0 - overlay.a);
        response *= factor;
        constantColor *= factor;
        if (overlay.a >= 0.0) {
            constantColor += overlay.rgb;
        }
    }
    // MRT already retains the original lit color. Undo only the point color
    // transform, apply the linear screen delta, and return the remaining delta.
    // Zero response channels are fixed colors and carry no screen correction.
    vec3 safeResponse = mix(response, vec3(1.0), equal(response, vec3(0.0)));
    vec3 original = texelFetch(u_sceneGISPointLitColor, pixel, 0).rgb;
    vec3 linearColor = pow(max((original - constantColor) / safeResponse, vec3(0.0)), vec3(1.0 / czm_gamma));
    vec3 corrected = response * czm_gammaCorrect(max(linearColor + correction / safeResponse, vec3(0.0))) + constantColor;
    return corrected - original - correction;
}

// Gaussian Stream fragment shader; matches the ext-quality EWA baseline.
#define MIN_ALPHA u_renderTuning0.w

void main() {
    float radiusSquared = dot(v_vertPos, v_vertPos);
    if (radiusSquared > v_adjustedStdDev * v_adjustedStdDev) {
        discard;
    }
    vec4 activeCropBounds = v_globalCropBounds;

    if (
        v_tileCropPosition.x < activeCropBounds.x ||
        v_tileCropPosition.y < activeCropBounds.y ||
        v_tileCropPosition.x > activeCropBounds.z ||
        v_tileCropPosition.y > activeCropBounds.w
    ) {
        discard;
    }
    vec4 rgba = v_splatColor;
    if (rgba.a <= 1.0) {
        rgba.a = mix(rgba.a, rgba.a * exp(-0.5 * radiusSquared), u_falloff);
    } else {
        float exponent = exp((rgba.a * rgba.a - 1.0) / 2.718281828459045);
        float alpha = 1.0 - pow(1.0 - exp(-0.5 * radiusSquared), exponent);
        rgba.a = mix(1.0, alpha, u_falloff);
    }
    if (rgba.a < MIN_ALPHA) {
        discard;
    }
#ifdef SCENEGIS_GAUSSIAN_VIDEO
    vec3 receiverPosition = sceneGIS_gaussianVideoPosition();
#ifdef SCENEGIS_GAUSSIAN_VIDEO_DEPTH
    float receiverDepth = -receiverPosition.z;
    if (rgba.a < u_gvAlphaThreshold || receiverDepth < u_gvDepthRange.x || receiverDepth > u_gvDepthRange.y) discard;
    gl_FragDepth = log2(receiverDepth - u_gvDepthRange.x + 1.0) /
        log2(u_gvDepthRange.y - u_gvDepthRange.x + 1.0);
#else
    rgba.rgb = sceneGIS_gaussianVideoColor(rgba.rgb, receiverPosition);
#endif
#endif
    out_FragColor = vec4(rgba.rgb * rgba.a, rgba.a);
}

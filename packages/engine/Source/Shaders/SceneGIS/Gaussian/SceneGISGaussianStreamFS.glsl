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
    out_FragColor = vec4(rgba.rgb * rgba.a, rgba.a);
}

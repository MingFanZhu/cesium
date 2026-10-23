uniform sampler2D u_fluidDepth;
uniform vec2 u_filterDirection;
uniform float u_renderRadius;
void main() {
    ivec2 size = textureSize(u_fluidDepth, 0);
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float center = texelFetch(u_fluidDepth, pixel, 0).r;
    if (center <= 0.0) { out_FragColor = vec4(0.0); return; }
    float sigma = u_renderRadius * 0.5;
    float pixelRadius = abs(czm_projection[1][1]) * float(size.y) * u_renderRadius * 0.5;
    if (czm_projection[3][3] == 0.0) { pixelRadius /= center; }
    float screenSigma = clamp(pixelRadius * 0.6, 1.0, 7.0);
    float sum = 0.0;
    float weight = 0.0;
    for (int i = -16; i <= 16; ++i) {
        ivec2 offset = ivec2(u_filterDirection) * i;
        ivec2 samplePixel = clamp(pixel + offset, ivec2(0), size - 1);
        float depth = texelFetch(u_fluidDepth, samplePixel, 0).r;
        if (depth <= 0.0) { continue; }
        // Keep separate front layers from melting together at inner silhouettes.
        if (abs(depth - center) > u_renderRadius) { continue; }
        float difference = (depth - center) / sigma;
        float w = exp(-float(i * i) / (2.0 * screenSigma * screenSigma) - difference * difference * 0.5);
        sum += w * depth;
        weight += w;
    }
    out_FragColor = vec4(sum / weight, 0.0, 0.0, 1.0);
}

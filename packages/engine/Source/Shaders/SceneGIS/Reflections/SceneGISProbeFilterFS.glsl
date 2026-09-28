// Reuses Cesium's native GGX/Hammersley functions, with a separate coverage channel.
uniform bool u_visibility;
void main()
{
    vec3 N = normalize(v_textureCoordinates);
    vec4 sum = vec4(0.0);
    float weight = 0.0;
    for (int i = 0; i < samples; ++i) {
        vec2 xi = hammersley2D(i, samples);
        if (u_visibility) {
            // GGX alpha=1 samples a cosine hemisphere; alpha is unoccluded sky coverage.
            vec3 L = importanceSampleGGX(xi, 1.0, N);
            sum += vec4(textureLod(u_radianceTexture, L, 0.0).a);
            weight += 1.0;
        } else {
            vec3 H = importanceSampleGGX(xi, u_roughness, N);
            vec3 L = reflect(-N, H);
            float NoL = max(dot(N, L), 0.0);
            sum += textureLod(u_radianceTexture, L, 0.0) * NoL;
            weight += NoL;
        }
    }
    out_FragColor = sum / weight;
}

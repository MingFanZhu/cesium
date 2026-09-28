uniform sampler2D u_source;
void main()
{
    ivec2 size = textureSize(u_source, 0);
    ivec2 pixel = ivec2(gl_FragCoord.xy) * 2;
    float nearest = 1.0e30;
    for (int y = 0; y < 2; ++y) {
        for (int x = 0; x < 2; ++x) {
            float z = texelFetch(u_source, min(pixel + ivec2(x, y), size - 1), 0).r;
            if (z > 0.0) { nearest = min(nearest, z); }
        }
    }
    out_FragColor = vec4(nearest, 0.0, 0.0, 1.0);
}

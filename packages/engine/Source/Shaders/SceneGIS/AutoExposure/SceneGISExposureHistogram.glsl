uniform sampler2D u_luminance;
uniform vec2 u_gridSize;

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    vec2 histogram = vec2(0.0);
    for (int x = 0; x < 128; ++x)
    {
        if (x >= int(u_gridSize.x)) { break; }
        vec2 sampleValue = texelFetch(u_luminance, ivec2(x, pixel.y), 0).rg;
        int bin = min(63, int((sampleValue.x + 16.0) * 2.0));
        if (bin == pixel.x)
        {
            histogram += vec2(sampleValue.y, sampleValue.x * sampleValue.y);
        }
    }
    out_FragColor = vec4(histogram, 0.0, 1.0);
}

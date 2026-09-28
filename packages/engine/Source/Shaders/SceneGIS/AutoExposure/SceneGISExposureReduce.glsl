uniform sampler2D u_rows;
uniform vec2 u_gridSize;

void main()
{
    int bin = int(gl_FragCoord.x);
    vec2 histogram = vec2(0.0);
    for (int y = 0; y < 128; ++y)
    {
        if (y >= int(u_gridSize.y)) { break; }
        histogram += texelFetch(u_rows, ivec2(bin, y), 0).rg;
    }
    out_FragColor = vec4(histogram, 0.0, 1.0);
}

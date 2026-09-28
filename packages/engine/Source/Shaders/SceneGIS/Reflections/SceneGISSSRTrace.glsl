layout(location = 1) out vec4 sceneGISSSRCoat;
layout(location = 2) out vec4 sceneGISSSRMetadata;

void main()
{
    ivec2 block = ivec2(gl_FragCoord.xy) * u_stride;
    ivec2 size = textureSize(u_depth, 0);
    ivec2 pixel = min(block, size - 1);
    float nearest = 1.0e30;
    float offset = 0.0;
    for (int y = 0; y < 2; ++y) {
        for (int x = 0; x < 2; ++x) {
            if (x >= u_stride || y >= u_stride) { continue; }
            ivec2 tap = min(block + ivec2(x, y), size - 1);
            float z = texelFetch(u_depth, tap, 0).r;
            if (z > 0.0 && z < nearest) { nearest = z; pixel = tap; offset = float(x + 2 * y); }
        }
    }
    out_FragColor = vec4(0.0);
    sceneGISSSRCoat = vec4(0.0);
    sceneGISSSRMetadata = vec4(0.0, 0.0, offset, 0.0);
    if (nearest == 1.0e30) { return; }
    vec3 position = sceneGISSSRPosition(vec2(pixel) + 0.5, nearest);
    out_FragColor = sceneGISSSRTrace(position, texelFetch(u_baseRay, pixel, 0), sceneGISSSRMetadata.x);
    sceneGISSSRCoat = sceneGISSSRTrace(position, texelFetch(u_coatRay, pixel, 0), sceneGISSSRMetadata.y);
}

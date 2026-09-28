uniform sampler2D u_estimate;
uniform float u_intensity;

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float depth = texelFetch(u_depth, pixel, 0).r;
    vec4 source = texelFetch(u_source, pixel, 0);
    vec4 response = texelFetch(u_response, pixel, 0);
    if (depth <= 0.0 || source.a < 0.5) { out_FragColor = vec4(0.0); return; }
    vec3 p = sceneGISSILPosition(vec2(pixel) + 0.5, depth);
    vec3 n = sceneGISSILDecodeNormal(vec2(source.a, response.a));
    ivec2 lowSize = textureSize(u_estimate, 0);
    vec2 center = (vec2(pixel) + 0.5) / u_stride - 0.5;
    ivec2 nearest = ivec2(round(center));
    float pixelScale = length(sceneGISSILPosition(vec2(pixel) + vec2(1.5, 0.5), depth) - p);
    vec3 color = vec3(0.0);
    float total = 0.0;
    for (int y = -2; y <= 2; ++y) {
        for (int x = -2; x <= 2; ++x) {
            ivec2 lowPixel = clamp(nearest + ivec2(x, y), ivec2(0), lowSize - 1);
            ivec2 fullPixel = sceneGISSILPixel(lowPixel);
            vec4 s = texelFetch(u_source, fullPixel, 0);
            float d = texelFetch(u_depth, fullPixel, 0).r;
            if (s.a < 0.5 || d <= 0.0) { continue; }
            vec3 sn = sceneGISSILDecodeNormal(vec2(s.a, texelFetch(u_response, fullPixel, 0).a));
            vec3 q = sceneGISSILPosition(vec2(fullPixel) + 0.5, d);
            // Plane distance preserves sloping surfaces; normals reject corner bleeding.
            float separation = max(abs(dot(q - p, n)), abs(dot(q - p, sn)));
            vec2 offset = vec2(lowPixel) - center;
            float weight = exp(-0.5 * dot(offset, offset)) * pow(max(dot(n, sn), 0.0), 16.0);
            weight *= exp(-separation / max(pixelScale * 1.5, 0.001));
            color += texelFetch(u_estimate, lowPixel, 0).rgb * weight;
            total += weight;
        }
    }
    out_FragColor = vec4(response.rgb * color / max(total, 1.0e-6) * u_intensity, 0.0);
}

uniform sampler2D u_estimate;
uniform float u_radius;
uniform float u_intensity;
void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float depth = sceneGISAODepth(pixel);
    if (depth <= 0.0) { out_FragColor = vec4(1.0); return; }
    vec3 p = sceneGISAOPosition(gl_FragCoord.xy, depth);
    vec4 center = texelFetch(u_estimate, pixel, 0);
    vec3 n = normalize(center.gba * 2.0 - 1.0);
    float visibility = 0.0;
    float weightSum = 0.0;
    for (int y = -2; y <= 2; ++y) {
        for (int x = -2; x <= 2; ++x) {
            ivec2 q = pixel + ivec2(x, y);
            if (any(lessThan(vec2(q), czm_viewport.xy)) ||
                any(greaterThanEqual(vec2(q), czm_viewport.xy + czm_viewport.zw))) { continue; }
            float z = sceneGISAODepth(q);
            if (z <= 0.0) { continue; }
            vec4 sampleAO = texelFetch(u_estimate, q, 0);
            vec3 sampleNormal = normalize(sampleAO.gba * 2.0 - 1.0);
            vec3 delta = sceneGISAOPosition(vec2(q) + 0.5, z) - p;
            float planeError = max(abs(dot(delta, n)), abs(dot(delta, sampleNormal)));
            float weight = exp(-0.25 * float(x*x + y*y)) * pow(max(dot(n, sampleNormal), 0.0), 16.0);
            weight *= 1.0 - smoothstep(u_radius * 0.01, u_radius * 0.05, planeError);
            visibility += sampleAO.r * weight;
            weightSum += weight;
        }
    }
    float filtered = clamp(visibility / weightSum, 0.0, 1.0);
    out_FragColor = vec4(u_intensity == 0.0 ? 1.0 : pow(filtered, u_intensity));
}

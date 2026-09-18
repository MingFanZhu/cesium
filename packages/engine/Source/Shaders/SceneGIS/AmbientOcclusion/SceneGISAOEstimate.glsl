uniform float u_radius;
uniform float u_bias;
uniform int u_directions;
uniform int u_steps;

// Analytic cosine-weighted hemisphere slice integral (GTAO).
float sceneGISAOIntegral(float h, float n)
{
    return 0.25 * (cos(n) + 2.0 * h * sin(n) - cos(2.0 * h - n));
}

void main()
{
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float depth = sceneGISAODepth(pixel);
    if (depth <= 0.0) { out_FragColor = vec4(1.0); return; }
    vec3 p = sceneGISAOPosition(gl_FragCoord.xy, depth);
    vec3 v = czm_inverseProjection == mat4(0.0) ? vec3(0.0, 0.0, 1.0) : normalize(-p);
    vec3 n = sceneGISAONormal(pixel, depth, p);
    if (dot(n, v) < 0.0) { n = -n; }
    float pixelScale = length(sceneGISAOPosition(gl_FragCoord.xy + vec2(1, 0), depth) - p);
    float radiusPixels = u_radius / pixelScale;
    // Stable interleaved-gradient noise. No frame-dependent phase or history.
    float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float visibility = 0.0;
    float unoccluded = 0.0;
    int slices = (u_directions + 1) / 2;
    for (int slice = 0; slice < slices; ++slice) {
        float angle = (float(slice) + noise) * czm_pi / float(slices);
        vec2 direction = vec2(cos(angle), sin(angle));
        vec3 tangent = sceneGISAOPosition(gl_FragCoord.xy + direction, depth) - p;
        tangent = normalize(tangent - v * dot(tangent, v));
        vec3 axis = normalize(cross(tangent, v));
        vec3 projectedNormal = n - axis * dot(n, axis);
        float normalLength = length(projectedNormal);
        float normalAngle = atan(dot(projectedNormal, tangent), dot(projectedNormal, v));
        vec2 bounds = clamp(normalAngle + vec2(-czm_piOverTwo, czm_piOverTwo), -czm_pi, czm_pi);
        vec2 horizon = cos(bounds);
        unoccluded += normalLength * (sceneGISAOIntegral(bounds.x, normalAngle) + sceneGISAOIntegral(bounds.y, normalAngle));
        for (int side = 0; side < 2; ++side) {
            float signSide = side == 0 ? -1.0 : 1.0;
            float h = horizon[side];
            for (int stepIndex = 0; stepIndex < u_steps; ++stepIndex) {
                float t = (float(stepIndex) + 0.5 + noise * 0.5) / float(u_steps);
                vec2 offset = round(direction * signSide * max(1.0, radiusPixels * t * t));
                ivec2 samplePixel = pixel + ivec2(offset);
                if (any(lessThan(vec2(samplePixel), czm_viewport.xy)) ||
                    any(greaterThanEqual(vec2(samplePixel), czm_viewport.xy + czm_viewport.zw))) { continue; }
                float sampleDepth = sceneGISAODepth(samplePixel);
                if (sampleDepth <= 0.0) { continue; }
                vec3 delta = sceneGISAOPosition(vec2(samplePixel) + 0.5, sampleDepth) - p;
                float distanceToSample = length(delta);
                if (distanceToSample < 1.0e-7 || distanceToSample >= u_radius) { continue; }
                float weight = 1.0 - smoothstep(u_radius * 0.5, u_radius, distanceToSample);
                float sampleHorizon = dot(delta / distanceToSample, v) - u_bias;
                h = max(h, mix(horizon[side], sampleHorizon, weight));
            }
            horizon[side] = h;
        }
        vec2 angles = vec2(-1.0, 1.0) * acos(clamp(horizon, -1.0, 1.0));
        angles = clamp(angles, bounds.x, bounds.y);
        visibility += normalLength * (sceneGISAOIntegral(angles.x, normalAngle) + sceneGISAOIntegral(angles.y, normalAngle));
    }
    // Normalize the finite angular quadrature by the open hemisphere so exposed
    // slopes remain white for every spatial sampling phase.
    out_FragColor = vec4(clamp(visibility / unoccluded, 0.0, 1.0), n * 0.5 + 0.5);
}

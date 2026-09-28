uniform float u_thickness;
uniform int u_directions;
uniform int u_steps;

// Original adaptation of visibility-sector integration (Therrien et al., 2023).
// GLSL ES 3.00 has uint bitwise operations, but no built-in bitCount.
float sceneGISSILCount(uint bits)
{
    bits -= (bits >> 1u) & 0x55555555u;
    bits = (bits & 0x33333333u) + ((bits >> 2u) & 0x33333333u);
    bits = (bits + (bits >> 4u)) & 0x0f0f0f0fu;
    return float((bits * 0x01010101u) >> 24u);
}

uint sceneGISSILMask(float a, float b)
{
    vec2 bounds = clamp(vec2(min(a, b), max(a, b)) / czm_pi + 0.5, 0.0, 1.0);
    // Sector centers must lie inside the finite surface interval.
    uint first = uint(clamp(ceil(bounds.x * 32.0 - 0.5), 0.0, 32.0));
    uint end = uint(clamp(ceil(bounds.y * 32.0 - 0.5), 0.0, 32.0));
    if (end <= first) { return 0u; }
    uint belowFirst = (1u << first) - 1u;
    uint belowEnd = end == 32u ? 0xffffffffu : (1u << end) - 1u;
    return belowEnd & ~belowFirst;
}

void main()
{
    ivec2 pixel = sceneGISSILPixel(ivec2(gl_FragCoord.xy));
    float depth = texelFetch(u_depth, pixel, 0).r;
    vec4 source = texelFetch(u_source, pixel, 0);
    vec4 response = texelFetch(u_response, pixel, 0);
    if (depth <= 0.0 || source.a < 0.5) { out_FragColor = vec4(0.0); return; }
    vec2 xy = vec2(pixel) + 0.5;
    vec3 p = sceneGISSILPosition(xy, depth);
    vec3 n = sceneGISSILDecodeNormal(vec2(source.a, response.a));
    vec3 v = czm_inverseProjection == mat4(0.0) ? vec3(0.0, 0.0, 1.0) : normalize(-p);
    float pixelScale = length(sceneGISSILPosition(xy + vec2(1.0, 0.0), depth) - p);
    float radiusPixels = u_radius / pixelScale;
    float noise = fract(52.9829189 * fract(dot(vec2(pixel), vec2(0.06711056, 0.00583715))));
    vec3 indirect = vec3(0.0);
    for (int slice = 0; slice < u_directions; ++slice) {
        float angle = (float(slice) + noise) * czm_pi / float(u_directions);
        vec2 direction = vec2(cos(angle), sin(angle));
        vec3 tangent = sceneGISSILPosition(xy + direction, depth) - p;
        tangent = normalize(tangent - v * dot(tangent, v));
        float normalAngle = atan(dot(n, tangent), dot(n, v));
        uint covered = 0u;
        for (int stepIndex = 0; stepIndex < u_steps; ++stepIndex) {
            float t = (float(stepIndex) + 0.5 + noise * 0.5) / float(u_steps);
            for (int side = 0; side < 2; ++side) {
                float signSide = side == 0 ? -1.0 : 1.0;
                ivec2 samplePixel = pixel + ivec2(round(direction * signSide * max(1.0, radiusPixels * t * t)));
                if (any(lessThan(samplePixel, ivec2(0))) || any(greaterThanEqual(samplePixel, ivec2(u_fullSize)))) { continue; }
                float sampleDepth = texelFetch(u_depth, samplePixel, 0).r;
                if (sampleDepth <= 0.0) { continue; }
                vec3 q = sceneGISSILPosition(vec2(samplePixel) + 0.5, sampleDepth);
                vec3 delta = q - p;
                float distanceToSample = length(delta);
                if (distanceToSample < 1.0e-5 || distanceToSample >= u_radius) { continue; }
                vec3 back = delta - v * u_thickness;
                float frontAngle = atan(dot(delta, tangent), dot(delta, v)) - normalAngle;
                float backAngle = atan(dot(back, tangent), dot(back, v)) - normalAngle;
                // Unwrap around the front endpoint before clipping the receiving hemisphere.
                backAngle = frontAngle + mod(backAngle - frontAngle + czm_pi, czm_twoPi) - czm_pi;
                uint mask = sceneGISSILMask(frontAngle, backAngle);
                float sectors = sceneGISSILCount(mask & ~covered) / 32.0;
                covered |= mask;
                if (sectors <= 0.0) { continue; }
                vec4 incident = texelFetch(u_source, samplePixel, 0);
                if (incident.a < 0.5) { continue; }
                vec3 sn = sceneGISSILDecodeNormal(vec2(incident.a, texelFetch(u_response, samplePixel, 0).a));
                vec3 l = delta / distanceToSample;
                float weight = sectors * max(dot(n, l), 0.0) * max(dot(sn, -l), 0.0);
                weight *= 1.0 - smoothstep(u_radius * 0.75, u_radius, distanceToSample);
                indirect += incident.rgb * weight;
            }
        }
    }
    out_FragColor = vec4(indirect / float(u_directions), 1.0);
}

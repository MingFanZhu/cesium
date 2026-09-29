uniform sampler2D colorTexture;
uniform float u_snowIntensity;
uniform float u_flakeSize;
uniform float u_meltDuration;
uniform float u_snowTime;
in vec2 v_textureCoordinates;

float snowLensHash(vec2 p) {
    vec3 q = fract(vec3(mod(p, 256.0), 11.0) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.x + q.y) * q.z);
}

float snowLensNoise(vec2 p) {
    vec2 id = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(snowLensHash(id), snowLensHash(id + vec2(1.0, 0.0)), f.x),
        mix(snowLensHash(id + vec2(0.0, 1.0)), snowLensHash(id + 1.0), f.x), f.y);
}

// XY is pixel refraction, Z wet coverage, W matte snow coverage.
vec4 snowLensLayer(vec2 pixel, float scale, vec2 offset) {
    float cellSize = u_flakeSize * scale;
    vec2 q = pixel / cellSize + offset;
    vec2 id = floor(q);
    float seed = snowLensHash(id);
    float density = smoothstep(0.0, 0.18, u_snowIntensity - snowLensHash(id + 93.0));
    if (density <= 0.0) { return vec4(0.0); }
    float age = fract(u_snowTime / u_meltDuration + seed);
    float life = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.8, 1.0, age));
    float melt = smoothstep(0.25, 0.85, age);
    vec2 center = 0.3 + 0.4 * vec2(snowLensHash(id + 17.0), snowLensHash(id + 53.0));
    float radius = u_flakeSize * mix(0.22, 0.6, seed) * min(scale / 4.0, 1.0);
    vec2 delta = (fract(q) - center) * cellSize;
    // Attached flecks move only slightly as they soften into a wet trace.
    delta.y += melt * radius * 0.35;
    vec2 local = delta / radius;
    if (max(abs(local.x), abs(local.y)) > 1.4) { return vec4(0.0); }
    float clumps = snowLensNoise(local * 2.5 + seed * 31.0);
    float distanceToEdge = length(local * vec2(1.0, 0.85)) - (0.68 + 0.3 * clumps);
    float aa = 0.9 / radius;
    float coverage = (1.0 - smoothstep(-aa, aa, distanceToEdge)) * life * density;
    // Grain is attached to the fleck and no finer than two pixels.
    float grain = snowLensNoise(delta / 2.5 + seed * 19.0);
    float snow = coverage * (1.0 - melt) * mix(0.35, 0.85, grain);
    float wet = coverage * melt * 0.65;
    vec2 bend = -local * min(radius * 0.18, 3.0) * wet;
    return vec4(bend, wet, snow);
}

void main() {
    vec2 uv = v_textureCoordinates;
    vec4 source = texture(colorTexture, uv);
    if (u_snowIntensity == 0.0) { out_FragColor = source; return; }
    vec2 dimensions = vec2(textureSize(colorTexture, 0));
    vec2 pixel = uv * dimensions;
    vec4 snow = snowLensLayer(pixel, 6.0, vec2(0.0)) +
        snowLensLayer(pixel, 3.0, vec2(37.0, 79.0));
    float wet = clamp(snow.z, 0.0, 1.0);
    float matte = clamp(snow.w, 0.0, 0.85);
    if (wet + matte <= 0.0) { out_FragColor = source; return; }
    vec2 edge = 0.5 / dimensions;
    vec2 sampleUV = clamp(uv + snow.xy / dimensions, edge, 1.0 - edge);
    vec2 blur = vec2(1.25 * matte) / dimensions;
    vec3 color = texture(colorTexture, sampleUV).rgb * 0.5;
    color += texture(colorTexture, clamp(sampleUV + blur, edge, 1.0 - edge)).rgb * 0.25;
    color += texture(colorTexture, clamp(sampleUV - blur, edge, 1.0 - edge)).rgb * 0.25;
    // Matte ice borrows current scene brightness; it is never an emissive spark.
    float light = sqrt(max(czm_luminance(color), 0.0));
    vec3 ice = vec3(0.9, 0.94, 0.98) * light;
    color = mix(color, ice, matte);
    color *= 1.0 - wet * 0.035;
    out_FragColor = vec4(color, source.a);
}

uniform sampler2D colorTexture;
uniform sampler2D u_rainSprite;
uniform float u_rainIntensity;
uniform float u_dropletSize;
uniform float u_distortion;
uniform float u_rainTime;
in vec2 v_textureCoordinates;

struct RainLensDrop {
    vec4 shape;
    vec3 optics;
};

RainLensDrop rainLensMerge(RainLensDrop a, RainLensDrop b) {
    return RainLensDrop(a.shape + b.shape, a.optics + b.optics);
}

float rainLensHash(vec2 p) {
    vec3 q = fract(vec3(mod(p, 256.0), 17.0) * vec3(0.1031, 0.1030, 0.0973));
    q += dot(q, q.yxz + 33.33);
    return fract((q.x + q.y) * q.z);
}

// The packaged MIT sprite stores refraction direction in RG and height in A.
// See Assets/SceneGIS/Weather/RainLens/manifest.json for source and license.
// XY: weighted pixel displacement, Z: coverage, W: signed optical relief.
RainLensDrop rainLensSprite(vec2 delta, vec2 radius, float angle, float opacity) {
    float c = cos(angle), s = sin(angle);
    mat2 rotation = mat2(c, -s, s, c);
    vec2 local = rotation * delta / radius;
    if (opacity <= 0.0 || max(abs(local.x), abs(local.y)) >= 1.0) {
        return RainLensDrop(vec4(0.0), vec3(0.0));
    }
    // Explicit LOD and pixel-width coverage remain defined in divergent cells.
    vec4 sprite = textureLod(u_rainSprite, local * 0.5 + 0.5, 0.0);
    float height = sprite.a;
    float aa = clamp(0.8 / min(radius.x, radius.y), 0.015, 0.18);
    float mask = smoothstep(0.22 - aa, 0.22 + aa, height) * opacity;
    if (mask <= 0.0) { return RainLensDrop(vec4(0.0), vec3(0.0)); }
    // Flatten the lens as a drop evaporates, rather than fading a black outline.
    vec2 bend = -(sprite.rg * 2.0 - 1.0) * u_distortion * (0.3 + 0.7 * height);
    bend -= local * radius * 0.4 * height * (u_distortion / 12.0);
    bend = transpose(rotation) * bend * opacity;
    // RG is a refractive warp, not a surface normal. Use a smooth cap normal
    // for reflection, retaining the authored silhouette and refraction.
    vec2 slope = transpose(rotation) * local * 1.4;
    vec3 normal = normalize(vec3(slope, sqrt(max(0.04, 1.0 - dot(slope, slope)))));
    // Only subtle lower-edge attenuation is authored. Brightness comes from
    // the visible scene reflection, without a fixed light or white glint.
    float rim = 1.0 - smoothstep(0.22, 0.62, height);
    float relief = -0.14 * rim * (0.5 - 0.5 * normal.y);
    float fresnel = 0.04 + 0.65 * pow(1.0 - normal.z, 5.0);
    return RainLensDrop(vec4(bend * mask, mask, relief * mask),
        vec3(normal.xy, fresnel) * mask);
}

RainLensDrop rainLensStatic(vec2 pixel, float scale, vec2 offset) {
    float cellSize = u_dropletSize * scale;
    vec2 q = pixel / cellSize + offset;
    vec2 id = floor(q);
    float seed = rainLensHash(id);
    vec2 center = vec2(rainLensHash(id + 71.0), rainLensHash(id + 39.0));
    center = 0.22 + 0.56 * center;
    vec2 delta = (fract(q) - center) * cellSize;
    float size = cellSize * mix(0.055, 0.21, seed * seed);
    float age = fract(u_rainTime * 0.125 + seed);
    float life = smoothstep(0.0, 0.05, age) * (1.0 - smoothstep(0.65, 1.0, age));
    float density = smoothstep(0.0, 0.15, u_rainIntensity - rainLensHash(id + 137.0));
    vec2 radius = size * vec2(mix(0.7, 1.15, seed), mix(0.9, 1.3, rainLensHash(id + 19.0)));
    return rainLensSprite(delta, radius, (seed - 0.5) * 1.2, life * density);
}

RainLensDrop rainLensFalling(vec2 pixel) {
    vec2 grid = u_dropletSize * vec2(5.0, 12.0);
    vec2 q = pixel / grid;
    float column = floor(q.x);
    float phase = rainLensHash(vec2(column, 13.0));
    float t = u_rainTime * 0.125 + phase;
    // Each column pauses and accelerates smoothly; one cell per cycle preserves looping.
    float cycle = floor(t);
    float progress = fract(t);
    q.y += cycle + smoothstep(0.08, 0.88, progress);
    vec2 id = floor(q);
    float seed = rainLensHash(id);
    float centerX = 0.3 + 0.4 * rainLensHash(id + 71.0);
    vec2 delta = (fract(q) - vec2(centerX, 0.3)) * grid;
    float radius = u_dropletSize * mix(0.55, 0.95, seed);
    float density = smoothstep(0.0, 0.2, u_rainIntensity - rainLensHash(id + 137.0));
    float motion = smoothstep(0.08, 0.4, progress) * (1.0 - smoothstep(0.7, 0.88, progress));
    RainLensDrop drop = rainLensSprite(delta, radius * vec2(0.72, 1.15 + 0.35 * motion),
        0.12 * sin(seed * 20.0), density);
    // Small separated beads remain behind a moving drop instead of a solid painted streak.
    for (int i = 1; i <= 3; ++i) {
        float j = float(i);
        vec2 trail = vec2(sin(seed * 17.0 + j) * radius * 0.13, radius * (1.0 + j * 0.6));
        drop = rainLensMerge(drop, rainLensSprite(delta - trail,
            radius * vec2(0.12, 0.22) / sqrt(j), 0.0,
            density * motion * (1.0 - j * 0.2)));
    }
    return drop;
}

void main() {
    vec2 uv = v_textureCoordinates;
    vec4 source = texture(colorTexture, uv);
    if (u_rainIntensity == 0.0) { out_FragColor = source; return; }
    vec2 dimensions = vec2(textureSize(colorTexture, 0));
    vec2 pixel = uv * dimensions;
    RainLensDrop drop = rainLensMerge(rainLensMerge(
        rainLensStatic(pixel, 3.0, vec2(0.0)),
        rainLensStatic(pixel, 1.15, vec2(37.0, 91.0))), rainLensFalling(pixel));
    vec4 drops = drop.shape;
    float mask = clamp(drops.z, 0.0, 1.0);
    if (mask <= 0.0) { out_FragColor = source; return; }
    vec2 edge = 0.5 / dimensions;
    vec2 sampleUV = clamp(uv + drops.xy / max(drops.z, 1.0) / dimensions, edge, 1.0 - edge);
    vec2 blur = vec2(0.65 * mask) / dimensions;
    vec3 refracted = texture(colorTexture, sampleUV).rgb * 0.6;
    refracted += texture(colorTexture, clamp(sampleUV + vec2(blur.x, 0.0), edge, 1.0 - edge)).rgb * 0.1;
    refracted += texture(colorTexture, clamp(sampleUV - vec2(blur.x, 0.0), edge, 1.0 - edge)).rgb * 0.1;
    refracted += texture(colorTexture, clamp(sampleUV + vec2(0.0, blur.y), edge, 1.0 - edge)).rgb * 0.1;
    refracted += texture(colorTexture, clamp(sampleUV - vec2(0.0, blur.y), edge, 1.0 - edge)).rgb * 0.1;
    // Reuse visible scene color as an artistic wide-field reflection proxy.
    // This supplies contrast inside the bead without an environment capture.
    vec2 reflectionUV = clamp(0.5 + 0.45 * drop.optics.xy / max(drops.z, 0.001), edge, 1.0 - edge);
    vec3 reflected = texture(colorTexture, reflectionUV).rgb;
    refracted = mix(refracted, reflected, clamp(drop.optics.z / max(drops.z, 0.001), 0.0, 1.0));
    // Preserve scene chroma at the meniscus and never add synthetic light.
    vec3 color = mix(source.rgb, refracted, mask);
    color *= 1.0 + max(drops.w, -0.2);
    out_FragColor = vec4(color, source.a);
}
